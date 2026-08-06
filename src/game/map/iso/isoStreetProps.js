"use strict";
// ============================================================================
// isoStreetProps.js — LE MOBILIER DE TROTTOIR (« ils sont vides », Raph 2026-08-05).
//
//   C'est le lot L7 du plan tissu urbain (« habillage de bord »), tenu en
//   réserve jusqu'ici parce qu'il ne se pose qu'une fois la rue FORMÉE : de la
//   vie de rue versée sur un tracé qui bruite déjà, c'est du bruit sur du bruit.
//   La forme est là (hiérarchie des largeurs, trottoir continu devant les
//   venelles), donc le trottoir peut enfin se meubler.
//
//   CE QU'ON POSE, ET AVEC QUEL ART. Rien de neuf : le kit des places
//   (/pixelart/iso/plaza/<prop>-<ère>.png) porte déjà banc, bac et corbeille
//   dans les cinq ères, en quatre orientations pour les deux premiers. Un banc
//   de trottoir et un banc de place sont le MÊME objet — les distinguer aurait
//   produit deux vocabulaires pour une seule idée. Le dessin, l'ancrage sur
//   l'encre mesurée, l'ombre douce et la découpe des halos sont donc ceux du
//   kit (drawIsoPlazaProp) : ce fichier ne fait que DÉCIDER OÙ.
//
//   LES QUATRE RÈGLES DE POSE (chacune répare un défaut connu du projet) :
//
//   1. JAMAIS SUR LA CHAUSSÉE. L'objet est posé entre le bord intérieur de la
//      bande (le caniveau) et son bord extérieur, jamais au-delà — `out` dit où
//      dans cette fourchette. La géométrie vient du renderer, pas d'une copie :
//      régler __sidewalkIso({w}) déplace le mobilier avec le trottoir.
//
//   2. JAMAIS AU MILIEU DE LA CELLULE. C'est là que se trouvent DÉJÀ le mât du
//      lampadaire et l'allée de seuil qui sort de la porte (les deux sont
//      centrés sur l'axe transverse). Le décalage `along` est donc un intervalle
//      qui EXCLUT zéro : l'objet tombe toujours dans le tiers avant ou arrière
//      de la cellule. Bénéfice second, et il compte autant : une marque au
//      centre de chaque cellule redessinerait la grille, exactement le grief des
//      « plaques au sol » (cf. le parvis des merveilles).
//
//   3. UNE CELLULE SUR CINQ, PAS UNE PAR CELLULE. `dens` est une probabilité
//      par tronçon DROIT (les carrefours restent dégagés), tirée d'un hash
//      rebrassé — pas du bit faible, qui vaut la parité de l'entrée et rend un
//      damier. Un trottoir meublé partout n'est pas une rue vivante, c'est un
//      catalogue.
//
//   4. PAS DEUX OBJETS QUI SE TOUCHENT. Une cellule portant un mât du même côté
//      est sautée (`lampClear`) : le banc et le lampadaire tombaient sinon à
//      moins d'une demi-largeur de banc l'un de l'autre.
//
//   PROFONDEUR PEINTRE. Même piège que les lampadaires, et même parade : un
//   objet posé sur le trottoir NORD se dresse DEVANT la façade sud du bâtiment
//   mitoyen, mais son pied a une profondeur (wx+wy) PLUS PETITE que le coin sud
//   de ce bâtiment — la clé des socles — donc le peintre l'avalerait. On aligne
//   sa clé juste devant le bâtiment (`solidSouth`).
//
//   Réglage live : __streetProps() / (false) / ({ dens, out, along, scale, max }).
// ============================================================================

import { cmHash, ROAD_N, ROAD_E, ROAD_S, ROAD_W } from '../layout.js';
import { depthOf } from './projection.js';
import { personHT, plazaEraForBand } from './isoPlaza.js';

