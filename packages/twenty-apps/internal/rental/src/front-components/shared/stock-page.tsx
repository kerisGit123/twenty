import { useCallback, useEffect, useMemo, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';

import { OwnerSwitcher, useOwnerScope } from 'src/front-components/shared/owner-switcher';
import { ItemSheet, RecordSheet, RuleSheet, SettleSheet, stockAction, StockTakeSheet, WriteOffSheet } from 'src/front-components/shared/stock-forms';
import { ItemDetailSheet } from 'src/front-components/shared/stock-detail';
import { StockHandTab } from 'src/front-components/shared/stock-hand-tab';
import { MonthTab } from 'src/front-components/shared/stock-month-tab';
import { OrderTab } from 'src/front-components/shared/stock-order-tab';
import { BorrowTab } from 'src/front-components/shared/stock-borrow-tab';
import { MovementsTab } from 'src/front-components/shared/stock-tabs';
import { c, control, primary } from 'src/front-components/shared/stock-ui';
import type { StockData } from 'src/logic-functions/utils/stock-data';
import { todayIso } from 'src/logic-functions/utils/dates';
import { balanceOf, DEFAULT_RULE, groupMovements, type StockItem, type StockMovement, stockStatus } from 'src/shared/stock';

// Stock: an F&B warehouse (iPeak) — what's in hand, every IN and OUT, the
// monthly restock sheet, the forecast and order plan, and stock lent to
// other branches.

type Tab = 'stock' | 'movements' | 'month' | 'order' | 'borrowed';

type Open =
  | { kind: 'item'; item: StockItem | null }
  | { kind: 'detail'; itemId: string }
  | { kind: 'record'; type: string; itemId?: string; lines?: Array<{ itemId: string; units: number }> }
  | { kind: 'settle'; borrow: StockMovement }
  | { kind: 'take' }
  | { kind: 'rule' }
  | { kind: 'writeOff'; item: StockItem; message: string }
  | null;

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'stock', label: 'Stock in hand' },
  { key: 'movements', label: 'In / out history' },
  { key: 'month', label: 'Monthly sheet' },
  { key: 'order', label: 'Forecast & order' },
  { key: 'borrowed', label: 'Borrowed' },
];

