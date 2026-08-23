// LE TISSU URBAIN — où c'est BÂTI, où c'est COUR, où c'est FRICHE.
//
// Extrait d'isoRenderer.js le 2026-08-23 (Q10). Un MODÈLE, pas un peintre : il ne
// dessine rien, il répond « de quoi cette cellule est-elle faite ? ». Les cellules
// porteuses d'une emprise, le voisinage bâti à 8, et le champ de cour — le quartier,
// sa couronne de terre, et la friche au-delà.
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Couture mesurée avant la coupe :
// ZÉRO dépendance entrante, cinq sortantes. Vérifiée ligne à ligne contre la
// version commitée.
//
// ⚠ SA PLACE ÉTAIT DÉJÀ ICI, pas dans le peintre : `tissuMetrics.js` importait
// `courField` DEPUIS isoRenderer — un module de mesure qui allait chercher son
// modèle dans un renderer de 6 000 lignes. Il lit maintenant une feuille.
//
// ⚠ Il débloque les CLÔTURES, dont `COUR` était la seule dépendance entrante vers
// le peintre, et allège le MOBILIER DE TROTTOIR (4 de ses 10 fils partent d'ici).
//
// ⚠ Le seul import est `CM`, et il ne sert qu'à la molette `__cour` : invalider le
// bake quand on change le réglage en jeu.
import { CM } from '../layout.js';

export function builtCells(L) {
  if (L._builtCells) return L._builtCells;
  const s = new Set();
  for (const t of (L.tiles || [])) {
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let ax = 0; ax < sx; ax += 1) {
      for (let ay = 0; ay < sy; ay += 1) s.add((t.gx + ax) + ',' + (t.gy + ay));
    }
  }
  L._builtCells = s;
  return s;
}
// Cette cellule a-t-elle une FAÇADE à desservir ? (les 8 voisines, diagonales
// comprises — cf. le § de la partition du trottoir.) C'est ce qui distingue une
// RUE d'une simple voie de passage : sans bâtiment autour, pas de trottoir, donc
// ni marche, ni bordure, ni mobilier. Mémoïsé par layout comme `builtCells`.
const BUILT_NEAR8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export function builtNear(L, gx, gy) {
  const b = builtCells(L);
  if (!b.size) return true;            // pas de bâti connu (tests, plan vide) : on ne prive de rien
  let m = L._builtNear8;
  if (!m) { m = new Map(); L._builtNear8 = m; }
  const k = gx + ',' + gy;
  const hit = m.get(k);
  if (hit !== undefined) return hit;
  let near = false;
  for (const [dx, dy] of BUILT_NEAR8) {
    if (b.has((gx + dx) + ',' + (gy + dy))) { near = true; break; }
  }
  m.set(k, near);
  return near;
}
/* ── COUR ET FRICHE : le lot vide cesse d'être minéral (lot L2) ───────────────
 * docs/PLAN-TISSU-URBAIN.md. Le grief de Raph était « des gros micmacs de
 * routes » ; la mesure (tissuMetrics, lot L0) dit autre chose. Sur une ville de
 * 1 528 bâtiments, band 4 : voirie 30,8 %, bâti 22,0 %, **vide 47,2 %**. Les
 * routes ne sont pas trop nombreuses — c'est le VIDE qui est la plus grande
 * surface de la ville, et comme `kindAt` ne connaissait que urban/grass, ce vide
 * portait exactement la matière minérale d'une cellule bâtie. La ville se lit
 * donc comme une nappe de pierre où les rues ne sont qu'un motif.
 *
 * Le vide n'est pas d'un seul tenant, et c'est ce qui commande la règle. Mesuré
 * par distance au bâti le plus proche : 29 % à une cellule (l'arrière-cour d'un
 * bâtiment), 18 % à deux ou trois, **43 % à cinq et plus** (des étendues que la
 * ville n'a jamais atteintes — `urbanSet` vient d'un RAYON dérivé des compteurs,
 * pas de ce qui est bâti). Une seule matière pour les deux serait un contresens :
 *   d ≤ near  → `urban`  le sol pavé du bâti et de son devant de parcelle
 *   d ≤ far   → `dirt`   la cour de terre battue, l'arrière du lot
 *   au-delà   → `grass`  la friche : la ville n'est pas arrivée là
 * On obtient le dégradé qu'une vraie ville a toujours, et la cité gagne enfin un
 * BORD au lieu de s'étaler en disque minéral jusqu'à la limite des compteurs.
 *
 * ⚠ Aucun de ces deux kinds n'est nouveau : `dirt` et `grass` ont déjà toute
 * leur plomberie (tuile, texAlpha, frange d'herbe, voile). On ne change QUE la
 * cellule à qui on les donne. C'est ce qui rend le lot petit.
 * Réglage live : `__cour(false)` rend la ville minérale d'avant, `__cour({near,
 * far, sidewalk})` déplace les contours.
 * -------------------------------------------------------------------------- */
