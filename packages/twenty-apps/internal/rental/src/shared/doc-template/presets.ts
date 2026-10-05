import { type Block, type TemplateDoc, type TemplateKind, type TemplateLanguage } from 'src/shared/doc-template/types';

// Sample templates, in English (the default) and Malay. A new template
// starts as a copy of one of these.

const text = (id: string, value: string, extra: Partial<Extract<Block, { type: 'text' }>> = {}): Block => ({
  id,
  type: 'text',
  text: value,
  align: 'left',
  size: 'md',
  bold: false,
  muted: false,
  prefix: '',
  ...extra,
});

const receipt = (language: TemplateLanguage): TemplateDoc => {
  const ms = language === 'MS';

  return {
    kind: 'RECEIPT',
    language,
    blocks: [
      ms
        ? { id: 'r-band-rent', type: 'band', text: 'RESIT SEWA', align: 'center', showIf: 'rent' }
        : { id: 'r-band', type: 'band', text: '{{receipt.title}}', align: 'center' },
      ...(ms ? [{ id: 'r-band-dep', type: 'band', text: 'RESIT DEPOSIT', align: 'center', showIf: 'deposit' } as Block] : []),
      { id: 'r-head', type: 'letterhead', rightText: 'No. {{receipt.number}}', showDetails: true },
      {
        id: 'r-main',
        type: 'fields',
        layout: 'grid',
        columns: 2,
        rows: [
          { label: ms ? 'Diterima daripada' : 'Received from', value: '{{tenant.name}}' },
          { label: ms ? 'Tarikh' : 'Date', value: '{{receipt.date}}' },
          { label: ms ? 'Jumlah' : 'Amount', value: '{{amount}}' },
          { label: ms ? 'Dibayar pada' : 'Paid on', value: '{{paid.on}}' },
        ],
      },
      {
        id: 'r-sum',
        type: 'fields',
        layout: 'grid',
        columns: 1,
        rows: [
          { label: ms ? 'Sebanyak' : 'The sum of', value: '{{amount.words}}' },
          { label: ms ? 'Sewa di' : 'For rent at', value: '{{property}}' },
        ],
      },
      {
        id: 'r-period',
        type: 'fields',
        layout: 'grid',
        columns: 2,
        showIf: 'rent',
        rows: [
          { label: ms ? 'Tempoh dari' : 'Period from', value: '{{period.from}}' },
          { label: ms ? 'Hingga' : 'To', value: '{{period.to}}' },
        ],
      },
      {
        id: 'r-purpose',
        type: 'fields',
        layout: 'grid',
        columns: 1,
        showIf: 'deposit',
        rows: [{ label: ms ? 'Bayaran untuk' : 'Being payment of', value: '{{purpose}}' }],
      },
      { id: 'r-methods', type: 'methods', label: ms ? 'Kaedah bayaran' : 'Paid by' },
      text('r-notes', `${ms ? 'Catatan' : 'Notes'}: {{notes}}`, { size: 'sm', showIf: 'hasNotes' }),
      { id: 'r-space', type: 'spacer', size: 'md' },
      {
        id: 'r-sign',
        type: 'signature',
        leftLabel: ms ? 'Diterima oleh' : 'Received by',
        leftName: '{{received.by}}',
        rightLabel: '',
        rightName: '',
        showRight: false,
      },
      text('r-footer', '{{footer}}', { size: 'sm', muted: true }),
    ],
  };
};

