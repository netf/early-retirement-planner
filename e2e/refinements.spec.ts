import { ruinWhileAlive, medianLifespan } from "../lib/planner";
import { expect, test } from "./fixtures";
import { digits, expectedFor, moneyFor } from "./oracle";

test.describe("future money, frozen thresholds, LISA and mortality", () => {
  test.beforeEach(async ({ planner }) => { await planner.openFresh(); await planner.exploreExample(); });

  test("the outcomes table can be read in the cash of the year, and the choice is remembered", async ({ planner, page }) => {
    const stored = await planner.storedPlan();
    const expected = expectedFor(stored);
    const medianRow = page.locator(".fan-table tbody tr", { hasText: "Median" }).locator("td").last();
    const real = expected.monteCarlo.years.at(-1)!.median;
    expect(digits(await medianRow.innerText())).toBe(Math.round(real));
    await expect(page.locator(".money-view-note")).toHaveCount(0);

    await page.getByRole("group", { name: "Money shown as" }).getByRole("button", { name: "Future money" }).click();
    const factor = (1 + stored.portfolio.inflationPercent / 100) ** (stored.planToAge - stored.currentAge);
    await expect(medianRow).toHaveText(moneyFor(stored).plain(real * factor));
    await expect(page.locator(".money-view-note")).toContainText(`${stored.portfolio.inflationPercent}% inflation`);
    await expect(page.locator(".fan-table thead th").last()).toContainText(`${new Date().getFullYear() + stored.planToAge - stored.currentAge} money`);

    await page.reload();
    await planner.waitSettled();
    await expect(page.getByRole("button", { name: "Future money" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Today’s money" }).click();
    await expect(medianRow).toHaveText(moneyFor(stored).plain(real));
  });

  test("freezing tax thresholds for longer costs success, and the verdict tracks the engine", async ({ planner, page }) => {
    const field = planner.number("Tax thresholds frozen for");
    await expect(field).toHaveValue("2");
    await planner.setNumber("Tax thresholds frozen for", 0);
    await planner.waitSettled();
    let stored = await planner.storedPlanWhere((plan) => plan.thresholdFreezeYears === 0);
    const unfrozen = Math.round(expectedFor(stored).monteCarlo.successRate);
    expect(await planner.percent()).toBe(unfrozen);
    await planner.setNumber("Tax thresholds frozen for", 15);
    await planner.waitSettled();
    stored = await planner.storedPlanWhere((plan) => plan.thresholdFreezeYears === 15);
    expect(await planner.percent()).toBe(Math.round(expectedFor(stored).monteCarlo.successRate));
    expect(expectedFor(stored).projection.totalTax).toBeGreaterThan(expectedFor({ ...stored, thresholdFreezeYears: 0 }).projection.totalTax);
    await expect(page.locator(".field-hint", { hasText: `until ${new Date().getFullYear() + 15}` }).first()).toBeVisible();
  });

  test("a Lifetime ISA can be added, is locked until 60, and its contributions earn the bonus", async ({ planner, page }) => {
    const block = page.locator(".block").filter({ hasText: "Balances today" });
    const cards = block.locator("details.pot");
    const before = await cards.count();
    await block.getByRole("button", { name: "+ Add account" }).click();
    await block.getByRole("menuitem", { name: /Lifetime ISA/ }).click();
    const added = cards.last();
    await expect(cards).toHaveCount(before + 1);
    await expect(added.locator(".pot-chip")).toContainText("60+");
    await added.locator("summary").click();
    await added.getByRole("spinbutton", { name: "Balance now" }).fill("12000");
    await added.getByRole("spinbutton", { name: "Balance now" }).press("Tab");
    await added.getByRole("spinbutton", { name: "Added per month" }).first().fill("300");
    await added.getByRole("spinbutton", { name: "Added per month" }).first().press("Tab");
    await planner.waitSettled();
    const stored = await planner.storedPlanWhere((plan) => plan.accounts.lisa?.balance === 12_000 && plan.accounts.lisa.monthlyContribution === 300);
    const expected = expectedFor(stored);
    const nextYear = expected.projection.years[1]!.detail.accounts.find((account) => account.id === "lisa")!;
    expect(Math.round(nextYear.contribution)).toBe(stored.currentAge + 1 < 50 ? 300 * 12 * 1.25 : 0);
    expect(await planner.percent()).toBe(Math.round(expected.monteCarlo.successRate));
  });

  test("the run-out-while-alive figure and the tooltip's survival line come from the life table", async ({ planner, page }) => {
    const stored = await planner.storedPlan();
    const expected = expectedFor(stored);
    const ruin = ruinWhileAlive(stored, expected.monteCarlo.years);
    const stat = page.locator(".figures .stat", { hasText: "Run out while alive" });
    await expect(stat.locator(".stat-value")).toHaveText(`${ruin < 0.05 ? "<1" : ruin.toFixed(ruin < 10 ? 1 : 0)}%`);
    await expect(stat.locator(".stat-note")).toContainText(`even odds of ${medianLifespan(stored)}`);
    const plot = page.locator(".outcomes-fan .fan-plot");
    await plot.focus();
    await page.keyboard.press("ArrowRight");
    await expect(plot.locator(".fan-tip .alive")).toContainText("still here");
  });
});