export const STREET_PROPS = {
  on: true,
  dens: 0.5,           // part des cellules de rue BORDÉES qui reçoivent un objet
  pair: 0.42,          // part de ces poses qui reçoivent un COMPAGNON un peu plus loin
  facade: true,        // ne meuble que les bords bâtis (cf. « devant une façade »)
  along: [0.17, 0.44], // décalage le long de la rue depuis le centre de cellule, en tuiles (n'inclut JAMAIS 0)
  out: 0.34,           // position DANS la bande : 0 = au caniveau, 1 = bord extérieur
  lampClear: true,     // saute les cellules qui portent déjà un mât du même côté
  scale: 1,            // multiplie la taille de tout le mobilier de rue
  max: 1500,           // plafond dur sur toute la ville (garde-fou, cf. __streetProps())
  rev: 0,
};

// Vocabulaire par ère : [prop, p (hauteur en MULTIPLES de la taille d'un
// habitant, mêmes valeurs que les recettes de place), poids du tirage].
// Le bac domine partout — c'est l'objet qui « verdit » une rue sans la meubler
// — et la corbeille ne prend du poids qu'avec la ville industrielle, où elle
// devient un objet de voirie ordinaire.
const KIT = {
  antique: [['planter', 0.55, 4], ['bench', 0.70, 3], ['bin', 0.52, 1]],
  medieval: [['planter', 0.55, 4], ['bench', 0.70, 3], ['bin', 0.52, 1]],
  industrial: [['planter', 0.55, 3], ['bench', 0.70, 3], ['bin', 0.52, 3]],
  modern: [['planter', 0.55, 3], ['bench', 0.68, 3], ['bin', 0.52, 4]],
  cosmic: [['planter', 0.55, 3], ['bench', 0.66, 3], ['bin', 0.52, 4]],
};

