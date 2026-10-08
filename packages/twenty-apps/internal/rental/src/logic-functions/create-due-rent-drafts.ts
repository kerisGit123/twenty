import { defineLogicFunction } from 'twenty-sdk/define';

import { appClient } from 'src/logic-functions/utils/app-client';
import { CREATE_DUE_DRAFTS_CRON_ID } from 'src/constants/universal-identifiers';
import { monthStart, todayIso } from 'src/logic-functions/utils/dates';
import { isRentMonth, rentDueDate } from 'src/shared/rent-month';
import {
  createDraftRentPayment,
  endRenewedContracts,
  latestRentPayment,
  loadRental,
  rentPaymentExistsForMonth,
} from 'src/logic-functions/utils/rental-service';

// Runs daily. For every Active rental whose rent is due this month (due day
// reached, rental covers this month) and that has no rent payment for this
// month yet, creates a Draft rent payment. Idempotent, so a missed run is
// caught up the next day.
const handler = async (): Promise<{ created: number; checked: number }> => {
  const client = appClient();
  const today = todayIso();
  const thisMonth = monthStart(today);
  let created = 0;
  let checked = 0;
  let after: string | undefined;

  // Renewals that have started take over from the contract they renew.
  const ended = await endRenewedContracts(client, today);

  if (ended) console.log(`[rental] ended ${ended} contract(s) whose renewal has started`);

  for (;;) {
    const { rentals } = await client.query({
      rentals: {
        __args: {
          filter: { status: { eq: 'ACTIVE' } },
          first: 100,
          ...(after ? { after } : {}),
        },
        edges: { node: { id: true, startDate: true, endDate: true, dueDay: true } },
        pageInfo: { hasNextPage: true, endCursor: true },
      },
    });

    for (const edge of rentals?.edges ?? []) {
      const rental = edge.node;

      checked += 1;

      const term = { startDate: rental.startDate ?? null, endDate: rental.endDate ?? null, dueDay: rental.dueDay ?? 1 };

      if (!isRentMonth(term, thisMonth) || today < rentDueDate(term, thisMonth)) continue;
      if (await rentPaymentExistsForMonth(client, rental.id, thisMonth)) continue;

      const fullRental = await loadRental(client, rental.id);

      if (!fullRental) continue;

      const previous = await latestRentPayment(client, rental.id);

      await createDraftRentPayment(client, fullRental, thisMonth, previous?.method);
      created += 1;
    }

    if (!rentals?.pageInfo?.hasNextPage || !rentals.pageInfo.endCursor) break;
    after = rentals.pageInfo.endCursor;
  }

  console.log(`[rental] due drafts: created ${created}, checked ${checked} active rentals`);

  return { created, checked };
};

export default defineLogicFunction({
  universalIdentifier: CREATE_DUE_DRAFTS_CRON_ID,
  name: 'create-due-rent-drafts',
  description: 'Daily: creates Draft rent payments for rentals whose rent is due this month.',
  timeoutSeconds: 120,
  // 00:05 Malaysia time (16:05 UTC).
  cronTriggerSettings: { pattern: '5 16 * * *' },
  handler,
});
