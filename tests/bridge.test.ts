import assert from "node:assert/strict";
import test from "node:test";
import { analyseBridge, planChecks, runMonteCarlo, withBridgeReserve } from "../lib/planner.ts";
import { FLAT_PORTFOLIO, noAccounts, noIncome, ukScenario } from "./helpers.ts";
import { DEFAULT_PORTFOLIO } from "../lib/planner.ts";

test("the access gap is measured from stopping work to the first locked account", () => {
  const plan = ukScenario({ portfolio: FLAT_PORTFOLIO, guaranteedIncome: noIncome("uk"), properties: [], desiredMonthlySpending: 1_000, essentialMonthlySpending: 1_000, spendingStrategy: "fixed", accounts: { ...noAccounts("uk"), isa: { balance: 60_000, monthlyContribution: 0 }, sipp: { balance: 500_000, monthlyContribution: 0, accessAge: 57 } } });
  const bridge = analyseBridge(plan);
  assert.equal(bridge.fromAge, 50);
  assert.equal(bridge.toAge, 57);
  assert.equal(bridge.years, 7);
  assert.equal(bridge.accessibleAtStart, 60_000);
  // £12,000 a year for 7 years = £84,000 needed; £60,000 covers 5 years, then a shortfall
  assert.equal(bridge.needOverGap, 84_000);
  assert.equal(bridge.yearsCovered, 5);
  assert.equal(bridge.accessibleAtEnd, 0);
});

test("a bridge reserve moves years of spending from the accessible invested account into cash", () => {
  const plan = ukScenario({ desiredMonthlySpending: 1_000, accounts: { ...noAccounts("uk"), isa: { balance: 100_000, monthlyContribution: 0 }, cash: { balance: 5_000, monthlyContribution: 0 } } });
  const reserved = withBridgeReserve(plan, 2);
  assert.equal(reserved.accounts.cash!.balance, 24_000);
  assert.equal(reserved.accounts.isa!.balance, 81_000);
  assert.equal(withBridgeReserve(plan, 0), plan);
});

test("Monte Carlo reports how often the plan runs short during the gap", () => {
  const plan = ukScenario({ guaranteedIncome: noIncome("uk"), properties: [], desiredMonthlySpending: 2_500, essentialMonthlySpending: 2_500, spendingStrategy: "fixed", accounts: { ...noAccounts("uk"), isa: { balance: 60_000, monthlyContribution: 0 }, sipp: { balance: 800_000, monthlyContribution: 0, accessAge: 57 } } });
  const result = runMonteCarlo(plan, 200);
  assert.ok(result.bridgeFailureRate > 50, `${result.bridgeFailureRate}`);
  assert.ok(result.bridgeFailureRate <= 100 - result.successRate + 1e-9);
});

test("assumption checks flag the footguns the planner can see", () => {
  const plan = ukScenario({ spendingStrategy: "flex", essentialMonthlySpending: 1, spendingCeilingMonthly: 500, planToAge: 80, accounts: { ...noAccounts("uk"), isa: { balance: 100_000, monthlyContribution: 0 }, sipp: { balance: 100_000, monthlyContribution: 0, accessAge: 57 } }, portfolio: { ...DEFAULT_PORTFOLIO, stocksPercent: 100, bondsPercent: 0 } });
  const texts = planChecks(plan).map((check) => check.text);
  assert.ok(texts.some((text) => text.includes("essential floor")));
  assert.ok(texts.some((text) => text.includes("ceiling")));
  assert.ok(texts.some((text) => text.includes("equities")));
  assert.ok(texts.some((text) => text.includes("Planning to 80")));
  assert.equal(planChecks(ukScenario()).filter((check) => check.level === "warn").length, 0);
});
