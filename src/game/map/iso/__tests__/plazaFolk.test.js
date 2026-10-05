import { describe, it, expect, beforeEach } from "vitest";

import { CM } from "../../layout.js";
import { isoPlazaCompositions, propFootprint, footClash, personHT, plazaBases } from "../isoPlaza.js";
import { folkAt, FOLK } from "../plazaFolk.js";
import { depthOf } from "../projection.js";
import { plazaWithStreets } from "../../../../test/plaza.js";

// ── CE QUE CES TESTS PROTÈGENT ──────────────────────────────────────────────
// Raph, 2026-10-04 : les passants des places se tenaient en CERCLE, figés, devant
// les étals ou autour de la fontaine — « ça fait secte ». Ils flânent maintenant
// (plazaFolk.js) : ces gardes vérifient qu'ils BOUGENT, qu'ils CAUSENT, qu'aucun
// ne se pose sur un autre ni dans le mobilier, et que la place se renouvelle.

// Place carrée de `n` cellules entourée de rues, avec un plan qui lui donne sa sorte.
const plazaLayout = plazaWithStreets;

let stamp = 1000;
function compose(n, kind, band) {
  CM.layoutRecomputeAt = (stamp += 1);
  const comps = isoPlazaCompositions(plazaLayout(n, kind, band), band);
  expect(comps).toHaveLength(1);
  return comps[0];
}
const T = () => CM.TILE;
// Les passants à l'instant t (s), en cellules.
const at = (comp, s) => folkAt(comp.folk, s * 1000, T(), depthOf).map((r) => ({
  r, x: r.wx / T(), y: r.wy / T(), walking: r.walking, act: r.act, alpha: r.alpha,
}));

