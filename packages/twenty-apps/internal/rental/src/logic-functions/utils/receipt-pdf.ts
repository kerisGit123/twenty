import {
  degrees,
  PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb,
  StandardFonts,
} from 'pdf-lib';

export type ReceiptPaymentMethod =
  | 'CASH'
  | 'BANK_TRANSFER'
  | 'DUITNOW'
  | 'CHEQUE'
  | 'OTHER';

export type ReceiptData = {
  title: string;
  watermark?: 'DRAFT' | 'VOID' | null; // big diagonal overlay // e.g. RENT RECEIPT / DEPOSIT RECEIPT
  issuerName: string;
  receiptNumber: string;
  date: string;
  receivedFrom: string;
  amountText: string; // RM 1,500.00
  amountInWords: string; // Ringgit Malaysia One Thousand Five Hundred Only
  forRentAt: string; // property name + address
  periodFrom: string;
  periodTo: string;
  purpose: string; // shown instead of the period for deposits
  receivedBy: string;
  method: ReceiptPaymentMethod | null;
  paidOn: string;
  notes: string;
};

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 40;
const INK = rgb(0.13, 0.14, 0.17);
const MUTED = rgb(0.4, 0.43, 0.48);
const BRAND = rgb(0.12, 0.45, 0.55); // teal title bar
const BRAND_SOFT = rgb(0.9, 0.95, 0.96); // label cells
const GRID = rgb(0.72, 0.8, 0.83);
const RED = rgb(0.8, 0.12, 0.12);
const WHITE = rgb(1, 1, 1);

const METHODS: Array<{ value: ReceiptPaymentMethod; label: string }> = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'DUITNOW', label: 'DuitNow' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other' },
];

// Standard PDF fonts only cover WinAnsi; drop anything else (emoji, CJK)
// rather than crashing the whole receipt.
const safe = (text: string) =>
  (text ?? '').replace(/[^\x20-\x7E -ÿ]/g, '').trim();

// Shrinks the font until the text fits the width (min 7pt), then truncates.
const fitText = (text: string, font: PDFFont, size: number, maxWidth: number) => {
  let fittedSize = size;

  while (fittedSize > 7 && font.widthOfTextAtSize(text, fittedSize) > maxWidth) {
    fittedSize -= 0.5;
  }

  if (font.widthOfTextAtSize(text, fittedSize) <= maxWidth) {
    return { text, size: fittedSize };
  }

  let kept = text;

  while (kept.length > 1 && font.widthOfTextAtSize(`${kept}...`, fittedSize) > maxWidth) {
    kept = kept.slice(0, -1);
  }

  return { text: `${kept.trimEnd()}...`, size: fittedSize };
};

type Fonts = { regular: PDFFont; bold: PDFFont };

// One labelled cell: shaded label on the left, value on the right.
const drawCell = (
  page: PDFPage,
  fonts: Fonts,
  params: {
    x: number;
    y: number; // top edge
    width: number;
    height: number;
    labelWidth: number;
    label: string;
    value: string;
    valueFont?: PDFFont;
    valueSize?: number;
    valueColor?: ReturnType<typeof rgb>;
  },
) => {
  const { x, y, width, height, labelWidth, label, value } = params;
  const bottom = y - height;

  page.drawRectangle({ x, y: bottom, width: labelWidth, height, color: BRAND_SOFT });
  page.drawRectangle({
    x,
    y: bottom,
    width,
    height,
    borderColor: GRID,
    borderWidth: 0.75,
  });
  page.drawLine({
    start: { x: x + labelWidth, y: bottom },
    end: { x: x + labelWidth, y },
    thickness: 0.75,
    color: GRID,
  });

  const textY = bottom + height / 2 - 3.5;

  page.drawText(label, { x: x + 8, y: textY, size: 9.5, font: fonts.bold, color: INK });

  const valueFont = params.valueFont ?? fonts.regular;
  const fitted = fitText(
    safe(value) || ' ',
    valueFont,
    params.valueSize ?? 10.5,
    width - labelWidth - 16,
  );

  page.drawText(fitted.text, {
    x: x + labelWidth + 8,
    y: textY,
    size: fitted.size,
    font: valueFont,
    color: params.valueColor ?? INK,
  });
};

