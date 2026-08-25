"use client";

import { allocationCashPercent, assumedRealReturn, assumedVolatility, expectedPortfolioReturn, profileOf, type PlanInputs } from "../../../lib/planner";
import { NumberField } from "../fields";
import { Info } from "../Info";
import { Block } from "./Block";
import type { PlanUpdaters } from "./use-plan";

export function Markets({ plan, updaters }: { plan: PlanInputs; updaters: PlanUpdaters }) {
  const p = plan.portfolio;
  const set = updaters.updatePortfolio;
  const profile = profileOf(plan);
  const hasDrag = profile.accounts.some((rule) => rule.growthTax.kind === "drag");
  return (
    <Block title="Markets" note={`Mix · cash ${allocationCashPercent(plan)}%`} info={<Info title="Markets"><span>What you assume shares, bonds and cash will earn on average, and how wildly they swing year to year (volatility). These are guesses about the future — the single most important dials in the plan, so err on the cautious side.</span><em>Example: 7.5% stock return with 2.5% inflation means shares beat prices by about 5% a year on average — some years +30%, some −30%.</em></Info>}>
      <p className="note">The mix and fee apply to every invested account; the rest is cash.</p>
      <div className="grid three">
        <NumberField label="Stocks" value={p.stocksPercent} suffix="%" max={100} onChange={(value) => set("stocksPercent", value)} />
        <NumberField label="Bonds" value={p.bondsPercent} suffix="%" max={100 - p.stocksPercent} onChange={(value) => set("bondsPercent", value)} />
        <NumberField label="Fees per year" value={p.annualFeePercent} suffix="%" max={5} step={0.05} onChange={(value) => set("annualFeePercent", value)} />
      </div>
      <dl className="mix-readout" aria-label="What these assumptions come to">
        <div><dt>Nominal return<Info title="Nominal return"><span>What your investments are expected to earn per year before inflation, after fees, given the stock/bond/cash mix set under Markets.</span><em>Example: 80% shares at 7.5% and 20% bonds at 4% ≈ 6.8%, less a 0.25% fee = 6.5%.</em></Info></dt><dd>{expectedPortfolioReturn(plan).toFixed(1)}%</dd></div>
        <div><dt>Real return<Info title="Real return"><span>The nominal return with inflation stripped out — the growth in what your money can actually buy. Every figure in this planner is in today’s money, so this is the number doing the work.</span><em>Example: 6.5% growth with 2.5% inflation is a real return of about 3.9%.</em></Info></dt><dd>{assumedRealReturn(plan).toFixed(1)}%</dd></div>
        <div><dt>Volatility<Info title="Volatility"><span>How much a typical year strays from the average. Higher volatility means bigger swings — and it is bad years early in retirement, not the average, that sink plans.</span><em>Example: 18% volatility means roughly one year in three the return lands more than 18 points above or below the average.</em></Info></dt><dd>{assumedVolatility(plan).toFixed(1)}%</dd></div>
      </dl>
      <div className="grid two">
        <NumberField label="Stock return" value={p.stockReturnPercent} suffix="%" min={-5} max={20} step={0.1} onChange={(value) => set("stockReturnPercent", value)} />
        <NumberField label="Stock volatility" value={p.stockVolatilityPercent} suffix="%" max={40} step={0.5} onChange={(value) => set("stockVolatilityPercent", value)} />
        <NumberField label="Bond return" value={p.bondReturnPercent} suffix="%" min={-5} max={15} step={0.1} onChange={(value) => set("bondReturnPercent", value)} />
        <NumberField label="Bond volatility" value={p.bondVolatilityPercent} suffix="%" max={25} step={0.5} onChange={(value) => set("bondVolatilityPercent", value)} />
        <NumberField label="Cash return" value={p.cashReturnPercent} suffix="%" min={-2} max={12} step={0.1} onChange={(value) => set("cashReturnPercent", value)} />
        <NumberField label="Inflation" value={p.inflationPercent} suffix="%" min={0} max={12} step={0.1} onChange={(value) => set("inflationPercent", value)} />
        <NumberField label="Inflation volatility" value={p.inflationVolatilityPercent} suffix="%" max={8} step={0.1} onChange={(value) => set("inflationVolatilityPercent", value)} />
        {hasDrag ? <NumberField label="Taxable account drag" value={p.taxableDragPercent} suffix="%" max={5} step={0.1} onChange={(value) => set("taxableDragPercent", value)} hint="Dividend and gains tax, per year" /> : null}
      </div>
    </Block>
  );
}
