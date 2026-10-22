import { ACCOUNT_TYPES, FACILITIES, FACINGS, LAND_TYPES, POSTED_WITHIN_DAYS, SORTS, UTILITIES, type LandType, type ListingFilters } from "./constants";

/** mixed_use <-> mixed-use for clean URLs. */
export const landTypeToSlug = (t: LandType) => t.replace(/_/g, "-");
export const slugToLandType = (s: string): LandType | null => {
  const t = s.replace(/-/g, "_");
  return (LAND_TYPES as readonly string[]).includes(t) ? (t as LandType) : null;
};

export function listingHref(l: { areaSlug: string; landType: LandType; slug: string }) {
  return `/land/${l.areaSlug}/${landTypeToSlug(l.landType)}/${l.slug}`;
}

// ---------- filters <-> URL ----------

/** URL-level filters: the area is a slug (?area=purbachal), resolved to an id client-side. */
export type BrowseFilters = Omit<ListingFilters, "areaId"> & { area?: string };

const NUM_KEYS = ["minPrice", "maxPrice", "minSqft", "maxSqft", "minRoadWidth"] as const;
const BOOL_KEYS = ["verifiedOnly", "hasVideo", "negotiable"] as const;

export function filtersFromSearchParams(sp: URLSearchParams | Record<string, string | string[] | undefined>): BrowseFilters {
  const get = (k: string): string | undefined => {
    if (sp instanceof URLSearchParams) return sp.get(k) ?? undefined;
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const f: BrowseFilters = {};
  const q = get("q")?.trim();
  if (q) f.q = q.slice(0, 100);
  for (const k of ["division", "district", "area"] as const) {
    const v = get(k);
    if (v) f[k] = v.slice(0, 64);
  }
  const lt = get("landType");
  if (lt && (LAND_TYPES as readonly string[]).includes(lt)) f.landType = lt as LandType;
  const facing = get("facing");
  if (facing && (FACINGS as readonly string[]).includes(facing)) f.facing = facing as ListingFilters["facing"];
  const seller = get("sellerType");
  if (seller && (ACCOUNT_TYPES as readonly string[]).includes(seller)) f.sellerType = seller as ListingFilters["sellerType"];
  const within = Number(get("postedWithinDays"));
  if ((POSTED_WITHIN_DAYS as readonly number[]).includes(within)) f.postedWithinDays = within;
  const sort = get("sort");
  if (sort && (SORTS as readonly string[]).includes(sort)) f.sort = sort as ListingFilters["sort"];
  for (const k of NUM_KEYS) {
    const n = Number(get(k));
    if (get(k) && Number.isFinite(n) && n >= 0) f[k] = n;
  }
  for (const k of BOOL_KEYS) if (get(k) === "1" || get(k) === "true") f[k] = true;
  const utils = get("utilities")?.split(",").filter((u) => (UTILITIES as readonly string[]).includes(u));
  if (utils?.length) f.utilities = utils as ListingFilters["utilities"];
  const fac = get("facilities")?.split(",").filter((u) => (FACILITIES as readonly string[]).includes(u));
  if (fac?.length) f.facilities = fac as ListingFilters["facilities"];
  return f;
}

export function filtersToSearchParams(f: BrowseFilters): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === "" || v === false) continue;
    if (Array.isArray(v)) {
      if (v.length) sp.set(k, v.join(","));
    } else if (v === true) sp.set(k, "1");
    else sp.set(k, String(v));
  }
  return sp;
}

export function countActiveFilters(f: BrowseFilters) {
  return Object.entries(f).filter(([k, v]) => k !== "sort" && k !== "q" && v !== undefined && (!Array.isArray(v) || v.length > 0)).length;
}
