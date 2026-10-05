// The WhatsApp side of the contact book: what can be logged after a message
// (the app can't read replies on its own), and how a person's history is
// shown.

export const ACTIVITY_KINDS = [
  { value: 'REPLIED', label: 'Replied', icon: '💬', color: 'blue', outcome: true },
  { value: 'INTERESTED', label: 'Interested', icon: '👍', color: 'green', outcome: true },
  { value: 'NOT_INTERESTED', label: 'Not interested', icon: '👎', color: 'gray', outcome: true },
  { value: 'STOP', label: 'Asked to stop', icon: '🛑', color: 'red', outcome: true },
  { value: 'WRONG_NUMBER', label: 'Wrong number', icon: '❌', color: 'orange', outcome: true },
  { value: 'NOTE', label: 'Note', icon: '📝', color: 'gray', outcome: false },
  { value: 'FOLLOW_UP', label: 'Follow-up', icon: '⏰', color: 'purple', outcome: false },
  { value: 'MESSAGE', label: 'Messaged', icon: '📤', color: 'sky', outcome: false },
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number]['value'];

export const OUTCOMES = ACTIVITY_KINDS.filter((k) => k.outcome);

export const activityKind = (value: string | null | undefined) => ACTIVITY_KINDS.find((k) => k.value === value) ?? ACTIVITY_KINDS[5];

// One line in a person's WhatsApp history.
export type HistoryEntry = {
  key: string;
  at: string; // ISO date-time (or date)
  kind: 'campaign' | 'reminder' | 'receipt' | 'activity';
  icon: string;
  title: string;
  detail: string;
  activityId?: string; // for notes / follow-ups
  followUpOn?: string | null;
  done?: boolean;
  outcome?: string; // REPLIED, INTERESTED...
};

export type CampaignResults = {
  sent: number;
  outcomes: Record<string, number>; // REPLIED: 3, ...
  byPerson: Record<string, string>; // personId -> latest outcome
  replyRate: number; // 0..1, any outcome except wrong number
};

export type CleanupPerson = {
  id: string;
  name: string;
  phone: string | null;
  language: string;
  optedOut: boolean;
  tags: string[];
  isTenant: boolean;
  wrongNumber: boolean;
};

export type FollowUp = { id: string; personId: string; personName: string; phone: string | null; note: string; followUpOn: string; campaignId: string | null; ownerId: string | null };
