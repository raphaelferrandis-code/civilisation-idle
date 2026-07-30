// ============================================================================
// plazaAnimMask.mjs — RESSERRER le masque d'animation d'une fontaine sur l'EAU.
//
//   fetchPlazaAnim fige déjà tout ce qui ne bouge pas ; le grief n'est pas là.
//   Le grief est que PixelLab REDESSINE la pierre d'une frame à l'autre : ces
//   pixels-là bougent pour de bon, ils entrent donc dans le masque, et la
//   margelle frissonne. Mesuré sur les cinq bandes livrées : selon l'ère, 53 à
//   67 % des pixels animés sont de la PIERRE (couleur chaude dans le statique).
//
//   Ce script travaille sur les BANDES DÉJÀ ÉCRITES (aucun re-téléchargement) :
//   resserrer ne fait que RENDRE des pixels au statique, jamais en inventer.
//
//   Critère d'eau, volontairement grossier et vérifiable à l'œil : un pixel est
//   de l'eau s'il lit BLEU (b − r ≥ seuil) dans le statique OU dans une frame.
//   Un jet qui jaillit là où le statique montre de la pierre est donc gardé —
//   c'est le sens du « ou dans une frame ».
//   Puis DILATATION d'un pixel, intersectée avec le mouvement réel : le bord de
//   l'eau alterne eau/pierre et clignoterait s'il était coupé net, mais on
//   n'anime jamais un pixel qui ne bougeait pas.
//
//   Usage :
//     node scripts/plazaAnimMask.mjs                 → planche seule, rien écrit
//     node scripts/plazaAnimMask.mjs --ecrire        → resserre les bandes
//     node scripts/plazaAnimMask.mjs --bleu 8        → seuil de bleuité (défaut 12)
//     node scripts/plazaAnimMask.mjs --ere cosmic    → une seule ère
//
//   La planche `.preview-shots/masque-eau.png` montre, par ère : le statique,
//   le masque AVANT en rouge, le masque APRÈS en rouge. C'est elle qui se juge,
//   pas les chiffres — un masque trop serré assèche la fontaine en silence.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const DIR = 'public/pixelart/iso/plaza';
const OUT = '.preview-shots/masque-eau.png';
const ERAS = ['antique', 'medieval', 'industrial', 'modern', 'cosmic'];

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const ECRIRE = argv.includes('--ecrire');
// SEUIL DE BLEUITÉ, posé dans le CREUX de la palette et pas au jugé. Les sprites
// passent tous par remapPalette, donc leurs couleurs sont quantifiées : relevé
// sur les cinq fontaines, l'eau occupe b − r = 52, 67 et 73 ; les gris FROIDS de
// la margelle et des ombres, 10, 14, 15 et 16. Il y a un trou de 36 entre les
// deux familles. Mon premier seuil (12) tombait dans la queue de la mauvaise
// grappe — d'où la margelle qui frissonnait. À 40 on est dans le creux, et la
// marge est telle qu'aucun réglage fin n'est nécessaire.
const BLEU = +flag('bleu', 40);
const TRAIT = +flag('trait', 70);    // luminance sous laquelle c'est un CONTOUR
const GABARIT = argv.includes('--gabarit');
const ERE = flag('ere', null);
const eras = ERE ? [ERE] : ERAS;

const bleuite = (d, i) => d[i + 2] - d[i];          // b − r : > 0 = froid, < 0 = chaud

