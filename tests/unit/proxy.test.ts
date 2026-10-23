import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

import middleware, { isProtected } from "../../proxy";
import { NextRequest } from "next/server";

describe("proxy middleware and route protection", () => {
  it("does not include /admin in isProtected matcher", () => {
    const adminReq = new NextRequest("http://localhost:3000/admin");
    const adminUsersReq = new NextRequest("http://localhost:3000/admin/users");
    const adminReviewReq = new NextRequest("http://localhost:3000/admin/review");

    expect(isProtected(adminReq)).toBe(false);
    expect(isProtected(adminUsersReq)).toBe(false);
    expect(isProtected(adminReviewReq)).toBe(false);
  });

  it("marks user dashboard/account/saved/inquiries as protected", () => {
    expect(isProtected(new NextRequest("http://localhost:3000/dashboard"))).toBe(true);
    expect(isProtected(new NextRequest("http://localhost:3000/account"))).toBe(true);
    expect(isProtected(new NextRequest("http://localhost:3000/saved"))).toBe(true);
    expect(isProtected(new NextRequest("http://localhost:3000/inquiries"))).toBe(true);
  });

  it("allows unauthenticated visitor on /admin without redirecting to /signin", async () => {
    const req = new NextRequest("http://localhost:3000/admin");
    const event = {} as any;
    const res = await middleware(req, event);
    const location = res?.headers?.get("location");
    expect(location).toBeFalsy();
  });

  it("allows unauthenticated visitor on /admin/users without redirecting to /signin", async () => {
    const req = new NextRequest("http://localhost:3000/admin/users");
    const event = {} as any;
    const res = await middleware(req, event);
    const location = res?.headers?.get("location");
    expect(location).toBeFalsy();
  });

  it("redirects unauthenticated visitor on /dashboard to /signin?next=%2Fdashboard", async () => {
    const req = new NextRequest("http://localhost:3000/dashboard");
    const event = {} as any;
    const res = await middleware(req, event);
    const location = res?.headers?.get("location");
    expect(location).toContain("/signin?next=%2Fdashboard");
  });
});
