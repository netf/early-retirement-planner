import assert from "node:assert/strict";
import test from "node:test";
import { captureBaseline, checkInNow, createDefaultPlan, expectedAt, hasUnsavedData, normalisePlan, percentileOf, runMonteCarlo, simulatePlan, totalCurrentInvestments, trackProgress, yearsBetween, type Baseline, type BaselineYear } from "../lib/planner.ts";
import { ukScenario } from "./helpers.ts";

const flat = (age: number, value: number): BaselineYear => ({ age, p10: value * 0.7, p25: value * 0.85, median: value, p75: value * 1.15, p90: value * 1.4, central: value * 1.05, flows: 0 });

test("a baseline freezes every age of the forecast, rounded, starting from today's pot", () => {
  const plan = createDefaultPlan("uk");
  const monteCarlo = runMonteCarlo(plan, 100);
  const baseline = captureBaseline(plan, monteCarlo, simulatePlan(plan), "2026-08-26T10:00:00Z");
  assert.equal(baseline.setAt, "2026-08-26");
  assert.equal(baseline.age, plan.currentAge);
  assert.equal(baseline.startTotal, Math.round(totalCurrentInvestments(plan)));
  assert.equal(baseline.years.length, plan.planToAge - plan.currentAge + 1);
  for (const year of baseline.years) {
    assert.ok(Number.isInteger(year.p10) && Number.isInteger(year.median) && Number.isInteger(year.flows));
    assert.ok(year.p10 <= year.p25 && year.p25 <= year.median && year.median <= year.p75 && year.p75 <= year.p90);
  }
  assert.equal(baseline.years[0]!.median, baseline.startTotal, "the first year is today's balances");
  assert.equal(normalisePlan({ ...plan, baseline }).baseline?.years.length, baseline.years.length, "survives normalisation");
  assert.equal(normalisePlan({ ...plan, baseline: { ...baseline, years: [{ age: 1 }] } }).baseline, null, "a damaged baseline is dropped rather than half-used");
});

test("expectations interpolate between whole ages", () => {
  const baseline: Baseline = { setAt: "2026-01-01", age: 40, startTotal: 100, successRate: 80, targetConfidencePercent: 85, monthlySpending: 0, years: [flat(40, 100), flat(41, 200), flat(42, 300)] };
  assert.equal(expectedAt(baseline, 40.5)!.median, 150);
  assert.equal(expectedAt(baseline, 41.25)!.p90, 200 * 1.4 + (300 * 1.4 - 200 * 1.4) * 0.25);
  assert.equal(expectedAt(baseline, 42)!.median, 300);
  assert.equal(expectedAt(baseline, 43), null);
});

test("percentile-of-plan reads the five known points and clamps beyond them", () => {
  const year = flat(50, 1_000);
  assert.equal(percentileOf(year, 1_000), 50);
  assert.equal(percentileOf(year, 700), 10);
  assert.equal(percentileOf(year, 1_400), 90);
  assert.equal(percentileOf(year, 925), 37.5, "half-way between the 25th and the median");
  assert.ok(percentileOf(year, 100) >= 1 && percentileOf(year, 100) < 10);
  assert.ok(percentileOf(year, 10_000) <= 99 && percentileOf(year, 10_000) > 90);
  assert.equal(percentileOf({ ...year, p10: 1_000, p25: 1_000, p75: 1_000, p90: 1_000 }, 1_234), 50, "no spread: everything is the middle");
});

test("progress restates the real pot in baseline money and implies a return net of the plan's own flows", () => {
  const plan = ukScenario({ portfolio: { ...ukScenario().portfolio, inflationPercent: 0 } });
  const baseline: Baseline = { setAt: "2026-01-01", age: 46, startTotal: 100_000, successRate: 80, targetConfidencePercent: 85, monthlySpending: 0, years: [flat(46, 100_000), flat(47, 110_000), flat(48, 121_000)] };
  const progress = trackProgress(plan, baseline, 121_000, "2028-01-01")!;
  assert.ok(Math.abs(progress.elapsedYears - 2) < 0.01);
  assert.ok(Math.abs(progress.percentile - 50) < 0.5, `${progress.percentile}`);
  assert.ok(Math.abs(progress.gapToMedian) < 200);
  assert.ok(Math.abs(progress.realisedNominalReturn! - 10) < 0.05, `${progress.realisedNominalReturn}`);
  assert.equal(progress.successThen, 80);
  assert.equal(trackProgress(plan, baseline, 100_000, "2026-02-01")!.realisedNominalReturn, null, "too soon to annualise");
  // With inflation the same nominal pot is worth less in baseline money.
  const inflated = trackProgress(ukScenario({ portfolio: { ...ukScenario().portfolio, inflationPercent: 3 } }), baseline, 121_000, "2028-01-01")!;
  assert.ok(inflated.actualReal < 115_000 && inflated.percentile < 50);
  // Contributions the plan expected are not counted as return.
  const saving: Baseline = { ...baseline, years: [flat(46, 100_000), { ...flat(47, 110_000), flows: 10_000 }, { ...flat(48, 121_000), flows: 10_000 }] };
  const withFlows = trackProgress(plan, saving, 121_000, "2028-01-01")!;
  assert.ok(withFlows.realisedNominalReturn! < 1, `${withFlows.realisedNominalReturn}`);
});

test("check-ins snapshot the balances and survive normalisation; junk entries are dropped", () => {
  const plan = ukScenario();
  const checkIn = checkInNow(plan, "2027-03-04T09:00:00Z");
  assert.equal(checkIn.date, "2027-03-04");
  assert.equal(checkIn.total, Math.round(totalCurrentInvestments(plan)));
  assert.equal(checkIn.balances.isa, plan.accounts.isa!.balance);
  const normalised = normalisePlan({ ...plan, checkIns: [checkIn, { date: "not a date", total: 1 }, { date: "2027-01-01", total: "x" }] });
  assert.equal(normalised.checkIns.length, 1);
  assert.equal(yearsBetween("2026-01-01", "2027-01-01") > 0.99 && yearsBetween("2026-01-01", "2027-01-01") < 1.01, true);
  assert.equal(yearsBetween("2027-01-01", "2026-01-01"), 0, "never negative");
});

test("the plan knows whether a copy has left the browser since its newest data", () => {
  const plan = { ...ukScenario(), baseline: null, checkIns: [], savedAt: null, changedAt: "2027-03-01T10:00:00Z" };
  assert.equal(hasUnsavedData(plan), false, "untracked plans are not nagged");
  const tracked = { ...plan, baseline: { setAt: "2027-03-01", age: 46, startTotal: 1, successRate: 80, targetConfidencePercent: 85, monthlySpending: 0, years: [] } };
  assert.equal(hasUnsavedData(tracked), true, "a baseline that was never saved");
  assert.equal(hasUnsavedData({ ...tracked, savedAt: "2027-03-01T18:00:00Z" }), false, "saved after the change");
  assert.equal(hasUnsavedData({ ...tracked, savedAt: "2027-03-01T18:00:00Z", changedAt: "2027-03-01T18:05:00Z" }), true, "changed five minutes after the save");
  assert.equal(normalisePlan({ ...tracked, savedAt: "garbage", changedAt: "also garbage" }).savedAt, null);
  assert.equal(normalisePlan({ ...tracked, savedAt: "garbage" }).changedAt, "2027-03-01T10:00:00Z");
});
