"use strict";
// La CUISSON de la salle des Plaisirs, pure (sans document) : la coupe de l'âge
// (iso/plaisirsCoupeHD.js) et le calcul de sa lumière (salleLumiere.js). Elle tourne
// dans un Worker (salleBake.worker.js) pour ne pas figer la page — ou, sans Worker, sur
// le fil principal, hors du rendu (salleBake.js).
import { bakeCoupeHD } from '../../../game/map/iso/plaisirsCoupeHD.js';
import { lumiereCalc } from './salleLumiere.js';

// `band` : la bande de l'âge (0-9, wonderKitForBand) ; la coupe n'en lit pas plus.
export function cuireSalle(band) {
  const out = bakeCoupeHD({ band });
  const lum = lumiereCalc(out);
  // Le dehors ne servait qu'au calcul de la lumière.
  out.fond = null;
  return { out, lum };
}

// Les tampons NEUFS de la cuisson, transférés (pas copiés) du Worker à la page. Pas les
// ombres de la tenture ni la cabine : le module les garde en cache, elles se copient.
export const tamponsSalle = ({ out, lum }) => [out.R.data.buffer, out.F.data.buffer, out.N.data.buffer, out.ids.buffer, lum.carte.buffer, lum.rais.buffer];
