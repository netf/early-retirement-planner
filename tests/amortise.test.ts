import assert from "node:assert/strict";
import test from "node:test";
import { annuityPayment, calculateGoalMetrics, createDefaultPlan, presentValue, simulatePlan, type MarketPath, type PlanInputs } from "../lib/planner.ts";
import { FLAT_PORTFOLIO, noAccounts, noIncome, ukScenario } from "./helpers.ts";

const near = (actual: number, expected: number, message: string, tolerance = 0.01) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);

/** Retire today at 60 with £300k in a tax-free account, plan to 79 (20 years), no income, no bounds, no smoothing. */
function base(overrides: Partial<PlanInputs> = {}): PlanInputs {
  return ukScenario({
    currentAge: 60, retirementAge: 60, planToAge: 79, spendingStrategy: "amortise", amortiseTargetAtEnd: 0, amortiseRealReturnPercent: 0, amortiseSmoothingPercent: 0,
    desiredMonthlySpending: 1_000, essentialMonthlySpending: 0, spendingCeilingMonthly: 1_000_000, portfolio: FLAT_PORTFOLIO,
    accounts: { ...noAccounts("uk"), isa: { balance: 300_000, monthlyContribution: 0 } }, guaranteedIncome: noIncome("uk"), properties: [], ...overrides,
  });
}

function constant(plan: PlanInputs, nominal: number, inflation = 0): MarketPath {
  const length = plan.planToAge - plan.currentAge + 1;
  const fill = (value: number) => Array.from({ length }, () => value);
  return { stockReturns: fill(nominal), bondReturns: fill(nominal), portfolioReturns: fill(nominal), cashReturns: fill(nominal), inflation: fill(inflation), propertyShocks: fill(0), vacancyMultipliers: fill(1) };
}

test("at a 0% assumed return the payment is pot ÷ years left, and the pot is exactly exhausted at the end", () => {
  const years = simulatePlan(base(), constant(base(), 0)).years;
  near(years[0]!.spending, 300_000 / 20, "year 1");
  for (const year of years) near(year.spending, 15_000, `age ${year.age}`);
  near(years.at(-1)!.totalInvestments, 0, "nothing left at 79");
  assert.equal(years.at(-1)!.detail.spending.amortisation!.yearsLeft, 1);
});

test("when markets deliver exactly the assumed real return, the payment is the level annuity and the pot lands on the target", () => {
  const plan = base({ amortiseRealReturnPercent: 3, amortiseTargetAtEnd: 50_000 });
  const years = simulatePlan(plan, constant(plan, 3)).years;
  const expected = annuityPayment(300_000 - presentValue(50_000, 0.03, 19), 0.03, 20);
  for (const year of years) near(year.spending, expected, `age ${year.age}`, 0.05);
  near(years.at(-1)!.totalInvestments, 50_000, "target left at 79", 0.5);
});

test("when markets do worse than assumed the payment falls each year; when better it rises", () => {
  const plan = base({ amortiseRealReturnPercent: 3 });
  const worse = simulatePlan(plan, constant(plan, 0)).years.map((year) => year.spending);
  const better = simulatePlan(plan, constant(plan, 6)).years.map((year) => year.spending);
  for (let index = 1; index < worse.length; index += 1) assert.ok(worse[index]! < worse[index - 1]!, `worse: year ${index}`);
  for (let index = 1; index < better.length; index += 1) assert.ok(better[index]! > better[index - 1]!, `better: year ${index}`);
  near(simulatePlan(plan, constant(plan, 0)).years.at(-1)!.totalInvestments, 0, "still exhausted exactly at the end", 0.5);
});

test("future guaranteed income raises today's payment by its annuitised present value", () => {
  const without = simulatePlan(base({ amortiseRealReturnPercent: 2 }), constant(base(), 2)).years[0]!;
  const plan = base({ amortiseRealReturnPercent: 2, guaranteedIncome: { ...noIncome("uk"), statePension: { annual: 6_000, fromAge: 70 } } });
  const withPension = simulatePlan(plan, constant(plan, 2)).years[0]!;
  // £6,000 a year (under the personal allowance, so untaxed) from 70 to 79: PV at 2%, then spread over 20 years
  let pv = 0;
  for (let age = 70; age <= 79; age += 1) pv += presentValue(6_000, 0.02, age - 60);
  near(withPension.spending - without.spending, annuityPayment(pv, 0.02, 20), "uplift", 0.05);
  near(withPension.detail.spending.amortisation!.futureIncomeValue, pv, "pv recorded", 0.05);
});

test("smoothing limits the year-on-year change, and floor and ceiling bound the payment", () => {
  const smoothed = base({ amortiseRealReturnPercent: 3, amortiseSmoothingPercent: 10 });
  const path = constant(smoothed, 3);
  path.stockReturns[1] = -40; path.bondReturns[1] = -40; path.portfolioReturns[1] = -40; path.cashReturns[1] = -40;
  const years = simulatePlan(smoothed, path).years;
  near(years[1]!.spending, years[0]!.spending * 0.9, "cut capped at 10%");
  assert.ok(years[1]!.detail.spending.amortisation!.unsmoothed < years[1]!.spending, "unsmoothed payment was lower");

  const bounded = base({ essentialMonthlySpending: 1_400, spendingCeilingMonthly: 1_500 });
  const years2 = simulatePlan(bounded, constant(bounded, 0)).years;
  near(years2[0]!.spending, 16_800, "the £15,000 payment is lifted to the £1,400/mo floor");
});

