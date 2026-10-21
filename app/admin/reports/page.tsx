"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useFmt } from "@/hooks/use-fmt";
import { cn } from "@/lib/utils";

type S = "open" | "reviewed" | "dismissed";

export default function AdminReports() {
  const t = useTranslations("admin");
  const tr = useTranslations("reportReason");
  const fmt = useFmt();
  const [status, setStatus] = useState<S>("open");
  const rows = useQuery(api.admin.reports, { status });
  const resolve = useMutation(api.admin.resolveReport);
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {(["open", "reviewed", "dismissed"] as const).map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)} className={cn("rounded-full border px-3 py-1.5 text-xs font-medium capitalize", status === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {s}
          </button>
        ))}
      </div>
      {rows?.length === 0 && <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">—</p>}
      <ul className="space-y-3">
        {rows?.map((r) => (
          <li key={r._id} className="rounded-2xl border bg-card p-4 text-sm shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{tr(r.reason)}</p>
                <p className="text-xs text-muted-foreground">
                  {r.reporterName} · {fmt.ago(r.createdAt)}
                </p>
              </div>
              {r.listing && (
                <Link href={`/admin/review/${r.listingId}`} className="text-primary hover:underline">
                  {r.listing.title}
                </Link>
              )}
            </div>
            {r.details && <p className="mt-2 text-muted-foreground">{r.details}</p>}
            {r.status === "open" && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => resolve({ id: r._id, status: "reviewed" })}>
                  {t("resolve")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => resolve({ id: r._id, status: "dismissed" })}>
                  {t("dismiss")}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
