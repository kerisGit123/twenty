import { type CSSProperties, useEffect, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { AppPath, navigate } from 'twenty-sdk/front-component';

// Workspace switcher for the rental pages. A rental "workspace" (Family,
// Company A...) is the owner column on properties, payments, expenses and
// documents. The server decides which ones the signed-in person may see (all
// for admins, their memberships for everyone else) and only sends those; this
// just picks one of them or all of them. The choice is remembered per user.

export type Owner = { id: string; name: string; type: string };

const STORAGE_KEY = 'rental.ownerScope';
const ALL = '';

const readStored = (): string => {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? ALL;
  } catch {
    return ALL;
  }
};

const writeStored = (value: string) => {
  try {
    if (value) globalThis.localStorage?.setItem(STORAGE_KEY, value);
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable; the switch still works for this page.
  }
};

// Lets other components (e.g. a workspace page) pick the workspace before
// opening a rental page.
export const rememberOwnerScope = (ownerId: string) => writeStored(ownerId);

// ownerId is '' for All. matches() says whether a record's workspace is the
// picked one (the server has already removed workspaces the person can't see).
export const useOwnerScope = () => {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [all, setAll] = useState(true);
  const [ownerId, setOwnerIdState] = useState<string>(readStored);

  useEffect(() => {
    new RestApiClient()
      .post<{ success: boolean; all: boolean; owners: Owner[] }>('/s/scope', {})
      .then((result) => {
        const list = result.owners ?? [];

        setOwners(list);
        setAll(Boolean(result.all));
        // A remembered workspace that is gone (or no longer allowed) falls back to All.
        setOwnerIdState((current) => (current && !list.some((o) => o.id === current) ? ALL : current));
      })
      .catch(() => setOwners([]));
  }, []);

  const setOwnerId = (value: string) => {
    setOwnerIdState(value);
    writeStored(value);
  };

  return {
    owners,
    ownerId,
    setOwnerId,
    owner: owners.find((o) => o.id === ownerId) ?? null,
    restricted: !all,
    // Changes whenever what's in scope changes; use it as a memo dependency.
    key: `${ownerId}|${all ? '*' : owners.map((o) => o.id).join(',')}`,
    matches: (recordOwnerId: string | null | undefined) => !ownerId || recordOwnerId === ownerId,
  };
};

// ---------------------------------------------------------------- UI

const c = {
  font: 'var(--t-font-family)',
  text: 'var(--t-font-color-primary)',
  text2: 'var(--t-font-color-secondary)',
  text3: 'var(--t-font-color-tertiary)',
  bg: 'var(--t-background-primary)',
  bg2: 'var(--t-background-secondary)',
  border: 'var(--t-border-color-light)',
  border2: 'var(--t-border-color-medium)',
  radius: 'var(--t-border-radius-md)',
};

const TYPE_COLOR: Record<string, string> = {
  FAMILY: 'pink',
  INDIVIDUAL: 'green',
  COMPANY: 'blue',
  NGO: 'purple',
  OTHER: 'gray',
};

const Badge = ({ name, type, size = 22 }: { name: string; type: string; size?: number }) => {
  const color = name ? TYPE_COLOR[type] ?? 'gray' : 'gray';

  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.5,
        fontWeight: 700,
        background: color === 'gray' ? c.bg2 : `var(--t-color-${color}3)`,
        color: color === 'gray' ? c.text2 : `var(--t-color-${color}11)`,
        border: color === 'gray' ? `1px solid ${c.border2}` : 'none',
        boxSizing: 'border-box',
      }}
    >
      {name ? name.charAt(0).toUpperCase() : '∗'}
    </span>
  );
};

const row = (selected: boolean): CSSProperties => ({
  fontFamily: c.font,
  fontSize: 13,
  color: c.text,
  background: selected ? c.bg2 : c.bg,
  border: 'none',
  borderRadius: 6,
  height: 34,
  padding: '0 8px',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
});

export const OwnerSwitcher = ({ scope }: { scope: ReturnType<typeof useOwnerScope> }) => {
  const [open, setOpen] = useState(false);
  const { owners, ownerId, setOwnerId, owner } = scope;
  const pick = (value: string) => {
    setOwnerId(value);
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          fontFamily: c.font,
          fontSize: 14,
          fontWeight: 600,
          color: c.text,
          background: c.bg,
          border: `1px solid ${c.border2}`,
          borderRadius: c.radius,
          height: 34,
          padding: '0 10px 0 6px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <Badge name={owner?.name ?? ''} type={owner?.type ?? ''} />
        {owner?.name ?? (scope.restricted ? 'All my workspaces' : 'All workspaces')}
        <span style={{ color: c.text3, fontSize: 11 }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 40,
            left: 0,
            zIndex: 20,
            width: 240,
            background: c.bg,
            border: `1px solid ${c.border2}`,
            borderRadius: c.radius,
            boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <span style={{ fontSize: 11, color: c.text3, padding: '4px 8px', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Switch workspace
          </span>
          <button onClick={() => pick('')} style={row(!ownerId)}>
            <Badge name="" type="" />
            <span style={{ flex: 1 }}>{scope.restricted ? 'All my workspaces' : 'All workspaces'}</span>
            {!ownerId && <span style={{ color: 'var(--t-color-green11)' }}>✓</span>}
          </button>
          {owners.map((o) => (
            <button key={o.id} onClick={() => pick(o.id)} style={row(ownerId === o.id)}>
              <Badge name={o.name} type={o.type} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
              {ownerId === o.id && <span style={{ color: 'var(--t-color-green11)' }}>✓</span>}
            </button>
          ))}
          <div style={{ borderTop: `1px solid ${c.border}`, margin: '4px 0' }} />
          <button
            onClick={() => {
              setOpen(false);
              navigate(AppPath.RecordIndexPage, { objectNamePlural: 'owners' });
            }}
            style={{ ...row(false), color: 'var(--t-color-green11)', fontWeight: 500 }}
          >
            <span style={{ width: 22, textAlign: 'center', fontSize: 16 }}>+</span>
            Manage workspaces
          </button>
        </div>
      )}
    </div>
  );
};