test("floor and ceiling clamp the payment and are flagged", () => {
  const floored = base({ essentialMonthlySpending: 1_500 });
  const first = simulatePlan(floored, constant(floored, 0)).years[0]!;
  near(first.spending, 18_000, "floor £1,500/mo beats the £15,000 payment");
  assert.equal(first.detail.spending.atFloor, true);
  const capped = base({ spendingCeilingMonthly: 1_000 });
  const second = simulatePlan(capped, constant(capped, 0)).years[0]!;
  near(second.spending, 12_000, "ceiling £1,000/mo caps the £15,000 payment");
  assert.equal(second.detail.spending.atCeiling, true);
});

test("the headline 'spending the plan can carry' is the rule's first-year payment", () => {
  const goals = calculateGoalMetrics(base(), () => 100);
  assert.equal(goals.sustainableMonthlySpending, Math.round(15_000 / 12));
});

test("while the pension is locked, the payment is capped by what accessible money can sustain until it opens", () => {
  // £50k ISA accessible, £500k SIPP locked until 70, retire at 60: total-wealth amortisation would spend far more than the ISA can fund.
  const plan = base({ planToAge: 89, accounts: { ...noAccounts("uk"), isa: { balance: 50_000, monthlyContribution: 0 }, sipp: { balance: 500_000, monthlyContribution: 0, accessAge: 70 } } });
  const years = simulatePlan(plan, constant(plan, 0)).years;
  const first = years[0]!;
  near(first.spending, 50_000 / 10, "£50k over the 10 bridge years");
  assert.equal(first.detail.spending.amortisation!.bridgeCap, 5_000);
  assert.ok(first.detail.spending.amortisation!.unsmoothed < 550_000 / 30 + 1, "the cap bound, not the total-wealth payment");
  assert.equal(simulatePlan(plan, constant(plan, 0)).firstShortfall, null);
  // Once the SIPP opens the payment jumps to the full amortisation of what is left: £25,000 gross, spendable net of tax.
  const at70 = years.find((year) => year.age === 70)!;
  near(at70.detail.spending.amortisation!.grossPayment, 500_000 / 20, "gross £500k over the remaining 20 years");
  const taxOn25k = (0.75 * 25_000 - 12_570) * 0.2;
  near(at70.spending, 25_000 - taxOn25k, "spendable after SIPP tax");
  near(at70.withdrawals, 25_000, "the pot pays out the gross payment");
  near(years.at(-1)!.totalInvestments, 0, "and is exhausted at the end", 1);
});

test("with several locked accounts the cap respects every unlock age, not just the first", () => {
  // Retire at 55 with 50k reachable, a 10k PPK opening at 60 and a 900k IKZE opening at 65, plan to 84 at 0% real.
  // The first barrier alone would allow 50k / 5 = 10k a year; but 60k must then last until 65, so 6k a year is the true cap.
  const plan: PlanInputs = {
    ...createDefaultPlan("pl"), currentAge: 55, retirementAge: 55, planToAge: 84, spendingStrategy: "amortise", amortiseTargetAtEnd: 0, amortiseRealReturnPercent: 0, amortiseSmoothingPercent: 0,
    desiredMonthlySpending: 1_000, essentialMonthlySpending: 0, spendingCeilingMonthly: 1_000_000, portfolio: FLAT_PORTFOLIO, guaranteedIncome: noIncome("pl"), properties: [],
    accounts: { ...noAccounts("pl"), brokerage: { balance: 50_000, monthlyContribution: 0 }, ppk: { balance: 10_000, monthlyContribution: 0, accessAge: 60 }, ikze: { balance: 900_000, monthlyContribution: 0, accessAge: 65 } },
  };
  const run = simulatePlan(plan, constant(plan, 0));
  const first = run.years[0]!;
  near(first.spending, 6_000, "60k reachable before 65, over 10 years");
  assert.equal(first.detail.spending.amortisation!.bridgeCap, 6_000);
  assert.equal(run.firstShortfall, null, "nothing runs short while the IKZE is locked");
  const at60 = run.years.find((year) => year.age === 60)!;
  near(at60.spending, 6_000, "still 30k over the 5 years to 65 once the PPK opens");
  const at65 = run.years.find((year) => year.age === 65)!;
  near(at65.detail.spending.amortisation!.grossPayment, 900_000 / 20, "then the IKZE amortises over the remaining 20 years");
  near(at65.spending, 45_000 * 0.9, "spendable after the 10% flat IKZE tax");
  near(run.years.at(-1)!.totalInvestments, 0, "and everything is spent by the end", 1);
});

test("with a taxed pension the pot still lands on the target because the payment is gross of tax", () => {
  const plan = base({ amortiseTargetAtEnd: 40_000, accounts: { ...noAccounts("uk"), sipp: { balance: 400_000, monthlyContribution: 0, accessAge: 57 } } });
  const years = simulatePlan(plan, constant(plan, 0)).years;
  near(years.at(-1)!.totalInvestments, 40_000, "target left", 1);
  for (const year of years) assert.ok(year.spending < year.detail.spending.amortisation!.grossPayment + 1e-6, `age ${year.age}: net below gross`);
  assert.equal(simulatePlan(plan, constant(plan, 0)).firstShortfall, null);
});

test("a plan checked-in past its retirement age still reports the first-year payment and pays it", () => {
  const plan = base({ currentAge: 62, retirementAge: 60, planToAge: 79, amortiseSmoothingPercent: 10 });
  const goals = calculateGoalMetrics(plan, () => 100);
  assert.ok(goals.sustainableMonthlySpending > 0, `${goals.sustainableMonthlySpending}`);
  const first = simulatePlan(plan, constant(plan, 0)).years[0]!;
  assert.equal(first.age, 62);
  near(first.spending, 300_000 / 18, "pot over the 18 years left");
});

