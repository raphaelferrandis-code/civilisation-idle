// PARTIE COMPLÈTE SIMULÉE (audit 2026-10-05, TEST-1, volet 2) : du premier feu
// au titre final de la Chronique, joueur scripté, horloge virtuelle. Vérifie à
// chaque pas l'absence d'exception, de NaN / Infinity / négatif ; l'aller-retour
// JSON → hydrateState à chaque cycle et à chaque jalon (un plafond d'hydratation à
// MAX_SAFE_INTEGER y a été vu) ; un rechargement simulé (F5) à chaque Mythe et
// Grand Reset ; des absences hors-ligne intercalées ; et qu'aucune progression ne
// cale plus de 6 h virtuelles.
//
// Hors de la suite par défaut : `npm run test:parcours` (ou PARCOURS=1 avec
// --testTimeout=0). Réglages (variables d'environnement) :
//   PC_HOURS (12) heures virtuelles au plus — 8 jusqu'au lot 11 de l'audit : le
//   sceau VII ne tombe plus à 20 min (BUG-40) et l'Âge d'Or se joue automates
//   allumés (AGE-OR-AUTOMATES), le Ragnarök croise alors l'absence de 4 h posée à
//   6 h, sa Fin tombe au retour et le titre arrive vers 10 h 25 · PC_POST (0,5) heures jouées après le
//   titre · PC_DT (1) pas en s — la boucle du jeu est à 1 Hz ; à 2 s, la
//   récupération d'ÉPAULER (15 ticks) tombe au 16e et Atlas casse · PC_SEED ·
//   PC_MAXREAL (10) minutes réelles au plus
//   · PC_GRORDER (« 1,7,2 ») · PC_RAGNAROK (afterCollapse | atPeak) · PC_OFFEVERY
//   (7200) s virtuelles entre deux absences · PC_OUT dossier du journal et des saves.
import { it, expect, vi } from "vitest";
import { PARCOURS_ON, setupEnv, restoreEnv, makeLogger, step, scanState, roundTrip, vtSec, fmtT } from "./harness.js";
import { createPlayer } from "./player.js";

const env = process.env;
const FATAL = /throw|numeric|roundtrip|BLOCAGE|gr-refus|myth-activation/;

