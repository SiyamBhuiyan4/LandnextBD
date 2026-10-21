import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

// Requires: `npx convex env set AUTH_DEV_OTP_CODE 246810` on the DEV deployment
// and E2E_OTP_CODE=246810 in the shell running Playwright. Never set it on prod.
const CODE = process.env.E2E_OTP_CODE;
test.skip(!CODE, "Set E2E_OTP_CODE (and AUTH_DEV_OTP_CODE on the dev deployment) to run auth flows");

const run = Date.now().toString(36);
const sellerEmail = `e2e.seller.${run}@landnestbd.test`;
const adminEmail = `e2e.admin.${run}@landnestbd.test`;
const title = `E2E plot ${run} near the lake`;

async function signIn(page: Page, email: string, next = "/") {
  await page.goto(`/signin?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("6-digit code").fill(CODE!);
  await page.getByRole("button", { name: /Verify/ }).click();
  await expect(page.getByRole("button", { name: "Account" })).toBeVisible();
}

test.describe.serial("seller posts, admin approves", () => {
  test("seller creates a listing through the wizard", async ({ page }) => {
    await signIn(page, sellerEmail, "/dashboard");
    await page.getByRole("button", { name: "Start selling" }).click();
    await page.goto("/dashboard/listings/new");
    await page.getByLabel("Listing title").fill(title);
    await page.getByLabel("Land size").fill("4");
    await page.getByLabel("Total price (BDT)").fill("9000000");
    await page.getByLabel("Description").fill("End-to-end test listing with a south-facing frontage and a 30 ft road.");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("combobox").fill("Purba");
    await page.getByRole("option", { name: /Purbachal/ }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click(); // saves draft
    await step(page, "Details");
    await page.getByRole("button", { name: "Electricity" }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await step(page, "Documents");
    await page.getByRole("button", { name: "Next", exact: true }).click(); // documents (optional)
    await step(page, "Photos");
    await page.locator('input[type="file"]').setInputFiles({ name: "plot.png", mimeType: "image/png", buffer: tinyPng() });
    await expect(page.locator("main ul img")).toHaveCount(1);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await step(page, "Videos");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await step(page, "Review");
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page).toHaveURL(/\/dashboard\/listings$/);
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText("In review").first()).toBeVisible();
  });

  test("admin approves it and it goes live", async ({ page }) => {
    await signIn(page, adminEmail);
    execFileSync("npx", ["convex", "run", "users:setRole", JSON.stringify({ email: adminEmail, role: "admin" })]);
    await page.goto("/admin/review");
    await page.getByText(title).click();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/review$/);
    await page.goto("/browse?q=" + encodeURIComponent(run));
    await expect(page.getByText(title)).toBeVisible();
  });
});

const step = (page: Page, name: string) => expect(page.getByRole("heading", { level: 2, name, exact: true })).toBeVisible();

/** 2x2 PNG generated in memory. */
function tinyPng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNk+M/AwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==",
    "base64",
  );
}
