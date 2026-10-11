// Reads a monthly 订货单 (restock order listing) sheet into products, the
// stock at the start of the month, this month's order and dated take-outs.
// Columns are found by their headings, so moved or extra columns are fine.

type Cell = string | number | null;

export type ImportTake = { date: string; units: number };

export type ImportRow = {
  code: string;
  name: string;
  specification: string;
  group: string;
  unit: string;
  unitsPerCarton: number;
  perCartonGuessed: boolean; // item/ctn was blank: read from the spec or name, else 1
  cartonPrice: number;
  openingUnits: number; // 数量 Quantity (cartons) x item/ctn
  orderUnits: number; // "this month ordering by ctn" x item/ctn
  expiryDate: string | null;
  takes: ImportTake[];
};

export type ImportSheet = {
  sheet: string;
  sheetDate: string | null;
  takeDates: string[];
  rows: ImportRow[];
  warnings: string[];
};

const clean = (value: Cell) => String(value ?? '').replace(/\s+/g, ' ').trim();

// Excel keeps dates as days since 1899-12-30.
export const excelDate = (value: Cell): string | null => {
  if (typeof value === 'number' && value > 20_000 && value < 80_000) return new Date(Math.round((value - 25_569) * 86_400_000)).toISOString().slice(0, 10);
  if (typeof value === 'string') {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());

    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(value.trim());

    if (dmy) return `${dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  return null;
};

const number = (value: Cell) => {
  const n = typeof value === 'number' ? value : Number(clean(value).replace(/[^0-9.-]/g, ''));

  return Number.isFinite(n) ? n : 0;
};

// item/ctn from the text when the column is blank: "(20 bag/Ctn)", "8袋/件", "12卷/件".
const perCartonFrom = (...texts: string[]) => {
  for (const t of texts) {
    const m = /\(\s*(\d+(?:\.\d+)?)\s*[A-Za-z]+\s*\/\s*ctn\s*\)/i.exec(t) ?? /(\d+(?:\.\d+)?)\s*[^\d\s*/()]{0,3}\s*\/\s*(?:件|箱|ctn)/i.exec(t);

    if (m && Number(m[1]) > 0) return Number(m[1]);
  }

  return 0;
};

// Units come out of cartons x per carton, so round off float noise.
const units = (value: number) => Math.round(value * 100) / 100;

const SECTIONS: Array<[RegExp, string]> = [
  [/原料|raw/i, 'RAW'],
  [/包材|packag/i, 'PACKAGING'],
  [/其他|other/i, 'OTHER'],
  [/merch|uniform|制服/i, 'MERCH'],
];
const GROUP_BY_DIGIT: Record<string, string> = { '1': 'RAW', '2': 'PACKAGING', '3': 'OTHER', '4': 'MERCH' };

const HEADINGS = {
  code: /item code|存货编码/i,
  name: /product name|产品名称/i,
  spec: /specification|规格/i,
  quantity: /^(数量|quantity)|数量 ?quantity/i,
  price: /unit price|单价/i,
  order: /ordering by ctn|order(ing)? .*ctn/i,
  perCarton: /item ?\/ ?ctn/i,
  inHand: /qty in hand/i,
  expiry: /expir/i,
  consumption: /monthly ?com?sumption/i,
};

export const parseStockSheet = (name: string, rows: Cell[][]): ImportSheet | null => {
  const headerAt = rows.findIndex((row) => row.some((v) => HEADINGS.code.test(clean(v))) && row.some((v) => HEADINGS.name.test(clean(v))));

  if (headerAt < 0) return null;
  const header = rows[headerAt];
  const col = (pattern: RegExp) => header.findIndex((v) => typeof v === 'string' && pattern.test(clean(v)));
  const at = Object.fromEntries(Object.entries(HEADINGS).map(([key, pattern]) => [key, col(pattern)])) as Record<keyof typeof HEADINGS, number>;
  const warnings: string[] = [];

  if (at.perCarton < 0) warnings.push('No "item/Ctn" column: every product is taken as 1 unit per carton.');
  // Take-out columns: headings that are dates, after the expiry column.
  const stop = at.consumption >= 0 ? at.consumption : header.length;
  const takeCols = header
    .map((v, index) => ({ index, date: index > Math.max(at.expiry, at.inHand, at.perCarton) && index < stop ? excelDate(v) : null }))
    .filter((x): x is { index: number; date: string } => !!x.date);
  const undatedCols = header.map((v, index) => ({ v: clean(v), index })).filter((x) => x.index < stop && /tarikh ambil/i.test(x.v)).map((x) => x.index);
  // 日期 Date: on the top rows.
  let sheetDate: string | null = null;

  for (const row of rows.slice(0, headerAt)) {
    const label = row.findIndex((v) => /日期|^date/i.test(clean(v)));

    if (label >= 0) sheetDate = row.slice(label + 1).map(excelDate).find(Boolean) ?? null;
    if (sheetDate) break;
  }

  const result: ImportRow[] = [];
  let group = '';
  let undated = 0;

  for (const row of rows.slice(headerAt + 1)) {
    const rawCode = row[at.code];
    const productName = clean(row[at.name]);
    const code = typeof rawCode === 'number' ? rawCode.toFixed(3) : /^\d+(\.\d+)?$/.test(clean(rawCode)) ? clean(rawCode) : '';

    if (!code || !productName) {
      // A section heading row (原料 RAW MATERIALS, 其他 OTHER MATERIALS); stop at the total.
      const label = row.map(clean).filter(Boolean).join(' ');

      if (/总计|^total/i.test(label)) break;
      const section = SECTIONS.find(([pattern]) => pattern.test(label));

      if (section && label.length < 40) group = section[1];
      continue;
    }
    const spec = String(row[at.spec] ?? '').replace(/\s*\n\s*/g, ' ').trim();
    const fromColumn = at.perCarton >= 0 ? number(row[at.perCarton]) : 0;
    const perCarton = fromColumn || perCartonFrom(spec, productName) || 1;
    const cartons = at.quantity >= 0 ? number(row[at.quantity]) : 0;
    const inHand = at.inHand >= 0 ? number(row[at.inHand]) : 0;
    const unitMatch = /\(\s*[\d.]*\s*([A-Za-z]+)/.exec(spec);

    undated += undatedCols.filter((index) => number(row[index]) > 0).length;
    result.push({
      code,
      name: productName,
      specification: spec,
      // The code's first digit is the WeDrink group (2.xxx packaging even under 原料).
      group: GROUP_BY_DIGIT[code[0]] || group || 'OTHER',
      unit: unitMatch ? unitMatch[1].toLowerCase() : 'unit',
      unitsPerCarton: perCarton,
      perCartonGuessed: !fromColumn,
      cartonPrice: at.price >= 0 ? number(row[at.price]) : 0,
      openingUnits: units(cartons ? cartons * perCarton : inHand),
      orderUnits: units(at.order >= 0 ? number(row[at.order]) * perCarton : 0),
      expiryDate: at.expiry >= 0 ? excelDate(row[at.expiry]) : null,
      takes: takeCols.map(({ index, date }) => ({ date, units: units(number(row[index])) })).filter((t) => t.units > 0),
    });
  }
  if (undated) warnings.push(`${undated} take-out number${undated === 1 ? '' : 's'} under "tarikh ambil" have no date and were left out.`);
  const codes = new Set<string>();

  for (const r of result) {
    if (codes.has(r.code)) warnings.push(`Item code ${r.code} appears more than once; only the first is used.`);
    codes.add(r.code);
  }

  return { sheet: name, sheetDate, takeDates: takeCols.map((c) => c.date), rows: result.filter((r, i) => result.findIndex((x) => x.code === r.code) === i), warnings };
};

// The sheet with the most products (the 原料 order sheet, not a summary).
export const pickStockSheet = (sheets: Array<{ name: string; rows: Cell[][] }>) =>
  sheets
    .map((s) => parseStockSheet(s.name, s.rows))
    .filter((s): s is ImportSheet => !!s)
    .sort((a, b) => b.rows.length - a.rows.length || Number(/wawa/i.test(a.sheet)) - Number(/wawa/i.test(b.sheet)))[0] ?? null;

// What would change for a product that already exists.
export const importChanges = (row: ImportRow, item: { name: string; specification: string; unitsPerCarton: number; cartonPrice: number }) => {
  const changes: string[] = [];

  const same = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

  if (!same(row.name, item.name)) changes.push('name');
  if (row.specification && !same(row.specification, item.specification)) changes.push('spec');
  // A blank item/ctn never overrides the one already set.
  if (!row.perCartonGuessed && row.unitsPerCarton !== item.unitsPerCarton) changes.push(`item/ctn ${item.unitsPerCarton} → ${row.unitsPerCarton}`);
  if (Math.abs(row.cartonPrice - item.cartonPrice) > 0.004) changes.push(`price ${item.cartonPrice} → ${row.cartonPrice}`);

  return changes;
};

// Closing = opening + this month's order - take-outs (the sheet's "balance unit").
export const importClosing = (row: ImportRow) => Math.round((row.openingUnits + row.orderUnits - row.takes.reduce((sum, t) => sum + t.units, 0)) * 100) / 100;

const dayBefore = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

// Suggested dates: the opening the day before the first take-out; the
// closing on the sheet's date (or the last take-out, if later).
export const importDates = (sheet: Pick<ImportSheet, 'sheetDate' | 'takeDates'>, today: string) => {
  const dates = [...sheet.takeDates].sort();
  const opening = dates.length ? dayBefore(dates[0]) : (sheet.sheetDate ?? today);
  const known = [sheet.sheetDate, dates[dates.length - 1]].filter((d): d is string => !!d).sort();
  const closing = known[known.length - 1] ?? today;

  return { opening, closing };
};
