"use strict";
// La salle des Plaisirs : cuisson partagée (en cache) et la nuit de la salle — hors du
// composant (SalleCanvas.jsx), pour que le rafraîchissement à chaud de React reste
// possible sur celui-ci.
//
// Depuis le retour de Raph du 2026-10-03 (« quel intérêt d'avoir un bâtiment de plus
// en plus grand si tout se passe au rez-de-chaussée ? ») la salle est la COUPE du
// bâtiment, de face, un étage par jeu (iso/plaisirsCoupeHD.js : à la grille des filles,
// en salles-boîtes dans leur charpente, depuis le 2026-10-03).
import { useMemo } from 'react';
import { bakeCoupeHD } from '../../../game/map/iso/plaisirsCoupeHD.js';
import { wonderKitForBand } from '../../../game/map/iso/wonderKits.js';
import { dayNightMode } from '../../../game/map/dayNightMode.js';
import { bakeLumiere } from './salleLumiere.js';

// LA MAISON EST HORS DU TEMPS (Raph, 2026-10-04 : « un véritable casino, lieu de luxure
// et d'argent hors du temps » — docs/PLAN-NUIT-DES-PLAISIRS.md, lot 2) : dans la salle,
// il fait TOUJOURS nuit, quelle que soit l'heure de la carte — les lustres allumés, les
// halos, la tenture du boudoir. Seul le réglage « toujours plein jour » du joueur (une
// préférence d'affichage, dayNightMode.js) la rallume.
// Avant : la salle suivait le cycle de 9 min de la carte (jour 55 % du temps).
export function salleNightF() {
  return dayNightMode === 'day' ? 0 : 1;
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
      // La GRILLE DES FILLES (plaisirsCoupeHD.js) : 1 px de coupe = 1 px de sprite.
      const out = bakeCoupeHD(wonderKitForBand(band), open);
      e = { ...out, cv: rasterCanvas(out.R), cvF: rasterCanvas(out.F), cvN: rasterCanvas(out.N) };
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
      e.lumiere = bakeLumiere(e);
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
      if (_bakes.size > 6) _bakes.delete(_bakes.keys().next().value);
      _bakes.set(key, e);
    }
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band, openKey]);
}
