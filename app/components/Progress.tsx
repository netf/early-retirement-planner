"use client";

import { captureBaseline, checkInNow, hasUnsavedData, totalCurrentInvestments, trackProgress, type CheckIn, type PlanInputs, type Progress as ProgressData } from "../../lib/planner";
import type { Analysis } from "../analysis/analyse";
import { Info } from "./Info";
import { useMoney } from "./money";

const WIDTH = 1000;
const HEIGHT = 170;

const ordinal = (value: number) => { const n = Math.round(value); const mod = n % 100; const suffix = mod >= 11 && mod <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th"); return `${n}${suffix}`; };
const formatDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const formatDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

type Standing = "ahead" | "on" | "behind";
const standingOf = (percentile: number): Standing => percentile >= 60 ? "ahead" : percentile >= 40 ? "on" : "behind";
const STANDING_WORD: Record<Standing, string> = { ahead: "Ahead of plan", on: "On plan", behind: "Behind plan" };

/**
 * The plan versus reality, answered at a glance: a verdict word, a gauge of where today's pot sits in the
 * range the plan expected by now, two supporting facts, and — once there is history — the trend.
 */
export function Progress({ plan, result, today, onChange, onCopyLink, onExport, linkState }: { plan: PlanInputs; result: Analysis | null; today: number | null; onChange: (plan: PlanInputs) => void; onCopyLink: () => void; onExport: () => void; linkState: "idle" | "copied" | "failed" }) {
  const money = useMoney();
  const baseline = plan.baseline;
  const todayIso = today === null ? null : new Date(today).toISOString().slice(0, 10);

  if (!baseline) {
    return (
      <section className="track card track-empty" aria-label="Track this plan">
        <div>
          <strong>Track this plan against what actually happens<Info title="Baseline"><span>Set a baseline and the planner freezes today’s forecast: the range it expects your pot to be in at every future age. Each time you enter real balances, it shows whether you are ahead of or behind that plan — which is a different question from whether the plan still works from here.</span><em>Example: two years on, “Ahead of plan · 62nd percentile” means markets have been a little kinder than the plan assumed. Set it when the plan is the plan, and re-set it only on purpose.</em></Info></strong>
          <p className="note">Freeze today’s forecast, then update your balances each year to see how you are doing against it.</p>
        </div>
        <button type="button" className="button primary" disabled={!result || todayIso === null} onClick={() => { if (result && todayIso) onChange({ ...plan, baseline: captureBaseline(plan, result.monteCarlo, result.projection, todayIso), checkIns: [], changedAt: new Date().toISOString() }); }}>Set baseline</button>
      </section>
    );
  }

  const potNow = totalCurrentInvestments(plan);
  const now = todayIso ? trackProgress(plan, baseline, potNow, todayIso) : null;
  const logged = plan.checkIns.map((checkIn) => ({ checkIn, progress: trackProgress(plan, baseline, checkIn.total, checkIn.date) })).filter((item): item is { checkIn: CheckIn; progress: ProgressData } => item.progress !== null);
  const early = now === null || now.elapsedYears < 0.5;
  const daysSince = now === null ? 0 : Math.round(now.elapsedYears * 365.25);
  const standing: Standing | null = now && !early ? standingOf(now.percentile) : null;

  // Gauge: the expected range at this age, poor to strong, with today's pot marked on it.
  const gauge = now ? (() => {
    const { p10, p25, p75, p90, median } = now.expected;
    const pad = Math.max(1, (p90 - p10) * 0.3);
    const low = Math.max(0, p10 - pad);
    const high = p90 + pad;
    const at = (value: number) => `${(Math.min(Math.max(value, low), high) - low) / (high - low) * 100}%`;
    return { low, high, at, p10, p25, p75, p90, median };
  })() : null;

  // Trend: the baseline fan over the first stretch after it was set, with every check-in and today marked.
  const horizon = Math.min(plan.planToAge, baseline.age + Math.max(8, Math.ceil(now?.elapsedYears ?? 0) + 4));
  const years = baseline.years.filter((year) => year.age <= horizon);
  const top = Math.max(1, ...years.map((year) => year.p90), now?.actualReal ?? 0, ...logged.map((item) => item.progress.actualReal)) * 1.04;
  const x = (age: number) => ((age - baseline.age) / Math.max(1, horizon - baseline.age)) * WIDTH;
  const y = (value: number) => 6 + (1 - value / top) * (HEIGHT - 12);
  const pts = (list: [number, number][]) => list.map(([age, value]) => `${x(age).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const band = (upper: "p90" | "p75", lower: "p10" | "p25") => `${pts(years.map((year) => [year.age, year[upper]]))} ${pts([...years].reverse().map((year) => [year.age, year[lower]]))}`;
  const dot = (progress: ProgressData) => ({ left: `${(x(progress.age) / WIDTH) * 100}%`, top: `${(y(progress.actualReal) / HEIGHT) * 100}%` });
  const trail = [...logged.map((item) => item.progress), ...(now ? [now] : [])].sort((left, right) => left.age - right.age);

  const checkInToday = () => { if (todayIso) onChange({ ...plan, checkIns: [...plan.checkIns.filter((item) => item.date !== todayIso), checkInNow(plan, todayIso)], changedAt: new Date().toISOString() }); };
  const rebaseline = () => { if (result && todayIso && window.confirm("Replace the baseline with today’s forecast? Only do this when the plan itself has changed — a bad year is not a reason. Logged check-ins are cleared.")) onChange({ ...plan, baseline: captureBaseline(plan, result.monteCarlo, result.projection, todayIso), checkIns: [], changedAt: new Date().toISOString() }); };
  const stop = () => { if (window.confirm("Stop tracking? The baseline and the check-ins are removed from this plan.")) onChange({ ...plan, baseline: null, checkIns: [] }); };
  const loggedToday = todayIso !== null && plan.checkIns.some((item) => item.date === todayIso);

  return (
    <section className={`track card ${standing ?? "early"}`} aria-label="Progress against the plan">
      <div className="track-head">
        <span className="label">Against the plan you set in {formatDate(baseline.setAt)}, age {baseline.age}<Info title="Progress"><span>The gauge is the range that plan expected your pot to be in by now — poor to strong, the middle half darker — in the money of the day it was set. Your pot is restated in that money using the plan’s inflation assumption. “Ahead” means above the 60th percentile of the plan’s futures, “Behind” below the 40th.</span><em>Example: “Behind plan” after one rough year is normal and no reason to change anything; three years drifting lower is a reason to look at spending.</em></Info></span>
        <button type="button" className="button" onClick={checkInToday} disabled={todayIso === null || loggedToday}>{loggedToday ? "Checked in today" : "Check in"}</button>
      </div>

      {now === null ? null : early ? (
        <div className="track-verdict">
          <strong className="track-word">Baseline set {daysSince === 0 ? "today" : `${daysSince} days ago`}</strong>
          <p>Come back with real balances after the first year — that is when a comparison starts to mean something. Right now the pot is {money.compact(now.actualReal)} against {money.compact(now.expected.median)} expected.</p>
        </div>
      ) : (
        <div className="track-verdict">
          <strong className={`track-word ${standing}`}>{STANDING_WORD[standing!]}</strong>
          <p className="track-where">{money.compact(now.actualReal)} today against {money.compact(now.expected.median)} the plan expected by now — <b>{ordinal(now.percentile)} percentile</b>, {now.gapToMedian >= 0 ? "+" : "−"}{money.compact(Math.abs(now.gapToMedian))} from the median.</p>
        </div>
      )}

      {gauge && now && !early ? (
        <div className="gauge" role="img" aria-label={`Your pot sits at the ${ordinal(now.percentile)} percentile of the range the plan expected by now`}>
          <div className="gauge-track">
            <span className="gauge-band outer" style={{ left: gauge.at(gauge.p10), width: `calc(${gauge.at(gauge.p90)} - ${gauge.at(gauge.p10)})` }} />
            <span className="gauge-band core" style={{ left: gauge.at(gauge.p25), width: `calc(${gauge.at(gauge.p75)} - ${gauge.at(gauge.p25)})` }} />
            <span className="gauge-median" style={{ left: gauge.at(gauge.median) }} />
            <span className={`gauge-you ${standing}`} style={{ left: gauge.at(now.actualReal) }}><b>You</b></span>
          </div>
          <div className="gauge-labels">
            <span style={{ left: gauge.at(gauge.p10) }}>poor · {money.compact(gauge.p10)}</span>
            <span className="mid" style={{ left: gauge.at(gauge.median) }}>median · {money.compact(gauge.median)}</span>
            <span className="end" style={{ left: gauge.at(gauge.p90) }}>strong · {money.compact(gauge.p90)}</span>
          </div>
        </div>
      ) : null}

      {now ? (
        <dl className="track-facts">
          <div><dt>Confidence</dt><dd>{Math.round(baseline.successRate)}% <i>→</i> {result ? `${Math.round(result.monteCarlo.successRate)}%` : "…"}<small>when set → from today’s balances</small></dd></div>
          <div><dt>Return so far</dt><dd>{now.realisedNominalReturn === null ? "—" : `${now.realisedNominalReturn.toFixed(1)}% a year`}<small>{now.realisedNominalReturn === null ? "needs a few months" : `vs ${now.assumedNominalReturn.toFixed(1)}% assumed · ${now.elapsedYears.toFixed(1)} years${now.elapsedYears < 5 ? " — early days" : ""}`}</small></dd></div>
          <div><dt>Check-ins</dt><dd>{logged.length}<small>{logged.length === 0 ? "log one each year to build the trend" : `last ${formatDay(logged.at(-1)!.checkIn.date)}`}</small></dd></div>
        </dl>
      ) : null}

      {logged.length > 0 ? (
        <div className="track-trend">
          <div className="track-chart" role="img" aria-label={`Expected pot from age ${baseline.age} to ${horizon} with your balances marked`}>
            <div className="track-plot">
              <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
                <polygon points={band("p90", "p10")} className="fan-band outer" />
                <polygon points={band("p75", "p25")} className="fan-band core" />
                <polyline points={pts(years.map((year) => [year.age, year.median]))} className="fan-median" />
                {trail.length > 1 ? <polyline points={pts(trail.map((item) => [item.age, item.actualReal]))} className="track-trail" /> : null}
              </svg>
              {logged.map(({ checkIn, progress }) => <i key={checkIn.id} className="track-dot" style={dot(progress)} title={`${formatDay(checkIn.date)}: ${money.compact(checkIn.total)}`} />)}
              {now ? <i className="track-dot now" style={dot(now)} title={`Today: ${money.compact(potNow)}`} /> : null}
            </div>
            <div className="track-axis"><span>{baseline.age}</span><span>{horizon}</span></div>
          </div>
          <ul className="track-log" aria-label="Check-ins">
            {[...logged].reverse().map(({ checkIn, progress }) => (
              <li key={checkIn.id}>
                <span>{formatDay(checkIn.date)}</span>
                <span className="mono">{money.plain(checkIn.total)}</span>
                <span className={`track-pill ${progress.elapsedYears < 0.5 ? "" : standingOf(progress.percentile)}`}>{progress.elapsedYears < 0.5 ? "baseline year" : `${ordinal(progress.percentile)} · ${STANDING_WORD[standingOf(progress.percentile)].replace(" of plan", "").replace(" plan", "").toLowerCase()}`}</span>
                <button type="button" className="x" aria-label={`Remove check-in ${formatDay(checkIn.date)}`} onClick={() => onChange({ ...plan, checkIns: plan.checkIns.filter((item) => item.id !== checkIn.id) })}>×</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <SaveNudge plan={plan} onCopyLink={onCopyLink} onExport={onExport} linkState={linkState} />

      <div className="track-foot">
        <button type="button" className="add" onClick={rebaseline} disabled={!result}>Re-baseline</button>
        <button type="button" className="add" onClick={stop}>Stop tracking</button>
      </div>
    </section>
  );
}

/**
 * The plan lives only in this browser until a copy leaves it. Once there is a baseline the data is
 * irreplaceable, so the card asks for a save whenever something worth keeping has happened since the last one.
 */
function SaveNudge({ plan, onCopyLink, onExport, linkState }: { plan: PlanInputs; onCopyLink: () => void; onExport: () => void; linkState: "idle" | "copied" | "failed" }) {
  const unsaved = hasUnsavedData(plan);
  const savedOn = plan.savedAt ? formatDay(plan.savedAt.slice(0, 10)) : null;
  return (
    <div className={`save-nudge ${unsaved ? "due" : "ok"}`} role="status">
      <div>
        <strong>{unsaved ? (savedOn ? `Not saved since ${savedOn} — there is newer data here` : "Save this plan — it lives only in this browser") : `Saved ${savedOn}`}</strong>
        <p>{linkState === "copied" ? "Link copied. Paste it into your password manager as a secure note — that copy survives new laptops and browsers." : linkState === "failed" ? "Could not reach the clipboard — download the file instead." : "Keep the link as a secure note in your password manager, or download the file. Nothing is stored anywhere else."}</p>
      </div>
      <div className="save-actions">
        <button type="button" className={`button ${unsaved ? "primary" : ""}`} onClick={onCopyLink}>Copy link</button>
        <button type="button" className="button" onClick={onExport}>Download file</button>
      </div>
    </div>
  );
}
