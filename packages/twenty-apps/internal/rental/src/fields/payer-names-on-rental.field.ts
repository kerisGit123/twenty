import { defineField, FieldType } from 'twenty-sdk/define';

import { RENTAL_OBJECT_ID } from 'src/constants/universal-identifiers';

// Names that paid this contract's rent before ("MR TAN A K", a spouse, a company),
// one per line; learned from scanned bank receipts so the next one matches by name.
export default defineField({
  universalIdentifier: '3077bab5-35c4-40c3-8764-86dd0ad05599',
  objectUniversalIdentifier: RENTAL_OBJECT_ID,
  type: FieldType.TEXT,
  name: 'payerNames',
  label: 'Payer names',
  description: 'Who pays the rent, as their bank shows it (one per line). Learned from scanned bank receipts.',
  icon: 'IconUserDollar',
});
