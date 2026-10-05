import { useCallback, useEffect, useMemo, useState } from 'react';

import { applicationsSelector } from '@/applications/states/applicationsSelector';
import { currentUserState } from '@/auth/states/currentUserState';
import {
  RENTAL_APP_UNIVERSAL_IDENTIFIER,
  RENTAL_WORKSPACE_CHANGED_EVENT,
  RENTAL_WORKSPACE_SIDEBAR_SELECT_EVENT,
  RENTAL_WORKSPACE_STORAGE_KEY,
} from '@/rental-workspace/constants/RentalWorkspace';
import { setSelectedRentalWorkspace } from '@/rental-workspace/states/rentalWorkspaceSelection';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { isDefined } from 'twenty-shared/utils';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

export type RentalWorkspace = { id: string; name: string; type: string };

type ScopeResponse = { success?: boolean; all?: boolean; owners?: RentalWorkspace[] };

// One request per page load; the list rarely changes.
let workspacesRequest: Promise<RentalWorkspace[] | null> | null = null;

const loadWorkspaces = () => {
  workspacesRequest ??= fetch(`${REACT_APP_SERVER_BASE_URL}/s/scope`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
    .then(async (response) =>
      response.ok
        ? // Personal first, then by name.
          ((((await response.json()) as ScopeResponse).owners ?? []).sort((a, b) =>
            (a.type === 'PERSONAL') !== (b.type === 'PERSONAL')
              ? a.type === 'PERSONAL'
                ? -1
                : 1
              : a.name.localeCompare(b.name),
          ) as RentalWorkspace[])
        : null,
    )
    .catch(() => null);

  return workspacesRequest;
};

export const refreshRentalWorkspaces = () => {
  workspacesRequest = null;
};

const readSelection = (storageKey: string | null) => {
  if (!isDefined(storageKey)) return '';
  try {
    return window.localStorage.getItem(storageKey) ?? '';
  } catch {
    return '';
  }
};

// The Rental app's selected workspace ('' = all) and the ones this person may
// pick. `available` is false when the Rental app isn't installed.
export const useRentalWorkspace = () => {
  const applications = useAtomStateValue(applicationsSelector);
  const currentUser = useAtomStateValue(currentUserState);
  const rentalApp = applications.find(
    (application) =>
      application.universalIdentifier === RENTAL_APP_UNIVERSAL_IDENTIFIER,
  );

  const storageKey =
    isDefined(rentalApp) && isDefined(currentUser)
      ? `frontComponentStorage:${rentalApp.id}:${currentUser.id}:${RENTAL_WORKSPACE_STORAGE_KEY}`
      : null;

  const [selectedId, setSelectedId] = useState(() => readSelection(storageKey));
  const [workspaces, setWorkspaces] = useState<RentalWorkspace[] | null>(null);

  useEffect(() => {
    setSelectedId(readSelection(storageKey));

    const refresh = () => setSelectedId(readSelection(storageKey));

    window.addEventListener(RENTAL_WORKSPACE_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);

    return () => {
      window.removeEventListener(RENTAL_WORKSPACE_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [storageKey]);

  useEffect(() => {
    if (!isDefined(rentalApp)) return;
    let cancelled = false;

    loadWorkspaces().then((list) => {
      if (!cancelled) setWorkspaces(list);
    });

    return () => {
      cancelled = true;
    };
  }, [rentalApp]);

  const select = useCallback(
    (workspaceId: string) => {
      if (!isDefined(storageKey)) return;
      try {
        if (workspaceId) window.localStorage.setItem(storageKey, workspaceId);
        else window.localStorage.removeItem(storageKey);
      } catch {
        // Storage can be unavailable; nothing else to do.
      }
      window.dispatchEvent(new Event(RENTAL_WORKSPACE_CHANGED_EVENT));
      window.dispatchEvent(new Event(RENTAL_WORKSPACE_SIDEBAR_SELECT_EVENT));
    },
    [storageKey],
  );

  const selected = useMemo(
    () => workspaces?.find((workspace) => workspace.id === selectedId) ?? null,
    [workspaces, selectedId],
  );

  // Updated during render so links drawn in this same render already use it.
  if (workspaces !== null) setSelectedRentalWorkspace(selected);

  return {
    available: isDefined(rentalApp) && workspaces !== null,
    workspaces: workspaces ?? [],
    selected,
    select,
  };
};
