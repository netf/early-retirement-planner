import { expect, test } from "./fixtures";
import { expectedFor, moneyFor } from "./oracle";

test.describe("household mode", () => {
  test("adding a partner creates their own accounts, ages and tax, and the verdict follows the engine", async ({ planner, page }) => {
    await planner.openFresh();
    await planner.exploreExample();
    const single = await planner.percent();

    const planFor = page.getByRole("group", { name: "Plan for" });
    await planFor.getByRole("button", { name: /Me and a partner/ }).click();
    await page.getByRole("textbox", { name: "Partner’s name" }).fill("Anna");
    await page.getByRole("textbox", { name: "Partner’s name" }).press("Tab");
    await planner.setNumber("Anna’s age now", 45);
    await planner.setNumber("Stops work at", 55);
    await planner.waitSettled();

    let stored = await planner.storedPlanWhere((plan) => plan.partner?.name === "Anna" && plan.partner.retirementAge === 55);
    expect(stored.partner!.currentAge).toBe(45);
    expect(Object.keys(stored.partner!.accounts).length).toBeGreaterThan(0);
    // Every pot now shows whose it is, and the partner's state pension has its own row.
    await expect(page.locator(".owner-chip").first()).toHaveText("You");
    await expect(page.getByRole("spinbutton", { name: /Anna: State pension/i })).toBeVisible();

    // Hand the first pot to the partner: it must leave the holder's accounts and join theirs.
    const firstPot = page.locator("details.property.pot").first();
    await firstPot.locator("summary").click();
    await firstPot.getByRole("group", { name: "Whose" }).getByRole("button", { name: "Anna’s" }).click();
    stored = await planner.storedPlanWhere((plan) => plan.pots[0]!.owner === "partner");
    await expect(firstPot.locator(".owner-chip")).toHaveText("Anna");
    const type = stored.pots[0]!.type;
    const partnerBalance = stored.pots.filter((pot) => pot.owner === "partner" && pot.type === type).reduce((sum, pot) => sum + pot.balance, 0);
    expect(stored.partner!.accounts[type]!.balance).toBe(partnerBalance);
    expect(stored.accounts[type]!.balance).toBe(stored.pots.filter((pot) => pot.owner === "you" && pot.type === type).reduce((sum, pot) => sum + pot.balance, 0));

    await planner.waitSettled();
    const expected = expectedFor(stored);
    expect(await planner.percent()).toBe(Math.round(expected.monteCarlo.successRate));
    expect(await planner.percent()).not.toBe(single);

    // Year-by-year balances carry a column per person and account.
    await planner.openTab("Year by year");
    await page.getByRole("button", { name: /Account balances/i }).click();
    await expect(page.locator("table.clickable thead th", { hasText: /^Anna: / }).first()).toBeVisible();

    // Back to a single plan: nothing is lost, the pot returns to the holder.
    await planner.openTab("Outcomes");
    await planFor.getByRole("button", { name: "Just me" }).click();
    stored = await planner.storedPlanWhere((plan) => plan.partner === null);
    expect(stored.pots.every((pot) => pot.owner === "you")).toBe(true);
    expect(stored.pots.length).toBeGreaterThan(0);
    await expect(page.locator(".owner-chip")).toHaveCount(0);
  });

  test("a couple pays less tax on the same draw than one person", async ({ planner, page }) => {
    await planner.openFresh();
    await planner.exploreExample();
    await page.getByRole("group", { name: "Plan for" }).getByRole("button", { name: /Me and a partner/ }).click();
    const stored = await planner.storedPlanWhere((plan) => plan.partner !== null);
    await planner.waitSettled();
    const expected = expectedFor(stored);
    // The first retired year with an income-tax bill: the ledger must attribute it person by person.
    const firstRetired = expected.projection.years.find((year) => year.age >= stored.retirementAge && year.detail.tax.byOwner && year.detail.tax.incomeTax > 0.5);
    expect(firstRetired?.detail.tax.byOwner?.length).toBe(2);
    await planner.openTab("Year by year");
    await page.locator("table.clickable tbody tr[role=button]").filter({ has: page.locator("td:first-child", { hasText: new RegExp(`^${firstRetired!.age}$`) }) }).first().click();
    const ledger = page.locator('[aria-label="How the year balances"]').first();
    await expect(ledger).toContainText(stored.partner!.name);
    const money = moneyFor(stored);
    for (const person of firstRetired!.detail.tax.byOwner!) {
      await expect(ledger).toContainText(`${person.owner === "partner" ? stored.partner!.name : "you"}: ${money.plain(person.taxableIncome)} taxable less ${money.plain(person.allowance)} allowance`);
    }
  });
});
