// Sending receipts on WhatsApp through Twilio.

import { type TenantPhone, toE164 } from 'src/shared/whatsapp-link';

export { toE164, type TenantPhone };

export const whatsappConfig = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim();

  if (!accountSid || !authToken || !from) return null;

  return {
    accountSid,
    authToken,
    from: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
    templateSid: process.env.TWILIO_RECEIPT_TEMPLATE_SID?.trim() || undefined,
  };
};

// Twilio downloads the attachment itself, so it needs a URL it can reach.
// With presigned storage URLs enabled, Twenty's file URL redirects to a
// short-lived public storage link; use that. Otherwise fall back to the file
// URL (works once the server is on a public address).
export const publicFileUrl = async (fileUrl: string): Promise<string> => {
  try {
    const response = await fetch(fileUrl, { redirect: 'manual' });
    const location = response.headers.get('location');

    if (response.status >= 300 && response.status < 400 && location) {
      return location;
    }
  } catch (error) {
    console.warn('[rental] could not resolve public file URL:', error);
  }

  return fileUrl;
};

export const sendWhatsappReceipt = async (params: {
  to: string;
  body: string;
  mediaUrl: string;
  templateVariables: Record<string, string>;
}) => {
  const config = whatsappConfig();

  if (!config) throw new Error('WhatsApp is not set up');

  const form = new URLSearchParams({ From: config.from, To: `whatsapp:${params.to}` });

  if (config.templateSid) {
    // Template messages can be sent at any time (approved by WhatsApp).
    form.set('ContentSid', config.templateSid);
    form.set('ContentVariables', JSON.stringify(params.templateVariables));
  } else {
    // Free-form: only delivered within 24h of the tenant's last message.
    form.set('Body', params.body);
    form.set('MediaUrl', params.mediaUrl);
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    },
  );

  const result = (await response.json().catch(() => ({}))) as {
    sid?: string;
    message?: string;
    code?: number;
  };

  if (!response.ok) {
    throw new Error(`Twilio rejected the WhatsApp message (${result.code ?? response.status}): ${result.message ?? 'unknown error'}`);
  }

  return result.sid;
};
