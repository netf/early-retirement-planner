"use client";

import type { PlanInputs } from "../../../lib/planner";
import { NumberField } from "../fields";
import { Info } from "../Info";
import { Block } from "./Block";
import type { PlanUpdaters } from "./use-plan";

export function Timeline({ plan, updaters }: { plan: PlanInputs; updaters: PlanUpdaters }) {
  const setAges = (patch: Partial<Pick<PlanInputs, "currentAge" | "retirementAge" | "planToAge">>) => {
    updaters.setPlan((current) => {
      const currentAge = patch.currentAge ?? current.currentAge;
      const retirementAge = patch.retirementAge ?? current.retirementAge;
      const planToAge = Math.max(Math.max(retirementAge, currentAge) + 1, patch.planToAge ?? current.planToAge);
      return { ...current, currentAge, retirementAge, planToAge };
    });
  };
  return (
    <Block title="Timeline" note="Ages" info={<Info title="Timeline"><span>Three ages frame the whole plan: how old you are, when you stop earning, and how long the money must last. Plan longer than you expect to live — running out at 90 is a disaster, dying at 90 with money left is not.</span><em>Example: age 40, stop at 50, plan to 95 means 10 years of saving and 45 years of spending.</em></Info>}>
      <div className="grid three">
        <NumberField label="Age now" value={plan.currentAge} min={18} max={plan.planToAge - 1} onChange={(value) => setAges({ currentAge: value })} />
        <NumberField label="Stop work at" value={plan.retirementAge} min={18} max={85} onChange={(value) => setAges({ retirementAge: value })} hint={plan.retirementAge < plan.currentAge ? "Already retired" : undefined} />
        <NumberField label="Plan to age" value={plan.planToAge} min={Math.max(plan.retirementAge, plan.currentAge) + 1} max={110} onChange={(value) => setAges({ planToAge: value })} />
      </div>
    </Block>
  );
}
