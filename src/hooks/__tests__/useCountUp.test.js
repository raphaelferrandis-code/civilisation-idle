/**
 * LES CADRANS NE SE RE-RENDENT QUE QUAND L'ÉCRAN CHANGE (audit du 2026-10-05, PERF-39).
 * ---------------------------------------------------------------------------
 * La durée de l'interpolation (1100 ms) déborde volontairement le tick d'1 s :
 * la boucle rAF de useCountUp ne s'arrête donc jamais, et elle appelait
 * setDisplay à CHAQUE image — 60 rendus React par seconde et par cadran (cinq
 * dans la barre du haut), même quand aucun chiffre ne changeait, même avec
 * « Mouvement : Aucune ». Ici : la clé `quantize` limite les rendus aux
 * changements visibles, la dernière image rend toujours la cible exacte (état
 * de repos des cadrans), et le cran « Aucune » bascule directement.
 *
 * Pas de DOM sous Vitest (environnement node) : un mini-moteur de hooks fait
 * tourner le hook seul, avec une horloge et un rAF pilotés à la main.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const eng = vi.hoisted(() => ({ slots: [], idx: 0, dirty: false, renders: 0, fx: [], comp: null, props: null, out: undefined }));

vi.mock("react", () => {
  const useState = (init) => {
    const i = eng.idx++;
    if (!eng.slots[i]) {
      const s = { v: typeof init === "function" ? init() : init };
      s.set = (v) => {
        const nv = typeof v === "function" ? v(s.v) : v;
        if (!Object.is(nv, s.v)) { s.v = nv; eng.dirty = true; }
      };
      eng.slots[i] = s;
    }
    return [eng.slots[i].v, eng.slots[i].set];
  };
  const useRef = (init) => {
    const i = eng.idx++;
    if (!eng.slots[i]) eng.slots[i] = { current: init };
    return eng.slots[i];
  };
  const useEffect = (fn, deps) => {
    const i = eng.idx++;
    const s = eng.slots[i] || (eng.slots[i] = { deps: undefined, cleanup: undefined, ran: false });
    const changed = !s.ran || !deps || deps.some((d, k) => !Object.is(d, s.deps[k]));
    if (changed) eng.fx.push(() => { if (s.cleanup) s.cleanup(); s.ran = true; s.deps = deps; s.cleanup = fn(); });
  };
  return { useState, useRef, useEffect, useLayoutEffect: useEffect };
});

import { useCountUp } from "../useCountUp.js";
import { setAmbianceMode } from "../../game/map/ambianceMode.js";

// Les « composants » rendus par le mini-moteur : la valeur affichée, sans clé,
// avec une clé à l'unité, à la centaine.
const SansCle = ({ v }) => useCountUp(v, 1100);
const ParUnite = ({ v }) => useCountUp(v, 1100, (n) => Math.floor(n));
const ParCentaine = ({ v }) => useCountUp(v, 1100, (n) => Math.floor(n / 100));

// Rend le « composant » jusqu'à stabilité (un setState dans un effet re-rend).
function render(props) {
  if (props) eng.props = props;
  let guard = 0;
  do {
    eng.idx = 0;
    eng.dirty = false;
    eng.fx = [];
    eng.out = eng.comp(eng.props);
    eng.renders += 1;
    for (const f of eng.fx) f();
  } while (eng.dirty && ++guard < 50);
  return eng.out;
}

let clock = 0;
let rafQ = new Map();
let rafId = 0;
// Une image : l'horloge avance, les rappels rAF en attente tournent, puis
// React re-rend si un état a changé.
function frame(dt = 1000 / 60) {
  clock += dt;
  const q = rafQ;
  rafQ = new Map();
  for (const cb of q.values()) cb(clock);
  if (eng.dirty) render();
}
function frames(n) { for (let i = 0; i < n; i++) frame(); }

beforeEach(() => {
  eng.slots = []; eng.renders = 0; eng.props = null;
  clock = 0; rafQ = new Map(); rafId = 0;
  vi.stubGlobal("requestAnimationFrame", (cb) => { rafId += 1; rafQ.set(rafId, cb); return rafId; });
  vi.stubGlobal("cancelAnimationFrame", (id) => { rafQ.delete(id); });
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  setAmbianceMode("full");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setAmbianceMode("full");
});

describe("useCountUp — rendus limités aux changements visibles", () => {
  it("sans clé : un rendu par image (le comportement d'avant, gardé pour qui n'en passe pas)", () => {
    eng.comp = SansCle;
    render({ v: 0 });
    render({ v: 10 });
    const before = eng.renders;
    frames(68);
    expect(eng.renders - before).toBeGreaterThan(60);
    expect(eng.out).toBe(10);
  });

  it("avec une clé : un rendu par valeur affichée, et la cible exacte à la fin", () => {
    eng.comp = ParUnite;
    render({ v: 0 });
    render({ v: 10 });
    const before = eng.renders;
    const seen = [];
    for (let i = 0; i < 70; i++) { frame(); seen.push(eng.out); }
    // 0 → 10 en 66 images : 10 changements de chiffre + la première image
    // (toujours rendue) + la cible exacte.
    expect(eng.renders - before).toBeLessThanOrEqual(13);
    expect(eng.out).toBe(10);
    // Chaque valeur entière a bien été montrée : aucune image visible sautée.
    expect(new Set(seen.map(Math.floor))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  });

  it("tick suivant en cours de route : on repart de la position réelle, pas de la dernière rendue", () => {
    eng.comp = ParCentaine;
    render({ v: 0 });
    render({ v: 100 });
    frames(30); // ~45 % du chemin, aucune centaine franchie : rien de re-rendu depuis
    render({ v: 200 });
    frame();
    // Repartir de 0 (la dernière valeur rendue) donnerait ~1,5 ; la position
    // réelle (~45) donne ~49.
    expect(eng.out).toBeGreaterThan(40);
    expect(eng.out).toBeLessThan(100);
  });

  it("« Mouvement : Aucune » : la cible s'affiche d'un coup, aucune boucle rAF", () => {
    setAmbianceMode("none");
    eng.comp = ParUnite;
    render({ v: 0 });
    render({ v: 10 });
    expect(eng.out).toBe(10);
    expect(rafQ.size).toBe(0);
  });
});
