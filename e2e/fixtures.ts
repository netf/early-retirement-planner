import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { STORAGE_KEY, type PlanInputs } from "../lib/planner";

/** Page object for the planner: the handful of interactions every spec needs. */
export class Planner {
  constructor(readonly page: Page) {}

  /** A first visit: no stored plan, no link — the welcome card. */
  async openFresh() {
    await this.page.goto("/");
    await this.page.evaluate((key) => { localStorage.removeItem(key); }, STORAGE_KEY);
    await this.page.reload();
    await expect(this.welcome).toBeVisible({ timeout: 60_000 });
  }

  get welcome(): Locator { return this.page.locator(".welcome"); }
  get verdictNumber(): Locator { return this.page.locator(".verdict-number"); }
  get verdictStamp(): Locator { return this.page.locator(".verdict-stamp").first(); }
  get verdictCopy(): Locator { return this.page.locator(".verdict-copy"); }
  get answers(): Locator { return this.page.locator(".answers .stat"); }
  get status(): Locator { return this.page.locator(".masthead .status"); }

  async exploreExample() {
    await this.page.getByRole("button", { name: /explore the example plan/i }).click();
    await this.waitSettled();
  }

  async buildStarter() {
    await this.page.getByRole("button", { name: "Build my plan" }).click();
    await this.waitSettled();
  }

  /** Verdict painted and the solvers finished, i.e. nothing is stale or pending. */
  async waitSettled() {
    await expect(this.page.locator(".answers")).toBeVisible({ timeout: 90_000 });
    await expect(this.page.locator(".headline.stale, .stale-badge")).toHaveCount(0, { timeout: 90_000 });
  }

  number(name: string): Locator { return this.page.getByRole("spinbutton", { name }).first(); }

  /** Types a new value and waits for the page to have saved the changed plan. */
  async setNumber(name: string, value: number) {
    const before = await this.page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    const field = this.number(name);
    await field.fill(String(value));
    await field.press("Tab");
    await expect.poll(() => this.page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), { timeout: 10_000 }).not.toBe(before);
  }

  async openTab(name: string) { await this.page.getByRole("tab", { name }).click(); }

  async percent(): Promise<number> {
    const text = (await this.verdictNumber.innerText()).replace(/\s+/g, "");
    return Number(text.replace("%", ""));
  }

  /** The plan as the page has saved it (after its 450 ms save debounce). */
  async storedPlan(): Promise<PlanInputs> {
    await expect.poll(async () => this.page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), { timeout: 10_000 }).not.toBeNull();
    return JSON.parse(await this.page.evaluate((key) => localStorage.getItem(key)!, STORAGE_KEY)) as PlanInputs;
  }

  /** Opens an ⓘ tooltip: hover on pointer devices, tap on touch devices — click covers both. */
  async openInfo(icon: Locator) {
    await icon.click();
    await expect(this.page.locator(".info-pop")).toBeVisible();
    return this.page.locator(".info-pop");
  }
}

export const test = base.extend<{ planner: Planner }>({
  planner: async ({ page }, provide) => { await provide(new Planner(page)); },
});

export { expect };
