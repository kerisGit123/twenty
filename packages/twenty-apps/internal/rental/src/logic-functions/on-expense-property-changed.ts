import {
  defineLogicFunction,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';
import { type DatabaseEventBatchPayload } from 'twenty-sdk/logic-function';

import { appClient } from 'src/logic-functions/utils/app-client';
import { fillExpenseOwner } from 'src/logic-functions/utils/owner-sync';

// Property set on an expense: take its owner when none is set.
const handler = async (
  batch: DatabaseEventBatchPayload<ObjectRecordUpdateEvent<{ id?: string | null }>>,
): Promise<void> => {
  const client = appClient();

  for (const event of batch.events) {
    const recordId = event.properties.after?.id ?? event.recordId;

    if (recordId) await fillExpenseOwner(client, recordId);
  }
};

export default defineLogicFunction({
  universalIdentifier: '7b2e9c84-1d5f-4a63-8e0b-9f4c2a6d1e37',
  name: 'on-expense-property-changed',
  description: "Fills the expense owner when its property is set.",
  timeoutSeconds: 60,
  databaseEventTriggerSettings: {
    eventName: 'expense.updated',
    updatedFields: ['propertyId'],
    batchMode: true,
  },
  handler,
});
