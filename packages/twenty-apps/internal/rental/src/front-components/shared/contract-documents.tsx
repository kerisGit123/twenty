import { type CSSProperties, type SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { enqueueSnackbar } from 'twenty-sdk/front-component';

import { FileDrop, type PickedFile, uploadFile } from 'src/front-components/shared/file-drop';
import { FileViewer, type ViewerFile } from 'src/front-components/shared/file-viewer';
import { todayIso } from 'src/logic-functions/utils/dates';
import { type ContractCard } from 'src/shared/contracts';
import {
  CONTRACT_CHECKLIST,
  CONTRACT_DOC_TYPES,
  type ContractDoc,
  docType,
  formatBytes,
  guessDocType,
  isImage,
} from 'src/shared/documents';

// A contract's paperwork: what's on file against a checklist (agreement,
// stamp certificate, tenant IC, inventory, move-in photos), drop files to add
// them, and see, rename, retype or remove what's there.

const c = {
  font: 'var(--t-font-family)',
  text: 'var(--t-font-color-primary)',
  text2: 'var(--t-font-color-secondary)',
  text3: 'var(--t-font-color-tertiary)',
  bg: 'var(--t-background-primary)',
  bg2: 'var(--t-background-secondary)',
  border: 'var(--t-border-color-light)',
  border2: 'var(--t-border-color-medium)',
  accent: 'var(--t-color-blue9)',
  radius: 'var(--t-border-radius-md)',
};

const control: CSSProperties = {
  fontFamily: c.font,
  fontSize: 13,
  color: c.text,
  background: c.bg,
  border: `1px solid ${c.border2}`,
  borderRadius: c.radius,
  height: 32,
  padding: '0 10px',
  boxSizing: 'border-box',
  minWidth: 0,
};

const button = (primary = false): CSSProperties => ({
  ...control,
  cursor: 'pointer',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  ...(primary ? { background: c.accent, color: '#fff', border: `1px solid ${c.accent}` } : {}),
});

const chip = (active: boolean): CSSProperties => ({
  fontFamily: c.font,
  fontSize: 12.5,
  fontWeight: 500,
  height: 30,
  padding: '0 10px',
  borderRadius: 15,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  background: active ? 'var(--t-color-blue3)' : c.bg,
  color: active ? 'var(--t-color-blue11)' : c.text,
  border: `1px solid ${active ? 'var(--t-color-blue7)' : c.border2}`,
});

const readValue = (event: SyntheticEvent<HTMLElement>): string => {
  const object = event as unknown as { detail?: { value?: string }; target?: { value?: string } };

  return object.detail?.value ?? object.target?.value ?? '';
};

const post = <T,>(body: Record<string, unknown>) => new RestApiClient().post<T & { success: boolean; message?: string }>('/s/files', body);

type QueueItem = { key: string; file: PickedFile; type: string; state: 'waiting' | 'uploading' | 'done' | 'failed'; message?: string };

// Types whose files are added to the existing document of that type
// (photos, IC pages, the agreement's pages); others start a new document.
const APPENDS = ['AGREEMENT', 'STAMP_DUTY', 'ID', 'HANDOVER', 'MOVE_IN', 'MOVE_OUT'];

export const ContractDocumentsPanel = ({
  contract,
  initialFiles,
  onClose,
  onChanged,
}: {
  contract: ContractCard;
  initialFiles?: PickedFile[];
  onClose: () => void;
  onChanged: () => void;
}) => {
  const [own, setOwn] = useState<ContractDoc[]>([]);
  const [carried, setCarried] = useState<ContractDoc[]>([]);
  const [property, setProperty] = useState<ContractDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadAs, setUploadAs] = useState('AUTO');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [stampDate, setStampDate] = useState(todayIso());
  const [stampedNow, setStampedNow] = useState(Boolean(contract.stampedOn));
  const started = useRef(false);
  const [viewing, setViewing] = useState<{ files: ViewerFile[]; start: number; title: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await post<{ own?: ContractDoc[]; carried?: ContractDoc[]; property?: ContractDoc[] }>({ action: 'contractDocs', rentalId: contract.id });

      if (!result.success) throw new Error(result.message ?? 'Could not load documents.');
      setOwn(result.own ?? []);
      setCarried(result.carried ?? []);
      setProperty(result.property ?? []);
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not load documents.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [contract.id]);

  useEffect(() => {
    load();
  }, [load]);

  const onFile = useMemo(() => new Set([...own, ...carried].filter((d) => d.files.length > 0).map((d) => d.type)), [own, carried]);
  const missing = CONTRACT_CHECKLIST.filter((item) => item.required && !onFile.has(item.type));

  // Upload one by one; files of one type in a batch go into one document.
  const enqueue = useCallback(
    async (files: PickedFile[]) => {
      const items: QueueItem[] = files.map((file, index) => ({
        key: `${Date.now()}-${index}-${file.name}`,
        file,
        type: uploadAs === 'AUTO' ? guessDocType(file.name, 'OTHER') : uploadAs,
        state: 'waiting',
      }));

      setQueue((current) => [...current.filter((q) => q.state !== 'done'), ...items]);

      const docFor = new Map<string, string>();

      for (const doc of own) {
        if (APPENDS.includes(doc.type) && !docFor.has(doc.type)) docFor.set(doc.type, doc.id);
      }

      let uploaded = 0;

      for (const item of items) {
        setQueue((current) => current.map((q) => (q.key === item.key ? { ...q, state: 'uploading' } : q)));

        const existing = docFor.get(item.type);
        const result = await uploadFile(
          item.file,
          existing ? { documentId: existing } : { newDocument: { type: item.type, rentalId: contract.id } },
        );

        if (result.success && result.documentId) {
          docFor.set(item.type, result.documentId);
          uploaded += 1;
        }
        setQueue((current) =>
          current.map((q) => (q.key === item.key ? { ...q, state: result.success ? 'done' : 'failed', message: result.message } : q)),
        );
      }

      if (uploaded > 0) {
        await load();
        onChanged();
        await enqueueSnackbar({ message: `Uploaded ${uploaded} file${uploaded === 1 ? '' : 's'}.`, variant: 'success' });
      }
    },
    [uploadAs, own, contract.id, load, onChanged],
  );

  // Files dropped on the contract card open this panel and upload straight away.
  useEffect(() => {
    if (!started.current && initialFiles?.length && !loading) {
      started.current = true;
      enqueue(initialFiles);
    }
  }, [initialFiles, loading, enqueue]);

  const act = async (body: Record<string, unknown>, done?: string) => {
    const result = await post<Record<string, never>>(body);

    if (!result.success) {
      await enqueueSnackbar({ message: result.message ?? 'Could not save.', variant: 'error' });

      return;
    }
    if (done || result.message) await enqueueSnackbar({ message: result.message ?? done ?? 'Saved.', variant: 'success' });
    await load();
    onChanged();
  };

  const markStamped = async () => {
    const result = await new RestApiClient().post<{ success: boolean; message?: string }>('/s/contracts', { action: 'setStamped', rentalId: contract.id, stampedOn: stampDate });

    await enqueueSnackbar({ message: result.message ?? (result.success ? 'Saved.' : 'Could not save.'), variant: result.success ? 'success' : 'error' });
    if (result.success) {
      setStampedNow(true);
      onChanged();
    }
  };

  const fileTile = (doc: ContractDoc, file: ContractDoc['files'][number], removable: boolean, index: number) => (
    <div key={file.fileId} style={{ position: 'relative', width: 84, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button
        onClick={() => setViewing({ files: doc.files, start: index, title: doc.name || docType(doc.type).label })}
        title={`View ${file.label}`}
        style={{
          padding: 0,
          cursor: 'pointer',
          width: 84,
          height: 84,
          borderRadius: 10,
          border: `1px solid ${c.border}`,
          background: c.bg2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          textDecoration: 'none',
          fontSize: 26,
        }}
      >
        {isImage(file.extension) ? <img src={file.url} alt={file.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : file.extension === 'pdf' ? '📕' : '📄'}
      </button>
      <span style={{ fontSize: 11, color: c.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.label}</span>
      {removable && (
        <button
          onClick={() => act({ action: 'removeFile', documentId: doc.id, fileId: file.fileId }, 'File removed.')}
          title="Remove this file"
          style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: '22px', padding: 0 }}
        >
          ×
        </button>
      )}
    </div>
  );

  const docCard = (doc: ContractDoc, mode: 'own' | 'carried' | 'property') => {
    const type = docType(doc.type);

    return (
      <div key={doc.id} style={{ border: `1px solid ${c.border}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18 }}>{type.icon}</span>
          {editing === doc.id ? (
            <input
              value={editName}
              onChange={(e) => setEditName(readValue(e))}
              style={{ ...control, flex: '1 1 160px' }}
            />
          ) : (
            <span style={{ flex: '1 1 160px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name || type.label}</span>
              <span style={{ fontSize: 12, color: c.text3 }}>
                {type.label} · {doc.files.length} file{doc.files.length === 1 ? '' : 's'}
                {mode === 'carried' ? ' · from the previous contract' : ''}
              </span>
            </span>
          )}
          {mode === 'own' &&
            (editing === doc.id ? (
              <>
                <button onClick={() => setEditing(null)} style={button()}>
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await act({ action: 'update', documentId: doc.id, name: editName });
                    setEditing(null);
                  }}
                  style={button(true)}
                >
                  Save
                </button>
              </>
            ) : (
              <>
                <select value={doc.type} onChange={(e) => act({ action: 'update', documentId: doc.id, type: readValue(e) })} style={{ ...control, width: 'auto' }} title="Type">
                  {CONTRACT_DOC_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {docType(value).label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    setEditing(doc.id);
                    setEditName(doc.name);
                  }}
                  style={button()}
                  title="Rename"
                >
                  ✎
                </button>
                <button onClick={() => act({ action: 'delete', documentId: doc.id })} style={{ ...button(), color: 'var(--t-color-red11)' }} title="Delete document">
                  🗑
                </button>
              </>
            ))}
          {mode === 'property' && (
            <button onClick={() => act({ action: 'link', documentId: doc.id, rentalId: contract.id }, 'Added to this contract.')} style={button()}>
              Add to contract
            </button>
          )}
        </div>
        {doc.files.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>{doc.files.map((file, index) => fileTile(doc, file, mode === 'own', index))}</div>
        ) : (
          <span style={{ fontSize: 12.5, color: c.text3 }}>No files yet.</span>
        )}
      </div>
    );
  };

  const groups = CONTRACT_DOC_TYPES.map((type) => ({ type, docs: own.filter((d) => d.type === type) })).concat(
    own.filter((d) => !CONTRACT_DOC_TYPES.includes(d.type)).length ? [{ type: 'MORE', docs: own.filter((d) => !CONTRACT_DOC_TYPES.includes(d.type)) }] : [],
  );
  const busy = queue.some((q) => q.state === 'uploading' || q.state === 'waiting');

  return (
    <div style={{ height: '100%', background: c.bg, display: 'flex', flexDirection: 'column', fontFamily: c.font, color: c.text, position: 'relative' }}>
      {viewing && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 5 }}>
          <FileViewer files={viewing.files} start={viewing.start} title={viewing.title} onClose={() => setViewing(null)} />
        </div>
      )}
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 650, fontSize: 16 }}>Documents</div>
          <div style={{ fontSize: 13, color: c.text3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {contract.propertyName} · {contract.tenantName}
          </div>
        </div>
        <button onClick={onClose} style={{ ...button(), width: 32, height: 32, padding: 0, border: 'none', fontSize: 18, background: 'transparent' }} aria-label="Close">
          ×
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Checklist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>On file</span>
            <span style={{ fontSize: 12.5, color: missing.length ? 'var(--t-color-amber11)' : 'var(--t-color-green11)' }}>
              {loading ? '' : missing.length ? `${missing.length} missing` : 'All required documents ✓'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CONTRACT_CHECKLIST.map((item) => {
              const has = onFile.has(item.type);

              return (
                <button
                  key={item.type}
                  onClick={() => setUploadAs(item.type)}
                  title={has ? 'On file — tap to add more of this type' : 'Tap, then drop the file below'}
                  style={{
                    ...chip(uploadAs === item.type),
                    ...(has ? {} : uploadAs === item.type ? {} : { borderStyle: 'dashed', color: item.required ? 'var(--t-color-amber11)' : c.text3 }),
                  }}
                >
                  {has ? '✓' : item.required ? '!' : '○'} {docType(item.type).label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Stamped? */}
        {onFile.has('STAMP_DUTY') && !stampedNow && (
          <div style={{ background: 'var(--t-color-orange2)', border: '1px solid var(--t-color-orange6)', borderRadius: 10, padding: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
            <span style={{ flex: '1 1 180px' }}>Stamp certificate on file — mark the agreement as stamped?</span>
            <input type="date" value={stampDate} onChange={(e) => { const v = readValue(e); if (v) setStampDate(v); }} style={control} />
            <button onClick={markStamped} style={button(true)}>
              Mark stamped
            </button>
          </div>
        )}

        {/* Add */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            <span style={{ fontSize: 12, color: c.text3, alignSelf: 'center', flexShrink: 0 }}>Upload as</span>
            <button onClick={() => setUploadAs('AUTO')} style={chip(uploadAs === 'AUTO')}>
              ✨ Auto (from file name)
            </button>
            {CONTRACT_DOC_TYPES.map((value) => (
              <button key={value} onClick={() => setUploadAs(value)} style={chip(uploadAs === value)}>
                {docType(value).icon} {docType(value).label}
              </button>
            ))}
          </div>
          <FileDrop
            onFiles={enqueue}
            title={uploadAs === 'AUTO' ? 'Drop documents here' : `Drop ${docType(uploadAs).label.toLowerCase()} here`}
            hint="or tap to choose files / take a photo — PDF or photos, up to 20 MB each"
          />
          {queue.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {queue.map((q) => (
                <div key={q.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                  <span style={{ width: 18 }}>{q.state === 'done' ? '✅' : q.state === 'failed' ? '⚠️' : q.state === 'uploading' ? '⏳' : '·'}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: q.state === 'failed' ? 'var(--t-color-red11)' : c.text2 }}>
                    {q.state === 'failed' ? q.message ?? q.file.name : `${q.file.name} · ${formatBytes(q.file.size)} → ${docType(q.type).label}`}
                  </span>
                </div>
              ))}
              {!busy && (
                <button onClick={() => setQueue([])} style={{ all: 'unset', cursor: 'pointer', fontSize: 12, color: c.text3, textDecoration: 'underline', alignSelf: 'flex-start' }}>
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* On this contract, by type */}
        {loading ? (
          <div style={{ fontSize: 13, color: c.text3 }}>Loading…</div>
        ) : own.length === 0 ? (
          <div style={{ fontSize: 13, color: c.text3 }}>Nothing filed on this contract yet.</div>
        ) : (
          groups.filter((g) => g.docs.length).map((g) => <div key={g.type} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{g.docs.map((doc) => docCard(doc, 'own'))}</div>)
        )}

        {carried.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>From the previous contract</span>
            {carried.map((doc) => docCard(doc, 'carried'))}
          </div>
        )}

        {property.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>On the property, not on a contract</span>
            {property.map((doc) => docCard(doc, 'property'))}
          </div>
        )}
      </div>
    </div>
  );
};