const panneaux = [];
for (const era of eras) {
  const fSt = path.join(DIR, `fountain-${era}.png`);
  const fSp = path.join(DIR, 'anim', `fountain-${era}.png`);
  if (!fs.existsSync(fSp)) { console.warn(era, '— pas de bande'); continue; }
  const st = PNG.sync.read(fs.readFileSync(fSt));
  const sp = PNG.sync.read(fs.readFileSync(fSp));
  const W = st.width, H = st.height, N = Math.round(sp.width / sp.height);

  // ── Ce qui bouge aujourd'hui, tel que la bande le porte ───────────────────
  const bouge = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const s = (y * W + x) * 4;
      for (let i = 0; i < N; i += 1) {
        const d = (y * sp.width + i * W + x) * 4;
        if (sp.data[d] !== st.data[s] || sp.data[d + 1] !== st.data[s + 1]
          || sp.data[d + 2] !== st.data[s + 2] || sp.data[d + 3] !== st.data[s + 3]) {
          bouge[y * W + x] = 1; break;
        }
      }
    }
  }

  // ── Ce qui, parmi ça, lit comme de l'EAU ──────────────────────────────────
  const eau = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const p = y * W + x;
      if (!bouge[p]) continue;
      const s = p * 4;
      let bleu = st.data[s + 3] >= 128 && bleuite(st.data, s) >= BLEU;
      // On regarde AUSSI les frames : un jet qui jaillit là où le statique montre
      // de la pierre est de l'eau, et doit vivre. C'est sans danger seulement
      // parce que le seuil est dans le creux de la palette — un pixel de pierre
      // redessiné n'atteint jamais 40, il plafonne à 16.
      for (let i = 0; i < N && !bleu; i += 1) {
        const d = (y * sp.width + i * W + x) * 4;
        if (sp.data[d + 3] >= 128 && bleuite(sp.data, d) >= BLEU) bleu = true;
      }
      if (bleu) eau[p] = 1;
    }
  }
  // ⛔ PAS DE DILATATION. fetchPlazaAnim en posait une pour empêcher le bord de
  // l'eau — qui alterne eau/pierre — de clignoter s'il était coupé net. Elle est
  // REDONDANTE ici, et c'est un raisonnement, pas un réglage : un pixel qui prend
  // une couleur d'eau ne serait-ce qu'une frame passe DÉJÀ le test principal,
  // puisqu'on interroge toutes les frames. Ce que la dilatation ajoutait, c'est
  // donc exactement l'ensemble des pixels qui ne sont eau dans AUCUNE frame —
  // de la pierre, par définition. Mesuré : 252 px sur la moderne (25 % du
  // masque), et ce sont eux que Raph voyait bouger sur le contour bas.
  //
  // ── ZONE PEINTE À LA MAIN, quand la couleur ne peut pas trancher ───────────
  // anim/zone/fountain-<ère>.png : tout pixel OPAQUE y déclare « ici, ce qui
  // bouge est de l'eau ». Elle REMPLACE le critère de couleur pour cette ère.
  // Pourquoi ça existe : sur la fontaine cosmique, PixelLab a peint les cascades
  // dans la palette du MARBRE (relevé des pixels perdus : crème 216,205,180 ·
  // blanc 251,250,244 · gris froids 170,176,184). Aucun seuil de teinte ne peut
  // les distinguer de la pierre — c'est une limite de l'art, pas du critère.
  // `--gabarit` écrit un point de départ à corriger dans Aseprite : tout ce qui
  // bouge, MOINS le contour sombre et MOINS le pourtour de la silhouette (les
  // deux qui font onduler la forme). On en RETIRE, on n'en ajoute pas.
  const fZone = path.join(DIR, 'anim', 'zone', `fountain-${era}.png`);
  let garde = eau;
  if (fs.existsSync(fZone)) {
    const z = PNG.sync.read(fs.readFileSync(fZone));
    if (z.width !== W || z.height !== H) {
      console.error(`${era} — zone ${z.width}×${z.height} ≠ statique ${W}×${H}, ignorée`);
    } else {
      garde = new Uint8Array(W * H);
      for (let p = 0; p < W * H; p += 1) garde[p] = bouge[p] && z.data[p * 4 + 3] >= 128 ? 1 : 0;
    }
  }
  if (GABARIT) {
    const g = new PNG({ width: W, height: H });
    const opaque = (x, y) => x >= 0 && y >= 0 && x < W && y < H && st.data[(y * W + x) * 4 + 3] >= 128;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const p = y * W + x, s = p * 4;
        if (!bouge[p]) continue;
        const lum = 0.299 * st.data[s] + 0.587 * st.data[s + 1] + 0.114 * st.data[s + 2];
        if (st.data[s + 3] >= 128 && lum < TRAIT) continue;             // trait de contour
        let bord = false;
        for (let dy = -1; dy <= 1 && !bord; dy += 1) {
          for (let dx = -1; dx <= 1 && !bord; dx += 1) if (!opaque(x + dx, y + dy)) bord = true;
        }
        if (bord) continue;                                             // pourtour de silhouette
        g.data[s] = 255; g.data[s + 1] = 255; g.data[s + 2] = 255; g.data[s + 3] = 255;
      }
    }
    // ARÊTES REDESSINÉES : une composante haute d'un ou deux pixels et large de
    // six ou plus est un TRAIT, donc une arête de margelle que le modèle a
    // repeinte — jamais de l'eau, qui tombe en colonnes ou s'étale en flaques.
    // C'est la règle qui retire le liseré du bord bas que Raph a pointé, et elle
    // se lit sur la FORME, pas sur une position devinée dans le sprite.
    const vu = new Uint8Array(W * H);
    for (let p0 = 0; p0 < W * H; p0 += 1) {
      if (vu[p0] || g.data[p0 * 4 + 3] < 128) continue;
      const pile = [p0], comp = []; vu[p0] = 1;
      while (pile.length) {
        const q = pile.pop(); comp.push(q);
        const x = q % W, y = (q / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const r = ny * W + nx;
          if (!vu[r] && g.data[r * 4 + 3] >= 128) { vu[r] = 1; pile.push(r); }
        }
      }
      const ys = comp.map((q) => (q / W) | 0), xs = comp.map((q) => q % W);
      const h = Math.max(...ys) - Math.min(...ys) + 1, w = Math.max(...xs) - Math.min(...xs) + 1;
      if (h <= 2 && w >= 6) for (const q of comp) g.data[q * 4 + 3] = 0;
    }
    fs.mkdirSync(path.dirname(fZone), { recursive: true });
    fs.writeFileSync(fZone, PNG.sync.write(g));
    console.log(`  gabarit → ${fZone}`);
  }

  const nB = bouge.reduce((s, v) => s + v, 0), nG = garde.reduce((s, v) => s + v, 0);
  console.log(`${era.padEnd(11)} ${String(nB).padStart(4)} px animés → ${String(nG).padStart(4)} gardés`
    + ` (${(100 * nG / nB).toFixed(0)} %) — ${nB - nG} px de pierre rendus au statique`);

  if (ECRIRE) {
    for (let i = 0; i < N; i += 1) {
      for (let y = 0; y < H; y += 1) {
        for (let x = 0; x < W; x += 1) {
          if (garde[y * W + x]) continue;
          const s = (y * W + x) * 4, d = (y * sp.width + i * W + x) * 4;
          for (let c = 0; c < 4; c += 1) sp.data[d + c] = st.data[s + c];
        }
      }
    }
    fs.writeFileSync(fSp, PNG.sync.write(sp));
  }

  panneaux.push({ era, st, W, H, bouge, garde });
}

