import { type CoreApiClient } from 'twenty-client-sdk/core';

import { presetTemplate } from 'src/shared/doc-template/presets';
import { type TemplateDoc, type TemplateKind, type TemplateLanguage } from 'src/shared/doc-template/types';

// Saved document templates. Without a saved default, the English sample is used.

export type SavedTemplate = {
  id: string;
  name: string;
  kind: TemplateKind;
  language: TemplateLanguage;
  isDefault: boolean;
  content: TemplateDoc;
};

const asDoc = (content: unknown, kind: TemplateKind, language: TemplateLanguage): TemplateDoc => {
  const doc = content as Partial<TemplateDoc> | null;

  return Array.isArray(doc?.blocks) ? { kind, language, blocks: doc.blocks } : presetTemplate(kind, language);
};

export const loadTemplates = async (client: CoreApiClient, kind?: TemplateKind): Promise<SavedTemplate[]> => {
  const { documentTemplates } = await client.query({
    documentTemplates: {
      __args: { ...(kind ? { filter: { kind: { eq: kind } } } : {}), first: 200, orderBy: [{ createdAt: 'AscNullsLast' }] },
      edges: { node: { id: true, name: true, kind: true, language: true, isDefault: true, content: true } },
    },
  });

  return (documentTemplates?.edges ?? []).map(({ node }) => {
    const nodeKind = ((node.kind as string | null) ?? 'RECEIPT') as TemplateKind;
    const language = ((node.language as string | null) ?? 'EN') as TemplateLanguage;

    return {
      id: node.id,
      name: node.name ?? 'Template',
      kind: nodeKind,
      language,
      isDefault: Boolean(node.isDefault),
      content: asDoc(node.content, nodeKind, language),
    };
  });
};

// The template to use: the one asked for, else the default of its kind, else
// the English sample.
export const pickTemplate = async (client: CoreApiClient, kind: TemplateKind, templateId?: string | null): Promise<TemplateDoc> => {
  const templates = await loadTemplates(client, kind);
  const chosen = (templateId && templates.find((t) => t.id === templateId)) || templates.find((t) => t.isDefault);

  return chosen?.content ?? presetTemplate(kind, 'EN');
};


// The saved default of a kind, or null (receipts then use their classic design).
export const defaultTemplate = async (client: CoreApiClient, kind: TemplateKind): Promise<TemplateDoc | null> =>
  (await loadTemplates(client, kind)).find((t) => t.isDefault)?.content ?? null;