/* ── v2, 2026-07-30 : QUARTIERS, pas confetti ────────────────────────────────
 * Retour de Raph sur une mégalopole : « on n'a plus de quartier, et le retour des
 * multiples petits carrés de sol entre les routes ». Mesuré sur la ville qui a
 * produit ce retour : **364 taches de cour, médiane 1 cellule, 64 % d'une ou deux
 * cellules**.
 *
 * ⚠ LA CAUSE N'EST PAS CELLE QU'ON CROIT, et je m'y suis trompé une fois avant
 * d'écrire ceci. Ce n'est pas que le seuil « bavait » d'une cellule à l'autre :
 * c'est que **le réseau viaire découpe déjà le sol en petits blocs**. Entre deux
 * rues il n'y a qu'une à quatre cellules. Dès lors, toute matière qui change d'un
 * bloc au bloc voisin se lit comme un carré isolé, même si le champ qui la décide
 * est parfaitement lisse à l'échelle de la cellule. Le confetti est un effet de la
 * TRAME DES RUES, pas du bruit du critère.
 *
 * Corollaire, et c'est lui qui dicte la solution : la matière doit varier À UNE
 * ÉCHELLE PLUS GRANDE QUE LE BLOC. Un critère local — distance au bâti, fermeture
 * morphologique — ne peut pas y arriver, parce qu'il change justement à l'échelle
 * du bloc. (Essayé : une fermeture de rayon 2 sur des bâtiments PONCTUELS les
 * restitue à l'identique, elle ne soude rien. La dilatation ajoute, l'érosion
 * reprend exactement autant.)
 *
 * v2 décide donc sur la DENSITÉ BÂTIE LISSÉE : pour chaque cellule, la part de
 * sol bâti dans un carré de rayon `scale`. Un champ moyenné sur 6 cellules varie
 * lentement, donc deux blocs voisins reçoivent presque toujours la même matière,
 * et les frontières deviennent de grandes courbes — des QUARTIERS. Seuils :
 * au-dessus de `coreDens` c'est le quartier bâti (pavé), au-dessus de `ringDens`
 * son faubourg (terre), en dessous la friche.
 *
 * Une passe finale ABSORBE toute tache plus petite que `minPatch`. Ce n'est pas
 * une ceinture de plus : c'est la seule formulation qui rende le grief de Raph
 * VÉRIFIABLE (« aucune tache en dessous de N »), là où « ça fait moins de
 * confetti » ne se teste pas.
 * -------------------------------------------------------------------------- */
// Les seuils sont calés sur la densité MESURÉE des villes du jeu : une mégalopole
// tourne autour de 8 à 11 % de sol bâti (2 242 emprises sur 21 024 cellules pour
// la dense, 1 713 pour la clairsemée). `coreDens` doit donc mordre un peu en
// dessous de cette moyenne, sinon les bords d'un pâté pourtant dense — dont la
// fenêtre de lissage déborde sur le vide — retomberaient en cour.
export const COUR = { on: true, scale: 6, coreDens: 0.07, ringDens: 0.02, minPatch: 10, sidewalk: true };
const ORTHO4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/**
 * Matière de chaque cellule de sol de ville : `urban` (le quartier), `dirt` (sa
 * couronne de cour), `grass` (la friche). Pure et exportée — c'est elle qui
 * décide de l'aspect de la moitié de la ville, et la garde la mesure en TACHES.
 */
