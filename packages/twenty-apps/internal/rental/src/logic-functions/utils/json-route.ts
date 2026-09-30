import { type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

type RouteResult = { success: boolean; message: string; status?: number };

// Wraps an action as an HTTP route handler: reads { recordId } from the body,
// passes the clicking member's id along, and maps the result to a JSON
// response with a matching status code.
export const jsonRoute =
  (
    action: (recordId: string, workspaceMemberId?: string) => Promise<RouteResult>,
  ) =>
  async (
    event: RoutePayload,
    context?: { workspaceMemberId?: string | null },
  ): Promise<Response> => {
    const body = event.body as { recordId?: string; paymentId?: string } | null;

    try {
      const result = await action(
        body?.recordId ?? body?.paymentId ?? '',
        context?.workspaceMemberId ?? undefined,
      );

      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : (result.status ?? 400),
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('[rental] action failed:', error);

      return new Response(
        JSON.stringify({
          success: false,
          message: `Something went wrong: ${error instanceof Error ? error.message : String(error)}`,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  };
