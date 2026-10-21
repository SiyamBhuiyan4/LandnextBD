import { expect, test } from "@playwright/test";

test("search by area from the home page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("combobox").first().fill("Purba");
  await page.getByRole("option", { name: /Purbachal/ }).click();
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/browse\?area=purbachal/);
  await expect(page.getByText(/\d+ listings?/)).toBeVisible();
  const cards = page.locator("article");
  await expect(cards.first()).toBeVisible();
  for (const text of await cards.locator("p").filter({ hasText: "Narayanganj" }).allTextContents()) expect(text).toContain("Purbachal");
});

test("filters live in the URL and survive reload", async ({ page }) => {
  await page.goto("/browse?landType=residential&verifiedOnly=1&sort=price_desc");
  await expect(page.locator("article").first()).toBeVisible();
  await page.reload();
  const filters = page.getByRole("button", { name: /^Filters/ });
  if (await filters.isVisible()) await filters.click(); // mobile: filters live in a bottom sheet
  await expect(page.getByRole("button", { name: /Residential/ }).first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#sort")).toHaveValue("price_desc");
});

test("view a listing detail page with facts and SEO tags", async ({ page }) => {
  await page.goto("/land/purbachal");
  await page.locator("article h3 a").first().click();
  await expect(page).toHaveURL(/\/land\/purbachal\/[a-z-]+\/[\w-]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Price per katha")).toBeVisible();
  await expect(page.getByText(/Approximate location/)).toBeVisible();
  const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
  expect(JSON.parse(jsonLd!)["@type"]).toBe("RealEstateListing");
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
});

test("watch a video in the gallery", async ({ page }) => {
  await page.goto("/videos");
  await page.locator("main button").filter({ has: page.locator("img") }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const video = dialog.locator("video");
  await expect(video).toBeVisible();
  await expect.poll(async () => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 30_000 }).toBeGreaterThan(0.5);
  await expect(dialog.getByText("Related videos")).toBeVisible();
});

test("language toggle switches to Bangla", async ({ page }) => {
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Menu" });
  if (await menu.isVisible()) await menu.click(); // mobile: language toggle is in the menu sheet
  await page.getByRole("button", { name: /বাংলা/ }).filter({ visible: true }).first().click();
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  await expect(page.getByText("সক্রিয় বিজ্ঞাপন", { exact: true })).toBeVisible();
});
