import { defineFrontComponent } from 'twenty-sdk/define';

import { DOCUMENTS_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v3';
import { Documents } from 'src/front-components/shared/documents-page';

// The page lives in shared/documents-page.tsx; this file only registers it.
export default defineFrontComponent({
  universalIdentifier: DOCUMENTS_FRONT_COMPONENT_ID,
  name: 'documents-page',
  description: 'All documents: drop to file, filter by type, property and expiry, view in the app',
  component: Documents,
});
