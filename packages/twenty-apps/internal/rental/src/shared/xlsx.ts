// A small .xlsx writer (one sheet, styled cells, merged cells, frozen panes,
// column widths) with no dependencies: an .xlsx file is a zip of XML parts,
// written here uncompressed ("stored"), which Excel and Google Sheets accept.

export type XlsxStyle = {
  bold?: boolean;
  color?: string; // font colour, 'RRGGBB'
  fill?: string; // background, 'RRGGBB'
  align?: 'left' | 'center' | 'right';
  wrap?: boolean;
  format?: 'int' | 'num' | 'money' | 'months'; // 0 / 0.## / #,##0.00 / 0.0
  border?: boolean;
  size?: number;
  italic?: boolean;
};

export type XlsxCell = { value: string | number | null; style?: XlsxStyle } | string | number | null;

export type XlsxSheet = {
  name: string;
  rows: XlsxCell[][];
  widths?: number[]; // characters per column
  merges?: Array<[number, number, number, number]>; // [row, col, row, col], 0-based, inclusive
  freeze?: { rows: number; cols: number };
  heights?: Record<number, number>; // row index -> points
};

// ---------------------------------------------------------------- zip (stored)

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n++) {
    let c = n;

    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }

  return table;
})();

const crc32 = (data: Uint8Array) => {
  let crc = 0xffffffff;

  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);

  return (crc ^ 0xffffffff) >>> 0;
};

const zip = (files: Array<{ name: string; data: Uint8Array }>) => {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = new DataView(new ArrayBuffer(30));

    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint32(14, crc, true);
    local.setUint32(18, file.data.length, true);
    local.setUint32(22, file.data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, file.data);

    const entry = new DataView(new ArrayBuffer(46));

    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, file.data.length, true);
    entry.setUint32(24, file.data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + file.data.length;
  }

  const centralSize = central.reduce((sum, c) => sum + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));

  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const parts = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;

  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }

  return out;
};

// ---------------------------------------------------------------- workbook

const escapeXml = (text: string) =>
  text.replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch] as string).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

const columnName = (index: number) => {
  let name = '';
  let n = index + 1;

  while (n > 0) {
    const rest = (n - 1) % 26;

    name = String.fromCharCode(65 + rest) + name;
    n = Math.floor((n - 1) / 26);
  }

  return name;
};

const FORMAT_IDS: Record<string, number> = { int: 1, money: 4, num: 164, months: 165 };

export const buildXlsx = (sheet: XlsxSheet): Uint8Array => {
  const fonts: string[] = ['<font><sz val="10"/><name val="Arial"/></font>'];
  const fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const xfIndex = new Map<string, number>();
  const fontIndex = new Map<string, number>();
  const fillIndex = new Map<string, number>();

  const styleId = (style?: XlsxStyle) => {
    if (!style) return 0;
    const key = JSON.stringify(style);
    const known = xfIndex.get(key);

    if (known !== undefined) return known;

    const fontKey = `${style.bold ? 'b' : ''}${style.italic ? 'i' : ''}|${style.color ?? ''}|${style.size ?? 10}`;
    let fontId = fontIndex.get(fontKey);

    if (fontId === undefined) {
      fontId = fonts.length;
      fonts.push(
        `<font>${style.bold ? '<b/>' : ''}${style.italic ? '<i/>' : ''}<sz val="${style.size ?? 10}"/>${style.color ? `<color rgb="FF${style.color}"/>` : ''}<name val="Arial"/></font>`,
      );
      fontIndex.set(fontKey, fontId);
    }

    let fillId = 0;

    if (style.fill) {
      const known = fillIndex.get(style.fill);

      if (known !== undefined) fillId = known;
      else {
        fillId = fills.length;
        fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="FF${style.fill}"/><bgColor indexed="64"/></patternFill></fill>`);
        fillIndex.set(style.fill, fillId);
      }
    }

    const numFmtId = style.format ? FORMAT_IDS[style.format] : 0;
    const align = style.align || style.wrap ? `<alignment${style.align ? ` horizontal="${style.align}"` : ''} vertical="center"${style.wrap ? ' wrapText="1"' : ''}/>` : '';

    xfs.push(
      `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${style.border ? 1 : 0}" xfId="0"${numFmtId ? ' applyNumberFormat="1"' : ''} applyFont="1"${fillId ? ' applyFill="1"' : ''}${style.border ? ' applyBorder="1"' : ''}${align ? ' applyAlignment="1">' + align + '</xf>' : '/>'}`,
    );
    xfIndex.set(key, xfs.length - 1);

    return xfs.length - 1;
  };

  const rowsXml = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((raw, c) => {
          const cell = raw !== null && typeof raw === 'object' ? raw : { value: raw };
          const ref = `${columnName(c)}${r + 1}`;
          const s = styleId(cell.style);
          const sAttr = s ? ` s="${s}"` : '';

          if (cell.value === null || cell.value === '') return s ? `<c r="${ref}"${sAttr}/>` : '';
          if (typeof cell.value === 'number' && Number.isFinite(cell.value)) return `<c r="${ref}"${sAttr}><v>${cell.value}</v></c>`;

          return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(cell.value))}</t></is></c>`;
        })
        .join('');
      const height = sheet.heights?.[r];

      return `<row r="${r + 1}"${height ? ` ht="${height}" customHeight="1"` : ''}>${cells}</row>`;
    })
    .join('');

  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const freeze = sheet.freeze
    ? `<sheetViews><sheetView workbookViewId="0"><pane xSplit="${sheet.freeze.cols}" ySplit="${sheet.freeze.rows}" topLeftCell="${columnName(sheet.freeze.cols)}${sheet.freeze.rows + 1}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>`
    : '';
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map(([r1, c1, r2, c2]) => `<mergeCell ref="${columnName(c1)}${r1 + 1}:${columnName(c2)}${r2 + 1}"/>`).join('')}</mergeCells>`
    : '';

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${freeze}${cols}<sheetData>${rowsXml}</sheetData>${merges}</worksheet>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.##"/><numFmt numFmtId="165" formatCode="0.0"/></numFmts><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const sheetName = escapeXml(sheet.name.replace(/[[\]*?/\\:]/g, ' ').slice(0, 31));
  const encoder = new TextEncoder();

  return zip([
    {
      name: '[Content_Types].xml',
      data: encoder.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      ),
    },
    {
      name: '_rels/.rels',
      data: encoder.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: encoder.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      ),
    },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheetXml) },
    { name: 'xl/styles.xml', data: encoder.encode(stylesXml) },
  ]);
};
