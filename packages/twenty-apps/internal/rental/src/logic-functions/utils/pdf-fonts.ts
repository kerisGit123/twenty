// fontkit's Indic shaper (Tamil) needs this global.
import 'regenerator-runtime/runtime.js';

import fontkit from '@pdf-lib/fontkit';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Color, type Degrees, type PDFDocument, type PDFFont, type PDFPage, StandardFonts } from 'pdf-lib';

// Fonts for every PDF the app draws. Names and addresses come in Chinese and
// Tamil as well as Latin, and the built-in Helvetica only prints Latin-1, so
// text is split into runs by script and each run drawn with a Noto font that
// has it. Only the glyphs used end up in the PDF (a few KB, not megabytes).
//
// The font files are downloaded once and kept in PDF_FONT_CACHE_DIR (else the
// temp folder). If they can't be had, it falls back to Helvetica and drops
// what Helvetica can't print — the PDF still comes out.

type Script = 'latin' | 'cjk' | 'tamil';
type Weight = 'regular' | 'bold';

const NOTO = 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts';
const NOTO_MIRROR = 'https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts';
// Pinned, from two different jsDelivr edges.
const SC = 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@5.3.0';
const SC_MIRROR = 'https://gcore.jsdelivr.net/fontsource/fonts/noto-sans-sc@5.3.0';
const SOURCES: Record<Script, Record<Weight, { file: string; urls: string[] }>> = {
  latin: {
    regular: { file: 'NotoSans-Regular.ttf', urls: [`${NOTO}/NotoSans/hinted/ttf/NotoSans-Regular.ttf`, `${NOTO_MIRROR}/NotoSans/hinted/ttf/NotoSans-Regular.ttf`] },
    bold: { file: 'NotoSans-Bold.ttf', urls: [`${NOTO}/NotoSans/hinted/ttf/NotoSans-Bold.ttf`, `${NOTO_MIRROR}/NotoSans/hinted/ttf/NotoSans-Bold.ttf`] },
  },
  // Simplified Chinese (static TTF; the full CJK OTFs don't subset well).
  cjk: {
    regular: { file: 'NotoSansSC-400.ttf', urls: [`${SC}/chinese-simplified-400-normal.ttf`, `${SC_MIRROR}/chinese-simplified-400-normal.ttf`] },
    bold: { file: 'NotoSansSC-700.ttf', urls: [`${SC}/chinese-simplified-700-normal.ttf`, `${SC_MIRROR}/chinese-simplified-700-normal.ttf`] },
  },
  tamil: {
    regular: { file: 'NotoSansTamil-Regular.ttf', urls: [`${NOTO}/NotoSansTamil/hinted/ttf/NotoSansTamil-Regular.ttf`, `${NOTO_MIRROR}/NotoSansTamil/hinted/ttf/NotoSansTamil-Regular.ttf`] },
    bold: { file: 'NotoSansTamil-Bold.ttf', urls: [`${NOTO}/NotoSansTamil/hinted/ttf/NotoSansTamil-Bold.ttf`, `${NOTO_MIRROR}/NotoSansTamil/hinted/ttf/NotoSansTamil-Bold.ttf`] },
  },
};

const CJK = /[\u2E80-\u2FFF\u3000-\u30FF\u3100-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF\u{20000}-\u{3134F}]/u;
// Never at the start of a line (Chinese line-breaking rule).
const NO_LINE_START = /^[\uFF0C\u3002\u3001\uFF1B\uFF1A\uFF01\uFF1F\uFF09\u300D\u300F\u300B\u3009\u3011,.;:!?)]/u;
const TAMIL = /[\u0B80-\u0BFF]/;
// Joiners belong to the Tamil syllable they sit in.
const JOINER = /[\u200C\u200D]/;

const scriptOf = (ch: string, previous: Script): Script => (CJK.test(ch) ? 'cjk' : TAMIL.test(ch) || (JOINER.test(ch) && previous === 'tamil') ? 'tamil' : 'latin');

