import { useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { enqueueSnackbar } from 'twenty-sdk/front-component';

import { filesFromEvent, type PickedFile, uploadFile } from 'src/front-components/shared/file-drop';
import { readValue } from 'src/front-components/shared/read-value';
import { scanFile } from 'src/front-components/shared/scan-photo';
import { DOC_TYPES } from 'src/shared/documents';
import type { DocumentScan } from 'src/shared/scan';

// Records: snap or pick one document; Claude suggests its type, a name, the expiry
// date and the property; the person checks and taps "File it". Nothing is saved before.

type Option = { id: string; name: string; ownerId?: string | null };

const c = {
  font: 'var(--t-font-family)',
  text: 'var(--t-font-color-primary)',
  text2: 'var(--t-font-color-secondary)',
  text3: 'var(--t-font-color-tertiary)',
  border: 'var(--t-border-color-medium)',
  bg: 'var(--t-background-primary)',
  bg2: 'var(--t-background-secondary)',
  blue: 'var(--t-color-blue9)',
};
const field = { fontFamily: c.font, fontSize: 14, height: 40, padding: '0 10px', border: `1px solid ${c.border}`, borderRadius: 8, background: c.bg, color: c.text, boxSizing: 'border-box' as const, width: '100%' };
const btn = (primary = false) => ({
  fontFamily: c.font,
  fontSize: 14,
  fontWeight: 600,
  height: 42,
  padding: '0 16px',
  borderRadius: 10,
  cursor: 'pointer',
  border: `1px solid ${primary ? c.blue : c.border}`,
  background: primary ? c.blue : c.bg,
  color: primary ? 'white' : c.text,
});
const label = { fontSize: 12, color: c.text3 };

// The property whose name shares the most words / unit numbers with what the document says.
const guessProperty = (text: string | null, properties: Option[]) => {
  if (!text) return '';
  const words = (s: string) => new Set(s.toUpperCase().replace(/[^A-Z0-9-/ ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 3 || /\d/.test(w)));
  const wanted = words(text);
  let best = { id: '', hits: 0 };

  for (const p of properties) {
    const hits = [...words(p.name)].filter((w) => wanted.has(w)).length;

    if (hits > best.hits) best = { id: p.id, hits };
  }

  return best.id;
};

export const DocScan = ({ ownerId, properties, onFiled }: { ownerId: string; properties: Option[]; onFiled: () => Promise<void> }) => {
  const [busy, setBusy] = useState<'' | 'reading' | 'filing'>('');
  const [problem, setProblem] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [read, setRead] = useState<DocumentScan | null>(null);
  const [type, setType] = useState('OTHER');
  const [name, setName] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const choices = properties.filter((p) => !ownerId || p.ownerId === ownerId);

  const scan = async (files: PickedFile[]) => {
    const picked = files[0];

    if (!picked || busy) return;
    setBusy('reading');
    setProblem('');
    setRead(null);
    const result = await scanFile<{ success: boolean; message?: string; document?: DocumentScan }>(picked, { kind: 'document' });

    setBusy('');
    if (!result.success || !result.document) {
      setProblem(result.message ?? 'Could not read it. You can still drop it below to file it.');

      return;
    }
    const d = result.document;

    setFile(picked);
    setRead(d);
    setType(d.docType);
    setName(d.title ?? picked.name.replace(/\.[^.]+$/, ''));
    setExpiresOn(d.expiresOn ?? '');
    setPropertyId(guessProperty([d.propertyText, d.title].filter(Boolean).join(' '), choices));
  };

  const fileIt = async () => {
    if (!file || !name.trim()) return;
    setBusy('filing');
    const result = await uploadFile(file, { newDocument: { type, name: name.trim(), ownerId: ownerId || null, propertyId: propertyId || null } });

    if (result.success && result.documentId && expiresOn) {
      try {
        await new RestApiClient().post('/s/files', { action: 'update', documentId: result.documentId, expiresOn });
      } catch {
        // Filed; the expiry can be set on the document.
      }
    }
    setBusy('');
    if (!result.success) {
      setProblem(result.message ?? 'Could not file it. Try again.');

      return;
    }
    await enqueueSnackbar({ message: `Filed: ${name.trim()}${expiresOn ? ` · expires ${expiresOn}` : ''}`, variant: 'success' });
    setRead(null);
    setFile(null);
    await onFiled();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontFamily: c.font, color: c.text }}>
      <label style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, background: busy === 'reading' ? c.bg2 : 'var(--t-color-blue3)', color: 'var(--t-color-blue11)', border: `1px solid ${c.border}`, cursor: busy ? 'default' : 'pointer' }}>
        <span style={{ fontSize: 30, lineHeight: 1 }}>{busy === 'reading' ? '⏳' : '📷'}</span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{busy === 'reading' ? 'Reading the document…' : 'Scan a document'}</span>
          <span style={{ fontSize: 12.5, color: c.text2 }}>
            {busy === 'reading' ? 'A long agreement can take up to a minute. Keep this page open.' : 'Agreement, stamp certificate, IC, insurance, bill: it names it and finds the expiry date'}
          </span>
        </span>
        {!busy && <input type="file" accept="image/*,application/pdf" onChange={(event) => scan(filesFromEvent(event))} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }} />}
      </label>
      {problem && <div style={{ fontSize: 13, padding: '8px 12px', borderRadius: 10, background: 'var(--t-color-red2)', color: 'var(--t-color-red11)' }}>{problem}</div>}

      {read && file && (
        <div style={{ border: `2px solid ${c.blue}`, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 }}>
          <span style={{ fontSize: 13, color: c.text2 }}>{read.summary ?? 'Check the details, then file it.'}</span>
          {read.warning && <div style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, background: 'var(--t-color-amber2)', color: 'var(--t-color-amber11)' }}>Check: {read.warning}</div>}
          <span style={label}>Type</span>
          <select value={type} onChange={(e) => setType(readValue(e))} style={field}>
            {DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
          <span style={label}>Name</span>
          <input value={name} onChange={(e) => setName(readValue(e))} style={field} />
          <span style={label}>Expires / ends {read.expiresOn ? '' : '(not found: leave empty if it never expires)'}</span>
          <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(readValue(e))} style={{ ...field, ...(read.expiresOn ? {} : { borderColor: 'var(--t-color-amber9)' }) }} />
          {choices.length > 0 && (
            <>
              <span style={label}>Property {read.propertyText ? `(the document says: ${read.propertyText})` : ''}</span>
              <select value={propertyId} onChange={(e) => setPropertyId(readValue(e))} style={field}>
                <option value="">No property</option>
                {choices.map((p) => (
                  <option key={p.id} value={p.id}>
                    🏢 {p.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                setRead(null);
                setFile(null);
              }}
              style={{ ...btn(), flex: 1 }}
            >
              Cancel
            </button>
            <button onClick={fileIt} disabled={!!busy || !name.trim()} style={{ ...btn(true), flex: 2, opacity: busy || !name.trim() ? 0.5 : 1 }}>
              {busy === 'filing' ? 'Filing…' : 'File it'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
