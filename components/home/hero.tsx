"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { HeroSearch } from "@/components/search/hero-search";

/** Original illustrated hero: layered fields and plot lines, light parallax. */
export function Hero() {
  const t = useTranslations("home");
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const yBack = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 60]);
  const yFront = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 120]);

  return (
    <section ref={ref} className="relative isolate overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[oklch(0.93_0.05_150)] via-[oklch(0.96_0.03_110)] to-background dark:from-[oklch(0.24_0.04_165)] dark:via-[oklch(0.2_0.025_165)]" />
      <motion.svg style={{ y: yBack }} className="absolute inset-x-0 bottom-0 -z-10 h-[70%] w-full text-primary/15" viewBox="0 0 1440 500" preserveAspectRatio="none" aria-hidden>
        <path d="M0 260C240 200 420 300 720 240s520-90 720-30v330H0Z" fill="currentColor" />
        <path d="M0 340c260-50 520 40 760-10s460-70 680-20v190H0Z" fill="currentColor" opacity=".8" />
      </motion.svg>
      <motion.svg style={{ y: yFront }} className="absolute inset-x-0 bottom-0 -z-10 h-[45%] w-full" viewBox="0 0 1440 300" preserveAspectRatio="none" aria-hidden>
        <defs>
          <pattern id="plots" width="120" height="60" patternUnits="userSpaceOnUse" patternTransform="skewX(-30)">
            <rect width="120" height="60" fill="none" stroke="var(--primary)" strokeOpacity=".18" strokeWidth="1.5" strokeDasharray="6 6" />
          </pattern>
        </defs>
        <path d="M0 120c300-40 700 30 1000-10s340-20 440 0v190H0Z" fill="var(--warm)" opacity=".14" />
        <rect y="120" width="1440" height="180" fill="url(#plots)" />
      </motion.svg>

      <div className="container-page pt-14 pb-16 sm:pt-20 sm:pb-24">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/70 px-3 py-1 text-xs font-semibold text-primary backdrop-blur">
            <span className="size-1.5 rounded-full bg-warm" /> {t("heroEyebrow")}
          </p>
          <h1 className="mt-4 font-heading text-4xl leading-[1.1] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">{t("heroTitle")}</h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">{t("heroSubtitle")}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="mt-8 max-w-5xl">
          <HeroSearch />
        </motion.div>
      </div>
    </section>
  );
}
