// Stable identifiers for everything this app installs. Never change one after
// the app has been installed in a workspace — it is how Twenty recognises the
// same object/field across upgrades.

export const APPLICATION_UNIVERSAL_IDENTIFIER =
  'f06b853e-4867-43df-b581-14d36ba8c1d1';
export const DEFAULT_ROLE_UNIVERSAL_IDENTIFIER =
  'cd6f288a-3a44-4a18-ae78-26e1a82793ec';

// Property
export const PROPERTY_OBJECT_ID = '1e1fd4a4-bc2c-4fd4-ad7f-b9122b73c918';
export const PROPERTY_NAME_FIELD_ID = 'd0d6242b-205f-4422-afb0-22b4e1bad07d';
export const PROPERTY_ADDRESS_FIELD_ID = 'b532d13b-b66b-4b3d-8e1c-8ebbd581dcbc';
export const PROPERTY_MONTHLY_RENT_FIELD_ID =
  '3d301fc5-cdce-46e2-abd6-d1ba121910d2';
export const PROPERTY_DEPOSIT_FIELD_ID = '2d6d070c-827f-4e5b-a3e3-a2f186e5bc57';
export const PROPERTY_STATUS_FIELD_ID = '7e17f682-75d3-49f9-a227-794edd32b15c';
export const PROPERTY_STATUS_VACANT_OPTION_ID =
  '9cd36022-3ce6-43f9-8bbb-31d091d6c06b';
export const PROPERTY_STATUS_OCCUPIED_OPTION_ID =
  'e8d4c785-3000-417c-b355-b385b9bc2bd1';
export const PROPERTY_NOTES_FIELD_ID = 'bfcbb95f-41a3-4680-ad3a-37cb8b94f139';

// Payment
export const PAYMENT_OBJECT_ID = '6e483a08-5e34-4d5f-97e7-af1afc59e27d';
export const PAYMENT_RECEIPT_NUMBER_FIELD_ID =
  'e20c3110-6a72-44d9-80b4-f1e356b7116f';
export const PAYMENT_TYPE_FIELD_ID = '1bcc2edc-426d-4066-97bb-80120a498145';
export const PAYMENT_TYPE_RENT_OPTION_ID = '17de69ab-595b-463c-a593-907713b1073c';
export const PAYMENT_TYPE_DEPOSIT_OPTION_ID =
  '94af32f4-4806-4425-abd6-0f427e02ff9a';
export const PAYMENT_AMOUNT_FIELD_ID = 'fd3fb865-b53a-4ef0-ba80-b4bb5a90a2fd';
export const PAYMENT_PAID_ON_FIELD_ID = 'bab2ee5f-c894-4c8e-9247-5dfa2025830b';
export const PAYMENT_PERIOD_FIELD_ID = 'e11ea8f2-0276-4d00-b34c-9f164124b310';
export const PAYMENT_METHOD_FIELD_ID = '3491067e-1c1d-40c2-a04d-c8e17d8e8128';
export const PAYMENT_METHOD_CASH_OPTION_ID =
  '26a4a9b4-1af2-4d0c-9d7e-addc6d4bb998';
export const PAYMENT_METHOD_BANK_TRANSFER_OPTION_ID =
  '15002327-1fff-461c-bdbc-4098e557ca7f';
export const PAYMENT_METHOD_DUITNOW_OPTION_ID =
  '72e34922-45f8-4e4f-8ebf-c5bdcd137b6d';
export const PAYMENT_METHOD_CHEQUE_OPTION_ID =
  '465a9f40-44e0-413e-a8cc-9b76dec49458';
export const PAYMENT_METHOD_OTHER_OPTION_ID =
  'f469ac70-5e81-4baa-b906-c42f28720d25';
export const PAYMENT_NOTES_FIELD_ID = '61e916a0-1daf-4f91-bd64-501012186e53';
export const PAYMENT_RECEIPT_FILE_FIELD_ID =
  'e345f03b-3e0b-4eef-8ed5-6b78223fd0ea';
export const PAYMENT_RECEIPT_SENT_AT_FIELD_ID =
  'dee6be84-1115-47ac-8985-cdc66303b5e0';

// Relations (each relation has one field on each side)
export const PROPERTY_TENANT_FIELD_ID = '1519a898-86f2-4a22-b16d-6cc18509c99d';
export const PERSON_RENTED_PROPERTIES_FIELD_ID =
  'e447c87a-ecf6-43d9-ad06-9ef9b3cbd3aa';
export const PAYMENT_TENANT_FIELD_ID = 'c6439123-2a38-4227-a455-da1e644ad0b1';
export const PERSON_RENT_PAYMENTS_FIELD_ID =
  '4ebdb948-13d9-4443-a28a-4bf6a71d2d06';
export const PAYMENT_PROPERTY_FIELD_ID = '1aca99df-3cd7-4b30-8790-59b096badeb5';
export const PROPERTY_PAYMENTS_FIELD_ID = '0f6d15e0-0637-48ef-ba47-05ae9ad4cac3';

// Receipts
export const SEND_RECEIPT_ROUTE_ID = '0c23d9fe-eea4-45d2-a511-b47b7df3b9b3';
export const SEND_RECEIPT_FRONT_COMPONENT_ID =
  'e1c0effd-e011-42ca-ad89-9b165ccbd991';
export const SEND_RECEIPT_COMMAND_ID = '5687a25c-64c7-49b4-aa94-24b14b77eacd';
export const RESEND_API_KEY_VARIABLE_ID =
  '24107e78-30bd-4bfb-9650-f93af2d8cb3d';
export const RECEIPT_FROM_EMAIL_VARIABLE_ID =
  '8ae5ac45-ca21-497a-ad75-3f005f14b603';
