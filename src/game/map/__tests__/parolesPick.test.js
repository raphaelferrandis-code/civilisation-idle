import { describe, it, expect } from "vitest";

import { PAROLES, JOB_GROUP } from "../../data/paroles.js";
import { JOBS, TRAITS } from "../citizenIdentity.js";
import { pickParole, parolesEligible, resolveLines } from "../paroles/pick.js";
import { NOMS_DU_JOUEUR } from "../../data/parolesToi.js";
import { chronicleArticles } from "../../data/chronicleArticles.js";

// ÉCOUTER (docs/PLAN-ECOUTER-PARLER.md) : le catalogue et le choix d'un échange.

const NAMES = ["a", "b", "conjoint", "enfant", "hote", "voisin", "voisine", "gamin", "gamine", "nom", "Nom", "temoin"];
// Ce que la cité a vu (lot 4) : un geste ou un signe ; et qui a été exaucé (lot 5).
const SEEN = ["look", "back", "flee", "kneel", "pray", "wave", "search", "home", "parent", "go", "wind", "light", "fire", "beast", "answered"];
const DOING = ["work", "school", "home", "errand", "plaza", "pray", "wonder", "wander", "night", "flee", "shelter", "riot", "river", "port", "field"];
const adult = (o = {}) => ({ fem: false, child: false, old: false, job: null, traits: [], family: "single", kids: 0, ...o });
const ctxOf = (o = {}) => ({
  kind: "thought", band: 2, night: false, precip: null, riot: false, wonder: false, prosper: false, cause: null,
  season: "summer", doing: null,
  a: adult(), b: null, rel: null, kidIs: null, names: { a: "Garin" }, ...o,
});
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
const byId = (id) => PAROLES.find((e) => e.id === id);

