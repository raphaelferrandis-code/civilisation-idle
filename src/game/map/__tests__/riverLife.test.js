import { describe, it, expect } from "vitest";

import { CM } from "../layout.js";
import { worldToScreen } from "../iso/projection.js";
import { visibleT, fleePos } from "../iso/isoRiverLife.js";
import { VIE } from "../iso/isoVie.js";

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
  // Ce bloc armait `isoFlag`/`CM.iso` : parti avec le drapeau à l'étape 7
  // (2026-08-23). Le losange est désormais la seule projection.

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
  // La molette de l'eau vit dans __vie (isoVie.js) depuis la petite vie du
  // 2026-10-01 : chaque effet a la sienne, et l'ancienne `__riverLife` est partie
  // avec l'ancienne vie.
  it("chaque effet se coupe séparément", () => {
    for (const key of ["pluie", "feuilles", "sauts", "poissons", "canards", "cygnes", "herons", "libellules", "eclats"]) {
      expect(VIE[key]).toBeGreaterThan(0);
    }
    expect(VIE.on).toBe(true);
    // `props` a disparu avec les bouées, rejetées par Raph : illisibles à
    // trois pixels sur l'eau. La molette ne doit pas survivre à son effet.
    expect(VIE.props).toBeUndefined();
    // Le mode « ancien » a servi à l'A/B du pilote ; il est parti avec lui.
    expect(VIE.ancien).toBeUndefined();
  });
});

// Retour Raph (2026-10-03, le bac passait sur un cygne) : « il faut que les oiseaux
// s'éloignent quand il s'approche ». Fleuve vers l'est (y = 50, demi-largeur 3) ; la
// bête se promène en `base`, une coque arrive. 60 images par seconde.
describe("canards et cygnes — ils s'écartent des bateaux", () => {
  const FR = { x: 100, y: 50, tx: 1, ty: 0, nx: 0, ny: 1, hw: 3 };
  const LIM = Math.min(3 * 0.82, 3 - 0.75);
  const hull = (o) => ({ id: 1, hx: 1, hy: 0, half: 0.65, need: 0.2 + 1.0, stopped: false, ...o });
  // Rejoue `sec` secondes ; `at(s)` place la coque au temps s ; rend les poses.
  function play(key, base, sec, at) {
    const out = [];
    for (let f = 0; f <= sec * 60; f += 1) {
      const s = f / 60, h = at(s);
      const P = fleePos(key, base, FR, LIM, h ? [h] : [], 1000 + s * 1000);
      out.push({ s, P, h });
    }
    return out;
  }

  it("un marchand qui descend le fleuve la pousse vers la berge, puis elle revient", () => {
    const base = { x: 100, y: 50.8 };
    const ship = (s) => hull({ x: 90 + s, y: 50.6 });           // 1 tuile/s, sur sa voie
    const poses = play("t-marchand", base, 40, (s) => (s < 25 ? ship(s) : null));
    for (const { P, h } of poses) {
      expect(Math.abs(P.y - 50)).toBeLessThanOrEqual(LIM + 1e-6);   // toujours dans l'eau
      if (h && Math.abs(h.x - P.x) < h.half) expect(P.y - h.y).toBeGreaterThan(h.need - 0.15);
    }
    // Sans bateau, elle n'avait aucune raison de bouger ; après lui, elle est rentrée.
    expect(Math.abs(poses[0].P.y - base.y)).toBeLessThan(1e-9);
    const last = poses[poses.length - 1].P;
    expect(Math.hypot(last.x - base.x, last.y - base.y)).toBeLessThan(0.1);
  });

  it("le bac qui traverse la chasse LE LONG du fleuve, pas vers la berge", () => {
    const base = { x: 100, y: 50.8 };
    const ferry = (s) => hull({ id: 2, x: 100.2, y: 47.5 + 0.42 * s, hx: 0, hy: 1, half: 0.47, need: 0.235 + 1.0 });
    let minGap = Infinity, maxLat = 0;
    for (const { P, h } of play("t-bac", base, 16, ferry)) {
      if (Math.abs(h.y - P.y) < h.half) minGap = Math.min(minGap, Math.abs(P.x - h.x));
      maxLat = Math.max(maxLat, Math.abs(P.y - base.y));
    }
    expect(minGap).toBeGreaterThan(1.0);
    expect(maxLat).toBeLessThan(0.05);
  });

  it("coincée entre une coque et la berge, elle passe de l'autre côté", () => {
    const base = { x: 100, y: 52.0 };                           // près de la berge +1
    const ship = (s) => hull({ id: 3, x: 92 + s, y: 51.5 });    // la voie la plus à droite
    let abeam = null;
    for (const { P, h } of play("t-berge", base, 12, ship)) {
      expect(Math.abs(P.y - 50)).toBeLessThanOrEqual(LIM + 1e-6);
      if (Math.abs(h.x - P.x) < 0.1) abeam = P;
    }
    expect(abeam).not.toBeNull();
    expect(abeam.y).toBeLessThan(51.5 - 1.0);
  });

  it("à `now` figé (capture), l'écart n'avance pas", () => {
    const base = { x: 100, y: 50.8 };
    const h = hull({ x: 100, y: 50.6 });
    const a = fleePos("t-fige", base, FR, LIM, [h], 5000);
    const b = fleePos("t-fige", base, FR, LIM, [h], 5000);
    expect(a.y).toBe(base.y);
    expect(b.y).toBe(base.y);
  });
});
