import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { CAMPAIGN_SHARE_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v4';
import { loadReceiptSettings } from 'src/logic-functions/handlers/send-receipt-handler';
import { letterheadExtras } from 'src/logic-functions/utils/receipt-settings';
import { appClient } from 'src/logic-functions/utils/app-client';
import { inScope, resolveScope } from 'src/logic-functions/utils/scope';
import { buildSmartRecipients, type SmartRecipient } from 'src/logic-functions/utils/smart-audience';
import { loadStatementSource } from 'src/logic-functions/utils/statement-data';
import { buildTemplatePdf } from 'src/logic-functions/utils/template-pdf';
import { pickTemplate } from 'src/logic-functions/utils/templates';
import { DEFAULT_SOURCE_OPTIONS, isVideo, type Language, messageFor, type SourceOptions } from 'src/shared/campaigns';
import { statementContext } from 'src/shared/doc-template/context';
import { byLanguage } from 'src/shared/doc-template/types';
import { toE164 } from 'src/shared/whatsapp-link';

// GET /s/campaigns/share?id=<campaign>[&person=<person> | &key=<row>][&lang=EN|MS|ZH]
// (key: one row of a rent & receipts campaign — its values and its receipt or
// statement PDF come with it)
// A campaign's photos / video with its message, ready to send from WhatsApp:
// on a phone "Share" attaches everything (pick WhatsApp, then the person or a
// broadcast list); on a computer copy the photo, open the chat and paste.
// Links can only carry text, which is why media goes this way.

const MAX_EMBED_BYTES = 20 * 1024 * 1024;

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

const html = (body: string, status = 200) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><body style="font-family:sans-serif;padding:24px">${body}</body>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  '3gp': 'video/3gpp',
  pdf: 'application/pdf',
};

