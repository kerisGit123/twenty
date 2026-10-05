import { type CSSProperties, type ReactNode, type SyntheticEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { enqueueSnackbar } from 'twenty-sdk/front-component';

import { TEMPLATE_EDITOR_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v3';
import { TemplatePreview } from 'src/front-components/shared/template-preview';
import type { SavedTemplate } from 'src/logic-functions/utils/templates';
import { PLACEHOLDERS, receiptContext, statementContext } from 'src/shared/doc-template/context';
import { PRESET_NAMES, presetTemplate } from 'src/shared/doc-template/presets';
import { type Letterhead, sampleReceipt, sampleStatement } from 'src/shared/doc-template/samples';
import {
  type Align,
  type Block,
  type BlockType,
  newBlockId,
  type ShowIf,
  type TemplateKind,
  type TemplateLanguage,
} from 'src/shared/doc-template/types';

// Template editor for receipts and year statements: blocks on the left, the
// page in the middle (click a block to select it), its settings on the right.
// Starts from the English or Malay sample; the default template of each kind
// is the one used when receipts and statements are made.

type ListResponse = { success: boolean; canEdit?: boolean; templates?: SavedTemplate[]; letterhead?: Letterhead; message?: string };

const c = {
  font: 'var(--t-font-family)',
  text: 'var(--t-font-color-primary)',
  text2: 'var(--t-font-color-secondary)',
  text3: 'var(--t-font-color-tertiary)',
  bg: 'var(--t-background-primary)',
  bg2: 'var(--t-background-secondary)',
  border: 'var(--t-border-color-light)',
  border2: 'var(--t-border-color-medium)',
  radius: 'var(--t-border-radius-md)',
  blue: 'var(--t-color-blue9)',
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

const button = (primary = false): CSSProperties => ({
  ...control,
  width: 'auto',
  cursor: 'pointer',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  ...(primary ? { background: c.blue, color: '#fff', border: `1px solid ${c.blue}` } : {}),
});

const small: CSSProperties = { ...button(), height: 26, fontSize: 12, padding: '0 8px' };

const readValue = (event: SyntheticEvent<HTMLElement>): string => {
  const object = event as unknown as { detail?: { value?: string }; target?: { value?: string } };

  return object.detail?.value ?? object.target?.value ?? '';
};

const PALETTE: Array<{ type: BlockType; label: string; icon: string; kinds: TemplateKind[] }> = [
  { type: 'band', label: 'Title bar', icon: '▬', kinds: ['RECEIPT', 'STATEMENT'] },
  { type: 'letterhead', label: 'Letterhead', icon: '⌂', kinds: ['RECEIPT', 'STATEMENT'] },
  { type: 'heading', label: 'Heading', icon: 'H', kinds: ['RECEIPT', 'STATEMENT'] },
  { type: 'text', label: 'Paragraph', icon: '¶', kinds: ['RECEIPT', 'STATEMENT'] },
  { type: 'fields', label: 'Fields', icon: '▦', kinds: ['RECEIPT', 'STATEMENT'] },
  { type: 'amount', label: 'Amount box', icon: 'RM', kinds: ['RECEIPT', 'STATEMENT'] },
  { type: 'methods', label: 'Paid by', icon: '☑', kinds: ['RECEIPT'] },
  { type: 'months', label: 'Months table', icon: '▤', kinds: ['STATEMENT'] },
  { type: 'notes', label: 'Notes', icon: '✎', kinds: ['STATEMENT'] },
  { type: 'signature', label: 'Signature', icon: '✍', kinds: ['RECEIPT', 'STATEMENT'] },
  { type: 'divider', label: 'Line', icon: '―', kinds: ['RECEIPT', 'STATEMENT'] },
  { type: 'spacer', label: 'Space', icon: '↕', kinds: ['RECEIPT', 'STATEMENT'] },
];

const SHOW_OPTIONS: Record<TemplateKind, Array<{ value: ShowIf; label: string }>> = {
  RECEIPT: [
    { value: 'always', label: 'Always' },
    { value: 'rent', label: 'Rent receipts only' },
    { value: 'deposit', label: 'Deposit receipts only' },
    { value: 'hasNotes', label: 'Only when there are notes' },
  ],
  STATEMENT: [
    { value: 'always', label: 'Always' },
    { value: 'settled', label: 'Only when fully paid' },
    { value: 'arrears', label: 'Only when rent is owed' },
    { value: 'hasNotes', label: 'Only when there are notes' },
  ],
};

const makeBlock = (type: BlockType, language: TemplateLanguage): Block => {
  const ms = language === 'MS';
  const id = newBlockId();

  switch (type) {
    case 'band':
      return { id, type, text: ms ? 'TAJUK' : 'TITLE', align: 'center' };
    case 'letterhead':
      return { id, type, rightText: '', showDetails: true };
    case 'heading':
      return { id, type, text: ms ? 'Tajuk' : 'Heading', align: 'left', size: 'md', underline: false };
    case 'text':
      return { id, type, text: ms ? 'Tulis teks di sini.' : 'Write your text here.', align: 'left', size: 'md', bold: false, muted: false, prefix: '' };
    case 'fields':
      return { id, type, layout: 'grid', columns: 1, rows: [{ label: ms ? 'Label' : 'Label', value: '' }] };
    case 'amount':
      return { id, type, label: ms ? 'Jumlah diterima' : 'Amount received' };
    case 'methods':
      return { id, type, label: ms ? 'Kaedah bayaran' : 'Paid by' };
    case 'months':
      return { id, type, monthLabel: ms ? 'BULAN' : 'MONTH', amountLabel: ms ? 'JUMLAH BAYARAN' : 'AMOUNT PAID', totalLabel: 'TOTAL', emptyText: ms ? 'Tiada bayaran direkodkan' : 'No payments recorded' };
    case 'notes':
      return { id, type, title: ms ? 'Untuk makluman tuan:' : 'For your information:' };
    case 'signature':
      return { id, type, leftLabel: ms ? 'Yang Benar' : 'Yours faithfully', leftName: '', rightLabel: '', rightName: '', showRight: false };
    case 'divider':
      return { id, type };
    case 'spacer':
      return { id, type, size: 'md' };
  }
};

const blockLabel = (block: Block) => PALETTE.find((p) => p.type === block.type)?.label ?? block.type;

// ---------------------------------------------------------------- small inputs

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.text2 }}>
    {label}
    {children}
  </label>
);

