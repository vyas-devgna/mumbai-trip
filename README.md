# Mumbai TripOS

A static, mobile-first trip operating dashboard for the 14–17 September 2026 Mumbai group trip.

## Architecture

ChatGPT → GitHub `main` → canonical `src/data/trip.json` → React/Vite → Vercel → installed PWA.

Vercel is the primary deployment target. GitHub Pages remains available temporarily as a migration fallback until the Vercel production deployment and installed-PWA cutover are verified.

There is no runtime backend. Shared state is changed in GitHub. Local notes and draft expenses intentionally use browser storage and are labelled as device-local.

## Deployment

The Vite build is host-path agnostic so the same source can run at the Vercel root or under the legacy GitHub Pages `/mumbai-trip/` path. `vercel.json` configures immutable caching for hashed build assets, no-store delivery for the service worker and deployment version marker, compatibility rewrites for legacy URLs, and baseline response security headers.

## Offline + updates

The service worker pre-caches the app entry point, manifest, icons and trip vault resources. Runtime app assets and recently viewed map tiles are cached opportunistically. Each production build is stamped from its deployment or Git commit identity in `version.json` and in the service worker cache name. Installed clients check for a newer build on launch/resume, reconnect and the regular update interval.

## Maps

MapLibre is used with two raster basemaps: OpenStreetMap street tiles and Esri World Imagery satellite tiles. The route overlay is a trip-sequence visualization, not turn-by-turn navigation. Navigation actions deep-link to Google Maps where available.

## Public-data warning

This repository and deployed trip site are public. The group explicitly requested the outbound ticket PDF, return ticket PDF and Sea Lounge booking confirmation to be available in the offline vault. Those files contain booking information. Do not add identity documents, payment credentials or unrelated sensitive files.
