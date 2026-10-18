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
  { value: 'ADJUST_IN', label: 'Count: more on shelf', direction: 'IN', color: 'gray' },
  { value: 'ADJUST_OUT', label: 'Count: less on shelf', direction: 'OUT', color: 'gray' },
  // Loans between shops. BORROW (lent to a shop) is a loan going out, BORROW_IN
  // is stock borrowed from a shop; both stay open until settled. RETURN settles
  // a BORROW and GIVE_BACK a BORROW_IN with the same item; an exchange moves the
  // other item (EXCHANGE_IN / GIVE_BACK). LOAN_SETTLED is the note left on the
  // loan's own item by every exchange or cash settlement (quantity 0: no stock
  // moves) so each item's history shows what of its loans is still open.
  { value: 'BORROW_IN', label: 'Borrowed from shop', direction: 'IN', color: 'purple' },
  { value: 'GIVE_BACK', label: 'Given back to shop', direction: 'OUT', color: 'yellow' },
  { value: 'LOAN_SETTLED', label: 'Loan settled (no stock moved)', direction: 'OUT', color: 'yellow' },
];

// The two kinds of loan (the line that opens it).
export const LOAN_TYPES = ['BORROW', 'BORROW_IN'];
export const isLoan = (type: string) => LOAN_TYPES.includes(type);

// A lent item is settled by getting it back, getting something else, or being paid.
export const BORROW_STATUSES: Array<{ value: string; label: string; color: string }> = [
  { value: 'OUTSTANDING', label: 'Outstanding', color: 'orange' },
  { value: 'RETURNED', label: 'Returned', color: 'green' },
  { value: 'EXCHANGED', label: 'Exchanged', color: 'sky' },
  { value: 'PAID', label: 'Paid', color: 'blue' },
];

// Our order to a supplier. Draft and Sent are open; receiving moves it on.
export const ORDER_STATUSES: Array<{ value: string; label: string; color: string }> = [
  { value: 'DRAFT', label: 'Draft', color: 'gray' },
  { value: 'SENT', label: 'Sent to supplier', color: 'blue' },
  { value: 'PARTLY_RECEIVED', label: 'Partly received', color: 'orange' },
  { value: 'RECEIVED', label: 'Received', color: 'green' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'red' },
];

export const OPEN_ORDER_STATUSES = ['DRAFT', 'SENT', 'PARTLY_RECEIVED'];

export const movementType = (value: string) => STOCK_MOVEMENT_TYPES.find((t) => t.value === value);
export const isIn = (type: string) => movementType(type)?.direction === 'IN';
export const stockGroupLabel = (value: string | null | undefined) => STOCK_GROUPS.find((g) => g.value === value)?.label ?? 'Other';

// Defaults for the reorder rule (each workspace can change them).
export const DEFAULT_REORDER_BELOW_MONTHS = 2; // the WeDrink sheet's "x < 2"
export const DEFAULT_ORDER_UP_TO_MONTHS = 2.5;

// Why stock was thrown away. pick: the ones a person chooses; the rest are
// set by the system (a stock-take shortfall, a discontinued item written off).
export const WASTE_REASONS: Array<{ value: string; label: string; color: string; pick: boolean }> = [
  { value: 'EXPIRED', label: 'Expired', color: 'red', pick: true },
  { value: 'DAMAGED', label: 'Spilled / damaged', color: 'orange', pick: true },
  { value: 'STAFF_MEAL', label: 'Staff meal', color: 'blue', pick: true },
  { value: 'SAMPLE', label: 'Sample / promotion', color: 'purple', pick: true },
  { value: 'WRONG_ORDER', label: 'Wrong order / returned', color: 'yellow', pick: true },
  { value: 'OTHER', label: 'Other', color: 'gray', pick: true },
  { value: 'DISCONTINUED', label: 'Discontinued item', color: 'gray', pick: false },
  { value: 'COUNT', label: 'Count short', color: 'amber', pick: false },
  { value: 'LOST', label: 'Lost on the way to a branch', color: 'red', pick: false },
];

export const wasteReasonLabel = (value: string | null | undefined) => WASTE_REASONS.find((r) => r.value === value)?.label ?? '';

// A branch request: Requested (waiting for the warehouse), Issued (stock left
// the warehouse, the branch has not confirmed yet), Received, Short (the
// branch got less than was issued: to resolve) or Cancelled.
export const REQUEST_STATUSES: Array<{ value: string; label: string; color: string }> = [
  { value: 'REQUESTED', label: 'Requested', color: 'blue' },
  { value: 'ISSUED', label: 'Issued · to confirm', color: 'orange' },
  { value: 'RECEIVED', label: 'Received', color: 'green' },
  { value: 'SHORT', label: 'Short · to resolve', color: 'red' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'gray' },
];

export const OPEN_REQUEST_STATUSES = ['REQUESTED', 'ISSUED', 'SHORT'];
