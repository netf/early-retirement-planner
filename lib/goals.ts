import { quickSuccessRate } from "./monteCarlo.ts";
import { simulatePlan } from "./simulate.ts";
import { pensionAccessAge, profileOf, spendingAtAge, type PlanInputs } from "./plan.ts";

export type GoalMetrics = {
  earliestRetirementAge: number | null;
  extraMonthlyRequired: number | null;
  recommendedBridgeExtra: number;
  recommendedLongTermExtra: number;
  sustainableMonthlySpending: number;
};

/** Success-rate oracle; injectable so the solvers can be tested without Monte Carlo. */
export type SuccessRate = (plan: PlanInputs) => number;

const STEP = 25;
const MAX_EXTRA_MONTHLY = 12_000;
const MAX_RETIREMENT_AGE = 85;

/** Direct extra saving to the accessible account until the bridge years are covered, then the long-term one. */
export function splitExtraContribution(plan: PlanInputs, extraMonthly: number): { bridge: number; longTerm: number } {
  const profile = profileOf(plan);
  const years = Math.max(1, plan.retirementAge - plan.currentAge);
  const bridgeYears = Math.max(0, pensionAccessAge(plan) - plan.retirementAge);
  const bridgeNeed = spendingAtAge(plan, plan.retirementAge) * bridgeYears;
  const accessibleRules = profile.accounts.filter((rule) => rule.accessAge === null);
  const accessibleNow = accessibleRules.reduce((sum, rule) => sum + (plan.accounts[rule.id]?.balance ?? 0), 0);
  const accessibleFuture = accessibleRules.reduce((sum, rule) => sum + (plan.accounts[rule.id]?.monthlyContribution ?? 0), 0) * 12 * years;
  const monthlyGap = Math.max(0, bridgeNeed - accessibleNow - accessibleFuture) / (years * 12);
  const bridge = Math.min(extraMonthly, monthlyGap);
  return { bridge, longTerm: Math.max(0, extraMonthly - bridge) };
}

export function withExtraContribution(plan: PlanInputs, extraMonthly: number): PlanInputs {
  const { bridge, longTerm } = splitExtraContribution(plan, extraMonthly);
  const targets = profileOf(plan).savingTargets;
  const accounts = { ...plan.accounts };
  accounts[targets.bridge] = { ...accounts[targets.bridge]!, monthlyContribution: accounts[targets.bridge]!.monthlyContribution + bridge };
  accounts[targets.longTerm] = { ...accounts[targets.longTerm]!, monthlyContribution: accounts[targets.longTerm]!.monthlyContribution + longTerm };
  return { ...plan, accounts };
}

export function withScaledSpending(plan: PlanInputs, monthlyAmount: number): PlanInputs {
  const current = spendingAtAge(plan, plan.retirementAge) / 12;
  const scale = current > 0 ? monthlyAmount / current : 0;
  return {
    ...plan,
    desiredMonthlySpending: monthlyAmount,
    essentialMonthlySpending: current > 0 ? plan.essentialMonthlySpending * scale : 0,
    spendingCeilingMonthly: current > 0 ? plan.spendingCeilingMonthly * scale : monthlyAmount,
    spendingPhases: plan.spendingPhases.map((phase) => ({ ...phase, monthlyAmount: current > 0 ? phase.monthlyAmount * scale : monthlyAmount })),
  };
}

function bisect(passes: (value: number) => boolean, low: number, high: number, iterations = 12): { low: number; high: number } {
  for (let index = 0; index < iterations; index += 1) {
    const midpoint = (low + high) / 2;
    if (passes(midpoint)) high = midpoint;
    else low = midpoint;
  }
  return { low, high };
}

export function calculateGoalMetrics(plan: PlanInputs, successRate: SuccessRate = (candidate) => quickSuccessRate(candidate)): GoalMetrics {
  const target = plan.targetConfidencePercent;
  const passes = (candidate: PlanInputs) => successRate(candidate) >= target;

  let earliestRetirementAge: number | null = null;
  for (let age = plan.currentAge; age <= Math.min(plan.planToAge - 1, MAX_RETIREMENT_AGE); age += 1) {
    if (passes({ ...plan, retirementAge: age })) { earliestRetirementAge = age; break; }
  }

  let extraMonthlyRequired: number | null;
  if (passes(plan)) extraMonthlyRequired = 0;
  else if (passes(withExtraContribution(plan, MAX_EXTRA_MONTHLY))) {
    const { high } = bisect((extra) => passes(withExtraContribution(plan, extra)), 0, MAX_EXTRA_MONTHLY);
    extraMonthlyRequired = Math.ceil(high / STEP) * STEP;
  } else extraMonthlyRequired = null;
  const split = splitExtraContribution(plan, extraMonthlyRequired ?? 0);

  if (plan.spendingStrategy === "amortise") {
    // The rule sets spending; report the first retirement year's payment instead of solving for a level.
    const first = simulatePlan(plan).years.find((year) => year.age === Math.max(plan.retirementAge, plan.currentAge));
    return { earliestRetirementAge, extraMonthlyRequired, recommendedBridgeExtra: Math.round(split.bridge / STEP) * STEP, recommendedLongTermExtra: Math.round(split.longTerm / STEP) * STEP, sustainableMonthlySpending: Math.round(((first?.spending ?? 0) - (first?.oneOffSpending ?? 0)) / 12) };
  }
  const activeSpend = spendingAtAge(plan, plan.retirementAge) / 12;
  let low = 0;
  let high = Math.max(activeSpend * 2, 1_000);
  while (high < 1_000_000 && passes(withScaledSpending(plan, high))) { low = high; high *= 2; }
  const spendingRange = bisect((amount) => !passes(withScaledSpending(plan, amount)), low, high);

  return {
    earliestRetirementAge,
    extraMonthlyRequired,
    recommendedBridgeExtra: Math.round(split.bridge / STEP) * STEP,
    recommendedLongTermExtra: Math.round(split.longTerm / STEP) * STEP,
    sustainableMonthlySpending: Math.floor(spendingRange.low / STEP) * STEP,
  };
}
