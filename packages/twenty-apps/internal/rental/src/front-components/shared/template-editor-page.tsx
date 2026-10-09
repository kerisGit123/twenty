import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { AppPath, enqueueSnackbar, navigate } from 'twenty-sdk/front-component';

import { readValue } from 'src/front-components/shared/read-value';
import { TemplatePreview } from 'src/front-components/shared/template-preview';
import { ACCENTS } from 'src/logic-functions/utils/receipt-settings';
import type { SavedTemplate } from 'src/logic-functions/utils/templates';
import { PLACEHOLDERS, receiptContext, statementContext } from 'src/shared/doc-template/context';
import { PRESET_NAMES, presetTemplate } from 'src/shared/doc-template/presets';
import { type Letterhead, sampleReceipt, sampleStatement } from 'src/shared/doc-template/samples';
import {
  type Align,
  type Block,
  type BlockType,
  newBlockId,
  byLanguage,
  TEMPLATE_LANGUAGES,
  type ShowIf,
  type TemplateContext,
  type TemplateDoc,
  type TemplateKind,
  type TemplateLanguage,
} from 'src/shared/doc-template/types';

// Template designer for receipts and year statements.
//
// Library: every template as a card with a live thumbnail, plus your
// letterhead and signature. Editor: a page on a canvas — click a block to
// edit its text right on the page, with a toolbar above it and its settings
// below; add blocks from the gallery, reorder them in Layers, undo/redo, and
// see it with sample data or with the raw {{placeholders}}.

type Accent = NonNullable<TemplateDoc['accent']>;

type ListResponse = {
  success: boolean;
  canEdit?: boolean; // in the workspace shown (or shared templates)
  canEditShared?: boolean;
  templates?: SavedTemplate[];
  owners?: Array<{ id: string; name: string; canEdit: boolean }>;
  letterhead?: Letterhead;
  message?: string;
};

// ownerId: the workspace the template belongs to; null = shared by all.
type Draft = { id: string | null; name: string; language: TemplateLanguage; accent: Accent | null; blocks: Block[]; isDefault: boolean; ownerId: string | null };

// ---------------------------------------------------------------- look

const c = {
  font: 'var(--t-font-family)',
  text: 'var(--t-font-color-primary)',
  text2: 'var(--t-font-color-secondary)',
  text3: 'var(--t-font-color-tertiary)',
  bg: 'var(--t-background-primary)',
  bg2: 'var(--t-background-secondary)',
  bg3: 'var(--t-background-tertiary, #eef0f3)',
  border: 'var(--t-border-color-light)',
  border2: 'var(--t-border-color-medium)',
  radius: 'var(--t-border-radius-md)',
  blue: 'var(--t-color-blue9)',
  blueSoft: 'var(--t-color-blue3)',
  red: 'var(--t-color-red11)',
  amber: 'var(--t-color-amber11)',
  amberSoft: 'var(--t-color-amber3)',
};

const control: CSSProperties = {
  fontFamily: c.font,
  fontSize: 13,
  color: c.text,
  background: c.bg,
  border: `1px solid ${c.border2}`,
  borderRadius: c.radius,
  height: 30,
  padding: '0 8px',
  boxSizing: 'border-box',
  width: '100%',
};

const button = (tone: 'plain' | 'primary' | 'ghost' | 'danger' = 'plain'): CSSProperties => ({
  ...control,
  width: 'auto',
  cursor: 'pointer',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  textDecoration: 'none',
  ...(tone === 'primary' ? { background: c.blue, color: '#fff', border: `1px solid ${c.blue}` } : {}),
  ...(tone === 'ghost' ? { background: 'transparent', border: '1px solid transparent', color: c.text2 } : {}),
  ...(tone === 'danger' ? { color: c.red } : {}),
});

const iconButton: CSSProperties = { ...button('ghost'), width: 28, height: 28, padding: 0, fontSize: 14 };

const small: CSSProperties = { ...button(), height: 26, fontSize: 12, padding: '0 8px' };

const sectionTitle: CSSProperties = { fontSize: 11, fontWeight: 600, color: c.text3, letterSpacing: 0.4, textTransform: 'uppercase' };

const card: CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 10, background: c.bg, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 };

// ---------------------------------------------------------------- blocks

const PALETTE: Array<{ type: BlockType; label: string; icon: string; hint: string; kinds: TemplateKind[] }> = [
  { type: 'band', label: 'Title bar', icon: '▬', hint: 'Coloured bar with a title', kinds: ['RECEIPT', 'STATEMENT'] },
  { type: 'letterhead', label: 'Letterhead', icon: '⌂', hint: 'Your name, address and a reference', kinds: ['RECEIPT', 'STATEMENT'] },
  { type: 'heading', label: 'Heading', icon: 'H', hint: 'Bold title, can be underlined', kinds: ['RECEIPT', 'STATEMENT'] },
  { type: 'text', label: 'Paragraph', icon: '¶', hint: 'Any text, with placeholders', kinds: ['RECEIPT', 'STATEMENT'] },
  { type: 'fields', label: 'Fields', icon: '▦', hint: 'Label and value rows', kinds: ['RECEIPT', 'STATEMENT'] },
  { type: 'amount', label: 'Amount box', icon: 'RM', hint: 'Big amount with words', kinds: ['RECEIPT', 'STATEMENT'] },
  { type: 'methods', label: 'Paid by', icon: '☑', hint: 'Payment method tick boxes', kinds: ['RECEIPT'] },
  { type: 'months', label: 'Months table', icon: '▤', hint: 'Month-by-month payments', kinds: ['STATEMENT'] },
  { type: 'notes', label: 'Notes', icon: '✎', hint: 'Automatic notes (deposit, dates)', kinds: ['STATEMENT'] },
  { type: 'payment', label: 'How to pay', icon: '▣', hint: 'Your bank details and DuitNow QR', kinds: ['RECEIPT', 'STATEMENT'] },
  { type: 'signature', label: 'Signature', icon: '✍', hint: 'One or two signature lines', kinds: ['RECEIPT', 'STATEMENT'] },
  { type: 'divider', label: 'Line', icon: '―', hint: 'Full-width rule', kinds: ['RECEIPT', 'STATEMENT'] },
  { type: 'spacer', label: 'Space', icon: '↕', hint: 'Empty room', kinds: ['RECEIPT', 'STATEMENT'] },
];

const SHOW_OPTIONS: Record<TemplateKind, Array<{ value: ShowIf; label: string; badge: string }>> = {
  RECEIPT: [
    { value: 'always', label: 'Always', badge: '' },
    { value: 'rent', label: 'Rent receipts only', badge: 'Rent' },
    { value: 'deposit', label: 'Deposit receipts only', badge: 'Deposit' },
    { value: 'hasNotes', label: 'Only when there are notes', badge: 'Notes' },
  ],
  STATEMENT: [
    { value: 'always', label: 'Always', badge: '' },
    { value: 'settled', label: 'Only when fully paid', badge: 'Paid' },
    { value: 'arrears', label: 'Only when rent is owed', badge: 'Owed' },
    { value: 'hasNotes', label: 'Only when there are notes', badge: 'Notes' },
  ],
};

const ACCENT_CHOICES: Accent[] = ['TEAL', 'NAVY', 'GREEN', 'MAROON', 'BLACK'];

