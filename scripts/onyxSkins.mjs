// onyxSkins.mjs — les TOURS d'habitation des ères cosmiques passent de la nacre à l'ONYX.
//
// Raph, 2026-10-07 (capture d'une ville à Singularité VIII) : « tout est très monochrome ;
// de loin c'est ok, mais en zoomant c'est très fouillis ». Mesuré : le monochrome n'était
// pas une affaire de TEINTE mais de VALEUR. Le gratte-ciel à nervures n'avait aucun pixel
// sombre (contre la moitié pour une insula romaine), et 300 tours de 6 à 7 tuiles, toutes
// claires, s'empilaient sans que rien ne détache l'une de celle qui est derrière.
// Quatre pistes essayées en jeu sur la même ville (planches .preview-shots/planche-*) ;
// choisie : « toutes les tours en onyx », les maisons basses restent en nacre. Une règle :
// ce qui est HAUT prend la matière sombre des bâtiments-moteurs cosmiques (les familles
// dôme, flèche, salle, temple, arche, charpente : 50 à 87 % de pixels sombres, sur la
// rampe fer de la palette maître), ce qui est BAS garde la nacre. Aucune couleur neuve
// dans le registre de l'ère : le jade, l'or et le violet restent tels quels.
//
// LE GESTE, pixel par pixel : la NACRE (chroma ≤ 30, toutes valeurs) est repeinte sur la
// rampe fer #0d0b0c → #15161f → #2c2f36 → #4f545e → #7c828c, à la luminance
//   T = 12 + L × 96 / 255
// interpolée entre les deux crans de la rampe qui l'encadrent. L'ORDRE des valeurs est
// gardé : la face au soleil reste la plus claire, l'ombre la plus sombre, chaque détail
// garde sa place. Les accents (verre, néon, feuillage, chroma > 30) ne bougent pas. Aucun
// pixel ne bouge : silhouette, fenêtres de nuit (houseWindowsData.js) et boîtes d'encre
// restent valables telles quelles.
//
// ⚠ Source lue dans git à SOURCE_REV (la nacre d'origine) : relancer le script repart
// toujours de là et ne repeint jamais une tour déjà passée en onyx.
// Les RUINES des tours (ruins/houses, cf. pixelHouses.pixelHouseRuin) suivent : une tour
// d'onyx ne doit pas s'effondrer en nacre.
//
// Usage : node scripts/onyxSkins.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { PNG } from 'pngjs';

const SOURCE_REV = '323a56ae';
const VARIANTS = ['skytower', 'skytower2', 'tower', 'megablock', 'arcologyhome'];
const BANDS = [7, 8, 9];
const CHROMA_MAX = 30;
const T_LOW = 12, T_HIGH = 108;
const RAMP = ['#0d0b0c', '#15161f', '#2c2f36', '#4f545e', '#7c828c'].map((h) => {
  const v = parseInt(h.slice(1), 16);
  const rgb = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  return { rgb, L: 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] };
});

const dry = process.argv.includes('--dry');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

// Couleur d'onyx d'une luminance cible : interpolée entre les deux crans qui l'encadrent.
function onyxOf(T) {
  if (T <= RAMP[0].L) return RAMP[0].rgb;
  for (let i = 1; i < RAMP.length; i += 1) {
    if (T <= RAMP[i].L) {
      const a = RAMP[i - 1], b = RAMP[i], t = (T - a.L) / (b.L - a.L);
      return a.rgb.map((c, k) => Math.round(c + (b.rgb[k] - c) * t));
    }
  }
  return RAMP[RAMP.length - 1].rgb;
}

function repaint(rel) {
  const src = PNG.sync.read(execSync(`git show ${SOURCE_REV}:${rel}`, { cwd: root, maxBuffer: 1 << 26 }));
  const d = src.data;
  let ink = 0, body = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    ink += 1;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > CHROMA_MAX) continue;
    const L = 0.299 * r + 0.587 * g + 0.114 * b;
    const [nr, ng, nb] = onyxOf(T_LOW + (L * (T_HIGH - T_LOW)) / 255);
    d[i] = nr; d[i + 1] = ng; d[i + 2] = nb;
    body += 1;
  }
  if (!dry) fs.writeFileSync(path.join(root, rel), PNG.sync.write(src));
  console.log(`${rel.padEnd(52)} ${String(body).padStart(5)} / ${ink} px repeints${dry ? ' (essai)' : ''}`);
}

for (const v of VARIANTS) {
  for (const b of BANDS) {
    const key = `${v}-cosmic-${b}`;
    repaint(`public/pixelart/houses/${key}.png`);
    const ruin = `public/pixelart/ruins/houses/${key}.png`;
    if (fs.existsSync(path.join(root, ruin))) repaint(ruin);
  }
}
