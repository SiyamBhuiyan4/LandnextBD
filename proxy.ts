import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

// Optimistic redirects only. Real authorization happens inside every Convex function.
const isProtected = createRouteMatcher(["/dashboard(.*)", "/admin(.*)", "/account(.*)", "/saved(.*)", "/inquiries(.*)"]);
const isSignIn = createRouteMatcher(["/signin"]);

export default convexAuthNextjsMiddleware(
  async (request, { convexAuth }) => {
    const authed = await convexAuth.isAuthenticated();
    if (isProtected(request) && !authed) {
      const next = request.nextUrl.pathname + request.nextUrl.search;
      return nextjsMiddlewareRedirect(request, `/signin?next=${encodeURIComponent(next)}`);
    }
    if (isSignIn(request) && authed) return nextjsMiddlewareRedirect(request, "/");
  },
  { cookieConfig: { maxAge: 60 * 60 * 24 * 30 } },
);

export const config = {
  matcher: ["/((?!.*\\..*|_next|media).*)", "/", "/(api|trpc)(.*)"],
};
