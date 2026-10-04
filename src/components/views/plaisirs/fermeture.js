import { state } from '../../../game/core/state.js';

// La crise terminale FERME les tables de la Maison : les actions des jeux refusent toutes
// de jouer (`state.crisisLimitAnnounced`). Les tables le disent par une pancarte
// (`PancarteFermee`, PlaisirsTable.jsx) — 2026-10-04, Raph : « je clique il ne se passe rien ».
export const tablesFermees = () => !!state.crisisLimitAnnounced;
