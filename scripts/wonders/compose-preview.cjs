// Prévisualise un rang du mausolée avec les flammes animées blittées à leurs ancres.
// Usage: node compose-preview.cjs <tier: t1..t5> <frameIndex|multi> <out.png>
//   "multi" = frame différente par flamme (déphasage) pour un aperçu réaliste.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "public", "pixelart", "wonders");
const { PNG } = require(path.join(__dirname, "..", "..", "node_modules", "pngjs"));

const [, , tier, frameArg, outPath] = process.argv;
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "dynasty1-flames.json"), "utf8"));
const sprite = PNG.sync.read(fs.readFileSync(path.join(ROOT, `dynasty1-${tier}.png`)));

const strips = {};
function stripFor(kind) {
  const a = cfg.asset[kind];
  if (!a) return null;
  if (!strips[a.file]) {
    const p = path.join(ROOT, a.file);
    if (!fs.existsSync(p)) return null;
    const png = PNG.sync.read(fs.readFileSync(p));
    strips[a.file] = { png, fw: a.fw, fh: a.fh, n: a.frames };
  }
  return strips[a.file];
}

// blit nearest-neighbor avec alpha "over", frame k de la bande, vers un rect cible
function blitFlame(strip, k, dx, dy, dw, dh) {
  const { png, fw, fh } = strip;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = k * fw + Math.floor(x * fw / dw);
      const sy = Math.floor(y * fh / dh);
      const si = (sy * png.width + sx) * 4;
      const a = png.data[si + 3] / 255;
      if (a < 0.02) continue;
      const tx = dx + x, ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= sprite.width || ty >= sprite.height) continue;
      const ti = (ty * sprite.width + tx) * 4;
      for (let c = 0; c < 3; c++) sprite.data[ti + c] = Math.round(png.data[si + c] * a + sprite.data[ti + c] * (1 - a));
      sprite.data[ti + 3] = Math.max(sprite.data[ti + 3], png.data[si + 3]);
    }
  }
}

const flames = cfg.tiers[tier].flames;
flames.forEach((f, i) => {
  const strip = stripFor(f.kind);
  if (!strip) { console.error(`(asset ${f.kind} manquant, flamme ${i} sautée)`); return; }
  const k = frameArg === "multi" ? (i * 3) % strip.n : Math.min(strip.n - 1, Number(frameArg) || 0);
  // même échelle que drawWonderPixelSprite (flammes nettement plus grandes que les cuites)
  const sc = f.sc != null ? f.sc : (f.kind === "door" ? 1.15 : 1.7);
  const dw = Math.round(f.w * sc + 2), dh = Math.round(f.h * sc + 2);
  blitFlame(strip, k, f.x - Math.floor(dw / 2), f.y - dh + 1, dw, dh);
});
fs.writeFileSync(outPath, PNG.sync.write(sprite));
console.log(`${tier}: ${flames.length} flammes composées -> ${outPath}`);
