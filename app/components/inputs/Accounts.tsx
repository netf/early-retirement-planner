"use client";

import { profileOf, type PlanInputs } from "../../../lib/planner";
import { NumberField } from "../fields";
import { useMoney } from "../money";
import { Info } from "../Info";
import { Block } from "./Block";
import type { PlanUpdaters } from "./use-plan";

/** One card per account the profile defines; age-gated accounts also expose their access age. */
export function Accounts({ plan, updaters }: { plan: PlanInputs; updaters: PlanUpdaters }) {
  const money = useMoney();
  const profile = profileOf(plan);

  return (
    <Block title="Accounts" note="Balances today" info={<Info title="Accounts"><span>Each account has different rules: when you can touch it and how withdrawals are taxed. The planner drains them in a tax-aware order, so where the money sits matters as much as how much there is.</span><em>Example: an ISA is tax-free any time; a SIPP is locked until 57 and then partly taxed — great for later, useless for the years just after you stop.</em></Info>}>
      {profile.accounts.map((rule) => {
        const account = plan.accounts[rule.id]!;
        const overLimit = rule.annualLimit !== undefined && account.monthlyContribution * 12 > rule.annualLimit;
        return (
          <div className="account" key={rule.id}>
            <div className="account-head"><strong>{rule.name}</strong><span>{rule.tag}</span></div>
            <div className={`grid ${rule.accessAge === null ? "two" : "three"}`}>
              <NumberField label="Balance now" value={account.balance} prefix={money.symbol} step={1_000} onChange={(value) => updaters.updateAccount(rule.id, { balance: value })} />
              <NumberField label="Added per month" value={account.monthlyContribution} prefix={money.symbol} step={100} onChange={(value) => updaters.updateAccount(rule.id, { monthlyContribution: value })} hint={overLimit ? `Over the annual limit of ${money.format(rule.annualLimit!)}` : rule.contributionHint} />
              {rule.accessAge !== null ? <NumberField label="Access age" value={account.accessAge ?? rule.accessAge} info={<Info title="Access age"><span>The earliest age this account lets you take money out. Before then the planner treats it as locked, however much is inside.</span><em>Example: retire at 50 with a SIPP open from 57 and the first 7 years must be funded from other accounts.</em></Info>} min={plan.currentAge} max={80} onChange={(value) => updaters.updateAccount(rule.id, { accessAge: value })} /> : null}
            </div>
            {rule.withdrawal.kind === "income" && rule.withdrawal.taxFreeCap !== undefined ? <NumberField label="Tax-free cash already taken" value={plan.taxFreeUsed} prefix={money.symbol} step={1_000} onChange={(value) => updaters.update("taxFreeUsed", value)} hint={`Counts against the ${money.format(rule.withdrawal.taxFreeCap)} lifetime tax-free lump-sum allowance`} /> : null}
          </div>
        );
      })}
    </Block>
  );
}
