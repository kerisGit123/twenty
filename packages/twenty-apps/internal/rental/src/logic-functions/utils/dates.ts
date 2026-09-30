// All rental dates are Malaysia dates (UTC+8), handled as 'YYYY-MM-DD' strings
// so nothing shifts across timezones.
export const RENTAL_TIME_ZONE = 'Asia/Kuala_Lumpur';

export const todayIso = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: RENTAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const pad = (n: number) => String(n).padStart(2, '0');

export const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

// First day of the month containing the date.
export const monthStart = (iso: string): string => `${iso.slice(0, 7)}-01`;

// First day of the following month.
export const nextMonthStart = (iso: string): string => {
  const [year, month] = iso.slice(0, 10).split('-').map(Number);

  return month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
};

// The due date in the given month, clamped (due day 31 → 30 Apr, 28/29 Feb).
export const dueDateInMonth = (monthIso: string, dueDay: number): string => {
  const [year, month] = monthIso.slice(0, 10).split('-').map(Number);
  const day = Math.min(Math.max(Math.round(dueDay) || 1, 1), daysInMonth(year, month));

  return `${year}-${pad(month)}-${pad(day)}`;
};
