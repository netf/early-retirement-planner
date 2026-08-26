"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LEGACY_STORAGE_KEYS,
  MONTE_CARLO_PATHS,
  PROFILES,
  STORAGE_KEY,
  createDefaultPlan,
  decodePlanLink,
  encodePlanLink,
  looksLikePlan,
  normalisePlan,
  planChecks,
  profileOf,
  switchProfile,
  type GoalMetrics,
  type PlanInputs,
  type ProfileId,
  type UnfundedPurchase,
} from "../lib/planner";
import type { PathKey } from "./analysis/analyse";
import { useAnalysis } from "./analysis/use-analysis";
import { AgeRuler } from "./components/charts";
import { Info } from "./components/Info";
import { PlanInputsPanel } from "./components/inputs";
import { CountryPicker } from "./components/CountryPicker";
import { Progress } from "./components/Progress";
import { Welcome } from "./components/Welcome";
import { MoneyProvider, useMoney } from "./components/money";
import { YearByYear } from "./components/results/Years";
import { History } from "./components/results/History";
import { ThisYear } from "./components/results/ThisYear";
import { Method } from "./components/results/Method";
import { Outcomes } from "./components/results/Outcomes";
import { PathSwitch } from "./components/results/PathSwitch";
import { Stat } from "./components/results/Stat";
import { StressTests } from "./components/results/StressTests";

type Tab = "chart" | "years" | "stress" | "history" | "method";
const TABS: [Tab, string][] = [["chart", "Outcomes"], ["years", "Year by year"], ["stress", "Stress tests"], ["history", "History"], ["method", "Method"]];

function loadStoredPlan(): PlanInputs | null {
  for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
    const stored = window.localStorage.getItem(key);
    if (stored) return normalisePlan(JSON.parse(stored) as unknown);
  }
  return null;
}

