import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { appClient, appMetadataClient } from 'src/logic-functions/utils/app-client';
import { resolveScope } from 'src/logic-functions/utils/scope';
import { loadReceiptSettings } from 'src/logic-functions/handlers/send-receipt-handler';
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

// POST { action: 'get' } -> current settings (+ workspace name as fallback)
// POST { action: 'save', values } -> creates or updates the one settings record
const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as { action?: string; values?: ReceiptSettingsRecord };

  try {
    const client = appClient();
    const current = await loadReceiptSettings(client);

    if (body.action === 'save' && !(await resolveScope(client, context?.workspaceMemberId)).all) {
      return json({ success: false, message: 'Only admins can change the receipt settings.' }, 403);
    }

    if (body.action !== 'save') {
      return json({
        success: true,
        settings: current,
        workspaceName: await workspaceName(),
        receivedByFallback: process.env.RECEIPT_RECEIVED_BY?.trim() ?? '',
      });
    }

    const data: Record<string, string | null> = {};

    for (const key of EDITABLE) {
      const value = body.values?.[key];

      if (value !== undefined) data[key] = typeof value === 'string' ? value.trim() : value;
    }

    if (current?.id) {
      await client.mutation({
        updateReceiptSetting: { __args: { id: current.id, data }, id: true },
      });
    } else {
      await client.mutation({
        createReceiptSetting: { __args: { data: { name: 'Receipt settings', ...data } }, id: true },
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
  description: 'Loads and saves the workspace receipt template and wording.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: { path: '/receipts/settings', httpMethod: 'POST', isAuthRequired: true },
});
