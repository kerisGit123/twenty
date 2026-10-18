import { useCallback, useEffect, useMemo, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';

import { useOwnerScope } from 'src/front-components/shared/owner-switcher';
import { ItemSheet, RecordSheet, RuleSheet, SettleSheet, stockAction, WriteOffSheet } from 'src/front-components/shared/stock-forms';
import { StockTakeSheet } from 'src/front-components/shared/stock-take-sheet';
import { ItemDetailSheet } from 'src/front-components/shared/stock-detail';
import { StockHandTab } from 'src/front-components/shared/stock-hand-tab';
import { MonthTab } from 'src/front-components/shared/stock-month-tab';
import { OrderTab } from 'src/front-components/shared/stock-order-tab';
import { OrdersTab } from 'src/front-components/shared/stock-orders-tab';
import { MonthEndTab } from 'src/front-components/shared/stock-monthend-tab';
import { ExpiredSheet, QuickSheet } from 'src/front-components/shared/stock-quick';
import { onOrderUnits, orderAttention } from 'src/shared/stock-orders';
import { requestCounts, type StockRequest } from 'src/shared/stock-requests';
import { BorrowTab } from 'src/front-components/shared/stock-borrow-tab';
import { HistoryTab } from 'src/front-components/shared/stock-history-tab';
import { ImportSheet } from 'src/front-components/shared/stock-import-sheet';
import { IssueSheet, ReceiveRequestSheet, RequestSheet, RequestsTab, SettleRequestSheet } from 'src/front-components/shared/stock-requests-tab';
import { c, control, lastPartyFor, primary } from 'src/front-components/shared/stock-ui';
import { UsageTab } from 'src/front-components/shared/stock-usage-tab';
import type { StockData } from 'src/logic-functions/utils/stock-data';
import { todayIso } from 'src/logic-functions/utils/dates';
import { balanceOf, DEFAULT_RULE, groupMovements, lastPaidPerUnit, type StockItem, type StockMovement, stockStatus } from 'src/shared/stock';

// Stock: an F&B warehouse (iPeak) — what's in hand, every IN and OUT, the
// monthly restock sheet, the forecast and order plan, and stock lent to
// other branches.

type Tab = 'stock' | 'movements' | 'month' | 'order' | 'orders' | 'requests' | 'borrowed' | 'monthend' | 'usage';

// Simple view: what a person at the shelf needs. Four big buttons and three tabs.
const SIMPLE_KEY = 'stock.simpleView';
const readSimplePref = (): boolean | null => {
  try {
    const value = globalThis.localStorage?.getItem(SIMPLE_KEY);

    return value === 'simple' ? true : value === 'full' ? false : null;
  } catch {
    return null;
  }
};
const writeSimplePref = (simple: boolean) => {
  try {
    globalThis.localStorage?.setItem(SIMPLE_KEY, simple ? 'simple' : 'full');
  } catch {
    // Storage can be unavailable; the switch still works for this page.
  }
};
// Staff (the simple view) see Stock, Ordering and Loans; managers also History and Month end.
const SIMPLE_TABS: string[] = ['stock', 'ordering', 'borrowed'];

// The everyday jobs, one big button each. Borrowing and lending share one button
// (Quick entry has both inside).
const BIG_BUTTONS = [
  { key: 'TAKE', label: 'Take out', hint: 'to the shop', icon: '↑', color: 'blue' },
  { key: 'PURCHASE', label: 'Stock in', hint: 'a delivery came', icon: '↓', color: 'green' },
  { key: 'WASTE', label: 'Waste', hint: 'thrown away', icon: '🗑', color: 'red' },
  { key: 'COUNT', label: 'Count', hint: 'check the shelf', icon: '✔', color: 'gray' },
  { key: 'BORROW_IN', label: 'Borrow / lend', hint: 'with another shop', icon: '⇄', color: 'purple' },
] as const;

type Open =
  | { kind: 'item'; item: StockItem | null }
  | { kind: 'detail'; itemId: string }
  | { kind: 'record'; type: string; itemId?: string; lines?: Array<{ itemId: string; units: number }> }
  | { kind: 'settle'; borrow: StockMovement }
  | { kind: 'take'; date?: string }
  | { kind: 'quick'; quickKind?: 'TAKE' | 'WASTE' | 'PURCHASE' | 'BORROW_IN' | 'BORROW' }
  | { kind: 'import' }
  | { kind: 'request'; request: StockRequest | null }
  | { kind: 'issue'; request: StockRequest }
  | { kind: 'receiveRequest'; request: StockRequest }
  | { kind: 'settleRequest'; request: StockRequest }
  | { kind: 'expired' }
  | { kind: 'rule' }
  | { kind: 'writeOff'; item: StockItem; message: string }
  | null;

// Five tabs. Ordering and Month end each hold a few related views, picked inside the tab.
type Group = 'stock' | 'movements' | 'ordering' | 'borrowed' | 'monthend';
const TABS: Array<{ key: Group; label: string }> = [
  { key: 'stock', label: 'Stock' },
  { key: 'movements', label: 'History' },
  { key: 'ordering', label: 'Ordering' },
  { key: 'borrowed', label: 'Loans' },
  { key: 'monthend', label: 'Month end' },
];
const GROUP_OF: Record<Tab, Group> = { stock: 'stock', movements: 'movements', order: 'ordering', orders: 'ordering', requests: 'ordering', borrowed: 'borrowed', monthend: 'monthend', month: 'monthend', usage: 'monthend' };
const VIEWS: Partial<Record<Group, Array<{ key: Tab; label: string; managers?: boolean }>>> = {
  ordering: [
    { key: 'order', label: 'What to order', managers: true },
    { key: 'orders', label: 'Orders' },
    { key: 'requests', label: 'Branch requests' },
  ],
  monthend: [
    { key: 'monthend', label: 'Close the month' },
    { key: 'month', label: 'Monthly sheet' },
    { key: 'usage', label: 'Usage vs sales' },
  ],
};

export const StockPage = () => {
  const scope = useOwnerScope();
  const [tab, setTab] = useState<Tab>('stock');
  const [data, setData] = useState<StockData | null>(null);
  const [today, setToday] = useState(todayIso());
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState<Open>(null);
  const [simplePref, setSimplePref] = useState<boolean | null>(readSimplePref);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // The remembered workspace is checked first: loading before that could show another (or none).
    if (!scope.ready) return;
    setError('');
    new RestApiClient()
      .post<{ success: boolean; data?: StockData; today?: string; message?: string }>('/s/stock', { action: 'data', ownerId: scope.ownerId || undefined })
      .then((result) => {
        if (cancelled) return;
        if (!result.success || !result.data) setError(result.message ?? 'Could not load the stock.');
        else {
          setData(result.data);
          if (result.today) setToday(result.today);
        }
      })
      .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : String(reason)));

    return () => {
      cancelled = true;
    };
  }, [reload, scope.ownerId, scope.ready]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);
  const done = useCallback(() => {
    setOpen(null);
    refresh();
  }, [refresh]);

  const ownerId = scope.ownerId || '';
  const items = useMemo(() => (data?.items ?? []).filter((i) => !ownerId || i.ownerId === ownerId), [data, ownerId]);
  const movements = useMemo(() => (data?.movements ?? []).filter((m) => !ownerId || m.ownerId === ownerId), [data, ownerId]);
  const byItem = useMemo(() => groupMovements(movements), [movements]);
  // What each item cost per unit on its latest delivery (for price-rise warnings).
  const lastPaid = useMemo(() => {
    const map = new Map<string, number>();

    for (const [itemId, list] of byItem) {
      const paid = lastPaidPerUnit(list);

      if (paid !== null) map.set(itemId, paid);
    }

    return map;
  }, [byItem]);
  const ownerName = useCallback((id: string | null) => data?.owners.find((o) => o.id === id)?.name ?? '', [data]);
  const balances = useMemo(() => new Map(items.map((i) => [i.id, balanceOf(byItem.get(i.id) ?? [])])), [items, byItem]);
  // Shops that appear in earlier loans (lent or borrowed): one tap instead of typing the name again.
  const shops = useMemo(
    () => [...new Set(movements.filter((m) => (m.type === 'BORROW' || m.type === 'BORROW_IN') && m.party.trim()).map((m) => m.party.trim()))].sort((a, b) => a.localeCompare(b)),
    [movements],
  );
  const ruleOf = useCallback((ownerOf: string | null) => data?.owners.find((o) => o.id === ownerOf)?.rule ?? DEFAULT_RULE, [data]);
  const orders = useMemo(() => (data?.orders ?? []).filter((o) => !ownerId || o.ownerId === ownerId), [data, ownerId]);
  const requests = useMemo(() => (data?.requests ?? []).filter((r) => !ownerId || r.ownerId === ownerId), [data, ownerId]);
  // Orders not fully received, or late: shown as a count on the Orders tab.
  const orderAlerts = useMemo(() => orders.filter((o) => orderAttention(o, movements, today, ruleOf(o.ownerId).leadDays ?? 0)).length, [orders, movements, today, ruleOf]);
  const requestCount = useMemo(() => {
    const n = requestCounts(requests);

    return n.toIssue + n.toConfirm + n.short;
  }, [requests]);
  // Units ordered from suppliers and not yet arrived, per item.
  const onOrder = useMemo(() => onOrderUnits(orders, movements), [orders, movements]);
  const statuses = useMemo(
    () => items.map((i) => stockStatus(i, byItem.get(i.id) ?? [], ruleOf(i.ownerId), today, onOrder.get(i.id) ?? 0)),
    [items, byItem, ruleOf, today, onOrder],
  );
  const owner = data?.owners.find((o) => o.id === ownerId) ?? null;
  // Editing items, removing lines, closing months and the rule are for admins
  // and the workspace's hosts; the server enforces it, the page hides it.
  const managed = new Set((data?.owners ?? []).filter((o) => o.canManage).map((o) => o.id));
  const mayManage = (id: string | null) => !!id && managed.has(id);
  const mayAddItems = owner ? owner.canManage : managed.size > 0;
  // Staff (who manage nothing) always get the simple view; managers can switch (remembered).
  const simple = !mayAddItems || (simplePref ?? true);
  const group = GROUP_OF[tab];
  const views = (VIEWS[group] ?? []).filter((v) => !v.managers || !simple);
  const pickGroup = (next: Group) => setTab(next === 'ordering' ? (simple ? 'orders' : 'order') : next === 'monthend' ? 'monthend' : next);
  // Stock belongs to one workspace: the one picked at the top of the left sidebar.
  const needsWorkspace = !ownerId && scope.owners.length > 1;
  const chooseSimple = (value: boolean) => {
    setSimplePref(value);
    writeSimplePref(value);
    if (value && !SIMPLE_TABS.includes(GROUP_OF[tab])) setTab('stock');
    if (value && tab === 'order') setTab('orders');
  };
  const activeItems = items.filter((i) => i.status !== 'DISCONTINUED');

  const toggleStatus = async (item: StockItem) => {
    if (item.status === 'DISCONTINUED') {
      if ((await stockAction({ action: 'setStatus', itemId: item.id, status: 'ACTIVE' })).success) refresh();

      return;
    }
    const first = await stockAction({ action: 'setStatus', itemId: item.id, status: 'DISCONTINUED' });

    if (first.success) return refresh();
    // Still has stock: ask before writing it off.
    if (first.needsWriteOff) setOpen({ kind: 'writeOff', item, message: first.message ?? '' });
  };

  const sheet = (() => {
    if (!open || !data) return null;
    if (open.kind === 'detail') {
      const status = statuses.find((s) => s.item.id === open.itemId);

      return status ? (
        <ItemDetailSheet
          status={status}
          movements={byItem.get(status.item.id) ?? []}
          today={today}
          onClose={() => setOpen(null)}
          onRecord={(type) => setOpen({ kind: 'record', type, itemId: status.item.id })}
          onEdit={mayManage(status.item.ownerId) ? () => setOpen({ kind: 'item', item: status.item }) : null}
          onToggleStatus={mayManage(status.item.ownerId) ? () => toggleStatus(status.item) : null}
        />
      ) : null;
    }
    if (open.kind === 'item') return <ItemSheet item={open.item} owners={data.owners.filter((o) => o.canManage && (!ownerId || o.id === ownerId))} defaultOwnerId={ownerId} today={today} onClose={() => setOpen(null)} onDone={done} />;
    if (open.kind === 'record') {
      return (
        <RecordSheet
          items={activeItems}
          balances={balances}
          initialType={open.type}
          initialItemId={open.itemId}
          initialLines={open.lines}
          initialReference={open.lines ? `Order ${today}` : undefined}
          lastPaid={lastPaid}
          shops={shops}
          lastParty={(type) => lastPartyFor(movements, type)}
          today={today}
          onClose={() => setOpen(null)}
          onDone={done}
        />
      );
    }
    if (open.kind === 'settle') {
      const item = items.find((i) => i.id === open.borrow.itemId);

      return item ? <SettleSheet borrow={open.borrow} item={item} items={activeItems} movements={movements} today={today} onClose={() => setOpen(null)} onDone={done} /> : null;
    }
    if (open.kind === 'request') {
      return <RequestSheet request={open.request} items={activeItems} balances={balances} owners={data.owners.filter((o) => !ownerId || o.id === ownerId)} defaultOwnerId={ownerId} onClose={() => setOpen(null)} onDone={done} />;
    }
    if (open.kind === 'issue') return <IssueSheet request={open.request} items={items} balances={balances} today={today} onClose={() => setOpen(null)} onDone={done} />;
    if (open.kind === 'receiveRequest') return <ReceiveRequestSheet request={open.request} items={items} today={today} onClose={() => setOpen(null)} onDone={done} />;
    if (open.kind === 'settleRequest') return <SettleRequestSheet request={open.request} items={items} today={today} onClose={() => setOpen(null)} onDone={done} />;
    if (open.kind === 'import') return <ImportSheet owners={data.owners.filter((o) => o.canManage && (!ownerId || o.id === ownerId))} defaultOwnerId={ownerId} onClose={() => setOpen(null)} onDone={done} />;
    if (open.kind === 'quick') return <QuickSheet items={activeItems} balances={balances} movements={movements} lastPaid={lastPaid} initialKind={open.quickKind} shops={shops} canManage={owner ? owner.canManage : managed.size > 0} today={today} onClose={() => setOpen(null)} onDone={done} />;
    if (open.kind === 'expired') {
      return <ExpiredSheet items={activeItems} movementsByItem={byItem} balances={balances} today={today} onClose={() => setOpen(null)} onDone={done} />;
    }
    if (open.kind === 'take') {
      // Counting as at a date: the balance expected then.
      const at = open.date;
      const expectedOn = (day: string) => new Map(items.map((i) => [i.id, balanceOf((byItem.get(i.id) ?? []).filter((m) => m.date <= day))]));

      return <StockTakeSheet items={activeItems} balances={at ? expectedOn(at) : balances} expectedOn={expectedOn} today={today} initialDate={at} ownerId={ownerId} onClose={() => setOpen(null)} onDone={done} />;
    }
    if (open.kind === 'writeOff') return <WriteOffSheet item={open.item} message={open.message} today={today} onClose={() => setOpen(null)} onDone={done} />;
    if (open.kind === 'rule' && owner) return <RuleSheet owner={owner} onClose={() => setOpen(null)} onDone={done} />;

    return null;
  })();

  const rule = owner?.rule ?? DEFAULT_RULE;
  const ruleText = owner
    ? `Rule for ${owner.name}: re-order when stock lasts under ${rule.reorderBelow} months; order enough for ${rule.orderUpTo} months${rule.leadDays ? `; delivery takes ${rule.leadDays} days` : ''}.`
    : 'Each business uses its own re-order rule (default: under 2 months, order enough for 2.5). Pick a business to change it.';

  if (needsWorkspace) {
    return (
      <div style={{ fontFamily: c.font, color: c.text, background: c.bg, height: '100%', overflowY: 'auto', boxSizing: 'border-box', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span style={{ fontSize: 18, fontWeight: 600 }}>Stock</span>
        <span style={{ fontSize: 14, color: c.text2 }}>
          Stock belongs to one business. Pick which one: here, or any time with the business picker at the top of the left sidebar.
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {scope.owners.map((o) => (
            <button key={o.id} onClick={() => scope.setOwnerId(o.id)} style={{ ...control, height: 64, fontSize: 16, fontWeight: 600 }}>
              {o.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: c.font, color: c.text, background: c.bg, height: '100%', overflowY: 'auto', containerType: 'size', boxSizing: 'border-box', position: 'relative' }}>
      {sheet}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 18, fontWeight: 600 }}>Stock{scope.owner ? ` · ${scope.owner.name}` : ''}</span>
            <span style={{ fontSize: 13, color: c.text3 }}>What's in hand, every IN and OUT, and what to order next.</span>
          </div>
          {mayAddItems ? (
            <button onClick={() => chooseSimple(!simple)} style={{ ...control, color: c.text2 }} title={simple ? 'Manager tools: history, ordering plan, month end, items' : 'Back to the everyday buttons'}>
              {simple ? 'Manager view' : 'Simple view'}
            </button>
          ) : null}
          {!simple ? (
            <>
              <button onClick={() => setOpen({ kind: 'quick' })} style={primary} disabled={!data} title="Take out, waste or stock in: search, tap, save">
                ⚡ Quick entry
              </button>
              <button onClick={() => setOpen({ kind: 'take' })} style={control} disabled={!data} title="Count the shelf and fix the differences">
                Count
              </button>
              <button onClick={() => setMoreOpen(!moreOpen)} style={{ ...control, color: c.text2 }}>
                {moreOpen ? 'Less' : 'More ▾'}
              </button>
              {moreOpen ? (
                <>
                  {mayAddItems ? (
                    <button onClick={() => setOpen({ kind: 'item', item: null })} style={control} disabled={!data}>
                      + Add item
                    </button>
                  ) : null}
                  {mayAddItems ? (
                    <button onClick={() => setOpen({ kind: 'import' })} style={control} disabled={!data} title="Add products and starting stock from your monthly stock Excel (订货单)">
                      ⬆ Import Excel
                    </button>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </div>

        {simple && data ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {BIG_BUTTONS.map((b) => (
              <button
                key={b.key}
                onClick={() => (b.key === 'COUNT' ? setOpen({ kind: 'take' }) : setOpen({ kind: 'quick', quickKind: b.key }))}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  minHeight: 88,
                  borderRadius: 12,
                  border: `1px solid var(--t-color-${b.color}6)`,
                  background: `var(--t-color-${b.color}2)`,
                  color: `var(--t-color-${b.color}11)`,
                  textAlign: 'center',
                }}
              >
                <span style={{ fontSize: 26, lineHeight: 1 }}>{b.icon}</span>
                <span style={{ fontSize: 17, fontWeight: 700 }}>{b.label}</span>
                <span style={{ fontSize: 12, opacity: 0.8 }}>{b.hint}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${c.border}`, overflowX: 'auto' }}>
          {TABS.filter((t) => !simple || SIMPLE_TABS.includes(t.key)).map((t) => (
            <button
              key={t.key}
              onClick={() => pickGroup(t.key)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '8px 12px',
                fontSize: 14,
                whiteSpace: 'nowrap',
                fontWeight: group === t.key ? 600 : 500,
                color: group === t.key ? c.text : c.text3,
                borderBottom: `2px solid ${group === t.key ? c.text : 'transparent'}`,
                marginBottom: -1,
              }}
            >
              {t.label}
              {t.key === 'ordering' && requestCount + orderAlerts ? ` (${requestCount + orderAlerts})` : ''}
              {t.key === 'borrowed' && movements.some((m) => (m.type === 'BORROW' || m.type === 'BORROW_IN') && (m.borrowStatus ?? 'OUTSTANDING') === 'OUTSTANDING') ? ' •' : ''}
            </button>
          ))}
        </div>

        {views.length > 1 ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {views.map((v) => (
              <button key={v.key} onClick={() => setTab(v.key)} style={{ ...control, height: 32, fontSize: 13, background: tab === v.key ? c.accent : c.bg, color: tab === v.key ? 'white' : c.text, borderColor: tab === v.key ? c.accent : c.border2 }}>
                {v.label}
                {v.key === 'requests' && requestCount ? ` (${requestCount})` : ''}
                {v.key === 'orders' && orderAlerts ? ` (${orderAlerts})` : ''}
              </button>
            ))}
          </div>
        ) : null}
        {error ? <span style={{ color: 'var(--t-color-red11)', fontSize: 13 }}>{error}</span> : null}
        {!data && !error ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-busy="true">
            <span style={{ color: c.text3, fontSize: 13 }}>Loading your stock… the first load can take a few seconds.</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              {[0, 1, 2, 3].map((n) => (
                <div key={n} style={{ height: 64, borderRadius: 12, background: c.bg2, border: `1px solid ${c.border}` }} />
              ))}
            </div>
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <div key={n} style={{ height: 44, borderRadius: 8, background: c.bg2, opacity: 1 - n * 0.12 }} />
            ))}
          </div>
        ) : null}
        {data && !items.length ? (
          <span style={{ color: c.text3, fontSize: 13 }}>No stock items in this business yet. Use “⬆ Import Excel” to bring in your monthly stock sheet, or “+ Add item”.</span>
        ) : null}
        {data && items.length ? (
          <>
            {tab === 'stock' ? (
              <StockHandTab
                simple={simple}
                statuses={statuses}
                today={today}
                ownerId={ownerId}
                onRecord={(type, itemId) => setOpen({ kind: 'record', type, itemId })}
                onOpen={(item) => setOpen({ kind: 'detail', itemId: item.id })}
                onWriteOffExpired={() => setOpen({ kind: 'expired' })}
              />
            ) : null}
            {tab === 'movements' ? <HistoryTab items={items} movements={movements} movementsByItem={byItem} today={today} ownerId={ownerId} onChanged={refresh} mayManage={mayManage} /> : null}
            {tab === 'month' ? <MonthTab items={items} movementsByItem={byItem} ownerId={ownerId} today={today} /> : null}
            {tab === 'usage' ? <UsageTab items={items} movementsByItem={byItem} owner={owner} today={today} onChanged={refresh} /> : null}
            {tab === 'order' ? (
              <OrderTab
                statuses={statuses}
                ruleText={ruleText}
                ownerId={ownerId}
                onEditRule={owner?.canManage ? () => setOpen({ kind: 'rule' }) : null}
                onOrder={(lines) => setOpen({ kind: 'record', type: 'PURCHASE', lines })}
                onSaved={() => {
                  refresh();
                  setTab('orders');
                }}
              />
            ) : null}
            {tab === 'requests' ? (
              <RequestsTab
                requests={requests}
                items={items}
                mayManage={mayManage}
                onNew={() => setOpen({ kind: 'request', request: null })}
                onEdit={(request) => setOpen({ kind: 'request', request })}
                onIssue={(request) => setOpen({ kind: 'issue', request })}
                onReceive={(request) => setOpen({ kind: 'receiveRequest', request })}
                onSettle={(request) => setOpen({ kind: 'settleRequest', request })}
                onChanged={refresh}
              />
            ) : null}
            {tab === 'orders' ? <OrdersTab orders={orders} items={items} movements={movements} lastPaid={lastPaid} ownerName={ownerName} owners={data.owners.filter((o) => !ownerId || o.id === ownerId)} statuses={statuses} leadDaysOf={(id) => ruleOf(id).leadDays ?? 0} today={today} ownerId={ownerId} onChanged={refresh} /> : null}
            {tab === 'monthend' ? (
              <MonthEndTab items={items} movementsByItem={byItem} owner={owner} canClose={!!owner?.canManage} today={today} onStockTake={(date) => setOpen({ kind: 'take', date })} onChanged={refresh} />
            ) : null}
            {tab === 'borrowed' ? <BorrowTab items={items} movements={movements} today={today} ownerId={ownerId} onSettle={(borrow) => setOpen({ kind: 'settle', borrow })} onLend={() => setOpen({ kind: 'quick', quickKind: 'BORROW' })} onBorrowIn={() => setOpen({ kind: 'quick', quickKind: 'BORROW_IN' })} /> : null}
          </>
        ) : null}
      </div>
    </div>
  );
};
