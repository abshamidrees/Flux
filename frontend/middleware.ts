// middleware.ts
// Host-based routing so one Next.js app / one Vercel project can serve three
// public surfaces on three subdomains, with zero file moves and zero changes
// to existing internal links:
//
//   fluxonarc.xyz        -> landing page (app/page.tsx)              — unchanged
//   app.fluxonarc.xyz     -> the Flux app (app/app/*)                 — rewritten
//   docs.fluxonarc.xyz    -> docs (app/docs/*)                        — rewritten
//
// Two things happen, host-dependent:
//
// 1. On app./docs. subdomains, a BARE path ("/", "/swap") is rewritten to its
//    real internal route ("/app", "/app/swap"). An ALREADY-prefixed path
//    ("/app/swap") passes straight through unchanged. This means every
//    existing <Link href="/app/..."> and href="/docs/..."> in the codebase
//    keeps working exactly as-is on the new subdomains — nothing else in the
//    app had to change for this to ship.
//
// 2. On the apex domain, an old-style "/app/*" or "/docs/*" request 308s to
//    the equivalent path on its new subdomain — so existing bookmarks/links
//    to fluxonarc.xyz/app keep working, just landing on the canonical URL.
//
// Verify locally before touching DNS: spoof the Host header, e.g.
//   curl -I http://localhost:3017/swap -H "Host: app.fluxonarc.xyz"
// should come back as a rewrite (200, served from app/app/swap), not a 404.

import { NextResponse, type NextRequest } from "next/server";

const APEX_CANDIDATES = ["fluxonarc.xyz", "www.fluxonarc.xyz", "localhost:3017", "localhost:3000"];

function stripPort(host: string): string {
  return host.split(":")[0];
}

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const hostNoPort = stripPort(host);
  const url = req.nextUrl.clone();
  const pathname = url.pathname;

  const isApp = hostNoPort.startsWith("app.");
  const isDocs = hostNoPort.startsWith("docs.");
  const isApex = APEX_CANDIDATES.some((c) => hostNoPort === stripPort(c)) || (!isApp && !isDocs);

  if (isApp && !pathname.startsWith("/app")) {
    url.pathname = pathname === "/" ? "/app" : `/app${pathname}`;
    return NextResponse.rewrite(url);
  }

  if (isDocs && !pathname.startsWith("/docs")) {
    url.pathname = pathname === "/" ? "/docs" : `/docs${pathname}`;
    return NextResponse.rewrite(url);
  }

  if (isApex) {
    // Canonical redirect: old apex-hosted paths -> their new subdomain.
    // Skip in local dev (there's no real app./docs. DNS to send localhost to).
    const isLocal = hostNoPort === "localhost" || hostNoPort === "127.0.0.1";
    if (!isLocal) {
      if (pathname === "/app" || pathname.startsWith("/app/")) {
        url.host = `app.${hostNoPort}`;
        url.pathname = pathname.replace(/^\/app/, "") || "/";
        return NextResponse.redirect(url, 308);
      }
      if (pathname === "/docs" || pathname.startsWith("/docs/")) {
        url.host = `docs.${hostNoPort}`;
        url.pathname = pathname.replace(/^\/docs/, "") || "/";
        return NextResponse.redirect(url, 308);
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  // Runs on every request except static assets, image optimisation, and the
  // public asset folders (brand/tokens) — those must be byte-identical
  // regardless of which host requested them, never path-rewritten.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|tokens/).*)"],
};
