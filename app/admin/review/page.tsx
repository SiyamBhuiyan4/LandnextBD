"use client";

import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Check, CheckCircle2, ImageIcon, PlayCircle, XCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, buttonVariants } from "@/components/ui/button";
import { useFmt } from "@/hooks/use-fmt";
import { errorMessage } from "@/lib/client";
import { cn } from "@/lib/utils";

export default function ReviewQueue() {
  const t = useTranslations("admin");
  const fmt = useFmt();
  const rows = useQuery(api.admin.queue);
  const approve = useMutation(api.admin.approve);
  const [busy, setBusy] = useState<string | null>(null);
  if (rows === undefined) return <div className="h-64 skeleton rounded-2xl" />;
  if (rows.length === 0)
    return (
      <div className="grid place-items-center rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
        <CheckCircle2 className="mb-2 size-8 text-primary" />
        {t("emptyQueue")}
      </div>
    );
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("queueCount", { n: fmt.digits(rows.length) })}</p>
      <ul className="space-y-3">
        {rows.map((r) => {
          const clean = r.signals.flags.length === 0;
          return (
            <li key={r._id} className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-soft transition hover:border-primary/50 sm:flex-row">
              <Link href={`/admin/review/${r._id}`} className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl bg-muted sm:w-44">
                {r.coverUrl && <Image src={r.coverUrl} alt="" fill sizes="176px" className="object-cover" />}
                <span className="absolute bottom-1.5 left-1.5 flex gap-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[11px] text-white">
                    <ImageIcon className="size-3" /> {fmt.digits(r.imageCount)}
                  </span>
                  {r.hasVideo && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[11px] text-white">
                      <PlayCircle className="size-3" />
                    </span>
                  )}
                </span>
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/admin/review/${r._id}`} className="font-semibold hover:underline">
                  {r.title}
                </Link>
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
              <div className="flex shrink-0 gap-2 sm:w-36 sm:flex-col">
                <Link href={`/admin/review/${r._id}`} className={cn(buttonVariants({ variant: "outline" }), "flex-1 sm:flex-none")}>
                  {t("openReview")}
                </Link>
                <Button
                  className="flex-1 sm:flex-none"
                  variant={clean ? "default" : "outline"}
                  disabled={busy === r._id}
                  title={clean ? undefined : t("quickApproveWarn")}
                  onClick={async () => {
                    if (!clean && !confirm(t("quickApproveWarn"))) return;
                    setBusy(r._id);
                    try {
                      await approve({ id: r._id as Id<"listings"> });
                      toast.success(t("approvedToast"));
                    } catch (e) {
                      toast.error(errorMessage(e));
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  <Check /> {t("approve")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
