"use client";

import { GitCompareArrows, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCompare } from "@/components/providers";
import { buttonVariants } from "@/components/ui/button";
import { useFmt } from "@/hooks/use-fmt";
import { cn } from "@/lib/utils";

export function CompareBar() {
  const { ids, clear } = useCompare();
  const pathname = usePathname();
  const t = useTranslations("compare");
  const fmt = useFmt();
  if (ids.length === 0 || pathname.startsWith("/compare") || pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 pb-[env(safe-area-inset-bottom)]" role="region" aria-label={t("title")}>
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border bg-background/95 py-2 pr-2 pl-4 shadow-elev-4 backdrop-blur-xl">
        <GitCompareArrows className="size-4 text-primary" aria-hidden />
        <span className="text-sm font-medium">{t("bar", { count: fmt.digits(ids.length) })}</span>
        <Link href={`/compare?ids=${ids.join(",")}`} className={cn(buttonVariants({ size: "sm" }), "rounded-full px-4 font-semibold")}>
          {t("go")}
        </Link>
        <button type="button" onClick={clear} className="grid size-8 place-items-center rounded-full hover:bg-muted" aria-label={t("clear")}>
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
