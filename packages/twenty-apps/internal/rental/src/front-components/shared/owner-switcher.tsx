import { type CSSProperties, useEffect, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { AppPath, navigate } from 'twenty-sdk/front-component';

// "Workspace" switcher for the rental pages: All, or one owner (Family,
// Company A...). The choice is remembered per user across all pages.

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

// ownerId is '' for All. matches() says whether a record's owner is in scope.
export const useOwnerScope = () => {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [ownerId, setOwnerIdState] = useState<string>(readStored);

  useEffect(() => {
    new CoreApiClient()
      .query({
        owners: {
          __args: { first: 200, orderBy: [{ name: 'AscNullsLast' }] },
          edges: { node: { id: true, name: true, ownerType: true } },
        },
      })
      .then(({ owners: page }) => {
        const list = (page?.edges ?? []).map(({ node }) => ({
          id: node.id,
          name: node.name ?? 'Owner',
          type: (node.ownerType as string | null) ?? '',
        }));

        setOwners(list);
        // A remembered owner that was deleted falls back to All.
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
        {owner?.name ?? 'All owners'}
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
            Switch owner
          </span>
          <button onClick={() => pick('')} style={row(!ownerId)}>
            <Badge name="" type="" />
            <span style={{ flex: 1 }}>All owners</span>
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
            Manage owners
          </button>
        </div>
      )}
    </div>
  );
};
