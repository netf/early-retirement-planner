"use client";

import type { PlanInputs, StressTest } from "../../../lib/planner";
import { Info } from "../Info";
import { useMoney } from "../money";

/** Four named bad sequences, each spelled out year by year so the reader knows exactly what was thrown at the plan. */
export function StressTests({ plan, tests }: { plan: PlanInputs; tests: StressTest[] }) {
  const money = useMoney();
  const fromAge = tests[0]?.fromAge ?? plan.retirementAge;
  return (
    <div className="tab-body stress">
      <div className="stress-intro">
        <strong>What is being tested<Info title="Stress tests"><span>The Monte Carlo asks “how often does it work?”. A stress test asks “what if this specific bad thing happens?”. Each one takes the central path — average returns every year — and overwrites the first years after you stop work with one named bad sequence. Your spending rule, taxes, pensions and everything else stay exactly as entered. It is a what-if, not a probability.</span><em>Example: “Early market crash” makes your first retirement year −30% and the second −12%. If the plan still never runs short before {plan.planToAge}, it passes.</em></Info></strong>
        <p className="note">Each test starts at age {fromAge}, the year you stop work, and replaces those years of the central path with the sequence shown. Everything after runs on your central assumptions. <b>Pass</b> means the money never runs short before {plan.planToAge}; the figure shows what is left, against the central path.</p>
      </div>
      {tests.map((test) => (
        <article key={test.key} className={test.passes ? "pass" : "fail"}>
          <span className="stress-result">{test.passes ? "Pass" : "Fail"}</span>
          <h4>{test.label}</h4>
          <p>{test.mimics}</p>
          <ul className="stress-seq" aria-label="Sequence applied">
            {test.sequence.map((step) => <li key={step.from}><b>{step.from === step.to ? `Age ${test.fromAge + step.from - 1}` : `Ages ${test.fromAge + step.from - 1}–${test.fromAge + step.to - 1}`}</b>{step.text}</li>)}
            <li className="after"><b>Then</b>central assumptions</li>
          </ul>
          {test.passes
            ? <strong>{money.compact(test.endingBalance)} left at {plan.planToAge}<small>vs {money.compact(test.centralEnding)} on the central path</small></strong>
            : <strong>Runs short at {test.firstShortfall}<small>{plan.planToAge - (test.firstShortfall ?? plan.planToAge)} {plan.planToAge - (test.firstShortfall ?? plan.planToAge) === 1 ? "year" : "years"} before {plan.planToAge} · central path leaves {money.compact(test.centralEnding)}</small></strong>}
        </article>
      ))}
    </div>
  );
}
