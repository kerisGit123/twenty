import { defineLogicFunction } from 'twenty-sdk/define';
import { CoreApiClient } from 'twenty-client-sdk/core';

import { RECORD_PAYMENT_ROUTE_ID } from 'src/constants/universal-identifiers';
import { jsonRoute } from 'src/logic-functions/utils/json-route';
import {
  createDraftRentPayment,
  latestRentPayment,
  loadRental,
  nextRentPeriod,
} from 'src/logic-functions/utils/rental-service';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "Record payment" on a rental: a Draft rent payment for the next unpaid
// month, amount = monthly rent, method = last one used.
const recordPayment = async (rentalId: string) => {
  if (!rentalId) {
    return { success: false, status: 400, message: 'No rental selected.' };
  }

  const client = new CoreApiClient();
  const rental = await loadRental(client, rentalId);

  if (!rental) {
    return { success: false, status: 404, message: 'Rental not found.' };
  }
  if (rental.status === 'ENDED') {
    return { success: false, status: 400, message: 'This rental has ended.' };
  }

  const period = await nextRentPeriod(client, rental);
  const previous = await latestRentPayment(client, rental.id);

  await createDraftRentPayment(client, rental, period, previous?.method);

  const [year, month] = period.split('-').map(Number);

  return {
    success: true,
    message: `Draft payment created for ${MONTHS[month - 1]} ${year}. Check it in Payments, then Send receipt.`,
  };
};

export default defineLogicFunction({
  universalIdentifier: RECORD_PAYMENT_ROUTE_ID,
  name: 'record-payment-route',
  description: 'Creates a Draft rent payment for the next unpaid month of the rental.',
  timeoutSeconds: 60,
  handler: jsonRoute(recordPayment),
  httpRouteTriggerSettings: { path: '/rentals/record-payment', httpMethod: 'POST', isAuthRequired: true },
});
