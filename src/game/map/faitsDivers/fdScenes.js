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
import { FD_GAGS } from './fdGags.js';
import { FD_TRACES } from './fdTraces.js';
import { FD_STORIES } from '../../data/faitsDivers.js';

// Une histoire éteinte (`off`, cf. data/faitsDivers.js) n'a plus de scène : ni
// nouveau chapitre, ni reprise d'ambiance, ni résidente (fdDirector ne parcourt
// que ce registre).
export const FD_BUILDERS = Object.fromEntries(Object.entries({
  secte: SECTE_SCENE,
  cynique: CYNIQUE_SCENE,
  tortue: TORTUE_SCENE,
  chevre: CHEVRE_SCENE,
  volant: VOLANT_SCENE,
  borne: BORNE_SCENE,
  monstre: MONSTRE_SCENE,
  musicien: MUSICIEN_SCENE,
}).filter(([id]) => !(FD_STORIES[id] && FD_STORIES[id].off)));

// Le constructeur d'un candidat (core/faitsDivers.fdCandidates), ou null.
export function buildersFor(cand) {
  if (cand.kind === 'story') return FD_BUILDERS[cand.story.id] || null;
  if (cand.kind === 'lovers') return loversSceneFor(cand.step);
  if (cand.kind === 'curio') return FD_GAGS[cand.curio.id] || null;
  if (cand.kind === 'trace') return FD_TRACES[cand.storyId] || null;
  return null;
}
