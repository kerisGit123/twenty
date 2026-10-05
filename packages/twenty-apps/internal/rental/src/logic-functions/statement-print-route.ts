import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { STATEMENT_PRINT_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { loadReceiptSettings } from 'src/logic-functions/handlers/send-receipt-handler';
import { appClient } from 'src/logic-functions/utils/app-client';
import { pdfPageResponse } from 'src/logic-functions/utils/pdf-page';
import { resolveScope } from 'src/logic-functions/utils/scope';
import { loadStatementSource } from 'src/logic-functions/utils/statement-data';
import { buildTemplatePdf } from 'src/logic-functions/utils/template-pdf';
import { pickTemplate } from 'src/logic-functions/utils/templates';
import { statementContext } from 'src/shared/doc-template/context';

// GET /s/statements/print?rental=<id>&year=2025[&template=<id>]: the tenant
// year statement as a PDF, drawn with the chosen (else default) template.

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const query = event.queryStringParameters ?? {};
  const year = Number(query.year ?? new Date().getFullYear());

  if (!query.rental) return html('<p>Pick a contract.</p>', 400);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return html('<p>Pick a year like 2025.</p>', 400);

  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);
    const [source, template, settings] = await Promise.all([
      loadStatementSource(client, scope, query.rental, year),
      pickTemplate(client, 'STATEMENT', query.template),
      loadReceiptSettings(client),
    ]);

    if (!source) return html("<p>You don't have access to this contract.</p>", 403);

    const ctx = statementContext(source, template.language, (settings?.accentColor as string | null) ?? 'BLACK', settings?.signatureUrl);
    const tenant = ctx.values['tenant.name'] || 'tenant';
    const title = `${template.language === 'MS' ? 'Penyata sewa' : 'Rent statement'} ${year} - ${tenant}`;
    const pdf = await buildTemplatePdf(template, ctx, title);

    const share =
      template.language === 'MS'
        ? `Salam, dilampirkan penyata pembayaran sewa bagi tahun ${year}. Terima kasih.`
        : `Hi, attached is your rent statement for ${year}. Thank you.`;

    return pdfPageResponse(pdf, `${title.replace(/[^\w\- ]+/g, '').trim()}.pdf`, title, { text: share });
  } catch (error) {
    console.error('[rental] statement print failed:', error);

    return html('<p>Could not build the statement.</p>', 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: STATEMENT_PRINT_ROUTE_FUNCTION_ID,
  name: 'statement-print-route',
  description: "A tenant's year statement as a PDF, using the statement template.",
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/statements/print', httpMethod: 'GET', isAuthRequired: true },
});
