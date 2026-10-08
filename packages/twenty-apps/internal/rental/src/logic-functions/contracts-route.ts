import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { CONTRACTS_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { loadContractsData } from 'src/logic-functions/page-data/contracts-data';
import { appClient } from 'src/logic-functions/utils/app-client';
import { resolveScope } from 'src/logic-functions/utils/scope';
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
  action?: 'list' | 'renew' | 'settleDeposit' | 'reopenDeposit' | 'setStamped' | 'moveOut' | 'depositOptions';
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
