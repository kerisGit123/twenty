import { defineField, FieldType, OnDeleteAction, RelationType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

import { ACTIVITY_PERSON_FIELD_ID, CONTACT_ACTIVITY_OBJECT_ID, PERSON_ACTIVITIES_FIELD_ID } from 'src/constants/universal-identifiers-v4';

export default defineField({
  universalIdentifier: ACTIVITY_PERSON_FIELD_ID,
  objectUniversalIdentifier: CONTACT_ACTIVITY_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'person',
  label: 'Person',
  icon: 'IconUser',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier: PERSON_ACTIVITIES_FIELD_ID,
  universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: OnDeleteAction.CASCADE, joinColumnName: 'personId' },
});
