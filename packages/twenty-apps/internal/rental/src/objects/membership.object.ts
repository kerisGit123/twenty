import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  MEMBERSHIP_ALL_WORKSPACES_FIELD_ID,
  MEMBERSHIP_EMAIL_FIELD_ID,
  MEMBERSHIP_NAME_FIELD_ID,
  MEMBERSHIP_OBJECT_ID,
} from 'src/constants/universal-identifiers-v3';

// Link table: which team members belong to which rental workspace (Family,
// Company A...). Managed from the workspace's Members tab. A membership with
// an email but no member yet is a pending invite.
export default defineObject({
  universalIdentifier: MEMBERSHIP_OBJECT_ID,
  nameSingular: 'membership',
  namePlural: 'memberships',
  labelSingular: 'Membership',
  labelPlural: 'Memberships',
  description: 'Links team members to rental workspaces',
  icon: 'IconUsersGroup',
  labelIdentifierFieldMetadataUniversalIdentifier: MEMBERSHIP_NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: MEMBERSHIP_NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Member name',
      icon: 'IconUser',
    },
    {
      universalIdentifier: MEMBERSHIP_EMAIL_FIELD_ID,
      type: FieldType.TEXT,
      name: 'email',
      label: 'Invited email',
      description: 'Set for invites; linked to the member when they join.',
      icon: 'IconMail',
      isNullable: true,
    },
    {
      universalIdentifier: MEMBERSHIP_ALL_WORKSPACES_FIELD_ID,
      type: FieldType.BOOLEAN,
      name: 'allWorkspaces',
      label: 'All workspaces',
      description: 'This person sees every rental workspace (admins).',
      icon: 'IconWorld',
      defaultValue: false,
    },
  ],
});
