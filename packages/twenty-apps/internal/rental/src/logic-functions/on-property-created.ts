import {
  defineLogicFunction,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk/define';
import { type DatabaseEventBatchPayload } from 'twenty-sdk/logic-function';

import { appClient } from 'src/logic-functions/utils/app-client';
import { fillPropertyOwner } from 'src/logic-functions/utils/owner-sync';

// New property without a workspace: put it in Personal.
const handler = async (
  batch: DatabaseEventBatchPayload<ObjectRecordCreateEvent<{ id?: string | null }>>,
): Promise<void> => {
  const client = appClient();

  for (const event of batch.events) {
    const recordId = event.properties.after?.id ?? event.recordId;

    if (recordId) await fillPropertyOwner(client, recordId);
  }
};

export default defineLogicFunction({
  universalIdentifier: 'b81f2467-bd59-4997-b4fb-b065f9bf4539',
  name: 'on-property-created',
  description: "Puts a new property without a workspace in Personal.",
  timeoutSeconds: 60,
  databaseEventTriggerSettings: {
    eventName: 'property.created',
    batchMode: true,
  },
  handler,
});
