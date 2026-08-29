// ── Préparation du pont iso stade 0 (bois) — v2 « dos plat » 2026-08-03 ─────
// Le pont sprite est UN SEUL objet 8-dir PixelLab (rampes courtes + long
// tablier central plat, arcs sous les extrémités seulement — 747a15f3). Ce
// script fabrique les PNG de jeu à partir des rotations diagonales brutes :
//   1. CISAILLEMENT global par colonne vers la pente iso ±0,5 exacte (ancré au
//      pied « footHi ») — leçon aqueduc : sans ça, marches d'escalier aux
//      coutures et bouts qui flottent au-dessus des berges.
//   2. FENÊTRE DE TRAVÉE choisie AUTOMATIQUEMENT : la plus longue fenêtre de
//      la zone centrale où le DESSOUS (yBot) est ~plat — critère qui écarte de
//      lui-même les arcs des extrémités (ils font varier yBot). C'est cette
//      fenêtre que le moteur répète (BRIDGE_SPRITES capHi/capLo la bornent).
//   3. APLATISSEMENT au pixel de la fenêtre (2e cisaillement, local, atténué
//      sur 5 px aux bords) : la répétition ne peut plus faire de festons.
//   4. Impression du bloc de specs à coller dans isoBridge.js.
// Puis : node scripts/quantize.cjs public/pixelart/iso/bridge-bois-{ne,nw}.png
// (⚠ v1 « module séparé » abandonnée — retour Raph : coupures aux jonctions ;
// les PNG bridge-bois-mid-* n'existent plus.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'public', 'pixelart', 'iso');

// Filtre de matière : `node scripts/prepBridgeIso.mjs pierre` ne (re)fabrique
// QUE ce stade — les autres PNG, retouchés main, restent intouchés.
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));

