"use strict";
// LA GRILLE DE PIXELS — sonde du lot G0 (docs/PLAN-GRILLE-PIXELS.md).
//
// UNE question, une seule : **combien de pixels ÉCRAN vaut UN pixel de l'art ?**
// C'est la « densité ». 1,00 = le pixel de l'artiste est le pixel de l'écran ;
// en dessous, le blit JETTE des lignes (nearest, `imageSmoothingEnabled=false`)
// et le sprite fourmille dès qu'il bouge.
//
// Le relevé §1.2 du plan a été obtenu à la main — formules lues de bout en bout,
// planches mesurées au PNG. Ce module le rend AUTOMATIQUE et, surtout, HONNÊTE :
// il lit la boîte RÉELLEMENT passée à drawImage, pas la formule qui est censée
// la produire. C'est exactement la divergence entre les deux qui avait produit
// les cinq densités de PLAN-EGALISATION-GRAIN §1.1 (une formule commune, cinq
// résultats) — donc on ne re-signe pas ce chèque-là.
//
// ⚠ La densité est NORMALISÉE À ZOOM 1 : `boîte / planche / zoom`. Sans ça deux
// mesures prises à deux zooms ne se comparent pas, et le tableau ne veut rien
// dire. Le « zoom en grille » d'une famille (celui où planche = boîte) en est
// l'inverse exact : 1 / densité.
//
// Coût ÉTEINTE : rien. Les sites d'appel testent `pxProbe.on` (un booléen de
// module) avant d'appeler — même idiome que `depthProbe` dans iso/isoUnits.js.
// Elle est éteinte au chargement et ne s'arme qu'à la main.
//
//   __pxGrid(true)    arme et remet à zéro       __pxGrid(false)   éteint
//   __pxGridAudit()   le tableau + le verdict    __pxGridLast      le relevé
import { CM } from './layout.js';

// Famille → monde. Le sujet du plan tient dans cette colonne : « le bâti tient
// dans une bande étroite, tout ce qui bouge est trois à cinq fois plus fin ».
// Clé = premier mot de l'étiquette de famille (avant le ' · ').
const PX_MONDE = {
  sol: 'carte', route: 'carte', pont: 'carte', bati: 'carte', merveille: 'carte',
  habitant: 'vivant', porteur: 'vivant', emeutier: 'vivant',
  vehicule: 'vivant', bete: 'vivant', bateau: 'vivant',
};

const rows = new Map();
export const pxProbe = { on: false, rows };

function reset() {
  rows.clear();
  return rows;
}

// UN blit mesuré. `fam` = étiquette de famille ('bateau · container') ; `srcPx`
// = la dimension SOURCE réellement échantillonnée (hauteur de frame d'une bande,
// largeur d'encre d'un sprite, largeur de tranche d'un pont) ; `boxPx` = la
// dimension DESTINATION correspondante, celle qui part dans drawImage.
// ⚠ Les deux doivent être le MÊME axe, sinon la densité mesure un ratio d'aspect.
export function recPx(fam, srcPx, boxPx) {
  if (!(srcPx > 0) || !(boxPx > 0)) return;
  const z = (CM.cam && CM.cam.zoom) || 1;
  const dens = boxPx / srcPx / z;
  let e = rows.get(fam);
  if (!e) {
    e = { fam, n: 0, srcMin: srcPx, srcMax: srcPx, srcSum: 0, boxSum: 0, dMin: dens, dMax: dens, dSum: 0 };
    rows.set(fam, e);
  }
  e.n += 1;
  e.dSum += dens;
  e.srcSum += srcPx;
  e.boxSum += boxPx / z;                    // boîte ramenée à zoom 1, comme la densité
  if (srcPx < e.srcMin) e.srcMin = srcPx;
  if (srcPx > e.srcMax) e.srcMax = srcPx;
  if (dens < e.dMin) e.dMin = dens;
  if (dens > e.dMax) e.dMax = dens;
}

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const span = (a, b) => (a === b ? a : a + '–' + b);

// Le relevé, une ligne par famille, trié par densité décroissante — l'ordre du
// tableau §1.2 du plan : la carte en haut, le vivant en bas, et la falaise entre
// les deux se lit d'un coup d'œil.
export function pxGridRows() {
  const out = [];
  for (const e of rows.values()) {
    // Densité CUMULÉE (Σboîte / Σplanche), pas moyenne des ratios. La différence
    // n'est pas cosmétique : le pont est blité en TRANCHES de 1 à 6 px source,
    // dont les bords sont arrondis au pixel entier (anti-fente d'eau, cf.
    // isoBridge) — une tranche de 1 px qui en rend 2 pèse une densité de 2,00
    // dans une moyenne de ratios. Mesuré : min 0,55 / max 1,98 sur un ouvrage
    // dont la densité vraie est 0,94. Le cumul rend cette dispersion inoffensive
    // (c'est du bruit d'arrondi, pas de la grille) sans rien lisser d'autre.
    const d = e.srcSum > 0 ? e.boxSum / e.srcSum : e.dSum / e.n;
    out.push({
      famille: e.fam,
      monde: PX_MONDE[e.fam.split(' · ')[0]] || '?',
      planche: span(r2(e.srcMin), r2(e.srcMax)),
      'boite@z1': r2(e.boxSum / e.n),
      densite: r3(d),
      'zoom grille': r2(1 / d),
      'dens min': r3(e.dMin),
      'dens max': r3(e.dMax),
      n: e.n,
    });
  }
  out.sort((a, b) => b.densite - a.densite);
  return out;
}

// Le VERDICT : les deux mondes, leurs bandes, et l'écart entre eux. C'est la
// phrase du plan (« ce n'est pas une gradation, c'est une falaise ») rendue
// vérifiable en une frame.
export function pxGridVerdict(list) {
  const R = list || pxGridRows();
  const bande = (monde) => {
    const d = R.filter((r) => r.monde === monde).map((r) => r.densite);
    return d.length ? { min: Math.min(...d), max: Math.max(...d), n: d.length } : null;
  };
  const carte = bande('carte'), vivant = bande('vivant');
  return {
    carte: carte ? `${r2(carte.min)}–${r2(carte.max)} (${carte.n} familles)` : '—',
    vivant: vivant ? `${r2(vivant.min)}–${r2(vivant.max)} (${vivant.n} familles)` : '—',
    // Le pire écart : la famille la plus dense de la carte contre la plus fine
    // du vivant. C'est le « 3 à 5 fois » du plan, mesuré.
    ecart: carte && vivant ? '×' + r2(carte.max / vivant.min) : '—',
    familles: R.length,
  };
}

if (typeof window !== 'undefined') {
  window.__pxGrid = (on) => {
    pxProbe.on = on !== false;
    if (pxProbe.on) reset();
    return pxProbe.on;
  };
  window.__pxGridAudit = () => {
    const R = pxGridRows();
    const V = pxGridVerdict(R);
    if (typeof console !== 'undefined' && console.table) console.table(R);
    window.__pxGridLast = { rows: R, verdict: V };
    return window.__pxGridLast;
  };
}
