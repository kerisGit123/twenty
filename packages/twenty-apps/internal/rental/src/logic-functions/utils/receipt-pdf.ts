import { degrees, PDFDocument, type PDFPage, type RGB, rgb } from 'pdf-lib';

import { cleanText, drawText, graphemes, loadPdfFonts, type PdfFonts, type TextFont, wrapText } from 'src/logic-functions/utils/pdf-fonts';

import {
  ACCENTS,
  DEFAULT_STYLE,
  type ReceiptStyle,
} from 'src/logic-functions/utils/receipt-settings';
import { type ReceiptFacts } from 'src/shared/doc-template/context';
import { type TemplateDoc } from 'src/shared/doc-template/types';

export type ReceiptPaymentMethod =
  | 'CASH'
  | 'BANK_TRANSFER'
  | 'DUITNOW'
  | 'CHEQUE'
  | 'OTHER'
  | 'FROM_DEPOSIT';

export type ReceiptData = {
  title: string; // e.g. RENT RECEIPT / DEPOSIT RECEIPT
  watermark?: 'DRAFT' | 'VOID' | null; // big diagonal overlay
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
  style?: ReceiptStyle;
  // Set when a receipt template is the default: drawn with it instead.
  facts?: ReceiptFacts;
  template?: TemplateDoc;
  signatureUrl?: string | null;
};

const A4 = { width: 595.28, height: 841.89 };
const A5_LANDSCAPE = { width: 595.28, height: 419.53 };
const INK = rgb(0.13, 0.14, 0.17);
const MUTED = rgb(0.4, 0.43, 0.48);
const RED = rgb(0.8, 0.12, 0.12);
const WHITE = rgb(1, 1, 1);

export const METHOD_LABELS: Array<{ value: ReceiptPaymentMethod; label: string }> = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'DUITNOW', label: 'DuitNow' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other' },
  { value: 'FROM_DEPOSIT', label: 'Deposit' },
];

const methodLabel = (method: ReceiptPaymentMethod | null) =>
  METHOD_LABELS.find((entry) => entry.value === method)?.label ?? '-';

