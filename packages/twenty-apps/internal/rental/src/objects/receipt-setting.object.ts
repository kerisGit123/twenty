import { defineObject, FieldType } from 'twenty-sdk/define';

export const RECEIPT_SETTING_OBJECT_ID = '9567b615-8b37-430f-808a-01e8d8cb0118';
const NAME_FIELD_ID = '65617936-fd56-4611-aa8e-bd2caec6b44d';

// One record per workspace holding how receipts look and read. Edited from
// "Receipt settings" in the Rent Ledger (with a live preview).
export default defineObject({
  universalIdentifier: RECEIPT_SETTING_OBJECT_ID,
  nameSingular: 'receiptSetting',
  namePlural: 'receiptSettings',
  labelSingular: 'Receipt setting',
  labelPlural: 'Receipt settings',
  description: 'Template, wording and branding used on receipts',
  icon: 'IconReceiptTax',
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
      universalIdentifier: '13944fea-167b-4dec-a861-d98c5a8b3c36',
      type: FieldType.SELECT,
      name: 'template',
      label: 'Template',
      icon: 'IconLayout',
      defaultValue: "'CLASSIC'",
      options: [
        { id: '16a0f544-3f08-49fd-ae36-f48caffc4b33', value: 'CLASSIC', label: 'Classic form', position: 0, color: 'turquoise' },
        { id: '8d8dcf7e-d874-43cd-a5a6-8de3038194ef', value: 'MODERN', label: 'Modern', position: 1, color: 'blue' },
        { id: 'b3eeb1c3-dcf3-4aba-b3ac-5c48d8eea36f', value: 'COMPACT', label: 'Compact (half page)', position: 2, color: 'gray' },
      ],
    },
    {
      universalIdentifier: '1aa5479f-f363-4b0b-86a9-31508135b4de',
      type: FieldType.SELECT,
      name: 'accentColor',
      label: 'Colour',
      icon: 'IconPalette',
      defaultValue: "'TEAL'",
      options: [
        { id: 'ca19d0e9-8e90-45ea-9a4e-1236a16acae8', value: 'TEAL', label: 'Teal', position: 0, color: 'turquoise' },
        { id: '2c5413b5-0dfa-4734-8b7e-c06524f2c9e0', value: 'NAVY', label: 'Navy', position: 1, color: 'blue' },
        { id: '12ecc627-faac-484a-b8c4-d385a0f59b21', value: 'GREEN', label: 'Green', position: 2, color: 'green' },
        { id: '3328ee4c-a676-4364-8872-df29e9b634fb', value: 'MAROON', label: 'Maroon', position: 3, color: 'red' },
        { id: '4774f835-7b4e-46bf-b48c-08002e1fe8fa', value: 'BLACK', label: 'Black', position: 4, color: 'gray' },
      ],
    },
    {
      universalIdentifier: 'baf2c63b-fca7-46ee-b893-6c4fe993aaa8',
      type: FieldType.TEXT,
      name: 'businessName',
      label: 'Business name',
      description: 'Shown at the top of receipts. Empty = workspace name.',
      icon: 'IconBuildingStore',
      isNullable: true,
    },
    {
      universalIdentifier: '84340e49-b133-4667-a1ba-97c8330b1f08',
      type: FieldType.TEXT,
      name: 'businessDetails',
      label: 'Business details',
      description: 'Address, phone, SSM no. Shown under the business name.',
      icon: 'IconAddressBook',
      isNullable: true,
    },
    {
      universalIdentifier: '153e287c-bdb8-4171-87a9-11f63e6d3e8e',
      type: FieldType.TEXT,
      name: 'rentTitle',
      label: 'Rent receipt title',
      icon: 'IconHeading',
      isNullable: true,
    },
    {
      universalIdentifier: '81b8c740-eb51-4148-afa1-01de861fb61b',
      type: FieldType.TEXT,
      name: 'depositTitle',
      label: 'Deposit receipt title',
      icon: 'IconHeading',
      isNullable: true,
    },
    {
      universalIdentifier: '8e782b0c-de0b-45c7-8365-abe06c1edbe1',
      type: FieldType.TEXT,
      name: 'receivedBy',
      label: 'Received by',
      icon: 'IconSignature',
      isNullable: true,
    },
    {
      universalIdentifier: '2df51e55-006a-496a-81ff-a8ce56b1e556',
      type: FieldType.TEXT,
      name: 'footerText',
      label: 'Footer text',
      description: 'Small print at the bottom, e.g. a thank-you or terms.',
      icon: 'IconAlignLeft',
      isNullable: true,
    },
  ],
});