const statement = (language: TemplateLanguage): TemplateDoc => {
  const ms = language === 'MS';

  return {
    kind: 'STATEMENT',
    language,
    blocks: [
      text('s-from', '{{landlord.name}}', { bold: true }),
      text('s-from-addr', '{{landlord.details}}'),
      { id: 's-rule', type: 'divider' },
      text('s-to', '{{tenant.name}}', { bold: true }),
      text('s-to-addr', '{{tenant.address}}'),
      { id: 's-space1', type: 'spacer', size: 'sm' },
      text('s-date', '{{date}}', { align: 'right' }),
      text('s-dear', ms ? 'Tuan,' : 'Dear Sir/Madam,'),
      {
        id: 's-subject',
        type: 'heading',
        text: ms ? 'PEMAKLUMAN PENERIMAAN PEMBAYARAN SEWA BULANAN UNTUK TAHUN {{year}}' : 'NOTICE OF MONTHLY RENT PAYMENTS RECEIVED FOR {{year}}',
        align: 'left',
        size: 'sm',
        underline: true,
      },
      text('s-ref', ms ? 'Dengan segala hormatnya merujuk perkara diatas.' : 'With reference to the above matter.'),
      text(
        's-p2',
        ms
          ? 'Dimaklumkan bahawa, rekod pembayaran sewa {{premises}} {{tenant.name}} sepanjang tempoh {{year}} adalah seperti berikut:'
          : 'Please be informed that the rent payments received from the {{premises}} {{tenant.name}} during {{year}} are as follows:',
        { prefix: '2.' },
      ),
      {
        id: 's-months',
        type: 'months',
        monthLabel: ms ? 'BULAN' : 'MONTH',
        amountLabel: ms ? 'JUMLAH BAYARAN' : 'AMOUNT PAID',
        totalLabel: 'TOTAL',
        emptyText: ms ? 'Tiada bayaran direkodkan' : 'No payments recorded',
      },
      text(
        's-p3-settled',
        ms
          ? 'Pihak saya sedia maklum dan ini bermakna {{premises}} {{tenant.name}} sudah menyelesaikan sewa bulanan Tahun {{year}} iaitu sebanyak {{total}}.'
          : 'This confirms that the {{premises}} {{tenant.name}} has settled the monthly rent for {{year}}, a total of {{total}}.',
        { prefix: '3.', showIf: 'settled' },
      ),
      text(
        's-p3-arrears',
        ms
          ? 'Pihak saya sedia maklum bahawa {{premises}} {{tenant.name}} telah membayar sewa bulanan Tahun {{year}} sebanyak {{total}}. Masih terdapat tunggakan sewa bagi bulan {{arrears.months}} {{year}}.'
          : 'The {{premises}} {{tenant.name}} has paid {{total}} in monthly rent for {{year}}. Rent is still owed for {{arrears.months}} {{year}}.',
        { prefix: '3.', showIf: 'arrears' },
      ),
      { id: 's-notes', type: 'notes', title: ms ? 'Untuk makluman tuan:' : 'For your information:', showIf: 'hasNotes' },
      text(
        's-close-settled',
        ms ? 'Jadi, tiada tunggakan sewa bagi tahun {{year}}. Sekian, terima kasih.' : 'There is therefore no rent outstanding for {{year}}. Thank you.',
        { showIf: 'settled' },
      ),
      text('s-close-arrears', ms ? 'Sekian, terima kasih.' : 'Thank you.', { showIf: 'arrears' }),
      { id: 's-space2', type: 'spacer', size: 'md' },
      {
        id: 's-sign',
        type: 'signature',
        leftLabel: ms ? 'Yang Benar' : 'Yours faithfully',
        leftName: '( {{landlord.name}} )',
        rightLabel: ms ? 'Yang Benar' : 'Acknowledged by',
        rightName: '( {{tenant.name}} )',
        showRight: true,
      },
    ],
  };
};

export const PRESET_NAMES: Record<TemplateKind, Record<TemplateLanguage, string>> = {
  RECEIPT: { EN: 'Receipt (English)', MS: 'Resit (Bahasa Melayu)' },
  STATEMENT: { EN: 'Year statement (English)', MS: 'Penyata tahunan (Bahasa Melayu)' },
};

export const presetTemplate = (kind: TemplateKind, language: TemplateLanguage): TemplateDoc =>
  kind === 'RECEIPT' ? receipt(language) : statement(language);
