import { defineObject, FieldType } from 'twenty-sdk/define';

export const DOCUMENT_TEMPLATE_OBJECT_ID = '10d72e08-4caa-4564-8079-cbb22479abcb';
const NAME_FIELD_ID = '8536c5fb-005f-49e3-ad17-30d43243a7d1';

// Receipt and year-statement layouts made in the template editor (Reports ->
// Templates). The default one of each kind is used when receipts and
// statements are made; without one, the English sample is used.
export default defineObject({
  universalIdentifier: DOCUMENT_TEMPLATE_OBJECT_ID,
  nameSingular: 'documentTemplate',
  namePlural: 'documentTemplates',
  labelSingular: 'Document template',
  labelPlural: 'Document templates',
  description: 'Receipt and year statement layouts',
  icon: 'IconTemplate',
  labelIdentifierFieldMetadataUniversalIdentifier: NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: 'eb0bbf29-88f8-42c9-afb1-78c85097c901',
      type: FieldType.SELECT,
      name: 'kind',
      label: 'For',
      icon: 'IconFileDescription',
      defaultValue: "'RECEIPT'",
      options: [
        { id: 'b12a9d2f-008d-4244-9a3a-7d17580b17fd', value: 'RECEIPT', label: 'Receipt', position: 0, color: 'blue' },
        { id: 'b4ff384b-c0da-4009-8950-8c2585e54044', value: 'STATEMENT', label: 'Year statement', position: 1, color: 'purple' },
      ],
    },
    {
      universalIdentifier: '18832ae5-2c35-4ccf-8ab4-2f0d3854b850',
      type: FieldType.SELECT,
      name: 'language',
      label: 'Language',
      icon: 'IconLanguage',
      defaultValue: "'EN'",
      options: [
        { id: '91509f7e-9ab4-4e37-919d-1d1adf4cf271', value: 'EN', label: 'English', position: 0, color: 'gray' },
        { id: '10902a06-1b86-4a28-ae2d-98c697d23377', value: 'MS', label: 'Bahasa Melayu', position: 1, color: 'green' },
      ],
    },
    {
      universalIdentifier: 'b5c08506-ad87-4ecb-aa63-9b0ca37a23c6',
      type: FieldType.BOOLEAN,
      name: 'isDefault',
      label: 'Default',
      description: 'Used for new receipts / statements of this kind.',
      icon: 'IconStar',
      defaultValue: false,
    },
    {
      universalIdentifier: '5c977b1d-ad64-41ae-9164-ef94418851d1',
      type: FieldType.RAW_JSON,
      name: 'content',
      label: 'Layout',
      icon: 'IconLayoutList',
      isNullable: true,
    },
  ],
});
