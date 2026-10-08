import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { appClient } from 'src/logic-functions/utils/app-client';
import { recordChase } from 'src/logic-functions/utils/rent-chase';
import { inScope, NOT_ALLOWED, resolveScope } from 'src/logic-functions/utils/scope';

type Body = {
  contractId?: string;
  months?: string[]; // YYYY-MM-01
  overdue?: string[]; // which of them are late
  to?: string | null;
  body?: string;
  title?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const isMonth = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-01$/.test(value);

// POST /rent/chase — you opened WhatsApp from the Today page to remind a
// tenant about rent: recorded with every other rent reminder, so the
// automatic reminders, the reminder list and Rent-due campaigns don't chase
// them again for a few days.
const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as Body;
  const months = (body.months ?? []).filter(isMonth).slice(0, 36);

  if (!body.contractId || !months.length) return json({ success: false, message: 'Pick a contract and month.' }, 400);

  try {
    const client = appClient();
    const { rentals } = await client.query({
      rentals: {
        __args: { filter: { id: { eq: body.contractId } }, first: 1 },
        edges: { node: { id: true, property: { ownerId: true } } },
      },
    });
    const rental = rentals?.edges?.[0]?.node;

    if (!rental) return json({ success: false, message: 'Contract not found.' }, 404);
    if (!inScope(await resolveScope(client, context?.workspaceMemberId), rental.property?.ownerId)) return json(NOT_ALLOWED, 403);

    const late = months.filter((m) => (body.overdue ?? []).includes(m));
    const early = months.filter((m) => !late.includes(m));
    const base = {
      contractId: rental.id,
      channel: 'TODAY' as const,
      status: 'SENT' as const,
      title: `Today · ${(body.title ?? 'Rent reminder').slice(0, 200)}`,
      to: body.to ?? null,
      body: (body.body ?? '').slice(0, 2000),
    };

    if (late.length) await recordChase(client, { ...base, months: late, kind: 'RENT_OVERDUE' });
    if (early.length) await recordChase(client, { ...base, months: early, kind: 'RENT_UPCOMING' });

    return json({ success: true });
  } catch (error) {
    console.error('[rental] rent chase failed:', error);

    return json({ success: false, message: error instanceof Error ? error.message : String(error) }, 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: '86283cec-15cb-4229-9290-1872b457e66c',
  name: 'rent-chase-route',
  description: 'Records a rent reminder sent from the Today page, so other channels don’t repeat it soon after.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: { path: '/rent/chase', httpMethod: 'POST', isAuthRequired: true },
});
