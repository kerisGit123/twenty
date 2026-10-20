import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { SCAN_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { appClient } from 'src/logic-functions/utils/app-client';
import { todayIso } from 'src/logic-functions/utils/dates';
import { resolveScope } from 'src/logic-functions/utils/scope';
import { EXPENSE_CATEGORIES } from 'src/shared/expense-categories';
import { type TransferScan } from 'src/shared/rent-match';
import { type ReceiptScan, SCAN_METHODS } from 'src/shared/scan';

// POST /scan — a photo or PDF of a receipt, invoice or bill is read by Claude
// (through OpenRouter when OPENROUTER_API_KEY is set, else Anthropic directly) and
// comes back as the fields of a new expense. Nothing is saved here: the person
// checks the filled-in form and presses Save. The same file scanned before (a
// fingerprint kept in the expense's notes) is reported instead of read again.
//
//   { file: { name, type, data (base64) } }                  ->  { success, scan, hash, duplicate? }
//   { kind: 'transfer', file }                                ->  { success, transfer, hash, duplicate? }
//   { action: 'rememberPayer', rentalId, name }              ->  the payer name is kept on the contract

const MODEL = 'claude-opus-5-5';
// OpenRouter's name for the same model; SCAN_MODEL in the app settings can change it.
const OPENROUTER_MODEL = 'anthropic/claude-opus-5.5';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
// The API takes images up to 5 MB; the page shrinks photos first, so this is rare.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const fail = (message: string) => json({ success: false, message });

// What Claude fills in. Every field may be null: unclear means empty, never guessed.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isReceipt', 'merchant', 'date', 'total', 'currency', 'sst', 'receiptNo', 'method', 'category', 'description', 'unsure', 'warning'],
  properties: {
    isReceipt: { type: 'boolean', description: 'true for a receipt, invoice, bill or payment slip of something bought or paid' },
    merchant: { type: ['string', 'null'], description: 'Shop, company or person paid, as printed' },
    date: { type: ['string', 'null'], description: 'Date paid or issued, YYYY-MM-DD' },
    total: { type: ['number', 'null'], description: 'Final amount paid (after tax, rounding and discounts), as a number' },
    currency: { type: ['string', 'null'], description: 'ISO code, e.g. MYR' },
    sst: { type: ['number', 'null'], description: 'SST / service tax amount if printed' },
    receiptNo: { type: ['string', 'null'], description: 'Receipt, invoice or bill number, copied exactly' },
    method: { type: ['string', 'null'], description: 'One of the method codes in the rules, or null' },
    category: { type: ['string', 'null'], description: 'One of the category codes in the rules, or null' },
    description: { type: ['string', 'null'], description: 'What was bought, 2 to 6 words, e.g. "Ice, 10 bags" or "Electricity, Sep 2026"' },
    unsure: { type: 'array', items: { type: 'string', enum: ['merchant', 'date', 'total', 'receiptNo', 'category'] }, description: 'Fields that were hard to read' },
    warning: { type: ['string', 'null'], description: 'One short sentence if something is off (blurry, cut off, not paid yet, several receipts in one photo)' },
  },
} as const;

// A tenant's bank transfer receipt (Maybank2u, CIMB Clicks, PBe, RHB, DuitNow...).
const TRANSFER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isTransfer', 'status', 'bank', 'amount', 'date', 'referenceNo', 'payerName', 'payerAccountLast4', 'recipientName', 'note', 'unsure', 'warning'],
  properties: {
    isTransfer: { type: 'boolean', description: 'true for a bank / DuitNow / e-wallet transfer confirmation or receipt' },
    status: { type: 'string', description: 'SUCCESSFUL, PENDING, FAILED or UNKNOWN' },
    bank: { type: ['string', 'null'], description: 'Bank or wallet the money was sent from, e.g. Maybank' },
    amount: { type: ['number', 'null'], description: 'Amount transferred in MYR, as a number' },
    date: { type: ['string', 'null'], description: 'Transfer date, YYYY-MM-DD' },
    referenceNo: { type: ['string', 'null'], description: 'Bank reference / transaction number, copied exactly' },
    payerName: { type: ['string', 'null'], description: 'Name of the person or company who sent the money' },
    payerAccountLast4: { type: ['string', 'null'], description: 'Last 4 digits of the sender account only' },
    recipientName: { type: ['string', 'null'], description: 'Name of who received the money' },
    note: { type: ['string', 'null'], description: 'What the sender typed: recipient reference, payment details, other payment details' },
    unsure: { type: 'array', items: { type: 'string' }, description: 'Field names that were hard to read' },
    warning: { type: ['string', 'null'], description: 'One short sentence if something is off (cut off, edited-looking, not a transfer, scheduled for later)' },
  },
} as const;

