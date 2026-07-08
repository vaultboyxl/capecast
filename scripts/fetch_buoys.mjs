// Fetch NDBC realtime obs -> buoys.json (served same-origin by Pages, since NDBC has no CORS).
// Run with --snapshot to also append today's calibration log under data/log/.
// NDBC quirk: sensors report intermittently ("MM"), so each field takes the newest
// non-missing value within a per-field lookback window.
const STATIONS = { // positions from NDBC station_table.txt
  "41025": { name: "Diamond Shoals", lat: 35.026, lon: -75.380 },
  "44100": { name: "Duck (waverider)", lat: 36.257, lon: -75.593 },
  // Upstream: swell passing these typically reaches OBX beaches ~18–24h later.
  "41001": { name: "E Hatteras", lat: 34.791, lon: -72.420, upstream: true },
  "41002": { name: "S Hatteras", lat: 31.743, lon: -74.955, upstream: true },
};
const M2FT = 3.28084, MS2KT = 1.94384;
const MAX_AGE_H = 6;
const RECENT = {}; // station id -> trailing-24h hourly obs, kept for calibration snapshots

async function fetchStation(id) {
  const res = await fetch(`https://www.ndbc.noaa.gov/data/realtime2/${id}.txt`, {
    headers: { "User-Agent": "capecast (github.com/vaultboyxl/capecast)" },
  });
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
  const lines = (await res.text()).split("\n").filter(l => l && !l.startsWith("#"));
  const cols = ["YY","MM","DD","hh","mm","WDIR","WSPD","GST","WVHT","DPD","APD","MWD","PRES","ATMP","WTMP","DEWP","VIS","PTDY","TIDE"];
  const rows = lines.map(l => {
    const v = l.trim().split(/\s+/);
    const r = {};
    cols.forEach((c, i) => (r[c] = v[i]));
    r.time = Date.UTC(+r.YY, +r.MM - 1, +r.DD, +r.hh, +r.mm);
    return r;
  });
  // Trailing 24h, thinned to one row per hour (rows are newest-first).
  const hourly = [], seenHour = new Set();
  for (const r of rows) {
    if ((Date.now() - r.time) / 36e5 > 24) break;
    const hour = new Date(r.time).toISOString().slice(0, 13);
    if (seenHour.has(hour)) continue;
    seenHour.add(hour);
    const num = (f) => (r[f] !== "MM" && r[f] !== undefined ? +r[f] : null);
    hourly.push({
      t: new Date(r.time).toISOString().slice(0, 16) + "Z",
      wvht_ft: num("WVHT") != null ? +(num("WVHT") * M2FT).toFixed(1) : null,
      dpd_s: num("DPD"),
      mwd_deg: num("MWD"),
      wspd_kt: num("WSPD") != null ? Math.round(num("WSPD") * MS2KT) : null,
      wdir_deg: num("WDIR"),
    });
  }
  RECENT[id] = hourly;
  const newest = (field) => {
    for (const r of rows) {
      if (r[field] !== "MM" && r[field] !== undefined) {
        if ((Date.now() - r.time) / 36e5 > MAX_AGE_H) return null;
        return { v: +r[field], t: new Date(r.time).toISOString().slice(0, 16) + "Z" };
      }
    }
    return null;
  };
  const wvht = newest("WVHT"), dpd = newest("DPD"), mwd = newest("MWD"),
        wspd = newest("WSPD"), wdir = newest("WDIR"), wtmp = newest("WTMP");
  return {
    name: STATIONS[id].name,
    ...(STATIONS[id].upstream ? { upstream: true } : {}),
    wvht_ft: wvht ? +(wvht.v * M2FT).toFixed(1) : null,
    dpd_s: dpd ? Math.round(dpd.v) : null,
    mwd_deg: mwd ? Math.round(mwd.v) : null,
    wspd_kt: wspd ? Math.round(wspd.v * MS2KT) : null,
    wdir_deg: wdir ? Math.round(wdir.v) : null,
    wtmp_f: wtmp ? Math.round(wtmp.v * 9 / 5 + 32) : null,
    obs_time: (wvht || wspd || {}).t || null,
  };
}

