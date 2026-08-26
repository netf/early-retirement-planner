"use client";

import { Fragment, useState } from "react";
import { profileOf, stateIncomeRule, type PhaseKey, type PlanInputs, type Projection, type YearResult } from "../../../lib/planner";
import { useMoney } from "../money";

export function phaseLabel(phase: PhaseKey, plan: PlanInputs): string {
  if (phase === "state") return stateIncomeRule(profileOf(plan)).label;
  return { build: "Build", bridge: "Bridge", pension: "Pension" }[phase];
}

type View = "flows" | "accounts";

/**
 * Every year from today to the end of the plan, one row each. Two column sets over the same rows:
 * the money in and out, or the balance of every account. Click a row for the full working.
 */
export function YearByYear({ plan, projection, header }: { plan: PlanInputs; projection: Projection; header?: React.ReactNode }) {
  const money = useMoney();
  const profile = profileOf(plan);
  const [open, setOpen] = useState<number | null>(null);
  const [view, setView] = useState<View>("flows");
  const columns = view === "flows" ? 9 : profile.accounts.length + 5;
  const toggle = (age: number) => setOpen(open === age ? null : age);
  return (
    <div className="tab-body table-wrap">
      {header}
      <div className="table-tools">
        <span className="label">Columns</span>
        <div className="switch compact" role="group" aria-label="Which columns to show">
          <button type="button" className={view === "flows" ? "on" : ""} aria-pressed={view === "flows"} onClick={() => setView("flows")}><span>Money in and out</span></button>
          <button type="button" className={view === "accounts" ? "on" : ""} aria-pressed={view === "accounts"} onClick={() => setView("accounts")}><span>Account balances</span></button>
        </div>
      </div>
      <table className="clickable">
        <thead>
          {view === "flows"
            ? <tr><th>Age</th><th>Phase</th><th>Spend</th><th>Income</th><th>Tax</th><th>Added</th><th>Drawn</th><th>Investments</th><th>Property</th></tr>
            : <tr><th>Age</th><th>Phase</th>{profile.accounts.map((rule) => <th key={rule.id}>{rule.name}</th>)}<th>Added</th><th>Drawn</th><th>Total</th></tr>}
        </thead>
        <tbody>
          {projection.years.map((year) => (
            <Fragment key={year.age}>
              <tr className={`${year.shortfall > 1 ? "short" : ""} ${open === year.age ? "open" : ""}`} role="button" tabIndex={0} aria-expanded={open === year.age} onClick={() => toggle(year.age)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(year.age); } }}>
                <td>{year.age}</td>
                <td className="phase">{phaseLabel(year.phase, plan)}</td>
                {view === "flows" ? (
                  <>
                    <td><Num value={year.spending} /></td>
                    <td><Num value={year.propertyIncome + year.guaranteedIncome} /></td>
                    <td><Num value={year.tax} /></td>
                    <td><Num value={year.contributions} /></td>
                    <td><Num value={year.withdrawals} /></td>
                    <td className="total">{year.shortfall > 1 ? `Short ${money.compact(year.shortfall)}` : money.plain(year.totalInvestments)}</td>
                    <td><Num value={year.propertyEquity} compact /></td>
                  </>
                ) : (
                  <>
                    {profile.accounts.map((rule) => <td key={rule.id}><Num value={year.balances[rule.id] ?? 0} /></td>)}
                    <td><Num value={year.contributions} /></td>
                    <td><Num value={year.withdrawals} /></td>
                    <td className="total">{year.shortfall > 1 ? `Short ${money.compact(year.shortfall)}` : money.plain(year.totalInvestments)}</td>
                  </>
                )}
              </tr>
              {open === year.age ? <tr className="detail-row"><td colSpan={columns}><YearBreakdown plan={plan} year={year} /></td></tr> : null}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="note">
        All figures in {money.symbol}, today’s money, as at the end of each year. Click a year to see where every number comes from.
        {view === "flows"
          ? <> Income is rent plus pensions and other guaranteed income. In retirement, <strong>Drawn = Spend − (Income − Tax)</strong>, plus any property deposit; while working, Added is what you save each year. Property is equity, not counted in Investments.</>
          : <> Each account grows at its real return, then receives that year’s contributions, then pays out what is drawn. Property is not included; switch to Money in and out for it.</>}
      </p>
    </div>
  );
}

/** A table cell: zero is shown as a faint dash so real figures stand out. */
export function Num({ value, compact }: { value: number; compact?: boolean }) {
  const money = useMoney();
  if (Math.abs(value) < 0.5) return <span className="zero">–</span>;
  return <>{compact ? money.compact(value) : money.plain(value)}</>;
}

function Line({ label, value, note, signed, muted }: { label: string; value: number; note?: string; signed?: boolean; muted?: boolean }) {
  const money = useMoney();
  const rounded = Math.abs(value) < 0.5 ? 0 : value;
  const text = signed && rounded !== 0 ? `${rounded > 0 ? "+" : "−"} ${money.plain(Math.abs(rounded))}` : money.plain(Math.abs(rounded));
  return <div className={`line ${muted ? "muted" : ""}`}><span>{label}{note ? <small>{note}</small> : null}</span><b>{text}</b></div>;
}

/** One year, explained as an equation: what was needed = income after tax + money from accounts (+ shortfall). The three sections are the terms. */
export function YearBreakdown({ plan, year }: { plan: PlanInputs; year: YearResult }) {
  const money = useMoney();
  const profile = profileOf(plan);
  const d = year.detail;
  const needed = year.spending + year.purchaseOutlay;
  const netIncome = year.propertyIncome + year.guaranteedIncome - d.tax.taxOnIncome;
  const taxOnWithdrawals = d.tax.incomeTax - d.tax.financeCredit - d.tax.taxOnIncome + d.tax.flatTax;
  const netDrawn = year.withdrawals - taxOnWithdrawals;
  const spendingShortfall = year.shortfall;
  const drawn = d.accounts.filter((account) => account.withdrawal > 0);
  const accountName = (id: string) => profile.accounts.find((rule) => rule.id === id)?.name ?? id;
  const withdrawalKind = (id: string) => profile.accounts.find((rule) => rule.id === id)?.withdrawal.kind;

  const market = year.market;
  const realPercent = market.investedOpen > 0 ? (market.investedGrowth / market.investedOpen) * 100 : 0;
  const signed = (value: number, digits = 1) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}%`;
  const signedMoney = (value: number) => `${value < 0 ? "−" : "+"}${money.compact(Math.abs(value))}`;
  const tone = year.age === plan.currentAge ? "" : realPercent <= -10 ? "bad" : realPercent >= 10 ? "good" : "";

  return (
    <div className="breakdown">
      <p className={`year-summary ${tone}`}>
        {year.age === plan.currentAge ? (
          <>Balances as entered today; growth and spending start next year.</>
        ) : (
          <>
            <b>Markets this year:</b> stocks {signed(market.stockReturnPercent)}{plan.portfolio.bondsPercent > 0 ? <>, bonds {signed(market.bondReturnPercent)}</> : null}, inflation {market.inflationPercent.toFixed(1)}%
            {market.investedOpen > 0 ? <> → invested money <strong>{signed(realPercent)} in real terms</strong>, {money.compact(market.investedOpen)} → {money.compact(market.investedOpen + market.investedGrowth)} ({signedMoney(market.investedGrowth)})</> : null}
            {year.contributions > 0.5 ? <>, then {money.compact(year.contributions)} added</> : null}
            {year.withdrawals > 0.5 ? <>{year.contributions > 0.5 ? " and" : ", then"} {money.compact(year.withdrawals)} drawn</> : null}.
          </>
        )}
      </p>
      <div className="ledger" aria-label="How the year balances">
        <section className="needed">
          <header><small>Needed</small><strong>{money.plain(needed)}</strong></header>
          {plan.spendingStrategy !== "amortise" ? <Line label="Planned spending" value={d.spending.planned} note={plan.spendingMode === "level" ? "same every year" : "this phase"} /> : null}
          {d.spending.adjustment !== 0 && plan.spendingStrategy === "guardrails" ? <Line label="Guardrail cut" value={d.spending.adjustment} note="severe market year" signed /> : null}
          {plan.spendingStrategy === "amortise" && d.spending.amortisation ? <Line label="Amortised payment (gross)" value={d.spending.amortisation.grossPayment} note={`${money.plain(d.spending.amortisation.investments)} pot + ${money.plain(d.spending.amortisation.futureIncomeValue)} future income − ${money.plain(d.spending.amortisation.targetValue)} to leave, over ${d.spending.amortisation.yearsLeft} yrs${d.spending.amortisation.bridgeCap !== null ? ` · bridge cap ${money.plain(d.spending.amortisation.bridgeCap)}` : ""}`} /> : null}
          {plan.spendingStrategy === "flex" ? <Line label={Math.abs(d.spending.adjustment) < 0.5 ? "Flex rule: held" : d.spending.adjustment > 0 ? "Flex raise" : "Flex cut"} value={d.spending.adjustment} note={`withdrawal rate ${((d.spending.withdrawalRate ?? 0) * 100).toFixed(1)}% vs ${((d.spending.anchorRate ?? 0) * 100).toFixed(1)}% start${d.spending.atFloor ? " · at floor" : d.spending.atCeiling ? " · at ceiling" : ""}`} signed /> : null}
          {d.spending.oneOffs > 0 ? <Line label="One-off costs" value={d.spending.oneOffs} signed /> : null}
          {year.purchaseOutlay > 0 ? <Line label="Property deposit & costs" value={year.purchaseOutlay} signed /> : null}
          {year.purchaseShortfall > 0 ? <Line label="Planned purchase skipped" value={year.purchaseShortfall} note="not affordable this year — the plan continues without it" muted /> : null}
        </section>
        <i>=</i>
        <section className="income">
          <header><small>Income after tax</small><strong>{money.plain(netIncome)}</strong></header>
          {d.income.length === 0 ? <p className="note">No rent or guaranteed income this year.</p> : d.income.map((item) => <Line key={item.label} label={item.label} value={item.cash} note={item.note} />)}
          {d.tax.taxOnIncome > 0.5 ? <Line label="Income tax on this" value={-d.tax.taxOnIncome} note={d.tax.financeCredit > 0 ? `after ${money.plain(d.tax.financeCredit)} mortgage-interest credit` : undefined} signed /> : null}
        </section>
        <i>+</i>
        <section className="drawn">
          <header><small>From accounts after tax</small><strong>{money.plain(netDrawn)}</strong></header>
          {drawn.length === 0 ? <p className="note">Nothing drawn — income covered everything.</p> : drawn.map((account) => (
            <Line key={account.id} label={accountName(account.id)} value={account.withdrawal} note={account.taxable > 0 ? `${money.plain(account.taxFree)} tax-free · ${money.plain(account.taxable)} taxable` : withdrawalKind(account.id) === "flat" ? "flat-rate tax" : "tax-free"} />
          ))}
          {taxOnWithdrawals > 0.5 ? <Line label="Tax on the withdrawals" value={-taxOnWithdrawals} note={`taxable income ${money.plain(d.tax.taxableIncome)} less ${money.plain(d.tax.allowance)} allowance`} signed /> : null}
          {year.surplusSaved > 0 ? <Line label="Left over, saved back" value={-year.surplusSaved} note="income exceeded what was needed" signed /> : null}
        </section>
        {spendingShortfall > 1 ? (
          <>
            <i>+</i>
            <section className="short">
              <header><small>Shortfall</small><strong>{money.plain(spendingShortfall)}</strong></header>
              <p className="note">Every accessible account is empty. This is what the year could not pay for.</p>
            </section>
          </>
        ) : null}
      </div>

      <div className="accounts-year">
        <h5>Accounts this year</h5>
      <table className="mini" aria-label="Accounts this year">
        <thead><tr><th>Account</th><th>Open</th><th>Growth</th><th>Added</th><th>Drawn</th><th>Close</th></tr></thead>
        <tbody>
          {d.accounts.map((account) => (
            <tr key={account.id} className={account.open === 0 && account.close === 0 ? "muted" : ""}>
              <td>{accountName(account.id)}<small>{account.realReturnPercent.toFixed(1)}% real return</small></td>
              <td><Num value={account.open} /></td>
              <td>{account.growth < -0.5 ? "−" : ""}<Num value={Math.abs(account.growth)} /></td>
              <td><Num value={account.contribution + account.inflow} />{account.inflow > 0.5 ? <small>incl. {money.plain(account.inflow)} in</small> : null}</td>
              <td><Num value={account.withdrawal} /></td>
              <td><b><Num value={account.close} /></b></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="note">Total tax this year {money.plain(year.tax)}{d.tax.propertyTax > 0.5 ? `, of which ${money.plain(d.tax.propertyTax)} settled inside property income` : ""}. Figures in {money.symbol}, today’s money.</p>
    </div>
  );
}
