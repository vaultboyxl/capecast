// Hurricane-mode fixture test: run the CurrentStorms mapper against the archived
// Erin (2025) snapshot so the parsing is debugged BEFORE the next real system.
// Also regenerates fixtures/storms_test.json — the payload ?stormtest=1 loads in-app.
import { mapStorms } from "./fetch_storms.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const raw = JSON.parse(readFileSync(new URL("../fixtures/nhc_erin_2025.json", import.meta.url)));
const storms = mapStorms(raw);

let fails = 0;
const assert = (cond, msg) => { console.log((cond ? "ok:  " : "FAIL:") + " " + msg); if (!cond) fails++; };

assert(storms.length === 1, "Pacific storm filtered out, one Atlantic system remains");
const e = storms[0] || {};
assert(e.name === "Erin" && e.class === "HU", "Erin parsed as hurricane");
assert(e.cat === 2, "90kt maps to Cat 2");
assert(e.lat === 31.5 && e.lon === -73.5, "numeric position carried through");
assert(e.movement_dir === 360 && e.movement_speed_kt === 13, "movement vector carried through");
assert(!!e.advisory_url && !!e.graphics_url && e.advisory_num === "036", "NHC advisory + track-graphic links present");

writeFileSync(
  new URL("../fixtures/storms_test.json", import.meta.url),
  JSON.stringify({ updated: new Date().toISOString().slice(0, 16) + "Z", storms }, null, 1)
);
console.log(fails ? `${fails} FAILURE(S)` : "all pass — fixtures/storms_test.json regenerated");
process.exitCode = fails ? 1 : 0;
