// ÉCONOMIE D'ÉNERGIE DE LA CARTE (energySaver.js, audit du 2026-10-05, PERF-5).
//
// La boucle de la carte ne freinait que par le préréglage Qualité et sous une
// modale : fenêtre sans focus ou joueur parti, elle tournait à 30-60 i/s pendant
// des heures. Ces tests fixent les deux paliers (12 i/s sans focus, 20 i/s joueur
// absent caméra posée), le retour à la vsync suivante au premier évènement, et
// ce qui ne doit JAMAIS être bridé (interrupteur éteint, chute, cap déjà plus lent).
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ENERGY_TUNE, energyFrameMs, noteMapInput, noteMapCamera, mapFrameMs, setEnergySaver,
} from "../energySaver.js";

const HIGH = 1000 / 60, BAL = 1000 / 30;
const MIN = 60000;
const base = { saver: true, focused: true, sinceInput: 0, sinceCam: 0, show: false };

afterEach(() => {
  vi.unstubAllGlobals();
  setEnergySaver(true);
});

describe("cap de frame effectif — les deux paliers", () => {
  it("joueur présent, fenêtre au premier plan : le cap du préréglage, intact", () => {
    expect(energyFrameMs(HIGH, base)).toBe(HIGH);
    expect(energyFrameMs(BAL, { ...base, sinceInput: 2 * MIN, sinceCam: 2 * MIN })).toBe(BAL);
  });

  it("fenêtre sans focus, plus d'entrée depuis 5 s : 12 i/s", () => {
    const o = { ...base, focused: false, sinceInput: ENERGY_TUNE.recentMs };
    expect(energyFrameMs(HIGH, o)).toBeCloseTo(1000 / 12, 6);
    expect(energyFrameMs(BAL, o)).toBeCloseTo(1000 / 12, 6);
  });

  it("fenêtre sans focus mais souris qui la survole : pleine cadence", () => {
    expect(energyFrameMs(HIGH, { ...base, focused: false, sinceInput: 1200 })).toBe(HIGH);
  });

  it("3 min sans entrée, caméra posée : 20 i/s", () => {
    const o = { ...base, sinceInput: 3 * MIN, sinceCam: 3 * MIN };
    expect(energyFrameMs(HIGH, o)).toBeCloseTo(1000 / 20, 6);
    expect(energyFrameMs(BAL, o)).toBeCloseTo(1000 / 20, 6);
  });

  it("3 min sans entrée mais caméra qui bouge (habitant suivi, recentrage) : pleine cadence", () => {
    expect(energyFrameMs(HIGH, { ...base, sinceInput: 5 * MIN, sinceCam: 200 })).toBe(HIGH);
  });

  it("2 min 59 sans entrée : pas encore absent", () => {
    expect(energyFrameMs(HIGH, { ...base, sinceInput: 3 * MIN - 1000, sinceCam: 3 * MIN })).toBe(HIGH);
  });

  it("le cap n'est jamais ABAISSÉ : un préréglage déjà plus lent que le palier reste tel quel", () => {
    const lent = 1000 / 8;
    expect(energyFrameMs(lent, { ...base, focused: false, sinceInput: 10 * MIN, sinceCam: 10 * MIN })).toBe(lent);
  });

  it("interrupteur éteint, ou chute en cours : rien n'est bridé", () => {
    const absent = { ...base, focused: false, sinceInput: 10 * MIN, sinceCam: 10 * MIN };
    expect(energyFrameMs(HIGH, { ...absent, saver: false })).toBe(HIGH);
    expect(energyFrameMs(HIGH, { ...absent, show: true })).toBe(HIGH);
  });
});

// La boucle rAF telle que frameBody la mène : une vsync toutes les 16,67 ms, une
// frame rendue si `now - last >= cap - 8` (tolérance d'une demi-vsync).
function runLoop({ fromMs, toMs, capAt }) {
  const VS = 1000 / 60;
  let last = fromMs - 1000, rendered = [];
  for (let now = fromMs; now < toMs; now += VS) {
    if (now - last < capAt(now) - 8) continue;
    last = now;
    rendered.push(now);
  }
  return rendered;
}

