import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { TUTORIALS_ROUTE_FUNCTION_ID } from 'src/constants/tutorials-ids';
import { appClient } from 'src/logic-functions/utils/app-client';
import { extensionOf } from 'src/shared/documents';

// POST /s/tutorials { action: 'list' }: the tutorial videos for the Tutorials page.
//
// They are ordinary documents kept by the "Demo Shop" business, in the folder
// "Tutorial Wedrink" and the folders inside it. Documents belong to one business,
// so staff of other businesses cannot read them directly; this route reads them as
// the app and hands every signed-in person the same list, each file with a fresh
// link. Nothing is written here.

const TUTORIAL_OWNER = 'Demo Shop';
const TUTORIAL_FOLDER = 'Tutorial Wedrink';

type FileValue = { fileId?: string; label?: string; url?: string | null; extension?: string | null };
type DocNode = { id: string; name?: string | null; folder?: string | null; files?: FileValue[] | null };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const handler = async (event: RoutePayload): Promise<Response> => {
  const body = (event.body ?? {}) as { action?: string };

  if (body.action !== 'list') return json({ success: false, message: 'Unknown action.' });

  try {
    const client = appClient();
    const { owners } = (await client.query({
      owners: { __args: { filter: { name: { eq: TUTORIAL_OWNER } }, first: 1 }, edges: { node: { id: true } } },
    } as never)) as { owners?: { edges?: Array<{ node: { id: string } }> } };
    const ownerId = owners?.edges?.[0]?.node?.id;

    if (!ownerId) return json({ success: true, items: [] });

    const { documents } = (await client.query({
      documents: {
        __args: { filter: { and: [{ ownerId: { eq: ownerId } }, { folder: { like: `${TUTORIAL_FOLDER}%` } }] }, first: 200 },
        edges: { node: { id: true, name: true, folder: true, files: { fileId: true, label: true, url: true, extension: true } } },
      },
    } as never)) as { documents?: { edges?: Array<{ node: DocNode }> } };
    const items = (documents?.edges ?? [])
      .map(({ node }) => node)
      // This folder and the folders inside it ("Tutorial Wedrink 2" is not inside "Tutorial Wedrink").
      .filter((d) => d.folder === TUTORIAL_FOLDER || (d.folder ?? '').startsWith(`${TUTORIAL_FOLDER}/`))
      .flatMap((d) =>
        (d.files ?? [])
          .filter((f) => f?.url)
          .map((f) => ({
            id: `${d.id}:${f.fileId ?? ''}`,
            title: d.name || f.label || 'Tutorial',
            section: (d.folder ?? '').slice(TUTORIAL_FOLDER.length + 1),
            label: f.label ?? 'file',
            url: f.url as string,
            extension: (f.extension ?? extensionOf(f.label ?? '')).replace(/^\./, '').toLowerCase(),
          })),
      );

    return json({ success: true, items });
  } catch (error) {
    console.error('[rental] tutorials list failed:', error);

    return json({ success: false, message: 'The tutorials could not be loaded. Try again in a minute.' });
  }
};

export default defineLogicFunction({
  universalIdentifier: TUTORIALS_ROUTE_FUNCTION_ID,
  name: 'tutorials-route',
  description: 'Lists the tutorial videos for every signed-in person.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: { path: '/tutorials', httpMethod: 'POST', isAuthRequired: true },
});
