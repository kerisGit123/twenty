import { defineField, FieldType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

import { PERSON_NO_CAMPAIGNS_FIELD_ID } from 'src/constants/universal-identifiers-v4';

// Opted out: never included in greetings, newsletters or announcements.
export default defineField({
  universalIdentifier: PERSON_NO_CAMPAIGNS_FIELD_ID,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.BOOLEAN,
  name: 'noCampaigns',
  label: 'No greetings / newsletters',
  description: 'Tick when the person asked not to get greetings, newsletters or announcements.',
  icon: 'IconMessageOff',
  defaultValue: false,
});
