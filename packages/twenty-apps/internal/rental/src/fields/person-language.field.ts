import { defineField, FieldType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

import { PERSON_LANGUAGE_FIELD_ID, PERSON_LANGUAGE_OPTION_IDS } from 'src/constants/universal-identifiers-v4';

// Which language greetings and newsletters go out in.
export default defineField({
  universalIdentifier: PERSON_LANGUAGE_FIELD_ID,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.SELECT,
  name: 'language',
  label: 'Language',
  icon: 'IconLanguage',
  defaultValue: "'EN'",
  options: [
    { id: PERSON_LANGUAGE_OPTION_IDS[0], value: 'EN', label: 'English', position: 0, color: 'blue' },
    { id: PERSON_LANGUAGE_OPTION_IDS[1], value: 'MS', label: 'Bahasa Melayu', position: 1, color: 'green' },
    { id: PERSON_LANGUAGE_OPTION_IDS[2], value: 'ZH', label: '中文', position: 2, color: 'red' },
  ],
});
