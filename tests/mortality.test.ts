import assert from "node:assert/strict";
import { test } from "node:test";
import { aliveAt, createDefaultPlan, createPartner, medianLifespan, ruinWhileAlive, PROFILES, type MonteCarloYear } from "../lib/planner.ts";

test("survival falls with age, is certain today and is near zero at 110", () => {
  for (const profile of Object.values(PROFILES)) {
    const plan = createDefaultPlan(profile.id); plan.currentAge = 40;
    let previous = 1;
    for (let age = 40; age <= 110; age += 1) {
      const s = aliveAt(plan, age);
      assert.ok(s <= previous + 1e-12 && s >= 0, `${profile.id} ${age}`);
      previous = s;
    }
    assert.equal(aliveAt(plan, 40), 1);
    assert.ok(aliveAt(plan, 110) < 0.01);
  }
});

test("the curve reproduces the profile's life expectancy at 65 to within a year", () => {
  for (const profile of Object.values(PROFILES)) {
    const plan = createDefaultPlan(profile.id); plan.currentAge = 65;
    let expectancy = -0.5;
    for (let age = 65; age <= 115; age += 1) expectancy += aliveAt(plan, age);
    const target = (profile.mortality.e65Male + profile.mortality.e65Female) / 2;
    assert.ok(Math.abs(expectancy - target) < 1, `${profile.id}: ${expectancy.toFixed(1)} vs ${target}`);
  }
});

test("a household counts as alive while either person is, so it outlives one person", () => {
  const single = createDefaultPlan("uk"); single.currentAge = 45;
  const couple = { ...single, partner: { ...createPartner(single), currentAge: 43 } };
  assert.ok(aliveAt(couple, 90) > aliveAt(single, 90));
  assert.ok(medianLifespan(couple) > medianLifespan(single));
});

test("ruin while alive weights each year's new failures by survival, so it never exceeds the raw failure rate", () => {
  const plan = createDefaultPlan("uk"); plan.currentAge = 40; plan.planToAge = 95;
  const years: MonteCarloYear[] = [];
  for (let age = 40; age <= 95; age += 1) years.push({ age, p10: 0, p25: 0, median: 0, p75: 0, p90: 0, failedByNow: age >= 85 ? 10 : 0, spendP10: 0, spendMedian: 0, spendP90: 0 });
  const ruin = ruinWhileAlive(plan, years);
  assert.ok(ruin > 0 && ruin < 10);
  assert.ok(Math.abs(ruin - 10 * aliveAt(plan, 85)) < 1e-9, "one step at 85 counts with the chance of being alive at 85");
});
