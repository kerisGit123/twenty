import { type CSSProperties, type SyntheticEvent, useCallback, useEffect, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { AppPath, enqueueSnackbar, navigate } from 'twenty-sdk/front-component';

import { WORKSPACES_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v3';
import { openPage } from 'src/front-components/shared/open-page';
import { rememberOwnerScope } from 'src/front-components/shared/owner-switcher';
import type { WorkspaceCard } from 'src/logic-functions/workspaces-route';

// Workspaces page: every workspace you belong to as a card (Personal first),
// a way into each one, and — for admins — a new workspace form.

type ListResponse = { success: boolean; admin?: boolean; year?: string; workspaces?: WorkspaceCard[]; message?: string };

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

const rm = (value: number) =>
  `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// remote-dom serialises events; the value may sit on detail or target.
const readValue = (event: SyntheticEvent<HTMLElement>): string => {
  const object = event as unknown as { detail?: { value?: string }; target?: { value?: string } };

  return object.detail?.value ?? object.target?.value ?? '';
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

const Badge = ({ name, type }: { name: string; type: string }) => {
  const color = TYPE_COLOR[type] ?? 'gray';

  return (
    <span
      style={{
        width: 36,
        height: 36,
        borderRadius: 9,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        fontWeight: 700,
        background: color === 'gray' ? c.bg2 : `var(--t-color-${color}3)`,
        color: color === 'gray' ? c.text2 : `var(--t-color-${color}11)`,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
};

const Workspaces = () => {
  const [data, setData] = useState<ListResponse | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('COMPANY');
  const [busy, setBusy] = useState(false);

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

  const open = (card: WorkspaceCard) => {
    // Admins get the full workspace page; everyone else goes to Today, switched
    // to this workspace (they can't open the workspace record itself).
    if (data?.admin) {
      navigate(AppPath.RecordShowPage, { objectNameSingular: 'owner', objectRecordId: card.id });
    } else {
      rememberOwnerScope(card.id);
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
      await enqueueSnackbar({ message: `${name.trim()} added. Invite people from its Members tab.`, variant: 'success' });
      setName('');
      setAdding(false);
      navigate(AppPath.RecordShowPage, { objectNameSingular: 'owner', objectRecordId: result.id });
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not add.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div style={{ padding: 16, fontFamily: c.font, color: c.text3, fontSize: 13 }}>Loading…</div>;
  if (!data.success) {
    return <div style={{ padding: 16, fontFamily: c.font, color: 'var(--t-color-red11)', fontSize: 13 }}>{data.message}</div>;
  }

  const workspaces = data.workspaces ?? [];

  return (
    <div style={{ fontFamily: c.font, color: c.text, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>Workspaces</span>
          <span style={{ fontSize: 13, color: c.text3 }}>
            Everything — properties, rent, expenses, documents and people — belongs to a workspace. Figures are for {data.year}.
          </span>
        </div>
        {data.admin && !adding && (
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
          You haven't been added to a workspace yet. Ask an admin to add you.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {workspaces.map((card) => {
          const net = card.rent - card.expenses;

          return (
            <button
              key={card.id}
              onClick={() => open(card)}
              style={{
                fontFamily: c.font,
                textAlign: 'left',
                cursor: 'pointer',
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderRadius: c.radius,
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Badge name={card.name} type={card.type} />
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {card.name}
                  </span>
                  <span style={{ fontSize: 12, color: c.text3 }}>
                    {TYPE_LABEL[card.type] ?? 'Workspace'} · {card.members} member{card.members === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontSize: 12, color: c.text3 }}>
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
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: WORKSPACES_FRONT_COMPONENT_ID,
  name: 'workspaces',
  description: 'All your workspaces as cards, with a way into each and new workspace for admins',
  component: Workspaces,
});
