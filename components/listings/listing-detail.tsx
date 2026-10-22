"use client";

import { useConvexAuth, useMutation, usePreloadedQuery, useQuery, type Preloaded } from "convex/react";
import { AlertTriangle, BadgeCheck, CalendarDays, CheckCircle2, ChevronRight, CircleDashed, Clock, Copy, Eye, FileCheck2, Flag, Hash, Heart, Link2, Loader2, Mail, MapPin, Megaphone, MessageCircle, Pencil, Phone, PlayCircle, Ruler, Share2, ShieldCheck, Video } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CompassIcon, DeedIcon, FacilityIcon, LandTypeIcons, PlotIcon, RoadIcon, UtilityIcons, WallIcon } from "@/components/icons";
import { ContactPanel, SellerCard, whatsappHref } from "@/components/listings/contact-panel";
import { MediaGallery } from "@/components/listings/gallery";
import { CompareToggle, ListingCard, SaveButton } from "@/components/listings/listing-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VideoThumb } from "@/components/video/video-card";
import { useFmt } from "@/hooks/use-fmt";
import { errorMessage, readLocal, sessionId, writeLocal } from "@/lib/client";
import { RECENT_KEY, type RecentItem } from "@/components/home/recently-viewed";
import { CostEstimate } from "@/components/listings/cost-estimate";
import { DOCUMENT_TYPES, REPORT_REASONS, type ReportReason } from "@/lib/constants";
import { districtName } from "@/lib/places";
import { allUnits } from "@/lib/units";
import { landTypeToSlug, listingHref } from "@/lib/urls";
import { cn } from "@/lib/utils";

const MiniMap = dynamic(() => import("@/components/listings/mini-map"), { ssr: false, loading: () => <div className="h-64 animate-pulse bg-muted sm:h-80" /> });

function Fact({ icon, label, value, muted }: { icon: React.ReactNode; label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 rounded-xl border bg-card p-3 sm:p-3.5">
      <dt className="contents">
        <span className="row-span-2 grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary" aria-hidden>
          {icon}
        </span>
        <span className="self-end text-xs text-muted-foreground">{label}</span>
      </dt>
      <dd className={cn("col-start-2 line-clamp-2 self-start text-sm leading-snug break-words font-semibold sm:text-[15px]", muted && "font-medium text-muted-foreground")}>{value}</dd>
    </div>
  );
}

function SectionTitle({ id, children, aside }: { id: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 id={id} className="font-heading text-lg font-semibold tracking-tight sm:text-xl">
        {children}
      </h2>
      {aside}
    </div>
  );
}

/** Long descriptions collapse to a few lines with "Read more". */
function Description({ text }: { text: string }) {
  const t = useTranslations("listingDetail");
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 360 || text.split("\n").length > 5;
  return (
    <div>
      <p id="desc-text" className={cn("leading-relaxed whitespace-pre-line text-muted-foreground", long && !expanded && "line-clamp-5")}>
        {text}
      </p>
      {long && (
        <button type="button" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded} aria-controls="desc-text" className="mt-2 text-sm font-semibold text-primary underline-offset-4 hover:underline">
          {expanded ? t("readLess") : t("readMore")}
        </button>
      )}
    </div>
  );
}

