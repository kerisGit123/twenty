import { type CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { STOCK_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-stock';
import { appClient } from 'src/logic-functions/utils/app-client';
import { todayIso } from 'src/logic-functions/utils/dates';
import { inScope, NOT_ALLOWED, resolveScope, type Scope } from 'src/logic-functions/utils/scope';
import { queryAll } from 'src/logic-functions/utils/query-all';
import { ITEM_FIELDS, loadItemMovements, loadMovementsOf, loadStockData, ORDER_FIELDS, toStockItem, toStockMovement, toStockOrder } from 'src/logic-functions/utils/stock-data';
import { orderProgress, orderStatusFor, type OrderLine, type StockOrder } from 'src/shared/stock-orders';
import { balanceOf, cartonsAndUnits, groupMovements, type StockItem, unitPrice } from 'src/shared/stock';
import { movementType, STOCK_GROUPS } from 'src/shared/stock-types';

// POST /s/stock { action, ... }: the Stock page's data and every change it
// makes, checked against the caller's workspaces.
//   data                         items, movements, workspace rules
//   saveItem      item fields (+ openingUnits on a new item)
//   setStatus     { itemId, status, writeOff? }    discontinue / reactivate
//   record        { date, type, party, reference, notes, lines: [{ itemId, quantity, unitCost?, expiryDate? }] }
//   settleBorrow  { movementId, how: RETURNED | EXCHANGED | PAID, date, quantity?, exchangeItemId?, exchangeQuantity?, amount? }
//   stockTake     { date, counts: [{ itemId, counted }] }
//   deleteMovement { movementId }                 (soft delete, restorable)
//   saveRule      { ownerId, reorderBelow, orderUpTo }
//   saveOrder     { id?, date, notes, lines: [{ itemId, cartons }] }   new: one order per supplier and workspace
//   receiveOrder  { orderId, date, reference, lines: [{ itemId, units, expiryDate?, close? }] }
//   setOrderStatus { orderId, status: SENT | CANCELLED | CLOSE_REST | DRAFT }

type Json = Record<string, unknown>;

const json = (body: Json, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
// Problems come back as { success: false, message } with status 200: the
// browser client hides the body of an error status, and the page shows the message.
const fail = (message: string, _status = 400) => json({ success: false, message });

const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const num = (value: unknown) => {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^0-9.-]/g, ''));

  return Number.isFinite(n) ? n : NaN;
};
const text = (value: unknown, max = 300) => String(value ?? '').trim().slice(0, max);

// Recordable by hand; stock-take adjustments come from the stock take.
const RECORDABLE = ['PURCHASE', 'TAKE', 'BORROW', 'WASTE', 'RETURN', 'EXCHANGE_IN'];

const loadItem = async (client: CoreApiClient, itemId: string): Promise<StockItem | null> => {
  const { stockItems } = await client.query({ stockItems: { __args: { filter: { id: { eq: itemId } }, first: 1 }, edges: { node: ITEM_FIELDS } } } as never) as {
    stockItems?: { edges?: Array<{ node: Parameters<typeof toStockItem>[0] }> };
  };
  const node = stockItems?.edges?.[0]?.node;

  return node ? toStockItem(node) : null;
};

// Several items in one query.
const loadItems = async (client: CoreApiClient, ids: string[]) => {
  const unique = [...new Set(ids.filter(Boolean))];
  const rows = unique.length ? await queryAll<Parameters<typeof toStockItem>[0]>(client, 'stockItems', { filter: { id: { in: unique } } }, ITEM_FIELDS) : [];

  return new Map(rows.map((node) => [node.id, toStockItem(node)]));
};

type MovementInput = {
  date: string;
  type: string;
  quantity: number;
  party?: string;
  unitCost?: number | null;
  expiryDate?: string | null;
  reference?: string;
  notes?: string;
  borrowStatus?: string | null;
  borrowId?: string | null;
  batchId?: string | null;
  orderId?: string | null;
};

