import { planMix } from "./market.ts";
import type { MonteCarloResult } from "./monteCarlo.ts";
import type { Projection } from "./simulate.ts";
import { activeMonthlySpending, contributionsTowardLimit, pensionAccessAge, profileOf, statePensionAge, type PlanInputs } from "./plan.ts";

export type PlanCheck = { level: "warn" | "info"; text: string };

/**
 * Things the planner can see are likely mistakes or blind spots. Input-only checks need no
 * results; the rest use the Monte Carlo when it is supplied.
 */
export function planChecks(plan: PlanInputs, monteCarlo?: MonteCarloResult, projection?: Projection): PlanCheck[] {
  const profile = profileOf(plan);
  const checks: PlanCheck[] = [];
  const spending = activeMonthlySpending(plan);
  const bridgeYears = Math.max(0, pensionAccessAge(plan) - plan.retirementAge);
  const mix = planMix(plan);

  // Annual limits are per person: each owner is checked on their own contributions.
  for (const owner of plan.partner ? (["you", "partner"] as const) : (["you"] as const)) {
    const who = owner === "partner" ? `${plan.partner!.name}'s ` : "";
    const warnedGroups = new Set<string>();
    for (const rule of profile.accounts) {
      if (rule.annualLimit === undefined || contributionsTowardLimit(plan, rule, owner) <= rule.annualLimit) continue;
      if (rule.limitGroup) {
        if (warnedGroups.has(rule.limitGroup)) continue;
        warnedGroups.add(rule.limitGroup);
        const names = profile.accounts.filter((item) => item.limitGroup === rule.limitGroup).map((item) => item.name).join(" and ");
        checks.push({ level: "warn", text: `${who}Contributions to ${names} together exceed the shared annual limit of ${rule.annualLimit.toLocaleString(profile.locale)}.` });
      } else {
        checks.push({ level: "warn", text: `${who}${rule.name} contributions exceed the annual limit of ${rule.annualLimit.toLocaleString(profile.locale)}.` });
      }
    }
  }
  if (plan.portfolio.stocksPercent + plan.portfolio.bondsPercent > 100) checks.push({ level: "warn", text: "Stocks and bonds cannot exceed 100% of the portfolio." });
  if (plan.retirementAge >= plan.planToAge) checks.push({ level: "warn", text: "The plan-to age must be later than the retirement age." });

  if (plan.spendingStrategy !== "fixed" && plan.spendingStrategy !== "amortise") {
    if (plan.essentialMonthlySpending < spending * 0.4) checks.push({ level: "warn", text: `The essential floor (${Math.round(plan.essentialMonthlySpending).toLocaleString(profile.locale)}) is under 40% of your spending. The rule may cut you to a level you could not live on, which flatters the result.` });
    if (plan.essentialMonthlySpending > spending) checks.push({ level: "info", text: "The essential floor is above your spending, so it never applies." });
  }
  if (plan.spendingStrategy === "flex" && plan.spendingCeilingMonthly < spending) checks.push({ level: "info", text: "The stretch ceiling is below your spending, so raises never apply." });

  if (bridgeYears >= 3 && mix.stocks >= 0.9) checks.push({ level: "warn", text: `${bridgeYears} years before any pension opens, with ${Math.round(mix.stocks * 100)}% in equities. A bad early sequence is the main way this plan fails — see the access gap.` });
  if (plan.planToAge < 90) checks.push({ level: "info", text: `Planning to ${plan.planToAge}: a healthy person your age has a real chance of living past 90.` });
  if (plan.portfolio.inflationPercent < 1) checks.push({ level: "info", text: "Inflation is set below 1%; central banks target about 2%." });
  const stateRule = profile.guaranteedIncome.find((rule) => rule.isState);
  if (stateRule && (plan.guaranteedIncome[stateRule.id]?.annual ?? 0) === 0) checks.push({ level: "info", text: `${stateRule.label} is set to zero. Check your forecast — it is usually the safest income in the plan.` });
  if (statePensionAge(plan) < 60) checks.push({ level: "info", text: `${stateRule?.label ?? "State pension"} from ${statePensionAge(plan)} looks early; check the age you are entitled to.` });

  for (const purchase of projection?.unfundedPurchases ?? []) {
    checks.push({ level: "warn", text: `${purchase.name} cannot be bought at ${purchase.age}: the deposit and costs need ${Math.round(purchase.cost).toLocaleString(profile.locale)} from accessible savings but only ${Math.round(purchase.available).toLocaleString(profile.locale)} is there on the central path. The plan continues without it${monteCarlo ? ` (unaffordable in ${Math.round(monteCarlo.unfundedPurchaseRate)}% of futures)` : ""}. Lower the price, raise the mortgage or buy later.` });
  }
  if (monteCarlo) {
    if (plan.spendingStrategy === "flex" && monteCarlo.floorRate > 25) checks.push({ level: "warn", text: `In ${Math.round(monteCarlo.floorRate)}% of futures spending is pushed to the floor, typically for ${monteCarlo.medianYearsAtFloor} years. Lower the starting spend or calm the bridge years.` });
    if (plan.spendingStrategy === "amortise" && monteCarlo.floorRate > 25) checks.push({ level: "warn", text: `In ${Math.round(monteCarlo.floorRate)}% of futures the amortised payment falls to the floor. A lower target at the end, a lower assumed return or calmer bridge years would steady it.` });
    if (plan.spendingStrategy === "flex" && monteCarlo.successRate < 95) checks.push({ level: "warn", text: `With flexible spending the money should last in at least 95% of futures — a failure means the rule could not cut enough. Currently ${Math.round(monteCarlo.successRate)}%.` });
    if (monteCarlo.medianFailureAge !== null && monteCarlo.medianFailureAge < pensionAccessAge(plan)) checks.push({ level: "warn", text: `When this plan fails it typically does so at ${monteCarlo.medianFailureAge}, before your pension opens: the access gap is the weak point.` });
  }
  return checks;
}

/** Hard input problems only, as plain strings. */
export function planWarnings(plan: PlanInputs): string[] {
  return planChecks(plan).filter((check) => check.level === "warn" && !check.text.includes("futures") && !check.text.includes("access gap")).map((check) => check.text);
}
