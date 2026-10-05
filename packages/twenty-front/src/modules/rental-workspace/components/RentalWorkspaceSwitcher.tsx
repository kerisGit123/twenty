import { styled } from '@linaria/react';
import { useLocation, useNavigate } from 'react-router-dom';

import { navigationMenuItemsSelector } from '@/navigation-menu-item/common/states/navigationMenuItemsSelector';
import { useIsNavigationDrawerContentExpanded } from '@/navigation/hooks/useIsNavigationDrawerContentExpanded';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { RENTAL_WORKSPACE_SCOPED_OBJECTS } from '@/rental-workspace/constants/RentalWorkspace';
import { appendRentalWorkspaceFilter } from '@/rental-workspace/utils/appendRentalWorkspaceFilter';
import { useRentalWorkspace } from '@/rental-workspace/hooks/useRentalWorkspace';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { DropdownMenuSeparator } from '@/ui/layout/dropdown/components/DropdownMenuSeparator';
import { LegacyDropdownContent } from '@/ui/layout/dropdown/components/LegacyDropdownContent';
import { useCloseDropdown } from '@/ui/layout/dropdown/hooks/useCloseDropdown';
import { IconBriefcase, IconChevronDown, IconSettings } from 'twenty-ui/icon';
import { Avatar } from 'twenty-ui/primitives/data-display';
import { ListItem } from 'twenty-ui/primitives/navigation';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { AppPath } from 'twenty-shared/types';
import { getAppPath, isDefined } from 'twenty-shared/utils';
import { themeCssVariables, useTheme } from 'twenty-ui/theme';

const RENTAL_WORKSPACE_DROPDOWN_ID = 'rental-workspace-dropdown';

const StyledRow = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.medium};
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledTrigger = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  box-sizing: border-box;
  cursor: pointer;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  height: 32px;
  padding: 0 ${themeCssVariables.spacing[2]};
  width: 100%;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

const StyledText = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
`;

const StyledCaption = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xxs};
  line-height: 1.1;
`;

const StyledName = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.medium};
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RentalWorkspaceMenu = () => {
  const { workspaces, selected, select } = useRentalWorkspace();
  const { closeDropdown } = useCloseDropdown();
  const navigate = useNavigate();
  const location = useLocation();
  const { objectMetadataItems } = useObjectMetadataItems();
  const navigationMenuItems = useAtomStateValue(navigationMenuItemsSelector);
  // The Rental app's Workspaces page (cards, hosts, new workspace).
  const workspacesPageLayoutId = navigationMenuItems.find(
    (item) => item.name === 'Workspaces' && isDefined(item.pageLayoutId),
  )?.pageLayoutId;

  const pick = (workspaceId: string) => {
    select(workspaceId);
    closeDropdown(RENTAL_WORKSPACE_DROPDOWN_ID);

    // An open rental list is reopened with the new workspace filter.
    const listMatch = location.pathname.match(/^\/objects\/([^/]+)$/);
    const listObject = objectMetadataItems.find((item) => item.namePlural === listMatch?.[1]);

    if (listObject && RENTAL_WORKSPACE_SCOPED_OBJECTS.includes(listObject.nameSingular)) {
      const workspace = workspaces.find((item) => item.id === workspaceId) ?? null;

      navigate(appendRentalWorkspaceFilter(location.pathname, listObject.nameSingular, workspace));
    }
  };

  return (
    <LegacyDropdownContent>
      <DropdownMenuItemsContainer>
        <ListItem
          startIcon={<IconBriefcase size={16} />}
          onClick={() => pick('')}
          role="option"
          aria-selected={!selected}
          indicator="check"
          selected={!selected}
        >
          All workspaces
        </ListItem>
        {workspaces.map((workspace) => (
          <ListItem
            key={workspace.id}
            startIcon={<Avatar name={workspace.name} colorSeed={workspace.id} size="sm" shape="rounded-square" />}
            onClick={() => pick(workspace.id)}
            role="option"
            aria-selected={selected?.id === workspace.id}
            indicator="check"
            selected={selected?.id === workspace.id}
          >
            {workspace.name}
          </ListItem>
        ))}
      </DropdownMenuItemsContainer>
      <DropdownMenuSeparator />
      <DropdownMenuItemsContainer>
        <ListItem
          startIcon={<IconSettings size={16} />}
          onClick={() => {
            closeDropdown(RENTAL_WORKSPACE_DROPDOWN_ID);
            navigate(
              isDefined(workspacesPageLayoutId)
                ? getAppPath(AppPath.PageLayoutPage, { pageLayoutId: workspacesPageLayoutId })
                : '/objects/owners',
            );
          }}
        >
          Manage workspaces
        </ListItem>
      </DropdownMenuItemsContainer>
    </LegacyDropdownContent>
  );
};

// Sidebar row under the Twenty workspace header: which Rental workspace the
// rental pages and lists are showing.
export const RentalWorkspaceSwitcher = () => {
  const theme = useTheme();
  const isExpanded = useIsNavigationDrawerContentExpanded();
  const { available, selected } = useRentalWorkspace();

  if (!available || !isExpanded) return null;

  return (
    <StyledRow>
      <Dropdown
        dropdownId={RENTAL_WORKSPACE_DROPDOWN_ID}
        dropdownPlacement="bottom-start"
        clickableComponentWidth="100%"
        clickableComponent={
          <StyledTrigger data-testid="rental-workspace-switcher">
            {selected ? (
              <Avatar name={selected.name} colorSeed={selected.id} size="md" shape="rounded-square" />
            ) : (
              <IconBriefcase size={theme.icon.size.md} stroke={theme.icon.stroke.sm} />
            )}
            <StyledText>
              <StyledCaption>Workspace</StyledCaption>
              <StyledName>{selected?.name ?? 'All workspaces'}</StyledName>
            </StyledText>
            <IconChevronDown size={theme.icon.size.md} stroke={theme.icon.stroke.sm} />
          </StyledTrigger>
        }
        dropdownComponents={<RentalWorkspaceMenu />}
      />
    </StyledRow>
  );
};
