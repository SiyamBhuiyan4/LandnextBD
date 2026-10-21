"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import type { AccountType } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Seller area: checks the role client-side for UX; every Convex function re-checks it. */
export function DashboardShell({ children }: { children: ReactNode }) {
  const t = useTranslations("dashboard");
  const ta = useTranslations("account");
  const ts = useTranslations("sellerType");
  const viewer = useQuery(api.users.viewer);
  const become = useMutation(api.users.becomeSeller);
  const pathname = usePathname();
  const [type, setType] = useState<AccountType>("owner");
  const [busy, setBusy] = useState(false);

  if (viewer === undefined) return <div className="container-page py-20 text-center"><Loader2 className="mx-auto animate-spin" /></div>;
  if (viewer === null) return null; // proxy redirects to /signin

  if (viewer.role === "buyer")
    return (
      <div className="container-page grid min-h-[60vh] place-items-center py-12">
        <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-soft">
          <h1 className="font-heading text-xl font-bold">{ta("startSelling")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("becomeSeller")}</p>
          <fieldset className="mt-4 space-y-2">
            <legend className="mb-1 text-sm font-medium">{ta("accountType")}</legend>
            {(["owner", "broker", "company"] as const).map((k) => (
              <label key={k} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", type === k && "border-primary bg-secondary")}>
                <input type="radio" checked={type === k} onChange={() => setType(k)} className="accent-[var(--primary)]" /> {ts(k)}
              </label>
            ))}
          </fieldset>
          <Button
            className="mt-4 w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await become({ accountType: type });
              setBusy(false);
            }}
          >
            {ta("startSelling")}
          </Button>
        </div>
      </div>
    );

  const nav = [
    { href: "/dashboard", label: t("overview") },
    { href: "/dashboard/listings", label: t("myListings") },
    { href: "/dashboard/inquiries", label: t("inbox") },
  ];
  return (
    <div className="container-page py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>
        <nav className="scrollbar-none -mx-4 flex items-center gap-1 overflow-x-auto px-4" aria-label={t("title")}>
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition",
                pathname === n.href ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {n.label}
            </Link>
          ))}
          <Link
            href="/dashboard/listings/new"
            className={cn(
              "ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition",
              pathname === "/dashboard/listings/new" ? "bg-primary text-primary-foreground" : "bg-warm text-warm-foreground hover:bg-warm/90",
            )}
          >
            <Plus className="size-4" /> {t("postLand")}
          </Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
