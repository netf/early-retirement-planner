import assert from "node:assert/strict";
import { test } from "node:test";
import { contributionsTowardLimit, createDefaultPlan, planChecks, simulatePlan, withPots, PROFILES, potsFromAccounts } from "../lib/planner.ts";

const lisa = PROFILES.uk.accounts.find((rule) => rule.id === "lisa")!;
const isa = PROFILES.uk.accounts.find((rule) => rule.id === "isa")!;

function planWithLisa(currentAge: number, monthly = 300) {
  const plan = createDefaultPlan("uk");
  plan.currentAge = currentAge; plan.retirementAge = 60; plan.planToAge = 70;
  plan.portfolio.inflationPercent = 0; plan.portfolio.stockReturnPercent = 0; plan.portfolio.bondReturnPercent = 0; plan.portfolio.cashReturnPercent = 0; plan.portfolio.annualFeePercent = 0;
  const accounts = { ...plan.accounts, lisa: { balance: 10_000, monthlyContribution: monthly, accessAge: 60 } };
  return withPots({ ...plan, accounts }, potsFromAccounts(PROFILES.uk, accounts));
}

test("the LISA rule: 25% bonus until 50, locked until 60, inside the ISA allowance", () => {
  assert.equal(lisa.accessAge, 60);
  assert.equal(lisa.annualLimit, 4_000);
  assert.equal(lisa.countsTowardGroup, "isa");
  assert.deepEqual(lisa.bonus, { rate: 0.25, untilAge: 50 });
  assert.equal(lisa.contributeUntilAge, 50);
});

test("contributions earn the bonus while under 50 and stop at 50", () => {
  const years = simulatePlan(planWithLisa(48)).years;
  const at = (age: number) => years.find((year) => year.age === age)!.detail.accounts.find((account) => account.id === "lisa")!;
  assert.equal(Math.round(at(49).contribution), 300 * 12 * 1.25, "age 49: paid in plus the 25% bonus");
  assert.equal(at(50).contribution, 0, "age 50: no more paying in");
  assert.equal(Math.round(years.find((year) => year.age === 49)!.balances.lisa!), 10_000 + 4_500);
});

test("LISA money is locked until 60 and drawn tax-free after", () => {
  const years = simulatePlan(planWithLisa(55)).years;
  assert.ok(years.filter((year) => year.age < 60).every((year) => (year.withdrawalsByAccount.lisa ?? 0) === 0), "nothing out before 60");
  const drawn = years.filter((year) => year.age >= 60).some((year) => (year.withdrawalsByAccount.lisa ?? 0) > 0);
  assert.ok(drawn, "used once open");
  assert.equal(years.find((year) => (year.withdrawalsByAccount.lisa ?? 0) > 0)!.detail.accounts.find((account) => account.id === "lisa")!.taxable, 0);
});

test("the LISA has its own £4,000 limit and also uses up the shared ISA allowance", () => {
  const plan = planWithLisa(40, 400);
  assert.equal(contributionsTowardLimit(plan, lisa), 4_800, "own limit counts only the LISA");
  assert.equal(contributionsTowardLimit(plan, isa), 4_800 + plan.accounts.isa!.monthlyContribution * 12 + (plan.accounts.cashIsa?.monthlyContribution ?? 0) * 12, "ISA group counts the LISA too");
  const texts = planChecks(plan).map((check) => check.text);
  assert.ok(texts.some((text) => text.includes("Lifetime ISA contributions exceed")), texts.join("\n"));
});
