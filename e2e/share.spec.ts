import { readFile } from "node:fs/promises";
import { normalisePlan } from "../lib/planner";
import { expect, test } from "./fixtures";
import { expectedFor } from "./oracle";

test.describe("sharing a plan", () => {
  test("copy link → open in a clean browser → identical verdict, clean address", async ({ planner, page, browser }) => {
    await planner.openFresh();
    await planner.exploreExample();
    await planner.setNumber("Stop work at", 53);
    await planner.waitSettled();
    const stored = await planner.storedPlan();
    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(planner.status).toContainText("Link copied");
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/#plan=z\./);

    const context = await browser.newContext();
    const other = await context.newPage();
    await other.goto(link);
    const there = new (await import("./fixtures")).Planner(other);
    await there.waitSettled();
    await expect(there.welcome).toHaveCount(0);
    expect(await other.evaluate(() => location.hash)).toBe("");
    expect(await there.percent()).toBe(Math.round(expectedFor(stored).monteCarlo.successRate));
    expect((await there.storedPlan()).retirementAge).toBe(53);
    await context.close();
  });

  test("a damaged link explains itself instead of silently loading the example", async ({ planner, page }) => {
    await planner.openFresh();
    await page.goto("/#plan=z.this-is-not-a-plan");
    await page.reload();
    await expect(page.locator(".notice")).toContainText("did not contain a readable plan");
    await page.locator(".notice").getByRole("button", { name: "Dismiss" }).click();
    await expect(page.locator(".notice")).toHaveCount(0);
  });

  test("export writes the plan; import reads it back; junk is refused", async ({ planner, page }) => {
    await planner.openFresh();
    await planner.exploreExample();
    const stored = await planner.storedPlan();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export" }).click();
    const file = await (await download).path();
    const exported = JSON.parse(await readFile(file!, "utf8")) as { exportedAt: string; modelVersion: number; plan: unknown };
    expect(exported.modelVersion).toBe(3);
    expect(normalisePlan(exported.plan)).toEqual(normalisePlan(stored));

    const messages: string[] = [];
    page.on("dialog", (dialog) => { messages.push(dialog.message()); void dialog.dismiss(); });
    const before = await planner.percent();
    await page.locator('input[type="file"]').setInputFiles({ name: "notes.json", mimeType: "application/json", buffer: Buffer.from('{"hello":"world"}') });
    await expect.poll(() => messages.length).toBe(1);
    expect(messages[0]).toContain("is not a plan exported from here");
    expect(await planner.percent()).toBe(before);

    await planner.setNumber("Age now", 44);
    await planner.waitSettled();
    await page.locator('input[type="file"]').setInputFiles(file!);
    await planner.waitSettled();
    await expect(planner.number("Age now")).toHaveValue(String(stored.currentAge));
  });
});
