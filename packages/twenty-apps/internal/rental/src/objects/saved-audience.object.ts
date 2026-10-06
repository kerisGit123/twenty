import { defineObject, FieldType } from 'twenty-sdk/define';

import { SAVED_AUDIENCE_AUDIENCE_FIELD_ID, SAVED_AUDIENCE_NAME_FIELD_ID, SAVED_AUDIENCE_OBJECT_ID } from 'src/constants/universal-identifiers-v4';

// A named audience to reuse in campaigns, e.g. "Tenants at Residensi Mawar".
export default defineObject({
  universalIdentifier: SAVED_AUDIENCE_OBJECT_ID,
  nameSingular: 'savedAudience',
  namePlural: 'savedAudiences',
  labelSingular: 'Saved audience',
  labelPlural: 'Saved audiences',
  description: 'Reusable campaign audiences',
  icon: 'IconUsersGroup',
  labelIdentifierFieldMetadataUniversalIdentifier: SAVED_AUDIENCE_NAME_FIELD_ID,
  fields: [
    { universalIdentifier: SAVED_AUDIENCE_NAME_FIELD_ID, type: FieldType.TEXT, name: 'name', label: 'Name', icon: 'IconAbc' },
    { universalIdentifier: SAVED_AUDIENCE_AUDIENCE_FIELD_ID, type: FieldType.RAW_JSON, name: 'audience', label: 'Audience', icon: 'IconUsers', isNullable: true },
  ],
});
