import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { NOTIFICATIONS_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { appClient } from 'src/logic-functions/utils/app-client';
import {
  DEFAULT_SETTINGS,
  loadNotificationSettings,
  type NotificationSettings,
  ownNumber,
  previewReminders,
  previewSummary,
  runNotifications,
  sendTest,
} from 'src/logic-functions/utils/notifications';
import { resolveScope } from 'src/logic-functions/utils/scope';
import { whatsappConfig } from 'src/logic-functions/utils/whatsapp';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const EDITABLE: Array<keyof NotificationSettings> = [
  'summaryEnabled',
  'summaryPhone',
  'summaryHour',
  'remindersEnabled',
  'reminderHour',
  'remindDaysBefore',
  'remindOnDueDay',
  'remindDaysAfter',
  'tenantLanguage',
];

// POST { action } for the Notifications page (admins only — it sees every workspace):
//   get                    -> settings, Twilio status, recent log
//   save { values }        -> saves the settings
//   preview { values? }    -> today's summary text and the reminders that would go out
//   test { to? }           -> sends a test WhatsApp (to my number by default)
//   runNow                 -> sends what's due now without waiting for the hour
const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as { action?: string; values?: Partial<NotificationSettings>; to?: string };

  try {
    const client = appClient();

    if (!(await resolveScope(client, context?.workspaceMemberId)).all) {
      return json({ success: false, message: 'Only admins can manage notifications.' }, 403);
    }

    const settings = await loadNotificationSettings(client);

    if (!body.action || body.action === 'get') {
      const { notificationLogs } = await client.query({
        notificationLogs: {
          __args: { first: 40, orderBy: [{ createdAt: 'DescNullsLast' }] },
          edges: { node: { id: true, name: true, kind: true, recipient: true, body: true, status: true, error: true, createdAt: true } },
        },
      });

      return json({
        success: true,
        settings,
        twilioReady: Boolean(whatsappConfig()),
        templates: {
          summary: Boolean(process.env.TWILIO_SUMMARY_TEMPLATE_SID?.trim()),
          reminder: Boolean(process.env.TWILIO_REMINDER_TEMPLATE_SID?.trim()),
          overdue: Boolean(process.env.TWILIO_OVERDUE_TEMPLATE_SID?.trim()),
        },
        log: (notificationLogs?.edges ?? []).map(({ node }) => node),
      });
    }

    if (body.action === 'save') {
      const data: Record<string, unknown> = {};

      for (const key of EDITABLE) {
        if (body.values?.[key] !== undefined) data[key] = body.values[key];
      }
      if (typeof data.summaryPhone === 'string' && data.summaryPhone.trim() && !ownNumber(data.summaryPhone)) {
        return json({ success: false, message: 'That WhatsApp number doesn’t look right. Use +60123456789 or 012-345 6789.' }, 400);
      }

      const { id: _unused, ...defaults } = DEFAULT_SETTINGS;

      if (settings.id) {
        await client.mutation({ updateNotificationSetting: { __args: { id: settings.id, data: data as never }, id: true } });
      } else {
        await client.mutation({
          createNotificationSetting: { __args: { data: { name: 'Notifications', ...defaults, ...data } as never }, id: true },
        });
      }

      return json({ success: true, message: 'Saved.' });
    }

    if (body.action === 'preview') {
      const merged = { ...settings, ...body.values } as NotificationSettings;

      return json({ success: true, summary: await previewSummary(client), reminders: await previewReminders(client, merged) });
    }

    if (body.action === 'test') {
      const to = ownNumber(body.to ?? settings.summaryPhone);

      if (!to) return json({ success: false, message: 'Enter your WhatsApp number first.' }, 400);
      if (!whatsappConfig()) return json({ success: false, message: 'Add your Twilio details in Settings → Apps → Rental first.' }, 400);
      await sendTest(client, to);

      return json({ success: true, message: `Test sent to ${to}. Check WhatsApp.` });
    }

    if (body.action === 'runNow') {
      const result = await runNotifications(client, { summary: true, reminders: true });

      return json({ success: result.configured, message: result.summary });
    }

    return json({ success: false, message: `Unknown action: ${body.action}` }, 400);
  } catch (error) {
    console.error('[rental] notifications route failed:', error);

    return json({ success: false, message: error instanceof Error ? error.message : String(error) }, 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: NOTIFICATIONS_ROUTE_FUNCTION_ID,
  name: 'notifications-route',
  description: 'Settings, preview, test and log for the WhatsApp assistant.',
  timeoutSeconds: 120,
  handler,
  httpRouteTriggerSettings: { path: '/notifications', httpMethod: 'POST', isAuthRequired: true },
});
