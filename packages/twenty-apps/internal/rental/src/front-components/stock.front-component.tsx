import { defineFrontComponent } from 'twenty-sdk/define';

import { STOCK_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-stock';
import { StockPage } from 'src/front-components/shared/stock-page';

// The page lives in shared/stock-page.tsx; this file only registers it.
export default defineFrontComponent({
  universalIdentifier: STOCK_FRONT_COMPONENT_ID,
  name: 'stock',
  description: 'F&B stock: in hand, IN/OUT history, monthly sheet, forecast & order plan, borrowed stock',
  component: StockPage,
});
