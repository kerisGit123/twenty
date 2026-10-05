import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { TEMPLATE_SAMPLE_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { loadReceiptSettings } from 'src/logic-functions/handlers/send-receipt-handler';
import { appClient } from 'src/logic-functions/utils/app-client';
import { pdfPageResponse } from 'src/logic-functions/utils/pdf-page';
import { buildTemplatePdf } from 'src/logic-functions/utils/template-pdf';
import { loadTemplates } from 'src/logic-functions/utils/templates';
import { receiptContext, statementContext } from 'src/shared/doc-template/context';
import { sampleReceipt, sampleStatement } from 'src/shared/doc-template/samples';

// GET /s/templates/sample?id=<template>&variant=a|b: a saved template drawn as
// a PDF with made-up data, to check it before it's used.

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

const handler = async (event: RoutePayload): Promise<Response> => {
  const query = event.queryStringParameters ?? {};

  try {
    const client = appClient();
    const [templates, settings] = await Promise.all([loadTemplates(client), loadReceiptSettings(client)]);
    const template = templates.find((t) => t.id === query.id);

    if (!template) return html('<p>Save the template first.</p>', 404);

    const letterhead = {
      name: settings?.businessName ?? '',
      details: settings?.businessDetails ?? '',
      accent: (settings?.accentColor as string | null) ?? 'TEAL',
      receivedBy: settings?.receivedBy ?? '',
      footer: settings?.footerText ?? '',
      rentTitle: settings?.rentTitle ?? '',
      depositTitle: settings?.depositTitle ?? '',
    };
    const alternative = query.variant === 'b';
    const context =
      template.kind === 'RECEIPT'
        ? receiptContext({ ...sampleReceipt(letterhead, alternative, true), watermark: 'DRAFT' }, template.language, settings?.signatureUrl)
        : statementContext(sampleStatement(letterhead, alternative), template.language, letterhead.accent, settings?.signatureUrl);
    const pdf = await buildTemplatePdf(template.content, context, `${template.name} (sample)`);

    return pdfPageResponse(pdf, `${template.name.replace(/[^\w\- ()]+/g, '').trim()} - sample.pdf`, `${template.name} — sample`);
  } catch (error) {
    console.error('[rental] template sample failed:', error);

    return html('<p>Could not draw the sample.</p>', 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: TEMPLATE_SAMPLE_ROUTE_FUNCTION_ID,
  name: 'template-sample-route',
  description: 'A saved receipt or statement template drawn as a sample PDF.',
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: { path: '/templates/sample', httpMethod: 'GET', isAuthRequired: true },
});
