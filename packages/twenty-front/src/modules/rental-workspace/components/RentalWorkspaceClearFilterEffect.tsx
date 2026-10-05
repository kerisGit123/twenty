import { useEffect, useRef } from 'react';

import { currentRecordFiltersComponentState } from '@/object-record/record-filter/states/currentRecordFiltersComponentState';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import {
  RENTAL_WORKSPACE_FIELD_NAME,
  RENTAL_WORKSPACE_SCOPED_OBJECTS,
} from '@/rental-workspace/constants/RentalWorkspace';
import { useRentalWorkspace } from '@/rental-workspace/hooks/useRentalWorkspace';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';

// Fork: when the sidebar switches to "All workspaces", drop the workspace
// filter an open rental list got from its link. Picking a workspace is handled
// by the URL filter instead.
export const RentalWorkspaceClearFilterEffect = () => {
  const { objectMetadataItem, recordIndexId } = useRecordIndexContextOrThrow();
  const { available, selected } = useRentalWorkspace();
  const setCurrentRecordFilters = useSetAtomComponentState(
    currentRecordFiltersComponentState,
    recordIndexId,
  );
  const previousId = useRef<string | null | undefined>(undefined);

  const ownerFieldId = objectMetadataItem.fields.find(
    (field) => field.name === RENTAL_WORKSPACE_FIELD_NAME,
  )?.id;
  const isScoped = RENTAL_WORKSPACE_SCOPED_OBJECTS.includes(
    objectMetadataItem.nameSingular,
  );
  const selectedId = available ? (selected?.id ?? null) : undefined;

  useEffect(() => {
    const wasSelected =
      previousId.current !== undefined && previousId.current !== null;

    previousId.current = selectedId;

    if (!isScoped || !ownerFieldId || selectedId !== null || !wasSelected) {
      return;
    }

    setCurrentRecordFilters((filters) =>
      filters.filter((filter) => filter.fieldMetadataId !== ownerFieldId),
    );
  }, [selectedId, isScoped, ownerFieldId, setCurrentRecordFilters]);

  return null;
};