export function ListingDetail({ preloaded }: { preloaded: Preloaded<typeof api.listings.getBySlug> }) {
  const l = usePreloadedQuery(preloaded);
  const t = useTranslations("listing");
  const td2 = useTranslations("listingDetail");
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
  const [videoRequest, setVideoRequest] = useState<{ id: Id<"videos">; n: number } | null>(null);
  const setOpenVideo = (id: Id<"videos">) => setVideoRequest((r) => ({ id, n: (r?.n ?? 0) + 1 }));
  const [exact, setExact] = useState<{ lat: number; lng: number } | null>(null);
  const [revealed, setRevealed] = useState<{ phone: string | null; plot: string | null } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const contactRef = useRef<HTMLDivElement>(null);
  const [barHidden, setBarHidden] = useState(false);

  useEffect(() => {
    if (l?.status === "active" && !l.viewer.isOwner) void recordView({ listingId: l._id, sessionId: sessionId() }).catch(() => {});
    if (l) {
      const item = { id: l._id, href: listingHref(l), title: l.title, area: l.areaName };
      const prev = readLocal<RecentItem[]>(RECENT_KEY, []).filter((r) => r.id !== item.id);
      writeLocal(RECENT_KEY, [item, ...prev].slice(0, 12));
    }
  }, [l?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hide the mobile contact bar while the full contact panel or the footer is on screen.
  useEffect(() => {
    const targets = [contactRef.current, document.querySelector("footer")].filter((x): x is HTMLElement => !!x);
    if (!targets.length || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
      }
      setBarHidden(visible.size > 0);
    });
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [l?._id]);

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
  const saved = savedIds ? savedIds.includes(l._id) : l.viewer.saved;
  const openReport = () => {
    if (!isAuthenticated) {
      toast.info(td2("signInToReport"));
      router.push(`/signin?next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    setReportOpen(true);
  };
  const areaLabel = locale === "bn" && l.areaNameBn ? l.areaNameBn : l.areaName;
  const district = districtName(l.district, locale);
  const adId = l._id.slice(-12, -4).toUpperCase();
  const unitKatha = locale === "bn" ? "কাঠা" : "katha";
  const unitDecimal = locale === "bn" ? "শতাংশ" : "decimal";
  const docsProvided = DOCUMENT_TYPES.filter((type) => l.documents.some((d) => d.type === type)).length;
  const docsVerified = l.documents.filter((d) => d.verified).length;
  const hasMap = exact !== null || l.approxLat !== undefined;
  const canContact = !!l.seller && !l.viewer.isOwner && l.status === "active";
  const scrollToContact = () => {
    contactRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => contactRef.current?.querySelector<HTMLElement>("textarea, a, button")?.focus({ preventScroll: true }), 500);
  };

  const actions = (
    <div className="flex items-center gap-2">
      <SaveButton listingId={l._id} saved={saved} className="size-10 border shadow-none" />
      <Button variant="outline" size="icon" className="size-10 rounded-full" onClick={() => setShareOpen(true)} aria-label={tc("share")}>
        <Share2 />
      </Button>
      <CompareToggle id={l._id} className="h-10 px-3.5 text-sm" />
      <Button variant="ghost" size="icon" className="size-10 rounded-full text-muted-foreground" onClick={openReport} aria-label={tc("report")}>
        <Flag />
      </Button>
    </div>
  );

  return (
    <div className="container-page pt-4 pb-28 sm:pt-6 lg:pb-12">
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
      {l.status === "expired" && !l.viewer.isOwner && (
        <div role="status" className="mb-4 rounded-xl bg-muted px-4 py-3 text-sm font-semibold text-foreground">
          {td2("expiredBanner")}
        </div>
      )}
      {l.viewer.isOwner && <OwnerTools l={l} />}

      <nav aria-label={td2("breadcrumb")} className="mb-3">
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-muted-foreground sm:text-sm">
          <li>
            <Link href="/browse" className="hover:text-foreground">
              {tb("allBangladesh")}
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3" />
          </li>
          <li>
            <Link href={`/browse?district=${encodeURIComponent(l.district)}`} className="hover:text-foreground">
              {district}
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3" />
          </li>
          <li>
            <Link href={`/land/${l.areaSlug}`} className="hover:text-foreground">
              {areaLabel}
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3" />
          </li>
          <li>
            <Link href={`/land/${l.areaSlug}/${landTypeToSlug(l.landType)}`} aria-current="page" className="font-medium text-foreground/80 hover:text-foreground">
              {tl(l.landType)}
            </Link>
          </li>
        </ol>
      </nav>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 font-medium text-primary">
              <Icon size={16} /> {tl(l.landType)}
            </span>
            {l.isVerified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
                <BadgeCheck className="size-3.5" /> {tc("verified")}
              </span>
            )}
            {playable.length > 0 && (
              <button type="button" onClick={() => setOpenVideo(playable[0]._id)} className="inline-flex items-center gap-1 rounded-full bg-warm/20 px-2.5 py-1 text-xs font-semibold text-foreground transition hover:bg-warm/30">
                <Video className="size-3.5" /> {t("videosCount", { count: playable.length })}
              </button>
            )}
          </div>
          <h1 className="mt-2 font-heading text-2xl leading-tight font-bold tracking-tight text-balance sm:text-3xl lg:text-[2.1rem]">{l.title}</h1>
          <p className="mt-1.5 flex items-start gap-1 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {l.sectorBlock ? `${l.sectorBlock}, ` : ""}
              {areaLabel}, {l.upazila && l.upazila !== l.areaName && locale !== "bn" ? `${l.upazila}, ` : ""}
              {district}
            </span>
          </p>
        </div>
        {actions}
      </header>

      <div className="mt-4 sm:mt-5">
        <MediaGallery images={l.images} videos={playable} title={l.title} openVideo={videoRequest} />
        {processing.length > 0 && (
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> {tv("processingHint")}
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-8 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
        <div className="min-w-0 space-y-9">
          {/* Price summary (mobile/tablet; desktop shows it in the sticky panel) */}
          <section className="rounded-2xl border bg-card p-4 shadow-soft lg:hidden" aria-label={t("price")}>
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
              <p className="font-heading text-3xl font-extrabold tracking-tight text-primary">{fmt.price(l.price)}</p>
              {l.negotiable && <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-primary">{tc("negotiable")}</span>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {td2("perUnit", { price: fmt.perUnit(l.price, l.sizeSqft, "katha"), unit: unitKatha })} · {td2("perUnit", { price: fmt.perUnit(l.price, l.sizeSqft, "decimal"), unit: unitDecimal })}
            </p>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden />{" "}
                <span suppressHydrationWarning>{t("postedAgo", { time: fmt.ago(l.publishedAt) })}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Eye className="size-3.5" aria-hidden /> {tc("views", { count: fmt.digits(l.viewCount) })}
              </span>
            </p>
          </section>

          <section aria-labelledby="facts">
            <SectionTitle id="facts">{td2("keyFacts")}</SectionTitle>
            <dl className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
              <Fact icon={<PlotIcon size={20} />} label={t("size")} value={fmt.size(l.sizeValue, l.sizeUnit)} />
              <Fact icon={<span className="text-base font-bold">৳</span>} label={t("pricePer", { unit: unitKatha })} value={fmt.perUnit(l.price, l.sizeSqft, "katha")} />
              <Fact icon={<span className="text-base font-bold">৳</span>} label={t("pricePer", { unit: unitDecimal })} value={fmt.perUnit(l.price, l.sizeSqft, "decimal")} />
              <Fact icon={<Icon size={20} />} label={td2("landType")} value={tl(l.landType)} />
              {l.facing && <Fact icon={<CompassIcon size={20} />} label={t("facing")} value={tf(l.facing)} />}
              {l.roadWidthFt && <Fact icon={<RoadIcon size={20} />} label={t("roadWidth")} value={td2("feet", { n: fmt.digits(l.roadWidthFt) })} />}
              <Fact icon={<CircleDashed className="size-5" />} label={t("landStatus")} value={tls(l.landStatus)} />
              <Fact icon={<WallIcon size={20} />} label={t("boundaryWall")} value={l.hasBoundaryWall ? tc("yes") : tc("no")} />
              <Fact icon={<Hash className="size-5" />} label={t("plotNumber")} value={revealed?.plot ?? td2("sharedAfterInquiry")} muted={!revealed?.plot} />
            </dl>
            <AreaPriceInsight listingId={l._id} sizeSqft={l.sizeSqft} unit={unitKatha} />
            <CostEstimate price={l.price} />
            <details className="group mt-3 rounded-xl border bg-card px-4 py-3 text-sm">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
                <Ruler className="size-4 text-primary" aria-hidden /> {t("allSizes")}
                <ChevronRight className="ml-auto size-4 transition group-open:rotate-90" aria-hidden />
              </summary>
              <ul className="mt-3 grid grid-cols-2 gap-2 text-muted-foreground sm:grid-cols-5">
                {allUnits(l.sizeSqft).map((u) => (
                  <li key={u.unit} className="rounded-lg bg-secondary/60 px-2.5 py-1.5 tabular-nums">
                    {fmt.size(u.value, u.unit)}
                  </li>
                ))}
              </ul>
            </details>
          </section>

          <section aria-labelledby="desc">
            <SectionTitle id="desc">{t("description")}</SectionTitle>
            <Description text={l.description} />
          </section>

          {(l.utilities.length > 0 || l.nearbyFacilities.length > 0) && (
            <section aria-labelledby="features">
              <SectionTitle id="features">{td2("features")}</SectionTitle>
              <div className="grid gap-5 sm:grid-cols-2">
                {l.utilities.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t("utilities")}</h3>
                    <ul className="flex flex-wrap gap-2">
                      {l.utilities.map((u) => {
                        const UI = UtilityIcons[u];
                        return (
                          <li key={u} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm">
                            <UI size={16} className="text-primary" /> {tu(u)}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {l.nearbyFacilities.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t("facilities")}</h3>
                    <ul className="flex flex-wrap gap-2">
                      {l.nearbyFacilities.map((f) => (
                        <li key={f} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm">
                          <FacilityIcon facility={f} size={16} className="text-primary" /> {tfa(f)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          {playable.length > 0 && (
            <section aria-labelledby="videos">
              <SectionTitle
                id="videos"
                aside={
                  <Button variant="outline" size="sm" onClick={() => setOpenVideo(playable[0]._id)} className="gap-1.5">
                    <PlayCircle /> {t("watchVideos")}
                  </Button>
                }
              >
                {tv("thisListing")}
              </SectionTitle>
              <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
                {playable.map((v) => (
                  <VideoThumb key={v._id} v={v} onClick={() => setOpenVideo(v._id)} className="w-64 shrink-0 snap-start" />
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{tv("dataSaver")}</p>
            </section>
          )}

          <section aria-labelledby="docs">
            <SectionTitle
              id="docs"
              aside={
                <span className="text-xs text-muted-foreground sm:text-sm">
                  {td2("docsSummary", { provided: fmt.digits(docsProvided), total: fmt.digits(DOCUMENT_TYPES.length), verified: fmt.digits(docsVerified) })}
                </span>
              }
            >
              {t("documents")}
            </SectionTitle>
            <ul className="grid gap-2 sm:grid-cols-2">
              {DOCUMENT_TYPES.map((type) => {
                const d = l.documents.find((x) => x.type === type);
                return (
                  <li key={type} className={cn("flex items-center gap-3 rounded-xl border px-3 py-3 text-sm", d?.verified ? "border-primary/30 bg-secondary/50" : "bg-card")}>
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", d?.verified ? "bg-primary text-primary-foreground" : d ? "bg-warm/20 text-foreground" : "bg-muted text-muted-foreground")} aria-hidden>
                      {d?.verified ? <CheckCircle2 className="size-4" /> : d ? <FileCheck2 className="size-4" /> : <DeedIcon size={16} />}
                    </span>
                    <span className="flex-1 font-medium">{td(type)}</span>
                    {d?.verified ? (
                      <span className="text-xs font-semibold text-primary">{t("docVerified")}</span>
                    ) : d ? (
                      <span className="text-xs font-medium text-foreground/70">{t("docPending")}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("docMissing")}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {hasMap && (
            <section aria-labelledby="loc">
              <SectionTitle id="loc">{exact ? t("exactLocation") : t("location")}</SectionTitle>
              <div className="overflow-hidden rounded-2xl border bg-card">
                <div className="[&_.leaflet-container]:h-64 sm:[&_.leaflet-container]:h-80">
                  <MiniMap lat={exact?.lat ?? l.approxLat!} lng={exact?.lng ?? l.approxLng!} approx={!exact} />
                </div>
                {!exact && (
                  <p className="flex items-start gap-2 border-t px-3 py-2.5 text-xs text-muted-foreground">
                    <MapPin className="mt-px size-3.5 shrink-0 text-primary" aria-hidden /> {t("approxLocation")}
                  </p>
                )}
              </div>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div ref={contactRef} id="contact" className="scroll-mt-24 space-y-4 rounded-2xl border bg-card p-5 shadow-soft">
            <div className="hidden lg:block">
              <p className="text-xs font-medium text-muted-foreground">{t("price")}</p>
              <p className="font-heading text-[2rem] leading-tight font-extrabold tracking-tight text-primary">{fmt.price(l.price)}</p>
              <p className="text-xs text-muted-foreground">
                {fmt.price(l.price, true)}
                {l.negotiable ? ` · ${tc("negotiable")}` : ""}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-secondary/70 px-2.5 py-2">
                  <p className="font-semibold text-foreground tabular-nums">{fmt.perUnit(l.price, l.sizeSqft, "katha")}</p>
                  <p className="text-muted-foreground">/ {unitKatha}</p>
                </div>
                <div className="rounded-lg bg-secondary/70 px-2.5 py-2">
                  <p className="font-semibold text-foreground tabular-nums">{fmt.perUnit(l.price, l.sizeSqft, "decimal")}</p>
                  <p className="text-muted-foreground">/ {unitDecimal}</p>
                </div>
              </div>
            </div>
            <hr className="hidden lg:block" />
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
                onContact={setRevealed}
              />
            )}
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl border bg-card px-2 py-2.5">
              <dt className="sr-only">{t("views")}</dt>
              <dd className="flex flex-col items-center gap-0.5">
                <Eye className="size-4 text-muted-foreground" aria-hidden />
                <span className="font-semibold tabular-nums">{fmt.digits(l.viewCount)}</span>
                <span className="text-muted-foreground" aria-hidden>
                  {t("views")}
                </span>
              </dd>
            </div>
            <div className="rounded-xl border bg-card px-2 py-2.5">
              <dt className="sr-only">{t("saves")}</dt>
              <dd className="flex flex-col items-center gap-0.5">
                <Heart className="size-4 text-muted-foreground" aria-hidden />
                <span className="font-semibold tabular-nums">{fmt.digits(l.saveCount)}</span>
                <span className="text-muted-foreground" aria-hidden>
                  {t("saves")}
                </span>
              </dd>
            </div>
            <div className="rounded-xl border bg-card px-2 py-2.5">
              <dt className="sr-only">{td2("posted")}</dt>
              <dd className="flex flex-col items-center gap-0.5">
                <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
                <span className="font-semibold">{fmt.date(l.publishedAt)}</span>
                <span className="text-muted-foreground" aria-hidden>
                  {td2("posted")}
                </span>
              </dd>
            </div>
          </dl>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2 text-xs">
            <span className="text-muted-foreground">
              {td2("adId")}: <span className="font-mono font-semibold text-foreground">{adId}</span>
            </span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(adId);
                    toast.success(td2("adIdCopied"));
                  } catch {
                    /* clipboard blocked */
                  }
                }}
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={td2("copyAdId")}
              >
                <Copy className="size-3.5" />
              </button>
              {!l.viewer.isOwner && (
                <button type="button" onClick={openReport} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-medium text-muted-foreground hover:bg-muted hover:text-destructive">
                  <Flag className="size-3.5" aria-hidden /> {tc("report")}
                </button>
              )}
            </span>
          </div>
          <SafetyTips />
        </aside>
      </div>

      {similar && similar.length > 0 && (
        <section className="mt-14" aria-labelledby="similar">
          <SectionTitle
            id="similar"
            aside={
              <Link href={`/land/${l.areaSlug}`} className="inline-flex items-center gap-0.5 text-sm font-semibold text-primary hover:underline">
                {tc("viewAll")} <ChevronRight className="size-4" />
              </Link>
            }
          >
            {t("similar")}
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {similar.slice(0, 8).map((s) => (
              <ListingCard key={s._id} l={s} saved={!!savedIds?.includes(s._id)} />
            ))}
          </div>
        </section>
      )}

      {/* Mobile sticky contact bar */}
      {canContact && (
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pt-2.5 pb-[max(env(safe-area-inset-bottom),0.625rem)] shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.25)] backdrop-blur transition-transform duration-300 lg:hidden",
            barHidden && "pointer-events-none translate-y-full",
          )}
          aria-hidden={barHidden || undefined}
        >
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-heading text-lg leading-tight font-extrabold text-primary">{fmt.price(l.price)}</p>
              <p className="truncate text-[11px] text-muted-foreground">{td2("perUnit", { price: fmt.perUnit(l.price, l.sizeSqft, "katha"), unit: unitKatha })}</p>
            </div>
            {revealed?.phone ? (
              <>
                <a href={`tel:${revealed.phone}`} className={buttonVariants({ size: "icon", className: "size-11 rounded-full" })} aria-label={td2("call")} tabIndex={barHidden ? -1 : undefined}>
                  <Phone />
                </a>
                <a
                  href={whatsappHref(revealed.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "outline", size: "icon", className: "size-11 rounded-full" })}
                  aria-label={td2("whatsapp")}
                  tabIndex={barHidden ? -1 : undefined}
                >
                  <MessageCircle />
                </a>
              </>
            ) : (
              <Button variant="outline" size="icon" className="size-11 rounded-full" onClick={scrollToContact} aria-label={td2("call")} tabIndex={barHidden ? -1 : undefined}>
                <Phone />
              </Button>
            )}
            <Button className="h-11 rounded-full px-5 font-semibold" onClick={scrollToContact} tabIndex={barHidden ? -1 : undefined}>
              <MessageCircle /> {td2("message")}
            </Button>
          </div>
        </div>
      )}

      <ReportDialog listingId={l._id} open={reportOpen} onOpenChange={setReportOpen} />
      <ShareDialog title={l.title} open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}

function SafetyTips() {
  const t = useTranslations("listingDetail");
  const tl = useTranslations("listing");
  const tips = ["safety1", "safety2", "safety3", "safety4", "safety5"] as const;
  return (
    <section aria-labelledby="safety" className="mt-3 rounded-2xl border border-warm/40 bg-accent/40 p-4 text-sm text-accent-foreground">
      <h2 id="safety" className="flex items-center gap-2 font-heading text-base font-semibold">
        <ShieldCheck className="size-4.5 text-primary" aria-hidden /> {t("safetyTitle")}
      </h2>
      <ul className="mt-2.5 space-y-1.5">
        {tips.map((k) => (
          <li key={k} className="flex gap-2 text-[13px] leading-snug">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden /> {t(k)}
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-warm/30 pt-2.5 text-xs text-muted-foreground">{tl("disclaimer")}</p>
    </section>
  );
}

type DetailListing = NonNullable<ReturnType<typeof usePreloadedQuery<typeof api.listings.getBySlug>>>;

/** Owner-only shortcuts on their own ad (bikroy-style "edit / promote / mark sold" live in the dashboard). */
function OwnerTools({ l }: { l: DetailListing }) {
  const t = useTranslations("listingDetail");
  const tst = useTranslations("status");
  const fmt = useFmt();
  const promote = useMutation(api.listings.requestPromotion);
  const [busy, setBusy] = useState(false);
  const editable = l.status !== "sold" && l.status !== "expired";
  const canPromote = l.status === "active" && !l.isFeatured && !l.promotionRequested;
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border bg-card p-3.5 shadow-soft sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm">
        <p className="font-semibold">{t("ownerTools")}</p>
        <p className="text-xs text-muted-foreground">
          {tst(l.status)}
          {l.expiresAt ? ` · ${t("expiresOn", { date: fmt.date(l.expiresAt) })}` : ""}
          {l.promotionRequested && !l.isFeatured ? ` · ${t("promotionRequested")}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {editable && (
          <Link href={`/dashboard/listings/${l._id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Pencil /> {t("editAd")}
          </Link>
        )}
        <Link href="/dashboard/inquiries" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <MessageCircle /> {t("viewInquiries", { count: fmt.digits(l.inquiryCount) })}
        </Link>
        {canPromote && (
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await promote({ id: l._id });
                toast.success(t("promotionRequested"));
              } catch (err) {
                toast.error(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Megaphone />} {t("promoteAd")}
          </Button>
        )}
        <Link href="/dashboard/listings" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {t("myListings")}
        </Link>
      </div>
    </div>
  );
}

function ShareDialog({ title, open, onOpenChange }: { title: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("listingDetail");
  const tc = useTranslations("common");
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (open) setUrl(location.origin + location.pathname);
  }, [open]);
  const text = `${title} — ${url}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(tc("copied"));
      onOpenChange(false);
    } catch {
      /* clipboard blocked */
    }
  };
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const item = "flex flex-col items-center gap-1.5 rounded-xl border bg-card px-2 py-3 text-xs font-medium transition hover:bg-muted";
  const icon = "grid size-10 place-items-center rounded-full";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("shareTitle")}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-2">
          <a className={item} href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
            <span className={cn(icon, "bg-[#25D366] text-white")}>
              <MessageCircle className="size-5" />
            </span>
            {t("whatsapp")}
          </a>
          <a className={item} href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">
            <span className={cn(icon, "bg-[#1877F2] text-base font-bold text-white")} aria-hidden>
              f
            </span>
            {t("shareFacebook")}
          </a>
          <a className={item} href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`}>
            <span className={cn(icon, "bg-secondary text-primary")}>
              <Mail className="size-5" />
            </span>
            {t("shareEmail")}
          </a>
          <button type="button" className={item} onClick={copy}>
            <span className={cn(icon, "bg-secondary text-primary")}>
              <Link2 className="size-5" />
            </span>
            {t("copyLink")}
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
          <input readOnly value={url} aria-label={t("copyLink")} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none" />
          <Button size="sm" variant="outline" onClick={copy}>
            <Copy /> {t("copyLink")}
          </Button>
        </div>
        {canNativeShare && (
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await navigator.share({ title, url });
                  onOpenChange(false);
                } catch {
                  /* cancelled */
                }
              }}
            >
              <Share2 /> {t("shareMore")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
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

function AreaPriceInsight({ listingId, sizeSqft, unit }: { listingId: Id<"listings">; sizeSqft: number; unit: string }) {
  const td = useTranslations("listingDetail");
  const fmt = useFmt();
  const insight = useQuery(api.listings.areaInsight, { listingId });
  if (!insight) return null;
  const { diffPct, medianPerSqft, count, capped } = insight;
  const tone = Math.abs(diffPct) <= 5 ? "text-muted-foreground" : diffPct < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400";
  const message =
    Math.abs(diffPct) <= 5
      ? td("insightAtMedian")
      : diffPct < 0
        ? td("insightBelow", { pct: fmt.digits(Math.abs(diffPct)) })
        : td("insightAbove", { pct: fmt.digits(diffPct) });
  return (
    <aside className="mt-3 rounded-xl border bg-card px-4 py-3 text-sm" aria-label={td("insightTitle")}>
      <p className="flex items-center gap-2 font-medium">
        <BadgeCheck className="size-4 text-primary" aria-hidden /> {td("insightTitle")}
      </p>
      <p className={`mt-1 ${tone}`}>{message}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {td("insightMedian", { price: fmt.perUnit(medianPerSqft * sizeSqft, sizeSqft, "katha"), unit, count: fmt.digits(count) })}
        {capped ? td("insightCapped") : ""}
      </p>
    </aside>
  );
}
