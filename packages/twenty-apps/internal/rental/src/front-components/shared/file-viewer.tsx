import { type CSSProperties, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';

import { isImage } from 'src/shared/documents';

// In-app viewer: PDFs (every page) and photos, with previous / next for a
// document's files and a link to open the file on its own. Render inside a
// <Sheet>.

export type ViewerFile = { label: string; url: string; extension: string | null };

const bar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 12px',
  background: '#1f2023',
  color: '#e8e8ea',
  fontFamily: 'var(--t-font-family)',
  fontSize: 13,
};

const darkButton: CSSProperties = {
  fontFamily: 'var(--t-font-family)',
  fontSize: 13,
  height: 32,
  minWidth: 32,
  padding: '0 10px',
  borderRadius: 8,
  border: '1px solid #44464c',
  background: '#2f3136',
  color: '#e8e8ea',
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
  whiteSpace: 'nowrap',
};

export const viewUrl = (file: ViewerFile) => new RestApiClient().resolveUrl('/s/files/view', { query: { u: file.url, name: file.label } });

export const FileViewer = ({ files, start = 0, title, onClose }: { files: ViewerFile[]; start?: number; title?: string; onClose: () => void }) => {
  const [index, setIndex] = useState(Math.min(Math.max(0, start), Math.max(0, files.length - 1)));
  const file = files[index];

  if (!file) return null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#2b2d31' }}>
      <div style={bar}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.label}</span>
          {title && <span style={{ fontSize: 11.5, color: '#a9abb1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>}
        </div>
        {files.length > 1 && (
          <>
            <button onClick={() => setIndex((index - 1 + files.length) % files.length)} style={darkButton} aria-label="Previous">
              ‹
            </button>
            <span style={{ fontSize: 12, color: '#a9abb1', minWidth: 34, textAlign: 'center' }}>
              {index + 1}/{files.length}
            </span>
            <button onClick={() => setIndex((index + 1) % files.length)} style={darkButton} aria-label="Next">
              ›
            </button>
          </>
        )}
        <a href={file.url} target="_blank" rel="noreferrer" style={darkButton} title="Open on its own (download, print, share)">
          ↗
        </a>
        <button onClick={onClose} style={{ ...darkButton, fontSize: 18 }} aria-label="Close">
          ×
        </button>
      </div>

      {isImage(file.extension) && !/heic|heif/.test(file.extension ?? '') ? (
        // Photos show straight away.
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: 8 }}>
          <img key={file.url} src={file.url} alt={file.label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      ) : (
        <>
          {/* PDFs are drawn page by page by the viewer page. */}
          <iframe key={file.url} src={viewUrl(file)} title={file.label} style={{ flex: 1, width: '100%', border: 'none', background: '#2b2d31' }} />
          <div style={{ ...bar, justifyContent: 'center', fontSize: 12, color: '#a9abb1' }}>
            Not showing?
            <a href={viewUrl(file)} target="_blank" rel="noreferrer" style={{ ...darkButton, height: 28 }}>
              Open {file.extension === 'pdf' ? 'PDF' : 'file'} in a new tab
            </a>
          </div>
        </>
      )}

      {files.length > 1 && (
        <div style={{ display: 'flex', gap: 6, padding: 8, overflowX: 'auto', background: '#1f2023' }}>
          {files.map((f, i) => (
            <button
              key={`${f.url}-${i}`}
              onClick={() => setIndex(i)}
              title={f.label}
              style={{
                width: 52,
                height: 52,
                flexShrink: 0,
                padding: 0,
                borderRadius: 6,
                overflow: 'hidden',
                cursor: 'pointer',
                border: i === index ? '2px solid #8ab4f8' : '1px solid #44464c',
                background: '#2f3136',
                color: '#e8e8ea',
                fontSize: 20,
              }}
            >
              {isImage(f.extension) ? <img src={f.url} alt={f.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : f.extension === 'pdf' ? '📕' : '📄'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
