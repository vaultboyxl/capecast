// CapeCast zone definitions — the Outer Banks, Corolla to Ocracoke.
// `facing` = true azimuth the beach faces (pointing out to sea).
// This is the whole trick: the coast bends ~110° around Cape Hatteras,
// so wind that ruins one zone grooms another.
// lat/lon are nudged slightly offshore so the marine model samples water.
window.ZONES = [
  { id: "corolla",  name: "Corolla",                    facing: 70,  lat: 36.36,  lon: -75.77, access: "4x4 north beaches; Hwy 12 accesses in town" },
  { id: "duck",     name: "Duck",                       facing: 72,  lat: 36.16,  lon: -75.72, access: "Limited public parking — resident-ish; FRF pier just south" },
  { id: "ave13",    name: "13th Ave · Southern Shores", facing: 73,  lat: 36.13,  lon: -75.71, access: "13th Ave beach access, Duck/Southern Shores line" },
  { id: "kdh",      name: "Kitty Hawk / Kill Devil Hills", facing: 75, lat: 36.02, lon: -75.64, access: "Tons of public accesses off the Beach Rd" },
  { id: "nagshead", name: "Nags Head / Jennette's",     facing: 78,  lat: 35.90,  lon: -75.56, access: "Jennette's Pier lot; bathhouses along Old Oregon Inlet Rd" },
  { id: "coquina",  name: "Coquina / Bodie Island",     facing: 82,  lat: 35.82,  lon: -75.52, access: "Coquina Beach lot; Ramp 2 & 4" },
  { id: "peaisland",name: "Pea Island",                 facing: 85,  lat: 35.70,  lon: -75.45, access: "Pull-offs on Hwy 12; no ramps (refuge)" },
  { id: "rodanthe", name: "Rodanthe – Waves – Salvo",   facing: 88,  lat: 35.58,  lon: -75.43, access: "S-Turns pull-off; Ramp 23 (Salvo)" },
  { id: "avon",     name: "Avon",                       facing: 100, lat: 35.34,  lon: -75.46, access: "Avon Pier; Ramp 34 & 38" },
  { id: "buxton",   name: "Buxton / Old Lighthouse",    facing: 120, lat: 35.24,  lon: -75.48, access: "Ramp 43/44 — check NPS closures at Cape Point" },
  { id: "frisco",   name: "Frisco",                     facing: 170, lat: 35.17,  lon: -75.60, access: "Ramp 49; Frisco Pier area" },
  { id: "hatteras", name: "Hatteras Village",           facing: 180, lat: 35.16,  lon: -75.69, access: "Ramp 55; watch inlet current on big S swells" },
  { id: "ocracoke", name: "Ocracoke",                   facing: 160, lat: 35.06,  lon: -75.95, access: "Ferry from Hatteras (free, ~1h); airport ramp + 4x4" },
];

// NOAA CO-OPS tide station: Duck FRF pier — the only true oceanside station on the Banks.
// South of the cape runs roughly 30–45 min later; close enough to plan a session.
window.TIDE_STATION = { id: "8651370", name: "Duck Pier (oceanside)", southNote: "south of the cape add ~30–45 min" };
