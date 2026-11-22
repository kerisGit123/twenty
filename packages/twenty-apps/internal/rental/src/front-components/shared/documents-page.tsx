import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { AppPath, enqueueSnackbar, navigate, openSidePanelPage, SidePanelPages } from 'twenty-sdk/front-component';

import { MONTHS } from 'src/shared/months';
import { readValue } from 'src/front-components/shared/read-value';
import { FileDrop, filesFromEvent, type PickedFile, uploadFile } from 'src/front-components/shared/file-drop';
import { FileViewer, type ViewerFile } from 'src/front-components/shared/file-viewer';
import { useOwnerScope } from 'src/front-components/shared/owner-switcher';
import { Sheet } from 'src/front-components/shared/sheet';
import { todayIso } from 'src/logic-functions/utils/dates';
import { baseOf, DOC_TYPES, docType, EXPIRY_REMIND_DAYS, EXPIRY_WARN_DAYS, formatBytes, guessDocType, inTree, isHeic, isShowableImage, type LibraryDoc, parentOf } from 'src/shared/documents';
import { type FolderShare, SHARE_DAY_CHOICES } from 'src/shared/folder-shares';

// Documents: every paper in your workspaces in one place. Drop a pile of
// files to file them (each becomes a document, typed from its name), find
// them by type, property or expiry, and view them without leaving the app.

type Option = { id: string; name: string; ownerId?: string | null };
type Filter = 'ALL' | 'EXPIRING' | 'NO_FILES' | string; // or a document type
type QueueItem = {
  key: string;
  file: PickedFile;
  type: string;
  ownerId: string | null;
  propertyId: string | null;
  folder: string;
  state: 'waiting' | 'uploading' | 'done' | 'failed';
  message?: string;
};
type DeletedDoc = { id: string; name: string; type: string; files: number; deletedAt: string };

const PAGE_SIZE = 60;
const fileSignature = (file: PickedFile) => `${file.name.toLowerCase()}|${file.size}`;

