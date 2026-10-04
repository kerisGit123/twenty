import {
  defineLogicFunction,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk/define';
import { type DatabaseEventBatchPayload } from 'twenty-sdk/logic-function';
import { CoreApiClient } from 'twenty-client-sdk/core';

import { fillExpenseOwner } from 'src/logic-functions/utils/owner-sync';

// New expense: take the owner from the property when none is set.
const handler = async (
  batch: DatabaseEventBatchPayload<ObjectRecordCreateEvent<{ id?: string | null }>>,
): Promise<void> => {
  const client = new CoreApiClient();

  for (const event of batch.events) {
    const recordId = event.properties.after?.id ?? event.recordId;

    if (recordId) await fillExpenseOwner(client, recordId);
  }
};

export default defineLogicFunction({
  universalIdentifier: '0d6f3a41-6a3b-4f7e-9d1c-2b8e5f4a7c10',
  name: 'on-expense-created',
  description: "Fills the expense owner from its property.",
  timeoutSeconds: 60,
  databaseEventTriggerSettings: {
    eventName: 'expense.created',
    batchMode: true,
  },
  handler,
});