// footHi = pied du bout « l = a » (NE écran pour l'axe ne, NW pour nw),
// footLo = bout opposé — pointés sur zoom ×4 quadrillé des BRUTS (scratch).
// Bruts = objet « perfectly symmetric footbridge » f132852c (le 1er dos plat
// groupait ses deux supports du même côté — les culées ne pouvaient pas garder
// chacune son arc).
const SPECS = {
  // ⚠ ne = RETOUCHE MAIN de Raph (Aseprite, 2026-08-03) : cordes en guirlande
  // entre poteaux au pas régulier ~15 px. `retouche: true` ⇒ ni sourdine des
  // lashings ni rabat de palette (SON dessin fait foi), fenêtre FORCÉE de
  // centre de poteau à centre de poteau (les guirlandes doivent boucler), et
  // sauts de cisaillement PILE DANS les poteaux (un poteau vertical absorbe
  // 1 px de marche sans se voir ; une corde coupée en plein ventre, non).
  ne: {
    raw: 'bridge-bois-ne-retouche.png', out: 'bridge-bois-ne.png', slope: -0.5,
    retouche: true,
    // footLo.y DÉRIVÉ (yHi + 59,5) : pente forcée −0,5 → cisaillement
    // IDENTITÉ — les sauts posés sur des positions de poteaux périmées
    // marquaient une « zone » près des culées (retour Raph).
    footHi: [156, 83], footLo: [37, 142.5],
    // Garde-corps AVAL : droite des ATTACHES (haut de la guirlande) en delta
    // vs le pied redressé ; bande épaissie vers le bas (le ventre des cordes
    // pend ~9 px sous la ligne des attaches).
    rail: { xr: [50, 150], dyA: 26, s: -0.5, bandUp: 13, bandDn: 3, latestOff: -5, posts: [54, 69, 85, 100, 115, 130, 146] },
  },
  // nw = RETOUCHE MAIN aussi (2026-08-03, 2e passe de Raph). Les rambardes
  // internes suivent déjà ±0,5 (résiduel ±3 mesuré) : pente des pieds FORCÉE
  // à la pente iso → cisaillement identité, son dessin passe TEL QUEL.
  nw: {
    raw: 'bridge-bois-nw-retouche.png', out: 'bridge-bois-nw.png', slope: +0.5,
    retouche: true,
    footHi: [14, 78], footLo: [143, 142.5],
    rail: { xr: [20, 140], dyA: -21, s: +0.5, bandUp: 13, bandDn: 3, latestOff: -5, posts: [37, 52, 67, 82, 97, 112, 127] },
  },
  // ── PIERRE (bandes 2-3) — REFAITE le 2026-08-30 « à la sauce des nouveaux » ─
  // ⚠ LA v1 EST RETIRÉE, et voici pourquoi. Elle venait d'une image longue à
  // DEUX ARCHES (aseprite-pont/ref-pont-pierre-3.png, gardée en archive) dont
  // les ouvertures étaient BOUCHÉES par le pilier central du dessin — celui que
  // le LISEZMOI du kit disait justement de ne pas garder. Le fleuve ne passait
  // pas dessous : on voyait de la maçonnerie à travers les arches.
  // ⚠⚠ Et ce bouchon ne s'ôte PAS automatiquement : il est peint dans la
  // PALETTE EXACTE de l'ouvrage (teinte dominante 200,183,171, la même que le
  // corps du pont), en blocs clairs à joints sombres. Un seuil de luminance ne
  // retire que les joints et laisse un pont mité — essayé, vu, écarté. Ouvrir
  // les arches demandait un masque tracé main. Arbitrage de Raph : refaire la
  // pierre comme les trois nouvelles, donc SANS arches, plutôt que de tracer.
  // Base = la même structure validée que fer/béton/énergie (objet c2c68bc0)
  // re-matiérée en pierre de taille par `edit_image` ; la palette reste celle
  // du design que Raph avait approuvé (objet ed54edf0), donc les teintes du
  // stade pierre ne changent pas, seule la forme suit les autres.
  pierreNe: {
    winForce: [161, 237],
    raw: 'bridge-pierre-ref-detoure.png', from: 'aseprite-pont/ref-pont-pierre-v2.png',
    out: 'bridge-pierre-ne.png', slope: -0.5,
    detour: 'voisin', detourTol: 14,
    trimUnder: { a: 166.5, b: -0.400 },
    palette: [[208,192,181],[200,183,171],[212,199,190],[179,167,161],[167,155,150],[160,146,141],[154,140,136],[146,134,132],[136,125,124],[126,117,118],[118,110,112],[104,100,99],[93,87,86],[71,71,69],[56,51,48],[33,33,33],[16,15,13],[8,7,6]],
    footHi: [348, 46], footLo: [50, 165],
  },
  pierreNw: {
    winForce: [162, 238],
    raw: 'bridge-pierre-ref-detoure-mir.png', out: 'bridge-pierre-nw.png', slope: +0.5,
    palette: [[208,192,181],[200,183,171],[212,199,190],[179,167,161],[167,155,150],[160,146,141],[154,140,136],[146,134,132],[136,125,124],[126,117,118],[118,110,112],[104,100,99],[93,87,86],[71,71,69],[56,51,48],[33,33,33],[16,15,13],[8,7,6]],
    footHi: [51, 46], footLo: [349, 165],
  },
  // ── FER (4-5) · BÉTON (6) · ÉNERGIE (7-9) — 2026-08-28 ────────────────────
  // UNE SEULE STRUCTURE pour les trois : le générateur n'a tenu la projection
  // 3/4 (chaussée visible entre les deux bords) qu'une fois sur quatre — les
  // autres essais sortaient en ÉLÉVATION, inutilisables (pas de tablier où
  // marcher). L'image qui a réussi (objet c2c68bc0) sert donc de base, et les
  // deux autres matières en sont des `edit_image` « même forme, autre
  // matière » : la recette déjà éprouvée sur la pierre (bon pour la MATIÈRE,
  // mauvais pour la STRUCTURE). Les trois partagent donc la même ligne de sol
  // et la même coupe — c'est voulu : bois → pierre à arches → poutre de fer →
  // poutre de béton → poutre lumineuse se lit comme une progression d'ère.
  //
  // `trimUnder` : DEUX défauts d'un coup, et c'est le même geste.
  //   1. Le générateur plante 4 palées dans le chenal quoi qu'on lui demande
  //      (« no pillar » est une négation, il ne l'entend pas). Or rien ne doit
  //      se dresser dans l'eau à ces ères — un cargo fait 2,24 tuiles
  //      (cf. bd3c5bb, STYLES.suspended).
  //   2. Il peint aussi l'OMBRE du tablier SUR SON EAU. Cette ombre est
  //      CONNEXE à l'ouvrage : le détourage la garde comme sujet, la palette
  //      la rabat en noir, et le pont sort avec une DALLE PLEINE sous le
  //      tablier — le fleuve disparaît dessous (retour Raph, 2026-08-28).
  // La ligne est donc calée au ras du CORPS du dessin (≈ 24 px sous l'axe de
  // la chaussée, lu au dump de colonne), PAS au pied des palées : palées ET
  // ombre partent ensemble, il ne reste que l'épaisseur propre du tablier.
  // ⚠ Un premier essai ôtait l'ombre À LA TEINTE (bleu franc) après le
  // cisaillement : ça marchait sur le béton mais ça PERÇAIT LA CHAUSSÉE de
  // l'énergie (son ardoise est bleutée, B−R 23 contre 30 de seuil) et ça
  // laissait, sur le fer, des palées DÉTACHÉES flottant sous le tablier —
  // leur rouille n'est pas bleue. Écarté : une ligne géométrique décide mieux
  // qu'un seuil de couleur quand l'art et l'ombre partagent une teinte.
  // ⚠⚠ DEUXIÈME PISTE ÉCARTÉE, ET C'EST UN ARBITRAGE DE RAPH, PAS UNE
  // CONTRAINTE TECHNIQUE : garder les palées des culées et ne vider que la
  // fenêtre répétée (le moteur la reproduit, une pile dedans se répéterait
  // tous les 2,3 tuiles et supprimerait la passe navigable). Ça marchait —
  // 4,1 à 4,5 tuiles de passe libre, au-dessus des 3,4 de `passHalf` — mais
  // le dessin d'origine est asymétrique : une seule pile ressortait de l'eau,
  // l'autre tombait sur la berge et se trouvait enterrée. Verdict : « enlève
  // tous les pieds en fait ». NE PAS re-proposer les palées sans lui demander.
  // ⚠ Remonter cette ligne RACCOURCIT LE CANVAS, donc décale la ligne de sol
  // imprimée plus bas : recoller footHi/footLo/over dans isoBridge après.
  // `detour: 'voisin'` : ces images sont posées sur une EAU en dégradé + une
  // ombre portée, que le seuil au germe laissait collée sous le tablier.
  ferNe: {
    winForce: [157, 243],
    raw: 'bridge-fer-ref-detoure.png', from: 'aseprite-pont/ref-pont-fer.png',
    out: 'bridge-fer-ne.png', slope: -0.5,
    detour: 'voisin', detourTol: 14,
    trimUnder: { a: 163.5, b: -0.400 },
    // Palette = les teintes de STYLES.fer (rampe de gris froids interpolée) +
    // trois rouilles chaudes. Les noirs purs sont écartés, comme sur la pierre.
    palette: [[26,24,24],[38,36,34],[44,42,40],[47,45,43],[50,48,46],[55,52,50],[63,59,56],[71,67,63],[77,73,69],[89,85,81],[99,94,89],[105,100,94],[122,117,111],[148,144,138],[175,171,165],[196,192,186],[120,72,46],[92,54,36],[150,98,62]],
    footHi: [364, 40], footLo: [36, 171],
  },
  ferNw: {
    winForce: [156, 242],
    raw: 'bridge-fer-ref-detoure-mir.png', out: 'bridge-fer-nw.png', slope: +0.5,
    palette: [[26,24,24],[38,36,34],[44,42,40],[47,45,43],[50,48,46],[55,52,50],[63,59,56],[71,67,63],[77,73,69],[89,85,81],[99,94,89],[105,100,94],[122,117,111],[148,144,138],[175,171,165],[196,192,186],[120,72,46],[92,54,36],[150,98,62]],
    footHi: [35, 40], footLo: [363, 171],
  },
  betonNe: {
    winForce: [155, 243],
    raw: 'bridge-beton-ref-detoure.png', from: 'aseprite-pont/ref-pont-beton.png',
    out: 'bridge-beton-ne.png', slope: -0.5,
    detour: 'voisin', detourTol: 14,
    trimUnder: { a: 164.5, b: -0.401 },
    palette: [[28,28,32],[37,39,43],[54,55,59],[67,67,71],[71,71,75],[80,80,84],[90,90,94],[97,97,101],[100,100,102],[104,104,106],[116,116,118],[126,126,128],[135,135,137],[149,149,149],[154,154,153],[170,170,168],[193,193,191],[214,214,212]],
    footHi: [348, 46], footLo: [50, 165],
  },
  betonNw: {
    winForce: [156, 244],
    raw: 'bridge-beton-ref-detoure-mir.png', out: 'bridge-beton-nw.png', slope: +0.5,
    palette: [[28,28,32],[37,39,43],[54,55,59],[67,67,71],[71,71,75],[80,80,84],[90,90,94],[97,97,101],[100,100,102],[104,104,106],[116,116,118],[126,126,128],[135,135,137],[149,149,149],[154,154,153],[170,170,168],[193,193,191],[214,214,212]],
    footHi: [51, 46], footLo: [349, 165],
  },
  // ÉNERGIE : la palette garde quatre AMBRES (jamais de cyan, cf. STYLES.glow)
  // — c'est la seule matière dont le dessin porte une lumière.
  energieNe: {
    winForce: [161, 237],
    raw: 'bridge-energie-ref-detoure.png', from: 'aseprite-pont/ref-pont-energie.png',
    out: 'bridge-energie-ne.png', slope: -0.5,
    detour: 'voisin', detourTol: 14,
    trimUnder: { a: 165.4, b: -0.400 },
    palette: [[22,22,30],[39,42,54],[47,51,65],[54,55,62],[64,58,44],[69,72,82],[73,79,97],[78,84,102],[84,90,108],[99,105,123],[120,126,144],[145,151,168],[170,176,192],[214,178,108],[255,196,110],[168,132,74],[120,90,50]],
    footHi: [348, 46], footLo: [50, 165],
  },
  energieNw: {
    winForce: [162, 238],
    raw: 'bridge-energie-ref-detoure-mir.png', out: 'bridge-energie-nw.png', slope: +0.5,
    palette: [[22,22,30],[39,42,54],[47,51,65],[54,55,62],[64,58,44],[69,72,82],[73,79,97],[78,84,102],[84,90,108],[99,105,123],[120,126,144],[145,151,168],[170,176,192],[214,178,108],[255,196,110],[168,132,74],[120,90,50]],
    footHi: [51, 46], footLo: [349, 165],
  },
};