const TRANSFER_PROMPT = `Read this bank transfer receipt from Malaysia (online banking, DuitNow, IBG, JomPAY or e-wallet) and fill in the fields.

Rules:
- Return null for any field not clearly visible. Never guess amounts or reference numbers.
- status: SUCCESSFUL only if the receipt clearly says Successful / Berjaya / Completed / Approved. Pending, Processing, Dalam Proses, Scheduled or a future date: PENDING. Failed / Unsuccessful / Tidak Berjaya: FAILED. Otherwise UNKNOWN.
- Copy reference numbers exactly, character for character.
- Account numbers: only the last 4 digits of the sender account.
- note: copy exactly what the sender typed as recipient reference or payment details (e.g. "Rent Okt B-12-3").
- Dates may be DD/MM/YYYY, DD MMM YYYY or use Malay months (Jan, Feb, Mac, Apr, Mei, Jun, Jul, Ogos, Sep, Okt, Nov, Dis). Return YYYY-MM-DD. Today is {TODAY}.
- If it is not a transfer receipt at all, set isTransfer false and leave the rest null (status UNKNOWN).`;

const CATEGORY_LIST = EXPENSE_CATEGORIES.map((c) => `${c.value}: ${c.label}`).join('\n');

const PROMPT = `Read this receipt, invoice, bill or payment slip for a small business in Malaysia and fill in the fields.

Rules:
- Return null for any field that is not clearly visible. Never guess an amount, date or number.
- total is the final amount actually paid. For a bill, the amount due.
- Dates may be DD/MM/YYYY, DD MMM YYYY or use Malay months (Jan, Feb, Mac, Apr, Mei, Jun, Jul, Ogos, Sep, Okt, Nov, Dis). Return YYYY-MM-DD. Today is ${'{TODAY}'}; a date in the future is probably misread.
- Copy receipt and invoice numbers exactly, character for character.
- method: CASH, CARD (credit/debit card), EWALLET (Touch 'n Go, Boost, GrabPay, ShopeePay), DUITNOW (DuitNow QR or transfer), BANK_TRANSFER (IBG, online banking, JomPAY), OTHER, or null if not shown.
- category: pick the closest from this list, or null if none fits:
${CATEGORY_LIST}
  Hints: drinks shop stock (powders, syrups, jams, tea, pearls, milk) is STOCK_PURCHASE; cups, straws, lids, plastic bags are PACKAGING; TNB is ELECTRICITY; Air Selangor, Syabas, SAJ are WATER; Unifi, Maxis, CelcomDigi are INTERNET_TV; IWK and Indah Water are SEWERAGE.
- If it is not a receipt or bill at all, set isReceipt false and leave the rest null.`;

type Read = { scan: ReceiptScan & TransferScan } | { refused: true } | { problem: string };

// The answer as JSON, even when wrapped in a code fence.
const parseScan = (text: string) => JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()) as ReceiptScan & TransferScan;

const readWithAnthropic = async (apiKey: string, isPdf: boolean, type: string, data: string, prompt: string, schema: object): Promise<Read> => {
  const client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 });
  const file = isPdf
    ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } as const)
    : ({ type: 'image', source: { type: 'base64', media_type: type as 'image/jpeg', data } } as const);
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    // Reading one receipt is a light job.
    output_config: { effort: 'low', format: { type: 'json_schema', schema: schema as never } },
    // If the model declines (rare), the API retries on a fallback model in the same call.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content: [file, { type: 'text', text: prompt }] }],
  } as never);
  const message = response as unknown as { stop_reason?: string; content: Array<{ type: string; text?: string }> };

  if (message.stop_reason === 'refusal') return { refused: true };

  return { scan: parseScan(message.content.find((block) => block.type === 'text')?.text ?? '') };
};