export const StockPage = () => {
  const scope = useOwnerScope();
  const [tab, setTab] = useState<Tab>('stock');
  const [data, setData] = useState<StockData | null>(null);
  const [today, setToday] = useState(todayIso());
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState<Open>(null);

  useEffect(() => {
    let cancelled = false;

    setError('');
    new RestApiClient()
      .post<{ success: boolean; data?: StockData; today?: string; message?: string }>('/s/stock', { action: 'data' })
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
  }, [reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);
  const done = useCallback(() => {
    setOpen(null);
    refresh();
  }, [refresh]);

  const ownerId = scope.ownerId || '';
  const items = useMemo(() => (data?.items ?? []).filter((i) => !ownerId || i.ownerId === ownerId), [data, ownerId]);
  const movements = useMemo(() => (data?.movements ?? []).filter((m) => !ownerId || m.ownerId === ownerId), [data, ownerId]);
  const byItem = useMemo(() => groupMovements(movements), [movements]);
  const balances = useMemo(() => new Map(items.map((i) => [i.id, balanceOf(byItem.get(i.id) ?? [])])), [items, byItem]);
  const ruleOf = useCallback((ownerOf: string | null) => data?.owners.find((o) => o.id === ownerOf)?.rule ?? DEFAULT_RULE, [data]);
  const statuses = useMemo(() => items.map((i) => stockStatus(i, byItem.get(i.id) ?? [], ruleOf(i.ownerId), today)), [items, byItem, ruleOf, today]);
  const owner = data?.owners.find((o) => o.id === ownerId) ?? null;
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
          onEdit={() => setOpen({ kind: 'item', item: status.item })}
          onToggleStatus={() => toggleStatus(status.item)}
        />
      ) : null;
    }
    if (open.kind === 'item') return <ItemSheet item={open.item} owners={data.owners} defaultOwnerId={ownerId} today={today} onClose={() => setOpen(null)} onDone={done} />;
    if (open.kind === 'record') {
      return (
        <RecordSheet
          items={activeItems}
          balances={balances}
          initialType={open.type}
          initialItemId={open.itemId}
          initialLines={open.lines}
          initialReference={open.lines ? `Order ${today}` : undefined}
          today={today}
          onClose={() => setOpen(null)}
          onDone={done}
        />
      );
    }
    if (open.kind === 'settle') {
      const item = items.find((i) => i.id === open.borrow.itemId);

      return item ? <SettleSheet borrow={open.borrow} item={item} items={activeItems} today={today} onClose={() => setOpen(null)} onDone={done} /> : null;
    }
    if (open.kind === 'take') return <StockTakeSheet items={activeItems} balances={balances} today={today} onClose={() => setOpen(null)} onDone={done} />;
    if (open.kind === 'writeOff') return <WriteOffSheet item={open.item} message={open.message} today={today} onClose={() => setOpen(null)} onDone={done} />;
    if (open.kind === 'rule' && owner) return <RuleSheet owner={owner} onClose={() => setOpen(null)} onDone={done} />;

    return null;
  })();

  const rule = owner?.rule ?? DEFAULT_RULE;
  const ruleText = owner
    ? `Rule for ${owner.name}: re-order when stock lasts under ${rule.reorderBelow} months; order enough for ${rule.orderUpTo} months.`
    : 'Each workspace uses its own re-order rule (default: under 1.5 months, order enough for 2.5). Pick a workspace to change it.';

  return (
    <div style={{ fontFamily: c.font, color: c.text, background: c.bg, height: '100%', overflowY: 'auto', containerType: 'size', boxSizing: 'border-box', position: 'relative' }}>
      {sheet}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 18, fontWeight: 600 }}>Stock</span>
            <span style={{ fontSize: 13, color: c.text3 }}>What's in hand, every IN and OUT, and what to order next.</span>
          </div>
          <OwnerSwitcher scope={scope} />
          <button onClick={() => setOpen({ kind: 'take' })} style={control} disabled={!data}>
            Stock take
          </button>
          <button onClick={() => setOpen({ kind: 'item', item: null })} style={control} disabled={!data}>
            + Add item
          </button>
          <button onClick={() => setOpen({ kind: 'record', type: 'TAKE' })} style={primary} disabled={!data}>
            Record in / out
          </button>
        </div>

        <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${c.border}`, overflowX: 'auto' }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '8px 12px',
                fontSize: 14,
                whiteSpace: 'nowrap',
                fontWeight: tab === t.key ? 600 : 500,
                color: tab === t.key ? c.text : c.text3,
                borderBottom: `2px solid ${tab === t.key ? c.text : 'transparent'}`,
                marginBottom: -1,
              }}
            >
              {t.label}
              {t.key === 'borrowed' && movements.some((m) => m.type === 'BORROW' && (m.borrowStatus ?? 'OUTSTANDING') === 'OUTSTANDING') ? ' •' : ''}
            </button>
          ))}
        </div>

        {error ? <span style={{ color: 'var(--t-color-red11)', fontSize: 13 }}>{error}</span> : null}
        {!data && !error ? <span style={{ color: c.text3, fontSize: 13 }}>Loading…</span> : null}
        {data && !items.length ? (
          <span style={{ color: c.text3, fontSize: 13 }}>No stock items in this workspace yet. Use “+ Add item” to start.</span>
        ) : null}
        {data && items.length ? (
          <>
            {tab === 'stock' ? (
              <StockHandTab
                statuses={statuses}
                today={today}
                onRecord={(type, itemId) => setOpen({ kind: 'record', type, itemId })}
                onOpen={(item) => setOpen({ kind: 'detail', itemId: item.id })}
              />
            ) : null}
            {tab === 'movements' ? <MovementsTab items={items} movements={movements} today={today} onChanged={refresh} /> : null}
            {tab === 'month' ? <MonthTab items={items} movementsByItem={byItem} ownerId={ownerId} today={today} /> : null}
            {tab === 'order' ? (
              <OrderTab
                statuses={statuses}
                ruleText={ruleText}
                ownerId={ownerId}
                onEditRule={owner ? () => setOpen({ kind: 'rule' }) : null}
                onOrder={(lines) => setOpen({ kind: 'record', type: 'PURCHASE', lines })}
              />
            ) : null}
            {tab === 'borrowed' ? <BorrowTab items={items} movements={movements} today={today} onSettle={(borrow) => setOpen({ kind: 'settle', borrow })} onLend={() => setOpen({ kind: 'record', type: 'BORROW' })} /> : null}
          </>
        ) : null}
      </div>
    </div>
  );
};
