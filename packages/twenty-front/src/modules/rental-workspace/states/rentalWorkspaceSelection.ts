import { type RentalWorkspace } from '@/rental-workspace/hooks/useRentalWorkspace';

// Latest selected Rental workspace, readable from plain functions such as the
// sidebar's link builder (kept current by useRentalWorkspace).
let selectedRentalWorkspace: RentalWorkspace | null = null;

export const getSelectedRentalWorkspace = () => selectedRentalWorkspace;

export const setSelectedRentalWorkspace = (workspace: RentalWorkspace | null) => {
  selectedRentalWorkspace = workspace;
};
