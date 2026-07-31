// remapPalette.mjs — REPLI anti-bloat : ramène un sprite PixelLab sur la palette maître.
//   L'API pixflux/bitforge accepte un `color_image` (palette forcée) mais c'est un BIAIS,
//   pas un verrou — et le MCP create_map_object ne l'expose même pas. Ce script applique
//   donc le verrou DUR en post-traitement : chaque pixel est rabattu (plus proche voisin
//   en OKLab — distance perceptuelle, cf. oklab()) sur la palette UTILISABLE de l'époque
//   du sprite, puis on plafonne à K teintes.
//
//   Lancer :
//     node scripts/remapPalette.mjs <fichier.png> [--epoch <id>] [--max 22] [--inplace] [--out dir] [--dry]
//     node scripts/remapPalette.mjs --dir public/pixelart/agents [--dry]   (lot, époque auto par tag)
//              → le mode --dir saute _orig/, _archive/, splash/, palettes/, wonders/
//                (assets peints / sources / merveilles à signature or-pourpre).
//              ⚠ ui/ruins/tree-base.png (fresque peinte, ~1150 teintes) n'est PAS dans un dossier
//                exclu : ne le cible pas explicitement, l'indexer le détruirait.
//
//   • --epoch  force l'époque (feu|bois|pierre|couronne|marbre|fonte|neon|noosphere|stellaire|demiurge).
//              Sinon : déduite de spriteEpochTags (master-palette.json) d'après le nom de fichier.
//   • --max    plafond de teintes par sprite (défaut 22 ; viser 16-24).
//   • --no-accent  n'utilise que le cœur (36) — pour un sprite sans signature d'époque.
//   • --ramps a,b  restreint la cible à ces rampes du cœur (inkShadow, timberClay,
//                earthStone, clayCopper, skin, foliage, water, metalSlate, boneWhite,
//                universal). À utiliser sur un sprite MONOCHROME : sur les 36 teintes,
//                les gris froids d'un caillou tombent sur `moss`/`water` (taches
//                vert-bleu) et les brins d'herbe sur `wood-dark` (herbe rouillée).
//   • --extra "#hex,#hex"  accents saturés RÉSERVÉS (or, pourpre…) ajoutés à la cible
//                et protégés du plafond K — mode HYBRIDE (merveilles). Ex. pourpre impérial.
//   • --inplace écrase le fichier ; sinon écrit <nom>.remap.png à côté (ou dans --out).
//   • --dry    ne fait que rapporter (aucune écriture).
//   • --fringe seuil alpha sous lequel le pixel devient transparent (défaut 16) — tue le halo AA.
//   • --binary-alpha  alpha binaire : ≥128 → opaque (255), <128 → transparent (0).
//                Remplace le seuil --fringe (les sprites du jeu sont déjà à 0/255, donc no-op ;
//                utile pour durcir un sprite encore anti-aliasé).
//   • --declutter  APRÈS le remap : rabat chaque pixel ORPHELIN — aucun de ses 8 voisins
//                opaques ne partage sa couleur — sur la couleur MAJORITAIRE de son voisinage
//                (égalité tranchée en OKLab ; pixel isolé dans le vide = laissé tel quel).
//                Une seule passe : les décisions sont lues sur un instantané, pas d'itération.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

// fileURLToPath (PAS url.pathname) : avec un espace dans le chemin du projet,
// pathname garde le %20 encodé → les écritures partaient dans un répertoire
// fantôme « Civilisation%20idle » (bug corrigé 2026-07-02).
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PUB = path.join(ROOT, 'public', 'pixelart');
const PAL = JSON.parse(fs.readFileSync(path.join(PUB, 'master-palette.json'), 'utf8'));