export default function Home() {
  const [plan, setPlan] = useState<PlanInputs>(() => createDefaultPlan("uk"));
  const [tab, setTab] = useState<Tab>("chart");
  const [pathKey, setPathKey] = useState<PathKey>("central");
  const [hydrated, setHydrated] = useState(false);
  const [saved, setSaved] = useState(false);
  const [linkState, setLinkState] = useState<"idle" | "copied" | "failed">("idle");
  const [notice, setNotice] = useState<string | null>(null);
  // First visit on this device with no plan in the address: offer the six-number start instead of the example.
  const [firstRun, setFirstRun] = useState(false);
  // Today's date is captured when the stored plan loads, so rendering stays pure and deterministic.
  const [today, setToday] = useState<number | null>(null);

  const { result, pending } = useAnalysis(hydrated && !firstRun ? plan : null);

  useEffect(() => {
    let cancelled = false;
    const loadSafely = (): PlanInputs | null => {
      try { return loadStoredPlan(); } catch { window.localStorage.removeItem(STORAGE_KEY); return null; }
    };
    const finish = (loaded: PlanInputs | null, fromLink: boolean) => {
      if (cancelled) return;
      if (loaded) setPlan(loaded);
      setFirstRun(loaded === null);
      setToday(Date.now());
      setHydrated(true);
      // The link has done its job; leave a clean address so edits are not mistaken for the shared version.
      if (fromLink) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    };
    const timer = window.setTimeout(() => {
      const fragment = window.location.hash;
      if (fragment.startsWith("#plan=")) {
        decodePlanLink(fragment).then((linked) => {
          if (linked) { finish(linked, true); return; }
          setNotice("That link did not contain a readable plan, so your own plan is shown instead.");
          finish(loadSafely(), true);
        });
        return;
      }
      finish(loadSafely(), false);
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!hydrated || firstRun) return;
    let hideTimer: number | undefined;
    const saveTimer = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
      setSaved(true);
      hideTimer = window.setTimeout(() => setSaved(false), 1_600);
    }, 450);
    return () => { window.clearTimeout(saveTimer); if (hideTimer !== undefined) window.clearTimeout(hideTimer); };
  }, [plan, hydrated, firstRun]);

  const profile = profileOf(plan);
  const checks = useMemo(() => {
    const list = planChecks(plan, result?.monteCarlo, result?.projection);
    if (plan.balancesAsOf && today !== null) {
      const months = Math.floor((today - Date.parse(plan.balancesAsOf)) / (30.44 * 24 * 3600 * 1000));
      if (months >= 11) list.unshift({ level: "warn", text: `Balances were last entered ${months} months ago (${plan.balancesAsOf}). Update them${plan.spendingStrategy !== "fixed" && plan.currentAge >= plan.retirementAge ? ", then read this year’s decision under Outcomes" : ""}.` });
    }
    return list;
  }, [plan, result, today]);

  const exportPlan = useCallback(() => {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), modelVersion: 3, plan }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "retirement-plan.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }, [plan]);

  const importPlan = useCallback((file: File | undefined) => {
    if (!file) return;
    file.text()
      .then((text) => {
        const parsed: unknown = JSON.parse(text);
        if (!looksLikePlan(parsed)) throw new Error("not a plan");
        const record = parsed as { plan?: unknown };
        setPlan(normalisePlan(record.plan ?? parsed));
        setFirstRun(false);
      })
      .catch(() => window.alert(`“${file.name}” is not a plan exported from here. Export writes a .json file whose contents start with {"exportedAt"…`));
  }, []);

  const copyLink = useCallback(() => {
    encodePlanLink(plan)
      .then((fragment) => navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#${fragment}`))
      .then(() => setLinkState("copied"))
      .catch(() => setLinkState("failed"))
      .finally(() => window.setTimeout(() => setLinkState("idle"), 3_000));
  }, [plan]);

  const changeProfile = useCallback((profileId: ProfileId) => {
    if (profileId === plan.profile) return;
    if (window.confirm(`Switch to ${PROFILES[profileId].label}? Balances and income reset to that country's example; your ages and market assumptions are kept.`)) {
      setPlan((current) => switchProfile(current, profileId));
    }
  }, [plan.profile]);


  return (
    <MoneyProvider profile={profile}>
      <main className="page">
        <header className="masthead">
          <div className="masthead-row">
            <div className="masthead-title">
              <span className="wordmark">Early Retirement Planner</span>
              <CountryPicker value={plan.profile} onChange={changeProfile} compact />
            </div>
            <div className="masthead-actions">
              <span className={`status ${pending ? "busy" : saved || linkState !== "idle" ? "saved" : ""}`} aria-live="polite">{linkState === "copied" ? "Link copied — anyone with it can open this plan" : linkState === "failed" ? "Could not copy — use Export instead" : pending ? "Recalculating" : saved ? "Saved on this device" : "Stored in this browser"}</span>
              <button type="button" className="button" onClick={copyLink} disabled={firstRun}>Copy link</button>
              <label className="button">Import<input type="file" accept="application/json" onChange={(event) => importPlan(event.currentTarget.files?.[0])} /></label>
              <button type="button" className="button" onClick={exportPlan}>Export</button>
              <button type="button" className="button" onClick={() => { if (window.confirm("Reset every input to the example plan?")) setPlan(createDefaultPlan(plan.profile)); }}>Reset</button>
              <a className="button" href="/about">About</a>
            </div>
          </div>
          {notice ? <p className="notice" role="status">{notice} <button type="button" className="add" onClick={() => setNotice(null)}>Dismiss</button></p> : null}
          <p className="masthead-tag">{profile.label} · tax {profile.taxYear} · all figures in today’s money · a planning tool, not financial advice · nothing you enter leaves this browser</p>
        </header>

        {firstRun ? <Welcome profileId={plan.profile} onProfile={(id) => setPlan(createDefaultPlan(id))} onBuild={(built) => { setPlan(built); setFirstRun(false); }} onExplore={() => setFirstRun(false)} /> : null}
        {firstRun ? null : <>
        <div className={`headline ${pending && result ? "stale" : ""}`} aria-busy={pending}>
          {result ? <Verdict plan={plan} successRate={result.monteCarlo.successRate} floorRate={result.monteCarlo.floorRate} unfunded={result.projection.unfundedPurchases} /> : <VerdictSkeleton plan={plan} />}
          {result?.goals ? <Answers plan={plan} goals={result.goals} /> : null}
          {result?.goals || plan.baseline ? <Progress plan={plan} result={result} today={today} onChange={setPlan} /> : null}
          {pending && result ? <span className="stale-badge">Recalculating…</span> : null}
        </div>

        <section className="ruler-block card" aria-label="Plan timeline">
          <AgeRuler plan={plan} />
        </section>

        <div className="workspace">
          <aside className="panel inputs-panel card" aria-label="Plan inputs">
            <div className="panel-head">
              <h2>Inputs</h2>
              <span className="block-note">Only what applies is shown</span>
            </div>
            {checks.length > 0 ? (
              <ul className="checks" aria-label="Things to review">
                {checks.map((check) => <li key={check.text} className={check.level}>{check.text}</li>)}
              </ul>
            ) : null}
            <PlanInputsPanel plan={plan} setPlan={setPlan} />
          </aside>

          <section className={`panel results-panel card ${pending ? "pending" : ""}`} aria-label="Analysis" aria-busy={pending}>
            <div className="tabs" role="tablist">
              {TABS.map(([key, label]) => <button type="button" key={key} role="tab" aria-selected={tab === key} className={tab === key ? "on" : ""} onClick={() => setTab(key)}>{label}</button>)}
            </div>
            {!result ? <p className="note calculating">Running {MONTE_CARLO_PATHS} futures…</p> : null}
            {result && tab === "chart" ? <ThisYear plan={plan} projection={result.projection} onChange={setPlan} /> : null}
            {result && tab === "chart" ? <Outcomes plan={plan} projection={result.projection} monteCarlo={result.monteCarlo} bridge={result.bridge} onApply={setPlan} /> : null}
            {result && tab === "years" ? <YearByYear plan={plan} projection={result.paths[pathKey]} header={<PathSwitch value={pathKey} onChange={setPathKey} monteCarlo={result.monteCarlo} plan={plan} />} /> : null}
            {result && tab === "stress" ? <StressTests plan={plan} tests={result.stressTests} /> : null}
            {result?.backtests && tab === "history" ? <History plan={plan} result={result.backtests} /> : null}
            {tab === "method" ? <Method plan={plan} /> : null}
          </section>
        </div>

        </>}

        <footer className="colophon">
          <span>Early Retirement Planner · engine v3 · {profile.label} {profile.taxYear}</span>
          <span>Your figures stay in this browser unless you export or link them. <a href="/about">About, privacy and terms</a></span>
        </footer>
      </main>
    </MoneyProvider>
  );
}