// The picture (or icon) for one file; HEIC can't be drawn by most browsers.
const fileFace = (file: { url: string; label: string; extension: string | null }, name = file.label) =>
  isShowableImage(file.extension) ? (
    <img src={file.url} alt={name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  ) : isHeic(file.extension) ? (
    <span style={{ fontSize: 11, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, lineHeight: 1.2 }}>
      📷<span>HEIC photo</span>
    </span>
  ) : file.extension === 'pdf' ? (
    '📕'
  ) : (
    '📄'
  );

const day = (iso: string | null) => (iso ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '');
const daysUntil = (today: string, iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

const VIEW_KEY = 'rental.documentsView';
const readView = (): 'grid' | 'list' => {
  try {
    return globalThis.localStorage?.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
};
const writeView = (value: 'grid' | 'list') => {
  try {
    globalThis.localStorage?.setItem(VIEW_KEY, value);
  } catch {
    // per-viewer convenience only
  }
};

// "Perjanjian_sewa-2026.pdf" → "Perjanjian sewa 2026"
const titleFromFile = (fileName: string) =>
  fileName
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Document';

// ---------------------------------------------------------------- styles

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
  height: 34,
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
  fontSize: 13,
  fontWeight: 500,
  height: 32,
  padding: '0 12px',
  borderRadius: 16,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  background: active ? 'var(--t-color-blue3)' : c.bg,
  color: active ? 'var(--t-color-blue11)' : c.text,
  border: `1px solid ${active ? 'var(--t-color-blue7)' : c.border2}`,
});

// Folders with nothing in them yet are remembered in this browser until a document is put in.
const EXTRA_KEY = 'rental.documentFolders';
const readExtra = (key: string): string[] => {
  try {
    const all = JSON.parse(globalThis.localStorage?.getItem(EXTRA_KEY) ?? '{}') as Record<string, string[]>;

    return Array.isArray(all[key]) ? all[key] : [];
  } catch {
    return [];
  }
};
const writeExtra = (key: string, list: string[]) => {
  try {
    const all = JSON.parse(globalThis.localStorage?.getItem(EXTRA_KEY) ?? '{}') as Record<string, string[]>;

    all[key] = list;
    globalThis.localStorage?.setItem(EXTRA_KEY, JSON.stringify(all));
  } catch {
    // per-person convenience only
  }
};

const post = <T,>(body: Record<string, unknown>) => new RestApiClient().post<T & { success: boolean; message?: string }>('/s/files', body);

const expiryBadge = (doc: LibraryDoc, today: string) => {
  if (!doc.expiresOn) return null;

  const days = daysUntil(today, doc.expiresOn);

  if (days < 0) return { text: `Expired ${day(doc.expiresOn)}`, color: 'red' };
  if (days <= EXPIRY_WARN_DAYS) return { text: `Expires in ${days} day${days === 1 ? '' : 's'}`, color: days <= EXPIRY_REMIND_DAYS ? 'red' : 'amber' };

  return { text: `Expires ${day(doc.expiresOn)}`, color: 'gray' };
};

// ---------------------------------------------------------------- page

export const Documents = () => {
  const today = todayIso();
  const scope = useOwnerScope();
  const [docs, setDocs] = useState<LibraryDoc[]>([]);
  const [owners, setOwners] = useState<Option[]>([]);
  const [properties, setProperties] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>(readView);
  const [open, setOpen] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ files: ViewerFile[]; start: number; title: string } | null>(null);
  // Where dropped files are filed.
  const [fileOwner, setFileOwner] = useState('');
  const [fileProperty, setFileProperty] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [deleted, setDeleted] = useState<DeletedDoc[] | null>(null);
  const [undo, setUndo] = useState<{ id: string; name: string } | null>(null);
  // name+size of files already filed in this session (re-dropping them would duplicate).
  const filed = useRef(new Set<string>());
  // Folders: the one being browsed ('' = the top), what is being dragged and where it is over, and the open menus.
  const [folder, setFolder] = useState('');
  const [dragging, setDragging] = useState<{ kind: 'doc' | 'folder'; id: string } | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; mode?: 'move' } | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; value: string } | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);
  const [extra, setExtra] = useState<string[]>([]);

  const reload = useCallback(async () => {
    try {
      const result = await post<{ documents?: LibraryDoc[]; owners?: Option[]; properties?: Option[] }>({ action: 'listAll' });

      if (!result.success) throw new Error(result.message ?? 'Could not load documents.');
      setDocs(result.documents ?? []);
      setOwners(result.owners ?? []);
      setProperties(result.properties ?? []);
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not load documents.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const loadDeleted = useCallback(async () => {
    try {
      const result = await post<{ deleted?: DeletedDoc[] }>({ action: 'listDeleted' });

      if (!result.success) throw new Error(result.message ?? 'Could not load deleted documents.');
      setDeleted(result.deleted ?? []);
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not load deleted documents.', variant: 'error' });
    }
  }, []);

  const restore = async (id: string) => {
    const result = await post<Record<string, never>>({ action: 'restore', documentId: id });

    await enqueueSnackbar({ message: result.message ?? (result.success ? 'Restored.' : 'Could not restore.'), variant: result.success ? 'success' : 'error' });
    if (result.success) {
      setUndo((current) => (current?.id === id ? null : current));
      await Promise.all([reload(), deleted ? loadDeleted() : Promise.resolve()]);
    }
  };

  // The undo bar goes away by itself.
  useEffect(() => {
    if (!undo) return undefined;

    const timer = setTimeout(() => setUndo(null), 15000);

    return () => clearTimeout(timer);
  }, [undo]);

  const mine = useMemo(() => docs.filter((d) => scope.matches(d.ownerId)), [docs, scope.key]);
  const extraKey = scope.ownerId || 'all';

  useEffect(() => {
    setExtra(readExtra(extraKey));
  }, [extraKey]);

  const saveExtra = (list: string[]) => {
    setExtra(list);
    writeExtra(extraKey, list);
  };

  // Every folder: those holding documents (and the folders above them) plus the empty ones made here.
  const folderPaths = useMemo(() => {
    const set = new Set<string>();
    const add = (value: string) => {
      let current = '';

      for (const part of value.split('/').filter(Boolean)) {
        current = current ? `${current}/${part}` : part;
        set.add(current);
      }
    };

    for (const d of mine) if (d.folder) add(d.folder);
    for (const p of extra) add(p);

    return set;
  }, [mine, extra]);
  const allFolders = useMemo(() => [...folderPaths].sort((a, b) => a.localeCompare(b)), [folderPaths]);
  const subfolders = allFolders.filter((p) => parentOf(p) === folder);
  const countIn = (value: string) => mine.filter((d) => inTree(d.folder ?? '', value)).length;
  const crumbs = folder.split('/').filter(Boolean).map((label, index, list) => ({ label, path: list.slice(0, index + 1).join('/') }));
  const expiring = mine.filter((d) => d.expiresOn && daysUntil(today, d.expiresOn) <= EXPIRY_WARN_DAYS);
  const empty = mine.filter((d) => d.files.length === 0);
  const typeCounts = useMemo(() => {
    const map = new Map<string, number>();

    for (const d of mine) map.set(d.type, (map.get(d.type) ?? 0) + 1);

    return DOC_TYPES.filter((t) => map.has(t.value)).map((t) => ({ ...t, count: map.get(t.value) ?? 0 }));
  }, [mine]);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();

    return mine
      .filter((d) =>
        filter === 'ALL' ? true : filter === 'EXPIRING' ? d.expiresOn && daysUntil(today, d.expiresOn) <= EXPIRY_WARN_DAYS : filter === 'NO_FILES' ? d.files.length === 0 : d.type === filter,
      )
      .filter((d) => !propertyFilter || (propertyFilter === '__none' ? !d.propertyId : d.propertyId === propertyFilter))
      .filter(
        (d) =>
          !term ||
          [d.name, docType(d.type).label, d.propertyName, d.rentalName, d.personName, d.notes, ...d.files.map((f) => f.label)]
            .join(' ')
            .toLowerCase()
            .includes(term),
      )
      .sort((a, b) => (filter === 'EXPIRING' ? (a.expiresOn ?? '').localeCompare(b.expiresOn ?? '') : b.createdAt.localeCompare(a.createdAt)));
  }, [mine, filter, propertyFilter, search, today]);
  // Browsing = no filter or search: then you see this folder's folders and documents. Otherwise every match, flat.
  const browsing = filter === 'ALL' && !propertyFilter && !search.trim();
  const rows = useMemo(() => (browsing ? matches.filter((d) => (d.folder ?? '') === folder) : matches), [matches, browsing, folder]);

  const ownerForUpload = scope.ownerId || fileOwner || owners.find((o) => /^personal$/i.test(o.name))?.id || owners[0]?.id || '';
  const propertyChoices = properties.filter((p) => !ownerForUpload || p.ownerId === ownerForUpload);

  // A filter that no longer has anything behind it, or a business switch, resets the view.
  useEffect(() => {
    if (loading) return;
    if (
      (filter === 'EXPIRING' && expiring.length === 0) ||
      (filter === 'NO_FILES' && empty.length === 0) ||
      (!['ALL', 'EXPIRING', 'NO_FILES'].includes(filter) && !typeCounts.some((t) => t.value === filter))
    ) {
      setFilter('ALL');
    }
    if (propertyFilter && propertyFilter !== '__none' && !properties.some((p) => p.id === propertyFilter && scope.matches(p.ownerId ?? null))) setPropertyFilter('');
    if (fileProperty && !propertyChoices.some((p) => p.id === fileProperty)) setFileProperty('');
  }, [loading, filter, expiring.length, empty.length, typeCounts, propertyFilter, properties, fileProperty, propertyChoices.length, scope.key]);

  useEffect(() => {
    setFilter('ALL');
    setPropertyFilter('');
    setFileProperty('');
    setFolder('');
    setMenu(null);
  }, [scope.key]);

  // An open folder that no longer exists (moved or emptied elsewhere): back to the top.
  useEffect(() => {
    if (!loading && folder && !folderPaths.has(folder)) setFolder('');
  }, [loading, folder, folderPaths]);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [filter, propertyFilter, search, scope.key]);

  // Files go up one by one, each as its own document.
  const runItems = async (items: QueueItem[]) => {
    let added = 0;

    for (const item of items) {
      setQueue((current) => current.map((q) => (q.key === item.key ? { ...q, state: 'uploading', message: undefined } : q)));

      const result = await uploadFile(item.file, {
        newDocument: { type: item.type, name: titleFromFile(item.file.name), ownerId: item.ownerId, propertyId: item.propertyId, folder: item.folder },
      });

      if (result.success) {
        added += 1;
        filed.current.add(fileSignature(item.file));
      }
      setQueue((current) => current.map((q) => (q.key === item.key ? { ...q, state: result.success ? 'done' : 'failed', message: result.message } : q)));
    }
    if (added) {
      await enqueueSnackbar({ message: `Filed ${added} document${added === 1 ? '' : 's'}. Check the types below.`, variant: 'success' });
      await reload();
    }
  };

  // Each dropped file becomes its own document, typed from its name.
  const fileAll = async (files: PickedFile[], into?: string) => {
    const seen = new Set<string>();
    const fresh = files.filter((file) => {
      const signature = fileSignature(file);

      if (filed.current.has(signature) || seen.has(signature)) return false;
      seen.add(signature);

      return true;
    });
    const skipped = files.length - fresh.length;

    if (skipped > 0) {
      await enqueueSnackbar({
        message: `Skipped ${skipped} file${skipped === 1 ? '' : 's'} already filed in this session (same name and size).`,
        variant: 'warning',
      });
    }
    if (fresh.length === 0) return;

    const items: QueueItem[] = fresh.map((file, index) => ({
      key: `${Date.now()}-${index}`,
      file,
      type: guessDocType(file.name, 'OTHER'),
      ownerId: ownerForUpload || null,
      propertyId: fileProperty || null,
      folder: into ?? folder,
      state: 'waiting',
    }));

    setQueue((current) => [...current.filter((q) => q.state !== 'done'), ...items]);
    await runItems(items);
  };

  const retry = async (item: QueueItem) => {
    setQueue((current) => current.map((q) => (q.key === item.key ? { ...q, state: 'waiting', message: undefined } : q)));
    await runItems([item]);
  };

  const updateDoc = async (id: string, data: Record<string, unknown>) => {
    try {
      const result = await post<Record<string, never>>({ action: 'update', documentId: id, ...data });

      return result.success;
    } catch {
      return false;
    }
  };

  const moveDoc = async (id: string, to: string) => {
    const doc = docs.find((d) => d.id === id);

    if (!doc || (doc.folder ?? '') === to) return;
    const ok = await updateDoc(id, { folder: to });

    await enqueueSnackbar({ message: ok ? `Moved “${doc.name || 'document'}” to ${to ? `“${baseOf(to)}”` : 'All documents'}.` : 'Could not move it.', variant: ok ? 'success' : 'error' });
    if (ok) await reload();
  };

  // A folder moved or renamed: every document in it (and in the folders inside) gets the new path.
  const relocate = async (from: string, to: string) => {
    if (!to || to === from || inTree(to, from)) return;
    if (folderPaths.has(to)) {
      await enqueueSnackbar({ message: `A folder called “${baseOf(to)}” is already there.`, variant: 'warning' });

      return;
    }
    const swap = (value: string) => (value === from ? to : `${to}${value.slice(from.length)}`);
    const inside = mine.filter((d) => inTree(d.folder ?? '', from));
    let failed = 0;

    for (const d of inside) if (!(await updateDoc(d.id, { folder: swap(d.folder) }))) failed += 1;
    saveExtra(extra.map((p) => (inTree(p, from) ? swap(p) : p)));
    if (inTree(folder, from)) setFolder(swap(folder));
    await enqueueSnackbar({
      message: failed ? `${failed} document${failed === 1 ? '' : 's'} could not be moved.` : `“${baseOf(from)}” ${parentOf(from) === parentOf(to) ? `renamed to “${baseOf(to)}”` : 'moved'}.`,
      variant: failed ? 'error' : 'success',
    });
    await reload();
  };
  const moveFolder = (from: string, into: string) => relocate(from, into ? `${into}/${baseOf(from)}` : baseOf(from));
  const renameFolder = async (from: string, name: string) => {
    const clean = name.replace(/\//g, '-').trim().slice(0, 60);

    setRenaming(null);
    if (!clean || clean === baseOf(from)) return;
    await relocate(from, parentOf(from) ? `${parentOf(from)}/${clean}` : clean);
  };
  const createFolder = (name: string) => {
    const clean = name.replace(/\//g, '-').trim().slice(0, 60);

    setNewFolder(null);
    if (!clean) return;
    const path = folder ? `${folder}/${clean}` : clean;

    if (folderPaths.has(path)) {
      void enqueueSnackbar({ message: `“${clean}” is already here.`, variant: 'warning' });

      return;
    }
    saveExtra([...extra, path]);
    setFolder(path);
  };
  const deleteFolder = async (path: string) => {
    if (countIn(path) > 0) {
      await enqueueSnackbar({ message: 'Move or delete the documents in this folder first.', variant: 'warning' });

      return;
    }
    saveExtra(extra.filter((p) => !inTree(p, path)));
    if (inTree(folder, path)) setFolder(parentOf(path));
  };

  // A folder (tile or path link) you can drop on: a dragged document or folder moves into it, files from the computer upload into it.
  const dropProps = (target: string) => ({
    onDragOver: () => {
      if (dropOn !== target) setDropOn(target);
    },
    onDragEnter: () => setDropOn(target),
    onDragLeave: () => setDropOn((current) => (current === target ? null : current)),
    onDrop: (event: unknown) => {
      const drag = dragging;

      setDropOn(null);
      setDragging(null);
      const files = filesFromEvent(event);

      if (files.length) void fileAll(files, target);
      else if (drag?.kind === 'doc') void moveDoc(drag.id, target);
      else if (drag?.kind === 'folder' && drag.id !== target) void moveFolder(drag.id, target);
    },
  });
  const dragProps = (kind: 'doc' | 'folder', id: string) => ({
    draggable: 'true' as const,
    onDragStart: () => setDragging({ kind, id }),
    onDragEnd: () => {
      setDragging(null);
      setDropOn(null);
    },
  });

  const menuItem = (label: string, onClick: () => void, danger = false) => (
    <button key={label} onClick={onClick} style={{ ...button(), height: 32, width: '100%', border: 'none', background: 'transparent', justifyContent: 'flex-start', textAlign: 'left', color: danger ? 'var(--t-color-red11)' : c.text }}>
      {label}
    </button>
  );
  const folderMenu = (target: string) => {
    const targets = ['', ...allFolders].filter((p) => p !== target && p !== parentOf(target) && !inTree(p, target));
    const items =
      menu?.mode === 'move'
        ? [
            <span key="h" style={{ padding: '6px 12px', fontSize: 11.5, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Move to
            </span>,
            ...targets.map((p) =>
              menuItem(p ? `📁 ${p.split('/').join(' › ')}` : '🗂 All documents', () => {
                setMenu(null);
                void moveFolder(target, p);
              }),
            ),
          ]
        : [
            menuItem('📂 Open', () => {
              setMenu(null);
              setFolder(target);
            }),
            ...(scope.ownerId
              ? [
                  menuItem('🔗 Share…', () => {
                    setMenu(null);
                    setSharing(target);
                  }),
                ]
              : []),
            menuItem('✎ Rename', () => {
              setMenu(null);
              setRenaming({ path: target, value: baseOf(target) });
            }),
            menuItem('↗ Move to…', () => setMenu({ id: target, mode: 'move' })),
            menuItem('🗑 Delete folder', () => {
              setMenu(null);
              void deleteFolder(target);
            }, true),
          ];

    return (
      <div style={{ position: 'absolute', top: 40, right: 8, zIndex: 20, minWidth: 200, maxHeight: 300, overflowY: 'auto', background: c.bg, border: `1px solid ${c.border2}`, borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,0.18)', padding: 4, display: 'flex', flexDirection: 'column' }}>
        {items}
      </div>
    );
  };

  const openDoc = docs.find((d) => d.id === open) ?? null;
  const busy = queue.some((q) => q.state === 'waiting' || q.state === 'uploading');

  const thumb = (d: LibraryDoc, size: number) => {
    const image = d.files.find((f) => isShowableImage(f.extension));

    return (
      <span
        style={{
          width: size,
          height: size,
          borderRadius: 10,
          background: c.bg2,
          border: `1px solid ${c.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
          fontSize: size * 0.4,
        }}
      >
        {image ? fileFace(image, d.name) : docType(d.type).icon}
      </span>
    );
  };

  const meta = (d: LibraryDoc) =>
    [docType(d.type).label, d.propertyName || d.rentalName || d.personName, d.files.length ? `${d.files.length} file${d.files.length === 1 ? '' : 's'}` : 'no files']
      .filter(Boolean)
      .join(' · ');

  return (
    <div style={{ fontFamily: c.font, color: c.text, background: c.bg, height: '100%', overflowY: 'auto', containerType: 'size', boxSizing: 'border-box', position: 'relative' }}>
      {sharing && scope.ownerId ? <SharePanel ownerId={scope.ownerId} folder={sharing} onClose={() => setSharing(null)} /> : null}
      {viewing && (
        <Sheet width={900} onClose={() => setViewing(null)}>
          <FileViewer files={viewing.files} start={viewing.start} title={viewing.title} onClose={() => setViewing(null)} />
        </Sheet>
      )}
      {openDoc && !viewing && (
        <Sheet width={520} onClose={() => setOpen(null)}>
          <DocumentSheet
            key={openDoc.id}
            doc={openDoc}
            properties={properties.filter((p) => !openDoc.ownerId || p.ownerId === openDoc.ownerId)}
            folders={allFolders}
            onClose={() => setOpen(null)}
            onView={(start) => setViewing({ files: openDoc.files, start, title: openDoc.name })}
            onChanged={reload}
            onDeleted={() => {
              setUndo({ id: openDoc.id, name: openDoc.name });
              if (deleted) loadDeleted();
            }}
          />
        </Sheet>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 'clamp(4px, 2vw, 16px)', maxWidth: 1240 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 650 }}>Documents</div>
            <div style={{ fontSize: 13, color: c.text3 }}>Agreements, titles, insurance, IC copies, bills — filed, findable and viewable.</div>
          </div>
        </div>

        {/* Drop a pile of files */}
        <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13, color: c.text2 }}>
            <span>File under</span>
            {scope.ownerId ? (
              <span style={{ fontWeight: 600, color: c.text }}>{scope.owner?.name ?? 'this business'}</span>
            ) : (
              <select value={ownerForUpload} onChange={(e) => { setFileOwner(readValue(e)); setFileProperty(''); }} style={{ ...control, width: 'auto' }}>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
            {propertyChoices.length > 0 && (
              <select value={fileProperty} onChange={(e) => setFileProperty(readValue(e))} style={{ ...control, width: 'auto', maxWidth: '100%' }}>
                <option value="">No property</option>
                {propertyChoices.map((p) => (
                  <option key={p.id} value={p.id}>
                    🏢 {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <FileDrop
            onFiles={fileAll}
            disabled={busy}
            title={busy ? 'Filing…' : folder ? `Drop documents here: they go into “${baseOf(folder)}”` : 'Drop documents here — as many as you like'}
            accept="application/pdf,image/*,video/*,.heic,.heif,.doc,.docx,.xls,.xlsx,.txt,.mp4,.mov,.webm"
            hint="or tap to choose / take a photo · each file becomes a document, typed from its name"
          />
          {queue.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {queue.map((q) => (
                <div key={q.key} style={{ display: 'flex', gap: 8, fontSize: 12.5, alignItems: 'center' }}>
                  <span style={{ width: 18 }}>{q.state === 'done' ? '✅' : q.state === 'failed' ? '⚠️' : q.state === 'uploading' ? '⏳' : '·'}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: q.state === 'failed' ? 'var(--t-color-red11)' : c.text2 }}>
                    {q.state === 'failed' ? q.message ?? `${q.file.name}: upload failed.` : `${q.file.name} · ${formatBytes(q.file.size)} → ${docType(q.type).label}`}
                  </span>
                  {q.state === 'failed' && (
                    <>
                      <button onClick={() => retry(q)} disabled={busy} style={{ ...button(), height: 26, padding: '0 8px', fontSize: 12 }}>
                        Retry
                      </button>
                      <button onClick={() => setQueue((current) => current.filter((x) => x.key !== q.key))} disabled={busy} style={{ ...button(), height: 26, padding: '0 8px', fontSize: 12 }}>
                        Dismiss
                      </button>
                    </>
                  )}
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

        {/* Filters */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'thin', paddingBottom: 2 }}>
          <button onClick={() => setFilter('ALL')} style={chip(filter === 'ALL')}>
            All <span style={{ opacity: 0.7, marginLeft: 4 }}>{mine.length}</span>
          </button>
          {expiring.length > 0 && (
            <button onClick={() => setFilter('EXPIRING')} style={{ ...chip(filter === 'EXPIRING'), ...(filter === 'EXPIRING' ? {} : { color: 'var(--t-color-amber11)' }) }}>
              ⏰ Expiring <span style={{ opacity: 0.7, marginLeft: 4 }}>{expiring.length}</span>
            </button>
          )}
          {typeCounts.map((t) => (
            <button key={t.value} onClick={() => setFilter(t.value)} style={chip(filter === t.value)}>
              {t.icon} {t.label} <span style={{ opacity: 0.7, marginLeft: 4 }}>{t.count}</span>
            </button>
          ))}
          {empty.length > 0 && (
            <button onClick={() => setFilter('NO_FILES')} style={chip(filter === 'NO_FILES')}>
              Empty <span style={{ opacity: 0.7, marginLeft: 4 }}>{empty.length}</span>
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="🔍  Search names, files, properties…" value={search} onChange={(e) => setSearch(readValue(e))} style={{ ...control, flex: '1 1 200px' }} />
          {properties.some((p) => scope.matches(p.ownerId ?? null)) && (
            <select value={propertyFilter} onChange={(e) => setPropertyFilter(readValue(e))} style={{ ...control, width: 'auto', flex: '0 1 200px' }}>
              <option value="">All properties</option>
              {properties
                .filter((p) => scope.matches(p.ownerId ?? null))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    🏢 {p.name}
                  </option>
                ))}
              <option value="__none">Not for a property</option>
            </select>
          )}
          <div style={{ display: 'flex', background: c.bg2, borderRadius: 8, padding: 2, gap: 2 }}>
            {(['grid', 'list'] as const).map((value) => (
              <button
                key={value}
                onClick={() => {
                  setView(value);
                  writeView(value);
                }}
                style={{ ...button(), height: 30, border: 'none', background: view === value ? c.bg : 'transparent', boxShadow: view === value ? `0 0 0 1px ${c.border2}` : 'none', color: view === value ? c.text : c.text3 }}
              >
                {value === 'grid' ? '▦ Grid' : '☰ List'}
              </button>
            ))}
          </div>
        </div>

        {/* Folders: where you are, a new folder, the folders in here */}
        {browsing && !loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
              {[{ path: '', label: 'All documents' }, ...crumbs].map((crumb, index) => (
                <span key={crumb.path || 'top'} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {index > 0 ? <span style={{ color: c.text3 }}>›</span> : null}
                  <button
                    onClick={() => setFolder(crumb.path)}
                    {...dropProps(crumb.path)}
                    style={{ ...button(), height: 30, border: `1px solid ${dropOn === crumb.path ? c.accent : 'transparent'}`, background: dropOn === crumb.path ? 'var(--t-color-blue2)' : 'transparent', fontWeight: crumb.path === folder ? 650 : 500 }}
                  >
                    {index === 0 ? '🗂 ' : '📁 '}
                    {crumb.label}
                  </button>
                </span>
              ))}
              <span style={{ flex: 1 }} />
              {newFolder === null ? (
                <button onClick={() => setNewFolder('')} style={button()}>
                  + New folder
                </button>
              ) : (
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input placeholder="Folder name" value={newFolder} onChange={(e) => setNewFolder(readValue(e))} style={{ ...control, width: 170 }} />
                  <button onClick={() => createFolder(newFolder)} disabled={!newFolder.trim()} style={button(true)}>
                    Create
                  </button>
                  <button onClick={() => setNewFolder(null)} style={button()}>
                    Cancel
                  </button>
                </span>
              )}
            </div>
            {allFolders.length > 0 ? (
              <span style={{ fontSize: 12, color: c.text3 }}>Drag a file or folder onto a folder to move it there · drop files from your computer onto a folder to upload into it.</span>
            ) : null}
            {subfolders.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(210px, 100%), 1fr))', gap: 10 }}>
                {subfolders.map((p) => {
                  const hot = dropOn === p;
                  const count = countIn(p);

                  return (
                    <div key={p} style={{ position: 'relative' }}>
                      {renaming?.path === p ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', border: `1px solid ${c.accent}`, borderRadius: 12, padding: 10 }}>
                          <input value={renaming.value} onChange={(e) => setRenaming({ path: p, value: readValue(e) })} style={{ ...control, flex: 1 }} />
                          <button onClick={() => void renameFolder(p, renaming.value)} style={button(true)}>
                            Save
                          </button>
                          <button onClick={() => setRenaming(null)} style={button()}>
                            ×
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setFolder(p)}
                          {...dragProps('folder', p)}
                          {...dropProps(p)}
                          style={{ all: 'unset', cursor: 'pointer', boxSizing: 'border-box', width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 44px 10px 12px', border: `1px solid ${hot ? c.accent : c.border}`, background: hot ? 'var(--t-color-blue2)' : c.bg2, borderRadius: 12, opacity: dragging?.kind === 'folder' && dragging.id === p ? 0.5 : 1 }}
                        >
                          <span style={{ fontSize: 26 }}>📁</span>
                          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{baseOf(p)}</span>
                            <span style={{ fontSize: 12, color: c.text3 }}>
                              {count} document{count === 1 ? '' : 's'}
                            </span>
                          </span>
                        </button>
                      )}
                      {renaming?.path !== p ? (
                        <button onClick={() => setMenu(menu?.id === p ? null : { id: p })} aria-label="Folder menu" style={{ ...button(), position: 'absolute', top: 8, right: 8, height: 28, padding: '0 8px', border: 'none', background: 'transparent' }}>
                          ⋯
                        </button>
                      ) : null}
                      {menu?.id === p ? folderMenu(p) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Documents */}
        {loading ? (
          <div style={{ color: c.text3, fontSize: 13, padding: 24, textAlign: 'center' }}>Loading…</div>
        ) : rows.length === 0 && browsing && subfolders.length > 0 ? null : rows.length === 0 ? (
          <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, color: c.text3, fontSize: 14, padding: '32px 16px', textAlign: 'center' }}>
            {folder && browsing ? 'This folder is empty. Drop files above, or drag documents onto it.' : mine.length === 0 ? 'No documents yet — drop some files above.' : 'Nothing matches.'}
          </div>
        ) : view === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(160px, calc(50% - 5px)), 1fr))', gap: 10 }}>
            {rows.slice(0, limit).map((d) => {
              const badge = expiryBadge(d, today);

              return (
                <button
                  key={d.id}
                  onClick={() => setOpen(d.id)}
                  {...dragProps('doc', d.id)}
                  style={{ opacity: dragging?.kind === 'doc' && dragging.id === d.id ? 0.5 : 1, all: 'unset', cursor: 'pointer', boxSizing: 'border-box', border: `1px solid ${c.border}`, borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}
                >
                  <span style={{ display: 'block', position: 'relative' }}>
                    {(() => {
                      const image = d.files.find((f) => isShowableImage(f.extension));

                      return (
                        <span style={{ display: 'flex', aspectRatio: '4 / 3', borderRadius: 8, background: c.bg2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontSize: 34 }}>
                          {image ? fileFace(image, d.name) : docType(d.type).icon}
                        </span>
                      );
                    })()}
                    {d.files.length > 1 && (
                      <span style={{ position: 'absolute', right: 6, bottom: 6, fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 8, background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                        {d.files.length}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name || docType(d.type).label}</span>
                  <span style={{ fontSize: 12, color: c.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta(d)}</span>
                  {badge && <span style={{ fontSize: 11.5, fontWeight: 600, color: `var(--t-color-${badge.color}11)` }}>{badge.text}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
            {rows.slice(0, limit).map((d, index) => {
              const badge = expiryBadge(d, today);

              return (
                <button
                  key={d.id}
                  onClick={() => setOpen(d.id)}
                  {...dragProps('doc', d.id)}
                  style={{ all: 'unset', cursor: 'pointer', boxSizing: 'border-box', width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: index ? `1px solid ${c.border}` : 'none' }}
                >
                  {thumb(d, 40)}
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name || docType(d.type).label}</span>
                    <span style={{ fontSize: 12, color: c.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta(d)}</span>
                  </span>
                  {badge && <span style={{ fontSize: 12, fontWeight: 600, color: `var(--t-color-${badge.color}11)`, whiteSpace: 'nowrap' }}>{badge.text}</span>}
                </button>
              );
            })}
          </div>
        )}

        {!loading && rows.length > limit && (
          <button onClick={() => setLimit((n) => n + PAGE_SIZE)} style={{ ...button(), alignSelf: 'center' }}>
            Show more ({rows.length - limit} left)
          </button>
        )}

        {/* Recently deleted */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={() => (deleted ? setDeleted(null) : loadDeleted())}
            style={{ ...button(), alignSelf: 'flex-start', border: 'none', background: 'transparent', fontSize: 12, color: c.text3 }}
          >
            {deleted ? '▾' : '▸'} Recently deleted
          </button>
          {deleted && (
            <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
              {deleted.length === 0 ? (
                <div style={{ padding: 14, fontSize: 13, color: c.text3 }}>Nothing deleted.</div>
              ) : (
                deleted.map((d, index) => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderTop: index ? `1px solid ${c.border}` : 'none' }}>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {docType(d.type).icon} {d.name || docType(d.type).label}
                      </span>
                      <span style={{ fontSize: 12, color: c.text3 }}>
                        {docType(d.type).label} · {d.files} file{d.files === 1 ? '' : 's'}
                        {d.deletedAt ? ` · deleted ${day(d.deletedAt.slice(0, 10))}` : ''}
                      </span>
                    </span>
                    <button onClick={() => restore(d.id)} style={button()}>
                      Restore
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <button onClick={() => navigate(AppPath.RecordIndexPage, { objectNamePlural: 'documents' })} style={{ ...button(), alignSelf: 'flex-start', border: 'none', background: 'transparent', fontSize: 12, color: c.text3 }}>
          Open as a table →
        </button>

        {undo && (
          <div style={{ position: 'sticky', bottom: 8, alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: '#1f2023', color: '#e8e8ea', fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,0.25)' }}>
            <span>Deleted “{undo.name || 'document'}”.</span>
            <button onClick={() => restore(undo.id)} style={{ ...button(), height: 28, background: '#2f3136', color: '#8ab4f8', border: '1px solid #44464c' }}>
              Undo
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- one document

const DocumentSheet = ({
  doc,
  properties,
  folders,
  onClose,
  onView,
  onChanged,
  onDeleted,
}: {
  doc: LibraryDoc;
  properties: Option[];
  folders: string[];
  onClose: () => void;
  onView: (start: number) => void;
  onChanged: () => Promise<void>;
  onDeleted: () => void;
}) => {
  const [name, setName] = useState(doc.name);
  const [notes, setNotes] = useState(doc.notes);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmFile, setConfirmFile] = useState<string | null>(null);

  // Title and notes save when you click away (and when the sheet closes).
  const latest = useRef({ name, notes });
  const savedText = useRef({ name: doc.name, notes: doc.notes });

  latest.current = { name, notes };

  const commitText = async () => {
    const { name: n, notes: t } = latest.current;
    const data: Record<string, unknown> = {};

    if (n.trim() && n.trim() !== savedText.current.name) data.name = n.trim();
    if (t !== savedText.current.notes) data.notes = t;
    if (Object.keys(data).length === 0) return;

    const before = savedText.current;

    savedText.current = { name: (data.name as string | undefined) ?? before.name, notes: (data.notes as string | undefined) ?? before.notes };
    try {
      const result = await post<Record<string, never>>({ action: 'update', documentId: doc.id, ...data });

      if (!result.success) throw new Error(result.message ?? 'Could not save.');
      await enqueueSnackbar({ message: 'Saved.', variant: 'success' });
      await onChanged();
    } catch (error) {
      savedText.current = before;
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not save.', variant: 'error' });
    }
  };

  useEffect(
    () => () => {
      void commitText();
    },
    [],
  );

  const save = async (data: Record<string, unknown>, done?: string) => {
    setBusy(true);
    try {
      const result = await post<Record<string, never>>({ action: 'update', documentId: doc.id, ...data });

      if (!result.success) throw new Error(result.message ?? 'Could not save.');
      if (done) await enqueueSnackbar({ message: done, variant: 'success' });
      await onChanged();
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not save.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    const result = await post<Record<string, never>>({ documentId: doc.id, ...body });

    setBusy(false);
    await enqueueSnackbar({ message: result.message ?? (result.success ? 'Done.' : 'Could not save.'), variant: result.success ? 'success' : 'error' });
    if (result.success) await onChanged();

    return result.success;
  };

  const addFiles = async (files: PickedFile[]) => {
    setBusy(true);

    let added = 0;
    let full = false;
    const problems: string[] = [];

    for (const file of files) {
      if (full) break;

      const result = await uploadFile(file, { documentId: doc.id });

      if (result.success) added += 1;
      else if (result.full) full = true;
      else problems.push(result.message ?? `${file.name}: upload failed.`);
    }
    setBusy(false);

    const skipped = files.length - added - problems.length;
    const parts = [
      added ? `Added ${added} file${added === 1 ? '' : 's'}.` : '',
      full ? `This document is full (20 files)${skipped ? ` — ${skipped} not added` : ''}. Drop them on the page to start a new document.` : '',
      problems.length ? (problems.length === 1 ? problems[0] : `${problems.length} files failed (${problems[0]}).`) : '',
    ].filter(Boolean);

    if (parts.length) await enqueueSnackbar({ message: parts.join(' '), variant: full || problems.length ? 'error' : 'success' });
    if (added) await onChanged();
  };

  const label = (text: string) => <span style={{ fontSize: 12, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>{text}</span>;

  return (
    <div style={{ height: '100%', background: c.bg, display: 'flex', flexDirection: 'column', fontFamily: c.font, color: c.text }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 650, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {docType(doc.type).icon} {doc.name || docType(doc.type).label}
          </div>
          <div style={{ fontSize: 13, color: c.text3, marginTop: 2 }}>
            {[doc.ownerName, doc.rentalName || doc.propertyName, doc.personName].filter(Boolean).join(' · ') || 'Not linked to anything'}
          </div>
        </div>
        <button onClick={onClose} style={{ ...button(), width: 32, height: 32, padding: 0, border: 'none', fontSize: 18, background: 'transparent' }} aria-label="Close">
          ×
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Files */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {label(`Files · ${doc.files.length}`)}
          {doc.files.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8 }}>
              {doc.files.map((file, index) => (
                <div key={file.fileId} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <button
                    onClick={() => onView(index)}
                    title={`View ${file.label}`}
                    style={{ padding: 0, cursor: 'pointer', aspectRatio: '1', borderRadius: 10, border: `1px solid ${c.border}`, background: c.bg2, overflow: 'hidden', fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {fileFace(file)}
                  </button>
                  <span style={{ fontSize: 11, color: c.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.label}</span>
                  {confirmFile === file.fileId ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: c.text2 }}>
                      <span>{doc.files.length === 1 ? 'Last file — the document will be empty.' : 'Remove?'}</span>
                      <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => {
                            setConfirmFile(null);
                            act({ action: 'removeFile', fileId: file.fileId });
                          }}
                          disabled={busy}
                          style={{ ...button(), height: 24, padding: '0 8px', fontSize: 11.5, color: 'var(--t-color-red11)' }}
                        >
                          Yes
                        </button>
                        {doc.files.length === 1 && (
                          <button
                            onClick={() => {
                              setConfirmFile(null);
                              setConfirmDelete(true);
                            }}
                            style={{ ...button(), height: 24, padding: '0 8px', fontSize: 11.5 }}
                          >
                            Delete doc instead
                          </button>
                        )}
                        <button onClick={() => setConfirmFile(null)} style={{ ...button(), height: 24, padding: '0 8px', fontSize: 11.5 }}>
                          No
                        </button>
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmFile(file.fileId)}
                      disabled={busy}
                      title="Remove this file"
                      style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', fontSize: 13, padding: 0 }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {doc.files.length > 0 && (
            <button onClick={() => onView(0)} style={{ ...button(true), alignSelf: 'flex-start' }}>
              👁 View {doc.files.length > 1 ? `all ${doc.files.length}` : ''}
            </button>
          )}
          <FileDrop compact onFiles={addFiles} disabled={busy} title={busy ? 'Working…' : 'Add files'} hint="drop here, or tap to choose / take a photo" />
        </div>

        {/* Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {label('Details')}
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={name} onChange={(e) => setName(readValue(e))} onBlur={commitText} placeholder="Title" style={{ ...control, flex: 1 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.text2 }}>
              Type
              <select value={doc.type} onChange={(e) => save({ type: readValue(e) })} style={control}>
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.icon} {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.text2 }}>
              Folder
              <select
                value={doc.folder ?? ''}
                onChange={(e) => {
                  const next = readValue(e);

                  if (next !== (doc.folder ?? '')) void save({ folder: next }, next ? `Moved to “${baseOf(next)}”.` : 'Taken out of the folder.');
                }}
                style={control}
              >
                <option value="">No folder (top level)</option>
                {(doc.folder && !folders.includes(doc.folder) ? [...folders, doc.folder] : folders).map((p) => (
                  <option key={p} value={p}>
                    {p.split('/').join(' › ')}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.text2 }}>
              Property
              <select value={doc.propertyId ?? ''} onChange={(e) => save({ propertyId: readValue(e) || null })} style={control}>
                <option value="">None</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.text2 }}>
              Expires on (optional)
              <span style={{ display: 'flex', gap: 6 }}>
                <input type="date" value={doc.expiresOn ?? ''} onChange={(e) => save({ expiresOn: readValue(e) || null })} style={{ ...control, flex: 1 }} />
                {doc.expiresOn && (
                  <button onClick={() => save({ expiresOn: null })} style={button()} title="Clear">
                    ×
                  </button>
                )}
              </span>
            </label>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(readValue(e))}
            onBlur={commitText}
            placeholder="Notes (policy no., where the original is kept…)"
            rows={3}
            style={{ ...control, height: 'auto', padding: '8px 10px', resize: 'vertical' }}
          />
          <span style={{ fontSize: 12, color: c.text3 }}>Title and notes save when you click away. With an expiry date, the document shows on Today and turns amber here {EXPIRY_WARN_DAYS} days before, red within {EXPIRY_REMIND_DAYS} (WhatsApp reminders start then). Change or clear the date and it stops.</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${c.border}`, flexWrap: 'wrap' }}>
        <button onClick={() => openSidePanelPage({ page: SidePanelPages.ViewRecord, recordId: doc.id, objectNameSingular: 'document' })} style={{ ...button(), flex: 1, height: 40 }}>
          Open record
        </button>
        {confirmDelete ? (
          <button
            onClick={async () => {
              if (await act({ action: 'delete' })) {
                onDeleted();
                onClose();
              }
            }}
            disabled={busy}
            style={{ ...button(), flex: 1, height: 40, background: 'var(--t-color-red9)', color: '#fff', border: '1px solid var(--t-color-red9)' }}
          >
            Yes, delete
          </button>
        ) : (
          <button onClick={() => setConfirmDelete(true)} style={{ ...button(), flex: 1, height: 40, color: 'var(--t-color-red11)' }}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- share a folder

// A link anyone can open to see and download every file in the folder (and the folders inside it).
const SharePanel = ({ ownerId, folder, onClose }: { ownerId: string; folder: string; onClose: () => void }) => {
  const [shares, setShares] = useState<Array<FolderShare & { url?: string }> | null>(null);
  const [days, setDays] = useState('7');
  const [busy, setBusy] = useState(false);
  const call = <T,>(body: Record<string, unknown>) => new RestApiClient().post<T & { success: boolean; message?: string }>('/s/files/shares', body);

  const load = useCallback(async () => {
    try {
      const result = await call<{ shares?: Array<FolderShare & { url?: string }> }>({ action: 'list', ownerId, folder });

      if (!result.success) throw new Error(result.message ?? 'Could not load the links.');
      setShares(result.shares ?? []);
    } catch (error) {
      setShares([]);
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not load the links.', variant: 'error' });
    }
  }, [ownerId, folder]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const result = await call<Record<string, never>>({ action: 'create', ownerId, folder, days: Number(days) });

      if (!result.success) throw new Error(result.message ?? 'Could not make the link.');
      await enqueueSnackbar({ message: 'Link made. Copy it and send it.', variant: 'success' });
      await load();
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not make the link.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const stop = async (token: string) => {
    setBusy(true);
    try {
      const result = await call<Record<string, never>>({ action: 'stop', token });

      await enqueueSnackbar({ message: result.message ?? (result.success ? 'Link stopped.' : 'Could not stop it.'), variant: result.success ? 'success' : 'error' });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const linkOf = (share: FolderShare & { url?: string }) => share.url ?? `${globalThis.location?.origin ?? ''}/s/files/shared?t=${share.token}`;
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      await enqueueSnackbar({ message: 'Link copied.', variant: 'success' });
    } catch {
      await enqueueSnackbar({ message: 'Select the link and copy it (Ctrl+C).', variant: 'warning' });
    }
  };

  return (
    <Sheet width={520} onClose={onClose}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: c.font, color: c.text, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>Share “{baseOf(folder)}”</span>
        <span style={{ fontSize: 13, color: c.text2 }}>
          Anyone with the link can see and download every file in this folder, and the folders inside it, without signing in. Stop the link to close it again.
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={days} onChange={(e) => setDays(readValue(e))} style={{ ...control, width: 'auto' }}>
            {SHARE_DAY_CHOICES.map((d) => (
              <option key={d.days} value={String(d.days)}>
                {d.label}
              </option>
            ))}
          </select>
          <button onClick={() => void create()} disabled={busy} style={button(true)}>
            Make a link
          </button>
          {busy ? <span style={{ fontSize: 12, color: c.text3 }}>Working…</span> : null}
        </div>
        {shares === null ? (
          <span style={{ fontSize: 13, color: c.text3 }}>Loading…</span>
        ) : shares.length === 0 ? (
          <span style={{ fontSize: 13, color: c.text3 }}>No link yet.</span>
        ) : (
          shares.map((share) => (
            <div key={share.token} style={{ border: `1px solid ${c.border}`, borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input readOnly value={linkOf(share)} style={{ ...control, width: '100%' }} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: c.text3, flex: 1 }}>{share.expiresAt ? `Works until ${day(share.expiresAt.slice(0, 10))}` : 'Works until you stop it'}</span>
                <button onClick={() => void copy(linkOf(share))} style={button()}>
                  Copy
                </button>
                <button onClick={() => void stop(share.token)} disabled={busy} style={{ ...button(), color: 'var(--t-color-red11)' }}>
                  Stop link
                </button>
              </div>
            </div>
          ))
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={button()}>
            Close
          </button>
        </div>
      </div>
    </Sheet>
  );
};
