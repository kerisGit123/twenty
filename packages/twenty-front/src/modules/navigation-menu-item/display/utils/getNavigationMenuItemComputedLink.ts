import { getLinkNavigationMenuItemComputedLink } from '@/navigation-menu-item/display/link/utils/getLinkNavigationMenuItemComputedLink';
import { getObjectNavigationMenuItemComputedLink } from '@/navigation-menu-item/display/object/utils/getObjectNavigationMenuItemComputedLink';
import { getPageLayoutNavigationMenuItemComputedLink } from '@/navigation-menu-item/display/page-layout/utils/getPageLayoutNavigationMenuItemComputedLink';
import { getRecordNavigationMenuItemComputedLink } from '@/navigation-menu-item/display/record/utils/getRecordNavigationMenuItemComputedLink';
import { getViewNavigationMenuItemComputedLink } from '@/navigation-menu-item/display/view/utils/getViewNavigationMenuItemComputedLink';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { getSelectedRentalWorkspace } from '@/rental-workspace/states/rentalWorkspaceSelection';
import { appendRentalWorkspaceFilter } from '@/rental-workspace/utils/appendRentalWorkspaceFilter';
import { type View } from '@/views/types/View';
import { NavigationMenuItemType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { type NavigationMenuItem } from '~/generated-metadata/graphql';

// Fork: lists of Rental objects open filtered to the selected Rental workspace.
const withRentalWorkspace = (
  link: string,
  objectMetadataId: string | null | undefined,
  objectMetadataItems: EnrichedObjectMetadataItem[],
) => {
  const objectMetadataItem = objectMetadataItems.find((item) => item.id === objectMetadataId);

  return isDefined(objectMetadataItem)
    ? appendRentalWorkspaceFilter(link, objectMetadataItem.nameSingular, getSelectedRentalWorkspace())
    : link;
};

export const getNavigationMenuItemComputedLink = ({
  item,
  objectMetadataItems,
  views,
  lastVisitedViewPerObjectMetadataItem,
  isInitialObjectViewEnabled = false,
}: {
  item: NavigationMenuItem;
  objectMetadataItems: EnrichedObjectMetadataItem[];
  views: Pick<View, 'id' | 'objectMetadataId' | 'key' | 'type' | 'position'>[];
  lastVisitedViewPerObjectMetadataItem?: Record<string, string> | null;
  isInitialObjectViewEnabled?: boolean;
}): string => {
  switch (item.type) {
    case NavigationMenuItemType.OBJECT: {
      const lastVisitedViewId = isDefined(item.targetObjectMetadataId)
        ? lastVisitedViewPerObjectMetadataItem?.[item.targetObjectMetadataId]
        : undefined;

      return withRentalWorkspace(
        getObjectNavigationMenuItemComputedLink({
          item,
          objectMetadataItems,
          views,
          lastVisitedViewId,
          isInitialObjectViewEnabled,
        }),
        item.targetObjectMetadataId,
        objectMetadataItems,
      );
    }
    case NavigationMenuItemType.VIEW:
      return withRentalWorkspace(
        getViewNavigationMenuItemComputedLink(item, objectMetadataItems, views),
        views.find((view) => view.id === item.viewId)?.objectMetadataId,
        objectMetadataItems,
      );
    case NavigationMenuItemType.LINK:
      return getLinkNavigationMenuItemComputedLink(item);
    case NavigationMenuItemType.RECORD:
      return getRecordNavigationMenuItemComputedLink(item, objectMetadataItems);
    case NavigationMenuItemType.PAGE_LAYOUT:
      return getPageLayoutNavigationMenuItemComputedLink(item);
    default:
      return '';
  }
};
