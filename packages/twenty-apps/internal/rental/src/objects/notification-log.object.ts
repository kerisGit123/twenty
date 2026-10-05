import { defineObject, FieldType } from 'twenty-sdk/define';

import { NOTIFICATION_LOG_OBJECT_ID } from 'src/constants/universal-identifiers-v3';

// Every WhatsApp the assistant sent (or tried to): what, to whom, and whether
// it went. dedupKey stops the same reminder going out twice.
export default defineObject({
  universalIdentifier: NOTIFICATION_LOG_OBJECT_ID,
  nameSingular: 'notificationLog',
  namePlural: 'notificationLogs',
  labelSingular: 'Notification',
  labelPlural: 'Notification log',
  description: 'WhatsApp messages sent by the assistant',
  icon: 'IconMessageCheck',
  labelIdentifierFieldMetadataUniversalIdentifier: 'cfc6dbbc-9993-451b-9f17-fa646e948de2',
  fields: [
    { universalIdentifier: 'cfc6dbbc-9993-451b-9f17-fa646e948de2', type: FieldType.TEXT, name: 'name', label: 'What', icon: 'IconAbc' },
    {
      universalIdentifier: 'd8fdb9dd-c0ed-42c4-84cc-0f84098b1409',
      type: FieldType.SELECT,
      name: 'kind',
      label: 'Kind',
      icon: 'IconCategory',
      defaultValue: "'SUMMARY'",
      options: [
        { id: '640852c0-cdef-494e-9206-395d12cdee3c', value: 'SUMMARY', label: 'Morning summary', position: 0, color: 'blue' },
        { id: '552c7e83-2f1f-46b4-b33e-704fcfa49590', value: 'RENT_UPCOMING', label: 'Rent coming up', position: 1, color: 'sky' },
        { id: 'f3a58e7b-9893-4442-9b5e-0665701038c6', value: 'RENT_DUE', label: 'Rent due today', position: 2, color: 'orange' },
        { id: '04ca7f8d-878f-4cdd-98f2-c2980d22e4fc', value: 'RENT_OVERDUE', label: 'Rent overdue', position: 3, color: 'red' },
        { id: '2190452f-0c12-4f02-9715-6ff18855dce4', value: 'TEST', label: 'Test', position: 4, color: 'gray' },
      ],
    },
    { universalIdentifier: 'f5ae4164-854c-4f36-b7cd-ef1fc7ef48fc', type: FieldType.TEXT, name: 'recipient', label: 'To', icon: 'IconPhone', isNullable: true },
    { universalIdentifier: '6c34b789-d8dc-415b-b132-07905ac2e725', type: FieldType.TEXT, name: 'body', label: 'Message', icon: 'IconMessage', isNullable: true },
    {
      universalIdentifier: '2f133fe2-83dc-40e1-8f37-815a12e5e607',
      type: FieldType.SELECT,
      name: 'status',
      label: 'Status',
      icon: 'IconCircleCheck',
      defaultValue: "'SENT'",
      options: [
        { id: '7075c22a-1a9a-44f2-95c0-703fe98b3122', value: 'SENT', label: 'Sent', position: 0, color: 'green' },
        { id: '7f62684e-3313-4d65-a50f-02796237c742', value: 'FAILED', label: 'Failed', position: 1, color: 'red' },
        { id: '2ab90a5e-80e0-4585-83fd-5956fb7851f7', value: 'SKIPPED', label: 'Not sent', position: 2, color: 'gray' },
      ],
    },
    { universalIdentifier: '80b93cd7-23cc-4edc-9278-d00966fcdeee', type: FieldType.TEXT, name: 'error', label: 'Problem', icon: 'IconAlertCircle', isNullable: true },
    { universalIdentifier: '5ede784b-6a4d-4948-b613-ded21db1d98f', type: FieldType.TEXT, name: 'dedupKey', label: 'Key', icon: 'IconKey', isNullable: true },
  ],
});
