import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultPlan, expectedInflation, expectedPortfolioReturn, generateMarketPath, runMonteCarlo, percentile } from "../lib/planner.ts";
import { ukScenario } from "./helpers.ts";

test("simulated returns and inflation average out to the assumptions entered", () => {
  const plan = createDefaultPlan("uk");
  const returns: number[] = [];
  const inflation: number[] = [];
  for (let seed = 0; seed < 400; seed += 1) {
    const path = generateMarketPath(plan, seed);
    returns.push(...path.portfolioReturns);
    inflation.push(...path.inflation);
  }
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const deviation = (values: number[]) => Math.sqrt(values.reduce((sum, value) => sum + (value - mean(values)) ** 2, 0) / values.length);
  assert.ok(Math.abs(mean(returns) - expectedPortfolioReturn(plan)) < 0.25, `mean return ${mean(returns)}`);
  assert.ok(Math.abs(mean(inflation) - expectedInflation(plan)) < 0.1, `mean inflation ${mean(inflation)}`);
  // 80% stocks at 18% vol, 15% bonds at 7%, correlation 0.15 → portfolio vol ≈ 14.6%
  assert.ok(Math.abs(deviation(returns) - 14.6) < 0.6, `return volatility ${deviation(returns)}`);
});


test("success rate falls as spending rises and never exceeds the share of paths without a shortfall", () => {
  const base = ukScenario();
  let previous = 101;
  for (const monthly of [800, 2_000, 3_500, 6_000]) {
    const result = runMonteCarlo({ ...base, desiredMonthlySpending: monthly, essentialMonthlySpending: Math.min(800, monthly) }, 200);
    assert.ok(result.successRate <= previous, `${monthly}: ${result.successRate} > ${previous}`);
    assert.ok(result.p10Ending <= result.medianEnding && result.medianEnding <= result.p90Ending);
    previous = result.successRate;
  }
});

test("percentile interpolates linearly", () => {
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(percentile([10], 0.9), 10);
  assert.equal(percentile([0, 100], 0.25), 25);
  assert.equal(percentile([], 0.5), 0);
});

test("per-year percentiles are ordered and the failure curve climbs from zero to the failure rate", () => {
  const plan = ukScenario({ desiredMonthlySpending: 3_500, essentialMonthlySpending: 800 });
  const result = runMonteCarlo(plan, 200);
  let previousFailed = 0;
  for (const year of result.years) {
    assert.ok(year.p10 <= year.p25 && year.p25 <= year.median && year.median <= year.p75 && year.p75 <= year.p90, `age ${year.age}`);
    assert.ok(year.failedByNow >= previousFailed, `failure share never falls (age ${year.age})`);
    if (year.age < plan.retirementAge) assert.equal(year.failedByNow, 0, "nothing runs out while still working");
    previousFailed = year.failedByNow;
  }
  assert.ok(Math.abs((result.years.at(-1)?.failedByNow ?? 0) - (100 - result.successRate)) < 1e-9, "ends at the share of futures that ran out");
  assert.ok(result.years.at(-1)!.failedByNow > 0, "the test plan should have some failures");
});