describe("veille branchée sur la boucle : cadences réelles et retour immédiat", () => {
  it("relevé des cadences sur 10 s : 60 / 12 / 20 i/s", () => {
    vi.stubGlobal("document", { hasFocus: () => true });
    noteMapInput(0);
    noteMapCamera({ x: 1, y: 2, zoom: 1 }, 0);
    const actif = runLoop({ fromMs: 0, toMs: 10000, capAt: (t) => mapFrameMs(HIGH, t) });
    expect(actif.length).toBeGreaterThanOrEqual(598);

    vi.stubGlobal("document", { hasFocus: () => false });
    const flou = runLoop({ fromMs: 10000, toMs: 20000, capAt: (t) => mapFrameMs(HIGH, t) });
    expect(flou.length).toBeGreaterThanOrEqual(118);
    expect(flou.length).toBeLessThanOrEqual(122);

    vi.stubGlobal("document", { hasFocus: () => true });
    const absent = runLoop({ fromMs: 4 * MIN, toMs: 4 * MIN + 10000, capAt: (t) => mapFrameMs(HIGH, t) });
    expect(absent.length).toBeGreaterThanOrEqual(198);
    expect(absent.length).toBeLessThanOrEqual(202);
  });

  it("le premier évènement rend la cadence normale à la vsync suivante", () => {
    vi.stubGlobal("document", { hasFocus: () => false });
    noteMapInput(0);
    noteMapCamera({ x: 5, y: 5, zoom: 1 }, 0);
    const tEvt = 20003;   // un mouvement de souris entre deux vsyncs, en plein palier lent
    const frames = runLoop({
      fromMs: 10000, toMs: 21000,
      capAt: (t) => { if (t >= tEvt) noteMapInput(tEvt); return mapFrameMs(HIGH, t); },
    });
    const next = frames.find((t) => t >= tEvt);
    expect(next - tEvt).toBeLessThanOrEqual(1000 / 60 + 1e-6);
    // … et la suite coule à pleine cadence.
    const after = frames.filter((t) => t >= tEvt);
    expect(after.length).toBeGreaterThanOrEqual(58);
  });

  it("une caméra qui bouge réarme la pleine cadence même joueur absent", () => {
    vi.stubGlobal("document", { hasFocus: () => true });
    noteMapInput(0);
    const cam = { x: 0, y: 0, zoom: 1 };
    noteMapCamera(cam, 0);
    expect(mapFrameMs(HIGH, 5 * MIN)).toBeCloseTo(50, 6);
    cam.x += 3;                         // le suivi d'un habitant déplace la caméra
    noteMapCamera(cam, 5 * MIN);
    expect(mapFrameMs(HIGH, 5 * MIN + 16)).toBe(HIGH);
    expect(mapFrameMs(HIGH, 5 * MIN + ENERGY_TUNE.stillMs)).toBeCloseTo(50, 6);
  });

  it("interrupteur des Options : éteint, plus aucun bridage ; persisté hors save", () => {
    const store = new Map();
    vi.stubGlobal("localStorage", { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) });
    vi.stubGlobal("document", { hasFocus: () => false });
    noteMapInput(0);
    setEnergySaver(false);
    expect(store.get("civ-opt-energy-saver")).toBe("false");
    expect(mapFrameMs(HIGH, 10 * MIN)).toBe(HIGH);
    setEnergySaver(true);
    expect(store.get("civ-opt-energy-saver")).toBe("true");
    expect(mapFrameMs(HIGH, 10 * MIN)).toBeCloseTo(1000 / 12, 6);
  });
});

