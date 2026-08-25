import { expect, test } from "./fixtures";

/** Runs under every project, so these hold at desktop, tablet and phone widths. */
async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(overflow.scroll, `page scrolls sideways (${overflow.scroll} > ${overflow.inner})`).toBeLessThanOrEqual(overflow.inner + 1);
}

async function expectInsideViewport(locator: import("@playwright/test").Locator) {
  const box = await locator.boundingBox();
  const viewport = locator.page().viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
}

test.describe("layout at this screen size", () => {
  test("welcome, planner, every tab and About fit the width", async ({ planner, page }) => {
    await planner.openFresh();
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole("button", { name: "Build my plan" })).toBeVisible();

    await planner.exploreExample();
    await expectNoHorizontalOverflow(page);
    await expect(planner.verdictNumber).toBeVisible();
    await expect(planner.verdictStamp).toBeVisible();
    await expectInsideViewport(planner.verdictStamp);

    for (const tab of ["Year by year", "Stress tests", "History", "Method", "Outcomes"]) {
      await planner.openTab(tab);
      await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
      await expectNoHorizontalOverflow(page);
    }

    await page.goto("/about");
    await expectNoHorizontalOverflow(page);
  });

  test("tooltips, the chart readout and an opened year stay on screen", async ({ planner, page }) => {
    await planner.openFresh();
    await planner.exploreExample();
    const pop = await planner.openInfo(page.locator(".verdict-q .info-icon"));
    await expectInsideViewport(pop);
    await page.keyboard.press("Escape");

    const plot = page.locator(".fan-plot");
    await plot.scrollIntoViewIfNeeded();
    const box = (await plot.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
    if (await page.locator(".fan-tip").count() === 0) await plot.click({ position: { x: box.width * 0.7, y: box.height / 2 } });
    await expect(page.locator(".fan-tip")).toBeVisible();
    await expectInsideViewport(page.locator(".fan-tip"));

    await planner.openTab("Year by year");
    await page.locator(".tab-body tbody tr[role=button]").nth(12).click();
    const card = page.locator(".breakdown");
    await expect(card).toBeVisible();
    await expectInsideViewport(card);
    await expectNoHorizontalOverflow(page);
  });

  test("the country picker is usable with search and keyboard", async ({ planner, page }) => {
    await planner.openFresh();
    await planner.welcome.locator(".country-picker button").click();
    const search = page.getByPlaceholder("Search countries");
    await expect(search).toBeFocused();
    await expectInsideViewport(page.locator(".country-list"));
    await search.fill("united");
    await expect(page.getByRole("option")).toHaveCount(2);
    await search.press("ArrowDown");
    await search.press("Enter");
    await expect(planner.welcome.locator(".country-picker button")).toContainText("United States");
  });
});
