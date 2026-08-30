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
  assert.deepEqual(plan.pensions.map(({ name, annual, fromAge }) => ({ name, annual, fromAge })), [{ name: "Defined benefit pension", annual: 3_000, fromAge: 66 }], "the old single slot becomes the first pension");
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

test("pots: two ISAs simulate exactly like one ISA of the sum, and the per-type accounts always follow the pots", async () => {
  const { aggregatePots, createDefaultPlan, simulatePlan, transferBetweenTypes, withPots, PROFILES } = await import("../lib/planner.ts");
  const base = createDefaultPlan("uk");
  const one = withPots(base, [{ id: "a", type: "isa", name: "ISA", balance: 200_000, monthlyContribution: 800, owner: "you" }, { id: "p", type: "sipp", name: "SIPP", balance: 100_000, monthlyContribution: 0, owner: "you" }]);
  const two = withPots(base, [{ id: "a", type: "isa", name: "Vanguard ISA", balance: 150_000, monthlyContribution: 500, owner: "you" }, { id: "b", type: "isa", name: "AJ Bell ISA", balance: 50_000, monthlyContribution: 300, owner: "you" }, { id: "p", type: "sipp", name: "SIPP", balance: 100_000, monthlyContribution: 0, owner: "you" }]);
  assert.deepEqual(two.accounts, one.accounts, "the engine sees the same per-type totals");
  assert.equal(two.accounts.sipp!.accessAge, 57, "type-level settings survive aggregation");
  assert.deepEqual(simulatePlan(two).years.map((year) => year.totalInvestments), simulatePlan(one).years.map((year) => year.totalInvestments));
  assert.deepEqual(aggregatePots(PROFILES.uk, []).gia, { balance: 0, monthlyContribution: 0 }, "types without a pot are present and empty");

  const moved = transferBetweenTypes(two, "isa", "cash", 40_000);
  assert.equal(moved.accounts.isa!.balance, 160_000);
  assert.equal(moved.accounts.cash!.balance, 40_000);
  assert.equal(moved.pots.find((pot) => pot.id === "a")!.balance, 120_000, "taken in proportion");
  assert.equal(moved.pots.find((pot) => pot.id === "b")!.balance, 40_000);
  assert.equal(moved.pots.find((pot) => pot.type === "cash")!.balance, 40_000, "a cash pot appears when there was none");
});

test("pots: older plans without pots get one per funded type; unknown types are dropped", async () => {
  const { createDefaultPlan, normalisePlan } = await import("../lib/planner.ts");
  const legacy = { ...createDefaultPlan("uk"), pots: undefined, accounts: { isa: { balance: 10_000, monthlyContribution: 0 }, sipp: { balance: 0, monthlyContribution: 100, accessAge: 58 }, gia: { balance: 0, monthlyContribution: 0 }, cash: { balance: 0, monthlyContribution: 0 } } };
  const plan = normalisePlan(legacy);
  assert.deepEqual(plan.pots.map((pot) => [pot.type, pot.balance, pot.monthlyContribution]), [["isa", 10_000, 0], ["sipp", 0, 100]]);
  assert.equal(plan.accounts.sipp!.accessAge, 58, "the stored access age is kept");
  assert.equal(plan.accounts.gia!.balance, 0);
  const withJunk = normalisePlan({ ...plan, pots: [...plan.pots, { id: "z", type: "lisa", name: "LISA", balance: 5_000, monthlyContribution: 0, owner: "you" }, { type: "cash", balance: "x" }] });
  assert.deepEqual(withJunk.pots.map((pot) => pot.type), ["isa", "sipp", "cash"]);
  assert.equal(withJunk.pots.at(-1)!.balance, 0, "a bad number reads as zero, not NaN");
  assert.equal(withJunk.accounts.isa!.balance, 10_000, "accounts are re-derived from the pots that survived");
});