/* ---- args ---------------------------------------------------------------- */
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !['--inplace', '--dry', '--no-accent', '--declutter', '--binary-alpha'].includes(argv[i - 1])));
const MAX = parseInt(opt('--max', '22'), 10);
const FRINGE = parseInt(opt('--fringe', '16'), 10);
const DRY = flag('--dry');
const INPLACE = flag('--inplace');
const NO_ACCENT = flag('--no-accent');
const DECLUTTER = flag('--declutter');
const BINARY = flag('--binary-alpha');
const OUTDIR = opt('--out', null);
const EPOCH_FORCE = opt('--epoch', null);
// --extra "#hex,#hex" : accents SATURÉS réservés (or, pourpre...) ajoutés à la
// cible et PROTÉGÉS du plafond K — pour la signature des merveilles (mode hybride).
const EXTRA = (opt('--extra', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
// --ramps foliage,timberClay : restreint la cible à ces rampes du cœur.
const RAMPS = (() => { const v = opt('--ramps', null); return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null; })();

const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const stemOf = (file) => path.basename(file, '.png');

// Époque d'un fichier : --epoch > tag exact > plus long tag préfixe > null.
function epochFor(file) {
  if (EPOCH_FORCE) return EPOCH_FORCE;
  const stem = stemOf(file);
  if (PAL.spriteEpochTags[stem]) return PAL.spriteEpochTags[stem];
  let best = null;
  for (const k of Object.keys(PAL.spriteEpochTags)) {
    if (stem.startsWith(k) && (!best || k.length > best.length)) best = k;
  }
  return best ? PAL.spriteEpochTags[best] : null;
}

// Sous-ensemble de rampes du cœur (--ramps). Le plus proche voisin sur les 36
// teintes du cœur est le bon défaut pour un sprite RICHE, mais il déraille sur
// un sprite MONOCHROME : les gris froids d'un caillou tombaient sur `moss` et
// `water` (taches vert-bleu), les brins d'une touffe sur `wood-dark` (herbe
// rouillée). Restreindre la cible à la rampe qui décrit la matière règle ça à
// la source — c'est un choix de matière, pas un réglage de seuil.
function rampHexes(names) {
  const out = [];
  for (const n of names) {
    const ramp = PAL.core[n];
    if (!ramp) { console.error(`--ramps : rampe inconnue « ${n} » (dispo : ${Object.keys(PAL.core).join(', ')})`); process.exit(2); }
    for (const c of ramp) out.push(c.hex);
  }
  return out;
}

// Palette cible pour une époque : cœur (+ accent sauf --no-accent) (+ accents
// RÉSERVÉS via --extra). Renvoie la palette RGB et les index PROTÉGÉS du
// plafond K (accent d'époque + extra) : la signature d'une merveille (or,
// pourpre) n'est jamais collapsée même si elle ne couvre que peu de pixels.
function targetFor(epochId) {
  const hexes = RAMPS ? rampHexes(RAMPS) : PAL.coreFlat.slice();
  const protectedIdx = new Set();
  if (!(NO_ACCENT || !epochId)) {
    const e = PAL.epochs.find((x) => x.id === epochId);
    const acc = e ? [e.accent.deep, e.accent.mid, e.accent.bright] : [];
    for (const h of acc) { protectedIdx.add(hexes.length); hexes.push(h); }
  }
  for (const h of EXTRA) { protectedIdx.add(hexes.length); hexes.push(h); }
  return { rgb: hexes.map(hexToRgb), protectedIdx };
}

// Distance perceptuelle en OKLab (Björn Ottosson). Bien plus fidèle que le
// redmean/RGB : deux teintes « proches à l'œil » le sont aussi dans l'espace.
// sRGB (0..255) -> linéaire (table 256) -> LMS -> cube root -> OKLab.
const _lin = new Float64Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; _lin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function oklab(r, g, b) {
  const R = _lin[r], G = _lin[g], B = _lin[b];
  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
  ];
}
const labDist2 = (a, b) => { const dL = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2]; return dL * dL + da * da + db * db; };
function nearestLab(targetLab, lab) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < targetLab.length; i++) { const d = labDist2(targetLab[i], lab); if (d < bd) { bd = d; bi = i; } }
  return bi;
}

