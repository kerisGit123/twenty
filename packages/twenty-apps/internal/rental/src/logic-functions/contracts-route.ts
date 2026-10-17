import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { CONTRACTS_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { loadContractsData } from 'src/logic-functions/page-data/contracts-data';
import { appClient } from 'src/logic-functions/utils/app-client';
import { canManage, inScope, NOT_ALLOWED, resolveScope } from 'src/logic-functions/utils/scope';
import { todayIso } from 'src/logic-functions/utils/dates';
import {
  createDraftRentPayment,
  endRenewedContracts,
  fillRentalDefaults,
  loadRental,
  rentalName,
  rentalRentForMonth,
  rentMonthOf,
  rentPaymentsForMonth,
  syncPropertyStatus,
  unpaidRentMonths,
} from 'src/logic-functions/utils/rental-service';
import { isRentMonth, settleMonth } from 'src/shared/rent-month';
import { type ContractCard, type Deduction, depositHeld, deductionLine, type DepositSettlement, planSettlement } from 'src/shared/contracts';
import { receiptHandler } from 'src/logic-functions/handlers/send-receipt-handler';

type Body = {
  action?: 'list' | 'renew' | 'settleDeposit' | 'reopenDeposit' | 'setStamped' | 'moveOut' | 'depositOptions' | 'newOptions' | 'people' | 'create';
  // new tenancy
  query?: string;
  propertyId?: string;
  newProperty?: { name?: string; ownerId?: string; address?: string };
  tenantId?: string;
  newTenant?: { firstName?: string; lastName?: string; phone?: string };
  deposit?: number;
  utilityDeposit?: number;
  dueDay?: number;
  depositReceivedOn?: string | null;
  rentMonths?: string[]; // settleDeposit: unpaid months to take from the deposit
  // moveOut
  movedOutOn?: string;
  waiveLastMonth?: boolean;
  stampedOn?: string;
  rentalId?: string;
  // renew
  startDate?: string;
  endDate?: string;
  rent?: number;
  carryDeposit?: boolean;
  // settleDeposit
  deductions?: Deduction[];
  refundedOn?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const isIsoDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const money = (rm: number) => ({ amountMicros: Math.round(rm * 1_000_000), currencyCode: 'MYR' });
// +65 9123 4567 -> +65 / 91234567; 012-345 6789 and 60123456789 -> +60 / 123456789.
const CALLING_CODES = ['60', '65', '62', '66', '63', '84', '86', '852', '853', '91', '44', '61', '81', '82', '1'];

const parsePhone = (raw: string): { code: string; number: string } | null => {
  const text = raw.trim();
  const digits = text.replace(/\D/g, '');

  if (!digits) return null;
  if (text.startsWith('+') || digits.startsWith('00')) {
    const full = digits.startsWith('00') ? digits.slice(2) : digits;
    const code = CALLING_CODES.filter((x) => full.startsWith(x)).sort((a, b) => b.length - a.length)[0] ?? full.slice(0, 2);
    const number = full.slice(code.length).replace(/^0+/, '');

    return number ? { code: `+${code}`, number } : null;
  }
  const local = digits.startsWith('60') ? digits.slice(2) : digits.replace(/^0/, '');

  return local ? { code: '+60', number: local } : null;
};

const rm = (value: number) => `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// POST /contracts: list contracts (page data), renew one, or settle its
// deposit at move-out (and undo that).
const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as Body;

  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);
    const isList = !body.action || body.action === 'list';

    // No worker on the server: a renewal that has started ends its old tenancy here.
    if (isList) await endRenewedContracts(client).catch(() => 0);
    const data = await loadContractsData(client, scope);

    if (isList) return json({ success: true, data });

    // The property's Occupied/Vacant + tenant follows its tenancies (the
    // database trigger does the same when a worker runs).
    const syncProperty = async (propertyId: string | null | undefined) => {
      if (!propertyId) return;
      try {
        await syncPropertyStatus(client, propertyId);
      } catch (error) {
        console.error('[rental] property status sync failed:', error);
      }
    };
    const fillDefaults = async (rentalId: string | null | undefined) => {
      if (!rentalId) return;
      try {
        const rental = await loadRental(client, rentalId);

        if (rental) await fillRentalDefaults(client, rental);
      } catch (error) {
        console.error('[rental] tenancy defaults failed:', error);
      }
    };

    // ---- new tenancy: what to pick from
    if (body.action === 'newOptions') {
      const [{ properties }, { owners }] = await Promise.all([
        client.query({
          properties: {
            __args: { first: 500, orderBy: [{ name: 'AscNullsLast' }] },
            edges: { node: { id: true, name: true, ownerId: true, monthlyRent: { amountMicros: true }, depositAmount: { amountMicros: true } } },
          },
        }),
        client.query({ owners: { __args: { first: 200, orderBy: [{ name: 'AscNullsLast' }] }, edges: { node: { id: true, name: true } } } }),
      ]);
      // Of a property's active tenancies, the one running today (else the next to start).
      const today = todayIso();
      const started = (x: ContractCard) => !x.startDate || x.startDate <= today;
      const letTo = new Map<string, ContractCard>();

      for (const x of data.contracts) {
        if (x.status !== 'ACTIVE' || !x.propertyId) continue;
        const have = letTo.get(x.propertyId);

        if (!have || (started(x) && !started(have)) || (started(x) === started(have) && (started(x) ? (x.startDate ?? '') > (have.startDate ?? '') : (x.startDate ?? '') < (have.startDate ?? '')))) {
          letTo.set(x.propertyId, x);
        }
      }

      return json({
        success: true,
        properties: (properties?.edges ?? [])
          .filter(({ node }) => inScope(scope, node.ownerId ?? null))
          .map(({ node }) => {
            const current = letTo.get(node.id);

            return {
              id: node.id,
              name: node.name ?? 'Property',
              ownerId: node.ownerId ?? null,
              rent: (node.monthlyRent?.amountMicros ?? 0) / 1_000_000,
              deposit: (node.depositAmount?.amountMicros ?? 0) / 1_000_000,
              letTo: current ? { tenantName: current.tenantName, endDate: current.endDate } : null,
            };
          }),
        owners: (owners?.edges ?? []).filter(({ node }) => canManage(scope, node.id)).map(({ node }) => ({ id: node.id, name: node.name ?? 'Business' })),
      });
    }

    // Find a tenant by full name, first or last name, or phone. Admins search
    // everyone; others the tenants of their businesses (someone with no
    // tenancy yet is found again by phone when the tenancy is made).
    if (body.action === 'people') {
      const term = (body.query ?? '').trim();

      if (term.length < 2) return json({ success: true, people: [] });
      const tokens = term.split(/\s+/).map((t) => t.replace(/[%_]/g, '')).filter(Boolean).slice(0, 4);
      const digits = term.replace(/\D/g, '').replace(/^(60|0)/, '');
      const byName = { and: tokens.map((t) => ({ or: [{ name: { firstName: { ilike: `%${t}%` } } }, { name: { lastName: { ilike: `%${t}%` } } }] })) };
      const { people } = await client.query({
        people: {
          __args: { filter: { or: [byName, ...(digits.length >= 4 ? [{ phones: { primaryPhoneNumber: { ilike: `%${digits}%` } } }] : [])] } as never, first: 50 },
          edges: { node: { id: true, name: { firstName: true, lastName: true }, phones: { primaryPhoneNumber: true, primaryPhoneCallingCode: true } } },
        },
      });
      const mine = new Set(data.contracts.map((x) => x.tenantId).filter(Boolean) as string[]);

      return json({
        success: true,
        people: (people?.edges ?? [])
          .filter(({ node }) => scope.all || mine.has(node.id))
          .slice(0, 10)
          .map(({ node }) => ({
            id: node.id,
            name: [node.name?.firstName, node.name?.lastName].filter(Boolean).join(' ') || 'Someone',
            phone: node.phones?.primaryPhoneNumber ? `${node.phones.primaryPhoneCallingCode ?? ''} ${node.phones.primaryPhoneNumber}`.trim() : null,
          })),
      });
    }

    // ---- new tenancy: tenant (new or existing), property (new or existing),
    // the tenancy, and deposit receipts if it's already been paid.
    if (body.action === 'create') {
      if (!isIsoDate(body.startDate) || !isIsoDate(body.endDate) || body.endDate <= body.startDate) return json({ success: false, message: 'Pick the start and end dates.' }, 400);
      const rent = Number(body.rent);
      const depositValue = Number(body.deposit ?? 0);
      const utility = Number(body.utilityDeposit ?? 0);

      if (!Number.isFinite(rent) || rent <= 0 || rent > 10_000_000) return json({ success: false, message: 'Enter the monthly rent.' }, 400);
      if (![depositValue, utility].every((v) => Number.isFinite(v) && v >= 0 && v < 10_000_000)) return json({ success: false, message: 'Check the deposit amounts.' }, 400);
      const dueDay = Math.min(31, Math.max(1, Math.round(Number(body.dueDay) || Number(body.startDate.slice(8, 10)))));

      // Check everything first, so nothing is made for a request that fails.
      // Tenant: someone picked, or the person with the same phone, or new.
      let tenantId = body.tenantId ?? null;
      let tenantName = '';
      let newPerson: { firstName: string; lastName: string; phone: { code: string; number: string } | null } | null = null;

      if (tenantId) {
        const { people } = await client.query({ people: { __args: { filter: { id: { eq: tenantId } }, first: 1 }, edges: { node: { id: true, name: { firstName: true, lastName: true } } } } });
        const person = people?.edges?.[0]?.node;

        if (!person) return json({ success: false, message: 'Tenant not found.' }, 404);
        tenantName = [person.name?.firstName, person.name?.lastName].filter(Boolean).join(' ');
      } else {
        const firstName = (body.newTenant?.firstName ?? '').trim().slice(0, 100);
        const lastName = (body.newTenant?.lastName ?? '').trim().slice(0, 100);
        const phone = parsePhone(body.newTenant?.phone ?? '');

        if (!firstName) return json({ success: false, message: 'Pick the tenant or enter their name.' }, 400);
        // Already in People under that number (even if another business added them): reuse, don't duplicate.
        const { people: same } = phone
          ? await client.query({
              people: {
                __args: { filter: { phones: { primaryPhoneNumber: { eq: phone.number } } } as never, first: 10 },
                edges: { node: { id: true, name: { firstName: true, lastName: true }, phones: { primaryPhoneCallingCode: true } } },
              },
            })
          : { people: null };
        const match = (same?.edges ?? []).map(({ node }) => node).find((node) => !node.phones?.primaryPhoneCallingCode || node.phones.primaryPhoneCallingCode === phone?.code);

        if (match) {
          tenantId = match.id;
          tenantName = [match.name?.firstName, match.name?.lastName].filter(Boolean).join(' ') || [firstName, lastName].filter(Boolean).join(' ');
        } else {
          newPerson = { firstName, lastName, phone };
          tenantName = [firstName, lastName].filter(Boolean).join(' ');
        }
      }

      // Property
      let propertyId = body.propertyId ?? null;
      let ownerId: string | null = null;
      let propertyName = '';
      let newPropertyName = '';

      if (propertyId) {
        const { properties } = await client.query({ properties: { __args: { filter: { id: { eq: propertyId } }, first: 1 }, edges: { node: { id: true, name: true, ownerId: true } } } });
        const property = properties?.edges?.[0]?.node;

        if (!property) return json({ success: false, message: 'Property not found.' }, 404);
        if (!inScope(scope, property.ownerId ?? null)) return json(NOT_ALLOWED, 403);
        ownerId = property.ownerId ?? null;
        propertyName = property.name ?? 'Property';
        // Not let to someone else for those dates.
        const clash = data.contracts.find(
          (x) => x.propertyId === propertyId && x.status === 'ACTIVE' && (!x.endDate || x.endDate >= (body.startDate as string)) && (!x.startDate || x.startDate <= (body.endDate as string)),
        );

        if (clash) return json({ success: false, message: `${propertyName} is let to ${clash.tenantName} until ${clash.endDate ?? 'no end date'}. End or renew that tenancy first.` }, 409);
      } else {
        const name = (body.newProperty?.name ?? '').trim().slice(0, 200);

        if (!name) return json({ success: false, message: 'Pick a property or name the new one.' }, 400);
        ownerId = body.newProperty?.ownerId ?? null;
        if (!ownerId || !canManage(scope, ownerId)) return json({ success: false, message: 'Pick a business you manage for the new property.' }, 403);
        newPropertyName = name;
        propertyName = name;
      }

      // Make them; if the tenancy can't be saved, take back what this call made (soft delete).
      const made: { propertyId?: string; personId?: string } = {};
      let rentalId: string | null | undefined;

      try {
        if (newPropertyName) {
          const { createProperty } = await client.mutation({
            createProperty: {
              __args: { data: { name: newPropertyName, ownerId, monthlyRent: money(rent), depositAmount: money(depositValue), ...(body.newProperty?.address ? { notes: body.newProperty.address.slice(0, 500) } : {}) } as never },
              id: true,
            },
          });

          if (!createProperty?.id) throw new Error('Could not save the property.');
          made.propertyId = createProperty.id;
          propertyId = createProperty.id;
        }
        if (newPerson) {
          const { createPerson } = await client.mutation({
            createPerson: {
              __args: {
                data: {
                  name: { firstName: newPerson.firstName, lastName: newPerson.lastName },
                  ...(newPerson.phone ? { phones: { primaryPhoneNumber: newPerson.phone.number, primaryPhoneCallingCode: newPerson.phone.code } } : {}),
                } as never,
              },
              id: true,
            },
          });

          if (!createPerson?.id) throw new Error('Could not save the tenant.');
          made.personId = createPerson.id;
          tenantId = createPerson.id;
        }

        const { createRental } = await client.mutation({
          createRental: {
            __args: {
              data: {
                name: rentalName(propertyName, tenantName),
                status: 'ACTIVE',
                propertyId,
                tenantId,
                ownerId,
                startDate: body.startDate,
                endDate: body.endDate,
                dueDay,
                monthlyRent: money(rent),
                depositAmount: money(depositValue),
                utilityDeposit: money(utility),
                depositStatus: 'NOT_RECEIVED',
              } as never,
            },
            id: true,
          },
        });

        rentalId = createRental?.id;
        if (!rentalId) throw new Error('Could not save the tenancy.');
      } catch (error) {
        if (made.propertyId) await client.mutation({ deleteProperty: { __args: { id: made.propertyId }, id: true } }).catch(() => null);
        if (made.personId) await client.mutation({ deletePerson: { __args: { id: made.personId }, id: true } }).catch(() => null);
        throw error;
      }

      await fillDefaults(rentalId);
      await syncProperty(propertyId);

      // Deposits already paid: receipts now.
      const receipts: string[] = [];
      const missed: string[] = [];
      let issuedAny = false;

      if (isIsoDate(body.depositReceivedOn)) {
        for (const [type, amount, label] of [['DEPOSIT', depositValue, 'security deposit'], ['UTILITY_DEPOSIT', utility, 'utility deposit']] as const) {
          if (!(amount > 0)) continue;
          try {
            const { createRentPayment } = await client.mutation({
              createRentPayment: {
                __args: {
                  data: { status: 'DRAFT', paymentType: type, rentalId, propertyId, tenantId, ownerId, amount: money(amount), paidOn: body.depositReceivedOn } as never,
                },
                id: true,
              },
            });

            if (!createRentPayment?.id) {
              missed.push(label);
              continue;
            }
            const issued = await receiptHandler('issue', createRentPayment.id, context?.workspaceMemberId ?? undefined);

            if (!issued.success) {
              missed.push(label);
              continue;
            }
            issuedAny = true;
            if ('receiptNumber' in issued && issued.receiptNumber) receipts.push(String(issued.receiptNumber));
          } catch (error) {
            console.error('[rental] deposit receipt failed:', error);
            missed.push(label);
          }
        }
        if (issuedAny) await client.mutation({ updateRental: { __args: { id: rentalId, data: { depositStatus: 'HELD' } as never }, id: true } }).catch(() => null);
      }

      const warning = missed.length ? `The ${missed.join(' and ')} receipt was NOT recorded — add the payment from the Rent Ledger.` : undefined;

      return json({
        success: true,
        id: rentalId,
        ...(warning ? { warning } : {}),
        message: `Tenancy started for ${tenantName} at ${propertyName}.${receipts.length ? ` Deposit receipt${receipts.length > 1 ? 's' : ''} ${receipts.join(', ')} issued.` : ''}${warning ? ` ${warning}` : ''} Stamp the agreement within 30 days.`,
      });
    }

    const contract = data.contracts.find((c) => c.id === body.rentalId);

    if (!contract) return json({ success: false, message: 'Tenancy not found in your businesses.' }, 404);

    if (body.action === 'renew') {
      if (contract.renewedById) return json({ success: false, message: 'This tenancy has already been renewed.' }, 409);
      if (contract.status !== 'ACTIVE') return json({ success: false, message: 'Only a running tenancy can be renewed.' }, 400);
      if (!isIsoDate(body.startDate) || !isIsoDate(body.endDate) || body.endDate <= body.startDate) {
        return json({ success: false, message: 'Pick the new start and end dates.' }, 400);
      }
      if (contract.startDate && body.startDate < contract.startDate) {
        return json({ success: false, message: `The renewal can't start before this tenancy started (${contract.startDate}).` }, 400);
      }
      // From the day it ends (or the next) or later; earlier overlaps the tenancy it renews.
      if (contract.endDate && body.startDate < contract.endDate) {
        return json({ success: false, message: `This tenancy runs until ${contract.endDate}. Start the renewal on ${contract.endDate} or later — or mark the tenant moved out first.` }, 400);
      }
      const overlap = data.contracts.find(
        (x) => x.id !== contract.id && x.propertyId === contract.propertyId && x.status === 'ACTIVE' && (!x.endDate || x.endDate >= (body.startDate as string)) && (!x.startDate || x.startDate <= (body.endDate as string)),
      );

      if (overlap) return json({ success: false, message: `Those dates overlap ${overlap.tenantName}'s tenancy (${overlap.startDate ?? '?'} to ${overlap.endDate ?? 'no end date'}).` }, 409);

      const rent = Number(body.rent);

      if (!Number.isFinite(rent) || rent <= 0) return json({ success: false, message: 'Enter the new monthly rent.' }, 400);

      const held = body.carryDeposit ? depositHeld(contract.deposit) : 0;
      const { createRental } = await client.mutation({
        createRental: {
          __args: {
            data: {
              name: rentalName(contract.propertyName, contract.tenantName),
              status: 'ACTIVE',
              propertyId: contract.propertyId,
              tenantId: contract.tenantId,
              ownerId: contract.ownerId,
              startDate: body.startDate,
              endDate: body.endDate,
              dueDay: contract.dueDay,
              monthlyRent: money(rent),
              depositAmount: money(contract.deposit.agreed),
              utilityDeposit: money(contract.deposit.utilityAgreed),
              depositCarriedIn: money(held),
              depositStatus: held > 0 ? 'HELD' : 'NOT_RECEIVED',
              depositNotes: held > 0 ? `Carried over from the previous tenancy (${contract.startDate ?? '?'} to ${contract.endDate ?? '?'}): ${rm(held)}` : '',
              tenantDetails: contract.tenantDetails,
              renewalOfId: contract.id,
            } as never,
          },
          id: true,
        },
      });

      // Renewed twice at the same moment (a double click): the first renewal
      // stands, this one is removed, and the deposit isn't carried twice.
      const { rentals: renewals } = await client.query({
        rentals: { __args: { filter: { renewalOfId: { eq: contract.id } }, first: 20 }, edges: { node: { id: true, createdAt: true } } },
      });
      const first = (renewals?.edges ?? [])
        .map(({ node }) => node)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id))[0];

      if (createRental?.id && first && first.id !== createRental.id) {
        await client.mutation({ deleteRental: { __args: { id: createRental.id }, id: true } });

        return json({ success: false, message: 'This tenancy has already been renewed.' }, 409);
      }

      await fillDefaults(createRental?.id);

      if (held > 0) {
        await client.mutation({
          updateRental: {
            __args: {
              id: contract.id,
              data: {
                depositStatus: 'CARRIED',
                depositNotes: [contract.deposit.notes, `Carried to the renewal from ${body.startDate}: ${rm(held)}`].filter(Boolean).join('\n'),
              } as never,
            },
            id: true,
          },
        });
      }

      const ended = body.startDate <= todayIso() ? await endRenewedContracts(client) : undefined;

      await syncProperty(contract.propertyId);

      return json({
        success: true,
        id: createRental?.id,
        ...(ended !== undefined ? { ended } : {}),
        message: `Renewed from ${new Date(`${body.startDate}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}. Stamp the new agreement within 30 days.`,
      });
    }

    // The contract's unpaid months, to take from the deposit at move-out.
    if (body.action === 'depositOptions') {
      return json({ success: true, unpaid: await unpaidRentMonths(client, contract.id) });
    }

    // Move-out: unpaid rent is taken from the deposit (one "From deposit"
    // receipt per month, so those months are paid), then other deductions
    // are kept (rental income); the rest is refunded. What the deposit
    // doesn't cover, the tenant still owes.
    if (body.action === 'settleDeposit') {
      if (contract.status !== 'ENDED') return json({ success: false, message: 'Mark the tenant moved out first, then settle the deposit.' }, 400);
      const held = depositHeld(contract.deposit);

      if (held <= 0) return json({ success: false, message: 'No deposit is held for this tenancy.' }, 400);

      const deductions = (body.deductions ?? [])
        .map((d) => ({ label: String(d.label ?? '').trim().replace(/\n/g, ' ').slice(0, 120) || 'Deduction', amount: Math.round(Number(d.amount) * 100) / 100 }))
        .filter((d) => Number.isFinite(d.amount) && d.amount > 0 && d.amount < 10_000_000);
      // Amounts come from the ledger, not the page.
      const chosen = new Set((body.rentMonths ?? []).filter((m) => typeof m === 'string').map((m) => `${m.slice(0, 7)}-01`));
      const unpaid = (await unpaidRentMonths(client, contract.id)).filter((row) => chosen.has(row.month));
      const plan = planSettlement(held, unpaid, deductions);
      const settledOn = isIsoDate(body.refundedOn) ? body.refundedOn : todayIso();
      const rental = plan.rent.length ? await loadRental(client, contract.id) : null;
      const rentRows: DepositSettlement['rent'] = [];

      for (const row of plan.rent) {
        const existing = (await rentPaymentsForMonth(client, contract.id, row.month)).find((p) => p.status === 'DRAFT');
        const paymentId = existing?.id ?? (rental ? await createDraftRentPayment(client, rental, row.month, 'FROM_DEPOSIT') : undefined);

        if (!paymentId) continue;
        await client.mutation({
          updateRentPayment: {
            __args: { id: paymentId, data: { amount: money(row.amount), paidOn: settledOn, method: 'FROM_DEPOSIT', notes: 'Taken from the deposit at move-out' } as never },
            id: true,
          },
        });
        const issued = await receiptHandler('issue', paymentId, context?.workspaceMemberId ?? undefined);

        if (!issued.success) return json({ success: false, message: `Could not record the rent taken from the deposit: ${issued.message}` }, 500);
        rentRows.push({ ...row, paymentId });
      }

      const settlement: DepositSettlement = { settledOn, rent: rentRows, deductions, kept: plan.kept, owed: plan.owed, refund: plan.refund };

      await client.mutation({
        updateRental: {
          __args: {
            id: contract.id,
            data: {
              depositStatus: plan.status,
              depositRefunded: money(plan.refund),
              depositRefundedOn: settledOn,
              depositNotes: deductions.map(deductionLine).join('\n'),
              depositSettlement: settlement,
            } as never,
          },
          id: true,
        },
      });

      await syncProperty(contract.propertyId);

      const parts = [
        plan.rentTaken ? `${rm(plan.rentTaken)} unpaid rent taken (receipts made)` : '',
        plan.kept ? `${rm(plan.kept)} kept for deductions` : '',
        plan.refund ? `refund ${rm(plan.refund)}` : 'nothing to refund',
      ].filter(Boolean);

      return json({
        success: true,
        message: `Deposit settled: ${parts.join(', ')}.${plan.owed > 0 ? ` The tenant still owes ${rm(plan.owed)}.` : ''}`,
      });
    }

    // The tenant moved out: the tenancy ends on that day, so no rent is
    // owed after it. The last part-month can be left uncharged (waived).
    if (body.action === 'moveOut') {
      if (contract.status !== 'ACTIVE') return json({ success: false, message: 'Only an active tenancy can be ended.' }, 400);
      if (contract.renewedById) return json({ success: false, message: 'This tenancy was renewed — end the renewal instead.' }, 400);
      if (!isIsoDate(body.movedOutOn)) return json({ success: false, message: 'Pick the move-out date.' }, 400);
      if (contract.startDate && body.movedOutOn < contract.startDate) return json({ success: false, message: 'The move-out date is before the tenancy starts.' }, 400);

      await client.mutation({
        updateRental: { __args: { id: contract.id, data: { status: 'ENDED', endDate: body.movedOutOn } as never }, id: true },
      });
      await syncProperty(contract.propertyId);

      let waived = '';
      const term = { startDate: contract.startDate, endDate: body.movedOutOn };
      const lastMonth = rentMonthOf(contract.startDate, body.movedOutOn);

      if (body.waiveLastMonth && isRentMonth(term, lastMonth)) {
        const rental = await loadRental(client, contract.id);
        const rows = await rentPaymentsForMonth(client, contract.id, lastMonth);
        const settlement = rental ? settleMonth(rentalRentForMonth(rental, lastMonth), rows) : null;

        if (settlement && settlement.state !== 'paid' && settlement.state !== 'waived') {
          await client.mutation({
            createRentPayment: {
              __args: {
                data: {
                  status: 'WAIVED',
                  paymentType: 'RENT',
                  rentalId: contract.id,
                  propertyId: contract.propertyId,
                  tenantId: contract.tenantId,
                  ownerId: contract.ownerId,
                  rentPeriod: lastMonth,
                  amount: money(settlement.remaining),
                  notes: `Moved out on ${body.movedOutOn}`,
                } as never,
              },
              id: true,
            },
          });
          for (const draft of rows.filter((r) => r.status === 'DRAFT')) {
            await client.mutation({ deleteRentPayment: { __args: { id: draft.id }, id: true } });
          }
          waived = ` The last part-month (${rm(settlement.remaining)}) isn't charged.`;
        }
      }

      // Unsent drafts for months after the move-out aren't owed any more.
      const { rentPayments: later } = await client.query({
        rentPayments: {
          __args: { filter: { rentalId: { eq: contract.id }, status: { eq: 'DRAFT' }, rentPeriod: { gt: lastMonth } } as never, first: 50 },
          edges: { node: { id: true } },
        },
      });

      for (const { node } of later?.edges ?? []) await client.mutation({ deleteRentPayment: { __args: { id: node.id }, id: true } });

      const held = depositHeld(contract.deposit);

      return json({
        success: true,
        depositHeld: held,
        message: `Tenant moved out on ${body.movedOutOn}.${waived}${held > 0 ? ` Settle the deposit (${rm(held)}) next.` : ''}`,
      });
    }

    if (body.action === 'setStamped') {
      if (!isIsoDate(body.stampedOn)) return json({ success: false, message: 'Pick the stamping date.' }, 400);
      await client.mutation({ updateRental: { __args: { id: contract.id, data: { stampedOn: body.stampedOn } }, id: true } });

      return json({ success: true, message: 'Marked as stamped.' });
    }

    if (body.action === 'reopenDeposit') {
      if (contract.deposit.status === 'CARRIED') {
        return json({ success: false, message: 'This deposit was carried to the renewal — it’s held there now.' }, 400);
      }
      // Undo: the rent receipts made from the deposit are voided.
      const notVoided: string[] = [];

      for (const row of contract.deposit.settlement?.rent ?? []) {
        if (!row.paymentId) continue;
        const voided = await receiptHandler('void', row.paymentId, context?.workspaceMemberId ?? undefined);

        // Already void from an earlier try is fine.
        if (!voided.success && !/is void/i.test(String(voided.message ?? ''))) notVoided.push(`${row.month.slice(0, 7)}: ${voided.message ?? 'failed'}`);
      }
      if (notVoided.length) return json({ success: false, message: `Could not void the rent receipts made from the deposit (${notVoided.join('; ')}). The deposit was not reopened.` }, 500);
      await client.mutation({
        updateRental: {
          __args: {
            id: contract.id,
            data: { depositStatus: 'HELD', depositRefunded: money(0), depositRefundedOn: null, depositNotes: '', depositSettlement: null } as never,
          },
          id: true,
        },
      });

      await syncProperty(contract.propertyId);

      return json({ success: true, message: 'Deposit marked as held again.' });
    }

    return json({ success: false, message: 'Unknown action.' }, 400);
  } catch (error) {
    console.error('[rental] contracts route failed:', error);

    return json({ success: false, message: error instanceof Error ? error.message : String(error) }, 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: CONTRACTS_ROUTE_FUNCTION_ID,
  name: 'contracts-route',
  description: 'Tenancies page: list, start, renew, and settle deposits at move-out.',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/contracts', httpMethod: 'POST', isAuthRequired: true },
});