describe("le catalogue", () => {
  it("chaque entrée a sa forme : un id unique, un genre, une couche, des répliques en deux langues", () => {
    const ids = new Set();
    for (const e of PAROLES) {
      expect(ids.has(e.id), e.id).toBe(false);
      ids.add(e.id);
      expect(["chat", "thought"]).toContain(e.kind);
      expect([1, 2, 3]).toContain(e.layer);
      expect(e.lines.length).toBeGreaterThan(0);
      for (const l of e.lines) {
        expect(l.en, e.id).toBeTruthy();
        expect(!!l.fr || (!!l.m && !!l.f), e.id).toBe(true);
        if (e.kind === "chat") expect(["a", "b", "parent", "kid"]).toContain(l.who);
      }
      if (e.kind === "chat") expect(e.lines.length, e.id).toBeGreaterThanOrEqual(2);
      const w = e.when || {};
      if (w.job) for (const j of w.job) expect(JOBS[j], `${e.id} : métier ${j}`).toBeTruthy();
      if (w.notJob) for (const j of w.notJob) expect(JOBS[j], `${e.id} : métier ${j}`).toBeTruthy();
      if (w.group) for (const g of w.group) expect(Object.values(JOB_GROUP)).toContain(g);
      if (w.doing) for (const d of w.doing) expect(DOING, e.id).toContain(d);
      if (w.trait) expect(TRAITS.some((t) => t.key === w.trait), e.id).toBe(true);
      if (w.seen) expect(SEEN, e.id).toContain(w.seen);
      // {temoin} ne se dit que de quelqu'un que la cité a vu, ou à qui la voix a parlé.
      if (e.lines.some((l) => /\{temoin\}/.test(l.fr || l.m || ""))) expect(w.seen || w.said, e.id).toBeTruthy();
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

  it("la plume : chaque réplique dit de quel monde elle est (cinq âges au plus, jamais du Feu au Démiurge)", () => {
    for (const e of PAROLES) {
      expect(Array.isArray(e.bands), `${e.id} : âges`).toBe(true);
      const [lo, hi] = e.bands;
      expect(lo <= hi && lo >= 0 && hi <= 9, e.id).toBe(true);
      expect(hi - lo, `${e.id} : trop d'âges`).toBeLessThanOrEqual(4);
    }
  });

  it("la plume : chaque métier a ses mots", () => {
    const covered = new Set(PAROLES.flatMap((e) => (e.when && e.when.job) || []));
    for (const key of Object.keys(JOBS)) expect(covered.has(key), key).toBe(true);
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
    const sel = byId("b-t-sel-conjoint");
    expect(parolesEligible(sel, married)).toBe(true);
    expect(parolesEligible(sel, single)).toBe(false);
    // Sans prénom à citer, l'entrée n'est pas choisie.
    expect(parolesEligible(sel, { ...married, names: { a: "Garin" } })).toBe(false);
  });

  it("les pensées suivent ce qu'il fait : on pense au repas en rentrant, pas en allant travailler", () => {
    const married = { a: adult({ family: "married" }), names: { a: "Garin", conjoint: "Oda" } };
    const lentilles = byId("b-t-lentilles");
    expect(parolesEligible(lentilles, ctxOf({ ...married, doing: "home" }))).toBe(true);
    expect(parolesEligible(lentilles, ctxOf({ ...married, doing: "work" }))).toBe(false);
    expect(parolesEligible(lentilles, ctxOf({ ...married, doing: null }))).toBe(false);
  });

  it("chaque métier ses mots, et seulement le sien ; chaque âge son monde", () => {
    const boulangere = ctxOf({ band: 2, a: adult({ job: "baker", fem: true }) });
    const noce = byId("b-t-noce");
    expect(parolesEligible(noce, boulangere)).toBe(true);
    expect(parolesEligible(noce, ctxOf({ band: 2, a: adult({ job: "miller" }) }))).toBe(false);
    // La boulangère du bourg n'a pas les mots de l'usine, ni l'ouvrier ceux du bourg.
    expect(parolesEligible(noce, { ...boulangere, band: 5 })).toBe(false);
    const ouvrier = ctxOf({ band: 5, a: adult({ job: "factory" }) });
    expect(parolesEligible(byId("u-t-sirene"), ouvrier)).toBe(true);
    expect(parolesEligible(noce, ouvrier)).toBe(false);
  });

  it("on ne parle pas de son propre métier comme d'un autre : la boulangère n'attend pas le boulanger", () => {
    const early = byId("b-t-early");
    expect(parolesEligible(early, ctxOf({ a: adult({ traits: ["early"], job: "guard" }) }))).toBe(true);
    expect(parolesEligible(early, ctxOf({ a: adult({ traits: ["early"], job: "baker", fem: true }) }))).toBe(false);
  });

  it("la saison compte", () => {
    const cidre = byId("b-t-cidre");
    expect(parolesEligible(cidre, ctxOf({ season: "autumn" }))).toBe(true);
    expect(parolesEligible(cidre, ctxOf({ season: "spring" }))).toBe(false);
  });

  it("un enfant ne pense pas à la paie, et l'on ne parle pas de guichet devant lui", () => {
    const kid = ctxOf({ a: adult({ child: true, family: "child" }), cause: "poverty", band: 4 });
    const t = PAROLES.filter((e) => parolesEligible(e, kid));
    expect(t.some((e) => e.adult)).toBe(false);
    expect(t.some((e) => e.id === "b-t-cerises")).toBe(true);
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
    heard["b-t-galettes"] = 5;
    const again = pickParole(ctx, heard, () => 0.5);
    expect(again.id).not.toBe("b-t-galettes");
  });

  it("parent et enfant : chacun dit sa réplique, accordée à son genre, prénoms posés", () => {
    const e = byId("b-c-foire-seul");
    const ctx = ctxOf({ kind: "chat", rel: "parentKid", kidIs: "b", a: adult({ fem: true }), b: adult({ child: true, fem: true }), names: { a: "Oda", b: "Talia" } });
    const lines = resolveLines(e, ctx);
    expect(lines[0]).toEqual({ who: "b", fr: "Quand je serai grande, je pourrai aller à la foire toute seule ?", en: "When I’m bigger, can I go to the fair on my own?" });
    expect(lines[1].who).toBe("a");
    const forgeron = resolveLines(byId("b-c-forgeron"), { ...ctx, names: { enfant: "Tassin" } });
    expect(forgeron[0].fr).toBe("Tassin ne veut plus aller à l’école.");
  });
});

describe("ce qu'on dit de toi (lot 2)", () => {
  const toiCtx = (o = {}) => ctxOf({ trust: 3, private: true, period: 5, articles: new Set(), collapses: 0, ...o });

  it("on y pense avant d'en parler : la pensée d'abord, la causette ensuite, à l'écart, jamais le taciturne", () => {
    const base = { band: 2, collapses: 1 };
    const thought = byId("t3-ruines-tuiles");
    expect(parolesEligible(thought, toiCtx({ ...base, trust: 0 }))).toBe(false);
    expect(parolesEligible(thought, toiCtx({ ...base, trust: 1 }))).toBe(true);
    const chat = byId("t3-ruines-chat");
    const pair = { ...base, kind: "chat", b: adult(), names: { a: "Garin", b: "Oda" } };
    expect(parolesEligible(chat, toiCtx({ ...pair, trust: 1 }))).toBe(false);
    expect(parolesEligible(chat, toiCtx({ ...pair, trust: 2 }))).toBe(true);
    expect(parolesEligible(chat, toiCtx({ ...pair, trust: 2, private: false }))).toBe(false);
    expect(parolesEligible(chat, toiCtx({ ...pair, trust: 2, a: adult({ traits: ["quiet"] }) }))).toBe(false);
  });

  it("ils n'en savent jamais plus que la gazette : l'article d'abord, le nom ensuite", () => {
    const raphael = byId("t3-p3-raphael");
    const ctx = toiCtx({ band: 2, period: 3 });
    expect(parolesEligible(raphael, ctx)).toBe(false);
    const parus = { articles: new Set(["p3_knowledge_probability"]), names: { a: "Garin", nom: { fr: "la main invisible", en: "the invisible hand" } } };
    expect(parolesEligible(raphael, { ...ctx, ...parus })).toBe(true);
    // Sans nom à citer, la réplique qui le cite n'est pas choisie.
    expect(parolesEligible(raphael, { ...ctx, ...parus, names: { a: "Garin" } })).toBe(false);
  });

  it("le nom que la gazette te donne s'écrit dans chaque langue", () => {
    const names = { a: "Garin", b: "Oda", nom: { fr: "la Main", en: "the Hand" }, Nom: { fr: "La Main", en: "The Hand" } };
    const lines = resolveLines(byId("t3-nom-croire"), toiCtx({ kind: "chat", b: adult(), names }));
    expect(lines[0].fr).toBe("Tu crois que la Main nous regarde, là, maintenant ?");
    expect(lines[0].en).toBe("Do you think the Hand is watching us right now?");
  });

  it("jamais « de {nom} » ni « à {nom} » (du Créateur, au Créateur)", () => {
    for (const e of PAROLES) {
      for (const l of e.lines) {
        for (const t of [l.fr, l.m, l.f].filter(Boolean)) expect(t, e.id).not.toMatch(/\b(de|à) \{[nN]om\}/);
      }
    }
  });

  it("chaque nom et chaque article cités existent dans la Chronique", () => {
    const ids = new Set(chronicleArticles.map((a) => a.id));
    for (const k of Object.keys(NOMS_DU_JOUEUR)) expect(ids.has(k), k).toBe(true);
    for (const e of PAROLES) for (const id of (e.when && e.when.article) || []) expect(ids.has(id), `${e.id} : ${id}`).toBe(true);
  });
});
