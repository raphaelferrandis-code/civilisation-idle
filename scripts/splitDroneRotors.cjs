/**
 * splitDroneRotors.cjs — efface les hélices peintes sur le corps du drone.
 *
 * Le sprite PixelLab `drone-mech.png` (64×64, vue de dessus) a ses 4 étoiles
 * d'hélice PEINTES EN DUR sur les bras : figées, impossible de les faire
 * tourner. Ce script produit un châssis PROPRE (sans pales) :
 *
 *   drone-mech.png  ──►  drone-mech-body.png   (châssis + bras + nacelles + LED)
 *
 * Les hélices sont ensuite REDESSINÉES en vectoriel et TOURNÉES au rendu
 * (drawDroneRotors dans agents.js), posées sur chaque nacelle — comme sur un
 * vrai quadricoptère (souffle translucide + pales en éventail). Les étoiles
 * gravées d'origine étaient trop irrégulières pour tourner sans « wobbler ».
 *
 * Découpe = tout pixel dans l'anneau [R_IN, R_OUT] autour d'un moyeu, SAUF le
 * couloir du bras (segment moyeu→centre) et le fuselage central : on garde donc
 * bras + nacelles, on n'enlève que les pales. Les HUBS (fractions du sprite)
 * imprimés en fin de run sont recopiés tels quels dans agents.js.
 *
 *   node scripts/splitDroneRotors.cjs
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SRC = path.join(__dirname, '..', 'public', 'pixelart', 'agents', 'vehicles', 'drone-mech.png');
const OUT_BODY = SRC.replace('drone-mech.png', 'drone-mech-body.png');

// Moyeux détectés (pixel le plus « noir » de chaque coin) : TL, TR, BL, BR.
const HUBS = [[15, 16], [50, 15], [13, 48], [51, 50]];
const CENTER = [32, 32];
const R_IN = 3.5;    // rayon nacelle/moteur : reste sur le corps
const R_OUT = 13.5;  // bout des pales gravées
const ARM_HALF = 2.6; // demi-largeur du couloir de bras : reste sur le corps
const GUARD = [23, 14, 41, 50]; // fuselage (x0,y0,x1,y1) : jamais touché

const src = PNG.sync.read(fs.readFileSync(SRC));
if (src.width !== 64 || src.height !== 64) throw new Error('attendu 64×64, reçu ' + src.width + '×' + src.height);

const body = new PNG({ width: 64, height: 64 });
src.data.copy(body.data);

const inGuard = (x, y) => x >= GUARD[0] && x <= GUARD[2] && y >= GUARD[1] && y <= GUARD[3];
function armDist(x, y, h) {
  const dx = CENTER[0] - h[0], dy = CENTER[1] - h[1];
  const t = Math.max(0, Math.min(1, ((x - h[0]) * dx + (y - h[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (h[0] + t * dx), y - (h[1] + t * dy));
}

let erased = 0;
HUBS.forEach((h) => {
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const si = (y * 64 + x) * 4;
      if (src.data[si + 3] < 16) continue;
      const d = Math.hypot(x - h[0], y - h[1]);
      if (d <= R_IN || d > R_OUT) continue;       // moyeu + hors-anneau : garder
      if (inGuard(x, y)) continue;                 // fuselage : garder
      if (armDist(x, y, h) < ARM_HALF) continue;   // bras : garder
      for (let c = 0; c < 4; c += 1) body.data[si + c] = 0; // pale : effacer
      erased += 1;
    }
  }
});

fs.writeFileSync(OUT_BODY, PNG.sync.write(body));
console.log(`${erased} px de pales effacés → ${path.basename(OUT_BODY)}`);
console.log('DRONE_HUBS (fractions du sprite, à recopier dans agents.js) :');
HUBS.forEach((h, i) => {
  const dir = [1, -1, -1, 1][i]; // paires diagonales CW/CCW (comme un vrai quad)
  console.log(`  [${((h[0] + 0.5 - 32) / 64).toFixed(4)}, ${((h[1] + 0.5 - 32) / 64).toFixed(4)}, ${dir}],`);
});
