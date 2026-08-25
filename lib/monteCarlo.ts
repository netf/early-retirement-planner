import { mixReturn, planMix, type MarketPath } from "./market.ts";
import { clamp, percentile } from "./money.ts";
import { pensionAccessAge, type PlanInputs } from "./plan.ts";
import { simulatePlan, type Projection } from "./simulate.ts";

export type MonteCarloYear = {
  age: number;
  p10: number; p25: number; median: number; p75: number; p90: number;
  /** Share of futures (0–100) that have run out of money at or before this age. */
  failedByNow: number;
  spendP10: number; spendMedian: number; spendP90: number;
};

export type MonteCarloResult = {
  paths: number;
  successRate: number;
  p10Ending: number;
  medianEnding: number;
  p90Ending: number;
  medianFailureAge: number | null;
  /** Share of futures in which a planned property purchase could not be funded. */
  unfundedPurchaseRate: number;
  /** Share of futures that ran short before the first locked account opened. */
  bridgeFailureRate: number;
  /** Share of futures in which the spending rule ever pinned spending to the essential floor. */
  floorRate: number;
  /** Typical number of retirement years spent at the floor, across futures that touched it. */
  medianYearsAtFloor: number;
  years: MonteCarloYear[];
  /** Seeds of the simulated futures whose ending balance sits closest to the 10th and 50th percentiles. */
  representativeSeeds: { poor: number; typical: number };
};

export const MONTE_CARLO_PATHS = 1_000;
export const SOLVER_PATHS = 240;

function mulberry32(seed: number): () => number {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
}

/** Standard normal via Box–Muller. */
function normal(random: () => number): number {
  const first = Math.max(Number.EPSILON, random());
  const second = Math.max(Number.EPSILON, random());
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

const STOCK_BOND_CORRELATION = 0.15;

/** Deterministic for a given seed, so the same inputs always produce the same futures. */
export function generateMarketPath(plan: PlanInputs, seed: number): MarketPath {
  const random = mulberry32(seed);
  const length = plan.planToAge - plan.currentAge + 1;
  const defaultMix = planMix(plan);
  const p = plan.portfolio;
  const inflationMean = p.inflationPercent;
  const path: MarketPath = { stockReturns: [], bondReturns: [], portfolioReturns: [], cashReturns: [], inflation: [], propertyShocks: Array.from({ length }, () => 0), vacancyMultipliers: Array.from({ length }, () => 1) };

  for (let index = 0; index < length; index += 1) {
    const stockZ = normal(random);
    const bondZ = stockZ * STOCK_BOND_CORRELATION + normal(random) * Math.sqrt(1 - STOCK_BOND_CORRELATION ** 2);
    const inflation = clamp(inflationMean + normal(random) * p.inflationVolatilityPercent, -1, 12);
    const stockReturn = clamp(p.stockReturnPercent + stockZ * p.stockVolatilityPercent, -65, 70);
    const bondReturn = clamp(p.bondReturnPercent + bondZ * p.bondVolatilityPercent, -30, 40);
    const cashReturn = clamp(Math.max(p.cashReturnPercent, inflation - 1) + normal(random) * 0.5, 0, 12);
    path.stockReturns.push(stockReturn);
    path.bondReturns.push(bondReturn);
    path.portfolioReturns.push(mixReturn(defaultMix, stockReturn, bondReturn, cashReturn));
    path.cashReturns.push(cashReturn);
    path.inflation.push(inflation);
  }
  return path;
}

export function seedFor(index: number): number {
  return 17_071 + index * 7_919;
}

export function runMonteCarlo(plan: PlanInputs, pathCount = MONTE_CARLO_PATHS): MonteCarloResult {
  const outcomes: Projection[] = [];
  for (let index = 0; index < pathCount; index += 1) {
    outcomes.push(simulatePlan(plan, generateMarketPath(plan, seedFor(index)), { detail: false }));
  }
  const ascending = (left: number, right: number) => left - right;
  const successful = outcomes.filter((outcome) => outcome.firstShortfall === null).length;
  const endings = outcomes.map((outcome) => outcome.years.at(-1)?.totalInvestments ?? 0).sort(ascending);
  const accessAge = pensionAccessAge(plan);
  const bridgeFailures = outcomes.filter((outcome) => outcome.firstShortfall !== null && outcome.firstShortfall < accessAge).length;
  const failureAges = outcomes.flatMap((outcome) => outcome.firstShortfall === null ? [] : [outcome.firstShortfall]).sort(ascending);
  const years = Array.from({ length: plan.planToAge - plan.currentAge + 1 }, (_, index) => {
    const values = outcomes.map((outcome) => outcome.years[index]?.totalInvestments ?? 0).sort(ascending);
    const spend = outcomes.map((outcome) => { const year = outcome.years[index]; return year ? year.spending - year.oneOffSpending : 0; }).sort(ascending);
    const age = plan.currentAge + index;
    const failedByNow = outcomes.filter((outcome) => outcome.firstShortfall !== null && outcome.firstShortfall <= age).length / pathCount * 100;
    return {
      age, failedByNow,
      p10: percentile(values, 0.1), p25: percentile(values, 0.25), median: percentile(values, 0.5), p75: percentile(values, 0.75), p90: percentile(values, 0.9),
      spendP10: percentile(spend, 0.1), spendMedian: percentile(spend, 0.5), spendP90: percentile(spend, 0.9),
    };
  });
  const unsortedEndings = outcomes.map((outcome) => outcome.years.at(-1)?.totalInvestments ?? 0);
  const nearest = (target: number) => unsortedEndings.reduce((best, value, index) => Math.abs(value - target) < Math.abs(unsortedEndings[best]! - target) ? index : best, 0);
  const p10 = percentile(endings, 0.1);
  const median = percentile(endings, 0.5);
  // Among paths with the same ending (e.g. many at £0) prefer the one that fails latest — the more typical bad future.
  const nearestLateFail = (target: number) => {
    const ties = unsortedEndings.map((value, index) => ({ value, index })).filter((item) => Math.abs(item.value - target) < 1);
    if (ties.length === 0) return nearest(target);
    return ties.sort((left, right) => (outcomes[right.index]!.firstShortfall ?? 999) - (outcomes[left.index]!.firstShortfall ?? 999))[Math.floor(ties.length / 2)]!.index;
  };
  const yearsAtFloor = outcomes.map((outcome) => outcome.years.filter((year) => year.detail.spending.atFloor).length);
  const touchedFloor = yearsAtFloor.filter((count) => count > 0).sort(ascending);
  return {
    paths: pathCount,
    successRate: successful / pathCount * 100,
    p10Ending: percentile(endings, 0.1),
    medianEnding: percentile(endings, 0.5),
    p90Ending: percentile(endings, 0.9),
    medianFailureAge: failureAges.length > 0 ? Math.round(percentile(failureAges, 0.5)) : null,
    unfundedPurchaseRate: outcomes.filter((outcome) => outcome.unfundedPurchases.length > 0).length / pathCount * 100,
    bridgeFailureRate: bridgeFailures / pathCount * 100,
    floorRate: touchedFloor.length / pathCount * 100,
    representativeSeeds: { poor: seedFor(nearestLateFail(p10)), typical: seedFor(nearestLateFail(median)) },
    medianYearsAtFloor: touchedFloor.length > 0 ? Math.round(percentile(touchedFloor, 0.5)) : 0,
    years,
  };
}

/** Success rate on the smaller, consistently seeded sample the solvers use. */
export function quickSuccessRate(plan: PlanInputs): number {
  return runMonteCarlo(plan, SOLVER_PATHS).successRate;
}
