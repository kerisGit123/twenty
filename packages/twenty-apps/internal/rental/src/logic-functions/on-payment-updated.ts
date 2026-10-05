import {
  defineLogicFunction,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';
import { type DatabaseEventBatchPayload } from 'twenty-sdk/logic-function';

import { appClient } from 'src/logic-functions/utils/app-client';
import { ON_PAYMENT_UPDATED_FUNCTION_ID } from 'src/constants/universal-identifiers';
import { fillPaymentFromRental } from 'src/logic-functions/utils/rental-service';

type PaymentEventRecord = { id?: string | null; rentalId?: string | null };

// Linking an existing payment to a rental fills it the same way. Triggered
// only by rentalId changes, so the fill below doesn't re-trigger it.
const handler = async (
  batch: DatabaseEventBatchPayload<ObjectRecordUpdateEvent<PaymentEventRecord>>,
): Promise<void> => {
  const client = appClient();

  for (const event of batch.events) {
    const paymentId = event.properties.after?.id ?? event.recordId;

    if (paymentId && event.properties.after?.rentalId) {
      await fillPaymentFromRental(client, paymentId);
    }
  }
};

export default defineLogicFunction({
  universalIdentifier: ON_PAYMENT_UPDATED_FUNCTION_ID,
  name: 'on-payment-updated',
  description: 'Fills a payment from its rental when the rental is set.',
  timeoutSeconds: 60,
  databaseEventTriggerSettings: {
    eventName: 'rentPayment.updated',
    updatedFields: ['rentalId'],
    batchMode: true,
  },
  handler,
});