// ── DÉTOURAGE d'une image de référence (mode map_object) ────────────────────
// ⚠ `public/pixelart/iso/_orig/` est GITIGNORÉ : les bruts détourés ne sont pas
// versionnés. La chaîne doit donc pouvoir les REFABRIQUER depuis la source
// versionnée (aseprite-pont/…). Deux pièges du format map_object :
//   · le PNG téléchargé a un FOND OPAQUE malgré « background: transparent » →
//     flood fill depuis les bords, tolérance SERRÉE (à 26 le tablier beige
//     partait avec le fond et les parapets se retrouvaient à flotter) ;
//   · le générateur appose parfois un FILIGRANE dans un coin → on ne garde que
//     la plus grande composante connexe.
// `sp.detour` : 'germe' (défaut, la pierre) compare au pixel du COIN ; 'voisin'
// compare au pixel D'OÙ L'ON VIENT — un fond en dégradé (l'eau + l'ombre portée
// du pont sur cette eau) se suit alors de proche en proche, là où un seuil au
// germe laissait une dalle bleue collée sous le tablier. La marche vers le
// sujet reste largement au-dessus de la tolérance (liseré sombre).
// `sp.trimUnder` : ligne y = a + b·x sous laquelle TOUT est effacé — c'est ce
// qui retire les PALÉES du dessin (cf. SPECS, la contrainte « rien dans l'eau »).
// Posée AVANT le miroir : les deux axes en héritent.
function detourer(srcPath, outPath, mirrorPath, sp) {
  const p = PNG.sync.read(fs.readFileSync(srcPath));
  const { width: w, height: h, data } = p;
  const c0 = [data[0], data[1], data[2]];
  const tol = (sp && sp.detourTol) || 8;
  const near = (i) => Math.abs(data[i] - c0[0]) <= tol && Math.abs(data[i + 1] - c0[1]) <= tol && Math.abs(data[i + 2] - c0[2]) <= tol;
  const pas = (i, j) => Math.max(Math.abs(data[i] - data[j]), Math.abs(data[i + 1] - data[j + 1]), Math.abs(data[i + 2] - data[j + 2]));
  const voisin = sp && sp.detour === 'voisin';
  const seen = new Uint8Array(w * h), st = [];
  for (let x = 0; x < w; x += 1) { st.push([x, 0, -1], [x, h - 1, -1]); }
  for (let y = 0; y < h; y += 1) { st.push([0, y, -1], [w - 1, y, -1]); }
  while (st.length) {
    const [x, y, from] = st.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const k = y * w + x;
    if (seen[k]) continue;
    const i = k * 4;
    if (voisin ? (from >= 0 && pas(i, from) > tol) : !near(i)) continue;
    seen[k] = 1; data[i + 3] = 0;
    st.push([x + 1, y, i], [x - 1, y, i], [x, y + 1, i], [x, y - 1, i]);
  }
  const lab = new Int32Array(w * h).fill(-1);
  let best = -1, bestN = 0, id = 0;
  for (let y0 = 0; y0 < h; y0 += 1) for (let x0 = 0; x0 < w; x0 += 1) {
    const k0 = y0 * w + x0;
    if (lab[k0] >= 0 || data[k0 * 4 + 3] < 64) continue;
    const s2 = [[x0, y0]]; let n = 0;
    while (s2.length) {
      const [x, y] = s2.pop();
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const k = y * w + x;
      if (lab[k] >= 0 || data[k * 4 + 3] < 64) continue;
      lab[k] = id; n += 1;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (dx || dy) s2.push([x + dx, y + dy]);
    }
    if (n > bestN) { bestN = n; best = id; }
    id += 1;
  }
  for (let k = 0; k < w * h; k += 1) if (lab[k] >= 0 && lab[k] !== best) data[k * 4 + 3] = 0;
  // SOUS LE TABLIER : tout part. Palées ET ombre portée (cf. SPECS) — il ne
  // reste que l'épaisseur propre du tablier, et le fleuve se voit d'une berge
  // à l'autre. Une seule droite, donc aucun tri par teinte à faire.
  if (sp && sp.trimUnder) {
    const { a, b, marge = 2 } = sp.trimUnder;
    let n = 0;
    for (let x = 0; x < w; x += 1) {
      for (let y = Math.max(0, Math.ceil(a + b * x + marge)); y < h; y += 1) {
        const i = (y * w + x) * 4;
        if (data[i + 3] >= 64) { data[i + 3] = 0; n += 1; }
      }
    }
    console.log(`  sous le tablier : ${n} px ôtés sous y = ${a} ${b >= 0 ? '+' : ''}${b}·x + ${marge}`);
  }
  fs.writeFileSync(outPath, PNG.sync.write(p));
  // L'axe opposé est le MIROIR horizontal (le pont est symétrique) : la pente
  // passe de −0,5 à +0,5 sans nouvelle génération.
  const m = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const si = (y * w + x) * 4, di = (y * w + (w - 1 - x)) * 4;
    m.data[di] = data[si]; m.data[di + 1] = data[si + 1];
    m.data[di + 2] = data[si + 2]; m.data[di + 3] = data[si + 3];
  }
  fs.writeFileSync(mirrorPath, PNG.sync.write(m));
  console.log(`  détourage : ${path.basename(srcPath)} → ${path.basename(outPath)} (+ miroir)`);
}

