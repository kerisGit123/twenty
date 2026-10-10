import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  STOCK_ORDER_DATE_FIELD_ID,
  STOCK_ORDER_LINES_FIELD_ID,
  STOCK_ORDER_NAME_FIELD_ID,
  STOCK_ORDER_NOTES_FIELD_ID,
  STOCK_ORDER_NUMBER_FIELD_ID,
  STOCK_ORDER_OBJECT_ID,
  STOCK_ORDER_STATUS_FIELD_ID,
  STOCK_ORDER_STATUS_OPTION_IDS,
  STOCK_ORDER_SUPPLIER_FIELD_ID,
  STOCK_ORDER_SUPPLIER_REF_FIELD_ID,
} from 'src/constants/universal-identifiers-stock';
import { ORDER_STATUSES } from 'src/shared/stock-types';

type Color = 'gray' | 'blue' | 'orange' | 'green' | 'red';

// An order we send to a supplier (our draft; the supplier raises the real
// PO / invoice). Goods received against it are purchase movements that carry
// its id, so what is still outstanding is always known.
export default defineObject({
  universalIdentifier: STOCK_ORDER_OBJECT_ID,
  nameSingular: 'stockOrder',
  namePlural: 'stockOrders',
  labelSingular: 'Stock order',
  labelPlural: 'Stock orders',
  description: 'Orders sent to suppliers, and what has arrived',
  icon: 'IconShoppingCart',
  labelIdentifierFieldMetadataUniversalIdentifier: STOCK_ORDER_NAME_FIELD_ID,
  fields: [
    { universalIdentifier: STOCK_ORDER_NAME_FIELD_ID, type: FieldType.TEXT, name: 'name', label: 'Order', icon: 'IconAbc' },
    { universalIdentifier: STOCK_ORDER_NUMBER_FIELD_ID, type: FieldType.TEXT, name: 'orderNumber', label: 'Order no.', description: 'Our reference, e.g. ORD-2026-0001', icon: 'IconHash', isNullable: true },
    { universalIdentifier: STOCK_ORDER_SUPPLIER_FIELD_ID, type: FieldType.TEXT, name: 'supplier', label: 'Supplier', icon: 'IconTruck', isNullable: true },
    { universalIdentifier: STOCK_ORDER_DATE_FIELD_ID, type: FieldType.DATE, name: 'orderDate', label: 'Ordered on', icon: 'IconCalendar', isNullable: true },
    {
      universalIdentifier: STOCK_ORDER_STATUS_FIELD_ID,
      type: FieldType.SELECT,
      name: 'status',
      label: 'Status',
      icon: 'IconProgressCheck',
      defaultValue: "'DRAFT'",
      options: ORDER_STATUSES.map((s, index) => ({ id: STOCK_ORDER_STATUS_OPTION_IDS[index], value: s.value, label: s.label, position: index, color: s.color as Color })),
    },
    {
      universalIdentifier: STOCK_ORDER_SUPPLIER_REF_FIELD_ID,
      type: FieldType.TEXT,
      name: 'supplierRef',
      label: "Supplier's PO no.",
      description: 'The PO / invoice number the supplier gave this order.',
      icon: 'IconReceipt',
      isNullable: true,
    },
    {
      universalIdentifier: STOCK_ORDER_LINES_FIELD_ID,
      type: FieldType.RAW_JSON,
      name: 'lines',
      label: 'Lines',
      description: 'Items ordered: [{ itemId, orderedUnits, cartonPrice, closed }]',
      icon: 'IconList',
      isNullable: true,
    },
    { universalIdentifier: STOCK_ORDER_NOTES_FIELD_ID, type: FieldType.TEXT, name: 'notes', label: 'Notes', icon: 'IconNotes', isNullable: true },
  ],
});
