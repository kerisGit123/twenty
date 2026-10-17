import { type CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { EXPENSE_RECEIPT_FIELD_ID } from 'src/constants/universal-identifiers-v2';
import { DOCUMENT_FILES_FIELD_ID, FILES_ROUTE_FUNCTION_ID } from 'src/constants/universal-identifiers-v3';
import { CAMPAIGN_MEDIA_FIELD_ID } from 'src/constants/universal-identifiers-v4';
import { MAX_MEDIA_FILES, MAX_VIDEO_BYTES, MEDIA_EXTENSIONS, VIDEO_EXTENSIONS } from 'src/shared/campaigns';
import { appClient, appUploadClient } from 'src/logic-functions/utils/app-client';
import { propertyOwnerId } from 'src/logic-functions/utils/owner-sync';
import { inScope, NOT_ALLOWED, resolveScope, type Scope } from 'src/logic-functions/utils/scope';
import {
  ALLOWED_EXTENSIONS,
  CONTRACT_CHECKLIST,
  type ContractDoc,
  type LibraryDoc,
  DOC_TYPES,
  docType,
  extensionOf,
  formatBytes,
  MAX_UPLOAD_BYTES,
  FREE_STORAGE_BYTES,
} from 'src/shared/documents';

// POST /files — documents and attachments from the rental pages. Files are
// sent as base64 (routes take JSON), stored through Twenty's file storage
// (Cloudflare R2 here), and attached to a document or an expense after the
// caller's workspace access is checked.
//
//   { action: 'contractDocs', rentalId }
//   { action: 'upload', file: { name, type, data }, documentId? | newDocument? | expenseId? }
//   { action: 'update', documentId, name?, type?, expiresOn? }
//   { action: 'removeFile', documentId, fileId }
//   { action: 'delete', documentId }
//   { action: 'listDeleted' } | { action: 'restore', documentId }
//   { action: 'link', documentId, rentalId }

type FileValue = { fileId: string; label: string; url?: string | null; extension?: string | null };

type Body = {
  action?: string;
  rentalId?: string;
  documentId?: string;
  expenseId?: string;
  campaignId?: string;
  fileId?: string;
  name?: string;
  type?: string;
  expiresOn?: string | null;
  propertyId?: string | null;
  notes?: string;
  file?: { name?: string; type?: string; data?: string };
  newDocument?: { type?: string; name?: string; rentalId?: string | null; propertyId?: string | null; personId?: string | null; ownerId?: string | null };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const fail = (message: string, status = 400) => json({ success: false, message }, status);

const DOC_FIELDS = {
  id: true,
  name: true,
  documentType: true,
  expiresOn: true,
  createdAt: true,
  rentalId: true,
  propertyId: true,
  personId: true,
  ownerId: true,
  files: { fileId: true, label: true, url: true, extension: true },
  fileSizes: true,
} as const;

type DocRow = {
  id: string;
  name?: string | null;
  documentType?: string | null;
  expiresOn?: string | null;
  createdAt?: string | null;
  rentalId?: string | null;
  propertyId?: string | null;
  personId?: string | null;
  ownerId?: string | null;
  files?: FileValue[] | null;
  fileSizes?: Record<string, number> | null;
};

const toDoc = (row: DocRow): ContractDoc => ({
  id: row.id,
  name: row.name ?? '',
  type: row.documentType ?? 'OTHER',
  expiresOn: row.expiresOn ?? null,
  createdAt: row.createdAt ?? '',
  rentalId: row.rentalId ?? null,
  files: (row.files ?? [])
    .filter((f) => f?.fileId)
    .map((f) => ({
      fileId: f.fileId,
      label: f.label || 'File',
      url: f.url ?? '',
      // Stored as '.png'; fall back to the file name.
      extension: (f.extension ?? '').replace(/^\./, '').toLowerCase() || extensionOf(f.label ?? ''),
    })),
});

const loadContract = async (client: CoreApiClient, rentalId: string) => {
  const { rentals } = await client.query({
    rentals: {
      __args: { filter: { id: { eq: rentalId } }, first: 1 },
      edges: { node: { id: true, name: true, propertyId: true, tenantId: true, renewalOfId: true, property: { name: true, ownerId: true } } },
    },
  });

  return rentals?.edges?.[0]?.node ?? null;
};

const queryDocs = async (client: CoreApiClient, filter: Record<string, unknown>) => {
  const { documents } = await client.query({
    documents: { __args: { filter: filter as never, first: 200, orderBy: [{ createdAt: 'AscNullsLast' }] }, edges: { node: DOC_FIELDS } },
  });

  return ((documents?.edges ?? []).map(({ node }) => node) as unknown as DocRow[]).map((row) => row);
};

const loadDoc = async (client: CoreApiClient, documentId: string) => (await queryDocs(client, { id: { eq: documentId } }))[0] ?? null;

// A document is reachable through its own workspace, or its contract's.
const canUseDoc = async (client: CoreApiClient, scope: Scope, doc: DocRow) => {
  if (doc.ownerId && inScope(scope, doc.ownerId)) return true;
  if (doc.rentalId) {
    const contract = await loadContract(client, doc.rentalId);

    return Boolean(contract && inScope(scope, contract.property?.ownerId ?? null));
  }

  return scope.all;
};

const contractDocs = async (client: CoreApiClient, rentalId: string) => {
  const contract = await loadContract(client, rentalId);

  if (!contract) return null;

  const own = (await queryDocs(client, { rentalId: { eq: rentalId } })).map(toDoc);
  // Kept from the contract this one renews: IC, inventory, move-in photos.
  const carried = contract.renewalOfId
    ? (await queryDocs(client, { rentalId: { eq: contract.renewalOfId as string } }))
        .map(toDoc)
        .filter((d) => CONTRACT_CHECKLIST.some((c) => c.carriesOver && c.type === d.type))
    : [];
  // Filed on the property but not on any contract — can be linked.
  const property = contract.propertyId
    ? (await queryDocs(client, { propertyId: { eq: contract.propertyId } })).map(toDoc).filter((d) => !d.rentalId)
    : [];

  return { contract, own, carried, property };
};

const handler = async (event: RoutePayload, context?: { workspaceMemberId?: string | null }): Promise<Response> => {
  const body = (event.body ?? {}) as Body;

  try {
    const client = appClient();
    const scope = await resolveScope(client, context?.workspaceMemberId);

    // ---- a contract's documents
    if (body.action === 'contractDocs') {
      if (!body.rentalId) return fail('Pick a contract.');

      const result = await contractDocs(client, body.rentalId);

      if (!result) return fail('Contract not found.', 404);
      if (!inScope(scope, result.contract.property?.ownerId ?? null)) return json(NOT_ALLOWED, 403);

      return json({ success: true, own: result.own, carried: result.carried, property: result.property });
    }

    // ---- every document in the caller's workspaces (the Documents page)
    if (body.action === 'listAll') {
      const rows: Array<Record<string, unknown>> = [];
      let after: string | undefined;

      for (;;) {
        const { documents: page } = await client.query({
          documents: {
            __args: { first: 200, ...(after ? { after } : {}), orderBy: [{ createdAt: 'DescNullsLast' }] },
            edges: {
              node: {
                ...DOC_FIELDS,
                group: true,
                notes: true,
                property: { name: true },
                rental: { name: true },
                person: { name: { firstName: true, lastName: true } },
                owner: { name: true },
              },
            },
            pageInfo: { hasNextPage: true, endCursor: true },
          },
        });

        rows.push(...((page?.edges ?? []).map(({ node }) => node) as unknown as Array<Record<string, unknown>>));
        if (!page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor || rows.length >= 2000) break;
        after = page.pageInfo.endCursor;
      }

      const [{ owners }, { properties }] = await Promise.all([
        client.query({ owners: { __args: { first: 200, orderBy: [{ name: 'AscNullsLast' }] }, edges: { node: { id: true, name: true } } } }),
        client.query({ properties: { __args: { first: 500, orderBy: [{ name: 'AscNullsLast' }] }, edges: { node: { id: true, name: true, ownerId: true } } } }),
      ]);
      const docs: LibraryDoc[] = rows
        .filter((row) => inScope(scope, (row.ownerId as string | null) ?? null))
        .map((row) => {
          const person = row.person as { name?: { firstName?: string; lastName?: string } } | null;

          return {
            ...toDoc(row as unknown as DocRow),
            group: (row.group as string | null) ?? 'MISC',
            notes: (row.notes as string | null) ?? '',
            propertyId: (row.propertyId as string | null) ?? null,
            propertyName: (row.property as { name?: string } | null)?.name ?? '',
            rentalName: (row.rental as { name?: string } | null)?.name ?? '',
            personName: [person?.name?.firstName, person?.name?.lastName].filter(Boolean).join(' '),
            ownerId: (row.ownerId as string | null) ?? null,
            ownerName: (row.owner as { name?: string } | null)?.name ?? '',
          };
        });

      return json({
        success: true,
        documents: docs,
        owners: (owners?.edges ?? []).map(({ node }) => ({ id: node.id, name: node.name ?? 'Workspace' })).filter((o) => inScope(scope, o.id)),
        properties: (properties?.edges ?? [])
          .map(({ node }) => ({ id: node.id, name: node.name ?? 'Property', ownerId: node.ownerId ?? null }))
          .filter((p) => inScope(scope, p.ownerId)),
      });
    }

    // ---- upload one file
    if (body.action === 'upload') {
      const file = body.file;
      const fileName = (file?.name ?? '').replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 120) || 'file';
      const extension = extensionOf(fileName);

      if (!file?.data) return fail('No file received.');

      const buffer = Buffer.from(file.data, 'base64');

      if (buffer.byteLength === 0) return fail(`${fileName} is empty.`);

      // Campaign photos / video
      if (body.campaignId) {
        if (!MEDIA_EXTENSIONS.includes(extension)) return fail(`${fileName}: add a photo (JPG, PNG), a video (MP4) or a PDF.`);
        if (VIDEO_EXTENSIONS.includes(extension) && buffer.byteLength > MAX_VIDEO_BYTES) {
          return fail(`${fileName} is ${formatBytes(buffer.byteLength)} — WhatsApp takes videos up to ${formatBytes(MAX_VIDEO_BYTES)}.`);
        }
        if (buffer.byteLength > MAX_UPLOAD_BYTES) return fail(`${fileName} is ${formatBytes(buffer.byteLength)} — the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`);

        const { campaigns } = (await client.query({
          campaigns: { __args: { filter: { id: { eq: body.campaignId } }, first: 1 }, edges: { node: { id: true, ownerId: true, media: { fileId: true, label: true } } } },
        } as never)) as { campaigns?: { edges?: Array<{ node: { id: string; ownerId?: string | null; media?: FileValue[] | null } }> } };
        const campaign = campaigns?.edges?.[0]?.node;

        if (!campaign) return fail('Campaign not found.', 404);
        if (!inScope(scope, campaign.ownerId ?? null)) return json(NOT_ALLOWED, 403);

        const existing = (campaign.media ?? []).filter((f) => f?.fileId);

        if (existing.length >= MAX_MEDIA_FILES) return fail(`A campaign holds up to ${MAX_MEDIA_FILES} photos or videos.`);

        const uploaded = await appUploadClient().uploadFile({ fileBuffer: buffer, filename: fileName, fieldMetadataUniversalIdentifier: CAMPAIGN_MEDIA_FIELD_ID });

        await client.mutation({
          updateCampaign: {
            __args: { id: campaign.id, data: { media: [...existing.map((f) => ({ fileId: f.fileId, label: f.label })), { fileId: uploaded.id, label: fileName }] } },
            id: true,
          },
        } as never);

        return json({ success: true, campaignId: campaign.id, fileId: uploaded.id });
      }

      if (!ALLOWED_EXTENSIONS.includes(extension)) return fail(`${fileName}: only PDF, photos and Office files can be uploaded.`);
      if (buffer.byteLength > MAX_UPLOAD_BYTES) return fail(`${fileName} is ${formatBytes(buffer.byteLength)} — the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`);

      // Expense bill / receipt
      if (body.expenseId) {
        const { expenses } = await client.query({
          expenses: { __args: { filter: { id: { eq: body.expenseId } }, first: 1 }, edges: { node: { id: true, ownerId: true, receipt: { fileId: true, label: true } } } },
        });
        const expense = expenses?.edges?.[0]?.node;

        if (!expense) return fail('Expense not found.', 404);
        if (!inScope(scope, expense.ownerId ?? null)) return json(NOT_ALLOWED, 403);

        const existing = ((expense.receipt as unknown as FileValue[] | null) ?? []).filter((f) => f?.fileId);

        if (existing.length >= 5) return fail('An expense holds up to 5 files.');

        const uploaded = await appUploadClient().uploadFile({ fileBuffer: buffer, filename: fileName, fieldMetadataUniversalIdentifier: EXPENSE_RECEIPT_FIELD_ID });

        await client.mutation({
          updateExpense: {
            __args: { id: expense.id, data: { receipt: [...existing.map((f) => ({ fileId: f.fileId, label: f.label })), { fileId: uploaded.id, label: fileName }] } as never },
            id: true,
          },
        });

        return json({ success: true, expenseId: expense.id, fileId: uploaded.id });
      }

      // Document: an existing one, or a new one (on a contract, property or person).
      // Checks first, then the upload, then the new document — so a failed
      // upload leaves nothing behind.
      let doc: DocRow | null = null;
      let create: Record<string, unknown> | null = null;

      if (body.documentId) {
        doc = await loadDoc(client, body.documentId);
        if (!doc) return fail('Document not found.', 404);
        if (!(await canUseDoc(client, scope, doc))) return json(NOT_ALLOWED, 403);
        if ((doc.files ?? []).length >= 20) return json({ success: false, full: true, message: 'A document holds up to 20 files — start a new one.' }, 400);
      } else {
        const spec = body.newDocument ?? {};
        const contract = spec.rentalId ? await loadContract(client, spec.rentalId) : null;

        if (spec.rentalId && !contract) return fail('Contract not found.', 404);

        // The workspace: the contract's, else the property's, else the one picked.
        const ownerId = contract?.property?.ownerId ?? (spec.propertyId ? await propertyOwnerId(client, spec.propertyId) : null) ?? spec.ownerId ?? null;

        if (!inScope(scope, ownerId)) return json(NOT_ALLOWED, 403);

        const type = DOC_TYPES.some((t) => t.value === spec.type) ? (spec.type as string) : 'OTHER';
        const name = spec.name?.trim() || `${docType(type).label}${contract?.property?.name ? ` – ${contract.property.name}` : ''}`;
        create = {
          name,
          documentType: type,
          group: contract || spec.propertyId ? 'PROPERTY' : 'MISC',
          rentalId: contract?.id ?? null,
          propertyId: contract?.propertyId ?? spec.propertyId ?? null,
          personId: spec.personId ?? (type === 'ID' ? contract?.tenantId ?? null : null),
          ownerId,
        };
      }

      // A free Personal business holds up to FREE_STORAGE_BYTES of documents.
      const quotaOwnerId = (create?.ownerId as string | null | undefined) ?? doc?.ownerId ?? null;

      if (quotaOwnerId && !scope.all) {
        const { owners: ownerRows } = await client.query({
          owners: { __args: { filter: { id: { eq: quotaOwnerId } }, first: 1 }, edges: { node: { ownerType: true, paidPlan: true } } },
        });

        if ((ownerRows?.edges?.[0]?.node.ownerType as string | null) === 'PERSONAL' && !ownerRows?.edges?.[0]?.node.paidPlan) {
          const { documents: usedRows } = (await client.query({
            documents: { __args: { filter: { ownerId: { eq: quotaOwnerId } }, first: 500 }, edges: { node: { fileSizes: true } } },
          } as never)) as { documents?: { edges?: Array<{ node: { fileSizes?: Record<string, number> | null } }> } };
          const used = (usedRows?.edges ?? []).reduce(
            (sum, { node }) => sum + Object.values(node.fileSizes ?? {}).reduce((a, b) => a + (Number(b) || 0), 0),
            0,
          );

          if (used + buffer.byteLength > FREE_STORAGE_BYTES) {
            return fail(
              `Your free storage is ${formatBytes(FREE_STORAGE_BYTES)} and ${formatBytes(used)} is used. Remove a file or upgrade to add ${fileName}.`,
              413,
            );
          }
        }
      }

      const uploaded = await appUploadClient().uploadFile({ fileBuffer: buffer, filename: fileName, fieldMetadataUniversalIdentifier: DOCUMENT_FILES_FIELD_ID });

      let createdId: string | null = null;

      // A document this call created is soft deleted again if filing the file fails.
      const undoCreate = async () => {
        if (!createdId) return;
        await client.mutation({ deleteDocument: { __args: { id: createdId }, id: true } }).catch((error) => console.error('[rental] cleanup failed:', error));
      };

      try {
        if (create) {
          const { createDocument } = await client.mutation({ createDocument: { __args: { data: create as never }, id: true } });

          if (!createDocument?.id) return fail(`${fileName}: could not create the document.`, 500);
          createdId = createDocument.id;
          doc = { id: createDocument.id, files: [], fileSizes: {} };
        }
        if (!doc) return fail('Pick a document.');

        await client.mutation({
          updateDocument: {
            __args: {
              id: doc.id,
              data: {
                files: [...(doc.files ?? []).map((f) => ({ fileId: f.fileId, label: f.label })), { fileId: uploaded.id, label: fileName }],
                fileSizes: { ...(doc.fileSizes ?? {}), [uploaded.id]: buffer.byteLength },
              } as never,
            },
            id: true,
          },
        });
      } catch (error) {
        console.error('[rental] filing the upload failed:', error);
        await undoCreate();

        return fail(`${fileName} was not filed${createdId ? ' (nothing was created)' : ''} — try again.`, 500);
      }

      return json({ success: true, documentId: doc.id, fileId: uploaded.id });
    }

    // ---- remove a campaign photo / video
    if (body.action === 'removeCampaignFile') {
      const { campaigns } = (await client.query({
        campaigns: { __args: { filter: { id: { eq: body.campaignId ?? '' } }, first: 1 }, edges: { node: { id: true, ownerId: true, media: { fileId: true, label: true } } } },
      } as never)) as { campaigns?: { edges?: Array<{ node: { id: string; ownerId?: string | null; media?: FileValue[] | null } }> } };
      const campaign = campaigns?.edges?.[0]?.node;

      if (!campaign) return fail('Campaign not found.', 404);
      if (!inScope(scope, campaign.ownerId ?? null)) return json(NOT_ALLOWED, 403);
      await client.mutation({
        updateCampaign: {
          __args: { id: campaign.id, data: { media: (campaign.media ?? []).filter((f) => f.fileId !== body.fileId).map((f) => ({ fileId: f.fileId, label: f.label })) } },
          id: true,
        },
      } as never);

      return json({ success: true });
    }

    // ---- recently deleted documents, and bringing one back
    if (body.action === 'listDeleted' || body.action === 'restore') {
      const { documents: gone } = (await client.query({
        documents: {
          __args: {
            filter: { and: [{ deletedAt: { is: 'NOT_NULL' } }, ...(body.action === 'restore' ? [{ id: { eq: body.documentId ?? '' } }] : [])] },
            first: 100,
            orderBy: [{ deletedAt: 'DescNullsLast' }],
          },
          edges: { node: { id: true, name: true, documentType: true, ownerId: true, rentalId: true, deletedAt: true, files: { fileId: true, label: true } } },
        },
      } as never)) as {
        documents?: { edges?: Array<{ node: { id: string; name?: string | null; documentType?: string | null; ownerId?: string | null; rentalId?: string | null; deletedAt?: string | null; files?: Array<{ fileId: string; label: string }> | null } }> };
      };
      const rows = (gone?.edges ?? []).map(({ node }) => node);

      if (body.action === 'restore') {
        const row = rows[0];

        if (!row) return fail('That document is not in the deleted list.', 404);
        if (!(await canUseDoc(client, scope, row))) return json(NOT_ALLOWED, 403);
        await client.mutation({ restoreDocument: { __args: { id: row.id }, id: true } });

        return json({ success: true, message: `${row.name || 'Document'} restored.` });
      }

      const allowed: typeof rows = [];

      for (const row of rows) if (await canUseDoc(client, scope, row)) allowed.push(row);

      return json({
        success: true,
        deleted: allowed.map((row) => ({ id: row.id, name: row.name ?? '', type: row.documentType ?? 'OTHER', files: (row.files ?? []).length, deletedAt: row.deletedAt ?? '' })),
      });
    }

    // ---- edit / remove
    if (!body.documentId) return fail('Pick a document.');

    const doc = await loadDoc(client, body.documentId);

    if (!doc) return fail('Document not found.', 404);
    if (!(await canUseDoc(client, scope, doc))) return json(NOT_ALLOWED, 403);

    if (body.action === 'update') {
      const data: Record<string, unknown> = {};

      if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim().slice(0, 200);
      if (body.type && DOC_TYPES.some((t) => t.value === body.type)) data.documentType = body.type;
      if (body.propertyId !== undefined) {
        if (body.propertyId) {
          const propertyOwner = await propertyOwnerId(client, body.propertyId);

          if (!propertyOwner) return fail('Property not found.', 404);
          if (!inScope(scope, propertyOwner)) return json(NOT_ALLOWED, 403);
          data.propertyId = body.propertyId;
          data.group = 'PROPERTY';
          if (propertyOwner !== doc.ownerId) data.ownerId = propertyOwner;
        } else {
          data.propertyId = null;
        }
      }
      if (typeof body.notes === 'string') data.notes = body.notes.slice(0, 2000);
      if (body.expiresOn === null || /^\d{4}-\d{2}-\d{2}$/.test(body.expiresOn ?? '')) data.expiresOn = body.expiresOn ?? null;
      await client.mutation({ updateDocument: { __args: { id: doc.id, data: data as never }, id: true } });

      return json({ success: true });
    }

    if (body.action === 'removeFile') {
      const files = (doc.files ?? []).filter((f) => f.fileId !== body.fileId);
      const { [body.fileId ?? '']: _removed, ...sizes } = doc.fileSizes ?? {};

      await client.mutation({
        updateDocument: { __args: { id: doc.id, data: { files: files.map((f) => ({ fileId: f.fileId, label: f.label })), fileSizes: sizes } as never }, id: true },
      });

      return json({ success: true });
    }

    if (body.action === 'delete') {
      // Soft delete: it can be restored from "Recently deleted" on the Documents page.
      await client.mutation({ deleteDocument: { __args: { id: doc.id }, id: true } });

      return json({ success: true, deleted: true, message: 'Document deleted.' });
    }

    if (body.action === 'link') {
      const contract = body.rentalId ? await loadContract(client, body.rentalId) : null;

      if (!contract) return fail('Contract not found.', 404);
      if (!inScope(scope, contract.property?.ownerId ?? null)) return json(NOT_ALLOWED, 403);
      await client.mutation({ updateDocument: { __args: { id: doc.id, data: { rentalId: contract.id } as never }, id: true } });

      return json({ success: true });
    }

    return fail('Unknown action.');
  } catch (error) {
    console.error('[rental] files route failed:', error);

    return fail(error instanceof Error ? error.message : String(error), 500);
  }
};

export default defineLogicFunction({
  universalIdentifier: FILES_ROUTE_FUNCTION_ID,
  name: 'files-route',
  description: 'Uploads files (to the configured storage, R2) and manages documents on contracts and expenses.',
  timeoutSeconds: 120,
  handler,
  httpRouteTriggerSettings: { path: '/files', httpMethod: 'POST', isAuthRequired: true },
});
