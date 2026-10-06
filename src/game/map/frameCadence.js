// CADENCE DE LA BOUCLE DE LA CARTE : TOLÉRANCE D'UNE DEMI-VSYNC ESTIMÉE
// (audit du 2026-10-05, PERF-57 ; décision de Raph du 2026-10-05 : option B).
//
// La boucle saute une image si `now - last < plafond - tolérance`. La tolérance
// évite le BOITEMENT d'un plafond N sur un écran à N Hz (cf. cityMapRuntime.js,
// frameBody) : fixée à 8 ms, une demi-vsync à 60 Hz, elle laissait passer bien
// plus que le plafond sur les écrans rapides : « 60 » tournait à 72 i/s à 144 Hz,
// 82 à 165 Hz et 80 à 240 Hz (20 à 38 % de calcul en plus).
// Elle vaut désormais une DEMI-VSYNC MESURÉE, plafonnée à 8 ms (60 Hz inchangé) :
//   plafond 60 : 120 Hz → 60, 144 Hz → 72 (inchangé), 165 Hz → 55, 240 Hz → 60 ;
//   plafond 30 : 144 Hz → 29, 240 Hz → 30.
// La cadence reste RÉGULIÈRE (toujours le même nombre de vsyncs entre deux images) :
// un accumulateur aurait tenu 60 de moyenne exacte, en alternant 2 et 3 vsyncs.
//
// La vsync est le MINIMUM GLISSANT des intervalles rAF (deux blocs de `bloc`
// intervalles : le plus vieux sort d'un coup, la mesure suit un changement d'écran
// en quelques secondes). Une image lourde ne fait qu'allonger un intervalle : le
// minimum n'en tient pas compte. Les intervalles aberrants (onglet caché, horloge
// qui recule, double rappel) sont ignorés. Sans mesure : 8 ms, comme avant.
// Module-FEUILLE (aucun import), pur et testable.
export const CADENCE_TOL_MAX = 8;

export function makeVsyncEstimator(bloc = 60) {
  let cur = Infinity, prev = Infinity, n = 0;
  return {
    // Un intervalle entre deux rappels rAF consécutifs (ms).
    note(delta) {
      if (!(delta >= 2 && delta <= 250)) return;
      if (delta < cur) cur = delta;
      n += 1;
      if (n >= bloc) { prev = cur; cur = Infinity; n = 0; }
    },
    // Vsync estimée (ms), ou Infinity tant que rien n'est mesuré.
    vsync() { return Math.min(cur, prev); },
    // Tolérance du saut d'image : une demi-vsync, au plus 8 ms.
    tolerance() {
      const v = Math.min(cur, prev);
      return Number.isFinite(v) ? Math.min(CADENCE_TOL_MAX, v / 2) : CADENCE_TOL_MAX;
    },
  };
}
