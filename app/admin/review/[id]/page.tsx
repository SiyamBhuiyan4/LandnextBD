"use client";

import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, XCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { useFmt } from "@/hooks/use-fmt";
import { errorMessage } from "@/lib/client";
import { listingHref } from "@/lib/urls";

export default function ReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const listingId = id as Id<"listings">;
  const t = useTranslations("admin");
  const td = useTranslations("docs");
  const tst = useTranslations("status");
  const tl = useTranslations("landType");
  const fmt = useFmt();
  const router = useRouter();
  const d = useQuery(api.admin.reviewDetail, { id: listingId });
  const approve = useMutation(api.admin.approve);
  const reject = useMutation(api.admin.reject);
  const unpublish = useMutation(api.admin.unpublish);
  const setFlags = useMutation(api.admin.setListingFlags);
  const setDoc = useMutation(api.admin.setDocumentVerified);
  const [reason, setReason] = useState("");

  if (d === undefined) return <div className="h-96 animate-pulse rounded-2xl bg-muted" />;
  if (d === null) return <p>Not found</p>;
  const l = d.listing;
  const run = async (fn: () => Promise<unknown>, back = false) => {
    try {
      await fn();
      if (back) router.push("/admin/review");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-6">
        <div>
          <p className="text-xs text-muted-foreground">
            {tst(l.status)} · {tl(l.landType)} · {l.areaName}
          </p>
          <h2 className="font-heading text-xl font-bold">{l.title}</h2>
          <p className="mt-1 text-sm">
            {fmt.price(l.price)} · {fmt.size(l.sizeValue, l.sizeUnit)} · ৳{fmt.num(l.pricePerSqft, 0)}/sqft
          </p>
          {l.status === "active" && (
            <Link href={listingHref(l)} className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <ExternalLink className="size-4" /> {l.slug}
            </Link>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {l.imageUrls.map((src, i) => (
            <a key={src} href={src} target="_blank" rel="noreferrer" className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted ring-primary hover:ring-2">
              <Image src={src} alt={`Photo ${i + 1}`} fill sizes="300px" className="object-cover" />
              {i === 0 && <span className="absolute top-1.5 left-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[11px] text-white">Cover</span>}
            </a>
          ))}
          {l.imageUrls.length === 0 && <p className="col-span-full rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("noPhotos")}</p>}
        </div>
        <p className="text-sm whitespace-pre-line text-muted-foreground">{l.description}</p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Exact address</dt><dd>{l.exactAddress ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Plot / sector</dt><dd>{l.plotNumber ?? "—"} · {l.sectorBlock ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Lat/Lng</dt><dd>{l.lat?.toFixed(5)}, {l.lng?.toFixed(5)}</dd></div>
        </dl>

        <section>
          <h3 className="mb-2 font-semibold">Documents</h3>
          {d.documents.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
          <ul className="space-y-2">
            {d.documents.map((doc) => (
              <li key={doc.index} className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm">
                <FileText className="size-5 text-primary" />
                <span className="flex-1">
                  {td(doc.type)}
                  {doc.fileName && <span className="block text-xs text-muted-foreground">{doc.fileName}</span>}
                </span>
                {doc.url && (
                  <a href={doc.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    Open
                  </a>
                )}
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" className="accent-[var(--primary)]" checked={doc.verified} onChange={(e) => run(() => setDoc({ id: listingId, index: doc.index, verified: e.target.checked }))} />
                  {t("markDocVerified")}
                </label>
              </li>
            ))}
          </ul>
        </section>

        {d.videos.length > 0 && (
          <section>
            <h3 className="mb-2 font-semibold">
              {t("videosHeading")} · {fmt.digits(d.videos.length)}
            </h3>
            <ul className="grid gap-3 sm:grid-cols-2">
              {d.videos.map((v) => (
                <li key={v._id} className="rounded-xl border p-2 text-xs">
                  {v.mp4Url && v.status === "ready" ? <video src={v.mp4Url} controls preload="none" poster={v.thumbnailUrl ?? undefined} className="aspect-video w-full rounded-lg bg-black" /> : <div className="grid aspect-video place-items-center rounded-lg bg-muted">{v.status}</div>}
                  <p className="mt-1">
                    {v.status} · {v.moderation}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {d.reports.length > 0 && (
          <section>
            <h3 className="mb-2 font-semibold">{t("reports")}</h3>
            <ul className="space-y-1 text-sm">
              {d.reports.map((r) => (
                <li key={r._id}>
                  {r.reason} · {r.status} {r.details && `— ${r.details}`}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="order-first space-y-4 lg:sticky lg:top-20 lg:order-none lg:self-start">
        <div className="rounded-2xl border bg-card p-4 shadow-soft">
          <h3 className="font-semibold">{t("checklist")}</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {Object.entries(d.signals.checklist).map(([k, ok]) => (
              <li key={k} className="flex items-center gap-2">
                {ok ? <CheckCircle2 className="size-4 text-primary" /> : <XCircle className="size-4 text-destructive" />} {t(`check.${k}` as never)}
              </li>
            ))}
          </ul>
          {d.signals.flags.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-destructive">
              {d.signals.flags.map((f) => (
                <li key={f} className="flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5" /> {t(`flags.${f}` as never)}
                </li>
              ))}
            </ul>
          )}
          {d.signals.areaAvgPerSqft && <p className="mt-2 text-xs text-muted-foreground">{t("areaAvg", { avg: fmt.num(d.signals.areaAvgPerSqft, 0), ratio: d.signals.priceRatio ?? "—" })}</p>}
          {d.signals.duplicates.length > 0 && (
            <ul className="mt-2 text-xs">
              {d.signals.duplicates.map((x) => (
                <li key={x._id}>
                  <Link className="text-primary underline" href={`/admin/review/${x._id}`}>
                    {x.title}
                  </Link>{" "}
                  ({x.status})
                </li>
              ))}
            </ul>
          )}
        </div>

        {d.seller && (
          <div className="rounded-2xl border bg-card p-4 text-sm shadow-soft">
            <h3 className="font-semibold">{d.seller.name ?? "—"}</h3>
            <p className="text-muted-foreground">{d.seller.email ?? d.seller.phone}</p>
            <p className="text-xs text-muted-foreground">
              {d.seller.role} · {d.seller.accountType} · {d.seller.verificationStatus} · {fmt.ago(d.seller.createdAt)}
            </p>
          </div>
        )}

        <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-soft">
          <label className="flex items-center justify-between text-sm">
            {t("verifyListing")}
            <input type="checkbox" className="accent-[var(--primary)]" checked={l.isVerified} onChange={(e) => run(() => setFlags({ id: listingId, isVerified: e.target.checked }))} />
          </label>
          <label className="flex items-center justify-between text-sm">
            {t("featureListing")}
            <input type="checkbox" className="accent-[var(--primary)]" checked={l.isFeatured} onChange={(e) => run(() => setFlags({ id: listingId, isFeatured: e.target.checked }))} />
          </label>
          {l.status === "pending_review" && (
            <>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => run(() => approve({ id: listingId }), true)}>
                  {t("approve")}
                </Button>
                <Button className="flex-1" variant="outline" onClick={() => run(() => approve({ id: listingId, verify: true }), true)}>
                  {t("approveVerify")}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5" aria-label={t("rejectPresets")}>
                {(["photos", "price", "documents", "duplicate", "location"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setReason((r) => (r.trim() ? `${r.trim()} ${t(`reasons.${k}`)}` : t(`reasons.${k}`)))}
                    className="rounded-full border px-2.5 py-1 text-xs hover:border-primary/50 hover:bg-muted"
                  >
                    + {t(`reasonLabels.${k}`)}
                  </button>
                ))}
              </div>
              <label className="block text-sm font-medium">
                {t("rejectReason")}
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40" />
              </label>
              <Button variant="destructive" className="w-full" disabled={reason.trim().length < 5} onClick={() => run(() => reject({ id: listingId, reason }), true)}>
                {t("reject")}
              </Button>
            </>
          )}
          {l.status === "active" && (
            <>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder={t("rejectReason")} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
              <Button variant="destructive" className="w-full" onClick={() => run(() => unpublish({ id: listingId, reason }))}>
                {t("unpublish")}
              </Button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
