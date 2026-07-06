// Fetch NDBC realtime obs -> buoys.json (served same-origin by Pages, since NDBC has no CORS).
// Run with --snapshot to also append today's calibration log under data/log/.
// NDBC quirk: sensors report intermittently ("MM"), so each field takes the newest
// non-missing value within a per-field lookback window.
const STATIONS = {
  "41025": { name: "Diamond Shoals" },
  "44100": { name: "Duck (waverider)" },
};
const M2FT = 3.28084, MS2KT = 1.94384;
const MAX_AGE_H = 6;

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
const { writeFileSync, mkdirSync } = await import("node:fs");
writeFileSync("buoys.json", JSON.stringify(out, null, 1));
console.log("buoys.json written:", JSON.stringify(out.stations));

if (process.argv.includes("--snapshot")) {
  // Daily calibration log: inputs only (scores are deterministic from these, recomputable offline).
  const lats = "36.36,36.16,36.02,35.90,35.82,35.70,35.58,35.34,35.24,35.17,35.16,35.06";
  const lons = "-75.77,-75.72,-75.64,-75.56,-75.52,-75.45,-75.43,-75.46,-75.48,-75.60,-75.69,-75.95";
  const marine = await fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}&hourly=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction&forecast_days=1&timezone=America%2FNew_York`).then(r => r.json());
  const wind = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=wind_speed_10m,wind_direction_10m&forecast_days=1&wind_speed_unit=kn&timezone=America%2FNew_York`).then(r => r.json());
  mkdirSync("data/log", { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  writeFileSync(`data/log/${day}.json`, JSON.stringify({ day, buoys: out, marine, wind }));
  console.log(`snapshot written: data/log/${day}.json`);
}
