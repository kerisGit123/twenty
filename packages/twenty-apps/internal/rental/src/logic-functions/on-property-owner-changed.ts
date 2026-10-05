import {
  defineLogicFunction,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';
import { type DatabaseEventBatchPayload } from 'twenty-sdk/logic-function';

import { appClient } from 'src/logic-functions/utils/app-client';
import { backfillPropertyOwner } from 'src/logic-functions/utils/owner-sync';

// Property owner set: assign its payments and expenses that have no owner yet.
const handler = async (
  batch: DatabaseEventBatchPayload<ObjectRecordUpdateEvent<{ id?: string | null }>>,
): Promise<void> => {
  const client = appClient();

  for (const event of batch.events) {
    const recordId = event.properties.after?.id ?? event.recordId;

    if (recordId) await backfillPropertyOwner(client, recordId);
  }
};

export default defineLogicFunction({
  universalIdentifier: '3c8a5f20-7e41-4b9d-a6c2-5d1f8e3b9a64',
  name: 'on-property-owner-changed',
  description: "Assigns the property's unowned payments and expenses to its owner.",
  timeoutSeconds: 60,
  databaseEventTriggerSettings: {
    eventName: 'property.updated',
    updatedFields: ['ownerId'],
    batchMode: true,
  },
  handler,
});
