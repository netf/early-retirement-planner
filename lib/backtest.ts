import { HISTORY, HISTORY_LAST_YEAR, type HistoryYear } from "./history.ts";
import { expectedPath, mixReturn, planMix, type MarketPath } from "./market.ts";
import type { PlanInputs } from "./plan.ts";
import { simulatePlan } from "./simulate.ts";

export type BacktestWindow = {
  startYear: number;
  /** Number of retirement years drawn from history before the series ran out. */
  historicalYears: number;
  /** True when history covered the whole retirement; otherwise central assumptions fill the tail. */
  complete: boolean;
  passes: boolean;
  firstShortfall: number | null;
  endingBalance: number;
  /** Lowest annual spending in the window (flex/protect), today's money. */
  lowestSpending: number;
  yearsAtFloor: number;
};

export type BacktestResult = {
  windows: BacktestWindow[];
  survivalRate: number;
  worst: BacktestWindow | null;
  best: BacktestWindow | null;
  /** Windows that had at least this many historical years were included. */
  minimumHistoricalYears: number;
};

/** Minimum years of real history a window must contain to count. */
export const MIN_HISTORICAL_YEARS = 20;

/**
 * Build a market path that follows history from the year you stop work. Years before
 * retirement use the central assumptions (the sequence that matters starts at retirement),
 * and if the plan outlives the data the central assumptions resume.
 */
export function historicalPath(plan: PlanInputs, startYear: number): { path: MarketPath; historicalYears: number } {
  const path = expectedPath(plan);
  const defaultMix = planMix(plan);
  const retirementIndex = Math.max(0, plan.retirementAge - plan.currentAge);
  let historicalYears = 0;
  for (let index = retirementIndex; index < path.inflation.length; index += 1) {
    const year: HistoryYear | undefined = HISTORY[startYear - HISTORY[0]!.year + (index - retirementIndex)];
    if (!year) break;
    path.stockReturns[index] = year.stocks;
    path.bondReturns[index] = year.bonds;
    path.cashReturns[index] = year.cash;
    path.inflation[index] = year.inflation;
    path.portfolioReturns[index] = mixReturn(defaultMix, year.stocks, year.bonds, year.cash);
    historicalYears += 1;
  }
  return { path, historicalYears };
}

/** Run the plan against every historical retirement start with enough data. */
export function runBacktests(plan: PlanInputs): BacktestResult {
  const retirementYears = plan.planToAge - plan.retirementAge + 1;
  const floor = plan.essentialMonthlySpending * 12;
  const windows: BacktestWindow[] = [];
  for (let startYear = HISTORY[0]!.year; startYear <= HISTORY_LAST_YEAR - MIN_HISTORICAL_YEARS + 1; startYear += 1) {
    const { path, historicalYears } = historicalPath(plan, startYear);
    const projection = simulatePlan(plan, path, { detail: false });
    const retired = projection.years.filter((year) => year.age >= plan.retirementAge);
    windows.push({
      startYear,
      historicalYears,
      complete: historicalYears >= retirementYears,
      passes: projection.firstShortfall === null,
      firstShortfall: projection.firstShortfall,
      endingBalance: projection.years.at(-1)?.totalInvestments ?? 0,
      lowestSpending: retired.length > 0 ? Math.min(...retired.map((year) => year.spending - year.oneOffSpending)) : 0,
      yearsAtFloor: retired.filter((year) => year.detail.spending.atFloor || (plan.spendingStrategy === "guardrails" && year.spending - year.oneOffSpending <= floor + 1e-6 && year.detail.spending.adjustment < 0)).length,
    });
  }
  const passing = windows.filter((window) => window.passes).length;
  const byEnding = [...windows].sort((left, right) => left.endingBalance - right.endingBalance);
  const worst = [...windows].sort((left, right) => (left.firstShortfall ?? 999) - (right.firstShortfall ?? 999) || left.endingBalance - right.endingBalance)[0] ?? null;
  return { windows, survivalRate: windows.length > 0 ? passing / windows.length * 100 : 0, worst, best: byEnding.at(-1) ?? null, minimumHistoricalYears: MIN_HISTORICAL_YEARS };
}
