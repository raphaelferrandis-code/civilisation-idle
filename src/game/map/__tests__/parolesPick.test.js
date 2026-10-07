import { describe, it, expect } from "vitest";

import { PAROLES, JOB_GROUP } from "../../data/paroles.js";
import { JOBS } from "../citizenIdentity.js";
import { pickParole, parolesEligible, resolveLines } from "../paroles/pick.js";

// ÉCOUTER (docs/PLAN-ECOUTER-PARLER.md, lot 1) : le catalogue et le choix d'un échange.

const NAMES = ["a", "b", "conjoint", "enfant", "hote"];
const adult = (o = {}) => ({ fem: false, child: false, old: false, job: null, traits: [], family: "single", kids: 0, ...o });
const ctxOf = (o = {}) => ({
  kind: "thought", band: 2, night: false, precip: null, riot: false, wonder: false, prosper: false, cause: null,
  a: adult(), b: null, rel: null, kidIs: null, names: { a: "Garin" }, ...o,
});
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

describe("le catalogue", () => {
  it("chaque entrée a sa forme : un id unique, un genre, une couche, des répliques en deux langues", () => {
    const ids = new Set();
    for (const e of PAROLES) {
      expect(ids.has(e.id), e.id).toBe(false);
      ids.add(e.id);
      expect(["chat", "thought"]).toContain(e.kind);
      expect([1, 2]).toContain(e.layer);
      expect(e.lines.length).toBeGreaterThan(0);
      for (const l of e.lines) {
        expect(l.en, e.id).toBeTruthy();
        expect(!!l.fr || (!!l.m && !!l.f), e.id).toBe(true);
        if (e.kind === "chat") expect(["a", "b", "parent", "kid"]).toContain(l.who);
      }
      if (e.kind === "chat") expect(e.lines.length, e.id).toBeGreaterThanOrEqual(2);
      if (e.when && e.when.job) for (const g of e.when.job) expect(Object.values(JOB_GROUP)).toContain(g);
    }
  });

  it("les règles d'écriture du jeu : ni tiret, ni « ! », ni points de suspension, l'apostrophe typographique", () => {
    for (const e of PAROLES) {
      for (const l of e.lines) {
        for (const t of [l.fr, l.m, l.f, l.en].filter(Boolean)) {
          expect(t, e.id).not.toMatch(/[—–!…]|\.\.\./);
          expect(t, e.id).not.toMatch(/'/);
          for (const m of t.matchAll(/\{(\w+)\}/g)) expect(NAMES, e.id).toContain(m[1]);
        }
      }
    }
  });

  it("chaque métier a sa famille", () => {
    for (const key of Object.keys(JOBS)) expect(JOB_GROUP[key], key).toBeTruthy();
  });

  it("à chaque âge, n'importe quel passant a des pensées et n'importe quelle paire des causettes", () => {
    for (let band = 0; band <= 9; band += 1) {
      const t = PAROLES.filter((e) => parolesEligible(e, ctxOf({ band })));
      expect(t.length, `pensées, âge ${band}`).toBeGreaterThanOrEqual(3);
      const c = PAROLES.filter((e) => parolesEligible(e, ctxOf({ band, kind: "chat", b: adult(), names: { a: "Garin", b: "Oda" } })));
      expect(c.length, `causettes, âge ${band}`).toBeGreaterThanOrEqual(2);
      const kid = PAROLES.filter((e) => parolesEligible(e, ctxOf({ band, a: adult({ child: true, family: "child" }) })));
      expect(kid.length, `pensées d'enfant, âge ${band}`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("le choix", () => {
  it("on n'entend parler que de ce qu'il a : le célibataire ne parle pas de sa femme", () => {
    const married = ctxOf({ a: adult({ family: "married", kids: 2 }), names: { a: "Garin", conjoint: "Oda", enfant: "Tassin" } });
    const single = ctxOf();
    const soir = PAROLES.find((e) => e.id === "t-couple-soir");
    expect(parolesEligible(soir, married)).toBe(true);
    expect(parolesEligible(soir, single)).toBe(false);
    // Sans prénom à citer, l'entrée n'est pas choisie.
    expect(parolesEligible(soir, { ...married, names: { a: "Garin" } })).toBe(false);
  });

  it("un enfant ne pense pas à la paie, et l'on ne parle pas de guichet devant lui", () => {
    const kid = ctxOf({ a: adult({ child: true, family: "child" }), cause: "poverty", band: 4 });
    const t = PAROLES.filter((e) => parolesEligible(e, kid));
    expect(t.some((e) => e.adult)).toBe(false);
    expect(t.some((e) => e.id === "t-enfant-choux")).toBe(true);
    const chat = ctxOf({ kind: "chat", band: 6, cause: "complexity", a: adult(), b: adult({ child: true }), names: { a: "Garin", b: "Tassin" } });
    expect(PAROLES.filter((e) => parolesEligible(e, chat)).some((e) => e.adult)).toBe(false);
  });

  it("la précision l'emporte, et jamais une redite tant qu'il reste du neuf", () => {
    const ctx = ctxOf({ cause: "scarcity", a: adult({ traits: ["grumpy", "pious"] }) });
    const heard = {};
    const seen = new Set();
    const ok = PAROLES.filter((e) => parolesEligible(e, ctx));
    for (let i = 0; i < ok.length; i += 1) {
      const r = pickParole(ctx, heard, seq([0.13, 0.71, 0.42, 0.97]));
      expect(seen.has(r.id), `redite de ${r.id}`).toBe(false);
      seen.add(r.id);
      heard[r.id] = (heard[r.id] | 0) + 1;
    }
    expect(seen.size).toBe(ok.length);
    // Tout entendu : le moins entendu revient.
    heard["t-disette"] = 5;
    const again = pickParole(ctx, heard, () => 0.5);
    expect(again.id).not.toBe("t-disette");
  });

  it("parent et enfant : chacun dit sa réplique, accordée à son genre, prénoms posés", () => {
    const e = PAROLES.find((x) => x.id === "c-pk-grand");
    const ctx = ctxOf({ kind: "chat", rel: "parentKid", kidIs: "b", a: adult({ fem: true }), b: adult({ child: true, fem: true }), names: { a: "Oda", b: "Talia" } });
    const lines = resolveLines(e, ctx);
    expect(lines[0]).toEqual({ who: "b", fr: "Quand je serai grande, je ferai quoi ?", en: "What will I do when I grow up?" });
    expect(lines[1].who).toBe("a");
    const ciel = resolveLines(PAROLES.find((x) => x.id === "c-couple-ciel"), { ...ctx, names: { enfant: "Tassin" } });
    expect(ciel[0].fr).toBe("Tassin a encore demandé pourquoi le ciel est en haut.");
  });
});
