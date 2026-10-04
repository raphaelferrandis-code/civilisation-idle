"use strict";

// LES FAITS DIVERS DE LA CARTE (docs/PLAN-FAITS-DIVERS.md) — point d'entrée.
// L'import enregistre le metteur en scène auprès de la petite vie (ses scènes
// passent par le tri du peintre) ; la carte branche ses entrées par
// bindFaitsDiversInput (cityMapRuntime.bindCityMapInput).
import './fdDirector.js';

export { bindFaitsDiversInput } from './fdPick.js';
