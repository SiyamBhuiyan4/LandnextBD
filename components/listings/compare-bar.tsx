"use client";

import { GitCompareArrows, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCompare } from "@/components/providers";
import { buttonVariants } from "@/components/ui/button";
import { useFmt } from "@/hooks/use-fmt";

export function CompareBar() {
  const { ids, clear } = useCompare();
  const pathname = usePathname();
  const t = useTranslations("compare");
  const fmt = useFmt();
  if (ids.length === 0 || pathname.startsWith("/compare") || pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) return null;
  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4" role="region" aria-label={t("title")}>
      <div className="flex items-center gap-3 rounded-full border bg-background/95 py-2 pr-2 pl-4 shadow-lg backdrop-blur">
        <GitCompareArrows className="size-4 text-primary" aria-hidden />
        <span className="text-sm font-medium">{t("bar", { count: fmt.digits(ids.length) })}</span>
        <Link href={`/compare?ids=${ids.join(",")}`} className={buttonVariants({ size: "sm" })}>
          {t("go")}
        </Link>
        <button type="button" onClick={clear} className="grid size-8 place-items-center rounded-full hover:bg-muted" aria-label={t("clear")}>
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
