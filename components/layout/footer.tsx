import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LogoMark } from "@/components/icons";
import { Wordmark } from "@/components/layout/wordmark";
import { LAND_TYPES } from "@/lib/constants";
import { landTypeToSlug } from "@/lib/urls";

export async function Footer() {
  const t = await getTranslations("footer");
  const tc = await getTranslations("common");
  const tl = await getTranslations("landType");
  return (
    <footer className="mt-16 border-t bg-secondary/40">
      <div className="container-page grid gap-10 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <Link href="/" className="flex items-center gap-2 font-heading text-lg font-bold">
            <LogoMark size={28} /> <Wordmark />
          </Link>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">{t("about")}</p>
          <div className="mt-6 flex max-w-lg gap-3 rounded-xl border border-warm/40 bg-accent/60 p-4 text-sm text-accent-foreground">
            <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">{t("disclaimerTitle")}</p>
              <p className="mt-1 leading-relaxed">{t("disclaimer")}</p>
            </div>
          </div>
        </div>
        <div>
          <h2 className="text-sm font-semibold">{t("explore")}</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {LAND_TYPES.slice(0, 5).map((lt) => (
              <li key={lt}>
                <Link href={`/browse?landType=${lt}`} className="hover:text-foreground">
                  {tl(lt)}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/videos" className="hover:text-foreground">
                {tc("videos")}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold">{t("sell")}</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link href="/dashboard/listings/new" className="hover:text-foreground">
                {tc("postAd")}
              </Link>
            </li>
            <li>
              <Link href="/dashboard" className="hover:text-foreground">
                {tc("dashboard")}
              </Link>
            </li>
            <li>
              <Link href={`/land/purbachal/${landTypeToSlug("residential")}`} className="hover:text-foreground">
                Purbachal
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t py-5 text-center text-xs text-muted-foreground">{t("rights", { year: new Date().getFullYear() })}</div>
    </footer>
  );
}