// ── Planche : statique · masque AVANT · masque APRÈS ─────────────────────────
if (panneaux.length) {
  const K = 5, PAD = 10;
  const W = Math.max(...panneaux.map((p) => p.W)), H = Math.max(...panneaux.map((p) => p.H));
  const cw = W * K + PAD, ch = H * K + PAD;
  const sheet = new PNG({ width: cw * 3 + PAD, height: ch * panneaux.length + PAD });
  for (let i = 0; i < sheet.data.length; i += 4) {
    sheet.data[i] = 118; sheet.data[i + 1] = 114; sheet.data[i + 2] = 106; sheet.data[i + 3] = 255;
  }
  panneaux.forEach((p, row) => {
    const peindre = (col, marque) => {
      const ox = PAD + col * cw, oy = PAD + row * ch;
      for (let y = 0; y < p.H * K; y += 1) {
        for (let x = 0; x < p.W * K; x += 1) {
          const sx = (x / K) | 0, sy = (y / K) | 0, q = sy * p.W + sx, s = q * 4;
          if (p.st.data[s + 3] < 128) continue;
          const d = ((oy + y) * sheet.width + ox + x) * 4;
          if (marque && marque[q]) { sheet.data[d] = 255; sheet.data[d + 1] = 40; sheet.data[d + 2] = 40; }
          else { sheet.data[d] = p.st.data[s]; sheet.data[d + 1] = p.st.data[s + 1]; sheet.data[d + 2] = p.st.data[s + 2]; }
        }
      }
    };
    peindre(0, null); peindre(1, p.bouge); peindre(2, p.garde);
  });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, PNG.sync.write(sheet));
  console.log('planche →', OUT, ECRIRE ? '(bandes RESSERRÉES)' : '(rien écrit, --ecrire pour appliquer)');
}
