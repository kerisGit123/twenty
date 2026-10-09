import { type CSSProperties, useState } from 'react';

import { readValue } from 'src/front-components/shared/read-value';
import { MONTHS } from 'src/shared/months';

// A date range with quick picks (last 30 days, this month, ...) and exact
// from / to days. Both days are included.

export type DateRange = { from: string; to: string; preset: PresetKey | 'custom' };

export type PresetKey = 'last30' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear' | 'all';

const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: 'last30', label: 'Last 30 days' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'thisYear', label: 'This year' },
  { key: 'lastYear', label: 'Last year' },
  { key: 'all', label: 'All time' },
];

const shift = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
};

const monthEnd = (iso: string) => {
  const [y, m] = [Number(iso.slice(0, 4)), Number(iso.slice(5, 7))];

  return `${iso.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

export const presetRange = (key: PresetKey, today: string): DateRange => {
  const year = Number(today.slice(0, 4));

  if (key === 'last30') return { from: shift(today, -29), to: today, preset: key };
  if (key === 'thisMonth') return { from: `${today.slice(0, 7)}-01`, to: monthEnd(today), preset: key };
  if (key === 'lastMonth') {
    const last = shift(`${today.slice(0, 7)}-01`, -1);

    return { from: `${last.slice(0, 7)}-01`, to: last, preset: key };
  }
  if (key === 'thisYear') return { from: `${year}-01-01`, to: `${year}-12-31`, preset: key };
  if (key === 'lastYear') return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31`, preset: key };

  return { from: '2000-01-01', to: '2099-12-31', preset: 'all' };
};

const day = (iso: string, withYear: boolean) =>
  `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}${withYear ? ` ${iso.slice(0, 4)}` : ''}`;

export const rangeLabel = (range: DateRange) => {
  const preset = PRESETS.find((p) => p.key === range.preset);

  if (range.preset === 'all') return 'All time';
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
  const span = `${day(range.from, !sameYear)} – ${day(range.to, true)}`;

  return preset ? `${preset.label} · ${span}` : span;
};

const c = {
  font: 'var(--t-font-family)',
  text: 'var(--t-font-color-primary)',
  text3: 'var(--t-font-color-tertiary)',
  bg: 'var(--t-background-primary)',
  bg2: 'var(--t-background-secondary)',
  border: 'var(--t-border-color-light)',
  border2: 'var(--t-border-color-medium)',
  radius: 'var(--t-border-radius-md)',
  accent: 'var(--t-color-blue9)',
  accentText: 'var(--t-color-blue11)',
  accentBg: 'var(--t-color-blue3)',
};

const control: CSSProperties = {
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

export const DateRangePicker = ({ value, today, onChange }: { value: DateRange; today: string; onChange: (range: DateRange) => void }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(value);
  const valid = draft.from <= draft.to;

  const toggle = () => {
    setDraft(value);
    setOpen(!open);
  };

  const apply = () => {
    if (!valid) return;
    onChange(draft);
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={toggle} style={{ ...control, display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500 }} aria-expanded={open}>
        <span aria-hidden>📅</span>
        {rangeLabel(value)}
        <span aria-hidden style={{ color: c.text3, fontSize: 10 }}>▼</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 40,
            left: 0,
            zIndex: 50,
            width: 300,
            maxWidth: 'calc(100cqw - 24px)',
            background: c.bg,
            border: `1px solid ${c.border2}`,
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.16)',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            fontFamily: c.font,
            color: c.text,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {PRESETS.map((p) => {
              const on = draft.preset === p.key;

              return (
                <button
                  key={p.key}
                  onClick={() => setDraft(presetRange(p.key, today))}
                  style={{ ...control, height: 32, fontSize: 12, background: on ? c.accentBg : c.bg, borderColor: on ? c.accent : c.border2, color: on ? c.accentText : c.text, fontWeight: on ? 600 : 400 }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, borderTop: `1px solid ${c.border}`, paddingTop: 12 }}>
            {(['from', 'to'] as const).map((side) => (
              <label key={side} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.text3 }}>
                {side === 'from' ? 'From' : 'To'}
                <input
                  type="date"
                  value={draft[side]}
                  onChange={(e) => {
                    const v = readValue(e);

                    if (v) setDraft({ ...draft, [side]: v, preset: 'custom' });
                  }}
                  style={{ ...control, cursor: 'text', width: '100%' }}
                />
              </label>
            ))}
          </div>
          {!valid && <span style={{ fontSize: 12, color: 'var(--t-color-red11)' }}>"From" must be on or before "To".</span>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setOpen(false)} style={control}>
              Cancel
            </button>
            <button
              onClick={apply}
              disabled={!valid}
              style={{ ...control, background: c.accent, borderColor: c.accent, color: 'white', fontWeight: 600, opacity: valid ? 1 : 0.5 }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
