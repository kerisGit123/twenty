import { Response } from 'twenty-sdk/logic-function';

// Routes can only answer with text, so a PDF is sent inside a small page that
// turns it back into a file in the browser: shown full-size, with a download
// button that keeps the file name.
export const pdfPageResponse = (pdf: Uint8Array, fileName: string, title: string) => {
  const base64 = Buffer.from(pdf).toString('base64');
  const escape = (text: string) => text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

  const page = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title>
<style>
  html, body { margin: 0; height: 100%; font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; background: #525659; }
  .bar { display: flex; align-items: center; gap: 12px; padding: 8px 14px; background: #323639; color: #fff; font-size: 13px; }
  .bar span { flex: 1; } .bar a { color: #fff; background: #1a73e8; padding: 6px 12px; border-radius: 6px; text-decoration: none; }
  embed { display: block; width: 100%; height: calc(100% - 44px); border: 0; }
</style></head><body>
<div class="bar"><span>${escape(title)}</span><a id="download" download="${escape(fileName)}">Download PDF</a></div>
<embed id="pdf" type="application/pdf">
<script>
  const bytes = Uint8Array.from(atob('${base64}'), (ch) => ch.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  document.getElementById('pdf').src = url;
  document.getElementById('download').href = url;
</script>
</body></html>`;

  return new Response(page, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};
