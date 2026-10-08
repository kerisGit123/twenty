import { PDFDocument, type PDFPage, rgb } from 'pdf-lib';
import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { DEPOSIT_STATEMENT_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { loadReceiptSettings } from 'src/logic-functions/handlers/send-receipt-handler';
import { loadContractsData } from 'src/logic-functions/page-data/contracts-data';
import { appClient } from 'src/logic-functions/utils/app-client';
import { todayIso } from 'src/logic-functions/utils/dates';
import { pdfPageResponse } from 'src/logic-functions/utils/pdf-page';
import { cleanText, drawText, loadPdfFonts, type TextFont } from 'src/logic-functions/utils/pdf-fonts';
import { resolveScope } from 'src/logic-functions/utils/scope';
import { embedSignature } from 'src/logic-functions/utils/template-pdf';
import { parseDeductions } from 'src/shared/contracts';
import { toE164 } from 'src/shared/whatsapp-link';

// GET /s/contracts/deposit-statement?rental=<id>&lang=EN|MS: the move-out
// deposit statement — what was held, what was deducted and what's refunded —
// as a PDF to share with the tenant.

const MONTHS = {
  EN: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  MS: ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'],
};

const WORDS = {
  EN: {
    title: 'DEPOSIT STATEMENT',
    tenant: 'Tenant',
    property: 'Premises',
    period: 'Tenancy',
    date: 'Date',
    carried: 'Brought forward from previous tenancy',
    security: 'Security deposit received',
    utility: 'Utility deposit received',
    used: 'Rent paid from the deposit',
    held: 'Deposit held',
    deductions: 'Less deductions',
    refund: 'Amount refunded',
    refundedOn: 'Refunded on',
    forfeited: 'The deposit has been fully applied to the deductions above.',
    none: 'No deductions.',
    to: 'to',
    sign: 'Landlord',
  },
  MS: {
    title: 'PENYATA DEPOSIT',
    tenant: 'Penyewa',
    property: 'Premis',
    period: 'Tempoh sewa',
    date: 'Tarikh',
    carried: 'Dibawa dari tempoh sewa sebelumnya',
    security: 'Deposit sekuriti diterima',
    utility: 'Deposit utiliti diterima',
    used: 'Sewa dibayar daripada deposit',
    held: 'Deposit dipegang',
    deductions: 'Tolak potongan',
    refund: 'Jumlah dipulangkan',
    refundedOn: 'Dipulangkan pada',
    forfeited: 'Deposit telah digunakan sepenuhnya untuk potongan di atas.',
    none: 'Tiada potongan.',
    to: 'hingga',
    sign: 'Tuan rumah',
  },
};

const safe = (text: string) => cleanText(text).trim();
const rm = (value: number) => `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const html = (body: string, status = 200) =>
  new Response(`<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:24px">${body}</body>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });

const INK = rgb(0.13, 0.14, 0.17);
const MUTED = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.85, 0.86, 0.88);

