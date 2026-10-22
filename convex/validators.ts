import { v, type VLiteral, type VUnion } from "convex/values";
import {
  ACCOUNT_TYPES,
  DOCUMENT_TYPES,
  FACILITIES,
  FACINGS,
  LAND_TYPES,
  LISTING_STATUSES,
  REPORT_REASONS,
  ROLES,
  SORTS,
  UTILITIES,
} from "../lib/constants";
import { SIZE_UNITS } from "../lib/units";

function literals<T extends string>(values: readonly T[]) {
  return v.union(...values.map((x) => v.literal(x))) as VUnion<T, VLiteral<T, "required">[], "required", never>;
}

export const vLandType = literals(LAND_TYPES);
export const vUtility = literals(UTILITIES);
export const vFacility = literals(FACILITIES);
export const vFacing = literals(FACINGS);
export const vDocumentType = literals(DOCUMENT_TYPES);
export const vListingStatus = literals(LISTING_STATUSES);
export const vRole = literals(ROLES);
export const vAccountType = literals(ACCOUNT_TYPES);
export const vSizeUnit = literals(SIZE_UNITS);
export const vSort = literals(SORTS);
export const vReportReason = literals(REPORT_REASONS);
export const vVerificationStatus = v.union(v.literal("unverified"), v.literal("pending"), v.literal("verified"), v.literal("rejected"));
export const vVideoStatus = v.union(v.literal("uploading"), v.literal("processing"), v.literal("ready"), v.literal("failed"));
export const vModeration = v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"));
export const vLandStatus = v.union(v.literal("ready"), v.literal("under_development"));

export const vListingFilters = v.object({
  q: v.optional(v.string()),
  division: v.optional(v.string()),
  district: v.optional(v.string()),
  areaId: v.optional(v.id("areas")),
  landType: v.optional(vLandType),
  minPrice: v.optional(v.number()),
  maxPrice: v.optional(v.number()),
  minSqft: v.optional(v.number()),
  maxSqft: v.optional(v.number()),
  facing: v.optional(vFacing),
  minRoadWidth: v.optional(v.number()),
  verifiedOnly: v.optional(v.boolean()),
  hasVideo: v.optional(v.boolean()),
  negotiable: v.optional(v.boolean()),
  sellerType: v.optional(vAccountType),
  postedWithinDays: v.optional(v.number()),
  utilities: v.optional(v.array(vUtility)),
  facilities: v.optional(v.array(vFacility)),
  sort: v.optional(vSort),
});

export const vDocument = v.object({
  type: vDocumentType,
  fileId: v.id("media"),
  verified: v.boolean(),
  fileName: v.optional(v.string()),
});
