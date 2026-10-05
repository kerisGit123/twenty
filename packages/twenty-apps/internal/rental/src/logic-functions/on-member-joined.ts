import {
  defineLogicFunction,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk/define';
import { type DatabaseEventBatchPayload } from 'twenty-sdk/logic-function';

import { appClient } from 'src/logic-functions/utils/app-client';
import { ON_MEMBER_JOINED_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';

// Someone accepted an invite: link the rental workspaces they were invited to
// (pending memberships with their email) to their new team-member record.
const handler = async (
  batch: DatabaseEventBatchPayload<ObjectRecordCreateEvent<{ id?: string | null }>>,
): Promise<void> => {
  const client = appClient();

  for (const event of batch.events) {
    const memberId = event.properties.after?.id ?? event.recordId;

    if (!memberId) continue;

    const { workspaceMembers } = await client.query({
      workspaceMembers: {
        __args: { filter: { id: { eq: memberId } }, first: 1 },
        edges: { node: { id: true, userEmail: true, name: { firstName: true, lastName: true } } },
      },
    });
    const member = workspaceMembers?.edges?.[0]?.node;
    const email = member?.userEmail?.trim().toLowerCase();

    if (!member || !email) continue;

    const { memberships } = await client.query({
      memberships: {
        __args: { filter: { email: { eq: email }, memberId: { is: 'NULL' } }, first: 50 },
        edges: { node: { id: true } },
      },
    });
    const name = [member.name?.firstName, member.name?.lastName].filter(Boolean).join(' ') || email;

    for (const { node } of memberships?.edges ?? []) {
      await client.mutation({
        updateMembership: { __args: { id: node.id, data: { memberId: member.id, name } }, id: true },
      });
    }
  }
};

export default defineLogicFunction({
  universalIdentifier: ON_MEMBER_JOINED_FUNCTION_ID,
  name: 'on-member-joined',
  description: 'Links pending rental-workspace invites to a new team member.',
  timeoutSeconds: 60,
  databaseEventTriggerSettings: {
    eventName: 'workspaceMember.created',
    batchMode: true,
  },
  handler,
});
