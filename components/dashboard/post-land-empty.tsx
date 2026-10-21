"use client";

import { Camera, ClipboardList, Plus, Send } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Empty state for sellers with no listings: one big, obvious call to action. */
export function PostLandEmpty() {
  const t = useTranslations("dashboard.empty");
  const steps = [
    [ClipboardList, t("step1")],
    [Camera, t("step2")],
    [Send, t("step3")],
  ] as const;
  return (
    <div className="rounded-3xl border border-dashed bg-card p-6 text-center sm:p-10">
      <h2 className="font-heading text-2xl font-bold">{t("title")}</h2>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">{t("body")}</p>
      <ol className="mx-auto mt-6 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
        {steps.map(([Icon, label], i) => (
          <li key={label} className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3 text-sm sm:flex-col sm:text-center">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Icon className="size-5" />
            </span>
            <span>
              <span className="font-semibold">{i + 1}. </span>
              {label}
            </span>
          </li>
        ))}
      </ol>
      <Link href="/dashboard/listings/new" className={cn(buttonVariants({ size: "lg" }), "mt-6 h-14 w-full rounded-2xl px-8 text-base font-semibold sm:w-auto")}>
        <Plus className="size-5" /> {t("cta")}
      </Link>
    </div>
  );
}
