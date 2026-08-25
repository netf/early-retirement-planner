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

/** Bisection to within `step` on a monotone pass/fail boundary; returns the lowest passing value found. */
function bisect(passes: (value: number) => boolean, low: number, high: number, step: number): { low: number; high: number } {
  const iterations = Math.ceil(Math.log2(Math.max(2, (high - low) / (step / 2))));
  for (let index = 0; index < iterations; index += 1) {
    const midpoint = (low + high) / 2;
    if (passes(midpoint)) high = midpoint;
    else low = midpoint;
  }
  return { low, high };
}

const passOracle = (successRate: SuccessRate, target: number) => (candidate: PlanInputs) => successRate(candidate) >= target;

/** The first stopping age that clears the target, found by bisection: later retirement never makes a plan fail, so pass/fail is a single boundary. */
export function earliestRetirementAge(plan: PlanInputs, successRate: SuccessRate = (candidate) => quickSuccessRate(candidate)): number | null {
  const passes = passOracle(successRate, plan.targetConfidencePercent);
  const maxAge = Math.min(plan.planToAge - 1, MAX_RETIREMENT_AGE);
  const at = (age: number) => passes({ ...plan, retirementAge: age });
  if (at(plan.currentAge)) return plan.currentAge;
  if (maxAge <= plan.currentAge || !at(maxAge)) return null;
  let low = plan.currentAge, high = maxAge;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (at(mid)) high = mid; else low = mid;
  }
  return high;
}

/** The smallest extra monthly saving that makes the chosen stopping age pass; null when even the maximum would not. */
export function extraSavingRequired(plan: PlanInputs, successRate: SuccessRate = (candidate) => quickSuccessRate(candidate)): number | null {
  const passes = passOracle(successRate, plan.targetConfidencePercent);
  if (passes(plan)) return 0;
  if (!passes(withExtraContribution(plan, MAX_EXTRA_MONTHLY))) return null;
  const { high } = bisect((extra) => passes(withExtraContribution(plan, extra)), 0, MAX_EXTRA_MONTHLY, STEP);
  return Math.ceil(high / STEP) * STEP;
}

/** The highest starting spending the plan carries at the target; for the amortise rule, the rule's own first-year payment. */
export function sustainableMonthlySpending(plan: PlanInputs, successRate: SuccessRate = (candidate) => quickSuccessRate(candidate)): number {
  if (plan.spendingStrategy === "amortise") {
    const first = simulatePlan(plan).years.find((year) => year.age === Math.max(plan.retirementAge, plan.currentAge));
    return Math.round(((first?.spending ?? 0) - (first?.oneOffSpending ?? 0)) / 12);
  }
  const passes = passOracle(successRate, plan.targetConfidencePercent);
  const activeSpend = spendingAtAge(plan, plan.retirementAge) / 12;
  let low = 0;
  let high = Math.max(activeSpend * 2, 1_000);
  while (high < 1_000_000 && passes(withScaledSpending(plan, high))) { low = high; high *= 2; }
  const range = bisect((amount) => !passes(withScaledSpending(plan, amount)), low, high, STEP);
  return Math.floor(range.low / STEP) * STEP;
}

/** Assemble the metrics from the three independent solves (they run in parallel in the app). */
export function assembleGoalMetrics(plan: PlanInputs, parts: { earliestRetirementAge: number | null; extraMonthlyRequired: number | null; sustainableMonthlySpending: number }): GoalMetrics {
  const split = splitExtraContribution(plan, parts.extraMonthlyRequired ?? 0);
  return { ...parts, recommendedBridgeExtra: Math.round(split.bridge / STEP) * STEP, recommendedLongTermExtra: Math.round(split.longTerm / STEP) * STEP };
}

export function calculateGoalMetrics(plan: PlanInputs, successRate: SuccessRate = (candidate) => quickSuccessRate(candidate)): GoalMetrics {
  return assembleGoalMetrics(plan, {
    earliestRetirementAge: earliestRetirementAge(plan, successRate),
    extraMonthlyRequired: extraSavingRequired(plan, successRate),
    sustainableMonthlySpending: sustainableMonthlySpending(plan, successRate),
  });
}
