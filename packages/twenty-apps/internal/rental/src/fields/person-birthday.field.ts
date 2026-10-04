import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { PERSON_BIRTHDAY_FIELD_ID } from 'src/constants/universal-identifiers-v2';

export default defineField({
  universalIdentifier: PERSON_BIRTHDAY_FIELD_ID,
  objectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.DATE,
  name: 'birthday',
  label: 'Birthday',
  icon: 'IconCake',
  isNullable: true,
});
