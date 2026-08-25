import assert from "node:assert/strict";
import test from "node:test";
import { calculateGoalMetrics, quickSuccessRate, splitExtraContribution, totalMonthlyContributions, withExtraContribution, withScaledSpending, type PlanInputs } from "../lib/planner.ts";
import { noIncome, ukScenario } from "./helpers.ts";

test("sustainable spending is the largest £25 step that passes, given a known oracle", () => {
  const plan = ukScenario();
  const limit = 2_345;
  const oracle = (candidate: PlanInputs) => candidate.desiredMonthlySpending <= limit ? 100 : 0;
  assert.equal(calculateGoalMetrics(plan, oracle).sustainableMonthlySpending, 2_325);
});

test("extra contribution is the smallest £25 step that passes, split bridge-first", () => {
  const plan = ukScenario({ accounts: { ...ukScenario().accounts, isa: { balance: 0, monthlyContribution: 0 } }, desiredMonthlySpending: 3_000, essentialMonthlySpending: 1_000 });
  const needed = totalMonthlyContributions(plan) + 1_010;
  const oracle = (candidate: PlanInputs) => totalMonthlyContributions(candidate) >= needed && candidate.retirementAge === plan.retirementAge ? 100 : 0;
  const goals = calculateGoalMetrics(plan, oracle);
  assert.equal(goals.extraMonthlyRequired, 1_025);
  const split = splitExtraContribution(plan, 1_025);
  // Bridge need: 7 years × £36,000 = £252,000 with nothing accessible → gap £5,250/month, so all £1,025 goes to the ISA
  assert.equal(split.bridge, 1_025);
  assert.equal(goals.recommendedBridgeExtra, 1_025);
  assert.equal(goals.recommendedLongTermExtra, 0);
  const adjusted = withExtraContribution(plan, 1_025);
  assert.equal(adjusted.accounts.isa!.monthlyContribution, 1_025);
});

test("earliest retirement age is the first age the oracle accepts", () => {
  const plan = ukScenario();
  const oracle = (candidate: PlanInputs) => candidate.retirementAge >= 58 && candidate.desiredMonthlySpending === plan.desiredMonthlySpending ? 100 : 0;
  assert.equal(calculateGoalMetrics(plan, oracle).earliestRetirementAge, 58);
});

test("extra saving is null when even the maximum does not pass", () => {
  assert.equal(calculateGoalMetrics(ukScenario(), () => 0).extraMonthlyRequired, null);
});

test("scaled spending scales every phase and the floor proportionally", () => {
  const plan = ukScenario({ spendingMode: "phased", essentialMonthlySpending: 400, spendingPhases: [{ id: "a", label: "a", startAge: 50, endAge: 60, monthlyAmount: 800 }, { id: "b", label: "b", startAge: 61, endAge: 95, monthlyAmount: 400 }] });
  const scaled = withScaledSpending(plan, 1_600);
  assert.equal(scaled.spendingPhases[0]!.monthlyAmount, 1_600);
  assert.equal(scaled.spendingPhases[1]!.monthlyAmount, 800);
  assert.equal(scaled.essentialMonthlySpending, 800);
});

test("the real solvers agree with the Monte Carlo oracle they use", () => {
  const plan = ukScenario({ guaranteedIncome: noIncome("uk") });
  const goals = calculateGoalMetrics(plan);
  const target = plan.targetConfidencePercent;
  assert.ok(quickSuccessRate(withScaledSpending(plan, goals.sustainableMonthlySpending)) >= target);
  assert.ok(quickSuccessRate(withScaledSpending(plan, goals.sustainableMonthlySpending + 200)) < target);
  if (goals.earliestRetirementAge !== null && goals.earliestRetirementAge > plan.currentAge) {
    assert.ok(quickSuccessRate({ ...plan, retirementAge: goals.earliestRetirementAge }) >= target);
    assert.ok(quickSuccessRate({ ...plan, retirementAge: goals.earliestRetirementAge - 1 }) < target);
  }
});
