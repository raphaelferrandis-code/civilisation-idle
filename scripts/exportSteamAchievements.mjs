// exportSteamAchievements.mjs — écrit la liste des succès pour le site Steamworks
// (audit 2026-10-05, STEAM-9) : docs/steam/succes.json (la référence : nom d'API,
// famille, caché, noms et descriptions « french » / « english ») et
// docs/steam/succes.csv (la même chose pour un tableur). À relancer après toute
// retouche de src/game/data/achievements.js — achievements.test.js échoue tant que
// les deux fichiers ne suivent pas la liste. Mode d'emploi : docs/STEAM-SUCCES.md.
//
//   node scripts/exportSteamAchievements.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { steamAchievementsJson, steamAchievementsCsv, steamAchievementRows } from "../src/game/data/achievementsExport.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "steam");

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "succes.json"), steamAchievementsJson(), "utf8");
fs.writeFileSync(path.join(OUT, "succes.csv"), steamAchievementsCsv(), "utf8");

const rows = steamAchievementRows();
console.log(`${rows.length} succès (${rows.filter((r) => r.hidden).length} cachés) → docs/steam/succes.json, docs/steam/succes.csv`);
