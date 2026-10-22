"use client";

import { useConvexAuth, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { ArrowUpDown, BellPlus, ChevronDown, ChevronRight, LayoutGrid, List, Loader2, Map as MapIcon, MapPin, Search, SearchX, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ListingCard, ListingCardSkeleton, type ListingCardData } from "@/components/listings/listing-card";
import { FilterPanel } from "@/components/search/filter-panel";
import { areaLabel, districtName, divisionName } from "@/lib/places";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useFmt } from "@/hooks/use-fmt";
import { errorMessage, readLocal, writeLocal } from "@/lib/client";
import { SORTS, type LandType, type ListingFilters } from "@/lib/constants";
import { fromSqft } from "@/lib/units";
import { countActiveFilters, filtersFromSearchParams, filtersToSearchParams, type BrowseFilters } from "@/lib/urls";
import { cn } from "@/lib/utils";

const MapView = dynamic(() => import("@/components/search/map-view"), {
  ssr: false,
  loading: () => <div className="h-[55vh] skeleton rounded-2xl lg:h-[70vh]" />,
});

type Layout = "grid" | "list" | "map";
const LAYOUTS = [
  ["grid", LayoutGrid],
  ["list", List],
  ["map", MapIcon],
] as const;

type Chip = { key: string; label: string; remove: () => void };

/** Human-readable, individually removable chips for every active URL filter. */
function useActiveChips(
  f: BrowseFilters,
  set: (patch: Partial<BrowseFilters>) => void,
  opts: { lockArea: boolean; lockType: boolean; areaLabel?: string },
): Chip[] {
  const t = useTranslations("browse");
  const tl = useTranslations("landType");
  const tf = useTranslations("facing");
  const tu = useTranslations("utilities");
  const tfa = useTranslations("facilities");
  const tst = useTranslations("sellerType");
  const fmt = useFmt();
  const katha = fmt.locale === "bn" ? "কাঠা" : "katha";
  const range = (min: number | undefined, max: number | undefined, show: (n: number) => string) =>
    min && max ? `${show(min)} – ${show(max)}` : min ? `${show(min)}+` : `≤ ${show(max ?? 0)}`;
  const chips: Chip[] = [];
  if (f.q) chips.push({ key: "q", label: `“${f.q}”`, remove: () => set({ q: undefined }) });
  if (!opts.lockArea) {
    if (f.area) chips.push({ key: "area", label: opts.areaLabel ?? f.area, remove: () => set({ area: undefined }) });
    if (f.district) chips.push({ key: "district", label: districtName(f.district, fmt.locale), remove: () => set({ district: undefined, area: undefined }) });
    if (f.division) chips.push({ key: "division", label: divisionName(f.division, fmt.locale), remove: () => set({ division: undefined, district: undefined, area: undefined }) });
  }
  if (f.landType && !opts.lockType) chips.push({ key: "landType", label: tl(f.landType), remove: () => set({ landType: undefined }) });
  if (f.minPrice || f.maxPrice) chips.push({ key: "price", label: range(f.minPrice, f.maxPrice, (n) => fmt.price(n, false)), remove: () => set({ minPrice: undefined, maxPrice: undefined }) });
  if (f.minSqft || f.maxSqft)
    chips.push({
      key: "size",
      label: `${range(f.minSqft, f.maxSqft, (n) => fmt.digits(Math.round(fromSqft(n, "katha"))))} ${katha}`,
      remove: () => set({ minSqft: undefined, maxSqft: undefined }),
    });
  if (f.facing) chips.push({ key: "facing", label: tf(f.facing), remove: () => set({ facing: undefined }) });
  if (f.minRoadWidth) chips.push({ key: "road", label: `${t("roadWidth")}: ${t("feet", { n: fmt.digits(f.minRoadWidth) })}`, remove: () => set({ minRoadWidth: undefined }) });
  if (f.verifiedOnly) chips.push({ key: "verified", label: t("verifiedOnly"), remove: () => set({ verifiedOnly: undefined }) });
  if (f.hasVideo) chips.push({ key: "video", label: t("hasVideo"), remove: () => set({ hasVideo: undefined }) });
  if (f.sellerType) chips.push({ key: "seller", label: `${t("postedBy")}: ${tst(f.sellerType)}`, remove: () => set({ sellerType: undefined }) });
  if (f.postedWithinDays) chips.push({ key: "within", label: t(`within_${f.postedWithinDays}`), remove: () => set({ postedWithinDays: undefined }) });
  if (f.negotiable) chips.push({ key: "neg", label: t("negotiable"), remove: () => set({ negotiable: undefined }) });
  for (const u of f.utilities ?? []) chips.push({ key: `u-${u}`, label: tu(u), remove: () => set({ utilities: f.utilities?.filter((x) => x !== u) }) });
  for (const x of f.facilities ?? []) chips.push({ key: `f-${x}`, label: tfa(x), remove: () => set({ facilities: f.facilities?.filter((y) => y !== x) }) });
  return chips;
}

