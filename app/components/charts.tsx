"use client";

import { useState } from "react";
import { pensionAccessAge, profileOf, stateIncomeRule, statePensionAge, type MonteCarloResult, type MonteCarloYear, type PlanInputs, type Projection } from "../../lib/planner";
import { useMoney } from "./money";

const WIDTH = 1000;

function useAgeScale(plan: PlanInputs) {
  const first = plan.currentAge;
  const last = plan.planToAge;
  return (age: number) => ((age - first) / Math.max(1, last - first)) * WIDTH;
}

/**
 * The age ruler: one bar from today to the end of the plan, cut into the four phases
 * the engine models. Bridge years (retired, pension still locked) are hatched — that
 * gap is what an early-retirement plan has to fund from accessible savings.
 */
export function AgeRuler({ plan }: { plan: PlanInputs }) {
  const x = useAgeScale(plan);
  const accessAge = pensionAccessAge(plan);
  const stateAge = statePensionAge(plan);
  const stateLabel = stateIncomeRule(profileOf(plan)).label;
  const cuts = [
    { key: "build", label: "Build", from: plan.currentAge, to: plan.retirementAge },
    { key: "bridge", label: "Bridge", from: plan.retirementAge, to: Math.max(plan.retirementAge, accessAge) },
    { key: "pension", label: "Pension", from: Math.max(plan.retirementAge, accessAge), to: Math.max(plan.retirementAge, stateAge) },
    { key: "state", label: stateLabel, from: Math.max(plan.retirementAge, stateAge), to: plan.planToAge },
  ].filter((cut) => cut.to > cut.from);
  const ticks = [plan.currentAge, plan.retirementAge, accessAge, stateAge, plan.planToAge]
    .filter((age, index, ages) => age >= plan.currentAge && age <= plan.planToAge && ages.indexOf(age) === index)
    .sort((left, right) => left - right);

  return (
    <div className="ruler-wrap">
      <svg className="ruler" viewBox={`0 0 ${WIDTH} 44`} preserveAspectRatio="none" role="img" aria-label={`Plan phases from age ${plan.currentAge} to ${plan.planToAge}`}>
        <defs>
          <pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="10" height="10" className="hatch-bg" />
            <rect width="4" height="10" className="hatch-fg" />
          </pattern>
        </defs>
        {cuts.map((cut) => <rect key={cut.key} x={x(cut.from)} y={0} width={x(cut.to) - x(cut.from)} height={44} className={`ruler-cut ${cut.key}`} />)}
      </svg>
      <div className="ruler-labels" aria-hidden="true">
        {cuts.map((cut) => <span key={cut.key} className={`ruler-text ${cut.key}`} style={{ left: `${(x(cut.from) / WIDTH) * 100}%`, width: `${((x(cut.to) - x(cut.from)) / WIDTH) * 100}%` }}>{cut.label}</span>)}
      </div>
      <div className="ruler-ages" aria-hidden="true">
        {ticks.map((age) => <span key={age} style={{ left: `${(x(age) / WIDTH) * 100}%` }} className={age === plan.planToAge ? "end" : ""}>{age}</span>)}
      </div>
    </div>
  );
}

/**
 * The range of outcomes: a graded fan of the pot across every simulated future (9 in 10 / half),
 * the median, and the central-assumptions path. Hover or use the arrow keys to read any age.
 */
