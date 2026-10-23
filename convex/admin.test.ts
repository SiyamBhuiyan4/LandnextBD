/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("Admin Authentication and Passcode", () => {
  it("elevates currently logged-in user to admin with valid passcode", async () => {
    const t = convexTest(schema, modules);

    // Create a regular user
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "user@example.com",
        name: "Regular User",
        role: "buyer",
        accountType: "owner",
        verificationStatus: "unverified",
        createdAt: Date.now(),
      });
    });

    const asUser = t.withIdentity({ subject: `${userId}|session` });

    // Try with invalid passcode
    await expect(
      asUser.mutation(api.admin.verifyAdminPasscode, { passcode: "wrongpass" }),
    ).rejects.toThrowError("Invalid admin passcode.");

    // Check user role is still buyer
    const beforeRole = await t.run(async (ctx) => {
      const u = await ctx.db.get(userId);
      return u?.role;
    });
    expect(beforeRole).toBe("buyer");

    // Try with valid default passcode ("808080")
    const res = await asUser.mutation(api.admin.verifyAdminPasscode, { passcode: "808080" });
    expect(res).toEqual({ success: true });

    // Check user role is elevated to admin
    const afterRole = await t.run(async (ctx) => {
      const u = await ctx.db.get(userId);
      return u?.role;
    });
    expect(afterRole).toBe("admin");
  });

  it("ensures master admin user is initialized properly with authAccount", async () => {
    const t = convexTest(schema, modules);

    // Run ensureMasterAdmin
    const res = await t.mutation(internal.admin.ensureMasterAdmin, {
      email: "admin@landnestbd.com",
      passcode: "808080",
    });

    expect(res.success).toBe(true);
    expect(res.email).toBe("admin@landnestbd.com");

    // Verify user doc and authAccount doc in DB
    await t.run(async (ctx) => {
      const user = await ctx.db.get(res.userId);
      expect(user).not.toBeNull();
      expect(user?.email).toBe("admin@landnestbd.com");
      expect(user?.role).toBe("admin");
      expect(user?.verificationStatus).toBe("verified");

      const authAcc = await ctx.db
        .query("authAccounts")
        .withIndex("providerAndAccountId", (q) =>
          q.eq("provider", "password").eq("providerAccountId", "admin@landnestbd.com"),
        )
        .unique();
      expect(authAcc).not.toBeNull();
      expect(authAcc?.userId).toBe(user?._id);
      expect(authAcc?.secret).toBeDefined();
    });

    // Calling ensureMasterAdmin again updates or preserves without error
    const res2 = await t.mutation(internal.admin.ensureMasterAdmin, {});
    expect(res2.success).toBe(true);
    expect(res2.userId).toBe(res.userId);
  });
});
