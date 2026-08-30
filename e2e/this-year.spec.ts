import { expect, test } from "./fixtures";
import { digits, expectedFor, moneyFor } from "./oracle";

test.describe("this year's withdrawal plan", () => {
  test("once retired, the card says what to pay and which accounts it comes from, matching the engine", async ({ planner, page }) => {
    await planner.openFresh();
    await planner.exploreExample();
    await expect(page.locator(".this-year")).toHaveCount(0);

    let stored = await planner.storedPlan();
    await planner.setNumber("Stop work at", stored.currentAge);
    await planner.waitSettled();
    stored = await planner.storedPlanWhere((plan) => plan.retirementAge === plan.currentAge);
    const expected = expectedFor(stored);
    const year = expected.projection.years[0]!;
    const money = moneyFor(stored);

    const card = page.locator(".this-year");
    await expect(card).toBeVisible();
    await expect(card).toContainText(`This year, age ${stored.currentAge}`);
    await expect(card.locator(".this-year-amount")).toContainText(money.format(Math.round((year.spending - year.oneOffSpending) / 12)));

    const plan = card.locator("[data-testid=withdrawal-plan]");
    await expect(plan).toContainText(`Where ${money.format(Math.round(year.spending))} comes from`);
    const draws = year.detail.accounts.filter((account) => account.withdrawal > 0.5);
    const rows = plan.locator(".ledger li", { hasText: "Draw from" });
    await expect(rows).toHaveCount(draws.length);
    for (const [index, draw] of draws.entries()) {
      expect(digits(await rows.nth(index).locator("b").innerText())).toBe(Math.round(draw.withdrawal));
    }
    await expect(plan.locator(".instruction")).toContainText("a month");
  });

  test("every spending rule shows the card", async ({ planner, page }) => {
    await planner.openFresh();
    await planner.exploreExample();
    const stored = await planner.storedPlan();
    await planner.setNumber("Stop work at", stored.currentAge);
    for (const rule of ["Fixed", "Protect", "Flex", "Spend it down"]) {
      await page.getByRole("group", { name: "Spending strategy" }).getByRole("button", { name: new RegExp(`^${rule}`) }).click();
      await planner.waitSettled();
      await expect(page.locator(".this-year")).toBeVisible();
      await expect(page.locator("[data-testid=withdrawal-plan]")).toBeVisible();
    }
  });
});
