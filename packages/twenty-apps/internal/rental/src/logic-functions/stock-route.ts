import { type CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { STOCK_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-stock';
import { appClient } from 'src/logic-functions/utils/app-client';
import { todayIso } from 'src/logic-functions/utils/dates';
import { canManage, inScope, NOT_ALLOWED, resolveScope, type Scope } from 'src/logic-functions/utils/scope';
import { queryAll } from 'src/logic-functions/utils/query-all';
import { ITEM_FIELDS, loadItemMovements, loadMovementsOf, loadStockData, ORDER_FIELDS, REQUEST_FIELDS, toStockItem, toStockMovement, toStockOrder, toStockRequest } from 'src/logic-functions/utils/stock-data';
import { shortUnits, type StockRequest, unresolvedShort } from 'src/shared/stock-requests';
import { orderProgress, orderStatusFor, type OrderLine, type StockOrder } from 'src/shared/stock-orders';
import { balanceOf, cartonsAndUnits, groupMovements, type StockItem, unitPrice } from 'src/shared/stock';
import { stockAlerts } from 'src/shared/stock-alerts';
import { importChanges, importClosing, importComputedClosing, importDates, type ImportRow, type ImportSheet, pickStockSheet } from 'src/shared/stock-import';
import { readXlsx } from 'src/logic-functions/utils/xlsx-read';
import { movementType, STOCK_GROUPS, WASTE_REASONS } from 'src/shared/stock-types';

// POST /s/stock { action, ... }: the Stock page's data and every change it
// makes, checked against the caller's workspaces.
//   data                         items, movements, workspace rules
//   alerts                       per workspace: items to order, expired, expiring soon, late orders
//   readCounts    { ownerId?, fileBase64 }          counts from a filled-in count sheet (Excel)
//   saveRequest   { id?, branch, notes, lines: [{ itemId, units }] }   a branch asks for stock
//   issueRequest  { id, date, lines: [{ itemId, issuedUnits }] }     the warehouse sends it (take-outs)
//   receiveRequest { id, date, lines: [{ itemId, receivedUnits }] }  the branch counts what arrived
//   resolveShort  { id, how: RETURN | WRITE_OFF, date }              settle a shortage (host / admin)
//   cancelRequest { id }
//   importExcel   { ownerId, fileBase64, apply?, mode, openingDate | closingDate, includeOrder, includeTakes, updateDetails }
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

// The name of the person saving, per request (each request has its own client).
const actorOf = new WeakMap<CoreApiClient, string>();

const memberName = async (client: CoreApiClient, workspaceMemberId?: string | null) => {
  if (!workspaceMemberId) return '';
  try {
    const { workspaceMembers } = await client.query({
      workspaceMembers: { __args: { filter: { id: { eq: workspaceMemberId } }, first: 1 }, edges: { node: { name: { firstName: true, lastName: true } } } },
    });
    const name = workspaceMembers?.edges?.[0]?.node?.name;

    return [name?.firstName, name?.lastName].filter(Boolean).join(' ');
  } catch {
    return '';
  }
};

// ---------------------------------------------------------------- purchases -> expenses

// One expense per delivery (per workspace), so stock bought shows in Expenses,
// Transactions and the year summary. Its notes carry "stock:<batch>" to find it again.
const bookPurchaseExpense = async (
  client: CoreApiClient,
  batchId: string,
  lines: Array<{ item: StockItem; units: number; unitCost: number }>,
  info: { date: string; supplier: string; reference: string },
) => {
  const byOwner = new Map<string, typeof lines>();

  for (const l of lines) byOwner.set(l.item.ownerId ?? '', [...(byOwner.get(l.item.ownerId ?? '') ?? []), l]);
  for (const [ownerId, list] of byOwner) {
    const amount = Math.round(list.reduce((sum, l) => sum + l.units * l.unitCost, 0) * 100) / 100;

    if (!(amount > 0)) continue;
    await client.mutation({
      createExpense: {
        __args: {
          data: {
            name: `Stock purchase · ${info.supplier || 'supplier'}${info.reference ? ` · ${info.reference}` : ''}`,
            expenseDate: info.date,
            amount: { amountMicros: Math.round(amount * 1_000_000), currencyCode: 'MYR' },
            category: 'STOCK_PURCHASE' as never,
            method: 'OTHER' as never,
            paidTo: info.supplier,
            notes: [`stock:${batchId}`, ...list.map((l) => `${l.item.code} ${l.item.name}: ${cartonsAndUnits(l.units, l.item)}`)].join('\n'),
            ownerId: ownerId || null,
          },
        },
        id: true,
      },
    });
  }
};

// After a purchase line is removed: the delivery's expense follows what is left.
const resyncPurchaseExpense = async (client: CoreApiClient, batchId: string) => {
  if (!batchId) return;
  const { expenses } = await client.query({ expenses: { __args: { filter: { notes: { like: `stock:${batchId}%` } }, first: 10 }, edges: { node: { id: true, ownerId: true } } } });
  const rows = expenses?.edges?.map((e) => e.node) ?? [];

  if (!rows.length) return;
  const left = await queryAll<{ quantity?: number | null; unitCost?: number | null; ownerId?: string | null }>(
    client,
    'stockMovements',
    { filter: { and: [{ batchId: { eq: batchId } }, { movementType: { eq: 'PURCHASE' } }] } },
    { quantity: true, unitCost: true, ownerId: true },
  );

  for (const expense of rows) {
    const amount = Math.round(left.filter((m) => (m.ownerId ?? null) === (expense.ownerId ?? null)).reduce((sum, m) => sum + (Number(m.quantity) || 0) * (Number(m.unitCost) || 0), 0) * 100) / 100;

    if (amount > 0) await client.mutation({ updateExpense: { __args: { id: expense.id, data: { amount: { amountMicros: Math.round(amount * 1_000_000), currencyCode: 'MYR' } } }, id: true } });
    else await client.mutation({ deleteExpense: { __args: { id: expense.id }, id: true } });
  }
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
  reason?: string | null;
};

// A save the page retried after a dropped connection: already done if any
// line carries its request id.
const alreadySaved = async (client: CoreApiClient, requestId: string) => {
  if (!requestId) return false;
  const { stockMovements } = await client.query({ stockMovements: { __args: { filter: { batchId: { eq: requestId } }, first: 1 }, edges: { node: { id: true } } } });

  return Boolean(stockMovements?.edges?.length);
};

const movementData = (item: StockItem, data: MovementInput, recordedBy = '') => ({
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
          recordedBy: recordedBy || null,
          reason: data.reason || null,
          itemId: item.id,
          ownerId: item.ownerId,
});

const createMovement = async (client: CoreApiClient, item: StockItem, data: MovementInput) => {
  const { createStockMovement } = await client.mutation({ createStockMovement: { __args: { data: movementData(item, data, actorOf.get(client)) }, id: true } });

  return createStockMovement?.id as string | undefined;
};

// Many lines in a few requests (a delivery can have dozens).
const createMovements = async (client: CoreApiClient, list: Array<{ item: StockItem; data: MovementInput }>) => {
  for (let i = 0; i < list.length; i += 50) {
    await client.mutation({
      createStockMovements: { __args: { data: list.slice(i, i + 50).map(({ item, data }) => movementData(item, data, actorOf.get(client))) as never }, id: true },
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


// ---------------------------------------------------------------- branch requests

const loadRequest = async (client: CoreApiClient, requestId: string): Promise<StockRequest | null> => {
  const { stockRequests } = (await client.query({ stockRequests: { __args: { filter: { id: { eq: requestId } }, first: 1 }, edges: { node: REQUEST_FIELDS } } } as never)) as {
    stockRequests?: { edges?: Array<{ node: Parameters<typeof toStockRequest>[0] }> };
  };
  const node = stockRequests?.edges?.[0]?.node;

  return node ? toStockRequest(node) : null;
};

// REQ-2026-0001: the next number this year.
const nextRequestNumber = async (client: CoreApiClient, year: string) => {
  const rows = await queryAll<{ requestNumber?: string | null }>(client, 'stockRequests', { filter: { requestNumber: { like: `REQ-${year}-%` } } }, { requestNumber: true });
  const highest = rows.reduce((max, r) => Math.max(max, Number((r.requestNumber ?? '').split('-')[2]) || 0), 0);

  return `REQ-${year}-${String(highest + 1).padStart(4, '0')}`;
};

// ---------------------------------------------------------------- month-end lock

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (iso: string) => `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const monthEnd = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);

// The last day of each workspace's latest closed month.
const loadLocks = async (client: CoreApiClient, ownerIds: Array<string | null>) => {
  const ids = [...new Set(ownerIds.filter(Boolean) as string[])];
  const rows = ids.length
    ? await queryAll<{ id: string; stockLockedThrough?: string | null }>(client, 'owners', { filter: { id: { in: ids } } }, { id: true, stockLockedThrough: true })
    : [];

  return new Map(rows.map((r) => [r.id, r.stockLockedThrough ?? null]));
};

// A message when the date falls in a closed month, else null.
const lockedMessage = (locks: Map<string, string | null>, ownerId: string | null, date: string) => {
  const through = ownerId ? locks.get(ownerId) : null;

  return through && date <= through
    ? `${monthName(date)} is closed (stock is locked up to ${through}). Reopen the month on the Month end tab first, or use a later date.`
    : null;
};

const handlers: Record<string, (client: CoreApiClient, scope: Scope, body: Json) => Promise<Response>> = {
  data: async (client, scope) => json({ success: true, data: await loadStockData(client, scope), today: todayIso() }),

  // Counts for the Today page: what to order, expired stock, late deliveries.
  alerts: async (client, scope) => json({ success: true, alerts: stockAlerts(await loadStockData(client, scope), todayIso()) }),

  // Start a workspace's stock from a monthly 订货单 workbook. preview: what
  // would happen; apply: do it. The file is sent both times (as base64).
  //   mode month:   opening on openingDate + this month's order + dated take-outs
  //   mode closing: one opening line per product, the sheet's balance, on closingDate
  // Products are matched by item code; stock lines are added only to products
  // with no records yet, so importing twice never doubles stock.
  importExcel: async (client, scope, body) => {
    const ownerId = text(body.ownerId, 64);

    if (!ownerId || !inScope(scope, ownerId)) return json({ ...NOT_ALLOWED }, 403);
    if (!canManage(scope, ownerId)) return fail("Only an admin or this workspace's host can import products. Ask them to do it.", 403);
    const base64 = typeof body.fileBase64 === 'string' ? body.fileBase64 : '';

    if (!base64) return fail('Choose the Excel file first.');
    if (base64.length > 12_000_000) return fail('That file is too big (over 9 MB). Save just the stock sheet and try again.');
    let sheet: ImportSheet | null;

    try {
      sheet = pickStockSheet(readXlsx(new Uint8Array(Buffer.from(base64, 'base64'))));
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Could not read that file.');
    }
    if (!sheet || !sheet.rows.length) return fail('No products found. The sheet needs a heading row with "Item Code" and "Product Name".');

    const existing = (await queryAll<Parameters<typeof toStockItem>[0]>(client, 'stockItems', { filter: { ownerId: { eq: ownerId } } }, ITEM_FIELDS)).map(toStockItem);
    const byCode = new Map(existing.filter((i) => i.code).map((i) => [i.code, i]));
    const withHistory = new Set((await loadMovementsOf(client, existing.map((i) => i.id))).map((m) => m.itemId));
    const mode = body.mode === 'closing' ? 'closing' : 'month';
    const updateDetails = body.updateDetails !== false;
    const plan = sheet.rows.map((row) => {
      const item = byCode.get(row.code) ?? null;

      return { row, item, changes: item ? importChanges(row, item) : [], fresh: !item || !withHistory.has(item.id), closing: importClosing(row) };
    });

    if (body.apply !== true) {
      return json({
        success: true,
        message: 'Read ' + sheet.rows.length + ' products from "' + sheet.sheet + '". Check them, then press Import.',
        sheet: {
          name: sheet.sheet,
          sheetDate: sheet.sheetDate,
          takeDates: sheet.takeDates,
          inDates: sheet.inDates,
          warnings: sheet.warnings,
          // Products whose balance isn't opening + in - out (waste or lending the sheet doesn't show).
          balanceDiffers: plan.filter((p) => p.row.balanceUnits !== null && Math.abs(p.row.balanceUnits - importComputedClosing(p.row)) > 0.01).map((p) => p.row.code),
        },
        dates: importDates(sheet, todayIso()),
        rows: plan.map((p) => ({ ...p.row, closingUnits: p.closing, status: !p.item ? 'NEW' : p.changes.length ? 'CHANGED' : 'SAME', changes: p.changes, hasRecords: !p.fresh })),
      });
    }

    const requestId = text(body.requestId, 64);

    if (await alreadySaved(client, requestId)) return json({ success: true, message: 'Import already saved.' });
    const openingDate = isDate(body.openingDate) ? body.openingDate : null;
    const closingDate = isDate(body.closingDate) ? body.closingDate : null;
    const includeOrder = body.includeOrder !== false;
    const includeTakes = body.includeTakes !== false;

    if (mode === 'month' && !openingDate) return fail('Choose the opening date.');
    if (mode === 'closing' && !closingDate) return fail('Choose the date of the balance.');
    const datedLines = [...(includeTakes ? sheet.takeDates : []), ...(includeOrder ? sheet.inDates : [])].sort();

    if (mode === 'month' && datedLines.some((d) => d < (openingDate as string))) {
      return fail('The opening date must be on or before the first dated IN or OUT (' + datedLines[0] + ').');
    }
    const dates = mode === 'closing' ? [closingDate as string] : [openingDate as string, ...datedLines];
    // Month mode: where the sheet's balance isn't opening + in - out (waste,
    // lending, stock-take differences), one adjustment on the sheet's last day
    // makes the product end on that balance.
    const suggested = importDates(sheet, todayIso()).closing;
    const adjustDate = [closingDate ?? suggested, ...datedLines].sort().slice(-1)[0];
    const locked = lockedMessage(await loadLocks(client, [ownerId]), ownerId, [...dates].sort()[0]);

    if (locked) return fail(locked);

    // 1. Products: add new ones, bring changed ones up to date.
    const itemData = (row: ImportRow) => ({
      name: row.name.slice(0, 200),
      code: row.code,
      specification: row.specification.slice(0, 200),
      group: row.group as never,
      unit: row.unit,
      unitsPerCarton: row.unitsPerCarton,
      cartonPrice: { amountMicros: Math.round(row.cartonPrice * 1_000_000), currencyCode: 'MYR' },
    });
    const toCreate = plan.filter((p) => !p.item);

    for (let i = 0; i < toCreate.length; i += 50) {
      await client.mutation({
        createStockItems: { __args: { data: toCreate.slice(i, i + 50).map((p) => ({ ...itemData(p.row), supplier: 'WeDrink', ownerId, status: 'ACTIVE' })) as never }, id: true },
      });
    }
    const toUpdate = updateDetails ? plan.filter((p) => p.item && p.changes.length) : [];

    for (const p of toUpdate) {
      const item = p.item as StockItem;
      const data = itemData(p.row.perCartonGuessed ? { ...p.row, unitsPerCarton: item.unitsPerCarton } : p.row);

      await client.mutation({ updateStockItem: { __args: { id: item.id, data }, id: true } });
    }

    // 2. Stock lines, only for products with no records yet.
    const items = new Map(
      (await queryAll<Parameters<typeof toStockItem>[0]>(client, 'stockItems', { filter: { ownerId: { eq: ownerId } } }, ITEM_FIELDS)).map(toStockItem).map((i) => [i.code, i]),
    );
    const lines: Array<{ item: StockItem; data: MovementInput }> = [];
    let skipped = 0;

    for (const p of plan) {
      const item = items.get(p.row.code);

      if (!item) continue;
      if (!p.fresh) {
        skipped += 1;
        continue;
      }
      const cost = unitPrice(item);
      const common = { batchId: requestId || null, expiryDate: p.row.expiryDate };

      if (mode === 'closing') {
        if (p.closing > 0) lines.push({ item, data: { ...common, date: closingDate as string, type: 'ADJUST_IN', quantity: p.closing, unitCost: cost, notes: 'Opening balance (from Excel)' } });
        continue;
      }
      if (p.row.openingUnits > 0) lines.push({ item, data: { ...common, date: openingDate as string, type: 'ADJUST_IN', quantity: p.row.openingUnits, unitCost: cost, notes: 'Opening balance (from Excel)' } });
      // Already below zero at the start (more taken out than recorded): carry it over.
      if (p.row.openingUnits < 0) lines.push({ item, data: { ...common, expiryDate: null, date: openingDate as string, type: 'ADJUST_OUT', quantity: -p.row.openingUnits, notes: 'Opening balance below zero (from Excel)' } });
      if (includeOrder && p.row.orderUnits > 0) {
        lines.push({ item, data: { ...common, date: openingDate as string, type: 'PURCHASE', quantity: p.row.orderUnits, unitCost: cost, party: 'WeDrink', reference: 'From Excel: this month ordering' } });
      }
      if (includeOrder) {
        for (const d of p.row.ins) {
          lines.push({ item, data: { ...common, date: d.date, type: 'PURCHASE', quantity: d.units, unitCost: cost, reference: 'From Excel' } });
        }
      }
      if (includeTakes) {
        for (const t of p.row.takes) lines.push({ item, data: { ...common, expiryDate: null, date: t.date, type: 'TAKE', quantity: t.units, notes: 'From Excel' } });
      }
      if (includeOrder && includeTakes && p.row.balanceUnits !== null) {
        const gap = Math.round((p.row.balanceUnits - importComputedClosing(p.row)) * 100) / 100;

        if (gap !== 0) {
          lines.push({
            item,
            data: { ...common, expiryDate: null, date: adjustDate, type: gap > 0 ? 'ADJUST_IN' : 'ADJUST_OUT', quantity: Math.abs(gap), notes: "From Excel: matches the sheet's balance (waste, lending or count differences)" },
          });
        }
      }
    }
    await createMovements(client, lines);

    const parts = [
      toCreate.length ? toCreate.length + ' product' + (toCreate.length === 1 ? '' : 's') + ' added' : '',
      toUpdate.length ? toUpdate.length + ' updated' : '',
      lines.length + ' stock line' + (lines.length === 1 ? '' : 's') + ' recorded',
      skipped ? skipped + ' already had records (stock left as is)' : '',
    ].filter(Boolean);

    return json({ success: true, message: 'Imported: ' + parts.join(', ') + '.' });
  },

  // A count sheet filled in at the shelf (Excel): counts per product, found by item code.
  readCounts: async (client, scope, body) => {
    const ownerId = text(body.ownerId, 64);

    if (ownerId && !inScope(scope, ownerId)) return json({ ...NOT_ALLOWED }, 403);
    const base64 = typeof body.fileBase64 === 'string' ? body.fileBase64 : '';

    if (!base64) return fail('Choose the filled-in count sheet first.');
    if (base64.length > 12_000_000) return fail('That file is too big.');
    let sheets: ReturnType<typeof readXlsx>;

    try {
      sheets = readXlsx(new Uint8Array(Buffer.from(base64, 'base64')));
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Could not read that file.');
    }
    const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
    const data = await loadStockData(client, scope);
    const items = data.items.filter((i) => i.status !== 'DISCONTINUED' && (!ownerId || i.ownerId === ownerId));
    const byCode = new Map(items.filter((i) => i.code).map((i) => [i.code, i]));
    const byName = new Map(items.map((i) => [i.name.toLowerCase(), i]));
    const counts: Array<{ itemId: string; units: number }> = [];
    const unmatched: string[] = [];
    let found = false;

    for (const sheet of sheets) {
      const headerAt = sheet.rows.findIndex((row) => row.some((v) => /^item code/i.test(clean(v))) && row.some((v) => /counted ?\(ctn\)/i.test(clean(v))));

      if (headerAt < 0) continue;
      found = true;
      const header = sheet.rows[headerAt];
      const col = (pattern: RegExp) => header.findIndex((v) => pattern.test(clean(v)));
      const [codeCol, nameCol, ctnCol, looseCol] = [col(/^item code/i), col(/^product name/i), col(/counted ?\(ctn\)/i), col(/counted ?\(loose/i)];
      const numberOf = (v: unknown) => (v === null || v === undefined || clean(v) === '' ? null : Number(clean(v).replace(/[^0-9.-]/g, '')));

      for (const row of sheet.rows.slice(headerAt + 1)) {
        const cartons = ctnCol >= 0 ? numberOf(row[ctnCol]) : null;
        const loose = looseCol >= 0 ? numberOf(row[looseCol]) : null;

        if ((cartons === null || Number.isNaN(cartons)) && (loose === null || Number.isNaN(loose))) continue;
        const code = clean(row[codeCol]);
        const name = clean(row[nameCol]);
        const item = (code ? byCode.get(code) : undefined) ?? byName.get(name.toLowerCase());

        if (!item) {
          unmatched.push(code || name || 'a row');
          continue;
        }
        const units = Math.round(((cartons || 0) * item.unitsPerCarton + (loose || 0)) * 100) / 100;

        if (units >= 0) counts.push({ itemId: item.id, units });
      }
      break;
    }
    if (!found) return fail('This is not a count sheet. It needs the "Item code", "Counted (ctn)" and "Counted (loose units)" columns: download the count sheet from the Stock take screen.');

    return json({ success: true, counts, unmatched, message: counts.length ? 'Read ' + counts.length + ' counted product' + (counts.length === 1 ? '' : 's') + (unmatched.length ? ', ' + unmatched.length + ' not recognised' : '') + '. Check them, then save.' : 'No counts found: fill in the "Counted" columns first.' });
  },

  // ---- branch requests: ask → issue (take-out) → confirm what arrived → resolve a shortage

  saveRequest: async (client, scope, body) => {
    const merged = new Map<string, number>();

    for (const l of Array.isArray(body.lines) ? (body.lines as Json[]) : []) {
      const itemId = text(l.itemId, 64);

      if (itemId && num(l.units) > 0) merged.set(itemId, Math.round(((merged.get(itemId) ?? 0) + num(l.units)) * 100) / 100);
    }
    if (!merged.size) return fail('Put at least one item on the request.');
    const items = await loadItems(client, [...merged.keys()]);
    let ownerId: string | null = null;

    for (const itemId of merged.keys()) {
      const item = items.get(itemId);

      if (!item) return fail('One of the items no longer exists.', 404);
      if (!inScope(scope, item.ownerId)) return json({ ...NOT_ALLOWED }, 403);
      if (ownerId && item.ownerId !== ownerId) return fail('A request is for one workspace: remove the items that belong to another.');
      ownerId = item.ownerId;
    }
    const lines = [...merged].map(([itemId, requestedUnits]) => ({ itemId, requestedUnits }));
    const branch = text(body.branch, 80) || 'Wawa';
    const notes = text(body.notes, 500);

    if (body.id) {
      const request = await loadRequest(client, text(body.id, 64));

      if (!request) return fail('Request not found.', 404);
      if (!inScope(scope, request.ownerId)) return json({ ...NOT_ALLOWED }, 403);
      if (request.status !== 'REQUESTED') return fail('Only a request that has not been issued can be changed.');
      await client.mutation({ updateStockRequest: { __args: { id: request.id, data: { lines: lines as never, branch, notes, name: request.number + ' · ' + branch } }, id: true } });

      return json({ success: true, message: request.number + ' updated.' });
    }
    const requestId = text(body.requestId, 64);

    if (requestId) {
      const { stockRequests } = await client.query({ stockRequests: { __args: { filter: { notes: { like: '%req:' + requestId + '%' } }, first: 1 }, edges: { node: { id: true } } } });

      if (stockRequests?.edges?.length) return json({ success: true, message: 'Request already saved.' });
    }
    const date = todayIso();
    const number = await nextRequestNumber(client, date.slice(0, 4));

    await client.mutation({
      createStockRequest: {
        __args: {
          data: {
            name: number + ' · ' + branch,
            requestNumber: number,
            branch,
            requestDate: date,
            status: 'REQUESTED' as never,
            lines: lines as never,
            notes: [notes, requestId ? 'req:' + requestId : ''].filter(Boolean).join('\n'),
            requestedBy: actorOf.get(client) ?? '',
            ownerId,
          },
        },
        id: true,
      },
    });

    return json({ success: true, message: number + ' saved. The warehouse issues it from the Branch requests tab.' });
  },

  // The warehouse sends the stock: each line becomes a take-out to the branch.
  issueRequest: async (client, scope, body) => {
    const request = await loadRequest(client, text(body.id, 64));

    if (!request) return fail('Request not found.', 404);
    if (!inScope(scope, request.ownerId)) return json({ ...NOT_ALLOWED }, 403);
    if (request.status !== 'REQUESTED') return fail('This request was already issued or cancelled. Reload the page.');
    const date = isDate(body.date) ? body.date : todayIso();
    const given = new Map((Array.isArray(body.lines) ? (body.lines as Json[]) : []).map((l) => [text(l.itemId, 64), num(l.issuedUnits)]));
    const lines = request.lines.map((l) => {
      const units = given.has(l.itemId) ? (given.get(l.itemId) as number) : l.requestedUnits;

      return { ...l, issuedUnits: Number.isFinite(units) && units > 0 ? Math.round(units * 100) / 100 : 0 };
    });

    if (!lines.some((l) => (l.issuedUnits ?? 0) > 0)) return fail('Issue at least one item, or cancel the request.');
    const items = await loadItems(client, lines.map((l) => l.itemId));

    if ([...items.values()].some((item) => !inScope(scope, item.ownerId))) return json({ ...NOT_ALLOWED }, 403);
    const locked = lockedMessage(await loadLocks(client, [request.ownerId]), request.ownerId, date);

    if (locked) return fail(locked);
    const requestId = text(body.requestId, 64);

    // A retried save: the take-outs exist already, only the status may be missing.
    if (!(await alreadySaved(client, requestId))) {
      await createMovements(
        client,
        lines
          .filter((l) => (l.issuedUnits ?? 0) > 0 && items.has(l.itemId))
          .map((l) => ({ item: items.get(l.itemId) as StockItem, data: { date, type: 'TAKE', quantity: l.issuedUnits as number, party: request.branch, reference: request.number, notes: 'Branch request', batchId: requestId || null } })),
      );
    }
    await client.mutation({ updateStockRequest: { __args: { id: request.id, data: { status: 'ISSUED' as never, lines: lines as never, issuedOn: date, issuedBy: actorOf.get(client) ?? '' } }, id: true } });
    const count = lines.filter((l) => (l.issuedUnits ?? 0) > 0).length;

    return json({ success: true, message: 'Issued ' + count + ' item' + (count === 1 ? '' : 's') + ' to ' + request.branch + '. They confirm what arrived on the Branch requests tab.' });
  },

  // The branch counts what arrived. Less than issued makes the request "short".
  receiveRequest: async (client, scope, body) => {
    const request = await loadRequest(client, text(body.id, 64));

    if (!request) return fail('Request not found.', 404);
    if (!inScope(scope, request.ownerId)) return json({ ...NOT_ALLOWED }, 403);
    if (request.status !== 'ISSUED') return fail('This delivery was already confirmed, or has not been issued yet. Reload the page.');
    const items = await loadItems(client, request.lines.map((l) => l.itemId));
    const got = new Map((Array.isArray(body.lines) ? (body.lines as Json[]) : []).map((l) => [text(l.itemId, 64), num(l.receivedUnits)]));
    const lines: typeof request.lines = [];

    for (const l of request.lines) {
      if (!((l.issuedUnits ?? 0) > 0)) {
        lines.push(l);
        continue;
      }
      const units = got.has(l.itemId) ? (got.get(l.itemId) as number) : (l.issuedUnits as number);

      if (!(Number.isFinite(units) && units >= 0)) return fail('Type how many arrived (0 if none).');
      if (units > (l.issuedUnits as number) + 0.001) return fail((items.get(l.itemId)?.name ?? 'An item') + ': more arrived than was issued (' + l.issuedUnits + '). Ask the warehouse to correct what they issued.');
      lines.push({ ...l, receivedUnits: Math.round(units * 100) / 100 });
    }
    const short = lines.filter((l) => shortUnits(l) > 0);

    await client.mutation({
      updateStockRequest: { __args: { id: request.id, data: { status: (short.length ? 'SHORT' : 'RECEIVED') as never, lines: lines as never, receivedOn: isDate(body.date) ? body.date : todayIso(), receivedBy: actorOf.get(client) ?? '' } }, id: true },
    });

    return json({
      success: true,
      message: short.length ? 'Saved: ' + short.length + ' item' + (short.length === 1 ? ' is' : 's are') + ' short. A manager puts them back in stock or writes them off.' : 'Delivery confirmed: everything arrived.',
    });
  },

  // A manager settles a shortage: back into stock, or written off as lost.
  resolveShort: async (client, scope, body) => {
    const request = await loadRequest(client, text(body.id, 64));

    if (!request) return fail('Request not found.', 404);
    if (!inScope(scope, request.ownerId)) return json({ ...NOT_ALLOWED }, 403);
    if (!canManage(scope, request.ownerId)) return fail("Only an admin or this workspace's host can settle a short delivery.", 403);
    if (request.status !== 'SHORT') return fail('Nothing short to settle on this request.');
    const how = body.how === 'WRITE_OFF' ? 'WRITE_OFF' : 'RETURN';
    const date = isDate(body.date) ? body.date : todayIso();
    const locked = lockedMessage(await loadLocks(client, [request.ownerId]), request.ownerId, date);

    if (locked) return fail(locked);
    const pending = unresolvedShort(request);
    const items = await loadItems(client, pending.map((l) => l.itemId));
    const requestId = text(body.requestId, 64);

    if (!(await alreadySaved(client, requestId))) {
      await createMovements(
        client,
        pending
          .filter((l) => items.has(l.itemId))
          .flatMap((l) => {
            const item = items.get(l.itemId) as StockItem;
            const units = shortUnits(l);
            const common = { date, quantity: units, party: request.branch, reference: request.number, batchId: requestId || null };

            // The short units are not at the branch, so they come back into the warehouse count.
            if (how === 'RETURN') return [{ item, data: { ...common, type: 'RETURN', notes: 'Short delivery ' + request.number + ': not received by ' + request.branch + ', put back in stock' } }];

            // Lost on the way: they already left the warehouse when issued, so the count must not
            // drop twice. Bring them back, then write the same units off, so the loss is on record.
            return [
              { item, data: { ...common, type: 'RETURN', notes: 'Short delivery ' + request.number + ': not received by ' + request.branch + ' (undoes that part of the take-out)' } },
              { item, data: { ...common, type: 'WASTE', reason: 'LOST', notes: 'Short delivery ' + request.number + ': lost on the way to ' + request.branch } },
            ];
          }),
      );
    }
    const lines = request.lines.map((l) => (shortUnits(l) > 0 && !l.resolved ? { ...l, resolved: (how === 'RETURN' ? 'RETURNED' : 'WRITTEN_OFF') as 'RETURNED' | 'WRITTEN_OFF' } : l));

    await client.mutation({ updateStockRequest: { __args: { id: request.id, data: { status: 'RECEIVED' as never, lines: lines as never } }, id: true } });

    return json({ success: true, message: how === 'RETURN' ? 'Put back in stock.' : 'Written off as lost. The warehouse count stays as it is (the stock left when it was issued); the loss shows under "Where the loss went".' });
  },

  cancelRequest: async (client, scope, body) => {
    const request = await loadRequest(client, text(body.id, 64));

    if (!request) return fail('Request not found.', 404);
    if (!inScope(scope, request.ownerId)) return json({ ...NOT_ALLOWED }, 403);
    if (request.status !== 'REQUESTED') return fail('Only a request that has not been issued can be cancelled.');
    await client.mutation({ updateStockRequest: { __args: { id: request.id, data: { status: 'CANCELLED' as never } }, id: true } });

    return json({ success: true, message: request.number + ' cancelled.' });
  },

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
    if (!canManage(scope, ownerId)) return fail("Only an admin or this workspace's host can add or change items and prices. Ask them, or record the stock IN/OUT instead.", 403);

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

    const opening = num(body.openingUnits);
    const openingDate = isDate(body.openingDate) ? body.openingDate : todayIso();
    const openingLocked = opening > 0 ? lockedMessage(await loadLocks(client, [ownerId]), ownerId, openingDate) : null;

    if (openingLocked) return fail(openingLocked);
    const { createStockItem } = await client.mutation({ createStockItem: { __args: { data: { ...data, ownerId, status: 'ACTIVE' as never } }, id: true } });
    const created = createStockItem?.id ? await loadItem(client, createStockItem.id) : null;

    if (created && opening > 0) {
      await createMovement(client, created, {
        date: openingDate,
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
    if (!canManage(scope, item.ownerId)) return fail("Only an admin or this workspace's host can discontinue or reactivate items. Ask them, or record the stock IN/OUT instead.", 403);
    const status = body.status === 'DISCONTINUED' ? 'DISCONTINUED' : 'ACTIVE';

    if (status === 'DISCONTINUED') {
      const balance = balanceOf(await loadItemMovements(client, item.id));

      if (balance > 0 && body.writeOff !== true) {
        return json({ success: false, needsWriteOff: true, balance, message: `${cartonsAndUnits(balance, item)} is still in stock. Use it up first, or write it off as waste.` }, 409);
      }
      if (balance > 0) {
        const writeOffDate = isDate(body.date) ? body.date : todayIso();
        const locked = lockedMessage(await loadLocks(client, [item.ownerId]), item.ownerId, writeOffDate);

        if (locked) return fail(locked);
        await createMovement(client, item, { date: writeOffDate, type: 'WASTE', reason: 'DISCONTINUED', quantity: balance, notes: 'Written off when discontinued' });
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
    const reason = type === 'WASTE' ? text(body.reason, 20) : '';

    if (type === 'WASTE' && !WASTE_REASONS.some((r) => r.pick && r.value === reason)) return fail('Pick why it was wasted (expired, spilled, staff meal...).');
    const requestId = text(body.requestId, 64) || `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

    if (await alreadySaved(client, requestId)) return json({ success: true, message: 'Already saved.' });

    const items = await loadItems(client, lines.map((line) => text(line.itemId, 64)));

    for (const line of lines) {
      const item = items.get(text(line.itemId, 64));

      if (!(num(line.quantity) > 0)) return fail('Each line needs a quantity more than 0.');
      if (!item) return fail('One of the items no longer exists.', 404);
      if (!inScope(scope, item.ownerId)) return json({ ...NOT_ALLOWED }, 403);
      if (item.status === 'DISCONTINUED' && type === 'PURCHASE') return fail(`${item.name} is discontinued. Reactivate it before buying more.`);
    }
    const locks = await loadLocks(client, [...items.values()].map((i) => i.ownerId));

    for (const item of items.values()) {
      const locked = lockedMessage(locks, item.ownerId, body.date as string);

      if (locked) return fail(locked);
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
            reason: reason || null,
            borrowStatus: type === 'BORROW' ? 'OUTSTANDING' : null,
            batchId: requestId || null,
          },
        };
      }),
    );

    if (type === 'PURCHASE' && body.addExpense !== false) {
      await bookPurchaseExpense(
        client,
        requestId,
        lines.map((line) => {
          const item = items.get(text(line.itemId, 64)) as StockItem;
          const cost = line.unitCost === undefined || line.unitCost === null || line.unitCost === '' ? NaN : num(line.unitCost);

          return { item, units: num(line.quantity), unitCost: cost >= 0 ? cost : unitPrice(item) };
        }),
        { date: body.date as string, supplier: text(body.party, 120), reference: text(body.reference, 120) },
      );

      return json({ success: true, message: `Recorded ${lines.length} line${lines.length === 1 ? '' : 's'} and added the cost to Expenses.` });
    }

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
    const settleLocked = how !== 'PAID' ? lockedMessage(await loadLocks(client, [item.ownerId]), item.ownerId, date) : null;

    if (settleLocked) return fail(settleLocked);

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
    const takeLocks = await loadLocks(client, [...items.values()].map((i) => i.ownerId));

    for (const item of items.values()) {
      const locked = lockedMessage(takeLocks, item.ownerId, date);

      if (locked) return fail(locked);
    }
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
        data: { date, type: diff > 0 ? 'ADJUST_IN' : 'ADJUST_OUT', quantity: Math.abs(diff), notes: `Stock take: counted ${counted}, expected ${expected}`, batchId: requestId || null, reason: diff < 0 ? 'COUNT' : null },
      });
    }

    await createMovements(client, adjustments);
    const adjusted = adjustments.length;

    return json({ success: true, message: adjusted ? `Stock take saved: ${adjusted} item${adjusted === 1 ? '' : 's'} adjusted.` : 'Stock take saved: everything matched.' });
  },

  deleteMovement: async (client, scope, body) => {
    const id = text(body.movementId, 64);
    const { stockMovements } = await client.query({ stockMovements: { __args: { filter: { id: { eq: id } }, first: 1 }, edges: { node: { id: true, ownerId: true, movementDate: true, movementType: true, batchId: true } } } });
    const movement = stockMovements?.edges?.[0]?.node;

    if (!movement) return fail('Movement not found.', 404);
    if (!inScope(scope, movement.ownerId)) return json({ ...NOT_ALLOWED }, 403);
    if (!canManage(scope, movement.ownerId)) return fail("Only an admin or this workspace's host can remove recorded lines. Ask them, or record the stock IN/OUT instead.", 403);
    const removeLocked = lockedMessage(await loadLocks(client, [movement.ownerId ?? null]), movement.ownerId ?? null, movement.movementDate ?? '');

    if (removeLocked) return fail(removeLocked);
    // Soft delete: it can be restored from the deleted records.
    await client.mutation({ deleteStockMovement: { __args: { id }, id: true } });
    if (movement.movementType === 'PURCHASE' && movement.batchId) await resyncPurchaseExpense(client, movement.batchId);

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
    const receiveLocked = lockedMessage(await loadLocks(client, [order.ownerId]), order.ownerId, body.date);

    if (receiveLocked) return fail(receiveLocked);
    const requestId = text(body.requestId, 64);

    if (await alreadySaved(client, requestId)) return json({ success: true, message: 'Already saved.' });

    const batch = requestId || `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
              batchId: batch,
              orderId: order.id,
            },
          };
        }),
    );

    if (body.addExpense !== false) {
      await bookPurchaseExpense(
        client,
        batch,
        lines
          .filter((l) => l.units > 0)
          .map((l) => {
            const item = items.get(l.itemId) as StockItem;

            return { item, units: l.units, unitCost: (ordered.get(l.itemId)?.cartonPrice ?? item.cartonPrice) / (item.unitsPerCarton || 1) };
          }),
        { date: body.date as string, supplier: order.supplier, reference },
      );
    }

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

  closeMonth: async (client, scope, body) => {
    const ownerId = text(body.ownerId, 64);
    const month = text(body.month, 7);

    if (!ownerId) return fail('Pick a workspace first: each workspace closes its own months.');
    if (!inScope(scope, ownerId)) return json({ ...NOT_ALLOWED }, 403);
    if (!canManage(scope, ownerId)) return fail("Only an admin or this workspace's host can close months. Ask them, or record the stock IN/OUT instead.", 403);
    if (!/^\d{4}-\d{2}$/.test(month)) return fail('Pick a month.');
    const end = monthEnd(month);

    if (end >= todayIso()) return fail(`${monthName(end)} isn't over yet. Close it from the 1st of next month.`);
    const locks = await loadLocks(client, [ownerId]);
    const through = locks.get(ownerId);

    if (through && through >= end) return json({ success: true, message: `${monthName(end)} is already closed.` });
    await client.mutation({ updateOwner: { __args: { id: ownerId, data: { stockLockedThrough: end } }, id: true } });

    return json({ success: true, message: `Closed up to ${monthName(end)}. Stock IN/OUT on or before ${end} is now locked.` });
  },

  reopenMonth: async (client, scope, body) => {
    const ownerId = text(body.ownerId, 64);

    if (!ownerId) return fail('Pick a workspace first.');
    if (!inScope(scope, ownerId)) return json({ ...NOT_ALLOWED }, 403);
    if (!canManage(scope, ownerId)) return fail("Only an admin or this workspace's host can reopen months. Ask them, or record the stock IN/OUT instead.", 403);
    const through = (await loadLocks(client, [ownerId])).get(ownerId);

    if (!through) return json({ success: true, message: 'No month is closed.' });
    // Step back one month: the latest closed month opens again.
    const previous = monthEnd(`${through.slice(0, 4)}-${through.slice(5, 7)}`.replace(/^(\d{4})-(\d{2})$/, (_, y, m) => (m === '01' ? `${Number(y) - 1}-12` : `${y}-${String(Number(m) - 1).padStart(2, '0')}`)));

    await client.mutation({ updateOwner: { __args: { id: ownerId, data: { stockLockedThrough: previous } }, id: true } });

    return json({ success: true, message: `${monthName(through)} is open again. Close it again when the corrections are done.` });
  },

  saveRule: async (client, scope, body) => {
    const ownerId = text(body.ownerId, 64);
    const reorderBelow = num(body.reorderBelow);
    const orderUpTo = num(body.orderUpTo);
    const leadDays = body.leadDays === undefined || body.leadDays === '' ? 0 : num(body.leadDays);

    if (!ownerId || !inScope(scope, ownerId)) return json({ ...NOT_ALLOWED }, 403);
    if (!canManage(scope, ownerId)) return fail("Only an admin or this workspace's host can change the re-order rule. Ask them, or record the stock IN/OUT instead.", 403);
    if (!(reorderBelow > 0) || !(orderUpTo > 0)) return fail('Both numbers must be more than 0 months.');
    if (orderUpTo < reorderBelow) return fail('"Order enough for" must be at least the re-order level.');
    if (!(leadDays >= 0 && leadDays <= 120)) return fail('Delivery days must be between 0 and 120.');
    await client.mutation({ updateOwner: { __args: { id: ownerId, data: { stockReorderBelowMonths: reorderBelow, stockOrderUpToMonths: orderUpTo, stockLeadDays: Math.round(leadDays) } }, id: true } });

    return json({ success: true, message: 'Re-order rule saved.' });
  },
};

const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as Json;
  const action = handlers[text(body.action, 30)];

  if (!action) return fail('Unknown action.');

  try {
    const client = appClient();
    const [scope, actor] = await Promise.all([resolveScope(client, context?.workspaceMemberId), body.action === 'data' || body.action === 'alerts' || body.action === 'readCounts' || (body.action === 'importExcel' && body.apply !== true) ? '' : memberName(client, context?.workspaceMemberId)]);

    if (actor) actorOf.set(client, actor);

    return await action(client, scope, body);
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
