# Mumbai TripOS

A static, mobile-first trip operating dashboard for the 14–17 September 2026 Mumbai group trip.

## Architecture

ChatGPT → GitHub `main` → canonical `src/data/trip.json` → React/Vite → GitHub Actions → GitHub Pages → installed PWA.

There is no runtime backend. Shared state is changed in GitHub. Local notes and draft expenses intentionally use browser storage and are labelled as device-local.

## Offline + updates

The service worker pre-caches the app entry point, manifest, icons and trip vault resources. Runtime app assets and recently viewed map tiles are cached opportunistically. The deployed build is stamped with the commit SHA in `version.json`; installed clients check it every 60 seconds, on resume and when connectivity returns, then reload when a newer deployment is detected.

## Maps

MapLibre is used with two raster basemaps: OpenStreetMap street tiles and Esri World Imagery satellite tiles. The route overlay is a trip-sequence visualization, not turn-by-turn navigation. Navigation actions deep-link to Google Maps where available.

## Public-data warning

This repository and GitHub Pages site are public. The group explicitly requested the outbound ticket PDF, return ticket PDF and Sea Lounge booking confirmation to be available in the offline vault. Those files contain booking information. Do not add identity documents, payment credentials or unrelated sensitive files.
