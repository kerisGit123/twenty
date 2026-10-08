// Shared by the PDF builder (server) and the on-screen receipt (Rent Ledger),
// so both always look and read the same.

export type ReceiptTemplate = 'CLASSIC' | 'MODERN' | 'COMPACT';
export type ReceiptAccent = 'TEAL' | 'NAVY' | 'GREEN' | 'MAROON' | 'BLACK';

export type ReceiptStyle = {
  template: ReceiptTemplate;
  accent: ReceiptAccent;
  businessDetails: string;
  footerText: string;
};

export const ACCENTS: Record<ReceiptAccent, { main: string; soft: string; grid: string }> = {
  TEAL: { main: '#1f7389', soft: '#e6f2f5', grid: '#b8ccd4' },
  NAVY: { main: '#1d3a6e', soft: '#e8edf6', grid: '#bcc7da' },
  GREEN: { main: '#2f6b3a', soft: '#e9f3eb', grid: '#bfd3c3' },
  MAROON: { main: '#7a2331', soft: '#f6e8ea', grid: '#d8bcc1' },
  BLACK: { main: '#26282c', soft: '#f0f0f1', grid: '#c4c6ca' },
};

export const DEFAULT_TEXT = {
  rentTitle: 'RENT RECEIPT',
  depositTitle: 'DEPOSIT RECEIPT',
  footerText: 'This is a computer-generated receipt.',
};

export const DEFAULT_STYLE: ReceiptStyle = {
  template: 'CLASSIC',
  accent: 'TEAL',
  businessDetails: '',
  footerText: DEFAULT_TEXT.footerText,
};

// Raw values as stored on the Receipt settings record.
export type ReceiptSettingsRecord = {
  id?: string;
  template?: string | null;
  accentColor?: string | null;
  businessName?: string | null;
  businessDetails?: string | null;
  rentTitle?: string | null;
  depositTitle?: string | null;
  receivedBy?: string | null;
  footerText?: string | null;
  paymentDetails?: string | null; // {pay_to} in rent reminders
  // Signed links to the uploaded images, if any (read-only).
  signatureUrl?: string | null;
  logoUrl?: string | null;
  paymentQrUrl?: string | null;
};

const clean = (value?: string | null) => (value ?? '').trim();

// What documents print from Receipt settings besides text: images and how to pay.
export const letterheadExtras = (settings?: ReceiptSettingsRecord | null) => ({
  signatureUrl: settings?.signatureUrl ?? null,
  logoUrl: settings?.logoUrl ?? null,
  paymentQrUrl: settings?.paymentQrUrl ?? null,
  paymentDetails: clean(settings?.paymentDetails) || null,
});

export const resolveStyle = (settings?: ReceiptSettingsRecord | null): ReceiptStyle => ({
  template: (['CLASSIC', 'MODERN', 'COMPACT'] as const).includes(settings?.template as ReceiptTemplate)
    ? (settings?.template as ReceiptTemplate)
    : 'CLASSIC',
  accent: (settings?.accentColor as ReceiptAccent) in ACCENTS ? (settings?.accentColor as ReceiptAccent) : 'TEAL',
  businessDetails: clean(settings?.businessDetails),
  footerText: clean(settings?.footerText) || DEFAULT_TEXT.footerText,
});

export const resolveTitle = (settings: ReceiptSettingsRecord | null | undefined, isDeposit: boolean) =>
  (isDeposit ? clean(settings?.depositTitle) : clean(settings?.rentTitle)) ||
  (isDeposit ? DEFAULT_TEXT.depositTitle : DEFAULT_TEXT.rentTitle);
