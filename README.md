# Early Retirement Planner

[![CI](https://github.com/netf/early-retirement-planner/actions/workflows/ci.yml/badge.svg)](https://github.com/netf/early-retirement-planner/actions/workflows/ci.yml)

**Will your money last if you stop work early?** A free planner for the UK, US and Poland. Enter your ages, spending, accounts, property and pensions; it runs every year of your plan through 1,000 possible futures of markets and inflation, applying each country's tax and pension rules, and tells you how often the money lasts — plus the earliest age the plan supports, the extra saving that would make it work, and what it can carry.

Everything runs in the visitor's browser (the heavy maths in a Web Worker). Nothing is sent to a server; a plan lives in the browser's local storage and can be shared as a link or a file, which only the holder can open. **This is a planning tool, not financial advice** — see `/about`.

## What it models

- Accounts per country — ISA / SIPP / GIA / cash; 401(k) / Roth / brokerage; IKE / IKZE / PPK / brokerage — each with its own access age, tax treatment and withdrawal order.
- Income tax per country (England & NI, Scotland, US single/married, Poland), tax-free pension cash, flat taxes, rental income with finance-cost relief, state pensions and other guaranteed income.
- Rental property: purchase, mortgage, growth, vacancy, running costs, sale.
- Four spending rules: fixed, protect (cut after a bad year), flex (Guyton–Klinger guardrails), spend-it-down (amortise to a chosen amount).
- 1,000 simulated futures (Monte Carlo), historical backtests from 1928, five named stress tests, an access-gap analysis for the years before pensions unlock, and a year-by-year audit trail explaining every number.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 112 engine tests, then a production build
npm run test:engine  # tests only
npm run lint
```

## Deploy (Cloudflare Workers)

```bash
npx wrangler login   # once
npm run deploy       # builds, then `wrangler deploy`
```

`npm run deploy:check` does a dry run. On GitHub, every push and pull request runs lint, typecheck, the engine tests, a production build and a Worker dry run (`.github/workflows/ci.yml`); a green CI on `main` triggers the deploy workflow, which needs the repository secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit) and `CLOUDFLARE_ACCOUNT_ID`, plus the variable `SITE_URL`. The worker is named in `wrangler.jsonc`; set `SITE_URL` at build time (e.g. `SITE_URL=https://early-retirement-planner.<account>.workers.dev npm run deploy`) so link previews resolve.

## Layout

- `lib/` — the engine. `planner.ts` is the only import surface; `profiles/` holds each country's tax and account rules as data; `simulate.ts` is the yearly loop; `monteCarlo.ts`, `goals.ts`, `stress.ts`, `backtest.ts`, `bridge.ts`, `checks.ts`, `share.ts` build on it.
- `app/` — the UI (vinext / React). `analysis/` runs the engine in a Web Worker; `components/inputs/` and `components/results/` are the two columns; `about/` is the terms and privacy page.
- `tests/` — run on plain Node with `--experimental-strip-types`.

## Accuracy

Two kinds of check, both in `tests/`:

- **Arithmetic** — accounting invariants over 180 random plans × every year (money in = money out, per account), closed-form references (annuities, amortisation, brute-forced tax solves), property tests (more money never fails earlier; percentiles ordered; failure curve monotone), and an *independent* second implementation of each country's income tax compared on 100,000 random incomes (`tax-independent.test.ts`), pinned to published worked examples. The historical dataset is checked against Damodaran and FRED.
- **Rules and thresholds** — every figure each profile uses is listed in `lib/profiles/*.ts` under `sources`, with the primary document, URL and a status. The Method tab renders the list. Every fact is marked **confirmed** against the official document for the stated tax year, or **example** where it is an illustrative default; a test fails if anything ships as unverified. Update `taxYear` and re-check the list every April (UK) and January (US, PL).

## Feedback

Wrong number, confusing screen, missing feature: [open an issue](https://github.com/netf/early-retirement-planner/issues). The country, the input that surprised you and what you expected instead is the most useful report.
