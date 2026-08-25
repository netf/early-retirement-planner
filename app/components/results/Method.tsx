import { MONTE_CARLO_PATHS, SOLVER_PATHS, profileOf, type PlanInputs } from "../../../lib/planner";

export function Method({ plan }: { plan: PlanInputs }) {
  const profile = profileOf(plan);
  return (
    <div className="tab-body method">
      <dl>
        <div><dt>Money</dt><dd>Everything is in today’s money. Returns are converted to real returns with each year’s inflation. Mortgages and property cost bases are the exception: they are nominal contracts, so they shrink in real terms as prices rise, and gains are taxed on the nominal gain.</dd></div>
        <div><dt>Markets</dt><dd>Each of the {MONTE_CARLO_PATHS} futures draws yearly stock, bond, cash and inflation outcomes from the return and volatility you entered, with stocks and bonds 15% correlated. The same inputs always produce the same futures. The dashed central line applies the average return every year, so it sits above the median future: volatility itself costs money.</dd></div>
        <div><dt>Withdrawals</dt><dd>Each retirement year: rent and guaranteed income first; then just enough from income-taxed accounts to use the zero-rate allowance; then accessible accounts in order of tax cost; then the rest. Surplus income is saved as cash. Accounts are untouched before their access age.</dd></div>
        <div><dt>{profile.label}</dt><dd>{profile.notes.map((note) => <span key={note}>{note} </span>)}</dd></div>
        <div><dt>Property</dt><dd>Future purchases take the deposit and buying costs from accessible savings; if there is not enough the purchase fails and the gap is shown as a shortfall. Sales net off costs, the mortgage and estimated gains tax, and the proceeds go to cash.</dd></div>
        <div><dt>Solvers</dt><dd>Earliest age, extra saving and carryable spending are found by re-running a smaller {SOLVER_PATHS}-future simulation until it clears your confidence target. Extra saving goes to an accessible account until the bridge years are funded, then to a long-term one.</dd></div>
        <div><dt>Sources</dt><dd>
          Every threshold this profile uses, where it comes from, and whether it has been checked against the primary source for {profile.taxYear}. {profile.sources.filter((item) => item.status === "verify").length} of {profile.sources.length} still need confirming.
          <ul className="sources">
            {profile.sources.map((item) => (
              <li key={item.item} className={item.status}>
                <span className="source-status">{item.status === "confirmed" ? "Confirmed" : item.status === "example" ? "Example" : "Verify"}</span>
                <span className="source-body"><strong>{item.item}</strong> — {item.value}. <a href={item.url} target="_blank" rel="noreferrer">{item.source}</a>{item.note ? <small>{item.note}</small> : null}</span>
              </li>
            ))}
          </ul>
        </dd></div>
        <div><dt>Limits</dt><dd>Not advice. Returns are a simplified distribution, not a forecast. Longevity, care costs, tax law, pension rules and property tax can all differ. Tax figures are for tax year {profile.taxYear}; verify them before acting.</dd></div>
      </dl>
    </div>
  );
}
