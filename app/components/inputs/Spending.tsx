"use client";

import { activeMonthlySpending, newId, type PlanInputs } from "../../../lib/planner";
import { NumberField, Switch, TextField } from "../fields";
import { useMoney } from "../money";
import { Info } from "../Info";
import { Block } from "./Block";
import type { PlanUpdaters } from "./use-plan";

export function Spending({ plan, updaters }: { plan: PlanInputs; updaters: PlanUpdaters }) {
  const money = useMoney();
  const { update, updatePhase, updateOneOff, removeListItem, setPlan } = updaters;

  const setPrimarySpending = (value: number) => {
    setPlan((current) => {
      if (current.spendingMode === "level") return { ...current, desiredMonthlySpending: value };
      const matching = current.spendingPhases.find((phase) => current.retirementAge >= phase.startAge && current.retirementAge <= phase.endAge)
        ?? [...current.spendingPhases].sort((left, right) => left.startAge - right.startAge)[0];
      const spendingPhases = matching
        ? current.spendingPhases.map((phase) => phase.id === matching.id ? { ...phase, monthlyAmount: value } : phase)
        : [{ id: newId("phase"), label: "Retirement", startAge: current.retirementAge, endAge: current.planToAge, monthlyAmount: value }];
      return { ...current, spendingPhases };
    });
  };

  const addPhase = () => setPlan((current) => {
    const lastEnd = Math.max(current.retirementAge - 1, ...current.spendingPhases.map((phase) => phase.endAge));
    return { ...current, spendingMode: "phased", spendingPhases: [...current.spendingPhases, { id: newId("phase"), label: "New phase", startAge: Math.min(current.planToAge, lastEnd + 1), endAge: current.planToAge, monthlyAmount: current.essentialMonthlySpending }] };
  });

  const addOneOff = () => setPlan((current) => ({ ...current, oneOffExpenses: [...current.oneOffExpenses, { id: newId("expense"), label: "One-off cost", age: current.retirementAge, amount: 20_000 }] }));

  return (
    <Block title="Spending" note="Today’s money, after tax" info={<Info title="Spending"><span>What you want to live on each month once you stop working, in today’s prices and after tax — the planner handles inflation and works out the tax for you. The strategy below decides whether that amount stays fixed or moves with markets.</span><em>Example: enter £2,000 and in 20 years the plan actually budgets whatever amount then buys what £2,000 buys today.</em></Info>}>
      {plan.spendingStrategy === "amortise"
        ? <p className="note">The rule sets spending each year from the pot, so there is no fixed amount to enter. Set the floor, ceiling and what you want left instead.</p>
        : <NumberField size="large" label="Monthly spending in retirement" value={activeMonthlySpending(plan)} prefix={money.symbol} step={100} onChange={setPrimarySpending} hint={plan.spendingMode === "level" ? "Every retirement year. Inflation is handled for you." : `Spending at age ${plan.retirementAge}. Later phases are set below.`} />}
      <>
          <NumberField label="Confidence target" value={plan.targetConfidencePercent} suffix="%" min={50} max={99} onChange={(value) => update("targetConfidencePercent", value)} hint="Share of futures that must succeed" info={<Info title="Confidence target"><span>The planner tries 1,000 different market futures — some lucky, some brutal. This sets how many of them must work out before the plan counts as “enough”. Higher is safer but demands more saving or less spending.</span><em>Example: 85% means the plan may fail in 150 of the 1,000 tried futures — in real life you would adjust course, not ride it to zero.</em></Info>} />
          <p className="field-label">Spending strategy<Info title="Spending strategy"><span>How your spending reacts to markets. <b>Fixed</b>: the same real amount every year, whatever happens. <b>Protect</b>: the same amount, but cut for a year after a severe fall. <b>Flex</b>: steps up when the pot pulls ahead and down when it falls behind, between a floor and a ceiling. <b>Spend it down</b>: each year pays out what the pot can afford over the years left, so it ends near the amount you choose.</span><em>Example: after a −30% year, Fixed keeps paying £2,000; Protect pays £1,800 that year; Flex drops to £1,800 and stays there until the pot recovers; Spend it down recalculates from the smaller pot.</em></Info></p>
          <Switch label="Spending strategy" value={plan.spendingStrategy} onChange={(value) => update("spendingStrategy", value)} options={[{ value: "fixed", label: "Fixed", note: "Same amount every year" }, { value: "guardrails", label: "Protect", note: "Cut after a bad year" }, { value: "flex", label: "Flex", note: "Steps with the pot" }, { value: "amortise", label: "Spend it down", note: "Pays the pot out by the end" }]} />
          {plan.spendingStrategy !== "fixed" ? <NumberField label="Essential floor per month" value={plan.essentialMonthlySpending} prefix={money.symbol} step={100} onChange={(value) => update("essentialMonthlySpending", value)} hint={plan.essentialMonthlySpending > activeMonthlySpending(plan) ? "Above your spending, so it never applies" : "The rule never cuts below this"} /> : null}
          {plan.spendingStrategy === "guardrails" ? <NumberField label="Cut after a severe down year" value={plan.guardrailCutPercent} suffix="%" min={0} max={30} onChange={(value) => update("guardrailCutPercent", value)} hint="Applied when the portfolio falls more than 10% in real terms" /> : null}
          {plan.spendingStrategy === "amortise" ? <NumberField label="Ceiling per month" value={plan.spendingCeilingMonthly} prefix={money.symbol} step={100} onChange={(value) => update("spendingCeilingMonthly", value)} hint="The payment is never raised above this" /> : null}
          {plan.spendingStrategy === "flex" ? (
            <>
              <NumberField label="Stretch ceiling per month" value={plan.spendingCeilingMonthly} prefix={money.symbol} step={100} onChange={(value) => update("spendingCeilingMonthly", value)} hint={plan.spendingCeilingMonthly < activeMonthlySpending(plan) ? "Below your spending, so raises never apply" : "Spending is never raised above this, however well markets do"} />
              <div className="grid two">
                <NumberField label="Band around starting rate" value={plan.flexBandPercent} suffix="%" min={5} max={50} onChange={(value) => update("flexBandPercent", value)} hint={`Step when the withdrawal rate leaves ±${plan.flexBandPercent}% of where it started`} />
                <NumberField label="Step size" value={plan.flexStepPercent} suffix="%" min={1} max={30} onChange={(value) => update("flexStepPercent", value)} hint="Each raise or cut" />
              </div>
              <p className="note">Each year the plan compares what it needs from the pot with the pot’s size. If the pot has pulled ahead, spending steps up; if it has fallen behind, spending steps down — between the floor and the ceiling.</p>
            </>
          ) : null}
          {plan.spendingStrategy === "amortise" ? (
            <>
              <div className="grid two">
                <NumberField label={`Left at ${plan.planToAge}`} value={plan.amortiseTargetAtEnd} prefix={money.symbol} step={10_000} onChange={(value) => update("amortiseTargetAtEnd", value)} hint="Care reserve or legacy, today’s money. 0 spends it all." />
                <NumberField label="Assumed real return" value={plan.amortiseRealReturnPercent} suffix="%" min={-2} max={8} step={0.5} onChange={(value) => update("amortiseRealReturnPercent", value)} hint="Lower is more cautious: smaller payments now, more later" />
              </div>
              <NumberField label="Most spending can change per year" value={plan.amortiseSmoothingPercent} suffix="%" min={0} max={50} onChange={(value) => update("amortiseSmoothingPercent", value)} hint="Smooths the payment; 0 follows the pot exactly" />
              <p className="note">Each year the rule works out the level payment that would run the pot — plus the value of pensions and rent still to come — down to the amount you want left, over the years remaining. Good years raise it, bad years lower it, and it cannot run out before the end. While your pension is locked it is capped by what the accessible money can sustain until it opens.</p>
            </>
          ) : null}
          {plan.spendingStrategy !== "amortise" ? <Switch label="Spending timeline" value={plan.spendingMode} onChange={(value) => update("spendingMode", value)} options={[{ value: "level", label: "Level" }, { value: "phased", label: "Phased" }]} /> : null}
          {plan.spendingMode === "phased" && plan.spendingStrategy !== "amortise" ? (
            <div className="rows">
              {plan.spendingPhases.map((phase, index) => (
                <div className="item-card" key={phase.id}>
                  <div className="item-head">
                    <TextField label={`Phase ${index + 1}`} value={phase.label} onChange={(value) => updatePhase(phase.id, { label: value })} />
                    <button type="button" className="x" aria-label={`Remove ${phase.label}`} onClick={() => removeListItem("spendingPhases", phase.id)}>×</button>
                  </div>
                  <div className="grid three">
                    <NumberField label="From age" value={phase.startAge} min={plan.currentAge} max={110} onChange={(value) => updatePhase(phase.id, { startAge: value })} />
                    <NumberField label="To age" value={phase.endAge} min={phase.startAge} max={110} onChange={(value) => updatePhase(phase.id, { endAge: value })} />
                    <NumberField label="Per month" value={phase.monthlyAmount} prefix={money.symbol} step={100} onChange={(value) => updatePhase(phase.id, { monthlyAmount: value })} />
                  </div>
                </div>
              ))}
              <button type="button" className="add" onClick={addPhase}>+ Add phase</button>
            </div>
          ) : null}
          <div className="sub-head"><span>One-off costs</span><button type="button" className="add" onClick={addOneOff}>+ Add</button></div>
          {plan.oneOffExpenses.length === 0 ? <p className="empty">Cars, renovations, weddings, gifts. Add the year and the amount.</p> : null}
          <div className="rows">
            {plan.oneOffExpenses.map((expense) => (
              <div className="item-card" key={expense.id}>
                <div className="item-head">
                  <TextField label="What" value={expense.label} onChange={(value) => updateOneOff(expense.id, { label: value })} />
                  <button type="button" className="x" aria-label={`Remove ${expense.label}`} onClick={() => removeListItem("oneOffExpenses", expense.id)}>×</button>
                </div>
                <div className="grid two">
                  <NumberField label="At age" value={expense.age} min={plan.currentAge} max={plan.planToAge} onChange={(value) => updateOneOff(expense.id, { age: value })} />
                  <NumberField label="Amount" value={expense.amount} prefix={money.symbol} step={1_000} onChange={(value) => updateOneOff(expense.id, { amount: value })} />
                </div>
              </div>
            ))}
          </div>
      </>
    </Block>
  );
}
