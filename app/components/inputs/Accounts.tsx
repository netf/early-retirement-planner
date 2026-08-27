"use client";

import { useEffect, useRef, useState } from "react";
import { accountFamily, profileOf, type AccountRule, type PlanInputs } from "../../../lib/planner";
import { NumberField, TextField } from "../fields";
import { useMoney } from "../money";
import { Info } from "../Info";
import { Block } from "./Block";
import type { PlanUpdaters } from "./use-plan";

const FAMILY_LABEL = { pension: "locked", taxfree: "tax-free", taxable: "taxable", cash: "cash" } as const;
const hasTaxFreeCap = (rule: AccountRule) => rule.withdrawal.kind === "income" && rule.withdrawal.taxFreeCap !== undefined;
const taxFreeCapOf = (rule: AccountRule) => rule.withdrawal.kind === "income" ? rule.withdrawal.taxFreeCap ?? 0 : 0;

/** "+ Add account": a menu of the profile's account types, each with its rule in one line. */
function AddAccount({ rules, onAdd }: { rules: AccountRule[]; onAdd: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="add-menu" ref={rootRef}>
      <button type="button" className="add" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>+ Add account</button>
      {open ? (
        <ul className="listbox-list add-menu-list" role="menu" aria-label="Account type">
          {rules.map((rule) => (
            <li key={rule.id} role="menuitem" tabIndex={0} className={`family-${accountFamily(rule)}`} onClick={() => { onAdd(rule.id); setOpen(false); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onAdd(rule.id); setOpen(false); } }}>
              <span><i className="pot-swatch" />{rule.name}</span>
              <small>{rule.tag}</small>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The accounts as the user owns them, one card each, coloured by family. Rules live on the type:
 * access age and the tax-free cash allowance are set once for all pots of that type.
 */
export function Accounts({ plan, updaters }: { plan: PlanInputs; updaters: PlanUpdaters }) {
  const money = useMoney();
  const profile = profileOf(plan);
  const { updatePot, addPot, removePot, updateAccessAge, update } = updaters;
  const ruleOf = (type: string) => profile.accounts.find((rule) => rule.id === type)!;
  const reachable = plan.pots.filter((pot) => ruleOf(pot.type).accessAge === null).reduce((sum, pot) => sum + pot.balance, 0);
  const locked = plan.pots.filter((pot) => ruleOf(pot.type).accessAge !== null).reduce((sum, pot) => sum + pot.balance, 0);
  const lockedRules = profile.accounts.filter((rule) => rule.accessAge !== null && plan.pots.some((pot) => pot.type === rule.id));

  return (
    <Block title="Accounts" note="Balances today" action={<AddAccount rules={profile.accounts} onAdd={addPot} />} info={<Info title="Accounts"><span>Add the accounts you actually have, one card each. The type carries the rules — when you can touch it and how withdrawals are taxed — so two pensions or two ISAs are treated together, exactly as the tax rules do. The planner drains them in a tax-aware order, so where the money sits matters as much as how much there is.</span><em>Example: an ISA is tax-free any time; a SIPP is locked until 57 and then partly taxed — great for later, useless for the years just after you stop.</em></Info>}>
      {plan.pots.length === 0 ? <p className="empty">No accounts yet. Add the ones you have — pensions, ISAs, brokerage, cash.</p> : null}
      {plan.pots.map((pot) => {
        const rule = ruleOf(pot.type);
        const family = accountFamily(rule);
        const overLimit = rule.annualLimit !== undefined && (plan.accounts[rule.id]?.monthlyContribution ?? 0) * 12 > rule.annualLimit;
        const sameType = plan.pots.filter((item) => item.type === rule.id).length;
        return (
          <details className={`property pot family-${family}`} key={pot.id}>
            <summary>
              <span className="property-name">{pot.name}</span>
              <span className={`pot-chip family-${family}`}>{FAMILY_LABEL[family]}{rule.accessAge !== null ? ` · ${plan.accounts[rule.id]?.accessAge ?? rule.accessAge}+` : ""}</span>
              <span className="property-stat">{money.compact(pot.balance)}{pot.monthlyContribution > 0 ? ` · +${money.format(pot.monthlyContribution)}/mo` : ""}</span>
            </summary>
            <div className="property-body">
              <div className="item-head">
                <TextField label="Name" value={pot.name} onChange={(value) => updatePot(pot.id, { name: value })} />
                <button type="button" className="x" aria-label={`Remove ${pot.name}`} onClick={() => removePot(pot.id)}>×</button>
              </div>
              <p className="note"><b>{rule.name}</b> · {rule.tag}</p>
              <div className="grid two">
                <NumberField label="Balance now" value={pot.balance} prefix={money.symbol} step={1_000} onChange={(value) => updatePot(pot.id, { balance: value })} />
                <NumberField label="Added per month" value={pot.monthlyContribution} prefix={money.symbol} step={100} onChange={(value) => updatePot(pot.id, { monthlyContribution: value })} hint={overLimit ? `Over the annual limit of ${money.format(rule.annualLimit!)} across your ${rule.name} accounts` : rule.contributionHint} />
              </div>
              {rule.accessAge !== null || hasTaxFreeCap(rule) ? (
                <>
                  <div className="sub-head"><span>{rule.name} rules</span><span className="note">{sameType > 1 ? `shared by all ${sameType} of your ${rule.name} accounts` : "set by the type of account"}</span></div>
                  <div className={`grid ${rule.accessAge !== null && hasTaxFreeCap(rule) ? "two" : "one"}`}>
                    {rule.accessAge !== null ? <NumberField label="Access age" value={plan.accounts[rule.id]?.accessAge ?? rule.accessAge} min={plan.currentAge} max={80} onChange={(value) => updateAccessAge(rule.id, value)} info={<Info title="Access age"><span>The earliest age this kind of account lets you take money out; it applies to every account of the type. Before then the planner treats them as locked, however much is inside.</span><em>Example: retire at 50 with pensions open from 57 and the first 7 years must be funded from other accounts.</em></Info>} /> : null}
                    {hasTaxFreeCap(rule) ? <NumberField label="Tax-free cash already taken" value={plan.taxFreeUsed} prefix={money.symbol} step={1_000} onChange={(value) => update("taxFreeUsed", value)} hint={`Counts against the ${money.format(taxFreeCapOf(rule))} lifetime allowance, across all your pensions`} /> : null}
                  </div>
                </>
              ) : null}
            </div>
          </details>
        );
      })}
      {plan.pots.length > 0 ? (
        <p className="pot-totals"><span><b>{money.compact(reachable)}</b> reachable now</span><span><b>{money.compact(locked)}</b> locked{lockedRules.length > 0 ? ` until ${Math.min(...lockedRules.map((rule) => plan.accounts[rule.id]?.accessAge ?? rule.accessAge ?? 0))}` : ""}</span></p>
      ) : null}
    </Block>
  );
}
