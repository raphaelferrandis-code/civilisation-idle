import { describe, it, expect, beforeEach } from "vitest";

import { CM } from "../layout.js";
import { state } from "../../core/state.js";
import { defaultParoles, normalizeParoles, TALK_TONES } from "../../core/parolesState.js";
import { parolesNoteTalk, parolesSaid, parolesTalks, parolesNoteDeclic } from "../../core/paroles.js";
import { focusCitizen, clearCitizenFocus } from "../citizenFocus.js";
import { buildIdentity, householdOf, TRAITS } from "../citizenIdentity.js";
import { stopListening, LISTEN } from "../paroles/listen.js";
import { resetSigns, reactionLabel, signTick, REACT } from "../paroles/signs.js";
import { talkOffered, startTalk, talkChoose, talkTick, talkView, stopTalk, TALK } from "../paroles/talk.js";
import { pickTalk, pickReply, resolveYou, talkTranscript, parolesEligible } from "../paroles/pick.js";
import { PAROLES } from "../../data/paroles.js";
import { PAROLES_SIGNES, PAROLES_REPONSES, SIGN_ACTS } from "../../data/parolesSignes.js";
import { PAROLES_MOTS } from "../../data/parolesMots.js";
import { chronicleArticles } from "../../data/chronicleArticles.js";

// LES MOTS (docs/PLAN-ECOUTER-PARLER.md, lot 6) : dès la période 3, le joueur parle à un
// passant ; deux ou trois réponses, ou le silence ; ce qu'il répond, ce qu'il fait, et ce
// que la cité en retient.

const textsOf = (l) => [l.fr, l.m, l.f, l.en].filter(Boolean);
const byId = (id) => PAROLES_MOTS.find((e) => e.id === id);
const allLines = (e) => [
  ...e.lines,
  ...e.choices.flatMap((c) => [c.you, ...c.replies.flatMap((r) => r.lines)]),
  ...e.silence.flatMap((r) => r.lines),
];
const theirLines = (e) => [...e.lines, ...e.choices.flatMap((c) => c.replies.flatMap((r) => r.lines)), ...e.silence.flatMap((r) => r.lines)];
const adult = (o = {}) => ({ fem: false, child: false, old: false, job: null, traits: [], family: "single", kids: 0, ...o });
const ALL_ACTS = SIGN_ACTS;
// Les articles de la gazette, tous parus.
const ARTICLES = new Set(chronicleArticles.map((a) => a.id));
const BAND_OF = { 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: 9 };
const ctxOf = (o = {}) => ({
  kind: "talk", band: 2, period: 3, night: false, precip: null, riot: false, wonder: false, prosper: false, cause: null,
  season: "summer", doing: null, declic: false, declics: 0, articles: ARTICLES, acts: ALL_ACTS,
  a: adult(), b: null, rel: null, kidIs: null, names: { a: "Garin" }, ...o,
});

