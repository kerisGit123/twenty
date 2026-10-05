import { type CSSProperties, type ReactNode } from 'react';

import { ACCENTS } from 'src/logic-functions/utils/receipt-settings';
import { type Block, fill, isShown, type TemplateContext, type TemplateDoc } from 'src/shared/doc-template/types';

// A document template drawn in HTML, matching the PDF (src/logic-functions/
// utils/template-pdf.ts). In the editor, blocks can be clicked to select
// them; hidden blocks (their condition doesn't hold) show faded.

const INK = '#222429';
const MUTED = '#6b7079';

const HEADING = { sm: 1.05, md: 1.3, lg: 1.65 };
const SPACER = { sm: '0.7em', md: '1.6em', lg: '2.9em' };

const lines = (text: string) => text.split('\n').map((line, index) => (index === 0 ? line : [<br key={index} />, line]));

const BlockView = ({ block, context }: { block: Block; context: TemplateContext }) => {
  const v = (text: string) => fill(text, context.values);
  const { main, soft, grid } = context.accent;

  switch (block.type) {
    case 'band':
      return (
        <div style={{ background: main, color: '#fff', fontWeight: 700, fontSize: '1.45em', padding: '0.45em 0.8em', textAlign: block.align }}>
          {v(block.text)}
        </div>
      );
    case 'letterhead':
      return (
        <div style={{ display: 'flex', gap: '1em', alignItems: 'flex-start', padding: '0.4em 0' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '1.3em' }}>{context.values['business.name'] ?? context.values['landlord.name']}</div>
            {block.showDetails && (
              <div style={{ color: MUTED, fontSize: '0.85em' }}>{lines(context.values['business.details'] ?? context.values['landlord.details'] ?? '')}</div>
            )}
          </div>
          <div style={{ fontWeight: 700, fontSize: '1.3em', color: main }}>{v(block.rightText)}</div>
        </div>
      );
    case 'heading':
      return (
        <div style={{ fontWeight: 700, fontSize: `${HEADING[block.size]}em`, textAlign: block.align, textDecoration: block.underline ? 'underline' : 'none', margin: '0.3em 0' }}>
          {v(block.text)}
        </div>
      );
    case 'text': {
      const value = v(block.text);

      if (!value.trim()) return <div style={{ color: MUTED, fontSize: '0.8em', fontStyle: 'italic' }}>(empty text)</div>;

      return (
        <div
          style={{
            display: 'flex',
            gap: '1.4em',
            fontSize: block.size === 'sm' ? '0.86em' : '1em',
            fontWeight: block.bold ? 700 : 400,
            color: block.muted ? MUTED : INK,
            margin: '0.15em 0 0.3em',
          }}
        >
          {block.prefix ? <span style={{ minWidth: '1.2em' }}>{v(block.prefix)}</span> : null}
          <div style={{ flex: 1, textAlign: block.align }}>{lines(value)}</div>
        </div>
      );
    }
    case 'fields': {
      const cells: ReactNode[] = block.rows.map((row, index) =>
        block.layout === 'grid' ? (
          <div key={index} style={{ display: 'flex', minWidth: 0, border: `1px solid ${grid}`, marginTop: -1, marginLeft: index % block.columns ? -1 : 0 }}>
            <div style={{ background: soft, fontWeight: 700, padding: '0.45em 0.6em', width: block.columns === 1 ? '9.5em' : '8.5em', flexShrink: 0, fontSize: '0.92em' }}>
              {v(row.label)}
            </div>
            <div style={{ padding: '0.45em 0.6em', borderLeft: `1px solid ${grid}`, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {v(row.value)}
            </div>
          </div>
        ) : (
          <div key={index} style={{ display: 'flex', justifyContent: 'space-between', gap: '1em', borderBottom: `1px solid ${grid}`, padding: '0.45em 0', marginRight: '0.7em' }}>
            <span style={{ color: MUTED }}>{v(row.label)}</span>
            <span style={{ textAlign: 'right' }}>{v(row.value) || '-'}</span>
          </div>
        ),
      );

      return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${block.columns}, minmax(0, 1fr))`, margin: '0.2em 0 0.5em' }}>{cells}</div>;
    }
    case 'amount':
      return (
        <div style={{ background: soft, padding: '0.8em 1.1em', margin: '0.3em 0 0.6em' }}>
          <div style={{ color: main, fontWeight: 700, fontSize: '0.72em', letterSpacing: '0.05em' }}>{v(block.label).toUpperCase()}</div>
          <div style={{ fontWeight: 700, fontSize: '1.9em' }}>{context.amount.text}</div>
          <div style={{ color: MUTED, fontSize: '0.82em' }}>{context.amount.words}</div>
        </div>
      );
    case 'methods':
      return (
        <div style={{ display: 'flex', border: `1px solid ${grid}`, margin: '0.2em 0 0.5em' }}>
          <div style={{ background: soft, fontWeight: 700, padding: '0.45em 0.6em', width: '9.5em', flexShrink: 0, fontSize: '0.92em' }}>{v(block.label)}</div>
          <div style={{ display: 'flex', gap: '1.1em', padding: '0.45em 0.7em', borderLeft: `1px solid ${grid}`, flexWrap: 'wrap', fontSize: '0.88em' }}>
            {context.methods.map((method) => (
              <span key={method.label} style={{ display: 'flex', alignItems: 'center', gap: '0.35em', fontWeight: method.selected ? 700 : 400 }}>
                <span style={{ width: '0.85em', height: '0.85em', border: `1px solid ${INK}`, background: method.selected ? main : '#fff', display: 'inline-block' }} />
                {method.label}
              </span>
            ))}
          </div>
        </div>
      );
    case 'months': {
      const cell: CSSProperties = { border: `1px solid ${INK}`, padding: '0.1em 0.8em', textAlign: 'center' };

      return (
        <table style={{ borderCollapse: 'collapse', width: '72%', margin: '0.4em auto 0.7em' }}>
          <tbody>
            <tr>
              <td style={{ ...cell, fontWeight: 700 }}>{v(block.monthLabel)}</td>
              <td style={{ ...cell, fontWeight: 700 }}>{v(block.amountLabel)}</td>
            </tr>
            {context.months.length === 0 && (
              <tr>
                <td style={cell} colSpan={2}>
                  {v(block.emptyText)}
                </td>
              </tr>
            )}
            {context.months.map((month) => (
              <tr key={month.month}>
                <td style={cell}>{month.month}</td>
                <td style={cell}>{month.amount}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...cell, fontWeight: 700 }}>{v(block.totalLabel)}</td>
              <td style={{ ...cell, fontWeight: 700 }}>{context.total}</td>
            </tr>
          </tbody>
        </table>
      );
    }
    case 'notes':
      return (
        <div style={{ paddingLeft: '2.6em', margin: '0.1em 0 0.4em' }}>
          <div style={{ fontWeight: 700 }}>{v(block.title)}</div>
          {(context.notes.length ? context.notes : ['(notes appear here when there are any)']).map((note) => (
            <div key={note}>{note}</div>
          ))}
        </div>
      );
    case 'signature': {
      const side = block.signatureOn ?? 'left';
      const column = (label: string, name: string, withImage: boolean) => (
        <div style={{ width: '42%' }}>
          <div>{v(label)}</div>
          <div style={{ height: '3em', display: 'flex', alignItems: 'flex-end' }}>
            {withImage && context.signatureUrl ? (
              <img src={context.signatureUrl} alt="" style={{ maxHeight: '2.9em', maxWidth: '70%', objectFit: 'contain' }} />
            ) : null}
          </div>
          <div style={{ borderTop: `1px dashed ${INK}`, paddingTop: '0.2em' }}>{v(name)}</div>
        </div>
      );

      return (
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '0.5em 0' }}>
          {column(block.leftLabel, block.leftName, side === 'left')}
          {block.showRight ? column(block.rightLabel, block.rightName, side === 'right') : null}
        </div>
      );
    }
    case 'divider':
      return <div style={{ borderTop: `1.5px solid ${INK}`, margin: '0.6em 0' }} />;
    case 'spacer':
      return <div style={{ height: SPACER[block.size] }} />;
  }
};

export const TemplatePreview = ({
  template,
  context,
  selectedId,
  onSelect,
  showHidden = false,
  scale = 1,
  renderAbove,
  renderInPlace,
  renderEditor,
  emptyText,
  paperStyle,
}: {
  template: TemplateDoc;
  context: TemplateContext;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  showHidden?: boolean;
  scale?: number;
  // Editor hooks for the selected block: a toolbar above it, an editable
  // version in its place (null = draw it normally), settings under it.
  renderAbove?: (block: Block) => ReactNode;
  renderInPlace?: (block: Block) => ReactNode | null;
  renderEditor?: (block: Block) => ReactNode;
  emptyText?: ReactNode;
  // Overrides for the sheet itself, e.g. a fit-to-width font size.
  paperStyle?: CSSProperties;
}) => {
  // The template's own colour wins over the one in Receipt settings.
  const accent = (template.accent && ACCENTS[template.accent]) || context.accent;
  const ctx = accent === context.accent ? context : { ...context, accent };

  return (
    <div
      style={{
        position: 'relative',
        background: '#fff',
        color: INK,
        fontFamily: 'Helvetica, Arial, sans-serif',
        fontSize: 11 * scale,
        lineHeight: 1.42,
        padding: '2.2em 2.6em',
        borderRadius: 4,
        boxShadow: '0 1px 3px rgba(0,0,0,0.10), 0 8px 28px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        minHeight: onSelect ? '30em' : undefined,
        boxSizing: 'border-box',
        ...paperStyle,
      }}
    >
      {template.blocks.length === 0 && emptyText ? emptyText : null}
      {template.blocks.map((block) => {
        const shown = isShown(block, ctx);

        if (!shown && !showHidden) return null;

        const selected = block.id === selectedId;
        const inPlace = selected && renderInPlace ? renderInPlace(block) : null;

        return (
          <div key={block.id}>
            {selected && renderAbove ? renderAbove(block) : null}
            <div
              onClick={onSelect && !selected ? () => onSelect(block.id) : undefined}
              style={{
                position: 'relative',
                cursor: onSelect && !selected ? 'pointer' : 'default',
                opacity: shown || selected ? 1 : 0.35,
                outline: selected ? '2px solid #3b82f6' : 'none',
                outlineOffset: 3,
                borderRadius: 2,
              }}
            >
              {inPlace ?? <BlockView block={block} context={ctx} />}
            </div>
            {selected && renderEditor ? renderEditor(block) : null}
          </div>
        );
      })}
      {ctx.watermark ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ transform: 'rotate(-28deg)', fontSize: '7em', fontWeight: 700, color: ctx.watermark === 'VOID' ? '#cc1f1f' : '#888', opacity: 0.18 }}>
            {ctx.watermark}
          </span>
        </div>
      ) : null}
    </div>
  );
};
