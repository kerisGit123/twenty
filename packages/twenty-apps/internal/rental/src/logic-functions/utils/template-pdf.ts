import { degrees, PDFDocument, type PDFFont, type PDFImage, type PDFPage, type RGB, rgb, StandardFonts } from 'pdf-lib';

import { ACCENTS } from 'src/logic-functions/utils/receipt-settings';
import { type Align, type Block, fill, isShown, type TemplateContext, type TemplateDoc } from 'src/shared/doc-template/types';

// Draws a document template (receipt or year statement) as an A4 PDF. Blocks
// flow down the page and continue on a new page when they run out of room.

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 42;
const WIDTH = A4.width - MARGIN * 2;
const INK = rgb(0.13, 0.14, 0.17);
const MUTED = rgb(0.4, 0.43, 0.48);
const WHITE = rgb(1, 1, 1);

const hex = (value: string): RGB => {
  const n = parseInt(value.replace('#', ''), 16);

  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

// Standard fonts only cover WinAnsi; drop anything else (keeping line breaks,
// which wrap() splits on) rather than crash.
const safe = (text: string) => (text ?? '').replace(/[^\n\x20-\x7E\xA0-\xFF]/g, '');

const wrap = (text: string, font: PDFFont, size: number, maxWidth: number) => {
  const out: string[] = [];

  for (const paragraph of safe(text).split('\n')) {
    let line = '';

    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;

      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        if (line) out.push(line);
        line = word;
      }
    }
    out.push(line);
  }

  // Drop trailing empty lines.
  while (out.length && !out[out.length - 1]) out.pop();

  return out;
};

const fit = (text: string, font: PDFFont, size: number, maxWidth: number) => {
  let fitted = size;
  const clean = safe(text).replace(/\n/g, ' ');

  while (fitted > 7 && font.widthOfTextAtSize(clean, fitted) > maxWidth) fitted -= 0.5;

  let kept = clean;

  while (kept.length > 1 && font.widthOfTextAtSize(kept, fitted) > maxWidth) kept = kept.slice(0, -1);

  return { text: kept, size: fitted };
};

class Writer {
  page: PDFPage;
  y = A4.height - MARGIN;
  pages: PDFPage[] = [];

  constructor(
    private doc: PDFDocument,
    readonly fonts: { regular: PDFFont; bold: PDFFont },
    readonly accent: { main: RGB; soft: RGB; grid: RGB },
    readonly signature: PDFImage | null = null,
  ) {
    this.page = this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([A4.width, A4.height]);
    this.pages.push(this.page);
    this.y = A4.height - MARGIN;

    return this.page;
  }

  // Makes room for `height`, starting a new page if needed.
  ensure(height: number) {
    if (this.y - height < MARGIN) this.newPage();
  }

  textAt(text: string, x: number, y: number, size: number, bold = false, color: RGB = INK) {
    this.page.drawText(safe(text), { x, y, size, font: bold ? this.fonts.bold : this.fonts.regular, color });
  }

  aligned(text: string, align: Align, left: number, width: number, y: number, size: number, bold = false, color: RGB = INK) {
    const font = bold ? this.fonts.bold : this.fonts.regular;
    const w = font.widthOfTextAtSize(safe(text), size);
    const x = align === 'center' ? left + (width - w) / 2 : align === 'right' ? left + width - w : left;

    this.textAt(text, x, y, size, bold, color);
  }

  // Wrapped paragraph; returns nothing, moves y.
  paragraph(text: string, options: { size: number; bold?: boolean; color?: RGB; align?: Align; left?: number; width?: number }) {
    const font = options.bold ? this.fonts.bold : this.fonts.regular;
    const left = options.left ?? MARGIN;
    const width = options.width ?? WIDTH;
    const lineHeight = options.size * 1.34;

    for (const line of wrap(text, font, options.size, width)) {
      this.ensure(lineHeight);
      this.y -= lineHeight;
      this.aligned(line, options.align ?? 'left', left, width, this.y + options.size * 0.3, options.size, options.bold, options.color);
    }
  }
}

const SPACER = { sm: 8, md: 18, lg: 32 };
const HEADING = { sm: 11, md: 14, lg: 18 };

