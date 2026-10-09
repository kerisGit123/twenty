import { type CSSProperties, useCallback, useEffect, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { AppPath, enqueueSnackbar, navigate } from 'twenty-sdk/front-component';

import { readValue } from 'src/front-components/shared/read-value';
import { WORKSPACES_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v3';
import { openPage } from 'src/front-components/shared/open-page';
import { rememberOwnerScope } from 'src/front-components/shared/owner-switcher';
import type { WorkspaceCard } from 'src/logic-functions/workspaces-route';

// Workspaces page: every workspace you belong to, as cards or a grid (your
// Personal first), a way into each one, and a new workspace form — whoever adds
// a workspace hosts it. Hosts (and admins) can rename theirs.

type ListResponse = { success: boolean; admin?: boolean; year?: string; workspaces?: WorkspaceCard[]; message?: string };

type ViewMode = 'cards' | 'grid';

const VIEW_KEY = 'rental.workspacesView';

const TYPES = [
  { value: 'FAMILY', label: 'Family' },
  { value: 'COMPANY', label: 'Company' },
  { value: 'NGO', label: 'NGO / Society' },
  { value: 'INDIVIDUAL', label: 'Individual' },
  { value: 'OTHER', label: 'Other' },
];
const TYPE_LABEL: Record<string, string> = { PERSONAL: 'Personal', ...Object.fromEntries(TYPES.map((t) => [t.value, t.label])) };
const TYPE_COLOR: Record<string, string> = {
  PERSONAL: 'gray',
  FAMILY: 'pink',
  INDIVIDUAL: 'green',
  COMPANY: 'blue',
  NGO: 'purple',
  OTHER: 'gray',
};
const ROLE_TAG: Record<string, { label: string; color: string }> = {
  HOST: { label: 'Host', color: 'orange' },
  ADMIN: { label: 'Admin', color: 'blue' },
  MEMBER: { label: 'Member', color: 'gray' },
};

const rm = (value: number) =>
  `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// remote-dom serialises events; the value may sit on detail or target.
const readView = (): ViewMode => {
  try {
    return globalThis.localStorage?.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'cards';
  } catch {
    return 'cards';
  }
};

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
};

const button = (primary = false): CSSProperties => ({
  ...control,
  cursor: 'pointer',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  ...(primary ? { background: 'var(--t-color-blue9)', color: '#fff', border: '1px solid var(--t-color-blue9)' } : {}),
});

const smallButton: CSSProperties = { ...button(), height: 26, fontSize: 12, padding: '0 10px' };

const plainButton: CSSProperties = {
  fontFamily: c.font,
  textAlign: 'left',
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  padding: 0,
};

const Badge = ({ name, type, size = 36 }: { name: string; type: string; size?: number }) => {
  const color = TYPE_COLOR[type] ?? 'gray';

  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 4),
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.44),
        fontWeight: 700,
        background: color === 'gray' ? c.bg2 : `var(--t-color-${color}3)`,
        color: color === 'gray' ? c.text2 : `var(--t-color-${color}11)`,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
};

const RoleTag = ({ role }: { role: string }) => {
  const tag = ROLE_TAG[role] ?? ROLE_TAG.MEMBER;

  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '1px 6px',
        borderRadius: 4,
        whiteSpace: 'nowrap',
        background: tag.color === 'gray' ? c.bg2 : `var(--t-color-${tag.color}3)`,
        color: tag.color === 'gray' ? c.text2 : `var(--t-color-${tag.color}11)`,
      }}
    >
      {tag.label}
    </span>
  );
};

const Workspaces = () => {
  const [data, setData] = useState<ListResponse | null>(null);
  const [view, setView] = useState<ViewMode>(readView);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('COMPANY');
  const [busy, setBusy] = useState(false);
  // The workspace being renamed, with its draft name and type.
  const [editing, setEditing] = useState<{ id: string; name: string; type: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await new RestApiClient().post<ListResponse>('/s/workspaces', { action: 'list' }));
    } catch (error) {
      setData({ success: false, message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const switchView = (mode: ViewMode) => {
    setView(mode);
    try {
      globalThis.localStorage?.setItem(VIEW_KEY, mode);
    } catch {
      // Storage can be unavailable; the choice lasts for this visit.
    }
  };

  const open = (card: WorkspaceCard) => {
    rememberOwnerScope(card.id);
    // Admins get the full workspace page; everyone else goes to Today, switched
    // to this workspace (they can't open the workspace record itself).
    if (data?.admin) {
      navigate(AppPath.RecordShowPage, { objectNameSingular: 'owner', objectRecordId: card.id });
    } else {
      openPage('Today');
    }
  };

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const result = await new RestApiClient().post<{ success: boolean; id?: string; message?: string }>('/s/workspaces', {
        action: 'create',
        name,
        type,
      });

      if (!result.success || !result.id) throw new Error(result.message ?? 'Could not add the workspace.');
      await enqueueSnackbar({ message: `${name.trim()} added — you're its host.`, variant: 'success' });
      setName('');
      setAdding(false);
      if (data?.admin) navigate(AppPath.RecordShowPage, { objectNameSingular: 'owner', objectRecordId: result.id });
      else await load();
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not add.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editing?.name.trim()) return;
    setBusy(true);
    try {
      const result = await new RestApiClient().post<{ success: boolean; message?: string }>('/s/workspaces', {
        action: 'update',
        id: editing.id,
        name: editing.name,
        type: editing.type,
      });

      if (!result.success) throw new Error(result.message ?? 'Could not save.');
      setEditing(null);
      await load();
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not save.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div style={{ padding: 16, fontFamily: c.font, color: c.text3, fontSize: 13 }}>Loading…</div>;
  if (!data.success) {
    return <div style={{ padding: 16, fontFamily: c.font, color: 'var(--t-color-red11)', fontSize: 13 }}>{data.message}</div>;
  }

  const workspaces = data.workspaces ?? [];

  const startEdit = (card: WorkspaceCard) =>
    // Someone else's Personal shows with their name; the stored name is "Personal".
    setEditing({ id: card.id, name: card.name.startsWith('Personal · ') ? 'Personal' : card.name, type: card.type });

  const editForm = (card: WorkspaceCard) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <input
        value={editing?.name ?? ''}
        onChange={(e) => {
          const value = readValue(e);

          setEditing((current) => (current ? { ...current, name: value } : current));
        }}
        style={{ ...control, flex: 1, minWidth: 140 }}
      />
      {card.type !== 'PERSONAL' && (
        <select
          value={editing?.type ?? card.type}
          onChange={(e) => {
            const value = readValue(e);

            setEditing((current) => (current ? { ...current, type: value } : current));
          }}
          style={control}
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      )}
      <button style={button(true)} disabled={busy} onClick={saveEdit}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      <button style={{ ...button(), border: 'none', color: c.text3 }} onClick={() => setEditing(null)}>
        Cancel
      </button>
    </div>
  );

  const toggle = (mode: ViewMode, label: string) => (
    <button
      onClick={() => switchView(mode)}
      style={{
        ...button(),
        height: 28,
        fontSize: 12,
        border: 'none',
        background: view === mode ? c.bg : 'transparent',
        boxShadow: view === mode ? `0 0 0 1px ${c.border2}` : 'none',
        color: view === mode ? c.text : c.text3,
      }}
    >
      {label}
    </button>
  );

  const cell: CSSProperties = { padding: '8px 12px', borderTop: `1px solid ${c.border}`, fontSize: 13, whiteSpace: 'nowrap' };
  const head: CSSProperties = { ...cell, borderTop: 'none', background: c.bg2, color: c.text3, fontSize: 12, fontWeight: 600, textAlign: 'left' };
  const num: CSSProperties = { ...cell, textAlign: 'right' };

  const cards = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
      {workspaces.map((card) => {
        const net = card.rent - card.expenses;

        if (editing?.id === card.id) {
          return (
            <div key={card.id} style={{ border: `1px solid ${c.border2}`, borderRadius: c.radius, padding: 14 }}>
              {editForm(card)}
            </div>
          );
        }

        return (
          <div
            key={card.id}
            style={{
              background: c.bg,
              border: `1px solid ${c.border}`,
              borderRadius: c.radius,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <button onClick={() => open(card)} style={{ ...plainButton, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Badge name={card.name} type={card.type} />
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {card.name}
                </span>
                <span style={{ fontSize: 12, color: c.text3 }}>
                  {TYPE_LABEL[card.type] ?? 'Workspace'} · {card.members} member{card.members === 1 ? '' : 's'}
                </span>
              </span>
              <RoleTag role={card.role} />
            </button>
            <button
              onClick={() => open(card)}
              style={{ ...plainButton, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontSize: 12, color: c.text3 }}
            >
              <span>
                Properties
                <br />
                <b style={{ color: c.text, fontSize: 14 }}>{card.properties}</b>
                <span> · {card.occupied} let</span>
              </span>
              <span>
                Rent
                <br />
                <b style={{ color: c.text, fontSize: 14 }}>{rm(card.rent)}</b>
              </span>
              <span>
                Net
                <br />
                <b style={{ color: net < 0 ? 'var(--t-color-red11)' : 'var(--t-color-green11)', fontSize: 14 }}>{rm(net)}</b>
              </span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.text3, minHeight: 26 }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {card.hosts.length ? `Host: ${card.hosts.join(', ')}` : 'No host yet'}
              </span>
              {card.canManage && (
                <button style={smallButton} onClick={() => startEdit(card)}>
                  Rename
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const grid = (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: c.radius, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: c.font }}>
        <thead>
          <tr>
            <th style={head}>Workspace</th>
            <th style={head}>Type</th>
            <th style={head}>You</th>
            <th style={head}>Host</th>
            <th style={{ ...head, textAlign: 'right' }}>Members</th>
            <th style={{ ...head, textAlign: 'right' }}>Properties</th>
            <th style={{ ...head, textAlign: 'right' }}>Rent</th>
            <th style={{ ...head, textAlign: 'right' }}>Expenses</th>
            <th style={{ ...head, textAlign: 'right' }}>Net</th>
            <th style={head} />
          </tr>
        </thead>
        <tbody>
          {workspaces.map((card) => {
            const net = card.rent - card.expenses;

            if (editing?.id === card.id) {
              return (
                <tr key={card.id}>
                  <td style={cell} colSpan={10}>
                    {editForm(card)}
                  </td>
                </tr>
              );
            }

            return (
              <tr key={card.id}>
                <td style={cell}>
                  <button
                    onClick={() => open(card)}
                    style={{ ...plainButton, fontSize: 13, fontWeight: 500, color: c.text, display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <Badge name={card.name} type={card.type} size={22} />
                    {card.name}
                  </button>
                </td>
                <td style={{ ...cell, color: c.text2 }}>{TYPE_LABEL[card.type] ?? 'Workspace'}</td>
                <td style={cell}>
                  <RoleTag role={card.role} />
                </td>
                <td style={{ ...cell, color: c.text2 }}>{card.hosts.join(', ') || '—'}</td>
                <td style={num}>{card.members}</td>
                <td style={num}>
                  {card.properties} <span style={{ color: c.text3 }}>· {card.occupied} let</span>
                </td>
                <td style={num}>{rm(card.rent)}</td>
                <td style={num}>{rm(card.expenses)}</td>
                <td style={{ ...num, color: net < 0 ? 'var(--t-color-red11)' : 'var(--t-color-green11)', fontWeight: 600 }}>{rm(net)}</td>
                <td style={{ ...cell, textAlign: 'right' }}>
                  {card.canManage && (
                    <button style={smallButton} onClick={() => startEdit(card)}>
                      Rename
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={{ fontFamily: c.font, color: c.text, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>Workspaces</span>
          <span style={{ fontSize: 13, color: c.text3 }}>
            Everything — properties, rent, expenses and documents — belongs to a workspace. Only a workspace's hosts can
            rename it or change its members. Figures are for {data.year}.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: c.radius, background: c.bg2 }}>
          {toggle('cards', 'Cards')}
          {toggle('grid', 'Grid')}
        </div>
        {!adding && (
          <button style={button(true)} onClick={() => setAdding(true)}>
            + New workspace
          </button>
        )}
      </div>

      {adding && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', border: `1px solid ${c.border}`, borderRadius: c.radius, padding: 12 }}>
          <input value={name} onChange={(e) => setName(readValue(e))} placeholder="Name, e.g. Company C" style={{ ...control, flex: 1, minWidth: 180 }} />
          <select value={type} onChange={(e) => setType(readValue(e))} style={control}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button style={button(true)} disabled={busy} onClick={create}>
            {busy ? 'Adding…' : 'Add workspace'}
          </button>
          <button style={{ ...button(), border: 'none', color: c.text3 }} onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      )}

      {workspaces.length === 0 && (
        <div style={{ fontSize: 13, color: c.text3, border: `1px solid ${c.border}`, borderRadius: c.radius, padding: 16 }}>
          You aren't in a workspace yet. Add one, or ask a host to add you to theirs.
        </div>
      )}

      {workspaces.length > 0 && (view === 'grid' ? grid : cards)}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: WORKSPACES_FRONT_COMPONENT_ID,
  name: 'workspaces',
  description: 'All your workspaces as cards or a grid; add one, and rename the ones you host',
  component: Workspaces,
});
