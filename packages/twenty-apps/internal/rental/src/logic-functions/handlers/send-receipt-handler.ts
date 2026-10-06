import { CoreApiClient } from 'twenty-client-sdk/core';

import { appClient, appMetadataClient } from 'src/logic-functions/utils/app-client';
import { inScope, NOT_ALLOWED, resolveScope } from 'src/logic-functions/utils/scope';
import { PAYMENT_RECEIPT_FILE_FIELD_ID } from 'src/constants/universal-identifiers';
import { ringgitInWords } from 'src/logic-functions/utils/amount-in-words';
import { daysInMonth, toMalaysiaDate, todayIso } from 'src/logic-functions/utils/dates';
import { buildTemplatePdf } from 'src/logic-functions/utils/template-pdf';
import { defaultTemplate } from 'src/logic-functions/utils/templates';
import { type ReceiptFacts, receiptContext } from 'src/shared/doc-template/context';
import {
  type ReceiptSettingsRecord,
  resolveStyle,
  resolveTitle,
} from 'src/logic-functions/utils/receipt-settings';
import {
  publicFileUrl,
  sendWhatsappReceipt,
  toE164,
  whatsappConfig,
} from 'src/logic-functions/utils/whatsapp';
import {
  buildReceiptPdf,
  type ReceiptData,
  type ReceiptPaymentMethod,
} from 'src/logic-functions/utils/receipt-pdf';

// preview: DRAFT-watermarked PDF, no number used, status unchanged.
// send:    assigns the receipt number, final PDF, emails the tenant →
//          Sent (or Issued when it can't be emailed).
// void:    keeps the number, VOID-watermarked PDF → Void.
// regenerate: rebuilds the PDF from the payment's current details, matching
//          its status (Draft → DRAFT preview, Issued/Sent → final, Void →
//          VOID). Never assigns a number, changes status or sends anything.
// issue:   like send (number + final PDF), but doesn't deliver it.
// view:    returns the receipt's content (as on the PDF) without creating a file.
export type ReceiptAction = 'preview' | 'send' | 'issue' | 'void' | 'regenerate' | 'view';

export type ReceiptResult = {
  success: boolean;
  receipt?: ReceiptData;
  message: string;
  status?: number;
  receiptNumber?: string;
  // Signed link to the receipt PDF that was just created.
  fileUrl?: string;
  emailed?: boolean;
  whatsapped?: boolean;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// DATE fields arrive as 'YYYY-MM-DD'; format without timezone shifts.
const formatDate = (value?: string | null) => {
  if (!value) return '';
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);

  return `${day} ${MONTHS[month - 1]?.slice(0, 3)} ${year}`;
};

const formatMonth = (value?: string | null) => {
  if (!value) return '';
  const [year, month] = value.slice(0, 10).split('-').map(Number);

  return `${MONTHS[month - 1]} ${year}`;
};

const monthBounds = (value?: string | null) => {
  if (!value) return { from: '', to: '' };
  const [year, month] = value.slice(0, 10).split('-').map(Number);
  const mm = String(month).padStart(2, '0');

  return {
    from: formatDate(`${year}-${mm}-01`),
    to: formatDate(`${year}-${mm}-${daysInMonth(year, month)}`),
  };
};