function VerdictSkeleton({ plan }: { plan: PlanInputs }) {
  return (
    <section className="verdict pending" aria-busy="true">
      <div className="verdict-main card">
        <span className="verdict-q">Will the money last to {plan.planToAge}?</span>
        <div className="verdict-row"><strong className="verdict-number">…</strong></div>
        <p className="verdict-copy">Running {MONTE_CARLO_PATHS.toLocaleString("en-GB")} simulated futures of markets and inflation.</p>
      </div>
    </section>
  );
}

function Verdict({ plan, successRate, floorRate, unfunded }: { plan: PlanInputs; successRate: number; floorRate: number; unfunded: UnfundedPurchase[] }) {
  const success = successRate >= plan.targetConfidencePercent;
  const percent = Math.round(successRate);
  const failed = Math.round(MONTE_CARLO_PATHS * (100 - successRate) / 100);
  return (
    <section className={`verdict ${success ? "yes" : "no"}`} aria-live="polite">
      <div className="verdict-main card">
        <span className="verdict-q">Will the money last to {plan.planToAge}?<Info title="Will the money last?"><span>The planner replays your life 1,000 times, each with a different sequence of good and bad market years and inflation, and counts how often the money is still there at the end. This percentage is that count. It is not a promise — it is how many plausible futures work out.</span><em>Example: 86% means 860 of 1,000 futures made it; 140 ran dry first — usually the ones with a crash early on.</em></Info></span>
        <div className="verdict-row">
          <strong className="verdict-number">{percent}<span>%</span></strong>
          <span className="verdict-stamp">{success ? "Yes" : "Not yet"}</span>
        </div>
        <p className="verdict-copy">
          {MONTE_CARLO_PATHS.toLocaleString("en-GB")} simulated futures of markets and inflation. {failed === 0 ? "None ran out of money." : `${failed} ran out of money before ${plan.planToAge}.`}{plan.spendingStrategy === "flex" ? ` Spending flexes with the pot, so the real test is the floor: ${Math.round(floorRate)}% of futures had to drop to it at some point.` : ""}{unfunded.length > 0 ? ` ${unfunded.map((item) => `${item.name} could not be bought at ${item.age}`).join("; ")} — the plan goes on without it.` : ""} Your target is {plan.targetConfidencePercent}% — the three figures below are what would change it.
        </p>
      </div>
    </section>
  );
}

