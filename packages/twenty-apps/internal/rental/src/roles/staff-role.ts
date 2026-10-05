import { defineRole } from 'twenty-sdk/define';

import { PAYMENT_OBJECT_ID, PROPERTY_OBJECT_ID, RENTAL_OBJECT_ID } from 'src/constants/universal-identifiers';
import { EXPENSE_OBJECT_ID, OWNER_OBJECT_ID } from 'src/constants/universal-identifiers-v2';
import {
  DOCUMENT_OBJECT_ID,
  MEMBERSHIP_OBJECT_ID,
  NOTIFICATION_LOG_OBJECT_ID,
  NOTIFICATION_SETTING_OBJECT_ID,
  STAFF_ROLE_ID,
} from 'src/constants/universal-identifiers-v3';
import { CAMPAIGN_OBJECT_ID } from 'src/constants/universal-identifiers-v4';
import { DOCUMENT_TEMPLATE_OBJECT_ID } from 'src/objects/document-template.object';
import { RECEIPT_SETTING_OBJECT_ID } from 'src/objects/receipt-setting.object';

// Role for staff who should only see their own rental workspaces. They can't
// open the rental tables at all; the Today, Rent Ledger and Expenses pages
// fetch through the app's server routes, which return only the workspaces the
// person is a member of. People and companies stay usable.
const NO_ACCESS = [
  PROPERTY_OBJECT_ID,
  RENTAL_OBJECT_ID,
  PAYMENT_OBJECT_ID,
  EXPENSE_OBJECT_ID,
  DOCUMENT_OBJECT_ID,
  OWNER_OBJECT_ID,
  MEMBERSHIP_OBJECT_ID,
  RECEIPT_SETTING_OBJECT_ID,
  DOCUMENT_TEMPLATE_OBJECT_ID,
  NOTIFICATION_SETTING_OBJECT_ID,
  NOTIFICATION_LOG_OBJECT_ID,
  CAMPAIGN_OBJECT_ID,
];

export default defineRole({
  universalIdentifier: STAFF_ROLE_ID,
  label: 'Staff',
  description: 'Works only in their rental workspaces, through the Today, Rent Ledger and Expenses pages.',
  icon: 'IconUserShield',
  canUpdateAllSettings: false,
  canAccessAllTools: false,
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canBeAssignedToUsers: true,
  canBeAssignedToAgents: false,
  canBeAssignedToApiKeys: false,
  objectPermissions: NO_ACCESS.map((objectUniversalIdentifier) => ({
    objectUniversalIdentifier,
    canReadObjectRecords: false,
    canUpdateObjectRecords: false,
    canSoftDeleteObjectRecords: false,
    canDestroyObjectRecords: false,
  })),
});