// OpenRouter (openrouter.ai): one key, billed there; OpenAI-style chat request.
const readWithOpenRouter = async (key: string, isPdf: boolean, type: string, data: string, prompt: string, schema: object): Promise<Read> => {
  const file = isPdf
    ? { type: 'file', file: { filename: 'receipt.pdf', file_data: `data:application/pdf;base64,${data}` } }
    : { type: 'image_url', image_url: { url: `data:${type};base64,${data}` } };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Rental receipts' },
      body: JSON.stringify({
        model: process.env.SCAN_MODEL?.trim() || OPENROUTER_MODEL,
        max_tokens: 4000,
        reasoning: { effort: 'low' },
        response_format: { type: 'json_schema', json_schema: { name: 'receipt', strict: true, schema } },
        messages: [{ role: 'user', content: [file, { type: 'text', text: `${prompt}\n\nReply with the JSON only.` }] }],
        ...(isPdf ? { plugins: [{ id: 'file-parser', pdf: { engine: 'native' } }] } : {}),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      choices?: Array<{ finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }>;
    };

    if (response.status === 401 || response.status === 403) return { problem: 'The OpenRouter key is not valid. An admin can fix it in Settings → Apps → Rental.' };
    if (response.status === 402) return { problem: 'The OpenRouter account is out of credit. Top it up at openrouter.ai.' };
    if (response.status === 429) return { problem: 'Too many scans at once. Wait a minute and try again.' };
    if (!response.ok) return { problem: `The reading service had a problem (${response.status}${body.error?.message ? `: ${body.error.message.slice(0, 120)}` : ''}). Try again, or fill in by hand.` };
    const choice = body.choices?.[0];

    if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') return { refused: true };

    return { scan: parseScan(choice?.message?.content ?? '') };
  } catch (error) {
    if (error instanceof SyntaxError) throw error;

    return { problem: 'Could not reach the reading service. Check the connection and try again.' };
  } finally {
    clearTimeout(timer);
  }
};

// A rent payment whose scanned bank reference carries this marker (scan:<file> or ref:<bank reference>).
const paymentWithNote = async (marker: string) => {
  const { rentPayments } = await appClient().query({
    rentPayments: { __args: { filter: { scanRef: { like: `%${marker}%` } }, first: 1 }, edges: { node: { id: true, name: true, paidOn: true } } },
  } as never) as { rentPayments?: { edges?: Array<{ node: { id: string; name?: string | null; paidOn?: string | null } }> } };
  const found = rentPayments?.edges?.[0]?.node;

  return found ? { id: found.id, name: found.name ?? 'a payment', date: found.paidOn ?? '' } : null;
};

const rememberPayer = async (scope: Awaited<ReturnType<typeof resolveScope>>, rentalId: string, name: string) => {
  const payer = name.trim().slice(0, 80);
  const client = appClient();
  const { rentals } = await client.query({ rentals: { __args: { filter: { id: { eq: rentalId } }, first: 1 }, edges: { node: { id: true, payerNames: true, property: { ownerId: true } } } } } as never) as {
    rentals?: { edges?: Array<{ node: { id: string; payerNames?: string | null; property?: { ownerId?: string | null } | null } }> };
  };
  const rental = rentals?.edges?.[0]?.node;

  if (!rental || !payer) return fail('Nothing to remember.');
  if (!scope.all && !(rental.property?.ownerId && scope.ownerIds.has(rental.property.ownerId))) return fail("You don't have access to this contract.");
  const names = (rental.payerNames ?? '').split('\n').map((n) => n.trim()).filter(Boolean);

  if (!names.some((n) => n.toUpperCase() === payer.toUpperCase())) {
    await client.mutation({ updateRental: { __args: { id: rental.id, data: { payerNames: [...names, payer].slice(-10).join('\n') } as never }, id: true } });
  }

  return json({ success: true });
};

