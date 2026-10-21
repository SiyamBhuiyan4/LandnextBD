"use client";

import { useQuery } from "convex/react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { MapPin } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRef } from "react";
import { api } from "@/convex/_generated/api";
import { HeroSearch } from "@/components/search/hero-search";

/** Deep-green illustrated hero: layered fields + surveyed plot lines, search front and centre. */
export function Hero() {
  const t = useTranslations("home");
  const locale = useLocale();
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const yBack = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 50]);
  const yFront = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 100]);
  const tree = useQuery(api.areas.hierarchy);
  const popular = (tree ?? [])
    .flatMap((d) => d.districts.flatMap((x) => x.areas))
    .sort((a, b) => b.activeCount - a.activeCount)
    .slice(0, 6);
  // Same initial/animate on server and client (no hydration mismatch); reduced motion just makes it instant.
  const fade = (delay: number) => ({
    initial: { opacity: 1, y: 14 }, // never hidden before hydration: headline is the LCP and search must be usable at once
    animate: { opacity: 1, y: 0 },
    transition: reduce ? { duration: 0 } : { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const },
  });

  return (
    <section ref={ref} className="relative isolate overflow-hidden bg-brand-deep text-brand-deep-foreground">
      {/* Warm sunrise glow + grain */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_85%_-10%,color-mix(in_oklch,var(--warm)_38%,transparent),transparent_70%),radial-gradient(50rem_30rem_at_0%_110%,color-mix(in_oklch,var(--hero-glow)_70%,transparent),transparent_70%)]" />
      <div className="bg-noise absolute inset-0 -z-10 opacity-60 mix-blend-overlay" aria-hidden />
      <motion.svg style={{ y: yBack }} className="absolute inset-x-0 bottom-0 -z-10 h-[55%] w-full text-white/[0.05]" viewBox="0 0 1440 500" preserveAspectRatio="none" aria-hidden>
        <path d="M0 260C240 200 420 300 720 240s520-90 720-30v330H0Z" fill="currentColor" />
        <path d="M0 340c260-50 520 40 760-10s460-70 680-20v190H0Z" fill="currentColor" />
      </motion.svg>
      <motion.svg style={{ y: yFront }} className="absolute inset-x-0 bottom-0 -z-10 h-[38%] w-full" viewBox="0 0 1440 300" preserveAspectRatio="none" aria-hidden>
        <defs>
          <pattern id="plots" width="120" height="60" patternUnits="userSpaceOnUse" patternTransform="skewX(-30)">
            <rect width="120" height="60" fill="none" stroke="white" strokeOpacity=".12" strokeWidth="1.5" strokeDasharray="6 6" />
          </pattern>
        </defs>
        <path d="M0 120c300-40 700 30 1000-10s340-20 440 0v190H0Z" fill="var(--warm)" opacity=".1" />
        <rect y="120" width="1440" height="180" fill="url(#plots)" />
      </motion.svg>

      <div className="container-page pt-12 pb-20 sm:pt-20 sm:pb-28">
        <motion.div {...fade(0)} className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur">
            <span className="size-1.5 rounded-full bg-warm" /> {t("heroEyebrow")}
          </p>
          <h1 className="mt-5 font-heading text-[2.1rem] leading-[1.08] font-extrabold tracking-tight sm:text-5xl lg:text-[3.6rem]">{t("heroTitle")}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-brand-deep-foreground/80 sm:text-lg">{t("heroSubtitle")}</p>
        </motion.div>
        <motion.div {...fade(0.12)} className="mx-auto mt-8 max-w-5xl sm:mt-10">
          <HeroSearch />
        </motion.div>
        <motion.div {...fade(0.22)} className="mx-auto mt-5 flex max-w-5xl flex-wrap items-center justify-center gap-2 text-sm">
          <span className="font-medium text-brand-deep-foreground/75">{t("popularSearches")}</span>
          {tree === undefined
            ? Array.from({ length: 5 }, (_, i) => <span key={i} className="h-7 w-20 animate-pulse rounded-full bg-white/10" />)
            : popular.map((a) => (
                <Link
                  key={a._id}
                  href={`/browse?area=${a.slug}`}
                  className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-3 py-1 font-medium backdrop-blur transition hover:border-warm/60 hover:bg-white/15"
                >
                  <MapPin className="size-3.5 text-warm" aria-hidden />
                  {locale === "bn" && a.areaNameBn ? a.areaNameBn : a.areaName}
                </Link>
              ))}
        </motion.div>
      </div>
    </section>
  );
}
