// sewerOutfall.mjs — la SORTIE des stations d'égouts, repeinte sur les sprites.
//
//   Un égout AVALE, il ne recrache pas. Ce que ces cinq sprites doivent montrer,
//   c'est donc un TUYAU QUI RENTRE DANS LE SOL — pas de l'eau à ciel ouvert.
//
//   Historique, parce qu'il coûte cher à refaire (2026-08-05, trois passes) :
//     1. À l'origine, chaque stade portait une flaque isolée, sans amont ni aval —
//        stade 0 un filet peint dans la rampe de l'HERBE (invisible hors mouvement),
//        stade 1 une flaque bleue à côté d'une arche sèche PLUS une seconde eau
//        posée par le code ailleurs, stades 2 et 3 rien, band 4 un bassin turquoise
//        (la teinte de l'eau PROPRE de l'aqueduc). Retour Raph : « l'écoulement
//        n'est pas logique ».
//     2. Réponse n°1 : un caniveau à ciel ouvert, bouche → lit → sortie du socle.
//        Retour : « la petite gouttière ne va pas, étrange par rapport à la grande
//        porte de sortie » → la sortie a été redimensionnée sur la bouche (seuil
//        remplissant la voûte + lit large).
//     3. Retour final, celui qui tranche : « c'est vraiment le fait d'avoir de
//        l'eau qui sort qui est bizarre. Il faudrait juste un tuyau qui rentre
//        dans le sol. » ⛔ NE PAS REPROPOSER d'eau de surface aux égouts, sous
//        aucune forme — ni caniveau, ni flaque, ni filet. La leçon vaut au-delà du
//        pixel : c'est la FONCTION du bâtiment qui dicte la scène, et un réseau
//        d'évacuation se raconte par ce qui DISPARAÎT sous terre.
//
//   Ce que le script pose donc, et rien d'autre :
//     • un conduit (`duct`) DEBOUT au pied du bâtiment, qui descend le long du mur
//       et s'enfonce dans le terrain, avec son coude en haut, son ombre portée sur
//       la façade et un col de terre remuée au point d'entrée ;
//     • la matière du conduit suit l'époque (pierre sèche → pierre → fonte → béton) ;
//     • l'effacement des flaques d'origine qui n'ont plus lieu d'être.
//   Aucune animation : il n'y a plus rien qui bouge, les bandes `-flow` ont été
//   retirées avec l'eau.
//
//   ⚠ Le script repeint les PNG INSTALLÉS. Il lit donc ses entrées dans
//   scripts/data/sewers-base/ (copie vierge d'avant tout ça), JAMAIS la sortie —
//   sans quoi un second passage peindrait par-dessus son propre conduit, qui
//   grossirait à chaque exécution. Rejouable à l'octet près.
//
//   Lancer :  node scripts/sewerOutfall.mjs
//             node scripts/sewerOutfall.mjs --preview   (survol magenta du tracé,
//                                                        rien d'écrit dans public/)
//   Sortie  : public/pixelart/agents/buildings/sewers-<stade>.png
//
//   Couleurs : toutes prises dans public/pixelart/master-palette.json (cœur partagé)
//   ou dans la palette propre au sprite, donc aucun remap à repasser derrière — et
//   le verrou 16-24 teintes/sprite tient (contrôlé et affiché en fin d'exécution).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC_DIR = path.join(HERE, 'data', 'sewers-base');
const OUT_DIR = path.join(ROOT, 'public', 'pixelart', 'agents', 'buildings');
const PREVIEW = process.argv.includes('--preview');
const PREVIEW_DIR = process.env.SEWER_PREVIEW_DIR || path.join(ROOT, '.sewer-preview');