function profiles(png) {
  const { width: w, height: h, data } = png;
  const yTop = [], yBot = [];
  for (let x = 0; x < w; x += 1) {
    let t = -1, b = -1;
    for (let y = 0; y < h; y += 1) {
      if (data[(y * w + x) * 4 + 3] >= 64) { if (t < 0) t = y; b = y; }
    }
    yTop.push(t); yBot.push(b);
  }
  return { yTop, yBot };
}

// ── Calque GARDE-CORPS AVAL : premier trait opaque par colonne ───────────────
// Corde/poteau gardés, tablier exclu (un trait qui ne commence que dans la
// moitié basse de la plage est du tablier) — dupliquer le tablier BOUCHAIT
// l'espace sous la rambarde. Sert AUSSI de base de MESURE des poteaux (appel
// sur le PNG redressé avant le choix de fenêtre).
function buildRail(png, sp, yHi3m) {
  const { width: w2, height: h2, data: d2 } = png;
  const rail = new PNG({ width: w2, height: h2 });
  const [rx0, rx1] = sp.rail.xr;
  const yL = (x) => yHi3m + sp.rail.dyA + sp.rail.s * (x - rx0);
  const bandUp = sp.rail.bandUp != null ? sp.rail.bandUp : 3;
  const bandDn = sp.rail.bandDn != null ? sp.rail.bandDn : 6;
  // latestOff : un trait qui ne COMMENCE pas avant yl+latestOff est du tablier
  // (défaut mi-bande ; pour un garde-corps à POTEAUX SEULS, viser négatif —
  // le poteau démarre bien au-dessus de sa ligne de pieds, le tablier non).
  const latestOff = sp.rail.latestOff != null ? sp.rail.latestOff : bandDn * 0.5;
  let n = 0;
  for (let x = Math.max(0, rx0); x <= Math.min(w2 - 1, rx1); x += 1) {
    const yl = yL(x);
    let y0 = Math.ceil(yl - bandUp), y1 = Math.floor(yl + bandDn);
    let latest = yl + latestOff;                 // au-delà : c'est du tablier
    for (const px of sp.rail.posts) {
      if (x >= px - 3 && x <= px + 3) {
        y0 = Math.min(y0, Math.ceil(yL(px) - 15));
        y1 = Math.max(y1, Math.floor(yL(px) + 8));
        latest = yL(px) + 6;                     // le poteau démarre plus haut
      }
    }
    let seen = false;
    for (let y = Math.max(0, y0); y <= Math.min(h2 - 1, y1); y += 1) {
      const i = (y * w2 + x) * 4;
      const op = d2[i + 3] >= 64;
      if (!seen) {
        if (!op) continue;
        if (y > latest) break;                   // premier trait trop bas : tablier
        seen = true;
      } else if (!op) break;                     // fin du premier trait : stop
      rail.data[i] = d2[i]; rail.data[i + 1] = d2[i + 1];
      rail.data[i + 2] = d2[i + 2]; rail.data[i + 3] = 255;
      n += 1;
    }
  }
  return { rail, n };
}

