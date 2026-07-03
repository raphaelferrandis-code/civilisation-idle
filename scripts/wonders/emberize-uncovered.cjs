// Passe en braises sombres les pixels de flamme CUITE que l'overlay animé ne
// couvre pas dans toutes ses frames (même géométrie que drawWonderPixelSprite :
// sc door=1.15 sinon 1.7, +2, ancre bas-centre). Résultat : plus aucun doublon
// flamme cuite / flamme animée possible, quel que soit le déphasage.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "public", "pixelart", "wonders");
const { PNG } = require(path.join(__dirname, "..", "..", "node_modules", "pngjs"));

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "dynasty1-flames.json"), "utf8"));
const strips = {};
for (const a of Object.values(cfg.asset)) {
  if (!strips[a.file]) strips[a.file] = { png: PNG.sync.read(fs.readFileSync(path.join(ROOT, a.file))) };
}
const isFire = (d, i) => d[i + 3] >= 200 && d[i] >= 190 && d[i + 1] >= 80 && d[i + 2] <= 130 && d[i] > d[i + 2] + 90 && d[i + 1] > d[i + 2] + 20;

for (const [tier, tc] of Object.entries(cfg.tiers)) {
  const p = path.join(ROOT, `dynasty1-${tier}.png`);
  const sprite = PNG.sync.read(fs.readFileSync(p));
  let ember = 0;
  for (const f of tc.flames) {
    const a = cfg.asset[f.kind], strip = strips[a.file];
    const sc = f.kind === "door" ? 1.15 : 1.7;
    const dw = f.w * sc + 2, dh = f.h * sc + 2;
    const dx = f.x - dw / 2, dy = f.y - dh + 1;
    for (let py = f.y - f.h; py <= f.y + 1; py++) {
      for (let px = Math.floor(f.x - f.w / 2) - 1; px <= Math.ceil(f.x + f.w / 2) + 1; px++) {
        if (px < 0 || py < 0 || px >= sprite.width || py >= sprite.height) continue;
        const si = (py * sprite.width + px) * 4;
        if (!isFire(sprite.data, si)) continue;
        let coveredAll = true;
        for (let k = 0; k < a.frames; k++) {
          const u = (px - dx) / dw, v = (py - dy) / dh;
          if (u < 0 || u >= 1 || v < 0 || v >= 1) { coveredAll = false; break; }
          const sx2 = k * a.fw + Math.floor(u * a.fw), sy2 = Math.floor(v * a.fh);
          if (strip.png.data[(sy2 * strip.png.width + sx2) * 4 + 3] < 140) { coveredAll = false; break; }
        }
        if (coveredAll) continue;
        // braise sombre : garde la structure (le clair reste un peu plus clair)
        const r = sprite.data[si], g = sprite.data[si + 1], b = sprite.data[si + 2];
        sprite.data[si]     = Math.round(38 + r * 0.18);
        sprite.data[si + 1] = Math.round(16 + g * 0.11);
        sprite.data[si + 2] = Math.round(12 + b * 0.07);
        ember++;
      }
    }
  }
  fs.writeFileSync(p, PNG.sync.write(sprite));
  console.log(`${tier}: ${ember} px passés en braises`);
}
