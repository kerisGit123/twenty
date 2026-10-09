import { defineObject, FieldType, NumberDataType } from 'twenty-sdk/define';

import {
  STOCK_GROUP_OPTION_IDS,
  STOCK_ITEM_CODE_FIELD_ID,
  STOCK_ITEM_GROUP_FIELD_ID,
  STOCK_ITEM_NAME_FIELD_ID,
  STOCK_ITEM_NOTES_FIELD_ID,
  STOCK_ITEM_OBJECT_ID,
  STOCK_ITEM_PER_CTN_FIELD_ID,
  STOCK_ITEM_PRICE_FIELD_ID,
  STOCK_ITEM_REORDER_BELOW_FIELD_ID,
  STOCK_ITEM_SPEC_FIELD_ID,
  STOCK_ITEM_STATUS_FIELD_ID,
  STOCK_ITEM_SUPPLIER_FIELD_ID,
  STOCK_ITEM_UNIT_FIELD_ID,
  STOCK_STATUS_OPTION_IDS,
} from 'src/constants/universal-identifiers-stock';
import { STOCK_GROUPS, STOCK_STATUSES } from 'src/shared/stock-types';

type Color = 'orange' | 'blue' | 'gray' | 'purple' | 'green';

// Something the F&B business keeps in stock (ice cream powder, cups...).
// Stock is counted in inner units (bag, bottle, pcs); a carton holds
// "units per carton" of them and is bought at "carton price".
export default defineObject({
  universalIdentifier: STOCK_ITEM_OBJECT_ID,
  nameSingular: 'stockItem',
  namePlural: 'stockItems',
  labelSingular: 'Stock item',
  labelPlural: 'Stock items',
  description: 'Items kept in stock (F&B ingredients, packaging...)',
  icon: 'IconPackage',
  labelIdentifierFieldMetadataUniversalIdentifier: STOCK_ITEM_NAME_FIELD_ID,
  fields: [
    { universalIdentifier: STOCK_ITEM_NAME_FIELD_ID, type: FieldType.TEXT, name: 'name', label: 'Product name', icon: 'IconAbc' },
    { universalIdentifier: STOCK_ITEM_CODE_FIELD_ID, type: FieldType.TEXT, name: 'code', label: 'Item code', icon: 'IconHash', isNullable: true },
    { universalIdentifier: STOCK_ITEM_SPEC_FIELD_ID, type: FieldType.TEXT, name: 'specification', label: 'Specification', description: 'e.g. 3kg*8袋/件', icon: 'IconRuler', isNullable: true },
    {
      universalIdentifier: STOCK_ITEM_GROUP_FIELD_ID,
      type: FieldType.SELECT,
      name: 'group',
      label: 'Group',
      icon: 'IconCategory',
      defaultValue: "'RAW'",
      options: STOCK_GROUPS.map((g, index) => ({ id: STOCK_GROUP_OPTION_IDS[index], value: g.value, label: g.label, position: index, color: g.color as Color })),
    },
    { universalIdentifier: STOCK_ITEM_UNIT_FIELD_ID, type: FieldType.TEXT, name: 'unit', label: 'Inner unit', description: 'bag, bottle, can, pcs...', icon: 'IconBox', isNullable: true },
    {
      universalIdentifier: STOCK_ITEM_PER_CTN_FIELD_ID,
      type: FieldType.NUMBER,
      name: 'unitsPerCarton',
      label: 'Units per carton',
      icon: 'IconBoxMultiple',
      defaultValue: 1,
    },
    {
      universalIdentifier: STOCK_ITEM_PRICE_FIELD_ID,
      type: FieldType.CURRENCY,
      name: 'cartonPrice',
      label: 'Carton price',
      icon: 'IconCash',
      isNullable: true,
      defaultValue: { amountMicros: null, currencyCode: "'MYR'" },
    },
    { universalIdentifier: STOCK_ITEM_SUPPLIER_FIELD_ID, type: FieldType.TEXT, name: 'supplier', label: 'Supplier', icon: 'IconTruck', isNullable: true },
    {
      universalIdentifier: STOCK_ITEM_STATUS_FIELD_ID,
      type: FieldType.SELECT,
      name: 'status',
      label: 'Status',
      icon: 'IconToggleRight',
      defaultValue: "'ACTIVE'",
      options: STOCK_STATUSES.map((s, index) => ({ id: STOCK_STATUS_OPTION_IDS[index], value: s.value, label: s.label, position: index, color: s.color as Color })),
    },
    {
      universalIdentifier: STOCK_ITEM_REORDER_BELOW_FIELD_ID,
      type: FieldType.NUMBER,
      name: 'reorderBelowMonths',
      label: 'Re-order below (months)',
      description: "Empty = the workspace's rule (1.5 months unless changed).",
      icon: 'IconAlarm',
      isNullable: true,
      universalSettings: { dataType: NumberDataType.FLOAT, decimals: 1 },
    },
    { universalIdentifier: STOCK_ITEM_NOTES_FIELD_ID, type: FieldType.TEXT, name: 'notes', label: 'Notes', icon: 'IconNotes', isNullable: true },
  ],
});
