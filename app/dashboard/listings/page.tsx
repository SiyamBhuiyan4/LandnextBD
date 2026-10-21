"use client";

import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, Eye, MessageSquare, MoreHorizontal, Pencil, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PostLandEmpty } from "@/components/dashboard/post-land-empty";
import { StatusChip } from "@/components/dashboard/status-chip";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useFmt } from "@/hooks/use-fmt";
import { errorMessage } from "@/lib/client";
import type { ListingStatus } from "@/lib/constants";
import { listingHref } from "@/lib/urls";
import { cn } from "@/lib/utils";

const FILTERS: ("all" | ListingStatus)[] = ["all", "draft", "pending_review", "active", "sold", "expired", "rejected"];

export default function MyListingsPage() {
  const t = useTranslations("dashboard");
  const tst = useTranslations("status");
  const fmt = useFmt();
  const router = useRouter();
  const rows = useQuery(api.listings.mine);
  const markSold = useMutation(api.listings.markSold);
  const promote = useMutation(api.listings.requestPromotion);
  const submit = useMutation(api.listings.submitForReview);
  const renew = useMutation(api.listings.renew);
  const remove = useMutation(api.listings.removeDraft);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(id);
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (rows === undefined) return <div className="h-64 animate-pulse rounded-2xl bg-muted" />;
  if (rows.length === 0) return <PostLandEmpty />;

  const counts = Object.fromEntries(FILTERS.map((f) => [f, f === "all" ? rows.length : rows.filter((r) => r.status === f).length]));
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label={t("filterLabel")}>
          {FILTERS.filter((f) => f === "all" || counts[f] > 0).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition", filter === f ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40")}
            >
              {f === "all" ? t("filterAll") : tst(f)}
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", filter === f ? "bg-primary-foreground/20" : "bg-muted")}>{fmt.digits(counts[f])}</span>
            </button>
          ))}
        </div>
        <Link href="/dashboard/listings/new" className={cn(buttonVariants(), "hidden sm:inline-flex")}>
          <Plus /> {t("postLand")}
        </Link>
      </div>

      <ul className="space-y-3">
        {shown.map((l) => {
          const id = l._id as Id<"listings">;
          const canEdit = !["sold", "expired"].includes(l.status);
          const isBusy = busy === l._id;
          return (
            <li key={l._id} className="rounded-2xl border bg-card p-3 shadow-soft sm:p-4">
              <div className="flex gap-3 sm:gap-4">
                <Link href={canEdit ? `/dashboard/listings/${l._id}/edit` : listingHref(l)} className="relative h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-24 sm:w-32">
                  {l.coverUrl && <Image src={l.coverUrl} alt="" fill sizes="128px" className="object-cover" />}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <StatusChip status={l.status} />
                    <DropdownMenu>
                      <DropdownMenuTrigger className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={t("table.actions")}>
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        {(l.status === "active" || l.status === "sold") && (
                          <DropdownMenuItem onClick={() => router.push(listingHref(l))}>
                            <Eye /> {t("actions.view")}
                          </DropdownMenuItem>
                        )}
                        {canEdit && (
                          <DropdownMenuItem onClick={() => router.push(`/dashboard/listings/${l._id}/edit`)}>
                            <Pencil /> {t("actions.edit")}
                          </DropdownMenuItem>
                        )}
                        {l.status === "active" && !l.isFeatured && !l.promotionRequested && (
                          <DropdownMenuItem onClick={() => run(l._id, () => promote({ id }), t("actions.promoteRequested"))}>{t("actions.promote")}</DropdownMenuItem>
                        )}
                        {(l.status === "draft" || l.status === "rejected") && (
                          <DropdownMenuItem variant="destructive" onClick={() => confirm(t("confirmDelete")) && run(l._id, () => remove({ id }))}>
                            <Trash2 /> {t("actions.delete")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <p className="mt-1 line-clamp-2 font-semibold leading-snug sm:line-clamp-1">{l.title}</p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{fmt.price(l.price)}</span> · {fmt.size(l.sizeValue, l.sizeUnit)} · {l.areaName}
                  </p>
                  {l.status === "rejected" && l.rejectionReason && (
                    <p className="mt-1 rounded-lg bg-destructive/10 px-2 py-1 text-xs text-destructive">
                      {t("needsChanges")} {l.rejectionReason}
                    </p>
                  )}
                  {l.promotionRequested && <p className="mt-1 text-xs text-muted-foreground">{t("actions.promoteRequested")}</p>}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Eye className="size-3.5" /> {fmt.digits(l.viewCount)} {t("views").toLowerCase()}
                </span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <MessageSquare className="size-3.5" /> {fmt.digits(l.inquiryCount)} {t("inquiries").toLowerCase()}
                </span>
                <span>
                  {l.status === "active" && l.expiresAt ? t("expires", { time: fmt.ago(l.expiresAt) }) : t("updated", { time: fmt.ago(l.updatedAt) })}
                </span>
                <div className="ml-auto flex gap-2">
                  {(l.status === "draft" || l.status === "rejected") && (
                    <>
                      <Link href={`/dashboard/listings/${l._id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                        <Pencil /> {l.status === "draft" ? t("actions.continue") : t("actions.fix")}
                      </Link>
                      <Button size="sm" disabled={isBusy} onClick={() => run(l._id, () => submit({ id }), t("submittedToast"))}>
                        <Send /> {t("actions.submit")}
                      </Button>
                    </>
                  )}
                  {l.status === "pending_review" && (
                    <Link href={`/dashboard/listings/${l._id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      <Pencil /> {t("actions.edit")}
                    </Link>
                  )}
                  {l.status === "active" && (
                    <>
                      <Link href={`/dashboard/listings/${l._id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                        <Pencil /> {t("actions.edit")}
                      </Link>
                      <Button size="sm" variant="outline" disabled={isBusy} onClick={() => confirm(t("confirmSold")) && run(l._id, () => markSold({ id }), t("soldToast"))}>
                        <CheckCircle2 /> {t("actions.markSold")}
                      </Button>
                    </>
                  )}
                  {l.status === "expired" && (
                    <Button size="sm" disabled={isBusy} onClick={() => run(l._id, () => renew({ id }), t("renewedToast"))}>
                      <RefreshCw /> {t("actions.renew")}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <Link href="/dashboard/listings/new" className={cn(buttonVariants({ size: "lg" }), "fixed right-4 bottom-4 z-20 h-12 rounded-full px-5 shadow-lg sm:hidden")}>
        <Plus /> {t("postLand")}
      </Link>
    </div>
  );
}
