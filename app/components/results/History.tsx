"use client";

import { HISTORY, HISTORY_SOURCE, MONTE_CARLO_PATHS, type BacktestResult, type PlanInputs } from "../../../lib/planner";
import { Info } from "../Info";
import { useMoney } from "../money";

/** The plan run against every historical retirement start: a different kind of evidence from the Monte Carlo. */
export function History({ plan, result }: { plan: PlanInputs; result: BacktestResult }) {
  const money = useMoney();
  const top = Math.max(1, ...result.windows.map((window) => window.endingBalance));
  const failures = result.windows.filter((window) => !window.passes).sort((left, right) => (left.firstShortfall ?? 999) - (right.firstShortfall ?? 999));
  const flexible = plan.spendingStrategy !== "fixed";
  const lean = [...result.windows].sort((left, right) => left.lowestSpending - right.lowestSpending).slice(0, 5);
  const mean = (key: "stocks" | "bonds" | "inflation") => HISTORY.reduce((sum, year) => sum + year[key], 0) / HISTORY.length;
  const richer = mean("stocks") - plan.portfolio.stockReturnPercent;
  return (
    <div className="tab-body history">
      <div className="figures">
        <div className={`stat ${result.survivalRate >= 95 ? "good" : "warn"}`}><span className="stat-label">Historical starts survived<Info title="Historical starts"><span>Instead of invented futures, this replays real history: it pretends you stopped work in 1929, then 1930, and so on, and feeds the plan the actual returns and inflation that followed each year. One bar per starting year.</span><em>Example: “retire in 1966” is the classic worst case — a flat decade followed by 1970s inflation.</em></Info></span><strong className="stat-value">{Math.round(result.survivalRate)}%</strong><span className="stat-note">{result.windows.filter((window) => window.passes).length} of {result.windows.length} retirement years since 1928</span></div>
        <div className="stat"><span className="stat-label">Worst start</span><strong className="stat-value">{result.worst ? result.worst.startYear : "—"}</strong><span className="stat-note">{result.worst ? (result.worst.passes ? `${money.compact(result.worst.endingBalance)} left` : `ran short at ${result.worst.firstShortfall}`) : ""}</span></div>
        <div className="stat"><span className="stat-label">Best start</span><strong className="stat-value">{result.best ? result.best.startYear : "—"}</strong><span className="stat-note">{result.best ? `${money.compact(result.best.endingBalance)} left at ${plan.planToAge}` : ""}</span></div>
      </div>

      <p className={`note history-caveat ${richer > 1 ? "warn" : ""}`}>
        <strong>Read this against your assumptions.</strong> Over 1928–2024 US stocks returned {mean("stocks").toFixed(1)}% a year, bonds {mean("bonds").toFixed(1)}%, inflation {mean("inflation").toFixed(1)}%. Your plan assumes {plan.portfolio.stockReturnPercent}% stocks, {plan.portfolio.bondReturnPercent}% bonds, {plan.portfolio.inflationPercent}% inflation.
        {richer > 1 ? ` History was ${richer.toFixed(1)} points a year more generous to stocks than your plan, so it will look safer here than in the simulated futures — the past is not a promise.` : ""}
      </p>
      <div className="history-chart" role="img" aria-label="Ending balance for each historical retirement start year">
        {result.windows.map((window) => (
          <div key={window.startYear} className={`history-bar ${window.passes ? "pass" : "fail"} ${window.complete ? "" : "partial"}`} title={`${window.startYear}: ${window.passes ? `${money.compact(window.endingBalance)} left` : `ran short at ${window.firstShortfall}`}${window.complete ? "" : ` · ${window.historicalYears} historical years, then central assumptions`}`}>
            <i style={{ height: `${window.passes ? Math.max(3, (window.endingBalance / top) * 100) : 3}%` }} />
          </div>
        ))}
      </div>
      <div className="history-axis"><span>1928</span><span>1950</span><span>1975</span><span>2000</span><span>{result.windows.at(-1)?.startYear}</span></div>
      <div className="fan-legend">
        <span><i className="key band" />Money left at {plan.planToAge}</span>
        <span><i className="key fail" />Ran short</span>
        <span><i className="key partial" />Fewer than {plan.planToAge - plan.retirementAge + 1} years of history, then central assumptions</span>
      </div>

      <div className="history-lists">
        <section>
          <h5>{failures.length === 0 ? "No historical start ran short" : `Starts that ran short (${failures.length})`}</h5>
          {failures.slice(0, 8).map((window) => <div className="line" key={window.startYear}><span>Retire in {window.startYear}</span><b>short at {window.firstShortfall}</b></div>)}
          {failures.length > 8 ? <p className="note">and {failures.length - 8} more.</p> : null}
        </section>
        {flexible ? (
          <section>
            <h5>Leanest years the rule produced</h5>
            {lean.map((window) => <div className="line" key={window.startYear}><span>Retire in {window.startYear}<small>{window.yearsAtFloor > 0 ? `${window.yearsAtFloor} years at the floor` : "never at the floor"}</small></span><b>{money.format(Math.round(window.lowestSpending / 12))}/mo</b></div>)}
          </section>
        ) : null}
      </div>
      <p className="note">Each bar retires you in that year and feeds the plan the actual returns and inflation that followed, year by year, from the year you stop work. Years before retirement and any years beyond the data use the central assumptions. {HISTORY_SOURCE}. Used as a proxy for every country. History is one sample, not a probability: it complements the {MONTE_CARLO_PATHS.toLocaleString("en-GB")} simulated futures rather than replacing them.</p>
    </div>
  );
}
