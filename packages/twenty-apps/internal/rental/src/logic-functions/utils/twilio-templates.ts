// The WhatsApp templates this app sends, created in Twilio's Content API and
// submitted to WhatsApp for approval from the Notifications page, so nobody
// has to type them into the Twilio Console by hand.
//
// Variables must match what the senders pass (send-receipt-handler.ts and
// notifications.ts). The receipt template attaches the PDF: Twilio only allows
// a variable AFTER a fixed domain, so the media URL is `<storage origin>/{{4}}`
// and the sender passes the rest of the (presigned) URL as {{4}}.

import { splitMediaUrl, whatsappConfig } from 'src/logic-functions/utils/whatsapp';

export type TemplateKey = 'receipt' | 'reminder' | 'overdue' | 'summary';

type TemplateDef = {
  key: TemplateKey;
  friendlyName: string; // also the WhatsApp template name: lowercase, digits, _
  setting: string; // the app setting the HX… SID goes into
  label: string;
  variables: Record<string, string>; // sample values WhatsApp reviews
  types: (mediaOrigin: string | null) => Record<string, unknown> | null;
};

export const TEMPLATES: TemplateDef[] = [
  {
    key: 'receipt',
    friendlyName: 'rental_receipt_v1',
    setting: 'TWILIO_RECEIPT_TEMPLATE_SID',
    label: 'Receipt (PDF attached)',
    variables: { '1': 'Aisyah', '2': 'RM 1,200.00', '3': 'R2026-0001', '4': '' },
    types: (origin) =>
      origin
        ? {
            'twilio/media': {
              body: 'Hi {{1}}, thank you for your payment of {{2}}. Your receipt {{3}} is attached.',
              media: [`${origin}/{{4}}`],
            },
          }
        : null,
  },
  {
    key: 'reminder',
    friendlyName: 'rental_rent_reminder_v1',
    setting: 'TWILIO_REMINDER_TEMPLATE_SID',
    label: 'Rent reminder',
    variables: { '1': 'Aisyah', '2': 'Taman Melati Unit 3A', '3': 'October 2026', '4': 'RM 1,200.00', '5': '5 Oct' },
    types: () => ({
      'twilio/text': { body: 'Hi {{1}}, a friendly reminder that the rent for {{2}} for {{3}} ({{4}}) is due on {{5}}. Thank you!' },
    }),
  },
  {
    key: 'overdue',
    friendlyName: 'rental_rent_overdue_v1',
    setting: 'TWILIO_OVERDUE_TEMPLATE_SID',
    label: 'Overdue rent',
    variables: { '1': 'Aisyah', '2': 'Taman Melati Unit 3A', '3': 'October 2026', '4': 'RM 1,200.00', '5': '5 Oct' },
    types: () => ({
      'twilio/text': {
        body: "Hi {{1}}, our records show the rent for {{2}} for {{3}} ({{4}}), due on {{5}}, hasn't been received yet. If you've already paid, please send the payment slip. Thank you!",
      },
    }),
  },
  {
    key: 'summary',
    friendlyName: 'rental_morning_summary_v1',
    setting: 'TWILIO_SUMMARY_TEMPLATE_SID',
    label: 'Morning summary (to you)',
    variables: { '1': 'Tue 6 Oct', '2': '2', '3': 'RM 2,400.00', '4': '3', '5': '1' },
    types: () => ({
      'twilio/text': {
        body: 'Your rental summary for {{1}}: {{2}} overdue ({{3}}), {{4}} due this week, {{5}} other items. Open the CRM for details.',
      },
    }),
  },
];

const auth = () => {
  const config = whatsappConfig();

  if (!config) throw new Error('Add your Twilio details in Settings → Apps → Rental first.');

  return `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`;
};

const twilio = async <T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> => {
  const response = await fetch(`https://content.twilio.com/v1/${path}`, {
    method: init?.method ?? 'GET',
    headers: { Authorization: auth(), ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const result = (await response.json().catch(() => ({}))) as T & { message?: string; code?: number };

  if (!response.ok) throw new Error(`Twilio (${result.code ?? response.status}): ${result.message ?? 'request failed'}`);

  return result;
};

type ContentWithApprovals = {
  sid: string;
  friendly_name: string;
  approval_requests?: { status?: string; rejection_reason?: string; name?: string } | null;
};

export type TemplateStatus = {
  key: TemplateKey;
  label: string;
  setting: string;
  sid: string | null;
  status: string; // not created | received | pending | approved | rejected | …
  reason?: string;
  inUse: boolean; // the SID is already in the app setting
};

export const templateStatuses = async (): Promise<TemplateStatus[]> => {
  const { contents = [] } = await twilio<{ contents?: ContentWithApprovals[] }>('ContentAndApprovals?PageSize=200');

  return TEMPLATES.map((def) => {
    const found = contents.find((c) => c.friendly_name === def.friendlyName);
    const approval = found?.approval_requests;

    return {
      key: def.key,
      label: def.label,
      setting: def.setting,
      sid: found?.sid ?? null,
      status: found ? (approval?.status ?? 'not submitted') : 'not created',
      reason: approval?.rejection_reason || undefined,
      inUse: Boolean(found && process.env[def.setting]?.trim() === found.sid),
    };
  });
};

// Creates the missing templates and submits each for WhatsApp approval.
// `sampleFileUrl` is a public link to an existing receipt PDF: WhatsApp needs a
// real sample file to review the receipt template.
export const createTemplates = async (sampleFileUrl: string | null): Promise<string[]> => {
  const existing = await templateStatuses();
  const notes: string[] = [];
  const sample = sampleFileUrl ? splitMediaUrl(sampleFileUrl) : null;

  for (const def of TEMPLATES) {
    let sid = existing.find((s) => s.key === def.key)?.sid ?? null;

    if (!sid) {
      const types = def.types(sample?.origin ?? null);

      if (!types) {
        notes.push(`${def.label}: skipped — issue one receipt first, so there's a sample PDF for WhatsApp to review.`);
        continue;
      }

      const variables = def.key === 'receipt' && sample ? { ...def.variables, '4': sample.rest } : def.variables;
      const created = await twilio<{ sid: string }>('Content', {
        method: 'POST',
        body: { friendly_name: def.friendlyName, language: 'en', variables, types },
      });

      sid = created.sid;
      notes.push(`${def.label}: created ${sid}.`);
    }

    const status = existing.find((s) => s.key === def.key)?.status;

    if (status && !['not created', 'not submitted', 'unsubmitted'].includes(status)) continue;

    try {
      await twilio(`Content/${sid}/ApprovalRequests/whatsapp`, {
        method: 'POST',
        body: { name: def.friendlyName, category: 'UTILITY' },
      });
      notes.push(`${def.label}: sent to WhatsApp for approval.`);
    } catch (error) {
      notes.push(`${def.label}: not submitted for approval (${error instanceof Error ? error.message : String(error)}).`);
    }
  }

  return notes;
};