const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ── Le conduit, sprite par sprite ────────────────────────────────────────────
// at     : [x, y] du HAUT du tuyau, contre le mur. Le bas doit tomber DANS le sol,
//          pas au-dessus : un tuyau qui s'arrête en l'air se lit comme cassé.
// h, w   : hauteur et largeur (w = 4 ; à 3 le cylindre n'a plus d'arête, à 5 c'est
//          une colonne).
// elbow  : coude d'entrée dans le mur en haut, signé (+ vers la droite).
// tube   : [arête claire, corps, arête sombre] — lumière du haut-gauche.
// shadow : ombre portée du tuyau sur la façade, du côté opposé à la lumière.
// soil   : terre remuée du col d'entrée, prise dans le sol du sprite.
// flange : bague de raccord à mi-hauteur (fonte, béton — pas la pierre sèche).
// ⚠ Toutes ces teintes se prennent dans la palette DÉJÀ présente sur le sprite :
// le conduit n'ajoute aucune couleur, donc aucun remap ne peut le désolidariser
// de son bâtiment et le verrou 16-24 teintes ne bouge pas d'un cran.
// ⛔ `sewers-prop` N'EST PLUS DANS CETTE TABLE, et n'y reviendra pas : le stade 0
// a été REGÉNÉRÉ (PixelLab, 2026-08-05) en puits à grille — l'objet porte son
// propre signal, il n'a plus rien à recevoir en post. L'y laisser écraserait le
// nouveau sprite par l'ancienne hutte au prochain passage, puisque le script
// peint À PARTIR de scripts/data/sewers-base/. Chaque stade quitte cette table le
// jour où il est regénéré ; quand elle sera vide, ce fichier et sewers-base/
// partent avec.
const SPRITES = {
  // ── Stade 1 — drainage médiéval. La flaque bleue du sprite d'origine est
  // EFFACÉE (`erase`) et rebouchée avec son voisinage : c'était l'eau la plus
  // visible des cinq, et c'est exactement ce qui n'a pas lieu d'être.
  'sewers-medieval': {
    erase: ['#5085b2', '#478ec4'],
    duct: {
      at: [46, 52], h: 16, w: 4, elbow: +2,
      tube: ['#d7c8b5', '#534632', '#0e0c18'], soil: '#3e191c', shadow: '#bf987c',
    },
  },
  // ── Stade 2 — station à vapeur : conduite de FONTE, la seule à mériter une
  // bride visible (`flange`) au sortir du mur. Le mur de brique s'arrête à x≈24,
  // le conduit part donc de x=28 — plus à gauche il flotterait sur le pavage.
  'sewers-works': {
    duct: {
      at: [30, 48], h: 15, w: 4, elbow: -2, flange: true,
      tube: ['#91817e', '#3d3335', '#17120d'], soil: '#2c1a13', shadow: '#883e32',
    },
  },
  // ── Stade 3 — station d'épuration : buse de béton, même grammaire.
  'sewers-plant': {
    duct: {
      at: [76, 46], h: 17, w: 4, elbow: +2, flange: true,
      tube: ['#d6c4b8', '#55453c', '#1d1f21'], soil: '#373d42', shadow: '#9f9286',
    },
  },
  // ── Band 4 — station romaine. Le bassin turquoise faisait PARTIE du sprite
  // PixelLab d'origine (ce n'était pas un ajout d'ici), mais c'était l'eau de
  // surface la plus voyante des cinq : il part avec les autres. Ses 425 px sont
  // au BORD du socle, donc l'effacement ne creuse pas de trou — le bâtiment
  // retombe proprement sur sa terrasse de pierre (vérifié au rendu).
  'sewers-classical': {
    erase: ['#3c7388', '#93c1b1', '#71d6cf', '#74d9d1', '#87e4dd'],
    duct: {
      at: [52, 48], h: 16, w: 4, elbow: -2,
      tube: ['#e2c190', '#6d4042', '#422a27'], soil: '#422a27', shadow: '#af8b78',
    },
  },
};

// ── Utilitaires image ────────────────────────────────────────────────────────
const px = (im, x, y) => (y * im.width + x) * 4;
const inside = (im, x, y) => x >= 0 && y >= 0 && x < im.width && y < im.height;
function put(im, x, y, rgb, a = 255) {
  if (!inside(im, x, y)) return;
  const i = px(im, x, y);
  im.data[i] = rgb[0]; im.data[i + 1] = rgb[1]; im.data[i + 2] = rgb[2]; im.data[i + 3] = a;
}
const at = (im, x, y) => {
  if (!inside(im, x, y)) return null;
  const i = px(im, x, y);
  return im.data[i + 3] < 20 ? null : [im.data[i], im.data[i + 1], im.data[i + 2]];
};
const hexAt = (im, x, y) => {
  const c = at(im, x, y);
  return c ? '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('') : null;
};

