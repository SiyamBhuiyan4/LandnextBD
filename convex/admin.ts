import { ConvexError, v } from "convex/values";
import { Scrypt } from "lucia";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { dhakaDay, listingCard, requireRole, requireUser, setListingStatus } from "./helpers";
import { mediaUrl, signedDocumentUrl } from "./media";
import { syncListingHasVideo } from "./videos";
import { vRole, vVerificationStatus } from "./validators";
import { CONFIG } from "../lib/constants";

const requireAdmin = (ctx: QueryCtx) => requireRole(ctx, ["admin"]);

// ---------- trust & safety signals ----------

async function signalsFor(ctx: QueryCtx, l: Doc<"listings">) {
  const seller = await ctx.db.get(l.sellerId);
  const accountAgeDays = seller ? (Date.now() - (seller.createdAt ?? seller._creationTime)) / 86400_000 : 0;

  const duplicates: { _id: string; title: string; status: string; slug: string }[] = [];
  if (l.plotNumber) {
    const same = await ctx.db
      .query("listings")
      .withIndex("by_area_plot", (q) => q.eq("areaId", l.areaId).eq("plotNumber", l.plotNumber))
      .take(20);
    for (const d of same) {
      if (d._id === l._id) continue;
      if ((d.sectorBlock ?? "").toLowerCase() !== (l.sectorBlock ?? "").toLowerCase()) continue;
      duplicates.push({ _id: d._id, title: d.title, status: d.status, slug: d.slug });
    }
  }

  const peers = await ctx.db
    .query("listings")
    .withIndex("by_status_area_published", (q) => q.eq("status", "active").eq("areaId", l.areaId))
    .take(200);
  const comparable = peers.filter((p) => p._id !== l._id && p.landType === l.landType);
  const sample = comparable.length >= 3 ? comparable : peers.filter((p) => p._id !== l._id);
  const areaAvgPerSqft = sample.length ? sample.reduce((s, p) => s + p.pricePerSqft, 0) / sample.length : null;
  const priceRatio = areaAvgPerSqft ? l.pricePerSqft / areaAvgPerSqft : null;

  const flags: string[] = [];
  if (accountAgeDays < 7) flags.push("new_account");
  if (l.documents.length === 0) flags.push("no_documents");
  if (priceRatio !== null && priceRatio < 0.5) flags.push("price_far_below_average");
  if (duplicates.length) flags.push("possible_duplicate");
  if (l.imageIds.length < 3) flags.push("few_photos");
  if (seller?.verificationStatus !== "verified") flags.push("unverified_seller");

  return {
    flags,
    duplicates,
    accountAgeDays: Math.floor(accountAgeDays),
    areaAvgPerSqft: areaAvgPerSqft ? Math.round(areaAvgPerSqft) : null,
    priceRatio: priceRatio ? Math.round(priceRatio * 100) / 100 : null,
    checklist: {
      documents: l.documents.length > 0,
      photos: l.imageIds.length >= 3,
      noDuplicate: duplicates.length === 0,
      noFraudSignals: !flags.some((f) => ["new_account", "price_far_below_average", "possible_duplicate"].includes(f)),
    },
  };
}

// ---------- review queue ----------

export const queue = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("listings")
      .withIndex("by_status_published", (q) => q.eq("status", "pending_review"))
      .take(200);
    rows.sort((a, b) => a.updatedAt - b.updatedAt); // oldest first
    return Promise.all(
      rows.map(async (l) => {
        const seller = await ctx.db.get(l.sellerId);
        return {
          ...(await listingCard(ctx, l)),
          sellerName: seller?.name ?? "—",
          submittedAt: l.updatedAt,
          signals: await signalsFor(ctx, l),
        };
      }),
    );
  },
});

