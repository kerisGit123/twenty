import {
  defineLogicFunction,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';
import { type DatabaseEventBatchPayload } from 'twenty-sdk/logic-function';
import { CoreApiClient } from 'twenty-client-sdk/core';

import { receiptHandler } from 'src/logic-functions/handlers/send-receipt-handler';

// Fields printed on the receipt.
const RECEIPT_FIELDS = [
  'amount',
  'paidOn',
  'rentPeriod',
  'method',
  'notes',
  'paymentType',
  'tenantId',
  'propertyId',
] as const;

type PaymentEventRecord = Partial<Record<(typeof RECEIPT_FIELDS)[number], unknown>> & {
  id?: string | null;
  status?: string | null;
  receiptFile?: unknown[] | null;
};

// - Issued/Sent receipts are locked: a person's edit to a printed field is
//   undone (use "Correct receipt" instead). The undo is made by the app, not
//   a person, so it doesn't trigger another undo.
// - Drafts that already have a preview PDF get it rebuilt.
const handler = async (
  batch: DatabaseEventBatchPayload<ObjectRecordUpdateEvent<PaymentEventRecord>>,
): Promise<void> => {
  const client = new CoreApiClient();

  for (const event of batch.events) {
    const paymentId = event.properties.after?.id ?? event.recordId;
    const before = event.properties.before ?? {};
    const after = event.properties.after ?? {};

    if (!paymentId) continue;

    const wasIssued = before.status === 'ISSUED' || before.status === 'SENT';

    if (wasIssued && event.workspaceMemberId) {
      const changed = RECEIPT_FIELDS.filter((field) =>
        event.properties.updatedFields.includes(field),
      );
      const restore: Record<string, unknown> = {};

      for (const field of changed) {
        const value = before[field];

        restore[field] =
          field === 'amount' && value && typeof value === 'object'
            ? {
                amountMicros: (value as { amountMicros?: number | null }).amountMicros ?? null,
                currencyCode: (value as { currencyCode?: string | null }).currencyCode || 'MYR',
              }
            : (value ?? null);
      }

      if (Object.keys(restore).length > 0) {
        await client.mutation({
          updateRentPayment: { __args: { id: paymentId, data: restore }, id: true },
        });
        console.log(`[rental] undid edit to issued receipt ${paymentId}: ${changed.join(', ')}`);
      }

      continue;
    }

    const isDraftWithPreview =
      (after.status ?? 'DRAFT') === 'DRAFT' && (after.receiptFile?.length ?? 0) > 0;

    if (isDraftWithPreview) {
      const result = await receiptHandler('regenerate', paymentId);

      if (!result.success) {
        console.warn(`[rental] could not refresh preview for ${paymentId}: ${result.message}`);
      }
    }
  }
};

export default defineLogicFunction({
  universalIdentifier: '84e321e5-cc66-4481-93c3-88efe2e169f3',
  name: 'on-payment-details-changed',
  description:
    'Locks issued receipts against edits and keeps draft previews up to date.',
  timeoutSeconds: 120,
  databaseEventTriggerSettings: {
    eventName: 'rentPayment.updated',
    updatedFields: [...RECEIPT_FIELDS],
    batchMode: true,
  },
  handler,
});
