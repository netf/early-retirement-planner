import assert from "node:assert/strict";
import test from "node:test";
import { HISTORY, HISTORY_LAST_YEAR, MIN_HISTORICAL_YEARS, historicalPath, runBacktests, simulatePlan } from "../lib/planner.ts";
import { FLAT_PORTFOLIO, noAccounts, noIncome, ukScenario } from "./helpers.ts";

test("the history dataset is complete and plausible", () => {
  assert.equal(HISTORY.length, HISTORY_LAST_YEAR - 1928 + 1);
  assert.equal(HISTORY[0]!.year, 1928);
  const mean = (key: "stocks" | "bonds" | "cash" | "inflation") => HISTORY.reduce((sum, year) => sum + year[key], 0) / HISTORY.length;
  assert.ok(mean("stocks") > 10 && mean("stocks") < 13, `stocks ${mean("stocks")}`);
  assert.ok(mean("bonds") > 4 && mean("bonds") < 6, `bonds ${mean("bonds")}`);
  assert.ok(mean("cash") > 2.5 && mean("cash") < 4, `cash ${mean("cash")}`);
  assert.ok(mean("inflation") > 2.5 && mean("inflation") < 3.5, `inflation ${mean("inflation")}`);
  assert.equal(HISTORY.find((year) => year.year === 2008)!.stocks, -36.55);
  assert.ok(Math.abs(HISTORY.find((year) => year.year === 1974)!.inflation - 12.34) < 0.01);
});

test("a historical path follows history from the retirement year and falls back to central assumptions", () => {
  const plan = ukScenario({ currentAge: 46, retirementAge: 50, planToAge: 95 });
  const { path, historicalYears } = historicalPath(plan, 2000);
  const retirementIndex = 4;
  assert.equal(path.stockReturns[retirementIndex], -9.03);
  assert.equal(path.stockReturns[retirementIndex + 8], -36.55);
  assert.ok(Math.abs(path.inflation[retirementIndex + 22]! - 6.45) < 0.01);
  assert.equal(historicalYears, 2024 - 2000 + 1);
  // Before retirement and after the data: central assumptions
  assert.equal(path.stockReturns[0], 7.5);
  assert.equal(path.stockReturns[retirementIndex + 30], 7.5);
});

test("backtests cover every start with enough data and rank the worst start", () => {
  const plan = ukScenario({ portfolio: { ...FLAT_PORTFOLIO, stocksPercent: 100 }, desiredMonthlySpending: 2_200, essentialMonthlySpending: 2_200, spendingStrategy: "fixed", guaranteedIncome: noIncome("uk"), properties: [], accounts: { ...noAccounts("uk"), isa: { balance: 400_000, monthlyContribution: 0 } } });
  const result = runBacktests(plan);
  assert.equal(result.windows.length, HISTORY_LAST_YEAR - MIN_HISTORICAL_YEARS + 1 - 1928 + 1);
  assert.ok(result.survivalRate > 0 && result.survivalRate < 100, `${result.survivalRate}`);
  const failed = result.windows.filter((window) => !window.passes).map((window) => window.startYear);
  // 1929 and 1966 starts are the classic failures for an all-equity 6.6% withdrawal
  assert.ok(failed.includes(1929), `1929 should fail: ${failed.join(",")}`);
  assert.ok(failed.includes(1966), `1966 should fail: ${failed.join(",")}`);
  assert.ok(result.worst !== null && !result.worst.passes);
  for (const window of result.windows) {
    assert.ok(window.historicalYears >= MIN_HISTORICAL_YEARS);
    assert.equal(window.passes, simulatePlan(plan, historicalPath(plan, window.startYear).path).firstShortfall === null);
  }
});

test("a stored flex anchor survives re-entering balances; a projection still sets its own", () => {
  const base = ukScenario({ currentAge: 60, retirementAge: 60, planToAge: 70, spendingStrategy: "flex", desiredMonthlySpending: 1_000, essentialMonthlySpending: 500, spendingCeilingMonthly: 2_000, portfolio: FLAT_PORTFOLIO, guaranteedIncome: noIncome("uk"), properties: [], accounts: { ...noAccounts("uk"), isa: { balance: 300_000, monthlyContribution: 0 } } });
  // After a crash the pot is 200k; with the original 4% anchor the rule must cut.
  const crashed = { ...base, accounts: { ...base.accounts, isa: { balance: 200_000, monthlyContribution: 0 } }, flexAnchor: { rate: 0.04, fromAge: 60 } };
  const first = simulatePlan(crashed).years[0]!;
  assert.equal(first.detail.spending.anchorRate, 0.04);
  assert.ok(first.detail.spending.adjustment < 0, "should cut");
  // Without the stored anchor the same inputs would re-anchor at 6% and hold.
  const reanchored = simulatePlan({ ...crashed, flexAnchor: null }).years[0]!;
  assert.equal(reanchored.detail.spending.adjustment, 0);
  // Not yet retired: the stored anchor is ignored and set on arrival.
  const future = simulatePlan({ ...crashed, currentAge: 55 }).years.find((year) => year.age === 60)!;
  assert.ok(Math.abs(future.detail.spending.anchorRate! - 0.04) > 0.001);
});
