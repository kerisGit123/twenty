import { styled } from '@linaria/react';
import { Suspense, lazy } from 'react';

import { isDefined } from 'twenty-shared/utils';

import { FrontComponentSkeletonLoader } from '@/front-components/components/FrontComponentSkeletonLoader';
import { usePageLayoutContentContext } from '@/page-layout/contexts/PageLayoutContentContext';
import { useIsPageLayoutInEditMode } from '@/page-layout/hooks/useIsPageLayoutInEditMode';
import { type PageLayoutWidget } from '@/page-layout/types/PageLayoutWidget';
import { PageLayoutWidgetNoDataDisplay } from '@/page-layout/widgets/components/PageLayoutWidgetNoDataDisplay';
import { StyledWidgetContentFrame } from '@/page-layout/widgets/components/WidgetContentFrame';
import { isWidgetConfigurationOfType } from '@/side-panel/pages/page-layout/utils/isWidgetConfigurationOfType';
import { useRentalWorkspaceRemountKey } from '@/rental-workspace/hooks/useRentalWorkspaceRemountKey';
import { useLayoutRenderingContext } from '@/ui/layout/contexts/LayoutRenderingContext';

const StyledContainer = styled(StyledWidgetContentFrame)<{
  isInEditMode: boolean;
  isSoloLayout: boolean;
}>`
  height: var(--widget-height, 100%);
  overflow: var(
    --widget-scroll-overflow,
    ${({ isSoloLayout }) => (isSoloLayout ? 'visible' : 'auto')}
  );
  pointer-events: ${({ isInEditMode }) => (isInEditMode ? 'none' : 'auto')};
`;

const FrontComponentRenderer = lazy(() =>
  import('@/front-components/components/FrontComponentRenderer').then(
    (module) => ({ default: module.FrontComponentRenderer }),
  ),
);

type FrontComponentWidgetRendererProps = {
  widget: PageLayoutWidget;
};

export const FrontComponentWidgetRenderer = ({
  widget,
}: FrontComponentWidgetRendererProps) => {
  const isPageLayoutInEditMode = useIsPageLayoutInEditMode();
  const { presentation } = usePageLayoutContentContext();
  const { targetRecordIdentifier } = useLayoutRenderingContext();
  // Fork: restart when the Rental workspace is switched from the sidebar.
  const rentalWorkspaceKey = useRentalWorkspaceRemountKey();

  const configuration = widget.configuration;

  // Record-page widgets served from the metadata store carry configurationType
  // but no __typename, so accept either.
  const isFrontComponentConfiguration =
    isWidgetConfigurationOfType(configuration, 'FrontComponentConfiguration') ||
    (configuration as { configurationType?: string } | null | undefined)
      ?.configurationType === 'FRONT_COMPONENT';

  if (!isDefined(configuration) || !isFrontComponentConfiguration) {
    return <PageLayoutWidgetNoDataDisplay />;
  }

  const frontComponentId = (configuration as { frontComponentId: string })
    .frontComponentId;
  const selectedRecordIds = isDefined(targetRecordIdentifier?.id)
    ? [targetRecordIdentifier.id]
    : undefined;

  return (
    <StyledContainer
      isInEditMode={isPageLayoutInEditMode}
      isSoloLayout={presentation === 'solo'}
    >
      <Suspense fallback={<FrontComponentSkeletonLoader />}>
        <FrontComponentRenderer
          key={rentalWorkspaceKey}
          frontComponentId={frontComponentId}
          selectedRecordIds={selectedRecordIds}
          objectNameSingular={targetRecordIdentifier?.targetObjectNameSingular}
          loadingFallback={<FrontComponentSkeletonLoader />}
        />
      </Suspense>
    </StyledContainer>
  );
};
