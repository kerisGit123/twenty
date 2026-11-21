import { randomBytes } from 'crypto';
import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { kv, Response } from 'twenty-sdk/logic-function';

import { FOLDER_SHARES_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { appClient } from 'src/logic-functions/utils/app-client';
import { inScope, NOT_ALLOWED, resolveScope } from 'src/logic-functions/utils/scope';
import { cleanFolder } from 'src/shared/documents';
import { type FolderShare, shareIndexKey, shareIsLive, shareKey } from 'src/shared/folder-shares';

// POST /files/shares — share links for a Documents folder (people with access
// to the business only). The link itself is opened at GET /files/shared.
//
//   { action: 'list', ownerId, folder }         live links for that folder
//   { action: 'create', ownerId, folder, days } days: 7 | 30 | 0 (until stopped)
//   { action: 'stop', token }

type Body = { action?: string; ownerId?: string; folder?: string; days?: number; token?: string };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (message: string) => json({ success: false, message });

// The address people open. Empty when the server's own address is not known (the page then builds it).
const linkOf = (token: string) => {
  const base = String(process.env.SERVER_URL ?? '').replace(/\/$/, '');

  return base ? `${base}/s/files/shared?t=${token}` : undefined;
};
const withLink = (share: FolderShare) => ({ ...share, url: linkOf(share.token) });

const readIndex = async (ownerId: string) => (await kv.get<string[]>(shareIndexKey(ownerId))) ?? [];

const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as Body;

  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);

    if (body.action === 'stop') {
      const share = body.token ? await kv.get<FolderShare>(shareKey(body.token)) : null;

      if (!share) return json({ success: true, message: 'That link was already stopped.' });
      if (!inScope(scope, share.ownerId)) return json(NOT_ALLOWED, 403);
      await kv.delete(shareKey(share.token));
      await kv.set(shareIndexKey(share.ownerId), (await readIndex(share.ownerId)).filter((t) => t !== share.token));

      return json({ success: true, message: 'Link stopped. It no longer opens.' });
    }

    const ownerId = String(body.ownerId ?? '');
    const folder = cleanFolder(body.folder);

    if (!ownerId) return fail('Pick a business first.');
    if (!folder) return fail('Open a folder to share it.');
    if (!inScope(scope, ownerId)) return json(NOT_ALLOWED, 403);

    if (body.action === 'list') {
      const tokens = await readIndex(ownerId);
      const shares = (await Promise.all(tokens.map((t) => kv.get<FolderShare>(shareKey(t))))).filter((s): s is FolderShare => shareIsLive(s));

      // Tidy the index: expired or missing links drop out.
      if (shares.length !== tokens.length) await kv.set(shareIndexKey(ownerId), shares.map((s) => s.token));

      return json({ success: true, shares: shares.filter((s) => s.folder === folder).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(withLink) });
    }

    if (body.action === 'create') {
      const days = [7, 30, 0].includes(Number(body.days)) ? Number(body.days) : 7;
      const now = new Date();
      const share: FolderShare = {
        token: randomBytes(18).toString('base64url'),
        ownerId,
        folder,
        createdAt: now.toISOString(),
        expiresAt: days ? new Date(now.getTime() + days * 86_400_000).toISOString() : null,
        createdBy: context?.workspaceMemberId ?? '',
      };

      await kv.set(shareKey(share.token), share);
      await kv.set(shareIndexKey(ownerId), [...(await readIndex(ownerId)), share.token]);

      return json({ success: true, share: withLink(share) });
    }

    return fail('Unknown action.');
  } catch (error) {
    console.error('[rental] folder shares failed:', error);

    return fail(error instanceof Error ? error.message : String(error));
  }
};

export default defineLogicFunction({
  universalIdentifier: FOLDER_SHARES_ROUTE_FUNCTION_ID,
  name: 'folder-shares-route',
  description: 'Makes, lists and stops share links for a Documents folder.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: { path: '/files/shares', httpMethod: 'POST', isAuthRequired: true },
});
