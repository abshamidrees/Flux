// middleware.ts
// Host-based routing so one Next.js app / one Vercel project can serve three
// public surfaces on three subdomains, with zero file moves:
//
//   fluxonarc.xyz        -> landing page (app/page.tsx)              — unchanged
//   app.fluxonarc.xyz     -> the Flux app (app/app/*)                 — rewritten
//   docs.fluxonarc.xyz    -> docs (app/docs/*)                        — rewritten
//
// Three things happen, host-dependent:
//
// 1. On app./docs. subdomains, a BARE path ("/", "/swap") is rewritten to its
//    real internal route ("/app", "/app/swap") — a rewrite, so the address
//    bar keeps showing the clean bare path. Internal links within a section
//    (app/app/* and app/docs/*) must therefore use bare hrefs ("/swap", not
//    "/app/swap") — an already-prefixed path passes straight through
//    unchanged, which is what left production showing app.fluxonarc.xyz/app/swap
//    instead of app.fluxonarc.xyz/swap before this was fixed.
//
// 2. On the apex domain, an old-style "/app/*" or "/docs/*" request 308s to
//    the equivalent path on its new subdomain — so links from the landing
//    page (which legitimately live on the apex and must cross subdomains)
//    can keep using "/app/..." / "/docs/..." hrefs and land on the canonical
//    subdomain URL.
//
// 3. Cross-subdomain jumps FROM app./docs. (e.g. the docs site's "Launch app"
//    button) get the same redirect-with-host-swap treatment: a "/app/*" path
//    requested on docs. redirects to app., and a "/docs/*" path requested on
//    app. redirects to docs. — without this, that request would instead fall
//    into rule 1 above and get the wrong section's prefix prepended (e.g.
//    docs. rewriting "/app" to "/docs/app", a route that doesn't exist).
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

  if (isApp) {
    if (pathname === "/docs" || pathname.startsWith("/docs/")) {
      url.host = hostNoPort.replace(/^app\./, "docs.");
      url.pathname = pathname.replace(/^\/docs/, "") || "/";
      return NextResponse.redirect(url, 308);
    }
    if (!pathname.startsWith("/app")) {
      url.pathname = pathname === "/" ? "/app" : `/app${pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  if (isDocs) {
    if (pathname === "/app" || pathname.startsWith("/app/")) {
      url.host = hostNoPort.replace(/^docs\./, "app.");
      url.pathname = pathname.replace(/^\/app/, "") || "/";
      return NextResponse.redirect(url, 308);
    }
    if (!pathname.startsWith("/docs")) {
      url.pathname = pathname === "/" ? "/docs" : `/docs${pathname}`;
      return NextResponse.rewrite(url);
    }
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
