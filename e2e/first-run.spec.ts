import { createDefaultPlan } from "../lib/planner";
import { expect, test } from "./fixtures";
import { expectedFor } from "./oracle";

test.describe("first run", () => {
  test("a new visitor gets the six-number start, builds a plan, and finds it again on return", async ({ planner, page }) => {
    await planner.openFresh();
    await expect(planner.welcome.getByRole("spinbutton")).toHaveCount(6);
    await expect(page.getByRole("button", { name: "Copy link" })).toBeDisabled();

    await planner.buildStarter();
    await expect(planner.welcome).toHaveCount(0);
    const stored = await planner.storedPlan();
    expect(stored.spendingStrategy).toBe("fixed");
    expect(stored.properties).toHaveLength(0);
    expect(await planner.percent()).toBe(Math.round(expectedFor(stored).monteCarlo.successRate));

    await page.reload();
    await planner.waitSettled();
    await expect(planner.welcome).toHaveCount(0);
    expect(await planner.percent()).toBe(Math.round(expectedFor(stored).monteCarlo.successRate));
  });

  test("the welcome country picker switches currency and starter numbers", async ({ planner, page }) => {
    await planner.openFresh();
    await expect(planner.welcome.locator(".field-affix").first()).toHaveText("£");
    await planner.welcome.locator(".country-picker button").click();
    await page.getByPlaceholder("Search countries").fill("pol");
    await page.getByRole("option", { name: /Poland/ }).click();
    await expect(planner.welcome.locator(".field-affix").first()).toHaveText("zł");
    await expect(planner.welcome.locator(".country-picker button")).toContainText("Poland");
    await planner.buildStarter();
    expect((await planner.storedPlan()).profile).toBe("pl");
  });

  test("exploring the example shows exactly what the engine computes for it", async ({ planner }) => {
    await planner.openFresh();
    await planner.exploreExample();
    const plan = createDefaultPlan("uk");
    const expected = expectedFor(plan);
    expect(await planner.percent()).toBe(Math.round(expected.monteCarlo.successRate));
    await expect(planner.verdictStamp).toHaveText(expected.monteCarlo.successRate >= plan.targetConfidencePercent ? "Yes" : "Not yet");
  });
});
