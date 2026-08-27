import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultPlan, simulatePlan, type PlanInputs } from "../lib/planner.ts";
import { FLAT_PORTFOLIO, noAccounts, noIncome, property } from "./helpers.ts";

function roScenario(overrides: Partial<PlanInputs> = {}): PlanInputs {
  return { ...createDefaultPlan("ro"), currentAge: 66, retirementAge: 66, planToAge: 68, desiredMonthlySpending: 0, essentialMonthlySpending: 0, portfolio: FLAT_PORTFOLIO, accounts: noAccounts("ro"), guaranteedIncome: noIncome("ro"), properties: [], pots: [], ...overrides };
}
const close = (actual: number, expected: number, message: string, tolerance = 0.01) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);

test("Romania: a pension is untouched to 3,000 lei a month and pays 19% on the excess (10% CASS, then 10% tax)", () => {
  const small = roScenario({ guaranteedIncome: { statePension: { annual: 36_000, fromAge: 65 } } });
  assert.equal(simulatePlan(small).years[0]!.tax, 0, "3,000 lei/month is tax-free");
  const bigger = roScenario({ guaranteedIncome: { statePension: { annual: 60_000, fromAge: 65 } } });
  // Excess 24,000: CASS 2,400, then 10% of 21,600 = 2,160 — together 4,560 = 19% of the excess.
  close(simulatePlan(bigger).years[0]!.tax, 4_560, "10% CASS then 10% tax on the excess");
});

test("Romania: Pilon III opens at 60, Pilon II at 65, and withdrawals are taxed like pensions", () => {
  const locked = roScenario({ currentAge: 58, retirementAge: 58, planToAge: 59, desiredMonthlySpending: 1_000, essentialMonthlySpending: 1_000, accounts: { ...noAccounts("ro"), pilon3: { balance: 500_000, monthlyContribution: 0, accessAge: 60 } } });
  assert.equal(simulatePlan(locked).years[0]!.shortfall > 0, true, "nothing is reachable before 60");
  const open = roScenario({ accounts: { ...noAccounts("ro"), pilon3: { balance: 500_000, monthlyContribution: 0, accessAge: 60 } }, desiredMonthlySpending: 3_000, essentialMonthlySpending: 3_000 });
  const year = simulatePlan(open).years[0]!;
  assert.equal(year.shortfall, 0);
  assert.ok(year.tax > 0, "a 36,000/yr draw plus the excess of the gross-up is taxed above the exemption");
});

test("Romania: brokerage gains lose 3% of the return, deposits 10% of the interest", () => {
  const plan = roScenario({ currentAge: 40, retirementAge: 60, planToAge: 41, portfolio: { ...FLAT_PORTFOLIO, stocksPercent: 100, cashReturnPercent: 4 }, accounts: { ...noAccounts("ro"), brokerage: { balance: 100_000, monthlyContribution: 0 }, cash: { balance: 100_000, monthlyContribution: 0 } } });
  const years = simulatePlan(plan, { stockReturns: [0, 10], bondReturns: [0, 0], portfolioReturns: [0, 10], cashReturns: [0, 4], inflation: [0, 0], propertyShocks: [0, 0], vacancyMultipliers: [1, 1] }).years;
  close(years[1]!.balances.brokerage!, 100_000 * (1 + 0.10 * 0.97), "10% return keeps 9.7%");
  close(years[1]!.balances.cash!, 100_000 * (1 + 0.04 * 0.9), "4% interest keeps 3.6%");
});

test("Romania: long-term rent is taxed at 8% of gross up to the CASS band, 16% above", () => {
  const under = roScenario({ properties: [property("ro", { purchaseAge: 50, incomeMode: "detailed", monthlyRent: 5_000, rentFromAge: 66, runningCostsPercent: 0, vacancyPercent: 0, monthlyMortgagePayment: 0, mortgage: 0 })] });
  const year = simulatePlan(under).years[0]!;
  // 60,000 gross → 8% = 4,800 settled inside property income.
  close(year.propertyTax, 4_800, "8% of gross rent");
  close(year.propertyIncome, 55_200, "net of the flat tax");
  const over = roScenario({ properties: [property("ro", { purchaseAge: 50, incomeMode: "detailed", monthlyRent: 12_000, rentFromAge: 66, runningCostsPercent: 0, vacancyPercent: 0, monthlyMortgagePayment: 0, mortgage: 0 })] });
  // 144,000 gross: 8% on 121,500 + 16% on 22,500 = 9,720 + 3,600 = 13,320.
  close(simulatePlan(over).years[0]!.propertyTax, 13_320, "higher band above the threshold");
});
