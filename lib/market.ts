import { clamp, realRate } from "./money.ts";
import type { PlanInputs, PortfolioAssumptions } from "./plan.ts";

/** One possible future: nominal returns and inflation per year, plus property shocks. */
export type MarketPath = {
  stockReturns: number[];
  bondReturns: number[];
  /** The plan's mix blended from the series above; used by stress tests and for display. */
  portfolioReturns: number[];
  cashReturns: number[];
  inflation: number[];
  propertyShocks: number[];
  vacancyMultipliers: number[];
};

export function portfolioWeights(portfolio: PortfolioAssumptions): { stocks: number; bonds: number; cash: number } {
  const stocks = clamp(portfolio.stocksPercent, 0, 100) / 100;
  const bonds = clamp(portfolio.bondsPercent, 0, 100 - stocks * 100) / 100;
  return { stocks, bonds, cash: Math.max(0, 1 - stocks - bonds) };
}

export type Mix = { stocks: number; bonds: number; cash: number; feePercent: number };

/** The mix every invested account holds: the stock/bond/cash split and fee set under Markets. */
export function planMix(plan: PlanInputs): Mix {
  return { ...portfolioWeights(plan.portfolio), feePercent: plan.portfolio.annualFeePercent };
}

/** Nominal return of a mix in a year, given that year's stock, bond and cash returns. */
export function mixReturn(mix: Mix, stock: number, bond: number, cash: number): number {
  return mix.stocks * stock + mix.bonds * bond + mix.cash * cash - mix.feePercent;
}

export function expectedStockReturn(plan: PlanInputs): number {
  return plan.portfolio.stockReturnPercent;
}

export function expectedBondReturn(plan: PlanInputs): number {
  return plan.portfolio.bondReturnPercent;
}

/** Expected nominal return of the plan's effective mix. */
export function expectedPortfolioReturn(plan: PlanInputs): number {
  return mixReturn(planMix(plan), expectedStockReturn(plan), expectedBondReturn(plan), plan.portfolio.cashReturnPercent);
}

export function expectedInflation(plan: PlanInputs): number {
  return plan.portfolio.inflationPercent;
}

export function assumedRealReturn(plan: PlanInputs): number {
  return realRate(expectedPortfolioReturn(plan), expectedInflation(plan)) * 100;
}

export function assumedVolatility(plan: PlanInputs): number {
  const weights = planMix(plan);
  const stockRisk = weights.stocks * plan.portfolio.stockVolatilityPercent;
  const bondRisk = weights.bonds * plan.portfolio.bondVolatilityPercent;
  const cashRisk = weights.cash;
  return Math.sqrt(stockRisk ** 2 + bondRisk ** 2 + cashRisk ** 2 + 2 * 0.15 * stockRisk * bondRisk);
}

/** The deterministic path: expected values every year. */
export function expectedPath(plan: PlanInputs): MarketPath {
  const length = plan.planToAge - plan.currentAge + 1;
  const stock = expectedStockReturn(plan);
  const bond = expectedBondReturn(plan);
  const inflation = expectedInflation(plan);
  const defaultMix = planMix(plan);
  return {
    stockReturns: Array.from({ length }, () => stock),
    bondReturns: Array.from({ length }, () => bond),
    portfolioReturns: Array.from({ length }, () => mixReturn(defaultMix, stock, bond, plan.portfolio.cashReturnPercent)),
    cashReturns: Array.from({ length }, () => plan.portfolio.cashReturnPercent),
    inflation: Array.from({ length }, () => inflation),
    propertyShocks: Array.from({ length }, () => 0),
    vacancyMultipliers: Array.from({ length }, () => 1),
  };
}
