"use strict";

// LES FAITS DIVERS — le registre des scènes (docs/PLAN-FAITS-DIVERS.md).
// Une histoire = un module (fdSecte.js, fdCynique.js…) qui exporte { build, spots }.
// Seules les histoires inscrites ici apparaissent sur la carte : une histoire sans
// scène attend simplement son lot, sans rien casser.
import { SECTE_SCENE } from './fdSecte.js';
import { CYNIQUE_SCENE } from './fdCynique.js';
import { TORTUE_SCENE } from './fdTortue.js';
import { CHEVRE_SCENE } from './fdChevre.js';
import { VOLANT_SCENE } from './fdVolant.js';
import { BORNE_SCENE } from './fdBorne.js';
import { MONSTRE_SCENE } from './fdMonstre.js';
import { MUSICIEN_SCENE } from './fdMusicien.js';
import { loversSceneFor } from './fdLovers.js';

export const FD_BUILDERS = {
  secte: SECTE_SCENE,
  cynique: CYNIQUE_SCENE,
  tortue: TORTUE_SCENE,
  chevre: CHEVRE_SCENE,
  volant: VOLANT_SCENE,
  borne: BORNE_SCENE,
  monstre: MONSTRE_SCENE,
  musicien: MUSICIEN_SCENE,
};

// Le constructeur d'un candidat (core/faitsDivers.fdCandidates), ou null.
export function buildersFor(cand) {
  if (cand.kind === 'story') return FD_BUILDERS[cand.story.id] || null;
  if (cand.kind === 'lovers') return loversSceneFor(cand.step);
  return null;
}
