"use client";

import { useQuery } from "convex/react";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { AdminGate } from "@/components/admin/admin-gate";

export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations("admin");
  const viewer = useQuery(api.users.viewer);
  const pathname = usePathname();
  if (viewer === undefined) return <div className="container-page py-20 text-center"><Loader2 className="mx-auto animate-spin" /></div>;
  if (!viewer || viewer.role !== "admin") return <AdminGate viewer={viewer} />;
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
        <div className="flex items-center gap-3">
          <Link href="/" className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden /> {t("backToSite")}
          </Link>
          <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>
        </div>
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
