import { type Block, byLanguage, type TemplateDoc, type TemplateKind, type TemplateLanguage } from 'src/shared/doc-template/types';

// Sample templates, in English (the default), Malay and Chinese. A new
// template starts as a copy of one of these.

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
  const t = (en: string, ms: string, zh: string) => byLanguage(language, en, ms, zh);
  // Malay and Chinese name the receipt themselves; English uses Receipt settings.
  const fixedTitles = language !== 'EN';

  return {
    kind: 'RECEIPT',
    language,
    blocks: [
      fixedTitles
        ? { id: 'r-band-rent', type: 'band', text: t('', 'RESIT SEWA', '租金收据'), align: 'center', showIf: 'rent' }
        : { id: 'r-band', type: 'band', text: '{{receipt.title}}', align: 'center' },
      ...(fixedTitles ? [{ id: 'r-band-dep', type: 'band', text: t('', 'RESIT DEPOSIT', '按金收据'), align: 'center', showIf: 'deposit' } as Block] : []),
      { id: 'r-head', type: 'letterhead', rightText: t('No. {{receipt.number}}', 'No. {{receipt.number}}', '编号 {{receipt.number}}'), showDetails: true },
      {
        id: 'r-main',
        type: 'fields',
        layout: 'grid',
        columns: 2,
        rows: [
          { label: t('Received from', 'Diterima daripada', '收款自'), value: '{{tenant.name}}' },
          { label: t('Date', 'Tarikh', '日期'), value: '{{receipt.date}}' },
          { label: t('Amount', 'Jumlah', '金额'), value: '{{amount}}' },
          { label: t('Paid on', 'Dibayar pada', '付款日期'), value: '{{paid.on}}' },
        ],
      },
      {
        id: 'r-sum',
        type: 'fields',
        layout: 'grid',
        columns: 1,
        rows: [
          { label: t('The sum of', 'Sebanyak', '金额（大写）'), value: '{{amount.words}}' },
          { label: t('For rent at', 'Sewa di', '租赁地址'), value: '{{property}}' },
        ],
      },
      {
        id: 'r-period',
        type: 'fields',
        layout: 'grid',
        columns: 2,
        showIf: 'rent',
        rows: [
          { label: t('Period from', 'Tempoh dari', '租期由'), value: '{{period.from}}' },
          { label: t('To', 'Hingga', '至'), value: '{{period.to}}' },
        ],
      },
      {
        id: 'r-purpose',
        type: 'fields',
        layout: 'grid',
        columns: 1,
        showIf: 'deposit',
        rows: [{ label: t('Being payment of', 'Bayaran untuk', '款项用途'), value: '{{purpose}}' }],
      },
      { id: 'r-methods', type: 'methods', label: t('Paid by', 'Kaedah bayaran', '付款方式') },
      text('r-notes', t('Notes: {{notes}}', 'Catatan: {{notes}}', '备注：{{notes}}'), { size: 'sm', showIf: 'hasNotes' }),
      { id: 'r-space', type: 'spacer', size: 'md' },
      {
        id: 'r-sign',
        type: 'signature',
        leftLabel: t('Received by', 'Diterima oleh', '收款人'),
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
  const t = (en: string, ms: string, zh: string) => byLanguage(language, en, ms, zh);

  return {
    kind: 'STATEMENT',
    language,
    blocks: [
      { id: 's-head', type: 'letterhead', rightText: '', showDetails: true },
      { id: 's-rule', type: 'divider' },
      text('s-to', '{{tenant.name}}', { bold: true }),
      text('s-to-addr', '{{tenant.address}}'),
      { id: 's-space1', type: 'spacer', size: 'sm' },
      text('s-date', '{{date}}', { align: 'right' }),
      text('s-dear', t('Dear Sir/Madam,', 'Tuan,', '敬启者：')),
      {
        id: 's-subject',
        type: 'heading',
        text: t('NOTICE OF MONTHLY RENT PAYMENTS RECEIVED FOR {{year}}', 'PEMAKLUMAN PENERIMAAN PEMBAYARAN SEWA BULANAN UNTUK TAHUN {{year}}', '{{year}}年度月租收款通知'),
        align: 'left',
        size: 'sm',
        underline: true,
      },
      text('s-ref', t('With reference to the above matter.', 'Dengan segala hormatnya merujuk perkara diatas.', '兹就上述事项致函。')),
      text(
        's-p2',
        t(
          'Please be informed that the rent payments received from the {{premises}} {{tenant.name}} during {{year}} are as follows:',
          'Dimaklumkan bahawa, rekod pembayaran sewa {{premises}} {{tenant.name}} sepanjang tempoh {{year}} adalah seperti berikut:',
          '兹通知，{{premises}}租户{{tenant.name}}于{{year}}年的租金付款记录如下：',
        ),
        { prefix: '2.' },
      ),
      {
        id: 's-months',
        type: 'months',
        monthLabel: t('MONTH', 'BULAN', '月份'),
        amountLabel: t('AMOUNT PAID', 'JUMLAH BAYARAN', '已付金额'),
        totalLabel: t('TOTAL', 'TOTAL', '总计'),
        emptyText: t('No payments recorded', 'Tiada bayaran direkodkan', '没有付款记录'),
      },
      text(
        's-p3-settled',
        t(
          'This confirms that the {{premises}} {{tenant.name}} has settled the monthly rent for {{year}}, a total of {{total}}.',
          'Pihak saya sedia maklum dan ini bermakna {{premises}} {{tenant.name}} sudah menyelesaikan sewa bulanan Tahun {{year}} iaitu sebanyak {{total}}.',
          '据此确认，{{premises}}租户{{tenant.name}}已付清{{year}}年的月租，共计{{total}}。',
        ),
        { prefix: '3.', showIf: 'settled' },
      ),
      text(
        's-p3-arrears',
        t(
          'The {{premises}} {{tenant.name}} has paid {{total}} in monthly rent for {{year}}. Rent is still owed for {{arrears.months}} {{year}}.',
          'Pihak saya sedia maklum bahawa {{premises}} {{tenant.name}} telah membayar sewa bulanan Tahun {{year}} sebanyak {{total}}. Masih terdapat tunggakan sewa bagi bulan {{arrears.months}} {{year}}.',
          '{{premises}}租户{{tenant.name}}已支付{{year}}年月租共{{total}}，但{{arrears.months}}的租金仍未缴付。',
        ),
        { prefix: '3.', showIf: 'arrears' },
      ),
      { id: 's-notes', type: 'notes', title: t('For your information:', 'Untuk makluman tuan:', '附注：'), showIf: 'hasNotes' },
      // Rent owed: how to pay it, with your DuitNow QR.
      { id: 's-pay', type: 'payment', title: t('How to pay', 'Cara pembayaran', '付款方式'), text: '{{pay.to}}', showQr: true, showIf: 'arrears' },
      text(
        's-close-settled',
        t('There is therefore no rent outstanding for {{year}}. Thank you.', 'Jadi, tiada tunggakan sewa bagi tahun {{year}}. Sekian, terima kasih.', '因此，{{year}}年并无拖欠租金。谢谢。'),
        { showIf: 'settled' },
      ),
      text('s-close-arrears', t('Thank you.', 'Sekian, terima kasih.', '谢谢。'), { showIf: 'arrears' }),
      { id: 's-space2', type: 'spacer', size: 'md' },
      {
        id: 's-sign',
        type: 'signature',
        leftLabel: t('Yours faithfully', 'Yang Benar', '此致'),
        leftName: '( {{landlord.name}} )',
        rightLabel: t('Acknowledged by', 'Yang Benar', '确认人'),
        rightName: '( {{tenant.name}} )',
        showRight: true,
      },
    ],
  };
};

export const PRESET_NAMES: Record<TemplateKind, Record<TemplateLanguage, string>> = {
  RECEIPT: { EN: 'Receipt (English)', MS: 'Resit (Bahasa Melayu)', ZH: '收据（中文）' },
  STATEMENT: { EN: 'Year statement (English)', MS: 'Penyata tahunan (Bahasa Melayu)', ZH: '年度租金结单（中文）' },
};

export const presetTemplate = (kind: TemplateKind, language: TemplateLanguage): TemplateDoc =>
  kind === 'RECEIPT' ? receipt(language) : statement(language);
