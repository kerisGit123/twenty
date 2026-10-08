import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { appClient, appMetadataClient } from 'src/logic-functions/utils/app-client';
import { canManage, resolveScope } from 'src/logic-functions/utils/scope';
import { loadAllReceiptSettings } from 'src/logic-functions/handlers/send-receipt-handler';
import { type ReceiptSettingsRecord } from 'src/logic-functions/utils/receipt-settings';

const EDITABLE = [
  'template',
  'accentColor',
  'businessName',
  'businessDetails',
  'rentTitle',
  'depositTitle',
  'receivedBy',
  'footerText',
  'paymentDetails',
  'receiptPrefix',
] as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const workspaceName = async () => {
  try {
    const result = (await appMetadataClient().query({
      currentWorkspace: { displayName: true },
    } as never)) as { currentWorkspace?: { displayName?: string | null } };

    return result.currentWorkspace?.displayName ?? '';
  } catch {
    return '';
  }
};

// POST { action: 'get', ownerId? } -> that workspace's own settings (none:
//   the default ones), the default ones (shown as what's used when a field
//   is left empty), and the workspaces you may set up.
// POST { action: 'save', ownerId?, values } -> creates or updates that record.
// The default is for admins; a workspace's own settings for its hosts too.
const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as { action?: string; ownerId?: string | null; values?: ReceiptSettingsRecord };
  const ownerId = body.ownerId || null;

  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);
    const allowed = ownerId ? canManage(scope, ownerId) : scope.all;
    const rows = await loadAllReceiptSettings(client);
    const own = ownerId ? rows.find((row) => row.ownerId === ownerId) : rows.find((row) => !row.ownerId);
    const fallback = rows.find((row) => !row.ownerId) ?? null;

    if (body.action !== 'save') {
      const { owners } = await client.query({
        owners: { __args: { first: 200, orderBy: [{ name: 'AscNullsLast' }] }, edges: { node: { id: true, name: true } } },
      });

      return json({
        success: true,
        settings: own ?? null,
        defaults: ownerId ? fallback : null,
        ownerName: ownerId ? ((owners?.edges ?? []).find(({ node }) => node.id === ownerId)?.node.name ?? '') : null,
        // Workspaces with settings of their own, and the ones you may set up.
        owners: (owners?.edges ?? [])
          .filter(({ node }) => canManage(scope, node.id))
          .map(({ node }) => ({ id: node.id, name: node.name ?? 'Workspace', hasOwn: rows.some((row) => row.ownerId === node.id) })),
        canEditDefault: scope.all,
        canEdit: allowed,
        workspaceName: await workspaceName(),
        receivedByFallback: process.env.RECEIPT_RECEIVED_BY?.trim() ?? '',
      });
    }

    if (!allowed) {
      return json({ success: false, message: ownerId ? 'Only the workspace’s hosts can change its settings.' : 'Only admins can change the default settings.' }, 403);
    }

    const data: Record<string, string | null> = {};

    for (const key of EDITABLE) {
      const value = body.values?.[key];

      if (value !== undefined) data[key] = typeof value === 'string' ? value.trim().slice(0, 2000) : value;
    }
    if (typeof data.receiptPrefix === 'string') {
      data.receiptPrefix = data.receiptPrefix.toUpperCase();
      if (data.receiptPrefix && !/^[A-Z0-9]{1,8}$/.test(data.receiptPrefix)) {
        return json({ success: false, message: 'The receipt prefix is 1–8 letters or digits, e.g. RCP or CA.' }, 400);
      }
    }

    if (own?.id) {
      await client.mutation({
        updateReceiptSetting: { __args: { id: own.id, data }, id: true },
      });
    } else {
      await client.mutation({
        createReceiptSetting: { __args: { data: { name: ownerId ? 'Receipt settings (workspace)' : 'Receipt settings', ...data, ...(ownerId ? { ownerId } : {}) } as never }, id: true },
      });
    }

    return json({ success: true, message: 'Receipt settings saved. New receipts will use them.' });
  } catch (error) {
    console.error('[rental] receipt settings failed:', error);

    return json(
      { success: false, message: `Could not save: ${error instanceof Error ? error.message : String(error)}` },
      500,
    );
  }
};

export default defineLogicFunction({
  universalIdentifier: '0acd4b84-ed09-4366-bcc1-59656afd95ea',
  name: 'receipt-settings-route',
  description: 'Loads and saves receipt settings: the default and each workspace’s own.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: { path: '/receipts/settings', httpMethod: 'POST', isAuthRequired: true },
});
