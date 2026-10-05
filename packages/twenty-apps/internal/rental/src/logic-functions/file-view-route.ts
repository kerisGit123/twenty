import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { FILE_VIEW_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';

// GET /s/files/view?u=<file url>&name=<file name>: one stored file as a page
// that can sit inside the app's viewer. PDFs are drawn with pdf.js (browsers
// won't show PDFs inside sandboxed frames); photos are shown as they are.
//
// The file URL already carries its own signed token, which is what grants
// access — this page adds nothing to it. Only this server's /file/ URLs are
// fetched, and always from the server's own address (no fetching elsewhere).

const MAX_BYTES = 25 * 1024 * 1024;

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title>
<style>
  html, body { margin: 0; background: #2b2d31; color: #e8e8ea; font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; }
  .msg { padding: 32px 20px; text-align: center; font-size: 14px; line-height: 1.5; }
  .msg a { color: #8ab4f8; }
  #pages { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 12px; }
  canvas { max-width: 100%; height: auto !important; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.4); border-radius: 2px; }
  .count { position: sticky; top: 0; z-index: 2; text-align: center; font-size: 12px; padding: 6px; background: rgba(43,45,49,.92); }
  img.photo { display: block; max-width: 100%; max-height: 100vh; margin: 0 auto; object-fit: contain; }
</style></head><body>${body}</body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );

const handler = async (event: RoutePayload): Promise<Response> => {
  const query = event.queryStringParameters ?? {};
  const name = (query.name ?? 'file').slice(0, 200);
  let source: URL;

  try {
    source = new URL(query.u ?? '');
  } catch {
    return page('File', '<div class="msg">This file link isn’t valid.</div>', 400);
  }
  if (!source.pathname.startsWith('/file/') || !source.searchParams.get('token')) {
    return page('File', '<div class="msg">This file link isn’t valid.</div>', 400);
  }

  // Always fetch from this server, whatever host the link names.
  const internal = `${process.env.TWENTY_API_URL}${source.pathname}${source.search}`;

  try {
    const response = await fetch(internal);

    if (!response.ok) return page(name, `<div class="msg">The file couldn’t be opened (it may have expired — reload the page and try again).</div>`, 404);

    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const bytes = new Uint8Array(await response.arrayBuffer());

    if (bytes.byteLength > MAX_BYTES) {
      return page(name, `<div class="msg">This file is too big to preview. <a href="${escape(source.toString())}" target="_blank" rel="noopener">Open it</a></div>`);
    }

    const base64 = Buffer.from(bytes).toString('base64');
    const isPdf = type === 'application/pdf' || /\.pdf$/i.test(name);

    if (type.startsWith('image/') && !/heic|heif/.test(type)) {
      return page(name, `<img class="photo" alt="${escape(name)}" src="data:${type};base64,${base64}">`);
    }

    if (!isPdf) {
      return page(
        name,
        `<div class="msg">No preview for this kind of file.<br><a href="${escape(source.toString())}" target="_blank" rel="noopener">Open or download ${escape(name)}</a></div>`,
      );
    }

    return page(
      name,
      `<div class="count" id="count">Loading…</div><div id="pages"></div>
<script>
  // Progress for the app (and for debugging inside the sandboxed frame).
  const report = (step, detail) => { try { parent.postMessage({ rentalViewer: step, detail: detail ? String(detail).slice(0, 300) : undefined }, '*'); } catch (e) {} };
  window.addEventListener('error', (e) => report('error', e.message));
  window.addEventListener('unhandledrejection', (e) => report('error', e.reason && (e.reason.message || e.reason)));
</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
  (async () => {
    const count = document.getElementById('count');
    try {
      // A sandboxed frame can't start a worker from another site, so the
      // worker script is fetched and started from a local (blob) copy.
      const workerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      try {
        const source = await (await fetch(workerUrl)).text();
        pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
      } catch (error) {
        report('worker', error && error.message);
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      }
      const data = Uint8Array.from(atob('${base64}'), (c) => c.charCodeAt(0));
      const pdf = await pdfjsLib.getDocument({
        data,
        // Character maps for Chinese / Japanese / Korean text.
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
        cMapPacked: true,
      }).promise;
      report('opened', pdf.numPages);
      count.textContent = pdf.numPages + (pdf.numPages === 1 ? ' page' : ' pages');
      const holder = document.getElementById('pages');
      const width = Math.min(window.innerWidth - 24, 1000);
      for (let n = 1; n <= pdf.numPages; n++) {
        const p = await pdf.getPage(n);
        const base = p.getViewport({ scale: 1 });
        const scale = (width / base.width) * (window.devicePixelRatio || 1);
        const viewport = p.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = width + 'px';
        holder.appendChild(canvas);
        await p.render({ canvasContext: canvas.getContext('2d'), viewport, intent: 'print' }).promise;
        report('page', n);
      }
      // Lets the app know the preview is ready.
      try { parent.postMessage({ rentalViewer: 'rendered', pages: pdf.numPages }, '*'); } catch (e) {}
    } catch (error) {
      try { parent.postMessage({ rentalViewer: 'failed', reason: String(error && error.message || error) }, '*'); } catch (e) {}
      count.innerHTML = 'Couldn’t show this PDF here. <a style="color:#8ab4f8" href="${escape(source.toString())}" target="_blank" rel="noopener">Open it</a>';
    }
  })();
</script>`,
    );
  } catch (error) {
    console.error('[rental] file view failed:', error);

    return page(name, '<div class="msg">The file couldn’t be opened.</div>', 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: FILE_VIEW_ROUTE_FUNCTION_ID,
  name: 'file-view-route',
  description: 'Shows a stored file (PDF pages or photo) for the in-app viewer.',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/files/view', httpMethod: 'GET', isAuthRequired: false },
});
