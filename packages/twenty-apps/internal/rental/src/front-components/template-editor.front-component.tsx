import { defineFrontComponent } from 'twenty-sdk/define';

import { TEMPLATE_EDITOR_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v3';
import { TemplateDesigner } from 'src/front-components/shared/template-editor-page';

// The page lives in shared/template-editor-page.tsx; this file only registers it.
export default defineFrontComponent({
  universalIdentifier: TEMPLATE_EDITOR_FRONT_COMPONENT_ID,
  name: 'template-editor',
  description: 'Design how receipts and year statements look, in English or Malay',
  component: TemplateDesigner,
});