// Cisaillement vertical par colonne : dyAt(x) px vers le bas, canvas agrandi.
function shearBy(src, dyAt) {
  const { width: w, height: h, data } = src;
  let dyMin = 0, dyMax = 0;
  for (let x = 0; x < w; x += 1) { const d = dyAt(x); if (d < dyMin) dyMin = d; if (d > dyMax) dyMax = d; }
  const out = new PNG({ width: w, height: h + (dyMax - dyMin) });
  for (let x = 0; x < w; x += 1) {
    const d = dyAt(x) - dyMin;
    for (let y = 0; y < h; y += 1) {
      const si = (y * w + x) * 4, di = ((y + d) * w + x) * 4;
      out.data[di] = data[si]; out.data[di + 1] = data[si + 1];
      out.data[di + 2] = data[si + 2]; out.data[di + 3] = data[si + 3];
    }
  }
  return { png: out, shift: -dyMin };
}

// Escalier de cisaillement à SAUTS PLACÉS : décalage constant par tronçon,
// bornes aux MÉDIANES entre poteaux — un saut d'1 px qui tombait DANS un
// poteau ou une lisse le cassait (retour Raph « les poteaux ne sont pas
// droits ») ; entre deux poteaux, la marche se fond dans les planches.
function steppedShear(dyIdeal, posts, x0, x1, boundsAt) {
  const ps = [...(boundsAt || posts)].sort((a, b) => a - b);
  const mids = boundsAt ? ps.slice() : [];
  if (!boundsAt) for (let i = 0; i < ps.length - 1; i += 1) mids.push(Math.round((ps[i] + ps[i + 1]) / 2));
  // ⚠ bornées à [x0..x1] ET triées : une médiane hors plage rendait la suite
  // non croissante → recherche de tronçon chaotique → pont troué (vu au PNG).
  const bounds = [x0, ...mids.filter((m) => m > x0 && m <= x1), x1 + 1].sort((a, b) => a - b);
  // Décalage PRÉCALCULÉ par tronçon : MÉDIANE de dyIdeal sur ses colonnes —
  // la valeur au centre suffisait au shear linéaire, mais l'aplatissement lit
  // yBot, et UNE colonne à poussière d'alpha décalait tout son tronçon (trou).
  const offs = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const vals = [];
    for (let x = bounds[i]; x < bounds[i + 1]; x += 1) vals.push(dyIdeal(x));
    vals.sort((a, b) => a - b);
    offs.push(Math.round(vals[vals.length >> 1] || 0));
  }
  return (x) => {
    if (x < x0 || x > x1) return Math.round(dyIdeal(x));
    let i = 0;
    while (i < bounds.length - 2 && x >= bounds[i + 1]) i += 1;
    return offs[i];
  };
}

