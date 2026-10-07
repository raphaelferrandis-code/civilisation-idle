import { describe, it, expect, beforeEach } from "vitest";

import { CM } from "../layout.js";
import { state } from "../../core/state.js";
import { defaultParoles, normalizeParoles } from "../../core/parolesState.js";
import { parolesSignsHere } from "../../core/paroles.js";
import { focusCitizen, clearCitizenFocus } from "../citizenFocus.js";
import { buildIdentity, householdOf, TRAITS } from "../citizenIdentity.js";
import { stopListening, listenView } from "../paroles/listen.js";
import {
  giveSign, signsOffered, signTick, resetSigns, nearestFire, nearestBeast, parentOnStreet, signActs, reactionLabel,
  SIGN, REACT, BEAST_BEATS,
} from "../paroles/signs.js";
import { pickSign, parolesEligible, resolveLines } from "../paroles/pick.js";
import { PAROLES_SIGNES, SIGN_ACTS } from "../../data/parolesSignes.js";
import { PAROLES } from "../../data/paroles.js";
import { queueFlameGlow, paintFlameGlows, FIRE_BOOST } from "../flameGlow.js";
import { chronicleArticles } from "../../data/chronicleArticles.js";
import { worldToScreen } from "../iso/projection.js";

// LES SIGNES (docs/PLAN-ECOUTER-PARLER.md, lots 4 et 4 bis) : le vent, la lumière, le
// feu, la bête ; ce que le passant en pense, par l'âge, par le caractère, par la
// répétition, et ce qu'il en FAIT.

const NAMES = ["a", "conjoint", "enfant", "hote", "voisin", "voisine", "gamin", "gamine", "nom", "Nom", "bete", "Bete", "maitre"];
const KINDS = ["wind", "light", "fire", "beast"];
const BEASTS = ["dog", "cat", "goat", "sheep", "cow"];
const DOG = { bete: { fr: "ce chien", en: "that dog" }, Bete: { fr: "Ce chien", en: "That dog" } };
const adult = (o = {}) => ({ fem: false, child: false, old: false, job: null, traits: [], family: "single", kids: 0, ...o });
const ctxOf = (o = {}) => ({
  kind: "sign", sign: "wind", stage: 1, band: 2, night: false, precip: null, riot: false, wonder: false, prosper: false,
  cause: null, season: "summer", doing: null, beast: null,
  a: adult(), b: null, rel: null, kidIs: null, names: { a: "Garin" }, ...o,
});
const textsOf = (l) => [l.fr, l.m, l.f, l.en].filter(Boolean);
const signsOf = (e) => [].concat(e.sign || []);