const makeBlock = (type: BlockType, language: TemplateLanguage): Block => {
  const t = (en: string, ms: string, zh: string) => byLanguage(language, en, ms, zh);
  const id = newBlockId();

  switch (type) {
    case 'band':
      return { id, type, text: t('TITLE', 'TAJUK', '标题'), align: 'center' };
    case 'letterhead':
      return { id, type, rightText: '', showDetails: true, showLogo: true };
    case 'heading':
      return { id, type, text: t('Heading', 'Tajuk', '标题'), align: 'left', size: 'md', underline: false };
    case 'text':
      return { id, type, text: '', align: 'left', size: 'md', bold: false, muted: false, prefix: '' };
    case 'fields':
      return { id, type, layout: 'grid', columns: 1, rows: [{ label: 'Label', value: '' }] };
    case 'amount':
      return { id, type, label: t('Amount received', 'Jumlah diterima', '已收金额') };
    case 'methods':
      return { id, type, label: t('Paid by', 'Kaedah bayaran', '付款方式') };
    case 'months':
      return {
        id,
        type,
        monthLabel: t('MONTH', 'BULAN', '月份'),
        amountLabel: t('AMOUNT PAID', 'JUMLAH BAYARAN', '已付金额'),
        totalLabel: t('TOTAL', 'TOTAL', '总计'),
        emptyText: t('No payments recorded', 'Tiada bayaran direkodkan', '没有付款记录'),
      };
    case 'notes':
      return { id, type, title: t('For your information:', 'Untuk makluman tuan:', '附注：') };
    case 'payment':
      return { id, type, title: t('How to pay', 'Cara pembayaran', '付款方式'), text: '{{pay.to}}', showQr: true };
    case 'signature':
      return { id, type, leftLabel: t('Yours faithfully', 'Yang Benar', '此致'), leftName: '', rightLabel: '', rightName: '', showRight: false };
    case 'divider':
      return { id, type };
    case 'spacer':
      return { id, type, size: 'md' };
  }
};

const paletteItem = (type: BlockType) => PALETTE.find((p) => p.type === type);

// A short line describing a block, for Layers.
const blockSummary = (block: Block) => {
  switch (block.type) {
    case 'band':
    case 'heading':
    case 'text':
      return block.text.replace(/\s+/g, ' ').slice(0, 42) || '(empty)';
    case 'fields':
      return block.rows.map((r) => r.label).join(' · ').slice(0, 42);
    case 'letterhead':
      return block.rightText || 'Your name and address';
    case 'payment':
      return block.showQr ? 'Details + DuitNow QR' : 'Payment details';
    case 'signature':
      return [block.leftLabel, block.showRight ? block.rightLabel : ''].filter(Boolean).join(' · ');
    default:
      return '';
  }
};

// Every {{name}} in a block's text.
const placeholdersIn = (block: Block): string[] =>
  [...JSON.stringify(block).matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]);

// ---------------------------------------------------------------- small inputs

// Which input was focused last, so a placeholder lands where you're typing.
type FocusTarget = { blockId: string; path: string } | null;

const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.text2 }}>
    {label}
    {children}
    {hint ? <span style={{ fontSize: 11, color: c.text3 }}>{hint}</span> : null}
  </label>
);

const TextInput = ({
  value,
  onChange,
  placeholder,
  onFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onFocus?: () => void;
}) => <input value={value} placeholder={placeholder} onFocus={onFocus} onChange={(e) => onChange(readValue(e))} style={control} />;