for (const [axe, sp] of Object.entries(SPECS)) {
  if (only.length && !only.some((o) => sp.out.includes(o))) continue;
  // Brut absent (clone frais : _orig est gitignoré) → le refabriquer depuis la
  // source VERSIONNÉE indiquée par .
  if (sp.from && !fs.existsSync(path.join(DIR, '_orig', sp.raw))) {
    detourer(path.join(ROOT, sp.from),
      path.join(DIR, '_orig', sp.raw),
      path.join(DIR, '_orig', sp.raw.replace('.png', '-mir.png')), sp);
  }
  const src = PNG.sync.read(fs.readFileSync(path.join(DIR, '_orig', sp.raw)));
  const [xHi, yHi] = sp.footHi, [xLo, yLo] = sp.footLo;
  const slopeSrc = (yLo - yHi) / (xLo - xHi);
  // 1) Redressement global vers la pente iso — sauts entre poteaux si connus.
  const dyIdeal = (x) => (x - xHi) * (sp.slope - slopeSrc);
  // Retouche main : sauts DANS les poteaux (ils absorbent 1 px sans se voir,
  // les guirlandes entre poteaux restent d'un seul tenant) ; sinon entre eux.
  const shearBounds = sp.retouche ? sp.rail.posts : null;
  const dyAt = sp.rail
    ? steppedShear(dyIdeal, sp.rail.posts, Math.min(xHi, xLo) - 12, Math.max(xHi, xLo) + 12, shearBounds)
    : (x) => Math.round(dyIdeal(x));
  const g1 = shearBy(src, dyAt);
  const yHi2 = yHi + g1.shift;
  // 2) Fenêtre de travée : résiduels vs la droite d'axe (r constant = plat).
  const p1 = profiles(g1.png);
  const rB = (x) => p1.yBot[x] - sp.slope * x;
  const rT = (x) => p1.yTop[x] - sp.slope * x;
  const inX0 = Math.min(xHi, xLo), inX1 = Math.max(xHi, xLo);
  // Score = largeur − décentrage : à planéité égale, une fenêtre CENTRALE
  // gagne — les culées restent équilibrées, chacune garde SON arc (le scan
  // « plus longue d'abord » collait la fenêtre contre un pied quand le dessin
  // groupait ses supports d'un côté).
  const cxPont = (inX0 + inX1) / 2;
  let win = sp.winForce ? [...sp.winForce] : null, winScore = -Infinity;
  // ── RETOUCHE : fenêtre PILE SUR LE PAS DES POTEAUX ─────────────────────────
  // Centres détectés au pixel (aval par hauteur de trait continu au-dessus de
  // la ligne des attaches, amont par les crevés du plafond yTop) ; la fenêtre
  // est la distance EXACTE entre deux poteaux aval (k pas entiers), coupes
  // posées à mi-intervalle, dans la paire la plus dégagée des DEUX familles —
  // une fenêtre non multiple du pas réel faisait dériver la phase à chaque
  // répétition (« pas pile sur les poteaux », Raph).
  if (!win && sp.retouche && sp.rail) {
    // PAS EXACT PAR AUTOCORRÉLATION du garde-corps AMONT (le yTop de la
    // travée : poteaux + rambarde, signal le plus net du dessin). La fenêtre
    // devient un multiple ENTIER de ce pas : l'erreur de phase par répétition
    // tombe sous 0,2 px — une fenêtre à ±0,5 px du multiple faisait « flotter »
    // les poteaux d'une répétition à l'autre (« pas pile », Raph).
    const z0 = Math.min(inX0, inX1) + 35, z1 = Math.max(inX0, inX1) - 30;
    const res = [];
    for (let x = z0; x <= z1; x += 1) res.push(p1.yTop[x] >= 0 ? p1.yTop[x] - sp.slope * x : 0);
    const m = res.reduce((a, b) => a + b, 0) / res.length;
    const c = res.map((v) => v - m);
    const R = (d) => {
      let s2 = 0, n2 = 0;
      for (let i = 0; i + d < c.length; i += 1) { s2 += c[i] * c[i + d]; n2 += 1; }
      return n2 ? s2 / n2 : -Infinity;
    };
    let dBest = 10, rBest = -Infinity;
    for (let d = 10; d <= 26; d += 1) { const r = R(d); if (r > rBest) { rBest = r; dBest = d; } }
    // Interpolation parabolique → pas sub-pixel.
    const r0 = R(dBest - 1), r1 = R(dBest), r2 = R(dBest + 1);
    const den = r0 - 2 * r1 + r2;
    const pas = dBest + (den !== 0 ? 0.5 * (r0 - r2) / den : 0);
    let bestK = 2, bestErr = Infinity;
    for (const k of [2, 3]) {
      const W = k * pas;
      if (W < 26 || W > 52) continue;
      const err = Math.abs(W - Math.round(W)) / k;
      if (err < bestErr) { bestErr = err; bestK = k; }
    }
    const W = Math.round(bestK * pas);
    // Coupe posée sur un CREUX du signal amont (res max = entre deux poteaux),
    // le plus proche du centre pour garder les culées équilibrées.
    let x0 = z0, sBest = -Infinity;
    for (let x = z0; x + W <= z1; x += 1) {
      const v = res[x - z0] - Math.abs(x + W / 2 - (z0 + z1) / 2) * 0.05;
      if (v > sBest) { sBest = v; x0 = x; }
    }
    win = [x0, x0 + W];
    console.log(`  pas autocorrélé = ${pas.toFixed(2)} px ; fenêtre [${win[0]}..${win[1]}] (${W} = ${bestK} pas, dérive ${(bestErr * bestK).toFixed(2)} px/rep)`);
  }
  if (!win)
  for (const [tolB, tolT, minW] of [[4, 5, 18], [6, 7, 14]]) {
    for (let w0 = inX0 + 8; w0 <= inX1 - 8 - minW; w0 += 1) {
      let w1 = w0;
      let loB = Infinity, hiB = -Infinity, loT = Infinity, hiT = -Infinity;
      while (w1 < inX1 - 8) {
        const b = rB(w1), t = rT(w1);
        if (p1.yBot[w1] < 0) break;
        const nLoB = Math.min(loB, b), nHiB = Math.max(hiB, b);
        const nLoT = Math.min(loT, t), nHiT = Math.max(hiT, t);
        if (nHiB - nLoB > tolB || nHiT - nLoT > tolT) break;
        loB = nLoB; hiB = nHiB; loT = nLoT; hiT = nHiT;
        w1 += 1;
      }
      const score = (w1 - w0) - Math.abs((w0 + w1) / 2 - cxPont) * 0.5;
      if (w1 - w0 >= minW && score > winScore) { win = [w0, w1]; winScore = score; }
    }
    if (win) break;
  }
  if (!win) { console.log(`${sp.out} : AUCUNE fenêtre plate — art à revoir`); continue; }
  const [w0, w1] = win;
  // 3) Aplatissement de la fenêtre : le dessous rejoint SA médiane, atténué aux bords.
  const meds = [];
  for (let x = w0; x < w1; x += 1) meds.push(rB(x));
  meds.sort((a, b) => a - b);
  const med = meds[meds.length >> 1];
  const flatIdeal = (x) => {
    if (x < w0 - 5 || x > w1 + 5) return 0;
    const k = x < w0 ? 1 - (w0 - x) / 5 : x > w1 ? 1 - (x - w1) / 5 : 1;
    return (med - rB(Math.max(w0, Math.min(w1 - 1, x)))) * k;
  };
  // Retouche main : AUCUN 2e cisaillement (la travée du dessin est plate à
  // ±1 px ; chaque shear de plus est une occasion de marquer une découpe).
  const g2 = sp.retouche ? { png: g1.png, shift: 0 } : shearBy(g1.png, sp.rail
    ? steppedShear(flatIdeal, sp.rail.posts, w0 - 5, w1 + 5)
    : (x) => Math.round(flatIdeal(x)));
  // SOURDINE DES LASHINGS dans la fenêtre répétée : les liens de corde dorés,
  // très contrastés, transforment la répétition en motif de papier peint dès
  // qu'on zoome (retour Raph « on voit toutes les torsades »). Dans la BANDE
  // RÉPÉTÉE seulement, l'or est rabattu vers le bois — les culées gardent leur
  // ornement, la travée devient calme. (Le quantize repasse derrière et
  // unifie ces teintes avec la palette.)
  if (!sp.retouche && sp.warm) {
    const { width: w2, data: d2 } = g2.png;
    let n = 0;
    for (let x = w0; x < w1; x += 1) {
      for (let y = 0; y < g2.png.height; y += 1) {
        const i = (y * w2 + x) * 4;
        if (d2[i + 3] < 64) continue;
        const r = d2[i], gg = d2[i + 1], b = d2[i + 2];
        if (r >= 150 && gg >= 105 && b <= 115 && r - b >= 65) {
          d2[i] = Math.round(r * 0.76); d2[i + 1] = Math.round(gg * 0.72); d2[i + 2] = Math.round(b * 0.82);
          n += 1;
        }
      }
    }
    console.log(`  lashings adoucis dans la fenêtre : ${n} px`);
  }
  // RABAT SUR LA PALETTE CHAUDE : le dessin retenu (objet 5cc3b557, « very
  // long flat deck, continuous railing ») sortait en bois PÂLE ; chaque pixel
  // est rabattu au plus proche des 13 teintes du pont v2 (objet f132852c, le
  // bois chaud jugé bon par Raph) — figées ICI pour que le prep reste
  // reproductible sans les bruts v2.
  if (!sp.retouche && sp.warm) {
    const WARM = [
      [155, 101, 69], [53, 30, 33], [164, 106, 71], [144, 93, 67],
      [119, 75, 58], [104, 64, 52], [48, 23, 28], [131, 84, 63],
      [67, 38, 38], [93, 56, 48], [86, 50, 44], [233, 169, 104],
      [201, 139, 84],
    ];
    const d2 = g2.png.data;
    for (let i = 0; i < d2.length; i += 4) {
      if (d2[i + 3] < 64) { d2[i + 3] = 0; continue; }
      let best = null, bd = Infinity;
      for (const c of WARM) {
        const dr = d2[i] - c[0], dg = d2[i + 1] - c[1], db = d2[i + 2] - c[2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; best = c; }
      }
      d2[i] = best[0]; d2[i + 1] = best[1]; d2[i + 2] = best[2]; d2[i + 3] = 255;
    }
  }

  let xHiEff = xHi, xLoEff = xLo, w0Eff = w0, w1Eff = w1, yShiftEff = 0;
  if (sp.rampStretch && sp.rampStretch !== 1) {
    const k = sp.rampStretch;
    const src2 = g2.png;
    const { width: sw, height: sh, data: sd } = src2;
    const pC = profiles(src2);
    const xsC = pC.yTop.map((t, i) => (t >= 0 ? i : -1)).filter((i) => i >= 0);
    const xMin = xsC[0], xMax = xsC[xsC.length - 1];
    const mapX = (x) => (x < w0 ? w0 - (w0 - x) * k : x > w1 ? w1 + (x - w1) * k : x);
    const off = (w0 - xMin) * (k - 1);
    const nx = (x) => mapX(x) + off;
    const dyAt2 = (x) => sp.slope * (nx(x) - x);
    let dyMin2 = Infinity, dyMax2 = -Infinity;
    for (let x = xMin; x <= xMax; x += 1) {
      const d = dyAt2(x);
      if (d < dyMin2) dyMin2 = d; if (d > dyMax2) dyMax2 = d;
    }
    const newW = Math.ceil(nx(xMax)) + 2;
    const newH = Math.ceil(sh + (dyMax2 - dyMin2)) + 2;
    const out2 = new PNG({ width: newW, height: newH });
    for (let x = xMin; x <= xMax; x += 1) {
      const a0 = Math.round(nx(x)), a1 = Math.max(a0 + 1, Math.round(nx(x + 1)));
      const dy = Math.round(dyAt2(x) - dyMin2);
      for (let cx = a0; cx < a1; cx += 1) {
        if (cx < 0 || cx >= newW) continue;
        for (let y = 0; y < sh; y += 1) {
          const si = (y * sw + x) * 4;
          if (sd[si + 3] < 64) continue;
          const cy = y + dy;
          if (cy < 0 || cy >= newH) continue;
          const di = (cy * newW + cx) * 4;
          out2.data[di] = sd[si]; out2.data[di + 1] = sd[si + 1];
          out2.data[di + 2] = sd[si + 2]; out2.data[di + 3] = 255;
        }
      }
    }
    g2.png = out2;
    xHiEff = Math.round(nx(xHi)); xLoEff = Math.round(nx(xLo));
    w0Eff = Math.round(nx(w0)); w1Eff = Math.round(nx(w1));
    yShiftEff = Math.round(dyAt2(xHi) - dyMin2);
    console.log(`  rampes ×${k} : ${sw}x${sh} → ${newW}x${newH}`);
  }
  // ── 3 bis-b) PALETTE IMPOSÉE (`palette`) ────────────────────────────────
  // Les images de référence (map_object) sortent dans un rendu pâle et lisse,
  // étranger à la DA du jeu (retour Raph : « le design était parfait » sur les
  // ponts dérivés du bois). On rabat chaque pixel sur la palette de CE design
  // validé : la forme vient de l image longue, les teintes du pont approuvé.
  if (sp.palette) {
    const d3 = g2.png.data;
    for (let i = 0; i < d3.length; i += 4) {
      if (d3[i + 3] < 64) { d3[i + 3] = 0; continue; }
      let best = null, bd = Infinity;
      for (const c of sp.palette) {
        const dr = d3[i] - c[0], dg = d3[i + 1] - c[1], db = d3[i + 2] - c[2];
        const dd = dr * dr + dg * dg + db * db;
        if (dd < bd) { bd = dd; best = c; }
      }
      d3[i] = best[0]; d3[i + 1] = best[1]; d3[i + 2] = best[2]; d3[i + 3] = 255;
    }
    console.log('  palette imposée : ' + sp.palette.length + ' teintes du design validé');
  }
  fs.writeFileSync(path.join(DIR, sp.out), PNG.sync.write(g2.png));
  // 3 bis) CALQUE GARDE-CORPS AVAL (<out>-rail.png) : DUPLICATA de la lisse et
  // des poteaux du bord aval, que le moteur redessine PAR-DESSUS les
  // traverseurs à la profondeur du bord aval — les habitants passent DERRIÈRE
  // le garde-corps du bas, devant celui du haut (retour Raph ; même modèle que
  // le parapet 'down' du pont procédural). Masque pointé sur zoom ×4 du PNG
  // FINAL : bande oblique de la lisse (suit la pente ±0,5 du redressé) +
  // rectangles verticaux des poteaux. Un duplicata ne peut pas faire de trou ;
  // il ne doit juste pas mordre le platelage où posent les pieds (bande fine).
  if (sp.rail) {
    const railOut = sp.out.replace('.png', '-rail.png');
    // CALQUE MAIN PRIORITAIRE : si Raph a peint son calque d'occlusion
    // (aseprite-pont/rail-<axe>.png, cf. LISEZMOI-RAIL), il est posé TEL QUEL
    // — l'extraction automatique n'a jamais atteint la finesse voulue
    // (« on ne les voit même pas », après 3 itérations). Sinon : génération.
    const main = path.join(ROOT, 'aseprite-pont', 'rail-' + axe + '.png');
    if (fs.existsSync(main)) {
      const painted = PNG.sync.read(fs.readFileSync(main));
      if (painted.width !== g2.png.width || painted.height !== g2.png.height) {
        console.log(`  ⚠ rail-${axe}.png : ${painted.width}x${painted.height} ≠ canvas ${g2.png.width}x${g2.png.height} — IGNORÉ (recale le canvas)`);
      } else {
        fs.writeFileSync(path.join(DIR, railOut), PNG.sync.write(painted));
        console.log('  ' + railOut + ' : calque PEINT MAIN posé tel quel');
      }
    }
    if (!fs.existsSync(path.join(DIR, railOut)) || !fs.existsSync(main)) {
      const built = buildRail(g2.png, sp, yHi2 + g2.shift);
      fs.writeFileSync(path.join(DIR, railOut), PNG.sync.write(built.rail));
      console.log('  ' + railOut + ' : ' + built.n + ' px (généré — sera remplacé par ton calque peint)');
    }
  }
  // 4) Specs moteur (coordonnées de BORD ; over = bouts du contenu +1 côté max).
  // ⚠ Coordonnées EFFECTIVES : après un rampStretch, pieds et fenêtre ont
  // bougé — tout se lit sur les variables *Eff (identiques sans étirement).
  const p2 = profiles(g2.png);
  const xs = p2.yTop.map((t, i) => (t >= 0 ? i : -1)).filter((i) => i >= 0);
  const yHi3 = yHi2 + g2.shift + yShiftEff;
  const sgn = sp.slope < 0 ? -1 : 1;
  const capHi = sgn < 0 ? xHiEff - w1Eff : w0Eff - xHiEff;
  const capLo = sgn < 0 ? w0Eff - xLoEff : xLoEff - w1Eff;
  const over = sgn < 0 ? [xs[xs.length - 1] + 1, xs[0]] : [xs[0], xs[xs.length - 1] + 1];
  const yLoStr = (yHi3 + Math.abs(xLoEff - xHiEff) * 0.5).toFixed(1).replace(/\.0$/, '');
  console.log(`${sp.out}  ${g2.png.width}x${g2.png.height}  pente=${slopeSrc.toFixed(3)}→${sp.slope}  fenêtre=[${w0Eff}..${w1Eff}] (${w1Eff - w0Eff}px)`);
  console.log(`  ${axe}: { key: '${sp.out.replace('.png', '')}', sgn: ${sgn},`);
  console.log(`    footHi: [${xHiEff}, ${yHi3}], footLo: [${xLoEff}, ${yLoStr}],`);
  console.log(`    over: [${over[0]}, ${over[1]}], capHi: ${capHi}, capLo: ${capLo} },`);
}
