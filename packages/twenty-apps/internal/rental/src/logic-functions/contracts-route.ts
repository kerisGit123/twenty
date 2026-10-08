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
  loadRental,
  rentalRentForMonth,
  rentMonthOf,
  rentPaymentsForMonth,
  unpaidRentMonths,
} from 'src/logic-functions/utils/rental-service';
import { isRentMonth, settleMonth } from 'src/shared/rent-month';
import { type Deduction, depositHeld, deductionLine, type DepositSettlement, planSettlement } from 'src/shared/contracts';
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
const rm = (value: number) => `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// POST /contracts: list contracts (page data), renew one, or settle its
// deposit at move-out (and undo that).
const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as Body;

  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);
    const data = await loadContractsData(client, scope);

    if (!body.action || body.action === 'list') return json({ success: true, data });

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
      const letTo = new Map(data.contracts.filter((x) => x.status === 'ACTIVE' && x.propertyId).map((x) => [x.propertyId as string, x]));

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
        owners: (owners?.edges ?? []).filter(({ node }) => canManage(scope, node.id)).map(({ node }) => ({ id: node.id, name: node.name ?? 'Workspace' })),
      });
    }

    // Find a tenant: admins search everyone; others their workspaces' tenants.
    if (body.action === 'people') {
      const term = (body.query ?? '').trim();

      if (term.length < 2) return json({ success: true, people: [] });
      const like = `%${term.replace(/[%_]/g, '')}%`;
      const { people } = await client.query({
        people: {
          __args: { filter: { or: [{ name: { firstName: { ilike: like } } }, { name: { lastName: { ilike: like } } }] } as never, first: 25 },
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
    // the contract, and deposit receipts if it's already been paid.
    if (body.action === 'create') {
      if (!isIsoDate(body.startDate) || !isIsoDate(body.endDate) || body.endDate <= body.startDate) return json({ success: false, message: 'Pick the start and end dates.' }, 400);
      const rent = Number(body.rent);
      const depositValue = Number(body.deposit ?? 0);
      const utility = Number(body.utilityDeposit ?? 0);

      if (!Number.isFinite(rent) || rent <= 0 || rent > 10_000_000) return json({ success: false, message: 'Enter the monthly rent.' }, 400);
      if (![depositValue, utility].every((v) => Number.isFinite(v) && v >= 0 && v < 10_000_000)) return json({ success: false, message: 'Check the deposit amounts.' }, 400);
      const dueDay = Math.min(31, Math.max(1, Math.round(Number(body.dueDay) || Number(body.startDate.slice(8, 10)))));

      // Property
      let propertyId = body.propertyId ?? null;
      let ownerId: string | null = null;
      let propertyName = '';

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

        if (clash) return json({ success: false, message: `${propertyName} is let to ${clash.tenantName} until ${clash.endDate ?? 'no end date'}. End or renew that contract first.` }, 409);
      } else {
        const name = (body.newProperty?.name ?? '').trim().slice(0, 200);

        if (!name) return json({ success: false, message: 'Pick a property or name the new one.' }, 400);
        ownerId = body.newProperty?.ownerId ?? null;
        if (!ownerId || !canManage(scope, ownerId)) return json({ success: false, message: 'Pick a workspace you manage for the new property.' }, 403);
        const { createProperty } = await client.mutation({
          createProperty: {
            __args: { data: { name, ownerId, monthlyRent: money(rent), depositAmount: money(depositValue), ...(body.newProperty?.address ? { notes: body.newProperty.address.slice(0, 500) } : {}) } as never },
            id: true,
          },
        });

        propertyId = createProperty?.id ?? null;
        propertyName = name;
      }
      if (!propertyId) return json({ success: false, message: 'Could not save the property.' }, 500);

      // Tenant
      let tenantId = body.tenantId ?? null;
      let tenantName = '';

      if (tenantId) {
        const { people } = await client.query({ people: { __args: { filter: { id: { eq: tenantId } }, first: 1 }, edges: { node: { id: true, name: { firstName: true, lastName: true } } } } });
        const person = people?.edges?.[0]?.node;

        if (!person) return json({ success: false, message: 'Tenant not found.' }, 404);
        tenantName = [person.name?.firstName, person.name?.lastName].filter(Boolean).join(' ');
      } else {
        const firstName = (body.newTenant?.firstName ?? '').trim().slice(0, 100);
        const lastName = (body.newTenant?.lastName ?? '').trim().slice(0, 100);
        const digits = (body.newTenant?.phone ?? '').replace(/[^\d]/g, '');

        if (!firstName) return json({ success: false, message: 'Pick the tenant or enter their name.' }, 400);
        // Malaysian numbers: 012-345 6789 -> +60 123456789; 60123456789 -> +60 123456789.
        const local = digits.startsWith('60') ? digits.slice(2) : digits.startsWith('0') ? digits.slice(1) : digits;
        const { createPerson } = await client.mutation({
          createPerson: {
            __args: { data: { name: { firstName, lastName }, ...(local ? { phones: { primaryPhoneNumber: local, primaryPhoneCallingCode: '+60' } } : {}) } as never },
            id: true,
          },
        });

        tenantId = createPerson?.id ?? null;
        tenantName = [firstName, lastName].filter(Boolean).join(' ');
      }
      if (!tenantId) return json({ success: false, message: 'Could not save the tenant.' }, 500);

      const { createRental } = await client.mutation({
        createRental: {
          __args: {
            data: {
              name: `${propertyName} · ${tenantName}`.slice(0, 200),
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
      const rentalId = createRental?.id;

      if (!rentalId) return json({ success: false, message: 'Could not save the contract.' }, 500);

      // Deposits already paid: receipts now.
      const receipts: string[] = [];

      if (isIsoDate(body.depositReceivedOn)) {
        for (const [type, amount] of [['DEPOSIT', depositValue], ['UTILITY_DEPOSIT', utility]] as const) {
          if (!(amount > 0)) continue;
          const { createRentPayment } = await client.mutation({
            createRentPayment: {
              __args: {
                data: { status: 'DRAFT', paymentType: type, rentalId, propertyId, tenantId, ownerId, amount: money(amount), paidOn: body.depositReceivedOn } as never,
              },
              id: true,
            },
          });

          if (!createRentPayment?.id) continue;
          const issued = await receiptHandler('issue', createRentPayment.id, context?.workspaceMemberId ?? undefined);

          if (issued.success && 'receiptNumber' in issued && issued.receiptNumber) receipts.push(String(issued.receiptNumber));
        }
      }

      return json({
        success: true,
        id: rentalId,
        message: `Contract made for ${tenantName} at ${propertyName}.${receipts.length ? ` Deposit receipt${receipts.length > 1 ? 's' : ''} ${receipts.join(', ')} issued.` : ''} Stamp the agreement within 30 days.`,
      });
    }

    const contract = data.contracts.find((c) => c.id === body.rentalId);

    if (!contract) return json({ success: false, message: 'Contract not found in your workspaces.' }, 404);

    if (body.action === 'renew') {
      if (contract.renewedById) return json({ success: false, message: 'This contract has already been renewed.' }, 409);
      if (!isIsoDate(body.startDate) || !isIsoDate(body.endDate) || body.endDate <= body.startDate) {
        return json({ success: false, message: 'Pick the new start and end dates.' }, 400);
      }

      const rent = Number(body.rent);

      if (!Number.isFinite(rent) || rent <= 0) return json({ success: false, message: 'Enter the new monthly rent.' }, 400);

      const held = body.carryDeposit ? depositHeld(contract.deposit) : 0;
      const { createRental } = await client.mutation({
        createRental: {
          __args: {
            data: {
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
              depositNotes: held > 0 ? `Carried over from the previous contract (${contract.startDate ?? '?'} to ${contract.endDate ?? '?'}): ${rm(held)}` : '',
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

        return json({ success: false, message: 'This contract has already been renewed.' }, 409);
      }

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

      return json({
        success: true,
        id: createRental?.id,
        ...(body.startDate <= todayIso() ? { ended: await endRenewedContracts(client) } : {}),
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
      const held = depositHeld(contract.deposit);

      if (held <= 0) return json({ success: false, message: 'No deposit is held for this contract.' }, 400);

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

    // The tenant moved out: the contract ends on that day, so no rent is
    // owed after it. The last part-month can be left uncharged (waived).
    if (body.action === 'moveOut') {
      if (contract.status !== 'ACTIVE') return json({ success: false, message: 'Only an active contract can be ended.' }, 400);
      if (contract.renewedById) return json({ success: false, message: 'This contract was renewed — end the renewal instead.' }, 400);
      if (!isIsoDate(body.movedOutOn)) return json({ success: false, message: 'Pick the move-out date.' }, 400);
      if (contract.startDate && body.movedOutOn < contract.startDate) return json({ success: false, message: 'The move-out date is before the contract starts.' }, 400);

      await client.mutation({
        updateRental: { __args: { id: contract.id, data: { status: 'ENDED', endDate: body.movedOutOn } as never }, id: true },
      });

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
        message: `Contract ended on ${body.movedOutOn}.${waived}${held > 0 ? ` Settle the deposit (${rm(held)}) next.` : ''}`,
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
      for (const row of contract.deposit.settlement?.rent ?? []) {
        if (row.paymentId) await receiptHandler('void', row.paymentId, context?.workspaceMemberId ?? undefined);
      }
      await client.mutation({
        updateRental: {
          __args: {
            id: contract.id,
            data: { depositStatus: 'HELD', depositRefunded: money(0), depositRefundedOn: null, depositNotes: '', depositSettlement: null } as never,
          },
          id: true,
        },
      });

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
  description: 'Contracts page: list, renew, and settle deposits at move-out.',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/contracts', httpMethod: 'POST', isAuthRequired: true },
});