export const RECEIPT_ISSUER_NAME_VARIABLE_ID =
  '669c37d6-9fd2-4b3a-869c-54473db3449b';

// Rental (one tenant renting one property for a period)
export const RENTAL_OBJECT_ID = '21bf44ad-10eb-4055-8008-37aee0ab471d';
export const RENTAL_NAME_FIELD_ID = '47d2860b-9576-4d52-a3e5-74456cc5be3f';
export const RENTAL_START_DATE_FIELD_ID = 'e9f6a314-8c17-4048-accf-47b3291114cd';
export const RENTAL_END_DATE_FIELD_ID = '56086b91-017b-42f7-b394-45eef297aab8';
export const RENTAL_MONTHLY_RENT_FIELD_ID = 'e5a5729f-a886-451c-a141-ae3b4295ca7b';
export const RENTAL_DEPOSIT_FIELD_ID = '705bec70-8910-4082-b2a5-f00e0a24760b';
export const RENTAL_DUE_DAY_FIELD_ID = '45ea80a7-1225-43b6-b787-a0495bf7e939';
export const RENTAL_STATUS_FIELD_ID = '2855a841-4d73-4121-aba7-120a2c482752';
export const RENTAL_STATUS_DRAFT_OPTION_ID = '73434a25-d500-4bed-b9a5-c29e9b98dd0b';
export const RENTAL_STATUS_ACTIVE_OPTION_ID = '7ce406c6-9598-48ec-b3fe-a1a1b5e446bd';
export const RENTAL_STATUS_ENDED_OPTION_ID = '76883647-5bed-47a6-a1e3-98cd6fb4e84f';
export const RENTAL_NOTES_FIELD_ID = '35f05a1a-4e9b-4a05-80d0-38cda3431e38';
export const RENTAL_PROPERTY_FIELD_ID = '93e142e7-e1c5-4eac-ab28-ef8461ef609e';
export const PROPERTY_RENTALS_FIELD_ID = 'c81f9ee4-8e07-44fb-987d-d44265e01f5f';
export const RENTAL_TENANT_FIELD_ID = 'dafc75c7-2d81-4426-9811-24f7f34abaa1';
export const PERSON_RENTALS_FIELD_ID = '48a1b967-3475-4a02-b7f2-9a0bfb8ee5ba';
export const PAYMENT_RENTAL_FIELD_ID = '3ddb2d36-bb00-4813-b545-87ef06c7d920';
export const RENTAL_PAYMENTS_FIELD_ID = '28f8f036-f3d8-40d3-a55f-31226987a7df';

// Payment status
export const PAYMENT_STATUS_FIELD_ID = 'f949c0bb-c1a3-426e-b2b0-eca4eb4dd087';
export const PAYMENT_STATUS_DRAFT_OPTION_ID = 'd4041cc6-b03c-4163-9fb0-dd2367f122ab';
export const PAYMENT_STATUS_ISSUED_OPTION_ID = '326f2795-9cb7-42c0-bce9-d3ce1aff4da7';
export const PAYMENT_STATUS_SENT_OPTION_ID = '458b1a27-798e-4d19-a888-f4abfa5da9e0';
export const PAYMENT_STATUS_VOID_OPTION_ID = '88f7b3d2-7917-4917-b3cf-4b9ea891e506';

// Automation + actions
export const ON_RENTAL_CREATED_FUNCTION_ID = 'bb54674b-12ee-4263-b842-20fe58da931d';
export const ON_RENTAL_UPDATED_FUNCTION_ID = '94a2cc15-7613-4f59-89fd-6f655401eba8';
export const ON_PAYMENT_CREATED_FUNCTION_ID = 'a49a1ca8-b8a0-4fc2-8b08-6453e4e36758';
export const ON_PAYMENT_UPDATED_FUNCTION_ID = '086c4227-656c-409a-ac32-acfd31124707';
export const CREATE_DUE_DRAFTS_CRON_ID = 'fc94e34b-c237-47f7-8a64-b53c3c667d8d';
export const RECORD_PAYMENT_ROUTE_ID = '0fe2f76c-3344-4785-ad0b-95189142b0ca';
export const RECORD_PAYMENT_FRONT_COMPONENT_ID = 'b9d3a41a-f82a-49be-8269-f0170888a122';
export const RECORD_PAYMENT_COMMAND_ID = 'a1a29771-a595-427f-9a35-c5832019a6f6';
export const PREVIEW_RECEIPT_ROUTE_ID = 'a51359b4-d47a-4df3-a5e2-3769fdca84f0';
export const PREVIEW_RECEIPT_FRONT_COMPONENT_ID = '1a0960fa-b232-40b3-afbe-4aa73b639bf8';
export const PREVIEW_RECEIPT_COMMAND_ID = 'effa6adb-dda5-46e6-8be5-2fec6ec3d726';
export const VOID_RECEIPT_ROUTE_ID = '827567e1-c733-42dd-856c-17e37483112b';
export const VOID_RECEIPT_FRONT_COMPONENT_ID = '70d8ec1d-0a13-444d-b421-351c560a8032';
export const VOID_RECEIPT_COMMAND_ID = '6fe7861e-46e9-4d80-a23e-15eb705ee5ab';
export const RENTALS_NAV_ITEM_ID = '7f6f3af1-decb-4b8e-8004-711a8ef45719';

// Navigation
export const PROPERTIES_NAV_ITEM_ID = 'b3b86ca7-07a7-4c1a-bf55-092c046f1515';
export const PAYMENTS_NAV_ITEM_ID = 'fd1f8f1b-c962-473d-a4d5-6dcfd5029cb4';
