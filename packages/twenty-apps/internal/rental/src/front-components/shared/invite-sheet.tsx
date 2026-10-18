import { useState } from 'react';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { copyToClipboard, enqueueSnackbar } from 'twenty-sdk/front-component';

import { readValue } from 'src/front-components/shared/read-value';

// Invite someone to one business by email, from its card (shown as a panel on the page). One step does it all:
// they are added to the business (or kept as an invite until they first sign in),
// the CRM invitation is created, and the host gets a link to send by WhatsApp,
// because invitation emails are not sent from this server.

const c = {
  font: 'var(--t-font-family)',
  text: 'var(--t-font-color-primary)',
  text2: 'var(--t-font-color-secondary)',
  text3: 'var(--t-font-color-tertiary)',
  border: 'var(--t-border-color-medium)',
  bg: 'var(--t-background-primary)',
  bg2: 'var(--t-background-secondary)',
  accent: 'var(--t-color-blue9)',
};
const field = { fontFamily: c.font, fontSize: 15, height: 42, padding: '0 12px', border: `1px solid ${c.border}`, borderRadius: 8, background: c.bg, color: c.text, boxSizing: 'border-box' as const, width: '100%' };
const btn = (primary = false) => ({
  fontFamily: c.font,
  fontSize: 14,
  fontWeight: 600,
  height: 40,
  padding: '0 16px',
  borderRadius: 8,
  cursor: 'pointer',
  border: `1px solid ${primary ? c.accent : c.border}`,
  background: primary ? c.accent : c.bg,
  color: primary ? 'white' : c.text,
});

type AddResult = { success: boolean; joined?: boolean; name?: string; message?: string; invited?: boolean; inviteHash?: string; inviteProblem?: string; appUrl?: string };
type Done = { email: string; joined: boolean; name?: string; link: string; sent: boolean };

// The CRM's join link (/invite/<code>): the address this page runs on (or, when the
// page's code cannot see it, the server's own address) plus the workspace's join code.
const joinLink = (hash: string, appUrl: string) => {
  const here = (globalThis as { location?: { origin?: string } }).location?.origin ?? '';
  const origin = /^https?:\/\//.test(here) ? here : appUrl;

  return hash && /^https?:\/\//.test(origin) ? `${origin}/invite/${hash}` : '';
};

export const InviteSheet = ({ ownerId, businessName, onClose, onDone }: { ownerId: string; businessName: string; onClose: () => void; onDone: () => void }) => {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const clean = email.trim().toLowerCase();
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean);

  const invite = async () => {
    setBusy(true);
    try {
      const result = await new RestApiClient().post<AddResult>('/s/workspaces', { action: 'add', id: ownerId, email: clean });

      if (!result.success) throw new Error(result.message ?? 'Could not invite.');
      if (result.joined) {
        setDone({ email: clean, joined: true, name: result.name, link: '', sent: false });
      } else {
        // Not using the CRM yet: the server also made its invitation and sent back the join code.
        // If the server could not read the join code, ask as the signed-in person instead.
        let hash = result.inviteHash ?? '';

        if (!hash) {
          try {
            const mine = (await new MetadataApiClient().query({ currentWorkspace: { inviteHash: true } } as never)) as { currentWorkspace?: { inviteHash?: string | null } };

            hash = mine.currentWorkspace?.inviteHash ?? '';
          } catch (error) {
            console.warn('invite link', result.inviteProblem, error);
          }
        }
        setDone({ email: clean, joined: false, link: joinLink(hash, result.appUrl ?? ''), sent: Boolean(result.invited) });
      }
      onDone();
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not invite.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const message = done ? `Hi! You're invited to ${businessName} on our system. Open this link and sign in with ${done.email}: ${done.link}` : '';

  return (
    // A panel above the cards (this page has no fixed height, so a side sheet cannot be used).
    <div style={{ border: `2px solid ${c.accent}`, borderRadius: 12, maxWidth: 520 }}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: c.font, color: c.text }}>
        <span style={{ fontSize: 17, fontWeight: 650 }}>Invite to {businessName}</span>
        {!done ? (
          <>
            <span style={{ fontSize: 13, color: c.text2 }}>Type their email (the Google account they will sign in with). They will see only this business.</span>
            <input value={email} onChange={(e) => setEmail(readValue(e))} placeholder="name@gmail.com" inputMode="email" style={field} />
            {email && !valid ? <span style={{ fontSize: 12.5, color: 'var(--t-color-amber11)' }}>Type a full email address.</span> : null}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={{ ...btn(), flex: 1 }}>
                Cancel
              </button>
              <button onClick={invite} disabled={busy || !valid} style={{ ...btn(true), flex: 2, opacity: busy || !valid ? 0.5 : 1 }}>
                {busy ? 'Inviting…' : 'Invite'}
              </button>
            </div>
          </>
        ) : done.joined ? (
          <>
            <span style={{ fontSize: 14 }}>
              ✓ <b>{done.name ?? done.email}</b> already uses the system, so they are in {businessName} now.
            </span>
            <button onClick={onClose} style={btn(true)}>
              Done
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 14 }}>
              ✓ <b>{done.email}</b> is invited to {businessName}.
            </span>
            {done.link ? (
              <>
                <span style={{ fontSize: 13, color: c.text2 }}>Send them this link. They open it and sign in with {done.email}; {businessName} appears for them straight away.</span>
                <input readOnly value={done.link} style={{ ...field, fontSize: 13, background: c.bg2 }} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={async () => {
                      await copyToClipboard(done.link);
                      await enqueueSnackbar({ message: 'Link copied.', variant: 'success' });
                    }}
                    style={{ ...btn(), flex: 1 }}
                  >
                    Copy link
                  </button>
                  <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" style={{ ...btn(true), flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', background: 'var(--t-color-green9)', borderColor: 'var(--t-color-green9)' }}>
                    Send on WhatsApp
                  </a>
                </div>
              </>
            ) : (
              <span style={{ fontSize: 13, color: 'var(--t-color-amber11)' }}>
                The join link could not be made here. Get it in Settings → Members → Invite, and send it to {done.email}. (An admin can save the join code in Settings → Apps → Rental → WORKSPACE_JOIN_CODE so this works next time.)
              </span>
            )}
            <button onClick={onClose} style={btn()}>
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
};
