import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator("#password").fill("buildstax-local");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/dashboard", { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Command center" })).toBeVisible();
}

test("publishes the AI website line as the public home page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "BuildStax." })).toBeVisible();
  const call = page.getByRole("link", { name: "Call BuildStax at +1 (330) 737-7690" });
  await expect(call).toHaveAttribute("href", "tel:+13307377690");
  await expect(page.getByText("NO SIGNUP REQUIRED", { exact: true })).toBeVisible();
  await expect(page.getByAltText("A drought-aware garden website concept created from a BuildStax brief")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("rejects invalid credentials and accepts the sandbox operator", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#password").fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.locator('[role="alert"]').filter({
      hasText: "Email or password is incorrect",
    }),
  ).toBeVisible();
  await page.locator("#password").fill("buildstax-local");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/dashboard", { timeout: 15_000 });
});

test("associates server validation errors with invalid sign-in fields", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill("");
  await page.locator("#password").fill("");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("#email")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#email")).toHaveAttribute("aria-describedby", "email-error");
  await expect(page.locator("#email-error")).toHaveText("Enter a valid email address.");
  await expect(page.locator("#password")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#password")).toHaveAttribute("aria-describedby", "password-error");
  await expect(page.locator("#password-error")).toHaveText("Password must contain at least 8 characters.");
});

test("loads every protected route and keeps navigation functional", async ({ page }) => {
  await signIn(page);
  const routes = [
    ["Pipeline", "/pipeline", "Pipeline"],
    ["Prospecting", "/prospecting", "Prospecting"],
    ["Campaigns & pitch", "/campaigns", "Campaigns & pitch"],
    ["Build studio", "/build-studio", "Build studio"],
    ["Automation runs", "/runs", "Automation runs"],
    ["Integrations", "/integrations", "Integrations"],
    ["Settings", "/settings", "Settings"],
  ] as const;
  for (const [, path] of routes) {
    const response = await page.request.get(path);
    expect(response.ok()).toBe(true);
  }
  for (const [link, path, heading] of routes) {
    await page.getByRole("link", { name: link, exact: true }).click();
    await expect(page).toHaveURL(path, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
});

test("shows governed prospecting and the artifact build surface", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Prospecting", exact: true }).click();
  await expect(page.getByRole("region", { name: "Prospecting discovery" })).toBeVisible();
  await expect(page.getByText("Sandbox", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Build studio", exact: true }).click();
  await expect(page.getByTitle("Tide & Timber Landscaping customer preview")).toBeVisible();
  await expect(page.getByText("ARTIFACT FILES", { exact: true })).toBeVisible();
});

test("creates a persistent call-ready business without duplicate submission", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Add business" }).click();
  await page.getByLabel("Business name").fill("E2E Harbor Clock Repair");
  await page.getByLabel("Category").fill("Clock repair");
  await page.getByLabel("Location").fill("Alameda, CA");
  await page.getByLabel("Phone").fill("+1 510 555 0999");
  await page.getByRole("button", { name: "Add to pipeline" }).click();
  await expect(page).toHaveURL(/\/businesses\/biz_/);
  await expect(page.getByRole("heading", { name: "E2E Harbor Clock Repair" })).toBeVisible();
  await expect(page.locator("span").getByText("Ready to call", { exact: true })).toBeVisible();
});

test("rejects a quote below the computed pricing floor and accepts a safe quote", async ({ page }) => {
  await signIn(page);
  await page.goto("/businesses/biz_marlowe");
  await page.getByRole("button", { name: "Create quote" }).click();
  await page.getByLabel("Estimated delivery cost").fill("1000");
  await page.getByLabel("Customer price").fill("1500");
  await page.getByRole("button", { name: "Record quote" }).click();
  await expect(page.getByRole("alert")).toContainText("cannot be lower than $2,000");
  await page.getByLabel("Customer price").fill("2600");
  await page.getByRole("button", { name: "Record quote" }).click();
  await expect(page.getByText("Quote recorded and ready for follow-up.")).toBeVisible();
});

test("accepts customer preview feedback and returns it to review", async ({ page }) => {
  await page.goto("/preview/tide-timber-review-7f3c");
  await expect(page.getByRole("heading", { name: "Tide & Timber Landscaping" })).toBeVisible();
  await expect(page.getByAltText(/Drought-aware East Bay garden/)).toBeVisible();
  await page.getByRole("button", { name: "Request a change" }).click();
  await page.getByLabel("Your email").fill("sam@example.test");
  await page.getByLabel("What should change?").fill("Please move the consultation call to action above the approach section and keep the existing visual direction.");
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText("Feedback received. It is now in the project review queue.")).toBeVisible();
});

test("keeps outbound messaging unavailable on do-not-call records", async ({ page }) => {
  await signIn(page);
  await page.goto("/businesses/biz_harborview");
  await expect(page.getByRole("button", { name: "Log call" })).toBeDisabled();
  await page.getByRole("button", { name: "Log inbound or note" }).click();
  await expect(page.getByText("Outbound follow-up is permanently disabled for this do-not-call record.")).toBeVisible();
  await expect(page.getByLabel("Type")).toHaveValue("inbound");
  await expect(page.getByLabel("Type").locator('option[value="outbound"]')).toHaveCount(0);
});

test("landing, dashboard, and preview have no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  const landingResults = await new AxeBuilder({ page }).analyze();
  expect(landingResults.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
  await signIn(page);
  const dashboardResults = await new AxeBuilder({ page }).analyze();
  expect(dashboardResults.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
  await page.goto("/preview/tide-timber-review-7f3c");
  const previewResults = await new AxeBuilder({ page }).analyze();
  expect(previewResults.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
});

test("health endpoint reports the database", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ status: "ok", database: true });
});
