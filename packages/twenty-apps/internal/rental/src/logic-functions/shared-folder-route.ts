import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { kv, Response } from 'twenty-sdk/logic-function';

import { SHARED_FOLDER_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { appClient } from 'src/logic-functions/utils/app-client';
import { extensionOf, formatBytes, isShowableImage, isVideoFile } from 'src/shared/documents';
import { type FolderShare, shareIsLive, shareKey } from 'src/shared/folder-shares';

// GET /files/shared?t=<token> — the page a shared Documents folder link opens,
// for anyone with the link (no sign-in). It lists every file in the folder and
// the folders inside it, each with View and Download, and Download all.
//
// The token is the only key: unknown, stopped or expired tokens get a plain
// "this link no longer works" page. File links are made fresh on every visit
// (they carry their own short-lived signature), so an old copy of the page
// stops working on its own.

type FileValue = { fileId?: string; label?: string; url?: string | null; extension?: string | null };
type DocNode = { id: string; name?: string | null; folder?: string | null; files?: FileValue[] | null; fileSizes?: Record<string, number> | null };

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${escape(title)}</title>
<style>
  :root { color-scheme: light dark; --bg:#f6f7f9; --card:#fff; --text:#1f2023; --muted:#6b6f76; --line:#e4e6ea; --accent:#3b6cf6; --accent-text:#fff; }
  @media (prefers-color-scheme: dark) { :root { --bg:#17181b; --card:#212226; --text:#ececee; --muted:#9a9ea6; --line:#33353a; --accent:#6d93ff; --accent-text:#0f1115; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.45 -apple-system, 'Segoe UI', Roboto, sans-serif; }
  main { max-width: 820px; margin: 0 auto; padding: 24px 16px 48px; }
  header { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 18px; }
  header .t { flex: 1 1 260px; min-width: 0; }
  h1 { font-size: 22px; margin: 0; overflow-wrap: anywhere; }
  .sub { color: var(--muted); font-size: 13px; margin-top: 2px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 22px 0 8px; font-weight: 600; }
  .list { background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  .row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-top: 1px solid var(--line); }
  .row:first-child { border-top: none; }
  .icon { width: 40px; height: 40px; border-radius: 10px; background: var(--bg); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; overflow: hidden; }
  .icon img { width: 100%; height: 100%; object-fit: cover; }
  .name { flex: 1; min-width: 0; }
  .name b { display: block; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name span { color: var(--muted); font-size: 12px; }
  a.btn, button.btn { display: inline-flex; align-items: center; height: 34px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--text); text-decoration: none; font: inherit; font-size: 13.5px; cursor: pointer; white-space: nowrap; }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); font-weight: 600; }
  .actions { display: flex; gap: 6px; }
  .msg { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 32px 20px; text-align: center; color: var(--muted); }
  footer { color: var(--muted); font-size: 12px; margin-top: 24px; text-align: center; }
  @media (max-width: 520px) { .row { flex-wrap: wrap; } .actions { width: 100%; } .actions .btn { flex: 1; justify-content: center; } }
</style></head><body><main>${body}</main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );

const gone = () =>
  page(
    'Link not available',
    `<div class="msg"><div style="font-size:34px">🔒</div><p style="font-size:16px;color:inherit;margin:8px 0 4px"><b>This link no longer works.</b></p><p style="margin:0">It may have expired or been stopped. Ask the person who sent it for a new link.</p></div>`,
    404,
  );

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' });
const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

const handler = async (event: RoutePayload): Promise<Response> => {
  const token = String(event.queryStringParameters?.t ?? '').slice(0, 64);

  if (!/^[A-Za-z0-9_-]{16,}$/.test(token)) return gone();

  try {
    const share = await kv.get<FolderShare>(shareKey(token));

    if (!shareIsLive(share)) return gone();
    const live = share as FolderShare;
    const client = appClient();
    const [{ owners }, { documents }] = await Promise.all([
      client.query({ owners: { __args: { filter: { id: { eq: live.ownerId } }, first: 1 }, edges: { node: { id: true, name: true } } } }),
      client.query({
        documents: {
          __args: { filter: { and: [{ ownerId: { eq: live.ownerId } }, { folder: { like: `${live.folder}%` } }] }, first: 500 },
          edges: { node: { id: true, name: true, folder: true, files: { fileId: true, label: true, url: true, extension: true }, fileSizes: true } },
        },
      } as never) as Promise<{ documents?: { edges?: Array<{ node: DocNode }> } }>,
    ]);
    const businessName = owners?.edges?.[0]?.node?.name ?? '';
    const folderName = live.folder.slice(live.folder.lastIndexOf('/') + 1);
    // Exactly this folder and the folders inside it ("Tutorial2" is not inside "Tutorial").
    const docs = (documents?.edges ?? [])
      .map(({ node }) => node)
      .filter((d) => d.folder === live.folder || (d.folder ?? '').startsWith(`${live.folder}/`));
    const groups = new Map<string, Array<{ doc: DocNode; file: FileValue }>>();

    for (const doc of docs) {
      const where = (doc.folder ?? '').slice(live.folder.length + 1); // '' = the shared folder itself

      for (const file of doc.files ?? []) {
        if (!file?.url) continue;
        if (!groups.has(where)) groups.set(where, []);
        groups.get(where)?.push({ doc, file });
      }
    }
    const total = [...groups.values()].reduce((n, list) => n + list.length, 0);
    const sections = [...groups.entries()]
      .sort((a, b) => (a[0] === '' ? -1 : b[0] === '' ? 1 : byName(a[0], b[0])))
      .map(([where, list]) => {
        const rows = list
          .sort((a, b) => byName(a.doc.name ?? a.file.label ?? '', b.doc.name ?? b.file.label ?? ''))
          .map(({ doc, file }) => {
            const label = file.label ?? 'file';
            const extension = (file.extension ?? extensionOf(label)).toLowerCase();
            const url = file.url as string;
            const size = doc.fileSizes?.[file.fileId ?? ''];
            const icon = isShowableImage(extension) ? `<img src="${escape(url)}" alt="" loading="lazy">` : isVideoFile(extension) ? '🎬' : extension === 'pdf' ? '📕' : '📄';
            // PDFs and photos open in the page viewer; videos and the rest open as they are.
            const viewHref = extension === 'pdf' || isShowableImage(extension) ? `view?u=${encodeURIComponent(url)}&name=${encodeURIComponent(label)}` : url;
            const title = (doc.files ?? []).length > 1 ? `${doc.name ?? ''} · ${label}` : doc.name || label;

            return `<div class="row"><div class="icon">${icon}</div><div class="name"><b title="${escape(title)}">${escape(title)}</b><span>${escape(extension.toUpperCase() || 'File')}${size ? ` · ${escape(formatBytes(size))}` : ''}</span></div>
<div class="actions"><a class="btn" href="${escape(viewHref)}" target="_blank" rel="noopener">View</a><button class="btn dl" data-url="${escape(url)}" data-name="${escape(label)}">Download</button></div></div>`;
          })
          .join('');

        return `${where ? `<h2>📁 ${escape(where.split('/').join(' › '))}</h2>` : ''}<div class="list">${rows}</div>`;
      })
      .join('');

    return page(
      `${folderName} — shared files`,
      `<header><div class="t"><h1>📁 ${escape(folderName)}</h1><div class="sub">${escape(businessName ? `Shared by ${businessName}` : 'Shared folder')} · ${total} file${total === 1 ? '' : 's'}${live.expiresAt ? ` · link works until ${escape(day(live.expiresAt))}` : ''}</div></div>
${total > 1 ? '<button class="btn primary" id="all">⬇ Download all</button>' : ''}</header>
${total ? sections : '<div class="msg">This folder is empty right now.</div>'}
<footer>Already have an account? <a href="/" style="color:var(--accent)">Open the app and sign in</a></footer>
<footer>Files open in your browser. On a phone, “Download” saves to your downloads.</footer>
<script>
  // Saves a file with its own name; if the browser refuses (some phones, or storage that
  // blocks it), the file opens instead and can be saved from there.
  async function save(url, name) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    } catch (e) {
      window.open(url, '_blank', 'noopener');
    }
  }
  document.querySelectorAll('button.dl').forEach((b) => b.addEventListener('click', async () => {
    const text = b.textContent; b.textContent = 'Saving…'; b.disabled = true;
    await save(b.dataset.url, b.dataset.name);
    b.textContent = text; b.disabled = false;
  }));
  const all = document.getElementById('all');
  if (all) all.addEventListener('click', async () => {
    all.disabled = true;
    const buttons = [...document.querySelectorAll('button.dl')];
    for (let i = 0; i < buttons.length; i++) {
      all.textContent = 'Saving ' + (i + 1) + ' of ' + buttons.length + '…';
      await save(buttons[i].dataset.url, buttons[i].dataset.name);
      await new Promise((r) => setTimeout(r, 700));
    }
    all.textContent = '⬇ Download all'; all.disabled = false;
  });
</script>`,
    );
  } catch (error) {
    console.error('[rental] shared folder page failed:', error);

    return page('Shared folder', '<div class="msg">This folder couldn’t be opened right now. Try again in a minute.</div>', 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: SHARED_FOLDER_ROUTE_FUNCTION_ID,
  name: 'shared-folder-route',
  description: 'The page a shared Documents folder link opens (anyone with the link).',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/files/shared', httpMethod: 'GET', isAuthRequired: false },
});
