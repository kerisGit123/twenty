import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { TEMPLATES_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { loadReceiptSettings, loadReceiptSettingsRecord } from 'src/logic-functions/handlers/send-receipt-handler';
import { appClient } from 'src/logic-functions/utils/app-client';
import { letterheadExtras } from 'src/logic-functions/utils/receipt-settings';
import { canManage, inScope, resolveScope, type Scope } from 'src/logic-functions/utils/scope';
import { loadTemplates } from 'src/logic-functions/utils/templates';
import { type Block, type TemplateKind, type TemplateLanguage } from 'src/shared/doc-template/types';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const KINDS: TemplateKind[] = ['RECEIPT', 'STATEMENT'];
const LANGUAGES: TemplateLanguage[] = ['EN', 'MS', 'ZH'];

// POST { action } for the template editor. A template is shared (no
// workspace; admins change it) or belongs to one workspace (its hosts too).
//   list { kind?, ownerId? }                               -> templates you can use + that workspace's letterhead
//   save { id?, name, kind, language, blocks, ownerId? }   -> creates or updates
//   setDefault { id }                                      -> the one its workspace (or everyone) uses
//   delete { id }                                          -> removes it
//   settingsRecord { ownerId? }                            -> id of the Receipt settings record to upload images to

// Who may change a template or settings of a workspace (none: shared ones).
const mayChange = (scope: Scope, ownerId: string | null | undefined) => (ownerId ? canManage(scope, ownerId) : scope.all);
const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as {
    action?: string;
    id?: string;
    name?: string;
    kind?: string;
    language?: string;
    blocks?: Block[];
    accent?: string;
    ownerId?: string | null;
  };
  const ownerId = body.ownerId || null;

  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);
    const kind = KINDS.includes(body.kind as TemplateKind) ? (body.kind as TemplateKind) : undefined;

    if (!body.action || body.action === 'list') {
      if (ownerId && !inScope(scope, ownerId)) return json({ success: false, message: "You don't have access to this workspace." }, 403);
      const [templates, settings, { owners }] = await Promise.all([
        loadTemplates(client, kind),
        loadReceiptSettings(client, ownerId),
        client.query({ owners: { __args: { first: 200, orderBy: [{ name: 'AscNullsLast' }] }, edges: { node: { id: true, name: true } } } }),
      ]);

      return json({
        success: true,
        canEdit: mayChange(scope, ownerId),
        canEditShared: scope.all,
        // Shared view: the shared templates. A workspace: shared + its own.
        templates: templates.filter((t) => !t.ownerId || t.ownerId === ownerId),
        owners: (owners?.edges ?? []).filter(({ node }) => inScope(scope, node.id)).map(({ node }) => ({ id: node.id, name: node.name ?? 'Workspace', canEdit: canManage(scope, node.id) })),
        letterhead: {
          name: settings?.businessName ?? '',
          details: settings?.businessDetails ?? '',
          accent: (settings?.accentColor as string | null) ?? 'TEAL',
          receivedBy: settings?.receivedBy ?? '',
          footer: settings?.footerText ?? '',
          rentTitle: settings?.rentTitle ?? '',
          depositTitle: settings?.depositTitle ?? '',
          ...letterheadExtras(settings),
        },
      });
    }

    // The Receipt settings record (made if missing) of a workspace, or the
    // default one, where the logo, QR and signature are uploaded.
    if (body.action === 'settingsRecord') {
      if (!mayChange(scope, ownerId)) return json({ success: false, message: ownerId ? 'Only the workspace’s hosts can change its settings.' : 'Only admins can change the default settings.' }, 403);
      const record = await loadReceiptSettingsRecord(client, ownerId);

      if (record?.id) return json({ success: true, id: record.id });

      const { createReceiptSetting } = await client.mutation({
        createReceiptSetting: { __args: { data: { name: ownerId ? 'Receipt settings (workspace)' : 'Receipt settings', ...(ownerId ? { ownerId } : {}) } as never }, id: true },
      });

      return json({ success: true, id: createReceiptSetting?.id });
    }

    if (body.action === 'save') {
      if (!kind) return json({ success: false, message: 'Pick receipt or year statement.' }, 400);
      if (!Array.isArray(body.blocks)) return json({ success: false, message: 'The template has no blocks.' }, 400);

      const language = LANGUAGES.includes(body.language as TemplateLanguage) ? (body.language as TemplateLanguage) : 'EN';
      const data = {
        name: body.name?.trim() || 'Template',
        kind,
        language,
        content: {
          kind,
          language,
          blocks: body.blocks,
          ...(['TEAL', 'NAVY', 'GREEN', 'MAROON', 'BLACK'].includes(body.accent ?? '') ? { accent: body.accent } : {}),
        },
      };

      if (!mayChange(scope, ownerId)) return json({ success: false, message: ownerId ? 'Only the workspace’s hosts can change its templates.' : 'Only admins can change shared templates.' }, 403);

      const existing = await loadTemplates(client, kind);

      if (body.id) {
        const current = existing.find((t) => t.id === body.id);

        if (!current) return json({ success: false, message: 'Template not found.' }, 404);
        if (!mayChange(scope, current.ownerId)) return json({ success: false, message: 'You can’t change this template.' }, 403);
        // Moving it to another workspace: it stops being the default where it was.
        const moved = (current.ownerId ?? null) !== ownerId;

        await client.mutation({
          updateDocumentTemplate: { __args: { id: body.id, data: { ...data, ownerId, ...(moved ? { isDefault: false } : {}) } as never }, id: true },
        });

        return json({ success: true, id: body.id });
      }

      // The first template of a kind for a workspace (or shared) becomes its default.
      const { createDocumentTemplate } = await client.mutation({
        createDocumentTemplate: {
          __args: { data: { ...data, ownerId, isDefault: !existing.some((t) => (t.ownerId ?? null) === ownerId) } as never },
          id: true,
        },
      });

      return json({ success: true, id: createDocumentTemplate?.id });
    }

    if (!body.id) return json({ success: false, message: 'Pick a template.' }, 400);

    const all = await loadTemplates(client);
    const target = all.find((t) => t.id === body.id);

    if (!target) return json({ success: false, message: 'Template not found.' }, 404);
    if (!mayChange(scope, target.ownerId)) return json({ success: false, message: 'You can’t change this template.' }, 403);

    if (body.action === 'setDefault') {
      // Default among its own group: that workspace's templates, or the shared ones.
      for (const template of all.filter((t) => t.kind === target.kind && (t.ownerId ?? null) === (target.ownerId ?? null) && t.isDefault !== (t.id === target.id))) {
        await client.mutation({
          updateDocumentTemplate: { __args: { id: template.id, data: { isDefault: template.id === target.id } as never }, id: true },
        });
      }

      return json({ success: true });
    }

    if (body.action === 'delete') {
      await client.mutation({ deleteDocumentTemplate: { __args: { id: target.id }, id: true } });

      return json({ success: true });
    }

    return json({ success: false, message: `Unknown action: ${body.action}` }, 400);
  } catch (error) {
    console.error('[rental] templates failed:', error);

    return json({ success: false, message: error instanceof Error ? error.message : String(error) }, 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: TEMPLATES_ROUTE_FUNCTION_ID,
  name: 'templates-route',
  description: 'Lists and saves receipt and year statement templates.',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/templates', httpMethod: 'POST', isAuthRequired: true },
});