export const reviewDetail = query({
  args: { id: v.id("listings") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    const l = await ctx.db.get(id);
    if (!l) return null;
    const seller = await ctx.db.get(l.sellerId);
    const [images, documents, videos, reports] = await Promise.all([
      l.imageIds.map((id) => mediaUrl(id)),
      Promise.all(l.documents.map(async (d, index) => ({ index, type: d.type, verified: d.verified, fileName: d.fileName, url: await signedDocumentUrl(d.fileId) }))),
      ctx.db
        .query("videos")
        .withIndex("by_listing", (q) => q.eq("listingId", id))
        .collect(),
      ctx.db
        .query("reports")
        .withIndex("by_listing", (q) => q.eq("listingId", id))
        .collect(),
    ]);
    return {
      listing: { ...l, imageUrls: images.filter(Boolean) as string[] },
      documents,
      videos: videos.map((x) => ({
        _id: x._id,
        status: x.status,
        moderation: x.moderation,
        hlsUrl: x.hlsUrl,
        mp4Url: mediaUrl(x.mediaId, "video"),
        thumbnailUrl: mediaUrl(x.thumbMediaId),
      })),
      reports,
      seller: seller
        ? {
            _id: seller._id,
            name: seller.name,
            email: seller.email,
            phone: seller.phone,
            role: seller.role,
            accountType: seller.accountType,
            verificationStatus: seller.verificationStatus,
            createdAt: seller.createdAt ?? seller._creationTime,
          }
        : null,
      signals: await signalsFor(ctx, l),
    };
  },
});

export const approve = mutation({
  args: { id: v.id("listings"), verify: v.optional(v.boolean()) },
  handler: async (ctx, { id, verify }) => {
    await requireAdmin(ctx);
    const l = await ctx.db.get(id);
    if (!l) throw new ConvexError({ code: "NOT_FOUND", message: "Listing not found." });
    if (l.status !== "pending_review") throw new ConvexError({ code: "INVALID", message: "Listing is not pending review." });
    const now = Date.now();
    await setListingStatus(ctx, l, "active", {
      publishedAt: now,
      expiresAt: now + CONFIG.listingValidityDays * 86400_000,
      rejectionReason: undefined,
      ...(verify ? { isVerified: true } : {}),
    });
    await ctx.db.insert("notifications", {
      userId: l.sellerId,
      kind: "listing_approved",
      title: "Listing approved",
      body: `"${l.title}" is now live.`,
      href: `/land/${l.areaSlug}/${l.landType.replace("_", "-")}/${l.slug}`,
      read: false,
      createdAt: now,
    });
    return null;
  },
});

export const reject = mutation({
  args: { id: v.id("listings"), reason: v.string() },
  handler: async (ctx, { id, reason }) => {
    await requireAdmin(ctx);
    const l = await ctx.db.get(id);
    if (!l) throw new ConvexError({ code: "NOT_FOUND", message: "Listing not found." });
    // Live listings are taken down with unpublish; drafts/sold/expired are not in review.
    if (l.status !== "pending_review") throw new ConvexError({ code: "INVALID", message: "Listing is not pending review." });
    const text = reason.trim();
    if (text.length < 5) throw new ConvexError({ code: "INVALID", message: "Give the seller a reason (min 5 characters)." });
    await setListingStatus(ctx, l, "rejected", { rejectionReason: text.slice(0, 500) });
    await ctx.db.insert("notifications", {
      userId: l.sellerId,
      kind: "listing_rejected",
      title: "Listing needs changes",
      body: text.slice(0, 200),
      href: `/dashboard/listings/${l._id}/edit`,
      read: false,
      createdAt: Date.now(),
    });
    return null;
  },
});