const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const query = event.queryStringParameters ?? {};
  const lang = query.lang === 'MS' ? 'MS' : 'EN';
  const w = WORDS[lang];

  if (!query.rental) return html('<p>Pick a contract.</p>', 400);

  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);
    const [data, settings] = await Promise.all([loadContractsData(client, scope), loadReceiptSettings(client)]);
    const contract = data.contracts.find((c) => c.id === query.rental);

    if (!contract) return html("<p>You don't have access to this contract.</p>", 403);

    const d = contract.deposit;
    const day = (iso: string | null) => (iso ? `${Number(iso.slice(8, 10))} ${MONTHS[lang][Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '-');
    const deductions = parseDeductions(d.notes);
    const held = d.carriedIn + d.received + d.utilityReceived - d.usedForRent;
    const settled = ['PARTLY_REFUNDED', 'REFUNDED', 'FORFEITED'].includes(d.status);
    const refund = settled ? d.refunded : held - deductions.reduce((sum, x) => sum + x.amount, 0);

    // ---- draw
    const doc = await PDFDocument.create();
    const page: PDFPage = doc.addPage([595.28, 841.89]);
    // Names and addresses in any script.
    const { regular, bold } = await loadPdfFonts(doc, JSON.stringify(contract) + JSON.stringify(settings ?? {}));
    const left = 56;
    const right = 595.28 - 56;
    let y = 790;
    const text = (value: string, x: number, size = 10.5, font: TextFont = regular, color = INK) => drawText(page, safe(value), { x, y, size, font, color });
    const textRight = (value: string, size = 10.5, font: TextFont = regular, color = INK) =>
      drawText(page, safe(value), { x: right - font.widthOfTextAtSize(safe(value), size), y, size, font, color });
    const rule = (thick = 0.6, color = LINE) => page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: thick, color });

    const landlord = settings?.businessName?.trim() || '';

    if (landlord) {
      text(landlord, left, 15, bold);
      y -= 16;
    }
    for (const line of safe(settings?.businessDetails ?? '').split('\n').filter(Boolean).slice(0, 4)) {
      text(line, left, 9.5, regular, MUTED);
      y -= 12;
    }
    y -= 18;
    text(w.title, left, 17, bold);
    textRight(`${w.date}: ${day(todayIso())}`, 10, regular, MUTED);
    y -= 26;

    const facts: Array<[string, string]> = [
      [w.tenant, contract.tenantDetails.split('\n')[0]?.trim() || contract.tenantName],
      [w.property, contract.propertyName],
      [w.period, `${day(contract.startDate)} ${w.to} ${day(contract.endDate)}`],
    ];

    for (const [label, value] of facts) {
      text(label, left, 10, regular, MUTED);
      text(value, left + 110, 10.5, bold);
      y -= 16;
    }
    y -= 10;
    rule(1, INK);
    y -= 20;

    const row = (label: string, amount: number, opts: { bold?: boolean; minus?: boolean } = {}) => {
      text(label, left, 10.5, opts.bold ? bold : regular);
      textRight(`${opts.minus ? '- ' : ''}${rm(amount)}`, 10.5, opts.bold ? bold : regular);
      y -= 18;
    };

    if (d.carriedIn) row(w.carried, d.carriedIn);
    if (d.received) row(w.security, d.received);
    if (d.utilityReceived) row(w.utility, d.utilityReceived);
    if (d.usedForRent) {
      const months = d.usedMonths.map((m) => `${MONTHS[lang][Number(m.slice(5, 7)) - 1].slice(0, 3)} ${m.slice(0, 4)}`).join(', ');

      row(`${w.used}${months ? ` (${months})` : ''}`, d.usedForRent, { minus: true });
    }
    y += 6;
    rule();
    y -= 16;
    row(w.held, held, { bold: true });
    y -= 6;

    text(w.deductions, left, 10.5, bold);
    y -= 18;
    if (deductions.length === 0) {
      text(w.none, left + 14, 10, regular, MUTED);
      y -= 18;
    }
    for (const x of deductions) row(`   ${x.label}`, x.amount, { minus: true });
    y += 6;
    rule(1, INK);
    y -= 20;
    text(w.refund, left, 13, bold);
    textRight(rm(Math.max(0, refund)), 13, bold);
    y -= 18;
    if (d.refundedOn) {
      text(`${w.refundedOn} ${day(d.refundedOn)}`, left, 10, regular, MUTED);
      y -= 16;
    }
    if (refund <= 0) {
      text(w.forfeited, left, 10, regular, MUTED);
      y -= 16;
    }

    // Signature
    y -= 50;
    const signature = await embedSignature(doc, settings?.signatureUrl);

    if (signature) {
      const scale = Math.min(40 / signature.height, 160 / signature.width);

      page.drawImage(signature, { x: left, y: y + 4, width: signature.width * scale, height: signature.height * scale });
    }
    page.drawLine({ start: { x: left, y }, end: { x: left + 180, y }, thickness: 0.6, color: INK });
    y -= 14;
    text(landlord || w.sign, left, 10, regular, MUTED);

    const pdf = await doc.save();
    const first = contract.tenantName.split(' ')[0] || '';
    const share =
      lang === 'MS'
        ? `Salam ${first}, dilampirkan penyata deposit bagi ${contract.propertyName}. Jumlah dipulangkan: ${rm(Math.max(0, refund))}. Terima kasih.`
        : `Hi ${first}, attached is the deposit statement for ${contract.propertyName}. Amount refunded: ${rm(Math.max(0, refund))}. Thank you.`;
    const title = `${lang === 'MS' ? 'Penyata deposit' : 'Deposit statement'} - ${contract.propertyName}`;

    return pdfPageResponse(pdf, `${title.replace(/[^\w\- ]+/g, '').trim()}.pdf`, title, {
      text: share,
      whatsappTo: toE164(contract.tenantPhone),
    });
  } catch (error) {
    console.error('[rental] deposit statement failed:', error);

    return html('<p>Could not make the deposit statement.</p>', 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: DEPOSIT_STATEMENT_ROUTE_FUNCTION_ID,
  name: 'deposit-statement-route',
  description: 'Move-out deposit statement PDF (held, deductions, refund).',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/contracts/deposit-statement', httpMethod: 'GET', isAuthRequired: true },
});
