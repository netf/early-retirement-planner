"use client";

import type { PlanInputs } from "../../../lib/planner";
import { NumberField, Switch, TextField } from "../fields";
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
      <p className="field-label">Plan for<Info title="Household"><span>A couple is not two single plans added together: each person has their own tax allowance, bands, tax-free pension cash and pension age, and the planner draws from whichever of you pays less tax in a given year. Spending is shared. Each account, pension and state pension is marked with its owner.</span><em>Example: £40,000 a year drawn from one person’s pension costs roughly twice the tax of £20,000 from each of two.</em></Info></p>
      <Switch label="Plan for" value={plan.partner ? "couple" : "single"} onChange={(value) => updaters.setHousehold(value === "couple")} options={[{ value: "single", label: "Just me" }, { value: "couple", label: "Me and a partner", note: "own tax, own ages" }]} />
      {plan.partner ? (
        <div className="grid three">
          <TextField label="Partner’s name" value={plan.partner.name} onChange={(value) => updaters.updatePartner({ name: value })} />
          <NumberField label={`${plan.partner.name || "Partner"}’s age now`} value={plan.partner.currentAge} min={18} max={110} onChange={(value) => updaters.updatePartner({ currentAge: value, retirementAge: Math.max(value, plan.partner!.retirementAge) })} />
          <NumberField label="Stops work at" value={plan.partner.retirementAge} min={plan.partner.currentAge} max={85} onChange={(value) => updaters.updatePartner({ retirementAge: value })} hint={plan.partner.retirementAge <= plan.partner.currentAge ? "Already retired" : "Their own age"} />
        </div>
      ) : null}
    </Block>
  );
}
