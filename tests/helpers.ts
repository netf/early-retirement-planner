import { DEFAULT_PORTFOLIO, createDefaultPlan, createProperty, PROFILES, type PlanInputs, type ProfileId, type PropertyAsset } from "../lib/planner.ts";

/** Portfolio with no growth and no inflation, so figures can be checked by hand. */
export const FLAT_PORTFOLIO = { ...DEFAULT_PORTFOLIO, stocksPercent: 0, bondsPercent: 0, cashReturnPercent: 0, inflationPercent: 0, annualFeePercent: 0 };

export function property(profile: ProfileId, overrides: Partial<PropertyAsset> = {}): PropertyAsset {
  return {
    ...createProperty(PROFILES[profile], 1, 46),
    id: "p1",
    purchaseAge: 46,
    value: 200_000,
    purchaseCostBasis: 200_000,
    mortgage: 0,
    monthlyMortgagePayment: 0,
    incomeMode: "net",
    monthlyNetIncome: 850,
    monthlyRent: 850,
    vacancyPercent: 0,
    runningCostsPercent: 0,
    rentFromAge: 46,
    annualGrowthPercent: 0,
    purchaseCostsPercent: 5,
    saleCostsPercent: 2,
    ...overrides,
  };
}

/** A 46-year-old retiring at 50 on £800/month with an ISA, a SIPP and one paid-off rental. */
export function ukScenario(overrides: Partial<PlanInputs> = {}): PlanInputs {
  const base = createDefaultPlan("uk");
  return {
    ...base,
    currentAge: 46,
    retirementAge: 50,
    planToAge: 95,
    desiredMonthlySpending: 800,
    essentialMonthlySpending: 800,
    accounts: {
      isa: { balance: 135_000, monthlyContribution: 0 },
      sipp: { balance: 220_000, monthlyContribution: 0, accessAge: 57 },
      gia: { balance: 0, monthlyContribution: 0 },
      cash: { balance: 0, monthlyContribution: 0 },
    },
    properties: [property("uk")],
    ...overrides,
  };
}

export function noAccounts(profile: ProfileId): PlanInputs["accounts"] {
  return Object.fromEntries(PROFILES[profile].accounts.map((rule) => [rule.id, { balance: 0, monthlyContribution: 0, ...(rule.accessAge === null ? {} : { accessAge: rule.accessAge }) }]));
}

export function noIncome(profile: ProfileId): PlanInputs["guaranteedIncome"] {
  return Object.fromEntries(PROFILES[profile].guaranteedIncome.map((rule) => [rule.id, { annual: 0, fromAge: rule.defaults.fromAge }]));
}
