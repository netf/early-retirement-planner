import { pensionAccessAge, profileOf, type PlanInputs } from "./plan.ts";
import { simulatePlan } from "./simulate.ts";

/**
 * The access gap: the years between stopping work and the first age-gated account opening.
 * Those years can only be funded from accessible accounts, so they carry most of the risk.
 */
export type BridgeAnalysis = {
  fromAge: number;
  toAge: number;
  years: number;
  /** Accessible balances at the start of the gap, central path. */
  accessibleAtStart: number;
  /** Net draw the gap needs from accounts over its whole length, central path. */
  needOverGap: number;
  /** Accessible balances left when the first locked account opens, central path. */
  accessibleAtEnd: number;
  /** Years of gap spending the accessible money covers at the central draw (Infinity if no need). */
  yearsCovered: number;
};

export function analyseBridge(plan: PlanInputs): BridgeAnalysis {
  const profile = profileOf(plan);
  const accessAge = pensionAccessAge(plan);
  const fromAge = plan.retirementAge;
  const toAge = Math.max(fromAge, Math.min(accessAge, plan.planToAge));
  const years = toAge - fromAge;
  const accessibleIds = profile.accounts.filter((rule) => rule.accessAge === null).map((rule) => rule.id);
  const projection = simulatePlan(plan);
  const sum = (age: number) => {
    const year = projection.years.find((item) => item.age === age);
    return year ? accessibleIds.reduce((total, id) => total + (year.balances[id] ?? 0), 0) : 0;
  };
  const gapYears = projection.years.filter((year) => year.age >= fromAge && year.age < toAge);
  const needOverGap = gapYears.reduce((total, year) => total + year.withdrawals + year.shortfall - year.purchaseShortfall, 0);
  const accessibleAtStart = fromAge > plan.currentAge ? sum(fromAge - 1) : accessibleIds.reduce((total, id) => total + (plan.accounts[id]?.balance ?? 0), 0);
  const perYear = years > 0 ? needOverGap / years : 0;
  return {
    fromAge,
    toAge,
    years,
    accessibleAtStart,
    needOverGap,
    accessibleAtEnd: years > 0 ? sum(toAge - 1) : accessibleAtStart,
    yearsCovered: perYear > 0 ? accessibleAtStart / perYear : Number.POSITIVE_INFINITY,
  };
}

/**
 * The experiment the gap suggests: keep `years` of spending in cash, moved out of the
 * accessible invested account the profile uses for bridge saving. Returns the same plan when
 * there is nothing to move.
 */
export function withBridgeReserve(plan: PlanInputs, years: number, annualSpending = Math.max(0, plan.desiredMonthlySpending) * 12): PlanInputs {
  if (years <= 0 || annualSpending <= 0) return plan;
  const profile = profileOf(plan);
  const cashRule = profile.accounts.find((rule) => rule.isCash);
  const sources = profile.withdrawalOrder
    .map((id) => profile.accounts.find((rule) => rule.id === id)!)
    .filter((rule) => !rule.isCash && rule.accessAge === null && (plan.accounts[rule.id]?.balance ?? 0) > 0);
  if (!cashRule || sources.length === 0) return plan;
  let toMove = Math.max(0, annualSpending * years - (plan.accounts[cashRule.id]?.balance ?? 0));
  const accounts = { ...plan.accounts };
  for (const rule of sources) {
    if (toMove <= 0) break;
    const moved = Math.min(toMove, accounts[rule.id]!.balance);
    accounts[rule.id] = { ...accounts[rule.id]!, balance: accounts[rule.id]!.balance - moved };
    accounts[cashRule.id] = { ...accounts[cashRule.id]!, balance: accounts[cashRule.id]!.balance + moved };
    toMove -= moved;
  }
  return { ...plan, accounts };
}
