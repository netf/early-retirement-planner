/**
 * Closed-form and independently computed expectations. Each test derives the right answer
 * with its own arithmetic (annuity formulas, explicit tax bands, a brute-force solver) and
 * compares the engine against it to the penny.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultPlan, simulatePlan, type MarketPath, type PlanInputs } from "../lib/planner.ts";
import { FLAT_PORTFOLIO, noAccounts, noIncome, property, ukScenario } from "./helpers.ts";

const close = (actual: number, expected: number, tolerance = 0.01, message?: string) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message ?? ""} expected ${expected}, got ${actual}`);

function constantPath(plan: PlanInputs, nominalPercent: number, inflationPercent: number, cashPercent = nominalPercent): MarketPath {
  const length = plan.planToAge - plan.currentAge + 1;
  return {
    stockReturns: Array.from({ length }, () => nominalPercent),
    bondReturns: Array.from({ length }, () => nominalPercent),
    portfolioReturns: Array.from({ length }, () => nominalPercent),
    cashReturns: Array.from({ length }, () => cashPercent),
    inflation: Array.from({ length }, () => inflationPercent),
    propertyShocks: Array.from({ length }, () => 0),
    vacancyMultipliers: Array.from({ length }, () => 1),
  };
}

test("drawdown from one tax-free account follows the annuity formula exactly", () => {
  // Retire today with B0, spend S each year, real return r: B_n = (B0 − S)(1+r)^n − S((1+r)^n − 1)/r
  const B0 = 500_000, S = 24_000, nominal = 6, inflation = 2;
  const r = (1 + nominal / 100) / (1 + inflation / 100) - 1;
  const plan = ukScenario({ currentAge: 60, retirementAge: 60, planToAge: 90, desiredMonthlySpending: S / 12, essentialMonthlySpending: S / 12, spendingStrategy: "fixed", portfolio: FLAT_PORTFOLIO, accounts: { ...noAccounts("uk"), isa: { balance: B0, monthlyContribution: 0 } }, guaranteedIncome: noIncome("uk"), properties: [] });
  const years = simulatePlan(plan, constantPath(plan, nominal, inflation)).years;
  for (let n = 0; n <= 20; n += 1) {
    const expected = (B0 - S) * (1 + r) ** n - S * ((1 + r) ** n - 1) / r;
    close(years[n]!.balances.isa!, expected, 0.01, `year ${n}`);
    assert.equal(years[n]!.tax, 0);
    assert.equal(years[n]!.withdrawals, S);
  }
});

test("accumulation with contributions follows the future-value formula exactly", () => {
  // Contributions C land at the end of each year (no growth that year): B_N = B0(1+r)^N + C((1+r)^N − 1)/r
  const B0 = 100_000, C = 12_000, nominal = 5, inflation = 3;
  const r = (1 + nominal / 100) / (1 + inflation / 100) - 1;
  const plan = ukScenario({ currentAge: 30, retirementAge: 60, planToAge: 61, desiredMonthlySpending: 0, essentialMonthlySpending: 0, portfolio: FLAT_PORTFOLIO, accounts: { ...noAccounts("uk"), isa: { balance: B0, monthlyContribution: C / 12 } }, guaranteedIncome: noIncome("uk"), properties: [] });
  const years = simulatePlan(plan, constantPath(plan, nominal, inflation)).years;
  for (const N of [1, 5, 10, 30]) {
    const expected = B0 * (1 + r) ** N + C * ((1 + r) ** N - 1) / r;
    close(years[N]!.balances.isa!, expected, 0.01, `year ${N}`);
    assert.equal(years[N]!.contributions, C);
  }
});

test("taxable-account drag and cash return are applied to the right accounts", () => {
  const plan = ukScenario({ currentAge: 40, retirementAge: 60, planToAge: 61, portfolio: { ...FLAT_PORTFOLIO, stocksPercent: 100, taxableDragPercent: 0.5 }, accounts: { isa: { balance: 1_000, monthlyContribution: 0 }, sipp: { balance: 1_000, monthlyContribution: 0, accessAge: 57 }, gia: { balance: 1_000, monthlyContribution: 0 }, cash: { balance: 1_000, monthlyContribution: 0 } }, guaranteedIncome: noIncome("uk"), properties: [] });
  const year = simulatePlan(plan, constantPath(plan, 8, 2, 3)).years[1]!;
  const real = (nominal: number) => (1 + nominal / 100) / 1.02;
  close(year.balances.isa!, 1_000 * real(8));
  close(year.balances.sipp!, 1_000 * real(8));
  close(year.balances.gia!, 1_000 * real(7.5));
  close(year.balances.cash!, 1_000 * real(3));
});

test("the guardrail cuts spending the year after a severe real fall", () => {
  // All in stocks: a −20% stock year must trigger the cut.
  const plan = ukScenario({ currentAge: 60, retirementAge: 60, planToAge: 62, desiredMonthlySpending: 2_000, essentialMonthlySpending: 1_000, guardrailCutPercent: 10, portfolio: { ...FLAT_PORTFOLIO, stocksPercent: 100 }, accounts: { ...noAccounts("uk"), isa: { balance: 1_000_000, monthlyContribution: 0 } }, guaranteedIncome: noIncome("uk"), properties: [] });
  const path = constantPath(plan, 0, 0);
  path.stockReturns[1] = -20;
  assert.equal(simulatePlan(plan, path).years[1]!.spending, 21_600);
});

test("mortgage amortisation matches the standard loan formula and deflates with prices", () => {
  const M = 200_000, rate = 4, payment = 14_000, inflation = 3;
  const plan = ukScenario({ currentAge: 40, retirementAge: 70, planToAge: 71, portfolio: { ...FLAT_PORTFOLIO, inflationPercent: inflation }, accounts: noAccounts("uk"), guaranteedIncome: noIncome("uk"), properties: [property("uk", { purchaseAge: 40, value: 300_000, annualGrowthPercent: inflation, mortgage: M, mortgageRatePercent: rate, monthlyMortgagePayment: payment / 12 })] });
  const years = simulatePlan(plan, constantPath(plan, 0, inflation)).years;
  const i = rate / 100;
  for (const n of [1, 5, 10, 20]) {
    const nominalBalance = Math.max(0, M * (1 + i) ** n - payment * ((1 + i) ** n - 1) / i);
    const expectedEquity = 300_000 - nominalBalance / (1 + inflation / 100) ** n;
    close(years[n]!.propertyEquity, expectedEquity, 0.01, `year ${n}`);
  }
});

test("UK: SIPP withdrawal with 25% tax-free cash crossing into the higher-rate band", () => {
  // Independent UK tax function written from the published bands.
  const ukTax = (income: number) => {
    const allowance = Math.max(0, 12_570 - Math.max(0, income - 100_000) / 2);
    const taxable = Math.max(0, income - allowance);
    return Math.min(taxable, 37_700) * 0.2 + Math.min(Math.max(0, taxable - 37_700), 87_440) * 0.4 + Math.max(0, taxable - 125_140) * 0.45;
  };
  const net = 90_000;
  // Brute-force the gross withdrawal g with g − ukTax(0.75 g) = net.
  let low = 0, high = 1_000_000;
  for (let index = 0; index < 60; index += 1) { const mid = (low + high) / 2; if (mid - ukTax(0.75 * mid) >= net) high = mid; else low = mid; }
  const plan = ukScenario({ currentAge: 60, retirementAge: 60, planToAge: 61, desiredMonthlySpending: net / 12, essentialMonthlySpending: net / 12, portfolio: FLAT_PORTFOLIO, accounts: { ...noAccounts("uk"), sipp: { balance: 2_000_000, monthlyContribution: 0, accessAge: 57 } }, guaranteedIncome: noIncome("uk"), properties: [] });
  const year = simulatePlan(plan).years[0]!;
  close(year.withdrawals, high, 0.5);
  close(year.tax, ukTax(0.75 * high), 0.5);
  assert.equal(year.shortfall, 0);
});

test("UK: the tax-free lump-sum allowance is honoured across years and then exhausted", () => {
  const cap = 268_275;
  const plan = ukScenario({ currentAge: 60, retirementAge: 60, planToAge: 62, desiredMonthlySpending: 5_000, essentialMonthlySpending: 5_000, portfolio: FLAT_PORTFOLIO, taxFreeUsed: cap - 10_000, accounts: { ...noAccounts("uk"), sipp: { balance: 5_000_000, monthlyContribution: 0, accessAge: 57 } }, guaranteedIncome: noIncome("uk"), properties: [] });
  const projection = simulatePlan(plan);
  const [first, second] = projection.years;
  // Year 1: only £10,000 of the withdrawal can be tax-free.
  const ukTax = (income: number) => { const taxable = Math.max(0, income - 12_570); return Math.min(taxable, 37_700) * 0.2 + Math.max(0, taxable - 37_700) * 0.4; };
  close(first!.tax, ukTax(first!.withdrawals - 10_000), 0.5);
  close(projection.taxFreeUsed, cap, 0.01);
  // Year 2: nothing tax-free left.
  close(second!.tax, ukTax(second!.withdrawals), 0.5);
  close(second!.withdrawals - second!.tax, 60_000, 0.5);
});

test("UK: the finance-cost credit refunds 20% of mortgage interest, capped at the tax on the rental profit", () => {
  // Rent £24,000, costs 0, interest-only £100,000 mortgage at 5% → interest £5,000, profit £24,000
  const plan = ukScenario({ currentAge: 60, retirementAge: 60, planToAge: 61, desiredMonthlySpending: 0, essentialMonthlySpending: 0, portfolio: FLAT_PORTFOLIO, accounts: noAccounts("uk"), guaranteedIncome: noIncome("uk"), properties: [property("uk", { purchaseAge: 50, incomeMode: "detailed", monthlyRent: 2_000, runningCostsPercent: 0, vacancyPercent: 0, mortgage: 100_000, mortgageRatePercent: 5, monthlyMortgagePayment: 0, rentFromAge: 50 })] });
  const year = simulatePlan(plan).years[0]!;
  const taxOnProfit = (24_000 - 12_570) * 0.2;
  close(year.tax, taxOnProfit - 0.2 * 5_000);
  close(year.propertyIncome, 24_000 - 5_000);
  // Small profit: credit cannot exceed the tax due on it.
  const small = { ...plan, properties: [property("uk", { ...plan.properties[0]!, monthlyRent: 1_100 })] };
  const smallYear = simulatePlan(small).years[0]!;
  close(smallYear.tax, Math.max(0, (13_200 - 12_570) * 0.2 - Math.min(0.2 * 5_000, (13_200 - 12_570) * 0.2)));
});

test("phased spending picks the right phase every year and one-offs land in their year", () => {
  const plan = ukScenario({
    currentAge: 50, retirementAge: 50, planToAge: 80, spendingMode: "phased", spendingStrategy: "fixed", portfolio: FLAT_PORTFOLIO,
    spendingPhases: [{ id: "a", label: "a", startAge: 50, endAge: 59, monthlyAmount: 1_000 }, { id: "b", label: "b", startAge: 60, endAge: 69, monthlyAmount: 2_000 }, { id: "c", label: "c", startAge: 70, endAge: 80, monthlyAmount: 1_500 }],
    oneOffExpenses: [{ id: "o", label: "car", age: 55, amount: 30_000 }],
    accounts: { ...noAccounts("uk"), isa: { balance: 5_000_000, monthlyContribution: 0 } }, guaranteedIncome: noIncome("uk"), properties: [],
  });
  const years = simulatePlan(plan).years;
  const at = (age: number) => years.find((year) => year.age === age)!;
  assert.equal(at(50).spending, 12_000);
  assert.equal(at(55).spending, 42_000);
  assert.equal(at(55).oneOffSpending, 30_000);
  assert.equal(at(59).spending, 12_000);
  assert.equal(at(60).spending, 24_000);
  assert.equal(at(70).spending, 18_000);
  assert.equal(at(80).spending, 18_000);
});

test("guardrails cut spending only after a real fall of more than 10%, never below the floor", () => {
  const plan = ukScenario({ currentAge: 60, retirementAge: 60, planToAge: 63, desiredMonthlySpending: 2_000, essentialMonthlySpending: 1_900, guardrailCutPercent: 10, portfolio: { ...FLAT_PORTFOLIO, stocksPercent: 100 }, accounts: { ...noAccounts("uk"), isa: { balance: 1_000_000, monthlyContribution: 0 } }, guaranteedIncome: noIncome("uk"), properties: [] });
  const path = constantPath(plan, 0, 0);
  path.stockReturns[1] = -9;   // real −9%: no cut
  path.stockReturns[2] = -20;  // real −20%: cut 10% → 21,600, floor 22,800 wins
  path.stockReturns[3] = -20;
  const years = simulatePlan({ ...plan, essentialMonthlySpending: 1_000 }, path).years;
  assert.equal(years[1]!.spending, 24_000);
  assert.equal(years[2]!.spending, 21_600);
  const floored = simulatePlan(plan, path).years;
  assert.equal(floored[2]!.spending, 22_800);
});

test("a sold property's proceeds are spent before anything else and a surplus is banked", () => {
  const plan = ukScenario({ currentAge: 60, retirementAge: 60, planToAge: 62, desiredMonthlySpending: 1_000, essentialMonthlySpending: 1_000, portfolio: FLAT_PORTFOLIO, accounts: { ...noAccounts("uk"), isa: { balance: 100_000, monthlyContribution: 0 } }, guaranteedIncome: noIncome("uk"), properties: [property("uk", { purchaseAge: 50, sellAtAge: 61, value: 250_000, purchaseCostBasis: 250_000, saleCostsPercent: 2, monthlyNetIncome: 0 })] });
  const years = simulatePlan(plan).years;
  assert.equal(years[1]!.saleProceeds, 245_000);
  assert.equal(years[1]!.withdrawalsByAccount.cash, 12_000);
  assert.equal(years[1]!.withdrawalsByAccount.isa, 0);
  close(years[1]!.balances.cash!, 233_000);
});

test("US: married filing jointly uses the larger deduction and brackets", () => {
  const single = { ...createDefaultPlan("us"), currentAge: 62, retirementAge: 62, planToAge: 63, desiredMonthlySpending: 0, essentialMonthlySpending: 0, portfolio: FLAT_PORTFOLIO, accounts: noAccounts("us"), guaranteedIncome: { ...noIncome("us"), pension: { annual: 80_000, fromAge: 60 } }, properties: [], taxVariant: "single" };
  const married: PlanInputs = { ...single, taxVariant: "married" };
  const singleTax = 12_400 * 0.1 + 38_000 * 0.12 + (80_000 - 16_100 - 50_400) * 0.22;
  const marriedTax = 24_800 * 0.1 + (80_000 - 32_200 - 24_800) * 0.12;
  close(simulatePlan(single).years[0]!.tax, singleTax);
  close(simulatePlan(married).years[0]!.tax, marriedTax);
});

test("Poland: ryczałt tiers at 100,000 zł of gross rent", () => {
  const plan = { ...createDefaultPlan("pl"), currentAge: 66, retirementAge: 66, planToAge: 67, desiredMonthlySpending: 0, essentialMonthlySpending: 0, portfolio: FLAT_PORTFOLIO, accounts: noAccounts("pl"), guaranteedIncome: noIncome("pl"), properties: [property("pl", { purchaseAge: 50, incomeMode: "detailed", monthlyRent: 10_000, vacancyPercent: 0, runningCostsPercent: 0, rentFromAge: 50 })] };
  const year = simulatePlan(plan).years[0]!;
  close(year.tax, 100_000 * 0.085 + 20_000 * 0.125);
  close(year.propertyIncome, 120_000 - year.tax);
});

test("vacancy shocks scale rental income in the shocked years only", () => {
  const plan = ukScenario({ currentAge: 60, retirementAge: 60, planToAge: 62, desiredMonthlySpending: 0, essentialMonthlySpending: 0, portfolio: FLAT_PORTFOLIO, accounts: noAccounts("uk"), guaranteedIncome: noIncome("uk"), properties: [property("uk", { purchaseAge: 50, rentFromAge: 50 })] });
  const path = constantPath(plan, 0, 0);
  path.vacancyMultipliers[1] = 0.5;
  const years = simulatePlan(plan, path).years;
  assert.equal(years[0]!.propertyIncome, 10_200);
  assert.equal(years[1]!.propertyIncome, 5_100);
  assert.equal(years[2]!.propertyIncome, 10_200);
});

test("each year reports the market it saw and what it did to invested money", () => {
  const plan = ukScenario({ currentAge: 40, retirementAge: 60, planToAge: 42, portfolio: { ...FLAT_PORTFOLIO, stocksPercent: 100 }, accounts: { ...noAccounts("uk"), isa: { balance: 10_000, monthlyContribution: 0 } }, guaranteedIncome: noIncome("uk"), properties: [] });
  const years = simulatePlan(plan, constantPath(plan, 8, 2)).years;
  assert.deepEqual(years[0]!.market, { stockReturnPercent: 0, bondReturnPercent: 0, inflationPercent: 0, investedOpen: 0, investedGrowth: 0 }, "the starting year carries balances as entered");
  const year = years[1]!;
  assert.equal(year.market.stockReturnPercent, 8);
  assert.equal(year.market.inflationPercent, 2);
  assert.equal(year.market.investedOpen, 10_000);
  close(year.market.investedGrowth, 10_000 * (1.08 / 1.02 - 1));
  close(year.market.investedGrowth, year.detail.accounts.filter((account) => account.id !== "cash").reduce((sum, account) => sum + account.growth, 0));
});
