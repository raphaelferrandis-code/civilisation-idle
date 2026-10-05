"use strict";
// La salle des Plaisirs : cuisson partagée (en cache) et la nuit de la salle — hors du
// composant (SalleCanvas.jsx), pour que le rafraîchissement à chaud de React reste
// possible sur celui-ci.
//
// Depuis le retour de Raph du 2026-10-03 (« quel intérêt d'avoir un bâtiment de plus
// en plus grand si tout se passe au rez-de-chaussée ? ») la salle est la COUPE du
// bâtiment, de face, un étage par jeu (iso/plaisirsCoupeHD.js : à la grille des filles,
// en salles-boîtes dans leur charpente, depuis le 2026-10-03).
import { useEffect, useMemo, useState } from 'react';
import { figuresOuvertes } from '../../../game/map/iso/plaisirsCoupeHD.js';
import { wonderKitForBand } from '../../../game/map/iso/wonderKits.js';
import { dayNightMode } from '../../../game/map/dayNightMode.js';
import { lumiereToiles } from './salleLumiere.js';
import { cuireSalle } from './salleCuisson.js';

// LA MAISON EST HORS DU TEMPS (Raph, 2026-10-04 : « un véritable casino, lieu de luxure
// et d'argent hors du temps » — docs/PLAN-NUIT-DES-PLAISIRS.md, lot 2) : dans la salle,
// il fait TOUJOURS nuit, quelle que soit l'heure de la carte — les lustres allumés, les
// halos, la tenture du boudoir. Seul le réglage « toujours plein jour » du joueur (une
// préférence d'affichage, dayNightMode.js) la rallume.
// Avant : la salle suivait le cycle de 9 min de la carte (jour 55 % du temps).
export function salleNightF() {
  return dayNightMode === 'day' ? 0 : 1;
}

// Les rasters de la cuisson arrivent neufs (du Worker, transférés) : la toile les
// reprend sans copie.
function rasterCanvas(R) {
  const cv = document.createElement('canvas');
  cv.width = R.w; cv.height = R.h;
  const data = R.data instanceof Uint8ClampedArray ? R.data : new Uint8ClampedArray(R.data);
  cv.getContext('2d').putImageData(new ImageData(data, R.w, R.h), 0, 0);
  return cv;
}

// Les toiles d'une cuisson. Les rasters bruts (R, F, N) ne servaient qu'à les peindre et
// au calcul de la lumière : on ne les garde pas (MEM-5, audit du 2026-10-05 — ils
// doublaient le poids de chaque entrée du cache).
function finir({ out, lum }) {
  const { R, F, N, fond, ...reste } = out;
  void fond;
  const e = { ...reste, cv: rasterCanvas(R), cvF: rasterCanvas(F), cvN: rasterCanvas(N) };
  // Les OMBRES de la tenture du boudoir (une image par pose, couleur lie-de-vin).
  if (out.show) {
    const toCv = (m) => {
      const cv = document.createElement('canvas');
      cv.width = out.show.w; cv.height = out.show.h;
      const id = new ImageData(out.show.w, out.show.h);
      for (let k = 0; k < m.length; k += 1) if (m[k]) { id.data[k * 4] = 58; id.data[k * 4 + 1] = 22; id.data[k * 4 + 2] = 32; id.data[k * 4 + 3] = 255; }
      cv.getContext('2d').putImageData(id, 0, 0);
      return cv;
    };
    e.showCv = { solo: out.show.solo.map(toCv), couple: out.show.couple.map(toCv) };
  }
  if (out.hd && out.hd.cabin) e.cabinCv = { back: rasterCanvas(out.hd.cabin.back), front: rasterCanvas(out.hd.cabin.front), w: out.hd.cabin.w, h: out.hd.cabin.h };
  // LA LUMIÈRE DE NUIT (salleLumiere.js) : la carte d'éclairage, les rais des tables.
  e.lumiere = lumiereToiles(lum);
  // La LUEUR des flammes et des néons : la couche des lumières réduite en douceur
  // (un flou de pauvre, deux réductions), que la vue agrandit en ajout.
  e.lueurCv = (() => {
    const a = document.createElement('canvas');
    a.width = Math.max(1, Math.ceil(out.W / 4)); a.height = Math.max(1, Math.ceil(out.H / 4));
    const ga = a.getContext('2d');
    ga.imageSmoothingEnabled = true;
    ga.drawImage(e.cvN, 0, 0, a.width, a.height);
    const b = document.createElement('canvas');
    b.width = Math.max(1, Math.ceil(out.W / 8)); b.height = Math.max(1, Math.ceil(out.H / 8));
    const gb = b.getContext('2d');
    gb.imageSmoothingEnabled = true;
    gb.drawImage(a, 0, 0, b.width, b.height);
    return b;
  })();
  return e;
}

