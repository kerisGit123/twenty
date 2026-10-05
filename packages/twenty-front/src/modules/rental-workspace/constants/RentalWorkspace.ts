// Fork addition: the Rental app's "workspace" (Personal, Family, Company A...)
// shown in the sidebar and applied to its lists. The app's pages keep the
// selection in their front-component storage; the sidebar reads and writes
// the same entry so both stay in step.

export const RENTAL_APP_UNIVERSAL_IDENTIFIER =
  'f06b853e-4867-43df-b581-14d36ba8c1d1';

// Key the app's pages use (src/front-components/shared/owner-switcher.tsx).
export const RENTAL_WORKSPACE_STORAGE_KEY = 'rental.ownerScope';

// Fired on window when the selection changes (sidebar or app page).
export const RENTAL_WORKSPACE_CHANGED_EVENT = 'rental-workspace-changed';

// Fired only when the sidebar switcher changes it: open Rental pages restart.
export const RENTAL_WORKSPACE_SIDEBAR_SELECT_EVENT = 'rental-workspace-sidebar-select';

// Objects with an `owner` (workspace) relation: their sidebar links open
// filtered to the selected workspace.
export const RENTAL_WORKSPACE_SCOPED_OBJECTS = [
  'property',
  'rental',
  'rentPayment',
  'expense',
  'document',
];

export const RENTAL_WORKSPACE_FIELD_NAME = 'owner';
