// The F&B stock module's vocabulary. Order matters in each list: options keep
// their ids by position, so only add new entries at the end.

export const STOCK_GROUPS: Array<{ value: string; label: string; color: string }> = [
  { value: 'RAW', label: 'Raw materials 原料', color: 'orange' },
  { value: 'PACKAGING', label: 'Packaging 包材', color: 'blue' },
  { value: 'OTHER', label: 'Other materials 其他', color: 'gray' },
  { value: 'MERCH', label: 'Merchandise / uniform', color: 'purple' },
];

export const STOCK_STATUSES: Array<{ value: string; label: string; color: string }> = [
  { value: 'ACTIVE', label: 'Active', color: 'green' },
  { value: 'DISCONTINUED', label: 'Discontinued', color: 'gray' },
];

// IN adds to the stock at the warehouse, OUT takes from it.
export const STOCK_MOVEMENT_TYPES: Array<{ value: string; label: string; direction: 'IN' | 'OUT'; color: string }> = [
  { value: 'PURCHASE', label: 'Purchase', direction: 'IN', color: 'green' },
  { value: 'TAKE', label: 'Taken out', direction: 'OUT', color: 'blue' },
  { value: 'BORROW', label: 'Lent to branch', direction: 'OUT', color: 'orange' },
  { value: 'RETURN', label: 'Borrow returned', direction: 'IN', color: 'turquoise' },
  { value: 'EXCHANGE_IN', label: 'Exchange received', direction: 'IN', color: 'sky' },
  { value: 'WASTE', label: 'Waste / expired', direction: 'OUT', color: 'red' },
  { value: 'ADJUST_IN', label: 'Stock take: more', direction: 'IN', color: 'gray' },
  { value: 'ADJUST_OUT', label: 'Stock take: less', direction: 'OUT', color: 'gray' },
];

// A lent item is settled by getting it back, getting something else, or being paid.
export const BORROW_STATUSES: Array<{ value: string; label: string; color: string }> = [
  { value: 'OUTSTANDING', label: 'Outstanding', color: 'orange' },
  { value: 'RETURNED', label: 'Returned', color: 'green' },
  { value: 'EXCHANGED', label: 'Exchanged', color: 'sky' },
  { value: 'PAID', label: 'Paid', color: 'blue' },
];

export const movementType = (value: string) => STOCK_MOVEMENT_TYPES.find((t) => t.value === value);
export const isIn = (type: string) => movementType(type)?.direction === 'IN';
export const stockGroupLabel = (value: string | null | undefined) => STOCK_GROUPS.find((g) => g.value === value)?.label ?? 'Other';

// Defaults for the reorder rule (each workspace can change them).
export const DEFAULT_REORDER_BELOW_MONTHS = 1.5;
export const DEFAULT_ORDER_UP_TO_MONTHS = 2.5;
