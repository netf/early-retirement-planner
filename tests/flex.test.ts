import assert from "node:assert/strict";
import test from "node:test";
import { runMonteCarlo, simulatePlan, type MarketPath, type PlanInputs } from "../lib/planner.ts";
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-6, `expected ${expected}, got ${actual}`);
import { FLAT_PORTFOLIO, noAccounts, noIncome, ukScenario } from "./helpers.ts";

/** £1,000/month from a £300k tax-free pot: anchor rate 4%. Band ±20%, step 10%, floor £700, ceiling £2,000. */
function flexPlan(overrides: Partial<PlanInputs> = {}): PlanInputs {
  return ukScenario({
    currentAge: 60, retirementAge: 60, planToAge: 70, spendingStrategy: "flex", desiredMonthlySpending: 1_000, essentialMonthlySpending: 700, spendingCeilingMonthly: 2_000, flexBandPercent: 20, flexStepPercent: 10,
    portfolio: FLAT_PORTFOLIO, accounts: { ...noAccounts("uk"), isa: { balance: 300_000, monthlyContribution: 0 } }, guaranteedIncome: noIncome("uk"), properties: [], ...overrides,
  });
}

function pathWith(plan: PlanInputs, returns: number[]): MarketPath {
  const length = plan.planToAge - plan.currentAge + 1;
  const series = Array.from({ length }, (_, index) => returns[index] ?? 0);
  return { stockReturns: series, bondReturns: series, portfolioReturns: series, cashReturns: series, inflation: Array.from({ length }, () => 0), propertyShocks: Array.from({ length }, () => 0), vacancyMultipliers: Array.from({ length }, () => 1) };
}

test("the anchor is the first year's withdrawal rate and nothing changes while the rate stays inside the band", () => {
  const years = simulatePlan(flexPlan(), pathWith(flexPlan(), [0, 0, 0])).years;
  assert.equal(years[0]!.detail.spending.anchorRate, 12_000 / 300_000);
  near(years[0]!.spending, 12_000);
  // Year 1: pot 288,000 → rate 4.17%, within ±20% of 4% → unchanged
  near(years[1]!.spending, 12_000);
  assert.equal(years[1]!.detail.spending.adjustment, 0);
});

test("spending steps up 10% when the pot grows enough to push the rate below 80% of the anchor", () => {
  const plan = flexPlan();
  // Year 1 return +30%: pot 288,000 × 1.3 = 374,400 → 12,000 / 374,400 = 3.2% ≥ 3.2%… push harder: +40% → 403,200 → 2.98% < 3.2% → raise
  const years = simulatePlan(plan, pathWith(plan, [0, 40, 0])).years;
  near(years[1]!.spending, 13_200);
  near(years[1]!.detail.spending.adjustment, 1_200);
  assert.ok(years[1]!.detail.spending.withdrawalRate! < 0.032);
  // Year 2: pot 390,000 → 13,200 / 390,000 = 3.38%: inside the band, so it holds at the raised level
  near(years[2]!.spending, 13_200);
});

test("spending steps down 10% when the rate rises above 120% of the anchor, never below the floor", () => {
  const plan = flexPlan();
  const years = simulatePlan(plan, pathWith(plan, [0, -30, -30, -30, -30, -30])).years;
  // Year 1: 288,000 × 0.7 = 201,600 → 12,000 / 201,600 = 5.95% > 4.8% → cut to 10,800
  near(years[1]!.spending, 10_800);
  // Keep falling: 10,800 → 9,720 → 8,748 → floor 8,400
  near(years[2]!.spending, 9_720);
  near(years[3]!.spending, 8_748);
  near(years[4]!.spending, 8_400);
  assert.equal(years[4]!.detail.spending.atFloor, true);
  near(years[5]!.spending, 8_400);
});

test("spending never exceeds the ceiling however well markets do", () => {
  const plan = flexPlan();
  const years = simulatePlan(plan, pathWith(plan, [0, 80, 80, 80, 80, 80, 80, 80, 80])).years;
  const last = years.at(-1)!;
  near(last.spending, 24_000);
  assert.equal(last.detail.spending.atCeiling, true);
  for (const year of years) assert.ok(year.spending <= 24_000 + 1e-6 && year.spending >= 8_400 - 1e-6);
});

test("the band compares the portfolio-funded part only: guaranteed income does not count as a withdrawal", () => {
  const plan = flexPlan({ guaranteedIncome: { ...noIncome("uk"), statePension: { annual: 6_000, fromAge: 60 } } });
  const first = simulatePlan(plan, pathWith(plan, [0])).years[0]!;
  assert.equal(first.detail.spending.anchorRate, 6_000 / 300_000);
});

test("Monte Carlo reports spending percentiles and how often the floor is hit", () => {
  const plan = flexPlan({ planToAge: 95, portfolio: { ...ukScenario().portfolio } });
  const result = runMonteCarlo(plan, 200);
  const late = result.years.at(-1)!;
  assert.ok(late.spendP10 <= late.spendMedian && late.spendMedian <= late.spendP90);
  assert.ok(late.spendP10 >= 8_400 - 1e-6 && late.spendP90 <= 24_000 + 1e-6);
  assert.ok(result.floorRate >= 0 && result.floorRate <= 100);
  const fixed = runMonteCarlo({ ...plan, spendingStrategy: "fixed" }, 200);
  assert.equal(fixed.floorRate, 0);
  assert.equal(fixed.years.at(-1)!.spendP90, 12_000);
});
