import { type CSSProperties, type ReactNode, useCallback, useEffect, useState } from 'react';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { enqueueSnackbar, useRecordId } from 'twenty-sdk/front-component';

import { WORKSPACE_MEMBERS_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v3';
import type { WorkspaceMembersResponse } from 'src/logic-functions/workspaces-route';

// Members tab on a rental workspace (Family, Company A...). Its hosts (and
// admins) add and remove people and choose who else hosts; everyone else sees
// the list. Members see only their workspaces on the rental pages; admins
// ("All workspaces") see everything. All changes go through /s/workspaces,
// which checks who's asking.

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

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

const call = (body: Record<string, unknown>) =>
  new RestApiClient().post<{ success: boolean; message?: string; joined?: boolean; name?: string }>('/s/workspaces', body);

const WorkspaceMembers = () => {
  const ownerId = useRecordId();
  const [data, setData] = useState<WorkspaceMembersResponse | null>(null);
  const [busy, setBusy] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');

  const load = useCallback(async () => {
    if (!ownerId) return;
    try {
      setData(await new RestApiClient().post<WorkspaceMembersResponse>('/s/workspaces', { action: 'members', id: ownerId }));
    } catch (error) {
      setData({ success: false, message: error instanceof Error ? error.message : 'Could not load members.' });
    }
  }, [ownerId]);

  useEffect(() => {
    load();
  }, [load]);

  // Runs one change, then reloads; `key` dims the row while it runs.
  const run = async (key: string, body: Record<string, unknown>, done?: string) => {
    setBusy(key);
    try {
      const result = await call({ id: ownerId, ...body });

      if (!result.success) throw new Error(result.message ?? 'Could not update.');
      if (done) await enqueueSnackbar({ message: done, variant: 'success' });
      await load();
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not update.', variant: 'error' });
    } finally {
      setBusy('');
    }
  };

  const invite = async () => {
    const email = inviteEmail.trim().toLowerCase();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      await enqueueSnackbar({ message: 'Enter a valid email address.', variant: 'error' });

      return;
    }

    setBusy('invite');
    try {
      const result = await call({ action: 'add', id: ownerId, email });

      if (!result.success) throw new Error(result.message ?? 'Could not invite.');

      if (result.joined) {
        await enqueueSnackbar({ message: `${result.name ?? email} added to this workspace.`, variant: 'success' });
      } else {
        // Not on the team yet: send Twenty's invitation (needs invite
        // permission); the kept membership is linked when they join.
        let sent = false;

        try {
          const response = (await new MetadataApiClient().mutation({
            sendInvitations: { __args: { emails: [email] }, success: true, errors: true },
          } as never)) as { sendInvitations?: { success?: boolean; errors?: string[] } };

          sent = Boolean(response.sendInvitations?.success) && !(response.sendInvitations?.errors ?? []).length;
        } catch {
          sent = false;
        }
        await enqueueSnackbar({
          message: sent
            ? `Invitation sent to ${email}. They'll get this workspace when they join.`
            : `Saved ${email} for this workspace. An admin needs to invite them to the CRM (Settings → Members); they'll get this workspace when they join.`,
          variant: sent ? 'success' : 'warning',
        });
      }
      setInviteEmail('');
      await load();
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not invite.', variant: 'error' });
    } finally {
      setBusy('');
    }
  };

  if (!data) return <div style={{ padding: 16, fontFamily: c.font, color: c.text3, fontSize: 13 }}>Loading…</div>;
  if (!data.success) {
    return <div style={{ padding: 16, fontFamily: c.font, color: 'var(--t-color-red11)', fontSize: 13 }}>{data.message}</div>;
  }

  const manage = Boolean(data.canManage);
  const members = data.members ?? [];
  const admins = data.admins ?? [];
  const pending = data.pending ?? [];
  const team = data.team ?? [];
  const hostCount = members.filter((m) => m.role === 'HOST').length;

  const smallButton = (tone: 'danger' | 'add' | 'plain'): CSSProperties => ({
    fontFamily: c.font,
    fontSize: 12,
    fontWeight: 500,
    borderRadius: c.radius,
    height: 26,
    padding: '0 10px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    background: c.bg,
    border: `1px solid ${tone === 'danger' ? 'var(--t-color-red8)' : tone === 'add' ? 'var(--t-color-blue8)' : c.border2}`,
    color: tone === 'danger' ? 'var(--t-color-red11)' : tone === 'add' ? 'var(--t-color-blue11)' : c.text2,
  });

  const section: CSSProperties = { border: `1px solid ${c.border}`, borderRadius: c.radius, overflow: 'hidden' };
  const sectionTitle: CSSProperties = { padding: '8px 14px', background: c.bg2, fontSize: 12, fontWeight: 600, color: c.text3 };
  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    borderTop: `1px solid ${c.border}`,
  };

  const tag = (label: string, color: string) => (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '1px 6px',
        borderRadius: 4,
        background: `var(--t-color-${color}3)`,
        color: `var(--t-color-${color}11)`,
        marginLeft: 6,
      }}
    >
      {label}
    </span>
  );

  const person = (name: string, email: string, badge?: ReactNode) => (
    <>
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          background: c.bg2,
          color: c.text2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {initials(name)}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          {name}
          {badge}
        </span>
        <span style={{ fontSize: 12, color: c.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {email}
        </span>
      </span>
    </>
  );

  return (
    <div style={{ fontFamily: c.font, color: c.text, padding: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, color: c.text2, lineHeight: 1.5 }}>
        People in this workspace see its properties, rent and expenses — nothing from other workspaces.
        {manage
          ? ' As a host you can add or remove people and choose who else hosts.'
          : ' Only the hosts can add or remove people.'}
      </div>

      {manage && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={inviteEmail}
            onChange={(e) => {
              const object = e as unknown as { detail?: { value?: string }; target?: { value?: string } };

              setInviteEmail(object.detail?.value ?? object.target?.value ?? '');
            }}
            placeholder="Invite by email, e.g. ali@company-a.com"
            style={{
              flex: 1,
              fontFamily: c.font,
              fontSize: 13,
              color: c.text,
              background: c.bg,
              border: `1px solid ${c.border2}`,
              borderRadius: c.radius,
              height: 32,
              padding: '0 10px',
              boxSizing: 'border-box',
            }}
          />
          <button
            onClick={invite}
            disabled={busy !== ''}
            style={{
              fontFamily: c.font,
              fontSize: 13,
              fontWeight: 500,
              color: '#fff',
              background: 'var(--t-color-blue9)',
              border: '1px solid var(--t-color-blue9)',
              borderRadius: c.radius,
              height: 32,
              padding: '0 14px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {busy === 'invite' ? 'Inviting…' : 'Invite to this workspace'}
          </button>
        </div>
      )}

      <div style={section}>
        <div style={sectionTitle}>Members · {members.length}</div>
        {members.length === 0 && (
          <div style={{ ...rowStyle, fontSize: 13, color: c.text3 }}>Nobody yet.</div>
        )}
        {members.map((member) => {
          const isHost = member.role === 'HOST';
          const lastHost = isHost && hostCount <= 1;

          return (
            <div key={member.membershipId} style={{ ...rowStyle, opacity: busy === member.membershipId ? 0.5 : 1 }}>
              {person(member.name, member.email, isHost ? tag('Host', 'orange') : undefined)}
              {manage && !lastHost && (
                <>
                  <button
                    onClick={() =>
                      run(member.membershipId, { action: 'setRole', membershipId: member.membershipId, role: isHost ? 'MEMBER' : 'HOST' })
                    }
                    disabled={busy !== ''}
                    style={smallButton('plain')}
                  >
                    {isHost ? 'Make member' : 'Make host'}
                  </button>
                  <button
                    onClick={() => run(member.membershipId, { action: 'remove', membershipId: member.membershipId })}
                    disabled={busy !== ''}
                    style={smallButton('danger')}
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {admins.length > 0 && (
        <div style={section}>
          <div style={sectionTitle}>Admins — see every workspace · {admins.length}</div>
          {admins.map((admin) => (
            <div key={admin.membershipId} style={{ ...rowStyle, opacity: busy === admin.membershipId ? 0.5 : 1 }}>
              {person(admin.name, admin.email, tag('Admin', 'blue'))}
              {data.isAdmin && admin.memberId !== data.me && (
                <button
                  onClick={() => run(admin.membershipId, { action: 'setAdmin', memberId: admin.memberId, on: false })}
                  disabled={busy !== ''}
                  style={smallButton('plain')}
                >
                  Remove admin
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div style={section}>
          <div style={sectionTitle}>Invited — waiting to join · {pending.length}</div>
          {pending.map((membership) => (
            <div key={membership.membershipId} style={{ ...rowStyle, fontSize: 13 }}>
              <span style={{ flex: 1 }}>{membership.email}</span>
              <button
                onClick={() => run(membership.membershipId, { action: 'remove', membershipId: membership.membershipId })}
                disabled={busy !== ''}
                style={smallButton('plain')}
              >
                Cancel invite
              </button>
            </div>
          ))}
        </div>
      )}

      {team.length > 0 && (
        <div style={section}>
          <div style={sectionTitle}>Add from your team · {team.length}</div>
          {team.map((member) => (
            <div key={member.memberId} style={{ ...rowStyle, opacity: busy === member.memberId ? 0.5 : 1 }}>
              {person(member.name, member.email)}
              {data.isAdmin && (
                <button
                  onClick={() => run(member.memberId, { action: 'setAdmin', memberId: member.memberId, on: true })}
                  disabled={busy !== ''}
                  style={smallButton('plain')}
                >
                  Make admin
                </button>
              )}
              <button
                onClick={() => run(member.memberId, { action: 'add', memberId: member.memberId })}
                disabled={busy !== ''}
                style={smallButton('add')}
              >
                Add
              </button>
            </div>
          ))}
        </div>
      )}

      {manage && (
        <div style={{ fontSize: 12, color: c.text3, lineHeight: 1.5 }}>
          Removing someone here takes this workspace away from them. A workspace always keeps at least one host.
        </div>
      )}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: WORKSPACE_MEMBERS_FRONT_COMPONENT_ID,
  name: 'workspace-members',
  description: "A rental workspace's members; its hosts add and remove people",
  component: WorkspaceMembers,
});
