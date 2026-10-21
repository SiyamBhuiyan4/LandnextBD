import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const LOCALES = ["en", "bn"] as const;
export type AppLocale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "NEXT_LOCALE";

// Locale lives in a cookie (no /en or /bn prefix) so listing URLs stay clean:
// /land/purbachal/residential/<slug>
export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  const locale: AppLocale = raw === "bn" ? "bn" : "en";
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: "Asia/Dhaka",
  };
});
