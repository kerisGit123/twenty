import { type ReceiptFacts } from 'src/shared/doc-template/context';
import { type StatementSource } from 'src/shared/year-statement';

// Made-up data for previewing templates in the editor.

export type Letterhead = {
  name: string;
  details: string;
  accent: string;
  receivedBy: string;
  footer: string;
  rentTitle: string;
  depositTitle: string;
  signatureUrl?: string | null;
};

export const sampleReceipt = (letterhead: Letterhead, deposit: boolean, withNotes: boolean): ReceiptFacts => ({
  businessName: letterhead.name || 'Your Name',
  businessDetails: letterhead.details || 'No. 1, Jalan Contoh, 88000 Kota Kinabalu, Sabah',
  footerText: letterhead.footer || 'This is a computer-generated receipt.',
  titleRent: letterhead.rentTitle || 'RENT RECEIPT',
  titleDeposit: letterhead.depositTitle || 'DEPOSIT RECEIPT',
  receiptNumber: 'RCP-2026-0007',
  dateIso: '2026-03-02',
  paidOnIso: '2026-03-01',
  tenantName: 'Faranita Anna Riyana',
  amount: deposit ? 4200 : 2100,
  propertyName: 'Lot 3, Block A (front half)',
  propertyAddress: 'Jalan Kampung Air 5, 88000 Kota Kinabalu',
  periodMonth: deposit ? null : '2026-03-01',
  depositKind: deposit ? 'DEPOSIT' : null,
  method: 'CASH',
  receivedBy: letterhead.receivedBy || letterhead.name || 'Your Name',
  notes: withNotes ? 'Paid in full.' : '',
  accent: letterhead.accent || 'TEAL',
  watermark: null,
});

export const sampleStatement = (letterhead: Letterhead, withArrears: boolean): StatementSource => ({
  year: 2025,
  today: '2026-01-08',
  landlordName: letterhead.name || 'Your Name',
  landlordDetails: letterhead.details || 'No. 1-2, Ground Floor, Blok A\nPh 1a, Asia City,\n88000, Kota Kinabalu,\nSabah.',
  rental: {
    propertyType: 'SHOP',
    startDate: '2025-01-01',
    endDate: null,
    stampedOn: '2024-10-15',
    tenantName: 'The Rising Startrading',
    tenantDetails: 'THE RISING STARTRADING\n202303309610\n(JM0996289-T)\nNO. 2286 Kampar,\nPerak.',
    statementNote: '',
  },
  payments: Array.from({ length: withArrears ? 9 : 12 }, (_, index) => ({
    month: `2025-${String(index + 1).padStart(2, '0')}`,
    amount: 2200,
    fromDeposit: index === 9, // October came out of the deposit
  })),
});
