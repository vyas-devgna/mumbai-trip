# Mumbai TripOS

A static, mobile-first trip operating dashboard for the 14–17 September 2026 Mumbai group trip.

## Architecture

ChatGPT → GitHub `main` → canonical `src/data/trip.json` → React/Vite → GitHub Actions → GitHub Pages → installed PWA.

GitHub Pages is the primary and only supported deployment target for this project.

There is no runtime backend. Shared state is changed in GitHub. Local notes and draft expenses intentionally use browser storage and are labelled as device-local.

## Deployment

The Vite build is configured for the repository Pages path `/mumbai-trip/`. GitHub Actions validates the canonical trip data, builds the Vite application and deploys the generated static artifact to GitHub Pages.

## Offline + updates

The service worker pre-caches the app entry point, manifest, icons and trip vault resources. Runtime app assets and recently viewed map tiles are cached opportunistically. Each production build is stamped from the GitHub commit SHA in `version.json` and in the service worker cache name. Installed clients check for a newer build on launch/resume, reconnect and the regular update interval.

## Maps

MapLibre is used with two raster basemaps: OpenStreetMap street tiles and Esri World Imagery satellite tiles. The route overlay is a trip-sequence visualization, not turn-by-turn navigation. Navigation actions deep-link to Google Maps where available.

## Public-data warning

This repository and GitHub Pages site are public. The group explicitly requested the outbound ticket PDF, return ticket PDF and Sea Lounge booking confirmation to be available in the offline vault. Those files contain booking information. Do not add identity documents, payment credentials or unrelated sensitive files.
