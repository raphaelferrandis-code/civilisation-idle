// Recolorisation de scène-A : (1) rééquilibrage des blancs anti-sépia (design intact)
// (2) construction d'une palette naturelle DOUCE + requête img2img PixelLab.
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const DIR = __dirname;
const p = (f) => path.join(DIR, f);

// ---------- (1) White balance partiel (gray-world) anti-sépia ----------
const src = PNG.sync.read(fs.readFileSync(p('foragers-scene-A.png')));
let sr = 0, sg = 0, sb = 0, n = 0;
for (let i = 0; i < src.data.length; i += 4) {
  if (src.data[i + 3] < 8) continue;
  sr += src.data[i]; sg += src.data[i + 1]; sb += src.data[i + 2]; n++;
}
const mr = sr / n, mg = sg / n, mb = sb / n;
const gray = (mr + mg + mb) / 3;
const A = 0.72; // force de correction (0 = rien, 1 = gray-world plein)
const gR = 1 * (1 - A) + (gray / mr) * A;
const gG = 1 * (1 - A) + (gray / mg) * A;
const gB = 1 * (1 - A) + (gray / mb) * A;
// petit gain de saturation NATUREL (pas de sursaturation)
const SAT = 1.12;
const out = new PNG({ width: src.width, height: src.height });
const cl = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
for (let i = 0; i < src.data.length; i += 4) {
  let r = cl(src.data[i] * gR), g = cl(src.data[i + 1] * gG), b = cl(src.data[i + 2] * gB);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  r = cl(lum + (r - lum) * SAT); g = cl(lum + (g - lum) * SAT); b = cl(lum + (b - lum) * SAT);
  out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b; out.data[i + 3] = src.data[i + 3];
}
fs.writeFileSync(p('foragers-recolor-manual.png'), PNG.sync.write(out));
console.log('manual WB written | cast means r/g/b=', mr | 0, mg | 0, mb | 0, '| gains=', gR.toFixed(2), gG.toFixed(2), gB.toFixed(2));

// ---------- (2) Palette naturelle DOUCE (désaturée, painterly) ----------
const cols = [
  '#93aab8', '#adc0cb', '#c7d4da', '#e2e9ec', // ciel bleu-gris doux
  '#6f8f6a', '#5c7d58', '#456245', '#82a06e', '#9fb488', '#37503a', // verts sauge/forêt muets
  '#9c7b52', '#8a6a45', '#6f5535', '#54402a', // bois/chaume bruns naturels (pas jaunes)
  '#7a6650', '#93826a', // terre
  '#a85446', '#b8695a', '#7c4a63', // fruits : rouge brique mat, baie prune
  '#a7ab9a', '#7f8778', // pierre/neutre végétal
  '#d3bfa2', '#bfa886', '#5b6b62' // lin/peau + vert sombre
];
const sw = 16, pal = new PNG({ width: cols.length * sw, height: sw });
cols.forEach((c, i) => {
  const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
  for (let y = 0; y < sw; y++) for (let x = 0; x < sw; x++) {
    const idx = (pal.width * y + (i * sw + x)) << 2;
    pal.data[idx] = r; pal.data[idx + 1] = g; pal.data[idx + 2] = b; pal.data[idx + 3] = 255;
  }
});
fs.writeFileSync(p('palette-muted.png'), PNG.sync.write(pal));

// ---------- Requête img2img ----------
const sceneB64 = fs.readFileSync(p('foragers-scene-A.png')).toString('base64');
const palB64 = fs.readFileSync(p('palette-muted.png')).toString('base64');
const req = {
  description: "Neolithic foragers woodland clearing on a clear day, framed by two large trees. Soft natural blue sky, fresh muted green forest and hills, a rustic thatched wooden hut, woven baskets of apples and berries in the foreground, a gatherer at work. Natural balanced painterly colors, cool daylight, no yellow or sepia tint, gentle realistic saturation, detailed pixel art landscape filling the frame.",
  negative_description: "sepia, yellow tint, orange haze, golden hour, oversaturated, neon, garish, washed out",
  image_size: { width: 400, height: 240 },
  view: 'side', outline: 'lineless', shading: 'highly detailed shading', detail: 'highly detailed',
  no_background: false, text_guidance_scale: 6,
  init_image: { type: 'base64', base64: sceneB64 },
  init_image_strength: 520,
  color_image: { type: 'base64', base64: palB64 }
};
fs.writeFileSync(p('req-i2i.json'), JSON.stringify(req));
console.log('palette-muted + req-i2i written');