/** Take down an active listing (e.g. after a report). */
export const unpublish = mutation({
  args: { id: v.id("listings"), reason: v.string() },
  handler: async (ctx, { id, reason }) => {
    await requireAdmin(ctx);
    const l = await ctx.db.get(id);
    if (!l) throw new ConvexError({ code: "NOT_FOUND", message: "Listing not found." });
    const text = reason.trim().slice(0, 500) || "Removed by moderator";
    await setListingStatus(ctx, l, "rejected", { rejectionReason: text });
    // Taking a listing down settles its open reports.
    const open = await ctx.db
      .query("reports")
      .withIndex("by_listing", (q) => q.eq("listingId", id))
      .take(200);
    for (const r of open) if (r.status === "open") await ctx.db.patch(r._id, { status: "reviewed" });
    await ctx.db.insert("notifications", {
      userId: l.sellerId,
      kind: "listing_rejected",
      title: "Listing taken down",
      body: text.slice(0, 200),
      href: `/dashboard/listings/${l._id}/edit`,
      read: false,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const setListingFlags = mutation({
  args: { id: v.id("listings"), isVerified: v.optional(v.boolean()), isFeatured: v.optional(v.boolean()) },
  handler: async (ctx, { id, isVerified, isFeatured }) => {
    await requireAdmin(ctx);
    const patch: Partial<Doc<"listings">> = {};
    if (isVerified !== undefined) patch.isVerified = isVerified;
    if (isFeatured !== undefined) {
      patch.isFeatured = isFeatured;
      patch.promotionRequested = false;
    }
    await ctx.db.patch(id, patch);
    return null;
  },
});

export const setDocumentVerified = mutation({
  args: { id: v.id("listings"), index: v.number(), verified: v.boolean() },
  handler: async (ctx, { id, index, verified }) => {
    await requireAdmin(ctx);
    const l = await ctx.db.get(id);
    if (!l || !l.documents[index]) throw new ConvexError({ code: "NOT_FOUND", message: "Document not found." });
    const documents = l.documents.map((d, i) => (i === index ? { ...d, verified } : d));
    await ctx.db.patch(id, { documents });
    return null;
  },
});

export const promotionRequests = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("listings")
      .withIndex("by_status_featured", (q) => q.eq("status", "active").eq("isFeatured", false))
      .filter((q) => q.eq(q.field("promotionRequested"), true))
      .take(100);
    return Promise.all(rows.map((l) => listingCard(ctx, l)));
  },
});

export const allListings = query({
  args: {
    status: v.optional(v.union(v.literal("draft"), v.literal("pending_review"), v.literal("active"), v.literal("sold"), v.literal("expired"), v.literal("rejected"))),
  },
  handler: async (ctx, { status }) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("listings")
      .withIndex("by_status_published", (q) => q.eq("status", status ?? "active"))
      .order("desc")
      .take(200);
    return Promise.all(rows.map((l) => listingCard(ctx, l)));
  },
});

// ---------- users ----------

export const users = query({
  args: { role: v.optional(vRole), verification: v.optional(vVerificationStatus) },
  handler: async (ctx, { role, verification }) => {
    await requireAdmin(ctx);
    const rows = verification
      ? await ctx.db
          .query("users")
          .withIndex("by_verification", (q) => q.eq("verificationStatus", verification))
          .take(300)
      : role
        ? await ctx.db
            .query("users")
            .withIndex("by_role", (q) => q.eq("role", role))
            .take(300)
        : await ctx.db.query("users").order("desc").take(300);
    return rows.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role ?? "buyer",
      accountType: u.accountType ?? "owner",
      verificationStatus: u.verificationStatus ?? "unverified",
      nidNumber: u.nidNumber,
      banned: u.banned ?? false,
      createdAt: u.createdAt ?? u._creationTime,
    }));
  },
});

