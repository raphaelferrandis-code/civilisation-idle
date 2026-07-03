// Test de couverture : pour chaque flamme du JSON, chaque pixel de flamme CUITE
// du sprite doit être recouvert (alpha >= seuil) par la flamme animée dans
// CHACUNE des 9 frames — garantie pire-cas quel que soit le déphasage runtime.
// Même géométrie que drawWonderPixelSprite (sc door=1.3 sinon 1.7, +2, ancre bas-centre).
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "public", "pixelart", "wonders");
const { PNG } = require(path.join(__dirname, "..", "..", "node_modules", "pngjs"));

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "dynasty1-flames.json"), "utf8"));
const strips = {};
for (const [kind, a] of Object.entries(cfg.asset)) {
  if (!strips[a.file]) strips[a.file] = { png: PNG.sync.read(fs.readFileSync(path.join(ROOT, a.file))), ...a };
}
const isFire = (d, i) => d[i + 3] >= 200 && d[i] >= 190 && d[i + 1] >= 80 && d[i + 2] <= 130 && d[i] > d[i + 2] + 90 && d[i + 1] > d[i + 2] + 20;

let totalUncov = 0;
for (const [tier, tc] of Object.entries(cfg.tiers)) {
  const sprite = PNG.sync.read(fs.readFileSync(path.join(ROOT, `dynasty1-${tier}.png`)));
  let baked = 0, uncovered = 0;
  const worst = [];
  tc.flames.forEach((f, fi) => {
    const a = cfg.asset[f.kind], strip = strips[a.file];
    const sc = f.kind === "door" ? 1.15 : 1.7;
    const dw = f.w * sc + 2, dh = f.h * sc + 2;
    const dx = f.x - dw / 2, dy = f.y - dh + 1;
    // zone de la flamme cuite : bbox détectée (ancre bas-centre, w x h)
    let mine = 0, miss = 0;
    for (let py = f.y - f.h; py <= f.y + 1; py++) {
      for (let px = Math.floor(f.x - f.w / 2) - 1; px <= Math.ceil(f.x + f.w / 2) + 1; px++) {
        if (px < 0 || py < 0 || px >= sprite.width || py >= sprite.height) continue;
        const si = (py * sprite.width + px) * 4;
        if (!isFire(sprite.data, si)) continue;
        mine++;
        // couverte dans TOUTES les frames ?
        let coveredAll = true;
        for (let k = 0; k < a.frames; k++) {
          const u = (px - dx) / dw, v = (py - dy) / dh;
          if (u < 0 || u >= 1 || v < 0 || v >= 1) { coveredAll = false; break; }
          const sx2 = k * a.fw + Math.floor(u * a.fw), sy2 = Math.floor(v * a.fh);
          const al = strip.png.data[(sy2 * strip.png.width + sx2) * 4 + 3];
          if (al < 140) { coveredAll = false; break; }
        }
        if (!coveredAll) miss++;
      }
    }
    baked += mine; uncovered += miss;
    if (miss > 0) worst.push(`#${fi} ${f.kind} (${f.x},${f.y}) ${miss}/${mine}px`);
  });
  totalUncov += uncovered;
  console.log(`${tier}: ${baked} px cuits, ${uncovered} non couverts${worst.length ? " -> " + worst.join(" ; ") : ""}`);
}
console.log(totalUncov === 0 ? "COUVERTURE TOTALE" : `TOTAL non couvert: ${totalUncov}`);
