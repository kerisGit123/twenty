import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  PROPERTY_OBJECT_ID,
  PROPERTY_RENTALS_FIELD_ID,
  RENTAL_OBJECT_ID,
  RENTAL_PROPERTY_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: RENTAL_PROPERTY_FIELD_ID,
  objectUniversalIdentifier: RENTAL_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'property',
  label: 'Property',
  icon: 'IconHome',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier: PROPERTY_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier: PROPERTY_RENTALS_FIELD_ID,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'propertyId',
  },
});
