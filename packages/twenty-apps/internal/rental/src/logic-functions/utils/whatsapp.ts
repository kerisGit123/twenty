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
// With presigned storage URLs enabled (STORAGE_S3_PRESIGNED_URL_ENABLED=true
// on the server), Twenty's file URL redirects to a short-lived public storage
// link; use that. Otherwise fall back to the file URL, which only works once
// the server is on a public address.
const isPrivateHost = (url: string): boolean => {
  try {
    const host = new URL(url).hostname;

    return host === 'localhost' || host.endsWith('.localhost') || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  } catch {
    return true;
  }
};

// Splits a public file URL into the fixed part a media template holds and the
// part passed as its variable: the template's media URL is `${origin}/{{n}}`
// (Twilio only allows variables after a fixed domain).
export const splitMediaUrl = (url: string): { origin: string; rest: string } => {
  const parsed = new URL(url);

  return { origin: parsed.origin, rest: `${parsed.pathname.replace(/^\//, '')}${parsed.search}` };
};

export const publicFileUrl = async (fileUrl: string): Promise<string> => {
  let url = fileUrl;

  try {
    const response = await fetch(fileUrl, { redirect: 'manual' });
    const location = response.headers.get('location');

    if (response.status >= 300 && response.status < 400 && location) {
      url = location;
    }
  } catch (error) {
    console.warn('[rental] could not resolve public file URL:', error);
  }

  // Fail here with a clear reason instead of Twilio failing later (error 63019).
  if (isPrivateHost(url)) {
    throw new Error(
      'the receipt PDF is only reachable on this computer, so WhatsApp cannot download it. Set STORAGE_S3_PRESIGNED_URL_ENABLED=true in the server .env and restart the server.',
    );
  }

  return url;
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
    // Template messages can be sent at any time (approved by WhatsApp). The
    // receipt template attaches the PDF from `<storage origin>/{{4}}`, so {{4}}
    // is the PDF link without its origin.
    form.set('ContentSid', config.templateSid);
    form.set(
      'ContentVariables',
      JSON.stringify({ ...params.templateVariables, '4': splitMediaUrl(params.mediaUrl).rest }),
    );
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

// Any WhatsApp message: an approved template when one is given (can be sent
// at any time), otherwise plain text (WhatsApp only delivers that within 24h
// of the person's last message to your number). Returns the Twilio message id.
export const sendWhatsappMessage = async (params: {
  to: string; // +60123456789
  body: string;
  templateSid?: string;
  templateVariables?: Record<string, string>;
}) => {
  const config = whatsappConfig();

  if (!config) throw new Error('WhatsApp is not set up: add the Twilio settings in Settings → Apps → Rental.');

  const form = new URLSearchParams({ From: config.from, To: `whatsapp:${params.to}` });

  if (params.templateSid) {
    form.set('ContentSid', params.templateSid);
    form.set('ContentVariables', JSON.stringify(params.templateVariables ?? {}));
  } else {
    form.set('Body', params.body);
  }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  const result = (await response.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };

  if (!response.ok) {
    throw new Error(`Twilio rejected the WhatsApp message (${result.code ?? response.status}): ${result.message ?? 'unknown error'}`);
  }

  return result.sid;
};
