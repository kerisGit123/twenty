import { type CoreApiClient } from 'twenty-client-sdk/core';

import { presetTemplate } from 'src/shared/doc-template/presets';
import { type TemplateDoc, type TemplateKind, type TemplateLanguage } from 'src/shared/doc-template/types';

// Saved document templates. A template belongs to one workspace or is shared
// (no workspace). Each workspace's documents use its own default, else the
// shared default, else the English sample.

export type SavedTemplate = {
  id: string;
  name: string;
  kind: TemplateKind;
  language: TemplateLanguage;
  isDefault: boolean;
  ownerId: string | null;
  content: TemplateDoc;
};

const asDoc = (content: unknown, kind: TemplateKind, language: TemplateLanguage): TemplateDoc => {
  const doc = content as Partial<TemplateDoc> | null;

  return Array.isArray(doc?.blocks)
    ? { kind, language, blocks: doc.blocks, ...(doc.accent ? { accent: doc.accent } : {}) }
    : presetTemplate(kind, language);
};

export const loadTemplates = async (client: CoreApiClient, kind?: TemplateKind): Promise<SavedTemplate[]> => {
  const { documentTemplates } = await client.query({
    documentTemplates: {
      __args: { ...(kind ? { filter: { kind: { eq: kind } } } : {}), first: 200, orderBy: [{ createdAt: 'AscNullsLast' }] },
      edges: { node: { id: true, name: true, kind: true, language: true, isDefault: true, content: true, ownerId: true } },
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
      ownerId: ((node as { ownerId?: string | null }).ownerId as string | null) ?? null,
      content: asDoc(node.content, nodeKind, language),
    };
  });
};

// The default for a workspace: its own, else the shared one.
const defaultFor = (templates: SavedTemplate[], ownerId?: string | null) =>
  (ownerId ? templates.find((t) => t.isDefault && t.ownerId === ownerId) : undefined) ?? templates.find((t) => t.isDefault && !t.ownerId);

// The template the user asked for, else the workspace's default, else the
// English sample.
export const pickTemplate = async (client: CoreApiClient, kind: TemplateKind, templateId?: string | null, ownerId?: string | null): Promise<TemplateDoc> => {
  const templates = await loadTemplates(client, kind);
  const chosen = (templateId && templates.find((t) => t.id === templateId)) || defaultFor(templates, ownerId);

  return chosen?.content ?? presetTemplate(kind, 'EN');
};

// The template a document is drawn with: the workspace's default (else the
// shared one, else the ready-made sample) — unless the tenant reads Malay or
// Chinese and there's a template in that language for this workspace.
// (Everyone starts as English, so English means "not chosen".)
export const templateForDocument = async (
  client: CoreApiClient,
  kind: TemplateKind,
  ownerId?: string | null,
  tenantLanguage?: string | null,
): Promise<TemplateDoc> => {
  const usable = (await loadTemplates(client, kind)).filter((t) => !t.ownerId || t.ownerId === ownerId);
  const fallback = defaultFor(usable, ownerId);
  const wanted = tenantLanguage === 'MS' || tenantLanguage === 'ZH' ? (tenantLanguage as TemplateLanguage) : null;

  if (wanted && fallback?.language !== wanted) {
    const inLanguage =
      usable.find((t) => t.language === wanted && t.ownerId === ownerId && t.isDefault) ??
      usable.find((t) => t.language === wanted && t.ownerId === ownerId) ??
      usable.find((t) => t.language === wanted && !t.ownerId);

    if (inLanguage) return inLanguage.content;
  }

  return fallback?.content ?? presetTemplate(kind, wanted ?? fallback?.language ?? 'EN');
};

export const defaultTemplate = async (client: CoreApiClient, kind: TemplateKind, ownerId?: string | null): Promise<TemplateDoc | null> =>
  defaultFor(await loadTemplates(client, kind), ownerId)?.content ?? null;