export function FanChart({ result, projection, plan }: { result: MonteCarloResult; projection: Projection; plan: PlanInputs }) {
  const height = 320;
  const money = useMoney();
  const x = useAgeScale(plan);
  const [hover, setHover] = useState<number | null>(null);
  const years = result.years;
  const top = Math.max(1, ...years.map((year) => year.p90), ...projection.years.map((year) => year.totalInvestments)) * 1.04;
  const y = (value: number) => 8 + (1 - value / top) * (height - 16);
  const toPoints = (points: [number, number][]) => points.map(([age, value]) => `${x(age).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const ribbon = (upper: keyof MonteCarloYear, lower: keyof MonteCarloYear) => `${toPoints(years.map((year) => [year.age, year[upper]]))} ${toPoints([...years].reverse().map((year) => [year.age, year[lower]]))}`;
  const outer = ribbon("p90", "p10");
  const core = ribbon("p75", "p25");
  const median = toPoints(years.map((year) => [year.age, year.median]));
  const central = toPoints(projection.years.map((year) => [year.age, year.totalInvestments]));
  const gridLevels = [0.25, 0.5, 0.75, 1];
  const events = [
    { age: plan.retirementAge, label: "stop work" },
    { age: pensionAccessAge(plan), label: "pension" },
    { age: statePensionAge(plan), label: stateIncomeRule(profileOf(plan)).label.toLowerCase() },
  ].filter((event, index, list) => event.age > plan.currentAge && event.age < plan.planToAge && list.findIndex((item) => item.age === event.age) === index);
  const allowed = 100 - plan.targetConfidencePercent;

  const ageFromPointer = (event: React.PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    return plan.currentAge + Math.round(fraction * (plan.planToAge - plan.currentAge));
  };
  const onKey = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Escape") return;
    event.preventDefault();
    if (event.key === "Escape") { setHover(null); return; }
    const current = hover ?? Math.max(plan.retirementAge, plan.currentAge);
    setHover(Math.min(plan.planToAge, Math.max(plan.currentAge, current + (event.key === "ArrowLeft" ? -1 : 1))));
  };
  const hovered = hover === null ? null : years.find((year) => year.age === hover) ?? null;
  const hoveredCentral = hover === null ? null : projection.years.find((year) => year.age === hover) ?? null;
  const left = hover === null ? 0 : (x(hover) / WIDTH) * 100;
  const flip = left > 62;

  return (
    <div className="fan outcomes-fan">
      <div className="fan-scale" aria-hidden="true">
        {gridLevels.slice().reverse().map((level) => <span key={level} style={{ top: `${(1 - level) * 100}%` }}>{money.compact(top * level)}</span>)}
        <span style={{ top: "100%" }}>{money.compact(0)}</span>
      </div>
      <div className="fan-plot" tabIndex={0} role="img" aria-label={`Investment balance by age across ${result.paths.toLocaleString("en-GB")} simulated futures, in today's money. Use the arrow keys to read a year.`} onKeyDown={onKey} onBlur={() => setHover(null)} onPointerMove={(event) => setHover(ageFromPointer(event))} onPointerDown={(event) => setHover(ageFromPointer(event))} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none" aria-hidden="true">
          {gridLevels.map((level) => <line key={level} x1={0} x2={WIDTH} y1={y(top * level)} y2={y(top * level)} className="fan-grid" />)}
          <polygon points={outer} className="fan-band outer" />
          <polygon points={core} className="fan-band core" />
          <polyline points={central} className="fan-central" />
          <polyline points={median} className="fan-median" />
          {events.map((event) => <line key={event.age} x1={x(event.age)} x2={x(event.age)} y1={0} y2={height} className="fan-event" />)}
        </svg>
        {hovered ? (
          <>
            <div className="fan-cross" style={{ left: `${left}%` }} aria-hidden="true" />
            {[hovered.p90, hovered.median, hovered.p10].map((value, index) => <i key={index} className={`fan-dot ${index === 1 ? "median" : ""}`} style={{ left: `${left}%`, top: `${(y(value) / height) * 100}%` }} aria-hidden="true" />)}
            <div className={`fan-tip ${flip ? "flip" : ""}`} style={{ left: `${left}%` }} role="status">
              <strong>Age {hovered.age}</strong>
              <span><b>{money.compact(hovered.p90)}</b><small>strong · 1 in 10 do better</small></span>
              <span><b>{money.compact(hovered.median)}</b><small>median</small></span>
              <span><b>{money.compact(hovered.p10)}</b><small>poor · 1 in 10 do worse</small></span>
              {hoveredCentral ? <span><b>{money.compact(hoveredCentral.totalInvestments)}</b><small>central assumptions</small></span> : null}
              <span className={hovered.failedByNow > allowed ? "bad" : ""}><b>{hovered.failedByNow < 0.5 ? "none" : `${Math.round(hovered.failedByNow)}%`}</b><small>have run out by now</small></span>
            </div>
          </>
        ) : null}
      </div>
      <div className="fan-axis" aria-hidden="true">
        <span style={{ left: 0 }}>{plan.currentAge}</span>
        {events.map((event, index) => {
          const previous = events[index - 1];
          const crowded = previous !== undefined && x(event.age) - x(previous.age) < WIDTH * 0.12;
          return <span key={event.age} className={crowded ? "second-row" : ""} style={{ left: `${(x(event.age) / WIDTH) * 100}%`, marginLeft: 6 }}>{event.age}<em> · {event.label}</em></span>;
        })}
        <span style={{ right: 0 }}>{plan.planToAge}</span>
      </div>
    </div>
  );
}

