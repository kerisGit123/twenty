// Branch requests: stock a branch asks the warehouse for. Issuing records the
// take-out; the branch confirms what arrived; a short delivery is resolved.

import { OPEN_REQUEST_STATUSES } from 'src/shared/stock-types';

export type RequestLine = {
  itemId: string;
  requestedUnits: number;
  issuedUnits?: number; // what left the warehouse
  receivedUnits?: number; // what the branch counted
  resolved?: 'RETURNED' | 'WRITTEN_OFF'; // what happened to a short quantity
};

export type StockRequest = {
  id: string;
  number: string;
  branch: string;
  date: string;
  status: string; // REQUESTED | ISSUED | RECEIVED | SHORT | CANCELLED
  notes: string;
  requestedBy: string;
  issuedOn: string | null;
  issuedBy: string;
  receivedOn: string | null;
  receivedBy: string;
  ownerId: string | null;
  lines: RequestLine[];
};

const round = (value: number) => Math.round(value * 100) / 100;

export const parseRequestLines = (raw: unknown): RequestLine[] =>
  (Array.isArray(raw) ? raw : [])
    .map((line) => line as Partial<RequestLine>)
    .filter((line) => typeof line.itemId === 'string' && Number(line.requestedUnits) >= 0)
    .map((line) => ({
      itemId: line.itemId as string,
      requestedUnits: Number(line.requestedUnits) || 0,
      ...(line.issuedUnits !== undefined && line.issuedUnits !== null ? { issuedUnits: Number(line.issuedUnits) || 0 } : {}),
      ...(line.receivedUnits !== undefined && line.receivedUnits !== null ? { receivedUnits: Number(line.receivedUnits) || 0 } : {}),
      ...(line.resolved === 'RETURNED' || line.resolved === 'WRITTEN_OFF' ? { resolved: line.resolved } : {}),
    }));

// Units issued but not received by the branch (0 when nothing is missing).
export const shortUnits = (line: RequestLine) => (line.issuedUnits !== undefined && line.receivedUnits !== undefined ? round(Math.max(0, line.issuedUnits - line.receivedUnits)) : 0);

// Lines with a shortage still to resolve.
export const unresolvedShort = (request: StockRequest) => request.lines.filter((l) => shortUnits(l) > 0 && !l.resolved);

export const isOpenRequest = (request: StockRequest) => OPEN_REQUEST_STATUSES.includes(request.status);

// What needs doing, for the Today page and the tab badge.
export const requestCounts = (requests: StockRequest[]) => ({
  toIssue: requests.filter((r) => r.status === 'REQUESTED').length,
  toConfirm: requests.filter((r) => r.status === 'ISSUED').length,
  short: requests.filter((r) => r.status === 'SHORT').length,
});
