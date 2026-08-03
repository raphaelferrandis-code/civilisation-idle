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
};

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
  if (!sp.retouche) {
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
  if (!sp.retouche) {
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
  const p2 = profiles(g2.png);
  const xs = p2.yTop.map((t, i) => (t >= 0 ? i : -1)).filter((i) => i >= 0);
  const yHi3 = yHi2 + g2.shift;
  const sgn = sp.slope < 0 ? -1 : 1;
  const capHi = sgn < 0 ? xHi - w1 : w0 - xHi;
  const capLo = sgn < 0 ? w0 - xLo : xLo - w1;
  const over = sgn < 0 ? [xs[xs.length - 1] + 1, xs[0]] : [xs[0], xs[xs.length - 1] + 1];
  const yLoStr = (yHi3 + Math.abs(xLo - xHi) * 0.5).toFixed(1).replace(/\.0$/, '');
  console.log(`${sp.out}  ${g2.png.width}x${g2.png.height}  pente=${slopeSrc.toFixed(3)}→${sp.slope}  fenêtre=[${w0}..${w1}] (${w1 - w0}px)`);
  console.log(`  ${axe}: { key: 'bridge-bois-${axe}', sgn: ${sgn},`);
  console.log(`    footHi: [${xHi}, ${yHi3}], footLo: [${xLo}, ${yLoStr}],`);
  console.log(`    over: [${over[0]}, ${over[1]}], capHi: ${capHi}, capLo: ${capLo}, capOver: 11 },`);
}
