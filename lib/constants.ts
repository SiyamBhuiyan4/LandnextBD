// Shared enums and config used by both the Next.js app and Convex functions.

/** Site name shown to visitors, and the company behind it. */
export const BRAND = { site: "land.db", company: "LandnestBD" } as const;

export const LAND_TYPES = ["residential", "commercial", "mixed_use", "industrial", "farmland", "quarry"] as const;
export type LandType = (typeof LAND_TYPES)[number];

export const UTILITIES = ["electricity", "water", "gas", "sewerage", "drainage"] as const;
export type Utility = (typeof UTILITIES)[number];

export const FACILITIES = [
  "car_parking",
  "school",
  "hospital",
  "mosque",
  "market",
  "park",
  "bus_stand",
  "highway",
  "lake_view",
  "security",
] as const;
export type Facility = (typeof FACILITIES)[number];

export const FACINGS = ["north", "south", "east", "west", "north_east", "north_west", "south_east", "south_west"] as const;
export type Facing = (typeof FACINGS)[number];

export const DOCUMENT_TYPES = ["deed", "khatian", "mutation", "approval"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const LISTING_STATUSES = ["draft", "pending_review", "active", "sold", "expired", "rejected"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const ROLES = ["buyer", "seller", "broker", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ACCOUNT_TYPES = ["owner", "broker", "company"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const SORTS = ["newest", "oldest", "price_asc", "price_desc", "size_desc", "views"] as const;
export type SortKey = (typeof SORTS)[number];

export const REPORT_REASONS = ["fake", "duplicate", "wrong_price", "sold", "scam", "offensive", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Price buckets for quick filters (BDT). */
export const PRICE_BUCKETS: { min?: number; max?: number; key: string }[] = [
  { key: "under_25l", max: 2_500_000 },
  { key: "25l_50l", min: 2_500_000, max: 5_000_000 },
  { key: "50l_1cr", min: 5_000_000, max: 10_000_000 },
  { key: "1cr_3cr", min: 10_000_000, max: 30_000_000 },
  { key: "over_3cr", min: 30_000_000 },
];

/** Size buckets for quick filters, in katha (converted to sqft when querying). */
export const SIZE_BUCKETS_KATHA: { min?: number; max?: number; key: string }[] = [
  { key: "under_3", max: 3 },
  { key: "3_5", min: 3, max: 5 },
  { key: "5_10", min: 5, max: 10 },
  { key: "10_20", min: 10, max: 20 },
  { key: "over_20", min: 20 },
];

/** "Posted within" choices (days) for the date filter. */
export const POSTED_WITHIN_DAYS = [1, 7, 30] as const;

/** Units offered in the size filter (values are converted to sqft for the URL/query). */
export const SIZE_FILTER_UNITS = ["katha", "decimal", "bigha", "acre"] as const;

export const PRICE_SLIDER_MAX = 50_000_000; // 5 crore
export const SIZE_SLIDER_MAX_KATHA = 100;

export const CONFIG = {
  listingValidityDays: 90,
  maxImages: 12,
  maxImageBytes: 8 * 1024 * 1024,
  maxDocBytes: 10 * 1024 * 1024,
  maxVideosPerListing: 5,
  maxVideoBytes: 1024 * 1024 * 1024, // 1 GB; stored on Telegram in parts
  maxVideoDurationSec: 30 * 60,
  /** Files bigger than this are uploaded and stored on Telegram in parts of this size (Bot API downloads stop at 20 MB). */
  telegramChunkBytes: 19 * 1024 * 1024,
  videoMimeTypes: ["video/mp4", "video/quicktime", "video/webm"],
  imageMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
  docMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  inquiryLimitPerHour: 10,
  viewDedupeHours: 6,
  compareMax: 3,
  abandonedUploadHours: 24,
} as const;

/** Filters accepted by listing search, shared by the URL state and Convex. */
export type ListingFilters = {
  q?: string;
  division?: string;
  district?: string;
  areaId?: string;
  landType?: LandType;
  minPrice?: number;
  maxPrice?: number;
  minSqft?: number;
  maxSqft?: number;
  facing?: Facing;
  minRoadWidth?: number;
  verifiedOnly?: boolean;
  hasVideo?: boolean;
  negotiable?: boolean;
  /** Posted by: owner / broker (agent) / developer company. */
  sellerType?: AccountType;
  /** Only listings published in the last N days. */
  postedWithinDays?: number;
  utilities?: Utility[];
  facilities?: Facility[];
  sort?: SortKey;
};
