"use client";

import { useMutation, useQuery } from "convex/react";
import { Eye, MoreHorizontal, Pencil, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useFmt } from "@/hooks/use-fmt";
import { errorMessage } from "@/lib/client";
import type { ListingStatus } from "@/lib/constants";
import { listingHref } from "@/lib/urls";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<ListingStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_review: "bg-accent text-accent-foreground",
  active: "bg-primary text-primary-foreground",
  sold: "bg-foreground text-background",
  expired: "bg-muted text-muted-foreground",
  rejected: "bg-destructive/15 text-destructive",
};

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

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (rows === undefined) return <div className="h-64 animate-pulse rounded-2xl bg-muted" />;
  if (rows.length === 0)
    return (
      <div className="grid place-items-center rounded-2xl border border-dashed p-12 text-center">
        <p className="text-muted-foreground">{t("emptyListings")}</p>
        <Link href="/dashboard/listings/new" className={cn(buttonVariants(), "mt-4")}>
          <Plus /> {t("newListing")}
        </Link>
      </div>
    );

  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">{t("table.listing")}</th>
            <th className="px-3 py-3 font-medium">{t("table.status")}</th>
            <th className="px-3 py-3 font-medium">{t("table.price")}</th>
            <th className="px-3 py-3 text-right font-medium">{t("table.views")}</th>
            <th className="px-3 py-3 text-right font-medium">{t("table.inquiries")}</th>
            <th className="px-3 py-3 font-medium">{t("table.updated")}</th>
            <th className="px-3 py-3">
              <span className="sr-only">{t("table.actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l._id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">{l.coverUrl && <Image src={l.coverUrl} alt="" fill sizes="64px" className="object-cover" />}</div>
                  <div className="min-w-0">
                    <p className="line-clamp-1 font-medium">{l.title}</p>
                    <p className="text-xs text-muted-foreground">{l.areaName}</p>
                    {l.status === "rejected" && l.rejectionReason && <p className="line-clamp-1 text-xs text-destructive">{l.rejectionReason}</p>}
                  </div>
                </div>
              </td>
              <td className="px-3 py-3">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", STATUS_STYLE[l.status])}>{tst(l.status)}</span>
                {l.promotionRequested && <span className="mt-1 block text-[11px] text-muted-foreground">{t("actions.promoteRequested")}</span>}
              </td>
              <td className="px-3 py-3 font-medium whitespace-nowrap">{fmt.price(l.price)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{fmt.digits(l.viewCount)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{fmt.digits(l.inquiryCount)}</td>
              <td className="px-3 py-3 text-xs whitespace-nowrap text-muted-foreground">{fmt.ago(l.updatedAt)}</td>
              <td className="px-3 py-3 text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={t("table.actions")}>
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => router.push(listingHref(l))}>
                      <Eye /> {t("actions.view")}
                    </DropdownMenuItem>
                    {!["sold", "expired"].includes(l.status) && (
                      <DropdownMenuItem onClick={() => router.push(`/dashboard/listings/${l._id}/edit`)}>
                        <Pencil /> {t("actions.edit")}
                      </DropdownMenuItem>
                    )}
                    {(l.status === "draft" || l.status === "rejected") && (
                      <DropdownMenuItem onClick={() => run(() => submit({ id: l._id as Id<"listings"> }))}>{t("actions.submit")}</DropdownMenuItem>
                    )}
                    {l.status === "active" && (
                      <>
                        <DropdownMenuItem onClick={() => confirm(t("confirmSold")) && run(() => markSold({ id: l._id }))}>{t("actions.markSold")}</DropdownMenuItem>
                        {!l.isFeatured && !l.promotionRequested && (
                          <DropdownMenuItem onClick={() => run(() => promote({ id: l._id }), t("actions.promoteRequested"))}>{t("actions.promote")}</DropdownMenuItem>
                        )}
                      </>
                    )}
                    {l.status === "expired" && <DropdownMenuItem onClick={() => run(() => renew({ id: l._id }))}>{t("actions.renew")}</DropdownMenuItem>}
                    {(l.status === "draft" || l.status === "rejected") && (
                      <DropdownMenuItem variant="destructive" onClick={() => confirm(t("confirmDelete")) && run(() => remove({ id: l._id }))}>
                        {t("actions.delete")}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
