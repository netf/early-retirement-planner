import { expectedPortfolioReturn } from "./market.ts";
import type { MonteCarloResult } from "./monteCarlo.ts";
import { accountSlots, newId, ownerAccounts, totalCurrentInvestments, type Baseline, type BaselineYear, type CheckIn, type PlanInputs } from "./plan.ts";
import type { Projection } from "./simulate.ts";

/**
 * Tracking a plan against reality. The baseline freezes what the plan expected at every age; each
 * check-in is a real balance. Comparing the two answers "am I ahead or behind the plan I made?" —
 * distinct from "is the plan still fine from here?", which the live verdict already answers.
 */

const DAY_MS = 24 * 3600 * 1000;

export function yearsBetween(from: string, to: string): number {
  return Math.max(0, (Date.parse(to) - Date.parse(from)) / (365.25 * DAY_MS));
}

/** Freeze today's forecast. Figures are rounded to the pound: the baseline travels inside links and files. */
export function captureBaseline(plan: PlanInputs, monteCarlo: MonteCarloResult, projection: Projection, setAt: string): Baseline {
  const years: BaselineYear[] = monteCarlo.years.map((year, index) => {
    const central = projection.years[index];
    return {
      age: year.age,
      p10: Math.round(year.p10), p25: Math.round(year.p25), median: Math.round(year.median), p75: Math.round(year.p75), p90: Math.round(year.p90),
      central: Math.round(central?.totalInvestments ?? 0),
      flows: Math.round(central ? central.contributions + central.surplusSaved + central.saleProceeds - central.withdrawals - central.purchaseOutlay : 0),
    };
  });
  return { setAt: setAt.slice(0, 10), age: plan.currentAge, startTotal: Math.round(totalCurrentInvestments(plan)), successRate: monteCarlo.successRate, targetConfidencePercent: plan.targetConfidencePercent, monthlySpending: plan.desiredMonthlySpending, years };
}

/** A check-in from the balances the plan holds right now. */
export function checkInNow(plan: PlanInputs, date: string): CheckIn {
  const balances = Object.fromEntries(accountSlots(plan).map((slot) => [slot.id, Math.round(ownerAccounts(plan, slot.owner)[slot.rule.id]?.balance ?? 0)]));
  return { id: newId("checkin"), date: date.slice(0, 10), age: plan.currentAge, total: Math.round(totalCurrentInvestments(plan)), balances };
}

/** The baseline's expectation at a possibly fractional age, interpolated between the two nearest years. */
export function expectedAt(baseline: Baseline, age: number): BaselineYear | null {
  const years = baseline.years;
  if (years.length === 0 || age < years[0]!.age || age > years.at(-1)!.age) return null;
  const lower = years.reduce((best, year) => year.age <= age ? year : best, years[0]!);
  const upper = years.find((year) => year.age >= age) ?? lower;
  if (upper.age === lower.age) return lower;
  const t = (age - lower.age) / (upper.age - lower.age);
  const mix = (key: keyof BaselineYear) => lower[key] + (upper[key] - lower[key]) * t;
  return { age, p10: mix("p10"), p25: mix("p25"), median: mix("median"), p75: mix("p75"), p90: mix("p90"), central: mix("central"), flows: mix("flows") };
}

/**
 * Where a value sits in the baseline's distribution at that age, as a percentile estimate: linear
 * between the five known percentiles, clamped to 1–99 beyond them. When the spread is nil (the
 * baseline's own starting year) everything sits at 50.
 */
export function percentileOf(expected: BaselineYear, value: number): number {
  const points: [number, number][] = [[expected.p10, 10], [expected.p25, 25], [expected.median, 50], [expected.p75, 75], [expected.p90, 90]];
  if (expected.p90 - expected.p10 < 1) return 50;
  if (value <= expected.p10) return Math.max(1, 10 - ((expected.p10 - value) / Math.max(1, expected.p25 - expected.p10)) * 15);
  if (value >= expected.p90) return Math.min(99, 90 + ((value - expected.p90) / Math.max(1, expected.p90 - expected.p75)) * 15);
  for (let index = 1; index < points.length; index += 1) {
    const [lowValue, lowPct] = points[index - 1]!;
    const [highValue, highPct] = points[index]!;
    if (value <= highValue) return highValue === lowValue ? highPct : lowPct + ((value - lowValue) / (highValue - lowValue)) * (highPct - lowPct);
  }
  return 90;
}

export type Progress = {
  /** Years since the baseline was set. */
  elapsedYears: number;
  age: number;
  /** The real pot as entered, restated in the baseline's money using the plan's inflation assumption. */
  actualReal: number;
  expected: BaselineYear;
  percentile: number;
  gapToMedian: number;
  /** Nominal annual return implied by the pot's change, assuming the plan's own flows; null until a quarter-year has passed. */
  realisedNominalReturn: number | null;
  assumedNominalReturn: number;
  successThen: number;
};

/** Compare a real balance, on a given date, with what the baseline expected by then. */
export function trackProgress(plan: PlanInputs, baseline: Baseline, actualTotal: number, date: string): Progress | null {
  const elapsedYears = yearsBetween(baseline.setAt, date);
  const age = baseline.age + elapsedYears;
  const expected = expectedAt(baseline, age);
  if (!expected) return null;
  const inflation = plan.portfolio.inflationPercent / 100;
  const actualReal = actualTotal / (1 + inflation) ** elapsedYears;
  // Flows the plan expected between baseline and now: whole years, plus a share of the year in progress.
  let flows = 0;
  for (let offset = 1; offset <= Math.floor(elapsedYears); offset += 1) flows += baseline.years[offset]?.flows ?? 0;
  const partial = elapsedYears - Math.floor(elapsedYears);
  if (partial > 0) flows += (baseline.years[Math.floor(elapsedYears) + 1]?.flows ?? 0) * partial;
  // Real-terms flows are restated nominally at the mid-point; good enough for a Dietz-style estimate.
  const nominalFlows = flows * (1 + inflation) ** (elapsedYears / 2);
  const denominator = baseline.startTotal + nominalFlows / 2;
  const totalReturn = denominator > 0 ? (actualTotal - baseline.startTotal - nominalFlows) / denominator : 0;
  const realisedNominalReturn = elapsedYears >= 0.25 && denominator > 0 && totalReturn > -1 ? ((1 + totalReturn) ** (1 / elapsedYears) - 1) * 100 : null;
  return { elapsedYears, age, actualReal, expected, percentile: percentileOf(expected, actualReal), gapToMedian: actualReal - expected.median, realisedNominalReturn, assumedNominalReturn: expectedPortfolioReturn(plan), successThen: baseline.successRate };
}
