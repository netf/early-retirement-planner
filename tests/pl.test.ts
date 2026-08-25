import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultPlan, simulatePlan, type PlanInputs } from "../lib/planner.ts";
import { FLAT_PORTFOLIO, noAccounts, noIncome, property } from "./helpers.ts";

function plScenario(overrides: Partial<PlanInputs> = {}): PlanInputs {
  return { ...createDefaultPlan("pl"), currentAge: 66, retirementAge: 66, planToAge: 68, desiredMonthlySpending: 0, essentialMonthlySpending: 0, portfolio: FLAT_PORTFOLIO, accounts: noAccounts("pl"), guaranteedIncome: noIncome("pl"), properties: [], ...overrides };
}
const year = (plan: PlanInputs, age: number) => simulatePlan(plan).years.find((item) => item.age === age)!;

test("IKZE withdrawals pay a flat 10% and IKE withdrawals are free", () => {
  const ikze = plScenario({ desiredMonthlySpending: 1_000, essentialMonthlySpending: 1_000, accounts: { ...noAccounts("pl"), ikze: { balance: 100_000, monthlyContribution: 0, accessAge: 65 } } });
  assert.ok(Math.abs(year(ikze, 66).withdrawals - 12_000 / 0.9) < 0.01);
  assert.ok(Math.abs(year(ikze, 66).tax - 12_000 / 0.9 * 0.1) < 0.01);
  const ike = plScenario({ desiredMonthlySpending: 1_000, essentialMonthlySpending: 1_000, accounts: { ...noAccounts("pl"), ike: { balance: 100_000, monthlyContribution: 0, accessAge: 60 } } });
  assert.equal(year(ike, 66).withdrawals, 12_000);
  assert.equal(year(ike, 66).tax, 0);
});

test("Belka tax takes 19% of a brokerage account's positive return each year", () => {
  const plan = plScenario({ portfolio: { ...FLAT_PORTFOLIO, cashReturnPercent: 10 }, accounts: { ...noAccounts("pl"), cash: { balance: 100_000, monthlyContribution: 0 } } });
  assert.ok(Math.abs(year(plan, 67).balances.cash! - 108_100) < 0.01);
});

test("ZUS pension is taxed on the PIT scale", () => {
  const plan = plScenario({ guaranteedIncome: { ...noIncome("pl"), zus: { annual: 48_000, fromAge: 65 } } });
  assert.ok(Math.abs(year(plan, 66).tax - (48_000 - 30_000) * 0.12) < 0.01);
});

test("rental income is taxed on the ryczałt on gross rent, not on profit", () => {
  const plan = plScenario({ properties: [property("pl", { purchaseAge: 50, incomeMode: "detailed", monthlyRent: 3_000, rentFromAge: 50, runningCostsPercent: 10 })] });
  const first = year(plan, 66);
  const gross = 36_000;
  assert.ok(Math.abs(first.tax - gross * 0.085) < 0.01);
  assert.ok(Math.abs(first.propertyIncome - (gross - gross * 0.1 - gross * 0.085)) < 0.01);
});

test("a sale within five years of purchase pays 19% on the gain; later sales are tax-free", () => {
  const early = plScenario({ properties: [property("pl", { purchaseAge: 63, sellAtAge: 67, value: 300_000, purchaseCostBasis: 200_000, saleCostsPercent: 0, estimatedCgtPercent: 19, monthlyNetIncome: 0 })] });
  assert.equal(year(early, 67).balances.cash, 300_000 - 0.19 * 100_000);
  const late = plScenario({ properties: [property("pl", { purchaseAge: 50, sellAtAge: 67, value: 300_000, purchaseCostBasis: 200_000, saleCostsPercent: 0, estimatedCgtPercent: 19, monthlyNetIncome: 0 })] });
  assert.equal(year(late, 67).balances.cash, 300_000);
});
