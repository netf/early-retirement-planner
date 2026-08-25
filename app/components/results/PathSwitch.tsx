"use client";

import type { MonteCarloResult, PlanInputs } from "../../../lib/planner";
import type { PathKey } from "../../analysis/analyse";
import { useMoney } from "../money";

/** Which single future the year-by-year tables show. */
export function PathSwitch({ value, onChange, monteCarlo, plan }: { value: PathKey; onChange: (key: PathKey) => void; monteCarlo: MonteCarloResult; plan: PlanInputs }) {
  const money = useMoney();
  const options: { key: PathKey; label: string; note: string }[] = [
    { key: "central", label: "Central assumptions", note: "average return every year" },
    { key: "typical", label: "Typical future", note: `median · ${money.compact(monteCarlo.medianEnding)} at ${plan.planToAge}` },
    { key: "poor", label: "Poor future", note: `1 in 10 · ${money.compact(monteCarlo.p10Ending)} at ${plan.planToAge}` },
  ];
  return (
    <div className="path-switch">
      <div className="switch" role="group" aria-label="Which future to show">
        {options.map((option) => <button type="button" key={option.key} className={value === option.key ? "on" : ""} aria-pressed={value === option.key} onClick={() => onChange(option.key)}><span>{option.label}</span><small>{option.note}</small></button>)}
      </div>
      <p className="note">
        {value === "central"
          ? `One specific future in which every year returns exactly the average. It is not the typical outcome: volatility drags the typical future below it, which is why this path can succeed while ${Math.round(100 - monteCarlo.successRate)}% of simulated futures fail.`
          : value === "typical"
            ? "One of the 1,000 simulated futures — the one that ends closest to the median. Year-to-year returns are realistic, not smooth."
            : "One of the 1,000 simulated futures — the one that ends closest to the 10th percentile. This is what a bad sequence looks like year by year."}
      </p>
    </div>
  );
}