/** Where every series ends: the reference table under the fan. */
export function FanTable({ result, projection, plan }: { result: MonteCarloResult; projection: Projection; plan: PlanInputs }) {
  const money = useMoney();
  const last = result.years.at(-1);
  if (!last) return null;
  const rows = [
    { key: "central", label: "Central assumptions", note: "average return every year", value: projection.years.at(-1)?.totalInvestments ?? 0 },
    { key: "outer", label: "Strong future", note: "1 in 10 do better", value: last.p90 },
    { key: "core", label: "Upper quarter", note: "3 in 4 do worse", value: last.p75 },
    { key: "median", label: "Median", note: "half do better, half worse", value: last.median },
    { key: "core", label: "Lower quarter", note: "3 in 4 do better", value: last.p25 },
    { key: "outer", label: "Poor future", note: "1 in 10 do worse", value: last.p10 },
  ];
  return (
    <table className="fan-table" aria-label={`Investments at ${plan.planToAge} by outcome`}>
      <thead><tr><th>Outcome</th><th>At {plan.planToAge}</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <td><i className={`key ${row.key === "central" ? "central" : row.key === "median" ? "median" : `band ${row.key}`}`} />{row.label}<small>{row.note}</small></td>
            <td>{row.value < 1 ? <span className="zero">ran out</span> : money.plain(row.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Annual spending across the simulated futures, with the floor and ceiling the rule respects. */
export function SpendingChart({ result, plan }: { result: MonteCarloResult; plan: PlanInputs }) {
  const height = 220;
  const money = useMoney();
  const x = useAgeScale(plan);
  const years = result.years.filter((year) => year.age >= plan.retirementAge);
  const floor = plan.essentialMonthlySpending * 12;
  const ceiling = plan.spendingStrategy === "flex" || plan.spendingStrategy === "amortise" ? plan.spendingCeilingMonthly * 12 : null;
  const top = Math.max(1, ...years.map((year) => year.spendP90), ceiling ?? 0) * 1.1;
  const y = (value: number) => 8 + (1 - value / top) * (height - 16);
  const toPoints = (points: [number, number][]) => points.map(([age, value]) => `${x(age).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const band = `${toPoints(years.map((year) => [year.age, year.spendP90]))} ${toPoints([...years].reverse().map((year) => [year.age, year.spendP10]))}`;
  const median = toPoints(years.map((year) => [year.age, year.spendMedian]));
  return (
    <div className="fan spending-fan">
      <div className="fan-scale" aria-hidden="true">
        {[1, 0.5].map((level) => <span key={level} style={{ top: `${(1 - level) * 100}%` }}>{money.compact(top * level)}</span>)}
        <span style={{ top: "100%" }}>{money.compact(0)}</span>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none" role="img" aria-label="Annual spending range by age across the simulated futures">
        <line x1={0} x2={WIDTH} y1={y(top * 0.5)} y2={y(top * 0.5)} className="fan-grid" />
        <polygon points={band} className="fan-band" />
        <polyline points={median} className="fan-median" />
        <line x1={x(plan.retirementAge)} x2={WIDTH} y1={y(floor)} y2={y(floor)} className="fan-bound" />
        {ceiling !== null ? <line x1={x(plan.retirementAge)} x2={WIDTH} y1={y(ceiling)} y2={y(ceiling)} className="fan-bound" /> : null}
      </svg>
      <div className="fan-axis" aria-hidden="true">
        <span style={{ left: `${(x(plan.retirementAge) / WIDTH) * 100}%` }}>{plan.retirementAge}</span>
        <span style={{ right: 0 }}>{plan.planToAge}</span>
      </div>
    </div>
  );
}