export const updateUser = mutation({
  args: {
    id: v.id("users"),
    role: v.optional(vRole),
    verificationStatus: v.optional(vVerificationStatus),
    banned: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const admin = await requireAdmin(ctx);
    if (id === admin._id && (patch.banned || (patch.role && patch.role !== "admin")))
      throw new ConvexError({ code: "INVALID", message: "You cannot demote or ban yourself." });
    if (patch.role === "admin") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Admin role cannot be assigned to users. Admin access is strictly governed by the master passcode.",
      });
    }
    const target = await ctx.db.get(id);
    if (!target) throw new ConvexError({ code: "NOT_FOUND", message: "User not found." });
    const clean = Object.fromEntries(Object.entries(patch).filter(([, val]) => val !== undefined));
    await ctx.db.patch(id, clean);
    // Tell sellers about a verification decision.
    if (patch.verificationStatus && patch.verificationStatus !== target.verificationStatus && (patch.verificationStatus === "verified" || patch.verificationStatus === "rejected")) {
      const ok = patch.verificationStatus === "verified";
      await ctx.db.insert("notifications", {
        userId: id,
        kind: ok ? "listing_approved" : "listing_rejected",
        title: ok ? "You're a verified seller" : "Verification not approved",
        body: ok ? "A verified badge now shows on your listings." : "We couldn't verify your account. Check your details and request verification again.",
        href: "/account",
        read: false,
        createdAt: Date.now(),
      });
    }
    // Banning takes the user's active listings down.
    if (patch.banned) {
      const listings = await ctx.db
        .query("listings")
        .withIndex("by_seller", (q) => q.eq("sellerId", id))
        .collect();
      for (const l of listings)
        if (l.status === "active" || l.status === "pending_review")
          await setListingStatus(ctx, l, "rejected", { rejectionReason: "Account suspended" });
    }
    return null;
  },
});

// ---------- reports ----------

export const reports = query({
  args: { status: v.optional(v.union(v.literal("open"), v.literal("reviewed"), v.literal("dismissed"))) },
  handler: async (ctx, { status }) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("reports")
      .withIndex("by_status", (q) => q.eq("status", status ?? "open"))
      .order("desc")
      .take(200);
    return Promise.all(
      rows.map(async (r) => {
        const [l, reporter] = await Promise.all([ctx.db.get(r.listingId), ctx.db.get(r.reporterId)]);
        return { ...r, listing: l ? await listingCard(ctx, l) : null, reporterName: reporter?.name ?? reporter?.email ?? "User" };
      }),
    );
  },
});

export const resolveReport = mutation({
  args: { id: v.id("reports"), status: v.union(v.literal("reviewed"), v.literal("dismissed")) },
  handler: async (ctx, { id, status }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(id, { status });
    return null;
  },
});

// ---------- video moderation ----------

export const videoQueue = query({
  args: { moderation: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"))) },
  handler: async (ctx, { moderation }) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("videos")
      .withIndex("by_moderation", (q) => q.eq("moderation", moderation ?? "pending"))
      .order("desc")
      .take(100);
    return Promise.all(
      rows.map(async (x) => {
        const l = await ctx.db.get(x.listingId);
        return {
          _id: x._id,
          status: x.status,
          moderation: x.moderation,
          hlsUrl: x.hlsUrl,
          mp4Url: mediaUrl(x.mediaId, "video"),
          thumbnailUrl: mediaUrl(x.thumbMediaId),
          durationSec: x.durationSec,
          createdAt: x.createdAt,
          errorMessage: x.errorMessage,
          listingTitle: l?.title,
          listingSlug: l?.slug,
          listingAreaSlug: l?.areaSlug,
          listingLandType: l?.landType,
        };
      }),
    );
  },
});

export const moderateVideo = mutation({
  args: { id: v.id("videos"), decision: v.union(v.literal("approved"), v.literal("rejected")) },
  handler: async (ctx, { id, decision }) => {
    await requireAdmin(ctx);
    const vid = await ctx.db.get(id);
    if (!vid) throw new ConvexError({ code: "NOT_FOUND", message: "Video not found." });
    await ctx.db.patch(id, { moderation: decision });
    await syncListingHasVideo(ctx, vid.listingId);
    return null;
  },
});

