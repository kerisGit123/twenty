import { useEffect, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';

// Workspace scope for the rental pages. A rental "workspace" (Family,
// Company A...) is the owner column on properties, payments, expenses and
// documents. The server decides which ones the signed-in person may see (all
// for admins, their memberships for everyone else) and only sends those. Which
// one a page shows is picked in the Workspace picker at the top of the left
// sidebar; both read the same remembered choice (rental.ownerScope).

export type Owner = { id: string; name: string; type: string };

const STORAGE_KEY = 'rental.ownerScope';
const ALL = '';

const readStored = (): string => {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? ALL;
  } catch {
    return ALL;
  }
};

const writeStored = (value: string) => {
  try {
    if (value) globalThis.localStorage?.setItem(STORAGE_KEY, value);
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable; the switch still works for this page.
  }
};

// Lets other components (e.g. a workspace page) pick the workspace before
// opening a rental page.
export const rememberOwnerScope = (ownerId: string) => writeStored(ownerId);

// ownerId is '' for All. matches() says whether a record's workspace is the
// picked one (the server has already removed workspaces the person can't see).
export const useOwnerScope = () => {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [all, setAll] = useState(true);
  const [ownerId, setOwnerIdState] = useState<string>(readStored);

  useEffect(() => {
    new RestApiClient()
      .post<{ success: boolean; all: boolean; owners: Owner[] }>('/s/scope', {})
      .then((result) => {
        const list = result.owners ?? [];

        setOwners(list);
        setAll(Boolean(result.all));
        // A remembered workspace that is gone (or no longer allowed) falls back to All.
        // A person with a single workspace starts on it, not on "All". The fix is
        // saved, so the left sidebar picker shows the same workspace as the page.
        setOwnerIdState((current) => {
          const next =
            current && !list.some((o) => o.id === current) ? (list.length === 1 ? list[0].id : ALL) : !current && list.length === 1 ? list[0].id : current;

          if (next !== current) writeStored(next);

          return next;
        });
      })
      .catch(() => setOwners([]));
  }, []);

  const setOwnerId = (value: string) => {
    setOwnerIdState(value);
    writeStored(value);
  };

  return {
    owners,
    ownerId,
    setOwnerId,
    owner: owners.find((o) => o.id === ownerId) ?? null,
    restricted: !all,
    // Changes whenever what's in scope changes; use it as a memo dependency.
    key: `${ownerId}|${all ? '*' : owners.map((o) => o.id).join(',')}`,
    matches: (recordOwnerId: string | null | undefined) => !ownerId || recordOwnerId === ownerId,
  };
};
