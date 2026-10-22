"use client";

import { useMutation, useQuery } from "convex/react";
import { Mail, Phone } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useFmt } from "@/hooks/use-fmt";
import type { LandType } from "@/lib/constants";
import { errorMessage } from "@/lib/client";
import { listingHref } from "@/lib/urls";
import { cn } from "@/lib/utils";

type Status = "new" | "replied" | "closed";

export default function InboxPage() {
  const t = useTranslations("dashboard");
  const ti = useTranslations("inquiries.status");
  const tc = useTranslations("common");
  const fmt = useFmt();
  const [filter, setFilter] = useState<Status | undefined>();
  const rows = useQuery(api.inquiries.inbox, { status: filter });
  const setStatusRaw = useMutation(api.inquiries.setStatus);
  const setStatus = (args: Parameters<typeof setStatusRaw>[0]) => setStatusRaw(args).catch((e) => toast.error(errorMessage(e)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="group">
        {([undefined, "new", "replied", "closed"] as const).map((s) => (
          <button
            key={s ?? "all"}
            type="button"
            aria-pressed={filter === s}
            onClick={() => setFilter(s)}
            className={cn("rounded-full border px-3 py-1.5 text-xs font-medium", filter === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {s ? (s === "new" ? t("inboxNew") : ti(s)) : tc("all")}
          </button>
        ))}
      </div>
      {rows === undefined ? (
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">{t("noInquiries")}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((i) => (
            <li key={i._id} className={cn("rounded-2xl border bg-card p-4 shadow-soft", i.status === "new" && "border-primary/50")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{t("inquiryFrom", { name: i.buyerName })}</p>
                  {i.listingSlug && i.listingAreaSlug && i.listingLandType ? (
                    <Link href={listingHref({ slug: i.listingSlug, areaSlug: i.listingAreaSlug, landType: i.listingLandType as LandType })} className="text-xs text-primary hover:underline">
                      {i.listingTitle}
                    </Link>
                  ) : (
                    <p className="text-xs text-muted-foreground">{i.listingTitle}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{fmt.ago(i.createdAt)}</span>
              </div>
              <p className="mt-2 text-sm whitespace-pre-line">{i.message}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a href={`tel:${i.contactPhone}`} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                  <Phone className="size-4" /> {i.contactPhone}
                </a>
                {i.buyerEmail && (
                  <a href={`mailto:${i.buyerEmail}`} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
                    <Mail className="size-4" /> {i.buyerEmail}
                  </a>
                )}
                <span className="ml-auto flex gap-1.5">
                  {i.status === "new" && (
                    <Button size="sm" onClick={() => setStatus({ id: i._id, status: "replied" })}>
                      {t("markReplied")}
                    </Button>
                  )}
                  {i.status !== "closed" ? (
                    <Button size="sm" variant="outline" onClick={() => setStatus({ id: i._id, status: "closed" })}>
                      {t("close")}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setStatus({ id: i._id, status: "new" })}>
                      {t("reopen")}
                    </Button>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