it.runIf(PARCOURS_ON)("partie complète : du premier feu au titre final", async () => {
  const NAME = env.PC_NAME || "parcours";
  const HOURS = Number(env.PC_HOURS || 12);
  const DT = Number(env.PC_DT || 1);
  const SEED = Number(env.PC_SEED || 12345);
  const MAXREAL = Number(env.PC_MAXREAL || 10) * 60_000;
  const POST_H = Number(env.PC_POST ?? 0.5);
  const OFF_EVERY = Number(env.PC_OFFEVERY || 2 * 3600);
  const g = await setupEnv(SEED);
  try {
    const { state, setState, hydrateState, invalidateRenderCache } = g.st;
    const log = makeLogger(NAME);
    const realStart = performance.now(); // budget réel seulement, jamais une assertion
    log(`[PARCOURS] hours=${HOURS} dt=${DT} seed=${SEED}`);
    const player = createPlayer(g, {
      dt: DT, log,
      grOrder: env.PC_GRORDER ? env.PC_GRORDER.split(",").map(Number) : null,
      ragnarokTiming: env.PC_RAGNAROK || "afterCollapse"
    });
    const { R } = player;
    let k = 0, offIdx = 0, lastOff = vtSec(), lastScan = 0, lastReport = 0, finalAt = null, terminalSince = null;
    let lastMythDone = Object.values(state.mythsCompleted || {}).filter(Boolean).length;
    let lastGrCount = state.grandResetCount || 0;
    const offList = [600, 3600, 4 * 3600];
    const endT = vtSec() + HOURS * 3600;
    while (vtSec() < endT) {
      if (performance.now() - realStart > MAXREAL) { log(`[STOP] budget réel épuisé à VT=${fmtT(vtSec())}`); break; }
      k++;
      try { await step(g, DT); } catch (e) { player.anomaly("tick-throw", (e && e.stack) || e); }
      if (k % 5 === 0) { try { g.layout.cmCheckWonders(Date.now()); } catch (e) { player.anomaly("wonders-throw", (e && e.stack) || e); } }
      try { await player.act(DT); } catch (e) { player.anomaly("act-throw", (e && e.stack) || e); }
      const stall = player.track();
      if (vtSec() - lastScan >= 30) {
        lastScan = vtSec();
        scanState(g, (bad) => player.anomaly("numeric", bad.join(" ; ")));
      }
      // Absence hors-ligne intercalée (comme un retour de veille ou un onglet rouvert).
      if (vtSec() - lastOff >= OFF_EVERY && !g.st.gamePaused && !g.st.collapseInProgress && !state.crisisLimitAnnounced) {
        lastOff = vtSec();
        const X = offList[offIdx++ % offList.length];
        const before = { cycles: state.cycles, ruins: String(state.ruins) };
        vi.setSystemTime(Date.now() + X * 1000);
        try { g.main.applyOfflineProgress(X); } catch (e) { player.anomaly("offline-throw", (e && e.stack) || e); }
        R.offline.push({ t: vtSec(), X, before, after: { cycles: state.cycles, ruins: String(state.ruins) } });
        log(`.. ${fmtT(vtSec())} HORS-LIGNE ${X}s cycles ${before.cycles}→${state.cycles} ruines ${before.ruins}→${String(state.ruins)}`);
        scanState(g, (bad) => player.anomaly("numeric-after-offline", bad.join(" ; ")));
        const rt = roundTrip(g);
        if (rt.error) player.anomaly("roundtrip-throw-offline", rt.error);
      }
      // Rechargement simulé (F5) à chaque nouveau Mythe / Grand Reset.
      const mythsDone = Object.values(state.mythsCompleted || {}).filter(Boolean).length;
      if ((mythsDone !== lastMythDone || (state.grandResetCount || 0) !== lastGrCount) && !g.st.gamePaused && !g.st.collapseInProgress) {
        const tag = mythsDone !== lastMythDone ? `myth${mythsDone}` : `gr${state.grandResetCount}`;
        lastMythDone = mythsDone; lastGrCount = state.grandResetCount || 0;
        const rt = roundTrip(g);
        if (rt.error) player.anomaly("roundtrip-throw", rt.error);
        else if (!rt.same) player.anomaly("roundtrip-diff-jalon", JSON.stringify(rt.diffs.map((d) => d.detail).flat().slice(0, 8)));
        log.dump(`${NAME}-save-${tag}.json`, { vt: vtSec(), state });
        try { setState(hydrateState(JSON.parse(JSON.stringify(state)))); invalidateRenderCache("all"); } catch (e) { player.anomaly("reload-throw", (e && e.stack) || e); }
      }
      if (vtSec() - lastReport >= 3600) {
        lastReport = vtSec();
        log(`-- ${fmtT(vtSec())} cyc=${state.cycles} ère=${state.bestEraIndex} GR=${state.grandResetCount} mythes=${mythsDone} ruines=${String(state.ruins)} inst=${(state.instability || 0).toFixed(2)} myth=${state.activeMythId || "-"}`);
      }
      if (state.finalChronicleTitle && finalAt == null) { finalAt = vtSec(); player.milestone("TITRE FINAL", state.finalChronicleTitle); log.dump(`${NAME}-save-final.json`, { vt: vtSec(), state }); }
      if (finalAt != null && vtSec() - finalAt >= POST_H * 3600) { log(`[FIN] ${POST_H} h jouées après le titre`); break; }
      // Crise terminale tenue une heure : le joueur tombe d'ordinaire aussitôt (ou
      // l'Édit après sa grâce) — passé ce délai, la cité n'a plus de sortie.
      if (state.crisisLimitAnnounced) terminalSince ??= vtSec(); else terminalSince = null;
      const terminalStuck = terminalSince != null && vtSec() - terminalSince > 3600;
      if (stall > 6 * 3600 || terminalStuck) {
        R.blocked = { t: vtSec(), cycles: state.cycles, era: state.bestEraIndex, gr: state.grandResetCount, myth: state.activeMythId, paused: g.st.gamePaused, collapse: g.st.collapseInProgress, terminal: state.crisisLimitAnnounced };
        player.anomaly("BLOCAGE", JSON.stringify(R.blocked));
        log.dump(`${NAME}-save-blocked.json`, { vt: vtSec(), state });
        break;
      }
    }
    log(`[RÉSUMÉ] VT=${fmtT(vtSec())} cycles=${state.cycles} GR=${state.grandResetCount} mythes=${Object.keys(state.mythsCompleted || {}).length} titre=${state.finalChronicleTitle || "-"}`);
    log.dump(`${NAME}-summary.json`, { vtEnd: vtSec(), final: finalAt, R: { ...R, cycles: R.cycles.slice(-200) }, consoleErrors: g.counters.error, consoleErrSamples: g.counters.errors.slice(0, 30) });

    const fatal = R.anomalies.filter((a) => FATAL.test(a.kind));
    expect(fatal, log.tail()).toEqual([]);
    expect(state.finalChronicleTitle, `titre final non atteint en ${fmtT(vtSec())}\n${log.tail()}`).toBeTruthy();
  } finally {
    restoreEnv();
  }
});