const TextInput = ({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) => (
  <input value={value} placeholder={placeholder} onChange={(e) => onChange(readValue(e))} style={control} />
);

const TextArea = ({ value, onChange, rows = 3 }: { value: string; onChange: (value: string) => void; rows?: number }) => (
  <textarea value={value} rows={rows} onChange={(e) => onChange(readValue(e))} style={{ ...control, height: 'auto', padding: '6px 8px', resize: 'vertical' }} />
);

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
    <span style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${c.border2}`, background: on ? c.blue : c.bg, color: '#fff', fontSize: 10, lineHeight: '14px', textAlign: 'center' }}>
      {on ? '✓' : ''}
    </span>
    {label}
  </button>
);

const ALIGN: Array<{ value: Align; label: string }> = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Right' },
];

// ---------------------------------------------------------------- block settings

const BlockSettings = ({ block, kind, onChange }: { block: Block; kind: TemplateKind; onChange: (block: Block) => void }) => {
  const set = (patch: Partial<Block>) => onChange({ ...block, ...patch } as Block);

  const body = (() => {
    switch (block.type) {
      case 'band':
        return (
          <>
            <Field label="Text">
              <TextInput value={block.text} onChange={(text) => set({ text })} />
            </Field>
            <Field label="Align">
              <Choice value={block.align} options={ALIGN} onChange={(align) => set({ align })} />
            </Field>
          </>
        );
      case 'letterhead':
        return (
          <>
            <div style={{ fontSize: 12, color: c.text3 }}>Your name and address come from Receipt settings.</div>
            <Field label="Text on the right">
              <TextInput value={block.rightText} onChange={(rightText) => set({ rightText })} placeholder="No. {{receipt.number}}" />
            </Field>
            <Toggle on={block.showDetails} label="Show address" onChange={(showDetails) => set({ showDetails })} />
          </>
        );
      case 'heading':
        return (
          <>
            <Field label="Text">
              <TextArea value={block.text} rows={2} onChange={(text) => set({ text })} />
            </Field>
            <Field label="Size">
              <Choice value={block.size} options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }]} onChange={(size) => set({ size })} />
            </Field>
            <Field label="Align">
              <Choice value={block.align} options={ALIGN} onChange={(align) => set({ align })} />
            </Field>
            <Toggle on={block.underline} label="Underline" onChange={(underline) => set({ underline })} />
          </>
        );
      case 'text':
        return (
          <>
            <Field label="Text">
              <TextArea value={block.text} rows={5} onChange={(text) => set({ text })} />
            </Field>
            <Field label="Number in front (e.g. 2.)">
              <TextInput value={block.prefix} onChange={(prefix) => set({ prefix })} />
            </Field>
            <Field label="Size">
              <Choice value={block.size} options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Normal' }]} onChange={(size) => set({ size })} />
            </Field>
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
            <Field label="Look">
              <Choice value={block.layout} options={[{ value: 'grid', label: 'Boxes' }, { value: 'lines', label: 'Lines' }]} onChange={(layout) => set({ layout })} />
            </Field>
            <Field label="Columns">
              <Choice value={String(block.columns) as '1' | '2'} options={[{ value: '1', label: '1' }, { value: '2', label: '2' }]} onChange={(columns) => set({ columns: Number(columns) as 1 | 2 })} />
            </Field>
            <div style={{ fontSize: 12, color: c.text2 }}>Rows (label → value)</div>
            {block.rows.map((row, index) => (
              <div key={index} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <TextInput value={row.label} onChange={(label) => set({ rows: block.rows.map((r, i) => (i === index ? { ...r, label } : r)) })} />
                <TextInput value={row.value} onChange={(value) => set({ rows: block.rows.map((r, i) => (i === index ? { ...r, value } : r)) })} />
                <button onClick={() => set({ rows: block.rows.filter((_, i) => i !== index) })} style={{ ...small, width: 26, padding: 0 }} aria-label="Remove row">
                  ×
                </button>
              </div>
            ))}
            <button onClick={() => set({ rows: [...block.rows, { label: 'Label', value: '' }] })} style={small}>
              + Add row
            </button>
          </>
        );
      case 'amount':
      case 'methods':
        return (
          <Field label="Label">
            <TextInput value={block.label} onChange={(label) => set({ label })} />
          </Field>
        );
      case 'months':
        return (
          <>
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
          </>
        );
      case 'notes':
        return (
          <>
            <Field label="Title">
              <TextInput value={block.title} onChange={(title) => set({ title })} />
            </Field>
            <div style={{ fontSize: 12, color: c.text3 }}>
              The notes are filled in for you: stamping date, rent start and end, and the contract's Statement note.
            </div>
          </>
        );
      case 'signature':
        return (
          <>
            <Field label="Left: label">
              <TextInput value={block.leftLabel} onChange={(leftLabel) => set({ leftLabel })} />
            </Field>
            <Field label="Left: name under the line">
              <TextInput value={block.leftName} onChange={(leftName) => set({ leftName })} />
            </Field>
            <Toggle on={block.showRight} label="Second signature on the right" onChange={(showRight) => set({ showRight })} />
            {block.showRight && (
              <>
                <Field label="Right: label">
                  <TextInput value={block.rightLabel} onChange={(rightLabel) => set({ rightLabel })} />
                </Field>
                <Field label="Right: name under the line">
                  <TextInput value={block.rightName} onChange={(rightName) => set({ rightName })} />
                </Field>
              </>
            )}
          </>
        );
      case 'spacer':
        return (
          <Field label="Height">
            <Choice value={block.size} options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }]} onChange={(size) => set({ size })} />
          </Field>
        );
      case 'divider':
        return <div style={{ fontSize: 12, color: c.text3 }}>A full-width line.</div>;
    }
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {body}
      <Field label="Show">
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

// ---------------------------------------------------------------- editor

type Draft = { id: string | null; name: string; language: TemplateLanguage; blocks: Block[]; isDefault: boolean };

const fromPreset = (kind: TemplateKind, language: TemplateLanguage): Draft => ({
  id: null,
  name: PRESET_NAMES[kind][language],
  language,
  blocks: presetTemplate(kind, language).blocks,
  isDefault: false,
});

const TemplateEditor = () => {
  const [kind, setKind] = useState<TemplateKind>('RECEIPT');
  const [data, setData] = useState<ListResponse | null>(null);
  const [draft, setDraft] = useState<Draft>(fromPreset('RECEIPT', 'EN'));
  const [saved, setSaved] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sampleVariant, setSampleVariant] = useState<'a' | 'b'>('a');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (nextKind: TemplateKind, pickId?: string) => {
    const result = await new RestApiClient().post<ListResponse>('/s/templates', { action: 'list', kind: nextKind });

    setData(result);
    const templates = result.templates ?? [];
    const pick = templates.find((t) => t.id === pickId) ?? templates.find((t) => t.isDefault) ?? templates[0];
    const next = pick
      ? { id: pick.id, name: pick.name, language: pick.language, blocks: pick.content.blocks, isDefault: pick.isDefault }
      : fromPreset(nextKind, 'EN');

    setDraft(next);
    setSaved(JSON.stringify(next));
    setSelectedId(null);
  }, []);

  useEffect(() => {
    load(kind).catch((error) => setData({ success: false, message: error instanceof Error ? error.message : String(error) }));
  }, [kind, load]);

  const letterhead: Letterhead = data?.letterhead ?? { name: '', details: '', accent: 'TEAL', receivedBy: '', footer: '', rentTitle: '', depositTitle: '' };
  const context = useMemo(
    () =>
      kind === 'RECEIPT'
        ? receiptContext(sampleReceipt(letterhead, sampleVariant === 'b', true), draft.language)
        : statementContext(sampleStatement(letterhead, sampleVariant === 'b'), draft.language),
    [kind, letterhead, sampleVariant, draft.language],
  );

  const canEdit = Boolean(data?.canEdit);
  const dirty = JSON.stringify(draft) !== saved;
  const selected = draft.blocks.find((b) => b.id === selectedId) ?? null;
  const templates = data?.templates ?? [];

  const setBlocks = (blocks: Block[]) => setDraft((current) => ({ ...current, blocks }));
  const updateBlock = (block: Block) => setBlocks(draft.blocks.map((b) => (b.id === block.id ? block : b)));

  const addBlock = (type: BlockType) => {
    const block = makeBlock(type, draft.language);
    const index = selected ? draft.blocks.findIndex((b) => b.id === selected.id) + 1 : draft.blocks.length;

    setBlocks([...draft.blocks.slice(0, index), block, ...draft.blocks.slice(index)]);
    setSelectedId(block.id);
  };

  const move = (delta: number) => {
    if (!selected) return;
    const index = draft.blocks.findIndex((b) => b.id === selected.id);
    const target = index + delta;

    if (target < 0 || target >= draft.blocks.length) return;
    const blocks = [...draft.blocks];

    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    setBlocks(blocks);
  };

  const duplicate = () => {
    if (!selected) return;
    const copy = { ...JSON.parse(JSON.stringify(selected)), id: newBlockId() } as Block;
    const index = draft.blocks.findIndex((b) => b.id === selected.id) + 1;

    setBlocks([...draft.blocks.slice(0, index), copy, ...draft.blocks.slice(index)]);
    setSelectedId(copy.id);
  };

  const remove = () => {
    if (!selected) return;
    setBlocks(draft.blocks.filter((b) => b.id !== selected.id));
    setSelectedId(null);
  };

  // Puts {{placeholder}} at the end of the selected block's main text.
  const insert = async (key: string) => {
    const token = `{{${key}}}`;

    if (selected && (selected.type === 'text' || selected.type === 'heading' || selected.type === 'band')) {
      updateBlock({ ...selected, text: `${selected.text}${selected.text.endsWith(' ') || !selected.text ? '' : ' '}${token}` } as Block);
    } else if (selected?.type === 'letterhead') {
      updateBlock({ ...selected, rightText: `${selected.rightText} ${token}`.trim() });
    } else {
      await enqueueSnackbar({ message: `Select a paragraph, heading or title bar first, or type ${token} into a field.`, variant: 'info' });
    }
  };

  const call = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      const result = await new RestApiClient().post<{ success: boolean; id?: string; message?: string }>('/s/templates', body);

      if (!result.success) throw new Error(result.message ?? 'Could not save.');
      await enqueueSnackbar({ message: done, variant: 'success' });

      return result;
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not save.', variant: 'error' });

      return null;
    } finally {
      setBusy(false);
    }
  };

  const save = async (asNew = false) => {
    const result = await call(
      { action: 'save', id: asNew ? undefined : draft.id ?? undefined, name: asNew ? `${draft.name} (copy)` : draft.name, kind, language: draft.language, blocks: draft.blocks },
      asNew ? 'Saved as a new template.' : 'Template saved.',
    );

    if (result?.id) await load(kind, result.id);
  };

  const makeDefault = async () => {
    if (!draft.id) return;
    const result = await call({ action: 'setDefault', id: draft.id }, `${draft.name} is now used for new ${kind === 'RECEIPT' ? 'receipts' : 'statements'}.`);

    if (result) await load(kind, draft.id);
  };

  const remove_template = async () => {
    if (!draft.id) return;
    const result = await call({ action: 'delete', id: draft.id }, 'Template deleted.');

    if (result) await load(kind);
  };

  const pickTemplate = (value: string) => {
    if (value.startsWith('preset:')) {
      const next = fromPreset(kind, value.slice(7) as TemplateLanguage);

      setDraft(next);
      setSaved('');
      setSelectedId(null);

      return;
    }
    const template = templates.find((t) => t.id === value);

    if (!template) return;
    const next = { id: template.id, name: template.name, language: template.language, blocks: template.content.blocks, isDefault: template.isDefault };

    setDraft(next);
    setSaved(JSON.stringify(next));
    setSelectedId(null);
  };

  if (data && !data.success) return <div style={{ padding: 16, fontFamily: c.font, color: 'var(--t-color-red11)' }}>{data.message}</div>;

  const panel: CSSProperties = { border: `1px solid ${c.border}`, borderRadius: c.radius, background: c.bg, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 };

  return (
    <div style={{ fontFamily: c.font, color: c.text, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginRight: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>Templates</span>
          <span style={{ fontSize: 12, color: c.text3 }}>How receipts and year statements look. The ★ default is used when they're made.</span>
        </div>
        <div style={{ width: 230 }}>
          <Choice
            value={kind}
            options={[{ value: 'RECEIPT', label: 'Receipt' }, { value: 'STATEMENT', label: 'Year statement' }]}
            onChange={(next) => setKind(next)}
          />
        </div>
        <div style={{ flex: 1 }} />
        <select value={draft.id ?? `preset:${draft.language}`} onChange={(e) => pickTemplate(readValue(e))} style={{ ...control, width: 240 }}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.isDefault ? '★ ' : ''}
              {t.name}
            </option>
          ))}
          <option value="preset:EN">New from English sample</option>
          <option value="preset:MS">New from Malay sample</option>
        </select>
      </div>

      {!canEdit && data && (
        <div style={{ fontSize: 13, color: c.text2, background: c.bg2, borderRadius: c.radius, padding: '8px 12px' }}>
          Only admins can change templates. You can look around and preview.
        </div>
      )}

      {/* Columns wrap on narrow screens: the page then gets a row of its own. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
        {/* Blocks */}
        <div style={{ ...panel, flex: '0 0 150px', boxSizing: 'border-box' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: c.text3 }}>ADD A BLOCK</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {PALETTE.filter((p) => p.kinds.includes(kind)).map((item) => (
              <button
                key={item.type}
                onClick={() => addBlock(item.type)}
                disabled={!canEdit}
                style={{ ...button(), height: 56, padding: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, fontSize: 11, whiteSpace: 'normal', lineHeight: 1.1 }}
              >
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11, color: c.text3 }}>New blocks go below the selected one.</span>
        </div>

        {/* Page */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 460px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: c.text3 }}>Preview with:</span>
            <div style={{ width: 260 }}>
              <Choice
                value={sampleVariant}
                options={
                  kind === 'RECEIPT'
                    ? [{ value: 'a', label: 'Rent receipt' }, { value: 'b', label: 'Deposit receipt' }]
                    : [{ value: 'a', label: 'Fully paid' }, { value: 'b', label: 'Rent owed' }]
                }
                onChange={setSampleVariant}
              />
            </div>
            <span style={{ fontSize: 12, color: c.text3 }}>Faded blocks are hidden for this example.</span>
          </div>
          <div style={{ background: c.bg2, borderRadius: c.radius, padding: 16 }}>
            <TemplatePreview
              template={{ kind, language: draft.language, blocks: draft.blocks }}
              context={context}
              selectedId={selectedId}
              onSelect={setSelectedId}
              showHidden
              renderEditor={(block) => (
                <div
                  style={{
                    fontFamily: c.font,
                    fontSize: 13,
                    lineHeight: 1.3,
                    color: c.text,
                    background: c.bg,
                    border: '2px solid #3b82f6',
                    borderRadius: 8,
                    margin: '8px -6px 12px',
                    padding: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ flex: 1, fontWeight: 600 }}>{blockLabel(block)}</span>
                    <button onClick={() => move(-1)} disabled={!canEdit} style={{ ...small, width: 28, padding: 0 }} title="Move up">↑</button>
                    <button onClick={() => move(1)} disabled={!canEdit} style={{ ...small, width: 28, padding: 0 }} title="Move down">↓</button>
                    <button onClick={duplicate} disabled={!canEdit} style={{ ...small, width: 28, padding: 0 }} title="Duplicate">⧉</button>
                    <button onClick={remove} disabled={!canEdit} style={{ ...small, color: 'var(--t-color-red11)' }} title="Delete this block">Delete</button>
                    <button onClick={() => setSelectedId(null)} style={{ ...small, background: c.blue, color: '#fff', border: `1px solid ${c.blue}` }}>Done</button>
                  </div>
                  {canEdit ? (
                    <BlockSettings block={block} kind={kind} onChange={updateBlock} />
                  ) : (
                    <span style={{ fontSize: 12, color: c.text3 }}>Only admins can change templates.</span>
                  )}
                </div>
              )}
            />
          </div>
        </div>

        {/* Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: '1 1 280px', minWidth: 0 }}>
          <div style={panel}>
            <Field label="Template name">
              <TextInput value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} />
            </Field>
            <Field label="Language (dates, months, amounts in words)">
              <Choice
                value={draft.language}
                options={[{ value: 'EN', label: 'English' }, { value: 'MS', label: 'Bahasa Melayu' }]}
                onChange={(language) => setDraft((current) => ({ ...current, language }))}
              />
            </Field>
            {canEdit && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => save()} disabled={busy || (!dirty && !!draft.id)} style={{ ...button(true), opacity: busy || (!dirty && draft.id) ? 0.6 : 1 }}>
                  {busy ? 'Saving…' : draft.id ? (dirty ? 'Save' : 'Saved') : 'Save template'}
                </button>
                {draft.id && (
                  <button onClick={() => save(true)} disabled={busy} style={button()}>
                    Save as copy
                  </button>
                )}
                {draft.id && !draft.isDefault && (
                  <button onClick={makeDefault} disabled={busy || dirty} style={button()} title={dirty ? 'Save first' : ''}>
                    ★ Use as default
                  </button>
                )}
                {draft.id && !draft.isDefault && (
                  <button onClick={remove_template} disabled={busy} style={{ ...button(), color: 'var(--t-color-red11)' }}>
                    Delete
                  </button>
                )}
              </div>
            )}
            {draft.id && (
              <a
                href={new RestApiClient().resolveUrl('/s/templates/sample', { query: { id: draft.id, variant: sampleVariant } })}
                target="_blank"
                rel="noreferrer"
                style={{ ...button(), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: c.text }}
                title={dirty ? 'Shows the last saved version' : ''}
              >
                Preview as PDF{dirty ? ' (saved version)' : ''}
              </a>
            )}
            {draft.isDefault && <span style={{ fontSize: 12, color: c.text3 }}>★ This is the default {kind === 'RECEIPT' ? 'receipt' : 'statement'} template.</span>}
            {!draft.id && <span style={{ fontSize: 12, color: c.text3 }}>Not saved yet — this is a sample.</span>}
          </div>

          <div style={{ ...panel, fontSize: 13, color: c.text3 }}>
            Click any block on the page to edit its text and settings, move it or delete it — the tools open right under it.
          </div>

          <div style={panel}>
            <span style={{ fontSize: 12, fontWeight: 600, color: c.text3 }}>PLACEHOLDERS</span>
            <span style={{ fontSize: 11, color: c.text3 }}>Filled in for each {kind === 'RECEIPT' ? 'receipt' : 'statement'}. Click to add to the selected block.</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {PLACEHOLDERS[kind].map((p) => (
                <button key={p.key} onClick={() => insert(p.key)} title={`{{${p.key}}}`} style={{ ...small, height: 22, fontSize: 11, padding: '0 6px' }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: TEMPLATE_EDITOR_FRONT_COMPONENT_ID,
  name: 'template-editor',
  description: 'Edit how receipts and year statements look, in English or Malay',
  component: TemplateEditor,
});
