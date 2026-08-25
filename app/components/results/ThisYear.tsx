"use client";

import type { PlanInputs, Projection } from "../../../lib/planner";
import { Info } from "../Info";
import { useMoney } from "../money";

/**
 * Once retired on the flex rule, the plan's most useful output is this year's instruction:
 * hold, raise or cut — and the anchor it is measured against.
 */
export function ThisYear({ plan, projection, onChange }: { plan: PlanInputs; projection: Projection; onChange: (plan: PlanInputs) => void }) {
  const money = useMoney();
  if ((plan.spendingStrategy !== "flex" && plan.spendingStrategy !== "amortise") || plan.currentAge < plan.retirementAge) return null;
  const year = projection.years[0];
  if (!year) return null;
  if (plan.spendingStrategy === "amortise") {
    const a = year.detail.spending.amortisation!;
    const monthly = Math.round((year.spending - year.oneOffSpending) / 12);
    return (
      <section className="this-year hold" aria-label="This year's spending payment">
        <div className="this-year-head">
          <strong>This year, age {plan.currentAge}<Info title="This year"><span>Once you are retired on a flexible rule, this is the one instruction that matters each year: what to spend, worked out from what the pot holds now. Come back after updating your balances and it recalculates.</span><em>Example: “Hold at £1,900” means the pot is inside the band you started with; “Cut to £1,710” means it has fallen behind.</em></Info></strong>
          <span className="note">Pot {money.compact(a.investments)} + future income worth {money.compact(a.futureIncomeValue)} − {money.compact(a.targetValue)} to leave, spread over {a.yearsLeft} years at {plan.amortiseRealReturnPercent}% real{a.bridgeCap !== null && a.unsmoothed >= a.bridgeCap - 1 ? " · capped by accessible money until your pension opens" : ""}{year.detail.spending.atFloor ? " · lifted to the floor" : year.detail.spending.atCeiling ? " · capped at the ceiling" : ""}</span>
        </div>
        <div className="this-year-body">
          <span className="verdict-stamp small">Pay</span>
          <div>
            <strong className="this-year-amount">{money.format(monthly)}<small> / mo</small></strong>
            <span className="note">{money.format(Math.round(a.grossPayment / 12))} a month comes out of the pot; this is what is left to spend after tax.</span>
          </div>
        </div>
      </section>
    );
  }
  const d = year.detail.spending;
  const rate = d.withdrawalRate ?? 0;
  const anchor = plan.flexAnchor;
  const newMonthly = Math.round((d.planned + d.adjustment) / 12);
  const currentMonthly = Math.round(d.planned / 12);
  const verdict = d.adjustment > 0.5 ? "raise" : d.adjustment < -0.5 ? "cut" : "hold";

  return (
    <section className={`this-year ${anchor ? verdict : "unanchored"}`} aria-label="This year's spending decision">
      <div className="this-year-head">
        <strong>This year, age {plan.currentAge}</strong>
        <span className="note">Withdrawal rate {(rate * 100).toFixed(1)}% of your pot{anchor ? ` · anchor ${(anchor.rate * 100).toFixed(1)}% set at ${anchor.fromAge} · band ${((anchor.rate * (1 - plan.flexBandPercent / 100)) * 100).toFixed(1)}–${((anchor.rate * (1 + plan.flexBandPercent / 100)) * 100).toFixed(1)}%` : ""}</span>
      </div>
      {anchor ? (
        <div className="this-year-body">
          <span className="verdict-stamp small">{verdict === "hold" ? "Hold" : verdict === "raise" ? "Raise" : "Cut"}</span>
          <div>
            <strong className="this-year-amount">{money.format(newMonthly)}<small> / mo</small></strong>
            <span className="note">{verdict === "hold" ? `Stay at ${money.format(currentMonthly)}: the rate is inside the band.` : verdict === "raise" ? `Up from ${money.format(currentMonthly)}: the pot has pulled ahead of the anchor.${d.atCeiling ? " Capped at the ceiling." : ""}` : `Down from ${money.format(currentMonthly)}: the pot has fallen behind the anchor.${d.atFloor ? " Held at the floor." : ""}`}</span>
          </div>
          {verdict !== "hold" ? <button type="button" className="button" onClick={() => onChange({ ...plan, desiredMonthlySpending: newMonthly })}>Apply {money.format(newMonthly)}</button> : null}
          <button type="button" className="add" onClick={() => { if (window.confirm("Reset the anchor to today's withdrawal rate? Only do this when you actually start retirement.")) onChange({ ...plan, flexAnchor: { rate, fromAge: plan.currentAge } }); }}>Re-anchor</button>
        </div>
      ) : (
        <div className="this-year-body">
          <div>
            <strong className="this-year-amount">Set your anchor</strong>
            <span className="note">You are retired on the flex rule but no anchor is stored, so re-entering balances would re-anchor the rule and it would never cut. Fix today’s rate of {(rate * 100).toFixed(1)}% as the anchor.</span>
          </div>
          <button type="button" className="button" onClick={() => onChange({ ...plan, flexAnchor: { rate, fromAge: plan.currentAge } })}>Set anchor at {(rate * 100).toFixed(1)}%</button>
        </div>
      )}
    </section>
  );
}