function Answers({ plan, goals }: { plan: PlanInputs; goals: GoalMetrics }) {
  const money = useMoney();
  const profile = profileOf(plan);
  const bridgeName = profile.accounts.find((rule) => rule.id === profile.savingTargets.bridge)?.name ?? "accessible";
  const longTermName = profile.accounts.find((rule) => rule.id === profile.savingTargets.longTerm)?.name ?? "long-term";
  const supported = goals.earliestRetirementAge !== null && goals.earliestRetirementAge <= plan.retirementAge;
  const yearsMore = goals.earliestRetirementAge === null ? null : goals.earliestRetirementAge - plan.retirementAge;
  return (
    <section className="answers" aria-label="Three answers">
      <Stat
        label="Earliest you could stop"
        value={goals.earliestRetirementAge === null ? "Later than 85" : goals.earliestRetirementAge <= plan.currentAge ? "Now" : `Age ${goals.earliestRetirementAge}`}
        note={supported ? `You planned for ${plan.retirementAge} · supported` : `You planned for ${plan.retirementAge} · ${yearsMore === null ? "not reachable by age alone" : `${yearsMore} more ${yearsMore === 1 ? "year" : "years"} of saving`}`}
        tone={supported ? "good" : "warn"}
        info={<Info title="Earliest you could stop"><span>The planner tries every stopping age from now on and reports the first one where the plan clears your confidence target with everything else unchanged.</span><em>Example: “Age 56” with a plan for 50 means six more years of saving and growth are needed before the numbers hold.</em></Info>}
      />
      <Stat
        label={`Extra saving to retire at ${plan.retirementAge}`}
        value={goals.extraMonthlyRequired === null ? "Saving alone won’t do it" : goals.extraMonthlyRequired === 0 ? "Nothing" : money.format(goals.extraMonthlyRequired)}
        unit={goals.extraMonthlyRequired ? "/ mo" : undefined}
        note={goals.extraMonthlyRequired === null ? "Change the age, spending or property plan" : goals.extraMonthlyRequired === 0 ? "Current contributions are enough" : `${bridgeName} +${money.format(goals.recommendedBridgeExtra)} until the bridge years are funded, then ${longTermName} +${money.format(goals.recommendedLongTermExtra)}`}
        tone={goals.extraMonthlyRequired === 0 ? "good" : "warn"}
        info={<Info title="Extra saving needed"><span>The smallest extra monthly amount that would make your chosen stopping age pass. It goes to an accessible account first — enough to cover the years before your pension opens — and the rest to the pension.</span><em>Example: “£300/mo · ISA +£300” means the gap years are the problem, not old age.</em></Info>}
      />
      <Stat
        label={plan.spendingStrategy === "amortise" ? "First-year payment the rule sets" : plan.spendingStrategy === "flex" ? "Starting spending the plan can carry" : "Spending the plan can carry"}
        value={money.format(goals.sustainableMonthlySpending)}
        unit="/ mo"
        note={plan.spendingStrategy === "amortise" ? `Central assumptions · then follows the pot, leaving ${money.format(plan.amortiseTargetAtEnd)} at ${plan.planToAge}` : `At ${plan.targetConfidencePercent}% confidence, against ${money.format(Math.round(plan.desiredMonthlySpending))} asked for${plan.spendingStrategy === "flex" ? " · then flexes with the pot" : ""}`}
        tone={plan.spendingStrategy === "amortise" ? "plain" : goals.sustainableMonthlySpending >= Math.round(plan.desiredMonthlySpending) ? "good" : "plain"}
        info={<Info title="Spending the plan can carry"><span>The highest monthly spending that still clears your confidence target with your current savings and stopping age. Under a flexible rule it is the starting level — the rule then moves it with the pot. Under Spend it down it is simply the rule’s first payment.</span><em>Example: asking for £2,000 but seeing £1,650 means the plan holds at £1,650 — or at £2,000 with a later stop or more saving.</em></Info>}
      />
    </section>
  );
}
