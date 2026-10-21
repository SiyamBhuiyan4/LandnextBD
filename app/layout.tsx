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
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const bengali = Noto_Sans_Bengali({ subsets: ["bengali"], variable: "--font-bengali", display: "swap", weight: ["400", "500", "600", "700"] });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${BRAND.site} — Land & plots for sale in Bangladesh`, template: `%s · ${BRAND.site}` },
    description: t("heroSubtitle"),
    openGraph: { siteName: BRAND.site, type: "website", locale: "en_BD", alternateLocale: ["bn_BD"] },
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
              <main id="main" className="flex-1">
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