// Nothing any font here can draw: controls, emoji, symbols-only planes.
const UNPRINTABLE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu;

export const cleanText = (text: string) => (text ?? '').replace(/\t/g, ' ').replace(UNPRINTABLE, '');

// One line: a line break inside is a space (pdf-lib would start a new line
// 24pt down and the runs after it would land in the wrong place).
const oneLine = (text: string) => cleanText(text).replace(/\s*\n\s*/g, ' ');

// Splits into what a reader sees as characters, so cutting text short never
// leaves half a Tamil syllable or half an emoji pair.
export const graphemes = (text: string): string[] => {
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: string }) => { segment: (t: string) => Iterable<{ segment: string }> } })
    .Segmenter;

  return Segmenter ? Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (part) => part.segment) : Array.from(text);
};

// Helvetica fallback only covers WinAnsi.
const winAnsi = (text: string) => cleanText(text).replace(/[^\n\x20-\x7E\xA0-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]/g, '');

const runsOf = (text: string): Array<{ script: Script; text: string }> => {
  const runs: Array<{ script: Script; text: string }> = [];

  for (const ch of text) {
    const last = runs[runs.length - 1];
    const script = scriptOf(ch, last?.script ?? 'latin');

    if (last && last.script === script) last.text += ch;
    else runs.push({ script, text: ch });
  }

  return runs;
};

export type DrawOptions = { x: number; y: number; size: number; font: TextFont; color?: Color; opacity?: number; rotate?: Degrees };

// Looks like a PDFFont where measuring is concerned, so wrap/fit helpers work
// unchanged; draw with drawText() below.
export class TextFont {
  constructor(
    private readonly fonts: Partial<Record<Script, PDFFont>>,
    private readonly fallback: PDFFont | null,
  ) {}

  private pieces(text: string) {
    if (this.fallback) return [{ font: this.fallback, text: winAnsi(oneLine(text)) }];

    return runsOf(oneLine(text)).flatMap((run) => {
      const font = this.fonts[run.script] ?? this.fonts.latin;

      // A script whose font couldn't be loaded is left out rather than boxed.
      return font && (this.fonts[run.script] || run.script === 'latin') ? [{ font, text: run.text }] : [];
    });
  }

  widthOfTextAtSize(text: string, size: number) {
    return this.pieces(text).reduce((sum, piece) => sum + piece.font.widthOfTextAtSize(piece.text, size), 0);
  }

  heightAtSize(size: number) {
    return (this.fallback ?? (this.fonts.latin as PDFFont)).heightAtSize(size);
  }

  draw(page: PDFPage, text: string, options: Omit<DrawOptions, 'font'>) {
    let x = options.x;
    const angle = options.rotate ? (options.rotate.angle * Math.PI) / 180 : 0;
    let y = options.y;

    for (const piece of this.pieces(text)) {
      if (!piece.text) continue;
      page.drawText(piece.text, { ...options, x, y, font: piece.font });
      const advance = piece.font.widthOfTextAtSize(piece.text, options.size);

      x += advance * Math.cos(angle);
      y += advance * Math.sin(angle);
    }
  }
}

export const drawText = (page: PDFPage, text: string, options: DrawOptions) => {
  const { font, ...rest } = options;

  font.draw(page, text, rest);
};

// Splits text into lines that fit; Chinese can break between any two
// characters, everything else between words.
export const wrapText = (text: string, font: TextFont, size: number, maxWidth: number) => {
  const out: string[] = [];

  for (const paragraph of cleanText(text).split('\n')) {
    let line = '';
    let space = false;

    for (const token of paragraph.match(new RegExp(`${CJK.source}|[^\\s${CJK.source.slice(1, -1)}]+|\\s+`, 'gu')) ?? []) {
      if (/^\s+$/.test(token)) {
        space = true;
        continue;
      }
      const candidate = line ? `${line}${space ? ' ' : ''}${token}` : token;

      // Closing punctuation stays on the line it ends, even a little over.
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || (line && !space && NO_LINE_START.test(token))) line = candidate;
      else {
        if (line) out.push(line);
        line = token;
      }
      space = false;
    }
    out.push(line);
  }

  while (out.length && !out[out.length - 1]) out.pop();

  return out;
};

