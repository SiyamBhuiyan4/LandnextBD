"use client";

import { useMutation, usePreloadedQuery, useQuery, type Preloaded } from "convex/react";
import { AlertTriangle, BadgeCheck, CheckCircle2, ChevronRight, CircleDashed, Eye, Flag, Heart, MapPin, PlayCircle, Share2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CompassIcon, DeedIcon, FacilityIcon, LandTypeIcons, PlotIcon, RoadIcon, UtilityIcons, WallIcon } from "@/components/icons";
import { ContactPanel, SellerCard } from "@/components/listings/contact-panel";
import { Gallery } from "@/components/listings/gallery";
import { CompareToggle, ListingCard, SaveButton } from "@/components/listings/listing-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VideoThumb } from "@/components/video/video-card";
import { VideoGalleryDialog } from "@/components/video/video-gallery";
import { useFmt } from "@/hooks/use-fmt";
import { errorMessage, sessionId } from "@/lib/client";
import { DOCUMENT_TYPES, REPORT_REASONS, type ReportReason } from "@/lib/constants";
import { allUnits } from "@/lib/units";
import { landTypeToSlug } from "@/lib/urls";
import { cn } from "@/lib/utils";

const MiniMap = dynamic(() => import("@/components/listings/mini-map"), { ssr: false, loading: () => <div className="h-64 animate-pulse bg-muted" /> });

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-secondary/60 p-3">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-sm font-semibold">{value}</dd>
      </div>
    </div>
  );
}