const hex = (value: string): RGB => {
  const n = parseInt(value.replace('#', ''), 16);

  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

// Fonts cover Latin, Chinese and Tamil; anything unprintable (emoji) goes.
const safe = (text: string) => cleanText(text).trim();

// Shrinks the font until the text fits the width (min 7pt), then truncates.
const fitText = (raw: string, font: TextFont, size: number, maxWidth: number) => {
  const text = raw.replace(/\s*\n\s*/g, ' ');
  let fittedSize = size;

  while (fittedSize > 7 && font.widthOfTextAtSize(text, fittedSize) > maxWidth) {
    fittedSize -= 0.5;
  }

  if (font.widthOfTextAtSize(text, fittedSize) <= maxWidth) {
    return { text, size: fittedSize };
  }

  const kept = graphemes(text);

  while (kept.length > 1 && font.widthOfTextAtSize(`${kept.join('')}...`, fittedSize) > maxWidth) {
    kept.pop();
  }

  return { text: `${kept.join('').trimEnd()}...`, size: fittedSize };
};

// Word-wraps to the given width (one paragraph).
const wrap = (text: string, font: TextFont, size: number, maxWidth: number) =>
  wrapText(safe(text).replace(/\s*\n\s*/g, ' '), font, size, maxWidth).filter(Boolean);

type Fonts = PdfFonts;

type Palette = { main: RGB; soft: RGB; grid: RGB };

const drawRight = (page: PDFPage, text: string, right: number, y: number, font: TextFont, size: number, color: RGB) => {
  drawText(page, text, { x: right - font.widthOfTextAtSize(text, size), y, size, font, color });
};

const drawWatermark = (page: PDFPage, fonts: Fonts, mark: 'DRAFT' | 'VOID' | null | undefined, size: { width: number; height: number }, centreY: number, markSize: number) => {
  if (!mark) return;

  const markWidth = fonts.bold.widthOfTextAtSize(mark, markSize);

  drawText(page, mark, {
    x: size.width / 2 - (markWidth / 2) * Math.cos(Math.PI / 6),
    y: centreY - (markWidth / 2) * Math.sin(Math.PI / 6),
    size: markSize,
    font: fonts.bold,
    color: mark === 'VOID' ? RED : MUTED,
    opacity: 0.18,
    rotate: degrees(30),
  });
};

// ------------------------------------------------------------- classic form

const drawCell = (
  page: PDFPage,
  fonts: Fonts,
  palette: Palette,
  params: {
    x: number;
    y: number; // top edge
    width: number;
    height: number;
    labelWidth: number;
    label: string;
    value: string;
    valueFont?: TextFont;
    valueSize?: number;
  },
) => {
  const { x, y, width, height, labelWidth, label, value } = params;
  const bottom = y - height;

  page.drawRectangle({ x, y: bottom, width: labelWidth, height, color: palette.soft });
  page.drawRectangle({ x, y: bottom, width, height, borderColor: palette.grid, borderWidth: 0.75 });
  page.drawLine({ start: { x: x + labelWidth, y: bottom }, end: { x: x + labelWidth, y }, thickness: 0.75, color: palette.grid });

  const textY = bottom + height / 2 - 3.5;

  drawText(page, label, { x: x + 8, y: textY, size: 9.5, font: fonts.bold, color: INK });

  const valueFont = params.valueFont ?? fonts.regular;
  const fitted = fitText(safe(value) || ' ', valueFont, params.valueSize ?? 10.5, width - labelWidth - 16);

  drawText(page, fitted.text, { x: x + labelWidth + 8, y: textY, size: fitted.size, font: valueFont, color: INK });
};

const drawClassic = (page: PDFPage, fonts: Fonts, palette: Palette, data: ReceiptData, style: ReceiptStyle) => {
  const MARGIN = 40;
  const left = MARGIN;
  const width = A4.width - MARGIN * 2;
  const half = width / 2;
  const rowHeight = 26;
  let y = A4.height - MARGIN;

  const titleHeight = 40;

  page.drawRectangle({ x: left, y: y - titleHeight, width, height: titleHeight, color: palette.main });
  const title = fitText(safe(data.title), fonts.bold, 20, width - 20);

  drawText(page, title.text, {
    x: left + (width - fonts.bold.widthOfTextAtSize(title.text, title.size)) / 2,
    y: y - titleHeight / 2 - 7,
    size: title.size,
    font: fonts.bold,
    color: WHITE,
  });
  y -= titleHeight;

  const detailLines = style.businessDetails ? wrap(style.businessDetails, fonts.regular, 8.5, half + 40).slice(0, 3) : [];
  const headerHeight = 44 + detailLines.length * 11;

  page.drawRectangle({ x: left, y: y - headerHeight, width, height: headerHeight, borderColor: palette.grid, borderWidth: 0.75 });
  const issuer = fitText(safe(data.issuerName) || 'Receipt', fonts.bold, 14, half);

  drawText(page, issuer.text, { x: left + 10, y: y - 26, size: issuer.size, font: fonts.bold, color: INK });
  detailLines.forEach((line, index) => {
    drawText(page, line, { x: left + 10, y: y - 40 - index * 11, size: 8.5, font: fonts.regular, color: MUTED });
  });
  const numberText = safe(data.receiptNumber);
  const numberWidth = fonts.bold.widthOfTextAtSize(numberText, 18);

  drawText(page, 'No.', { x: left + width - 10 - numberWidth - 6 - fonts.bold.widthOfTextAtSize('No.', 11), y: y - 27, size: 11, font: fonts.bold, color: MUTED });
  drawText(page, numberText, { x: left + width - 10 - numberWidth, y: y - 28, size: 18, font: fonts.bold, color: RED });
  y -= headerHeight;

  const labelWidth = 104;
  const pairLabelWidth = 90;
  const cell = (params: Parameters<typeof drawCell>[3]) => drawCell(page, fonts, palette, params);

  cell({ x: left, y, width: half, height: rowHeight, labelWidth, label: 'Received From', value: data.receivedFrom, valueFont: fonts.bold });
  cell({ x: left + half, y, width: half, height: rowHeight, labelWidth: pairLabelWidth, label: 'Date', value: data.date });
  y -= rowHeight;
  cell({ x: left, y, width: half, height: rowHeight, labelWidth, label: 'Amount', value: data.amountText, valueFont: fonts.bold, valueSize: 13 });
  cell({ x: left + half, y, width: half, height: rowHeight, labelWidth: pairLabelWidth, label: 'Paid on', value: data.paidOn });
  y -= rowHeight;
  cell({ x: left, y, width, height: rowHeight, labelWidth, label: 'The sum of', value: data.amountInWords, valueSize: 10 });
  y -= rowHeight;
  cell({ x: left, y, width, height: rowHeight, labelWidth, label: 'For Rent at', value: data.forRentAt });
  y -= rowHeight;
  if (data.periodFrom || data.periodTo) {
    cell({ x: left, y, width: half, height: rowHeight, labelWidth, label: 'Period From', value: data.periodFrom });
    cell({ x: left + half, y, width: half, height: rowHeight, labelWidth: pairLabelWidth, label: 'To', value: data.periodTo });
  } else {
    cell({ x: left, y, width, height: rowHeight, labelWidth, label: 'Being payment of', value: data.purpose });
  }
  y -= rowHeight;
  cell({ x: left, y, width: half, height: rowHeight, labelWidth, label: 'Received by', value: data.receivedBy });
  cell({ x: left + half, y, width: half, height: rowHeight, labelWidth: pairLabelWidth, label: 'Signature', value: '' });
  y -= rowHeight;

  page.drawRectangle({ x: left, y: y - rowHeight, width: labelWidth, height: rowHeight, color: palette.soft });
  page.drawRectangle({ x: left, y: y - rowHeight, width, height: rowHeight, borderColor: palette.grid, borderWidth: 0.75 });
  page.drawLine({ start: { x: left + labelWidth, y: y - rowHeight }, end: { x: left + labelWidth, y }, thickness: 0.75, color: palette.grid });
  const rowMid = y - rowHeight / 2;

  drawText(page, 'Paid by', { x: left + 8, y: rowMid - 3.5, size: 9.5, font: fonts.bold, color: INK });
  let boxX = left + labelWidth + 12;

  for (const method of METHOD_LABELS) {
    const isSelected = data.method === method.value;

    page.drawRectangle({ x: boxX, y: rowMid - 5, width: 10, height: 10, borderColor: INK, borderWidth: 0.9, color: isSelected ? palette.main : WHITE });
    if (isSelected) {
      page.drawLine({ start: { x: boxX + 2, y: rowMid }, end: { x: boxX + 4.2, y: rowMid - 2.8 }, thickness: 1.4, color: WHITE });
      page.drawLine({ start: { x: boxX + 4.2, y: rowMid - 2.8 }, end: { x: boxX + 8.2, y: rowMid + 3 }, thickness: 1.4, color: WHITE });
    }
    drawText(page, method.label, { x: boxX + 15, y: rowMid - 3.5, size: 9.5, font: isSelected ? fonts.bold : fonts.regular, color: INK });
    boxX += 15 + fonts.regular.widthOfTextAtSize(method.label, 9.5) + 14;
  }
  y -= rowHeight;

  const notes = safe(data.notes);

  if (notes) {
    y -= 18;
    drawText(page, 'Notes:', { x: left, y, size: 9, font: fonts.bold, color: MUTED });
    const fitted = fitText(notes, fonts.regular, 9, width - 40);

    drawText(page, fitted.text, { x: left + 38, y, size: fitted.size, font: fonts.regular, color: INK });
  }

  y -= 22;
  for (const line of wrap(style.footerText, fonts.regular, 8, width)) {
    drawText(page, line, { x: left, y, size: 8, font: fonts.regular, color: MUTED });
    y -= 11;
  }

  drawWatermark(page, fonts, data.watermark, A4, A4.height - 250, 110);
};

// ------------------------------------------------------------- modern

const drawModern = (page: PDFPage, fonts: Fonts, palette: Palette, data: ReceiptData, style: ReceiptStyle) => {
  const MARGIN = 50;
  const left = MARGIN;
  const right = A4.width - MARGIN;
  const width = right - left;
  let y = A4.height - MARGIN;

  page.drawRectangle({ x: 0, y: A4.height - 6, width: A4.width, height: 6, color: palette.main });

  // Business (left) and title + number (right)
  const issuer = fitText(safe(data.issuerName) || 'Receipt', fonts.bold, 18, width * 0.55);

  drawText(page, issuer.text, { x: left, y: y - 14, size: issuer.size, font: fonts.bold, color: INK });
  const details = style.businessDetails ? wrap(style.businessDetails, fonts.regular, 9, width * 0.55).slice(0, 3) : [];

  details.forEach((line, index) => {
    drawText(page, line, { x: left, y: y - 30 - index * 12, size: 9, font: fonts.regular, color: MUTED });
  });
  drawRight(page, safe(data.title), right, y - 10, fonts.bold, 11, palette.main);
  drawRight(page, safe(data.receiptNumber), right, y - 30, fonts.bold, 15, INK);
  drawRight(page, `Issued ${safe(data.date)}`, right, y - 46, fonts.regular, 9, MUTED);

  y -= Math.max(62, 36 + details.length * 12) + 16;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.75, color: palette.grid });

  // Received from
  y -= 28;
  drawText(page, 'RECEIVED FROM', { x: left, y, size: 8, font: fonts.bold, color: MUTED });
  y -= 18;
  drawText(page, fitText(safe(data.receivedFrom) || '-', fonts.bold, 14, width).text, { x: left, y, size: 14, font: fonts.bold, color: INK });
  if (data.forRentAt) {
    y -= 15;
    drawText(page, fitText(safe(data.forRentAt), fonts.regular, 10, width).text, { x: left, y, size: 10, font: fonts.regular, color: MUTED });
  }

  // Amount box
  y -= 26;
  const boxHeight = 74;

  page.drawRectangle({ x: left, y: y - boxHeight, width, height: boxHeight, color: palette.soft });
  drawText(page, 'AMOUNT RECEIVED', { x: left + 16, y: y - 20, size: 8, font: fonts.bold, color: palette.main });
  drawText(page, safe(data.amountText), { x: left + 16, y: y - 46, size: 24, font: fonts.bold, color: INK });
  drawText(page, fitText(safe(data.amountInWords), fonts.regular, 9, width - 32).text, { x: left + 16, y: y - 62, size: 9, font: fonts.regular, color: MUTED });
  y -= boxHeight + 22;

  const rows: Array<[string, string]> = [
    data.periodFrom || data.periodTo
      ? ['Rent period', `${data.periodFrom} - ${data.periodTo}`]
      : ['Being payment of', data.purpose],
    ['Payment method', methodLabel(data.method)],
    ['Paid on', data.paidOn],
    ['Received by', data.receivedBy],
  ];

  for (const [label, value] of rows) {
    drawText(page, label, { x: left, y, size: 10, font: fonts.regular, color: MUTED });
    drawRight(page, fitText(safe(value) || '-', fonts.regular, 10, width * 0.6).text, right, y, fonts.regular, 10, INK);
    y -= 10;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: palette.grid });
    y -= 18;
  }

  const notes = safe(data.notes);

  if (notes) {
    y -= 4;
    drawText(page, 'NOTES', { x: left, y, size: 8, font: fonts.bold, color: MUTED });
    for (const line of wrap(notes, fonts.regular, 10, width)) {
      y -= 14;
      drawText(page, line, { x: left, y, size: 10, font: fonts.regular, color: INK });
    }
    y -= 10;
  }

  // Signature line
  y -= 34;
  page.drawLine({ start: { x: right - 170, y }, end: { x: right, y }, thickness: 0.75, color: MUTED });
  drawRight(page, 'Signature', right, y - 12, fonts.regular, 8, MUTED);

  let footerY = MARGIN;

  for (const line of wrap(style.footerText, fonts.regular, 8, width).reverse()) {
    drawText(page, line, { x: left, y: footerY, size: 8, font: fonts.regular, color: MUTED });
    footerY += 11;
  }

  drawWatermark(page, fonts, data.watermark, A4, A4.height - 330, 110);
};

