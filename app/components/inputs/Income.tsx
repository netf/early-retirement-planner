"use client";

import { profileOf, type PlanInputs } from "../../../lib/planner";
import { NumberField, Switch } from "../fields";
import { useMoney } from "../money";
import { Info } from "../Info";
import { Block } from "./Block";
import type { PlanUpdaters } from "./use-plan";

export function Income({ plan, updaters }: { plan: PlanInputs; updaters: PlanUpdaters }) {
  const money = useMoney();
  const profile = profileOf(plan);
  const rules = profile.guaranteedIncome;

  return (
    <Block title="Guaranteed income" note="Today’s money per year" info={<Info title="Guaranteed income"><span>Money that arrives every year without a pot behind it — the State Pension or an old workplace pension. It is the safest income in the plan, so check your official forecast rather than guessing.</span><em>Example: a full UK State Pension from 68 covers a big slice of essentials for life, whatever markets do.</em></Info>}>
      <div className="grid two">
        {rules.flatMap((rule) => {
          const income = plan.guaranteedIncome[rule.id]!;
          return [
            <NumberField key={`${rule.id}-annual`} label={rule.label} value={income.annual} prefix={money.symbol} step={100} onChange={(value) => updaters.updateIncome(rule.id, { annual: value })} hint={rule.taxableShare < 1 ? `${Math.round(rule.taxableShare * 100)}% counts as taxable` : undefined} />,
            <NumberField key={`${rule.id}-age`} label="From age" value={income.fromAge} min={45} max={85} onChange={(value) => updaters.updateIncome(rule.id, { fromAge: value })} />,
          ];
        })}
      </div>
      {profile.taxVariants.length > 1 ? (
        <Switch label="Tax schedule" value={plan.taxVariant} onChange={(value) => updaters.update("taxVariant", value)} options={profile.taxVariants.map((variant) => ({ value: variant.id, label: variant.label }))} />
      ) : null}
      {profile.surchargeInput ? (
        <NumberField label={profile.surchargeInput.label} value={plan.taxSurchargePercent} suffix="%" min={0} max={20} step={0.1} onChange={(value) => updaters.update("taxSurchargePercent", value)} hint={profile.surchargeInput.hint} />
      ) : null}
    </Block>
  );
}
