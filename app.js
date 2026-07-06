/* CapeCast — OBX spot router. All client-side: Open-Meteo marine + wind, NOAA CO-OPS tides. */
(() => {
  const ZONES = window.ZONES, TIDE = window.TIDE_STATION;
  const $ = (sel, el = document) => el.querySelector(sel);

  // ---------- helpers ----------
  const M2FT = 3.28084;
  const rad = d => (d * Math.PI) / 180;
  const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const COMPASS = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  const compass = deg => COMPASS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];

  // Current time in ET as "YYYY-MM-DDTHH:00" to index the API's local-time arrays.
  function nowET() {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(new Date());
    const g = t => p.find(x => x.type === t).value;
    return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:00`;
  }
  const hourOf = iso => parseInt(iso.slice(11, 13), 10);
  const fmtHour = iso => { const h = hourOf(iso); return h === 0 ? "12am" : h < 12 ? h + "am" : h === 12 ? "12pm" : (h - 12) + "pm"; };
  const fmtDay = iso => { const d = new Date(iso.slice(0, 10) + "T12:00:00"); return d.toLocaleDateString("en-US", { weekday: "short" }); };

  // ---------- scoring ----------
  // One hour of one zone -> 0..10. Size from swell energy, gated by direction
  // exposure (can this beach see the swell?), multiplied by wind quality.
  function scoreHour(z, sw) {
    const train = (hFt, T, from) => {
      if (!hFt || !T) return { s10: 0 };
      const dd = angDiff(from, z.facing);
      if (dd >= 95) return { s10: 0 };                       // land-blocked / parallel
      const dirF = Math.pow(Math.cos(rad(Math.min(dd, 90))), 0.6); // beach break: wide window, refraction wraps
      const heff = hFt * (0.45 + 0.55 * dirF);
      let s10 = 10 * (1 - Math.exp(-(Math.pow(heff, 1.4) * T) / 55));
      if (heff > 8) s10 *= Math.max(0.5, 1 - (heff - 8) * 0.08); // OBX beach break closes out big
      return { s10, heff };
    };
    const a = train(sw.swellH * M2FT, sw.swellT, sw.swellD);
    const b = train(sw.waveH * M2FT, sw.waveT, sw.waveD);
    const size = Math.max(a.s10, b.s10 * 0.85);              // windswell counts, discounted

    const on = Math.cos(rad(angDiff(sw.windD, z.facing)));   // +1 pure onshore, -1 pure offshore
    const w = sw.windS;
    let windF, windWord;
    if (w < 5)            { windF = 1.0;  windWord = "light/glassy"; }
    else if (on < -0.3)   { windF = w > 18 ? 0.85 : Math.min(1.15, 1 + 0.015 * w); windWord = "offshore"; }
    else if (on <= 0.3)   { windF = Math.max(0.35, 1 - w / 35); windWord = "cross-shore"; }
    else                  { windF = Math.max(0.08, 1 - (w * on) / 18); windWord = "onshore"; }

    return { score: clamp(size * windF, 0, 10), windWord };
  }

  const scoreClass = s => s >= 8 ? "s8" : s >= 6 ? "s6" : s >= 4 ? "s4" : s >= 2 ? "s2" : "s0";
  const scoreWord  = s => s >= 8 ? "firing" : s >= 6 ? "good" : s >= 4 ? "surfable" : s >= 2 ? "junky" : "flat/blown";

  function reason(z, sw, windWord) {
    const useSwell = sw.swellH * M2FT >= 0.7 && angDiff(sw.swellD, z.facing) < 95;
    const h = (useSwell ? sw.swellH : sw.waveH) * M2FT, T = useSwell ? sw.swellT : sw.waveT, d = useSwell ? sw.swellD : sw.waveD;
    return `${h.toFixed(1)}ft @ ${Math.round(T)}s ${compass(d)} ${useSwell ? "swell" : "windswell"} · wind ${Math.round(sw.windS)}kt ${compass(sw.windD)} (${windWord})`;
  }

  // ---------- data ----------
  async function fetchAll() {
    const lats = ZONES.map(z => z.lat).join(","), lons = ZONES.map(z => z.lon).join(",");
    const marineURL = `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}&hourly=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction&forecast_days=3&timezone=America%2FNew_York`;
    const windURL = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=wind_speed_10m,wind_direction_10m&forecast_days=3&wind_speed_unit=kn&timezone=America%2FNew_York`;
    const d0 = nowET().slice(0, 10).replace(/-/g, "");
    const d1 = new Date(Date.now() + 2 * 864e5); // end date 2 days out (UTC date is fine for a range bound)
    const d1s = d1.toISOString().slice(0, 10).replace(/-/g, "");
    const tideURL = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=capecast&begin_date=${d0}&end_date=${d1s}&datum=MLLW&station=${TIDE.id}&time_zone=lst_ldt&units=english&interval=hilo&format=json`;

    const [marine, wind, tide, buoys] = await Promise.all([
      fetch(marineURL).then(r => r.json()),
      fetch(windURL).then(r => r.json()),
      fetch(tideURL).then(r => r.json()).catch(() => null),
      fetch("./buoys.json").then(r => r.json()).catch(() => null),
    ]);
    return { marine: Array.isArray(marine) ? marine : [marine], wind: Array.isArray(wind) ? wind : [wind], tide, buoys };
  }

  function buildModel({ marine, wind }) {
    const times = marine[0].hourly.time;
    const iNow = Math.max(0, times.indexOf(nowET()));
    const zones = ZONES.map((z, zi) => {
      const m = marine[zi].hourly, w = wind[zi].hourly;
      const hours = times.map((t, i) => {
        const sw = {
          waveH: m.wave_height[i], waveT: m.wave_period[i], waveD: m.wave_direction[i],
          swellH: m.swell_wave_height[i], swellT: m.swell_wave_period[i], swellD: m.swell_wave_direction[i],
          windS: w.wind_speed_10m[i], windD: w.wind_direction_10m[i],
        };
        const { score, windWord } = scoreHour(z, sw);
        return { t, score, sw, windWord };
      });
      return { ...z, hours, now: hours[iNow] };
    });
    return { zones, times, iNow };
  }

  // Best 3h daylight window across all zones in the next 48h.
  function bestWindow(model) {
    let best = null;
    for (const z of model.zones) {
      for (let i = model.iNow; i < Math.min(z.hours.length - 2, model.iNow + 48); i++) {
        const h = hourOf(z.hours[i].t);
        if (h < 6 || h > 18) continue;
        const avg = (z.hours[i].score + z.hours[i + 1].score + z.hours[i + 2].score) / 3;
        if (!best || avg > best.avg) best = { zone: z, i, avg };
      }
    }
    return best;
  }

  // Live NDBC obs card. Hidden if the feed is missing or older than 4h — a wrong
  // "live" number is worse than none.
  function buoyHTML(buoys) {
    if (!buoys || !buoys.stations) return "";
    const ageH = (Date.now() - new Date(buoys.updated)) / 36e5;
    if (isNaN(ageH) || ageH > 4) return "";
    const rows = Object.values(buoys.stations).filter(Boolean).map(s => {
      const wave = s.wvht_ft != null ? `<b>${s.wvht_ft}ft</b> @ ${s.dpd_s}s ${s.mwd_deg != null ? compass(s.mwd_deg) : ""}` : "wave sensor down";
      const wind = s.wspd_kt != null ? ` · ${s.wspd_kt}kt ${compass(s.wdir_deg)}` : "";
      const temp = s.wtmp_f != null ? ` · ${s.wtmp_f}°` : "";
      return `<span class="buoy-item">${s.name}: ${wave}${wind}${temp}</span>`;
    });
    if (!rows.length) return "";
    return `<section class="buoys card"><span class="buoy-tag">Live buoys</span>${rows.join("")}</section>`;
  }

  // ---------- render ----------
  function render(model, tide, buoys) {
    const app = $("#app");
    const ranked = [...model.zones].sort((a, b) => b.now.score - a.now.score);
    const top = ranked[0], bw = bestWindow(model);

    const heroHTML = `
      <section class="hero card ${scoreClass(top.now.score)}">
        <div class="hero-label">Surf now → <strong>${top.name}</strong></div>
        <div class="hero-score"><span class="num">${top.now.score.toFixed(1)}</span><span class="hero-word">${scoreWord(top.now.score)}</span></div>
        <div class="hero-reason">${reason(top, top.now.sw, top.now.windWord)}</div>
        <div class="hero-access">📍 ${top.access}</div>
        <div class="runners">${ranked.slice(1, 3).map(z =>
          `<span class="runner"><b>${z.now.score.toFixed(1)}</b> ${z.name}</span>`).join("")}</div>
      </section>`;

    const bwHTML = bw ? `
      <section class="bestwin card">
        <span class="bw-tag">Best window (48h)</span>
        <b>${bw.zone.name}</b> — ${fmtDay(bw.zone.hours[bw.i].t)} ${fmtHour(bw.zone.hours[bw.i].t)}–${fmtHour(bw.zone.hours[bw.i + 2].t)}
        <span class="chip ${scoreClass(bw.avg)}">${bw.avg.toFixed(1)}</span>
      </section>` : "";

    const strip = z => {
      let cells = "", lastDay = "";
      for (let i = model.iNow; i < Math.min(z.hours.length, model.iNow + 48); i++) {
        const h = z.hours[i], hr = hourOf(h.t), day = h.t.slice(0, 10);
        if (hr < 5 || hr > 20) continue;
        if (day !== lastDay && lastDay) cells += `<span class="daybreak" title="${fmtDay(h.t)}"></span>`;
        lastDay = day;
        cells += `<span class="cell ${scoreClass(h.score)}" title="${fmtDay(h.t)} ${fmtHour(h.t)} — ${h.score.toFixed(1)}"></span>`;
      }
      return cells;
    };

    const windClass = w => w === "offshore" ? "w-off" : w === "onshore" ? "w-on" : w === "cross-shore" ? "w-cross" : "w-light";
    const rows = ranked.map(z => `
      <div class="zone card" data-id="${z.id}">
        <div class="zone-head">
          <span class="chip ${scoreClass(z.now.score)}">${z.now.score.toFixed(1)}</span>
          <span class="zone-name">${z.name}</span>
          <span class="zone-wind ${windClass(z.now.windWord)}" title="${z.now.windWord} at this beach">
            <span class="wind-arrow" style="transform:rotate(${Math.round(z.now.sw.windD) + 180}deg)">↑</span>
            ${Math.round(z.now.sw.windS)}kt ${compass(z.now.sw.windD)}
          </span>
        </div>
        <div class="strip">${strip(z)}</div>
        <div class="zone-detail">
          <div>${reason(z, z.now.sw, z.now.windWord)}</div>
          <div class="detail-access">📍 ${z.access} · beach faces ${compass(z.facing)}</div>
        </div>
      </div>`).join("");

    const tideHTML = tide && tide.predictions ? `
      <section class="tide card">
        <div class="tide-title">Tide — ${TIDE.name} <span class="muted">(${TIDE.southNote})</span></div>
        <div class="tide-rows">${tide.predictions.slice(0, 8).map(p => {
          const [d, tm] = p.t.split(" ");
          return `<span class="tide-item">${fmtDay(d + "T12:00")} ${tm} <b>${p.type === "H" ? "▲ high" : "▼ low"}</b> ${(+p.v).toFixed(1)}ft</span>`;
        }).join("")}</div>
      </section>` : "";

    app.innerHTML = heroHTML + buoyHTML(buoys) + bwHTML + `<div class="strip-legend"><span>next 48h, 5am–8pm ET</span>
      <span class="legend"><i class="cell s0"></i>flat <i class="cell s2"></i>junk <i class="cell s4"></i>surfable <i class="cell s6"></i>good <i class="cell s8"></i>firing</span></div>` +
      rows + tideHTML + `
      <footer>Data: Open-Meteo (NOAA WW3/GFS) · NOAA CO-OPS · times ET · scores don't know today's sandbars — report back and make it smarter. v0.1, built somewhere over Tennessee. Easy does it.</footer>`;

    app.querySelectorAll(".zone").forEach(el => el.addEventListener("click", () => el.classList.toggle("open")));
    $("#updated").textContent = "updated " + new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) + " ET";
  }

  async function main() {
    try {
      const data = await fetchAll();
      render(buildModel(data), data.tide, data.buoys);
    } catch (e) {
      $("#app").innerHTML = `<section class="card error">Couldn't reach the forecast feeds (${e.message}). If you're offline, reconnect and pull to refresh.</section>`;
    }
  }
  main();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
})();
