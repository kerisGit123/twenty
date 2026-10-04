import {
  defineLogicFunction,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk/define';
import { type DatabaseEventBatchPayload } from 'twenty-sdk/logic-function';
import { CoreApiClient } from 'twenty-client-sdk/core';

import { syncWhatsappLink } from 'src/logic-functions/utils/owner-sync';

// New person: build their WhatsApp link from the phone number.
const handler = async (
  batch: DatabaseEventBatchPayload<ObjectRecordCreateEvent<{ id?: string | null }>>,
): Promise<void> => {
  const client = new CoreApiClient();

  for (const event of batch.events) {
    const recordId = event.properties.after?.id ?? event.recordId;

    if (recordId) await syncWhatsappLink(client, recordId);
  }
};

export default defineLogicFunction({
  universalIdentifier: '6576dcfd-d162-4334-9876-7415b7e62340',
  name: 'on-person-created',
  description: "Sets the WhatsApp link from the phone number.",
  timeoutSeconds: 60,
  databaseEventTriggerSettings: {
    eventName: 'person.created',
    batchMode: true,
  },
  handler,
});
