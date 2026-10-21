"use client";

import { useQuery } from "convex/react";
import { Loader2, ShieldX } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations("admin");
  const viewer = useQuery(api.users.viewer);
  const pathname = usePathname();
  if (viewer === undefined) return <div className="container-page py-20 text-center"><Loader2 className="mx-auto animate-spin" /></div>;
  if (!viewer || viewer.role !== "admin")
    return (
      <div className="container-page grid min-h-[50vh] place-items-center text-center">
        <div>
          <ShieldX className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">403</p>
        </div>
      </div>
    );
  const nav = [
    ["/admin", t("overview")],
    ["/admin/review", t("queue")],
    ["/admin/promotions", t("promotions")],
    ["/admin/users", t("users")],
    ["/admin/reports", t("reports")],
    ["/admin/videos", t("videos")],
  ] as const;
  return (
    <div className="container-page py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>
        <nav className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4" aria-label={t("title")}>
          {nav.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "shrink-0 rounded-lg px-3 py-2 text-sm font-medium",
                (href === "/admin" ? pathname === href : pathname.startsWith(href)) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
