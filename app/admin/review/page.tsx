"use client";

import { useQuery } from "convex/react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useFmt } from "@/hooks/use-fmt";

export default function ReviewQueue() {
  const t = useTranslations("admin");
  const fmt = useFmt();
  const rows = useQuery(api.admin.queue);
  if (rows === undefined) return <div className="h-64 animate-pulse rounded-2xl bg-muted" />;
  if (rows.length === 0) return <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">{t("emptyQueue")}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r._id}>
          <Link href={`/admin/review/${r._id}`} className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-soft transition hover:border-primary/50 sm:flex-row">
            <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl bg-muted sm:w-40">{r.coverUrl && <Image src={r.coverUrl} alt="" fill sizes="160px" className="object-cover" />}</div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{r.title}</p>
              <p className="text-xs text-muted-foreground">
                {r.sellerName} · {r.areaName} · {fmt.price(r.price)} · {fmt.ago(r.submittedAt)}
              </p>
              <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                {Object.entries(r.signals.checklist).map(([k, ok]) => (
                  <li key={k} className="flex items-center gap-1.5">
                    {ok ? <CheckCircle2 className="size-3.5 text-primary" /> : <XCircle className="size-3.5 text-destructive" />}
                    {t(`check.${k}` as never)}
                  </li>
                ))}
              </ul>
              {r.signals.flags.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-1">
                  {r.signals.flags.map((f) => (
                    <span key={f} className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                      <AlertTriangle className="size-3" /> {t(`flags.${f}` as never)}
                    </span>
                  ))}
                </p>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
