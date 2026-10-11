import { type CoreApiClient } from 'twenty-client-sdk/core';

import { queryAll } from 'src/logic-functions/utils/query-all';
import { canManage, inScope, type Scope } from 'src/logic-functions/utils/scope';
import { averageUnitCost, DEFAULT_RULE, type StockItem, type StockMovement, type StockRule } from 'src/shared/stock';
import { parseRequestLines, type StockRequest } from 'src/shared/stock-requests';
import { parseOrderLines, type StockOrder } from 'src/shared/stock-orders';

// Stock items, their movements and each workspace's reorder rule, limited to
// the caller's workspaces.

// lockedThrough: the last day of the latest closed month (stock before it is locked).
// canManage: may edit items, remove lines, close months (admins and the workspace's hosts).
export type StockOwner = { id: string; name: string; rule: StockRule; lockedThrough: string | null; canManage: boolean };

export type StockData = { items: StockItem[]; movements: StockMovement[]; owners: StockOwner[]; orders: StockOrder[]; requests: StockRequest[] };

type RequestNode = {
  id: string;
  requestNumber?: string | null;
  branch?: string | null;
  requestDate?: string | null;
  status?: string | null;
  notes?: string | null;
  requestedBy?: string | null;
  issuedOn?: string | null;
  issuedBy?: string | null;
  receivedOn?: string | null;
  receivedBy?: string | null;
  ownerId?: string | null;
  lines?: unknown;
};

export const REQUEST_FIELDS = { id: true, requestNumber: true, branch: true, requestDate: true, status: true, notes: true, requestedBy: true, issuedOn: true, issuedBy: true, receivedOn: true, receivedBy: true, ownerId: true, lines: true };

export const toStockRequest = (node: RequestNode): StockRequest => ({
  id: node.id,
  number: node.requestNumber ?? '',
  branch: node.branch ?? '',
  date: node.requestDate ?? '',
  status: node.status ?? 'REQUESTED',
  // "req:<id>" lines are retry markers, not notes.
  notes: (node.notes ?? '').split('\n').filter((line) => !line.startsWith('req:')).join('\n'),
  requestedBy: node.requestedBy ?? '',
  issuedOn: node.issuedOn ?? null,
  issuedBy: node.issuedBy ?? '',
  receivedOn: node.receivedOn ?? null,
  receivedBy: node.receivedBy ?? '',
  ownerId: node.ownerId ?? null,
  lines: parseRequestLines(node.lines),
});

type OrderNode = {
  id: string;
  orderNumber?: string | null;
  supplier?: string | null;
  orderDate?: string | null;
  status?: string | null;
  supplierRef?: string | null;
  supplierPhone?: string | null;
  notes?: string | null;
  ownerId?: string | null;
  lines?: unknown;
};

export const ORDER_FIELDS = { id: true, orderNumber: true, supplier: true, orderDate: true, status: true, supplierRef: true, supplierPhone: true, notes: true, ownerId: true, lines: true };

export const toStockOrder = (node: OrderNode): StockOrder => ({
  id: node.id,
  number: node.orderNumber ?? '',
  supplier: node.supplier ?? '',
  date: node.orderDate ?? '',
  status: node.status ?? 'DRAFT',
  supplierRef: node.supplierRef ?? '',
  supplierPhone: node.supplierPhone ?? '',
  // "req:<id>" lines are retry markers, not notes.
  notes: (node.notes ?? '').split('\n').filter((line) => !line.startsWith('req:')).join('\n'),
  ownerId: node.ownerId ?? null,
  lines: parseOrderLines(node.lines),
});

type ItemNode = {
  id: string;
  code?: string | null;
  name?: string | null;
  specification?: string | null;
  group?: string | null;
  unit?: string | null;
  unitsPerCarton?: number | null;
  cartonPrice?: { amountMicros?: number | null } | null;
  supplier?: string | null;
  status?: string | null;
  reorderBelowMonths?: number | null;
  notes?: string | null;
  ownerId?: string | null;
  owner?: { name?: string | null } | null;
};

type MovementNode = {
  id: string;
  itemId?: string | null;
  movementDate?: string | null;
  movementType?: string | null;
  quantity?: number | null;
  party?: string | null;
  unitCost?: number | null;
  expiryDate?: string | null;
  reference?: string | null;
  notes?: string | null;
  borrowStatus?: string | null;
  borrowId?: string | null;
  batchId?: string | null;
  orderId?: string | null;
  recordedBy?: string | null;
  reason?: string | null;
  ownerId?: string | null;
};

type OwnerNode = { id: string; name?: string | null; stockReorderBelowMonths?: number | null; stockOrderUpToMonths?: number | null; stockLockedThrough?: string | null; stockLeadDays?: number | null };

