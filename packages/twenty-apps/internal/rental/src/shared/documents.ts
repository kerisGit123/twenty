// Document types, the per-contract checklist, and upload limits — shared by
// the upload route and the pages.

export const DOC_TYPES = [
  { value: 'AGREEMENT', label: 'Agreement', icon: '📜' },
  { value: 'STAMP_DUTY', label: 'Stamp certificate', icon: '§' },
  { value: 'ID', label: 'Tenant IC / passport', icon: '🪪' },
  { value: 'HANDOVER', label: 'Inventory / condition', icon: '📋' },
  { value: 'MOVE_IN', label: 'Move-in photos', icon: '📷' },
  { value: 'MOVE_OUT', label: 'Move-out photos', icon: '📦' },
  { value: 'ADDENDUM', label: 'Addendum / letter', icon: '✉️' },
  { value: 'TITLE', label: 'Title / grant', icon: '🏛' },
  { value: 'LICENSE', label: 'License / permit', icon: '🪧' },
  { value: 'TAX', label: 'Tax / assessment', icon: '🧾' },
  { value: 'INSURANCE', label: 'Insurance', icon: '🛡' },
  { value: 'LOAN', label: 'Loan / bank', icon: '🏦' },
  { value: 'BILL', label: 'Bill / utilities', icon: '💡' },
  { value: 'OTHER', label: 'Other', icon: '📄' },
] as const;

export const docType = (value: string | null | undefined) => DOC_TYPES.find((t) => t.value === value) ?? DOC_TYPES[DOC_TYPES.length - 1];

// What a contract should have on file. Required ones show as missing.
export const CONTRACT_CHECKLIST: Array<{ type: string; required: boolean; carriesOver: boolean }> = [
  { type: 'AGREEMENT', required: true, carriesOver: false },
  { type: 'STAMP_DUTY', required: true, carriesOver: false },
  { type: 'ID', required: true, carriesOver: true },
  { type: 'HANDOVER', required: false, carriesOver: true },
  { type: 'MOVE_IN', required: false, carriesOver: true },
];

// Types offered when adding to a contract, in this order.
export const CONTRACT_DOC_TYPES = ['AGREEMENT', 'STAMP_DUTY', 'ID', 'HANDOVER', 'MOVE_IN', 'MOVE_OUT', 'ADDENDUM', 'OTHER'];

export type DocFile = { fileId: string; label: string; url: string; extension: string | null };

export type ContractDoc = {
  id: string;
  name: string;
  type: string;
  files: DocFile[];
  expiresOn: string | null;
  createdAt: string;
  rentalId: string | null; // the contract it's filed on (may be the previous one)
};

// Guess the type from a file name, e.g. "Perjanjian sewa.pdf" → Agreement.
export const guessDocType = (fileName: string, fallback = 'OTHER') => {
  const name = fileName.toLowerCase();

  if (/stamp|setem|duti|e-?duti|sijil/.test(name)) return 'STAMP_DUTY';
  if (/agreement|perjanjian|tenancy|sewa|contract|kontrak/.test(name)) return 'AGREEMENT';
  if (/\b(ic|mykad|passport|pasport|kad pengenalan|nric)\b/.test(name)) return 'ID';
  if (/inventory|condition|handover|inventori|checklist/.test(name)) return 'HANDOVER';
  if (/addendum|letter|surat/.test(name)) return 'ADDENDUM';
  if (/move.?out|keluar/.test(name)) return 'MOVE_OUT';

  return fallback;
};

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'doc', 'docx', 'xls', 'xlsx', 'txt'];

export const extensionOf = (fileName: string) => (fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '');

export const isImage = (extension: string | null | undefined) => ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes((extension ?? '').toLowerCase());

export const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
