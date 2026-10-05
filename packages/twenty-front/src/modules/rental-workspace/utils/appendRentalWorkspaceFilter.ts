import qs from 'qs';
import { ViewFilterOperand } from 'twenty-shared/types';

import {
  RENTAL_WORKSPACE_FIELD_NAME,
  RENTAL_WORKSPACE_SCOPED_OBJECTS,
} from '@/rental-workspace/constants/RentalWorkspace';
import { type RentalWorkspace } from '@/rental-workspace/hooks/useRentalWorkspace';

// Opens a rental list already filtered to the selected workspace, using the
// record index's URL filters (?filter[owner][IS][0]=<id>).
export const appendRentalWorkspaceFilter = (
  path: string,
  objectNameSingular: string,
  workspace: RentalWorkspace | null,
) => {
  if (
    !workspace ||
    !RENTAL_WORKSPACE_SCOPED_OBJECTS.includes(objectNameSingular) ||
    path.includes(`filter%5B${RENTAL_WORKSPACE_FIELD_NAME}%5D`)
  ) {
    return path;
  }

  const query = qs.stringify({
    filter: { [RENTAL_WORKSPACE_FIELD_NAME]: { [ViewFilterOperand.IS]: [workspace.id] } },
    filterDisplayValue: { [RENTAL_WORKSPACE_FIELD_NAME]: { [ViewFilterOperand.IS]: workspace.name } },
  });

  return `${path}${path.includes('?') ? '&' : '?'}${query}`;
};
