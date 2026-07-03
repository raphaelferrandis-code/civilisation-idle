// Assemble le JSON curé des flammes du mausolée à partir des détections brutes.
// Décisions de tri (revue visuelle des boxes x2/x3/x4) encodées ici.
const fs = require("fs");
const path = require("path");
const SP = __dirname;
const OUT = path.join(__dirname, "..", "..", "public", "pixelart", "wonders", "dynasty1-flames.json");

const raw = {};
for (const t of [2, 3, 4, 5]) raw[t] = JSON.parse(fs.readFileSync(path.join(SP, `t${t}-flames.json`), "utf8"));

const F = (x, y, w, h, kind) => ({ x, y, w, h, kind }); // x,y = ancre (centre-bas de la flamme)

const tiers = {};

// t1 — revue manuelle : flamme du portail (le cœur de la tombe) + brasero.
// Exclus : cabochon doré du sommet, éclat sur mousse, reflet au sol.
tiers.t1 = {
  size: [112, 96],
  flames: [F(56, 74, 12, 23, "door"), F(72, 77, 8, 13, "small")]
};

// t2 — flamme du toit uniquement. Exclus : lumière de porte (rectangle statique),
// ornement de statue.
tiers.t2 = { size: [160, 144], flames: [F(80, 45, 9, 14, "small")] };

// t3 — 3 braseros (terrasse haute gauche + bas gauche/droite).
// Exclus : lumière du portail, glints (<= 11 px épars).
tiers.t3 = {
  size: [224, 192],
  flames: [F(84, 92, 14, 20, "large"), F(42, 151, 14, 18, "large"), F(144, 151, 14, 18, "large")]
};

// t4 — TOUTES les détections sauf le visage doré (146,33) et le portail (140,71).
tiers.t4 = {
  size: [304, 272],
  flames: raw[4].flames
    .filter(c => !(c.x === 146 && c.y === 33) && !(c.x === 140 && c.y === 71))
    .map(c => F(c.anchorX, c.anchorY, c.w, c.h, c.h >= 12 ? "large" : "small"))
};

// t5 — tri lourd : le détecteur attrape les marches dorées des escaliers.
// On garde : couronne du sommet (4, les clusters y<15 dont un fusionné coupé en 2),
// 2 trios de corniche (y~124-135, fusionnés -> éclatés à la main),
// 2 rangées de braseros de terrasse (y 199-217).
// Exclus : tous les clusters d'escalier (h<=4 fins, zones x~174-240 y>140, escaliers latéraux y>230).
const t5terrace = raw[5].flames.filter(c => c.y >= 199 && c.y <= 213 && c.h >= 3 && (c.anchorX <= 167 || c.anchorX >= 233));
tiers.t5 = {
  size: [400, 368],
  flames: [
    // couronne du sommet : UNE grande flamme centrale + deux petites latérales
    // (lecture du sprite : centre x≈198 base y≈13, latérales x≈182 et x≈216)
    F(198, 13, 15, 16, "large"), F(182, 13, 8, 10, "small"), F(216, 12, 8, 10, "small"),
    // corniche gauche (trio)
    F(127, 133, 5, 7, "small"), F(136, 134, 7, 10, "small"), F(144, 134, 7, 10, "small"),
    // corniche droite (trio)
    F(262, 134, 7, 10, "small"), F(269, 134, 7, 10, "small"), F(277, 134, 7, 10, "small"),
    // rangées de terrasse
    ...t5terrace.map(c => F(c.anchorX, c.anchorY, c.w, c.h, "small"))
  ]
};

const out = {
  _comment: "Flammes animées du Mausolée (dynasty1). x,y = ancre centre-bas dans le sprite du rang. kind: small/large/door -> variante d'asset. Générés depuis detect-flames.cjs puis curés à la main (portails/visage/marches d'escalier exclus).",
  asset: {
    small: { file: "flame-small.png", fw: 32, fh: 32, frames: 9 },
    large: { file: "flame-large.png", fw: 48, fh: 64, frames: 9 },
    door:  { file: "flame-large.png", fw: 48, fh: 64, frames: 9 }
  },
  tiers
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
for (const [k, v] of Object.entries(tiers)) console.log(`${k}: ${v.flames.length} flammes`);
