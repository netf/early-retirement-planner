import { clamp, realRate } from "./money.ts";
import type { PropertyAsset } from "./plan.ts";
import type { PropertyRules } from "./profiles/types.ts";

/**
 * Property lives in today's money like everything else, with one exception: the mortgage
 * and the purchase cost basis are nominal contracts. They are held nominal and brought
 * back to real terms with the cumulative price level at the point of use.
 */
export type PropertyState = {
  asset: PropertyAsset;
  active: boolean;
  purchasedThisYear: boolean;
  /** Age the property was (or will be) bought — drives the Polish five-year rule. */
  ownedSinceAge: number;
  currentRent: number;
  nominalMortgage: number;
  nominalAnnualPayment: number;
  nominalCostBasis: number;
};

export type PropertyYear = {
  /** Cash reaching the owner after costs and mortgage, before personal tax. */
  cashIncome: number;
  /** Amount entering the income-tax computation (profit, or zero when taxed flat). */
  taxableIncome: number;
  /** Tax settled outside the income-tax bands (flat-rate regimes, gains tax on sale). */
  flatTax: number;
  /** Mortgage interest paid this year, in today's money — basis for any finance-cost credit. */
  mortgageInterest: number;
  equity: number;
  saleProceeds: number;
};

export function initialPropertyState(asset: PropertyAsset, currentAge: number): PropertyState {
  return {
    asset,
    active: asset.purchaseAge <= currentAge,
    purchasedThisYear: false,
    ownedSinceAge: asset.purchaseAge,
    currentRent: asset.incomeMode === "net" ? asset.monthlyNetIncome : asset.monthlyRent,
    nominalMortgage: Math.max(0, asset.mortgage),
    nominalAnnualPayment: Math.max(0, asset.monthlyMortgagePayment) * 12,
    nominalCostBasis: asset.purchaseCostBasis,
  };
}

/** Deposit plus buying costs, in today's money, needed to complete a future purchase. */
export function acquisitionCost(asset: PropertyAsset): number {
  return Math.max(0, asset.value - asset.mortgage) + asset.value * asset.purchaseCostsPercent / 100;
}

/** Mark a future purchase complete; the loan and basis are fixed in that year's nominal terms. */
export function completePurchase(state: PropertyState, priceLevel: number): void {
  state.active = true;
  state.purchasedThisYear = true;
  state.nominalMortgage = Math.max(0, state.asset.mortgage) * priceLevel;
  state.nominalAnnualPayment = Math.max(0, state.asset.monthlyMortgagePayment) * 12 * priceLevel;
  state.nominalCostBasis = state.asset.purchaseCostBasis * priceLevel;
}

/** One year of value growth, rent growth and mortgage amortisation. */
export function growProperty(state: PropertyState, inflationPercent: number, valueShockPercent: number): void {
  const asset = state.asset;
  state.asset = { ...asset, value: asset.value * (1 + realRate(asset.annualGrowthPercent + valueShockPercent, inflationPercent)) };
  state.currentRent *= 1 + asset.rentGrowthPercent / 100;
  if (state.nominalMortgage > 0) {
    const interest = state.nominalMortgage * asset.mortgageRatePercent / 100;
    const payment = state.nominalAnnualPayment > 0 ? state.nominalAnnualPayment : interest;
    state.nominalMortgage = Math.max(0, state.nominalMortgage - Math.max(0, payment - interest));
  }
}

function annualMortgagePayment(state: PropertyState, priceLevel: number): number {
  if (state.nominalMortgage <= 0) return 0;
  const nominal = state.nominalAnnualPayment > 0 ? state.nominalAnnualPayment : state.nominalMortgage * state.asset.mortgageRatePercent / 100;
  return nominal / priceLevel;
}