export function BrowseView({
  fixedArea,
  fixedType,
  title,
  initialPage,
  initialCount,
  initialKey = "",
  breadcrumbs,
}: {
  fixedArea?: { slug: string; _id: Id<"areas">; centerLat: number; centerLng: number };
  fixedType?: LandType;
  title: string;
  /** Server-rendered first page (for SEO); used only while the URL still matches the one it was rendered for. */
  initialPage?: ListingCardData[];
  initialCount?: { total: number; capped: boolean };
  /** filtersToSearchParams() of the URL filters the initial data was rendered for. */
  initialKey?: string;
  breadcrumbs?: { label: string; href?: string }[];
}) {
  const t = useTranslations("browse");
  const ts = useTranslations("sort");
  const tc = useTranslations("common");
  const fmt = useFmt();
  const locale = useLocale();
  const pathname = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const urlFilters = useMemo(() => filtersFromSearchParams(new URLSearchParams(sp.toString())), [sp]);
  const filterKey = filtersToSearchParams(urlFilters).toString();
  const useInitial = filterKey === initialKey;
  const filters: BrowseFilters = { ...urlFilters, ...(fixedArea ? { area: fixedArea.slug } : {}), ...(fixedType ? { landType: fixedType } : {}) };

  const areas = useQuery(api.areas.all);
  const areaDoc = fixedArea ?? areas?.find((a) => a.slug === filters.area);
  const areaPending = !!filters.area && !fixedArea && areas === undefined;

  // URL filters -> Convex filters (area slug -> id).
  const { area: _area, ...rest } = filters;
  const convexFilters: ListingFilters & { areaId?: Id<"areas"> } = { ...rest, areaId: areaDoc?._id };

  const { results, status, loadMore, isLoading } = usePaginatedQuery(
    api.listings.search,
    areaPending ? "skip" : { filters: convexFilters },
    { initialNumItems: 12 },
  );
  const { sort: _sort, ...countFilters } = convexFilters;
  const liveCount = useQuery(api.listings.count, areaPending ? "skip" : { filters: countFilters });
  const count = liveCount ?? (useInitial ? initialCount : undefined);
  const savedIds = useQuery(api.saves.mySavedIds);
  const saved = new Set<string>(savedIds ?? []);
  const rows = results.length || status !== "LoadingFirstPage" ? results : useInitial ? (initialPage ?? []) : [];

  const [layout, setLayoutState] = useState<Layout>("grid");
  useEffect(() => setLayoutState(readLocal<Layout>("lnb_layout", "grid")), []);
  const setLayout = (l: Layout) => {
    setLayoutState(l);
    writeLocal("lnb_layout", l);
  };
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  const set = (patch: Partial<BrowseFilters>) => {
    const next = { ...urlFilters, ...patch };
    if (fixedArea) delete next.area;
    if (fixedType) delete next.landType;
    const qs = filtersToSearchParams(next).toString();
    // replace (not push, not raw pushState): filter changes must not add Back steps that
    // swallow the user's real Back press, and the Next router must know about the new URL.
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const clear = () => router.replace(pathname, { scroll: false });

  // Infinite scroll
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || layout === "map") return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && status === "CanLoadMore" && loadMore(12), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [status, loadMore, layout]);

  const active = countActiveFilters(urlFilters);
  const chips = useActiveChips(urlFilters, set, { lockArea: !!fixedArea, lockType: !!fixedType, areaLabel: areas?.find((a) => a.slug === urlFilters.area)?.[locale === "bn" ? "areaNameBn" : "areaName"] ?? areas?.find((a) => a.slug === urlFilters.area)?.areaName });
  const firstLoad = status === "LoadingFirstPage" && rows.length === 0;
  // /browse: title + breadcrumbs follow client-side location changes (the server props match only the first URL).
  let shownTitle = title;
  let crumbs = breadcrumbs;
  if (!fixedArea && !fixedType && !useInitial) {
    const a = urlFilters.area ? areas?.find((x) => x.slug === urlFilters.area) : undefined;
    const place = a ? areaLabel(a, locale) : urlFilters.district ? districtName(urlFilters.district, locale) : urlFilters.division ? divisionName(urlFilters.division, locale) : undefined;
    shownTitle = place ? t("titleIn", { place }) : t("title");
    crumbs = [
      { label: t("home"), href: "/" },
      { label: t("landForSale"), href: "/browse" },
      ...(urlFilters.division ? [{ label: divisionName(urlFilters.division, locale), href: `/browse?division=${encodeURIComponent(urlFilters.division)}` }] : []),
      ...(urlFilters.district ? [{ label: districtName(urlFilters.district, locale), href: `/browse?district=${encodeURIComponent(urlFilters.district)}` }] : []),
      ...(a ? [{ label: areaLabel(a, locale), href: `/land/${a.slug}` }] : []),
    ];
  }
  const countText = count ? (count.capped ? t("resultsCapped", { count: fmt.digits(count.total) }) : t("results", { count: count.total })) : undefined;

  const suggestions: { label: string; patch: Partial<BrowseFilters> }[] = [];
  if (!fixedArea && (urlFilters.area || urlFilters.district || urlFilters.division)) suggestions.push({ label: t("suggestAllAreas"), patch: { area: undefined, district: undefined, division: undefined } });
  if (urlFilters.minPrice || urlFilters.maxPrice) suggestions.push({ label: t("suggestNoPrice"), patch: { minPrice: undefined, maxPrice: undefined } });
  if (urlFilters.minSqft || urlFilters.maxSqft) suggestions.push({ label: t("suggestNoSize"), patch: { minSqft: undefined, maxSqft: undefined } });
  if (!fixedType && urlFilters.landType) suggestions.push({ label: t("suggestNoType"), patch: { landType: undefined } });

  const controlCls = "h-10 rounded-xl border bg-background text-sm outline-none transition-colors hover:border-primary/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

  return (
    <div className="container-page pt-6 pb-10">
      <div>
        {crumbs && crumbs.length > 1 && (
          <nav aria-label={t("breadcrumb")} className="mb-2">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {crumbs.map((b, i) => (
                <li key={`${i}-${b.label}`} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="size-3 opacity-60" aria-hidden />}
                  {b.href && i < crumbs.length - 1 ? (
                    <Link href={b.href} className="hover:text-foreground hover:underline">
                      {b.label}
                    </Link>
                  ) : (
                    <span aria-current={i === crumbs.length - 1 ? "page" : undefined} className={i === crumbs.length - 1 ? "font-medium text-foreground" : undefined}>
                      {b.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">{shownTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
          {countText ? (
            <span className="font-semibold text-foreground">{countText}</span>
          ) : firstLoad ? (
            tc("loading")
          ) : (
            <>
              <span className="font-semibold text-foreground">{t("results", { count: rows.length })}</span>
              {status === "CanLoadMore" ? "+" : ""}
            </>
          )}
        </p>
      </div>

      {/* Sticky search / sort bar */}
      <div className="sticky top-16 z-30 -mx-4 mt-4 border-b bg-background/90 px-4 py-2.5 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex items-center gap-2">
          <KeywordSearch value={urlFilters.q} onSearch={(q) => set({ q })} onPickArea={fixedArea ? undefined : (slug) => set({ q: undefined, area: slug, district: undefined, division: undefined })} className={controlCls} />
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger aria-label={t("filters")} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-10 rounded-xl lg:hidden")}>
              <SlidersHorizontal /> <span>{t("filters")}</span>
              {active > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{fmt.digits(active)}</span>}
            </SheetTrigger>
            <SheetContent side="bottom" className="flex max-h-[88vh] flex-col rounded-t-3xl p-0">
              <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted" aria-hidden />
              <SheetTitle className="border-b px-4 py-3 font-heading">{t("filters")}</SheetTitle>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <FilterPanel filters={filters} set={set} lockArea={!!fixedArea} lockType={!!fixedType} counts={liveCount} />
              </div>
              <div className="flex gap-2 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <Button variant="outline" className="h-11 flex-1 rounded-xl" onClick={clear} disabled={active === 0}>
                  {t("clear")}
                </Button>
                <Button className="h-11 flex-[2] rounded-xl font-semibold" onClick={() => setSheetOpen(false)}>
                  {t("showResults")}
                  {count ? ` (${fmt.digits(count.total)}${count.capped ? "+" : ""})` : status !== "LoadingFirstPage" && ` (${fmt.digits(rows.length)}${status === "CanLoadMore" ? "+" : ""})`}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <label className="sr-only" htmlFor="sort">
            {ts("label")}
          </label>
          <div className="relative">
            <ArrowUpDown className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <select
              id="sort"
              value={filters.sort ?? "newest"}
              onChange={(e) => set({ sort: e.target.value === "newest" ? undefined : (e.target.value as BrowseFilters["sort"]) })}
              className={cn(controlCls, "w-10 cursor-pointer appearance-none pl-9 text-transparent sm:w-auto sm:pr-3 sm:text-foreground")}
              disabled={!!filters.q}
            >
              {SORTS.map((s) => (
                <option key={s} value={s} className="text-foreground">
                  {ts(s)}
                </option>
              ))}
            </select>
          </div>
          <div className="hidden rounded-xl border bg-background p-0.5 sm:flex" role="group" aria-label={t("layout")}>
            {LAYOUTS.map(([k, Icon]) => (
              <button
                key={k}
                type="button"
                onClick={() => setLayout(k)}
                aria-pressed={layout === k}
                aria-label={t(k)}
                title={t(k)}
                className={cn("grid size-8.5 place-items-center rounded-lg transition", layout === k ? "bg-primary text-primary-foreground shadow-elev-1" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="h-10 rounded-xl" onClick={() => setSaveOpen(true)} aria-label={t("saveSearch")}>
            <BellPlus /> <span className="hidden xl:inline">{t("saveSearch")}</span>
          </Button>
        </div>
        {/* Mobile layout switch */}
        <div className="mt-2 grid grid-cols-3 rounded-xl border bg-background p-0.5 sm:hidden" role="group" aria-label={t("layout")}>
          {LAYOUTS.map(([k, Icon]) => (
            <button
              key={k}
              type="button"
              onClick={() => setLayout(k)}
              aria-pressed={layout === k}
              className={cn("flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition", layout === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            >
              <Icon className="size-3.5" aria-hidden /> {t(k)}
            </button>
          ))}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label={t("activeFilters")}>
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.remove}
              aria-label={t("removeFilter", { label: c.label })}
              className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-secondary py-1 pr-1.5 pl-3 text-xs font-medium text-secondary-foreground transition hover:border-primary/60"
            >
              {c.label}
              <X className="size-3.5 opacity-70" aria-hidden />
            </button>
          ))}
          {chips.length > 1 && (
            <button type="button" onClick={clear} className="ml-1 rounded-full px-2 py-1 text-xs font-semibold text-primary hover:underline">
              {t("clear")}
            </button>
          )}
        </div>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-[288px_1fr]">
        <aside className="hidden lg:block" aria-label={t("filters")}>
          <div className="sticky top-[8.5rem] max-h-[calc(100vh-9.5rem)] overflow-y-auto rounded-2xl border bg-card p-4 shadow-elev-1">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-heading font-bold">
                <SlidersHorizontal className="size-4 text-primary" aria-hidden /> {t("filters")}
              </h2>
              {active > 0 && (
                <button type="button" onClick={clear} className="text-xs font-semibold text-primary hover:underline">
                  {t("clear")}
                </button>
              )}
            </div>
            <FilterPanel filters={filters} set={set} lockArea={!!fixedArea} lockType={!!fixedType} counts={liveCount} />
          </div>
        </aside>

        <section aria-label={shownTitle} className="min-w-0">
          {layout === "map" ? (
            <MapView
              center={areaDoc ? [areaDoc.centerLat, areaDoc.centerLng] : [23.81, 90.41]}
              zoom={areaDoc ? 13 : 11}
              filters={countFilters}
            />
          ) : (
            <>
              {rows.length === 0 && status !== "LoadingFirstPage" ? (
                <div className="grid place-items-center rounded-3xl border border-dashed bg-surface px-6 py-16 text-center">
                  <span className="grid size-16 place-items-center rounded-2xl bg-card text-muted-foreground shadow-elev-1">
                    <SearchX className="size-8" aria-hidden />
                  </span>
                  <h2 className="mt-4 font-heading text-xl font-bold">{t("emptyTitle")}</h2>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("emptyBody")}</p>
                  {(suggestions.length > 0 || active > 0) && (
                    <>
                      <p className="mt-6 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("emptySuggestions")}</p>
                      <div className="mt-2 flex flex-wrap justify-center gap-2">
                        {suggestions.map((sg) => (
                          <Button key={sg.label} variant="outline" className="rounded-full" onClick={() => set(sg.patch)}>
                            {sg.label}
                          </Button>
                        ))}
                        {active > 0 && (
                          <Button className="rounded-full" onClick={clear}>
                            {t("clear")}
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className={cn("stagger-in grid gap-4 sm:gap-5", layout === "grid" ? "sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1")}>
                  {rows.map((l, i) => (
                    <ListingCard key={l._id} l={l} saved={saved.has(l._id)} layout={layout} priority={i < 3} />
                  ))}
                  {firstLoad || isLoading ? Array.from({ length: rows.length ? 3 : 6 }, (_, i) => <ListingCardSkeleton key={`s${i}`} layout={layout} />) : null}
                </div>
              )}
              <div ref={sentinel} className="h-10" />
              {status === "CanLoadMore" && (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    {t("showing", { shown: fmt.digits(rows.length) })}
                    {count && ` / ${fmt.digits(count.total)}${count.capped ? "+" : ""}`}
                  </p>
                  <Button variant="outline" size="lg" className="h-11 rounded-full px-8 font-semibold" onClick={() => loadMore(12)}>
                    {t("loadMore")} <ChevronDown />
                  </Button>
                </div>
              )}
              {status === "LoadingMore" && (
                <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> {tc("loading")}
                </p>
              )}
              {status === "Exhausted" && rows.length > 6 && <p className="text-center text-sm text-muted-foreground">{t("endOfResults")}</p>}
            </>
          )}
        </section>
      </div>

      <SaveSearchDialog open={saveOpen} onOpenChange={setSaveOpen} filters={convexFilters} defaultName={shownTitle} />
    </div>
  );
}

/** Keyword box with area suggestions (English or Bangla names) while typing. */
function KeywordSearch({
  value,
  onSearch,
  onPickArea,
  className,
}: {
  value?: string;
  onSearch: (q: string | undefined) => void;
  onPickArea?: (slug: string) => void;
  className: string;
}) {
  const t = useTranslations("browse");
  const fmt = useFmt();
  const [text, setText] = useState(value ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => setText(value ?? ""), [value]);
  const areas = useQuery(api.areas.all, onPickArea && text.trim().length >= 2 ? {} : "skip");
  const term = text.trim().toLowerCase();
  const matches =
    onPickArea && term.length >= 2 && areas
      ? areas
          .filter((a) => a.areaName.toLowerCase().includes(term) || a.areaNameBn?.includes(text.trim()) || a.district.toLowerCase().includes(term))
          .sort((a, b) => b.activeCount - a.activeCount)
          .slice(0, 5)
      : [];
  const options = [...matches.map((a) => ({ kind: "area" as const, a })), ...(term ? [{ kind: "q" as const }] : [])];
  const show = open && matches.length > 0;
  const choose = (i: number) => {
    const o = options[i];
    setOpen(false);
    if (o?.kind === "area") {
      setText("");
      onPickArea?.(o.a.slug);
    } else onSearch(text.trim() || undefined);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (show && active >= 0) choose(active);
        else {
          setOpen(false);
          onSearch(text.trim() || undefined);
        }
      }}
      className="relative min-w-0 flex-1"
      role="search"
    >
      <label htmlFor="kw" className="sr-only">
        {t("keyword")}
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        id="kw"
        name="q"
        type="search"
        role="combobox"
        aria-expanded={show}
        aria-controls="kw-suggestions"
        aria-autocomplete="list"
        aria-activedescendant={show && active >= 0 ? `kw-opt-${active}` : undefined}
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % options.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={t("keywordPlaceholder")}
        className={cn(className, "w-full pr-3 pl-9 lg:max-w-md")}
      />
      {show && (
        <ul id="kw-suggestions" role="listbox" aria-label={t("suggestAreas")} className="absolute top-full left-0 z-40 mt-1 w-full overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-elev-3 lg:max-w-md">
          {options.map((o, i) => (
            <li
              key={o.kind === "area" ? o.a._id : "q"}
              id={`kw-opt-${i}`}
              role="option"
              aria-selected={active === i}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
              className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm", active === i ? "bg-muted" : "hover:bg-muted")}
            >
              {o.kind === "area" ? (
                <>
                  <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {areaLabel(o.a, fmt.locale)}, <span className="text-muted-foreground">{districtName(o.a.district, fmt.locale)}</span>
                  </span>
                  <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground tabular-nums">{fmt.digits(o.a.activeCount)}</span>
                </>
              ) : (
                <>
                  <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{t("searchKeyword", { q: text.trim() })}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

function SaveSearchDialog({
  open,
  onOpenChange,
  filters,
  defaultName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  filters: ListingFilters & { areaId?: Id<"areas"> };
  defaultName: string;
}) {
  const t = useTranslations("browse");
  const tc = useTranslations("common");
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const create = useMutation(api.savedSearches.create);
  const [name, setName] = useState(defaultName);
  const [via, setVia] = useState<"email" | "push">("push");
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(defaultName), [defaultName]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("saveSearchTitle")}</DialogTitle>
        </DialogHeader>
        {!isAuthenticated ? (
          <Button onClick={() => router.push(`/signin?next=${encodeURIComponent(location.pathname + location.search)}`)}>{tc("signIn")}</Button>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const { sort: _s, ...f } = filters;
                await create({ name, filters: f, notifyVia: via });
                toast.success(t("searchSaved"));
                onOpenChange(false);
              } catch (err) {
                toast.error(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="block text-sm font-medium">
              {t("searchName")}
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required className="mt-1.5 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40" />
            </label>
            <fieldset>
              <legend className="text-sm font-medium">{t("notifyVia")}</legend>
              <div className="mt-2 flex gap-2">
                {(["push", "email"] as const).map((v) => (
                  <label key={v} className={cn("flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center text-sm", via === v && "border-primary bg-secondary font-semibold")}>
                    <input type="radio" name="via" className="sr-only" checked={via === v} onChange={() => setVia(v)} />
                    {t(v)}
                  </label>
                ))}
              </div>
            </fieldset>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {t("saveSearch")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
