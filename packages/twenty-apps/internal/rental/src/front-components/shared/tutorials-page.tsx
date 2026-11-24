import { useEffect, useMemo, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';

import { FileViewer, type ViewerFile } from 'src/front-components/shared/file-viewer';
import { Sheet } from 'src/front-components/shared/sheet';

// Tutorials: short how-to videos for everyone who signs in, grouped by topic.
// Pick one and it plays in the app. The list comes from /s/tutorials.

type Item = { id: string; title: string; section: string; label: string; url: string; extension: string };

const c = {
  font: 'var(--t-font-family)',
  text: 'var(--t-font-color-primary)',
  text3: 'var(--t-font-color-tertiary)',
  bg: 'var(--t-background-primary)',
  border: 'var(--t-border-color-light)',
  radius: 'var(--t-border-radius-md)',
  red: 'var(--t-color-red11)',
};

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const icon = (extension: string) => (['mp4', 'mov', 'webm', 'm4v'].includes(extension) ? '🎬' : extension === 'pdf' ? '📕' : '📄');

export const Tutorials = () => {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState('');
  const [watching, setWatching] = useState<Item | null>(null);

  useEffect(() => {
    new RestApiClient()
      .post<{ success: boolean; message?: string; items?: Item[] }>('/s/tutorials', { action: 'list' })
      .then((result) => {
        if (result.success) setItems(result.items ?? []);
        else setError(result.message ?? 'The tutorials could not be loaded.');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'The tutorials could not be loaded.'));
  }, []);

  const sections = useMemo(() => {
    const groups = new Map<string, Item[]>();

    for (const item of items ?? []) groups.set(item.section, [...(groups.get(item.section) ?? []), item]);

    return [...groups.entries()]
      .sort((a, b) => (a[0] === '' ? -1 : b[0] === '' ? 1 : byName(a[0], b[0])))
      .map(([name, list]) => ({ name, list: list.sort((a, b) => byName(a.title, b.title)) }));
  }, [items]);

  const viewing: ViewerFile[] = watching ? [{ label: watching.label, url: watching.url, extension: watching.extension }] : [];

  return (
    <div style={{ fontFamily: c.font, color: c.text, background: c.bg, height: '100%', overflowY: 'auto', boxSizing: 'border-box', padding: 'clamp(8px, 2vw, 20px)' }}>
      {watching ? (
        <Sheet width={900} onClose={() => setWatching(null)}>
          <FileViewer files={viewing} start={0} title={watching.title} onClose={() => setWatching(null)} />
        </Sheet>
      ) : null}
      <div style={{ maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 650 }}>Tutorials</div>
          <div style={{ fontSize: 13, color: c.text3, marginTop: 2 }}>Short videos on how to use the app. Pick one to watch. Videos marked (BM) are in Bahasa Malaysia.</div>
        </div>
        {error ? <div style={{ color: c.red, fontSize: 14 }}>{error}</div> : null}
        {!items && !error ? <div style={{ color: c.text3, fontSize: 14 }}>Loading…</div> : null}
        {items && items.length === 0 ? <div style={{ color: c.text3, fontSize: 14 }}>No tutorials yet.</div> : null}
        {sections.map(({ name, list }) => (
          <div key={name || '_'} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {name ? <div style={{ fontSize: 13, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>{name.split('/').join(' › ')}</div> : null}
            <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
              {list.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => setWatching(item)}
                  style={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: index ? `1px solid ${c.border}` : 'none' }}
                >
                  <span style={{ fontSize: 22 }}>{icon(item.extension)}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500 }}>{item.title}</span>
                  <span style={{ fontSize: 12, color: c.text3 }}>Watch ▸</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
