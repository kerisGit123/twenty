import { type CSSProperties, useCallback, useEffect, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { defineFrontComponent } from 'twenty-sdk/define';
import { enqueueSnackbar, useRecordId } from 'twenty-sdk/front-component';

import { WORKSPACE_MEMBERS_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v3';

// Members tab on a rental workspace (Family, Company A...): the team, with a
// switch per person. Members of a workspace see only their workspaces on the
// rental pages; people marked "All workspaces" (admins) see everything, and
// everyone else sees nothing.
// Inviting by email sends Twenty's invitation and keeps a pending membership
// that is linked when the person joins (see on-member-joined).

type Member = { id: string; name: string; email: string };
type Membership = { id: string; ownerId: string; memberId: string | null; email: string };
type AllAccess = { id: string; memberId: string };

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

const WorkspaceMembers = () => {
  const ownerId = useRecordId();
  const [members, setMembers] = useState<Member[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [allAccess, setAllAccess] = useState<AllAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');

  const load = useCallback(async () => {
    const client = new CoreApiClient();
    const [{ workspaceMembers }, { memberships: page }] = await Promise.all([
      client.query({
        workspaceMembers: {
          __args: { first: 200 },
          edges: { node: { id: true, name: { firstName: true, lastName: true }, userEmail: true } },
        },
      }),
      client.query({
        memberships: {
          __args: { first: 500 },
          edges: { node: { id: true, ownerId: true, memberId: true, email: true, allWorkspaces: true } },
        },
      }),
    ]);

    setMembers(
      (workspaceMembers?.edges ?? [])
        .map(({ node }) => ({
          id: node.id,
          name: [node.name?.firstName, node.name?.lastName].filter(Boolean).join(' ') || node.userEmail || 'Member',
          email: node.userEmail ?? '',
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    setMemberships(
      (page?.edges ?? [])
        .filter(({ node }) => !node.allWorkspaces && node.ownerId && (node.memberId || node.email))
        .map(({ node }) => ({
          id: node.id,
          ownerId: node.ownerId as string,
          memberId: node.memberId ?? null,
          email: node.email ?? '',
        })),
    );
    setAllAccess(
      (page?.edges ?? [])
        .filter(({ node }) => node.allWorkspaces && node.memberId)
        .map(({ node }) => ({ id: node.id, memberId: node.memberId as string })),
    );
  }, []);

  useEffect(() => {
    load()
      .catch((error) =>
        enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not load members.', variant: 'error' }),
      )
      .finally(() => setLoading(false));
  }, [load]);

  const flip = async (member: Member) => {
    if (!ownerId) return;
    const existing = memberships.find((m) => m.ownerId === ownerId && m.memberId === member.id);

    setBusy(member.id);
    try {
      const client = new CoreApiClient();

      if (existing) {
        await client.mutation({ deleteMembership: { __args: { id: existing.id }, id: true } });
      } else {
        await client.mutation({
          createMembership: { __args: { data: { ownerId, memberId: member.id, name: member.name } }, id: true },
        });
      }
      await load();
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not update.', variant: 'error' });
    } finally {
      setBusy('');
    }
  };

  const flipAll = async (member: Member) => {
    const existing = allAccess.find((a) => a.memberId === member.id);

    setBusy(member.id);
    try {
      const client = new CoreApiClient();

      if (existing) {
        await client.mutation({ deleteMembership: { __args: { id: existing.id }, id: true } });
      } else {
        await client.mutation({
          createMembership: {
            __args: { data: { memberId: member.id, allWorkspaces: true, name: `${member.name} (all workspaces)` } },
            id: true,
          },
        });
      }
      await load();
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not update.', variant: 'error' });
    } finally {
      setBusy('');
    }
  };

  const invite = async () => {
    const email = inviteEmail.trim().toLowerCase();

    if (!ownerId || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      await enqueueSnackbar({ message: 'Enter a valid email address.', variant: 'error' });

      return;
    }

    const existingMember = members.find((m) => m.email.toLowerCase() === email);

    setBusy('invite');
    try {
      const client = new CoreApiClient();

      if (existingMember) {
        // Already on the team: just add them to this workspace.
        if (!memberships.some((m) => m.ownerId === ownerId && m.memberId === existingMember.id)) {
          await client.mutation({
            createMembership: {
              __args: { data: { ownerId, memberId: existingMember.id, name: existingMember.name } },
              id: true,
            },
          });
        }
        await enqueueSnackbar({ message: `${existingMember.name} added to this workspace.`, variant: 'success' });
      } else {
        let sent = false;

        try {
          const result = (await new MetadataApiClient().mutation({
            sendInvitations: { __args: { emails: [email] }, success: true, errors: true },
          } as never)) as { sendInvitations?: { success?: boolean; errors?: string[] } };

          sent = Boolean(result.sendInvitations?.success) && !(result.sendInvitations?.errors ?? []).length;
        } catch {
          sent = false;
        }

        if (!memberships.some((m) => m.ownerId === ownerId && m.email === email)) {
          await client.mutation({
            createMembership: { __args: { data: { ownerId, email, name: email } }, id: true },
          });
        }
        await enqueueSnackbar({
          message: sent
            ? `Invitation sent to ${email}. They'll get this workspace when they join.`
            : `Saved ${email} for this workspace. Send the invitation from Settings → Members → Invite; they'll get this workspace when they join.`,
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

  const cancelInvite = async (membership: Membership) => {
    setBusy(membership.id);
    try {
      await new CoreApiClient().mutation({ deleteMembership: { __args: { id: membership.id }, id: true } });
      await load();
    } finally {
      setBusy('');
    }
  };

  if (loading) return <div style={{ padding: 16, fontFamily: c.font, color: c.text3, fontSize: 13 }}>Loading…</div>;

  const inThis = new Set(memberships.filter((m) => m.ownerId === ownerId).map((m) => m.memberId));
  const admins = new Set(allAccess.map((a) => a.memberId));
  const pending = memberships.filter((m) => m.ownerId === ownerId && !m.memberId);
  // Admins see every workspace, so they count as members here too.
  const current = members.filter((m) => inThis.has(m.id) || admins.has(m.id));
  const others = members.filter((m) => !inThis.has(m.id) && !admins.has(m.id));

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

  const person = (member: Member, note: string) => (
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
        {initials(member.name)}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{member.name}</span>
        <span style={{ fontSize: 12, color: c.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {member.email}
          {note ? ` · ${note}` : ''}
        </span>
      </span>
    </>
  );

  return (
    <div style={{ fontFamily: c.font, color: c.text, padding: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, color: c.text2, lineHeight: 1.5 }}>
        People in this workspace see its properties, rent and expenses on the Today, Rent Ledger and Expenses pages —
        nothing from other workspaces. Admins marked "All workspaces" see everything.
      </div>

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

      <div style={section}>
        <div style={sectionTitle}>Members · {current.length}</div>
        {current.length === 0 && (
          <div style={{ ...rowStyle, fontSize: 13, color: c.text3 }}>Nobody yet. Invite someone or add them from your team below.</div>
        )}
        {current.map((member) => {
          const isAdmin = admins.has(member.id);

          return (
            <div key={member.id} style={{ ...rowStyle, opacity: busy === member.id ? 0.5 : 1 }}>
              {person(member, isAdmin ? 'Admin — all workspaces' : '')}
              {isAdmin ? (
                <button onClick={() => flipAll(member)} disabled={busy !== ''} style={smallButton('plain')}>
                  Remove admin
                </button>
              ) : (
                <>
                  <button onClick={() => flipAll(member)} disabled={busy !== ''} style={smallButton('plain')}>
                    Make admin
                  </button>
                  <button onClick={() => flip(member)} disabled={busy !== ''} style={smallButton('danger')}>
                    Remove
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {pending.length > 0 && (
        <div style={section}>
          <div style={sectionTitle}>Invited — waiting to join · {pending.length}</div>
          {pending.map((membership) => (
            <div key={membership.id} style={{ ...rowStyle, fontSize: 13 }}>
              <span style={{ flex: 1 }}>{membership.email}</span>
              <button onClick={() => cancelInvite(membership)} disabled={busy !== ''} style={smallButton('plain')}>
                Cancel invite
              </button>
            </div>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div style={section}>
          <div style={sectionTitle}>Add from your team · {others.length}</div>
          {others.map((member) => (
            <div key={member.id} style={{ ...rowStyle, opacity: busy === member.id ? 0.5 : 1 }}>
              {person(member, '')}
              <button onClick={() => flip(member)} disabled={busy !== ''} style={smallButton('add')}>
                Add
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: c.text3, lineHeight: 1.5 }}>
        Removing someone here takes this workspace away from them. To remove them from the CRM completely, use
        Settings → Members.
      </div>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: WORKSPACE_MEMBERS_FRONT_COMPONENT_ID,
  name: 'workspace-members',
  description: 'Choose which team members belong to a rental workspace',
  component: WorkspaceMembers,
});