export function ListingDetail({ preloaded }: { preloaded: Preloaded<typeof api.listings.getBySlug> }) {
  const l = usePreloadedQuery(preloaded);
  const t = useTranslations("listing");
  const tc = useTranslations("common");
  const tl = useTranslations("landType");
  const tf = useTranslations("facing");
  const tu = useTranslations("utilities");
  const tfa = useTranslations("facilities");
  const td = useTranslations("docs");
  const tst = useTranslations("status");
  const tls = useTranslations("landStatus");
  const tv = useTranslations("video");
  const tb = useTranslations("browse");
  const locale = useLocale();
  const fmt = useFmt();
  const recordView = useMutation(api.listings.recordView);
  const videos = useQuery(api.videos.byListing, l ? { listingId: l._id } : "skip");
  const similar = useQuery(api.listings.related, l ? { listingId: l._id, limit: 8 } : "skip");
  const savedIds = useQuery(api.saves.mySavedIds);
  const [galleryOpen, setGalleryOpen] = useState<Id<"videos"> | null>(null);
  const [exact, setExact] = useState<{ lat: number; lng: number } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (l?.status === "active" && !l.viewer.isOwner) void recordView({ listingId: l._id, sessionId: sessionId() }).catch(() => {});
  }, [l?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!l) {
    return (
      <div className="container-page py-24 text-center">
        <h1 className="font-heading text-2xl font-bold">{tc("notFound")}</h1>
        <Link href="/browse" className="mt-4 inline-block text-primary underline">
          {tc("browse")}
        </Link>
      </div>
    );
  }

  const Icon = LandTypeIcons[l.landType];
  const playable = (videos ?? []).filter((v) => v.status === "ready");
  const processing = (videos ?? []).filter((v) => v.status === "processing");
  const share = async () => {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: l.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success(tc("copied"));
      }
    } catch {
      /* cancelled */
    }
  };
  const areaLabel = locale === "bn" && l.areaNameBn ? l.areaNameBn : l.areaName;

  return (
    <div className="container-page py-6">
      {(l.viewer.isOwner || l.viewer.isAdmin) && l.status !== "active" && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-warm/50 bg-accent/60 p-3 text-sm text-accent-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            {t("ownerPreview", { status: tst(l.status) })}
            {l.rejectionReason && <p className="mt-1 font-medium">{t("rejected", { reason: l.rejectionReason })}</p>}
          </div>
        </div>
      )}
      {l.status === "sold" && <div className="mb-4 rounded-xl bg-foreground px-4 py-3 text-sm font-semibold text-background">{t("soldBanner")}</div>}

      <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link href="/browse" className="hover:text-foreground">
          {tb("allBangladesh")}
        </Link>
        <ChevronRight className="size-3" />
        <Link href={`/browse?district=${encodeURIComponent(l.district)}`} className="hover:text-foreground">
          {l.district}
        </Link>
        <ChevronRight className="size-3" />
        <Link href={`/land/${l.areaSlug}`} className="hover:text-foreground">
          {areaLabel}
        </Link>
        <ChevronRight className="size-3" />
        <Link href={`/land/${l.areaSlug}/${landTypeToSlug(l.landType)}`} className="hover:text-foreground">
          {tl(l.landType)}
        </Link>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-primary">
            <Icon size={18} /> {tl(l.landType)}
            {l.isVerified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                <BadgeCheck className="size-3.5" /> {tc("verified")}
              </span>
            )}
          </p>
          <h1 className="mt-1 font-heading text-2xl leading-tight font-bold tracking-tight sm:text-3xl">{l.title}</h1>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="size-4" /> {l.sectorBlock ? `${l.sectorBlock}, ` : ""}
            {areaLabel}, {l.upazila ? `${l.upazila}, ` : ""}
            {l.district}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SaveButton listingId={l._id} saved={l.viewer.saved || !!savedIds?.includes(l._id)} className="border" />
          <Button variant="outline" size="icon" onClick={share} aria-label={tc("share")}>
            <Share2 />
          </Button>
          <CompareToggle id={l._id} className="h-8 px-3" />
          <Button variant="ghost" size="icon" onClick={() => setReportOpen(true)} aria-label={tc("report")}>
            <Flag />
          </Button>
        </div>
      </div>

      <div className="mt-5">
        <Gallery images={l.images} title={l.title} />
      </div>

      {(playable.length > 0 || processing.length > 0) && (
        <section className="mt-4" aria-label={tv("thisListing")}>
          <div className="flex items-center justify-between gap-3">
            <Button onClick={() => setGalleryOpen(playable[0]?._id ?? null)} disabled={!playable.length} className="gap-2">
              <PlayCircle /> {t("watchVideos")} · {t("videosCount", { count: playable.length })}
            </Button>
            {processing.length > 0 && <span className="text-xs text-muted-foreground">{tv("processingHint")}</span>}
          </div>
          <div className="scrollbar-none mt-3 flex gap-3 overflow-x-auto pb-1">
            {playable.map((v) => (
              <VideoThumb key={v._id} v={v} onClick={() => setGalleryOpen(v._id)} className="w-56 shrink-0" />
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{tv("dataSaver")}</p>
        </section>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="facts">
            <h2 id="facts" className="sr-only">
              {t("price")}
            </h2>
            <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <Fact icon={<PlotIcon size={20} />} label={t("size")} value={fmt.size(l.sizeValue, l.sizeUnit)} />
              <Fact icon={<span className="font-bold">৳</span>} label={t("pricePer", { unit: locale === "bn" ? "কাঠা" : "katha" })} value={fmt.perUnit(l.price, l.sizeSqft, "katha")} />
              <Fact icon={<span className="font-bold">৳</span>} label={t("pricePer", { unit: locale === "bn" ? "শতাংশ" : "decimal" })} value={fmt.perUnit(l.price, l.sizeSqft, "decimal")} />
              {l.facing && <Fact icon={<CompassIcon size={20} />} label={t("facing")} value={tf(l.facing)} />}
              {l.roadWidthFt && <Fact icon={<RoadIcon size={20} />} label={t("roadWidth")} value={`${fmt.digits(l.roadWidthFt)} ft`} />}
              <Fact icon={<CircleDashed className="size-5" />} label={t("landStatus")} value={tls(l.landStatus)} />
              <Fact icon={<WallIcon size={20} />} label={t("boundaryWall")} value={l.hasBoundaryWall ? tc("yes") : tc("no")} />
              <Fact icon={<Eye className="size-5" />} label={t("views")} value={fmt.digits(l.viewCount)} />
              <Fact icon={<Heart className="size-5" />} label={t("saves")} value={fmt.digits(l.saveCount)} />
            </dl>
            <details className="mt-3 rounded-xl border px-4 py-3 text-sm">
              <summary className="cursor-pointer font-medium">{t("allSizes")}</summary>
              <ul className="mt-2 grid grid-cols-2 gap-1 text-muted-foreground sm:grid-cols-5">
                {allUnits(l.sizeSqft).map((u) => (
                  <li key={u.unit}>{fmt.size(u.value, u.unit)}</li>
                ))}
              </ul>
            </details>
          </section>

          <section aria-labelledby="desc">
            <h2 id="desc" className="font-heading text-lg font-semibold">
              {t("description")}
            </h2>
            <p className="mt-2 leading-relaxed whitespace-pre-line text-muted-foreground">{l.description}</p>
          </section>

          <section aria-labelledby="docs">
            <h2 id="docs" className="font-heading text-lg font-semibold">
              {t("documents")}
            </h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {DOCUMENT_TYPES.map((type) => {
                const d = l.documents.find((x) => x.type === type);
                return (
                  <li key={type} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm">
                    <DeedIcon size={20} className="text-muted-foreground" />
                    <span className="flex-1 font-medium">{td(type)}</span>
                    {d?.verified ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                        <CheckCircle2 className="size-4" /> {t("docVerified")}
                      </span>
                    ) : d ? (
                      <span className="text-xs font-medium text-warm">{t("docPending")}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("docMissing")}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {(l.utilities.length > 0 || l.nearbyFacilities.length > 0) && (
            <section className="grid gap-6 sm:grid-cols-2">
              {l.utilities.length > 0 && (
                <div>
                  <h2 className="font-heading text-lg font-semibold">{t("utilities")}</h2>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {l.utilities.map((u) => {
                      const UI = UtilityIcons[u];
                      return (
                        <li key={u} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm">
                          <UI size={16} className="text-primary" /> {tu(u)}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {l.nearbyFacilities.length > 0 && (
                <div>
                  <h2 className="font-heading text-lg font-semibold">{t("facilities")}</h2>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {l.nearbyFacilities.map((f) => (
                      <li key={f} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm">
                        <FacilityIcon facility={f} size={16} className="text-primary" /> {tfa(f)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {(l.approxLat !== undefined || l.areaCenter) && (
            <section aria-labelledby="loc">
              <h2 id="loc" className="font-heading text-lg font-semibold">
                {exact ? t("exactLocation") : t("location")}
              </h2>
              <div className="mt-3 overflow-hidden rounded-2xl border">
                <MiniMap lat={exact?.lat ?? l.approxLat ?? l.areaCenter!.lat} lng={exact?.lng ?? l.approxLng ?? l.areaCenter!.lng} approx={!exact} />
                {!exact && <p className="border-t px-3 py-2 text-xs text-muted-foreground">{t("approxLocation")}</p>}
              </div>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-soft">
            <div>
              <p className="text-xs text-muted-foreground">{t("price")}</p>
              <p className="font-heading text-3xl font-extrabold text-primary">{fmt.price(l.price)}</p>
              <p className="text-xs text-muted-foreground">
                {fmt.price(l.price, true)}
                {l.negotiable ? ` · ${tc("negotiable")}` : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{t("postedAgo", { time: fmt.ago(l.publishedAt) })}</p>
            </div>
            <hr />
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("seller")}</p>
              {l.seller && <SellerCard seller={l.seller} />}
            </div>
            {l.seller && (
              <ContactPanel
                listingId={l._id}
                seller={l.seller}
                viewer={l.viewer}
                active={l.status === "active"}
                onRevealLocation={(p) => setExact({ lat: p.lat, lng: p.lng })}
              />
            )}
          </div>
        </aside>
      </div>

      {similar && similar.length > 0 && (
        <section className="mt-14" aria-labelledby="similar">
          <h2 id="similar" className="mb-4 font-heading text-xl font-bold">
            {t("similar")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {similar.slice(0, 8).map((s) => (
              <ListingCard key={s._id} l={s} saved={!!savedIds?.includes(s._id)} />
            ))}
          </div>
        </section>
      )}

      <VideoGalleryDialog listingId={l._id} initialVideoId={galleryOpen ?? undefined} open={!!galleryOpen} onOpenChange={(o) => !o && setGalleryOpen(null)} />
      <ReportDialog listingId={l._id} open={reportOpen} onOpenChange={setReportOpen} />
    </div>
  );
}

function ReportDialog({ listingId, open, onOpenChange }: { listingId: Id<"listings">; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("listing");
  const tr = useTranslations("reportReason");
  const tc = useTranslations("common");
  const report = useMutation(api.reports.create);
  const [reason, setReason] = useState<ReportReason>("fake");
  const [details, setDetails] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("reportTitle")}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await report({ listingId, reason, details: details || undefined });
              toast.success(t("reportSent"));
              onOpenChange(false);
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        >
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-sm font-medium">{t("reportReason")}</legend>
            {REPORT_REASONS.map((r) => (
              <label key={r} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", reason === r && "border-primary bg-secondary")}>
                <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="accent-[var(--primary)]" />
                {tr(r)}
              </label>
            ))}
          </fieldset>
          <label className="block text-sm font-medium">
            {t("reportDetails")}
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={3} className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40" />
          </label>
          <DialogFooter>
            <Button type="submit">{tc("submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
