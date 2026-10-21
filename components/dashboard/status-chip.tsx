"use client";

import { CheckCircle2, Clock, FileEdit, AlertTriangle, Hourglass, Radio } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ListingStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

const STYLE: Record<ListingStatus, { cls: string; Icon: typeof Clock }> = {
  draft: { cls: "bg-muted text-muted-foreground", Icon: FileEdit },
  pending_review: { cls: "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200", Icon: Hourglass },
  active: { cls: "bg-primary/12 text-primary", Icon: Radio },
  sold: { cls: "bg-foreground text-background", Icon: CheckCircle2 },
  expired: { cls: "bg-muted text-muted-foreground", Icon: Clock },
  rejected: { cls: "bg-destructive/12 text-destructive", Icon: AlertTriangle },
};

/** Listing status pill used across the seller dashboard and admin. */
export function StatusChip({ status, className }: { status: ListingStatus; className?: string }) {
  const t = useTranslations("status");
  const { cls, Icon } = STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", cls, className)}>
      <Icon className="size-3" aria-hidden /> {t(status)}
    </span>
  );
}
