// SCÉNARIOS DE MYTHES depuis une save d'Acte III figée (audit 2026-10-05,
// TEST-1, volet 1). save-acte3.json : une partie du harnais juste après son
// 6e Grand Reset, les huit Mythes des Actes I et II accomplis — l'Acte III
// s'ouvre. Le joueur scripté ne vise qu'UN Mythe, boucle de jeu à 1 Hz comme
// startGameLoop, clics au pas où le bouton est actif.
//   doctrine "auto" : Conseil de crise possédé, postures « Stabiliser » ;
//   doctrine "ask"  : chaque crise narrative ouvre sa fenêtre, que le joueur
//                     met `dialogMs` à trancher (partie en pause, horloge qui tourne).
// `prelude` : Mythes joués d'abord, dans l'ordre (le Phénix suit Icare : sans
// l'Aile, la cité n'atteint pas la Rupture dans la fenêtre de 3 min).
import { vi } from "vitest";
import { setupEnv, restoreEnv, loadSave, step, makeLogger, scanState, roundTrip, vtSec, fmtT } from "./harness.js";
import { createPlayer } from "./player.js";
import acte3 from "./save-acte3.json";

// Champs que pose l'héritage d'un Mythe, avec leur valeur par défaut : relevés
// en appliquant l'héritage sur une partie neuve (à faire AVANT de charger la save).
function heritageDefaults(g, myth) {
  g.st.setState(g.st.defaultState());
  const before = JSON.parse(JSON.stringify(g.st.state));
  myth.applyHeritage();
  const after = JSON.parse(JSON.stringify(g.st.state));
  return Object.keys(after)
    .filter((key) => key !== "history" && JSON.stringify(after[key]) !== JSON.stringify(before[key]))
    .map((key) => [key, before[key]]);
}

export async function runMythScenario(mythId, { doctrine = "auto", dialogMs = 0, maxSec = 3600, seed = 777, dt = 1, prelude = [], name } = {}) {
  const g = await setupEnv(seed);
  const log = makeLogger(name || `${mythId}-${doctrine}`);
  try {
    // Les modules du jeu survivent d'un scénario à l'autre dans un même fichier :
    // verrous de module et minuteries remis à neuf avant de charger la save.
    vi.clearAllTimers();
    g.st.setGamePaused(false);
    g.st.setCollapseInProgress(false);
    const myth = g.myth.getMythById(mythId);
    const undo = heritageDefaults(g, myth);
    loadSave(g, acte3);
    const { state } = g.st;
    // Mythe déjà accompli dans la save (Sisyphe est de l'Acte II) : rejoué, sans
    // son héritage.
    if (g.myth.isMythCompleted(mythId)) {
      delete state.mythsCompleted[mythId];
      for (const [key, value] of undo) state[key] = value;
    }
    if (doctrine === "auto") {
      state.upgrades.conseil_de_crise = true;
      g.st.invalidateRenderCache("all");
    }
    for (const p of ["p25", "p50", "p75"]) g.actions.setCrisisPosture(p, doctrine === "auto" ? "stabiliser" : "ask");
    const player = createPlayer(g, { dt, log, mythOrder: [...prelude, mythId], noGR: true, doctrine, dialogMs, icarusHunt: false });
    const start = vtSec();
    let lastScan = start;
    log(`[SCÉNARIO] ${mythId} doctrine=${doctrine} fenêtres=${dialogMs} ms`);
    while (vtSec() - start < maxSec) {
      await step(g, dt);
      try { await player.act(dt); } catch (e) { player.anomaly("act-throw", (e && e.stack) || e); }
      player.track();
      if (vtSec() - lastScan >= 30) {
        lastScan = vtSec();
        scanState(g, (bad) => player.anomaly("numeric", bad.join(" ; ")));
      }
      if (g.myth.isMythCompleted(mythId)) break;
    }
    const done = g.myth.isMythCompleted(mythId);
    const rt = roundTrip(g);
    if (rt.error) player.anomaly("roundtrip-throw", rt.error);
    else if (!rt.same) player.anomaly("roundtrip-diff", JSON.stringify(rt.diffs.map((d) => d.detail).flat().slice(0, 8)));
    log(`[FIN] ${mythId} accompli=${done} en ${fmtT(vtSec() - start)} essais=${player.R.myth[mythId]?.attempts || 0}`);
    return {
      done,
      sec: vtSec() - start,
      attempts: player.R.myth[mythId]?.attempts || 0,
      anomalies: player.R.anomalies,
      dialogs: player.R.dialogs,
      tail: log.tail()
    };
  } finally {
    restoreEnv();
  }
}
