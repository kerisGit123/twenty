// Phone formatting and WhatsApp click-to-chat links, shared by the
// server functions and the pages.

export type TenantPhone = {
  primaryPhoneNumber?: string | null;
  primaryPhoneCallingCode?: string | null;
} | null | undefined;

// "+60" + "012-345 6789" -> "+60123456789". Returns null if it can't be
// turned into an international number.
export const toE164 = (phone: TenantPhone): string | null => {
  const raw = (phone?.primaryPhoneNumber ?? '').replace(/[^\d+]/g, '');

  if (!raw) return null;
  if (raw.startsWith('+')) return /^\+\d{8,15}$/.test(raw) ? raw : null;

  const callingCode = (phone?.primaryPhoneCallingCode ?? '').replace(/[^\d+]/g, '');

  if (!callingCode) return null;

  // Local numbers are often written with a trunk "0" (Malaysia: 012-...).
  const e164 = `${callingCode.startsWith('+') ? callingCode : `+${callingCode}`}${raw.replace(/^0+/, '')}`;

  return /^\+\d{8,15}$/.test(e164) ? e164 : null;
};

// https://wa.me/60123456789?text=... opens WhatsApp with the message typed in.
export const whatsappLink = (phone: TenantPhone, text?: string): string | null => {
  const number = toE164(phone);

  if (!number) return null;

  return `https://wa.me/${number.replace('+', '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};
