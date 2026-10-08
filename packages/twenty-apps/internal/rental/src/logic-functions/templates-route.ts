import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { TEMPLATES_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { loadReceiptSettings } from 'src/logic-functions/handlers/send-receipt-handler';
import { appClient } from 'src/logic-functions/utils/app-client';
import { letterheadExtras } from 'src/logic-functions/utils/receipt-settings';
import { resolveScope } from 'src/logic-functions/utils/scope';
import { loadTemplates } from 'src/logic-functions/utils/templates';
import { type Block, type TemplateKind, type TemplateLanguage } from 'src/shared/doc-template/types';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const KINDS: TemplateKind[] = ['RECEIPT', 'STATEMENT'];
const LANGUAGES: TemplateLanguage[] = ['EN', 'MS', 'ZH'];

// POST { action } for the template editor:
//   list { kind? }                                -> saved templates + your letterhead (for the preview)
//   save { id?, name, kind, language, blocks }    -> creates or updates (admins)
//   setDefault { id }                             -> makes it the one used (admins)
//   delete { id }                                 -> removes it (admins)
//   settingsRecord                                -> id of the Receipt settings record (admins)
const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as {
    action?: string;
    id?: string;
    name?: string;
    kind?: string;
    language?: string;
    blocks?: Block[];
    accent?: string;
  };

  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);
    const kind = KINDS.includes(body.kind as TemplateKind) ? (body.kind as TemplateKind) : undefined;

    if (!body.action || body.action === 'list') {
      const [templates, settings] = await Promise.all([loadTemplates(client, kind), loadReceiptSettings(client)]);

      return json({
        success: true,
        canEdit: scope.all,
        templates,
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

    if (!scope.all) return json({ success: false, message: 'Only admins can change templates.' }, 403);

    // The Receipt settings record (made if missing), where the signature image is uploaded.
    if (body.action === 'settingsRecord') {
      const settings = await loadReceiptSettings(client);

      if (settings?.id) return json({ success: true, id: settings.id });

      const { createReceiptSetting } = await client.mutation({
        createReceiptSetting: { __args: { data: { name: 'Receipt settings' } }, id: true },
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

      if (body.id) {
        await client.mutation({ updateDocumentTemplate: { __args: { id: body.id, data: data as never }, id: true } });

        return json({ success: true, id: body.id });
      }

      // The first template of a kind becomes its default.
      const existing = await loadTemplates(client, kind);
      const { createDocumentTemplate } = await client.mutation({
        createDocumentTemplate: { __args: { data: { ...data, isDefault: existing.length === 0 } as never }, id: true },
      });

      return json({ success: true, id: createDocumentTemplate?.id });
    }

    if (!body.id) return json({ success: false, message: 'Pick a template.' }, 400);

    const all = await loadTemplates(client);
    const target = all.find((t) => t.id === body.id);

    if (!target) return json({ success: false, message: 'Template not found.' }, 404);

    if (body.action === 'setDefault') {
      for (const template of all.filter((t) => t.kind === target.kind && t.isDefault !== (t.id === target.id))) {
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
