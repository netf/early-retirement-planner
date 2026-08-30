"use client";

import { useState } from "react";
import { medianLifespan, ruinWhileAlive, totalCurrentInvestments, type BridgeAnalysis, type MonteCarloResult, type PlanInputs, type Projection } from "../../../lib/planner";
import { Bridge } from "./Bridge";
import { FanChart, FanTable, SpendingChart, type MoneyView } from "../charts";
import { Info } from "../Info";
import { useMoney } from "../money";
import { Stat } from "./Stat";

export function Outcomes({ plan, projection, monteCarlo, bridge, onApply }: { plan: PlanInputs; projection: Projection; monteCarlo: MonteCarloResult; bridge: BridgeAnalysis; onApply: (plan: PlanInputs) => void }) {
  const money = useMoney();
  const [view, setView] = useMoneyView();
  const retirementYear = projection.years.find((year) => year.age === Math.max(plan.retirementAge, plan.currentAge));
  // The build-up runs to the end of the last working year; the retirement year itself already includes spending.
  const buildYears = projection.years.filter((year) => year.age < plan.retirementAge);
  const start = totalCurrentInvestments(plan);
  const added = buildYears.reduce((sum, year) => sum + year.contributions, 0);
  const takenOut = buildYears.reduce((sum, year) => sum + year.withdrawals, 0);
  const atRetirement = buildYears.at(-1)?.totalInvestments ?? start;
  const growth = atRetirement - start - added + takenOut;
  const ruin = ruinWhileAlive(plan, monteCarlo.years);
  const lifespan = medianLifespan(plan);
  return (
    <div className="tab-body">
      {plan.retirementAge > plan.currentAge ? (
        <div className="buildup" aria-label="How the balance builds up to retirement">
          <Info title="Build-up to retirement"><span>How your pot gets from today to the day you stop, on the central path: what you have, what you add, and what the market adds after inflation. Growth is not a promise — it is the average case.</span><em>Example: £490k today + £410k saved + £262k growth = £1.2m at 50.</em></Info>
          <span><small>Today</small><strong>{money.compact(start)}</strong></span>
          <i>+</i>
          <span><small>Added while working</small><strong>{money.compact(added)}</strong></span>
          <i>{growth < 0 ? "−" : "+"}</i>
          <span><small>Growth after inflation</small><strong>{money.compact(Math.abs(growth))}</strong></span>
          {takenOut > 0 ? <><i>−</i><span><small>Taken out</small><strong>{money.compact(takenOut)}</strong></span></> : null}
          <i>=</i>
          <span className="buildup-total"><small>Start of {plan.retirementAge}</small><strong>{money.compact(atRetirement)}</strong></span>
        </div>
      ) : null}
      <div className="chart-head">
        <strong>Range of outcomes<Info title="Range of outcomes"><span>Your total investments year by year across the 1,000 simulated futures. The dark band holds the middle half of them, the light band 9 in 10; the black line is the median — half of futures do better, half worse. The dashed line is the single “average return every year” path, which sits above the median because real markets swing. Hover or use the arrow keys to read any age, including how many futures have run out by then.</span><em>Example: a light band that reaches £0 at 80 means the worst 1 in 10 futures had run out by then.</em></Info></strong>
        <div className="fan-legend">
          <span><i className="key band core" />Half of futures</span>
          <span><i className="key band outer" />9 in 10 futures</span>
          <span><i className="key median" />Median</span>
          <span><i className="key central" />Central assumptions</span>
          <div className="switch compact money-view" role="group" aria-label="Money shown as">
            <button type="button" className={view === "real" ? "on" : ""} aria-pressed={view === "real"} onClick={() => setView("real")}><span>Today’s money</span></button>
            <button type="button" className={view === "nominal" ? "on" : ""} aria-pressed={view === "nominal"} onClick={() => setView("nominal")}><span>Future money</span></button>
          </div>
        </div>
      </div>
      {view === "nominal" ? <p className="note money-view-note">Cash figures in the year they happen, at {plan.portfolio.inflationPercent}% inflation — what your statements would say, not what it buys. Everything else on this page stays in today’s money.</p> : null}
      <FanChart result={monteCarlo} projection={projection} plan={plan} view={view} />
      <FanTable result={monteCarlo} projection={projection} plan={plan} view={view} />
      <Bridge plan={plan} bridge={bridge} monteCarlo={monteCarlo} onApply={onApply} />
      {plan.spendingStrategy === "flex" || plan.spendingStrategy === "amortise" ? (
        <div className="spending-block">
          <div className="chart-head spending-head">
            <strong>What you would actually spend each year<Info title="What you would actually spend"><span>Under a flexible rule your spending is not a fixed number — it rises and falls with the pot. This shows the range of monthly spending across the 1,000 futures, with the floor and ceiling you set as dotted lines.</span><em>Example: a lower edge sitting on the floor for years means that in poor futures you would live on the minimum for that long.</em></Info></strong>
            <div className="fan-legend">
              <span><i className="key band" />10th–90th percentile</span>
              <span><i className="key median" />Median</span>
              <span><i className="key bound" />Floor / ceiling</span>
            </div>
          </div>
          <SpendingChart result={monteCarlo} plan={plan} />
          {plan.spendingStrategy === "amortise" ? (
            <p className="note">
              The rule pays {money.format(Math.round((monteCarlo.years.find((year) => year.age === Math.max(plan.retirementAge, plan.currentAge))?.spendMedian ?? 0) / 12))} a month in the first year of retirement in the typical future. By {Math.min(plan.planToAge, plan.retirementAge + 20)} the typical future pays {money.format(Math.round((monteCarlo.years.find((year) => year.age === Math.min(plan.planToAge, plan.retirementAge + 20))?.spendMedian ?? 0) / 12))}; a poor one {money.format(Math.round((monteCarlo.years.find((year) => year.age === Math.min(plan.planToAge, plan.retirementAge + 20))?.spendP10 ?? 0) / 12))}.
              {" "}At {plan.planToAge} the pot is {money.compact(monteCarlo.p10Ending)}–{money.compact(monteCarlo.p90Ending)} across futures against the {money.format(plan.amortiseTargetAtEnd)} you asked to leave.
              {monteCarlo.floorRate > 0 ? ` In ${Math.round(monteCarlo.floorRate)}% of futures the payment is lifted to the ${money.format(plan.essentialMonthlySpending)} floor at some point.` : ""}
            </p>
          ) : null}
          {plan.spendingStrategy === "flex" ? (
            <p className="note">
              Spending starts at {money.format(plan.desiredMonthlySpending)} a month and follows the pot. By {Math.min(plan.planToAge, plan.retirementAge + 20)} the typical future spends {money.format(Math.round((monteCarlo.years.find((year) => year.age === Math.min(plan.planToAge, plan.retirementAge + 20))?.spendMedian ?? 0) / 12))} a month; a poor one {money.format(Math.round((monteCarlo.years.find((year) => year.age === Math.min(plan.planToAge, plan.retirementAge + 20))?.spendP10 ?? 0) / 12))}.
              {monteCarlo.floorRate > 0 ? ` In ${Math.round(monteCarlo.floorRate)}% of futures spending is pushed down to the ${money.format(plan.essentialMonthlySpending)} floor at some point, typically for ${monteCarlo.medianYearsAtFloor} ${monteCarlo.medianYearsAtFloor === 1 ? "year" : "years"}.` : " No future was pushed down to the floor."}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="figures">
        <Stat label={`End of ${Math.max(plan.retirementAge, plan.currentAge)}, central`} value={money.compact(retirementYear?.totalInvestments ?? 0)} note="After the first year of retirement" />
        <Stat label="Typical failure age" value={monteCarlo.medianFailureAge === null ? "None" : String(monteCarlo.medianFailureAge)} tone={monteCarlo.medianFailureAge === null ? "good" : "warn"} />
        <Stat label="Run out while alive" value={`${ruin < 0.05 ? "<1" : ruin.toFixed(ruin < 10 ? 1 : 0)}%`} tone={ruin <= 100 - plan.targetConfidencePercent ? "good" : "warn"} note={`${100 - Math.round(monteCarlo.successRate)}% if you reach ${plan.planToAge} · even odds of ${lifespan}`} info={<Info title="Run out while alive"><span>The failure rate weighted by the chance of still being around: a future that runs dry at 93 only hurts if you are alive at 93. Uses national life tables for your country, both sexes averaged{plan.partner ? ", and counts the household as alive while either of you is" : ""}. This is the risk that actually matters — “plan to age” is just where the simulation stops.</span><em>Example: 8% of futures fail by 95, but with a 1-in-5 chance of reaching 95 the risk you would ever feel it is nearer 2%.</em></Info>} />
        <Stat label="Tax, central" value={money.compact(projection.totalTax)} note="Total over retirement" />
      </div>
    </div>
  );
}

const VIEW_KEY = "fire:money-view";

/** A viewer convenience, remembered in this browser only — never part of the plan. */
function useMoneyView(): [MoneyView, (view: MoneyView) => void] {
  const [view, setView] = useState<MoneyView>(() => { try { return typeof window !== "undefined" && localStorage.getItem(VIEW_KEY) === "nominal" ? "nominal" : "real"; } catch { return "real"; } });
  const choose = (next: MoneyView) => { setView(next); try { localStorage.setItem(VIEW_KEY, next); } catch { /* storage unavailable */ } };
  return [view, choose];
}
