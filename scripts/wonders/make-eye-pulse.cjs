// make-eye-pulse.cjs — génère les bandes de pulsation de l'iris de l'Œil.
// Halo radial doux qui « respire » (0.18 → 1.0 en sinus), destiné au blend
// additif (lighter) : le cœur de l'iris s'illumine puis retombe, l'Œil vit.
// Sortie : eye-pulse-cyan.png (t1..t4) et eye-pulse-gold.png (t5).
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const FW = 40, FH = 40, FRAMES = 16;
const CX = FW / 2 - 0.5, CY = FH / 2 - 0.5;
const R = 18; // rayon du halo

function build(core, outName) {
  const png = new PNG({ width: FW * FRAMES, height: FH });
  for (let f = 0; f < FRAMES; f++) {
    const phase = (f / FRAMES) * Math.PI * 2;
    const breath = 0.59 + 0.41 * Math.sin(phase); // 0.18 .. 1.0
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < FW; x++) {
        const dx = x - CX, dy = y - CY;
        const d = Math.sqrt(dx * dx + dy * dy);
        let t = 1 - d / R;
        if (t <= 0) continue;
        // cœur dense + halo doux : deux gaussiennes empilées
        const soft = t * t;
        const hot = Math.pow(Math.max(0, 1 - d / (R * 0.42)), 2.2);
        const inten = Math.min(1, (soft * 0.55 + hot * 0.85)) * breath;
        if (inten < 0.02) continue;
        // vers le cœur on tire vers le blanc (surexposition)
        const w = Math.min(1, hot * breath);
        const r = Math.round(core[0] + (255 - core[0]) * w);
        const g = Math.round(core[1] + (255 - core[1]) * w);
        const b = Math.round(core[2] + (255 - core[2]) * w);
        const a = Math.round(255 * Math.min(1, inten));
        const i = (y * (FW * FRAMES) + f * FW + x) * 4;
        png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = a;
      }
    }
  }
  const out = path.join(__dirname, "..", "..", "public", "pixelart", "wonders", outName);
  fs.writeFileSync(out, PNG.sync.write(png));
  console.log(outName, "->", FW * FRAMES + "x" + FH, FRAMES + " frames");
}

build([90, 224, 255], "eye-pulse-cyan.png");   // iris teal/cyan (t1..t4)
build([255, 216, 130], "eye-pulse-gold.png");  // iris solaire (t5)
