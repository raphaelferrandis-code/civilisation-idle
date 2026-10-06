// Décision de crédit d'un intervalle de « tick » (M16/M17 de l'audit 2026-07-21).
// Isolé de main.js pour être testable sans importer toute la boucle de jeu.
//
// Quatre régimes :
//  - horloge murale RECULÉE de plus de CLOCK_REWIND_TOLERANCE_SEC → 'rewind' :
//    rien n'est crédité, la boucle décale l'ancre et tous les horodatages du même
//    écart (shiftStateTimestamps, plus bas). Sans ça, l'ancre prenait l'heure
//    reculée, la remise à l'heure était créditée comme une absence complète, et
//    pendant le recul toutes les minuteries ancrées avant restaient figées
//    (audit 2026-10-05, SAV-12). Testé AVANT l'onglet caché : un recul survenu
//    onglet masqué se constate au premier tick, même étranglé.
//  - onglet CACHÉ → 'skip' : on ne crédite rien ici. La boucle laisse lastWall
//    (et donc lastTick) FIGÉ au masquage ; le retour d'onglet (visibilitychange,
//    ou le premier tick visible) crédite toute l'absence d'un coup. Sans ça, les
//    ticks throttlés en arrière-plan (~1/min) créditaient 1 s chacun et l'auto-save
//    rafraîchissait lastTick → quasi tout le temps caché était perdu (M16).
//  - écart mural ANORMAL alors que l'onglet est VISIBLE (veille système, gel
//    d'onglet, gros jank) → 'offline' : on route l'écart réel vers la progression
//    hors-ligne au lieu de le clamper à 1 s — sinon une nuit de veille ne créditait
//    qu'une seule seconde (M17).
//  - sinon → 'live' : temps de jeu normal, l'écart RÉEL jusqu'au seuil. Borné à
//    1 s, chaque intervalle retardé (frame longue en rendu logiciel, GC, recalcul
//    de ville, la simulation hors-ligne elle-même) perdait `écart − 1` s : la cité
//    et le temps de jeu (merveilles, registre) retardaient sur l'horloge murale
//    (audit 2026-10-05, BUG-73). tick(dt) encaisse 10 s : la sim l'appelle ainsi.
//
// Seuil aligné sur le plancher d'applyOfflineProgress (elapsed <= 10 → no-op) pour
// que le régime 'offline' crédite toujours réellement — et qu'aucune seconde ne
// tombe entre les deux régimes.
const OFFLINE_CATCHUP_MIN_SEC = 10;
// Sous ce recul, c'est de la gigue d'horloge (resynchronisation NTP fine) : le
// régime 'live' à 0 s l'absorbe sans rien décaler.
export const CLOCK_REWIND_TOLERANCE_SEC = 5;

export function decideTickCredit(wallGapSec, hidden, threshold = OFFLINE_CATCHUP_MIN_SEC) {
  if (wallGapSec < -CLOCK_REWIND_TOLERANCE_SEC) return { mode: "rewind", seconds: wallGapSec };
  if (hidden) return { mode: "skip", seconds: 0 };
  if (wallGapSec > threshold) return { mode: "offline", seconds: wallGapSec };
  return { mode: "live", seconds: Math.min(threshold, Math.max(0, wallGapSec)) };
}