const Choice = <T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) => (
  <div style={{ display: 'flex', gap: 2, padding: 2, background: c.bg2, borderRadius: c.radius }}>
    {options.map((option) => (
      <button
        key={option.value}
        onClick={() => onChange(option.value)}
        style={{
          ...small,
          flex: 1,
          border: 'none',
          background: value === option.value ? c.bg : 'transparent',
          boxShadow: value === option.value ? `0 0 0 1px ${c.border2}` : 'none',
          color: value === option.value ? c.text : c.text3,
        }}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const Toggle = ({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) => (
  <button onClick={() => onChange(!on)} style={{ ...small, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-start' }}>
    <span
      style={{
        width: 26,
        height: 14,
        borderRadius: 7,
        background: on ? c.blue : c.border2,
        position: 'relative',
        display: 'inline-block',
        flexShrink: 0,
      }}
    >
      <span style={{ position: 'absolute', top: 2, left: on ? 14 : 2, width: 10, height: 10, borderRadius: 5, background: '#fff' }} />
    </span>
    {label}
  </button>
);

const ALIGN: Array<{ value: Align; label: string }> = [
  { value: 'left', label: '⇤ Left' },
  { value: 'center', label: '↔ Centre' },
  { value: 'right', label: 'Right ⇥' },
];

const Badge = ({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'blue' | 'amber' | 'green' }) => (
  <span
    style={{
      fontSize: 10.5,
      fontWeight: 600,
      padding: '1px 6px',
      borderRadius: 4,
      whiteSpace: 'nowrap',
      background: tone === 'gray' ? c.bg2 : `var(--t-color-${tone}3)`,
      color: tone === 'gray' ? c.text2 : `var(--t-color-${tone}11)`,
    }}
  >
    {children}
  </span>
);

// ---------------------------------------------------------------- block settings (under the selected block)

const BlockSettings = ({
  block,
  kind,
  onChange,
  onFocus,
}: {
  block: Block;
  kind: TemplateKind;
  onChange: (block: Block) => void;
  onFocus: (path: string) => void;
}) => {
  const set = (patch: Partial<Block>) => onChange({ ...block, ...patch } as Block);
  const grid2: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 };

  const body = (() => {
    switch (block.type) {
      case 'band':
        return (
          <Field label="Align">
            <Choice value={block.align} options={ALIGN} onChange={(align) => set({ align })} />
          </Field>
        );
      case 'letterhead':
        return (
          <>
            <Field label="Text on the right" hint="Your name and address come from Receipt settings.">
              <TextInput value={block.rightText} onFocus={() => onFocus('rightText')} onChange={(rightText) => set({ rightText })} placeholder="No. {{receipt.number}}" />
            </Field>
            <Toggle on={block.showDetails} label="Show your address" onChange={(showDetails) => set({ showDetails })} />
            <Toggle on={block.showLogo !== false} label="Show your logo (upload it in Receipt settings)" onChange={(showLogo) => set({ showLogo })} />
          </>
        );
      case 'heading':
        return (
          <>
            <div style={grid2}>
              <Field label="Size">
                <Choice value={block.size} options={[{ value: 'sm', label: 'S' }, { value: 'md', label: 'M' }, { value: 'lg', label: 'L' }]} onChange={(size) => set({ size })} />
              </Field>
              <Field label="Underline">
                <Toggle on={block.underline} label={block.underline ? 'On' : 'Off'} onChange={(underline) => set({ underline })} />
              </Field>
            </div>
            <Field label="Align">
              <Choice value={block.align} options={ALIGN} onChange={(align) => set({ align })} />
            </Field>
          </>
        );
      case 'text':
        return (
          <>
            <div style={grid2}>
              <Field label="Number in front">
                <TextInput value={block.prefix} onFocus={() => onFocus('prefix')} onChange={(prefix) => set({ prefix })} placeholder="e.g. 2." />
              </Field>
              <Field label="Size">
                <Choice value={block.size} options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Normal' }]} onChange={(size) => set({ size })} />
              </Field>
            </div>
            <Field label="Align">
              <Choice value={block.align} options={ALIGN} onChange={(align) => set({ align })} />
            </Field>
            <div style={{ display: 'flex', gap: 6 }}>
              <Toggle on={block.bold} label="Bold" onChange={(bold) => set({ bold })} />
              <Toggle on={block.muted} label="Grey" onChange={(muted) => set({ muted })} />
            </div>
          </>
        );
      case 'fields':
        return (
          <>
            <div style={grid2}>
              <Field label="Look">
                <Choice value={block.layout} options={[{ value: 'grid', label: 'Boxes' }, { value: 'lines', label: 'Lines' }]} onChange={(layout) => set({ layout })} />
              </Field>
              <Field label="Columns">
                <Choice value={String(block.columns) as '1' | '2'} options={[{ value: '1', label: '1' }, { value: '2', label: '2' }]} onChange={(columns) => set({ columns: Number(columns) as 1 | 2 })} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 26px 26px 26px', gap: 4, alignItems: 'center', fontSize: 11, color: c.text3 }}>
              <span>Label</span>
              <span>Value</span>
              <span />
              <span />
              <span />
              {block.rows.map((row, index) => {
                const moveRow = (delta: number) => {
                  const rows = [...block.rows];
                  const target = index + delta;

                  if (target < 0 || target >= rows.length) return;
                  [rows[index], rows[target]] = [rows[target], rows[index]];
                  set({ rows });
                };

                return (
                  <div key={index} style={{ display: 'contents' }}>
                    <TextInput value={row.label} onFocus={() => onFocus(`rows.${index}.label`)} onChange={(label) => set({ rows: block.rows.map((r, i) => (i === index ? { ...r, label } : r)) })} />
                    <TextInput value={row.value} onFocus={() => onFocus(`rows.${index}.value`)} onChange={(value) => set({ rows: block.rows.map((r, i) => (i === index ? { ...r, value } : r)) })} />
                    <button onClick={() => moveRow(-1)} style={{ ...small, width: 26, padding: 0 }} title="Move row up">↑</button>
                    <button onClick={() => moveRow(1)} style={{ ...small, width: 26, padding: 0 }} title="Move row down">↓</button>
                    <button onClick={() => set({ rows: block.rows.filter((_, i) => i !== index) })} style={{ ...small, width: 26, padding: 0, color: c.red }} title="Remove row">×</button>
                  </div>
                );
              })}
            </div>
            <button onClick={() => set({ rows: [...block.rows, { label: 'Label', value: '' }] })} style={{ ...small, alignSelf: 'flex-start' }}>
              + Add row
            </button>
          </>
        );
      case 'amount':
      case 'methods':
        return (
          <Field label="Label">
            <TextInput value={block.label} onFocus={() => onFocus('label')} onChange={(label) => set({ label })} />
          </Field>
        );
      case 'months':
        return (
          <div style={grid2}>
            <Field label="Month column">
              <TextInput value={block.monthLabel} onChange={(monthLabel) => set({ monthLabel })} />
            </Field>
            <Field label="Amount column">
              <TextInput value={block.amountLabel} onChange={(amountLabel) => set({ amountLabel })} />
            </Field>
            <Field label="Total row">
              <TextInput value={block.totalLabel} onChange={(totalLabel) => set({ totalLabel })} />
            </Field>
            <Field label="When nothing was paid">
              <TextInput value={block.emptyText} onChange={(emptyText) => set({ emptyText })} />
            </Field>
          </div>
        );
      case 'payment':
        return (
          <>
            <Field label="Title">
              <TextInput value={block.title} onFocus={() => onFocus('title')} onChange={(title) => set({ title })} />
            </Field>
            <Field label="Details" hint="{{pay.to}} is “How tenants pay you” from Receipt settings.">
              <TextInput value={block.text} onFocus={() => onFocus('text')} onChange={(text) => set({ text })} placeholder="{{pay.to}}" />
            </Field>
            <Toggle on={block.showQr} label="Show your DuitNow QR (upload it in Receipt settings)" onChange={(showQr) => set({ showQr })} />
          </>
        );
      case 'notes':
        return (
          <Field label="Title" hint="Notes fill themselves in: stamping date, rent start and end, months paid from the deposit, and the contract's Statement note.">
            <TextInput value={block.title} onChange={(title) => set({ title })} />
          </Field>
        );
      case 'signature':
        return (
          <>
            <div style={grid2}>
              <Field label="Left label">
                <TextInput value={block.leftLabel} onFocus={() => onFocus('leftLabel')} onChange={(leftLabel) => set({ leftLabel })} />
              </Field>
              <Field label="Left name">
                <TextInput value={block.leftName} onFocus={() => onFocus('leftName')} onChange={(leftName) => set({ leftName })} />
              </Field>
            </div>
            <Toggle on={block.showRight} label="Second signature on the right" onChange={(showRight) => set({ showRight })} />
            {block.showRight && (
              <div style={grid2}>
                <Field label="Right label">
                  <TextInput value={block.rightLabel} onFocus={() => onFocus('rightLabel')} onChange={(rightLabel) => set({ rightLabel })} />
                </Field>
                <Field label="Right name">
                  <TextInput value={block.rightName} onFocus={() => onFocus('rightName')} onChange={(rightName) => set({ rightName })} />
                </Field>
              </div>
            )}
            <Field label="Your signature image goes">
              <Choice
                value={block.signatureOn ?? 'left'}
                options={[
                  { value: 'left', label: 'Left' },
                  ...(block.showRight ? [{ value: 'right' as const, label: 'Right' }] : []),
                  { value: 'none', label: 'Nowhere' },
                ]}
                onChange={(signatureOn) => set({ signatureOn })}
              />
            </Field>
          </>
        );
      case 'spacer':
        return (
          <Field label="Height">
            <Choice value={block.size} options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }]} onChange={(size) => set({ size })} />
          </Field>
        );
      case 'divider':
        return null;
    }
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {body}
      <Field label="Show this block">
        <select value={block.showIf ?? 'always'} onChange={(e) => set({ showIf: readValue(e) as ShowIf })} style={control}>
          {SHOW_OPTIONS[kind].map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
};

// ---------------------------------------------------------------- helpers

const fromPreset = (kind: TemplateKind, language: TemplateLanguage, blank = false, ownerId: string | null = null): Draft => ({
  id: null,
  ownerId,
  name: blank ? byLanguage(language, 'New template', 'Templat baharu', '新模板') : PRESET_NAMES[kind][language],
  language,
  accent: null,
  blocks: blank ? [] : presetTemplate(kind, language).blocks,
  isDefault: false,
});

const fromSaved = (template: SavedTemplate): Draft => ({
  id: template.id,
  name: template.name,
  language: template.language,
  accent: template.content.accent ?? null,
  blocks: template.content.blocks,
  isDefault: template.isDefault,
  ownerId: template.ownerId ?? null,
});

const sampleContext = (kind: TemplateKind, letterhead: Letterhead, variant: 'a' | 'b', language: TemplateLanguage): TemplateContext =>
  kind === 'RECEIPT'
    ? receiptContext(sampleReceipt(letterhead, variant === 'b', true), language, letterhead)
    : statementContext(sampleStatement(letterhead, variant === 'b'), language, letterhead.accent, letterhead);

// Shows {{placeholders}} instead of sample values.
const rawContext = (context: TemplateContext, kind: TemplateKind): TemplateContext => ({
  ...context,
  values: Object.fromEntries(PLACEHOLDERS[kind].map((p) => [p.key, `{{${p.key}}}`])),
});

const KIND_WORD: Record<TemplateKind, { one: string; many: string }> = {
  RECEIPT: { one: 'receipt', many: 'receipts' },
  STATEMENT: { one: 'year statement', many: 'year statements' },
};

// ---------------------------------------------------------------- page

export const TemplateDesigner = () => {
  const [kind, setKind] = useState<TemplateKind>('RECEIPT');
  // The workspace whose templates and letterhead are shown ('' = shared).
  const [workspace, setWorkspace] = useState('');
  const [data, setData] = useState<ListResponse | null>(null);
  const [screen, setScreen] = useState<'library' | 'editor'>('library');
  const [draft, setDraft] = useState<Draft>(fromPreset('RECEIPT', 'EN'));
  const [saved, setSaved] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [variant, setVariant] = useState<'a' | 'b'>('a');
  const [showRaw, setShowRaw] = useState(false);
  // 'fit' scales the page to the screen width (phones); numbers are fixed sizes.
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ layers: false, template: false, placeholders: false });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newMenu, setNewMenu] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState<FocusTarget>(null);
  // Undo / redo: snapshots of the blocks; typing in one field is one step.
  const [past, setPast] = useState<Block[][]>([]);
  const [future, setFuture] = useState<Block[][]>([]);
  const lastEdit = useRef<{ key: string; at: number }>({ key: '', at: 0 });

  const load = useCallback(async () => {
    const result = await new RestApiClient().post<ListResponse>('/s/templates', { action: 'list', ownerId: workspace || null });

    setData(result);

    return result;
  }, [workspace]);

  useEffect(() => {
    load().catch((error) => setData({ success: false, message: error instanceof Error ? error.message : String(error) }));
  }, [load]);

  const letterhead: Letterhead = data?.letterhead ?? { name: '', details: '', accent: 'TEAL', receivedBy: '', footer: '', rentTitle: '', depositTitle: '' };
  // Shared templates are the admins'; a workspace's also its hosts'.
  const editableOwner = (ownerId: string | null | undefined) =>
    ownerId ? Boolean(data?.owners?.find((o) => o.id === ownerId)?.canEdit) : Boolean(data?.canEditShared);
  const ownerLabel = (ownerId: string | null | undefined) => (ownerId ? (data?.owners?.find((o) => o.id === ownerId)?.name ?? 'Workspace') : 'Shared');
  const canEdit = screen === 'editor' ? editableOwner(draft.ownerId) : Boolean(data?.canEdit);
  const templates = (data?.templates ?? []).filter((t) => t.kind === kind);
  const dirty = JSON.stringify(draft) !== saved;
  const selected = draft.blocks.find((b) => b.id === selectedId) ?? null;

  const sample = useMemo(() => sampleContext(kind, letterhead, variant, draft.language), [kind, letterhead, variant, draft.language]);
  const context = showRaw ? rawContext(sample, kind) : sample;
  const known = useMemo(() => new Set(PLACEHOLDERS[kind].map((p) => p.key)), [kind]);
  const unknown = useMemo(() => [...new Set(draft.blocks.flatMap(placeholdersIn).filter((key) => !known.has(key)))], [draft.blocks, known]);

  // ------------------------------------------------------------ opening

  const open = (next: Draft) => {
    setDraft(next);
    setSaved(next.id ? JSON.stringify(next) : '');
    setSelectedId(null);
    setPast([]);
    setFuture([]);
    setPaletteOpen(false);
    setConfirmDelete(false);
    setScreen('editor');
  };

  const backToLibrary = () => {
    if (dirty && canEdit && !confirmLeave) {
      setConfirmLeave(true);

      return;
    }
    setConfirmLeave(false);
    setScreen('library');
  };

  // ------------------------------------------------------------ editing

  const commit = (blocks: Block[], key = '') => {
    const now = Date.now();
    const same = key && key === lastEdit.current.key && now - lastEdit.current.at < 1200;

    if (!same) setPast((list) => [...list.slice(-49), draft.blocks]);
    setFuture([]);
    lastEdit.current = { key, at: now };
    setDraft((current) => ({ ...current, blocks }));
  };

  const undo = () => {
    const previous = past[past.length - 1];

    if (!previous) return;
    setPast(past.slice(0, -1));
    setFuture([draft.blocks, ...future]);
    lastEdit.current = { key: '', at: 0 };
    setDraft((current) => ({ ...current, blocks: previous }));
  };

  const redo = () => {
    const next = future[0];

    if (!next) return;
    setFuture(future.slice(1));
    setPast([...past, draft.blocks]);
    lastEdit.current = { key: '', at: 0 };
    setDraft((current) => ({ ...current, blocks: next }));
  };

  const updateBlock = (block: Block, key = `edit:${block.id}`) => commit(draft.blocks.map((b) => (b.id === block.id ? block : b)), key);

  const addBlock = (type: BlockType) => {
    const block = makeBlock(type, draft.language);
    const index = selected ? draft.blocks.findIndex((b) => b.id === selected.id) + 1 : draft.blocks.length;

    commit([...draft.blocks.slice(0, index), block, ...draft.blocks.slice(index)]);
    setSelectedId(block.id);
    setPaletteOpen(false);
  };

  const moveBlock = (id: string, delta: number) => {
    const index = draft.blocks.findIndex((b) => b.id === id);
    const target = index + delta;

    if (index < 0 || target < 0 || target >= draft.blocks.length) return;
    const blocks = [...draft.blocks];

    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    commit(blocks);
  };

  const duplicateBlock = (id: string) => {
    const index = draft.blocks.findIndex((b) => b.id === id);

    if (index < 0) return;
    const copy = { ...JSON.parse(JSON.stringify(draft.blocks[index])), id: newBlockId() } as Block;

    commit([...draft.blocks.slice(0, index + 1), copy, ...draft.blocks.slice(index + 1)]);
    setSelectedId(copy.id);
  };

  const removeBlock = (id: string) => {
    commit(draft.blocks.filter((b) => b.id !== id));
    setSelectedId(null);
  };

  // Adds {{key}} where you were last typing (else the selected block's text).
  const insertPlaceholder = async (key: string) => {
    const token = `{{${key}}}`;
    const target = focus && draft.blocks.find((b) => b.id === focus.blockId);
    const append = (text: string) => `${text}${!text || text.endsWith(' ') || text.endsWith('\n') ? '' : ' '}${token}`;

    if (target && focus) {
      const copy = JSON.parse(JSON.stringify(target)) as Record<string, unknown>;
      const parts = focus.path.split('.');
      let holder = copy as Record<string, unknown>;

      for (const part of parts.slice(0, -1)) holder = holder[part] as Record<string, unknown>;
      const last = parts[parts.length - 1];

      holder[last] = append(String(holder[last] ?? ''));
      updateBlock(copy as Block, `insert:${Date.now()}`);
      setSelectedId(target.id);

      return;
    }
    if (selected && (selected.type === 'text' || selected.type === 'heading' || selected.type === 'band')) {
      updateBlock({ ...selected, text: append(selected.text) } as Block, `insert:${Date.now()}`);

      return;
    }
    await enqueueSnackbar({ message: `Click into a text first, then pick ${token}.`, variant: 'info' });
  };

  // ------------------------------------------------------------ server

  const call = async (body: Record<string, unknown>, done?: string) => {
    setBusy(true);
    try {
      const result = await new RestApiClient().post<{ success: boolean; id?: string; message?: string }>('/s/templates', body);

      if (!result.success) throw new Error(result.message ?? 'Something went wrong.');
      if (done) await enqueueSnackbar({ message: done, variant: 'success' });

      return result;
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Something went wrong.', variant: 'error' });

      return null;
    } finally {
      setBusy(false);
    }
  };

  const reopen = async (id: string) => {
    const result = await load();
    const template = result.templates?.find((t) => t.id === id);

    if (template) {
      const next = fromSaved(template);

      setDraft(next);
      setSaved(JSON.stringify(next));
    }
  };

  const save = async () => {
    const result = await call(
      { action: 'save', id: draft.id ?? undefined, name: draft.name, kind, language: draft.language, blocks: draft.blocks, accent: draft.accent ?? undefined, ownerId: draft.ownerId },
      'Saved.',
    );

    if (result?.id) await reopen(result.id);
  };

  const duplicateTemplate = async (source: Draft) => {
    const result = await call(
      { action: 'save', name: `${source.name} (copy)`, kind, language: source.language, blocks: source.blocks, accent: source.accent ?? undefined, ownerId: workspace || null },
      'Copy made.',
    );

    if (result?.id) {
      const list = await load();
      const template = list.templates?.find((t) => t.id === result.id);

      if (template) open(fromSaved(template));
    }
  };

  const makeDefault = async (id: string, name: string) => {
    const result = await call({ action: 'setDefault', id }, `${name} is now used for new ${KIND_WORD[kind].many}.`);

    if (result) {
      if (screen === 'editor' && draft.id === id) await reopen(id);
      else await load();
    }
  };

  const deleteTemplate = async () => {
    if (!draft.id) return;
    const result = await call({ action: 'delete', id: draft.id }, 'Template deleted.');

    if (result) {
      await load();
      setScreen('library');
    }
  };

  const openLetterhead = async () => {
    const result = await call({ action: 'settingsRecord', ownerId: workspace || null }, 'Fill in your details or upload a signature, then come back.');

    if (result?.id) await navigate(AppPath.RecordShowPage, { objectNameSingular: 'receiptSetting', objectRecordId: result.id });
  };

  // ------------------------------------------------------------ render

  if (!data) return <div style={{ padding: 20, fontFamily: c.font, color: c.text3, fontSize: 13 }}>Loading templates…</div>;
  if (!data.success) return <div style={{ padding: 20, fontFamily: c.font, color: c.red }}>{data.message}</div>;

  const shell: CSSProperties = { fontFamily: c.font, color: c.text, padding: 'clamp(4px, 2vw, 16px)', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 };

  const kindTabs = (
    <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${c.border}` }}>
      {(['RECEIPT', 'STATEMENT'] as TemplateKind[]).map((k) => (
        <button
          key={k}
          onClick={() => setKind(k)}
          style={{
            fontFamily: c.font,
            fontSize: 13,
            fontWeight: 600,
            padding: '8px 12px',
            background: 'none',
            border: 'none',
            borderBottom: `2px solid ${kind === k ? c.blue : 'transparent'}`,
            color: kind === k ? c.text : c.text3,
            cursor: 'pointer',
            marginBottom: -1,
          }}
        >
          {k === 'RECEIPT' ? 'Receipts' : 'Year statements'}
          <span style={{ marginLeft: 6, color: c.text3, fontWeight: 500 }}>{(data.templates ?? []).filter((t) => t.kind === k).length}</span>
        </button>
      ))}
    </div>
  );

  // ============================================================ library

  if (screen === 'library') {
    const thumb = (doc: TemplateDoc, language: TemplateLanguage) => (
      <div style={{ height: 210, overflow: 'hidden', background: c.bg2, borderRadius: 8, padding: '12px 14px 0', position: 'relative' }}>
        <div style={{ pointerEvents: 'none' }}>
          <TemplatePreview template={doc} context={sampleContext(kind, letterhead, 'a', language)} scale={0.5} />
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 36, background: `linear-gradient(transparent, ${c.bg2})` }} />
      </div>
    );

    return (
      <div style={shell}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 650 }}>Templates</div>
            <div style={{ fontSize: 13, color: c.text3, marginTop: 2 }}>
              Design how your receipts and year statements look. Each workspace uses its own <b>★ default</b>, else the shared one.
            </div>
            {(data.owners ?? []).length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, color: c.text3 }}>Workspace</span>
                <select
                  value={workspace}
                  onChange={(e) => setWorkspace(((e as unknown as { detail?: { value?: string }; target?: { value?: string } }).detail?.value ?? (e as unknown as { target?: { value?: string } }).target?.value) ?? '')}
                  style={{ fontFamily: c.font, fontSize: 13, height: 30, borderRadius: 8, border: `1px solid ${c.border}`, padding: '0 8px', background: c.bg, color: c.text }}
                >
                  <option value="">Shared — every workspace</option>
                  {(data.owners ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {canEdit && (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setNewMenu(!newMenu)} style={button('primary')}>
                + New template
              </button>
              {newMenu && (
                <div style={{ position: 'absolute', right: 0, top: 36, zIndex: 5, width: 250, ...card, boxShadow: '0 10px 30px rgba(0,0,0,0.14)', padding: 6, gap: 2 }}>
                  {[
                    { label: 'English sample', hint: 'Ready-made, in English', run: () => open(fromPreset(kind, 'EN', false, workspace || null)) },
                    { label: 'Malay sample', hint: 'Siap sedia, dalam Bahasa Melayu', run: () => open(fromPreset(kind, 'MS', false, workspace || null)) },
                    { label: 'Chinese sample', hint: '现成的中文模板', run: () => open(fromPreset(kind, 'ZH', false, workspace || null)) },
                    { label: 'Blank page', hint: 'Start from nothing', run: () => open(fromPreset(kind, 'EN', true, workspace || null)) },
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={() => {
                        setNewMenu(false);
                        item.run();
                      }}
                      style={{ ...button('ghost'), height: 'auto', padding: '8px 10px', flexDirection: 'column', alignItems: 'flex-start', gap: 1, color: c.text }}
                    >
                      <span style={{ fontWeight: 600 }}>{item.label}</span>
                      <span style={{ fontSize: 11.5, color: c.text3, fontWeight: 400 }}>{item.hint}</span>
                    </button>
                  ))}
                  <button onClick={() => setNewMenu(false)} style={{ ...button('ghost'), height: 26, fontSize: 12 }}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Letterhead & signature: what every template prints */}
        <div style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: c.bg2, border: 'none' }}>
          <div style={{ flex: '1 1 160px', minWidth: 0 }}>
            <div style={sectionTitle}>Your letterhead</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{letterhead.name || <span style={{ color: c.amber }}>Name not set</span>}</div>
            <div style={{ fontSize: 12, color: c.text3, whiteSpace: 'pre-line' }}>{letterhead.details || 'No address yet'}</div>
          </div>
          <div style={{ flex: '0 1 150px' }}>
            <div style={sectionTitle}>Signature</div>
            <div style={{ height: 44, display: 'flex', alignItems: 'center', marginTop: 4 }}>
              {letterhead.signatureUrl ? (
                <img src={letterhead.signatureUrl} alt="Your signature" style={{ maxHeight: 44, maxWidth: 160, objectFit: 'contain', background: '#fff', borderRadius: 4 }} />
              ) : (
                <span style={{ fontSize: 12, color: c.text3 }}>Not uploaded</span>
              )}
            </div>
          </div>
          {(
            [
              ['Logo', letterhead.logoUrl],
              ['DuitNow QR', letterhead.paymentQrUrl],
            ] as const
          ).map(([label, url]) => (
            <div key={label} style={{ flex: '0 1 90px' }}>
              <div style={sectionTitle}>{label}</div>
              <div style={{ height: 44, display: 'flex', alignItems: 'center', marginTop: 4 }}>
                {url ? (
                  <img src={url} alt={label} style={{ maxHeight: 44, maxWidth: 90, objectFit: 'contain', background: '#fff', borderRadius: 4 }} />
                ) : (
                  <span style={{ fontSize: 12, color: c.text3 }}>Not uploaded</span>
                )}
              </div>
            </div>
          ))}
          {canEdit && (
            <button onClick={openLetterhead} disabled={busy} style={button()}>
              Edit letterhead, logo &amp; QR
            </button>
          )}
        </div>

        {kindTabs}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(230px, 100%), 1fr))', gap: 14 }}>
          {templates.map((template) => (
            <div key={template.id} style={{ ...card, padding: 10, border: template.isDefault ? `1.5px solid ${c.blue}` : card.border }}>
              <button onClick={() => open(fromSaved(template))} style={{ all: 'unset', cursor: 'pointer', display: 'block' }} title="Open in the designer">
                {thumb(template.content, template.language)}
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.name}</span>
                <Badge>{TEMPLATE_LANGUAGES.find((l) => l.value === template.language)?.short ?? 'EN'}</Badge>
                {workspace && <Badge>{ownerLabel(template.ownerId)}</Badge>}
                {template.isDefault &&
                  (workspace && !template.ownerId && templates.some((t) => t.ownerId && t.isDefault) ? (
                    <Badge>Shared default · not used here</Badge>
                  ) : (
                    <Badge tone="blue">★ Default</Badge>
                  ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => open(fromSaved(template))} style={{ ...small, flex: 1 }}>
                  {editableOwner(template.ownerId) ? 'Edit' : 'View'}
                </button>
                {editableOwner(template.ownerId) && !template.isDefault && (
                  <button onClick={() => makeDefault(template.id, template.name)} disabled={busy} style={small} title="Use for new ones">
                    ★ Default
                  </button>
                )}
                {canEdit && (
                  <button onClick={() => duplicateTemplate(fromSaved(template))} disabled={busy} style={{ ...small, width: 28, padding: 0 }} title="Duplicate">
                    ⧉
                  </button>
                )}
              </div>
            </div>
          ))}

          {templates.length === 0 &&
            TEMPLATE_LANGUAGES.map(({ value: language }) => (
              <div key={language} style={{ ...card, padding: 10, borderStyle: 'dashed' }}>
                <button onClick={() => open(fromPreset(kind, language, false, workspace || null))} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
                  {thumb(presetTemplate(kind, language), language)}
                </button>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{PRESET_NAMES[kind][language]}</div>
                <button onClick={() => open(fromPreset(kind, language, false, workspace || null))} style={small}>
                  Start from this sample
                </button>
              </div>
            ))}
        </div>
        {!canEdit && <div style={{ fontSize: 12, color: c.text3 }}>{workspace ? 'Only this workspace’s hosts and admins can change its templates.' : 'Only admins can change shared templates.'}</div>}
      </div>
    );
  }

  // ============================================================ editor

  const statusText = !draft.id ? 'Not saved yet' : dirty ? 'Unsaved changes' : 'All changes saved';
  const doc: TemplateDoc = { kind, language: draft.language, blocks: draft.blocks, ...(draft.accent ? { accent: draft.accent } : {}) };

  const topBar = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 10, borderBottom: `1px solid ${c.border}` }}>
      {/* Row 1: back, name, save — what matters most, on any screen */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={backToLibrary} style={{ ...iconButton, width: 32, height: 32, fontSize: 16 }} title="All templates">
          ←
        </button>
        <input
          value={draft.name}
          disabled={!canEdit}
          onChange={(e) => {
            const name = readValue(e);

            setDraft((current) => ({ ...current, name }));
          }}
          style={{ ...control, flex: '1 1 auto', minWidth: 0, height: 32, fontWeight: 600, fontSize: 15, border: '1px solid transparent', background: 'transparent' }}
          title="Rename"
        />
        {canEdit && (
          <button onClick={save} disabled={busy || (!dirty && !!draft.id)} style={{ ...button('primary'), height: 32, opacity: busy || (!dirty && draft.id) ? 0.55 : 1 }}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
      {/* Row 2: status and secondary actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingLeft: 38 }}>
        <span style={{ fontSize: 12, color: dirty || !draft.id ? c.amber : c.text3, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: dirty || !draft.id ? 'var(--t-color-amber9)' : 'var(--t-color-green9)' }} />
          {statusText}
        </span>
        {draft.isDefault ? <Badge tone="blue">★ Default</Badge> : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
        {canEdit && (
          <>
            <button onClick={undo} disabled={!past.length} style={{ ...iconButton, opacity: past.length ? 1 : 0.35 }} title="Undo">
              ↶
            </button>
            <button onClick={redo} disabled={!future.length} style={{ ...iconButton, opacity: future.length ? 1 : 0.35 }} title="Redo">
              ↷
            </button>
          </>
        )}
        {draft.id && (
          <a
            href={new RestApiClient().resolveUrl('/s/templates/sample', { query: { id: draft.id, variant } })}
            target="_blank"
            rel="noreferrer"
            style={{ ...small, color: c.text, height: 28 }}
            title={dirty ? 'Shows the last saved version' : 'The real PDF, with sample data'}
          >
            Preview PDF
          </a>
        )}
        </div>
      </div>
    </div>
  );

  const banner = (tone: 'amber' | 'red', text: string, actions: ReactNode) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        padding: '8px 12px',
        borderRadius: 8,
        fontSize: 13,
        background: `var(--t-color-${tone}3)`,
        color: `var(--t-color-${tone}11)`,
      }}
    >
      <span style={{ flex: '1 1 180px' }}>{text}</span>
      {actions}
    </div>
  );

  // One row that scrolls sideways on narrow screens instead of piling up.
  const chipGroup: CSSProperties = { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 };
  const divider = <span style={{ width: 1, height: 20, background: c.border, flexShrink: 0 }} />;
  const zoomLevels: Array<'fit' | number> = ['fit', 1, 1.25, 1.5];
  const zoomIndex = zoomLevels.indexOf(zoom);

  const toolbar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflowX: 'auto', scrollbarWidth: 'thin', padding: '2px 2px 6px', margin: '0 -2px' }}>
      {canEdit && (
        <button onClick={() => setPaletteOpen(!paletteOpen)} style={{ ...button(paletteOpen ? 'primary' : 'plain'), flexShrink: 0 }}>
          ＋ Add block
        </button>
      )}
      <div style={{ ...chipGroup, width: 190 }}>
        <Choice
          value={draft.language}
          options={TEMPLATE_LANGUAGES.map((l) => ({ value: l.value, label: l.short }))}
          onChange={(language) => canEdit && setDraft((current) => ({ ...current, language }))}
        />
      </div>
      {divider}
      <div style={chipGroup} title="Colour">
        <button
          onClick={() => canEdit && setDraft((current) => ({ ...current, accent: null }))}
          style={{ ...small, height: 24, padding: '0 6px', fontSize: 11, background: draft.accent ? c.bg : c.bg2 }}
          title="Use the colour from Receipt settings"
        >
          Auto
        </button>
        {ACCENT_CHOICES.map((accent) => (
          <button
            key={accent}
            onClick={() => canEdit && setDraft((current) => ({ ...current, accent }))}
            title={accent.charAt(0) + accent.slice(1).toLowerCase()}
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              cursor: 'pointer',
              flexShrink: 0,
              background: ACCENTS[accent].main,
              border: draft.accent === accent ? `2px solid ${c.text}` : '2px solid transparent',
              boxShadow: `0 0 0 1px ${c.border2}`,
              padding: 0,
            }}
          />
        ))}
      </div>
      {divider}
      <div style={{ ...chipGroup, width: 190 }}>
        <Choice
          value={variant}
          options={
            kind === 'RECEIPT'
              ? [{ value: 'a', label: 'Rent' }, { value: 'b', label: 'Deposit' }]
              : [{ value: 'a', label: 'Paid' }, { value: 'b', label: 'Owed' }]
          }
          onChange={setVariant}
        />
      </div>
      <div style={chipGroup}>
        <Toggle on={showRaw} label="{ } Tags" onChange={setShowRaw} />
      </div>
      {divider}
      <div style={chipGroup}>
        <button onClick={() => setZoom(zoomLevels[Math.max(0, zoomIndex - 1)])} style={iconButton} title="Smaller">
          −
        </button>
        <button onClick={() => setZoom('fit')} style={{ ...small, height: 24, minWidth: 48, fontSize: 11.5 }} title="Fit to screen">
          {zoom === 'fit' ? 'Fit' : `${Math.round(zoom * 100)}%`}
        </button>
        <button onClick={() => setZoom(zoomLevels[Math.min(zoomLevels.length - 1, zoomIndex + 1)])} style={iconButton} title="Bigger">
          +
        </button>
      </div>
    </div>
  );

  const palette = paletteOpen && (
    <div style={{ ...card, boxShadow: '0 10px 30px rgba(0,0,0,0.10)' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>Add a block{selected ? ` below “${paletteItem(selected.type)?.label}”` : ' at the end'}</span>
        <button onClick={() => setPaletteOpen(false)} style={iconButton} title="Close">
          ×
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(150px, 45%), 1fr))', gap: 8 }}>
        {PALETTE.filter((p) => p.kinds.includes(kind)).map((item) => (
          <button
            key={item.type}
            onClick={() => addBlock(item.type)}
            style={{ ...button(), height: 'auto', minHeight: 48, padding: '8px', justifyContent: 'flex-start', gap: 8, textAlign: 'left', whiteSpace: 'normal' }}
          >
            <span style={{ width: 28, height: 28, borderRadius: 8, background: c.blueSoft, color: 'var(--t-color-blue11)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
              {item.icon}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 12.5 }}>{item.label}</span>
              <span style={{ fontSize: 11, color: c.text3, fontWeight: 400, lineHeight: 1.25 }}>{item.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  // Placeholder chips right where you type (scroll sideways on phones).
  const insertChips = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', scrollbarWidth: 'thin', paddingBottom: 2 }}>
      <span style={{ fontSize: 11, color: c.text3, flexShrink: 0, marginRight: 2 }}>Insert:</span>
      {PLACEHOLDERS[kind].map((p) => (
        <button
          key={p.key}
          onClick={() => insertPlaceholder(p.key)}
          title={`{{${p.key}}} — e.g. ${sample.values[p.key] || '—'}`}
          style={{ ...small, height: 24, fontSize: 11, padding: '0 8px', flexShrink: 0, borderRadius: 12, background: c.bg2, border: `1px solid ${c.border}` }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );

  // Toolbar above the selected block; sticks to the top while you scroll.
  const blockToolbar = (block: Block) => (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 3,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        fontFamily: c.font,
        fontSize: 12,
        color: '#fff',
        background: '#3b82f6',
        borderRadius: 8,
        padding: '3px 4px 3px 10px',
        margin: '8px -5px 6px',
        width: 'fit-content',
        maxWidth: 'calc(100% + 10px)',
        flexWrap: 'wrap',
        boxShadow: '0 4px 12px rgba(59,130,246,0.35)',
      }}
    >
      <span style={{ fontWeight: 600, marginRight: 4, whiteSpace: 'nowrap' }}>
        {paletteItem(block.type)?.icon} {paletteItem(block.type)?.label}
      </span>
      {canEdit &&
        [
          { label: '↑', title: 'Move up', run: () => moveBlock(block.id, -1) },
          { label: '↓', title: 'Move down', run: () => moveBlock(block.id, 1) },
          { label: '⧉', title: 'Duplicate', run: () => duplicateBlock(block.id) },
          { label: '＋', title: 'Add a block below', run: () => setPaletteOpen(true) },
          { label: '🗑', title: 'Delete block', run: () => removeBlock(block.id) },
        ].map((action) => (
          <button
            key={action.title}
            onClick={action.run}
            title={action.title}
            style={{ fontFamily: c.font, fontSize: 14, color: '#fff', background: 'transparent', border: 'none', cursor: 'pointer', width: 32, height: 28, borderRadius: 6 }}
          >
            {action.label}
          </button>
        ))}
      <button
        onClick={() => setSelectedId(null)}
        title="Done"
        style={{ fontFamily: c.font, fontSize: 12, fontWeight: 600, color: '#3b82f6', background: '#fff', border: 'none', cursor: 'pointer', height: 26, borderRadius: 6, marginLeft: 2, padding: '0 10px' }}
      >
        Done
      </button>
    </div>
  );

  // Text blocks are edited right on the page, always at a readable size.
  const inPlace = (block: Block): ReactNode | null => {
    if (!canEdit || (block.type !== 'text' && block.type !== 'heading' && block.type !== 'band')) return null;

    const isBand = block.type === 'band';
    const size =
      block.type === 'heading'
        ? `max(15px, ${{ sm: 1.05, md: 1.3, lg: 1.65 }[block.size]}em)`
        : isBand
          ? 'max(16px, 1.45em)'
          : block.type === 'text' && block.size === 'sm'
            ? 'max(13px, 0.86em)'
            : 'max(14px, 1em)';
    const style: CSSProperties = {
      width: '100%',
      boxSizing: 'border-box',
      resize: 'vertical',
      border: '1.5px solid #93c5fd',
      borderRadius: 6,
      outline: 'none',
      padding: '8px 10px',
      fontFamily: 'Helvetica, Arial, sans-serif',
      lineHeight: 1.45,
      textAlign: block.align,
      fontWeight: block.type === 'text' ? (block.bold ? 700 : 400) : 700,
      fontSize: size,
      color: isBand ? '#fff' : '#222429',
      background: isBand ? ((draft.accent && ACCENTS[draft.accent]) || context.accent).main : '#f8fbff',
      textDecoration: block.type === 'heading' && block.underline ? 'underline' : 'none',
    };
    const rows = Math.max(2, block.text.split('\n').length + 1);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: c.font }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {block.type === 'text' && block.prefix ? <span style={{ minWidth: '1.2em', paddingTop: 8, fontSize: 'max(14px, 1em)' }}>{block.prefix}</span> : null}
          <textarea
            value={block.text}
            rows={rows}
            placeholder={byLanguage(draft.language, 'Type here…', 'Tulis di sini…', '在此输入…')}
            onFocus={() => setFocus({ blockId: block.id, path: 'text' })}
            onChange={(e) => updateBlock({ ...block, text: readValue(e) } as Block)}
            style={style}
          />
        </div>
        {insertChips}
      </div>
    );
  };

  const hasTextFields = (block: Block) => ['letterhead', 'fields', 'signature', 'amount', 'methods', 'payment'].includes(block.type);

  const settingsDrawer = (block: Block) =>
    canEdit ? (
      <div
        style={{
          fontFamily: c.font,
          fontSize: 13,
          lineHeight: 1.3,
          color: c.text,
          background: c.bg,
          border: `1px solid ${c.border2}`,
          borderRadius: 12,
          margin: '10px -10px 16px',
          padding: 12,
          boxShadow: '0 10px 28px rgba(0,0,0,0.10)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {hasTextFields(block) && insertChips}
        <BlockSettings block={block} kind={kind} onChange={(b) => updateBlock(b)} onFocus={(path) => setFocus({ blockId: block.id, path })} />
      </div>
    ) : null;

  // Collapsible section for the side panel.
  const section = (key: string, title: string, body: ReactNode, extra?: ReactNode) => {
    const isOpen = openSections[key];

    return (
      <div style={{ ...card, padding: 0, gap: 0 }}>
        <button
          onClick={() => setOpenSections((current) => ({ ...current, [key]: !current[key] }))}
          style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px' }}
        >
          <span style={{ ...sectionTitle, flex: 1 }}>{title}</span>
          {extra}
          <span style={{ color: c.text3, fontSize: 12, transform: isOpen ? 'rotate(90deg)' : 'none' }}>▸</span>
        </button>
        {isOpen ? <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>{body}</div> : null}
      </div>
    );
  };

  const layers = section(
    'layers',
    `Layers · ${draft.blocks.length}`,
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 420, overflow: 'auto' }}>
      {draft.blocks.map((block, index) => {
        const item = paletteItem(block.type);
        const condition = SHOW_OPTIONS[kind].find((o) => o.value === block.showIf)?.badge;
        const active = block.id === selectedId;
        const hidden = block.showIf && block.showIf !== 'always' && !sample.flags.includes(block.showIf);

        return (
          <div
            key={block.id}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 4px 6px 6px', borderRadius: 8, background: active ? c.blueSoft : 'transparent', opacity: hidden ? 0.55 : 1 }}
          >
            <span style={{ width: 16, fontSize: 11, color: c.text3, textAlign: 'right' }}>{index + 1}</span>
            <button onClick={() => setSelectedId(block.id)} style={{ all: 'unset', cursor: 'pointer', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                {item?.icon} {item?.label} {condition ? <Badge tone="amber">{condition}</Badge> : null}
              </span>
              <span style={{ fontSize: 11, color: c.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{blockSummary(block)}</span>
            </button>
            {canEdit && (
              <>
                <button onClick={() => moveBlock(block.id, -1)} style={{ ...iconButton, width: 30, height: 30, fontSize: 13 }} title="Move up">
                  ↑
                </button>
                <button onClick={() => moveBlock(block.id, 1)} style={{ ...iconButton, width: 30, height: 30, fontSize: 13 }} title="Move down">
                  ↓
                </button>
              </>
            )}
          </div>
        );
      })}
      {draft.blocks.length === 0 && <span style={{ fontSize: 12, color: c.text3 }}>No blocks yet.</span>}
    </div>,
  );

  const placeholderPanel = section(
    'placeholders',
    'Placeholders',
    <>
      <span style={{ fontSize: 11.5, color: c.text3 }}>Each is filled in on every {KIND_WORD[kind].one}. Click one to add it where you were typing.</span>
      {PLACEHOLDERS[kind].map((p) => (
        <button
          key={p.key}
          onClick={() => insertPlaceholder(p.key)}
          disabled={!canEdit}
          title={`{{${p.key}}}`}
          style={{ ...button('ghost'), height: 'auto', padding: '5px 6px', justifyContent: 'space-between', gap: 8, color: c.text, fontWeight: 400 }}
        >
          <span style={{ fontSize: 12 }}>{p.label}</span>
          <span style={{ fontSize: 11, color: c.text3, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 130 }}>{sample.values[p.key] || '—'}</span>
        </button>
      ))}
    </>,
  );

  const manage =
    canEdit && draft.id
      ? section(
          'template',
          'Template',
          <>
            {!draft.isDefault && (
              <button onClick={() => draft.id && makeDefault(draft.id, draft.name)} disabled={busy || dirty} style={button()} title={dirty ? 'Save first' : ''}>
                ★ Use for new {KIND_WORD[kind].many}
              </button>
            )}
            <button onClick={() => duplicateTemplate(draft)} disabled={busy} style={button()}>
              ⧉ Duplicate
            </button>
            {!draft.isDefault &&
              (confirmDelete ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={deleteTemplate} disabled={busy} style={{ ...button('danger'), flex: 1 }}>
                    Yes, delete
                  </button>
                  <button onClick={() => setConfirmDelete(false)} style={button()}>
                    Keep
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} style={button('danger')}>
                  Delete template
                </button>
              ))}
            {draft.isDefault && <span style={{ fontSize: 11.5, color: c.text3 }}>The default can't be deleted — make another one the default first.</span>}
          </>,
        )
      : null;

  // Fit: the sheet takes the screen width (text shrinks like a real page);
  // fixed sizes keep A4 proportions and scroll sideways.
  const paperStyle: CSSProperties =
    zoom === 'fit'
      ? { fontSize: 'min(11px, 1.85cqw)', width: '100%', maxWidth: '54em', margin: '0 auto' }
      : { fontSize: `${11 * zoom}px`, width: '54em', margin: '0 auto' };

  return (
    <div style={shell}>
      {topBar}

      {confirmLeave &&
        banner(
          'amber',
          'You have unsaved changes.',
          <>
            <button
              onClick={async () => {
                await save();
                setConfirmLeave(false);
                setScreen('library');
              }}
              style={button('primary')}
            >
              Save and leave
            </button>
            <button
              onClick={() => {
                setConfirmLeave(false);
                setScreen('library');
              }}
              style={button()}
            >
              Discard
            </button>
            <button onClick={() => setConfirmLeave(false)} style={button('ghost')}>
              Keep editing
            </button>
          </>,
        )}
      {unknown.length > 0 && banner('amber', `Not a known placeholder: ${unknown.map((k) => `{{${k}}}`).join(', ')} — it will print as typed.`, null)}
      {!canEdit && banner('amber', 'Only admins can change templates — you can look around.', null)}

      {toolbar}
      {palette}

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Canvas: a container, so the page can size itself to it */}
        <div
          style={{
            flex: '1 1 480px',
            minWidth: 0,
            containerType: 'inline-size',
            background: c.bg3,
            borderRadius: 12,
            padding: 'clamp(8px, 3cqw, 22px)',
            overflowX: zoom === 'fit' ? 'visible' : 'auto',
          }}
        >
          <TemplatePreview
            template={doc}
            context={context}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setFocus(null);
            }}
            showHidden
            paperStyle={paperStyle}
            renderAbove={blockToolbar}
            renderInPlace={inPlace}
            renderEditor={settingsDrawer}
            emptyText={
              <div style={{ fontFamily: c.font, fontSize: 14, textAlign: 'center', color: '#8a8f98', padding: '60px 12px', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 18 }}>An empty page</span>
                <span>Add blocks to build your {KIND_WORD[kind].one}.</span>
                {canEdit && (
                  <button onClick={() => setPaletteOpen(true)} style={button('primary')}>
                    ＋ Add your first block
                  </button>
                )}
              </div>
            }
          />
          <div style={{ fontSize: 12, color: c.text3, textAlign: 'center', marginTop: 10, lineHeight: 1.4 }}>
            {selectedId ? 'Edit on the page; more options are just below the block.' : 'Tap any part of the page to change it. Faded parts don’t show for this example.'}
          </div>
        </div>

        {/* Side panel (below the page on phones) */}
        <div style={{ flex: '1 1 260px', maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {layers}
          {placeholderPanel}
          {manage}
        </div>
      </div>
    </div>
  );
};
