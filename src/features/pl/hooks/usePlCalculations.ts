import { useMemo } from 'react';
import { canonicalArticleKey, isDerivedPnlArticle } from '../../../lib/financialRows';
import type { PnlDraftRow } from '../../../lib/pnl';
import {
  classifyExpense,
  type ExpenseControlType,
  type LocalClassificationOverride,
} from '../constants/expenseClassification';

export interface PlArticle {
  id: string;
  name: string;
  plan: number | null | undefined;
  fact: number | null | undefined;
}

export interface ClassifiedPlArticle extends PlArticle {
  controlType: ExpenseControlType;
}

export interface PlValuePair {
  plan: number | undefined;
  fact: number | undefined;
}

export interface EnrichedPlData {
  controllableOpex: PlValuePair;
  uncontrollableOpex: PlValuePair;
  unknownOpex: PlValuePair;
  controllableProfit: PlValuePair;
  controllableMargin: PlValuePair;
  articlesWithTypes: ClassifiedPlArticle[];
  hasUnclassifiedArticles: boolean;
  hasAggregateOpex: boolean;
  canCalculateControllableProfit: boolean;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function sumKnown(values: Array<number | null | undefined>): number | undefined {
  if (values.length === 0 || values.some((value) => !isFiniteNumber(value))) return undefined;
  return values.reduce<number>((sum, value) => sum + (value as number), 0);
}

const AGGREGATE_KEYS = new Set([
  'revenue', 'cogs', 'payroll', 'personnel', 'labor', 'depreciation',
  'interest', 'tax', 'other', 'grossprofit', 'ebitda', 'netprofit',
]);

function isAggregateOpex(row: PnlDraftRow): boolean {
  return canonicalArticleKey(row.article) === 'opex'
    || /^(?:операционные расходы|операционные затраты|общий opex)$/iu.test(row.article.normalize('NFC').trim());
}

function isDetailExpense(row: PnlDraftRow, overrides?: LocalClassificationOverride): boolean {
  const articleKey = canonicalArticleKey(row.article);
  if (isDerivedPnlArticle(row.article) || articleKey === 'revenue' || isAggregateOpex(row)) return false;
  if (AGGREGATE_KEYS.has(articleKey.replace(/[\s_-]+/g, ''))) return false;

  // Expense imports may contain positive amounts. Explicit expense category or a known
  // expense-name match is enough; negative values remain evidence even when unclassified.
  const explicitKey = String(row.key ?? '').trim().toLocaleLowerCase('ru-RU');
  if (['opex', 'other_operating', 'depreciation', 'interest', 'tax', 'expense', 'expenses'].includes(explicitKey)) return true;
  if (classifyExpense(row.article, row.id, overrides) !== 'unknown') return true;
  return (isFiniteNumber(row.plan) && row.plan < 0) || (isFiniteNumber(row.fact) && row.fact < 0);
}

/**
 * Classifies detailed operating expense lines. Aggregate OPEX is deliberately not
 * added to details: without source-level evidence this could double-count costs.
 * Missing amounts stay unknown rather than being converted to zero.
 */
export function calculateClassifiedPlData(
  rows: PnlDraftRow[],
  overrides?: LocalClassificationOverride,
): EnrichedPlData {
  const hasAggregateOpex = rows.some(isAggregateOpex);
  const articlesWithTypes: ClassifiedPlArticle[] = rows
    .filter((row) => isDetailExpense(row, overrides))
    .map((row) => ({
      id: row.id,
      name: row.article,
      plan: row.plan,
      fact: row.fact,
      controlType: classifyExpense(row.article, row.id, overrides),
    }));

  const sumByType = (type: ExpenseControlType, field: 'plan' | 'fact'): number | undefined => {
    const selected = articlesWithTypes.filter((row) => row.controlType === type);
    if (selected.length === 0) {
      // Zero is valid only when a detailed list exists and every listed article is classified.
      return articlesWithTypes.length > 0 && !articlesWithTypes.some((row) => row.controlType === 'unknown')
        ? 0
        : undefined;
    }
    return sumKnown(selected.map((row) => row[field]));
  };

  const controllableOpex = { plan: sumByType('controllable', 'plan'), fact: sumByType('controllable', 'fact') };
  const uncontrollableOpex = { plan: sumByType('uncontrollable', 'plan'), fact: sumByType('uncontrollable', 'fact') };
  const unknownOpex = { plan: sumByType('unknown', 'plan'), fact: sumByType('unknown', 'fact') };

  const revenue = rows.find((row) => canonicalArticleKey(row.article) === 'revenue');
  const cogs = rows.find((row) => canonicalArticleKey(row.article) === 'cogs');
  const payroll = rows.find((row) => ['payroll', 'personnel', 'labor'].includes(canonicalArticleKey(row.article)));

  const profitFor = (field: 'plan' | 'fact'): number | undefined => {
    if (hasAggregateOpex || articlesWithTypes.some((row) => row.controlType === 'unknown')) return undefined;
    const rev = revenue?.[field];
    const cost = cogs?.[field];
    const labor = payroll?.[field];
    const controllable = controllableOpex[field];
    if (![rev, cost, labor, controllable].every(isFiniteNumber)) return undefined;
    // STEN stores expenses as signed values (normally negative).
    return (rev as number) + (cost as number) + (labor as number) + (controllable as number);
  };

  const controllableProfit = { plan: profitFor('plan'), fact: profitFor('fact') };
  const marginFor = (profit: number | undefined, rev: number | null | undefined) =>
    isFiniteNumber(profit) && isFiniteNumber(rev) && rev > 0 ? profit / rev * 100 : undefined;

  const hasUnclassifiedArticles = articlesWithTypes.some((row) => row.controlType === 'unknown');
  const canCalculateControllableProfit = !hasAggregateOpex
    && !hasUnclassifiedArticles
    && controllableProfit.plan !== undefined
    && controllableProfit.fact !== undefined;

  return {
    controllableOpex,
    uncontrollableOpex,
    unknownOpex,
    controllableProfit,
    controllableMargin: {
      plan: marginFor(controllableProfit.plan, revenue?.plan),
      fact: marginFor(controllableProfit.fact, revenue?.fact),
    },
    articlesWithTypes,
    hasUnclassifiedArticles,
    hasAggregateOpex,
    canCalculateControllableProfit,
  };
}

export function usePlCalculations(rows: PnlDraftRow[], overrides?: LocalClassificationOverride): EnrichedPlData {
  return useMemo(() => calculateClassifiedPlData(rows, overrides), [rows, overrides]);
}
