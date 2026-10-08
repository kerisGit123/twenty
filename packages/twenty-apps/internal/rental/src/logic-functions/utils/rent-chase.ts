import { type CoreApiClient } from 'twenty-client-sdk/core';

import { todayIso } from 'src/logic-functions/utils/dates';
import { queryAll } from 'src/logic-functions/utils/query-all';
import { type ChaseChannel, type ChaseInfo, RECENT_CHASE_DAYS } from 'src/shared/rent-chase';

// One record of every time a tenant was chased for rent, whichever way it
// went (automatic reminder, the reminder list, a Rent-due campaign, the Today
// button). Stored in the notification log, one row per contract-month, so
// every channel can see what the others already did.

export type ChaseRecord = {
  contractId: string;
  months: string[]; // YYYY-MM-01
  channel: ChaseChannel;
  status: 'SENT' | 'SKIPPED' | 'FAILED';
  kind: 'RENT_UPCOMING' | 'RENT_DUE' | 'RENT_OVERDUE';
  title: string;
  to: string | null;
  body: string;
  error?: string;
};

export const chaseKey = (kind: string, contractId: string, month: string) => `${kind}:${contractId}:${month.slice(0, 7)}`;

export const recordChase = async (client: CoreApiClient, record: ChaseRecord) => {
  for (const month of record.months) {
    await client.mutation({
      createNotificationLog: {
        __args: {
          data: {
            name: record.title,
            kind: record.kind,
            recipient: record.to ?? '',
            body: record.body,
            status: record.status,
            error: (record.error ?? '').slice(0, 500),
            dedupKey: chaseKey(record.kind, record.contractId, month),
            contractId: record.contractId,
            rentMonth: month.slice(0, 7),
            channel: record.channel,
          } as never,
        },
        id: true,
      },
    });
  }
};

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
};

// The latest chase per contract (sent in the last `days` days), and which
// months each contract was chased for.
export const loadChases = async (client: CoreApiClient, days = 14): Promise<Record<string, ChaseInfo>> => {
  const since = `${addDays(todayIso(), -days)}T00:00:00Z`;
  const rows = await queryAll<{ contractId?: string | null; rentMonth?: string | null; channel?: string | null; createdAt?: string | null }>(
    client,
    'notificationLogs',
    { filter: { contractId: { is: 'NOT_NULL' }, status: { eq: 'SENT' }, createdAt: { gte: since } } },
    { contractId: true, rentMonth: true, channel: true, createdAt: true },
  );
  const out: Record<string, ChaseInfo> = {};

  for (const row of rows) {
    if (!row.contractId || !row.createdAt) continue;
    const current = out[row.contractId] ?? { at: row.createdAt, channel: (row.channel as ChaseChannel) ?? 'AUTO', months: [] };

    if (row.createdAt > current.at) {
      current.at = row.createdAt;
      current.channel = (row.channel as ChaseChannel) ?? 'AUTO';
    }
    if (row.rentMonth && !current.months.includes(row.rentMonth)) current.months.push(row.rentMonth);
    out[row.contractId] = current;
  }

  return out;
};

export { RECENT_CHASE_DAYS };
