import { Response } from 'twenty-sdk/logic-function';

// Routes can only answer with text, so a PDF is sent inside a small page that
// turns it back into a file in the browser: shown full-size, with a download
// button that keeps the file name.
//
// With `share`, the page also offers to send the PDF: "Share" opens the
// phone's (or Windows') share menu with the PDF attached — pick WhatsApp and
// the tenant — and "WhatsApp chat" opens the chat with a message typed in, to
// attach the downloaded file yourself (e.g. WhatsApp Web on a PC).
export const pdfPageResponse = (
  pdf: Uint8Array,
  fileName: string,
  title: string,
  share?: { text: string; whatsappTo?: string | null },
) => {
  const base64 = Buffer.from(pdf).toString('base64');
  const escape = (text: string) => text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);
  const whatsappUrl = share
    ? `https://wa.me/${share.whatsappTo ? share.whatsappTo.replace('+', '') : ''}?text=${encodeURIComponent(share.text)}`
    : '';

  const page = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title>
<style>
  html, body { margin: 0; height: 100%; font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; background: #525659; }
  .bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #323639; color: #fff; font-size: 13px; flex-wrap: wrap; }
  .bar span { flex: 1 1 160px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar a, .bar button { color: #fff; background: #5f6368; padding: 8px 12px; border-radius: 8px; text-decoration: none; border: 0; font: inherit; cursor: pointer; white-space: nowrap; }
  .bar .primary { background: #1a73e8; }
  .bar .whatsapp { background: #25D366; }
  .tip { display: none; padding: 8px 12px; background: #fff8e1; color: #5f4b00; font-size: 13px; }
  embed { display: block; width: 100%; height: calc(100% - 52px); border: 0; }
</style></head><body>
<div class="bar">
  <span>${escape(title)}</span>
  ${share ? '<button id="share" class="primary">Share PDF…</button>' : ''}
  ${share ? `<a class="whatsapp" href="${escape(whatsappUrl)}" target="_blank" rel="noopener">WhatsApp chat</a>` : ''}
  <a id="download" download="${escape(fileName)}">Download PDF</a>
</div>
<div class="tip" id="tip">Sharing files isn’t available here. Download the PDF, then attach it in the WhatsApp chat.</div>
<embed id="pdf" type="application/pdf">
<script>
  const bytes = Uint8Array.from(atob('${base64}'), (ch) => ch.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  document.getElementById('pdf').src = url;
  document.getElementById('download').href = url;
  const shareButton = document.getElementById('share');
  if (shareButton) {
    shareButton.addEventListener('click', async () => {
      const file = new File([blob], ${JSON.stringify(fileName)}, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], text: ${JSON.stringify(share?.text ?? '')}, title: ${JSON.stringify(title)} }); } catch (e) {}
      } else {
        document.getElementById('tip').style.display = 'block';
        document.getElementById('download').click();
      }
    });
  }
</script>
</body></html>`;

  return new Response(page, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};