const drawBlock = (w: Writer, block: Block, context: TemplateContext) => {
  const v = (text: string) => fill(text, context.values);
  const { main, soft, grid } = w.accent;

  switch (block.type) {
    case 'band': {
      const height = 34;

      w.ensure(height + 6);
      w.page.drawRectangle({ x: MARGIN, y: w.y - height, width: WIDTH, height, color: main });
      const title = fit(v(block.text), w.fonts.bold, 16, WIDTH - 24);

      w.aligned(title.text, block.align, MARGIN + 12, WIDTH - 24, w.y - height / 2 - title.size * 0.35, title.size, true, WHITE);
      w.y -= height + 6;
      break;
    }
    case 'letterhead': {
      const details = block.showDetails ? wrap(context.values['business.details'] ?? context.values['landlord.details'] ?? '', w.fonts.regular, 9, WIDTH * 0.6) : [];
      const height = 26 + details.length * 12;

      w.ensure(height + 8);
      const name = fit(context.values['business.name'] ?? context.values['landlord.name'] ?? '', w.fonts.bold, 14, WIDTH * 0.6);

      w.textAt(name.text, MARGIN, w.y - 16, name.size, true);
      details.forEach((line, index) => w.textAt(line, MARGIN, w.y - 30 - index * 12, 9, false, MUTED));
      const right = fit(v(block.rightText), w.fonts.bold, 14, WIDTH * 0.38);

      w.aligned(right.text, 'right', MARGIN, WIDTH, w.y - 18, right.size, true, main);
      w.y -= height + 8;
      break;
    }
    case 'heading': {
      const size = HEADING[block.size];

      w.y -= 4;
      const before = w.y;

      w.paragraph(v(block.text), { size, bold: true, align: block.align });
      if (block.underline && w.y < before) {
        const lines = wrap(v(block.text), w.fonts.bold, size, WIDTH);
        const last = lines[lines.length - 1] ?? '';
        const lineWidth = w.fonts.bold.widthOfTextAtSize(last, size);
        const x = block.align === 'center' ? MARGIN + (WIDTH - lineWidth) / 2 : block.align === 'right' ? MARGIN + WIDTH - lineWidth : MARGIN;

        w.page.drawLine({ start: { x, y: w.y + size * 0.3 - 2 }, end: { x: x + lineWidth, y: w.y + size * 0.3 - 2 }, thickness: 0.8, color: INK });
      }
      w.y -= 6;
      break;
    }
    case 'text': {
      const value = v(block.text);

      if (!value.trim()) break;

      const size = block.size === 'sm' ? 9 : 10.5;
      const indent = block.prefix ? 28 : 0;
      const top = w.y;

      w.paragraph(value, {
        size,
        bold: block.bold,
        color: block.muted ? MUTED : INK,
        align: block.align,
        left: MARGIN + indent,
        width: WIDTH - indent,
      });
      if (block.prefix) w.textAt(v(block.prefix), MARGIN, top - size * 1.34 + size * 0.3, size, block.bold);
      w.y -= size * 0.5;
      break;
    }
    case 'fields': {
      const rowHeight = block.layout === 'grid' ? 24 : 22;
      const columns = block.columns;
      const colWidth = WIDTH / columns;
      const labelWidth = columns === 1 ? 110 : 100;

      for (let start = 0; start < block.rows.length; start += columns) {
        w.ensure(rowHeight);
        block.rows.slice(start, start + columns).forEach((row, index) => {
          const x = MARGIN + index * colWidth;
          const bottom = w.y - rowHeight;
          const mid = bottom + rowHeight / 2 - 3.5;

          if (block.layout === 'grid') {
            w.page.drawRectangle({ x, y: bottom, width: labelWidth, height: rowHeight, color: soft });
            w.page.drawRectangle({ x, y: bottom, width: colWidth, height: rowHeight, borderColor: grid, borderWidth: 0.75 });
            w.page.drawLine({ start: { x: x + labelWidth, y: bottom }, end: { x: x + labelWidth, y: w.y }, thickness: 0.75, color: grid });
            w.textAt(fit(v(row.label), w.fonts.bold, 9.5, labelWidth - 12).text, x + 7, mid, 9.5, true);
            const value = fit(v(row.value) || ' ', w.fonts.regular, 10.5, colWidth - labelWidth - 14);

            w.textAt(value.text, x + labelWidth + 7, mid, value.size);
          } else {
            w.textAt(fit(v(row.label), w.fonts.regular, 10, colWidth * 0.4).text, x, mid, 10, false, MUTED);
            const value = fit(v(row.value) || '-', w.fonts.regular, 10, colWidth * 0.58 - 8);

            w.aligned(value.text, 'right', x, colWidth - 8, mid, value.size);
            w.page.drawLine({ start: { x, y: bottom }, end: { x: x + colWidth - 8, y: bottom }, thickness: 0.5, color: grid });
          }
        });
        w.y -= rowHeight;
      }
      w.y -= 6;
      break;
    }
    case 'amount': {
      const height = 66;

      w.ensure(height + 8);
      w.page.drawRectangle({ x: MARGIN, y: w.y - height, width: WIDTH, height, color: soft });
      w.textAt(v(block.label).toUpperCase(), MARGIN + 14, w.y - 18, 8, true, main);
      w.textAt(context.amount.text, MARGIN + 14, w.y - 42, 22, true);
      w.textAt(fit(context.amount.words, w.fonts.regular, 9, WIDTH - 28).text, MARGIN + 14, w.y - 57, 9, false, MUTED);
      w.y -= height + 8;
      break;
    }
    case 'methods': {
      const labelWidth = 110;
      const left = MARGIN + labelWidth + 10;
      const right = MARGIN + WIDTH - 8;
      const itemWidth = (label: string) => 14 + w.fonts.regular.widthOfTextAtSize(safe(label), 9) + 14;
      // Tick boxes flow onto a second line when they don't fit.
      const lines: Array<typeof context.methods> = [[]];
      let x = left;

      for (const method of context.methods) {
        if (x + itemWidth(method.label) - 14 > right && lines[lines.length - 1].length) {
          lines.push([]);
          x = left;
        }
        lines[lines.length - 1].push(method);
        x += itemWidth(method.label);
      }

      const rowHeight = 10 + lines.length * 14;

      w.ensure(rowHeight + 6);
      const bottom = w.y - rowHeight;

      w.page.drawRectangle({ x: MARGIN, y: bottom, width: labelWidth, height: rowHeight, color: soft });
      w.page.drawRectangle({ x: MARGIN, y: bottom, width: WIDTH, height: rowHeight, borderColor: grid, borderWidth: 0.75 });
      w.page.drawLine({ start: { x: MARGIN + labelWidth, y: bottom }, end: { x: MARGIN + labelWidth, y: w.y }, thickness: 0.75, color: grid });
      w.textAt(fit(v(block.label), w.fonts.bold, 9.5, labelWidth - 12).text, MARGIN + 7, w.y - 15.5, 9.5, true);

      lines.forEach((line, index) => {
        const mid = w.y - 12 - index * 14;
        let at = left;

        for (const method of line) {
          w.page.drawRectangle({ x: at, y: mid - 5, width: 10, height: 10, borderColor: INK, borderWidth: 0.9, color: method.selected ? main : WHITE });
          if (method.selected) {
            w.page.drawLine({ start: { x: at + 2, y: mid }, end: { x: at + 4.2, y: mid - 2.8 }, thickness: 1.4, color: WHITE });
            w.page.drawLine({ start: { x: at + 4.2, y: mid - 2.8 }, end: { x: at + 8.2, y: mid + 3 }, thickness: 1.4, color: WHITE });
          }
          w.textAt(method.label, at + 14, mid - 3.5, 9, method.selected);
          at += itemWidth(method.label);
        }
      });
      w.y -= rowHeight + 6;
      break;
    }
    case 'months': {
      const rowHeight = 15.5;
      const tableWidth = WIDTH * 0.72;
      const left = MARGIN + (WIDTH - tableWidth) / 2;
      const half = tableWidth / 2;
      const rows: Array<{ a: string; b: string; bold: boolean }> = [
        { a: v(block.monthLabel), b: v(block.amountLabel), bold: true },
        ...(context.months.length ? context.months.map((m) => ({ a: m.month, b: m.amount, bold: false })) : [{ a: v(block.emptyText), b: '', bold: false }]),
        { a: v(block.totalLabel), b: context.total, bold: true },
      ];

      w.y -= 4;
      for (const row of rows) {
        w.ensure(rowHeight);
        const bottom = w.y - rowHeight;

        w.page.drawRectangle({ x: left, y: bottom, width: tableWidth, height: rowHeight, borderColor: INK, borderWidth: 0.75 });
        w.page.drawLine({ start: { x: left + half, y: bottom }, end: { x: left + half, y: w.y }, thickness: 0.75, color: INK });
        w.aligned(row.a, 'center', left, half, bottom + 4.5, 9.5, row.bold);
        w.aligned(row.b, 'center', left + half, half, bottom + 4.5, 9.5, row.bold);
        w.y -= rowHeight;
      }
      w.y -= 10;
      break;
    }
    case 'notes': {
      if (!context.notes.length) break;
      w.paragraph(v(block.title), { size: 10.5, bold: true, left: MARGIN + 28, width: WIDTH - 28 });
      for (const note of context.notes) w.paragraph(note, { size: 10.5, left: MARGIN + 28, width: WIDTH - 28 });
      w.y -= 5;
      break;
    }
    case 'signature': {
      const height = 70;
      const colWidth = WIDTH * 0.42;

      w.ensure(height);
      const side = block.signatureOn ?? 'left';
      const columns = [
        { label: block.leftLabel, name: block.leftName, x: MARGIN, image: side === 'left' },
        ...(block.showRight ? [{ label: block.rightLabel, name: block.rightName, x: MARGIN + WIDTH - colWidth, image: side === 'right' }] : []),
      ];

      for (const column of columns) {
        w.textAt(v(column.label), column.x, w.y - 12, 10);
        if (column.image && w.signature) {
          // Fits the image in the space above the line.
          const scale = Math.min(34 / w.signature.height, (colWidth * 0.7) / w.signature.width);

          w.page.drawImage(w.signature, {
            x: column.x,
            y: w.y - 49,
            width: w.signature.width * scale,
            height: w.signature.height * scale,
          });
        }
        for (let dash = 0; dash < colWidth; dash += 5) {
          w.page.drawLine({ start: { x: column.x + dash, y: w.y - 50 }, end: { x: column.x + Math.min(dash + 3, colWidth), y: w.y - 50 }, thickness: 0.7, color: INK });
        }
        w.textAt(fit(v(column.name), w.fonts.regular, 10, colWidth).text, column.x, w.y - 63, 10);
      }
      w.y -= height + 4;
      break;
    }
    case 'divider': {
      w.ensure(12);
      w.y -= 6;
      w.page.drawLine({ start: { x: MARGIN, y: w.y }, end: { x: MARGIN + WIDTH, y: w.y }, thickness: 1.2, color: INK });
      w.y -= 8;
      break;
    }
    case 'spacer':
      w.y -= SPACER[block.size];
      break;
  }
};

