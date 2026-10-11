import { inflateRawSync } from 'node:zlib';

// Reads the cell values of an .xlsx (no formatting): each sheet as rows of
// cells, numbers as numbers (dates stay Excel serial numbers), text as text.

export type XlsxCell = string | number | null;
export type XlsxSheetValues = { name: string; rows: XlsxCell[][] };

const unzip = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;

  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('This is not an Excel (.xlsx) file.');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map<string, Uint8Array>();

  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);

    files.set(name, method === 8 ? new Uint8Array(inflateRawSync(data)) : data);
    at += 46 + nameLength + extraLength + commentLength;
  }

  return files;
};

const decode = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');

const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');

const columnIndex = (ref: string) => {
  let index = 0;

  for (const ch of ref.replace(/\d+$/, '')) index = index * 26 + (ch.charCodeAt(0) - 64);

  return index - 1;
};

export const readXlsx = (bytes: Uint8Array): XlsxSheetValues[] => {
  const files = unzip(bytes);
  const read = (path: string) => {
    const file = files.get(path);

    return file ? new TextDecoder().decode(file) : '';
  };
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  const rels = new Map([...read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map((m) => [/Id="([^"]+)"/.exec(m[0])?.[1] ?? '', /Target="([^"]+)"/.exec(m[0])?.[1] ?? '']));

  return [...read('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const name = decode(/name="([^"]*)"/.exec(m[0])?.[1] ?? '');
    const target = rels.get(/r:id="([^"]+)"/.exec(m[0])?.[1] ?? '') ?? '';
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const rows: XlsxCell[][] = [];

    for (const row of read(path).matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const r = Number(/\br="(\d+)"/.exec(row[1])?.[1]) - 1;
      const cells: XlsxCell[] = [];

      for (const cell of (row[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /\br="([A-Z]+\d+)"/.exec(cell[1])?.[1];

        if (!ref) continue;
        const type = /\bt="([^"]+)"/.exec(cell[1])?.[1] ?? 'n';
        const body = cell[2] ?? '';
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let value: XlsxCell = null;

        if (type === 's') value = raw === undefined ? null : (shared[Number(raw)] ?? null);
        else if (type === 'inlineStr') value = texts(body);
        else if (type === 'str') value = raw === undefined ? null : decode(raw);
        else if (type === 'n' && raw !== undefined && raw !== '') value = Number(raw);
        cells[columnIndex(ref)] = value;
      }
      if (r >= 0) rows[r] = Array.from(cells, (v) => v ?? null);
    }

    return { name, rows: Array.from(rows, (row) => row ?? []) };
  });
};
