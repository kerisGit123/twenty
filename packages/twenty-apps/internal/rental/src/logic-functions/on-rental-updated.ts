import {
  defineLogicFunction,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';
import { type DatabaseEventBatchPayload } from 'twenty-sdk/logic-function';

import { appClient } from 'src/logic-functions/utils/app-client';
import { ON_RENTAL_UPDATED_FUNCTION_ID } from 'src/constants/universal-identifiers';
import {
  fillRentalDefaults,
  loadRental,
  syncPropertyStatus,
} from 'src/logic-functions/utils/rental-service';

type RentalEventRecord = { id?: string | null; propertyId?: string | null };

// Status, property or tenant changed: resync every property involved (the
// old one too, if the rental moved) and fill the name if still empty.
// Only these fields trigger it, so the name update below doesn't loop.
const handler = async (
  batch: DatabaseEventBatchPayload<ObjectRecordUpdateEvent<RentalEventRecord>>,
): Promise<void> => {
  const client = appClient();
  const propertyIds = new Set<string>();

  for (const event of batch.events) {
    const rentalId = event.properties.after?.id ?? event.recordId;
    const before = event.properties.before?.propertyId;
    const after = event.properties.after?.propertyId;

    if (before) propertyIds.add(before);
    if (after) propertyIds.add(after);

    if (!rentalId) continue;

    const rental = await loadRental(client, rentalId);

    if (rental) {
      await fillRentalDefaults(client, rental);
      if (rental.propertyId) propertyIds.add(rental.propertyId);
    }
  }

  for (const propertyId of propertyIds) {
    await syncPropertyStatus(client, propertyId);
  }
};

export default defineLogicFunction({
  universalIdentifier: ON_RENTAL_UPDATED_FUNCTION_ID,
  name: 'on-rental-updated',
  description: "Keeps the property's status and tenant in sync with its rentals.",
  timeoutSeconds: 60,
  databaseEventTriggerSettings: {
    eventName: 'rental.updated',
    updatedFields: ['status', 'propertyId', 'tenantId'],
    batchMode: true,
  },
  handler,
});
