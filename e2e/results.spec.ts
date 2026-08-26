import { PROFILES, createDefaultPlan, runBacktests, runStressTests } from "../lib/planner";
import { expect, test } from "./fixtures";
import { digits, expectedFor, moneyFor } from "./oracle";

test.describe("results tabs reproduce the engine", () => {
  test.beforeEach(async ({ planner }) => { await planner.openFresh(); await planner.exploreExample(); });

  test("year by year: every row, both column sets, and the opened working balance", async ({ planner, page }) => {
    const plan = createDefaultPlan("uk");
    const { projection } = expectedFor(plan);
    const money = moneyFor(plan);
    await planner.openTab("Year by year");
    const rows = page.locator(".tab-body tbody tr[role=button]");
    await expect(rows).toHaveCount(projection.years.length);

    const cellText = (value: number, compact = false) => Math.abs(value) < 0.5 ? "–" : compact ? money.compact(value) : money.plain(value);
    for (const index of [0, 10, 11, 20, projection.years.length - 1]) {
      const year = projection.years[index]!;
      const cells = rows.nth(index).locator("td");
      await expect(cells.nth(0)).toHaveText(String(year.age));
      await expect(cells.nth(2)).toHaveText(cellText(year.spending));
      await expect(cells.nth(3)).toHaveText(cellText(year.propertyIncome + year.guaranteedIncome));
      await expect(cells.nth(4)).toHaveText(cellText(year.tax));
      await expect(cells.nth(5)).toHaveText(cellText(year.contributions));
      await expect(cells.nth(6)).toHaveText(cellText(year.withdrawals));
      await expect(cells.nth(7)).toHaveText(year.shortfall > 1 ? `Short ${money.compact(year.shortfall)}` : money.plain(year.totalInvestments));
      await expect(cells.nth(8)).toHaveText(cellText(year.propertyEquity, true));
    }

    // Open a retirement year: needed = income after tax + from accounts after tax (+ shortfall).
    await rows.nth(12).click();
    const ledger = page.locator(".ledger");
    await expect(ledger).toBeVisible();
    const summary = page.locator(".year-summary");
    await expect(summary).toContainText("Markets this year");
    await expect(summary).toContainText(`${money.compact(projection.years[12]!.market.investedOpen)} →`);
    const needed = digits(await ledger.locator("section.needed header strong").innerText());
    const income = digits(await ledger.locator("section.income header strong").innerText());
    const drawn = digits(await ledger.locator("section.drawn header strong").innerText());
    const short = (await ledger.locator("section.short header strong").count()) ? digits(await ledger.locator("section.short header strong").innerText()) : 0;
    expect(Math.abs(needed - (income + drawn + short))).toBeLessThanOrEqual(2);
    const year = projection.years[12]!;
    expect(needed).toBe(Math.round(year.spending + year.purchaseOutlay));
    await expect(page.locator(".accounts-year tbody tr")).toHaveCount(PROFILES.uk.accounts.length);

    // Account balances view.
    await page.getByRole("button", { name: "Account balances" }).click();
    const balanceCells = rows.nth(12).locator("td");
    PROFILES.uk.accounts.forEach(async (rule, offset) => { await expect(balanceCells.nth(2 + offset)).toHaveText(cellText(year.balances[rule.id] ?? 0)); });
    await expect(balanceCells.last()).toHaveText(money.plain(year.totalInvestments));
  });

  test("the path switch shows a specific simulated future", async ({ planner, page }) => {
    const plan = createDefaultPlan("uk");
    const { paths } = expectedFor(plan);
    const money = moneyFor(plan);
    await planner.openTab("Year by year");
    await page.getByRole("button", { name: /Poor future/ }).click();
    const row = page.locator(".tab-body tbody tr[role=button]").nth(20);
    const year = paths.poor.years[20]!;
    await expect(row.locator("td").nth(7)).toHaveText(year.shortfall > 1 ? `Short ${money.compact(year.shortfall)}` : money.plain(year.totalInvestments));
  });

  test("stress tests: five named sequences with the engine's verdicts", async ({ planner, page }) => {
    const plan = createDefaultPlan("uk");
    const tests = runStressTests(plan);
    const money = moneyFor(plan);
    await planner.openTab("Stress tests");
    const cards = page.locator(".stress article");
    await expect(cards).toHaveCount(tests.length);
    for (const [index, item] of tests.entries()) {
      const card = cards.nth(index);
      await expect(card.locator("h4")).toHaveText(item.label);
      await expect(card.locator(".stress-result")).toHaveText(item.passes ? "Pass" : "Fail");
      await expect(card.locator("strong").first()).toContainText(item.passes ? `${money.compact(item.endingBalance)} left at ${plan.planToAge}` : `Runs short at ${item.firstShortfall}`);
      await expect(card.locator(".stress-seq li")).toHaveCount(item.sequence.length + 1);
    }
  });

  test("history: the survival share of real retirement years", async ({ planner, page }) => {
    const plan = createDefaultPlan("uk");
    const result = runBacktests(plan);
    await planner.openTab("History");
    await expect(page.locator(".history .stat-value").first()).toHaveText(`${Math.round(result.survivalRate)}%`);
    await expect(page.locator(".history-bar")).toHaveCount(result.windows.length);
  });

  test("method: every threshold is sourced and none is unverified", async ({ planner, page }) => {
    await planner.openTab("Method");
    await expect(page.locator(".sources li")).toHaveCount(PROFILES.uk.sources.length);
    await expect(page.locator(".sources li.verify")).toHaveCount(0);
    for (const item of PROFILES.uk.sources) await expect(page.locator(".sources li").filter({ hasText: item.item })).toHaveCount(1);
  });
});
