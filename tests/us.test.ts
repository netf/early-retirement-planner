import assert from "node:assert/strict";
import test from "node:test";
import { PROFILES, createDefaultPlan, incomeTax, simulatePlan, taxSchedule, type PlanInputs } from "../lib/planner.ts";
import { FLAT_PORTFOLIO, noAccounts, noIncome, property } from "./helpers.ts";

function usScenario(overrides: Partial<PlanInputs> = {}): PlanInputs {
  return { ...createDefaultPlan("us"), currentAge: 60, retirementAge: 60, planToAge: 62, desiredMonthlySpending: 0, essentialMonthlySpending: 0, portfolio: FLAT_PORTFOLIO, accounts: noAccounts("us"), guaranteedIncome: noIncome("us"), properties: [], ...overrides };
}
const year = (plan: PlanInputs, age: number) => simulatePlan(plan).years.find((item) => item.age === age)!;

test("retirement accounts are locked before 60 and the Roth is tax-free after", () => {
  const locked = usScenario({ currentAge: 55, retirementAge: 55, planToAge: 56, desiredMonthlySpending: 1_000, essentialMonthlySpending: 1_000, accounts: { ...noAccounts("us"), roth: { balance: 100_000, monthlyContribution: 0, accessAge: 60 } } });
  assert.equal(simulatePlan(locked).firstShortfall, 55);
  const open = usScenario({ desiredMonthlySpending: 1_000, essentialMonthlySpending: 1_000, accounts: { ...noAccounts("us"), roth: { balance: 100_000, monthlyContribution: 0, accessAge: 60 } } });
  assert.equal(year(open, 60).withdrawals, 12_000);
  assert.equal(year(open, 60).tax, 0);
});

test("traditional withdrawals fill the standard deduction first and are then taxed at federal plus state rates", () => {
  // Need $30,000 net from a Traditional IRA, state tax 5%: deduction $16,100 is free; the rest is taxed 10% + 5% up to $12,400 taxable
  const plan = usScenario({ desiredMonthlySpending: 2_500, essentialMonthlySpending: 2_500, taxSurchargePercent: 5, accounts: { ...noAccounts("us"), traditional: { balance: 500_000, monthlyContribution: 0, accessAge: 60 } } });
  const first = year(plan, 60);
  const single = taxSchedule(PROFILES.us, "single");
  assert.ok(Math.abs(first.tax - incomeTax(first.withdrawals, single, 5)) < 0.01);
  assert.ok(Math.abs(first.withdrawals - first.tax - 30_000) < 0.01);
  assert.ok(first.withdrawals > 30_000 + 16_100 * 0 && first.tax > 0);
});

test("85% of Social Security counts as taxable income", () => {
  const plan = usScenario({ guaranteedIncome: { ...noIncome("us"), socialSecurity: { annual: 40_000, fromAge: 60 } } });
  assert.ok(Math.abs(year(plan, 60).tax - incomeTax(0.85 * 40_000, taxSchedule(PROFILES.us, "single"))) < 0.01);
  assert.ok(Math.abs(year(plan, 60).tax - 1_900) < 0.01);
  assert.equal(year(plan, 60).guaranteedIncome, 40_000);
});

test("a property sale pays the long-term capital gains rate entered", () => {
  const plan = usScenario({ properties: [property("us", { purchaseAge: 50, sellAtAge: 61, value: 300_000, purchaseCostBasis: 200_000, saleCostsPercent: 0, estimatedCgtPercent: 15, monthlyNetIncome: 0 })] });
  assert.equal(year(plan, 61).balances.cash, 300_000 - 0.15 * 100_000);
});
