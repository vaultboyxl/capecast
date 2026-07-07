# CapeCast ROADMAP.md — v1 → v2, sequenced for the season

_2026-07-07. Inputs: v2 strategy (capecast-v2-strategy.md), venture pre-plan (obx-surf.md), WO#3 research, and the v1 code at HEAD (`0ae5c0f`). Hard deadline: **hurricane season — anything the first big system needs must be live ~Aug 15.** Commit this file to the repo root as ROADMAP.md._

---

## 1. Gap analysis — v2 features vs v1 code

### Already built (don't pad the roadmap)
- **Zone wind-verdict engine** (v2 #1, trust-critical) — substantially built. `zones.js` encodes 13 zones with true facing azimuths; `app.js scoreHour()` does swell energy × direction-exposure × wind factor with offshore/cross/onshore words, closeout penalty, lightning gate. The reason string shows numbers + direction ("3.1ft @ 9s ENE swell · wind 12kt SW (offshore)") — exactly the "look at the numbers and direction" behavior the research demands. *Caveat below under conflicts: the numeric 0–10 chip.*
- **Table stakes** (v2 #9) — tides (CO-OPS Duck 8651370 with the south-of-cape note), water temp (buoy WTMP), sunrise/sunset, air/feels-like, precip. Done.
- **In-app best-window finder** — `bestWindow()`/`bestWindowZone()` already compute the 48h window per zone. This is the display half of v2 #3 (alerts); the push half is absent.
- **Anti-feature compliance** — v1 has no cams, no crowd features, no session logs, no social, no personalization ML, no ads, no 16-day tail (8 days with "trust days 6–8 loosely"), no accounts. Clean.
- **Trust hygiene already in code** — buoy card hides itself when stale >4h ("a wrong 'live' number is worse than none"), README "Honest limits," footer disclaimer. Keep and extend; don't rebuild.

### Partial (exists but misses the point)
- **Live buoy layer** (v2 #2, trust-critical). v1 shows 41025 Diamond Shoals + 44100 Duck — the *local* stations. Missing: the **upstream** stations 41001/41002 (the only ones with quote-verified local habit: *"the South Hatteras buoy (41002) is a great one to watch and verify how much swell is heading down"*), forecast-vs-buoy side-by-side, and swell-arrival ETA. v1's buoy card is a readout; v2 needs a **verification instrument**.
- **Calibration logging** (v2 #4, trust-critical → moat). The `--snapshot` path in `fetch_buoys.mjs` + the 15:00 UTC cron exists — but (a) **no `data/` directory exists at HEAD: the snapshot has never successfully committed** (the `minute < 20` guard likely never matches GitHub's delayed cron slots), and (b) it logs *same-day* inputs (`forecast_days=1`), which cannot verify a forecast — calibration requires storing what the model said **24h+ ahead** and comparing against what the buoy later observed. And nothing is scored or published. This is the roadmap's #1 item because the dataset only grows in real time: every lost day is a receipt September won't have.
- **Morning digest** (v2 #8, retention). The hero + best-window card *is* a digest if you open the app; there is no push/feed channel. Degraded static version exists in spirit; needs a `digest.json` + RSS to become a habit hook.

### Absent
- **Published accuracy scorecard** (v2 #4) — nothing user-visible. The single highest-leverage trust feature: no incumbent publishes its own error rate.
- **Swell-arrival tracking** (v2 #2b) — no ETA logic (period → group speed ≈ 1.5×T kt → travel time from upstream buoy).
- **Hurricane mode** (v2 #6) — no NHC integration at all. Season starts in weeks.
- **Window alerts as push** (v2 #3) — the paid job long-term; first backend-forcing feature (see §3).
- **Sandbar change layer** (v2 #5, the moat) — absent in the app. Note: the Sentinel-2 pilot already exists in the lab (sandbar project: bars visible at 3 spots from S2 imagery) — the app work is productizing, not research.
- **Local report hub** (v2 #7) — no links to Natural Art / WRV line / Shoreline / OBX Wave Report. One evening, pure trust-positive.
- **Climatology page** (v2 §2 note) — absent; explicitly post-season.

### Conflicts (v1 design fights the v2 doc)
- **The 0–10 numeric chip is the hero.** v2 anti-feature #3: opaque numeric ratings are the single most-distrusted artifact ("ignore the ratings"; "two spots 100 yards apart… makes no sense"). v1 half-complies — every score ships with its reason string and categorical word — but the number leads. **Resolution: don't remove the score; earn it.** v2's own rule: "if v2 ever scores anything, the score must ship with its own accuracy history attached." The scorecard (M4) is the fix; plus an uncertainty pass (M7) so every chip carries its caveat.
- **Zone count and `ave13`.** README says 12 zones; `zones.js` has 13, and one of them — "13th Ave · Southern Shores" — is a single beach access elevated to zone status *and pinned by default for every first-time visitor* (`getPins()` defaults `["ave13"]`). That's the founder's spot as product default. It's a public access, not a secret bar, so it doesn't violate the sacred rule — but it's below zone granularity and the v2 doc's zone logic says zones, not accesses. **Change: fold `ave13` into a Duck/Southern Shores zone (or keep the entry but demote), and default pins to empty** — let users pin their own. Personal spot stays personal via localStorage.
- **The footer asks for reports and gives no channel.** "report back and make it smarter" links nowhere. A trust promise made and not kept. Fixed by the feedback form (human gate H3 + M7).

### v1 features the v2 doc doesn't support — flag, don't defend
- **Golden-hour / sunset-wow score** (`wowScore()`, ~80 lines + UI). Zero support anywhere in the research; it's a photographer's feature on a surf tool. It costs nothing to keep and harms no trust rule, so: **demote — freeze it, spend no further sessions on it, move it below surf content if it ever crowds the fold.** Candidate for spin-off later. Not on the roadmap.
- **8th forecast day** — v2 says ~7 days honest horizon. Cheap fix inside M7: fade or drop day 8. Minor.

---

## 2. Sequenced roadmap

Order = v2's own priority logic (trust-critical → retention → moat), bent once for the Aug 15 storm deadline: hurricane mode (#6, "seasonal") jumps the moat and part of retention because **one well-called storm swell is the year's entire marketing** (v2 §5). Each milestone is one evening (E, ~2–4h) or one weekend (W).

| # | Size | Ships | Definition of done (user-visible) | Data | Cost Δ | Main risk |
|---|---|---|---|---|---|---|
| **M1** | E | **Fix + upgrade the calibration cron.** Replace the `minute<20` snapshot hack with a dedicated nightly job (own cron entry, guard = "does today's file exist"). Log **lead-time** forecasts: tonight, store the model's marine forecast for **tomorrow** at each buoy's coordinates (+ zone wind), alongside today's buoy obs. | Two consecutive daily commits appear under `data/log/`; each file contains `forecast_for` (D+1) and `observed` (D0) blocks. (User-visible later via M4 — but this must land first; the dataset can't be backfilled.) | Open-Meteo marine/wind at buoy lat/lons; NDBC (existing) | $0 | GitHub cron drift — mitigate with idempotent guard + `workflow_dispatch` fallback |
| **M2** | E | **Upstream buoys 41001 + 41002** in `fetch_buoys.mjs` + card, tagged "upstream — swell arrives ~18–24h later." | Buoy card shows 4 stations; upstream rows visually distinct. | NDBC realtime2 (existing pattern) | $0 | Station outages (41001 has history of gaps) — reuse existing stale-hide |
| **M3** | E | **Forecast-vs-buoy receipt strip.** Cron writes model's *current-hour* value at each buoy point into `buoys.json`; card renders "model 3.1ft / buoy 3.3ft (Δ0.2)". | Every buoy row shows live model-vs-observed delta. | M1 plumbing | $0 | Point-vs-grid mismatch reads as "model wrong" — present as delta with humble caption, never hide misses |
| **M4** | W | **Public accuracy scorecard.** Nightly cron scores yesterday's stored 24h-lead forecast vs observed buoy (wave ht MAE, period, wind dir hit-rate), rolling 14-day, per station → `scorecard.json`; app gets a "How honest is CapeCast?" section, misses included, with the explicit caveat: *buoys verify our inputs, not the sandbar — your eyes verify the surf.* | Scorecard section live with ≥7 real days of numbers; a miss is visible the day after it happens. | `data/log/` from M1 | $0 | Small-n noise early — show n and say "two weeks of receipts, growing" |
| **M5** | E | **Swell-arrival ETA.** When 41001/41002 show long-period energy above local stations, compute travel window (group speed ≈ 1.5×period kt over station distance — the forecaster's own "12–14s ≈ 18–20h" math) → banner: "Swell in the water at Diamond Shoals' upstream — expect it here ~Fri afternoon." | With a real upstream pulse, banner appears with an ETA range, not a point estimate. | M2 data + static station distances | $0 | False positives on windswell — threshold on period ≥10s and height delta; humble range wording |
| **M6** | W | **Hurricane mode v0.** New cron target: NHC `CurrentStorms.json` + forecast-track GeoJSON → `storms.json`. App storm card: name/cat/position, official track (link to NHC — *they* are the authority), naive per-zone read from track bearing (east-of-Banks → E/NE-facing zones; southern track → Frisco/Hatteras/Ocracoke, the [q26] recipe), arrival ETA via M5. Test against an archived 2025 storm fixture **now** — don't debug during Erin II. | With any active Atlantic system, the card renders zone guidance + ETA; with none, a quiet "tropics: all clear" line. | NHC public JSON via cron (avoids CORS) | $0 | Overclaiming vs NHC — copy states "track is NHC's; we only translate it to the Banks" |
| **M7** | E | **Trust pass + local report hub.** (a) Links card: Natural Art daily (outerbanksthisweek), WRV line as `tel:` link, Shoreline OBX, OBX Wave Report YT. (b) Feedback form link in footer (fulfills the existing promise). (c) Uncertainty copy: chip tooltip "score = where conditions line up, not bar truth"; fade/drop day 8; hero sub-line linking to scorecard. (d) Default pins → empty; fold/demote `ave13`. | Report hub card live; footer link works; every score surface carries its caveat. | none | $0 | None — this is the cheapest trust ROI on the list |
| **M8** | E | **"Today's call" digest + RSS.** Cron (6am ET run) writes `digest.json` + `feed.xml`: per-day best window, storm status, upstream-swell flag. App renders it as the hero's source; RSS subscribable. | Valid RSS feed a user can subscribe to; item posted by 6am ET daily. | Existing model data | $0 | RSS reach is niche — it's the $0 stopgap for push, not the answer (see §3) |
| — | — | **≈ AUG 15 LINE —** everything below is explicitly after the season starts | | | | |
| **M9** | E | **Model-disagreement badge.** Second wind fetch (`models=ecmwf_ifs025` vs GFS); where they diverge >90° or >8kt in the next 48h, badge "models disagree — low confidence." Serves the verified Windy behavior ("see where there's unity or discrepancy"). | Divergent hours visibly flagged. | Open-Meteo multi-model | $0 | API weight limits — batch carefully |
| **M10** | W×2 | **Sandbar change layer v0.** Port the existing Sentinel-2 pilot: fortnightly job (manual-run first, cron later) → per-zone bar state {visible/shifted/unknown, confidence, scene date} → `zone_bars.json`; zone cards get "bars: rearranged after the 9/14 blow (satellite, 10m — zone-level only)." | After the next real storm, ≥3 zones show a dated change flag. | Copernicus Data Space S2 L2A (free token — gate H5) | $0 | Cloud cover + surf-state dependence of bar visibility — always ship confidence + scene date, "unknown" is a valid state |
| **M11** | W | **Web-push window alerts.** First backend: Cloudflare Worker + KV (free tier) storing push subscriptions; Actions cron (or Worker cron) evaluates zone windows → pushes. | User subscribes to a zone, gets a push when a window scores ≥6. | Existing model + Worker/KV | $0 (CF free tier) | This is the infra Rubicon — see §3; don't build before M8 proves demand |
| **M12** | W | **Climatology page.** Static month-by-month OBX stats from NDBC historical archives (per v2: what trip-planners actually cite from MSW). | Shareable per-month page; SEO target for "OBX surf October." | NDBC historical (free bulk) | $0 | Scope creep into pretty charts — timebox |
| **M13** | — | **Monetization prep** (season pass / supporter tier). **Hard-gated by H2 + H4 (LLC, Open-Meteo commercial license) — see §3 license flag.** | — | — | $29/mo+ | Do not start before gates clear |

---

## 3. Architecture calls

**v1's superpower is zero infra; defend it.** The Actions cron already commits JSON every 30 min — that is a server for anything that (a) is the same for all users and (b) tolerates ~30-min latency. That covers far more of v2 than intuition suggests.

| Tier | What it is | What runs there |
|---|---|---|
| **T0 — static + client** | Pages + browser fetch | Everything in v1 today; M2 card, M5 ETA math, M7, M9 (client fetches Open-Meteo directly) |
| **T0.5 — cron-as-server** | Actions cron commits JSON | M1 calibration log, M3 receipts, M4 scorecard, M6 `storms.json` (also dodges NHC CORS), M8 digest/RSS, M10 `zone_bars.json`. **No roadmap item before M11 needs anything else.** |
| **T1 — Cloudflare Worker + KV** | Real request handling + tiny state | **First forced by: M11 web-push alerts** — push needs per-user subscription storage and a sender; a cron cannot hold user state in a public repo. Challenge accepted and answered: the degraded static version is M8 (in-app call + RSS) plus manual social posts during storms. Year 1 hurricane season can be carried on that. Build the Worker only if M8/season shows real pull (people asking "can it just text me"). |
| **T2 — accounts (Supabase or similar)** | Identity, payments | **First forced by: paid tiers** (M13 season pass). Nothing else on this roadmap needs accounts — alerts subscriptions live in KV keyed by push endpoint, no login. Defer until revenue is actually being attempted. |

**⚠️ License gate (blocks the first paid feature):** Open-Meteo's free API is **non-commercial use only** (data CC-BY 4.0, API terms separate). The day CapeCast charges anyone for anything, the model feed must move to either (a) Open-Meteo's commercial API (~€29/mo — the first real infra cost, budgeted in M13) or (b) self-pulled NOAA WW3/GFS GRIBs via the cron (free, NOMADS, meaningfully more work). NDBC, CO-OPS, and NHC are US-government/public-domain — unaffected. **Rule: no charging while on the free Open-Meteo endpoint.** This gate binds M13 and any "supporter" tier that gates features (a pure no-perks donation link is arguably fine, but clear it deliberately, not by drift).

---

## 4. The pre-September cut line

Must be live before the first hurricane swell, in order, minimal acceptable version stated:

1. **M1 calibration cron fixed** — minimal: nightly lead-time log landing in `data/log/`. *(The receipts clock is running; this cannot slip.)*
2. **M2 upstream buoys** — minimal: 41001/41002 rows on the existing card.
3. **M3 receipt strip** — minimal: model-vs-buoy delta on one line per station.
4. **M4 scorecard** — minimal: 14-day wave-height MAE per station + honest caveat copy. It must have ≥2 weeks of data by Sept — another reason M1 is item 1.
5. **M6 hurricane mode v0** — minimal: storm card with NHC track link, zone lean, ETA range. Tested on an archived fixture before the first real storm.
6. **M5 arrival ETA** — minimal: upstream-pulse banner with a time range. (Feeds M6; if time is short, ship inside M6.)
7. **M7 trust pass + report hub** — minimal: links card, feedback link, chip tooltips.
8. **M8 today's-call digest + RSS** — minimal: `digest.json` + valid feed by 6am ET.

**Explicitly after:** M9 disagreement badge, M10 sandbar layer, M11 push, M12 climatology, M13 monetization, custom domain polish, golden-hour anything.

---

## 5. Trust plan (concrete, woven in — not values)

The research says credibility here is single-shot ("ignore the ratings" is the default posture; one confidently blown storm call ends it). Where the product admits uncertainty, by roadmap item:

- **M1/M4 — the calibration loop is the trust plan's engine:** nightly forecast-at-lead vs buoy-observed, scored, published, **misses shown the next day**. The scorecard's headline copy: "Here's what we said yesterday, here's what the buoy measured. We show our misses because you'd find them anyway."
- **M3 — receipts at the point of use:** every live buoy row carries the model's number next to the observed number. The user never has to take the model's word where ground truth exists.
- **M4 caveat, verbatim in UI:** *buoys verify our inputs, not the sandbar — your eyes verify the surf.* This is the honest boundary: calibration proves the swell/wind feed, not the break call. Zone-level surf truth comes only from humans → feedback form (M7/H3) is the second loop, not decoration.
- **M6 — authority humility:** storm card credits NHC as the source of the track and confines CapeCast's claim to translation ("what this track means for which side of the cape"). Never publish a track deviation.
- **M7 — uncertainty in the everyday UI:** chip tooltip ("where conditions line up — not bar truth"), day-8 fade, hero links to the scorecard, buoy card continues to hide stale data rather than show it. M9 later adds "models disagree" flags — the verified Windy behavior, productized.
- **Spot-naming policy, codified:** zones + famous public landmarks the local reports themselves name (Jennette's, S-Turns, the lighthouse — all named by Natural Art's public reports) are in-bounds; anything below that never enters `zones.js` or the copy. Add this as a comment block atop `zones.js` in M7 so future-you honors it at 11pm.
- **Default-pin removal (M7):** the product ships no opinion about *your* spot; it only ranks zones.

---

## 6. Kill list (parked, with revisit triggers)

| Parked feature | Why it dies now | Revisit when |
|---|---|---|
| Web-push / SMS alerts pre-season | First backend + user state; RSS/in-app covers year 1 | M8 has >50 daily users or repeated "text me" asks |
| Shop-partnered human report | Needs relationships + editorial time, not code | A shop reaches out, or ~1k WAU gives standing to ask |
| Full swell physics per track (SWAN/nesting) | Big-team compute; heuristic zone-lean is honest enough with humble copy | Revenue funds compute *and* scorecard proves the heuristic's ceiling |
| Cam-derived sandbar CV | Sacred rule + others' infrastructure | Own hardware only — i.e., the sandbar-USV project produces data |
| Email digest (Buttondown etc.) | List = PII + sender rep + domain; RSS first | Domain live (H1) + RSS shows habit demand |
| Visitor week-pass / season pass / any payment | H2+H4 gates (LLC, license); pre-revenue year | LLC filed, commercial data feed budgeted, ~500 WAU |
| Climatology page | Zero season urgency | First flat week of October |
| Accounts of any kind | Nothing on the roadmap needs identity | The day payments are real |

---

## 7. Human-task gates (founder manual work — what each blocks)

| # | Task | Blocks | Notes |
|---|---|---|---|
| **H1** | Buy **capecast.surf**, point Pages custom domain | Social seeding at scale (links people re-share), email digest sender domain, all of M13. Doesn't block any pre-Sept code | Do before first storm push anyway — shared URLs are forever |
| **H2** | **LLC before charging** | M13 entirely | Pairs with H4; neither matters until revenue is attempted |
| **H3** | **Feedback form** (Tally/Google Form, 20 min) | M7(b), and the *human half of the calibration loop* — bar-truth reports the buoys can't give | The footer has promised this since v0.1; cheapest gate on the list |
| **H4** | **Open-Meteo commercial license** (or GRIB self-pull decision) | M13 and any feature-gated supporter tier | See §3 license flag |
| **H5** | **Copernicus Data Space account + token** (repo secret) | M10 sandbar layer | Free; 10 minutes; do whenever, needed post-season |
| **H6** | **Socials presence** (IG/FB page for CapeCast) | The September marketing moment itself — scorecard screenshots and storm calls need somewhere to live; distribution channels per research §6 are FB groups + IG | Read-only lurking rule from the pre-plan still applies to *communities*; a first-party page is fine |

Nothing in M1–M8 is blocked by a human gate except M7(b)↔H3. **Do H3 and H1 this month; H5 before October; H2/H4 only when M13 wakes up.**

---

## 8. Next three sessions (start cold)

**Session 1 — fix the receipts clock (M1).**
Files: `.github/workflows/buoys.yml`, `scripts/fetch_buoys.mjs`.
- In `buoys.yml`: delete the `date -u +%H = 15` / minute<20 branch. Add a separate job (or separate workflow `calibrate.yml`) on its own cron `15 4 * * *` (~00:15 ET) whose step runs `node scripts/fetch_buoys.mjs --snapshot` only if `data/log/$(date -u +%F).json` doesn't already exist; keep `workflow_dispatch`.
- In `fetch_buoys.mjs --snapshot`: change the marine/wind fetches to `forecast_days=2` and store **tomorrow's 24 hourly values** keyed `forecast_for: D+1`, sampled at the **buoy coordinates** (add 41001/41002/41025/44100 lat/lons as constants) as well as the 12 zone points; store today's buoy obs block alongside (it's already in `out`).
- Done when: manual `workflow_dispatch` commits `data/log/2026-07-07.json` containing `forecast_for` and `observed`; the scheduled run lands the next morning unaided. Check the Actions tab the following evening.

**Session 2 — upstream buoys + receipt strip (M2+M3).**
Files: `scripts/fetch_buoys.mjs`, `app.js` (`buoyHTML`), `style.css`.
- Add `"41001": { name: "E Hatteras (upstream)" }, "41002": { name: "S Hatteras (upstream)" }` to `STATIONS`; add an `upstream: true` flag and station lat/lons.
- In the non-snapshot cron path, also fetch Open-Meteo marine for the current hour at each station's coords and write `model_wvht_ft` per station into `buoys.json`.
- In `buoyHTML`: render upstream rows under a divider with the "swell arrives ~18–24h later" tag; render `model X / buoy Y (ΔZ)` on every row that has both; humble caption under the card.
- Done when: live card shows 4 stations, upstream tagged, each row showing model-vs-buoy delta. Deploy and check on phone.

**Session 3 — scorecard v0 (M4, weekend).**
Files: new `scripts/score_calibration.mjs`, `calibrate.yml` (append step), `app.js`, `index.html`.
- Script: read the last 14 `data/log/*.json`; for each day D, join D-1's `forecast_for` block against D's observed buoy values at matching hours; compute per-station wave-height MAE, period MAE, and wind-direction hit-rate (±45°); write `scorecard.json` `{updated, days_n, stations: {...}, daily: [...]}`.
- Cron: run it right after the snapshot in the same job; commit both.
- App: new `scorecardHTML()` section below the buoy card — "How honest is CapeCast?" with per-station rolling numbers, worst recent miss shown deliberately, the M4 caveat line verbatim, and `n` displayed while small.
- Done when: the section renders real numbers from ≥2 days of logs (it will be thin — say so on-screen), and a deliberately-wrong test log produces a visible miss. By September this section is the marketing screenshot.

---

*Priority provenance: trust-critical/retention/moat labels and all quote citations are from capecast-v2-strategy.md §2–3; seasonality deadline from §5; sacred-rule boundaries from the venture pre-plan (obx-surf.md) and strategy §3. The one thing (strategy, closing): earn the right to be believed at dawn — M1–M4 are that sentence turned into cron jobs.*
