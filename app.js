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

    // Weather gate: lightning ends sessions regardless of swell quality.
    let wx = null;
    if ([95, 96, 99].includes(sw.wxCode)) { windF *= 0.12; wx = "storm"; }
    else if ([65, 67, 82].includes(sw.wxCode)) { windF *= 0.8; wx = "rain"; }

    return { score: clamp(size * windF, 0, 10), windWord, wx };
  }

  // ---------- pins (persisted; 13th Ave pinned by default on first visit) ----------
  const PIN_KEY = "capecast-pins";
  const getPins = () => { try { return JSON.parse(localStorage.getItem(PIN_KEY)) ?? ["ave13"]; } catch { return ["ave13"]; } };
  const togglePin = id => {
    const p = getPins(), i = p.indexOf(id);
    i >= 0 ? p.splice(i, 1) : p.push(id);
    localStorage.setItem(PIN_KEY, JSON.stringify(p));
  };

  const fmtClock = hhmm => { const [h, m] = hhmm.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`; };
  const nextTides = (tide, n) => {
    if (!tide || !tide.predictions) return [];
    const now = nowET().replace("T", " ");
    return tide.predictions.filter(p => p.t > now).slice(0, n)
      .map(p => `${p.type === "H" ? "▲" : "▼"} ${fmtClock(p.t.slice(11))}`);
  };

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
    const marineURL = `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}&hourly=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction&forecast_days=8&timezone=America%2FNew_York`;
    const windURL = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=wind_speed_10m,wind_direction_10m,weather_code,precipitation_probability,temperature_2m,apparent_temperature&forecast_days=8&wind_speed_unit=kn&temperature_unit=fahrenheit&timezone=America%2FNew_York`;
    const d0 = nowET().slice(0, 10).replace(/-/g, "");
    const d1 = new Date(Date.now() + 2 * 864e5); // end date 2 days out (UTC date is fine for a range bound)
    const d1s = d1.toISOString().slice(0, 10).replace(/-/g, "");
    const tideURL = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=capecast&begin_date=${d0}&end_date=${d1s}&datum=MLLW&station=${TIDE.id}&time_zone=lst_ldt&units=english&interval=hilo&format=json`;

    // 5-day daily outlook from one mid-Banks point (Rodanthe) — sky trend is regional.
    const dailyURL = `https://api.open-meteo.com/v1/forecast?latitude=35.58&longitude=-75.43&daily=weather_code,temperature_2m_max,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,sunrise,sunset&hourly=cloud_cover_low,cloud_cover_mid,cloud_cover_high,relative_humidity_2m,precipitation&forecast_days=8&temperature_unit=fahrenheit&wind_speed_unit=kn&timezone=America%2FNew_York`;
    const [marine, wind, tide, buoys, daily] = await Promise.all([
      fetch(marineURL).then(r => r.json()),
      fetch(windURL).then(r => r.json()),
      fetch(tideURL).then(r => r.json()).catch(() => null),
      fetch("./buoys.json").then(r => r.json()).catch(() => null),
      fetch(dailyURL).then(r => r.json()).catch(() => null),
    ]);
    return { marine: Array.isArray(marine) ? marine : [marine], wind: Array.isArray(wind) ? wind : [wind], tide, buoys, daily };
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
          wxCode: w.weather_code ? w.weather_code[i] : null,
          pprob: w.precipitation_probability ? w.precipitation_probability[i] : null,
          airT: w.temperature_2m ? w.temperature_2m[i] : null,
          feels: w.apparent_temperature ? w.apparent_temperature[i] : null,
        };
        const { score, windWord, wx } = scoreHour(z, sw);
        return { t, score, sw, windWord, wx };
      });
      return { ...z, hours, now: hours[iNow] };
    });
    return { zones, times, iNow };
  }

  // Best 3h daylight window for one zone in the next 48h.
  function bestWindowZone(z, iNow) {
    let best = null;
    for (let i = iNow; i < Math.min(z.hours.length - 2, iNow + 48); i++) {
      const h = hourOf(z.hours[i].t);
      if (h < 6 || h > 18) continue;
      const avg = (z.hours[i].score + z.hours[i + 1].score + z.hours[i + 2].score) / 3;
      if (!best || avg > best.avg) best = { zone: z, i, avg };
    }
    return best;
  }
  function bestWindow(model) {
    let best = null;
    for (const z of model.zones) {
      const b = bestWindowZone(z, model.iNow);
      if (b && (!best || b.avg > best.avg)) best = b;
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

  // ---------- golden hour wow factor ----------
  // Vivid sky recipe: mid/high clouds as a canvas (~30-60% ideal, clear = bland,
  // overcast = blocked), low clouds kill the horizon light path, dry air saturates
  // color, and clearing right after rain is a bonus.
  function wowScore(hourly, iso) {
    const idx = hourly.time.indexOf(iso.slice(0, 13) + ":00");
    if (idx < 0) return null;
    const low = hourly.cloud_cover_low[idx] ?? 0, mid = hourly.cloud_cover_mid[idx] ?? 0,
          high = hourly.cloud_cover_high[idx] ?? 0, rh = hourly.relative_humidity_2m[idx] ?? 70;
    const canvas = Math.min(100, mid * 0.65 + high);
    // asymmetric bell: no canvas is fatal, over-canvas only mostly fatal (thin decks still light up)
    const fCanvas = Math.exp(-Math.pow((canvas - 45) / (canvas < 45 ? 35 : 55), 2));
    const fLow = Math.max(0, 1 - Math.pow(low / 70, 1.3));
    const fHum = clamp(1.3 - rh / 100, 0.45, 1.0);
    const prior = (hourly.precipitation[idx - 2] ?? 0) + (hourly.precipitation[idx - 1] ?? 0);
    const bonus = prior > 0.3 && low < 40 ? 1.2 : 0;
    return clamp(fCanvas * fLow * fHum * 10 + bonus, 0, 10);
  }
  const wowWord = s => s >= 8 ? "all-timer potential" : s >= 6.5 ? "glowing" : s >= 4.5 ? "some color" : s >= 2.5 ? "mild" : "dud";
  const wowClass = s => s >= 8 ? "wow-max" : s >= 6.5 ? "wow-hi" : s >= 4.5 ? "wow-mid" : "wow-low";

  function goldenHTML(daily) {
    if (!daily || !daily.daily || !daily.daily.sunrise || !daily.hourly) return "";
    const d = daily.daily, now = nowET();
    const events = [];
    d.time.forEach((day, i) => {
      events.push({ type: "Sunrise", icon: "🌅", iso: d.sunrise[i] });
      events.push({ type: "Sunset", icon: "🌇", iso: d.sunset[i] });
    });
    const next = events.filter(e => e.iso > now).slice(0, 2);
    if (!next.length) return "";
    const rows = next.map(e => {
      const wow = wowScore(daily.hourly, e.iso);
      const today = e.iso.slice(0, 10) === now.slice(0, 10);
      const when = `${today ? "" : fmtDay(e.iso) + " "}${fmtClock(e.iso.slice(11))}`;
      return `<div class="g-event">
        <span class="g-icon">${e.icon}</span>
        <span class="g-name">${e.type} <b>${when}</b></span>
        ${wow != null ? `<span class="wow ${wowClass(wow)}">${wow.toFixed(1)} · ${wowWord(wow)}</span>` : ""}
      </div>`;
    }).join("");
    return `<section class="golden card"><div class="tide-title">Golden hours <span class="muted">(color forecast, mid-Banks)</span></div>${rows}</section>`;
  }

  const WX_ICON = code =>
    code >= 95 ? "⛈" : code >= 80 ? "🌧" : code >= 61 ? "🌧" : code >= 51 ? "🌦" :
    code >= 45 ? "🌫" : code === 3 ? "☁️" : code === 2 ? "⛅" : "☀️";

  function dailyHTML(daily) {
    if (!daily || !daily.daily) return "";
    const d = daily.daily;
    const cols = d.time.slice(0, 5).map((t, i) => `
      <div class="day${d.weather_code[i] >= 95 ? " day-storm" : ""}">
        <div class="day-name">${i === 0 ? "Today" : fmtDay(t + "T12:00")}</div>
        <div class="day-icon">${WX_ICON(d.weather_code[i])}</div>
        <div class="day-temp">${Math.round(d.temperature_2m_max[i])}°</div>
        <div class="day-meta">${d.precipitation_probability_max[i]}%💧</div>
        <div class="day-meta">${Math.round(d.wind_speed_10m_max[i])}kt ${compass(d.wind_direction_10m_dominant[i])}</div>
      </div>`).join("");
    return `<section class="daily card"><div class="tide-title">Sky — next 5 days <span class="muted">(mid-Banks)</span></div><div class="daily-row">${cols}</div></section>`;
  }

  // 8-day outlook: per day, the Banks' best surf (zone + peak hour), weather, wind, sunset wow.
  function outlookHTML(model, daily) {
    if (!daily || !daily.daily) return "";
    const d = daily.daily;
    const pins = getPins();
    const zoneDayBest = (z, day) => {
      let best = null;
      for (const h of z.hours) {
        if (!h.t.startsWith(day)) continue;
        const hr = hourOf(h.t);
        if (hr < 6 || hr > 19) continue;
        if (!best || h.score > best.score) best = { score: h.score, zone: z, t: h.t };
      }
      return best;
    };
    const rows = d.time.slice(0, 8).map((day, di) => {
      let best = null;
      for (const z of model.zones) {
        const b = zoneDayBest(z, day);
        if (b && (!best || b.score > best.score)) best = b;
      }
      const pinLines = pins.map(id => {
        const z = model.zones.find(x => x.id === id);
        if (!z) return "";
        const b = zoneDayBest(z, day);
        return b ? `<div class="o-pin">★ ${z.name.split(" · ")[0]} <b class="chip ${scoreClass(b.score)}">${b.score.toFixed(1)}</b> <i>~${fmtHour(b.t)}</i></div>` : "";
      }).join("");
      const wow = d.sunset[di] ? wowScore(daily.hourly, d.sunset[di]) : null;
      return `<div class="o-row${d.weather_code[di] >= 95 ? " day-storm" : ""}">
        <span class="o-day">${di === 0 ? "Today" : fmtDay(day + "T12:00")}<i>${day.slice(5).replace("-", "/")}</i></span>
        <div class="o-main">
          <div class="o-surf">${best ? `<b class="chip ${scoreClass(best.score)}">${best.score.toFixed(1)}</b> <span class="o-zone">${best.zone.name.split(" · ")[0].split(" / ")[0]} <i>~${fmtHour(best.t)}</i></span>` : "wave model ends"}</div>
          ${pinLines}
          <div class="o-sub">
            <span>${WX_ICON(d.weather_code[di])} ${Math.round(d.temperature_2m_max[di])}°</span>
            <span>${d.precipitation_probability_max[di]}%💧</span>
            <span>💨 ${Math.round(d.wind_speed_10m_max[di])}kt ${compass(d.wind_direction_10m_dominant[di])}</span>
            ${wow != null ? `<span class="wow ${wowClass(wow)}" title="sunset color forecast">🌇 ${wow.toFixed(1)}</span>` : ""}
          </div>
        </div>
      </div>`;
    }).join("");
    return `<section class="card outlook">${rows}
      <div class="o-note">Surf = best zone on the Banks each day, with the peak hour. 🌇 = sunset color forecast. Wave model runs 8 days; trust days 6–8 loosely.</div>
    </section>`;
  }

  // ---------- render ----------
  let activeTab = "now";
  function render(model, tide, buoys, daily) {
    const app = $("#app");
    const ranked = [...model.zones].sort((a, b) => b.now.score - a.now.score);
    const top = ranked[0], bw = bestWindow(model);

    // Contiguous lightning-risk window in the next 24 daylight hours at the top zone.
    const stormWindow = (z) => {
      let start = null, end = null;
      for (let i = model.iNow; i < Math.min(z.hours.length, model.iNow + 24); i++) {
        const h = z.hours[i], hr = hourOf(h.t);
        if (hr < 6 || hr > 20) continue;
        if (h.wx === "storm") { if (start === null) start = i; end = i; }
      }
      if (start === null) return "";
      const day = z.hours[start].t.slice(0, 10) === z.hours[model.iNow].t.slice(0, 10) ? "" : fmtDay(z.hours[start].t) + " ";
      return `<div class="wx-warn">⛈ Lightning risk ${day}${fmtHour(z.hours[start].t)}–${fmtHour(z.hours[Math.min(end + 1, z.hours.length - 1)].t)} — clear the water</div>`;
    };

    const heroHTML = `
      <section class="hero card ${scoreClass(top.now.score)}">
        <div class="hero-label">Surf now → <strong>${top.name}</strong></div>
        <div class="hero-score"><span class="num">${top.now.score.toFixed(1)}</span><span class="hero-word">${scoreWord(top.now.score)}</span></div>
        <div class="hero-reason">${reason(top, top.now.sw, top.now.windWord)}</div>
        ${stormWindow(top)}
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
      let cells = "", lastDay = "", counts = [];
      for (let i = model.iNow; i < Math.min(z.hours.length, model.iNow + 48); i++) {
        const h = z.hours[i], hr = hourOf(h.t), day = h.t.slice(0, 10);
        if (hr < 5 || hr > 20) continue;
        if (day !== lastDay) {
          if (lastDay) cells += `<span class="daybreak" title="${fmtDay(h.t)}"></span>`;
          counts.push({ day: fmtDay(h.t), n: 0 });
        }
        lastDay = day;
        counts[counts.length - 1].n++;
        cells += `<span class="cell ${scoreClass(h.score)}${h.wx === "storm" ? " stormy" : ""}" title="${fmtDay(h.t)} ${fmtHour(h.t)} — ${h.score.toFixed(1)}${h.wx === "storm" ? " ⛈" : ""}"></span>`;
      }
      const axis = counts.map(c => `<span style="flex:${c.n}">${c.n >= 4 ? c.day : ""}</span>`).join("");
      return `<div class="strip">${cells}</div><div class="strip-axis">${axis}</div>`;
    };

    const windClass = w => w === "offshore" ? "w-off" : w === "onshore" ? "w-on" : w === "cross-shore" ? "w-cross" : "w-light";
    const pins = getPins();
    const ordered = [...ranked.filter(z => pins.includes(z.id)), ...ranked.filter(z => !pins.includes(z.id))];

    const zoneCard = z => {
      const isPinned = pins.includes(z.id);
      const bw = bestWindowZone(z, model.iNow);
      const bwLine = !isPinned && bw ? (bw.avg >= 2
        ? `<div class="zone-best">⭐ best: ${fmtDay(z.hours[bw.i].t)} ${fmtHour(z.hours[bw.i].t)}–${fmtHour(z.hours[bw.i + 2].t)} · ${bw.avg.toFixed(1)}</div>`
        : `<div class="zone-best muted-best">quiet next 48h</div>`) : "";
      const tides = isPinned ? nextTides(tide, 2) : [];
      const spotExtra = isPinned ? `
        <div class="spot-extra">
          ${tides.length ? `<span class="spot-fact">🌊 tide ${tides.join(" · ")}</span>` : ""}
          ${z.now.sw.airT != null ? `<span class="spot-fact">${WX_ICON(z.now.sw.wxCode ?? 0)} ${Math.round(z.now.sw.airT)}°${z.now.sw.feels != null ? ` · feels <b class="${z.now.sw.feels >= 99 ? "heat-hot" : ""}">${Math.round(z.now.sw.feels)}°</b>` : ""} · ${z.now.sw.pprob ?? 0}%💧</span>` : ""}
          ${bw ? `<span class="spot-fact">⭐ best 48h: ${fmtDay(z.hours[bw.i].t)} ${fmtHour(z.hours[bw.i].t)}–${fmtHour(z.hours[bw.i + 2].t)} <b class="chip ${scoreClass(bw.avg)}" style="font-size:12px;padding:1px 6px">${bw.avg.toFixed(1)}</b></span>` : ""}
        </div>` : "";
      return `
      <div class="zone card${isPinned ? " pinned" : ""}" data-id="${z.id}">
        <div class="zone-head">
          <span class="chip ${scoreClass(z.now.score)}">${z.now.score.toFixed(1)}</span>
          <span class="zone-name">${z.name}</span>
          <span class="zone-wind ${windClass(z.now.windWord)}" title="${z.now.windWord} at this beach">
            <span class="wind-arrow" style="transform:rotate(${Math.round(z.now.sw.windD) + 180}deg)">↑</span>
            ${Math.round(z.now.sw.windS)}kt ${compass(z.now.sw.windD)}
          </span>
          <button class="pin" data-pin="${z.id}" aria-label="${isPinned ? "unpin" : "pin"} ${z.name}" title="${isPinned ? "unpin" : "pin to top"}">${isPinned ? "★" : "☆"}</button>
        </div>
        ${strip(z)}
        ${bwLine}
        ${spotExtra}
        <div class="zone-detail">
          <div>${reason(z, z.now.sw, z.now.windWord)}</div>
          <div class="detail-access">${z.now.sw.airT != null ? Math.round(z.now.sw.airT) + "°F air" : ""}${z.now.sw.feels != null ? ` · feels <b class="${z.now.sw.feels >= 99 ? "heat-hot" : ""}">${Math.round(z.now.sw.feels)}°</b>` : ""}${z.now.sw.pprob != null ? " · " + z.now.sw.pprob + "% rain chance" : ""}${z.now.wx === "storm" ? " · ⛈ lightning risk NOW" : ""}</div>
          <div class="detail-access">📍 ${z.access} · beach faces ${compass(z.facing)}</div>
        </div>
      </div>`;
    };
    const rows = ordered.map(zoneCard).join("");

    const tideHTML = tide && tide.predictions ? `
      <section class="tide card">
        <div class="tide-title">Tide — ${TIDE.name} <span class="muted">(${TIDE.southNote})</span></div>
        <div class="tide-rows">${tide.predictions.slice(0, 8).map(p => {
          const [d, tm] = p.t.split(" ");
          return `<span class="tide-item">${fmtDay(d + "T12:00")} ${tm} <b>${p.type === "H" ? "▲ high" : "▼ low"}</b> ${(+p.v).toFixed(1)}ft</span>`;
        }).join("")}</div>
      </section>` : "";

    const tabsHTML = `<nav class="tabs">
      <button class="tab${activeTab === "now" ? " active" : ""}" data-tab="now">Next 48h</button>
      <button class="tab${activeTab === "out" ? " active" : ""}" data-tab="out">8-Day</button>
    </nav>`;

    const nowView = buoyHTML(buoys) + bwHTML + `<div class="strip-legend"><span>next 48h, 5am–8pm ET</span>
      <span class="legend"><i class="cell s0"></i>flat <i class="cell s2"></i>junk <i class="cell s4"></i>surfable <i class="cell s6"></i>good <i class="cell s8"></i>firing <i class="cell s0 stormy"></i>⛈</span></div>` +
      rows + goldenHTML(daily) + dailyHTML(daily) + tideHTML;

    app.innerHTML = heroHTML + tabsHTML +
      `<div class="view" id="view-now"${activeTab === "now" ? "" : " hidden"}>${nowView}</div>` +
      `<div class="view" id="view-out"${activeTab === "out" ? "" : " hidden"}>${outlookHTML(model, daily)}</div>` + `
      <footer>Data: Open-Meteo (NOAA WW3/GFS) · NOAA CO-OPS · times ET · scores don't know today's sandbars — report back and make it smarter. v0.1, built somewhere over Tennessee. Easy does it.</footer>`;

    app.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => {
      activeTab = b.dataset.tab;
      app.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === b));
      $("#view-now").hidden = activeTab !== "now";
      $("#view-out").hidden = activeTab !== "out";
    }));

    app.querySelectorAll(".zone").forEach(el => el.addEventListener("click", () => el.classList.toggle("open")));
    app.querySelectorAll(".pin").forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      togglePin(b.dataset.pin);
      render(model, tide, buoys, daily);
    }));
    $("#updated").textContent = "updated " + new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) + " ET";
  }

  async function main() {
    try {
      const data = await fetchAll();
      render(buildModel(data), data.tide, data.buoys, data.daily);
    } catch (e) {
      $("#app").innerHTML = `<section class="card error">Couldn't reach the forecast feeds (${e.message}). If you're offline, reconnect and pull to refresh.</section>`;
    }
  }
  main();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
    // When an updated SW takes control, reload once so new features appear
    // immediately instead of on the *next* visit.
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    });
  }
})();
