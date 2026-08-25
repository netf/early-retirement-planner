import { expect, test } from "./fixtures";

test("the About page states what it is, what it is not, and where feedback goes", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("About this planner");
  for (const heading of ["What it is", "What it is not", "Your figures", "Accuracy", "Terms", "Feedback"]) await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  await expect(page.getByText("It is not financial advice")).toBeVisible();
  await expect(page.getByRole("link", { name: "Report it on GitHub" })).toHaveAttribute("href", /github\.com\/netf\/early-retirement-planner\/issues/);
  await page.getByRole("link", { name: /Back to the planner/ }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".welcome, .verdict")).toBeVisible({ timeout: 60_000 });
});

test("the planner links to About from the masthead and the footer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "About", exact: true })).toHaveAttribute("href", "/about");
  await expect(page.getByRole("link", { name: "About, privacy and terms" })).toHaveAttribute("href", "/about");
});