// --declutter : rabat les pixels ORPHELINS (aucun voisin opaque de même couleur)
// sur la couleur majoritaire du voisinage 8-connexe. UNE seule passe : on lit un
// instantané (col) et on applique les réécritures après — aucune cascade.
// aMin = seuil d'opacité (identique à celui utilisé pour le remap).
function declutter(png, aMin) {
  const { width: W, height: H, data } = png;
  const N = W * H;
  const col = new Int32Array(N); // rgb empaqueté, ou -1 si transparent
  for (let p = 0, i = 0; p < N; p++, i += 4) {
    col[p] = data[i + 3] >= aMin ? ((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) : -1;
  }
  const writes = []; // p, rgb, p, rgb, ...
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, c = col[p];
    if (c < 0) continue;
    let shares = 0;
    const freq = new Map();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nc = col[ny * W + nx];
      if (nc < 0) continue;            // ne compter que les voisins OPAQUES
      if (nc === c) { shares++; break; } // pas orphelin : on arrête ce pixel
      freq.set(nc, (freq.get(nc) || 0) + 1);
    }
    if (shares > 0 || freq.size === 0) continue; // a un jumeau, ou seul dans le vide → intact
    // couleur majoritaire ; égalité tranchée par proximité OKLab à la couleur d'origine.
    let bestN = -1;
    const cand = [];
    for (const [nc, n] of freq) {
      if (n > bestN) { bestN = n; cand.length = 0; cand.push(nc); }
      else if (n === bestN) cand.push(nc);
    }
    let rep = cand[0];
    if (cand.length > 1) {
      const clab = oklab((c >> 16) & 255, (c >> 8) & 255, c & 255);
      let bd = Infinity;
      for (const nc of cand) { const d = labDist2(oklab((nc >> 16) & 255, (nc >> 8) & 255, nc & 255), clab); if (d < bd) { bd = d; rep = nc; } }
    }
    writes.push(p, rep);
  }
  for (let k = 0; k < writes.length; k += 2) { const i = writes[k] * 4, rgb = writes[k + 1]; data[i] = (rgb >> 16) & 255; data[i + 1] = (rgb >> 8) & 255; data[i + 2] = rgb & 255; }
  return writes.length / 2;
}

function countColors(data) {
  const s = new Set();
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] >= 128) s.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  return s.size;
}

function remapFile(file) {
  const epochId = epochFor(file);
  const { rgb: target, protectedIdx } = targetFor(epochId);
  const targetLab = target.map((t) => oklab(t[0], t[1], t[2])); // pré-calcul OKLab de la cible
  const png = PNG.sync.read(fs.readFileSync(file));
  const { data } = png;
  const before = countColors(data);
  const A_MIN = BINARY ? 128 : FRINGE; // seuil d'opacité effectif

  // 1) snap chaque pixel opaque sur la cible (index palette mémorisé).
  //    Cache rgb→index par fichier : un sprite a peu de teintes uniques, l'OKLab
  //    n'est donc calculé qu'une fois par couleur d'entrée.
  const idxOf = new Int32Array(data.length / 4).fill(-1);
  const usage = new Map();
  const cache = new Map();
  for (let p = 0, i = 0; i < data.length; i += 4, p++) {
    const a = data[i + 3];
    if (a < A_MIN) { data[i + 3] = 0; continue; } // halo AA / sous-seuil → transparent
    if (BINARY) data[i + 3] = 255;                // alpha binaire dur
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let bi = cache.get(key);
    if (bi === undefined) { bi = nearestLab(targetLab, oklab(data[i], data[i + 1], data[i + 2])); cache.set(key, bi); }
    idxOf[p] = bi;
    usage.set(bi, (usage.get(bi) || 0) + 1);
  }

  // 2) plafond K : garder les MAX teintes les plus utilisées, rabattre les autres
  //    sur la plus proche teinte CONSERVÉE.
  let collapse = null;
  if (usage.size > MAX) {
    // Les accents réservés utilisés sont gardés d'office ; le reste remplit
    // jusqu'à MAX par fréquence d'usage.
    const usedProtected = [...usage.keys()].filter((i) => protectedIdx.has(i));
    const rest = [...usage.entries()].filter(([i]) => !protectedIdx.has(i))
      .sort((a, b) => b[1] - a[1]).map(([i]) => i);
    const kept = [...usedProtected, ...rest].slice(0, Math.max(MAX, usedProtected.length));
    const keptSet = new Set(kept);
    collapse = new Map();
    for (const [i] of usage) {
      if (keptSet.has(i)) { collapse.set(i, i); continue; }
      const lab = targetLab[i];
      let bj = kept[0], bd = Infinity;
      for (const j of kept) { const d = labDist2(targetLab[j], lab); if (d < bd) { bd = d; bj = j; } }
      collapse.set(i, bj);
    }
  }

  // 3) appliquer.
  for (let p = 0, i = 0; i < data.length; i += 4, p++) {
    let bi = idxOf[p];
    if (bi < 0) continue;
    if (collapse) bi = collapse.get(bi);
    const t = target[bi];
    data[i] = t[0]; data[i + 1] = t[1]; data[i + 2] = t[2];
  }

  // 4) déparasitage optionnel (pixels orphelins) — après le remap complet.
  const orphans = DECLUTTER ? declutter(png, A_MIN) : 0;
  const after = countColors(data);

  let outPath = file;
  if (!INPLACE) {
    const stem = stemOf(file);
    // Avec --dir + --out : on RECOPIE l'arborescence sous --out (sinon collisions de noms
    // sur tout l'arbre + impossible de recopier). Fichiers positionnels : à plat dans --out.
    if (OUTDIR) outPath = dir ? path.join(OUTDIR, path.relative(dir, file)) : path.join(OUTDIR, stem + '.png');
    else outPath = path.join(path.dirname(file), stem + '.remap.png');
  }
  if (!DRY) { fs.mkdirSync(path.dirname(outPath), { recursive: true }); fs.writeFileSync(outPath, PNG.sync.write(png)); }
  const orphNote = DECLUTTER ? `· orph ${String(orphans).padStart(3)} ` : '';
  console.log(`${(epochId || 'core').padEnd(10)} ${String(before).padStart(4)} → ${String(after).padStart(3)} teintes ${orphNote} ${DRY ? '[dry] ' : ''}${path.basename(file)}${INPLACE ? '' : DRY ? '' : ' → ' + path.basename(outPath)}`);
  return { file, epochId, before, after, orphans };
}

