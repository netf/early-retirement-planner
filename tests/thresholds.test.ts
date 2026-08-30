import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultPlan, incomeTax, scaleSchedule, simulatePlan, taxSchedule, PROFILES } from "../lib/planner.ts";

test("scaleSchedule shrinks every threshold and leaves rates and the open top band alone", () => {
  const uk = taxSchedule(PROFILES.uk, "rest-of-uk");
  const scaled = scaleSchedule(uk, 0.9);
  assert.equal(scaled.allowance, uk.allowance * 0.9);
  assert.equal(scaled.allowanceTaper!.from, uk.allowanceTaper!.from * 0.9);
  assert.equal(scaled.bands.at(-1)!.upTo, Infinity);
  assert.deepEqual(scaled.bands.map((band) => band.rate), uk.bands.map((band) => band.rate));
  assert.ok(incomeTax(40_000, scaled, 0) > incomeTax(40_000, uk, 0), "a shrunken schedule taxes the same real income more");
});

test("frozen thresholds raise tax in the freeze years and not after", () => {
  const base = createDefaultPlan("uk");
  base.currentAge = 60; base.retirementAge = 60; base.planToAge = 75;
  base.portfolio.inflationPercent = 4;
  const frozen = { ...base, thresholdFreezeYears: 3 };
  const free = { ...base, thresholdFreezeYears: 0 };
  const a = simulatePlan(frozen).years;
  const b = simulatePlan(free).years;
  assert.equal(a[0]!.detail.tax.allowance, b[0]!.detail.tax.allowance, "the starting year is unaffected");
  assert.ok(a[1]!.detail.tax.allowance < b[1]!.detail.tax.allowance, "year one: allowance lower in real terms");
  assert.ok(Math.abs(a[3]!.detail.tax.allowance / b[3]!.detail.tax.allowance - 1 / 1.04 ** 3) < 1e-9, "after three years the allowance has lost three years of inflation");
  assert.ok(Math.abs(a[10]!.detail.tax.allowance / b[10]!.detail.tax.allowance - 1 / 1.04 ** 3) < 1e-9, "and holds there once uprating resumes");
});

test("every profile carries a freeze default and the plan picks it up", () => {
  for (const profile of Object.values(PROFILES)) {
    assert.ok(profile.thresholdFreezeYears >= 0 && profile.thresholdFreezeYears <= 30, profile.id);
    assert.equal(createDefaultPlan(profile.id).thresholdFreezeYears, profile.thresholdFreezeYears);
  }
});
