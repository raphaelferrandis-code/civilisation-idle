import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { CM } from "../layout.js";
import { isoFlag, worldToScreen } from "../iso/projection.js";
import { visibleT, riverLifeTune } from "../iso/isoRiverLife.js";

// La vie de surface (pluie sur l'eau, feuilles à la dérive, saut de poisson) est
// semée le long du ruban du fleuve. Or ce ruban TRAVERSE TOUTE LA CARTE alors
// qu'on n'en voit qu'une fraction au zoom de jeu.
//
// Premier jet : positions tirées sur [0,1]. Résultat mesuré en jeu, compteur à
// l'appui — 45 impacts de pluie sur 46 tombaient hors champ, un seul devant les
// yeux. L'écran restait lisse sous l'averse et rien ne le disait : une couche
// qui ne dessine pas et une couche qui dessine ailleurs donnent la même image.
//
// `visibleT` borne la plage à ce qui est réellement affiché. Ce test la pilote
// sur un ruban synthétique, avec un CONTRÔLE NÉGATIF qui rejoue l'ancien tirage
// pour montrer l'écart au lieu de le raconter.

// Ruban droit de 200 échantillons, long de 200 tuiles vers l'est.
const SM = Array.from({ length: 200 }, (_, i) => ({ x: i, y: 50, hw: 3 }));
const T = 32;

function setupCam({ zoom, cx }) {
  CM.TILE = T;
  CM.cw = 1200; CM.ch = 600;
  CM.cam = { x: cx * T, y: 50 * T, zoom };
}

describe("vie de surface — on sème là où on regarde", () => {
  const savedIso = isoFlag.on;
  beforeEach(() => { isoFlag.on = true; CM.iso = true; });
  afterEach(() => { isoFlag.on = savedIso; CM.iso = savedIso; });

  it("ne retient qu'une PORTION du ruban au zoom de jeu", () => {
    setupCam({ zoom: 3, cx: 100 });
    const v = visibleT(SM, T);
    expect(v).not.toBeNull();
    // On voit une tranche, pas tout le fleuve.
    expect(v.t1 - v.t0).toBeLessThan(0.5);
    // Et cette tranche est bien centrée sur là où pointe la caméra (t ≈ 0,5).
    expect(v.t0).toBeLessThan(0.5);
    expect(v.t1).toBeGreaterThan(0.5);
  });

  it("le tirage BORNÉ met tout à l'écran, le tirage global non", () => {
    setupCam({ zoom: 3, cx: 100 });
    const v = visibleT(SM, T);
    const N = 200;
    // Reproduit ce que fait le semis : t → point du ruban → écran, par la VRAIE
    // projection du jeu (pas une approximation, sinon on mesurerait autre chose
    // que ce que le joueur voit).
    const onScreen = (t) => {
      const i = Math.min(SM.length - 1, Math.round(t * (SM.length - 1)));
      const p = worldToScreen(SM[i].x * T, SM[i].y * T);
      return p.x > -80 && p.x < CM.cw + 80 && p.y > -80 && p.y < CM.ch + 80;
    };
    let borne = 0, global = 0;
    for (let k = 0; k < N; k += 1) {
      const u = (k + 0.5) / N;
      if (onScreen(v.t0 + u * (v.t1 - v.t0))) borne += 1;
      if (onScreen(u)) global += 1;                    // CONTRÔLE : l'ancien tirage
    }
    // Le tirage borné met l'écrasante majorité dans le champ (la marge de
    // sécurité de visibleT en laisse déborder quelques-uns, c'est voulu).
    expect(borne).toBeGreaterThan(N * 0.85);
    // L'ancien en plaçait une petite minorité — c'est le bug qu'on a payé, et
    // c'est ce rapport-là qui fait la différence entre une eau criblée et une
    // eau lisse sous l'averse.
    expect(global).toBeLessThan(N * 0.5);
    expect(borne).toBeGreaterThan(global * 2);
  });

  it("rend null quand le fleuve est hors champ", () => {
    setupCam({ zoom: 3, cx: 100 });
    CM.cam.y = 9000 * T;                               // caméra très loin du ruban
    expect(visibleT(SM, T)).toBeNull();
  });

  it("plus on dézoome, plus la tranche est large", () => {
    setupCam({ zoom: 3, cx: 100 });
    const serre = visibleT(SM, T);
    setupCam({ zoom: 0.6, cx: 100 });
    const large = visibleT(SM, T);
    expect(large.t1 - large.t0).toBeGreaterThan(serre.t1 - serre.t0);
  });
});

describe("vie de surface — molette", () => {
  it("chaque effet se coupe séparément", () => {
    const saved = { ...riverLifeTune };
    try {
      for (const key of ["rain", "leaves", "props", "jumps"]) {
        expect(riverLifeTune[key]).toBeGreaterThan(0);
      }
      expect(riverLifeTune.on).toBe(true);
    } finally {
      Object.assign(riverLifeTune, saved);
    }
  });
});
