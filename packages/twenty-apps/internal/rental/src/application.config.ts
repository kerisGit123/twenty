import { defineApplication } from 'twenty-sdk/define';

import {
  APPLICATION_UNIVERSAL_IDENTIFIER,
  RECEIPT_FROM_EMAIL_VARIABLE_ID,
  RECEIPT_ISSUER_NAME_VARIABLE_ID,
  RESEND_API_KEY_VARIABLE_ID,
} from 'src/constants/universal-identifiers';
import {
  TWILIO_OVERDUE_TEMPLATE_VARIABLE_ID,
  TWILIO_REMINDER_TEMPLATE_VARIABLE_ID,
  TWILIO_SUMMARY_TEMPLATE_VARIABLE_ID,
} from 'src/constants/universal-identifiers-v3';

// Variables are per workspace, so each landlord can use their own Resend
// account and sender address. Set them in Settings → Apps → Rental.
export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: 'Rental',
  description:
    'Track properties, tenants, rent and deposit payments, and send receipts.',
  applicationVariables: {
    RESEND_API_KEY: {
      universalIdentifier: RESEND_API_KEY_VARIABLE_ID,
      description: 'Resend API key used to email receipts (resend.com)',
      value: '',
      isSecret: true,
    },
    RECEIPT_FROM_EMAIL: {
      universalIdentifier: RECEIPT_FROM_EMAIL_VARIABLE_ID,
      description:
        'Sender address for receipts. Must be on a domain verified in Resend. onboarding@resend.dev only delivers to your own Resend account email (testing).',
      value: 'onboarding@resend.dev',
      isSecret: false,
    },
    TWILIO_ACCOUNT_SID: {
      universalIdentifier: '8ec2e28b-cbdf-4eea-9a8b-65b9f6cd199b',
      description: 'Twilio Account SID (starts with AC), for sending receipts on WhatsApp',
      value: '',
      isSecret: false,
    },
    TWILIO_AUTH_TOKEN: {
      universalIdentifier: '6dbec0db-e914-484d-833a-67f24d064bb5',
      description: 'Twilio Auth Token',
      value: '',
      isSecret: true,
    },
    TWILIO_WHATSAPP_FROM: {
      universalIdentifier: 'ec554f55-2be5-49a8-b8a3-0442392f3b88',
      description: 'Your WhatsApp sender number in international format, e.g. +60123456789',
      value: '',
      isSecret: false,
    },
    TWILIO_RECEIPT_TEMPLATE_SID: {
      universalIdentifier: 'a35f7703-8628-4418-a36f-9562c04783a8',
      description:
        'Approved WhatsApp template (Content SID, starts with HX) for receipts. Needed to message tenants who have not written to you in the last 24 hours. Variables: {{1}} tenant name, {{2}} amount, {{3}} receipt no., {{4}} PDF link.',
      value: '',
      isSecret: false,
    },
    TWILIO_SUMMARY_TEMPLATE_SID: {
      universalIdentifier: TWILIO_SUMMARY_TEMPLATE_VARIABLE_ID,
      description:
        'Approved WhatsApp template (HX…) for your morning summary. Without it the summary is sent as plain text, which WhatsApp only delivers within 24h of your last message to the business number. Variables: {{1}} date, {{2}} overdue count, {{3}} overdue amount, {{4}} due this week, {{5}} other items.',
      value: '',
      isSecret: false,
    },
    TWILIO_REMINDER_TEMPLATE_SID: {
      universalIdentifier: TWILIO_REMINDER_TEMPLATE_VARIABLE_ID,
      description:
        'Approved WhatsApp template (HX…) for rent reminders before / on the due day. Variables: {{1}} tenant first name, {{2}} property, {{3}} month, {{4}} amount, {{5}} due date.',
      value: '',
      isSecret: false,
    },
    TWILIO_OVERDUE_TEMPLATE_SID: {
      universalIdentifier: TWILIO_OVERDUE_TEMPLATE_VARIABLE_ID,
      description:
        'Approved WhatsApp template (HX…) for overdue rent reminders. Same variables as the reminder template.',
      value: '',
      isSecret: false,
    },
    RECEIPT_RECEIVED_BY: {
      universalIdentifier: '2b2c1388-43d4-4027-9762-169bf4f92282',
      description:
        'Name printed in "Received by" on receipts. Leave empty to use the name of whoever sends the receipt.',
      value: '',
      isSecret: false,
    },
    RECEIPT_ISSUER_NAME: {
      universalIdentifier: RECEIPT_ISSUER_NAME_VARIABLE_ID,
      description:
        'Name printed at the top of receipts. Leave empty to use the workspace name.',
      value: '',
      isSecret: false,
    },
    API_KEYS_FULL_ACCESS: {
      universalIdentifier: 'b6c1f2a4-3e57-4d8c-9a1e-5f2d7c3b8e91',
      description:
        'Set to "true" to let API keys call the app\'s routes with access to every workspace (for scripts). Leave empty: API keys get nothing.',
      value: '',
      isSecret: false,
    },
    PDF_FONT_CACHE_DIR: {
      universalIdentifier: '46f1e25a-2107-4319-af62-eba539396b87',
      description:
        'Folder where PDF fonts (Noto Sans, Chinese, Tamil) are kept after the first download. Leave empty to use the temp folder.',
      value: '',
      isSecret: false,
    },
  },
});
