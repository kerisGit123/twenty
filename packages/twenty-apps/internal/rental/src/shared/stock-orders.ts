// Orders to suppliers: what was ordered, what has arrived (purchase lines
// received against the order), and what is still outstanding.

import { type StockMovement } from 'src/shared/stock';
import { OPEN_ORDER_STATUSES } from 'src/shared/stock-types';

export type OrderLine = {
  itemId: string;
  orderedUnits: number;
  cartonPrice: number; // per carton when ordered
  closed?: boolean; // the rest will not come: stop waiting for it
};

export type StockOrder = {
  id: string;
  number: string;
  supplier: string;
  date: string;
  status: string; // DRAFT | SENT | PARTLY_RECEIVED | RECEIVED | CANCELLED
  supplierRef: string;
  notes: string;
  ownerId: string | null;
  lines: OrderLine[];
};

export type LineProgress = OrderLine & { received: number; outstanding: number };

const round = (value: number) => Math.round(value * 100) / 100;

export const parseOrderLines = (raw: unknown): OrderLine[] =>
  (Array.isArray(raw) ? raw : [])
    .map((line) => line as Partial<OrderLine>)
    .filter((line) => typeof line.itemId === 'string' && Number(line.orderedUnits) > 0)
    .map((line) => ({
      itemId: line.itemId as string,
      orderedUnits: Number(line.orderedUnits),
      cartonPrice: Number(line.cartonPrice) || 0,
      ...(line.closed ? { closed: true } : {}),
    }));

// Received = purchase lines that came in against this order.
export const orderProgress = (order: StockOrder, movements: StockMovement[]) => {
  const received = new Map<string, number>();

  for (const m of movements) {
    if (m.orderId !== order.id || m.type !== 'PURCHASE') continue;
    received.set(m.itemId, round((received.get(m.itemId) ?? 0) + m.quantity));
  }

  const lines: LineProgress[] = order.lines.map((line) => {
    const got = received.get(line.itemId) ?? 0;

    return { ...line, received: got, outstanding: order.status === 'CANCELLED' || line.closed ? 0 : round(Math.max(0, line.orderedUnits - got)) };
  });

  return { lines, received: lines.reduce((sum, l) => sum + l.received, 0), outstanding: lines.reduce((sum, l) => sum + l.outstanding, 0) };
};

// The status that follows from what arrived (cancelled orders stay cancelled).
export const orderStatusFor = (order: StockOrder, lines: LineProgress[]) => {
  if (order.status === 'CANCELLED') return 'CANCELLED';
  if (lines.length && lines.every((l) => l.outstanding <= 0)) return 'RECEIVED';
  if (lines.some((l) => l.received > 0)) return 'PARTLY_RECEIVED';

  return order.status === 'SENT' ? 'SENT' : 'DRAFT';
};

// Units still coming, per item, across open orders.
export const onOrderUnits = (orders: StockOrder[], movements: StockMovement[]) => {
  const map = new Map<string, number>();

  for (const order of orders) {
    if (!OPEN_ORDER_STATUSES.includes(order.status)) continue;
    for (const line of orderProgress(order, movements).lines) {
      if (line.outstanding > 0) map.set(line.itemId, round((map.get(line.itemId) ?? 0) + line.outstanding));
    }
  }

  return map;
};

export const orderTotal = (order: StockOrder, unitsPerCarton: (itemId: string) => number) =>
  order.lines.reduce((sum, l) => sum + (l.orderedUnits / (unitsPerCarton(l.itemId) || 1)) * l.cartonPrice, 0);
