# CapeCast BACKLOG — UX audit findings, 2026-07-07

_Source: fresh-user walkthrough (cleared storage, mobile viewport, 10pm) cross-referenced against the v2 strategy (brain `projects/capecast-research/capecast-v2-strategy.md`) and ROADMAP.md. Items B1–B12 are the "trust pass" one-shot (see §Goal prompt reference at bottom); B13+ are tracked-but-blocked._

## Trust wounds (live defects — a local notices these in minute one)

- [x] **B1 · Demote the ave13 default pin.** Fresh users currently get "13th Ave · Southern Shores" pinned first (scoring 1.1 above the router's 3.7 pick) and the 8-Day tab calls it "(your spot)" to strangers. Fix: `getPins()` defaults to `[]`; keep the zone entry; "(your spot)" only for zones the user pinned. The product ships no opinion about *your* spot. (ROADMAP M7d)
- [x] **B2 · Hero verdict word leads, number demoted.** The giant gold 0–10 chip is the research's single most-distrusted artifact. Verdict word ("JUNKY") becomes the hero element; number smaller/secondary with tooltip: "score = where conditions line up, not bar truth." Applies to zone-card chips too (B11). Don't remove scores — earn them via the scorecard (B13). (v2 anti-feature #3, M7c)
- [x] **B3 · Footer feedback promise → real channel.** "report back and make it smarter" has linked to nothing since v0.1. Interim: GitHub issue link or mailto until Josh's form (H3) exists; swap URL when it does.
- [x] **B4 · Night-mode hero (NOT previously on roadmap).** At 10pm the hero says "SURF NOW" — but the night-before ritual is "is dawn patrol on tomorrow?" After ~6pm ET, hero flips to "TOMORROW AM →" best 5–10am window zone (data already computed); revert to SURF NOW in the morning.

## Honesty affordances (v2 says "low confidence, said out loud" — app currently has zero uncertainty language)

- [x] **B5 · Fade days 6–8** in the 8-Day tab + one-line caveat ("days 6–8: trend only"). (v2 anti-feature #7)
- [x] **B6 · Demote golden-hours card** below the sky + tide cards (photographer feature; frozen, no further sessions). (ROADMAP "flag, don't defend")
- [x] **B11 · Uncertainty tooltips on every score surface** (hero + zone chips): same copy as B2.
- [x] **B12 · Spot-naming policy comment block atop zones.js** — zones + landmarks the local reports themselves name are in-bounds; anything below that never enters the file or the copy. (ROADMAP trust plan §5)

## Missing v2 features (unblocked)

- [x] **B9 · Local report hub card** (v2 #7 — complement, never compete): Natural Art daily (outerbanksthisweek.com), WRV report line as `tel:` link, Shoreline OBX, OBX Wave Report YouTube. One card, links out. (M7a)
- [x] **B10 · Everyday swell-arrival banner** (v2 #2b): when an upstream buoy (41001/41002) shows period ≥10s AND wave height meaningfully above local stations, banner with ETA range (distance ÷ 1.5×period kt), humble wording. Currently this math only runs inside hurricane mode. (M5)

## Engineering hygiene

- [x] **B7 · Loading state** — page is blank until 6 API fetches resolve (dawn LTE). Minimal "reading the ocean…" placeholder.
- [x] **B8 · storms.json fetch belongs inside the main `Promise.all`** — currently a serial roundtrip after it.

_Completion notes (7/7/26 late): B7 was a false audit finding — index.html already had a "Reading the buoys…" placeholder; no change made. B9 URLs corrected during link verification: Natural Art daily = surfintheeye.com (Carol Busbey), OBX This Week = /surf-reports, Shoreline deep-link = /blog/obx-surf-report/; "OBX Wave Report" YouTube channel could not be verified to exist → replaced with SurfChex cams (part of the documented morning ritual). B10 exposed a divider-copy inconsistency: "~18–24h later" was short-period lore, but 14s swell arrives ~10h from 41002 — divider now reads "~8–24h later (longer period = faster)"._

## Tracked, blocked, or parked (do NOT include in the one-shot)

- [ ] **B13 · Scorecard v0 (M4)** — BLOCKED until ≥2 days of `data/log/` (earliest 2026-07-09). The missing spine; hero/chips link to it when live. See ROADMAP Session 3 spec.
- [ ] **B14 · Verify first unaided calibrate cron run** — check Actions the evening of 7/8 for `data/log/2026-07-08.json`.
- [ ] **H3 (Josh)** · Feedback form (~20 min) → swap into B3's link.
- [ ] **H1 (Josh)** · Buy capecast.surf. **H6 (Josh)** · first-party IG/FB page before September.
- [ ] M8 digest+RSS, then post-season: M9 model-disagreement, M10 sandbar layer, M11 push, M12 climatology (see ROADMAP).

---
_Goal prompt reference: the one-shot prompt covering B1–B12 lives in the shared brain at `projects/capecast-research/trust-pass-prompt.md`._
