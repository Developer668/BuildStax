import { expect, test } from "@playwright/test";

test("mobile navigation and pipeline remain usable without horizontal viewport overflow", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#password").fill("buildstax-local");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Command center" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const navigationTrigger = page.getByRole("button", { name: "Open navigation" });
  await navigationTrigger.click();
  const navigationDialog = page.getByRole("dialog", { name: "Workspace navigation" });
  await expect(navigationDialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Close navigation" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(navigationDialog).toBeHidden();
  await expect(navigationTrigger).toBeFocused();
  await navigationTrigger.click();
  await page.getByRole("link", { name: "Pipeline", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pipeline", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Marlowe & Pine Cafe", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("customer preview preserves a visible next section on mobile", async ({ page }) => {
  await page.goto("/preview/tide-timber-review-7f3c");
  await expect(page.getByRole("heading", { name: "Tide & Timber Landscaping" })).toBeVisible();
  const heroBottom = await page.locator("main > section").first().evaluate((element) => element.getBoundingClientRect().bottom);
  expect(heroBottom).toBeLessThan(page.viewportSize()!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("prospecting and build studio stay within the mobile viewport", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#password").fill("buildstax-local");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Command center" })).toBeVisible();
  for (const [path, heading] of [["/prospecting", "Prospecting"], ["/build-studio", "Build studio"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await expect(page.getByTitle("Tide & Timber Landscaping local website preview")).toBeVisible();
});
