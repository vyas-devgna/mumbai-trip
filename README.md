# Mumbai TripOS

A mobile-first, installable, static PWA for one Mumbai group trip, **14–17 September 2026**.

## Architecture

ChatGPT → GitHub repository → validated static trip data → React/Vite PWA → GitHub Actions → GitHub Pages.

The repository is the canonical shared state. There is no backend database and no fake in-app shared editing. Shared changes are made by updating the repository and redeploying.

## Public-data policy

This repository is public. It intentionally excludes PNRs, transaction IDs, booking numbers, ticket QR codes, identity documents, payment information, and other access-bearing secrets. Ticket and booking screenshots supplied in chat are represented only as safe metadata.

## Development

```bash
npm install
npm run dev
npm run build
```

Trip data lives in `src/data/trip.json` and is validated by `scripts/validate-trip.mjs` before every production build.

## GitHub Pages

The deployment workflow builds `main` and deploys `dist/` with the official GitHub Pages actions. The Vite base path is `/mumbai-trip/`.

In repository **Settings → Pages**, set **Source: GitHub Actions**. GitHub's `github.io` Pages domain is served over HTTPS; enable **Enforce HTTPS** when the control is available.
