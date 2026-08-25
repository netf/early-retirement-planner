import type { Metadata } from "next";
import Link from "next/link";
import { PROFILES, PROFILE_IDS } from "../../lib/planner";

export const metadata: Metadata = { title: "About — Early Retirement Planner", description: "What this planner is, what it is not, and how your figures are handled." };

/** Fill in before sharing publicly: the GitHub issues page for this project, e.g. "https://github.com/you/early-retirement-planner/issues". */
const FEEDBACK_URL = "https://github.com/netf/early-retirement-planner/issues";

export default function AboutPage() {
  return (
    <main className="page about">
      <header className="masthead">
        <div className="masthead-row">
          <div className="masthead-title"><Link className="wordmark" href="/">Early Retirement Planner</Link></div>
          <div className="masthead-actions"><Link className="button" href="/">← Back to the planner</Link></div>
        </div>
      </header>

      <article className="about-body card">
        <h1>About this planner</h1>
        <p className="lede">A calculator for one question: if you stop work at a chosen age, how often does the money last — across a thousand possible futures of markets and inflation, with your country’s tax and pension rules applied year by year.</p>

        <h2>What it is</h2>
        <p>An independent, free planning tool. You enter your ages, spending, accounts, property and income; it simulates every year of your plan under {`${1_000}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")} different sequences of returns and inflation, and reports the share in which the money is still there at the end, together with the earliest age the plan supports, the extra saving that would make it work, and what it can carry. Every figure is in today’s money. Every threshold it uses is listed on the Method tab with its source and whether it has been checked against the official document.</p>

        <h2>What it is not</h2>
        <p><strong>It is not financial advice</strong>, and it is not a regulated service. It does not know your circumstances, your health, your family or your tax affairs beyond what you type in. It cannot tell you what to do; it can only show what follows from the assumptions you give it. Before acting on anything here — retiring, moving money, changing contributions — check it against your own records and, where the sums matter, a regulated adviser.</p>
        <p>The model is a simplification. Among the things it does not do: model a partner or household, weight outcomes by life expectancy, freeze tax thresholds in cash terms, change your asset mix over time, or handle tax in the country you are not planning in. It assumes tax bands rise with inflation, that withdrawals happen once a year, and that markets behave like the distribution you describe under Markets. The Method tab lists these limits in full.</p>

        <h2>Your figures</h2>
        <p>Everything runs in your browser. Nothing you enter is sent to a server, stored remotely, or seen by anyone who built this. The plan is kept in your browser’s local storage so it is there when you come back on the same device; clearing site data removes it.</p>
        <p><strong>Links and files are the exception you control.</strong> “Copy link” packs the whole plan into the address itself — anyone you give that link to can open your plan, so treat it like the document it is. “Export” writes the same plan to a file on your computer. Neither passes through a server.</p>

        <h2>Accuracy</h2>
        <p>The engine is checked by an automated test suite: accounting identities on thousands of randomised plans, closed-form references, a second independent implementation of each country’s income tax cross-checked on 100,000 random incomes, published worked examples from the tax authorities, and the historical dataset verified against Damodaran and FRED. Tax years currently modelled: {PROFILE_IDS.map((id) => `${PROFILES[id].label} ${PROFILES[id].taxYear}`).join(", ")}. Rules change every year; if a figure here is out of date, the Method tab shows exactly which one, and we would like to hear about it.</p>

        <h2>Terms</h2>
        <p>Use it at your own risk. It is provided as is, without warranty of any kind. The authors accept no liability for decisions made on the basis of its output, or for errors in it. If that is not acceptable, please do not use it.</p>

        <h2>Feedback</h2>
        <p>Found a wrong number, a confusing screen, or something it should model? {FEEDBACK_URL ? <><a href={FEEDBACK_URL} rel="noopener noreferrer" target="_blank">Report it on GitHub</a> — no account with us is needed, only a GitHub login.</> : <>A place to report it will appear here soon.</>} Specific is best: the country, the input that surprised you, and what you expected instead.</p>
      </article>

      <footer className="colophon">
        <span>Early Retirement Planner · engine v3</span>
        <Link href="/">Back to the planner</Link>
      </footer>
    </main>
  );
}
