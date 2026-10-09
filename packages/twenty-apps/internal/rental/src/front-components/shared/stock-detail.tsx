import { Sheet } from 'src/front-components/shared/sheet';
import { c, Chip, control, FLAG, primary, qty, rm, shortDate, small } from 'src/front-components/shared/stock-ui';
import { MONTHS } from 'src/shared/months';
import { cartonsAndUnits, expiryState, monthlyTakes, type StockItem, type StockMovement, type StockStatus } from 'src/shared/stock';
import { movementType } from 'src/shared/stock-types';

// One item: key numbers, usage by month (bars) and its latest IN/OUT.

const monthsUpTo = (today: string, count: number) => {
  const out: string[] = [];
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));

  for (let i = 0; i < count; i++) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (!m) {
      m = 12;
      y -= 1;
    }
  }

  return out;
};

const Fact = ({ label, value, note, color }: { label: string; value: string; note?: string; color?: string }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 10, border: `1px solid ${c.border}`, borderRadius: c.radius }}>
    <span style={{ fontSize: 11, color: c.text3 }}>{label}</span>
    <span style={{ fontSize: 15, fontWeight: 600, color: color ?? c.text }}>{value}</span>
    {note ? <span style={{ fontSize: 11, color: c.text3 }}>{note}</span> : null}
  </div>
);

export const ItemDetailSheet = ({
  status,
  movements,
  today,
  onClose,
  onRecord,
  onEdit,
  onToggleStatus,
}: {
  status: StockStatus;
  movements: StockMovement[];
  today: string;
  onClose: () => void;
  onRecord: (type: string) => void;
  onEdit: () => void;
  onToggleStatus: () => void;
}) => {
  const { item } = status;
  // Usage over the last 6 months, plus the forecast for next month.
  const takes = new Map(monthlyTakes(movements));
  const months = monthsUpTo(today, 6);
  const peak = Math.max(status.forecast, ...months.map((m) => takes.get(m) ?? 0), 1);
  const recent = [...movements].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  const expiry = status.balance > 0 ? expiryState(status.nearestExpiry, today) : null;
  const flag = FLAG[status.flag] ?? FLAG.OK;

  return (
    <Sheet width={560} onClose={onClose}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: c.font, color: c.text, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{item.name}</div>
            <div style={{ fontSize: 12, color: c.text3 }}>
              {[item.code, item.specification, item.supplier, `${rm(item.cartonPrice)} / ctn of ${item.unitsPerCarton} ${item.unit}`].filter(Boolean).join(' · ')}
            </div>
          </div>
          <Chip {...flag} />
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {item.status !== 'DISCONTINUED' ? (
            <>
              <button onClick={() => onRecord('PURCHASE')} style={primary}>
                + Stock in
              </button>
              <button onClick={() => onRecord('TAKE')} style={control}>
                − Take out
              </button>
              <button onClick={() => onRecord('BORROW')} style={control}>
                Lend to branch
              </button>
            </>
          ) : null}
          <span style={{ flex: 1 }} />
          <button onClick={onEdit} style={small}>
            Edit
          </button>
          <button onClick={onToggleStatus} style={small}>
            {item.status === 'DISCONTINUED' ? 'Reactivate' : 'Discontinue'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
          <Fact label="In hand" value={cartonsAndUnits(status.balance, item)} note={`${qty(status.balance)} ${item.unit} · ${rm(status.value)}`} color={status.balance < 0 ? 'var(--t-color-red11)' : undefined} />
          <Fact label="Lasts" value={status.monthsLeft === null ? '—' : `${qty(status.monthsLeft)} months`} note={`Re-order below ${status.reorderBelow}`} color={status.flag === 'ORDER' ? 'var(--t-color-red11)' : status.flag === 'LOW' ? 'var(--t-color-amber11)' : undefined} />
          <Fact label="Need next month" value={status.forecast ? `${qty(status.forecast)} ${item.unit}` : '—'} note={status.forecastBasis.length ? `avg of ${status.forecastBasis.length} month${status.forecastBasis.length === 1 ? '' : 's'}` : 'no take-outs yet'} />
          <Fact label="Suggested order" value={status.suggestedCartons ? `${status.suggestedCartons} ctn` : '—'} note={status.suggestedCartons ? rm(status.suggestedCost) : 'not needed now'} color={status.suggestedCartons ? 'var(--t-color-red11)' : undefined} />
          <Fact
            label="Nearest expiry"
            value={status.nearestExpiry && status.balance > 0 ? shortDate(status.nearestExpiry) : '—'}
            note={expiry === 'EXPIRED' ? 'expired' : expiry === 'SOON' ? 'within 60 days' : undefined}
            color={expiry === 'EXPIRED' ? 'var(--t-color-red11)' : expiry === 'SOON' ? 'var(--t-color-amber11)' : undefined}
          />
          {status.lentOut ? <Fact label="Lent to branches" value={cartonsAndUnits(status.lentOut, item)} note="not settled" /> : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Taken out per month</span>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, padding: '8px 4px 0', borderBottom: `1px solid ${c.border}` }}>
            {[...months.map((m) => ({ key: m, label: MONTHS[Number(m.slice(5, 7)) - 1], value: takes.get(m) ?? 0, forecast: false })), { key: 'next', label: 'Next', value: status.forecast, forecast: true }].map((bar) => (
              <div key={bar.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }} title={`${qty(bar.value)} ${item.unit}`}>
                <span style={{ fontSize: 10, color: c.text3 }}>{bar.value ? qty(bar.value) : ''}</span>
                <span
                  style={{
                    width: '100%',
                    maxWidth: 28,
                    height: `${Math.max(bar.value ? 3 : 0, (bar.value / peak) * 80)}px`,
                    background: bar.forecast ? 'transparent' : 'var(--t-color-blue9)',
                    border: bar.forecast ? '1px dashed var(--t-color-blue9)' : 'none',
                    borderRadius: '3px 3px 0 0',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, padding: '0 4px' }}>
            {[...months.map((m) => MONTHS[Number(m.slice(5, 7)) - 1]), 'Next'].map((label, index) => (
              <span key={`${label}-${index}`} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: c.text3 }}>
                {label}
              </span>
            ))}
          </div>
          <span style={{ fontSize: 11, color: c.text3 }}>In {item.unit}. The dashed bar is next month&apos;s forecast.</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Latest IN / OUT</span>
          {recent.length ? (
            recent.map((m) => {
              const t = movementType(m.type);

              return (
                <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '5px 0', borderBottom: `1px dashed ${c.border}` }}>
                  <span style={{ width: 84, color: c.text2, fontSize: 12 }}>{shortDate(m.date)}</span>
                  <span style={{ width: 130 }}>
                    <Chip label={t?.label ?? m.type} color={t?.color ?? 'gray'} />
                  </span>
                  <span style={{ flex: 1, color: c.text3, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[m.party, m.reference, m.notes].filter(Boolean).join(' · ')}</span>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap', color: t?.direction === 'IN' ? 'var(--t-color-green11)' : c.text }}>
                    {t?.direction === 'IN' ? '+' : '−'}
                    {cartonsAndUnits(m.quantity, item)}
                  </span>
                </div>
              );
            })
          ) : (
            <span style={{ fontSize: 13, color: c.text3 }}>No movements yet.</span>
          )}
        </div>
      </div>
    </Sheet>
  );
};
