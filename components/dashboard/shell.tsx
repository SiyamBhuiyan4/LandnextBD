"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2, Plus, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { useFmt } from "@/hooks/use-fmt";
import { errorMessage } from "@/lib/client";
import type { AccountType } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Seller area: checks the role client-side for UX; every Convex function re-checks it. */
export function DashboardShell({ children }: { children: ReactNode }) {
  const t = useTranslations("dashboard");
  const ta = useTranslations("account");
  const ts = useTranslations("sellerType");
  const viewer = useQuery(api.users.viewer);
  const newInquiries = useQuery(api.dashboard.newInquiryCount) ?? 0;
  const fmt = useFmt();
  const become = useMutation(api.users.becomeSeller);
  const pathname = usePathname();
  const [type, setType] = useState<AccountType>("owner");
  const [busy, setBusy] = useState(false);

  if (viewer === undefined) return <div className="container-page py-20 text-center"><Loader2 className="mx-auto animate-spin" /></div>;
  // Signed in (the proxy let us through) but no usable account: suspended or a stale session.
  if (viewer === null) return <NoAccount />;

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
              try {
                await become({ accountType: type });
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" />} {ta("startSelling")}
          </Button>
        </div>
      </div>
    );

  const nav = [
    { href: "/dashboard", label: t("overview") },
    { href: "/dashboard/listings", label: t("myListings") },
    { href: "/dashboard/inquiries", label: t("inbox"), badge: newInquiries },
  ];
  return (
    <div className="container-page py-6">
      <div className="mb-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-heading text-xl font-bold sm:text-2xl">{t("title")}</h1>
          <Link
            href="/dashboard/listings/new"
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition",
              pathname === "/dashboard/listings/new" ? "bg-primary text-primary-foreground" : "bg-warm text-warm-foreground hover:bg-warm/90",
            )}
          >
            <Plus className="size-4" /> {t("postLand")}
          </Link>
        </div>
        {/* Wraps instead of scrolling, so every tab is always visible. */}
        <nav className="flex flex-wrap items-center gap-1" aria-label={t("title")}>
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={pathname === n.href ? "page" : undefined}
              className={cn(
                "inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium transition",
                pathname === n.href ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {n.label}
              {!!n.badge && (
                <span className="ml-1.5 rounded-full bg-warm px-1.5 py-0.5 text-[11px] font-bold text-warm-foreground tabular-nums" aria-label={t("newInquiriesBadge", { n: n.badge })}>
                  {n.badge > 99 ? "99+" : fmt.digits(n.badge)}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}

/** Shown when the session no longer maps to an active account (e.g. suspended). */
export function NoAccount() {
  const t = useTranslations("account");
  return (
    <div className="container-page grid min-h-[50vh] place-items-center py-12 text-center">
      <div className="max-w-sm">
        <ShieldAlert className="mx-auto size-10 text-muted-foreground" />
        <h1 className="mt-3 font-heading text-xl font-bold">{t("noAccountTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("noAccountBody")}</p>
        <Link href="/signin" className={cn(buttonVariants({ variant: "outline" }), "mt-4")}>
          {t("signInAgain")}
        </Link>
      </div>
    </div>
  );
}
