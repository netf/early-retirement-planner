import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultPlan, normalisePlan, pensionAccessAge, planWarnings, simulatePlan, switchProfile } from "../lib/planner.ts";

test("a v2 UK plan is lifted into the profile model without losing its figures", () => {
  const plan = normalisePlan({
    currentAge: 42, retirementAge: 52, pensionAccessAge: 58, statePensionAge: 67, taxRegion: "scotland",
    isa: { balance: 10_000, monthlyContribution: 100 }, sipp: { balance: 20_000, monthlyContribution: 200 }, gia: { balance: 5_000, monthlyContribution: 50 }, cash: { balance: 1_000, monthlyContribution: 0 },
    statePensionAnnual: 11_000, definedBenefitAnnual: 3_000, definedBenefitAge: 66, taxFreePensionUsed: 5_000,
    portfolio: { giaTaxDragPercent: 0.6 },
  });
  assert.equal(plan.profile, "uk");
  assert.equal(plan.taxVariant, "scotland");
  assert.deepEqual(plan.accounts.sipp, { balance: 20_000, monthlyContribution: 200, accessAge: 58 });
  assert.equal(plan.accounts.gia?.balance, 5_000);
  assert.deepEqual(plan.guaranteedIncome.statePension, { annual: 11_000, fromAge: 67 });
  assert.deepEqual(plan.guaranteedIncome.definedBenefit, { annual: 3_000, fromAge: 66 });
  assert.equal(plan.taxFreeUsed, 5_000);
  assert.equal(plan.portfolio.taxableDragPercent, 0.6);
  assert.equal(pensionAccessAge(plan), 58);
});

test("a v1 plan with flat fields still migrates", () => {
  const plan = normalisePlan({ isaBalance: 1_000, sippBalance: 2_000, accessibleBalance: 300, monthlySpending: 1_234 });
  assert.equal(plan.accounts.isa?.balance, 1_000);
  assert.equal(plan.accounts.sipp?.balance, 2_000);
  assert.equal(plan.accounts.gia?.balance, 300);
  assert.equal(plan.desiredMonthlySpending, 1_234);
});

test("corrupt stored data is sanitised instead of producing NaN", () => {
  const plan = normalisePlan({ profile: "pl", spendingMode: "phased", spendingPhases: [{ startAge: "50", monthlyAmount: "abc" }], oneOffExpenses: [{ amount: "1" }], accounts: { ike: { balance: "x" } }, properties: [{ value: null }] });
  const year = simulatePlan(plan).years.find((item) => item.age === 60);
  assert.ok(Number.isFinite(year?.spending));
  assert.ok(Number.isFinite(year?.totalInvestments));
  assert.equal(plan.profile, "pl");
});

test("switching profile keeps ages and market assumptions but resets money to that country's defaults", () => {
  const uk = { ...createDefaultPlan("uk"), currentAge: 35, retirementAge: 45, portfolio: { ...createDefaultPlan("uk").portfolio, stocksPercent: 60 } };
  const us = switchProfile(uk, "us");
  assert.equal(us.profile, "us");
  assert.equal(us.currentAge, 35);
  assert.equal(us.retirementAge, 45);
  assert.equal(us.portfolio.stocksPercent, 60);
  assert.ok("traditional" in us.accounts && "roth" in us.accounts);
  assert.equal(us.taxVariant, "single");
});

test("warnings use each profile's contribution limits", () => {
  const plan = createDefaultPlan("uk");
  plan.accounts.isa = { balance: 0, monthlyContribution: 2_000 };
  assert.ok(planWarnings(plan).some((warning) => warning.includes("ISA")));
  const pl = createDefaultPlan("pl");
  pl.accounts.ikze = { balance: 0, monthlyContribution: 1_000, accessAge: 65 };
  assert.ok(planWarnings(pl).some((warning) => warning.includes("IKZE")));
});
