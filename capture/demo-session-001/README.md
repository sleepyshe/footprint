# Demo session capture

This directory receives one capture session from the local development server.

## Run a capture

1. Start the app with `npm run dev` and complete the normal product flow.
2. At any time, use the browser console command `window.__demoCapture.finalize()`.
   It records the `final` checkpoint and writes `demo-session.json` and
   `raw-session.jsonl` here. It also downloads copies as a fallback.
3. If the final checkpoint was already recorded, `window.__demoCapture.export()`
   writes/downloads the current session without changing product state.

Capture is best-effort and entirely optional: recorder failures are swallowed and
cannot change extraction, POI resolution, map rendering, or itinerary planning.

## Files

- `demo-session.json`: clean, stable static-Demo input. It contains the ordered
  checkpoints, each with imported source metadata/text, display-ready places,
  map marker/route inputs, itinerary, and UI state.
- `raw-session.jsonl`: chronological capture events for diagnostics. It is not
  consumed by the static Demo.
- `hotel-delta.json`: a separate, optional increment captured after hydrating
  the Golden Session's `itinerary_ready` checkpoint and setting a hotel. It
  preserves the original session and contains only `beforeHotel`, `hotelPlace`,
  `afterHotel`, changed day/route records, changed map markers, and hotel UI
  state. Export it with `window.__hotelDeltaCapture.export()` after hydration
  and a hotel selection; do not use `__demoCapture.finalize()` for this flow.
- `screenshots/`: intentionally empty. Automatic screenshots are not installed;
  take them manually if needed.

## Schema overview

`demo-session.json` has `{ schemaVersion, capturedAt, checkpoints }`. Every
checkpoint is `{ id, at, state }`. `state` contains:

- `source`: city, imported text, source label, image filenames/MIME/size only.
- `places`: the current final display-ready records, including AI extraction,
  POI resolution, deduplicated data, recommendation information and evidence.
- `map`: the exact markers and route segments supplied to the map renderer;
  viewport is `null` when the SDK does not expose it safely.
- `itinerary`: grouped planning result, days, ordered POIs, segment distance,
  duration, transport mode and route geometry.
- `ui`: tab, selected day/place, expanded sections, loading/button state and
  displayed status text.

No API keys, authorization headers, cookies, original image data, SDK callback
payloads, diagnostics, or environment values are exported.
