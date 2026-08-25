import assert from "node:assert/strict";
import test from "node:test";
import { calculateGoalMetrics, estimatedPropertyMonthlyCashIncome, runMonteCarlo, simulatePlan } from "../lib/planner.ts";
import { FLAT_PORTFOLIO, noAccounts, noIncome, property, ukScenario } from "./helpers.ts";

const year = (plan: Parameters<typeof simulatePlan>[0], age: number) => simulatePlan(plan).years.find((item) => item.age === age);

test("the rental-income scenario supports retirement at the target age", () => {
  const plan = ukScenario();
  assert.equal(runMonteCarlo(plan, 800).successRate, 100);
  const goals = calculateGoalMetrics(plan);
  assert.ok(goals.earliestRetirementAge !== null && goals.earliestRetirementAge <= plan.retirementAge);
  assert.equal(goals.extraMonthlyRequired, 0);
});

test("property income alone supports retirement when it exceeds spending", () => {
  const plan = ukScenario({ accounts: noAccounts("uk"), guaranteedIncome: noIncome("uk") });
  assert.equal(runMonteCarlo(plan, 240).successRate, 100);
  assert.equal(calculateGoalMetrics(plan).earliestRetirementAge, 46);
  assert.equal(simulatePlan(plan).firstShortfall, null);
});

test("gross rent below spending after costs produces the exact expected shortfall", () => {
  const plan = ukScenario({ accounts: noAccounts("uk"), guaranteedIncome: noIncome("uk"), properties: [property("uk", { incomeMode: "detailed", vacancyPercent: 8, runningCostsPercent: 18 })] });
  const retirementYear = year(plan, 50);
  assert.equal(retirementYear?.propertyIncome, 7_694.88);
  assert.equal(retirementYear?.shortfall, 1_905.12);
});

test("zero rent growth above inflation keeps constant purchasing power", () => {
  const plan = ukScenario({ accounts: noAccounts("uk"), guaranteedIncome: noIncome("uk"), portfolio: { ...ukScenario().portfolio, inflationPercent: 7 } });
  assert.equal(year(plan, 50)?.propertyIncome, 10_200);
  assert.equal(year(plan, 90)?.propertyIncome, 10_200);
});

test("personal allowance and basic-rate tax are applied to rental income", () => {
  const plan = ukScenario({ currentAge: 50, retirementAge: 50, desiredMonthlySpending: 0, essentialMonthlySpending: 0, accounts: noAccounts("uk"), guaranteedIncome: noIncome("uk"), properties: [property("uk", { purchaseAge: 50, monthlyNetIncome: 20_000 / 12 })] });
  assert.ok(Math.abs((year(plan, 50)?.tax ?? 0) - 1_486) < 0.01);
});

test("the SIPP is not used before its access age", () => {
  const plan = ukScenario({ accounts: { ...noAccounts("uk"), sipp: { balance: 220_000, monthlyContribution: 0, accessAge: 57 } }, guaranteedIncome: noIncome("uk"), properties: [] });
  const projection = simulatePlan(plan);
  assert.equal(projection.firstShortfall, 50);
  assert.ok((year(plan, 50)?.balances.sipp ?? 0) > 0);
  assert.equal(year(plan, 50)?.withdrawals, 0);
});

test("pension withdrawals fill the personal allowance first and carry 25% tax-free cash", () => {
  // £24,000 spending from SIPP only, no other income: 25% tax-free, the rest within allowance + basic rate
  const plan = ukScenario({ currentAge: 60, retirementAge: 60, planToAge: 61, desiredMonthlySpending: 2_000, essentialMonthlySpending: 2_000, portfolio: FLAT_PORTFOLIO, accounts: { ...noAccounts("uk"), sipp: { balance: 500_000, monthlyContribution: 0, accessAge: 57 } }, guaranteedIncome: noIncome("uk"), properties: [] });
  const first = year(plan, 60)!;
  // gross g: taxable 0.75g; tax = 0.2 * (0.75g − 12,570); net = g − tax = 24,000 → g = 25,143.(3)... solve: g − 0.15g + 2,514 = 24,000 → g = 25,277.65
  assert.ok(Math.abs(first.withdrawals - 25_277.65) < 1);
  assert.ok(Math.abs(first.tax - (0.75 * 25_277.65 - 12_570) * 0.2) < 1);
  assert.equal(first.shortfall, 0);
});

test("safe-spending solver returns zero when there is no income or capital", () => {
  const plan = ukScenario({ accounts: noAccounts("uk"), guaranteedIncome: noIncome("uk"), properties: [] });
  assert.equal(calculateGoalMetrics(plan).sustainableMonthlySpending, 0);
});