function annualMortgageInterest(state: PropertyState, priceLevel: number): number {
  if (state.nominalMortgage <= 0) return 0;
  const payment = state.nominalAnnualPayment > 0 ? state.nominalAnnualPayment : Number.POSITIVE_INFINITY;
  return Math.min(payment, state.nominalMortgage * state.asset.mortgageRatePercent / 100) / priceLevel;
}

/** Income, tax treatment, equity and any sale for the year. Deactivates the state on sale. */
export function propertyYear(state: PropertyState, age: number, priceLevel: number, rules: PropertyRules, rentActive: boolean, vacancyMultiplier: number): PropertyYear {
  const asset = state.asset;
  const realMortgage = state.nominalMortgage / priceLevel;
  const result: PropertyYear = { cashIncome: 0, taxableIncome: 0, flatTax: 0, mortgageInterest: 0, equity: 0, saleProceeds: 0 };

  if (asset.sellAtAge > 0 && age === asset.sellAtAge) {
    const saleCosts = asset.value * asset.saleCostsPercent / 100;
    // No indexation: the gain is measured in nominal money, then the tax is deflated.
    const nominalGain = Math.max(0, asset.value * priceLevel - state.nominalCostBasis - saleCosts * priceLevel);
    const taxed = rules.gainTax.kind === "rate" || age - state.ownedSinceAge < rules.gainTax.years;
    const gainTax = taxed ? nominalGain * asset.estimatedCgtPercent / 100 / priceLevel : 0;
    result.saleProceeds = Math.max(0, asset.value - realMortgage - saleCosts - gainTax);
    result.flatTax = gainTax;
    state.active = false;
    return result;
  }

  result.equity = Math.max(0, asset.value - realMortgage);
  if (!rentActive) return result;

  if (asset.incomeMode === "net") {
    const net = Math.max(0, state.currentRent * 12 * vacancyMultiplier);
    result.cashIncome = net;
    result.taxableIncome = net;
    if (rules.rentalTax.kind === "flat-on-gross") {
      // Net-income mode has no gross figure; treat the net amount as the taxed base.
      result.taxableIncome = 0;
      result.flatTax = flatRentalTax(net, rules.rentalTax);
      result.cashIncome = Math.max(0, net - result.flatTax);
    }
    return result;
  }

  const collected = state.currentRent * 12 * (1 - clamp(asset.vacancyPercent, 0, 100) / 100) * vacancyMultiplier;
  const operating = collected * clamp(asset.runningCostsPercent, 0, 100) / 100;
  const mortgagePayment = annualMortgagePayment(state, priceLevel);
  result.mortgageInterest = annualMortgageInterest(state, priceLevel);
  if (rules.rentalTax.kind === "income") {
    result.cashIncome = Math.max(0, collected - operating - mortgagePayment);
    result.taxableIncome = Math.max(0, collected - operating);
  } else {
    result.flatTax = flatRentalTax(collected, rules.rentalTax);
    result.cashIncome = Math.max(0, collected - operating - mortgagePayment - result.flatTax);
  }
  return result;
}

function flatRentalTax(gross: number, rule: { threshold: number; lowRate: number; highRate: number }): number {
  return Math.min(gross, rule.threshold) * rule.lowRate + Math.max(0, gross - rule.threshold) * rule.highRate;
}

/** Today's monthly cash from a property, for summaries. */
export function estimatedPropertyMonthlyCashIncome(asset: PropertyAsset): number {
  if (asset.incomeMode === "net") return Math.max(0, asset.monthlyNetIncome);
  const collected = Math.max(0, asset.monthlyRent) * (1 - clamp(asset.vacancyPercent, 0, 100) / 100);
  const operating = collected * clamp(asset.runningCostsPercent, 0, 100) / 100;
  const mortgage = asset.mortgage > 0 ? (asset.monthlyMortgagePayment > 0 ? asset.monthlyMortgagePayment : asset.mortgage * asset.mortgageRatePercent / 1_200) : 0;
  return Math.max(0, collected - operating - mortgage);
}
