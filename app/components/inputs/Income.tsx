"use client";

import { createPension, profileOf, type PlanInputs } from "../../../lib/planner";
import { NumberField, Switch, TextField } from "../fields";
import { useMoney } from "../money";
import { Info } from "../Info";
import { Block } from "./Block";
import type { PlanUpdaters } from "./use-plan";

/** The state pension as a fixed row, then any number of pensions, each with its own start age — the same card pattern as Property. */
export function Income({ plan, updaters }: { plan: PlanInputs; updaters: PlanUpdaters }) {
  const money = useMoney();
  const profile = profileOf(plan);
  const { updateIncome, updatePension, removeListItem, setPlan } = updaters;
  const addPension = () => setPlan((current) => ({ ...current, pensions: [...current.pensions, createPension(current.pensions.length + 1)] }));

  return (
    <Block title="Guaranteed income" note="Today’s money per year" info={<Info title="Guaranteed income"><span>Money that arrives every year without a pot behind it — the State Pension, an old workplace (defined-benefit) pension, an annuity. It is the safest income in the plan, so check your official forecasts rather than guessing, and add each pension separately if they start in different years: the timing matters for the bridge years.</span><em>Example: a full UK State Pension from 68 plus an NHS pension from 60 covers most essentials for life, whatever markets do.</em></Info>}>
      <div className="grid two">
        {profile.guaranteedIncome.flatMap((rule) => {
          const income = plan.guaranteedIncome[rule.id]!;
          return [
            <NumberField key={`${rule.id}-annual`} label={rule.label} value={income.annual} prefix={money.symbol} step={100} onChange={(value) => updateIncome(rule.id, { annual: value })} hint={rule.taxableShare < 1 ? `${Math.round(rule.taxableShare * 100)}% counts as taxable` : undefined} />,
            <NumberField key={`${rule.id}-age`} label="From age" value={income.fromAge} min={45} max={85} onChange={(value) => updateIncome(rule.id, { fromAge: value })} />,
          ];
        })}
      </div>
      <div className="sub-head"><span>Workplace &amp; private pensions</span><button type="button" className="add" onClick={addPension}>+ Add</button></div>
      {plan.pensions.length === 0 ? <p className="empty">Defined-benefit, annuity or other fixed income from a set age. Add each one separately.</p> : null}
      {plan.pensions.map((pension) => (
        <details className="property" key={pension.id}>
          <summary>
            <span className="property-name">{pension.name}</span>
            <span className="property-stat">{money.format(pension.annual)}/yr from {pension.fromAge}</span>
          </summary>
          <div className="property-body">
            <div className="item-head">
              <TextField label="Name" value={pension.name} onChange={(value) => updatePension(pension.id, { name: value })} />
              <button type="button" className="x" aria-label={`Remove ${pension.name}`} onClick={() => removeListItem("pensions", pension.id)}>×</button>
            </div>
            <div className="grid two">
              <NumberField label="Amount per year" value={pension.annual} prefix={money.symbol} step={100} onChange={(value) => updatePension(pension.id, { annual: value })} hint="Today’s money; taxed as income" />
              <NumberField label="Starts at age" value={pension.fromAge} min={plan.currentAge} max={85} onChange={(value) => updatePension(pension.id, { fromAge: value })} />
            </div>
          </div>
        </details>
      ))}
      {profile.taxVariants.length > 1 ? (
        <Switch label="Tax schedule" value={plan.taxVariant} onChange={(value) => updaters.update("taxVariant", value)} options={profile.taxVariants.map((variant) => ({ value: variant.id, label: variant.label }))} />
      ) : null}
      {profile.surchargeInput ? (
        <NumberField label={profile.surchargeInput.label} value={plan.taxSurchargePercent} suffix="%" min={0} max={20} step={0.1} onChange={(value) => updaters.update("taxSurchargePercent", value)} hint={profile.surchargeInput.hint} />
      ) : null}
    </Block>
  );
}