// ------------------------------------------------------------- compact (A5)

const drawCompact = (page: PDFPage, fonts: Fonts, palette: Palette, data: ReceiptData, style: ReceiptStyle) => {
  const size = A5_LANDSCAPE;
  const MARGIN = 28;
  const left = MARGIN;
  const right = size.width - MARGIN;
  const width = right - left;
  let y = size.height - MARGIN;

  const bandHeight = 30;

  page.drawRectangle({ x: left, y: y - bandHeight, width, height: bandHeight, color: palette.main });
  drawText(page, fitText(safe(data.title), fonts.bold, 13, width / 2).text, { x: left + 10, y: y - 19, size: 13, font: fonts.bold, color: WHITE });
  drawRight(page, `No. ${safe(data.receiptNumber)}`, right - 10, y - 19, fonts.bold, 12, WHITE);
  y -= bandHeight + 18;

  drawText(page, fitText(safe(data.issuerName) || 'Receipt', fonts.bold, 12, width * 0.6).text, { x: left, y, size: 12, font: fonts.bold, color: INK });
  drawRight(page, safe(data.date), right, y, fonts.regular, 9, MUTED);
  if (style.businessDetails) {
    y -= 12;
    drawText(page, fitText(safe(style.businessDetails), fonts.regular, 8, width).text, { x: left, y, size: 8, font: fonts.regular, color: MUTED });
  }
  y -= 22;

  const colWidth = width / 2 - 10;
  const pairs: Array<[string, string]> = [
    ['Received from', data.receivedFrom],
    ['Amount', data.amountText],
    ['For rent at', data.forRentAt],
    data.periodFrom || data.periodTo ? ['Period', `${data.periodFrom} - ${data.periodTo}`] : ['Being payment of', data.purpose],
    ['Paid by', methodLabel(data.method)],
    ['Paid on', data.paidOn],
    ['Received by', data.receivedBy],
    ['Notes', data.notes],
  ];

  pairs.forEach(([label, value], index) => {
    const column = index % 2;
    const rowY = y - Math.floor(index / 2) * 34;
    const x = left + column * (colWidth + 20);

    drawText(page, label.toUpperCase(), { x, y: rowY, size: 7, font: fonts.bold, color: MUTED });
    const isAmount = label === 'Amount';
    const fitted = fitText(safe(value) || '-', isAmount ? fonts.bold : fonts.regular, isAmount ? 13 : 10, colWidth);

    drawText(page, fitted.text, { x, y: rowY - 14, size: fitted.size, font: isAmount ? fonts.bold : fonts.regular, color: INK });
  });
  y -= Math.ceil(pairs.length / 2) * 34 + 4;

  drawText(page, fitText(safe(data.amountInWords), fonts.regular, 8.5, width).text, { x: left, y, size: 8.5, font: fonts.regular, color: MUTED });

  page.drawLine({ start: { x: right - 140, y: MARGIN + 22 }, end: { x: right, y: MARGIN + 22 }, thickness: 0.75, color: MUTED });
  drawRight(page, 'Signature', right, MARGIN + 11, fonts.regular, 7.5, MUTED);
  drawText(page, fitText(safe(style.footerText), fonts.regular, 7.5, width - 160).text, { x: left, y: MARGIN + 11, size: 7.5, font: fonts.regular, color: MUTED });

  drawWatermark(page, fonts, data.watermark, size, size.height / 2 + 30, 80);
};

// ------------------------------------------------------------- entry point

export const buildReceiptPdf = async (data: ReceiptData): Promise<Uint8Array> => {
  const style = data.style ?? DEFAULT_STYLE;
  const accent = ACCENTS[style.accent] ?? ACCENTS.TEAL;
  const palette: Palette = { main: hex(accent.main), soft: hex(accent.soft), grid: hex(accent.grid) };
  const doc = await PDFDocument.create();
  const pageSize = style.template === 'COMPACT' ? A5_LANDSCAPE : A4;
  const page = doc.addPage([pageSize.width, pageSize.height]);
  const fonts: Fonts = await loadPdfFonts(doc, JSON.stringify(data));

  doc.setTitle(`${safe(data.title)} ${safe(data.receiptNumber)}`);
  doc.setProducer('Rental');

  if (style.template === 'MODERN') drawModern(page, fonts, palette, data, style);
  else if (style.template === 'COMPACT') drawCompact(page, fonts, palette, data, style);
  else drawClassic(page, fonts, palette, data, style);

  return doc.save();
};
