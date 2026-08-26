import { PROFILES, assumedRealReturn, createDefaultPlan, expectedPortfolioReturn } from "../lib/planner";
import { expect, test } from "./fixtures";
import { expectedFor } from "./oracle";

test.describe("inputs", () => {
  test.beforeEach(async ({ planner }) => { await planner.openFresh(); await planner.exploreExample(); });

  test("spending strategies reveal their own fields and change the result", async ({ planner, page }) => {
    const strategy = page.getByRole("group", { name: "Spending strategy" });
    await strategy.getByRole("button", { name: /Flex/ }).click();
    await expect(planner.number("Essential floor per month")).toBeVisible();
    await expect(planner.number("Stretch ceiling per month")).toBeVisible();
    await expect(planner.number("Band around starting rate")).toBeVisible();
    await planner.waitSettled();
    let stored = await planner.storedPlan();
    expect(stored.spendingStrategy).toBe("flex");
    expect(await planner.percent()).toBe(Math.round(expectedFor(stored).monteCarlo.successRate));

    await strategy.getByRole("button", { name: /Spend it down/ }).click();
    await expect(planner.number("Monthly spending in retirement")).toHaveCount(0);
    await expect(planner.number(`Left at ${stored.planToAge}`)).toBeVisible();
    await planner.waitSettled();
    stored = await planner.storedPlan();
    expect(stored.spendingStrategy).toBe("amortise");
    expect(await planner.percent()).toBe(Math.round(expectedFor(stored).monteCarlo.successRate));

    await strategy.getByRole("button", { name: /Fixed/ }).click();
    await expect(planner.number("Essential floor per month")).toHaveCount(0);
  });

  test("phases and one-off costs can be added and removed", async ({ planner, page }) => {
    await page.getByRole("group", { name: "Spending timeline" }).getByRole("button", { name: "Phased" }).click();
    const phases = page.getByRole("textbox", { name: /^Phase \d/ });
    const existing = await phases.count();
    await page.getByRole("button", { name: "+ Add phase" }).click();
    await expect(phases).toHaveCount(existing + 1);
    await page.getByRole("button", { name: /^Remove/ }).last().click();
    await expect(phases).toHaveCount(existing);

    const oneOffs = page.locator(".sub-head").filter({ hasText: "One-off costs" });
    await oneOffs.getByRole("button", { name: "+ Add" }).click();
    await expect(page.getByRole("textbox", { name: "What" })).toHaveCount(1);
    await planner.waitSettled();
    const stored = await planner.storedPlan();
    expect(stored.oneOffExpenses).toHaveLength(1);
    expect(await planner.percent()).toBe(Math.round(expectedFor(stored).monteCarlo.successRate));
    await page.getByRole("button", { name: "Remove One-off cost" }).click();
    await expect(page.getByRole("textbox", { name: "What" })).toHaveCount(0);
  });

  test("bonds cannot exceed what stocks leave", async ({ planner }) => {
    await planner.setNumber("Bonds", 30);
    await expect(planner.number("Bonds")).toHaveValue("20");
    expect((await planner.storedPlan()).portfolio.bondsPercent).toBe(20);
  });

  test("the markets readout is the blended return of what was entered", async ({ planner, page }) => {
    await planner.setNumber("Stock return", 6);
    await planner.setNumber("Stocks", 60);
    await planner.setNumber("Bonds", 30);
    const stored = await planner.storedPlan();
    expect(stored.portfolio.stockReturnPercent).toBe(6);
    expect(stored.portfolio.stocksPercent).toBe(60);
    expect(stored.portfolio.bondsPercent).toBe(30);
    const readout = page.locator(".mix-readout dd");
    await expect(readout.nth(0)).toHaveText(`${expectedPortfolioReturn(stored).toFixed(1)}%`);
    await expect(readout.nth(1)).toHaveText(`${assumedRealReturn(stored).toFixed(1)}%`);
  });

  test("switching country swaps the rules, the currency and the example", async ({ planner, page }) => {
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator(".masthead .country-picker button").click();
    await page.getByPlaceholder("Search countries").fill("united st");
    await page.getByRole("option", { name: /United States/ }).click();
    await planner.waitSettled();
    await expect(page.locator(".masthead-tag")).toContainText(`United States · tax ${PROFILES.us.taxYear}`);
    await expect(planner.number("Monthly spending in retirement").locator("..").locator(".field-affix").first()).toHaveText("$");
    const stored = await planner.storedPlan();
    expect(stored.profile).toBe("us");
    expect(await planner.percent()).toBe(Math.round(expectedFor(stored).monteCarlo.successRate));
  });

  test("pensions are a list: add two with different start ages, and the engine sees both", async ({ planner, page }) => {
    const incomeBlock = page.locator(".block").filter({ hasText: "Guaranteed income" });
    await expect(incomeBlock.locator(".empty")).toContainText("Add each one separately");
    await incomeBlock.getByRole("button", { name: "+ Add" }).click();
    await incomeBlock.getByRole("button", { name: "+ Add" }).click();
    const cards = incomeBlock.locator("details.property");
    await expect(cards).toHaveCount(2);
    await cards.nth(0).locator("summary").click();
    await cards.nth(0).getByRole("textbox", { name: "Name" }).fill("NHS");
    await cards.nth(0).getByRole("spinbutton", { name: "Amount per year" }).fill("9000");
    await cards.nth(0).getByRole("spinbutton", { name: "Starts at age" }).fill("60");
    await cards.nth(1).locator("summary").click();
    await cards.nth(1).getByRole("spinbutton", { name: "Amount per year" }).fill("8000");
    await cards.nth(1).getByRole("spinbutton", { name: "Starts at age" }).fill("65");
    await cards.nth(1).getByRole("spinbutton", { name: "Starts at age" }).press("Tab");
    await planner.waitSettled();
    await expect(cards.nth(0).locator("summary")).toContainText("NHS");
    const stored = await planner.storedPlan();
    expect(stored.pensions.map((item) => [item.annual, item.fromAge])).toEqual([[9_000, 60], [8_000, 65]]);
    expect(await planner.percent()).toBe(Math.round(expectedFor(stored).monteCarlo.successRate));
    const marks = page.locator(".ruler-mark");
    await expect(marks).toHaveCount(2);
    await expect(marks.nth(0)).toHaveText("NHS 60");
    await cards.nth(1).getByRole("button", { name: /^Remove/ }).click();
    await expect(cards).toHaveCount(1);
    await expect(marks).toHaveCount(1);
  });

  test("reset restores the example after confirmation", async ({ planner, page }) => {
    await planner.setNumber("Age now", 45);
    await planner.waitSettled();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Reset" }).click();
    await planner.waitSettled();
    await expect(planner.number("Age now")).toHaveValue(String(createDefaultPlan("uk").currentAge));
  });

  test("the assumption checks flag a floor set far below spending", async ({ planner, page }) => {
    await page.getByRole("group", { name: "Spending strategy" }).getByRole("button", { name: /Flex/ }).click();
    await planner.setNumber("Essential floor per month", 500);
    await expect(page.locator(".checks li").filter({ hasText: "essential floor" })).toBeVisible();
  });
});
