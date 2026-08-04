// ARC AVEUGLE — ramene une entree monumentale a hauteur d'homme (campagne du
// grain, docs/PLAN-EGALISATION-GRAIN.md §5).
//
//   node scripts/blindArch.mjs <src.png> <dst.png> --zone x0,y0,x1,y1 --lintel Y
//        [--wall r,g,b] [--trim r,g,b] [--lum N] [--tone F] [--courses N]
//
// POURQUOI : PixelLab dessine systematiquement l'entree a ~1/3 de la facade et
// IGNORE toute demande de reduction (verifie, edit_image compris). On ne
// re-genere donc pas : on MURE le haut de l'ouverture en arc aveugle de
// maconnerie en refend, et on ne garde qu'une porte de ~28 px sous un linteau.
// Le masque = pixels SOMBRES de la zone (le vantail, l'ombre du porche) ; la
// pierre claire et les encadrements restent intacts, donc la COURBE de l'arche
// est suivie toute seule, sans avoir a la decrire.
//
// ⚠ Le ton du refend se joue a peu de chose : trop sombre (< 0,8 de la facade)
// et l'arc mure lit encore comme une ouverture bearing. Defaut 0,88/0,76/0,60,
// verifie a l'oeil sur agrandissement AVANT de poser le sprite.
import fs from 'fs';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const [src, dst] = args.filter((a) => !a.startsWith('--'));
const opt = (nom, defaut) => {
  const i = args.indexOf('--' + nom);
  return i >= 0 && args[i + 1] ? args[i + 1] : defaut;
};
if (!src || !dst || !opt('zone') || !opt('lintel')) {
  console.error('usage: node scripts/blindArch.mjs <src> <dst> --zone x0,y0,x1,y1 --lintel Y [--wall r,g,b] [--trim r,g,b] [--lum 72] [--tone 1] [--courses 3]');
  process.exit(1);
}
const [ZX0, ZY0, ZX1, ZY1] = opt('zone').split(',').map(Number);
const YL = Number(opt('lintel'));
const LUM = Number(opt('lum', 72));
const TONE = Number(opt('tone', 1));
const COURSES = Number(opt('courses', 3));

const p = PNG.sync.read(fs.readFileSync(src));
const idx = (x, y) => (y * p.width + x) * 4;
const lum = (i) => 0.3 * p.data[i] + 0.6 * p.data[i + 1] + 0.1 * p.data[i + 2];
// Le vantail et l'ombre du porche : sombres. `r >= g` ecarte les vitrages
// froids d'une baie, qu'on ne veut pas murer par megarde.
const sombre = (x, y) => {
  const i = idx(x, y);
  return p.data[i + 3] >= 200 && lum(i) < LUM && p.data[i] >= p.data[i + 1];
};

// Ton de la facade : mediane des pixels opaques et CLAIRS pris de part et
// d'autre de la zone, a sa hauteur — la vraie couleur du mur qui l'entoure.
function murEchantillon() {
  const ech = [];
  for (let y = ZY0; y <= Math.min(ZY1, YL); y++) {
    for (const x of [ZX0 - 8, ZX0 - 5, ZX0 - 3, ZX1 + 3, ZX1 + 5, ZX1 + 8]) {
      if (x < 0 || x >= p.width) continue;
      const i = idx(x, y);
      if (p.data[i + 3] < 200 || lum(i) < LUM) continue;
      ech.push([p.data[i], p.data[i + 1], p.data[i + 2]]);
    }
  }
  if (!ech.length) return [150, 70, 62];
  const med = (k) => ech.map((c) => c[k]).sort((a, b) => a - b)[ech.length >> 1];
  return [med(0), med(1), med(2)];
}
const MUR = opt('wall') ? opt('wall').split(',').map(Number) : murEchantillon();
const mul = (c, f) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * f * TONE))));
const A = mul(MUR, 0.88), B = mul(MUR, 0.76), JOINT = mul(MUR, 0.60);
const TRIM = opt('trim') ? opt('trim').split(',').map(Number) : mul(MUR, 1.35);

let mures = 0, lint = 0;
for (let y = ZY0; y < YL; y++) {
  for (let x = ZX0; x <= ZX1; x++) {
    if (!sombre(x, y)) continue;
    const assise = Math.floor(y / COURSES);
    const joint = (y % COURSES === COURSES - 1) || ((x + (assise % 2) * COURSES) % (COURSES * 2) === 0);
    const c = joint ? JOINT : (assise % 2 ? A : B);
    const i = idx(x, y);
    p.data[i] = c[0]; p.data[i + 1] = c[1]; p.data[i + 2] = c[2]; p.data[i + 3] = 255;
    mures++;
  }
}
// Linteau de 2 px pose sur les seules colonnes qui portent encore de l'ouverture
// (donc au ras de la porte conservee), + 1 px d'ombre dessous.
for (let x = ZX0; x <= ZX1; x++) {
  if (!sombre(x, YL + 2)) continue;
  for (const dy of [-1, 0]) {
    const i = idx(x, YL + dy);
    p.data[i] = TRIM[0]; p.data[i + 1] = TRIM[1]; p.data[i + 2] = TRIM[2]; p.data[i + 3] = 255;
  }
  const i = idx(x, YL + 1);
  for (let k = 0; k < 3; k++) p.data[i + k] = Math.max(0, p.data[i + k] - 18);
  lint++;
}
fs.writeFileSync(dst, PNG.sync.write(p));
console.log(`mur ${MUR.join(',')} → refend ${A.join(',')}/${B.join(',')} joint ${JOINT.join(',')} · linteau ${TRIM.join(',')}`);
console.log(`${mures} px mures, linteau sur ${lint} colonnes → ${dst}`);
