"use client";

import { useMemo, useState } from "react";
import { pensionAccessAge, profileOf, withBridgeReserve, type BridgeAnalysis, type MonteCarloResult, type PlanInputs } from "../../../lib/planner";
import { useAnalysis } from "../../analysis/use-analysis";
import { Info } from "../Info";
import { useMoney } from "../money";

const OPTIONS = [1, 2, 3];

/** The access gap, and an experiment: keep N years of spending in cash during it. */
export function Bridge({ plan, bridge, monteCarlo, onApply }: { plan: PlanInputs; bridge: BridgeAnalysis; monteCarlo: MonteCarloResult; onApply: (plan: PlanInputs) => void }) {
  const money = useMoney();
  const profile = profileOf(plan);
  const [years, setYears] = useState(0);
  const annualDraw = bridge.years > 0 ? bridge.needOverGap / bridge.years : 0;
  const experiment = useMemo(() => years > 0 ? withBridgeReserve(plan, years, annualDraw) : null, [plan, years, annualDraw]);
  const { result, pending } = useAnalysis(experiment, 0, true);
  const cashName = profile.accounts.find((rule) => rule.isCash)?.name ?? "cash";
  const sourceName = profile.withdrawalOrder.map((id) => profile.accounts.find((rule) => rule.id === id)!).find((rule) => !rule.isCash && rule.accessAge === null && (plan.accounts[rule.id]?.balance ?? 0) > 0)?.name ?? "your accessible investments";
  const accessAge = pensionAccessAge(plan);
  if (bridge.years <= 0) return null;
  const covered = Number.isFinite(bridge.yearsCovered) ? Math.min(bridge.yearsCovered, bridge.years) : bridge.years;
  const tone = monteCarlo.bridgeFailureRate >= 5 ? "warn" : "good";

  return (
    <section className={`bridge-card ${tone}`} aria-label="Access gap">
      <div className="bridge-head">
        <strong>Access gap · ages {bridge.fromAge}–{accessAge}<Info title="Access gap"><span>The years between stopping work and your pension unlocking. Only accessible accounts (ISA, general account, cash) can pay for them — the pension is worthless until it opens, however big it is. Most early-retirement failures happen here.</span><em>Example: stop at 50, pension from 57, £2,000 a month: you need roughly £170k reachable at 50, and a crash at 51 hurts far more than one at 70.</em></Info></strong>
        <span className="note">From {bridge.fromAge} to {accessAge} your pension is locked, so {bridge.years} {bridge.years === 1 ? "year" : "years"} of spending must come from the accessible accounts alone. A bad run of markets in these years is the most common way an early-retirement plan fails.</span>
      </div>
      <div className="bridge-figures">
        <div><small>Accessible at {bridge.fromAge}</small><strong>{money.compact(bridge.accessibleAtStart)}</strong></div>
        <div><small>Needed over the gap</small><strong>{money.compact(bridge.needOverGap)}</strong><span>central path</span></div>
        <div><small>Covers</small><strong>{Number.isFinite(bridge.yearsCovered) ? `${covered.toFixed(1)} of ${bridge.years} yrs` : "all"}</strong></div>
        <div className={monteCarlo.bridgeFailureRate >= 5 ? "bad" : ""}><small>Runs short in the gap</small><strong>{Math.round(monteCarlo.bridgeFailureRate)}%</strong><span>of {monteCarlo.paths.toLocaleString("en-GB")} futures</span></div>
      </div>
      <div className="bridge-experiment">
        <span className="label">Experiment: move part of {sourceName} into {cashName} before you stop</span>
        <p className="note">Each option sets aside that many years of spending ({money.format(Math.round(annualDraw))} a year, the gap’s average draw) as {cashName} so the first years of the gap are paid from money that cannot fall. It earns the cash return instead of the market, so the rest of the plan grows a little less. “As is” is your plan unchanged.</p>
        <div className="switch compact" role="group" aria-label="Years of spending held in cash">
          <button type="button" className={years === 0 ? "on" : ""} aria-pressed={years === 0} onClick={() => setYears(0)}><span>As is</span><small>no change</small></button>
          {OPTIONS.map((option) => <button type="button" key={option} className={years === option ? "on" : ""} aria-pressed={years === option} onClick={() => setYears(option)}><span>{option} {option === 1 ? "year" : "years"} in {cashName.toLowerCase()}</span><small>{money.compact(annualDraw * option)}</small></button>)}
        </div>
        {years > 0 ? (
          result && !pending ? (
            <div className="bridge-result">
              <span className="label">Your plan → with {years} {years === 1 ? "year" : "years"} in {cashName.toLowerCase()}</span>
              <Delta label="Money lasts" a={monteCarlo.successRate} b={result.monteCarlo.successRate} higherIsBetter />
              <Delta label="Runs short in gap" a={monteCarlo.bridgeFailureRate} b={result.monteCarlo.bridgeFailureRate} higherIsBetter={false} />
              {plan.spendingStrategy === "flex" ? <Delta label="Hit the floor" a={monteCarlo.floorRate} b={result.monteCarlo.floorRate} higherIsBetter={false} /> : null}
              <Delta label={`Median at ${plan.planToAge}`} a={monteCarlo.medianEnding} b={result.monteCarlo.medianEnding} higherIsBetter format={money.compact} />
              <button type="button" className="button" onClick={() => { if (experiment) onApply(experiment); setYears(0); }}>Apply to plan</button>
            </div>
          ) : <p className="note">Running…</p>
        ) : null}
      </div>
    </section>
  );
}

function Delta({ label, a, b, higherIsBetter, format }: { label: string; a: number; b: number; higherIsBetter: boolean; format?: (value: number) => string }) {
  const fmt = format ?? ((value: number) => `${Math.round(value)}%`);
  const better = Math.abs(b - a) < 0.5 ? "plain" : (b > a) === higherIsBetter ? "good" : "warn";
  return <span className={`delta-chip ${better}`}><small>{label}</small><strong>{fmt(a)} → {fmt(b)}</strong></span>;
}