// Rebrassage 32 bits (finalizer de MurmurHash3). ⚠ Indispensable : le bit
// faible de cmHash vaut la PARITÉ de l'entrée, donc `hash & 1` sur 'x,y' rend un
// damier — piège déjà payé une fois sur les variantes d'habitation.
function fmix32(h) {
  h ^= h >>> 16; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

// Direction MONDE vers laquelle l'objet REGARDE (convention du kit des places :
// `face` nomme ce que le prop a en face de lui). Sur un trottoir, il regarde la
// rue — le banc est adossé aux façades, comme en ville.
function faceOf(horiz, side) {
  if (horiz) return side < 0 ? 's' : 'n';
  return side < 0 ? 'e' : 'w';
}

/**
 * Corps PUR (exporté pour les tests) : la liste des objets de trottoir d'une
 * ville, en coordonnées MONDE, avec leur profondeur peintre.
 *
 * @param L       layout (roadMap, tiles…)
 * @param T       CM.TILE
 * @param opts    tout ce que ce module ne doit PAS savoir calculer lui-même :
 *   band            bande d'ère,
 *   innerOf(rank)   distance axe → bord INTÉRIEUR de la bande (caniveau), en tuiles,
 *   outerOf(rank)   distance axe → bord EXTÉRIEUR, en tuiles,
 *   isSidewalk(gx,gy,cell)  la cellule porte-t-elle un trottoir DESSINÉ,
 *   lamps           mâts déjà posés (pour ne pas meubler dessus),
 *   solidSouth      Map 'gx:gy' → profondeur du coin sud d'un bâtiment debout.
 */
export function computeStreetProps(L, T, opts) {
  const out = [];
  if (!STREET_PROPS.on || !L || !L.roadMap) return out;
  const era = plazaEraForBand(opts.band | 0);
  if (!era) return out;
  const kit = KIT[era] || KIT.antique;
  const wTot = kit.reduce((s, k) => s + k[2], 0);
  // Index des mâts par cellule ET par côté : un banc ne gêne que le mât planté
  // du même côté de la chaussée que lui.
  const lampAt = new Set();
  if (STREET_PROPS.lampClear) {
    for (const lp of (opts.lamps || [])) {
      const gx = Math.floor(lp.wx / T), gy = Math.floor(lp.wy / T);
      const fx = lp.wx / T - gx, fy = lp.wy / T - gy;
      // Le mât est excentré sur l'axe TRANSVERSE de sa rue et centré sur l'autre :
      // le plus grand des deux écarts au milieu désigne son côté de chaussée.
      const tag = Math.abs(fx - 0.5) > Math.abs(fy - 0.5)
        ? (fx < 0.5 ? 'w' : 'e') : (fy < 0.5 ? 'n' : 's');
      lampAt.add(gx + ':' + gy + ':' + tag);
    }
  }
  const [a0, a1] = STREET_PROPS.along;
  for (const c of L.roadMap.values()) {
    if (out.length >= (STREET_PROPS.max | 0)) break;
    if (c.roadSurface === 'bridge' || c.rank === 'plaza' || c.rank === 'path') continue;
    if (!opts.isSidewalk(c.gx, c.gy, c)) continue;
    const mask = c.mask | 0;
    const E = !!(mask & ROAD_E), W = !!(mask & ROAD_W), S = !!(mask & ROAD_S), N = !!(mask & ROAD_N);
    // Le mobilier se pose LE LONG D'UN BRAS : c'est la seule zone dont on sait
    // qu'elle porte du trottoir. Une cellule qui en a dans les deux axes (le cas
    // d'un carrefour) tire lequel — ses quatre coins sont meublables, et c'est
    // tant mieux : n'accepter que les tronçons DROITS, comme le font les
    // lampadaires, écartait 78 % des rues (mesuré 108 cellules sur 497) et
    // rendait le mobilier introuvable.
    if (!E && !W && !S && !N) continue;
    const h = fmix32(cmHash('sprop:' + c.gx + ',' + c.gy));
    if ((h & 1023) / 1024 >= STREET_PROPS.dens) continue;
    const horiz = (E || W) && (!(S || N) || ((h >>> 9) & 1) === 1);
    const dirs = horiz ? [E ? 1 : 0, W ? -1 : 0] : [S ? 1 : 0, N ? -1 : 0];
    const av = dirs.filter(Boolean);
    if (!av.length) continue;
    const sgn = av[((h >>> 11) & 1) % av.length];
    let side = ((h >>> 10) & 1) ? 1 : -1;             // trottoir nord/sud (ou ouest/est)
    // DEVANT UNE FAÇADE, PAS AU MILIEU DE NULLE PART. La ville a beaucoup plus
    // de sol minéral que de front bâti : un banc tiré au hasard tombait le plus
    // souvent le long d'une cour vide, où il ne se lit pas — c'est du mobilier
    // urbain, il vit contre les façades. On préfère donc le côté BÂTI ; si aucun
    // des deux ne l'est, la cellule passe son tour (le budget va aux rues
    // habitées, ce qui rend la même densité bien plus visible).
    //
    // …et de préférence du côté NORD/OUEST (side −1). Ce n'est pas un caprice de
    // composition : en vue 3/4, le trottoir sud d'une rue passe DERRIÈRE la
    // maison qui le borde (elle est plus au sud, donc plus près de la caméra),
    // et l'objet y disparaît. Le trottoir nord, lui, court DEVANT la façade
    // éclairée. Un quart des poses part quand même en face, sinon toutes les
    // rues portent leur mobilier du même côté et ça se lit comme un rail.
    if (STREET_PROPS.facade && opts.isBuilt) {
      // Le front de rue se lit sur TROIS cellules (celle d'en face et ses deux
      // voisines le long de la rue), pas sur la seule cellule mitoyenne : les
      // maisons ne sont pas alignées au cordeau, et n'exiger que le vis-à-vis
      // exact écartait les deux tiers des poses (mesuré 13 rejets sur 19).
      const built = (s2) => {
        for (let k2 = -1; k2 <= 1; k2 += 1) {
          if (horiz ? opts.isBuilt(c.gx + k2, c.gy + s2) : opts.isBuilt(c.gx + s2, c.gy + k2)) return true;
        }
        return false;
      };
      const near = built(-1), far = built(1);
      if (near && far) side = ((h >>> 10) & 3) === 0 ? 1 : -1;
      else if (near) side = -1;
      else if (far) side = 1;
      else continue;
    }
    const tag = horiz ? (side < 0 ? 'n' : 's') : (side < 0 ? 'w' : 'e');
    if (lampAt.size && lampAt.has(c.gx + ':' + c.gy + ':' + tag)) continue;
    // Transverse : DANS la bande, jamais au-delà de ses deux bords.
    const inner = opts.innerOf(c.rank), outer = opts.outerOf(c.rank);
    const across = inner + (outer - inner) * Math.max(0, Math.min(1, STREET_PROPS.out));
    // Le long de la rue : jamais au centre de la cellule (mât + seuil de porte),
    // et au-delà de la chaussée TRANSVERSE quand il y en a une, sinon l'objet
    // tomberait au milieu du croisement.
    const lo = Math.max(a0, (horiz ? (S || N) : (E || W)) ? inner + 0.03 : 0);
    const hi = Math.min(a1, 0.5 - 0.055);          // et jamais à cheval sur le bord de cellule
    if (lo > hi) continue;
    const t = lo + (((h >>> 12) & 255) / 256) * (hi - lo);
    // La PROFONDEUR peintre du côté « petit » (nord / ouest) : l'objet se dresse
    // devant la façade du bâtiment mitoyen, dont le coin sud sert de clé aux
    // socles — sans ce recalage le peintre l'avale (même parade que les mâts).
    const bd = side < 0 && opts.solidSouth
      ? opts.solidSouth.get(horiz ? c.gx + ':' + (c.gy - 1) : (c.gx - 1) + ':' + c.gy) : null;
    const place = (tAlong, hp) => {
      if (tAlong < lo || tAlong > hi) return;   // ni dans la chaussée transverse, ni à cheval sur la cellule
      const wx = (c.gx + 0.5 + (horiz ? sgn * tAlong : side * across)) * T;
      const wy = (c.gy + 0.5 + (horiz ? side * across : sgn * tAlong)) * T;
      let pick = kit[0], r = (hp / 1024) * wTot;
      for (const k of kit) { r -= k[2]; if (r <= 0) { pick = k; break; } }
      let d = depthOf(wx, wy);
      if (bd != null && bd + 1 > d) d = bd + 1;
      out.push({
        prop: pick[0], variant: faceOf(horiz, side), wx, wy,
        hT: personHT() * pick[1] * STREET_PROPS.scale, d,
      });
    };
    place(t, (h >>> 20) & 1023);
    // COMPAGNON : un objet isolé au milieu d'un long trottoir se lit comme un
    // oubli ; les objets de rue vont par petits groupes (le banc et son bac).
    // Posé plus loin sur le MÊME côté, avec son propre tirage de prop — donc
    // rarement le même objet deux fois. Il se replie de l'autre bord quand la
    // cellule manque de place devant, sinon il tombait en silence une fois sur
    // deux (le garde de `place` le refusait au-delà du bord de cellule).
    if (((h >>> 22) & 255) / 256 < STREET_PROPS.pair) {
      const dAlong = 0.17;
      place(t + dAlong <= hi ? t + dAlong : t - dAlong, (h >>> 2) & 1023);
    }
  }
  return out;
}

if (typeof window !== 'undefined') {
  window.__streetProps = (arg) => {
    if (arg === false) STREET_PROPS.on = false;
    else if (arg && typeof arg === 'object') { STREET_PROPS.on = true; Object.assign(STREET_PROPS, arg); }
    else STREET_PROPS.on = true;
    STREET_PROPS.rev += 1;
    return { ...STREET_PROPS, poses: window.__streetPropsCount };
  };
}
