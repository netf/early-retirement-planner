import assert from "node:assert/strict";
import test from "node:test";
import { STRESS_DEFINITIONS, describeSequence, runStressTests, simulatePlan, stressYears } from "../lib/planner.ts";
import { ukScenario } from "./helpers.ts";

test("each stress test describes exactly the sequence it applies, starting the year work stops", () => {
  const plan = ukScenario();
  const tests = runStressTests(plan);
  assert.equal(tests.length, STRESS_DEFINITIONS.length);
  for (const item of tests) {
    assert.equal(item.fromAge, plan.retirementAge);
    const years = item.sequence.reduce((sum, step) => sum + (step.to - step.from + 1), 0);
    assert.equal(years, stressYears(STRESS_DEFINITIONS.find((definition) => definition.key === item.key)!, plan).length, `${item.key} sequence covers every shocked year`);
    assert.equal(item.centralEnding, simulatePlan(plan).years.at(-1)!.totalInvestments);
    assert.ok(item.endingBalance <= item.centralEnding + 1e-6, `${item.key}: a shock never leaves more than the central path`);
  }
  const crash = tests.find((item) => item.key === "market-crash")!;
  assert.deepEqual(crash.sequence.map((step) => step.text), ["markets −30%", "markets −12%", "markets +4%"]);
  const decade = tests.find((item) => item.key === "lost-decade")!;
  assert.deepEqual(decade.sequence, [{ from: 1, to: 10, text: "markets +2% · inflation 3.5%" }]);
});

test("consecutive identical years merge into one line; different years stay apart", () => {
  assert.deepEqual(describeSequence([{ market: -30 }, { market: -30 }, { market: 5 }]), [{ from: 1, to: 2, text: "markets −30%" }, { from: 3, to: 3, text: "markets +5%" }]);
  assert.deepEqual(describeSequence([{ property: -22, rent: 0.35 }, { rent: 0.65 }]), [{ from: 1, to: 1, text: "property value −22% · rent at 35% of normal" }, { from: 2, to: 2, text: "rent at 65% of normal" }]);
});

test("the shock lands on the retirement year and a crash there costs real money", () => {
  const plan = ukScenario({ currentAge: 40, retirementAge: 50, planToAge: 60 });
  const tests = runStressTests(plan);
  const crash = tests.find((item) => item.key === "market-crash")!;
  assert.ok(crash.endingBalance < crash.centralEnding * 0.9, `${crash.endingBalance} vs ${crash.centralEnding}`);
});

test("lower returns for life shifts every retirement year by 1.5 points and nothing before", () => {
  const plan = ukScenario({ currentAge: 40, retirementAge: 50, planToAge: 60 });
  const lower = runStressTests(plan).find((item) => item.key === "lower-returns")!;
  assert.deepEqual(lower.sequence, [{ from: 1, to: 11, text: "stocks and bonds −1.5% a year vs entered" }]);
  assert.ok(lower.endingBalance < lower.centralEnding, "costs money over a decade");
  assert.ok(lower.endingBalance > lower.centralEnding * 0.6, "but is a slow leak, not a crash");
});
