import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type AggregateOperations } from '@/object-record/record-table/constants/AggregateOperations';
import { NON_STANDARD_AGGREGATE_OPERATION_OPTIONS } from '@/object-record/record-table/record-table-footer/constants/nonStandardAggregateOperationsOptions';
import { getChartValueDisplayType } from '@/page-layout/widgets/graph/utils/getChartValueDisplayType';
import { type GraphValueFormatOptions } from '@/page-layout/widgets/graph/utils/graphFormatters';
import { FieldMetadataType } from 'twenty-shared/types';
import { findById, isDefined } from 'twenty-shared/utils';
import {
  type AggregateOperations as GeneratedAggregateOperations,
  type ChartNumberFormat,
} from '~/generated-metadata/graphql';

type GetChartValueFormatOptionsParams = {
  aggregateOperation: GeneratedAggregateOperations;
  aggregateFieldMetadataId: string;
  fieldMetadataItems: FieldMetadataItem[];
  numberFormat: ChartNumberFormat | null | undefined;
};

export const getChartValueFormatOptions = ({
  aggregateOperation,
  aggregateFieldMetadataId,
  fieldMetadataItems,
  numberFormat,
}: GetChartValueFormatOptionsParams): GraphValueFormatOptions => {
  const aggregateFieldMetadataItem = fieldMetadataItems.find(
    findById(aggregateFieldMetadataId),
  );

  const aggregateFieldSettings =
    aggregateFieldMetadataItem?.type === FieldMetadataType.NUMBER
      ? aggregateFieldMetadataItem.settings
      : undefined;

  const aggregateNumberFieldDecimals =
    isDefined(aggregateFieldSettings) && 'decimals' in aggregateFieldSettings
      ? aggregateFieldSettings.decimals
      : undefined;

  const aggregateFieldDecimals =
    aggregateFieldMetadataItem?.type === FieldMetadataType.CURRENCY
      ? 2
      : aggregateNumberFieldDecimals;

  const shouldUseAggregateFieldDecimals =
    NON_STANDARD_AGGREGATE_OPERATION_OPTIONS.includes(
      aggregateOperation as AggregateOperations,
    );

  const decimals = shouldUseAggregateFieldDecimals
    ? aggregateFieldDecimals
    : undefined;

  // Sums/averages of a money field are shown with its currency symbol
  // (e.g. "RM 1.5k"); counts stay plain numbers.
  const prefix =
    shouldUseAggregateFieldDecimals &&
    aggregateFieldMetadataItem?.type === FieldMetadataType.CURRENCY
      ? getCurrencyPrefix(aggregateFieldMetadataItem.defaultValue)
      : undefined;

  return {
    decimals,
    displayType: getChartValueDisplayType(numberFormat),
    prefix,
  };
};

// Default values are stored as SQL literals, e.g. { currencyCode: "'MYR'" }.
const getCurrencyPrefix = (defaultValue: unknown): string | undefined => {
  const rawCurrencyCode =
    isDefined(defaultValue) &&
    typeof defaultValue === 'object' &&
    'currencyCode' in defaultValue
      ? (defaultValue as { currencyCode?: unknown }).currencyCode
      : undefined;

  const currencyCode =
    typeof rawCurrencyCode === 'string'
      ? rawCurrencyCode.replace(/'/g, '').trim()
      : '';

  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    return undefined;
  }

  try {
    const symbol = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: 'narrowSymbol',
    })
      .formatToParts(0)
      .find((part) => part.type === 'currency')?.value;

    if (!isDefined(symbol)) {
      return undefined;
    }

    // Letter symbols read better with a space: "RM 1.5k", but "$1.5k".
    return /[A-Za-z]$/.test(symbol) ? `${symbol} ` : symbol;
  } catch {
    return undefined;
  }
};