const out = { updated: new Date().toISOString().slice(0, 16) + "Z", stations: {} };
for (const id of Object.keys(STATIONS)) {
  try { out.stations[id] = await fetchStation(id); }
  catch (e) { console.error(e.message); out.stations[id] = null; }
}

// Model-vs-buoy receipt: the forecast model's current wave height at each buoy's
// position, so the app can show "model X / buoy Y (Δ)" — the forecast checked
// against reality, live. Non-fatal: rows just lose the delta if this fetch fails.
try {
  const ids = Object.keys(STATIONS);
  const lats = ids.map((id) => STATIONS[id].lat).join(","), lons = ids.map((id) => STATIONS[id].lon).join(",");
  const res = await fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}&current=wave_height`).then((r) => r.json());
  const arr = Array.isArray(res) ? res : [res];
  ids.forEach((id, i) => {
    const wh = arr[i]?.current?.wave_height;
    if (out.stations[id] && wh != null) out.stations[id].model_wvht_ft = +(wh * M2FT).toFixed(1);
  });
} catch (e) { console.error("model wave fetch:", e.message); }
const { writeFileSync, mkdirSync } = await import("node:fs");
writeFileSync("buoys.json", JSON.stringify(out, null, 1));
console.log("buoys.json written:", JSON.stringify(out.stations));

if (process.argv.includes("--snapshot")) {
  // Daily calibration log: what the model says about TOMORROW (24h+ lead), stored so the
  // scorecard can later compare it against what the buoys actually observed. Sampled at the
  // 12 zone points AND at the buoy coordinates (only there does model-vs-truth join cleanly).
  const ZONE_PTS = [
    [36.36, -75.77], [36.16, -75.72], [36.02, -75.64], [35.90, -75.56],
    [35.82, -75.52], [35.70, -75.45], [35.58, -75.43], [35.34, -75.46],
    [35.24, -75.48], [35.17, -75.60], [35.16, -75.69], [35.06, -75.95],
  ];
  const BUOY_PTS = Object.fromEntries(Object.entries(STATIONS).map(([id, s]) => [id, [s.lat, s.lon]]));
  // Dates in ET (the forecast API's timezone) so a run at any hour stays coherent.
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const [y, m, d] = day.split("-").map(Number);
  const forecastFor = new Date(Date.UTC(y, m - 1, d + 1, 12)).toISOString().slice(0, 10);
  const fetchForecast = async (pts) => {
    const lats = pts.map((p) => p[0]).join(","), lons = pts.map((p) => p[1]).join(",");
    const marine = await fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}&hourly=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction&forecast_days=2&timezone=America%2FNew_York`).then((r) => r.json());
    const wind = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=wind_speed_10m,wind_direction_10m&forecast_days=2&wind_speed_unit=kn&timezone=America%2FNew_York`).then((r) => r.json());
    const arr = (x) => (Array.isArray(x) ? x : [x]);
    const tomorrowOnly = (loc) => { // keep just the 24 hours dated forecastFor
      const keep = loc.hourly.time.map((t, i) => (t.startsWith(forecastFor) ? i : -1)).filter((i) => i >= 0);
      const h = {};
      for (const k of Object.keys(loc.hourly)) h[k] = keep.map((i) => loc.hourly[k][i]);
      return h;
    };
    return arr(marine).map((mloc, i) => ({ marine: tomorrowOnly(mloc), wind: tomorrowOnly(arr(wind)[i]) }));
  };
  const zonesFc = await fetchForecast(ZONE_PTS);
  const buoysFcArr = await fetchForecast(Object.values(BUOY_PTS));
  const buoysFc = {};
  Object.keys(BUOY_PTS).forEach((id, i) => {
    buoysFc[id] = { lat: BUOY_PTS[id][0], lon: BUOY_PTS[id][1], ...buoysFcArr[i] };
  });
  mkdirSync("data/log", { recursive: true });
  writeFileSync(`data/log/${day}.json`, JSON.stringify({
    day,
    forecast_for: forecastFor,
    observed: out,            // buoy summary at snapshot time
    observed_hourly: RECENT,  // trailing 24h per station — yesterday's truth for scoring
    zones: { points: ZONE_PTS, forecast: zonesFc },
    buoys_forecast: buoysFc,
  }));
  console.log(`snapshot written: data/log/${day}.json (forecast_for ${forecastFor})`);
}
