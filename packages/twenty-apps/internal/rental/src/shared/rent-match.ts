// Which tenant and month a bank transfer receipt pays: plain scoring, no AI.
// Each unpaid (or part-paid) month of each contract gets points out of 100:
//   payer is the tenant or a payer name learned before     40
//   amount equals what the month still owes                 25  (part / over: 10)
//   the transfer note names the unit, property or tenant    20
//   paid within 10 days before to 20 days after the due day 10
//   the note names that month (Oct, Okt, 10/2026)            5
// 80+ is shown as the match; 50-79 as choices; below that the person picks.

export type TransferScan = {
  isTransfer: boolean;
  status: 'SUCCESSFUL' | 'PENDING' | 'FAILED' | 'UNKNOWN';
  bank: string | null;
  amount: number | null;
  date: string | null; // YYYY-MM-DD
  referenceNo: string | null;
  payerName: string | null;
  payerAccountLast4: string | null;
  recipientName: string | null;
  note: string | null; // "Recipient reference" / "Payment details" the tenant typed
  unsure: string[];
  warning: string | null;
};

export type OpenMonth = {
  rentalId: string;
  month: string; // YYYY-MM-01
  owed: number; // RM still owed that month
  dueDate: string; // YYYY-MM-DD
  tenantName: string;
  propertyName: string;
  payerNames: string[]; // learned from earlier receipts
};

export type RentMatch = OpenMonth & { score: number; why: string[] };

const TITLES = /\b(MR|MRS|MS|MISS|MDM|DR|ENCIK|EN|PUAN|PN|CIK|TUAN|DATO|DATIN|BIN|BINTI|BT|BTE|A\/L|A\/P|AL|AP)\b\.?/g;

// "Mr. Tan Ah Kow" and "TAN AH KOW" compare equal.
export const normalizeName = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9/ ]+/g, ' ')
    .replace(TITLES, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Same person: equal, or one name's words all appear in the other (initials allowed:
// "TAN A K" matches "TAN AH KOW").
export const sameName = (a: string, b: string) => {
  const x = normalizeName(a);
  const y = normalizeName(b);

  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x.split(' '), y.split(' ')] : [y.split(' '), x.split(' ')];
  let from = 0;

  for (const word of short) {
    const at = long.findIndex((w, i) => i >= from && (w === word || (word.length === 1 && w.startsWith(word))));

    if (at < 0) return false;
    from = at + 1;
  }

  return short.length >= 2 || short[0].length >= 4;
};

const MONTH_WORDS = [
  ['JAN', 'JANUARY', 'JANUARI'],
  ['FEB', 'FEBRUARY', 'FEBRUARI'],
  ['MAR', 'MARCH', 'MAC'],
  ['APR', 'APRIL'],
  ['MAY', 'MEI'],
  ['JUN', 'JUNE'],
  ['JUL', 'JULY', 'JULAI'],
  ['AUG', 'AUGUST', 'OGOS', 'OGO'],
  ['SEP', 'SEPT', 'SEPTEMBER'],
  ['OCT', 'OCTOBER', 'OKT', 'OKTOBER'],
  ['NOV', 'NOVEMBER'],
  ['DEC', 'DECEMBER', 'DIS', 'DISEMBER'],
];

const daysBetween = (a: string, b: string) => (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

// Words in a unit or property name worth looking for: "B-12-3", "Unit 5", "Taman Melati".
const nameClues = (text: string) => {
  const upper = text.toUpperCase();
  const units = upper.match(/[A-Z]?\d+[A-Z]?(?:[-/][A-Z0-9]+)+|\b[A-Z]?\d{1,4}[A-Z]?\b/g) ?? [];
  const words = normalizeName(text).split(' ').filter((w) => w.length >= 4);

  return [...new Set([...units.map((u) => u.replace(/\s+/g, '')), ...words])];
};

export const scoreMonths = (scan: TransferScan, months: OpenMonth[]): RentMatch[] => {
  const note = (scan.note ?? '').toUpperCase();
  const noteCompact = note.replace(/\s+/g, '');

  return months
    .map((m) => {
      let score = 0;
      const why: string[] = [];
      const payer = scan.payerName ?? '';

      if (payer && (sameName(payer, m.tenantName) || m.payerNames.some((n) => sameName(payer, n)))) {
        score += 40;
        why.push('payer');
      }
      if (scan.amount !== null && m.owed > 0) {
        if (Math.abs(scan.amount - m.owed) < 0.005) {
          score += 25;
          why.push('amount');
        } else if (scan.amount > 0) {
          score += 10;
          why.push(scan.amount < m.owed ? 'part' : 'more');
        }
      }
      if (note) {
        const clues = [...nameClues(m.propertyName), ...normalizeName(m.tenantName).split(' ').filter((w) => w.length >= 4)];

        if (clues.some((clue) => noteCompact.includes(clue.replace(/\s+/g, '')))) {
          score += 20;
          why.push('note');
        }
        const monthIndex = Number(m.month.slice(5, 7)) - 1;
        const words = MONTH_WORDS[monthIndex];

        if (words.some((w) => new RegExp(`\\b${w}\\b`).test(note)) || note.includes(`${monthIndex + 1}/${m.month.slice(0, 4)}`)) {
          score += 5;
          why.push('month');
        }
      }
      if (scan.date) {
        const off = daysBetween(scan.date, m.dueDate);

        if (off >= -10 && off <= 20) {
          score += 10;
          why.push('date');
        }
      }

      return { ...m, score, why };
    })
    .sort((a, b) => b.score - a.score || a.month.localeCompare(b.month));
};
