import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "ft_session";

/**
 * Sends visitors without a session cookie to the login screen. It only checks that the cookie exists (no database here);
 * pages, actions and the photo route validate it with requireUser().
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const login = new URL("/login", request.url);
  const target = request.nextUrl.pathname + request.nextUrl.search;
  if (target !== "/") login.searchParams.set("next", target);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!login|_next/|manifest.webmanifest|icon.svg|favicon.ico).*)"],
};
