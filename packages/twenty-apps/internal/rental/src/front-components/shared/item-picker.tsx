import { type CSSProperties, useMemo, useState } from 'react';

import { readValue } from 'src/front-components/shared/read-value';
import { c, control, input } from 'src/front-components/shared/stock-ui';
import type { StockItem } from 'src/shared/stock';

// Pick a product by typing part of its code or name (instead of scrolling a
// list of 60+). Closed it shows the chosen product; open it shows a search box
// and the matching products, right in the page (nothing floats over the form).

const row: CSSProperties = { all: 'unset', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'baseline', padding: '8px 10px', borderBottom: `1px solid ${c.border}`, fontSize: 13, boxSizing: 'border-box', width: '100%' };

const label = (item: StockItem) => `${item.code ? `${item.code} ` : ''}${item.name}`;

export const ItemPicker = ({
  items,
  value,
  onChange,
  disabledIds,
  placeholder = 'Choose a product…',
}: {
  items: StockItem[];
  value: string;
  onChange: (itemId: string) => void;
  disabledIds?: Set<string>; // already used on another line
  placeholder?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = items.find((i) => i.id === value);
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => (q ? items.filter((i) => `${i.code} ${i.name} ${i.specification}`.toLowerCase().includes(q)) : items), [items, q]);

  if (!open) {
    return (
      <button
        onClick={() => {
          setQuery('');
          setOpen(true);
        }}
        style={{ ...control, width: '100%', justifyContent: 'space-between', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', color: selected ? c.text : c.text3 }}
        title="Tap to search"
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected ? label(selected) : placeholder}</span>
        <span style={{ color: c.text3 }}>🔍</span>
      </button>
    );
  }

  return (
    <div style={{ border: `1px solid ${c.accent}`, borderRadius: c.radius, background: c.bg, overflow: 'hidden', width: '100%' }}>
      <div style={{ display: 'flex', gap: 6, padding: 6 }}>
        <input value={query} onChange={(e) => setQuery(readValue(e))} placeholder="Type a code or name…" style={{ ...input, height: 34, flex: 1 }} />
        <button onClick={() => setOpen(false)} style={{ ...control, height: 34 }}>
          Close
        </button>
      </div>
      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
        {matches.slice(0, 40).map((item) => {
          const used = disabledIds?.has(item.id) && item.id !== value;

          return (
            <button
              key={item.id}
              disabled={used}
              onClick={() => {
                onChange(item.id);
                setOpen(false);
              }}
              style={{ ...row, background: item.id === value ? 'var(--t-color-blue2)' : c.bg, opacity: used ? 0.4 : 1, cursor: used ? 'default' : 'pointer' }}
            >
              <span style={{ fontWeight: 500 }}>{label(item)}</span>
              {used ? <span style={{ color: c.text3, fontSize: 11 }}>already on this list</span> : <span style={{ color: c.text3, fontSize: 11 }}>{item.specification}</span>}
            </button>
          );
        })}
        {!matches.length ? <div style={{ padding: 12, fontSize: 13, color: c.text3 }}>No product matches “{query}”.</div> : null}
        {matches.length > 40 ? <div style={{ padding: 8, fontSize: 12, color: c.text3 }}>{matches.length - 40} more: keep typing to narrow down.</div> : null}
      </div>
    </div>
  );
};
