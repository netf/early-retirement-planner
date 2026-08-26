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
    await expect(card).toContainText("Against the plan you set in");
    await expect(card.locator(".track-word")).toContainText("Baseline set today");
    await expect(card.locator(".gauge")).toHaveCount(0);
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
    const standing = progress.percentile >= 60 ? "Ahead of plan" : progress.percentile >= 40 ? "On plan" : "Behind plan";
    await expect(card.locator(".track-word")).toHaveText(standing);
    await expect(card.locator(".track-where")).toContainText(`${money.compact(progress.actualReal)} today against ${money.compact(progress.expected.median)}`);
    await expect(card.locator(".track-where b")).toHaveText(`${ordinal(progress.percentile)} percentile`);
    await expect(card.locator(".gauge-you")).toBeVisible();
    const facts = card.locator(".track-facts dd");
    await expect(facts.nth(0)).toContainText(`${Math.round(stored.baseline!.successRate)}%`);
    await expect(facts.nth(1)).toContainText(`${progress.realisedNominalReturn!.toFixed(1)}% a year`);
    await expect(card.locator(".track-trend")).toHaveCount(0);

    await card.getByRole("button", { name: "Check in", exact: true }).click();
    await expect(card.getByRole("button", { name: "Checked in today" })).toBeDisabled();
    await expect(card.locator(".track-log li")).toHaveCount(1);
    await expect(card.locator(".track-log li .track-pill")).toContainText(ordinal(progress.percentile));
    await expect(card.locator(".track-dot")).toHaveCount(2);
    await expect(card.locator(".track-dot.now")).toBeVisible();
    stored = await planner.storedPlanWhere((plan) => plan.checkIns.length === 1);
    expect(stored.checkIns[0]!.total).toBe(Math.round(totalCurrentInvestments(stored)));

    await card.getByRole("button", { name: /Remove check-in/ }).click();
    await expect(card.locator(".track-trend")).toHaveCount(0);

    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button", { name: "Stop tracking" }).click();
    await expect(page.locator(".track-empty")).toBeVisible();
    await planner.storedPlanWhere((plan) => plan.baseline === null);
  });

  test("the baseline travels inside a shared link", async ({ planner, page, browser }) => {
    await planner.openFresh();
    await planner.exploreExample();
    await page.locator(".track-empty").getByRole("button", { name: "Set baseline" }).click();
    await expect(page.locator(".track")).toContainText("Against the plan you set in");
    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(planner.status).toContainText("Link copied");
    const link = await page.evaluate(() => navigator.clipboard.readText());
    const context = await browser.newContext();
    const other = await context.newPage();
    await other.goto(link);
    await expect(other.locator(".track")).toContainText("Against the plan you set in", { timeout: 90_000 });
    await context.close();
  });
});