export const buildReceiptPdf = async (data: ReceiptData): Promise<Uint8Array> => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([A4.width, A4.height]);
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  doc.setTitle(`${data.title} ${data.receiptNumber}`);
  doc.setProducer('Rental');

  const left = MARGIN;
  const width = A4.width - MARGIN * 2;
  const half = width / 2;
  const rowHeight = 26;
  let y = A4.height - MARGIN;

  // Title bar
  const titleHeight = 40;

  page.drawRectangle({ x: left, y: y - titleHeight, width, height: titleHeight, color: BRAND });
  const titleSize = 20;
  const titleWidth = fonts.bold.widthOfTextAtSize(data.title, titleSize);

  page.drawText(data.title, {
    x: left + (width - titleWidth) / 2,
    y: y - titleHeight / 2 - 7,
    size: titleSize,
    font: fonts.bold,
    color: WHITE,
  });
  y -= titleHeight;

  // Issuer + receipt number
  const headerHeight = 44;

  page.drawRectangle({
    x: left,
    y: y - headerHeight,
    width,
    height: headerHeight,
    borderColor: GRID,
    borderWidth: 0.75,
  });
  const issuer = fitText(safe(data.issuerName) || 'Receipt', fonts.bold, 14, half);

  page.drawText(issuer.text, {
    x: left + 10,
    y: y - headerHeight / 2 - 5,
    size: issuer.size,
    font: fonts.bold,
    color: INK,
  });
  const numberText = safe(data.receiptNumber);
  const numberSize = 18;
  const numberWidth = fonts.bold.widthOfTextAtSize(numberText, numberSize);
  const noLabelWidth = fonts.bold.widthOfTextAtSize('No.', 11);

  page.drawText('No.', {
    x: left + width - 10 - numberWidth - 6 - noLabelWidth,
    y: y - headerHeight / 2 - 5,
    size: 11,
    font: fonts.bold,
    color: MUTED,
  });
  page.drawText(numberText, {
    x: left + width - 10 - numberWidth,
    y: y - headerHeight / 2 - 6,
    size: numberSize,
    font: fonts.bold,
    color: RED,
  });
  y -= headerHeight;

  // Form grid
  const labelWidth = 104;
  const pairLabelWidth = 90;

  drawCell(page, fonts, { x: left, y, width: half, height: rowHeight, labelWidth, label: 'Received From', value: data.receivedFrom, valueFont: fonts.bold });
  drawCell(page, fonts, { x: left + half, y, width: half, height: rowHeight, labelWidth: pairLabelWidth, label: 'Date', value: data.date });
  y -= rowHeight;

  drawCell(page, fonts, { x: left, y, width: half, height: rowHeight, labelWidth, label: 'Amount', value: data.amountText, valueFont: fonts.bold, valueSize: 13 });
  drawCell(page, fonts, { x: left + half, y, width: half, height: rowHeight, labelWidth: pairLabelWidth, label: 'Paid on', value: data.paidOn });
  y -= rowHeight;

  drawCell(page, fonts, { x: left, y, width, height: rowHeight, labelWidth, label: 'The sum of', value: data.amountInWords, valueSize: 10 });
  y -= rowHeight;

  drawCell(page, fonts, { x: left, y, width, height: rowHeight, labelWidth, label: 'For Rent at', value: data.forRentAt });
  y -= rowHeight;

  if (data.periodFrom || data.periodTo) {
    drawCell(page, fonts, { x: left, y, width: half, height: rowHeight, labelWidth, label: 'Period From', value: data.periodFrom });
    drawCell(page, fonts, { x: left + half, y, width: half, height: rowHeight, labelWidth: pairLabelWidth, label: 'To', value: data.periodTo });
  } else {
    drawCell(page, fonts, { x: left, y, width, height: rowHeight, labelWidth, label: 'Being payment of', value: data.purpose });
  }
  y -= rowHeight;

  drawCell(page, fonts, { x: left, y, width: half, height: rowHeight, labelWidth, label: 'Received by', value: data.receivedBy });
  drawCell(page, fonts, { x: left + half, y, width: half, height: rowHeight, labelWidth: pairLabelWidth, label: 'Signature', value: '' });
  y -= rowHeight;

  // Paid by: tick boxes
  page.drawRectangle({ x: left, y: y - rowHeight, width: labelWidth, height: rowHeight, color: BRAND_SOFT });
  page.drawRectangle({ x: left, y: y - rowHeight, width, height: rowHeight, borderColor: GRID, borderWidth: 0.75 });
  page.drawLine({ start: { x: left + labelWidth, y: y - rowHeight }, end: { x: left + labelWidth, y }, thickness: 0.75, color: GRID });
  const rowMid = y - rowHeight / 2;

  page.drawText('Paid by', { x: left + 8, y: rowMid - 3.5, size: 9.5, font: fonts.bold, color: INK });

  let boxX = left + labelWidth + 12;

  for (const method of METHODS) {
    const isSelected = data.method === method.value;

    page.drawRectangle({
      x: boxX,
      y: rowMid - 5,
      width: 10,
      height: 10,
      borderColor: INK,
      borderWidth: 0.9,
      color: isSelected ? BRAND : WHITE,
    });
    if (isSelected) {
      // tick mark
      page.drawLine({ start: { x: boxX + 2, y: rowMid }, end: { x: boxX + 4.2, y: rowMid - 2.8 }, thickness: 1.4, color: WHITE });
      page.drawLine({ start: { x: boxX + 4.2, y: rowMid - 2.8 }, end: { x: boxX + 8.2, y: rowMid + 3 }, thickness: 1.4, color: WHITE });
    }
    page.drawText(method.label, {
      x: boxX + 15,
      y: rowMid - 3.5,
      size: 9.5,
      font: isSelected ? fonts.bold : fonts.regular,
      color: INK,
    });
    boxX += 15 + fonts.regular.widthOfTextAtSize(method.label, 9.5) + 22;
  }
  y -= rowHeight;

  // Notes
  const notes = safe(data.notes);

  if (notes) {
    y -= 18;
    page.drawText('Notes:', { x: left, y, size: 9, font: fonts.bold, color: MUTED });
    const fitted = fitText(notes, fonts.regular, 9, width - 40);

    page.drawText(fitted.text, { x: left + 38, y, size: fitted.size, font: fonts.regular, color: INK });
  }

  y -= 22;
  if (data.watermark) {
    const markSize = 110;
    const markWidth = fonts.bold.widthOfTextAtSize(data.watermark, markSize);

    // Centred over the form, rotated 30deg.
    page.drawText(data.watermark, {
      x: A4.width / 2 - (markWidth / 2) * Math.cos(Math.PI / 6),
      y: A4.height - 250 - (markWidth / 2) * Math.sin(Math.PI / 6),
      size: markSize,
      font: fonts.bold,
      color: data.watermark === 'VOID' ? RED : MUTED,
      opacity: 0.18,
      rotate: degrees(30),
    });
  }

  page.drawText('This is a computer-generated receipt.', {
    x: left,
    y,
    size: 8,
    font: fonts.regular,
    color: MUTED,
  });

  return doc.save();
};
