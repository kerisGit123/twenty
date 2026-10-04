import {
  AggregateOperations,
  definePageLayout,
  PageLayoutTabLayoutMode,
} from 'twenty-sdk/define';

import {
  PAYMENT_AMOUNT_FIELD_ID,
  PAYMENT_OBJECT_ID,
  PAYMENT_PAID_ON_FIELD_ID,
  PAYMENT_PROPERTY_FIELD_ID,
  PAYMENT_RECEIPT_NUMBER_FIELD_ID,
  PAYMENT_STATUS_FIELD_ID,
  PAYMENT_TENANT_FIELD_ID,
  PAYMENT_TYPE_FIELD_ID,
  PROPERTY_NAME_FIELD_ID,
  PROPERTY_OBJECT_ID,
  PROPERTY_STATUS_FIELD_ID,
} from 'src/constants/universal-identifiers';
import {
  EXPENSE_AMOUNT_FIELD_ID,
  EXPENSE_CATEGORY_FIELD_ID,
  EXPENSE_DATE_FIELD_ID,
  EXPENSE_OBJECT_ID,
  EXPENSE_OWNER_FIELD_ID,
  PAYMENT_OWNER_FIELD_ID,
} from 'src/constants/universal-identifiers-v2';

export const RENTAL_SUMMARY_PAGE_LAYOUT_ID = '0773a9de-78de-4a71-b350-4001ed272b13';

const TIME_ZONE = 'Asia/Kuala_Lumpur';

// Money received = receipts that were actually issued (Issued or Sent),
// dated by "Paid on". Drafts and voided receipts never count.
const RECEIVED = {
  fieldMetadataUniversalIdentifier: PAYMENT_STATUS_FIELD_ID,
  operand: 'IS',
  value: '["ISSUED","SENT"]',
};
const THIS_YEAR = {
  fieldMetadataUniversalIdentifier: PAYMENT_PAID_ON_FIELD_ID,
  operand: 'IS_RELATIVE',
  value: `THIS_1_YEAR;;${TIME_ZONE};;`,
};

const EXPENSES_THIS_YEAR = {
  fieldMetadataUniversalIdentifier: EXPENSE_DATE_FIELD_ID,
  operand: 'IS_RELATIVE',
  value: `THIS_1_YEAR;;${TIME_ZONE};;`,
};

const COMMON = { timezone: TIME_ZONE, firstDayOfTheWeek: 1 } as const;

// Chart-config values the SDK doesn't export as enums.
const BAR = {
  ...COMMON,
  layout: 'VERTICAL',
  primaryAxisOrderBy: 'FIELD_ASC',
  axisNameDisplay: 'NONE',
  color: 'auto',
  displayDataLabel: true,
} as const;

const at = (row: number, column: number, rowSpan: number, columnSpan: number) => ({
  layoutMode: PageLayoutTabLayoutMode.GRID,
  row,
  column,
  rowSpan,
  columnSpan,
});

