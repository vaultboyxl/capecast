# CapeCast 🌊

**Where to paddle out on the Outer Banks, right now.** → [vaultboyxl.github.io/capecast](https://vaultboyxl.github.io/capecast/)

The OBX coast bends ~110° around Cape Hatteras, so on almost any day, some stretch between Corolla and Ocracoke has offshore wind. CapeCast ranks 12 zones by swell exposure × wind quality and tells you where to drive — one screen, no accounts, free.

## How it works

- **[zones.js](zones.js)** — 12 zones, each with the true azimuth its beach faces. The cape's geometry as data.
- **[app.js](app.js)** — scoring: swell energy (height^1.4 × period), gated by whether the zone can see the swell direction, × a wind factor (offshore boosts, onshore kills). Windswell scored separately from groundswell.
- 100% client-side PWA. No server, no keys, no tracking. Service worker keeps the last forecast available offline.

## Data

- Swell & wind: [Open-Meteo](https://open-meteo.com/) (NOAA WW3 / GFS), CC-BY 4.0
- Tides: [NOAA CO-OPS](https://tidesandcurrents.noaa.gov/) — Duck FRF pier 8651370, the only true oceanside station on the Banks

## Honest limits

Scores don't know today's sandbars — every OBX break is a beach break and the bars move after every storm. Treat ratings as "where conditions line up," then use your eyes. Surf at your own risk.

## Run locally

Any static server: `npx serve .` — that's it.