// Bouche-trou : rend à un pixel effacé la teinte DOMINANTE de son voisinage
// encore peint. Sert à retirer une flaque sans laisser un trou — la couleur de
// remplissage n'est jamais écrite en dur, elle vient du sprite lui-même.
function inpaint(im, holes) {
  const trou = new Set(holes.map(([x, y]) => x + ',' + y));
  const rendu = new Map();
  for (const [x, y] of holes) {
    const vote = new Map();
    for (let r = 1; r <= 3 && vote.size === 0; r += 1) {
      for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (trou.has((x + dx) + ',' + (y + dy))) continue;
        const c = at(im, x + dx, y + dy);
        if (!c) continue;
        vote.set(c.join(','), (vote.get(c.join(',')) || 0) + 1);
      }
    }
    if (vote.size) rendu.set(x + ',' + y, [...vote].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number));
  }
  for (const [x, y] of holes) {
    const c = rendu.get(x + ',' + y);
    if (c) put(im, x, y, c); else put(im, x, y, [0, 0, 0], 0);
  }
}

// ── Le conduit ───────────────────────────────────────────────────────────────
// Le tuyau est DEBOUT : il descend le long du pied du bâtiment et s'enfonce.
//
// ⚠ Une version COUCHÉE au sol (le tuyau part du mur et court sur le terrain en
// pente iso avant d'être enfoui) a été peinte puis rejetée : à 3 rangs sur un sol
// texturé, un cylindre horizontal ne se lit plus comme un tuyau mais comme une
// brindille ou une rayure. Debout, il coupe le plan de sol au lieu de s'y fondre,
// et sa rencontre avec le terrain devient un ÉVÉNEMENT lisible. C'est cette
// rencontre qui raconte « ça rentre dans le sol », pas la longueur du tuyau.
//
// at   : [x, y] du HAUT du tuyau, contre le mur.
// h    : hauteur. w : largeur (3 ou 4 px — au-delà ça devient une colonne).
// tube : [arête claire, corps, arête sombre] — lumière du haut-gauche, donc la
//        colonne de gauche capte et celle de droite tombe dans l'ombre.
// elbow: coude d'entrée dans le mur, en haut (2 px vers le bâtiment).
function ductPixels(d) {
  const { at: [ax, ay], h, w } = d;
  const out = [];
  for (let j = 0; j < h; j += 1) {
    for (let k = 0; k < w; k += 1) {
      // dernière rangée : déjà dans la terre, on ne la pose pas
      if (j === h - 1 && (k === 0 || k === w - 1)) continue;
      out.push({ x: ax + k, y: ay + j, k, j, col: k === 0 ? 0 : k === w - 1 ? 2 : 1 });
    }
  }
  if (d.elbow) {
    const s = Math.sign(d.elbow);
    for (let k = 1; k <= Math.abs(d.elbow); k += 1) {
      out.push({ x: ax + (s > 0 ? w - 1 + k : -k), y: ay, k: 0, j: 0, col: 0 });
      out.push({ x: ax + (s > 0 ? w - 1 + k : -k), y: ay + 1, k: 1, j: 0, col: 2 });
    }
  }
  return out;
}
const ductTone = (d, p) => d.tube[p.col];

// Col d'entrée : la terre remuée autour du point où le tuyau s'enfonce. Une
// lèvre d'un pixel qui déborde de chaque côté suffit — plus, ça fait un tas ;
// moins, et le tuyau a l'air coupé au ras du sol.
function collarPixels(d) {
  const { at: [ax, ay], h, w } = d;
  const y = ay + h - 1;
  const out = [];
  for (let k = -1; k <= w; k += 1) out.push([ax + k, y]);
  out.push([ax - 1, y - 1], [ax + w, y - 1]);
  return out;
}