export default definePageLayout({
  universalIdentifier: RENTAL_SUMMARY_PAGE_LAYOUT_ID,
  name: 'Rental Summary',
  type: 'STANDALONE_PAGE',
  tabs: [
    {
      universalIdentifier: 'cbf68f99-66c4-4b6f-b326-5b0bda2c1d1b',
      title: 'Summary',
      position: 0,
      icon: 'IconChartBar',
      layoutMode: PageLayoutTabLayoutMode.GRID,
      widgets: [
        {
          universalIdentifier: 'aab61b99-57ac-4876-b64a-2c3b57bb3d61',
          title: 'Received this year',
          type: 'GRAPH',
          objectUniversalIdentifier: PAYMENT_OBJECT_ID,
          position: at(0, 0, 2, 3),
          configuration: {
            configurationType: 'AGGREGATE_CHART',
            aggregateFieldMetadataUniversalIdentifier: PAYMENT_AMOUNT_FIELD_ID,
            aggregateOperation: AggregateOperations.SUM,
            displayDataLabel: true,
            prefix: 'RM ',
            ...COMMON,
            filter: { recordFilters: [RECEIVED, THIS_YEAR] },
          },
        },
        {
          universalIdentifier: 'c9c60c57-d868-45d3-be8a-2549c60cdf6c',
          title: 'Receipts issued this year',
          type: 'GRAPH',
          objectUniversalIdentifier: PAYMENT_OBJECT_ID,
          position: at(0, 3, 2, 3),
          configuration: {
            configurationType: 'AGGREGATE_CHART',
            aggregateFieldMetadataUniversalIdentifier: PAYMENT_RECEIPT_NUMBER_FIELD_ID,
            aggregateOperation: AggregateOperations.COUNT,
            displayDataLabel: true,
            ...COMMON,
            filter: { recordFilters: [RECEIVED, THIS_YEAR] },
          },
        },
        {
          universalIdentifier: 'cc45228a-7e47-4514-b4c8-64919d6bef91',
          title: 'Drafts awaiting payment',
          type: 'GRAPH',
          objectUniversalIdentifier: PAYMENT_OBJECT_ID,
          position: at(0, 6, 2, 3),
          configuration: {
            configurationType: 'AGGREGATE_CHART',
            aggregateFieldMetadataUniversalIdentifier: PAYMENT_AMOUNT_FIELD_ID,
            aggregateOperation: AggregateOperations.COUNT,
            displayDataLabel: true,
            ...COMMON,
            filter: {
              recordFilters: [
                {
                  fieldMetadataUniversalIdentifier: PAYMENT_STATUS_FIELD_ID,
                  operand: 'IS',
                  value: '["DRAFT"]',
                },
              ],
            },
          },
        },
        {
          universalIdentifier: '856b41ea-0efc-4ef7-be52-475844eaf778',
          title: 'Occupied properties',
          type: 'GRAPH',
          objectUniversalIdentifier: PROPERTY_OBJECT_ID,
          position: at(0, 9, 2, 3),
          configuration: {
            configurationType: 'AGGREGATE_CHART',
            aggregateFieldMetadataUniversalIdentifier: PROPERTY_NAME_FIELD_ID,
            aggregateOperation: AggregateOperations.COUNT,
            displayDataLabel: true,
            ...COMMON,
            filter: {
              recordFilters: [
                {
                  fieldMetadataUniversalIdentifier: PROPERTY_STATUS_FIELD_ID,
                  operand: 'IS',
                  value: '["OCCUPIED"]',
                },
              ],
            },
          },
        },
        {
          universalIdentifier: '030246c1-9ac6-420b-adcb-fcd1ace345ec',
          title: 'Received per month (this year)',
          type: 'GRAPH',
          objectUniversalIdentifier: PAYMENT_OBJECT_ID,
          position: at(2, 0, 6, 8),
          configuration: {
            configurationType: 'BAR_CHART',
            aggregateFieldMetadataUniversalIdentifier: PAYMENT_AMOUNT_FIELD_ID,
            aggregateOperation: AggregateOperations.SUM,
            primaryAxisGroupByFieldMetadataUniversalIdentifier: PAYMENT_PAID_ON_FIELD_ID,
            primaryAxisDateGranularity: 'MONTH',
            ...BAR,
            filter: { recordFilters: [RECEIVED, THIS_YEAR] },
          },
        },
        {
          universalIdentifier: '6a035522-e3ca-4046-9d52-f74b09607037',
          title: 'Received per year',
          type: 'GRAPH',
          objectUniversalIdentifier: PAYMENT_OBJECT_ID,
          position: at(2, 8, 6, 4),
          configuration: {
            configurationType: 'BAR_CHART',
            aggregateFieldMetadataUniversalIdentifier: PAYMENT_AMOUNT_FIELD_ID,
            aggregateOperation: AggregateOperations.SUM,
            primaryAxisGroupByFieldMetadataUniversalIdentifier: PAYMENT_PAID_ON_FIELD_ID,
            primaryAxisDateGranularity: 'YEAR',
            ...BAR,
            filter: { recordFilters: [RECEIVED] },
          },
        },
        {
          universalIdentifier: '13bf1ba8-a8a1-4695-b9e2-e9bfc0bb6252',
          title: 'By property (this year)',
          type: 'GRAPH',
          objectUniversalIdentifier: PAYMENT_OBJECT_ID,
          position: at(8, 0, 6, 5),
          configuration: {
            configurationType: 'BAR_CHART',
            aggregateFieldMetadataUniversalIdentifier: PAYMENT_AMOUNT_FIELD_ID,
            aggregateOperation: AggregateOperations.SUM,
            primaryAxisGroupByFieldMetadataUniversalIdentifier: PAYMENT_PROPERTY_FIELD_ID,
            ...BAR,
            primaryAxisOrderBy: 'VALUE_DESC',
            filter: { recordFilters: [RECEIVED, THIS_YEAR] },
          },
        },
        {
          universalIdentifier: 'fe20c16b-59cc-4cd9-b4aa-711f9fab6315',
          title: 'By tenant (this year)',
          type: 'GRAPH',
          objectUniversalIdentifier: PAYMENT_OBJECT_ID,
          position: at(8, 5, 6, 4),
          configuration: {
            configurationType: 'BAR_CHART',
            aggregateFieldMetadataUniversalIdentifier: PAYMENT_AMOUNT_FIELD_ID,
            aggregateOperation: AggregateOperations.SUM,
            primaryAxisGroupByFieldMetadataUniversalIdentifier: PAYMENT_TENANT_FIELD_ID,
            ...BAR,
            primaryAxisOrderBy: 'VALUE_DESC',
            filter: { recordFilters: [RECEIVED, THIS_YEAR] },
          },
        },
        {
          universalIdentifier: 'f8b6ccb0-f499-4ead-bf84-1f6dcadd6fb3',
          title: 'Rent vs deposit (this year)',
          type: 'GRAPH',
          objectUniversalIdentifier: PAYMENT_OBJECT_ID,
          position: at(8, 9, 6, 3),
          configuration: {
            configurationType: 'PIE_CHART',
            aggregateFieldMetadataUniversalIdentifier: PAYMENT_AMOUNT_FIELD_ID,
            aggregateOperation: AggregateOperations.SUM,
            groupByFieldMetadataUniversalIdentifier: PAYMENT_TYPE_FIELD_ID,
            displayLegend: true,
            ...COMMON,
            filter: { recordFilters: [RECEIVED, THIS_YEAR] },
          },
        },
        {
          universalIdentifier: '40208e78-9e5f-46f6-a51b-56d488c0c26f',
          title: 'Expenses this year',
          type: 'GRAPH',
          objectUniversalIdentifier: EXPENSE_OBJECT_ID,
          position: at(14, 0, 2, 4),
          configuration: {
            configurationType: 'AGGREGATE_CHART',
            aggregateFieldMetadataUniversalIdentifier: EXPENSE_AMOUNT_FIELD_ID,
            aggregateOperation: AggregateOperations.SUM,
            displayDataLabel: true,
            prefix: 'RM ',
            ...COMMON,
            filter: { recordFilters: [EXPENSES_THIS_YEAR] },
          },
        },
        {
          universalIdentifier: '8bd86fd0-b395-44d6-b5fe-7003809b15d2',
          title: 'Income by owner (this year)',
          type: 'GRAPH',
          objectUniversalIdentifier: PAYMENT_OBJECT_ID,
          position: at(16, 0, 6, 6),
          configuration: {
            configurationType: 'BAR_CHART',
            aggregateFieldMetadataUniversalIdentifier: PAYMENT_AMOUNT_FIELD_ID,
            aggregateOperation: AggregateOperations.SUM,
            primaryAxisGroupByFieldMetadataUniversalIdentifier: PAYMENT_OWNER_FIELD_ID,
            ...BAR,
            primaryAxisOrderBy: 'VALUE_DESC',
            filter: { recordFilters: [RECEIVED, THIS_YEAR] },
          },
        },
        {
          universalIdentifier: '591fe351-e9d6-497a-bade-84bf10255823',
          title: 'Expenses by owner (this year)',
          type: 'GRAPH',
          objectUniversalIdentifier: EXPENSE_OBJECT_ID,
          position: at(16, 6, 6, 6),
          configuration: {
            configurationType: 'BAR_CHART',
            aggregateFieldMetadataUniversalIdentifier: EXPENSE_AMOUNT_FIELD_ID,
            aggregateOperation: AggregateOperations.SUM,
            primaryAxisGroupByFieldMetadataUniversalIdentifier: EXPENSE_OWNER_FIELD_ID,
            ...BAR,
            primaryAxisOrderBy: 'VALUE_DESC',
            filter: { recordFilters: [EXPENSES_THIS_YEAR] },
          },
        },
        {
          universalIdentifier: '8b13622a-d693-4242-8974-a6181a549bb9',
          title: 'Expenses by category (this year)',
          type: 'GRAPH',
          objectUniversalIdentifier: EXPENSE_OBJECT_ID,
          position: at(22, 0, 6, 12),
          configuration: {
            configurationType: 'BAR_CHART',
            aggregateFieldMetadataUniversalIdentifier: EXPENSE_AMOUNT_FIELD_ID,
            aggregateOperation: AggregateOperations.SUM,
            primaryAxisGroupByFieldMetadataUniversalIdentifier: EXPENSE_CATEGORY_FIELD_ID,
            ...BAR,
            primaryAxisOrderBy: 'VALUE_DESC',
            filter: { recordFilters: [EXPENSES_THIS_YEAR] },
          },
        },
      ],
    },
  ],
});