const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as { kind?: string; action?: string; rentalId?: string; name?: string; file?: { name?: string; type?: string; data?: string } };
  const scope = await resolveScope(appClient(), context?.workspaceMemberId);

  if (!scope.all && !scope.ownerIds.size) return fail("You don't have access to any business.");
  // After a scanned rent payment is saved: remember who paid, so next month matches by name.
  if (body.action === 'rememberPayer') return rememberPayer(scope, String(body.rentalId ?? ''), String(body.name ?? ''));
  const transfer = body.kind === 'transfer';
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (!openRouterKey && !apiKey) {
    return fail('Scanning is not set up yet: an admin needs to add an OpenRouter key (OPENROUTER_API_KEY) in Settings → Apps → Rental.');
  }
  const type = String(body.file?.type ?? '').toLowerCase();
  const data = String(body.file?.data ?? '');
  const bytes = Math.floor((data.length * 3) / 4);
  const isPdf = type === 'application/pdf';

  if (!data) return fail('Take a photo or pick a file first.');
  if (!isPdf && !IMAGE_TYPES.includes(type)) return fail('Use a photo (JPG or PNG) or a PDF. iPhone HEIC photos: take the photo from here instead.');
  if (bytes > (isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES)) return fail('That file is too big to read. Take the photo again a bit further away.');

  // The same file twice is caught before any reading cost.
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 16);
  if (transfer) {
    const paid = await paymentWithNote(`scan:${hash}`);

    if (paid) return json({ success: true, duplicate: paid, hash });
  } else {
    const seen = await appClient().query({
      expenses: { __args: { filter: { notes: { like: `%scan:${hash}%` } }, first: 1 }, edges: { node: { id: true, name: true, expenseDate: true } } },
    });
    const previous = seen.expenses?.edges?.[0]?.node;

    if (previous) {
      return json({ success: true, duplicate: { id: previous.id, name: previous.name ?? '', date: previous.expenseDate ?? '' }, hash });
    }
  }

  const prompt = (transfer ? TRANSFER_PROMPT : PROMPT).replace('{TODAY}', todayIso());
  const schema = transfer ? TRANSFER_SCHEMA : SCHEMA;

  try {
    const read = openRouterKey ? await readWithOpenRouter(openRouterKey, isPdf, type, data, prompt, schema) : await readWithAnthropic(apiKey as string, isPdf, type, data, prompt, schema);

    if ('refused' in read) return fail('This file could not be read. Fill in the form by hand.');
    if ('problem' in read) return fail(read.problem);
    if (transfer) {
      const t = read.scan as TransferScan;

      if (!['SUCCESSFUL', 'PENDING', 'FAILED', 'UNKNOWN'].includes(t.status)) t.status = 'UNKNOWN';
      if (t.date && !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) t.date = null;
      if (t.amount !== null && !(t.amount > 0)) t.amount = null;
      if (t.payerAccountLast4) t.payerAccountLast4 = t.payerAccountLast4.replace(/\D/g, '').slice(-4) || null;
      // The same transfer sent twice (a screenshot and a PDF): same bank reference.
      const sameRef = t.referenceNo ? await paymentWithNote(`ref:${t.referenceNo.trim()}`) : null;

      return json({ success: true, transfer: t, hash, ...(sameRef ? { duplicate: sameRef } : {}) });
    }
    const scan = read.scan as ReceiptScan;

    // Only values the form knows; anything else is left for the person to pick.
    if (scan.method && !SCAN_METHODS.includes(scan.method)) scan.method = null;
    if (scan.category && !EXPENSE_CATEGORIES.some((c) => c.value === scan.category)) scan.category = null;
    if (scan.date && !/^\d{4}-\d{2}-\d{2}$/.test(scan.date)) scan.date = null;
    if (scan.total !== null && !(scan.total > 0)) scan.total = null;

    return json({ success: true, scan, hash });
  } catch (error) {
    console.error('[rental] scan failed:', error);
    if (error instanceof SyntaxError) return fail('Could not read this one. Try a clearer photo, or fill in by hand.');
    if (error instanceof Anthropic.AuthenticationError) return fail('The Claude API key is not valid. An admin can fix it in Settings → Apps → Rental.');
    if (error instanceof Anthropic.RateLimitError) return fail('Too many scans at once. Wait a minute and try again.');
    if (error instanceof Anthropic.APIConnectionError) return fail('Could not reach the reading service. Check the connection and try again.');
    if (error instanceof Anthropic.APIError) return fail(`The reading service had a problem (${error.status ?? 'error'}). Try again, or fill in by hand.`);

    return fail('Could not read this one. Try a clearer photo, or fill in by hand.');
  }
};

export default defineLogicFunction({
  universalIdentifier: SCAN_ROUTE_FUNCTION_ID,
  name: 'scan-route',
  description: 'Reads a receipt / bill (for Expenses) or a bank transfer receipt (for rent) with Claude and returns the fields to check.',
  timeoutSeconds: 120,
  handler,
  httpRouteTriggerSettings: { path: '/scan', httpMethod: 'POST', isAuthRequired: true },
});