// ── Peinture d'un sprite ─────────────────────────────────────────────────────
function paint(key, cfg) {
  const src = PNG.sync.read(fs.readFileSync(path.join(SRC_DIR, key + '.png')));
  const teintesAvant = new Set();
  for (let i = 0; i < src.data.length; i += 4) if (src.data[i + 3] >= 20) teintesAvant.add(src.data[i] + ',' + src.data[i + 1] + ',' + src.data[i + 2]);

  const out = new PNG({ width: src.width, height: src.height });
  src.data.copy(out.data);

  // 1) flaque qui n'a plus lieu d'être : effacée puis rebouchée
  if (cfg.erase) {
    const cible = new Set(cfg.erase);
    const holes = [];
    for (let y = 0; y < out.height; y += 1) for (let x = 0; x < out.width; x += 1) {
      const h = hexAt(out, x, y);
      if (h && cible.has(h)) holes.push([x, y]);
    }
    inpaint(out, holes);
  }

  // 2) bassin d'origine : repeint teinte par teinte, table posée à la main
  if (cfg.recolor) {
    for (let y = 0; y < out.height; y += 1) for (let x = 0; x < out.width; x += 1) {
      const h = hexAt(out, x, y);
      if (h && cfg.recolor[h]) put(out, x, y, hex2rgb(cfg.recolor[h]));
    }
  }

  // 3) le conduit — col d'abord, tuyau par-dessus (le tuyau passe DEVANT la terre
  //    qu'il soulève, sauf sur ses derniers rangs déjà mangés par l'enfouissement)
  const d = cfg.duct;
  if (d) {
    // Ombre portée sur le mur, du côté opposé à la lumière. Sans elle le tuyau
    // reste À PLAT dans la façade : sur un mur pâle son arête claire vaut le
    // crépi, il ne reste que le corps sombre et ça se lit comme une poutre ou
    // une trace. L'ombre est posée sur ce qui est DÉJÀ peint — jamais dans le
    // vide, sinon elle élargirait la silhouette du sprite.
    if (d.shadow) {
      for (let j = 0; j < d.h - 1; j += 1) {
        const x = d.at[0] + d.w, y = d.at[1] + j;
        if (at(out, x, y)) put(out, x, y, hex2rgb(d.shadow));
      }
    }
    for (const [x, y] of collarPixels(d)) put(out, x, y, hex2rgb(d.soil));
    // Bride de raccord au mur (fonte / béton) : un rang plus large au pas 0.
    // Bride de raccord (fonte / beton) : une bague a mi-hauteur.
    if (d.flange) for (let k = -1; k <= d.w; k += 1) put(out, d.at[0] + k, d.at[1] + Math.floor(d.h * 0.45), hex2rgb(d.tube[k <= 0 ? 0 : 2]));
    for (const p of ductPixels(d)) put(out, p.x, p.y, hex2rgb(ductTone(d, p)));
  }

  const teintesApres = new Set();
  for (let i = 0; i < out.data.length; i += 4) if (out.data[i + 3] >= 20) teintesApres.add(out.data[i] + ',' + out.data[i + 1] + ',' + out.data[i + 2]);
  console.log(`${key.padEnd(18)} ${teintesAvant.size} → ${teintesApres.size} teintes${teintesApres.size > 24 ? '  DÉPASSE 24' : ''}`);
  if (teintesApres.size > 24) throw new Error(key + ' : ' + teintesApres.size + ' teintes, le verrou palette est à 24');
  return out;
}

// ── Survol : tracé du conduit en magenta sur le sprite d'origine ─────────────
function preview(key, cfg) {
  const src = PNG.sync.read(fs.readFileSync(path.join(SRC_DIR, key + '.png')));
  if (cfg.duct) {
    for (const [x, y] of collarPixels(cfg.duct)) put(src, x, y, [255, 220, 0]);
    for (const p of ductPixels(cfg.duct)) put(src, p.x, p.y, p.dernier ? [0, 220, 255] : [255, 0, 200]);
  }
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  fs.writeFileSync(path.join(PREVIEW_DIR, key + '-preview.png'), PNG.sync.write(src));
}

// ── Exécution ────────────────────────────────────────────────────────────────
if (!fs.existsSync(SRC_DIR)) throw new Error('Sources vierges absentes : ' + SRC_DIR);
for (const [key, cfg] of Object.entries(SPRITES)) {
  if (PREVIEW) { preview(key, cfg); continue; }
  fs.writeFileSync(path.join(OUT_DIR, key + '.png'), PNG.sync.write(paint(key, cfg)));
}
console.log(PREVIEW ? 'Survol écrit dans ' + PREVIEW_DIR : 'Conduits repeints (aucune eau de surface, aucune bande animée).');
