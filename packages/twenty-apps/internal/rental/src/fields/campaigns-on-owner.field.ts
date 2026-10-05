import { defineField, FieldType, RelationType } from 'twenty-sdk/define';

import { OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import { CAMPAIGN_OBJECT_ID, CAMPAIGN_OWNER_FIELD_ID, OWNER_CAMPAIGNS_FIELD_ID } from 'src/constants/universal-identifiers-v4';

export default defineField({
  universalIdentifier: OWNER_CAMPAIGNS_FIELD_ID,
  objectUniversalIdentifier: OWNER_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'campaigns',
  label: 'Campaigns',
  icon: 'IconSpeakerphone',
  relationTargetObjectMetadataUniversalIdentifier: CAMPAIGN_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: CAMPAIGN_OWNER_FIELD_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