// ── REBASAGE DES HORODATAGES (audit 2026-10-05, BUG-8 et SAV-12) ─────────────
// Les minuteries du jeu sont des horodatages ABSOLUS lus contre Date.now() : âge
// du cycle, échéances (aubaine, Nuit, cooldowns), « dernier X » (temple,
// Intendance, roue). Deux situations demandent de les déplacer TOUS ENSEMBLE :
//  - le VERSEMENT DE CLEPSYDRE rejoue `spend` secondes sous une horloge qui part
//    de now − spend, alors que l'état vient d'être écrit en temps réel. Sans
//    rebasage, cycleStartedAt tombait « dans le futur » du référentiel : cycle
//    d'âge négatif (déclencheur « temps » muet, patience minimale, legs coupé),
//    Intendance et protocoles bloqués. Décaler de −spend, c'est remettre l'état
//    à l'instant où une absence de même durée l'aurait trouvé ;
//  - l'horloge système RECULÉE en session (régime 'rewind' ci-dessus).
// Un seul helper pour les deux, au lieu de rustines champ par champ : une
// minuterie oubliée ici reste figée pendant un versement. La liste est tenue par
// un test (clockShift.test.js) contre les champs horodatés de defaultState().
//
// Horodatages de premier niveau, en ms. 0 et null veulent dire « pas posé » et
// ne bougent pas.
export const SHIFTED_STATE_FIELDS = [
  "cycleStartedAt",
  "crisisOpenedAt",
  "nextBoonAt",
  "blessingUntil",
  "ragnarokArkNextAt",
  "phoenixNextForceAt",
  "atridesRenegotiateActiveUntil",
  "atridesRenegotiateCooldownEnd",
  "orNextCaravanAt",
  "eneeTerritoryStartedAt",
  "trunkAt",
  "roueAt",
  "nuitDebut",
  "nuitProchaine",
  "spectacleDebut",
  "spectacleFin",
  "bjBarreJusqua"
];

// Horodatages qui NE se décalent PAS, et pourquoi (même test) :
//  - lastTick : l'ancre du crédit hors-ligne, que l'appelant gère lui-même (le
//    versement ne la touche pas, le recul d'horloge la décale à part) ;
//  - les DATES D'ARCHIVE (registre des édits, dépêches de la gazette, épitaphes
//    de Cadmos, époque de la sauvegarde) : elles disent quand une chose a eu lieu,
//    pas quand une minuterie échoit ;
//  - onboarding.reveal : la lueur « nouveau » de l'interface, en temps réel.
export const UNSHIFTED_TIME_FIELDS = ["lastTick"];

const shiftTs = (value, deltaMs) => (Number.isFinite(value) && value > 0 ? value + deltaMs : value);

// Décale EN PLACE tous les horodatages mécaniques de `s` de `deltaMs` (négatif =
// vers le passé). Rend `s`. Les horloges de MODULE (lastAutoCrisisAt du tick) se
// décalent à part, par leur propre setter (main.js, rebaseWorldClock).
export function shiftStateTimestamps(s, deltaMs) {
  if (!s || typeof s !== "object" || !Number.isFinite(deltaMs) || deltaMs === 0) return s;
  for (const key of SHIFTED_STATE_FIELDS) s[key] = shiftTs(s[key], deltaMs);
  // « Joué il y a X » reste « joué il y a X » : cadrans du temple, consignes de
  // l'Intendance, règle « Rationner » des automates d'Héphaïstos (BUG-29).
  if (s.templeAuto && typeof s.templeAuto === "object") {
    for (const auto of Object.values(s.templeAuto)) {
      if (auto && typeof auto === "object") auto.lastAt = shiftTs(auto.lastAt, deltaMs);
    }
  }
  for (const list of [s.stewardClauses, s.automateRules]) {
    if (!Array.isArray(list)) continue;
    for (const clause of list) {
      if (clause && typeof clause === "object" && "lastAt" in clause) clause.lastAt = shiftTs(clause.lastAt, deltaMs);
    }
  }
  // Le legs d'épitaphe compte son âge depuis startedAt (mythEffects.js).
  for (const key of ["activeEpitaphLegacy", "nextEpitaphLegacy"]) {
    const legacy = s[key];
    if (legacy && typeof legacy === "object") legacy.startedAt = shiftTs(legacy.startedAt, deltaMs);
  }
  // L'Olympe mesure l'inactivité du joueur depuis sa dernière interaction.
  if (s.olympus && typeof s.olympus === "object") {
    s.olympus.lastInteractionAt = shiftTs(s.olympus.lastInteractionAt, deltaMs);
    s.olympus.idleStartedAt = shiftTs(s.olympus.idleStartedAt, deltaMs);
  }
  return s;
}
