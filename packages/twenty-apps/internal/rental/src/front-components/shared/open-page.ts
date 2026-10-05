import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { AppPath, navigate } from 'twenty-sdk/front-component';

// Custom pages (Rent Ledger, Expenses...) have workspace-specific ids, so
// look them up by name once and cache the result.
let pageIds: Promise<Record<string, string>> | null = null;

const loadPageIds = async (): Promise<Record<string, string>> => {
  try {
    const result = (await new MetadataApiClient().query({
      getPageLayouts: { __args: { pageLayoutType: 'STANDALONE_PAGE' }, id: true, name: true },
    } as never)) as { getPageLayouts?: Array<{ id: string; name: string }> };

    return Object.fromEntries((result.getPageLayouts ?? []).map((layout) => [layout.name, layout.id]));
  } catch {
    return {};
  }
};

export const openPage = async (name: 'Today' | 'Rent Ledger' | 'Expenses' | 'Rental Summary' | 'Contracts') => {
  pageIds ??= loadPageIds();
  const id = (await pageIds)[name];

  if (id) await navigate(AppPath.PageLayoutPage, { pageLayoutId: id });
};

export const openList = (objectNamePlural: string) => navigate(AppPath.RecordIndexPage, { objectNamePlural });
