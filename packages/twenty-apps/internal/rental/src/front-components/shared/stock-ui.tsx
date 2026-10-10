import { type CSSProperties, type ReactNode } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';

import { MONTHS } from 'src/shared/months';
import { type StockItem } from 'src/shared/stock';

// Shared look of the Stock page and its forms.

export const c = {
  font: 'var(--t-font-family)',
  text: 'var(--t-font-color-primary)',
  text2: 'var(--t-font-color-secondary)',
  text3: 'var(--t-font-color-tertiary)',
  bg: 'var(--t-background-primary)',
  bg2: 'var(--t-background-secondary)',
  border: 'var(--t-border-color-light)',
  border2: 'var(--t-border-color-medium)',
  radius: 'var(--t-border-radius-md)',
  accent: 'var(--t-color-blue9)',
};

export const control: CSSProperties = {
  fontFamily: c.font,
  fontSize: 13,
  color: c.text,
  background: c.bg,
  border: `1px solid ${c.border2}`,
  borderRadius: c.radius,
  height: 34,
  padding: '0 10px',
  boxSizing: 'border-box',
  cursor: 'pointer',
};

export const input: CSSProperties = { ...control, cursor: 'text', width: '100%' };
export const select: CSSProperties = { ...control, width: '100%' };
export const small: CSSProperties = { ...control, height: 28, fontSize: 12, padding: '0 8px', display: 'inline-flex', alignItems: 'center', textDecoration: 'none', whiteSpace: 'nowrap' };
export const primary: CSSProperties = { ...control, background: c.accent, borderColor: c.accent, color: 'white', fontWeight: 600 };
export const th: CSSProperties = { textAlign: 'left', fontSize: 12, fontWeight: 500, color: c.text3, padding: '10px 10px', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap', background: c.bg2 };
export const td: CSSProperties = { fontSize: 13, padding: '10px', borderBottom: `1px solid ${c.border}`, verticalAlign: 'top' };
export const num: CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
export const card: CSSProperties = { background: c.bg, border: `1px solid ${c.border}`, borderRadius: c.radius, padding: 14, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 150, flex: 1 };

export const rm = (value: number) => `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const qty = (value: number) => value.toLocaleString('en-MY', { maximumFractionDigits: 2 });
export const shortDate = (iso: string | null) => (iso ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '—');
export const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
export const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

export const Chip = ({ label, color }: { label: string; color: string }) => (
  <span
    style={{
      fontSize: 12,
      fontWeight: 500,
      padding: '2px 8px',
      borderRadius: 4,
      whiteSpace: 'nowrap',
      color: `var(--t-color-${color}11)`,
      background: `var(--t-color-${color}3)`,
      border: `1px solid var(--t-color-${color}6)`,
    }}
  >
    {label}
  </span>
);

export const Table = ({ head, children, empty, minWidth = 760 }: { head: ReactNode; children: ReactNode[]; empty: string; minWidth?: number }) => (
  <div style={{ overflowX: 'auto', border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth }}>
      <thead>{head}</thead>
      <tbody>
        {children.length ? (
          children
        ) : (
          <tr>
            <td colSpan={30} style={{ ...td, textAlign: 'center', color: c.text3, padding: 32 }}>
              {empty}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);

export const Summary = ({ label, value, note, color }: { label: string; value: string; note?: string; color?: string }) => (
  <div style={card}>
    <span style={{ fontSize: 12, color: c.text3 }}>{label}</span>
    <span style={{ fontSize: 20, fontWeight: 600, color: color ?? c.text }}>{value}</span>
    {note ? <span style={{ fontSize: 12, color: c.text3 }}>{note}</span> : null}
  </div>
);

export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.text3, minWidth: 0 }}>
    {label}
    {children}
    {hint ? <span style={{ fontSize: 11, color: c.text3 }}>{hint}</span> : null}
  </label>
);

// "Name" with the code and specification underneath.
export const ItemCell = ({ item }: { item: StockItem }) => (
  <>
    <div style={{ fontWeight: 500 }}>{item.name}</div>
    <div style={{ fontSize: 12, color: c.text3 }}>
      {[item.code, item.specification].filter(Boolean).join(' · ')}
      {item.status === 'DISCONTINUED' ? ' · discontinued' : ''}
    </div>
  </>
);

// Downloads a Stock tab as an Excel file (opens a small page that saves it).
export const ExcelButton = ({ query, title }: { query: Record<string, string>; title?: string }) => (
  <a
    href={new RestApiClient().resolveUrl('/s/stock/csv', { query })}
    target="_blank"
    rel="noreferrer"
    title={title ?? 'Download as an Excel file'}
    style={{ ...control, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', fontWeight: 600, color: 'var(--t-color-green11)', whiteSpace: 'nowrap' }}
  >
    ⬇ Excel
  </a>
);

export const withOwner = (query: Record<string, string>, ownerId: string) => (ownerId ? { ...query, owner: ownerId } : query);

export const FLAG: Record<string, { label: string; color: string }> = {
  ORDER: { label: 'Order now', color: 'red' },
  LOW: { label: 'Low', color: 'orange' },
  OK: { label: 'OK', color: 'green' },
  ON_ORDER: { label: 'On order', color: 'blue' },
  NO_USE: { label: 'Not used', color: 'gray' },
  EMPTY: { label: 'Empty', color: 'gray' },
};