const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const query = event.queryStringParameters ?? {};

  if (!query.id) return html('<p>Pick a campaign.</p>', 400);

  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);
    const { campaigns } = (await client.query({
      campaigns: {
        __args: { filter: { id: { eq: query.id } }, first: 1 },
        edges: {
          node: {
            id: true,
            name: true,
            ownerId: true,
            messageEn: true,
            messageMs: true,
            messageZh: true,
            media: { label: true, url: true, extension: true },
            source: true,
            sourceOptions: true,
            progress: true,
          },
        },
      },
    } as never)) as {
      campaigns?: {
        edges?: Array<{
          node: {
            id: string;
            name?: string;
            ownerId?: string | null;
            messageEn?: string | null;
            messageMs?: string | null;
            messageZh?: string | null;
            media?: Array<{ label?: string; url?: string; extension?: string | null }> | null;
            source?: string | null;
            sourceOptions?: SourceOptions | null;
            progress?: { sent?: Record<string, string>; skipped?: Record<string, string> } | null;
          };
        }>;
      };
    };
    const campaign = campaigns?.edges?.[0]?.node;

    if (!campaign) return html('<p>Campaign not found.</p>', 404);
    if (!inScope(scope, campaign.ownerId ?? null)) return html("<p>You don't have access to this campaign.</p>", 403);

    // The person (or everyone, for a broadcast list or group).
    let person: { name: string; firstName: string; phone: string | null; language: Language } | null = null;
    let row: SmartRecipient | undefined;

    if (query.key && campaign.source && campaign.source !== 'NONE') {
      const handled = new Set([query.key, ...Object.keys(campaign.progress?.sent ?? {}), ...Object.keys(campaign.progress?.skipped ?? {})]);
      const rows = await buildSmartRecipients(client, scope, campaign.source, { ...DEFAULT_SOURCE_OPTIONS, ...(campaign.sourceOptions ?? {}) }, handled);

      row = rows.find((x) => x.key === query.key);
      if (!row) return html('<p>This message isn’t due any more — it may have been paid or sent already.</p>', 404);
      person = { name: row.name, firstName: row.firstName, phone: row.phone, language: row.language };
    } else if (query.person || query.key) {
      // A one-person send: the send panel passes the person as key.
      const personId = (query.person ?? query.key) as string;
      const { people } = (await client.query({
        people: {
          __args: { filter: { id: { eq: personId } }, first: 1 },
          edges: { node: { name: { firstName: true, lastName: true }, phones: { primaryPhoneNumber: true, primaryPhoneCallingCode: true }, language: true } },
        },
      } as never)) as { people?: { edges?: Array<{ node: { name?: { firstName?: string; lastName?: string }; phones?: never; language?: string | null } }> } };
      const node = people?.edges?.[0]?.node;

      if (node) {
        const first = node.name?.firstName?.trim() ?? '';

        person = {
          name: [first, node.name?.lastName?.trim()].filter(Boolean).join(' ') || 'them',
          firstName: first,
          phone: toE164(node.phones ?? null),
          language: node.language === 'MS' || node.language === 'ZH' ? node.language : 'EN',
        };
      }
    }

    const language: Language = query.lang === 'MS' || query.lang === 'ZH' || query.lang === 'EN' ? query.lang : person?.language ?? 'EN';
    const messages = { EN: campaign.messageEn ?? '', MS: campaign.messageMs ?? '', ZH: campaign.messageZh ?? '' };
    let text = messageFor(messages, language, person?.firstName ?? '', row?.values ?? {});

    if (!person) text = text.replace(/^Hi,?\s*/, 'Hi all, ').replace(/^Salam,?\s*/, 'Salam semua, ').replace(/^，/, '各位，');

    // The media, embedded so the page can share it as files.
    const files: Array<{ name: string; type: string; data: string; video: boolean }> = [];

    for (const media of campaign.media ?? []) {
      if (!media?.url) continue;

      const url = new URL(media.url);
      const response = await fetch(`${process.env.TWENTY_API_URL}${url.pathname}${url.search}`);

      if (!response.ok) continue;

      const bytes = new Uint8Array(await response.arrayBuffer());

      if (bytes.byteLength > MAX_EMBED_BYTES) continue;

      const extension = (media.extension ?? '').replace(/^\./, '').toLowerCase() || (media.label?.split('.').pop() ?? '').toLowerCase();

      files.push({
        name: media.label || `media.${extension || 'bin'}`,
        type: MIME[extension] ?? response.headers.get('content-type') ?? 'application/octet-stream',
        data: Buffer.from(bytes).toString('base64'),
        video: isVideo(extension),
      });
    }

    // A rent & receipts row brings its own PDF.
    const addFile = async (url: string, name: string) => {
      const parsed = new URL(url);
      const response = await fetch(`${process.env.TWENTY_API_URL}${parsed.pathname}${parsed.search}`);

      if (response.ok) files.unshift({ name, type: 'application/pdf', data: Buffer.from(await response.arrayBuffer()).toString('base64'), video: false });
    };

    if (row?.attachment?.kind === 'receipt') {
      const { rentPayments } = (await client.query({
        rentPayments: { __args: { filter: { id: { eq: row.attachment.paymentId } }, first: 1 }, edges: { node: { receiptNumber: true, receiptFile: { url: true } } } },
      } as never)) as { rentPayments?: { edges?: Array<{ node: { receiptNumber?: string | null; receiptFile?: Array<{ url?: string | null }> | null } }> } };
      const payment = rentPayments?.edges?.[0]?.node;
      const url = payment?.receiptFile?.[0]?.url;

      if (url) await addFile(url, `${payment?.receiptNumber ?? 'Receipt'}.pdf`);
    }

    if (row?.attachment?.kind === 'statement') {
      const { rentalId, year } = row.attachment;
      const [statement, template, settings] = await Promise.all([loadStatementSource(client, scope, rentalId, year), pickTemplate(client, 'STATEMENT'), loadReceiptSettings(client)]);

      if (statement) {
        const ctx = statementContext(statement, template.language, (settings?.accentColor as string | null) ?? 'BLACK', letterheadExtras(settings));
        const title = `${byLanguage(template.language, 'Rent statement', 'Penyata sewa', '租金结单')} ${year} - ${ctx.values['tenant.name'] || 'tenant'}`;
        const pdf = await buildTemplatePdf(template, ctx, title);

        files.unshift({ name: `${title.replace(/[\\/:*?"<>|]+/g, '').trim()}.pdf`, type: 'application/pdf', data: Buffer.from(pdf).toString('base64'), video: false });
      }
    }
    // Rent reminders carry your DuitNow QR, so the tenant can scan and pay.
    if (campaign.source === 'RENT_DUE' && row) {
      const settings = await loadReceiptSettings(client);

      // An extra: the page still opens if the QR can't be fetched.
      try {
        if (settings?.paymentQrUrl) {
          const parsed = new URL(settings.paymentQrUrl);
          const response = await fetch(`${process.env.TWENTY_API_URL}${parsed.pathname}${parsed.search}`);
          const type = response.headers.get('content-type') ?? '';

          if (response.ok && type.startsWith('image/')) {
            files.push({ name: `DuitNow QR.${type.includes('png') ? 'png' : 'jpg'}`, type, data: Buffer.from(await response.arrayBuffer()).toString('base64'), video: false });
          }
        }
      } catch (error) {
        console.warn('[rental] could not add the DuitNow QR:', error);
      }
    }
    const onlyPdf = files.length > 0 && files.every((f) => f.type === 'application/pdf');

    const waChat = person?.phone ? `https://wa.me/${person.phone.replace(/^\+/, '')}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
    const title = person ? `Send to ${person.name}` : 'Share to a broadcast list or group';

    const page = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(campaign.name ?? 'Campaign')}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; color: #111b21; }
  .wrap { max-width: 560px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
  .card { background: #fff; border-radius: 14px; padding: 14px; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
  h1 { font-size: 18px; margin: 0; } .sub { color: #667781; font-size: 13px; margin-top: 4px; }
  .media { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
  .media img, .media video { width: 100%; border-radius: 10px; background: #000; max-height: 260px; object-fit: cover; }
  textarea { width: 100%; min-height: 140px; border: 1px solid #d1d7db; border-radius: 10px; padding: 10px; font: inherit; font-size: 14px; line-height: 1.45; resize: vertical; background: #dcf8c6; }
  button, a.btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; height: 48px; border: 0; border-radius: 12px; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; text-decoration: none; }
  .wa { background: #25D366; color: #fff; } .plain { background: #fff; color: #111b21; border: 1px solid #d1d7db; }
  .row { display: flex; gap: 8px; } .row > * { flex: 1; }
  .steps { font-size: 13px; color: #3b4a54; line-height: 1.6; margin: 0; padding-left: 18px; }
  .note { font-size: 12px; color: #667781; } .ok { color: #128C7E; font-size: 13px; min-height: 18px; }
  .phone-only, .desktop-only { display: none; }
</style></head><body><div class="wrap">
  <div class="card">
    <h1>${escape(title)}</h1>
    <div class="sub">${escape(campaign.name ?? '')}${person?.phone ? ` · ${escape(person.phone)}` : ''}</div>
  </div>
  ${files.length ? `<div class="card media" id="media"></div>` : ''}
  <div class="card"><textarea id="text">${escape(text)}</textarea><div class="note">You can edit the message before sending.</div></div>

  <div class="card phone-only" id="phone">
    <button class="wa" id="share">📤 Share ${files.length ? (onlyPdf ? 'PDF' : files.some((f) => f.video) ? 'video' : 'photo') + ' + message' : 'message'}</button>
    <p class="note" style="margin:8px 0 0">Pick <b>WhatsApp</b>, then ${person ? `<b>${escape(person.name)}</b>` : 'your broadcast list or group'}. The message is also copied — if it doesn’t appear, paste it.</p>
  </div>

  <div class="card desktop-only" id="desktop">
    <ol class="steps">
      ${onlyPdf ? '<li><b>Download the PDF</b></li>' : files.length ? `<li><b>Copy the ${files.some((f) => !f.video && f.type.startsWith('image/')) ? 'photo' : 'file'}</b> (or download it)</li>` : ''}
      <li><b>Open the chat</b>${person ? '' : ' — pick the broadcast list or group'}</li>
      ${onlyPdf ? '<li>Attach it with 📎 (or drag it into the chat) — the message is already typed — and send</li>' : files.length ? '<li><b>Paste</b> (Ctrl+V) — the message is already typed — and send</li>' : '<li>Press <b>Send</b></li>'}
    </ol>
    <div class="row" style="margin-top:10px">
      ${files.some((f) => f.type.startsWith('image/')) ? '<button class="plain" id="copyImage">📋 Copy photo</button>' : ''}
      ${files.length ? '<button class="plain" id="download">⬇ Download</button>' : ''}
    </div>
    ${files.some((f) => f.type.startsWith('image/'))
      ? `<div style="margin-top:8px"><button class="wa" id="copyAndChat">📋 Copy photo &amp; open chat</button></div>
    <p class="note" style="margin:8px 0 0">In the chat press <b>Ctrl+V</b> — the photo attaches with the message as its caption — then send.</p>
    <div style="margin-top:8px"><a class="btn plain" id="chat" href="${escape(waChat)}" target="_blank" rel="noopener">💬 Open chat only</a></div>`
      : `<div style="margin-top:8px"><a class="btn wa" id="chat" href="${escape(waChat)}" target="_blank" rel="noopener">💬 Open chat with the message</a></div>`}
  </div>

  <div class="row">
    <button class="plain" id="copyText">📋 Copy message</button>
    <button class="plain" onclick="window.close()">Done</button>
  </div>
  <div class="ok" id="status"></div>
</div>
<script>
  const files = ${JSON.stringify(files.map((f) => ({ name: f.name, type: f.type, video: f.video })))};
  const data = ${JSON.stringify(files.map((f) => f.data))};
  const status = (t) => { document.getElementById('status').textContent = t; };
  const blobs = data.map((d, i) => new Blob([Uint8Array.from(atob(d), (c) => c.charCodeAt(0))], { type: files[i].type }));
  const fileObjects = blobs.map((b, i) => new File([b], files[i].name, { type: files[i].type }));
  const media = document.getElementById('media');
  blobs.forEach((b, i) => {
    const url = URL.createObjectURL(b);
    const el = files[i].type.startsWith('video/') ? document.createElement('video') : files[i].type.startsWith('image/') ? document.createElement('img') : document.createElement('div');
    if (el.tagName === 'VIDEO') { el.controls = true; el.playsInline = true; }
    if (el.tagName === 'DIV') { el.textContent = '📄 ' + files[i].name; el.style.cssText = 'padding:20px;background:#eee;border-radius:10px;font-size:13px'; } else { el.src = url; }
    media && media.appendChild(el);
  });
  const text = () => document.getElementById('text').value;
  const canShareFiles = !!(navigator.canShare && (fileObjects.length === 0 ? navigator.share : navigator.canShare({ files: fileObjects })));
  const touch = matchMedia('(pointer: coarse)').matches;
  // Phones (and anything that can share files) get Share; computers get copy & paste.
  document.getElementById(canShareFiles && touch ? 'phone' : 'desktop').style.display = 'block';
  if (canShareFiles && !touch) document.getElementById('phone').style.display = 'block';

  const copyText = async () => { try { await navigator.clipboard.writeText(text()); return true; } catch (e) { return false; } };
  document.getElementById('copyText').onclick = async () => status((await copyText()) ? 'Message copied.' : 'Select the text and copy it.');
  const share = document.getElementById('share');
  if (share) share.onclick = async () => {
    await copyText();
    try {
      await navigator.share(fileObjects.length ? { files: fileObjects, text: text() } : { text: text() });
      status('Shared. Tap Done when you’re finished.');
    } catch (e) { if (e && e.name !== 'AbortError') status('Couldn’t open the share menu — use the steps below.'); document.getElementById('desktop').style.display = 'block'; }
  };
  const copyPhoto = async () => {
    const i = files.findIndex((f) => f.type.startsWith('image/'));
    try {
      // The clipboard takes PNG; convert other photos first.
      let png = blobs[i];
      if (files[i].type !== 'image/png') {
        const bitmap = await createImageBitmap(blobs[i]);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        png = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      return true;
    } catch (e) { return false; }
  };
  const copyImage = document.getElementById('copyImage');
  if (copyImage) copyImage.onclick = async () => status((await copyPhoto()) ? 'Photo copied — open the chat and press Ctrl+V.' : 'Couldn’t copy the photo — download it and attach it instead.');
  const copyAndChat = document.getElementById('copyAndChat');
  if (copyAndChat) copyAndChat.onclick = async () => {
    const ok = await copyPhoto();
    window.open(document.getElementById('chat').href, '_blank', 'noopener');
    status(ok ? 'Photo copied — in the chat press Ctrl+V, then send.' : 'Couldn’t copy the photo — download it and attach it in the chat.');
  };
  const download = document.getElementById('download');
  if (download) download.onclick = () => blobs.forEach((b, i) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = files[i].name; a.click(); });
</script>
</body></html>`;

    return new Response(page, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (error) {
    console.error('[rental] campaign share failed:', error);

    return html('<p>Could not open the campaign.</p>', 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: CAMPAIGN_SHARE_ROUTE_FUNCTION_ID,
  name: 'campaign-share-route',
  description: 'A campaign’s photos / video and message, ready to share to WhatsApp.',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/campaigns/share', httpMethod: 'GET', isAuthRequired: true },
});