describe("le catalogue des signes", () => {
  it("chaque entrée a sa forme : un id unique, un signe, une fois, un geste, une pensée en deux langues", () => {
    const ids = new Set(PAROLES.map((e) => e.id));
    const articles = new Set(chronicleArticles.map((a) => a.id));
    for (const e of PAROLES_SIGNES) {
      expect(ids.has(e.id), e.id).toBe(false);
      ids.add(e.id);
      expect(e.kind).toBe("sign");
      expect(e.layer).toBe(1);
      expect([1, 2, 3]).toContain(e.stage);
      for (const s of signsOf(e)) expect(KINDS, e.id).toContain(s);
      expect(SIGN_ACTS, e.id).toContain(e.act);
      expect(e.lines.length).toBeGreaterThan(0);
      for (const l of e.lines) {
        expect(l.who).toBe("a");
        expect(l.en, e.id).toBeTruthy();
        expect(!!l.fr || (!!l.m && !!l.f), e.id).toBe(true);
      }
      const w = e.when || {};
      if (w.trait) expect(TRAITS.some((t) => t.key === w.trait), e.id).toBe(true);
      if (w.beast) for (const b of w.beast) expect(BEASTS, e.id).toContain(b);
      if (w.article) for (const a of w.article) expect(articles.has(a), `${e.id} : ${a}`).toBe(true);
    }
  });

  it("les règles d'écriture : ni tiret, ni « ! », ni points de suspension, l'apostrophe typographique ; jamais « de {nom} »", () => {
    for (const e of PAROLES_SIGNES) {
      for (const l of e.lines) {
        for (const t of textsOf(l)) {
          expect(t, e.id).not.toMatch(/[—–!…]|\.\.\./);
          expect(t, e.id).not.toMatch(/'/);
          expect(t, e.id).not.toMatch(/\b(de|à|De|À) \{[Nn]om\}/);
          for (const m of t.matchAll(/\{(\w+)\}/g)) expect(NAMES, e.id).toContain(m[1]);
        }
      }
    }
  });

  it("la plume : chaque pensée dit de quel monde elle est (cinq âges au plus)", () => {
    for (const e of PAROLES_SIGNES) {
      const [lo, hi] = e.bands;
      expect(lo <= hi && lo >= 0 && hi <= 9, e.id).toBe(true);
      expect(hi - lo, `${e.id} : trop d'âges`).toBeLessThanOrEqual(4);
    }
  });

  it("la troisième fois, c'est « Ça suffit. »", () => {
    for (const e of PAROLES_SIGNES.filter((x) => x.stage === 3)) {
      for (const l of e.lines) {
        for (const t of [l.fr, l.m, l.f].filter(Boolean)) expect(t, e.id).toMatch(/^Ça suffit/);
        expect(l.en, e.id).toMatch(/^That’s enough/);
      }
    }
  });

  it("la pensée dit son geste : qui fuit court, qui rentre rentre, qui prie y va, qui s'agenouille le dit", () => {
    const SAYS = {
      flee: /cour|vite|file|rentre|ne reste pas|quitte|change de rue|préfère rentrer/i,
      home: /rentre|chez moi/i,
      pray: /chaman|prêtre|culte|temple|augures|ocre|offrande|bougie|pierre/i,
      kneel: /genou/i,
      wave: /signe|main|salue|bonjour|salut|coucou/i,
      parent: /maman|papa/i,
      back: /recul|arrière|écart/i,
    };
    for (const e of PAROLES_SIGNES) {
      const re = SAYS[e.act];
      if (!re) continue;
      const t = e.lines.map((l) => l.fr || l.m).join(" ");
      expect(t, `${e.id} (${e.act})`).toMatch(re);
    }
  });

  it("à chaque âge, chacun a de quoi penser, à chaque fois, de chaque signe qu'il peut y recevoir", () => {
    const people = {
      adulte: adult(),
      enfant: adult({ child: true, family: "child" }),
      taciturne: adult({ traits: ["quiet", "proud"] }),
      pieux: adult({ traits: ["pious", "early"] }),
    };
    for (let band = 0; band <= 9; band += 1) {
      // Plus de bêtes après le Néon, guère de feux : seulement le vent et la lumière.
      const signs = band <= 6 ? KINDS : ["wind", "light"];
      for (const sign of signs) {
        for (const night of [false, true]) {
          for (let stage = 1; stage <= 3; stage += 1) {
            for (const [who, a] of Object.entries(people)) {
              for (const [where, acts] of [["rue", undefined], ["scène", ["look", "search", "go"]], ["sans logis ni culte", ["look", "back", "search", "go", "flee", "kneel", "wave"]]]) {
                const ctx = ctxOf({ band, sign, stage, night, a, acts, beast: sign === "beast" ? "dog" : null, names: { a: "Garin", ...DOG } });
                expect(pickSign(ctx, {}, () => 0.5), `âge ${band}, ${sign}, fois ${stage}, ${who}, nuit ${night}, ${where}`).not.toBe(null);
              }
            }
          }
        }
      }
    }
  });
});

describe("la lecture", () => {
  it("le caractère fait la lecture : le pieux lit d'abord en pieux, tant qu'il en reste de neuf", () => {
    const ctx = ctxOf({ band: 0, a: adult({ traits: ["pious", "early"] }) });
    expect(pickSign(ctx, {}, () => 0.99).id).toBe("s-f1-pious");
    // Déjà entendue : la réserve de tous reprend.
    const next = pickSign(ctx, { "s-f1-pious": 1 }, () => 0.5);
    expect(next.id).not.toBe("s-f1-pious");
  });

  it("sous la lumière, la deuxième fois, le pieux s'agenouille ; devant le feu, il va prier", () => {
    const pious = adult({ traits: ["pious", "early"] });
    for (let band = 0; band <= 9; band += 1) {
      const r = pickSign(ctxOf({ band, sign: "light", stage: 2, a: pious }), {}, () => 0.5);
      expect(r.act, `âge ${band}`).toBe("kneel");
    }
    const fire = pickSign(ctxOf({ band: 2, sign: "fire", stage: 2, a: pious }), {}, () => 0.5);
    expect(fire.act).toBe("pray");
  });

  it("le superstitieux recule, puis s'enfuit ; devant le feu ou la bête, il s'enfuit tout de suite", () => {
    const sup = adult({ traits: ["superstitious", "proud"] });
    expect(pickSign(ctxOf({ band: 2, sign: "wind", stage: 1, a: sup }), {}, () => 0.5).act).toBe("back");
    expect(pickSign(ctxOf({ band: 2, sign: "fire", stage: 1, a: sup }), {}, () => 0.99).act).toBe("flee");
    expect(pickSign(ctxOf({ band: 2, sign: "wind", stage: 2, a: sup }), {}, () => 0.5).act).toBe("flee");
  });

  it("on ne pense pas un geste qu'on ne peut pas faire : ni « je vais au temple » sans temple, ni « je rentre » sans logis", () => {
    const pious = adult({ traits: ["pious", "early"] });
    const acts = ["look", "back", "search", "go", "flee", "kneel", "wave"];
    for (let i = 0; i < 20; i += 1) {
      const r = pickSign(ctxOf({ band: 2, sign: "fire", stage: 3, a: pious, acts }), {}, () => (i * 0.13) % 1);
      expect(acts, r.id).toContain(r.act);
    }
  });

  it("le taciturne regarde et ne dit rien : il n'a que ses mots, même redits", () => {
    const heard = {};
    for (let i = 0; i < 6; i += 1) {
      const r = pickSign(ctxOf({ band: 5, sign: "fire", a: adult({ traits: ["quiet", "pious"] }) }), heard, () => (i * 0.17) % 1);
      const e = PAROLES_SIGNES.find((x) => x.id === r.id);
      expect(e.when.trait, r.id).toBe("quiet");
      expect(r.lines[0].fr).toBe("Le feu.");
      heard[r.id] = (heard[r.id] | 0) + 1;
    }
  });

  it("l'âge fait la lecture : un esprit, un présage, un dieu, un courant d'air, une panne, le chœur, la sphère, toi", () => {
    const READING = [/esprit/, /esprit/, /présage/, /présage/, /dieu/, /courant d’air/, /panne|ventilation/, /chœur/, /régulateur/, /toi/i];
    for (let band = 0; band <= 9; band += 1) {
      const ok = PAROLES_SIGNES.filter((e) => e.sign === "wind" && parolesEligible(e, ctxOf({ band, stage: 2 })));
      expect(ok.length, `âge ${band}`).toBeGreaterThan(0);
      for (const e of ok) expect(e.lines[0].fr || e.lines[0].m, e.id).toMatch(READING[band]);
    }
  });

  it("la bête se nomme dans chaque langue, et sans accord qui la suive", () => {
    const ctx = ctxOf({ band: 4, sign: "beast", beast: "goat", names: { a: "Garin", bete: { fr: "cette chèvre", en: "that goat" }, Bete: { fr: "Cette chèvre", en: "That goat" } } });
    const e = PAROLES_SIGNES.find((x) => x.id === "s-m1-bete");
    const [l] = resolveLines(e, ctx);
    expect(l.fr).toBe("Cette chèvre me regarde comme si je lui devais quelque chose.");
    expect(l.en).toBe("That goat is looking at me as if I owed it something.");
    // Brouter, c'est pour le bétail : pas pour le chien.
    const brouter = PAROLES_SIGNES.find((x) => x.id === "s-m1-bete-brouter");
    expect(parolesEligible(brouter, ctx)).toBe(true);
    expect(parolesEligible(brouter, { ...ctx, beast: "dog" })).toBe(false);
  });

  it("le chien qu'on promène : le prénom de son maître, et seulement s'il en a un", () => {
    const e = PAROLES_SIGNES.find((x) => x.id === "s-u1-bete-chien");
    const ctx = ctxOf({ band: 5, sign: "beast", beast: "dog", names: { a: "Garin", ...DOG } });
    expect(parolesEligible(e, ctx)).toBe(false);
    const withMaster = { ...ctx, names: { ...ctx.names, maitre: "Oda" } };
    expect(parolesEligible(e, withMaster)).toBe(true);
    expect(resolveLines(e, withMaster)[0].fr).toMatch(/^Le chien d’Oda /);
  });

  it("la lune n'est pas le soleil", () => {
    const night = PAROLES_SIGNES.filter((e) => e.sign === "light" && parolesEligible(e, ctxOf({ band: 2, sign: "light", night: true })));
    expect(night.length).toBeGreaterThan(0);
    for (const e of night) expect(e.when.night, e.id).not.toBe(false);
  });
});

// ── EN JEU ─────────────────────────────────────────────────────────────────────
// Une petite ville : une rue de 30 cases d'est en ouest (y = 10), une rue nord-sud
// (x = 20), un culte des ancêtres au bout.
const T = 20;
const cityMapWalkRoadKey = (gx, gy) => gx * 10000 + gy;   // la clé des cases de rue (agents.js)
function streets() {
  const cells = [];
  for (let gx = 0; gx <= 30; gx += 1) cells.push({ gx, gy: 10 });
  for (let gy = 0; gy <= 20; gy += 1) if (gy !== 10) cells.push({ gx: 20, gy });
  CM.walkRoadList = cells;
  CM.walkRoadSet = new Set(cells.map((c) => cityMapWalkRoadKey(c.gx, c.gy)));
  CM.workRoadCells = [{ gx: 20, gy: 0, t: { buildingId: "ancestral_cult" } }];
  CM.buildingEdgeSet = new Set([cityMapWalkRoadKey(2, 10), cityMapWalkRoadKey(20, 0)]);
  CM.layoutRecomputeAt = (CM.layoutRecomputeAt || 0) + 1;
}
let hhCache = null;
function couple() {
  if (hhCache) return hhCache;
  for (let s = 1; s < 5000; s += 1) { const h = householdOf(s * 7919, 2); if (h.couple && h.kids.length) { hhCache = h; return h; } }
  throw new Error("pas de foyer");
}
function someone(extra = {}, slot = "m") {
  const hh = couple();
  const fem = slot === "f";
  const child = slot[0] === "k";
  const identity = buildIdentity({ seed: slot === "m" ? 11 : slot === "f" ? 22 : 33, band: 2, fem, sprite: child ? "villagerchild" : fem ? "villagerwoman" : "villager", household: hh, slot });
  return {
    name: identity.name, seed: identity.seed, fem, charType: child ? 2 : fem ? 1 : 0, skinVariant: 0, phase: 0.3,
    gx: 10, gy: 10, x: 10.5 * T, y: 10.5 * T, lox: 0, loy: 0, tx: 10.5 * T, ty: 10.5 * T, pauseT: 0, dir: 2,
    home: null, work: null, goalKind: "wander", role: "porte un panier", identity, speed: 24, ...extra,
  };
}
const clock = () => performance.now();
// Un feu peint à la dernière frame, à (wx, wy) monde.
function fireAt(wx, wy) {
  const s = worldToScreen(wx, wy);
  queueFlameGlow(s.x, s.y, 10, null, 0, 0, 1);
  paintFlameGlows(null);
}

beforeEach(() => {
  resetSigns();
  clearCitizenFocus();
  stopListening();
  paintFlameGlows(null);
  paintFlameGlows(null);
  state.paroles = defaultParoles();
  state.cycles = 3;
  CM.TILE = T;
  CM.cw = 800; CM.ch = 600; CM.dpr = 1;
  CM.cam = { x: 200, y: 200, zoom: 2 };
  CM.zoomGoal = 2;
  CM.nightF = 0; CM.rainF = 0; CM.healthF = 0.6; CM.rioters = []; CM.season = 1; CM.windX = 0; CM.citT = 100;
  CM.layout = { counts: { eraBand: 2 }, critters: [] };
  CM.tileGrid = new Map();
  CM.describeTile = (t) => ({ title: t.title });
  CM.citizens = [];
  CM.walkRoadList = []; CM.walkRoadSet = new Set(); CM.workRoadCells = []; CM.buildingEdgeSet = null;
});

describe("le geste", () => {
  it("la fiche propose le vent et la lumière ; le feu et la bête seulement s'il y en a près de lui", () => {
    const p = someone();
    CM.citizens = [p];
    focusCitizen(p);
    expect(signsOffered()).toMatchObject({ wind: true, light: true, fire: false, beast: false });
    fireAt(p.x + 3 * T, p.y);
    CM.layout.critters = [{ gx: 12, gy: 10, jx: 0, jy: 0, kind: "goat", dir: 3 }];
    expect(signsOffered()).toMatchObject({ fire: true, beast: true });
    // Trop loin : rien.
    expect(nearestFire(p, [{ ...worldToScreen(p.x + (SIGN.fireReach + 2) * T, p.y), r: 10 }])).toBe(null);
    CM.layout.critters = [{ gx: 10 + SIGN.beastReach + 2, gy: 10, jx: 0, jy: 0, kind: "goat", dir: 3 }];
    expect(nearestBeast(p)).toBe(null);
  });

  it("la première fois la surprise, la deuxième une explication, la troisième « Ça suffit. », puis plus rien", () => {
    const p = someone();
    CM.citizens = [p];
    focusCitizen(p);
    const stages = [];
    for (let i = 0; i < 3; i += 1) {
      const t0 = clock();
      expect(giveSign("wind", t0)).toBe(true);
      stages.push(CM.sign.stage);
      const v = listenView(t0 + SIGN.thoughtMs + 10);
      expect(v.kind).toBe("thought");
      if (i === 2) expect(v.lines[0].fr).toMatch(/^Ça suffit/);
    }
    expect(stages).toEqual([1, 2, 3]);
    expect(signsOffered()).toBe(null);
    expect(giveSign("light")).toBe(false);
  });

  it("la pensée vient après le geste", () => {
    const p = someone();
    CM.citizens = [p];
    focusCitizen(p);
    const t0 = clock();
    giveSign("light", t0);
    expect(listenView(t0 + 100)).toBe(null);
    expect(signsOffered(t0 + 100).busy).toBe(true);
    expect(listenView(t0 + SIGN.thoughtMs + 1).lines).toHaveLength(1);
    expect(signsOffered(t0 + SIGN.thoughtMs + 1).busy).toBe(false);
  });

  it("le signe est inscrit et sa pensée ne revient pas, mais il ne compte pas pour la confiance", () => {
    const p = someone();
    CM.citizens = [p];
    focusCitizen(p);
    giveSign("wind");
    const id = CM.listening.id;
    expect(state.paroles.heard[id]).toBe(1);
    expect(state.paroles.n).toBe(0);
    expect(state.paroles.signs).toMatchObject({ n: 1, by: { wind: 1 }, cycle: 3, here: { wind: 1 } });
    // La cité suivante ne l'a pas vu ; le joueur s'en souvient.
    state.cycles = 4;
    expect(parolesSignsHere()).toEqual({});
    expect(normalizeParoles(JSON.parse(JSON.stringify(state.paroles))).signs).toMatchObject({ n: 1, by: { wind: 1 } });
  });

  it("devant le feu, il s'arrête et se tourne vers lui ; le feu attisé grandit, puis retombe", () => {
    const p = someone();
    CM.citizens = [p];
    focusCitizen(p);
    fireAt(p.x, p.y - 3 * T);          // au nord-est (−y)
    const t0 = clock();
    expect(giveSign("fire", t0, { act: "look" })).toBe(true);
    signTick(t0 + 400);
    expect(p.pauseT).toBeGreaterThan(3);
    expect(p.dir).toBe(3);
    expect(reactionLabel(p)).toEqual({ fr: "Regarde", en: "Looking" });
    expect(FIRE_BOOST.on).toBe(true);
    expect(FIRE_BOOST.k).toBeGreaterThan(0.9);
    signTick(t0 + 6300);
    expect(CM.sign).toBe(null);
    expect(FIRE_BOOST.on).toBe(false);
    expect(p._react).toBe(null);
  });

  it("devant la bête, il suit son regard : il se retourne, puis la regarde de nouveau ; elle reprend sa pose", () => {
    const p = someone();
    CM.citizens = [p];
    focusCitizen(p);
    const goat = { gx: 13, gy: 10, jx: 0, jy: 0, kind: "goat", dir: 3 };   // à l'est (+x)
    CM.layout.critters = [goat];
    const t0 = clock();
    expect(giveSign("beast", t0, { act: "look" })).toBe(true);
    expect(goat.dir).not.toBe(3);                // elle se tourne vers lui
    signTick(t0 + 400);
    expect(p.dir).toBe(0);
    signTick(t0 + BEAST_BEATS.turnAt + 10);
    expect(p.dir).toBe(1);
    signTick(t0 + BEAST_BEATS.backAt + 10);
    expect(p.dir).toBe(0);
    resetSigns();
    expect(goat.dir).toBe(3);
  });

  it("le chien qu'on promène s'assoit et le fixe, et son maître l'attend", () => {
    const p = someone();
    const master = someone({ x: 12.5 * T, y: 10.5 * T, tx: 13 * T, ty: 10.5 * T, gx: 12, seed: 99 });
    master._vieDog = { side: 1, g: 0, hx: 1, hy: 0 };
    CM.citizens = [p, master];
    focusCitizen(p);
    const t0 = clock();
    expect(giveSign("beast", t0)).toBe(true);
    expect(CM.sign.beast.master).toBe(master);
    expect(master._vieDog.stare).toMatchObject({ x: p.x, y: p.y });
    signTick(t0 + 400);
    expect(master.pauseT).toBeGreaterThan(3);
    resetSigns();
    expect(master._vieDog.stare).toBe(null);
  });
});

describe("ce qu'il fait", () => {
  it("il s'agenouille, tourné vers toi, et se relève", () => {
    const p = someone();
    CM.citizens = [p];
    focusCitizen(p);
    const t0 = clock();
    giveSign("light", t0, { act: "kneel" });
    signTick(t0 + 1600);
    expect([0, 2]).toContain(p.dir);
    expect(p.pauseT).toBeGreaterThan(5);
    expect(p._react.pose).toEqual({ kind: "sit", u: 1 });
    expect(reactionLabel(p).fr).toBe("À genoux");
    signTick(t0 + REACT.kneel.up + REACT.kneel.upMs / 2);
    expect(p._react.pose.u).toBeCloseTo(0.5, 1);
    signTick(t0 + REACT.kneel.end + 10);
    expect(p._react).toBe(null);
  });

  it("il te fait signe, deux fois", () => {
    const p = someone();
    CM.citizens = [p];
    focusCitizen(p);
    const t0 = clock();
    giveSign("wind", t0, { act: "wave" });
    signTick(t0 + REACT.wave.start + REACT.wave.ms * 0.5);
    expect(p._react.pose).toEqual({ kind: "wave", u: 0.5 });
    expect([0, 2]).toContain(p.dir);
    signTick(t0 + REACT.wave.start + REACT.wave.ms * 2 + 50);
    expect(p._react.pose).toBe(null);
  });

  it("il reste à chercher des yeux, d'un côté puis de l'autre", () => {
    const p = someone();
    CM.citizens = [p];
    focusCitizen(p);
    const t0 = clock();
    giveSign("light", t0, { act: "search" });
    const dirs = new Set();
    for (let t = 300; t < REACT.search.end; t += 500) { signTick(t0 + t); dirs.add(p.dir); }
    expect(dirs.size).toBeGreaterThanOrEqual(3);
    expect(p.pauseT).toBeGreaterThan(0);
    signTick(t0 + REACT.search.end + 10);
    expect(p._react).toBe(null);
  });

  it("il recule d'un pas, sans quitter des yeux ce qu'il a vu", () => {
    const p = someone();
    CM.citizens = [p];
    focusCitizen(p);
    fireAt(p.x + 3 * T, p.y);           // à l'est
    const x0 = p.x, t0 = clock();
    giveSign("fire", t0, { act: "back" });
    signTick(t0 + REACT.back.to + 10);
    expect(p.x).toBeLessThan(x0 - REACT.back.dist * T * 0.8);
    expect(p.dir).toBe(0);
  });

  it("il part en courant chez lui, et il s'y enferme", () => {
    streets();
    const p = someone({ home: { gx: 2, gy: 10 } });
    CM.citizens = [p];
    focusCitizen(p);
    const t0 = clock();
    giveSign("fire", t0, { act: "flee" }) || giveSign("wind", t0, { act: "flee" });
    signTick(t0 + REACT.leave.flee + 10);
    expect(p.goal).toEqual({ gx: 2, gy: 10 });
    expect(p.goalKind).toBe("home");
    expect(p._react.run).toBe(true);
    expect(p._react.stay).toBe(REACT.stay.home);
    expect(p.pauseT).toBe(0);
    expect(reactionLabel(p).fr).toBe("S’enfuit");
  });

  it("sans logis, il fuit loin de ce qui l'a effrayé", () => {
    streets();
    const p = someone();
    CM.citizens = [p];
    focusCitizen(p);
    fireAt(p.x + 3 * T, p.y);           // le feu à l'est : il part vers l'ouest
    const t0 = clock();
    giveSign("fire", t0, { act: "flee" });
    signTick(t0 + REACT.leave.flee + 10);
    expect(p.goalKind).toBe("flee");
    expect(p.goal.gx).toBeLessThan(10);
  });

  it("il va prier au culte le plus proche, d'un pas pressé", () => {
    streets();
    const p = someone();
    CM.citizens = [p];
    focusCitizen(p);
    expect(signActs(p, false)).toContain("pray");
    const t0 = clock();
    giveSign("light", t0, { act: "pray" });
    signTick(t0 + REACT.leave.pray + 10);
    expect(p.goal).toEqual({ gx: 20, gy: 0 });
    expect(p.goalKind).toBe("pray");
    expect(p._react.hurry).toBeGreaterThan(1);
    expect(reactionLabel(p).fr).toBe("Va prier");
  });

  it("sans culte, sans logis, sa pensée ne parle ni de prier ni de rentrer", () => {
    const p = someone();
    CM.citizens = [p];
    const acts = signActs(p, false);
    expect(acts).not.toContain("pray");
    expect(acts).not.toContain("home");
    expect(signActs(p, true)).toEqual(["look", "search", "go"]);
  });

  it("l'enfant court vers sa mère quand elle est dans la rue, et ils se regardent", () => {
    streets();
    const hh = couple();
    const kidSlot = hh.kids[0].slot || "k0";
    const kid = someone({ gx: 10, x: 10.5 * T }, kidSlot);
    const mum = someone({ gx: 14, x: 14.5 * T, tx: 14.5 * T, seed: 77 }, "f");
    CM.citizens = [kid, mum];
    expect(parentOnStreet(kid)).toBe(mum);
    focusCitizen(kid);
    const t0 = clock();
    giveSign("wind", t0, { act: "parent" });
    signTick(t0 + REACT.leave.parent + 10);
    expect(kid.goal).toEqual({ gx: 14, gy: 10 });
    expect(kid._react.run).toBe(true);
    expect(reactionLabel(kid).fr).toBe("Court vers sa mère");
    // Il la rejoint : ils s'arrêtent et se regardent.
    kid.x = mum.x - T * 0.5;
    signTick(t0 + REACT.leave.parent + 800);
    expect(kid.pauseT).toBeGreaterThan(1);
    expect(mum.pauseT).toBeGreaterThan(1);
    expect(kid.dir).toBe(0);
    expect(mum.dir).toBe(1);
  });

  it("les passants autour s'arrêtent et regardent eux aussi", () => {
    const p = someone();
    const others = [1, 2, 3].map((k) => someone({ gx: 10 + k, x: (10.5 + k) * T, seed: 100 + k }));
    CM.citizens = [p, ...others];
    focusCitizen(p);
    const r = Math.random;
    Math.random = () => 0.1;
    try {
      giveSign("light", clock(), { act: "look" });
    } finally { Math.random = r; }
    const t = clock() + 1000;
    signTick(t);
    for (const q of others) {
      expect(q.pauseT, q.name).toBeGreaterThan(0);
      expect(q.dir, q.name).toBe(1);          // tournés vers lui, à l'ouest
    }
  });

  it("un personnage de scène s'arrête, se tourne, prend du retard sur sa scène, puis le rattrape", () => {
    const fig = someone({ scene: "quai" });
    focusCitizen(fig);
    CM.focus.kind = "figure";
    const t0 = clock();
    expect(giveSign("light", t0, { act: "look" })).toBe(true);
    signTick(t0 + 300);
    signTick(t0 + 1300);
    expect(fig._signDir).toBe(1);
    expect(fig._signLag).toBeGreaterThan(0);
    signTick(t0 + REACT.look + 10);
    expect(fig._signDir).toBe(null);
    const lag = fig._signLag;
    for (let t = 0; t < 40; t += 1) signTick(t0 + REACT.look + 100 + t * 100);
    expect(fig._signLag).toBeLessThan(lag);
  });

  it("le laboureur et les gens des bateaux ne reçoivent pas de signe", () => {
    for (const scene of ["champ", "port", "bac", "navette", "bateau"]) {
      const fig = someone({ scene });
      focusCitizen(fig);
      CM.focus.kind = "figure";
      expect(signsOffered(), scene).toBe(null);
    }
  });
});
