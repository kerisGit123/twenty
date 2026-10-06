import { defineLogicFunction } from 'twenty-sdk/define';

import { NOTIFICATIONS_CRON_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { appClient } from 'src/logic-functions/utils/app-client';
import { rollAllCampaigns } from 'src/logic-functions/utils/campaign-rows';
import { runNotifications } from 'src/logic-functions/utils/notifications';

// Every hour: sends the morning summary and tenant rent reminders once their
// hour (Malaysia time) has come. Each message goes out once (see the
// Notification log), so running every hour is safe.
const handler = async () => {
  try {
    // Repeating campaigns start their new round before Today is summarised.
    await rollAllCampaigns(appClient()).catch((error) => console.error('[rental] campaign roll failed:', error));
    const result = await runNotifications(appClient());

    if (result.sent || result.failed) console.log('[rental] notifications:', result.summary);

    return result;
  } catch (error) {
    console.error('[rental] notifications failed:', error);

    return { configured: true, summary: error instanceof Error ? error.message : String(error), sent: 0, failed: 0, skipped: 0 };
  }
};

export default defineLogicFunction({
  universalIdentifier: NOTIFICATIONS_CRON_FUNCTION_ID,
  name: 'notifications-cron',
  description: 'Hourly: WhatsApp morning summary and tenant rent reminders.',
  timeoutSeconds: 120,
  cronTriggerSettings: { pattern: '0 * * * *' },
  handler,
});
