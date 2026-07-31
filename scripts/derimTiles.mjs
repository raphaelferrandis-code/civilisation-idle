/**
 * DÉ-LISERAGE DES TUILES INSTALLÉES — repeinte EN PLACE, jamais une regénération.
 * ---------------------------------------------------------------------------
 * Le grief (Raph 2026-07-31) : « tous mes sols ont leur tuile enfermée par une
 * ligne de pixels sombres ». Ce n'est pas le rendu — le masque du losange pave
 * sans trou ni recouvrement et le blit est 1:1 (cf. isoTileIsFlat). L'anneau est
 * PEINT DANS LE PNG : les lots PixelLab cuisent un liseré de dalle sur l'arête
 * malgré le prompt « seamless, no borders ». Répété par cellule, il retrace la
 * grille. `derim()` dans fetchGroundTiles.mjs existait pour ça mais était opt-in
 * et n'a été armé que sur UNE matière (ground-earth) : d'où l'écart mesuré entre
 * ground-earth (Δ +1, propre) et ground-earth-winter (Δ −43, même matière, lot
 * suivant, filtre oublié).
 *
 * POURQUOI PAS RELANCER LE PIPELINE : il rendrait de l'art NEUF (autres pierres,
 * autres risques) et effacerait les retouches faites à la main depuis. On
 * repeint le fichier livré.
 *
 * POURQUOI PAS LE `derim()` D'ORIGINE, tel quel : il seuille la luminance sur
 * une bande de bord large (`keeps(..., -7)`, soit ~9 px au ras du losange) et
 * découpe TOUT pixel sous 0,8 × médiane. Sur du béton ça nettoie ; sur du pavé
 * ça mange les joints du bord et laisse un anneau chauve — vérifié en pavant un
 * pan 5×5 de road-cobble ainsi filtré, le remède était pire que le mal.
 *
 * CE QU'ON FAIT À LA PLACE. Le liseré est une COQUILLE : les pixels à distance d
 * du bord, pour d petit. On mesure chaque coquille et on ne coupe que celles,
 * CONTIGUËS AU BORD, qui décrochent du cœur — la profondeur du liseré est donc
 * LUE sur la tuile, jamais postulée. Un joint de pavé, lui, est sombre à TOUTES
 * les profondeurs : sa coquille ne décroche pas, il survit. La repeinte propage
 * la matière saine vers l'extérieur, pixel par pixel, sans moyenne — un pixel
 * prend la couleur d'un VOISIN, pas leur mélange : sur 4 valeurs de pierre, la
 * moyenne invente un gris qui n'est dans aucune rampe de la palette.
 *
 * DEUX CHOSES SE MESURENT PAR ARÊTE ET NON EN ANNEAU, cf. `quadMask` : cet art
 * est éclairé en haut-gauche, ses traits sont directionnels, et une moyenne sur
 * les quatre côtés les dilue jusqu'à passer sous le seuil.
 *
 * LE MASQUE EST L'ALPHA, PAS LA FORMULE, cf. `diamondMask` — 64 pixels par tuile
 * en dépendaient, et c'étaient les plus noirs.
 *
 * L'ALPHA N'EST JAMAIS ÉCRIT. C'est lui qui garantit le pavage exact ; le
 * `derim` d'origine le perçait puis le rebouchait, ce qui est un pari. Ici on ne
 * réécrit que le RVB — vérifié fichier par fichier après chaque passe.
 *
 * Usage :
 *   node scripts/derimTiles.mjs                    # mesure seule, n'écrit rien
 *   node scripts/derimTiles.mjs --apply            # repeint en place
 *   node scripts/derimTiles.mjs --only road-       # restreint aux clés qui matchent
 *   node scripts/derimTiles.mjs --except iso-grass # met une famille de côté
 *   node scripts/derimTiles.mjs --proof <dir>      # pans 5×5 avant/après par famille
 *   node scripts/derimTiles.mjs --mode clone       # force le geste de repeinte
 *   node scripts/derimTiles.mjs --crete            # traite aussi le liseré CLAIR
 *
 * Réglages : --depth (déf. 4) · --thresh (0,92) · --thresh-arete (0,85) ·
 * --dark (0,72) · --bright (1,25) · --margin (0,08).
 *
 * La passe converge : 77 tuiles au 1er tour, 12 au 2e, 11 stables ensuite — ces
 * dernières sont au plancher de bruit, insister ne fait plus qu'éroder.
 *
 * ⚠ `--proof` n'est pas un ornement : le chiffre dit qu'un anneau a décroché, il
 * ne dit pas que la repeinte est BELLE. Le pan pavé le dit. C'est lui qui a fait
 * rejeter le filtre d'origine sur le pavé.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const DIR = 'public/pixelart/iso';
// Le détecteur est IMPORTÉ par isoGroundTileRim.test.js, qui monte la garde sur
// les PNG livrés. D'où le garde-main : recopier `diagnose` dans le test le
// laisserait diverger du filtre le jour où l'un des deux bouge, et une garde qui
// mesure autre chose que l'outil ne garde rien. En import, argv est celui de
// vitest — on ne le lit pas, les réglages restent ceux par défaut.
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const argv = IS_MAIN ? process.argv.slice(2) : [];
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const APPLY = flag('--apply');
const ONLY = opt('--only', null);
const EXCEPT = opt('--except', null);
const MAX_DEPTH = Number(opt('--depth', 4));
const THRESH = Number(opt('--thresh', 0.92));
// Seuil PROPRE aux arêtes, nettement plus sévère que le global. Un quart de
// coquille ne fait qu'une trentaine de pixels : la médiane y saute d'un cran de
// palette et 0,92 déclenchait sur des tuiles parfaitement saines. Les deux
// populations mesurées se séparent net — traits directionnels réels à 0,42 · 0,53
// · 0,71 · 0,76 · 0,80 · 0,81 · 0,84, arêtes saines à 0,86 · 0,90 · 0,91 · 0,92.
// 0,85 passe entre les deux, et non au ras de la pire valeur observée.
const THRESH_ARETE = Number(opt('--thresh-arete', 0.85));
// « Sombre » = sous cette fraction de la médiane de la matière. 0,72 sépare le
// joint et la fissure (le défaut) du simple grain de pierre (la matière).
const DARK = Number(opt('--dark', 0.72));
// … et « clair », son symétrique. Un liseré n'est pas forcément noir : sur le
// béton d'hiver la dalle porte AUSSI une crête de neige sur son arête (29 % de
// pixels clairs à la 3e coquille contre 0 % au cœur). Retirer le trait sombre
// sans elle laisse le même quadrillage, dessiné en blanc.
//
// ⚠ OPT-IN (`--crete`), et ce n'est pas de la prudence : sur ground-earth-winter
// la neige n'est PAS une crête de bord, elle est répandue partout (23, 30, 18,
// puis encore 12 et 12 % jusqu'au centre). Le critère y court jusqu'à la 5e
// coquille et déneigerait la moitié extérieure de chaque tuile — un quadrillage
// neuf, en négatif. On ne l'arme que là où la crête RETOMBE au niveau du cœur.
const CRETE = flag('--crete');
const BRIGHT = Number(opt('--bright', 1.25));
// Excédent de pixels sombres, en POINTS, au-delà duquel une coquille est jugée
// liserée. 8 points : sur le pavé les coquilles saines oscillent entre 24 et
// 49 % — une marge plus serrée condamnerait la matière au lieu du liseré.
const MARGIN = Number(opt('--margin', 0.08));
// Profondeur à partir de laquelle on est dans le CŒUR de la matière. 6 px : au
// delà du liseré le plus épais mesuré (4 px sur le béton d'hiver), avec deux
// coquilles de marge — sinon la référence contiendrait le défaut qu'elle juge.
const CORE_D = 6;

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : NaN);

// Masque de ce que la tuile PEINT dans sa cellule.
//
// ⚠ C'est l'ALPHA qui fait foi, pas la formule du losange. Une tuile 64×32 porte
// 1088 pixels opaques quand le losange analytique n'en compte que 1024 : 64
// pixels de l'escalier extérieur débordent d'un demi-pixel. Le moteur les
// dessine — ils tuilent d'ailleurs exactement (0 trou, 0 recouvrement mesurés) —
// mais un masque analytique ne les voit pas. Ils portaient, sur le parvis, une
// médiane de 23 pour un cœur à 67 : le trait le plus noir de la tuile était
// justement celui qu'aucune mesure n'atteignait et qu'aucune repeinte ne touchait.
//
// La borne analytique reste, élargie d'1,5 px, pour une seule raison : sur une
// tuile à DÉBORD (herbe, 64×39) les brins qui montent au-dessus de la boîte
// appartiennent visuellement à la cellule voisine, et ne sont pas du liseré.
function diamondMask(png) {
  const { width: w, height: h, data } = png;
  const dh = w / 2, y0 = h - dh, tol = 1.5 / (2 * dh);
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (data[(y * w + x) * 4 + 3] < 128) continue;
    const cx = (x + 0.5) / w - 0.5, cy = (y - y0 + 0.5) / dh - 0.5;
    if (y >= y0 && Math.abs(cx) + Math.abs(cy) <= 0.5 + tol) m[y * w + x] = 1;
  }
  return m;
}

// ARÊTE dont chaque pixel relève : NO, NE, SO, SE selon le quadrant du losange.
// ⚠ Ce découpage n'est pas un raffinement, c'est ce qui fait mordre le filtre sur
// l'art éclairé en haut-gauche. Le parvis des merveilles porte son trait sur les
// SEULES arêtes nord (médianes 36 et 28) et rien au sud (67 = le cœur). Moyenné
// sur les quatre côtés, ça donne 50 — assez pour déclencher une correction d'un
// pixel, pas assez pour la mener au bout, et le losange restait à l'écran.
const QUADS = ['NO', 'NE', 'SO', 'SE'];
function quadMask(w, h, mask) {
  const dh = w / 2, y0 = h - dh;
  const q = new Int8Array(w * h).fill(-1);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (!mask[y * w + x]) continue;
    const cx = (x + 0.5) / w - 0.5, cy = (y - y0 + 0.5) / dh - 0.5;
    q[y * w + x] = cx < 0 ? (cy < 0 ? 0 : 2) : (cy < 0 ? 1 : 3);
  }
  return q;
}

// Distance (en pixels, 4-connexité) au bord du losange, à l'INTÉRIEUR du masque.
function shells(mask, w, h) {
  const d = new Int16Array(w * h).fill(-1);
  const q = [];
  const out = (x, y) => x < 0 || y < 0 || x >= w || y >= h || !mask[y * w + x];
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (!mask[y * w + x]) continue;
    if (out(x - 1, y) || out(x + 1, y) || out(x, y - 1) || out(x, y + 1)) { d[y * w + x] = 0; q.push(y * w + x); }
  }
  for (let k = 0; k < q.length; k += 1) {
    const p = q[k], x = p % w, y = (p / w) | 0;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (out(nx, ny) || d[ny * w + nx] !== -1) continue;
      d[ny * w + nx] = d[p] + 1; q.push(ny * w + nx);
    }
  }
  return d;
}

// Diagnostic d'une tuile : profondeur du liseré (−1 = aucun). Le liseré part DU
// BORD et reste contigu — une coquille interne plus sombre isolée est un motif,
// pas un cadre.
//
// DEUX CRITÈRES, en OU, parce qu'un seul laisse passer la moitié des cas :
//
//  · la MÉDIANE de la coquille décroche du cœur. Attrape le trait plein posé sur
//    une matière lisse ou sombre — sur road-asphalt le liseré est à 60 pour un
//    cœur à 66, il ne serait jamais « sombre » dans l'absolu, il l'est
//    RELATIVEMENT.
//  · la PART DE PIXELS SOMBRES de la coquille dépasse celle du cœur. Attrape le
//    liseré qui s'estompe : sur ground-concrete-winter la médiane est revenue au
//    cœur dès la 3e coquille alors que 11 % puis 3 % de pixels sombres traînent
//    encore, et ce sont eux qui redessinent le losange à l'écran.
//
// La part de référence est celle de la MATIÈRE, jamais une constante : sur le
// pavé un tiers des pixels sont des joints sombres à toute profondeur — mesurer
// « beaucoup de sombre au bord » sans cette référence condamnerait la matière
// entière, et c'est exactement ce que faisait le filtre d'origine.
export function diagnose(png) {
  const { width: w, height: h, data } = png;
  const mask = diamondMask(png);
  const d = shells(mask, w, h);
  const quad = quadMask(w, h, mask);
  const per = [];
  const core = [];
  const perQ = [[], [], [], []];
  for (let i = 0; i < w * h; i += 1) {
    if (d[i] < 0 || data[i * 4 + 3] < 128) continue;
    const L = lum(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    if (d[i] >= CORE_D) core.push(L);
    else { (per[d[i]] ||= []).push(L); if (quad[i] >= 0) (perQ[quad[i]][d[i]] ||= []).push(L); }
  }
  const cm = median(core);
  const sm = per.map(median);
  const part = (a, f) => (a.length ? a.filter(f).length / a.length : 0);
  const estNoir = (L) => L < cm * DARK;
  const estClair = (L) => L > cm * BRIGHT;
  const baseDark = part(core, estNoir), baseClair = part(core, estClair);
  const sd = per.map((a) => part(a, estNoir));
  const sc = per.map((a) => part(a, estClair));
  // ⚠ Le critère MÉDIANE ne vaut que pour les deux premières coquilles. Un trait
  // est MINCE : au delà, une médiane basse n'est plus un cadre mais un dégradé —
  // l'herbe s'assombrit doucement du centre vers le bord, et sur elle le critère
  // médiane seul filait jusqu'à 5 coquilles (540 px repeints sur 1088, la moitié
  // de la tuile) pour un défaut qui n'existe pas. En profondeur, seule la part de
  // pixels sombres, qui mesure la FISSURE et non la pénombre, fait autorité.
  const profond = (med, dark, clair, seuil) => {
    let k = -1;
    for (let i = 0; i <= Math.min(MAX_DEPTH, med.length - 1); i += 1) {
      const parLaMediane = i <= 1 && med[i] < cm * seuil;
      const parLaCrete = CRETE && clair && clair[i] > baseClair + MARGIN;
      if (!(parLaMediane || (dark && dark[i] > baseDark + MARGIN) || parLaCrete)) break;
      k = i;
    }
    return k;
  };
  const ring = profond(sm, sd, sc, THRESH);
  // Profondeur par ARÊTE. Le critère « part de pixels sombres » n'y est pas
  // rejoué : sur un quart de coquille l'échantillon tombe à ~30 px et la part
  // devient du bruit. La médiane, elle, tient — et c'est elle qui trahit le trait
  // directionnel. Une arête ne peut pas creuser MOINS que le verdict global :
  // les deux décisions se prennent au plus profond des deux.
  const quadMed = perQ.map((prof) => prof.map(median));
  const ringQ = quadMed.map((prof) => Math.max(ring, profond(prof, null, null, THRESH_ARETE)));
  const bande = new Uint8Array(w * h);       // pixels à repeindre, arête par arête
  for (let i = 0; i < w * h; i += 1) {
    if (d[i] < 0) continue;
    const lim = quad[i] >= 0 ? ringQ[quad[i]] : ring;
    if (d[i] <= lim) bande[i] = 1;
  }
  return {
    w, h, d, mask, quad, bande, coreMed: cm, shellMed: sm, shellDark: sd, shellClair: sc,
    baseDark, baseClair, ring, ringQ, quadMed, ringMax: Math.max(ring, ...ringQ),
  };
}

// Le voisin source est toujours choisi dans un ordre FIXE : deux exécutions
// doivent rendre le même PNG, sinon le diff git ment sur ce qui a changé.
const VOISINS = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

// REPEINTE PAR CLONAGE — les coquilles 0..k reprennent la matière de la coquille
// k+1, de l'intérieur vers l'extérieur. C'est le bon geste quand le liseré est
// un TRAIT PLEIN d'un pixel : il ne reste rien à sauver dessous, et le clone
// rend de la vraie matière (sur road-cobble, des pavés entiers là où le filtre
// d'origine laissait un anneau chauve).
function cloneOut(png, diag) {
  const { width: w, data } = png;
  const { d, bande, ringMax } = diag;
  let touched = 0;
  // Du plus profond vers le bord : la coquille lvl+1 est alors soit hors bande
  // (matière saine), soit déjà repeinte. On ne clone jamais du liseré.
  for (let lvl = ringMax; lvl >= 0; lvl -= 1) {
    const src = new Map();
    for (let i = 0; i < d.length; i += 1) {
      if (d[i] !== lvl || !bande[i]) continue;
      const x = i % w, y = (i / w) | 0;
      for (const [dx, dy] of VOISINS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny * w + nx >= d.length) continue;
        if (d[ny * w + nx] !== lvl + 1) continue;
        src.set(i, ny * w + nx); break;
      }
    }
    for (const [dst, s] of src) {
      for (let c = 0; c < 3; c += 1) data[dst * 4 + c] = data[s * 4 + c];
      touched += 1;
    }
  }
  return touched;
}

// REPEINTE PAR DISSOLUTION — on ne touche QUE les pixels sombres des coquilles
// 0..k, chacun repris d'un voisin clair ; le reste de la coquille est laissé
// intact. Réservée aux liserés ÉPAIS (≥ 2 px), où le clonage étirerait la
// matière sur toute leur profondeur : sur le béton d'hiver, dont le liseré
// s'estompe sur 3 px, il tirait les plaques de neige du bord en longues traînées
// radiales — le quadrillage partait, remplacé par un peigne. Ici la neige reste
// où elle est et seule la fissure du bord se referme.
function dissolve(png, diag) {
  const { width: w, data } = png;
  const { d, bande, coreMed } = diag;
  const bas = coreMed * DARK, haut = CRETE ? coreMed * BRIGHT : Infinity;
  // Hors bande = le défaut, dans les deux sens : la fissure du bord ET la crête
  // de neige qui la double. Le reste de la coquille, lui, est de la matière.
  const dehors = (i) => { const L = lum(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]); return L < bas || L > haut; };
  const cible = [];
  for (let i = 0; i < d.length; i += 1) if (bande[i] && dehors(i)) cible.push(i);
  let touched = 0;
  for (let pass = 0; pass < 8 && cible.length; pass += 1) {
    const src = new Map();
    for (const i of cible) {
      if (!dehors(i)) continue;
      const x = i % w, y = (i / w) | 0;
      // voisin DANS la bande, le plus profond d'abord : on rebouche avec la
      // matière du dedans, pas avec le pixel d'à côté qui est du liseré aussi.
      let best = -1, bestD = -1;
      for (const [dx, dy] of VOISINS) {
        const nx = x + dx, ny = y + dy, j = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || j >= d.length || d[j] < 0 || dehors(j)) continue;
        if (d[j] > bestD) { bestD = d[j]; best = j; }
      }
      if (best >= 0) src.set(i, best);
    }
    if (!src.size) break;
    for (const [dst, s] of src) {
      for (let c = 0; c < 3; c += 1) data[dst * 4 + c] = data[s * 4 + c];
      touched += 1;
    }
  }
  return touched;
}

// `--mode` force le geste quand le choix par l'épaisseur se trompe : le parvis
// des merveilles a un liseré de 2 px, donc part en dissolution, et la dissolution
// y laisse des encoches carrées (son escalier extérieur n'a pas de voisin clair
// à recopier). Sur lui le clonage rend mieux — d'où la trappe.
const MODE = opt('--mode', null);
export const repaint = (png, diag) => {
  if (MODE === 'clone') return cloneOut(png, diag);
  if (MODE === 'dissoudre') return dissolve(png, diag);
  return diag.ringMax >= 2 ? dissolve(png, diag) : cloneOut(png, diag);
};

// Familles de SOL uniquement, listées par leur nom. Filtrer sur la géométrie
// (« 2:1 donc c'est un sol ») ratisserait les sprites du même dossier — un
// bateau ou une travée de pont passeraient sous le rouleau.
export const FAMILY = /^(ground-[a-z]+(-winter)?|iso-(grass|dirt|sand|shingle|wonder)(-winter)?|iso-plaza(-[a-z]+)?|road-[a-z]+(-winter)?)(-[1-4])?\.png$/;
// ÉCARTÉES à dessein, et pas par prudence molle :
//  · iso-wonder — le parvis des merveilles est un DALLAGE assumé, dont le
//    renderer trace lui-même les joints (WONDER_GROUND.joint). Son liseré de
//    1 px est le dessin, pas le défaut. `--only iso-wonder` pour l'inclure.
//  · iso-pavement — 64×64, une dalle EN VOLUME (face 2:1 + épaisseur), pas un
//    losange de cellule : le masque de losange n'y veut rien dire. Le renderer
//    la traite déjà à part (cf. groundTileTune).
export const SKIP = /^(iso-wonder|iso-pavement)/;
export const RIM_FAMILY = FAMILY;
if (!IS_MAIN) { /* importé : le détecteur suffit, pas d'effet de bord */ } else {
const files = fs.readdirSync(DIR)
  .filter((f) => FAMILY.test(f))
  .filter((f) => (ONLY ? f.includes(ONLY) : !SKIP.test(f)))
  // `--except` sert aux exclusions de CIRCONSTANCE, pas de doctrine : mettre de
  // côté une famille sur laquelle un autre lot est en cours dans l'arbre, pour
  // ne pas mêler cette repeinte à un travail non committé.
  .filter((f) => !EXCEPT || !f.includes(EXCEPT));

// ── PREUVE : un pan de N×N cellules pavé au pas iso, avant puis après. Fond gris
// neutre : une ligne sombre qui apparaît là ne peut pas venir du fond. Aucun code
// de rendu du jeu n'intervient — c'est le PNG seul qui est jugé.
const PROOF = opt('--proof', null);
function proofSheet(key, dest) {
  const names = [1, 2, 3, 4].map((k) => `${key}-${k}.png`).filter((n) => fs.existsSync(path.join(DIR, n)));
  if (!names.length) return null;
  const read = () => names.map((n) => PNG.sync.read(fs.readFileSync(path.join(DIR, n))));
  const N = 5, K = 2, GAP = 6;
  const pan = (vars) => {
    const tw = vars[0].width, dh = tw / 2;
    const W = tw * N, H = dh * N;
    const d = new PNG({ width: W, height: H });
    for (let i = 0; i < d.data.length; i += 4) { d.data[i] = 90; d.data[i + 1] = 90; d.data[i + 2] = 96; d.data[i + 3] = 255; }
    let s = 12345; const rnd = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
    for (let gy = -N; gy < N * 2; gy += 1) for (let gx = -N; gx < N * 2; gx += 1) {
      const src = vars[Math.floor(rnd() * vars.length)];
      const ox = Math.round(W / 2 + (gx - gy) * tw / 2 - tw / 2);
      const oy = Math.round((gx + gy) * dh / 2 - dh / 2) - (src.height - dh);
      for (let y = 0; y < src.height; y += 1) for (let x = 0; x < tw; x += 1) {
        const si = (y * tw + x) * 4; if (src.data[si + 3] <= 128) continue;
        const X = ox + x, Y = oy + y; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const di = (Y * W + X) * 4;
        d.data[di] = src.data[si]; d.data[di + 1] = src.data[si + 1]; d.data[di + 2] = src.data[si + 2]; d.data[di + 3] = 255;
      }
    }
    return d;
  };
  const A = pan(read());
  const after = read();
  for (const p of after) { const g = diagnose(p); if (g.ring >= 0) repaint(p, g); }
  const B = pan(after);
  const W = A.width * K, H = A.height * K * 2 + GAP;
  const m = new PNG({ width: W, height: H });
  for (let i = 0; i < m.data.length; i += 4) { m.data[i] = 16; m.data[i + 1] = 16; m.data[i + 2] = 20; m.data[i + 3] = 255; }
  const blit = (src, oy) => {
    for (let y = 0; y < src.height * K; y += 1) for (let x = 0; x < src.width * K; x += 1) {
      const si = (((y / K | 0) * src.width) + (x / K | 0)) * 4, di = ((oy + y) * W + x) * 4;
      for (let c = 0; c < 4; c += 1) m.data[di + c] = src.data[si + c];
    }
  };
  blit(A, 0); blit(B, A.height * K + GAP);
  fs.writeFileSync(dest, PNG.sync.write(m));
  return dest;
}
if (PROOF) {
  fs.mkdirSync(PROOF, { recursive: true });
  const keys = [...new Set(files.map((f) => f.replace(/-[1-4]?\.png$/, '').replace(/\.png$/, '')))];
  for (const key of keys) {
    const out = proofSheet(key, path.join(PROOF, `${key}.png`));
    if (out) console.log('preuve', out);
  }
  process.exit(0);
}

console.log(`${APPLY ? 'REPEINTE' : 'MESURE'} — seuil ${THRESH}, profondeur max ${MAX_DEPTH}\n`);
console.log('fichier'.padEnd(30), 'coeur', '| médianes c0..c2 | % sombre/clair (fond)  | épaisseur par arête    px');
let hit = 0, seen = 0;
for (const f of files) {
  const p = path.join(DIR, f);
  const png = PNG.sync.read(fs.readFileSync(p));
  // Losange de cellule, débord toléré (les brins d'herbe montent au-dessus de la
  // boîte). Au-delà c'est une dalle en volume : son bord n'est pas une arête de
  // cellule, le masque de losange y désignerait n'importe quoi.
  if (png.height < png.width / 2 || png.height > png.width / 2 + 12) continue;
  const diag = diagnose(png);
  if (!Number.isFinite(diag.coreMed)) continue;
  seen += 1;
  if (diag.ringMax < 0) continue;                    // silencieux : rien à dire
  hit += 1;
  const med = diag.shellMed.slice(0, 3).map((v) => String(Math.round(v)).padStart(4)).join(' ');
  const drk = diag.shellDark.slice(0, 3).map((v, i) => `${Math.round(v * 100)}/${Math.round(diag.shellClair[i] * 100)}`).join(' ');
  const aretes = QUADS.map((q, i) => `${q}${diag.ringQ[i] + 1}`).join(' ');
  let px = 0;
  if (APPLY) {
    px = repaint(png, diag);
    fs.writeFileSync(p, PNG.sync.write(png));
  } else {
    for (let i = 0; i < diag.bande.length; i += 1) if (diag.bande[i]) px += 1;
  }
  console.log(f.padEnd(30), String(Math.round(diag.coreMed)).padStart(4), '|', med, '|',
    (drk + ` (${Math.round(diag.baseDark * 100)})`).padEnd(22), '|', aretes.padEnd(19), String(px).padStart(5));
}
console.log(`\n${hit} tuiles liserées sur ${seen} examinées.${APPLY ? ' Repeintes.' : ' Rien écrit (ajouter --apply).'}`);
}
