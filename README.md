# REI-App-Data

Public data feed for the official **Racial Equity Institute** mobile/Mac app.

## Files
- `manifest.json` — versioned index with `updatedAt` stamps; the app checks this first.
- `events.json` — normalized upcoming public events (Phase 1/2, Groundwater, conference) with outbound registration URLs (Luma, Stripe, Eventbrite, Constant Contact, Third Space Action Lab).
- `offerings.json` — REI's 13-offering training catalog with full descriptions.
- `org.json` — mission, history, founders, contacts, socials, donation/newsletter links.

## Automatic sync with the website
A GitHub Action (`.github/workflows/scrape.yml`) runs daily: it fetches
`https://www.racialequityinstitute.org/trainings?format=json` (Squarespace native JSON),
runs `scripts/normalize.mjs` to parse the event cards into the `events.json` schema,
and commits only when content changed. On any parse failure the existing data is kept
and an issue is opened — the app never receives broken data. The app additionally
validates every download before accepting it, so the bundled snapshot always remains
the fallback. This keeps the app synced with the website automatically with no manual
release needed for event updates.

Content © The Racial Equity Institute. App data feed maintained with org authorization.