export function courField(urbanSet, builtSet, cfg = COUR) {
  const kind = new Map();
  if (!cfg.on) { for (const k of urbanSet) kind.set(k, 'urban'); return kind; }
  // ── 1. DENSITÉ BÂTIE LISSÉE, par table de sommes préfixées ────────────────
  // Part de sol bâti dans le carré de rayon `scale` autour de chaque cellule.
  // La table de sommes rend le calcul indépendant de `scale` : quatre lectures
  // par cellule, quel que soit le rayon. Sans elle, un rayon 6 coûterait 169
  // lectures par cellule sur 20 000 cellules à chaque recompute.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const k of urbanSet) {
    const c = k.indexOf(',');
    const gx = +k.slice(0, c), gy = +k.slice(c + 1);
    if (gx < x0) x0 = gx; if (gx > x1) x1 = gx;
    if (gy < y0) y0 = gy; if (gy > y1) y1 = gy;
  }
  if (x1 < x0) return kind;
  const scale = Math.max(1, cfg.scale | 0);
  const W = x1 - x0 + 1, H = y1 - y0 + 1;
  const sum = new Int32Array((W + 1) * (H + 1));
  for (const k of builtSet) {
    const c = k.indexOf(',');
    const gx = +k.slice(0, c) - x0, gy = +k.slice(c + 1) - y0;
    if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
    sum[(gy + 1) * (W + 1) + gx + 1] = 1;
  }
  for (let y = 1; y <= H; y += 1) {
    for (let x = 1; x <= W; x += 1) {
      sum[y * (W + 1) + x] += sum[(y - 1) * (W + 1) + x] + sum[y * (W + 1) + x - 1] - sum[(y - 1) * (W + 1) + x - 1];
    }
  }
  const dens = (gx, gy) => {
    const ax = Math.max(0, gx - x0 - scale), ay = Math.max(0, gy - y0 - scale);
    const bx = Math.min(W - 1, gx - x0 + scale), by = Math.min(H - 1, gy - y0 + scale);
    if (bx < ax || by < ay) return 0;
    const n = sum[(by + 1) * (W + 1) + bx + 1] - sum[ay * (W + 1) + bx + 1]
      - sum[(by + 1) * (W + 1) + ax] + sum[ay * (W + 1) + ax];
    return n / ((bx - ax + 1) * (by - ay + 1));
  };
  // ── 2. SEUILS. Le bâti reste toujours pavé : un quartier d'une seule maison
  //    au milieu des champs garde son sol, on ne repeint pas sous ses murs.
  for (const k of urbanSet) {
    if (builtSet.has(k)) { kind.set(k, 'urban'); continue; }
    const c = k.indexOf(',');
    const d = dens(+k.slice(0, c), +k.slice(c + 1));
    kind.set(k, d >= cfg.coreDens ? 'urban' : d >= cfg.ringDens ? 'dirt' : 'grass');
  }
  // ── 3. ABSORPTION DES MIETTES. Un champ lissé laisse quand même des îlots là
  //    où il frôle un seuil ; ce sont EUX que Raph voit. Toute tache sous
  //    `minPatch` rejoint la matière qui la borde le plus. Le bâti n'est jamais
  //    absorbé.
  const minPatch = Math.max(1, cfg.minPatch | 0);
  if (minPatch > 1) {
    const seen = new Set();
    for (const start of urbanSet) {
      if (seen.has(start)) continue;
      const kd = kind.get(start);
      const comp = [start];
      seen.add(start);
      const bord = new Map();
      for (let i = 0; i < comp.length; i += 1) {
        const c = comp[i].indexOf(',');
        const gx = +comp[i].slice(0, c), gy = +comp[i].slice(c + 1);
        for (const [dx, dy] of ORTHO4) {
          const nk = (gx + dx) + ',' + (gy + dy);
          if (!urbanSet.has(nk)) continue;
          const nkd = kind.get(nk);
          if (nkd === kd) { if (!seen.has(nk)) { seen.add(nk); comp.push(nk); } }
          else bord.set(nkd, (bord.get(nkd) || 0) + 1);
        }
      }
      if (comp.length >= minPatch || !bord.size) continue;
      // …sauf une tache qui porte du bâti : un quartier d'une seule maison reste
      // un quartier, on ne va pas repeindre le sol sous ses murs.
      if (comp.some((k) => builtSet.has(k))) continue;
      let best = null, bestN = -1;
      for (const [nkd, n] of bord) if (n > bestN) { best = nkd; bestN = n; }
      for (const k of comp) kind.set(k, best);
    }
  }
  return kind;
}
// Ton moyen MESURÉ de `iso-dirt` : l'aplat de repli d'une cour doit rester dans
// la famille de la tuile qui le recouvre, sinon le sol saute au décodage du PNG.
// (Avant ce lot, `dirt` retombait sur le ton URBAIN — le kind n'était plus
// produit, personne ne voyait le décalage.)
export const DIRT_TONE = [169, 125, 88];
// Champ de matières du sol de ville, mémoïsé sur le layout (les tuiles sont
// reconstruites à chaque recompute, le cache se périme donc tout seul).
export function courOf(L) {
  if (!L._courField) L._courField = courField(L.urbanSet || new Set(), builtCells(L));
  return L._courField;
}
if (typeof window !== 'undefined') {
  // Molette cour/friche : __cour(false) rend la nappe minérale d'avant le lot ;
  // __cour({near,ring,minPatch,sidewalk}) règle la morphologie — near = rayon de
  // fermeture (soude les bâtiments d'un même pâté et bouche les trous plus
  // petits que 2·near), ring = largeur de la couronne de cour, minPatch = taille
  // en dessous de laquelle une tache est absorbée. Rebake immédiat.
  window.__cour = (arg) => {
    if (arg === false) COUR.on = false;
    else if (arg && typeof arg === 'object') { COUR.on = true; Object.assign(COUR, arg); }
    else COUR.on = true;
    if (CM.layout) CM.layout._courField = null;
    CM._isoGroundBake = null;
    return { ...COUR };
  };
}
