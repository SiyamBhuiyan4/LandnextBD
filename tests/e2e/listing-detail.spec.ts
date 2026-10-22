import { expect, test, type Page } from "@playwright/test";

// Listing detail page + buyer <-> seller contact. Guest checks always run; the inquiry flow
// needs E2E_OTP_CODE (and AUTH_DEV_OTP_CODE on the dev deployment), like seller-admin.spec.ts.
const CODE = process.env.E2E_OTP_CODE;

/** Opens the first listing in an area that has a playable video (seed data has several). */
async function openListingWithVideo(page: Page) {
  await page.goto("/land/uttara");
  const hrefs = await page.locator("article h3 a").evaluateAll((as) => as.map((a) => a.getAttribute("href")!).slice(0, 8));
  for (const href of hrefs) {
    await page.goto(href);
    const play = page.getByRole("button", { name: /^Play video/ }).first();
    if (await play.waitFor({ timeout: 8_000 }).then(() => true, () => false)) return;
  }
  throw new Error("No listing with a video found in Uttara");
}

test("detail page shows ad info, safety tips, share and guarded report", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/land/purbachal");
  await page.locator("article h3 a").first().click();
  await expect(page).toHaveURL(/\/land\/purbachal\/[a-z-]+\/[\w-]+$/);
  await expect(page.getByText(/^Ad ID:/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stay safe when buying land" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in to contact the seller" })).toBeVisible();

  await page.getByRole("button", { name: "Share", exact: true }).click();
  const share = page.getByRole("dialog");
  await expect(share.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);
  await share.getByRole("button", { name: "Copy link" }).first().click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url().split("?")[0]);
  await page.keyboard.press("Escape");

  // Guests are sent to sign in instead of seeing a report form that would fail.
  await page.getByRole("button", { name: "Report" }).first().click();
  await expect(page).toHaveURL(/\/signin\?next=%2Fland%2F/);
});

test("missing listing returns 404", async ({ page }) => {
  const res = await page.goto("/land/purbachal/residential/this-plot-does-not-exist-zz9");
  expect(res?.status()).toBe(404);
});

test("a listing video plays from /media in the lightbox", async ({ page }) => {
  await openListingWithVideo(page);
  await page.getByRole("button", { name: /^Play video/ }).first().click();
  const video = page.getByRole("dialog").locator("video");
  await expect(video).toBeVisible();
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentSrc)).toContain("/media/");
  await expect.poll(async () => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 30_000 }).toBeGreaterThan(0.5);
});

test.describe("signed-in buyer", () => {
  test.skip(!CODE, "Set E2E_OTP_CODE (and AUTH_DEV_OTP_CODE on the dev deployment) to run auth flows");

  test("validates, sends an inquiry and reveals call + WhatsApp", async ({ page }) => {
    const email = `e2e.buyer.${Date.now().toString(36)}@landnestbd.test`;
    await page.goto("/signin?next=%2F");
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByLabel("6-digit code").fill(CODE!);
    await expect(page.getByRole("button", { name: "Account" })).toBeVisible();

    await page.goto("/land/uttara");
    await page.locator("article h3 a").first().click();
    await expect(page.locator("#inq-phone")).toBeVisible();
    await page.locator("#inq-phone").fill("12345");
    await page.getByRole("button", { name: "Send inquiry" }).click();
    await expect(page.getByText("Enter a valid Bangladeshi mobile number.")).toBeVisible();

    await page.locator("#inq-msg").fill("Is this plot still available? I would like to visit this week.");
    await page.locator("#inq-phone").fill("01712345678");
    await page.getByRole("button", { name: "Send inquiry" }).click();
    await expect(page.getByText("You've contacted this seller.")).toBeVisible();
    await expect(page.locator('#contact a[href^="tel:"]').first()).toBeVisible();
    await expect(page.locator('#contact a[href^="https://wa.me/"]').first()).toHaveAttribute("href", /^https:\/\/wa\.me\/8801\d{9}$/);

    await page.goto("/inquiries");
    await expect(page.getByText("Is this plot still available?")).toBeVisible();
  });
});