describe("le catalogue des mots", () => {
  it("chaque échange a sa forme : sa réplique, deux ou trois réponses, le silence ; chaque réponse sa manière et son geste", () => {
    const ids = new Set([...PAROLES, ...PAROLES_SIGNES, ...PAROLES_REPONSES].map((e) => e.id));
    for (const e of PAROLES_MOTS) {
      expect(ids.has(e.id), e.id).toBe(false);
      ids.add(e.id);
      expect(e.kind).toBe("talk");
      expect([1, 2, 3]).toContain(e.layer);
      expect(e.bands[1] - e.bands[0], e.id).toBeLessThanOrEqual(4);
      const [lo, hi] = e.when.period;
      expect(lo >= 3 && hi <= 10, `${e.id} : les mots viennent à la période 3`).toBe(true);
      for (const l of e.lines) expect(l.who).toBe("a");
      expect(e.choices.length, e.id).toBeGreaterThanOrEqual(2);
      expect(e.choices.length, e.id).toBeLessThanOrEqual(3);
      const keys = new Set();
      for (const c of e.choices) {
        expect(keys.has(c.key), `${e.id} : ${c.key}`).toBe(false);
        keys.add(c.key);
        expect(c.key).not.toBe("silence");
        expect(TALK_TONES.filter((t) => t !== "muet"), `${e.id} : ${c.key}`).toContain(c.tone);
        expect(!!c.you.en && (!!c.you.fr || (!!c.you.m && !!c.you.f)), `${e.id} : ${c.key}`).toBe(true);
        expect(c.replies.length).toBeGreaterThan(0);
        // La dernière réponse vaut pour tous.
        expect(c.replies.at(-1).when, `${e.id} : ${c.key}`).toBeUndefined();
        for (const r of c.replies) expect(ALL_ACTS, `${e.id} : ${c.key}`).toContain(r.act);
      }
      expect(e.silence.at(-1).when, e.id).toBeUndefined();
      for (const r of e.silence) expect(ALL_ACTS, e.id).toContain(r.act);
      for (const l of allLines(e)) {
        expect(l.en, e.id).toBeTruthy();
        expect(!!l.fr || (!!l.m && !!l.f), e.id).toBe(true);
      }
      const w = e.when;
      if (w.trait) expect(TRAITS.some((t) => t.key === w.trait), e.id).toBe(true);
      if (w.article) for (const a of w.article) expect(ARTICLES.has(a), `${e.id} : ${a}`).toBe(true);
    }
  });

  it("les règles d'écriture : ni tiret, ni « ! », ni points de suspension, l'apostrophe typographique", () => {
    for (const e of PAROLES_MOTS) {
      for (const l of allLines(e)) {
        for (const t of textsOf(l)) {
          expect(t, e.id).not.toMatch(/[—–!…]|\.\.\./);
          expect(t, e.id).not.toMatch(/'/);
        }
      }
    }
  });

  it("la réplique dit son geste : qui fuit court, qui rentre rentre, qui prie y va, qui s'agenouille le dit", () => {
    const SAYS = {
      flee: /cour|vite|file|rentre|ne reste pas|quitte/i, home: /rentre|chez moi/i, kneel: /genou/i,
      pray: /temple|culte|prier|prière/i, wave: /signe|main|salue/i, parent: /maman|papa/i, back: /recul|arrière|écart/i,
    };
    for (const e of PAROLES_MOTS) {
      for (const r of [...e.choices.flatMap((c) => c.replies), ...e.silence]) {
        const re = SAYS[r.act];
        if (re) expect(r.lines.map((l) => l.fr || l.m).join(" "), `${e.id} (${r.act})`).toMatch(re);
      }
    }
  });

  it("le tutoiement suit le lien : « tu » au coin du feu et au Démiurge, « vous » entre les deux", () => {
    const TU = /(?<!\p{L})(tu|toi|te|ton|ta|tes)(?!\p{L})|(?<!\p{L})t’/u;
    const VOUS = /(?<!\p{L})(vous|votre|vos|vôtre)(?!\p{L})/u;
    for (const e of PAROLES_MOTS) {
      const [lo, hi] = e.when.period;
      const t = theirLines(e).map((l) => l.fr || l.m).join(" ");
      if (lo >= 4 && hi <= 9) expect(t, `${e.id} : « vous »`).not.toMatch(TU);
      if (hi <= 3 || lo >= 10) expect(t, `${e.id} : « tu »`).not.toMatch(VOUS);
    }
  });

  it("à chaque période, un passant a de quoi entendre ta voix", () => {
    for (let period = 3; period <= 10; period += 1) {
      const ctx = ctxOf({ period, band: BAND_OF[period] });
      expect(pickTalk(ctx, {}, () => 0.5), `période ${period}`).not.toBe(null);
    }
  });
});

describe("ce qu'il répond", () => {
  it("rien avant la période 3, ni l'échange d'une autre période", () => {
    expect(pickTalk(ctxOf({ period: 2, band: 1 }), {}, () => 0.5)).toBe(null);
    expect(parolesEligible(byId("m4-seigneur"), ctxOf({ period: 3, band: 3 }))).toBe(false);
    expect(parolesEligible(byId("m4-seigneur"), ctxOf({ period: 4, band: 3 }))).toBe(true);
  });

  it("on ne parle que de ce que la gazette a dit : le procès de Khael après l'article", () => {
    const e = byId("m6-proces");
    expect(parolesEligible(e, ctxOf({ period: 6, band: 5 }))).toBe(true);
    expect(parolesEligible(e, ctxOf({ period: 6, band: 5, articles: new Set() }))).toBe(false);
  });

  it("Claude, seulement si le déclic a eu lieu dans cette cité", () => {
    const e = byId("m3-claude");
    expect(parolesEligible(e, ctxOf({ declic: true }))).toBe(true);
    expect(parolesEligible(e, ctxOf({ declic: false }))).toBe(false);
  });

  it("le caractère fait la réponse : le pieux s'agenouille, le superstitieux s'enfuit, les autres cherchent", () => {
    const moi = byId("m3-qui").choices.find((c) => c.key === "moi");
    expect(pickReply(moi.replies, ctxOf({ a: adult({ traits: ["pious", "early"] }) })).act).toBe("kneel");
    expect(pickReply(moi.replies, ctxOf({ a: adult({ traits: ["superstitious", "proud"] }) })).act).toBe("flee");
    expect(pickReply(moi.replies, ctxOf()).act).toBe("search");
    // Sans le geste possible, la réponse suivante : sans logis, pas de « je rentre ».
    expect(pickReply(moi.replies, ctxOf({ a: adult({ traits: ["superstitious"] }), acts: ["look", "search", "go"] })).act).toBe("search");
  });

  it("l'enfant court le dire à sa mère s'il peut, sinon il rentre", () => {
    const mere = byId("m3-cache").choices.find((c) => c.key === "mere");
    const kid = adult({ child: true, family: "child" });
    expect(pickReply(mere.replies, ctxOf({ a: kid })).act).toBe("parent");
    expect(pickReply(mere.replies, ctxOf({ a: kid, acts: ["look", "home", "go"] })).act).toBe("home");
  });

  it("au Démiurge, il te dit son nom", () => {
    const oui = byId("m10-souvenir").choices.find((c) => c.key === "oui");
    const r = pickReply(oui.replies, ctxOf({ period: 10, band: 9, names: { a: "Ilya" } }));
    expect(r.lines[0].fr).toBe("Alors souviens-toi de moi. Je m’appelle Ilya.");
    expect(resolveYou(oui.you, ctxOf())).toEqual({ fr: "Oui.", en: "Yes." });
  });

  it("un échange se relit : sa réplique, ta réponse ou ton silence, la sienne", () => {
    const ctx = { kind: "talk", names: { a: "Ilya" }, a: { fem: true }, b: { fem: false } };
    expect(talkTranscript(byId("m10-souvenir"), { key: "oui", ri: 0 }, ctx).map((l) => [l.who, l.fr || null, !!l.silent])).toEqual([
      ["a", "Tu recommences tout, chaque fois. Tu te souviens de nous, après ?", false],
      ["you", "Oui.", false],
      ["a", "Alors souviens-toi de moi. Je m’appelle Ilya.", false],
    ]);
    const tais = talkTranscript(byId("m3-qui"), { key: "silence", ri: 0 }, ctx);
    expect(tais[1]).toEqual({ who: "you", silent: true });
    expect(tais[2].fr).toBe("J’ai dû rêver. Je dors mal depuis la dernière lune.");
    // L'échange a changé depuis : rien.
    expect(talkTranscript(byId("m3-qui"), { key: "disparue", ri: 0 }, ctx)).toBe(null);
  });

  it("jamais deux fois le même échange tant qu'il en reste de neuf", () => {
    const ctx = ctxOf({ declic: true, a: adult({ traits: ["chatty"] }) });
    const first = pickTalk(ctx, {}, () => 0.5);
    const second = pickTalk(ctx, { [first.id]: 1 }, () => 0.5);
    expect(second.id).not.toBe(first.id);
  });
});

describe("le registre", () => {
  beforeEach(() => {
    state.paroles = defaultParoles();
    state.cycles = 3;
    state.grandResetCount = 0;
  });

  it("la cité retient à qui tu as parlé et ta manière ; la suivante ne le sait pas ; le compte est éternel", () => {
    parolesNoteTalk("m3-qui", { key: "moi", tone: "vrai", who: "Garin", fem: false });
    parolesNoteTalk("m4-seigneur", { key: "silence", tone: "muet", who: "Oda", fem: true });
    expect(parolesSaid().map((x) => [x.who, x.key, x.tone])).toEqual([["Garin", "moi", "vrai"], ["Oda", "silence", "muet"]]);
    expect(state.paroles.mots.tones).toEqual({ vrai: 1, muet: 1 });
    expect(state.paroles.heard["m3-qui"]).toBe(1);
    // Parler ne compte pas pour la confiance (elle ne vient que de l'écoute).
    expect(state.paroles.n | 0).toBe(0);
    state.cycles = 4;
    expect(parolesSaid()).toEqual([]);
    parolesNoteTalk("m3-qui", { key: "peur", tone: "doux", who: "Ilya", fem: true });
    expect(parolesTalks()).toBe(3);
    expect(state.paroles.mots.tones).toEqual({ doux: 1 });
  });

  it("la sauvegarde garde ce qui a été dit, et l'échange relu dans le panneau", () => {
    const out = normalizeParoles({
      mots: { n: 5, city: 3, tones: { vrai: 2, faux: 9 }, said: [{ id: "m5-lequel", key: "test", tone: "vrai", belief: "test", who: "Oda", fem: true, at: 12 }, { id: "x", key: "?", tone: "vrai", who: "A" }] },
      toi: [{ id: "m5-lequel", at: 1, a: "Oda", talk: { key: "test", ri: 1 } }, { id: "m3-qui", at: 2, a: "Garin", talk: { key: "BAD KEY" } }],
    });
    expect(out.mots).toEqual({ n: 5, city: 3, tones: { vrai: 2 }, said: [{ id: "m5-lequel", key: "test", tone: "vrai", belief: "test", who: "Oda", fem: true, at: 12 }] });
    expect(out.toi[0].talk).toEqual({ key: "test", ri: 1 });
    expect(out.toi[1].talk).toBeUndefined();
    expect(normalizeParoles({}).mots).toEqual({ n: 0, city: -1, said: [], tones: {} });
  });
});

// ── EN JEU ─────────────────────────────────────────────────────────────────────
const T = 20;
let hhCache = null;
function couple() {
  if (hhCache) return hhCache;
  for (let s = 1; s < 5000; s += 1) { const h = householdOf(s * 7919, 2); if (h.couple && h.kids.length) { hhCache = h; return h; } }
  throw new Error("pas de foyer");
}
function someone(extra = {}, traits = null) {
  const hh = couple();
  const identity = buildIdentity({ seed: 11, band: 2, fem: false, sprite: "villager", household: hh, slot: "m" });
  if (traits) identity.traits = traits;
  return {
    name: identity.name, seed: identity.seed, fem: false, charType: 0, skinVariant: 0, phase: 0.3, fade: 1,
    gx: 10, gy: 10, x: 10.5 * T, y: 10.5 * T, lox: 0, loy: 0, tx: 10.5 * T, ty: 10.5 * T, pauseT: 0, dir: 3,
    home: null, work: null, goalKind: "wander", role: "porte un panier", identity, speed: 24, ...extra,
  };
}
const clock = () => performance.now();

describe("parler, en jeu", () => {
  beforeEach(() => {
    stopTalk();
    resetSigns();
    clearCitizenFocus();
    stopListening();
    state.paroles = defaultParoles();
    state.cycles = 3;
    state.grandResetCount = 0;
    state.chronicleEntries = [];
    CM.TILE = T;
    CM.cw = 800; CM.ch = 600; CM.dpr = 1;
    CM.cam = { x: 200, y: 200, zoom: 2 };
    CM.nightF = 0; CM.rainF = 0; CM.healthF = 0.6; CM.rioters = []; CM.season = 1; CM.citT = 100;
    CM.layout = { counts: { eraBand: 2, eraIndex: 11 }, critters: [] };
    CM.tileGrid = new Map();
    CM.describeTile = (t) => ({ title: t.title });
    CM.citizens = [];
    CM.walkRoadList = []; CM.walkRoadSet = new Set(); CM.workRoadCells = []; CM.buildingEdgeSet = null;
  });

  it("dès la période 3, la fiche propose « Parler » ; avant, non ; une fois par passant", () => {
    const p = someone();
    CM.citizens = [p];
    focusCitizen(p);
    expect(talkOffered()).toBe(true);
    CM.layout.counts.eraIndex = 8;          // période 2
    p._talkAvail = null;
    expect(talkOffered()).toBe(false);
    CM.layout.counts.eraIndex = 11;
    expect(startTalk()).toBe(true);
    stopTalk();
    expect(talkOffered()).toBe(false);
  });

  it("il entend la voix, s'arrête et lève les yeux vers toi ; puis tes réponses, et « Se taire »", () => {
    const p = someone();
    CM.citizens = [p];
    focusCitizen(p);
    const t0 = clock();
    expect(startTalk(t0)).toBe(true);
    const id = CM.talking.id;
    expect(PAROLES_MOTS.find((e) => e.id === id).when.period).toEqual([3, 3]);
    signTick(t0 + REACT.notice + 50);
    expect([0, 2]).toContain(p.dir);
    expect(p.pauseT).toBeGreaterThan(5);
    expect(reactionLabel(p, t0 + REACT.notice + 50).fr).toBe("T’écoute");
    const v0 = talkView(t0 + 10);
    expect(v0.lines[0].name).toBe(p.identity.given);
    expect(v0.choices).toBe(null);
    const v1 = talkView(CM.talking.chooseAt + 1);
    expect(v1.choices.length).toBeGreaterThanOrEqual(2);
  });

  it("tu réponds : ta réplique, la sienne, son geste ; la cité le retient, le panneau aussi", () => {
    state.paroles = defaultParoles();
    const p = someone({}, ["pious", "early"]);
    CM.citizens = [p];
    focusCitizen(p);
    // Seul échange possible ici : « Qui a parlé ? ».
    const t0 = clock();
    startTalk(t0);
    expect(CM.talking.id).toBe("m3-qui");
    const at = CM.talking.chooseAt + 1;
    expect(talkChoose("moi", at)).toBe(true);
    const v = talkView(at + LISTEN.lineMs + 1);
    expect(v.lines.map((l) => [l.who, l.fr])).toEqual([
      ["a", "Qui a parlé ? Il n’y a personne."],
      ["you", "Moi."],
      ["a", "Une voix d’en haut. Je me mets à genoux, on verra après."],
    ]);
    expect(state.paroles.mots.said.at(-1)).toMatchObject({ id: "m3-qui", key: "moi", tone: "vrai", who: p.identity.given });
    expect(state.paroles.toi.at(-1)).toMatchObject({ id: "m3-qui", a: p.identity.given, talk: { key: "moi", ri: 0 } });
    // Il s'agenouille quand sa réponse commence.
    talkTick(at + LISTEN.lineMs + 10);
    signTick(at + LISTEN.lineMs + REACT.kneel.down + REACT.kneel.downMs + 50);
    expect(p._react.act).toBe("kneel");
    expect(p._react.pose).toEqual({ kind: "sit", u: 1 });
    expect(talkView(at + 2 * LISTEN.lineMs).done).toBe(true);
  });

  it("tu ne dis rien : le silence répond pour toi, et il repart", () => {
    const p = someone();
    CM.citizens = [p];
    focusCitizen(p);
    const t0 = clock();
    startTalk(t0);
    talkTick(CM.talking.until + 1);
    expect(CM.talking.said).toMatchObject({ key: "silence", tone: "muet" });
    const v = talkView(CM.talking.until + LISTEN.lineMs + 2);
    expect(v.lines[1]).toMatchObject({ who: "you", silent: true });
    expect(v.lines[2].fr).toBe("J’ai dû rêver. Je dors mal depuis la dernière lune.");
    talkTick(CM.talking.actAt + 1);
    expect(p._react.act).toBe("go");
    expect(state.paroles.mots.tones).toEqual({ muet: 1 });
  });

  it("on désigne quelqu'un d'autre au milieu : il n'a entendu que le silence, et il reprend sa route", () => {
    const p = someone();
    const q = someone({ seed: 77, gx: 14, x: 14.5 * T });
    CM.citizens = [p, q];
    focusCitizen(p);
    startTalk(clock());
    focusCitizen(q);
    expect(CM.talking).toBe(null);
    expect(state.paroles.mots.said.at(-1)).toMatchObject({ key: "silence" });
    expect(p._react).toBe(null);
    expect(p.pauseT).toBe(0);
  });

  it("les mots qui demandent le déclic : Claude en parle si le joueur l'a entendu dans cette cité", () => {
    parolesNoteDeclic();
    const p = someone({}, ["chatty", "curious"]);
    CM.citizens = [p];
    focusCitizen(p);
    const seen = new Set();
    for (let i = 0; i < 2; i += 1) {
      p._talked = false; p._talkAvail = null;
      startTalk(clock());
      seen.add(CM.talking.id);
      stopTalk();
      resetSigns();
    }
    expect(seen).toEqual(new Set(["m3-qui", "m3-claude"]));
    expect(TALK.fromPeriod).toBe(3);
  });
});