// ---------------------------------------------------------------- loading

const cacheDir = () => process.env.PDF_FONT_CACHE_DIR?.trim() || join(tmpdir(), 'rental-pdf-fonts');

// TrueType / OpenType signature: 00 01 00 00, 'OTTO' or 'true'.
const isFont = (bytes: Uint8Array) => {
  const head = Array.from(bytes.slice(0, 4));
  const tag = String.fromCharCode(...head);

  return bytes.length > 1000 && (head.join(',') === '0,1,0,0' || tag === 'OTTO' || tag === 'true');
};

const fontPath = (script: Script, weight: Weight) => join(cacheDir(), SOURCES[script][weight].file);

const fontBytes = async (script: Script, weight: Weight): Promise<Uint8Array | null> => {
  const source = SOURCES[script][weight];
  const path = fontPath(script, weight);

  try {
    const cached = new Uint8Array(await readFile(path));

    if (isFont(cached)) return cached;
    // Not a font (a broken download): fetch it again.
    await unlink(path).catch(() => undefined);
  } catch {
    // not cached yet
  }
  try {
    let bytes: Uint8Array | null = null;
    let failure = '';

    // CDNs hiccup now and then; try the next source.
    for (const url of source.urls) {
      try {
        // A stalled CDN mustn't use up the whole function's time.
        const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });

        if (response.ok) {
          const body = new Uint8Array(await response.arrayBuffer());

          if (isFont(body)) {
            bytes = body;
            break;
          }
          failure = 'not a font file';
          continue;
        }
        failure = `HTTP ${response.status}`;
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
    }
    if (!bytes) throw new Error(failure);

    try {
      await mkdir(cacheDir(), { recursive: true });
      // Write then rename, so a half-written file is never read.
      const temp = `${path}.${process.pid}.tmp`;

      await writeFile(temp, bytes);
      await rename(temp, path).catch(async (error) => {
        // e.g. Windows refusing while another call reads the file.
        await unlink(temp).catch(() => undefined);
        throw error;
      });
    } catch (error) {
      console.warn('[rental] could not cache a PDF font:', error);
    }

    return bytes;
  } catch (error) {
    console.warn(`[rental] could not download the ${script} ${weight} PDF font:`, error);

    return null;
  }
};

export type PdfFonts = { regular: TextFont; bold: TextFont };

// Embeds the fonts the given text needs (Latin always; Chinese / Tamil only
// when they appear in it).
export const loadPdfFonts = async (doc: PDFDocument, sample: string): Promise<PdfFonts> => {
  doc.registerFontkit(fontkit);

  const scripts: Script[] = ['latin', ...(CJK.test(sample) ? (['cjk'] as const) : []), ...(TAMIL.test(sample) ? (['tamil'] as const) : [])];
  const embedded: Record<Weight, Partial<Record<Script, PDFFont>>> = { regular: {}, bold: {} };

  await Promise.all(
    scripts.flatMap((script) =>
      (['regular', 'bold'] as const).map(async (weight) => {
        const bytes = await fontBytes(script, weight);

        if (!bytes) return;
        try {
          embedded[weight][script] = await doc.embedFont(bytes, { subset: true });
        } catch (error) {
          console.warn(`[rental] could not embed the ${script} ${weight} PDF font:`, error);
          // Don't keep a file that can't be used; it's fetched again next time.
          await unlink(fontPath(script, weight)).catch(() => undefined);
        }
      }),
    ),
  );

  // No Latin font: the whole document falls back to Helvetica.
  if (!embedded.regular.latin || !embedded.bold.latin) {
    return {
      regular: new TextFont({}, await doc.embedFont(StandardFonts.Helvetica)),
      bold: new TextFont({}, await doc.embedFont(StandardFonts.HelveticaBold)),
    };
  }

  return { regular: new TextFont(embedded.regular, null), bold: new TextFont(embedded.bold, null) };
};
