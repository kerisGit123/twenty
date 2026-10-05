import { type Scope } from 'src/logic-functions/utils/scope';

// Everyone has their own Personal workspace. Yours shows as "Personal";
// someone else's (seen by admins) carries its host's name.
export const workspaceLabel = (
  owner: { id: string; name: string; type: string },
  scope: Scope,
  hostNames: string[],
) =>
  owner.type === 'PERSONAL' && !scope.hostIds.has(owner.id) && hostNames.length > 0
    ? `Personal · ${hostNames.join(', ')}`
    : owner.name;
