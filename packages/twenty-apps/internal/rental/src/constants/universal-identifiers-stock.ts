// F&B stock module: items, IN/OUT movements, the Stock page.

export const STOCK_ITEM_OBJECT_ID = '655752e5-51fe-460e-8c7d-784b93aa997a';
export const STOCK_ITEM_CODE_FIELD_ID = '70b5788c-9ff2-4eb6-9dd1-cb63a6a94ab8';
export const STOCK_ITEM_NAME_FIELD_ID = '75cc4604-84f9-4598-89d0-64651faa5bbc';
export const STOCK_ITEM_SPEC_FIELD_ID = '0fc02d6f-62c0-4609-a9b4-89727c17b670';
export const STOCK_ITEM_GROUP_FIELD_ID = 'a63e676c-1074-4ac9-8e33-adbd5163f76a';
export const STOCK_ITEM_UNIT_FIELD_ID = '7fc6583b-bc70-48c8-8d78-10db3a5fc15d';
export const STOCK_ITEM_PER_CTN_FIELD_ID = 'c049c268-834d-4cf8-bea2-830b579f569f';
export const STOCK_ITEM_PRICE_FIELD_ID = '2142a3ef-5283-4f67-8bd3-b9f6961ba9af';
export const STOCK_ITEM_SUPPLIER_FIELD_ID = '5c61e87c-5d85-4943-89f2-cbb94d964b6c';
export const STOCK_ITEM_STATUS_FIELD_ID = '2a2f85ff-9aa5-4b47-8227-7f21a5cec0b0';
export const STOCK_ITEM_NOTES_FIELD_ID = '1d0f2eb2-eae7-48b8-8a37-d0d8a0a16b63';
export const STOCK_ITEM_REORDER_BELOW_FIELD_ID = 'f07a945a-a2a3-4e80-9eb3-8211bf6ff61e';

export const STOCK_MOVEMENT_OBJECT_ID = '0dcbfb85-6ce5-4a0e-b145-8819bad904ed';
export const STOCK_MOVEMENT_NAME_FIELD_ID = '7577908e-ebb7-42fe-8c19-785f0f89589a';
export const STOCK_MOVEMENT_DATE_FIELD_ID = 'dd1915c9-dec5-4662-a954-ba01c82c2e54';
export const STOCK_MOVEMENT_TYPE_FIELD_ID = 'b0fc8fa5-1c66-4010-97f7-c81fc1bdec08';
export const STOCK_MOVEMENT_QTY_FIELD_ID = '1962c8bc-8fd7-41e9-a3e3-f940bf36a1ee';
export const STOCK_MOVEMENT_PARTY_FIELD_ID = 'a1e21965-4f7c-4840-a861-e6083691b7dc';
export const STOCK_MOVEMENT_UNIT_COST_FIELD_ID = '26e1edfd-00ab-4bd7-89a0-2078d9463707';
export const STOCK_MOVEMENT_EXPIRY_FIELD_ID = 'c1a0e3b2-749e-49d6-be76-dd0235d21e28';
export const STOCK_MOVEMENT_REFERENCE_FIELD_ID = '020ebb42-7ef9-44dc-a1ae-0d40527901a7';
export const STOCK_MOVEMENT_NOTES_FIELD_ID = 'c9473154-3ac4-48ef-9d42-06799e206212';
export const STOCK_MOVEMENT_BORROW_STATUS_FIELD_ID = '4ed72a63-b893-4ea0-a1f1-d90bd425f17a';
export const STOCK_MOVEMENT_BORROW_ID_FIELD_ID = 'eed3782c-7677-4fc5-9fe3-a2ada6647d60';
// The save a movement came from (lines saved together share it; a retried save is recognised by it).
export const STOCK_MOVEMENT_BATCH_ID_FIELD_ID = '78b8c5ff-846c-4ad0-9bf8-8006dee3d072';

export const STOCK_MOVEMENT_ITEM_FIELD_ID = '33aa38db-5184-4cbd-87b2-0f497ca1e06d';
export const STOCK_ITEM_MOVEMENTS_FIELD_ID = '2511fbbc-3ae7-4a7f-8556-ce54711230c8';
export const STOCK_ITEM_OWNER_FIELD_ID = '530f30b2-0b6e-4391-85f2-39a1067021f8';
export const OWNER_STOCK_ITEMS_FIELD_ID = '7445dbab-2411-49fa-aa26-0ea349a6ff7a';
export const STOCK_MOVEMENT_OWNER_FIELD_ID = '822fcc0c-222f-4e0e-9750-d7987bcedb09';
export const OWNER_STOCK_MOVEMENTS_FIELD_ID = '7b698475-919f-4565-ac18-8a5a3dba6b99';

// Per-workspace reorder rule (on the workspace record).
export const OWNER_STOCK_REORDER_BELOW_FIELD_ID = '4b53e874-0178-4b3d-8c50-0cf2f1ae385e';
export const OWNER_STOCK_ORDER_UP_TO_FIELD_ID = '34bdd853-6c06-4f88-9468-0f002f507893';

