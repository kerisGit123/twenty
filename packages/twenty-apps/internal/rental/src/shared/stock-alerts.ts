import { DEFAULT_RULE, expiredStock, groupMovements, stockStatus, type StockItem, type StockMovement, type StockRule, unitValue } from 'src/shared/stock';
import { onOrderUnits, type StockOrder } from 'src/shared/stock-orders';

export type StockAlert = {
  ownerId: string | null;
  orderNow: number; // items to order (not already on order)
  expiredItems: number; // items with expired units still in stock
  expiredValue: number;
  waiting: number; // orders sent, not fully received
  late: number; // of those, older than the delivery time (at least a week)
};

const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export const stockAlerts = (
  data: { items: StockItem[]; movements: StockMovement[]; orders: StockOrder[]; owners: Array<{ id: string; rule: StockRule }> },
  today: string,
): StockAlert[] =>
  data.owners.map((owner) => {
    const rule = owner.rule ?? DEFAULT_RULE;
    const items = data.items.filter((i) => i.ownerId === owner.id && i.status !== 'DISCONTINUED');
    const movements = data.movements.filter((m) => m.ownerId === owner.id);
    const orders = data.orders.filter((o) => o.ownerId === owner.id);
    const byItem = groupMovements(movements);
    const onOrder = onOrderUnits(orders, movements);
    let orderNow = 0;
    let expiredItems = 0;
    let expiredValue = 0;

    for (const item of items) {
      const own = byItem.get(item.id) ?? [];
      const status = stockStatus(item, own, rule, today, onOrder.get(item.id) ?? 0);

      if (status.flag === 'ORDER') orderNow += 1;
      const expired = expiredStock(own, status.balance, today);

      if (expired.units > 0) {
        expiredItems += 1;
        expiredValue += expired.units * unitValue(item);
      }
    }
    const sent = orders.filter((o) => o.status === 'SENT' || o.status === 'PARTLY_RECEIVED');
    const dueBy = addDays(today, -Math.max(7, rule.leadDays ?? 0));

    return {
      ownerId: owner.id,
      orderNow,
      expiredItems,
      expiredValue: Math.round(expiredValue * 100) / 100,
      waiting: sent.length,
      late: sent.filter((o) => o.date < dueBy).length,
    };
  });