// ---------- dashboard ----------

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const statuses = ["draft", "pending_review", "active", "sold", "expired", "rejected"] as const;
    const byStatus: Record<string, number> = {};
    for (const s of statuses)
      byStatus[s] = (
        await ctx.db
          .query("listings")
          .withIndex("by_status_published", (q) => q.eq("status", s))
          .take(5000)
      ).length;
    const users = await ctx.db.query("users").take(10000);
    const byRole: Record<string, number> = {};
    for (const u of users) byRole[u.role ?? "buyer"] = (byRole[u.role ?? "buyer"] ?? 0) + 1;
    const openReports = (
      await ctx.db
        .query("reports")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .take(1000)
    ).length;
    const pendingVideos = (
      await ctx.db
        .query("videos")
        .withIndex("by_moderation", (q) => q.eq("moderation", "pending"))
        .take(1000)
    ).length;
    const pendingSellers = (
      await ctx.db
        .query("users")
        .withIndex("by_verification", (q) => q.eq("verificationStatus", "pending"))
        .take(1000)
    ).length;
    // Last 14 days of platform views / inquiries.
    const days: string[] = [];
    for (let i = 13; i >= 0; i--) days.push(dhakaDay(Date.now() - i * 86400_000));
    const stats = await ctx.db
      .query("dailyStats")
      .withIndex("by_day", (q) => q.gte("day", days[0]))
      .take(20000);
    const series = days.map((day) => {
      const rows = stats.filter((s) => s.day === day);
      return {
        day,
        views: rows.reduce((s, r) => s + r.views, 0),
        inquiries: rows.reduce((s, r) => s + r.inquiries, 0),
      };
    });
    return { byStatus, byRole, totalUsers: users.length, openReports, pendingVideos, pendingSellers, series };
  },
});

/**
 * Elevates the signed-in user to admin if the correct ADMIN_PASSCODE is provided.
 * Handles both currently logged-in users and newly authenticated users.
 */
export const verifyAdminPasscode = mutation({
  args: { passcode: v.string() },
  handler: async (ctx, { passcode }) => {
    const user = await requireUser(ctx);
    const valid = (process.env.ADMIN_PASSCODE?.trim() || "808080");
    if (!valid || passcode.trim() !== valid) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Invalid admin passcode." });
    }
    await ctx.db.patch(user._id, { role: "admin" });
    return { success: true };
  },
});

/**
 * Helper to ensure the master admin user (`admin@landnestbd.com`, `role: "admin"`)
 * exists in `users` and has an active password authAccount initialized with `ADMIN_PASSCODE` ("808080").
 */
export async function ensureMasterAdminUser(
  ctx: MutationCtx,
  args?: { email?: string; passcode?: string },
) {
  const adminEmail = (args?.email ?? "admin@landnestbd.com").trim().toLowerCase();
  const passcode = (args?.passcode ?? (process.env.ADMIN_PASSCODE?.trim() || "808080")).trim();
  const now = Date.now();

  // 1. Find or create master admin user doc
  let user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", adminEmail))
    .unique();

  if (!user) {
    const userId = await ctx.db.insert("users", {
      name: "Master Admin",
      email: adminEmail,
      role: "admin",
      accountType: "company",
      verificationStatus: "verified",
      emailVerificationTime: now,
      createdAt: now,
    });
    user = (await ctx.db.get(userId))!;
  } else {
    await ctx.db.patch(user._id, {
      role: "admin",
      verificationStatus: "verified",
      emailVerificationTime: user.emailVerificationTime ?? now,
    });
  }

  // 2. Find or create/update password account in authAccounts
  const existingAccount = await ctx.db
    .query("authAccounts")
    .withIndex("providerAndAccountId", (q) =>
      q.eq("provider", "password").eq("providerAccountId", adminEmail),
    )
    .unique();

  const hashedPassword = await new Scrypt().hash(passcode);

  if (existingAccount) {
    await ctx.db.patch(existingAccount._id, {
      userId: user._id,
      secret: hashedPassword,
    });
  } else {
    await ctx.db.insert("authAccounts", {
      userId: user._id,
      provider: "password",
      providerAccountId: adminEmail,
      secret: hashedPassword,
    });
  }

  return { success: true, userId: user._id, email: adminEmail };
}

/**
 * CLI or internal setup: npx convex run admin:ensureMasterAdmin
 */
export const ensureMasterAdmin = internalMutation({
  args: {
    email: v.optional(v.string()),
    passcode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ensureMasterAdminUser(ctx, args);
  },
});


