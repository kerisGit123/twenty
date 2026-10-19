import { useCallback, useEffect, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { enqueueSnackbar } from 'twenty-sdk/front-component';

import type { WorkspaceMembersResponse } from 'src/logic-functions/workspaces-route';

// Who is in one business, opened from its card: hosts, members and invites still
// waiting for the person to sign in. Its hosts (and admins) can remove someone
// or cancel an invite; changing roles stays on the business's own page.

const c = {
  font: 'var(--t-font-family)',
  text: 'var(--t-font-color-primary)',
  text3: 'var(--t-font-color-tertiary)',
  border: 'var(--t-border-color-medium)',
  bg: 'var(--t-background-primary)',
  accent: 'var(--t-color-blue9)',
};
const small = { fontFamily: c.font, fontSize: 12, height: 28, padding: '0 10px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${c.border}`, background: c.bg, color: c.text };
const row = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${c.border}` };

export const MembersPanel = ({ ownerId, businessName, onInvite, onClose, onChanged }: { ownerId: string; businessName: string; onInvite: () => void; onClose: () => void; onChanged: () => void }) => {
  const [data, setData] = useState<WorkspaceMembersResponse | null>(null);
  const [busy, setBusy] = useState('');
  // Removing asks once more, on the same button.
  const [armed, setArmed] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await new RestApiClient().post<WorkspaceMembersResponse>('/s/workspaces', { action: 'members', id: ownerId }));
    } catch (error) {
      setData({ success: false, message: error instanceof Error ? error.message : String(error) });
    }
  }, [ownerId]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (membershipId: string) => {
    if (armed !== membershipId) {
      setArmed(membershipId);

      return;
    }
    setBusy(membershipId);
    try {
      const result = await new RestApiClient().post<{ success: boolean; message?: string }>('/s/workspaces', { action: 'remove', id: ownerId, membershipId });

      if (!result.success) throw new Error(result.message ?? 'Could not remove.');
      await load();
      onChanged();
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not remove.', variant: 'error' });
    } finally {
      setBusy('');
      setArmed('');
    }
  };

  const removeButton = (membershipId: string, label: string) =>
    data?.canManage ? (
      <button onClick={() => remove(membershipId)} disabled={busy === membershipId} style={{ ...small, color: 'var(--t-color-red11)', fontWeight: armed === membershipId ? 600 : 400 }}>
        {busy === membershipId ? '…' : armed === membershipId ? 'Sure?' : label}
      </button>
    ) : null;

  const members = data?.members ?? [];
  const pending = data?.pending ?? [];

  return (
    <div style={{ border: `2px solid ${c.accent}`, borderRadius: 12, maxWidth: 560, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, fontFamily: c.font, color: c.text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, fontSize: 17, fontWeight: 650 }}>Members of {businessName}</span>
        {data?.canManage ? (
          <button onClick={onInvite} style={{ ...small, fontWeight: 600 }}>
            + Invite
          </button>
        ) : null}
        <button onClick={onClose} style={small}>
          Close
        </button>
      </div>
      {!data ? <span style={{ fontSize: 13, color: c.text3 }}>Loading…</span> : null}
      {data && !data.success ? <span style={{ fontSize: 13, color: 'var(--t-color-red11)' }}>{data.message ?? 'Could not load the members.'}</span> : null}
      {data?.success ? (
        <div>
          {members.map((m) => (
            <div key={m.membershipId} style={row}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                  {m.name}
                  {m.memberId === data.me ? <span style={{ color: c.text3, fontWeight: 400 }}> (you)</span> : null}
                </div>
                <div style={{ fontSize: 12, color: c.text3 }}>{m.email}</div>
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: m.role === 'HOST' ? 'var(--t-color-orange11)' : c.text3 }}>{m.role === 'HOST' ? 'Host' : 'Member'}</span>
              {m.memberId !== data.me ? removeButton(m.membershipId, 'Remove') : null}
            </div>
          ))}
          {pending.map((p) => (
            <div key={p.membershipId} style={row}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14 }}>{p.email}</div>
                <div style={{ fontSize: 12, color: 'var(--t-color-amber11)' }}>Invited, has not signed in yet</div>
              </span>
              {removeButton(p.membershipId, 'Cancel invite')}
            </div>
          ))}
          {!members.length && !pending.length ? <div style={{ fontSize: 13, color: c.text3, padding: '8px 0' }}>Nobody is in this business yet.</div> : null}
          <div style={{ fontSize: 12, color: c.text3, paddingTop: 8 }}>
            Members see only this business. Hosts can also rename it and invite or remove people.
            {data.admins?.length ? ` Admins (${data.admins.map((a) => a.name).join(', ')}) see every business.` : ''}
          </div>
        </div>
      ) : null}
    </div>
  );
};
