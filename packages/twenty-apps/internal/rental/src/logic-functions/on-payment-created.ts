import {
  defineLogicFunction,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk/define';
import { type DatabaseEventBatchPayload } from 'twenty-sdk/logic-function';

import { appClient } from 'src/logic-functions/utils/app-client';
import { ON_PAYMENT_CREATED_FUNCTION_ID } from 'src/constants/universal-identifiers';
import { fillPaymentFromRental } from 'src/logic-functions/utils/rental-service';

type PaymentEventRecord = { id?: string | null; rentalId?: string | null };

// A payment created with a rental gets the rental's property, tenant, amount
// and next rent month filled in.
const handler = async (
  batch: DatabaseEventBatchPayload<ObjectRecordCreateEvent<PaymentEventRecord>>,
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
  universalIdentifier: ON_PAYMENT_CREATED_FUNCTION_ID,
  name: 'on-payment-created',
  description: 'Fills a new payment from its rental.',
  timeoutSeconds: 60,
  databaseEventTriggerSettings: {
    eventName: 'rentPayment.created',
    batchMode: true,
  },
  handler,
});
