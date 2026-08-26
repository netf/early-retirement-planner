import { STORAGE_KEY, totalCurrentInvestments, trackProgress, type PlanInputs } from "../lib/planner";
import { expect, test } from "./fixtures";
import { expectedFor, moneyFor } from "./oracle";

const ordinal = (value: number) => { const n = Math.round(value); const mod = n % 100; return `${n}${mod >= 11 && mod <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`; };

test.describe("tracking a plan against reality", () => {
  test("set a baseline, come back two years later, check in, stop", async ({ planner, page }) => {
    await planner.openFresh();
    await planner.exploreExample();
    const empty = page.locator(".track-empty");
    await expect(empty).toContainText("Track this plan");
    await empty.getByRole("button", { name: "Set baseline" }).click();

    const card = page.locator(".track");
    await expect(card).toContainText("Tracking the plan you set on");
    await expect(card.locator(".track-stats .stat").nth(0)).toContainText("Set today");
    let stored = await planner.storedPlanWhere((plan) => plan.baseline !== null);
    const expected = expectedFor(stored);
    expect(stored.baseline!.years.length).toBe(stored.planToAge - stored.currentAge + 1);
    expect(stored.baseline!.years[1]!.median).toBe(Math.round(expected.monteCarlo.years[1]!.median));
    expect(stored.baseline!.successRate).toBe(expected.monteCarlo.successRate);

    // Two years pass and the ISA did better than planned: rewrite the stored plan the way time would.
    await page.evaluate((key) => {
      const plan = JSON.parse(localStorage.getItem(key)!) as PlanInputs;
      const setAt = new Date(); setAt.setUTCFullYear(setAt.getUTCFullYear() - 2);
      plan.baseline!.setAt = setAt.toISOString().slice(0, 10);
      plan.accounts.isa!.balance = Math.round(plan.accounts.isa!.balance * 1.6);
      localStorage.setItem(key, JSON.stringify(plan));
    }, STORAGE_KEY);
    await page.reload();
    await planner.waitSettled();
    stored = await planner.storedPlan();
    const today = new Date().toISOString().slice(0, 10);
    const progress = trackProgress(stored, stored.baseline!, totalCurrentInvestments(stored), today)!;
    const money = moneyFor(stored);
    const where = card.locator(".track-stats .stat").nth(0);
    await expect(where.locator(".stat-value")).toHaveText(`${ordinal(progress.percentile)} percentile`);
    await expect(where.locator(".stat-note")).toContainText(`${money.compact(progress.actualReal)} vs ${money.compact(progress.expected.median)}`);
    await expect(card.locator(".track-stats .stat").nth(1).locator(".stat-value")).toContainText(`${Math.round(stored.baseline!.successRate)}%`);
    await expect(card.locator(".track-stats .stat").nth(2).locator(".stat-value")).toContainText(`${progress.realisedNominalReturn!.toFixed(1)}%`);
    await expect(card.locator(".track-dot.now")).toBeVisible();

    await card.getByRole("button", { name: /Check in with today/ }).click();
    await expect(card.locator(".track-log tbody tr")).toHaveCount(1);
    await expect(card.locator(".track-log tbody tr td").nth(3)).toHaveText(ordinal(progress.percentile));
    await expect(card.locator(".track-dot")).toHaveCount(2);
    stored = await planner.storedPlanWhere((plan) => plan.checkIns.length === 1);
    expect(stored.checkIns[0]!.total).toBe(Math.round(totalCurrentInvestments(stored)));

    await card.getByRole("button", { name: /Remove check-in/ }).click();
    await expect(card.locator(".track-log")).toHaveCount(0);

    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button", { name: "Stop tracking" }).click();
    await expect(page.locator(".track-empty")).toBeVisible();
    await planner.storedPlanWhere((plan) => plan.baseline === null);
  });

  test("the baseline travels inside a shared link", async ({ planner, page, browser }) => {
    await planner.openFresh();
    await planner.exploreExample();
    await page.locator(".track-empty").getByRole("button", { name: "Set baseline" }).click();
    await expect(page.locator(".track")).toContainText("Tracking the plan");
    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(planner.status).toContainText("Link copied");
    const link = await page.evaluate(() => navigator.clipboard.readText());
    const context = await browser.newContext();
    const other = await context.newPage();
    await other.goto(link);
    await expect(other.locator(".track")).toContainText("Tracking the plan you set on", { timeout: 90_000 });
    await context.close();
  });
});
