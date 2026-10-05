import {
  defineLogicFunction,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';
import { type DatabaseEventBatchPayload } from 'twenty-sdk/logic-function';

import { appClient } from 'src/logic-functions/utils/app-client';
import { syncWhatsappLink } from 'src/logic-functions/utils/owner-sync';

// Phone changed: rebuild the WhatsApp link (only phones trigger it, so the link update does not loop).
const handler = async (
  batch: DatabaseEventBatchPayload<ObjectRecordUpdateEvent<{ id?: string | null }>>,
): Promise<void> => {
  const client = appClient();

  for (const event of batch.events) {
    const recordId = event.properties.after?.id ?? event.recordId;

    if (recordId) await syncWhatsappLink(client, recordId);
  }
};

export default defineLogicFunction({
  universalIdentifier: 'f029d3cc-746f-40d4-8d79-119717a1aa11',
  name: 'on-person-phone-changed',
  description: "Keeps the WhatsApp link in step with the phone number.",
  timeoutSeconds: 60,
  databaseEventTriggerSettings: {
    eventName: 'person.updated',
    updatedFields: ['phones'],
    batchMode: true,
  },
  handler,
});
