import { defineApplicationRole, SystemPermissionFlag } from 'twenty-sdk/define';

import { DEFAULT_ROLE_UNIVERSAL_IDENTIFIER, PAYMENT_OBJECT_ID } from 'src/constants/universal-identifiers';
import { DOCUMENT_OBJECT_ID } from 'src/constants/universal-identifiers-v3';
import { CAMPAIGN_OBJECT_ID, SAVED_AUDIENCE_OBJECT_ID } from 'src/constants/universal-identifiers-v4';

// The role the app's logic functions run as: read records, update payments
// (receipt number, receipt file, sent date) and upload files. It never
// destroys anything; it can move to deleted (restorable) only documents,
// campaigns and payments (a waiver being undone, an unused draft) — and only
// when the person asking has access to that workspace.
const SOFT_DELETABLE = [DOCUMENT_OBJECT_ID, CAMPAIGN_OBJECT_ID, PAYMENT_OBJECT_ID, SAVED_AUDIENCE_OBJECT_ID];

export default defineApplicationRole({
  universalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  label: 'Rental default role',
  description: 'Rental default role',
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canAccessAllTools: false,
  canBeAssignedToAgents: false,
  permissionFlagUniversalIdentifiers: [SystemPermissionFlag.UPLOAD_FILE],
  objectPermissions: SOFT_DELETABLE.map((objectUniversalIdentifier) => ({
    objectUniversalIdentifier,
    canReadObjectRecords: true,
    canUpdateObjectRecords: true,
    canSoftDeleteObjectRecords: true,
    canDestroyObjectRecords: false,
  })),
});
