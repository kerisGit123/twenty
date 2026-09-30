import { CoreApiClient } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';

import { PAYMENT_RECEIPT_FILE_FIELD_ID } from 'src/constants/universal-identifiers';
import { ringgitInWords } from 'src/logic-functions/utils/amount-in-words';
import { daysInMonth, todayIso } from 'src/logic-functions/utils/dates';
import {
  buildReceiptPdf,
  type ReceiptPaymentMethod,
} from 'src/logic-functions/utils/receipt-pdf';

// preview: DRAFT-watermarked PDF, no number used, status unchanged.
// send:    assigns the receipt number, final PDF, emails the tenant →
//          Sent (or Issued when it can't be emailed).
// void:    keeps the number, VOID-watermarked PDF → Void.
export type ReceiptAction = 'preview' | 'send' | 'void';

export type ReceiptResult = {
  success: boolean;
  message: string;
  status?: number;
  receiptNumber?: string;
  emailed?: boolean;
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

const workspaceName = async () => {
  try {
    const result = (await new MetadataApiClient().query({
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

  const client = new CoreApiClient();

  const { rentPayments } = await client.query({
    rentPayments: {
      __args: { filter: { id: { eq: paymentId } }, first: 1 },
      edges: {
        node: {
          id: true,
          status: true,
          receiptNumber: true,
          paymentType: true,
          amount: { amountMicros: true, currencyCode: true },
          paidOn: true,
          rentPeriod: true,
          method: true,
          notes: true,
          tenant: {
            name: { firstName: true, lastName: true },
            emails: { primaryEmail: true },
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

  const currentStatus = payment.status ?? 'DRAFT';

  if (currentStatus === 'VOID') {
    return { success: false, status: 400, message: 'This receipt is void. Create a new payment instead.' };
  }
  if (action === 'void' && !payment.receiptNumber) {
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
    action === 'preview'
      ? payment.receiptNumber || 'DRAFT'
      : payment.receiptNumber || (await nextReceiptNumber(client, Number(paidOn.slice(0, 4))));

  const tenantName = [payment.tenant?.name?.firstName, payment.tenant?.name?.lastName]
    .filter(Boolean)
    .join(' ');
  const propertyName = payment.property?.name ?? '';
  const isDeposit = payment.paymentType === 'DEPOSIT';
  const description = isDeposit
    ? `Security deposit${propertyName ? ` - ${propertyName}` : ''}`
    : `Rent${payment.rentPeriod ? ` for ${formatMonth(payment.rentPeriod)}` : ''}${propertyName ? ` - ${propertyName}` : ''}`;
  const amountText = formatAmount(payment.amount.amountMicros, payment.amount.currencyCode);
  const issuerName = process.env.RECEIPT_ISSUER_NAME?.trim() || (await workspaceName()) || 'Receipt';
  const period = isDeposit ? { from: '', to: '' } : monthBounds(payment.rentPeriod);
  const propertyAddress = formatAddress(payment.property?.propertyAddress);

  const pdf = await buildReceiptPdf({
    title: isDeposit ? 'DEPOSIT RECEIPT' : 'RENT RECEIPT',
    watermark: action === 'preview' ? 'DRAFT' : action === 'void' ? 'VOID' : null,
    issuerName,
    receiptNumber,
    date: formatDate(todayIso()),
    receivedFrom: tenantName,
    amountText,
    amountInWords: ringgitInWords(payment.amount.amountMicros / 1_000_000),
    forRentAt: [propertyName, propertyAddress].filter(Boolean).join(' - '),
    periodFrom: period.from,
    periodTo: period.to,
    purpose: isDeposit ? 'Security deposit' : description,
    receivedBy:
      process.env.RECEIPT_RECEIVED_BY?.trim() ||
      (await memberName(client, senderWorkspaceMemberId)) ||
      issuerName,
    method: (payment.method as ReceiptPaymentMethod | null) ?? null,
    paidOn: formatDate(paidOn),
    notes: payment.notes ?? '',
  });
  const fileName =
    action === 'preview'
      ? 'DRAFT-preview.pdf'
      : action === 'void'
        ? `${receiptNumber}-VOID.pdf`
        : `${receiptNumber}.pdf`;

  const uploaded = await new MetadataApiClient().uploadFile({
    fileBuffer: Buffer.from(pdf),
    filename: fileName,
    fieldMetadataUniversalIdentifier: PAYMENT_RECEIPT_FILE_FIELD_ID,
  });
  const receiptFile = [{ fileId: uploaded.id, label: fileName }];

  if (action === 'preview') {
    await client.mutation({
      updateRentPayment: { __args: { id: payment.id, data: { receiptFile } }, id: true },
    });

    return {
      success: true,
      message: 'Preview ready: open "Receipt PDF" on this payment. No receipt number was used.',
    };
  }

  if (action === 'void') {
    await client.mutation({
      updateRentPayment: {
        __args: { id: payment.id, data: { status: 'VOID', receiptFile } },
        id: true,
      },
    });

    return {
      success: true,
      receiptNumber,
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
          ...(currentStatus === 'SENT' ? {} : { status: 'ISSUED' }),
        },
      },
      id: true,
    },
  });

  const tenantEmail = payment.tenant?.emails?.primaryEmail?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!tenantEmail) {
    return {
      success: true,
      emailed: false,
      receiptNumber,
      message: `Receipt ${receiptNumber} issued. The tenant has no email address, so it was not emailed.`,
    };
  }
  if (!apiKey) {
    return {
      success: true,
      emailed: false,
      receiptNumber,
      message: `Receipt ${receiptNumber} issued. Add your Resend API key in Settings > Apps > Rental to email it.`,
    };
  }

  const from = process.env.RECEIPT_FROM_EMAIL?.trim() || 'onboarding@resend.dev';

  try {
    await sendWithResend({
      apiKey,
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
  } catch (error) {
    console.warn('[rental] email failed:', error);

    return {
      success: false,
      status: 502,
      receiptNumber,
      message: `Receipt ${receiptNumber} issued, but emailing failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }

  await client.mutation({
    updateRentPayment: {
      __args: {
        id: payment.id,
        data: { status: 'SENT', receiptSentAt: new Date().toISOString() },
      },
      id: true,
    },
  });

  return {
    success: true,
    emailed: true,
    receiptNumber,
    message: `Receipt ${receiptNumber} sent to ${tenantEmail}.`,
  };
};