export const toStockItem = (node: ItemNode): StockItem => ({
  id: node.id,
  code: node.code ?? '',
  name: node.name ?? '',
  specification: node.specification ?? '',
  group: node.group ?? 'RAW',
  unit: node.unit ?? '',
  unitsPerCarton: Number(node.unitsPerCarton) || 1,
  cartonPrice: (node.cartonPrice?.amountMicros ?? 0) / 1_000_000,
  supplier: node.supplier ?? '',
  status: node.status ?? 'ACTIVE',
  reorderBelowMonths: node.reorderBelowMonths ?? null,
  notes: node.notes ?? '',
  ownerId: node.ownerId ?? null,
  ownerName: node.owner?.name ?? '',
});

export const ITEM_FIELDS = {
  id: true,
  code: true,
  name: true,
  specification: true,
  group: true,
  unit: true,
  unitsPerCarton: true,
  cartonPrice: { amountMicros: true },
  supplier: true,
  status: true,
  reorderBelowMonths: true,
  notes: true,
  ownerId: true,
  owner: { name: true },
};

const MOVEMENT_FIELDS = {
  id: true,
  itemId: true,
  movementDate: true,
  movementType: true,
  quantity: true,
  party: true,
  unitCost: true,
  expiryDate: true,
  reference: true,
  notes: true,
  borrowStatus: true,
  borrowId: true,
  batchId: true,
  orderId: true,
  recordedBy: true,
  reason: true,
  ownerId: true,
};

export const toStockMovement = (node: MovementNode): StockMovement => ({
  id: node.id,
  itemId: node.itemId ?? '',
  date: node.movementDate ?? '',
  type: node.movementType ?? 'TAKE',
  quantity: Number(node.quantity) || 0,
  party: node.party ?? '',
  unitCost: node.unitCost ?? null,
  expiryDate: node.expiryDate ?? null,
  reference: node.reference ?? '',
  notes: node.notes ?? '',
  borrowStatus: node.borrowStatus ?? null,
  borrowId: node.borrowId ?? null,
  batchId: node.batchId ?? null,
  orderId: node.orderId ?? null,
  recordedBy: node.recordedBy ?? '',
  reason: node.reason ?? '',
  ownerId: node.ownerId ?? null,
});

export const loadItemMovements = async (client: CoreApiClient, itemId: string) =>
  (await queryAll<MovementNode>(client, 'stockMovements', { filter: { itemId: { eq: itemId } } }, MOVEMENT_FIELDS)).map(toStockMovement);

export const loadMovementsOf = async (client: CoreApiClient, itemIds: string[]) =>
  itemIds.length
    ? (await queryAll<MovementNode>(client, 'stockMovements', { filter: { itemId: { in: itemIds } } }, MOVEMENT_FIELDS)).map(toStockMovement)
    : [];

export const loadStockData = async (client: CoreApiClient, scope: Scope): Promise<StockData> => {
  const [items, movements, owners, orders, requests] = await Promise.all([
    queryAll<ItemNode>(client, 'stockItems', { orderBy: [{ code: 'AscNullsLast' }] }, ITEM_FIELDS),
    queryAll<MovementNode>(client, 'stockMovements', { orderBy: [{ movementDate: 'AscNullsLast' }] }, MOVEMENT_FIELDS),
    queryAll<OwnerNode>(client, 'owners', { orderBy: [{ name: 'AscNullsLast' }] }, { id: true, name: true, stockReorderBelowMonths: true, stockOrderUpToMonths: true, stockLockedThrough: true, stockLeadDays: true }),
    queryAll<OrderNode>(client, 'stockOrders', { orderBy: [{ orderDate: 'DescNullsLast' }] }, ORDER_FIELDS),
    queryAll<RequestNode>(client, 'stockRequests', { orderBy: [{ requestDate: 'DescNullsLast' }] }, REQUEST_FIELDS),
  ]);

  const allMovements = movements.map(toStockMovement);
  const byItem = new Map<string, StockMovement[]>();

  for (const m of allMovements) byItem.set(m.itemId, [...(byItem.get(m.itemId) ?? []), m]);

  return {
    items: items
      .map(toStockItem)
      .filter((item) => inScope(scope, item.ownerId))
      .map((item) => ({ ...item, avgUnitCost: averageUnitCost(byItem.get(item.id) ?? []) })),
    movements: movements.map(toStockMovement).filter((m) => m.itemId && m.date && inScope(scope, m.ownerId)),
    orders: orders.map(toStockOrder).filter((o) => inScope(scope, o.ownerId)),
    requests: requests.map(toStockRequest).filter((r) => inScope(scope, r.ownerId)),
    owners: owners
      .filter((owner) => inScope(scope, owner.id))
      .map((owner) => ({
        id: owner.id,
        name: owner.name ?? 'Workspace',
        rule: {
          reorderBelow: owner.stockReorderBelowMonths ?? DEFAULT_RULE.reorderBelow,
          orderUpTo: owner.stockOrderUpToMonths ?? DEFAULT_RULE.orderUpTo,
          leadDays: Number(owner.stockLeadDays) || 0,
        },
        lockedThrough: owner.stockLockedThrough ?? null,
        canManage: canManage(scope, owner.id),
      })),
  };
};
