// What a scanned receipt, invoice or bill gives back (POST /scan). Every field
// may be null: what could not be read clearly is left for the person to fill in.

export const SCAN_METHODS = ['CASH', 'CARD', 'EWALLET', 'DUITNOW', 'BANK_TRANSFER', 'OTHER'];

export type ReceiptScan = {
  isReceipt: boolean;
  merchant: string | null;
  date: string | null;
  total: number | null;
  currency: string | null;
  sst: number | null;
  receiptNo: string | null;
  method: string | null;
  category: string | null;
  description: string | null;
  unsure: string[];
  warning: string | null;
};

export type ScanResponse = {
  success: boolean;
  message?: string;
  scan?: ReceiptScan;
  // A short fingerprint of the file; kept in the expense's notes as "scan:<hash>".
  hash?: string;
  duplicate?: { id: string; name: string; date: string };
};
