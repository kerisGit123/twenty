import { type CoreApiClient } from 'twenty-client-sdk/core';

import { queryAll } from 'src/logic-functions/utils/query-all';
import { inScope, type Scope } from 'src/logic-functions/utils/scope';
import { DEFAULT_RULE, type StockItem, type StockMovement, type StockRule } from 'src/shared/stock';
import { parseOrderLines, type StockOrder } from 'src/shared/stock-orders';

// Stock items, their movements and each workspace's reorder rule, limited to
// the caller's workspaces.

// lockedThrough: the last day of the latest closed month (stock before it is locked).
export type StockOwner = { id: string; name: string; rule: StockRule; lockedThrough: string | null };

export type StockData = { items: StockItem[]; movements: StockMovement[]; owners: StockOwner[]; orders: StockOrder[] };

type OrderNode = {
  id: string;
  orderNumber?: string | null;
  supplier?: string | null;
  orderDate?: string | null;
  status?: string | null;
  supplierRef?: string | null;
  notes?: string | null;
  ownerId?: string | null;
  lines?: unknown;
};

export const ORDER_FIELDS = { id: true, orderNumber: true, supplier: true, orderDate: true, status: true, supplierRef: true, notes: true, ownerId: true, lines: true };

export const toStockOrder = (node: OrderNode): StockOrder => ({
  id: node.id,
  number: node.orderNumber ?? '',
  supplier: node.supplier ?? '',
  date: node.orderDate ?? '',
  status: node.status ?? 'DRAFT',
  supplierRef: node.supplierRef ?? '',
  notes: node.notes ?? '',
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
  ownerId?: string | null;
};

type OwnerNode = { id: string; name?: string | null; stockReorderBelowMonths?: number | null; stockOrderUpToMonths?: number | null; stockLockedThrough?: string | null };

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
  ownerId: node.ownerId ?? null,
});

export const loadItemMovements = async (client: CoreApiClient, itemId: string) =>
  (await queryAll<MovementNode>(client, 'stockMovements', { filter: { itemId: { eq: itemId } } }, MOVEMENT_FIELDS)).map(toStockMovement);

export const loadMovementsOf = async (client: CoreApiClient, itemIds: string[]) =>
  itemIds.length
    ? (await queryAll<MovementNode>(client, 'stockMovements', { filter: { itemId: { in: itemIds } } }, MOVEMENT_FIELDS)).map(toStockMovement)
    : [];

export const loadStockData = async (client: CoreApiClient, scope: Scope): Promise<StockData> => {
  const [items, movements, owners, orders] = await Promise.all([
    queryAll<ItemNode>(client, 'stockItems', { orderBy: [{ code: 'AscNullsLast' }] }, ITEM_FIELDS),
    queryAll<MovementNode>(client, 'stockMovements', { orderBy: [{ movementDate: 'AscNullsLast' }] }, MOVEMENT_FIELDS),
    queryAll<OwnerNode>(client, 'owners', { orderBy: [{ name: 'AscNullsLast' }] }, { id: true, name: true, stockReorderBelowMonths: true, stockOrderUpToMonths: true, stockLockedThrough: true }),
    queryAll<OrderNode>(client, 'stockOrders', { orderBy: [{ orderDate: 'DescNullsLast' }] }, ORDER_FIELDS),
  ]);

  return {
    items: items.map(toStockItem).filter((item) => inScope(scope, item.ownerId)),
    movements: movements.map(toStockMovement).filter((m) => m.itemId && m.date && inScope(scope, m.ownerId)),
    orders: orders.map(toStockOrder).filter((o) => inScope(scope, o.ownerId)),
    owners: owners
      .filter((owner) => inScope(scope, owner.id))
      .map((owner) => ({
        id: owner.id,
        name: owner.name ?? 'Workspace',
        rule: {
          reorderBelow: owner.stockReorderBelowMonths ?? DEFAULT_RULE.reorderBelow,
          orderUpTo: owner.stockOrderUpToMonths ?? DEFAULT_RULE.orderUpTo,
        },
        lockedThrough: owner.stockLockedThrough ?? null,
      })),
  };
};
