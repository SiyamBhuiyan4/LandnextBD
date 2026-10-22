import { expect, test } from "@playwright/test";

// Site-wide SEO contract: crawlable URLs, structured data, noindex where it belongs, real 404s.
test.describe("SEO", () => {
  test.skip(({ isMobile }) => isMobile, "markup is identical on mobile");

  test("robots.txt and sitemap.xml list the public URLs", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /dashboard");
    expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toMatch(/<loc>[^<]*\/land\/[a-z0-9-]+<\/loc>/);
    expect(sitemap).toMatch(/<loc>[^<]*\/land\/[a-z0-9-]+\/[a-z-]+\/[\w-]+<\/loc>/);
  });

  test("home has canonical, OG image and Organization/WebSite JSON-LD", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
    const types = ld["@graph"].map((n: { "@type": string }) => n["@type"]);
    expect(types).toEqual(expect.arrayContaining(["Organization", "WebSite"]));
    expect(JSON.stringify(ld)).toContain("SearchAction");
  });

  test("area page has breadcrumb + item list JSON-LD", async ({ page }) => {
    await page.goto("/land/purbachal");
    await expect(page).toHaveTitle(/Purbachal/);
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
    expect(ld["@type"]).toBe("CollectionPage");
    expect(ld.breadcrumb["@type"]).toBe("BreadcrumbList");
    expect(ld.mainEntity.itemListElement.length).toBeGreaterThan(0);
  });

  test("unknown pages return 404 and private pages are noindex", async ({ request, page }) => {
    for (const url of ["/no-such-page", "/land/no-such-area", "/seller/x"]) expect((await request.get(url)).status(), url).toBe(404);
    await page.goto("/signin");
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  });
});
