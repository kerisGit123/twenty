import { defineApplication } from 'twenty-sdk/define';

import {
  APPLICATION_UNIVERSAL_IDENTIFIER,
  RECEIPT_FROM_EMAIL_VARIABLE_ID,
  RECEIPT_ISSUER_NAME_VARIABLE_ID,
  RESEND_API_KEY_VARIABLE_ID,
} from 'src/constants/universal-identifiers';

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
  },
});