test("an essential-spending floor can never increase planned spending", () => {
  const plan = ukScenario({ essentialMonthlySpending: 3_000 });
  const years = plan.planToAge - plan.currentAge + 1;
  const projection = simulatePlan(plan, {
    stockReturns: Array.from({ length: years }, () => -30),
    bondReturns: Array.from({ length: years }, () => -30),
    portfolioReturns: Array.from({ length: years }, () => -30),
    cashReturns: Array.from({ length: years }, () => 0),
    inflation: Array.from({ length: years }, () => 2.5),
    propertyShocks: Array.from({ length: years }, () => 0),
    vacancyMultipliers: Array.from({ length: years }, () => 1),
  });
  assert.equal(projection.years.find((item) => item.age === 50)?.spending, 9_600);
});

test("rental summary shows expected cash after vacancy and running costs", () => {
  assert.equal(Math.round(estimatedPropertyMonthlyCashIncome(property("uk", { incomeMode: "detailed", vacancyPercent: 8, runningCostsPercent: 18 }))), 641);
});

test("four full years of contributions are included from age 46 to 50", () => {
  const plan = ukScenario({ planToAge: 55, desiredMonthlySpending: 0, essentialMonthlySpending: 0, portfolio: FLAT_PORTFOLIO, accounts: { ...noAccounts("uk"), isa: { balance: 0, monthlyContribution: 100 } }, guaranteedIncome: noIncome("uk"), properties: [] });
  assert.equal(year(plan, 50)?.balances.isa, 4_800);
});

test("retirement income above spending is saved to cash rather than lost", () => {
  const plan = ukScenario({ portfolio: FLAT_PORTFOLIO, accounts: noAccounts("uk"), guaranteedIncome: noIncome("uk") });
  assert.equal(year(plan, 50)?.balances.cash, 600);
  assert.equal(year(plan, 52)?.balances.cash, 1_800);
});

test("an unaffordable future purchase is skipped and reported, and the plan carries on", () => {
  const plan = ukScenario({ portfolio: FLAT_PORTFOLIO, accounts: { ...noAccounts("uk"), isa: { balance: 100_000, monthlyContribution: 0 } }, guaranteedIncome: noIncome("uk"), properties: [property("uk", { purchaseAge: 48, value: 500_000 })] });
  const projection = simulatePlan(plan);
  // Not a failure at 48: the plan simply goes on without the property (and runs dry much later on £800/month from £100k).
  assert.ok(projection.firstShortfall === null || projection.firstShortfall > 48);
  assert.deepEqual(projection.unfundedPurchases.map((item) => [item.age, Math.round(item.cost), Math.round(item.available)]), [[48, 525_000, 100_000]]);
  assert.equal(year(plan, 48)?.balances.isa, 100_000);
  assert.equal(year(plan, 48)?.purchaseShortfall, 525_000);
  assert.equal(year(plan, 48)?.propertyEquity, 0);
  assert.equal(year(plan, 60)?.propertyEquity, 0);
});

test("a fixed nominal mortgage shrinks in today's money as prices rise", () => {
  const plan = ukScenario({ desiredMonthlySpending: 0, essentialMonthlySpending: 0, portfolio: { ...FLAT_PORTFOLIO, inflationPercent: 10 }, accounts: noAccounts("uk"), guaranteedIncome: noIncome("uk"), properties: [property("uk", { annualGrowthPercent: 10, mortgage: 100_000, mortgageRatePercent: 5, monthlyNetIncome: 0 })] });
  assert.ok(Math.abs((year(plan, 50)?.propertyEquity ?? 0) - (200_000 - 100_000 / 1.1 ** 4)) < 0.01);
});

test("capital gains tax is charged on the nominal gain", () => {
  const plan = ukScenario({ desiredMonthlySpending: 0, essentialMonthlySpending: 0, portfolio: { ...FLAT_PORTFOLIO, inflationPercent: 10 }, accounts: noAccounts("uk"), guaranteedIncome: noIncome("uk"), properties: [property("uk", { annualGrowthPercent: 10, sellAtAge: 50, saleCostsPercent: 0, estimatedCgtPercent: 18 })] });
  const priceLevel = 1.1 ** 4;
  const cgt = 0.18 * (200_000 * priceLevel - 200_000) / priceLevel;
  assert.ok(Math.abs((year(plan, 50)?.balances.cash ?? 0) - (200_000 - cgt)) < 0.01);
});

test("a property bought in a future year does not grow in the purchase year", () => {
  const plan = ukScenario({ portfolio: FLAT_PORTFOLIO, accounts: { ...noAccounts("uk"), isa: { balance: 500_000, monthlyContribution: 0 } }, guaranteedIncome: noIncome("uk"), properties: [property("uk", { purchaseAge: 48, value: 100_000, annualGrowthPercent: 10, purchaseCostsPercent: 0 })] });
  assert.equal(year(plan, 48)?.propertyEquity, 100_000);
  assert.ok(Math.abs((year(plan, 49)?.propertyEquity ?? 0) - 110_000) < 0.01);
});