// A save the page retried after a dropped connection: already done if any
// line carries its request id.
const alreadySaved = async (client: CoreApiClient, requestId: string) => {
  if (!requestId) return false;
  const { stockMovements } = await client.query({ stockMovements: { __args: { filter: { batchId: { eq: requestId } }, first: 1 }, edges: { node: { id: true } } } });

  return Boolean(stockMovements?.edges?.length);
};

const movementData = (item: StockItem, data: MovementInput) => ({
          name: `${movementType(data.type)?.label ?? data.type} · ${item.name}`,
          movementDate: data.date,
          movementType: data.type as never,
          quantity: Math.round(data.quantity * 100) / 100,
          party: data.party ?? '',
          unitCost: data.unitCost ?? null,
          expiryDate: data.expiryDate || null,
          reference: data.reference ?? '',
          notes: data.notes ?? '',
          borrowStatus: (data.borrowStatus ?? null) as never,
          borrowId: data.borrowId ?? null,
          batchId: data.batchId ?? null,
          orderId: data.orderId ?? null,
          itemId: item.id,
          ownerId: item.ownerId,
});

const createMovement = async (client: CoreApiClient, item: StockItem, data: MovementInput) => {
  const { createStockMovement } = await client.mutation({ createStockMovement: { __args: { data: movementData(item, data) }, id: true } });

  return createStockMovement?.id as string | undefined;
};

// Many lines in a few requests (a delivery can have dozens).
const createMovements = async (client: CoreApiClient, list: Array<{ item: StockItem; data: MovementInput }>) => {
  for (let i = 0; i < list.length; i += 50) {
    await client.mutation({
      createStockMovements: { __args: { data: list.slice(i, i + 50).map(({ item, data }) => movementData(item, data)) as never }, id: true },
    });
  }
};

const loadOrder = async (client: CoreApiClient, orderId: string): Promise<StockOrder | null> => {
  const { stockOrders } = (await client.query({ stockOrders: { __args: { filter: { id: { eq: orderId } }, first: 1 }, edges: { node: ORDER_FIELDS } } } as never)) as {
    stockOrders?: { edges?: Array<{ node: Parameters<typeof toStockOrder>[0] }> };
  };
  const node = stockOrders?.edges?.[0]?.node;

  return node ? toStockOrder(node) : null;
};

const orderMovements = async (client: CoreApiClient, orderId: string) =>
  (await queryAll<Parameters<typeof toStockMovement>[0]>(
    client,
    'stockMovements',
    { filter: { orderId: { eq: orderId } } },
    { id: true, itemId: true, movementDate: true, movementType: true, quantity: true, orderId: true, ownerId: true },
  )).map(toStockMovement);

// ORD-2026-0001: the next number this year.
const nextOrderNumber = async (client: CoreApiClient, year: string) => {
  const rows = await queryAll<{ orderNumber?: string | null }>(client, 'stockOrders', { filter: { orderNumber: { like: `ORD-${year}-%` } } }, { orderNumber: true });
  const highest = rows.reduce((max, r) => Math.max(max, Number((r.orderNumber ?? '').split('-')[2]) || 0), 0);

  return `ORD-${year}-${String(highest + 1).padStart(4, '0')}`;
};

const saveOrderFields = async (client: CoreApiClient, order: StockOrder, data: Record<string, unknown>) => {
  await client.mutation({ updateStockOrder: { __args: { id: order.id, data: data as never }, id: true } });
};

