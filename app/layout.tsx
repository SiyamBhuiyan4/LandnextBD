import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import type { Metadata, Viewport } from "next";
import { Noto_Sans_Bengali, Plus_Jakarta_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { CompareBar } from "@/components/listings/compare-bar";
import { Providers } from "@/components/providers";
import { BRAND } from "@/lib/constants";
import { SITE_URL } from "@/lib/seo";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
// Not preloaded: English pages only need it for the "বাংলা" toggle, and the ~100 KB file was competing with
// the LCP image. Browsers still fetch it as soon as Bengali glyphs render (unicode-range).
const bengali = Noto_Sans_Bengali({ subsets: ["bengali"], variable: "--font-bengali", display: "swap", weight: ["400", "500", "600", "700"], preload: false });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
  const bn = (await getLocale()) === "bn";
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${BRAND.site} — Land & plots for sale in Bangladesh`, template: `%s · ${BRAND.site}` },
    description: t("heroSubtitle"),
    openGraph: { siteName: BRAND.site, type: "website", locale: bn ? "bn_BD" : "en_BD", alternateLocale: [bn ? "en_BD" : "bn_BD"] },
    twitter: { card: "summary_large_image" },
    icons: { icon: "/brand/icon.svg" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f9f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1a16" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang={locale} className={`${jakarta.variable} ${bengali.variable} h-full antialiased`} suppressHydrationWarning>
        <body className="flex min-h-full flex-col" suppressHydrationWarning>
          <NextIntlClientProvider>
            <Providers>
              <Header />
              {/* min-height keeps the footer below the fold until streamed page content arrives (was CLS 0.83 on mobile) */}
              <main id="main" className="min-h-[calc(100dvh-4rem)] flex-1">
                {children}
              </main>
              <Footer />
              <CompareBar />
            </Providers>
          </NextIntlClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
