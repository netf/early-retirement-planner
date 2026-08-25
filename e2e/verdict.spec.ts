import { createDefaultPlan } from "../lib/planner";
import { expect, test } from "./fixtures";
import { expectedFor, moneyFor } from "./oracle";

test.describe("verdict and answers match the engine", () => {
  test.beforeEach(async ({ planner }) => { await planner.openFresh(); await planner.exploreExample(); });

  test("headline, failure count and the three answers", async ({ planner }) => {
    const plan = createDefaultPlan("uk");
    const { monteCarlo, goals } = expectedFor(plan);
    const money = moneyFor(plan);
    expect(await planner.percent()).toBe(Math.round(monteCarlo.successRate));
    const failed = Math.round(1_000 * (100 - monteCarlo.successRate) / 100);
    await expect(planner.verdictCopy).toContainText(`${failed.toLocaleString("en-GB")} ran out of money before ${plan.planToAge}`);

    await expect(planner.answers).toHaveCount(3);
    const [earliest, extra, spending] = [planner.answers.nth(0), planner.answers.nth(1), planner.answers.nth(2)];
    const age = goals!.earliestRetirementAge;
    await expect(earliest.locator(".stat-value")).toHaveText(age === null ? "Later than 85" : age <= plan.currentAge ? "Now" : `Age ${age}`);
    const required = goals!.extraMonthlyRequired;
    await expect(extra.locator(".stat-value")).toContainText(required === null ? "Saving alone won’t do it" : required === 0 ? "Nothing" : money.format(required));
    await expect(spending.locator(".stat-value")).toContainText(money.format(goals!.sustainableMonthlySpending));
  });

  test("the outcomes table and the stats agree with the Monte Carlo", async ({ page }) => {
    const plan = createDefaultPlan("uk");
    const { monteCarlo, projection } = expectedFor(plan);
    const money = moneyFor(plan);
    const last = monteCarlo.years.at(-1)!;
    const rows = page.locator(".fan-table tbody tr");
    await expect(rows).toHaveCount(6);
    const cell = (index: number) => rows.nth(index).locator("td").last();
    const shown = (value: number) => value < 1 ? "ran out" : money.plain(value);
    await expect(cell(0)).toHaveText(shown(projection.years.at(-1)!.totalInvestments));
    await expect(cell(1)).toHaveText(shown(last.p90));
    await expect(cell(2)).toHaveText(shown(last.p75));
    await expect(cell(3)).toHaveText(shown(last.median));
    await expect(cell(4)).toHaveText(shown(last.p25));
    await expect(cell(5)).toHaveText(shown(last.p10));
    await expect(page.locator(".figures .stat").filter({ hasText: "Typical failure age" }).locator(".stat-value")).toHaveText(monteCarlo.medianFailureAge === null ? "None" : String(monteCarlo.medianFailureAge));
  });

  test("the chart readout follows the keyboard and quotes the right year", async ({ page }) => {
    const plan = createDefaultPlan("uk");
    const { monteCarlo } = expectedFor(plan);
    const money = moneyFor(plan);
    const plot = page.locator(".fan-plot");
    await plot.focus();
    await page.keyboard.press("ArrowRight");
    const age = Math.max(plan.retirementAge, plan.currentAge) + 1;
    const year = monteCarlo.years.find((item) => item.age === age)!;
    const tip = page.locator(".fan-tip");
    await expect(tip).toContainText(`Age ${age}`);
    await expect(tip.locator("b").nth(1)).toHaveText(money.compact(year.median));
    await page.keyboard.press("Escape");
    await expect(tip).toHaveCount(0);
  });

  test("the ⓘ explanations open with an example and close again", async ({ planner, page }) => {
    const pop = await planner.openInfo(page.locator(".verdict-q .info-icon"));
    await expect(pop).toContainText("Will the money last?");
    await expect(pop.locator("em")).toContainText("Example:");
    await page.keyboard.press("Escape");
    await expect(page.locator(".info-pop")).toHaveCount(0);
  });

  test("changing an input recomputes to the engine's answer for the new plan", async ({ planner }) => {
    await planner.setNumber("Monthly spending in retirement", 3_000);
    await planner.waitSettled();
    const stored = await planner.storedPlan();
    expect(stored.desiredMonthlySpending).toBe(3_000);
    const expected = expectedFor(stored);
    expect(await planner.percent()).toBe(Math.round(expected.monteCarlo.successRate));
    await expect(planner.verdictStamp).toHaveText(expected.monteCarlo.successRate >= stored.targetConfidencePercent ? "Yes" : "Not yet");
  });
});