const handlers: Record<string, (client: CoreApiClient, scope: Scope, body: Json) => Promise<Response>> = {
  data: async (client, scope) => json({ success: true, data: await loadStockData(client, scope), today: todayIso() }),

  saveItem: async (client, scope, body) => {
    const id = text(body.id, 64);
    const name = text(body.name, 200);
    const perCarton = num(body.unitsPerCarton);
    const price = num(body.cartonPrice);
    const reorder = body.reorderBelowMonths === '' || body.reorderBelowMonths == null ? null : num(body.reorderBelowMonths);

    if (!name) return fail('Give the item a name.');
    if (!(perCarton > 0)) return fail('Units per carton must be 1 or more.');
    if (!(price >= 0)) return fail('Carton price must be a number.');
    if (reorder !== null && !(reorder > 0)) return fail('Re-order below must be more than 0 months, or empty.');

    const existing = id ? await loadItem(client, id) : null;

    if (id && !existing) return fail('Item not found.', 404);
    const ownerId = existing?.ownerId ?? (text(body.ownerId, 64) || null);

    if (!ownerId || !inScope(scope, ownerId)) return json({ ...NOT_ALLOWED }, 403);

    const data = {
      name,
      code: text(body.code, 40),
      specification: text(body.specification, 200),
      group: (STOCK_GROUPS.some((g) => g.value === body.group) ? body.group : 'RAW') as never,
      unit: text(body.unit, 30),
      unitsPerCarton: perCarton,
      cartonPrice: { amountMicros: Math.round(price * 1_000_000), currencyCode: 'MYR' },
      supplier: text(body.supplier, 120),
      reorderBelowMonths: reorder,
      notes: text(body.notes, 500),
    };

    if (existing) {
      await client.mutation({ updateStockItem: { __args: { id: existing.id, data }, id: true } });

      return json({ success: true, id: existing.id, message: 'Item saved.' });
    }

    const { createStockItem } = await client.mutation({ createStockItem: { __args: { data: { ...data, ownerId, status: 'ACTIVE' as never } }, id: true } });
    const opening = num(body.openingUnits);
    const created = createStockItem?.id ? await loadItem(client, createStockItem.id) : null;

    if (created && opening > 0) {
      await createMovement(client, created, {
        date: isDate(body.openingDate) ? body.openingDate : todayIso(),
        type: 'ADJUST_IN',
        quantity: opening,
        unitCost: unitPrice(created),
        expiryDate: isDate(body.expiryDate) ? body.expiryDate : null,
        notes: 'Opening balance',
      });
    }

    return json({ success: true, id: createStockItem?.id, message: 'Item added.' });
  },

  setStatus: async (client, scope, body) => {
    const item = await loadItem(client, text(body.itemId, 64));

    if (!item) return fail('Item not found.', 404);
    if (!inScope(scope, item.ownerId)) return json({ ...NOT_ALLOWED }, 403);
    const status = body.status === 'DISCONTINUED' ? 'DISCONTINUED' : 'ACTIVE';

    if (status === 'DISCONTINUED') {
      const balance = balanceOf(await loadItemMovements(client, item.id));

      if (balance > 0 && body.writeOff !== true) {
        return json({ success: false, needsWriteOff: true, balance, message: `${cartonsAndUnits(balance, item)} is still in stock. Use it up first, or write it off as waste.` }, 409);
      }
      if (balance > 0) {
        await createMovement(client, item, { date: isDate(body.date) ? body.date : todayIso(), type: 'WASTE', quantity: balance, notes: 'Written off when discontinued' });
      }
    }

    await client.mutation({ updateStockItem: { __args: { id: item.id, data: { status: status as never } }, id: true } });

    return json({ success: true, message: status === 'DISCONTINUED' ? `${item.name} is discontinued.` : `${item.name} is active again.` });
  },

  record: async (client, scope, body) => {
    const type = text(body.type, 20);
    const lines = Array.isArray(body.lines) ? (body.lines as Json[]) : [];

    if (!RECORDABLE.includes(type)) return fail('Pick what happened (purchase, taken out, lent...).');
    if (!isDate(body.date)) return fail('Pick a date.');
    if (!lines.length) return fail('Add at least one item.');
    if (type === 'BORROW' && !text(body.party)) return fail('Say which branch borrowed it.');
    const requestId = text(body.requestId, 64);

    if (await alreadySaved(client, requestId)) return json({ success: true, message: 'Already saved.' });

    const items = await loadItems(client, lines.map((line) => text(line.itemId, 64)));

    for (const line of lines) {
      const item = items.get(text(line.itemId, 64));

      if (!(num(line.quantity) > 0)) return fail('Each line needs a quantity more than 0.');
      if (!item) return fail('One of the items no longer exists.', 404);
      if (!inScope(scope, item.ownerId)) return json({ ...NOT_ALLOWED }, 403);
      if (item.status === 'DISCONTINUED' && type === 'PURCHASE') return fail(`${item.name} is discontinued. Reactivate it before buying more.`);
    }

    await createMovements(
      client,
      lines.map((line) => {
        const item = items.get(text(line.itemId, 64)) as StockItem;
        const cost = line.unitCost === undefined || line.unitCost === null || line.unitCost === '' ? NaN : num(line.unitCost);

        return {
          item,
          data: {
        date: body.date as string,
        type,
        quantity: num(line.quantity),
        party: text(body.party, 120),
        unitCost: type === 'PURCHASE' ? (cost >= 0 ? cost : unitPrice(item)) : null,
        expiryDate: isDate(line.expiryDate) ? line.expiryDate : null,
        reference: text(body.reference, 120),
        notes: text(body.notes, 500),
            borrowStatus: type === 'BORROW' ? 'OUTSTANDING' : null,
            batchId: requestId || null,
          },
        };
      }),
    );

    return json({ success: true, message: `Recorded ${lines.length} line${lines.length === 1 ? '' : 's'}.` });
  },

  settleBorrow: async (client, scope, body) => {
    const id = text(body.movementId, 64);
    const { stockMovements } = await client.query({
      stockMovements: { __args: { filter: { id: { eq: id } }, first: 1 }, edges: { node: { id: true, itemId: true, movementType: true, quantity: true, party: true, borrowStatus: true, ownerId: true } } },
    });
    const borrow = stockMovements?.edges?.[0]?.node;

    if (!borrow || borrow.movementType !== 'BORROW') return fail('That lending was not found.', 404);
    if (!inScope(scope, borrow.ownerId)) return json({ ...NOT_ALLOWED }, 403);
    const requestId = text(body.requestId, 64);

    if (await alreadySaved(client, requestId)) return json({ success: true, message: 'Already settled.' });
    if ((borrow.borrowStatus ?? 'OUTSTANDING') !== 'OUTSTANDING') return fail('This lending is already settled.');

    const how = text(body.how, 20);
    const date = isDate(body.date) ? body.date : todayIso();
    const item = await loadItem(client, borrow.itemId as string);

    if (!item) return fail('The item no longer exists.', 404);
    const party = borrow.party ?? '';

    if (how === 'RETURNED') {
      const quantity = num(body.quantity ?? borrow.quantity);

      if (!(quantity > 0)) return fail('How many came back?');
      await createMovement(client, item, { date, type: 'RETURN', quantity, party, borrowId: borrow.id, notes: text(body.notes, 300), batchId: requestId || null });
    } else if (how === 'EXCHANGED') {
      const other = await loadItem(client, text(body.exchangeItemId, 64));
      const quantity = num(body.exchangeQuantity);

      if (!other) return fail('Pick the item received in exchange.');
      if (!inScope(scope, other.ownerId)) return json({ ...NOT_ALLOWED }, 403);
      if (!(quantity > 0)) return fail('How many of it came in?');
      await createMovement(client, other, { date, type: 'EXCHANGE_IN', quantity, party, borrowId: borrow.id, notes: `For ${cartonsAndUnits(Number(borrow.quantity), item)} ${item.name} lent`, batchId: requestId || null });
    } else if (how === 'PAID') {
      const amount = num(body.amount);

      if (!(amount > 0)) return fail('How much was paid?');
      // The money goes into the books as income (Transactions -> Money in).
      await client.mutation({
        createIncome: {
          __args: {
            data: {
              name: `Paid for ${item.name} lent (${cartonsAndUnits(Number(borrow.quantity), item)})`,
              incomeDate: date,
              amount: { amountMicros: Math.round(amount * 1_000_000), currencyCode: 'MYR' },
              category: 'BUSINESS' as never,
              method: (text(body.method, 20) || 'OTHER') as never,
              receivedFrom: party,
              notes: text(body.notes, 300),
              ownerId: item.ownerId,
            },
          },
          id: true,
        },
      });
    } else {
      return fail('Choose returned, exchanged or paid.');
    }

    await client.mutation({ updateStockMovement: { __args: { id: borrow.id, data: { borrowStatus: how as never } }, id: true } });

    return json({ success: true, message: how === 'PAID' ? 'Settled. The payment is recorded as income.' : 'Settled and added back to stock.' });
  },

  stockTake: async (client, scope, body) => {
    const date = isDate(body.date) ? body.date : todayIso();
    const requestId = text(body.requestId, 64);

    if (await alreadySaved(client, requestId)) return json({ success: true, message: 'Stock take already saved.' });
    const counts = (Array.isArray(body.counts) ? (body.counts as Json[]) : []).filter((entry) => entry.counted !== '' && num(entry.counted) >= 0);
    const items = await loadItems(client, counts.map((entry) => text(entry.itemId, 64)));

    if ([...items.values()].some((item) => !inScope(scope, item.ownerId))) return json({ ...NOT_ALLOWED }, 403);
    const movements = groupMovements(await loadMovementsOf(client, [...items.keys()]));
    const adjustments: Array<{ item: StockItem; data: MovementInput }> = [];

    for (const entry of counts) {
      const item = items.get(text(entry.itemId, 64));

      if (!item) continue;
      const counted = num(entry.counted);
      // Expected = everything recorded up to the end of the count day.
      const expected = balanceOf((movements.get(item.id) ?? []).filter((m) => m.date <= date));
      const diff = Math.round((counted - expected) * 100) / 100;

      if (diff === 0) continue;
      adjustments.push({
        item,
        data: { date, type: diff > 0 ? 'ADJUST_IN' : 'ADJUST_OUT', quantity: Math.abs(diff), notes: `Stock take: counted ${counted}, expected ${expected}`, batchId: requestId || null },
      });
    }

    await createMovements(client, adjustments);
    const adjusted = adjustments.length;

    return json({ success: true, message: adjusted ? `Stock take saved: ${adjusted} item${adjusted === 1 ? '' : 's'} adjusted.` : 'Stock take saved: everything matched.' });
  },

  deleteMovement: async (client, scope, body) => {
    const id = text(body.movementId, 64);
    const { stockMovements } = await client.query({ stockMovements: { __args: { filter: { id: { eq: id } }, first: 1 }, edges: { node: { id: true, ownerId: true } } } });
    const movement = stockMovements?.edges?.[0]?.node;

    if (!movement) return fail('Movement not found.', 404);
    if (!inScope(scope, movement.ownerId)) return json({ ...NOT_ALLOWED }, 403);
    // Soft delete: it can be restored from the deleted records.
    await client.mutation({ deleteStockMovement: { __args: { id }, id: true } });

    return json({ success: true, message: 'Removed. It can be restored from deleted stock movements.' });
  },

  saveOrder: async (client, scope, body) => {
    const date = isDate(body.date) ? body.date : todayIso();
    const wanted = (Array.isArray(body.lines) ? (body.lines as Json[]) : []).map((l) => ({ itemId: text(l.itemId, 64), cartons: num(l.cartons) })).filter((l) => l.itemId && l.cartons > 0);

    if (!wanted.length) return fail('Put at least one carton on the order.');
    const items = await loadItems(client, wanted.map((l) => l.itemId));

    for (const l of wanted) {
      const item = items.get(l.itemId);

      if (!item) return fail('One of the items no longer exists.', 404);
      if (!inScope(scope, item.ownerId)) return json({ ...NOT_ALLOWED }, 403);
    }
    const lineOf = (l: { itemId: string; cartons: number }): OrderLine => {
      const item = items.get(l.itemId) as StockItem;

      return { itemId: l.itemId, orderedUnits: Math.round(l.cartons * (item.unitsPerCarton || 1) * 100) / 100, cartonPrice: item.cartonPrice };
    };

    // Changing a draft: replace its lines.
    if (body.id) {
      const order = await loadOrder(client, text(body.id, 64));

      if (!order) return fail('Order not found.', 404);
      if (!inScope(scope, order.ownerId)) return json({ ...NOT_ALLOWED }, 403);
      if (order.status !== 'DRAFT') return fail('Only a draft order can be changed. Cancel it and make a new one instead.');
      await saveOrderFields(client, order, { lines: wanted.map(lineOf), orderDate: date, notes: text(body.notes, 500) });

      return json({ success: true, message: `${order.number} updated.` });
    }

    // A new order per supplier and workspace (each is sent to one supplier).
    const groups = new Map<string, typeof wanted>();

    for (const l of wanted) {
      const item = items.get(l.itemId) as StockItem;
      const key = `${item.ownerId ?? ''}|${item.supplier || 'No supplier'}`;

      groups.set(key, [...(groups.get(key) ?? []), l]);
    }
    const requestId = text(body.requestId, 64);

    // A retried save: the orders exist already.
    if (requestId) {
      const { stockOrders } = await client.query({ stockOrders: { __args: { filter: { notes: { like: `%req:${requestId}%` } }, first: 1 }, edges: { node: { id: true } } } });

      if (stockOrders?.edges?.length) return json({ success: true, message: 'Order already saved.' });
    }
    const made: string[] = [];

    for (const [key, list] of groups) {
      const [ownerId, supplier] = key.split('|');
      const number = await nextOrderNumber(client, date.slice(0, 4));

      await client.mutation({
        createStockOrder: {
          __args: {
            data: {
              name: `${number} · ${supplier}`,
              orderNumber: number,
              supplier,
              orderDate: date,
              status: 'DRAFT' as never,
              lines: list.map(lineOf) as never,
              notes: [text(body.notes, 500), requestId ? `req:${requestId}` : ''].filter(Boolean).join('\n'),
              ownerId: ownerId || null,
            },
          },
          id: true,
        },
      });
      made.push(`${number} (${supplier})`);
    }

    return json({ success: true, message: `Order saved: ${made.join(', ')}. Send it to the supplier, then mark it as sent.` });
  },

  receiveOrder: async (client, scope, body) => {
    const order = await loadOrder(client, text(body.orderId, 64));

    if (!order) return fail('Order not found.', 404);
    if (!inScope(scope, order.ownerId)) return json({ ...NOT_ALLOWED }, 403);
    if (order.status === 'CANCELLED' || order.status === 'RECEIVED') return fail('This order is already finished.');
    if (!isDate(body.date)) return fail('Pick the date the goods arrived.');
    const requestId = text(body.requestId, 64);

    if (await alreadySaved(client, requestId)) return json({ success: true, message: 'Already saved.' });

    const lines = (Array.isArray(body.lines) ? (body.lines as Json[]) : []).map((l) => ({
      itemId: text(l.itemId, 64),
      units: num(l.units),
      expiryDate: isDate(l.expiryDate) ? l.expiryDate : null,
      close: l.close === true,
    }));
    const ordered = new Map(order.lines.map((l) => [l.itemId, l]));

    if (lines.some((l) => !ordered.has(l.itemId))) return fail('A line is not on this order.');
    if (!lines.some((l) => l.units > 0 || l.close)) return fail('Type what arrived (or mark a line as not coming).');
    const items = await loadItems(client, lines.map((l) => l.itemId));
    const reference = text(body.reference, 120) || order.supplierRef || order.number;

    await createMovements(
      client,
      lines
        .filter((l) => l.units > 0)
        .map((l) => {
          const item = items.get(l.itemId) as StockItem;

          return {
            item,
            data: {
              date: body.date as string,
              type: 'PURCHASE',
              quantity: l.units,
              party: order.supplier,
              unitCost: (ordered.get(l.itemId)?.cartonPrice ?? item.cartonPrice) / (item.unitsPerCarton || 1),
              expiryDate: l.expiryDate,
              reference,
              notes: `Order ${order.number}`,
              batchId: requestId || null,
              orderId: order.id,
            },
          };
        }),
    );

    // Lines that will not come any more stop counting as on order.
    const closing = new Set(lines.filter((l) => l.close).map((l) => l.itemId));
    const updated: StockOrder = { ...order, lines: order.lines.map((l) => (closing.has(l.itemId) ? { ...l, closed: true } : l)) };
    const progress = orderProgress(updated, await orderMovements(client, order.id));
    const status = orderStatusFor(updated, progress.lines);

    await saveOrderFields(client, order, {
      lines: updated.lines,
      status: status as never,
      ...(text(body.reference, 120) && !order.supplierRef ? { supplierRef: text(body.reference, 120) } : {}),
    });

    return json({
      success: true,
      message: status === 'RECEIVED' ? `${order.number} is complete.` : `Received. ${order.number} still has items to come.`,
    });
  },

  setOrderStatus: async (client, scope, body) => {
    const order = await loadOrder(client, text(body.orderId, 64));

    if (!order) return fail('Order not found.', 404);
    if (!inScope(scope, order.ownerId)) return json({ ...NOT_ALLOWED }, 403);
    const wanted = text(body.status, 20);
    const progress = orderProgress(order, await orderMovements(client, order.id));

    if (wanted === 'SENT') {
      if (order.status !== 'DRAFT') return fail('Only a draft can be marked as sent.');
      await saveOrderFields(client, order, { status: 'SENT' as never, ...(text(body.supplierRef, 120) ? { supplierRef: text(body.supplierRef, 120) } : {}) });

      return json({ success: true, message: `${order.number} marked as sent to ${order.supplier}.` });
    }
    if (wanted === 'CANCELLED') {
      if (progress.received > 0) return fail('Some goods already arrived. Use "close the rest" instead.');
      await saveOrderFields(client, order, { status: 'CANCELLED' as never });

      return json({ success: true, message: `${order.number} cancelled.` });
    }
    if (wanted === 'CLOSE_REST') {
      // Stop waiting for whatever has not arrived.
      await saveOrderFields(client, order, { lines: order.lines.map((l) => ({ ...l, closed: true })), status: 'RECEIVED' as never });

      return json({ success: true, message: `${order.number} closed; anything not received is no longer on order.` });
    }
    if (wanted === 'DRAFT') {
      if (order.status !== 'CANCELLED' && order.status !== 'SENT') return fail('Only a sent or cancelled order can go back to draft.');
      await saveOrderFields(client, order, { status: (progress.received > 0 ? 'PARTLY_RECEIVED' : 'DRAFT') as never });

      return json({ success: true, message: `${order.number} is open again.` });
    }

    return fail('Unknown status.');
  },

  saveRule: async (client, scope, body) => {
    const ownerId = text(body.ownerId, 64);
    const reorderBelow = num(body.reorderBelow);
    const orderUpTo = num(body.orderUpTo);

    if (!ownerId || !inScope(scope, ownerId)) return json({ ...NOT_ALLOWED }, 403);
    if (!(reorderBelow > 0) || !(orderUpTo > 0)) return fail('Both numbers must be more than 0 months.');
    if (orderUpTo < reorderBelow) return fail('"Order enough for" must be at least the re-order level.');
    await client.mutation({ updateOwner: { __args: { id: ownerId, data: { stockReorderBelowMonths: reorderBelow, stockOrderUpToMonths: orderUpTo } }, id: true } });

    return json({ success: true, message: 'Re-order rule saved.' });
  },
};

const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as Json;
  const action = handlers[text(body.action, 30)];

  if (!action) return fail('Unknown action.');

  try {
    const client = appClient();

    return await action(client, await resolveScope(client, context?.workspaceMemberId), body);
  } catch (error) {
    console.error('[rental] stock action failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    const dropped = /ECONNRESET|timeout|terminated|ETIMEDOUT|socket hang up|Rate limit/i.test(message);

    return json({
      success: false,
      message: dropped ? `The connection to the database dropped for a moment, so nothing was saved. Please try again. (${message})` : `Could not save: ${message}`,
    });
  }
};

export default defineLogicFunction({
  universalIdentifier: STOCK_ROUTE_FUNCTION_ID,
  name: 'stock-route',
  description: 'The Stock page: items, IN/OUT movements, borrowing, stock take and the re-order rule.',
  timeoutSeconds: 120,
  handler,
  httpRouteTriggerSettings: { path: '/stock', httpMethod: 'POST', isAuthRequired: true },
});
