"use client";

import { profileOf, type PlanInputs } from "../../../lib/planner";
import { NumberField, Switch } from "../fields";
import { useMoney } from "../money";
import { Info } from "../Info";
import { Block } from "./Block";
import type { PlanUpdaters } from "./use-plan";

/** The state pension and the tax schedule. Workplace and private pensions live under Accounts with everything else you own. */
export function Income({ plan, updaters }: { plan: PlanInputs; updaters: PlanUpdaters }) {
  const money = useMoney();
  const profile = profileOf(plan);
  const { updateIncome, updatePartnerIncome } = updaters;

  return (
    <Block title="State pension & tax" note="Today’s money per year" info={<Info title="State pension"><span>Money the state pays every year for life once you reach its age — the safest income in the plan, so use your official forecast rather than a guess. Workplace and private pensions are added under Accounts, each with its own start age.</span><em>Example: a full UK State Pension from 68 covers a big slice of essentials for life, whatever markets do.</em></Info>}>
      <div className="grid two">
        {profile.guaranteedIncome.flatMap((rule) => {
          const income = plan.guaranteedIncome[rule.id]!;
          return [
            <NumberField key={`${rule.id}-annual`} label={rule.label} value={income.annual} prefix={money.symbol} step={100} onChange={(value) => updateIncome(rule.id, { annual: value })} hint={rule.taxableShare < 1 ? `${Math.round(rule.taxableShare * 100)}% counts as taxable` : undefined} />,
            <NumberField key={`${rule.id}-age`} label="From age" value={income.fromAge} min={45} max={85} onChange={(value) => updateIncome(rule.id, { fromAge: value })} />,
          ];
        })}
      </div>
      {plan.partner ? (
        <>
          <div className="sub-head"><span>{plan.partner.name}’s</span><span className="note">their own age</span></div>
          <div className="grid two">
            {profile.guaranteedIncome.flatMap((rule) => {
              const income = plan.partner!.guaranteedIncome[rule.id]!;
              return [
                <NumberField key={`p-${rule.id}-annual`} label={`${plan.partner!.name}: ${rule.label}`} value={income.annual} prefix={money.symbol} step={100} onChange={(value) => updatePartnerIncome(rule.id, { annual: value })} />,
                <NumberField key={`p-${rule.id}-age`} label="From their age" value={income.fromAge} min={45} max={85} onChange={(value) => updatePartnerIncome(rule.id, { fromAge: value })} />,
              ];
            })}
          </div>
        </>
      ) : null}
      {profile.taxVariants.length > 1 ? (
        <Switch label="Tax schedule" value={plan.taxVariant} onChange={(value) => updaters.update("taxVariant", value)} options={profile.taxVariants.map((variant) => ({ value: variant.id, label: variant.label }))} />
      ) : null}
      <NumberField label="Tax thresholds frozen for" value={plan.thresholdFreezeYears} suffix="years" min={0} max={30} onChange={(value) => updaters.update("thresholdFreezeYears", value)} hint={plan.thresholdFreezeYears === 0 ? "Allowance and bands rise with inflation every year" : `Fixed in cash terms until ${new Date().getFullYear() + plan.thresholdFreezeYears}, then rise with inflation`} info={<Info title="Frozen thresholds"><span>Governments often fix the tax-free allowance and band edges in cash terms for years. With inflation that is a stealth tax rise: the same real income drifts into higher bands. The plan shrinks the thresholds in today’s money for this many years, then uprates them with inflation. The default is what each country has actually announced.</span><em>Example: the UK’s £12,570 allowance is frozen until April 2028 — at 3% inflation it is worth about £11,800 in today’s money by then.</em></Info>} />
      {profile.surchargeInput ? (
        <NumberField label={profile.surchargeInput.label} value={plan.taxSurchargePercent} suffix="%" min={0} max={20} step={0.1} onChange={(value) => updaters.update("taxSurchargePercent", value)} hint={profile.surchargeInput.hint} />
      ) : null}
    </Block>
  );
}
