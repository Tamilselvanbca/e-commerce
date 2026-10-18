import { NextResponse, type NextRequest } from "next/server";

// Optimistic auth check: pages that need a logged-in user redirect to /login
// when there is no session cookie at all. The backend still authorises every
// request (and checks the admin role); this only avoids rendering a page that
// would immediately fail.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("sid")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/account/:path*", "/checkout", "/admin/:path*", "/admin"],
};
