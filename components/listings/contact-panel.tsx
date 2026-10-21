"use client";

import { useMutation, useQuery } from "convex/react";
import { BadgeCheck, CheckCircle2, Loader2, Phone, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, buttonVariants } from "@/components/ui/button";
import { useFmt } from "@/hooks/use-fmt";
import { errorMessage } from "@/lib/client";

type Seller = {
  _id: Id<"users">;
  name: string;
  companyName?: string;
  accountType: "owner" | "broker" | "company";
  verificationStatus: string;
  maskedPhone: string | null;
  memberSince: number;
  responseRate: number | null;
};

export function SellerCard({ seller }: { seller: Seller }) {
  const t = useTranslations("listing");
  const ts = useTranslations("sellerType");
  const fmt = useFmt();
  return (
    <Link href={`/seller/${seller._id}`} className="flex items-center gap-3 rounded-xl p-1 transition hover:bg-muted">
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-secondary font-heading text-lg font-bold text-primary">{seller.name.slice(0, 1)}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 font-semibold">
          <span className="truncate">{seller.companyName ?? seller.name}</span>
          {seller.verificationStatus === "verified" && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified seller" />}
        </span>
        <span className="block text-xs text-muted-foreground">
          {ts(seller.accountType)} · {t("memberSince", { date: fmt.date(seller.memberSince) })}
        </span>
        <span className="block text-xs text-muted-foreground">{seller.responseRate !== null ? t("responseRate", { rate: fmt.digits(seller.responseRate) }) : t("noResponseData")}</span>
      </span>
    </Link>
  );
}

export function ContactPanel({
  listingId,
  seller,
  viewer,
  active,
  onRevealLocation,
}: {
  listingId: Id<"listings">;
  seller: Seller;
  viewer: { signedIn: boolean; isOwner: boolean; hasInquired: boolean };
  active: boolean;
  onRevealLocation: (p: { lat: number; lng: number; address: string | null; plot: string | null }) => void;
}) {
  const t = useTranslations("listing");
  const pathname = usePathname();
  const me = useQuery(api.users.viewer);
  const create = useMutation(api.inquiries.create);
  const [reveal, setReveal] = useState(false);
  const contact = useQuery(api.inquiries.revealContact, reveal ? { listingId } : "skip");
  const [msg, setMsg] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  // Lift the exact location to the page map once it is revealed.
  useEffect(() => {
    if (contact && contact.lat !== null && contact.lng !== null)
      onRevealLocation({ lat: contact.lat, lng: contact.lng, address: contact.exactAddress, plot: contact.plotNumber });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact]);

  if (viewer.isOwner) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-xl border bg-background px-3 py-2.5">
        <span className="flex items-center gap-2 font-mono text-sm">
          <Phone className="size-4 text-primary" aria-hidden />
          {contact?.phone ? (
            <a href={`tel:${contact.phone}`} className="font-semibold text-primary underline-offset-2 hover:underline">
              {contact.phone}
            </a>
          ) : (
            (seller.maskedPhone ?? "•••••••••")
          )}
        </span>
        {viewer.signedIn && viewer.hasInquired && !contact && (
          <Button size="sm" variant="outline" onClick={() => setReveal(true)} disabled={reveal}>
            {reveal ? <Loader2 className="animate-spin" /> : t("showNumber")}
          </Button>
        )}
      </div>
      {contact?.exactAddress && (
        <p className="rounded-lg bg-secondary px-3 py-2 text-sm">
          <span className="font-medium">{t("address")}:</span> {contact.exactAddress}
          {contact.plotNumber ? ` · ${t("plotNumber")} ${contact.plotNumber}` : ""}
        </p>
      )}

      {!viewer.signedIn ? (
        <Link href={`/signin?next=${encodeURIComponent(pathname)}`} className={buttonVariants({ className: "w-full" })}>
          {t("signInToContact")}
        </Link>
      ) : viewer.hasInquired ? (
        <p className="flex items-center gap-2 text-sm text-primary">
          <CheckCircle2 className="size-4" /> {t("alreadyInquired")}
        </p>
      ) : active ? (
        <form
          className="space-y-2.5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await create({ listingId, message: msg || t("inquiryPlaceholder"), contactPhone: phone || me?.phone || "" });
              toast.success(t("inquirySent"));
              setReveal(true);
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="text-xs text-muted-foreground">{t("inquiryFirst")}</p>
          <label className="block text-sm font-medium" htmlFor="inq-msg">
            {t("inquiryMessage")}
          </label>
          <textarea
            id="inq-msg"
            rows={3}
            maxLength={1000}
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder={t("inquiryPlaceholder")}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          />
          <label className="block text-sm font-medium" htmlFor="inq-phone">
            {t("yourPhone")}
          </label>
          <input
            id="inq-phone"
            type="tel"
            inputMode="tel"
            required={!me?.phone}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={me?.phone ?? "01XXXXXXXXX"}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} {t("sendInquiry")}
          </Button>
        </form>
      ) : null}
      <p className="flex gap-2 rounded-lg border border-warm/40 bg-accent/50 p-2.5 text-xs text-accent-foreground">
        <ShieldAlert className="size-4 shrink-0" aria-hidden /> {t("disclaimer")}
      </p>
    </div>
  );
}
