// Fetch NHC CurrentStorms.json -> storms.json (served same-origin by Pages — also
// dodges NHC's lack of CORS). The track, cone, and intensity are NHC's product;
// we store position + links and translate to the Banks client-side. Never publish
// a track deviation.
export function mapStorms(raw) {
  return (raw.activeStorms || [])
    .filter((s) => /^al/i.test(s.id)) // Atlantic basin only
    .map((s) => {
      const kt = +s.intensity || null;
      const cat = kt >= 137 ? 5 : kt >= 113 ? 4 : kt >= 96 ? 3 : kt >= 83 ? 2 : kt >= 64 ? 1 : null;
      return {
        id: s.id,
        name: s.name,
        class: s.classification,
        cat,
        intensity_kt: kt,
        pressure_mb: +s.pressure || null,
        lat: s.latitudeNumeric,
        lon: s.longitudeNumeric,
        movement_dir: s.movementDir,
        movement_speed_kt: s.movementSpeed,
        advisory_num: s.publicAdvisory?.advNum || null,
        advisory_url: s.publicAdvisory?.url || null,
        graphics_url: s.forecastGraphics?.url || null,
        last_update: s.lastUpdate,
      };
    });
}

if (process.argv[1] && process.argv[1].endsWith("fetch_storms.mjs")) {
  const raw = await fetch("https://www.nhc.noaa.gov/CurrentStorms.json", {
    headers: { "User-Agent": "capecast (github.com/vaultboyxl/capecast)" },
  }).then((r) => r.json());
  const out = { updated: new Date().toISOString().slice(0, 16) + "Z", storms: mapStorms(raw) };
  const { writeFileSync } = await import("node:fs");
  writeFileSync("storms.json", JSON.stringify(out, null, 1));
  console.log(`storms.json written: ${out.storms.length} active Atlantic system(s)`);
}
