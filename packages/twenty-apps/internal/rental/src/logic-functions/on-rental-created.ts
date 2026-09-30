import {
  defineLogicFunction,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk/define';
import { type DatabaseEventBatchPayload } from 'twenty-sdk/logic-function';
import { CoreApiClient } from 'twenty-client-sdk/core';

import { ON_RENTAL_CREATED_FUNCTION_ID } from 'src/constants/universal-identifiers';
import {
  fillRentalDefaults,
  loadRental,
  syncPropertyStatus,
} from 'src/logic-functions/utils/rental-service';

type RentalEventRecord = { id?: string | null; propertyId?: string | null };

// New rental: name it, take rent/deposit from the property, and update the
// property's Occupied/Vacant status.
const handler = async (
  batch: DatabaseEventBatchPayload<ObjectRecordCreateEvent<RentalEventRecord>>,
): Promise<void> => {
  const client = new CoreApiClient();

  for (const event of batch.events) {
    const rentalId = event.properties.after?.id ?? event.recordId;

    if (!rentalId) continue;

    const rental = await loadRental(client, rentalId);

    if (!rental) continue;

    await fillRentalDefaults(client, rental);

    if (rental.propertyId) {
      await syncPropertyStatus(client, rental.propertyId);
    }
  }
};

export default defineLogicFunction({
  universalIdentifier: ON_RENTAL_CREATED_FUNCTION_ID,
  name: 'on-rental-created',
  description: 'Fills rental defaults and syncs the property status.',
  timeoutSeconds: 60,
  databaseEventTriggerSettings: {
    eventName: 'rental.created',
    batchMode: true,
  },
  handler,
});
