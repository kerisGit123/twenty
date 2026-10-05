import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  ACTIVITY_CAMPAIGN_ID_FIELD_ID,
  ACTIVITY_DONE_FIELD_ID,
  ACTIVITY_FOLLOW_UP_ON_FIELD_ID,
  ACTIVITY_KIND_FIELD_ID,
  ACTIVITY_KIND_OPTION_IDS,
  ACTIVITY_NAME_FIELD_ID,
  ACTIVITY_NOTE_FIELD_ID,
  CONTACT_ACTIVITY_OBJECT_ID,
} from 'src/constants/universal-identifiers-v4';
import { ACTIVITY_KINDS } from 'src/shared/contacts';

// What happened on WhatsApp with a person that the app can't see by itself:
// they replied, were interested, asked to stop… plus notes and follow-ups.
export default defineObject({
  universalIdentifier: CONTACT_ACTIVITY_OBJECT_ID,
  nameSingular: 'contactActivity',
  namePlural: 'contactActivities',
  labelSingular: 'WhatsApp log',
  labelPlural: 'WhatsApp log',
  description: 'Replies, notes and follow-ups for WhatsApp contacts',
  icon: 'IconBrandWhatsapp',
  labelIdentifierFieldMetadataUniversalIdentifier: ACTIVITY_NAME_FIELD_ID,
  fields: [
    { universalIdentifier: ACTIVITY_NAME_FIELD_ID, type: FieldType.TEXT, name: 'name', label: 'What', icon: 'IconAbc' },
    {
      universalIdentifier: ACTIVITY_KIND_FIELD_ID,
      type: FieldType.SELECT,
      name: 'kind',
      label: 'Kind',
      icon: 'IconCategory',
      defaultValue: "'NOTE'",
      options: ACTIVITY_KINDS.map((k, index) => ({ id: ACTIVITY_KIND_OPTION_IDS[index], value: k.value, label: k.label, position: index, color: k.color as 'gray' })),
    },
    { universalIdentifier: ACTIVITY_NOTE_FIELD_ID, type: FieldType.TEXT, name: 'note', label: 'Note', icon: 'IconNotes', isNullable: true },
    {
      universalIdentifier: ACTIVITY_FOLLOW_UP_ON_FIELD_ID,
      type: FieldType.DATE,
      name: 'followUpOn',
      label: 'Follow up on',
      description: 'Shows on Today from this day until marked done.',
      icon: 'IconCalendarDue',
      isNullable: true,
    },
    { universalIdentifier: ACTIVITY_DONE_FIELD_ID, type: FieldType.BOOLEAN, name: 'done', label: 'Done', icon: 'IconCheck', defaultValue: false },
    {
      universalIdentifier: ACTIVITY_CAMPAIGN_ID_FIELD_ID,
      type: FieldType.TEXT,
      name: 'campaignId',
      label: 'Campaign',
      description: 'The campaign this was a reply to, if any.',
      icon: 'IconSpeakerphone',
      isNullable: true,
    },
  ],
});
