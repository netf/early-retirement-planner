"use client";

import type { PlanInputs } from "../../../lib/planner";
import { Accounts } from "./Accounts";
import { Income } from "./Income";
import { Markets } from "./Markets";
import { Property } from "./Property";
import { Spending } from "./Spending";
import { Timeline } from "./Timeline";
import { usePlanUpdaters, type SetPlan } from "./use-plan";

export function PlanInputsPanel({ plan, setPlan }: { plan: PlanInputs; setPlan: SetPlan }) {
  const updaters = usePlanUpdaters(setPlan);
  return (
    <div className="inputs">
      <Timeline plan={plan} updaters={updaters} />
      <Spending plan={plan} updaters={updaters} />
      <Accounts plan={plan} updaters={updaters} />
      <Property plan={plan} updaters={updaters} />
      <Income plan={plan} updaters={updaters} />
      <Markets plan={plan} updaters={updaters} />
    </div>
  );
}
