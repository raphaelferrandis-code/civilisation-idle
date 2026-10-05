"use strict";
// La cuisson de la salle des Plaisirs HORS du fil principal (audit du 2026-10-05,
// PERF-38) : la coupe et sa lumière, ~0,3 s de calcul qui figeait la page à
// l'ouverture de l'onglet et à chaque changement d'âge. Les toiles se fabriquent
// ensuite côté page (salleBake.js), en quelques millisecondes.
import { cuireSalle, tamponsSalle } from './salleCuisson.js';

self.onmessage = (ev) => {
  try {
    const res = cuireSalle(ev.data && ev.data.band);
    self.postMessage(res, tamponsSalle(res));
  } catch (err) {
    self.postMessage({ err: String((err && err.message) || err) });
  }
};
