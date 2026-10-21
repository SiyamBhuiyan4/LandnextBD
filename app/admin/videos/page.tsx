"use client";

import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useFmt } from "@/hooks/use-fmt";
import { cn } from "@/lib/utils";

type M = "pending" | "approved" | "rejected";

export default function AdminVideos() {
  const t = useTranslations("admin");
  const fmt = useFmt();
  const [m, setM] = useState<M>("pending");
  const rows = useQuery(api.admin.videoQueue, { moderation: m });
  const moderate = useMutation(api.admin.moderateVideo);
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <button key={s} type="button" aria-pressed={m === s} onClick={() => setM(s)} className={cn("rounded-full border px-3 py-1.5 text-xs font-medium capitalize", m === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {s}
          </button>
        ))}
      </div>
      {rows?.length === 0 && <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">—</p>}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows?.map((v) => (
          <li key={v._id} className="rounded-2xl border bg-card p-3 text-sm shadow-soft">
            {v.status === "ready" && (v.mp4Url || v.hlsUrl) ? (
              <video src={v.mp4Url ?? undefined} controls preload="none" poster={v.thumbnailUrl ?? undefined} className="aspect-video w-full rounded-lg bg-black" />
            ) : (
              <div className="grid aspect-video place-items-center rounded-lg bg-muted text-xs">{v.status}{v.errorMessage ? `: ${v.errorMessage}` : ""}</div>
            )}
            <p className="mt-2 line-clamp-1 font-medium">{v.listingTitle}</p>
            <p className="text-xs text-muted-foreground">
              {fmt.duration(v.durationSec)} · {fmt.ago(v.createdAt)}
            </p>
            <div className="mt-2 flex gap-2">
              {v.moderation !== "approved" && (
                <Button size="sm" onClick={() => moderate({ id: v._id, decision: "approved" })}>
                  {t("approve")}
                </Button>
              )}
              {v.moderation !== "rejected" && (
                <Button size="sm" variant="destructive" onClick={() => moderate({ id: v._id, decision: "rejected" })}>
                  {t("reject")}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
