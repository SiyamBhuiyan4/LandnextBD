import { fetchQuery } from "convex/nextjs";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { api } from "@/convex/_generated/api";
import { LandTypeIcons, LogoMark } from "@/components/icons";
import { Wordmark } from "@/components/layout/wordmark";
import { BRAND, LAND_TYPES } from "@/lib/constants";

async function topAreas() {
  try {
    const all = await fetchQuery(api.areas.all, {});
    return all.sort((a, b) => b.activeCount - a.activeCount).slice(0, 6);
  } catch {
    return [];
  }
}

const linkCls = "rounded-sm text-muted-foreground transition-colors hover:text-foreground";

function Col({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-heading text-sm font-bold">{title}</h2>
      <ul className="mt-4 space-y-2.5 text-sm">{children}</ul>
    </div>
  );
}

export async function Footer() {
  const t = await getTranslations("footer");
  const tc = await getTranslations("common");
  const tl = await getTranslations("landType");
  const locale = await getLocale();
  const areas = await topAreas();
  return (
    <footer className="mt-20 border-t bg-surface">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div className="sm:col-span-2 lg:col-span-1">
          <Link href="/" className="inline-flex items-center gap-2 font-heading text-lg font-bold" aria-label={`${BRAND.site} home`}>
            <LogoMark size={30} /> <Wordmark />
          </Link>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {t("about")} {t("madeIn")}
          </p>
          <div className="mt-6 flex max-w-md gap-3 rounded-2xl border border-warm/40 bg-accent/60 p-4 text-sm text-accent-foreground">
            <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">{t("disclaimerTitle")}</p>
              <p className="mt-1 leading-relaxed">{t("disclaimer")}</p>
            </div>
          </div>
        </div>
        <Col title={t("landTypes")}>
          {LAND_TYPES.map((lt) => {
            const Icon = LandTypeIcons[lt];
            return (
              <li key={lt}>
                <Link href={`/browse?landType=${lt}`} className={`${linkCls} inline-flex items-center gap-2`}>
                  <Icon size={15} /> {tl(lt)}
                </Link>
              </li>
            );
          })}
        </Col>
        <Col title={t("popularAreas")}>
          {areas.map((a) => (
            <li key={a._id}>
              <Link href={`/land/${a.slug}`} className={linkCls}>
                {locale === "bn" && a.areaNameBn ? a.areaNameBn : a.areaName}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/browse" className="font-semibold text-primary hover:underline">
              {tc("browse")} →
            </Link>
          </li>
        </Col>
        <Col title={t("company")}>
          <li>
            <Link href="/videos" className={linkCls}>
              {tc("videos")}
            </Link>
          </li>
          <li>
            <Link href="/compare" className={linkCls}>
              {tc("compare")}
            </Link>
          </li>
          <li>
            <Link href="/dashboard/listings/new" className={linkCls}>
              {tc("postAd")}
            </Link>
          </li>
          <li>
            <Link href="/dashboard" className={linkCls}>
              {tc("dashboard")}
            </Link>
          </li>
        </Col>
      </div>
      <div className="border-t">
        <p className="container-page py-5 text-center text-xs text-muted-foreground">{t("rights", { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}