export const STOCK_GROUP_OPTION_IDS = [
  '7b508d64-2a77-43ef-9a6d-ba0fbdc44d64', '8a867e99-56bb-4ec0-a06f-0a5f8b6f500f',
  'be7a4e9b-4506-4b42-857f-90c78aba0533', '3631e2cb-0784-4d75-a94a-bcf11d863318',
];
export const STOCK_STATUS_OPTION_IDS = ['b1eb9284-5278-4b95-9bf5-4e4072b5fed2', 'e98d1829-43d1-4986-a0a9-5f41c2a0dfc5'];
export const STOCK_TYPE_OPTION_IDS = [
  'eae54f33-5bf5-4792-9f2b-052427ce5613', '2622ee21-4052-4ca6-ba08-463df6421a39',
  '1772d9cf-e6c6-4a6d-ba01-ba810934624d', '6edd2d1f-581a-4acc-a6fb-f2cc423acf75',
  '95a0c1c8-93d2-48be-8c06-02eb80f7980d', 'd4d8765e-1ba7-4a2a-a228-625b9cdfb050',
  'fa535612-6f85-415f-88e2-0d49f09edce8', '481f41dd-01ff-4729-b291-b77e83c930fa',
];
export const STOCK_BORROW_STATUS_OPTION_IDS = [
  '8123a4fa-be00-41c9-9b00-69dc0b517012', 'd55a6e86-36b2-4478-9bab-d304afdd697a',
  'a54c6a3e-2a33-4b6a-ac25-6539d57b6bcc', 'ef8c7fe1-0f99-4b46-8c96-68c8c4e22e57',
];

export const STOCK_ROUTE_FUNCTION_ID = '2ff897c2-ea13-4c03-9bde-fd030db13395';
export const STOCK_CSV_ROUTE_FUNCTION_ID = '17c42bce-e793-490c-8d5d-5af1cf5445ee';

export const STOCK_FRONT_COMPONENT_ID = 'c3e7ca50-20db-4f7f-8ace-9461f24485ee';
export const STOCK_PAGE_LAYOUT_ID = 'ac1c1d00-96f1-4060-ad6f-8e5e2b831864';
export const STOCK_TAB_ID = 'd0bc155c-9271-4f24-93de-8a55abe021a5';
export const STOCK_WIDGET_ID = '3c465e53-05b9-4160-9e8d-318b9347201c';
export const STOCK_NAV_ITEM_ID = '50771dff-97a1-4810-8d05-a52b411c52a9';

// Orders to suppliers (drafts we send; the supplier raises the real PO).
export const STOCK_ORDER_OBJECT_ID = '7d4afaa2-aa93-4814-8fc9-fd63264c0aa3';
export const STOCK_ORDER_NAME_FIELD_ID = '240c9d07-85a5-4155-b526-897a718ad0a5';
export const STOCK_ORDER_NUMBER_FIELD_ID = '240022c5-d886-489a-a2c6-006a04ac07b4';
export const STOCK_ORDER_SUPPLIER_FIELD_ID = '06240660-3ac5-47e1-ba35-6380b531baab';
export const STOCK_ORDER_DATE_FIELD_ID = '06476323-b403-4c12-83a6-873b60afd67d';
export const STOCK_ORDER_STATUS_FIELD_ID = '01c63ec1-e1da-42f4-abb1-89feedc31f32';
export const STOCK_ORDER_SUPPLIER_REF_FIELD_ID = 'fa2e6320-0d59-44ab-a329-13de3ece3c3c';
export const STOCK_ORDER_NOTES_FIELD_ID = '39eba8ea-67d9-4c6d-b7dd-8c22f8db2f12';
export const STOCK_ORDER_LINES_FIELD_ID = '0e76eb5b-78cf-4d4c-8406-3e9392abd20b';
export const STOCK_ORDER_OWNER_FIELD_ID = 'c94a1ff1-4fa0-4641-85e3-491b145355a4';
export const OWNER_STOCK_ORDERS_FIELD_ID = 'e97a9035-3c51-4eb7-ae2a-19b223f1e7a8';
export const STOCK_ORDER_STATUS_OPTION_IDS = [
  '14a80a47-5cc5-4af3-82c9-473d5d65f271', 'be80a9b9-53e2-4cf6-9223-9b4295959e0d', '32fba954-c27c-4765-aee0-45d29b90a8f6',
  '288231f8-0519-4eed-99bc-93c4f887c2e9', '4aaed22a-023a-4730-844c-753c0f2f1e3a',
];
// A purchase line received against an order.
export const STOCK_MOVEMENT_ORDER_ID_FIELD_ID = 'ff51e870-29d8-47e5-b6aa-623af32aa1ba';

// Month end: stock is locked up to and including this date (a closed month's last day).
export const OWNER_STOCK_LOCKED_THROUGH_FIELD_ID = '256cc06d-2b82-4d3c-9fb9-606476a3a0d9';

// Who saved a movement (the team member's name).
export const STOCK_MOVEMENT_RECORDED_BY_FIELD_ID = 'db197040-b9a1-4d11-92b9-90359b0fdcd3';

// Re-order rule: days a delivery takes to arrive.
export const OWNER_STOCK_LEAD_DAYS_FIELD_ID = '9a522971-3269-44bd-a296-bc2b84a1fae3';
