"use client";

import { slotLabel, type PlanInputs, type Projection, type YearResult } from "../../../lib/planner";
import { Info } from "../Info";
import { useMoney } from "../money";

/**
 * Once retired, the plan's most useful output is this year's instruction: what to pay yourself,
 * where it comes from, and (on a flexible rule) whether to hold, raise or cut.
 */
export function ThisYear({ plan, projection, onChange }: { plan: PlanInputs; projection: Projection; onChange: (plan: PlanInputs) => void }) {
  const money = useMoney();
  if (plan.currentAge < plan.retirementAge) return null;
  const year = projection.years[0];
  if (!year) return null;
  if (plan.spendingStrategy === "fixed" || plan.spendingStrategy === "guardrails") {
    const d = year.detail.spending;
    const monthly = Math.round((year.spending - year.oneOffSpending) / 12);
    const cut = d.adjustment < -0.5;
    return (
      <section className={`this-year ${cut ? "cut" : "hold"}`} aria-label="This year's spending payment">
        <div className="this-year-head">
          <strong>This year, age {plan.currentAge}<Info title="This year"><span>What the plan pays you this year and which accounts it comes out of, worked out from the balances you have entered now. Come back after updating your balances and it recalculates.</span><em>Example: “Pay £2,500 a month · £24,000 from your ISA, £6,000 from cash”.</em></Info></strong>
          <span className="note">{plan.spendingStrategy === "fixed" ? "Fixed rule: the same amount every year in today’s money" : cut ? `Guardrail: cut ${plan.guardrailCutPercent}% after last year’s fall${d.atFloor ? " · held at the floor" : ""}` : "Guardrail: no cut needed this year"}</span>
        </div>
        <div className="this-year-body">
          <span className="verdict-stamp small">Pay</span>
          <div>
            <strong className="this-year-amount">{money.format(monthly)}<small> / mo</small></strong>
            <span className="note">{cut ? `Down from ${money.format(Math.round(d.planned / 12))}.` : "To spend, after tax."}{year.oneOffSpending > 0 ? ` Plus ${money.format(Math.round(year.oneOffSpending))} of one-off spending this year.` : ""}</span>
          </div>
        </div>
        <WithdrawalPlan plan={plan} year={year} />
      </section>
    );
  }
  if (plan.spendingStrategy === "amortise") {
    const a = year.detail.spending.amortisation;
    if (!a) return null;
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
        <WithdrawalPlan plan={plan} year={year} />
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
      <WithdrawalPlan plan={plan} year={year} />
    </section>
  );
}

/**
 * The year's money in one ledger: what arrives on its own, what to draw from each account (and how it is taxed),
 * the tax bill, and the practical instruction — move this year's draw into cash and pay yourself monthly.
 */
function WithdrawalPlan({ plan, year }: { plan: PlanInputs; year: YearResult }) {
  const money = useMoney();
  const d = year.detail;
  const draws = d.accounts.filter((account) => account.withdrawal > 0.5);
  const incomes = d.income.filter((item) => item.cash > 0.5);
  const totalDraw = draws.reduce((sum, account) => sum + account.withdrawal, 0);
  const tax = Math.max(0, year.tax - d.tax.propertyTax);
  const need = year.spending;
  const cash = draws.find((a) => a.id === "cash" || a.id === "partner:cash");
  const nonCash = totalDraw - (cash?.withdrawal ?? 0);
  const partnerName = plan.partner?.name ?? "partner";
  const taxNote = d.tax.byOwner
    ? d.tax.byOwner.map((p) => `${p.owner === "partner" ? partnerName : "you"} ${money.plain(p.incomeTax)}`).join(" + ")
    : null;
  return (
    <div className="withdrawal-plan" data-testid="withdrawal-plan">
      <div className="sub-head"><span>Where {money.format(Math.round(need))} comes from</span><span className="note">gross, this year, today’s money</span></div>
      <ul className="ledger">
        {incomes.map((item) => (
          <li key={item.label}><span>{item.label}</span><span className="note">{item.taxable > 0.5 ? "taxable income" : "tax-free"}{item.note ? ` · ${item.note}` : ""}</span><b>{money.format(Math.round(item.cash))}</b></li>
        ))}
        {draws.map((account) => (
          <li key={account.id}><span>Draw from {slotLabel(plan, account.id)}</span><span className="note">{account.taxable > 0.5 && account.taxFree > 0.5 ? `${money.plain(account.taxFree)} tax-free + ${money.plain(account.taxable)} taxable` : account.taxable > 0.5 ? "taxable as income" : "tax-free"}</span><b>{money.format(Math.round(account.withdrawal))}</b></li>
        ))}
        {tax > 0.5 ? <li className="tax"><span>Income tax{d.tax.flatTax > 0.5 ? " & flat tax" : ""}</span><span className="note">{taxNote ?? `on ${money.plain(d.tax.taxableIncome)} of taxable income`}</span><b>−{money.format(Math.round(tax))}</b></li> : null}
        {year.surplusSaved > 0.5 ? <li><span>Left over, saved to cash</span><span className="note">income exceeded spending</span><b>+{money.format(Math.round(year.surplusSaved))}</b></li> : null}
      </ul>
      {draws.length > 0 ? (
        <p className="note instruction">
          <b>How to run it:</b> {nonCash > 0.5 ? `sell ${money.format(Math.round(nonCash))} across the accounts above (or a quarter of it every three months) into your current account, ` : "your cash and income cover this year, "}then pay yourself <b>{money.format(Math.round((need - year.oneOffSpending) / 12))} a month</b>{year.oneOffSpending > 0.5 ? ` plus ${money.format(Math.round(year.oneOffSpending))} for this year’s one-offs` : ""}. Update the balances here next year and the plan reworks the split.
        </p>
      ) : (
        <p className="note instruction"><b>Nothing to draw:</b> income covers this year’s spending on its own.</p>
      )}
    </div>
  );
}