describe("joueur absent : le souffle de la boutique se fige (PERF-65 c)", () => {
  // <html> réduit à ses attributs : c'est tout ce que lit la feuille de style.
  function fauxDocument() {
    const attrs = new Map();
    return {
      hasFocus: () => true,
      documentElement: {
        setAttribute: (k, v) => attrs.set(k, v),
        removeAttribute: (k) => attrs.delete(k),
        hasAttribute: (k) => attrs.has(k),
      },
    };
  }

  it("data-away après 3 min sans entrée, retiré dès la première entrée", () => {
    const doc = fauxDocument();
    vi.stubGlobal("document", doc);
    const away = () => doc.documentElement.hasAttribute("data-away");
    noteMapInput(0);
    expect(away()).toBe(false);
    mapFrameMs(HIGH, ENERGY_TUNE.idleMs - 1000);
    expect(away()).toBe(false);
    mapFrameMs(HIGH, ENERGY_TUNE.idleMs);
    expect(away()).toBe(true);
    // La caméra qui bouge ne compte pas : seul le joueur revient.
    noteMapCamera({ x: 9, y: 9, zoom: 2 }, ENERGY_TUNE.idleMs + 50);
    expect(away()).toBe(true);
    noteMapInput(ENERGY_TUNE.idleMs + 100);           // un mouvement de souris
    expect(away()).toBe(false);                       // sans attendre la frame suivante
    mapFrameMs(HIGH, ENERGY_TUNE.idleMs + 200);
    expect(away()).toBe(false);
  });

  it("interrupteur éteint : jamais absent, et l'éteindre efface l'état", () => {
    const store = new Map();
    vi.stubGlobal("localStorage", { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) });
    const doc = fauxDocument();
    vi.stubGlobal("document", doc);
    noteMapInput(0);
    mapFrameMs(HIGH, 10 * MIN);
    expect(doc.documentElement.hasAttribute("data-away")).toBe(true);
    setEnergySaver(false);
    expect(doc.documentElement.hasAttribute("data-away")).toBe(false);
    mapFrameMs(HIGH, 20 * MIN);
    expect(doc.documentElement.hasAttribute("data-away")).toBe(false);
    setEnergySaver(true);
    noteMapInput(20 * MIN);
  });

  it("la feuille de style met le souffle en pause sous data-away", () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "styles", "purchase.css"), "utf8");
    expect(css).toMatch(/:root\[data-away\] \.purchase-row\.pr-pulse \.btn-purchase:not\(:disabled\) \{\s*animation-play-state: paused;/);
  });
});

describe("activée par défaut, éteinte seulement sur choix explicite", () => {
  it("sans réglage enregistré : activée ; « false » enregistré : éteinte", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    vi.resetModules();
    expect((await import("../energySaver.js")).energySaver).toBe(true);
    vi.stubGlobal("localStorage", { getItem: () => "false", setItem: () => {} });
    vi.resetModules();
    expect((await import("../energySaver.js")).energySaver).toBe(false);
  });
});

describe("câblage dans la boucle de la carte", () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "cityMapRuntime.js"), "utf8");

  it("le cap de frame passe par mapFrameMs, chute exemptée, capture toujours prioritaire", () => {
    // (tolérance : une demi-vsync mesurée depuis PERF-57, cf. frameCadence.js)
    expect(src).toMatch(/now - last < mapFrameMs\(cmFrameMs, now, !!CHUTE\.act\) - vsyncEst\.tolerance\(\) && !CM\.capture/);
  });

  it("la caméra est relevée après son clamp, et les entrées le sont sur toute la fenêtre", () => {
    expect(src).toMatch(/cmClampCamera\(\);\s*\n\s*noteMapCamera\(CM\.cam, now\)/);
    for (const t of ["pointermove", "pointerdown", "keydown", "wheel", "focus"]) expect(src).toContain(`"${t}"`);
    expect(src).toMatch(/addEventListener\(type, markInput, \{ capture: true, passive: true, signal \}\)/);
  });

  it("une frame forcée (harnais, pane cachée sans focus) n'est jamais refusée par l'économie", () => {
    expect(src).toMatch(/CM\.forceFrame = \(\) => \{[^\n]*noteMapInput\(performance\.now\(\)\); frame\(performance\.now\(\)\);/);
    // Horloge factice du harnais : +33,4 ms par appel, page sans focus depuis longtemps.
    vi.stubGlobal("document", { hasFocus: () => false });
    noteMapInput(0);
    let last = 10 * MIN, rendered = 0;
    for (let i = 1; i <= 30; i += 1) {
      const t = 10 * MIN + i * 33.4;
      noteMapInput(t);                                   // ce que fait forceFrame avant frame()
      if (t - last < mapFrameMs(HIGH, t) - 8) continue;
      last = t; rendered += 1;
    }
    expect(rendered).toBe(30);
  });

  it("le pas d'animation reste borné à 1/30 s (aucun saut de véhicule en mode économie)", () => {
    expect(src).toContain("const dt = Math.min(1 / 30, (now - last) / 1000)");
  });
});