describe("les flâneurs de la place (plazaFolk)", () => {
  beforeEach(() => { Object.assign(FOLK, { on: true, slot: 30, speed: 0.27, leaveP: 0.1, viaP: 0.4, density: 1 }); });

  for (const [kind, n] of [["marche", 5], ["centrale", 5], ["marche", 4], ["jardin", 4]]) {
    describe(kind + " " + n + "×" + n, () => {
      it("plus aucun figurant figé dans le mobilier : les passants sont des flâneurs", () => {
        const comp = compose(n, kind, 3);
        expect(comp.props.some((p) => p.prop === "person")).toBe(false);
        expect(comp.folk).toBeTruthy();
        expect(comp.folk.actors.length).toBeGreaterThanOrEqual(3);
      });

      it("ils vivent au CŒUR de la place, pas sur l'anneau du bord", () => {
        const comp = compose(n, kind, 3);
        const g = comp.folk.g;
        let near = 0;
        for (let s = 0; s < g.ok.length; s += 1) {
          if (!g.ok[s]) continue;
          const x = g.x0 + ((s % g.nx) + 0.5) * 0.25, y = g.y0 + (Math.floor(s / g.nx) + 0.5) * 0.25;
          if (Math.hypot(x - comp.cxc, y - comp.cyc) < 1.6) near += 1;
        }
        expect(near).toBeGreaterThan(10);
      });

      it("ils bougent, causent, et deux arrêtés ne sont jamais l'un sur l'autre", () => {
        const comp = compose(n, kind, 3);
        let moved = 0, chats = 0, mates = 0, standingSeen = 0;
        const first = new Map(at(comp, 0).map((p) => [p.r, p]));
        for (let s = 0; s <= 900; s += 0.5) {
          const now = at(comp, s);
          const still = now.filter((p) => !p.walking);
          standingSeen += still.length;
          for (let i = 0; i < still.length; i += 1) {
            for (let j = i + 1; j < still.length; j += 1) {
              const dx = still[i].x - still[j].x, dy = still[i].y - still[j].y;
              expect(Math.hypot(dx, dy)).toBeGreaterThan(0.33);
              // … et ils se VOIENT à l'écran : côte à côte, ou nettement l'un derrière
              // l'autre — jamais le « totem » où celui de devant cache l'autre.
              expect(Math.abs(dx - dy) >= 0.29 || Math.abs(dx + dy) >= 0.59).toBe(true);
            }
          }
          chats += still.filter((p) => p.act === "chat").length;
          mates += still.filter((p) => p.act === "chat" && p.r.mate).length;
          if (s === 60) for (const p of now) { const f = first.get(p.r); if (f && Math.hypot(f.x - p.x, f.y - p.y) > 0.3) moved += 1; }
        }
        expect(standingSeen).toBeGreaterThan(0);
        expect(moved).toBeGreaterThanOrEqual(2);
        expect(chats).toBeGreaterThan(0);
        expect(mates).toBeGreaterThan(0);
      });

      it("personne ne marche dans la base d'un objet, ni ne s'arrête dans son image", () => {
        const comp = compose(n, kind, 3);
        // Arrêté : hors de l'empreinte ÉCRAN du mobilier (le filet de la composition).
        const obst = comp.props.filter((p) => p.prop !== "garland" && !p.front)
          .map((p) => propFootprint(p.wx / T(), p.wy / T(), p.prop, p.hT));
        // En marche : hors de la BASE au sol (on passe devant une fontaine, pas dedans).
        const bases = plazaBases(comp.props, comp.lamps, T());
        const pH = personHT();
        // S'ASSEOIR (§8 de PLAN-COMPORTEMENTS) : on s'arrête SUR un banc, et les derniers pas
        // pour y arriver entrent dans sa base — seuls ceux-là, et seulement contre un banc.
        const seats = [...comp.folk.posts[0].seat, ...comp.folk.posts[1].seat];
        const nearSeat = (p) => seats.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 0.4);
        const benchObst = comp.props.filter((p) => p.prop !== "garland" && !p.front && p.prop !== "bench")
          .map((p) => propFootprint(p.wx / T(), p.wy / T(), p.prop, p.hT));
        const benchBases = plazaBases(comp.props.filter((p) => p.prop !== "bench"), comp.lamps, T());
        for (let s = 0; s <= 600; s += 0.25) {
          for (const p of at(comp, s)) {
            if (p.alpha < 1) continue;                        // sur la rue, en fondu
            const seated = p.act === "seat", toSeat = nearSeat(p);
            if (p.walking) {
              const B = toSeat ? benchBases : bases;
              expect(B.some((b) => Math.abs(p.x - b.cx) < b.ex && Math.abs(p.y - b.cy) < b.ey)).toBe(false);
            } else {
              const f = propFootprint(p.x, p.y, "person", pH);
              expect((seated ? benchObst : obst).some((o) => footClash(f, o, 0.85))).toBe(false);
            }
          }
        }
      });

      it("la place se renouvelle quand une rue y mène : on la quitte, d'autres arrivent", () => {
        const comp = compose(n, kind, 3);
        if (!comp.folk.exits.length) return;                  // enclos de mobilier : on reste
        const seen = new Set();
        let fading = 0;
        for (let s = 0; s <= 1200; s += 1) {
          for (const p of at(comp, s)) { seen.add(p.r.figSeed); if (p.alpha < 1) fading += 1; }
        }
        expect(seen.size).toBeGreaterThan(comp.folk.actors.length);
        expect(fading).toBeGreaterThan(0);
      });
    });
  }

  it("même instant, mêmes poses (aucun état)", () => {
    const comp = compose(5, "marche", 3);
    const a = at(comp, 123.4).map((p) => [p.x, p.y, p.r.dir]);
    at(comp, 999);
    const b = at(comp, 123.4).map((p) => [p.x, p.y, p.r.dir]);
    expect(b).toEqual(a);
  });

  it("pas de cercle : les arrêtés du marché ne sont pas tous à la même distance du centre", () => {
    const comp = compose(5, "marche", 3);
    let spread = 0, samples = 0;
    for (let s = 0; s <= 600; s += 5) {
      const still = at(comp, s).filter((p) => !p.walking);
      if (still.length < 4) continue;
      const r = still.map((p) => Math.hypot(p.x - comp.cxc, p.y - comp.cyc));
      spread += Math.max(...r) - Math.min(...r);
      samples += 1;
    }
    expect(samples).toBeGreaterThan(0);
    expect(spread / samples).toBeGreaterThan(0.8);
  });
});
