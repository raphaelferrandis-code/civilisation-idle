"use strict";
// La salle des Plaisirs : cuisson partagée (en cache) et heure de la nuit — hors du
// composant (SalleCanvas.jsx), pour que le rafraîchissement à chaud de React reste
// possible sur celui-ci.
//
// Depuis le retour de Raph du 2026-10-03 (« quel intérêt d'avoir un bâtiment de plus
// en plus grand si tout se passe au rez-de-chaussée ? ») la salle est la COUPE du
// bâtiment, de face, un étage par jeu (iso/plaisirsCoupe.js).
import { useMemo } from 'react';
import { bakeCoupe } from '../../../game/map/iso/plaisirsCoupe.js';
import { wonderKitForBand } from '../../../game/map/iso/wonderKits.js';
import { dayNightMode } from '../../../game/map/dayNightMode.js';

// Même courbe que la carte (cityMapRuntime.js, cmDayNightF : jour 55 %, crépuscule
// 10 %, nuit 25 %, aube 10 % d'un cycle de 9 min à l'horloge murale). La boucle de
// la carte s'arrête quand on quitte la Cité : la salle lit l'heure elle-même.
// ⚠ À tenir alignée avec cityMapRuntime.js si le cycle change.
const DAY_CYCLE_MS = 540000, DAY_END = 0.55, DUSK_END = 0.65, NIGHT_END = 0.90;
const smooth01 = (t) => t * t * (3 - 2 * t);
export function salleNightF(nowMs = Date.now()) {
  if (dayNightMode === 'day') return 0;
  if (dayNightMode === 'night') return 1;
  const p = (nowMs / DAY_CYCLE_MS) % 1;
  if (p < DAY_END) return 0;
  if (p < DUSK_END) return smooth01((p - DAY_END) / (DUSK_END - DAY_END));
  if (p < NIGHT_END) return 1;
  return smooth01((1 - p) / (1 - NIGHT_END));
}

function rasterCanvas(R) {
  const cv = document.createElement('canvas');
  cv.width = R.w; cv.height = R.h;
  cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(R.data), R.w, R.h), 0, 0);
  return cv;
}

// La cuisson, en cache par âge × lieux ouverts : la vue (ancres du bouton d'action)
// et le canevas partagent la même, et revenir dans l'onglet ne recuit rien.
const _bakes = new Map();
export function useSalleBake(band, open) {
  const openKey = Object.keys(open).filter((k) => open[k]).sort().join(',');
  return useMemo(() => {
    if (typeof document === 'undefined') return null;
    const key = band + '|' + openKey;
    let e = _bakes.get(key);
    if (!e) {
      const out = bakeCoupe(wonderKitForBand(band), open);
      e = { ...out, cv: rasterCanvas(out.R), cvF: rasterCanvas(out.F), cvN: rasterCanvas(out.N) };
      if (_bakes.size > 6) _bakes.delete(_bakes.keys().next().value);
      _bakes.set(key, e);
    }
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band, openKey]);
}
