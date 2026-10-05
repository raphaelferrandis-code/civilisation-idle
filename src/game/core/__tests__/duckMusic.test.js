// duckMusic (audit 2026-10-05, BUG-84) : le dernier appel écrasait le précédent.
// La roue des Plaisirs (~1,4 s) pendant la mélodie de la scène (~6 s) faisait
// remonter la musique au bout de 1,4 s, par-dessus la mélodie encore en cours.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as main from "../main.js";

// Un faux lecteur : seul le volume appliqué nous intéresse. Le lecteur de main.js
// n'est pas exporté : on garde chaque instance construite.
const lecteurs = [];
class FakeAudio {
  constructor(url) { this.url = url; this.volume = 1; this.dataset = {}; lecteurs.push(this); }
  play() { return Promise.resolve(); }
  pause() {}
}

beforeAll(() => {
  vi.useFakeTimers();
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("document", { hidden: false, addEventListener() {}, removeEventListener() {} });
  main.initAudio();
  main.setMusicVolume(1);
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("duckMusic — la remontée attend l'échéance la plus tardive", () => {
  it("un appel court après un appel long ne raccourcit pas l'effacement", () => {
    const lecteur = lecteurs[0];
    expect(lecteur).toBeInstanceOf(FakeAudio);
    main.duckMusic(6000);          // la mélodie de la scène
    vi.advanceTimersByTime(300);
    expect(lecteur.volume).toBeCloseTo(0.2, 5);
    main.duckMusic(1400);          // la roue des Plaisirs, en plein milieu
    vi.advanceTimersByTime(3000);  // ~3,3 s : l'ancien code était déjà remonté
    expect(lecteur.volume).toBeCloseTo(0.2, 5);
    vi.advanceTimersByTime(2700 + 1300); // échéance de la mélodie + rampe de remontée
    expect(lecteur.volume).toBeCloseTo(1, 5);
  });

  it("un appel plus long prolonge l'effacement en cours", () => {
    const lecteur = lecteurs[0];
    main.duckMusic(1000);
    vi.advanceTimersByTime(300);
    main.duckMusic(4000);
    vi.advanceTimersByTime(2500);
    expect(lecteur.volume).toBeCloseTo(0.2, 5);
    vi.advanceTimersByTime(1500 + 1300);
    expect(lecteur.volume).toBeCloseTo(1, 5);
  });
});
