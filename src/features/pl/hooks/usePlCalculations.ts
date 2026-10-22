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

function signedExpenseRows(rows: PnlDraftRow[]): PnlDraftRow[] {
  const excluded = new Set(['revenue', 'cogs', 'payroll', 'opex', 'depreciation', 'interest', 'tax']);
  return rows.filter((row) => {
    const key = canonicalArticleKey(row.article);
    if (excluded.has(key) || isDerivedPnlArticle(row.article)) return false;
    // STEN stores expenses as negative values. Do not guess whether positive-only rows are expenses.
    return (isFiniteNumber(row.plan) && row.plan < 0) || (isFiniteNumber(row.fact) && row.fact < 0);
  });
}

/**
 * Uses STEN's signed convention (expenses are negative).
 * A controllable profit is only reported when source inputs are complete and no expense
 * remains unclassified. Aggregate OPEX cannot safely be split or combined with detail rows
 * without a source-level guarantee that they do not overlap.
 */
export function calculateClassifiedPlData(
  rows: PnlDraftRow[],
  overrides?: LocalClassificationOverride,
): EnrichedPlData {
  const detailedExpenseRows = signedExpenseRows(rows);
  const hasAggregateOpex = rows.some((row) => canonicalArticleKey(row.article) === 'opex');
  const articlesWithTypes: ClassifiedPlArticle[] = detailedExpenseRows.map((row) => ({
    id: row.id,
    name: row.article,
    plan: row.plan,
    fact: row.fact,
    controlType: classifyExpense(row.article, row.id, overrides),
  }));

  const sumByType = (type: ExpenseControlType, field: 'plan' | 'fact') => {
    const selected = articlesWithTypes.filter((row) => row.controlType === type);
    // An empty category is zero only when there is a detailed, fully classified expense list.
    if (selected.length === 0) {
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
  const payroll = rows.find((row) => canonicalArticleKey(row.article) === 'payroll');

  const profitFor = (field: 'plan' | 'fact'): number | undefined => {
    if (hasAggregateOpex || articlesWithTypes.some((row) => row.controlType === 'unknown')) return undefined;
    const rev = revenue?.[field];
    const cost = cogs?.[field];
    const labor = payroll?.[field];
    const controllable = controllableOpex[field];
    if (![rev, cost, labor, controllable].every(isFiniteNumber)) return undefined;
    // Revenue + signed COGS + signed payroll + signed controllable OPEX.
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
