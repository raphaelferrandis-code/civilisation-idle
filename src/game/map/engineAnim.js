"use strict";

// ── HORLOGE PROPRE À CHAQUE BÂTIMENT-MOTEUR ─────────────────────────────────
// Toutes les scènes moteur lisent le MÊME `now` (le timestamp de la frame). Quarante
// ateliers du même type jouent donc la même image au même millième de seconde : la
// forge bat, le porteur pose son panier et la fumée souffle À L'UNISSON sur tout le
// quartier. Le défaut était déjà relevé dans le code du feu (« deux forges battraient
// de toute façon à l'unisson, la frame se calcule sur `now`, pas par instance ») ;
// signalé par Raph le 2026-08-05 sur une ville dense.
//
// Il ne se corrige pas DANS les scènes : elles dessinent dans une boîte et n'ont
// aucune notion d'instance — il y a ~120 blocs animés répartis sur deux fichiers.
// On le corrige à la SOURCE, en donnant à chaque tuile son propre temps :
//
//     nowTuile = now × rate + phase
//
//   · `phase` déphase   — deux forges ne sont plus jamais sur la même image ;
//   · `rate`  désynchronise — sans lui, deux instances gardent le même écart POUR
//     TOUJOURS et un quartier entier peut rester figé en deux ou trois pelotons.
//     ±6 % est sous le seuil de perception d'une cadence (un pas reste un pas), mais
//     suffit à ce que rien ne se re-synchronise jamais. `rate: 0` → déphasage pur.
//
// COÛT : une multiplication et une addition par scène et par frame. La graine est
// mémoïsée SUR LA TUILE (objet layout persistant, même geste que `t._scnKey` du cache
// de scènes et `tr._tv` des arbres), donc le hash de chaîne n'est payé qu'une fois par
// tuile et par vie de layout. Aucun dessin en plus : même nombre de scènes, mêmes
// blits, mêmes plans cuits — le cache de scènes ne garde QUE les plans statiques, qui
// ne lisent pas `now` (cf. engineSceneCache : `back`/`front` cuits, `anim` en direct).
//
// ⚠ DÉTERMINISTE en (gx, gy) : invariante entre frames ET entre recomputes de layout,
// donc les captures (`__cityShot`, harnais de scènes) restent reproductibles — aucun
// Math.random, aucune dépendance à l'écran.
//
// ⚠ CE QUI NE DOIT PAS ÊTRE DÉCALÉ : l'eau de l'aqueduc, dont le flux se RACCORDE
// d'une tuile à l'autre (cf. ANIM_BANDS dans cityEngineSprites : « même horloge (ms)
// partout → la frame est globale, pas par tuile »). Les aqueducs ne passent pas par
// ici — drawIsoEngineScene les renvoie à leur rendu d'emprise dédié — mais si une
// scène raccordée entre tuiles voisines apparaît un jour, elle doit garder `now`.

import { cmHash } from './layout.js';

// spread : étalement des déphasages, en ms. Il doit COUVRIR le plus long cycle des
//   scènes — mesuré à ~5 200 ms (la navette du chaland de la place de commerce),
//   4 600 ms pour le paysan à la brouette. En dessous, les cycles longs restent
//   groupés et c'est justement ceux-là qu'on remarque.
// rate : amplitude de la variation de cadence (0.06 = ±6 %).
export const ENGINE_ANIM_STAGGER = { on: true, spread: 9000, rate: 0.06 };

// Version des réglages : bumpée par la molette pour invalider les graines déjà
// mémoïsées sur les tuiles (sinon un A/B en live ne changerait rien à l'écran).
let tuneVer = 0;
if (typeof window !== 'undefined') {
  window.__engineAnimStagger = (o) => {
    if (o) Object.assign(ENGINE_ANIM_STAGGER, o);
    tuneVer += 1;
    return { ...ENGINE_ANIM_STAGGER };
  };
}

// Finaliseur murmur3. ⚠ INDISPENSABLE : cmHash est un FNV-1a dont le multiplieur est
// impair — ses bits de poids faible ne valent rien (le bit 0 n'est que la parité de
// l'entrée), ce qui a déjà produit un DAMIER PARFAIT sur les teintes de maisons
// (houseVariants.test.js). Un déphasage tiré des bits bruts alignerait une tuile sur
// deux, c'est-à-dire exactement le défaut qu'on vient corriger.
function fmix32(h) {
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 2246822507) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Le temps que doit lire la scène de la tuile `t` à la frame `now`.
 * Renvoie `now` tel quel si le décalage est coupé ou si la tuile n'a pas de cellule.
 */
export function engineAnimNow(t, now) {
  const G = ENGINE_ANIM_STAGGER;
  if (!G.on || !t || t.gx == null || t.gy == null) return now;
  if (t._eaVer !== tuneVer) {
    const sd = fmix32(cmHash('anim:' + t.gx + ':' + t.gy));
    // Deux tirages pris dans des zones DISJOINTES du hash brassé : la cadence ne doit
    // pas être une fonction du déphasage, sinon les deux se renforcent et le quartier
    // retombe sur un dégradé régulier au lieu d'un désordre.
    t._eaPh = ((sd & 0xffff) / 0x10000) * G.spread;
    t._eaRt = 1 + ((((sd >>> 16) & 0xffff) / 0x10000) * 2 - 1) * G.rate;
    t._eaVer = tuneVer;
  }
  return now * t._eaRt + t._eaPh;
}
