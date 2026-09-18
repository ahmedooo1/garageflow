import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "gf_session";

/**
 * Vérification optimiste : redirige vers /login si aucun cookie de session.
 * La vérification réelle (session en base, rôle) est faite dans les layouts,
 * pages et actions serveur.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/app") && !hasCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/app" ? `?next=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(self), geolocation=(), microphone=()");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js).*)"],
};
