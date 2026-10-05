// Document templates for receipts and tenant year statements: a page is a
// list of blocks (heading, text, fields, table, signature...) whose text can
// hold {{placeholders}}. The same template is drawn as a PDF (sent and
// printed) and as a live preview in the template editor.

export type TemplateKind = 'RECEIPT' | 'STATEMENT';

export type TemplateLanguage = 'EN' | 'MS';

export type Align = 'left' | 'center' | 'right';

// When a block is shown. Receipts: rent / deposit; statements: settled /
// arrears; both: hasNotes.
export type ShowIf = 'always' | 'rent' | 'deposit' | 'hasNotes' | 'settled' | 'arrears';

type Base = { id: string; showIf?: ShowIf };

export type Block = Base &
  (
    | { type: 'band'; text: string; align: Align } // coloured title bar
    | { type: 'letterhead'; rightText: string; showDetails: boolean } // your name + address, text on the right
    | { type: 'heading'; text: string; align: Align; size: 'sm' | 'md' | 'lg'; underline: boolean }
    | { type: 'text'; text: string; align: Align; size: 'sm' | 'md'; bold: boolean; muted: boolean; prefix: string }
    | { type: 'fields'; layout: 'grid' | 'lines'; columns: 1 | 2; rows: Array<{ label: string; value: string }> }
    | { type: 'amount'; label: string } // big amount box with the amount in words
    | { type: 'methods'; label: string } // payment method tick boxes
    | { type: 'months'; monthLabel: string; amountLabel: string; totalLabel: string; emptyText: string }
    | { type: 'notes'; title: string } // the statement's automatic notes
    | { type: 'signature'; leftLabel: string; leftName: string; rightLabel: string; rightName: string; showRight: boolean }
    | { type: 'divider' }
    | { type: 'spacer'; size: 'sm' | 'md' | 'lg' }
  );

export type BlockType = Block['type'];

export type TemplateDoc = {
  kind: TemplateKind;
  language: TemplateLanguage;
  blocks: Block[];
};

// Everything a template is filled with: placeholder values, which ShowIf
// conditions hold, and the data for the special blocks.
export type TemplateContext = {
  values: Record<string, string>;
  flags: ShowIf[];
  amount: { text: string; words: string };
  methods: Array<{ label: string; selected: boolean }>;
  months: Array<{ month: string; amount: string }>;
  total: string;
  notes: string[];
  watermark: 'DRAFT' | 'VOID' | null;
  accent: { main: string; soft: string; grid: string };
};

// Replaces {{name}} with its value; unknown names are left visible so a typo
// shows up in the preview.
export const fill = (text: string, values: Record<string, string>) =>
  (text ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => (key in values ? values[key] : match));

export const isShown = (block: Block, context: TemplateContext) =>
  !block.showIf || block.showIf === 'always' || context.flags.includes(block.showIf);

let counter = 0;

export const newBlockId = () => `b${Date.now().toString(36)}${(counter++).toString(36)}`;
