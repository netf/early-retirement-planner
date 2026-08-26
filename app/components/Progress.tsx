"use client";

import { captureBaseline, checkInNow, totalCurrentInvestments, trackProgress, type CheckIn, type PlanInputs, type Progress as ProgressData } from "../../lib/planner";
import type { Analysis } from "../analysis/analyse";
import { Info } from "./Info";
import { useMoney } from "./money";

const WIDTH = 1000;
const HEIGHT = 150;

const ordinal = (value: number) => { const n = Math.round(value); const mod = n % 100; const suffix = mod >= 11 && mod <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th"); return `${n}${suffix}`; };
const formatDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * The plan versus reality. Without a baseline: an invitation to set one. With one: where today's pot sits in the
 * distribution the plan expected by now, confidence then and now, the return the pot implies, and every check-in.
 */
export function Progress({ plan, result, today, onChange }: { plan: PlanInputs; result: Analysis | null; today: number | null; onChange: (plan: PlanInputs) => void }) {
  const money = useMoney();
  const baseline = plan.baseline;
  const todayIso = today === null ? null : new Date(today).toISOString().slice(0, 10);

  if (!baseline) {
    return (
      <section className="track card track-empty" aria-label="Track this plan">
        <div>
          <strong>Track this plan against what actually happens<Info title="Baseline"><span>Set a baseline and the planner freezes today’s forecast: the range it expects your pot to be in at every future age. Each time you enter real balances, it shows whether you are ahead of or behind that plan — which is a different question from whether the plan still works from here.</span><em>Example: two years on, “62nd percentile · £22k ahead of the median” means markets have been a little kinder than the plan assumed. Set it when the plan is the plan, and re-set it only on purpose.</em></Info></strong>
          <p className="note">Freeze today’s forecast, then update your balances each year to see how you are doing against it.</p>
        </div>
        <button type="button" className="button primary" disabled={!result || todayIso === null} onClick={() => { if (result && todayIso) onChange({ ...plan, baseline: captureBaseline(plan, result.monteCarlo, result.projection, todayIso), checkIns: [] }); }}>Set baseline</button>
      </section>
    );
  }

  const now = todayIso ? trackProgress(plan, baseline, totalCurrentInvestments(plan), todayIso) : null;
  const logged = plan.checkIns.map((checkIn) => ({ checkIn, progress: trackProgress(plan, baseline, checkIn.total, checkIn.date) })).filter((item): item is { checkIn: CheckIn; progress: ProgressData } => item.progress !== null);
  const tooEarly = now !== null && now.elapsedYears < 0.5;
  const daysSince = now === null ? 0 : Math.round(now.elapsedYears * 365.25);

  // The chart shows the first stretch after the baseline so the early years — where the dots are — stay readable.
  const horizon = Math.min(plan.planToAge, baseline.age + Math.max(10, Math.ceil(now?.elapsedYears ?? 0) + 5));
  const years = baseline.years.filter((year) => year.age <= horizon);
  const top = Math.max(1, ...years.map((year) => year.p90), now?.actualReal ?? 0, ...logged.map((item) => item.progress.actualReal)) * 1.05;
  const x = (age: number) => ((age - baseline.age) / Math.max(1, horizon - baseline.age)) * WIDTH;
  const y = (value: number) => 6 + (1 - value / top) * (HEIGHT - 12);
  const pts = (list: [number, number][]) => list.map(([age, value]) => `${x(age).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const band = (upper: "p90" | "p75", lower: "p10" | "p25") => `${pts(years.map((year) => [year.age, year[upper]]))} ${pts([...years].reverse().map((year) => [year.age, year[lower]]))}`;
  const dot = (progress: ProgressData) => ({ left: `${(x(progress.age) / WIDTH) * 100}%`, top: `${(y(progress.actualReal) / HEIGHT) * 100}%` });

  const checkInToday = () => { if (todayIso) onChange({ ...plan, checkIns: [...plan.checkIns.filter((item) => item.date !== todayIso), checkInNow(plan, todayIso)] }); };
  const rebaseline = () => { if (result && todayIso && window.confirm("Replace the baseline with today’s forecast? Only do this when the plan itself has changed — a bad year is not a reason. Logged check-ins are cleared.")) onChange({ ...plan, baseline: captureBaseline(plan, result.monteCarlo, result.projection, todayIso), checkIns: [] }); };
  const stop = () => { if (window.confirm("Stop tracking? The baseline and the check-ins are removed from this plan.")) onChange({ ...plan, baseline: null, checkIns: [] }); };

  return (
    <section className="track card" aria-label="Progress against the plan">
      <div className="track-head">
        <strong>Tracking the plan you set on {formatDate(baseline.setAt)}, age {baseline.age}<Info title="Progress"><span>The band is what that plan expected your pot to be at each age — the middle half dark, 9 in 10 light — in the money of the day it was set. Dots are your real balances, restated in that money using the plan’s inflation assumption. The percentile says how many of the plan’s futures you are ahead of.</span><em>Example: a dot at the 30th percentile after a rough market is normal and no reason to change the plan; three years drifting lower is a reason to look at spending.</em></Info></strong>
        <div className="track-actions">
          <button type="button" className="button" onClick={checkInToday} disabled={todayIso === null}>Check in with today’s balances</button>
          <button type="button" className="add" onClick={rebaseline} disabled={!result}>Re-baseline</button>
          <button type="button" className="add" onClick={stop}>Stop tracking</button>
        </div>
      </div>
      <div className="track-body">
        <div className="track-chart" role="img" aria-label={`Expected pot from age ${baseline.age} to ${horizon} with your real balances marked`}>
          <div className="track-plot">
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
              <polygon points={band("p90", "p10")} className="fan-band outer" />
              <polygon points={band("p75", "p25")} className="fan-band core" />
              <polyline points={pts(years.map((year) => [year.age, year.median]))} className="fan-median" />
            </svg>
            {logged.map(({ checkIn, progress }) => <i key={checkIn.id} className="track-dot" style={dot(progress)} title={`${formatDate(checkIn.date)}: ${money.compact(checkIn.total)}`} />)}
            {now ? <i className="track-dot now" style={dot(now)} title={`Today: ${money.compact(totalCurrentInvestments(plan))}`} /> : null}
          </div>
          <div className="track-axis"><span>{baseline.age}</span><span>{horizon}</span></div>
        </div>
        <div className="track-stats">
          <div className="stat">
            <span className="stat-label">Where you are</span>
            {now === null ? <strong className="stat-value">—</strong> : tooEarly
              ? <><strong className="stat-value">Set {daysSince === 0 ? "today" : `${daysSince} days ago`}</strong><span className="stat-note">Meaningful after the first year · pot {money.compact(now.actualReal)} vs {money.compact(now.expected.median)} expected</span></>
              : <><strong className="stat-value">{ordinal(now.percentile)} percentile</strong><span className="stat-note">{money.compact(now.actualReal)} vs {money.compact(now.expected.median)} the plan’s median · {now.gapToMedian >= 0 ? "+" : "−"}{money.compact(Math.abs(now.gapToMedian))}</span></>}
          </div>
          <div className="stat">
            <span className="stat-label">Confidence</span>
            <strong className="stat-value">{Math.round(baseline.successRate)}%<small> → {result ? `${Math.round(result.monteCarlo.successRate)}%` : "…"}</small></strong>
            <span className="stat-note">When set → from today’s balances</span>
          </div>
          <div className="stat">
            <span className="stat-label">Realised return</span>
            <strong className="stat-value">{now === null || now.realisedNominalReturn === null ? "—" : <>{now.realisedNominalReturn.toFixed(1)}%<small> /yr</small></>}</strong>
            <span className="stat-note">{now === null || now.realisedNominalReturn === null ? "Needs at least a quarter of a year" : `vs ${now.assumedNominalReturn.toFixed(1)}% assumed · ${now.elapsedYears.toFixed(1)} years${now.elapsedYears < 5 ? " — too short to judge" : ""}`}</span>
          </div>
        </div>
      </div>
      {logged.length > 0 ? (
        <table className="track-log" aria-label="Check-ins">
          <thead><tr><th>Check-in</th><th>Age</th><th>Pot</th><th>Percentile</th><th /></tr></thead>
          <tbody>
            {[...logged].reverse().map(({ checkIn, progress }) => (
              <tr key={checkIn.id}>
                <td>{formatDate(checkIn.date)}</td>
                <td>{progress.age.toFixed(1)}</td>
                <td>{money.plain(checkIn.total)}</td>
                <td>{progress.elapsedYears < 0.5 ? "—" : ordinal(progress.percentile)}</td>
                <td><button type="button" className="x" aria-label={`Remove check-in ${formatDate(checkIn.date)}`} onClick={() => onChange({ ...plan, checkIns: plan.checkIns.filter((item) => item.id !== checkIn.id) })}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="note">No check-ins logged yet. Update your balances, then “Check in” to keep a dated point on the chart.</p>}
    </section>
  );
}
