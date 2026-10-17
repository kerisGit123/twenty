import { defineRole } from 'twenty-sdk/define';

import { MEMBER_ROLE_ID } from 'src/constants/universal-identifiers-v3';
import { NO_ACCESS } from 'src/roles/staff-role';

// Twenty's own contact and activity tables are shared by everyone in the
// workspace, so a self-registered member must not open them either.
const STANDARD_NO_ACCESS = [
  '20202020-e674-48e5-a542-72570eee7213', // person
  '20202020-b374-4779-a561-80086cb2e17f', // company
  '20202020-9549-49dd-b2b2-883999db8938', // opportunity
  '20202020-0b00-45cd-b6f6-6cd806fc6804', // note
  '20202020-1ba1-48ba-bc83-ef7e5990ed10', // task
];

// The role for someone who signs up on their own through the invite link:
// no table of the workspace opens for them. Their Personal business works
// entirely through the app's pages, whose server routes only return the
// businesses they belong to.
export default defineRole({
  universalIdentifier: MEMBER_ROLE_ID,
  label: 'Member',
  description: 'Self-registered users: only their own Personal business, through the app pages.',
  icon: 'IconUser',
  canUpdateAllSettings: false,
  canAccessAllTools: false,
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  canBeAssignedToUsers: true,
  canBeAssignedToAgents: false,
  canBeAssignedToApiKeys: false,
  objectPermissions: [...NO_ACCESS, ...STANDARD_NO_ACCESS].map((objectUniversalIdentifier) => ({
    objectUniversalIdentifier,
    canReadObjectRecords: false,
    canUpdateObjectRecords: false,
    canSoftDeleteObjectRecords: false,
    canDestroyObjectRecords: false,
  })),
});
