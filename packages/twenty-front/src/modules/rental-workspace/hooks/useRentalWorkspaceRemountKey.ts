import { useEffect, useState } from 'react';

import { RENTAL_WORKSPACE_SIDEBAR_SELECT_EVENT } from '@/rental-workspace/constants/RentalWorkspace';

// Front components read their storage once, when they start. When the
// workspace is switched from the sidebar, a changing key restarts them so the
// Rental pages pick the new workspace up.
export const useRentalWorkspaceRemountKey = () => {
  const [key, setKey] = useState(0);

  useEffect(() => {
    const bump = () => setKey((value) => value + 1);

    window.addEventListener(RENTAL_WORKSPACE_SIDEBAR_SELECT_EVENT, bump);

    return () => window.removeEventListener(RENTAL_WORKSPACE_SIDEBAR_SELECT_EVENT, bump);
  }, []);

  return key;
};