/* ---- run ----------------------------------------------------------------- */
const dir = opt('--dir', null);
let files;
if (dir) {
  // Scan RÉCURSIF (les agents sont rangés en sous-dossiers : inhabitants/, buildings/, …).
  // Dossiers TOUJOURS ignorés (sécurité, même liste que quantize.cjs + wonders) : sources,
  // assets PEINTS non pixel-lockés, et les merveilles (leur OR/pourpre signature n'existe pas
  // dans le cœur → un snap aveugle les rabat sur du cuivre ; elles ont leur propre pipeline
  // wonders/lock-palette.cjs, ou se repassent une par une avec --extra "#or,#pourpre").
  // `ruins` = même raison, apprise à la dure : la fresque de l'Arbre des Ruines et ses 47
  // emblèmes sont du FEU, et le cœur anti-jaune n'a pas de rampe d'incandescence — la passe
  // de 913 sprites a rabattu les flammes sur de la terre cuite (#ec360f → #b06a48) et éteint
  // l'œuvre. Son pipeline est scratch/install-tree.cjs (cf. scratch/fireRamp.cjs).
  const SKIP_DIRS = ['_orig', '_archive', 'splash', 'palettes', 'wonders', 'ruins'];
  // Même leçon, au niveau du FICHIER cette fois : les feux de la cité (bandes
  // animées des scènes moteur, scènes de repli qui portent un foyer, et les 80
  // bandes de torche d'émeutier) vivent dans des dossiers qu'on remappe. La passe
  // du 2026-07-01 les a rabattus sur les rampes bois/argile/PEAU — la flamme de
  // la tour de guet était littéralement peinte en skin-lit. Ils ont leur propre
  // rampe (public/pixelart/fire-ramp.json) et leur propre outil
  // (scripts/reflame.mjs) ; la garde __tests__/flameHue.test.js tombe si on
  // repasse le remap dessus.
  const SKIP_FIRE = /(-fire\.png$|-torch-|^(?:watch-prop|ancestralcult-prop|mint-prop-forge|cult-vesta)\.png$)/;
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return SKIP_DIRS.includes(e.name) ? [] : walk(p);
    if (SKIP_FIRE.test(e.name)) return [];
    return e.name.endsWith('.png') && !e.name.endsWith('.remap.png') ? [p] : [];
  });
  files = walk(dir);
}
else files = positional;
if (!files.length) { console.error('Aucun fichier. Usage : node scripts/remapPalette.mjs <fichier.png|--dir dossier> [options]'); process.exit(1); }

const res = files.map(remapFile);
const avgB = (res.reduce((s, r) => s + r.before, 0) / res.length).toFixed(0);
const avgA = (res.reduce((s, r) => s + r.after, 0) / res.length).toFixed(0);
console.log(`\n${res.length} fichier(s) · moyenne ${avgB} → ${avgA} teintes · plafond ${MAX}${DRY ? ' · DRY (rien écrit)' : ''}`);
