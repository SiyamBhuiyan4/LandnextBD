"use client";

import { useConvexAuth, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { BellPlus, LayoutGrid, List, Map as MapIcon, SearchX, SlidersHorizontal, X } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ListingCard, ListingCardSkeleton, type ListingCardData } from "@/components/listings/listing-card";
import { FilterPanel } from "@/components/search/filter-panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useFmt } from "@/hooks/use-fmt";
import { errorMessage, readLocal, writeLocal } from "@/lib/client";
import { SORTS, type LandType, type ListingFilters } from "@/lib/constants";
import { countActiveFilters, filtersFromSearchParams, filtersToSearchParams, type BrowseFilters } from "@/lib/urls";
import { cn } from "@/lib/utils";

const MapView = dynamic(() => import("@/components/search/map-view"), {
  ssr: false,
  loading: () => <div className="h-[55vh] animate-pulse rounded-2xl bg-muted lg:h-[70vh]" />,
});

type Layout = "grid" | "list" | "map";

export function BrowseView({
  fixedArea,
  fixedType,
  title,
  initialPage,
}: {
  fixedArea?: { slug: string; _id: Id<"areas">; centerLat: number; centerLng: number };
  fixedType?: LandType;
  title: string;
  initialPage?: ListingCardData[];
}) {
  const t = useTranslations("browse");
  const ts = useTranslations("sort");
  const tc = useTranslations("common");
  const fmt = useFmt();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const urlFilters = useMemo(() => filtersFromSearchParams(new URLSearchParams(sp.toString())), [sp]);
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
  const savedIds = useQuery(api.saves.mySavedIds);
  const saved = new Set<string>(savedIds ?? []);
  const rows = results.length || status !== "LoadingFirstPage" ? results : (initialPage ?? []);

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

  return (
    <div className="container-page py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {status === "LoadingFirstPage" && !initialPage ? tc("loading") : t("results", { count: rows.length })}
            {status === "CanLoadMore" ? "+" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get("q")?.toString().trim();
              set({ q: q || undefined });
            }}
            className="relative"
            role="search"
          >
            <label htmlFor="kw" className="sr-only">
              {t("keyword")}
            </label>
            <input
              id="kw"
              name="q"
              key={urlFilters.q ?? ""}
              defaultValue={urlFilters.q}
              placeholder={t("keywordPlaceholder")}
              className="h-9 w-48 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 sm:w-60"
            />
          </form>
          <label className="sr-only" htmlFor="sort">
            {ts("label")}
          </label>
          <select
            id="sort"
            value={filters.sort ?? "newest"}
            onChange={(e) => set({ sort: e.target.value === "newest" ? undefined : (e.target.value as BrowseFilters["sort"]) })}
            className="h-9 rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
            disabled={!!filters.q}
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {ts(s)}
              </option>
            ))}
          </select>
          <div className="flex rounded-lg border p-0.5" role="group" aria-label="Layout">
            {(
              [
                ["grid", LayoutGrid, t("grid")],
                ["list", List, t("list")],
                ["map", MapIcon, t("map")],
              ] as const
            ).map(([k, Icon, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setLayout(k)}
                aria-pressed={layout === k}
                aria-label={label}
                className={cn("grid size-8 place-items-center rounded-md transition", layout === k ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="h-9" onClick={() => setSaveOpen(true)}>
            <BellPlus /> <span className="hidden sm:inline">{t("saveSearch")}</span>
          </Button>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 lg:hidden")}>
              <SlidersHorizontal /> {t("filters")}
              {active > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{fmt.digits(active)}</span>}
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl p-0">
              <SheetTitle className="border-b px-4 py-3">{t("filters")}</SheetTitle>
              <div className="overflow-y-auto px-4 py-3">
                <FilterPanel filters={filters} set={set} lockArea={!!fixedArea} lockType={!!fixedType} />
              </div>
              <div className="flex gap-2 border-t p-3">
                <Button variant="outline" className="flex-1" onClick={clear}>
                  {t("clear")}
                </Button>
                <Button className="flex-1" onClick={() => setSheetOpen(false)}>
                  {t("showResults")}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {active > 0 && (
        <button type="button" onClick={clear} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <X className="size-3.5" /> {t("clear")}
        </button>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="hidden lg:block" aria-label={t("filters")}>
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border bg-card p-4 shadow-soft">
            <FilterPanel filters={filters} set={set} lockArea={!!fixedArea} lockType={!!fixedType} />
          </div>
        </aside>

        <section aria-label={title} className="min-w-0">
          {layout === "map" ? (
            <MapView
              center={areaDoc ? [areaDoc.centerLat, areaDoc.centerLng] : [23.81, 90.41]}
              zoom={areaDoc ? 13 : 11}
              landType={filters.landType}
              minPrice={filters.minPrice}
              maxPrice={filters.maxPrice}
            />
          ) : (
            <>
              {rows.length === 0 && status !== "LoadingFirstPage" ? (
                <div className="grid place-items-center rounded-2xl border border-dashed px-6 py-16 text-center">
                  <SearchX className="size-10 text-muted-foreground" aria-hidden />
                  <h2 className="mt-3 font-heading text-lg font-semibold">{t("emptyTitle")}</h2>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("emptyBody")}</p>
                  {active > 0 && (
                    <Button variant="outline" className="mt-4" onClick={clear}>
                      {t("clear")}
                    </Button>
                  )}
                </div>
              ) : (
                <div className={cn("grid gap-4", layout === "grid" ? "sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1")}>
                  {rows.map((l, i) => (
                    <ListingCard key={l._id} l={l} saved={saved.has(l._id)} layout={layout} priority={i < 3} />
                  ))}
                  {(status === "LoadingFirstPage" && rows.length === 0) || isLoading
                    ? Array.from({ length: rows.length ? 3 : 6 }, (_, i) => <ListingCardSkeleton key={`s${i}`} layout={layout} />)
                    : null}
                </div>
              )}
              <div ref={sentinel} className="h-10" />
              {status === "CanLoadMore" && (
                <div className="flex justify-center">
                  <Button variant="outline" onClick={() => loadMore(12)}>
                    {t("loadMore")}
                  </Button>
                </div>
              )}
              {status === "Exhausted" && rows.length > 6 && <p className="text-center text-sm text-muted-foreground">{t("endOfResults")}</p>}
            </>
          )}
        </section>
      </div>

      <SaveSearchDialog open={saveOpen} onOpenChange={setSaveOpen} filters={convexFilters} defaultName={title} />
    </div>
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
