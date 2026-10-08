// Rent chasing shared by the server and the pages: how a tenant was last
// reminded, and whether that was recent enough not to remind them again.

export type ChaseChannel = 'AUTO' | 'LIST' | 'CAMPAIGN' | 'TODAY';

export type ChaseInfo = {
  at: string; // ISO date-time of the latest reminder
  channel: ChaseChannel;
  months: string[]; // YYYY-MM chased in the window
};

// A tenant reminded within this many days isn't reminded again by another
// channel (they can still be messaged by hand).
export const RECENT_CHASE_DAYS = 3;

export const CHANNEL_LABEL: Record<ChaseChannel, string> = {
  AUTO: 'automatic reminder',
  LIST: 'reminder list',
  CAMPAIGN: 'Rent-due campaign',
  TODAY: 'Today page',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Malaysia date of a timestamp, e.g. "7 Oct".
const shortMyt = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 8 * 3_600_000);

  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

const daysAgo = (iso: string, today: string) =>
  Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${new Date(new Date(iso).getTime() + 8 * 3_600_000).toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000);

export const isRecentChase = (chase: ChaseInfo | undefined, today: string) => Boolean(chase && daysAgo(chase.at, today) < RECENT_CHASE_DAYS);

// "Reminded 7 Oct (2 days ago) via Today page"
export const chaseNote = (chase: ChaseInfo, today: string) => {
  const ago = daysAgo(chase.at, today);

  return `Reminded ${shortMyt(chase.at)}${ago === 0 ? ' (today)' : ago === 1 ? ' (yesterday)' : ` (${ago} days ago)`} via ${CHANNEL_LABEL[chase.channel]}`;
};
