import { defineLogicFunction } from 'twenty-sdk/define';

import { appClient } from 'src/logic-functions/utils/app-client';
import { CREATE_DUE_DRAFTS_CRON_ID } from 'src/constants/universal-identifiers';
import { dueDateInMonth, monthStart, todayIso } from 'src/logic-functions/utils/dates';
import {
  createDraftRentPayment,
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

      const dueDate = dueDateInMonth(thisMonth, rental.dueDay ?? 1);
      const startsLater = rental.startDate && monthStart(rental.startDate) > thisMonth;
      const alreadyEnded = rental.endDate && rental.endDate < thisMonth;

      if (today < dueDate || startsLater || alreadyEnded) continue;
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
