import assert from "node:assert/strict";
import test from "node:test";
import { PROFILES, buildStarterPlan, createDefaultPlan, decodePlanLink, encodePlanLink, looksLikePlan, normalisePlan, runMonteCarlo, calculateGoalMetrics, simulatePlan } from "../lib/planner.ts";
import { ukScenario, noAccounts } from "./helpers.ts";

test("a plan survives the trip through a link byte for byte, and the link is small", async () => {
  const plan = ukScenario({ desiredMonthlySpending: 2_345, spendingStrategy: "flex", flexAnchor: { rate: 0.041, fromAge: 50 } });
  const link = await encodePlanLink(plan);
  assert.ok(link.startsWith("plan=z."), link.slice(0, 10));
  assert.ok(link.length < 2_500, `link is ${link.length} characters`);
  assert.ok(!/[+/=#?&]/.test(link.slice(7)), "URL-safe without escaping");
  assert.deepEqual(await decodePlanLink(`#${link}`), normalisePlan(plan));
  assert.deepEqual(await decodePlanLink(link), normalisePlan(plan));
});

test("damaged, foreign or empty links decode to null instead of a silent default plan", async () => {
  const link = await encodePlanLink(createDefaultPlan("pl"));
  assert.equal(await decodePlanLink(""), null);
  assert.equal(await decodePlanLink("#something=else"), null);
  assert.equal(await decodePlanLink(link.slice(0, 40)), null, "truncated");
  assert.equal(await decodePlanLink(`${link}zzzz`), null, "garbage appended");
  assert.equal(await decodePlanLink(`plan=z.${Buffer.from("not deflate").toString("base64url")}`), null);
  assert.equal(await decodePlanLink(`plan=j.${Buffer.from(JSON.stringify({ hello: "world" })).toString("base64url")}`), null, "valid JSON that is not a plan");
});

test("looksLikePlan tells our files (and legacy ones) from other JSON", () => {
  assert.equal(looksLikePlan({ plan: createDefaultPlan("uk") }), true);
  assert.equal(looksLikePlan(createDefaultPlan("us")), true);
  assert.equal(looksLikePlan({ currentAge: 40, retirementAge: 55, desiredMonthlySpending: 2_000 }), true, "a v1 file");
  assert.equal(looksLikePlan({ foo: 1 }), false);
  assert.equal(looksLikePlan([1, 2, 3]), false);
  assert.equal(looksLikePlan("plan"), false);
  assert.equal(looksLikePlan(null), false);
});

test("the starter plan puts the six numbers where the profile expects them and is a valid plan", () => {
  for (const profileId of ["uk", "us", "pl", "ro"] as const) {
    const profile = PROFILES[profileId];
    const plan = buildStarterPlan(profileId, { currentAge: 38, retirementAge: 52, monthlySpending: 2_400, pensionBalance: 180_000, accessibleBalance: 60_000, monthlySaving: 900, balancesAsOf: "2026-08-25" });
    assert.equal(plan.currentAge, 38); assert.equal(plan.retirementAge, 52);
    assert.equal(plan.desiredMonthlySpending, 2_400);
    assert.equal(plan.accounts[profile.savingTargets.longTerm]!.balance, 180_000);
    assert.equal(plan.accounts[profile.savingTargets.bridge]!.balance, 60_000);
    assert.equal(plan.accounts[profile.savingTargets.bridge]!.monthlyContribution, 900);
    assert.equal(plan.properties.length, 0);
    assert.equal(plan.spendingStrategy, "fixed", "a first plan asks the fixed-amount question");
    assert.equal(plan.essentialMonthlySpending, 1_700);
    assert.ok(plan.essentialMonthlySpending < plan.desiredMonthlySpending && plan.spendingCeilingMonthly > plan.desiredMonthlySpending);
    assert.equal(plan.balancesAsOf, "2026-08-25");
    assert.equal(simulatePlan(plan).years.length, plan.planToAge - plan.currentAge + 1);
  }
});

test("a plan with nothing in any account runs end to end without throwing", () => {
  const plan = ukScenario({ accounts: noAccounts("uk"), properties: [] });
  const projection = simulatePlan(plan);
  assert.equal(projection.firstShortfall, plan.retirementAge);
  const monteCarlo = runMonteCarlo(plan, 50);
  assert.equal(monteCarlo.successRate, 0);
  const goals = calculateGoalMetrics(plan);
  assert.ok(goals.extraMonthlyRequired === null || goals.extraMonthlyRequired > 0);
});
