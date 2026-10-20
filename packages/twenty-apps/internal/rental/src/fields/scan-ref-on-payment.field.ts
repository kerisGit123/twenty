import { defineField, FieldType } from 'twenty-sdk/define';

import { PAYMENT_OBJECT_ID } from 'src/constants/universal-identifiers';

// The bank reference and file fingerprint of a payment recorded from a scanned bank
// receipt ("ref:MBB123 scan:ab12"), so the same transfer is never recorded twice.
// Kept out of the notes, which are printed on the tenant's receipt.
export default defineField({
  universalIdentifier: 'f40eb4d0-e1c1-4708-a919-2714a765cc14',
  objectUniversalIdentifier: PAYMENT_OBJECT_ID,
  type: FieldType.TEXT,
  name: 'scanRef',
  label: 'Bank reference (scanned)',
  description: 'Bank reference of the scanned transfer receipt; used to catch the same transfer twice.',
  icon: 'IconScan',
});