// Downloads and embeds the signature image (PNG or JPG); none if it can't.
export const embedSignature = async (doc: PDFDocument, url: string | null | undefined): Promise<PDFImage | null> => {
  if (!url) return null;
  try {
    const response = await fetch(url);

    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;

    return isPng ? await doc.embedPng(bytes) : isJpg ? await doc.embedJpg(bytes) : null;
  } catch (error) {
    console.warn('[rental] could not add the signature image:', error);

    return null;
  }
};

export const buildTemplatePdf = async (template: TemplateDoc, context: TemplateContext, title: string): Promise<Uint8Array> => {
  const doc = await PDFDocument.create();
  const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const accent = (template.accent && ACCENTS[template.accent]) || context.accent;
  const writer = new Writer(
    doc,
    fonts,
    { main: hex(accent.main), soft: hex(accent.soft), grid: hex(accent.grid) },
    await embedSignature(doc, context.signatureUrl),
  );

  doc.setTitle(safe(title));
  doc.setProducer('Rental');

  for (const block of template.blocks) {
    if (isShown(block, context)) drawBlock(writer, block, context);
  }

  if (context.watermark) {
    const mark = context.watermark;
    const size = 110;
    const markWidth = fonts.bold.widthOfTextAtSize(mark, size);

    for (const page of writer.pages) {
      page.drawText(mark, {
        x: A4.width / 2 - (markWidth / 2) * Math.cos(Math.PI / 6),
        y: A4.height / 2 + 120 - (markWidth / 2) * Math.sin(Math.PI / 6),
        size,
        font: fonts.bold,
        color: mark === 'VOID' ? rgb(0.8, 0.12, 0.12) : MUTED,
        opacity: 0.18,
        rotate: degrees(30),
      });
    }
  }

  return doc.save();
};