// Les cuissons prêtes, PAR ÂGE (la coupe ne dépend plus des jeux ouverts : seules ses
// figures, filtrées à l'affichage). On garde la courante et la précédente, la plus
// anciennement vue sort la première. Avant (MEM-5) : sept entrées de 15 à 20 Mo, par
// âge × lieux ouverts, sorties dans l'ordre d'arrivée et jamais rendues.
const GARDE = 2;
const _bakes = new Map();
// Range `val` sous `key` comme la plus récente ; au-delà de `max`, la plus ancienne sort.
export function retenir(cache, key, val, max) {
  cache.delete(key);
  cache.set(key, val);
  while (cache.size > max) cache.delete(cache.keys().next().value);
  return val;
}

// La cuisson HORS DU FIL PRINCIPAL (PERF-38) : la coupe et sa lumière cuisaient pendant
// le rendu de React — ~0,35 s de page figée à l'ouverture de l'onglet et à chaque
// changement d'âge. Elles passent dans un Worker ; seules les toiles se font ici.
const _enCours = new Map();
// La dernière cuisson AFFICHÉE : elle reste à l'écran le temps que la suivante cuise.
let _derniere = null;
// Un Worker refusé (navigateur, protocole) : on ne le retente pas à chaque cuisson.
let _sansWorker = false;

function cuireAilleurs(band) {
  if (_sansWorker || typeof Worker === 'undefined') return Promise.reject(new Error('sans Worker'));
  return new Promise((resolve, reject) => {
    let w;
    try {
      w = new Worker(new URL('./salleBake.worker.js', import.meta.url), { type: 'module' });
    } catch (err) {
      reject(err);
      return;
    }
    w.onmessage = (ev) => {
      w.terminate();
      if (ev.data && ev.data.out) resolve(ev.data);
      else reject(new Error((ev.data && ev.data.err) || 'cuisson vide'));
    };
    w.onerror = (ev) => {
      w.terminate();
      reject(ev.error || new Error(ev.message || 'Worker en erreur'));
    };
    w.postMessage({ band });
  });
}

// Sans Worker : la cuisson passe au tour suivant, HORS du rendu (le cadre se peint
// d'abord ; la page se fige le temps de la cuisson, comme avant).
const cuireIci = (band) => new Promise((resolve, reject) => {
  setTimeout(() => {
    try { resolve(cuireSalle(band)); } catch (err) { reject(err); }
  }, 0);
});

function cuire(band) {
  let p = _enCours.get(band);
  if (!p) {
    p = cuireAilleurs(band)
      .catch((err) => {
        if (!_sansWorker && typeof Worker !== 'undefined') console.warn('[Plaisirs] cuisson de la salle sur le fil principal :', err);
        _sansWorker = true;
        return cuireIci(band);
      })
      .then((res) => retenir(_bakes, band, finir(res), GARDE))
      .finally(() => _enCours.delete(band));
    _enCours.set(band, p);
  }
  return p;
}

// Pour les tests : cuire un âge (une promesse), les âges gardés.
export const cuireSalleBake = cuire;
export const sallesEnCache = () => [..._bakes.keys()];

// La cuisson de l'âge, et les figures des lieux ouverts : la vue (ancres du bouton
// d'action) et le canevas partagent la même, et revenir dans l'onglet ne recuit rien.
// `null` tant que la toute première cuisson n'est pas prête (le cadre montre l'eau).
export function useSalleBake(band, open) {
  const b = wonderKitForBand(band).band;
  const openKey = Object.keys(open).filter((k) => open[k]).sort().join(',');
  const [, setPret] = useState(0);
  const pret = typeof document === 'undefined' ? null : _bakes.get(b) || null;
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    // Affichée : elle reste la plus récente du cache, et à l'écran pendant la suivante.
    if (pret) { retenir(_bakes, b, pret, GARDE); _derniere = pret; return undefined; }
    let vivant = true;
    cuire(b).then(() => { if (vivant) setPret((n) => n + 1); }, (err) => console.error('[Plaisirs] cuisson de la salle :', err));
    return () => { vivant = false; };
  }, [b, pret]);
  // Pendant la cuisson, la précédente reste affichée.
  const e = pret || (typeof document === 'undefined' ? null : _derniere);
  return useMemo(() => (e ? { ...e, figures: figuresOuvertes(e.figures, open) } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [e, openKey]);
}
