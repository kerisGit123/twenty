import {
  defineLogicFunction,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk/define';
import { type DatabaseEventBatchPayload } from 'twenty-sdk/logic-function';

import { appClient } from 'src/logic-functions/utils/app-client';
import { fillDocumentOwner } from 'src/logic-functions/utils/owner-sync';

// New document: take the workspace from the property, else Personal.
const handler = async (
  batch: DatabaseEventBatchPayload<ObjectRecordCreateEvent<{ id?: string | null }>>,
): Promise<void> => {
  const client = appClient();

  for (const event of batch.events) {
    const recordId = event.properties.after?.id ?? event.recordId;

    if (recordId) await fillDocumentOwner(client, recordId);
  }
};

export default defineLogicFunction({
  universalIdentifier: '44d36809-b368-41d6-8a65-e89e5aa7fab8',
  name: 'on-document-created',
  description: "Puts a new document in its property's workspace, else Personal.",
  timeoutSeconds: 60,
  databaseEventTriggerSettings: {
    eventName: 'document.created',
    batchMode: true,
  },
  handler,
});