const formatAddress = (address?: {
  addressStreet1?: string | null;
  addressStreet2?: string | null;
  addressPostcode?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
} | null) =>
  [
    address?.addressStreet1,
    address?.addressStreet2,
    [address?.addressPostcode, address?.addressCity].filter(Boolean).join(' '),
    address?.addressState,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');

const formatAmount = (amountMicros?: number | null, currencyCode?: string | null) => {
  const amount = (amountMicros ?? 0) / 1_000_000;
  const prefix = !currencyCode || currencyCode === 'MYR' ? 'RM' : currencyCode;

  return `${prefix} ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Numbers are never reused: voided receipts keep theirs, so they count too.
const nextReceiptNumber = async (client: CoreApiClient, year: number) => {
  const prefix = `RCP-${year}-`;
  const { rentPayments } = await client.query({
    rentPayments: {
      __args: {
        filter: { receiptNumber: { like: `${prefix}%` } },
        orderBy: [{ receiptNumber: 'DescNullsLast' }],
        first: 1,
      },
      edges: { node: { receiptNumber: true } },
    },
  });
  const last = rentPayments?.edges?.[0]?.node?.receiptNumber ?? '';
  const lastSequence = Number(last.slice(prefix.length)) || 0;

  return `${prefix}${String(lastSequence + 1).padStart(4, '0')}`;
};

// Name of the workspace member who clicked the button, if known.
const memberName = async (client: CoreApiClient, workspaceMemberId?: string) => {
  if (!workspaceMemberId) return '';
  try {
    const { workspaceMembers } = await client.query({
      workspaceMembers: {
        __args: { filter: { id: { eq: workspaceMemberId } }, first: 1 },
        edges: { node: { name: { firstName: true, lastName: true } } },
      },
    });
    const name = workspaceMembers?.edges?.[0]?.node?.name;

    return [name?.firstName, name?.lastName].filter(Boolean).join(' ');
  } catch (error) {
    console.warn('[rental] could not read sender name:', error);

    return '';
  }
};

// The workspace's Receipt settings record, if one has been saved.
export const loadReceiptSettings = async (
  client: CoreApiClient,
): Promise<ReceiptSettingsRecord | null> => {
  try {
    const { receiptSettings } = await client.query({
      receiptSettings: {
        __args: { first: 1, orderBy: [{ createdAt: 'AscNullsLast' }] },
        edges: {
          node: {
            id: true,
            template: true,
            accentColor: true,
            businessName: true,
            businessDetails: true,
            rentTitle: true,
            depositTitle: true,
            receivedBy: true,
            footerText: true,
            paymentDetails: true,
            signature: { url: true },
          },
        },
      },
    });
    const node = receiptSettings?.edges?.[0]?.node;

    if (!node) return null;

    const { signature, ...rest } = node as typeof node & { signature?: Array<{ url?: string | null }> | null };

    return { ...(rest as ReceiptSettingsRecord), signatureUrl: signature?.[0]?.url ?? null };
  } catch (error) {
    console.warn('[rental] could not read receipt settings:', error);

    return null;
  }
};

const workspaceName = async () => {
  try {
    const result = (await appMetadataClient().query({
      currentWorkspace: { displayName: true },
    } as never)) as { currentWorkspace?: { displayName?: string | null } };

    return result.currentWorkspace?.displayName ?? '';
  } catch (error) {
    console.warn('[rental] could not read workspace name:', error);

    return '';
  }
};

const sendWithResend = async (params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  fileName: string;
  pdf: Uint8Array;
}) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      attachments: [
        { filename: params.fileName, content: Buffer.from(params.pdf).toString('base64') },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();

    throw new Error(`Resend rejected the email (${response.status}): ${detail.slice(0, 300)}`);
  }
};

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

export const receiptHandler = async (
  action: ReceiptAction,
  paymentId: string,
  senderWorkspaceMemberId?: string,
): Promise<ReceiptResult> => {
  if (!paymentId) {
    return { success: false, status: 400, message: 'No payment selected.' };
  }

  const client = appClient();

  const { rentPayments } = await client.query({
    rentPayments: {
      __args: { filter: { id: { eq: paymentId } }, first: 1 },
      edges: {
        node: {
          id: true,
          status: true,
          receiptNumber: true,
          receiptSentAt: true,
          receiptDate: true,
          receiptSnapshot: true,
          paymentType: true,
          ownerId: true,
          amount: { amountMicros: true, currencyCode: true },
          paidOn: true,
          rentPeriod: true,
          method: true,
          notes: true,
          tenant: {
            name: { firstName: true, lastName: true },
            emails: { primaryEmail: true },
            phones: { primaryPhoneNumber: true, primaryPhoneCallingCode: true },
          },
          property: {
            name: true,
            propertyAddress: {
              addressStreet1: true,
              addressStreet2: true,
              addressPostcode: true,
              addressCity: true,
              addressState: true,
            },
          },
        },
      },
    },
  });

  const payment = rentPayments?.edges?.[0]?.node;

  if (!payment?.id) {
    return { success: false, status: 404, message: 'Payment not found.' };
  }
  // Only for the sender's workspaces (automations have no sender: full access).
  if (!inScope(await resolveScope(client, senderWorkspaceMemberId), payment.ownerId)) {
    return NOT_ALLOWED;
  }

  const currentStatus = payment.status ?? 'DRAFT';

  // Regenerating follows the status; everything below runs in that mode.
  const mode: Exclude<ReceiptAction, 'regenerate' | 'issue' | 'view'> =
    action === 'issue'
      ? 'send'
      : action !== 'regenerate' && action !== 'view'
        ? action
      : currentStatus === 'VOID'
        ? 'void'
        : currentStatus === 'DRAFT' || !payment.receiptNumber
          ? 'preview'
          : 'send';
  // Viewing shows the receipt as it stands, like a regenerate would.
  const isRegenerate = action === 'regenerate' || action === 'view';

  if (currentStatus === 'VOID' && !isRegenerate) {
    return { success: false, status: 400, message: 'This receipt is void. Create a new payment instead.' };
  }
  if (mode === 'void' && !payment.receiptNumber) {
    return {
      success: false,
      status: 400,
      message: 'Only issued or sent receipts can be voided. Delete the draft instead.',
    };
  }
  if (!payment.amount?.amountMicros) {
    return { success: false, status: 400, message: 'Enter the amount first.' };
  }

  const paidOn = payment.paidOn ?? todayIso();
  const receiptNumber =
    mode === 'preview'
      ? payment.receiptNumber || 'DRAFT'
      : payment.receiptNumber || (await nextReceiptNumber(client, Number(paidOn.slice(0, 4))));

  const tenantName = [payment.tenant?.name?.firstName, payment.tenant?.name?.lastName]
    .filter(Boolean)
    .join(' ');
  const propertyName = payment.property?.name ?? '';
  const isDeposit = payment.paymentType === 'DEPOSIT' || payment.paymentType === 'UTILITY_DEPOSIT';
  const depositLabel = payment.paymentType === 'UTILITY_DEPOSIT' ? 'Utility deposit' : 'Security deposit';
  const description = isDeposit
    ? `${depositLabel}${propertyName ? ` - ${propertyName}` : ''}`
    : `Rent${payment.rentPeriod ? ` for ${formatMonth(payment.rentPeriod)}` : ''}${propertyName ? ` - ${propertyName}` : ''}`;
  const amountText = formatAmount(payment.amount.amountMicros, payment.amount.currencyCode);
  const settings = await loadReceiptSettings(client);
  const issuerName =
    settings?.businessName?.trim() ||
    process.env.RECEIPT_ISSUER_NAME?.trim() ||
    (await workspaceName()) ||
    'Receipt';
  const period = isDeposit ? { from: '', to: '' } : monthBounds(payment.rentPeriod);
  const propertyAddress = formatAddress(payment.property?.propertyAddress);

  // A back-dated receipt keeps its chosen date; otherwise the day it's issued.
  const fixedReceiptDate = (payment.receiptDate as string | null | undefined) ?? null;
  const receiptDateIso =
    fixedReceiptDate ??
    (isRegenerate && payment.receiptSentAt ? toMalaysiaDate(payment.receiptSentAt) : isRegenerate && mode !== 'preview' ? paidOn : todayIso());
  const receivedBy =
    settings?.receivedBy?.trim() ||
    process.env.RECEIPT_RECEIVED_BY?.trim() ||
    (await memberName(client, senderWorkspaceMemberId)) ||
    issuerName;
  const style = resolveStyle(settings);
  const receiptTemplate = await defaultTemplate(client, 'RECEIPT');

  const receiptData: ReceiptData = {
    title: resolveTitle(settings, isDeposit),
    style,
    watermark: mode === 'preview' ? 'DRAFT' : mode === 'void' ? 'VOID' : null,
    issuerName,
    receiptNumber,
    date: formatDate(receiptDateIso),
    receivedFrom: tenantName,
    amountText,
    amountInWords: ringgitInWords(payment.amount.amountMicros / 1_000_000),
    forRentAt: [propertyName, propertyAddress].filter(Boolean).join(' - '),
    periodFrom: period.from,
    periodTo: period.to,
    purpose: isDeposit ? depositLabel : description,
    receivedBy,
    method: (payment.method as ReceiptPaymentMethod | null) ?? null,
    paidOn: formatDate(paidOn),
    notes: payment.notes ?? '',
    ...(receiptTemplate
      ? {
          template: receiptTemplate,
          facts: {
            businessName: issuerName,
            businessDetails: style.businessDetails,
            footerText: style.footerText,
            titleRent: resolveTitle(settings, false),
            titleDeposit: resolveTitle(settings, true),
            receiptNumber,
            dateIso: receiptDateIso,
            paidOnIso: paidOn,
            tenantName,
            amount: payment.amount.amountMicros / 1_000_000,
            propertyName,
            propertyAddress,
            periodMonth: isDeposit ? null : payment.rentPeriod ?? null,
            depositKind: isDeposit ? (payment.paymentType as 'DEPOSIT' | 'UTILITY_DEPOSIT') : null,
            method: payment.method ?? null,
            receivedBy,
            notes: payment.notes ?? '',
            accent: style.accent,
            watermark: null,
          } satisfies ReceiptFacts,
        }
      : {}),
  };

  // Issued receipts are shown and voided exactly as they were printed.
  const snapshot = (payment.receiptSnapshot as unknown as ReceiptData | null) ?? null;
  const isFinal = currentStatus === 'ISSUED' || currentStatus === 'SENT' || currentStatus === 'VOID';

  if (action === 'view') {
    const shown =
      isFinal && snapshot
        ? { ...snapshot, watermark: currentStatus === 'VOID' ? ('VOID' as const) : null }
        : receiptData;

    return { success: true, message: 'ok', receiptNumber, receipt: { ...shown, signatureUrl: settings?.signatureUrl ?? null } };
  }

  const printed = mode === 'void' && snapshot ? { ...snapshot, watermark: 'VOID' as const } : receiptData;
  const pdf =
    printed.template && printed.facts
      ? await buildTemplatePdf(
          printed.template,
          receiptContext({ ...printed.facts, watermark: printed.watermark ?? null }, printed.template.language, settings?.signatureUrl),
          `${printed.title} ${printed.receiptNumber}`,
        )
      : await buildReceiptPdf(printed);
  // Saved with final receipts so they keep their look and wording.
  const finalSnapshot = { ...receiptData, watermark: null };
  const fileName =
    mode === 'preview'
      ? 'DRAFT-preview.pdf'
      : mode === 'void'
        ? `${receiptNumber}-VOID.pdf`
        : `${receiptNumber}.pdf`;

  const uploaded = await appMetadataClient().uploadFile({
    fileBuffer: Buffer.from(pdf),
    filename: fileName,
    fieldMetadataUniversalIdentifier: PAYMENT_RECEIPT_FILE_FIELD_ID,
  });
  const receiptFile = [{ fileId: uploaded.id, label: fileName }];

  if (mode === 'preview' || isRegenerate) {
    await client.mutation({
      updateRentPayment: {
        __args: {
          id: payment.id,
          data: { receiptFile, ...(mode === 'send' ? { receiptSnapshot: finalSnapshot } : {}) },
        },
        id: true,
      },
    });

    return {
      success: true,
      fileUrl: uploaded.url,
      message: isRegenerate
        ? 'Receipt PDF updated with the latest details. Nothing was sent.'
        : 'Preview ready: open "Receipt PDF" on this payment. No receipt number was used.',
    };
  }

  if (mode === 'void') {
    await client.mutation({
      updateRentPayment: {
        __args: { id: payment.id, data: { status: 'VOID', receiptFile } },
        id: true,
      },
    });

    return {
      success: true,
      receiptNumber,
      fileUrl: uploaded.url,
      message: `Receipt ${receiptNumber} is now void. It keeps its number; record a new payment if needed.`,
    };
  }

  // send: the receipt is final from here on (Issued), even if emailing fails.
  await client.mutation({
    updateRentPayment: {
      __args: {
        id: payment.id,
        data: {
          receiptNumber,
          paidOn,
          receiptFile,
          receiptSnapshot: finalSnapshot,
          ...(currentStatus === 'SENT' ? {} : { status: 'ISSUED' }),
        },
      },
      id: true,
    },
  });

  if (action === 'issue') {
    return {
      success: true,
      receiptNumber,
      fileUrl: uploaded.url,
      message: `Receipt ${receiptNumber} issued (not sent).`,
    };
  }

  // Deliver on every channel the tenant can be reached on. Each is tried
  // independently, so one failing doesn't block the other.
  const tenantEmail = payment.tenant?.emails?.primaryEmail?.trim();
  const tenantPhone = toE164(payment.tenant?.phones);
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const whatsapp = whatsappConfig();
  const delivered: string[] = [];
  const notSetUp: string[] = [];
  const failures: string[] = [];

  if (tenantEmail && resendKey) {
    const from = process.env.RECEIPT_FROM_EMAIL?.trim() || 'onboarding@resend.dev';

    try {
      await sendWithResend({
        apiKey: resendKey,
        from: `${issuerName} <${from}>`,
        to: tenantEmail,
        subject: `Receipt ${receiptNumber} - ${amountText}`,
        html: `<p>Dear ${escapeHtml(tenantName || 'tenant')},</p>
<p>Thank you for your payment of <strong>${escapeHtml(amountText)}</strong> (${escapeHtml(description)}).</p>
<p>Your receipt <strong>${escapeHtml(receiptNumber)}</strong> is attached.</p>
<p>Regards,<br/>${escapeHtml(issuerName)}</p>`,
        fileName,
        pdf,
      });
      delivered.push(`email (${tenantEmail})`);
    } catch (error) {
      console.warn('[rental] email failed:', error);
      failures.push(`email failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  } else if (tenantEmail) {
    notSetUp.push('email is not set up (add your Resend API key in Settings > Apps > Rental)');
  }

  if (tenantPhone && whatsapp) {
    try {
      const mediaUrl = await publicFileUrl(uploaded.url);

      await sendWhatsappReceipt({
        to: tenantPhone,
        mediaUrl,
        body: `Hi ${tenantName || 'there'}, thank you for your payment of ${amountText} (${description}). Your receipt ${receiptNumber} is attached. - ${issuerName}`,
        templateVariables: {
          '1': tenantName || 'there',
          '2': amountText,
          '3': receiptNumber,
          '4': mediaUrl,
        },
      });
      delivered.push(`WhatsApp (${tenantPhone})`);
    } catch (error) {
      console.warn('[rental] WhatsApp failed:', error);
      failures.push(`WhatsApp failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  } else if (tenantPhone) {
    notSetUp.push('WhatsApp is not set up (add your Twilio details in Settings > Apps > Rental)');
  } else if (payment.tenant?.phones?.primaryPhoneNumber) {
    notSetUp.push("the tenant's phone number needs a country code for WhatsApp");
  }

  if (!tenantEmail && !payment.tenant?.phones?.primaryPhoneNumber) {
    notSetUp.push('the tenant has no email address or phone number');
  }

  if (delivered.length > 0) {
    await client.mutation({
      updateRentPayment: {
        __args: {
          id: payment.id,
          data: { status: 'SENT', receiptSentAt: new Date().toISOString() },
        },
        id: true,
      },
    });
  }

  const issues = [...failures, ...notSetUp];
  const issuesText = issues.length > 0 ? ` Not sent: ${issues.join('; ')}.` : '';

  return {
    // Only an actual delivery failure is an error; "not set up" leaves the
    // receipt issued, ready to send later.
    success: delivered.length > 0 || failures.length === 0,
    status: delivered.length > 0 || failures.length === 0 ? undefined : 502,
    emailed: delivered.some((channel) => channel.startsWith('email')),
    whatsapped: delivered.some((channel) => channel.startsWith('WhatsApp')),
    receiptNumber,
    fileUrl: uploaded.url,
    message:
      delivered.length > 0
        ? `Receipt ${receiptNumber} sent by ${delivered.join(' and ')}.${issuesText}`
        : `Receipt ${receiptNumber} issued.${issuesText}`,
  };
};
