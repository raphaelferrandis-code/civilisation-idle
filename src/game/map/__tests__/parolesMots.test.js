import { describe, it, expect, beforeEach } from "vitest";

import { CM } from "../layout.js";
import { state } from "../../core/state.js";
import { defaultParoles, normalizeParoles, TALK_TONES } from "../../core/parolesState.js";
import { parolesNoteTalk, parolesSaid, parolesTalks, parolesNoteDeclic } from "../../core/paroles.js";
import { focusCitizen, clearCitizenFocus } from "../citizenFocus.js";
import { buildIdentity, householdOf, TRAITS } from "../citizenIdentity.js";
import { stopListening, listenContext, joursOf, LISTEN } from "../paroles/listen.js";
import { publishIdleReport } from "../../core/idleReport.js";
import { resetSigns, reactionLabel, signTick, REACT } from "../paroles/signs.js";
import { talkOffered, startTalk, talkChoose, talkTick, talkView, stopTalk, TALK } from "../paroles/talk.js";
import { pickTalk, pickReply, resolveYou, resolveLines, talkTranscript, talkChoices, talkSilence, parolesEligible } from "../paroles/pick.js";
import { PAROLES } from "../../data/paroles.js";
import { PAROLES_SIGNES, PAROLES_REPONSES, SIGN_ACTS } from "../../data/parolesSignes.js";
import { PAROLES_MOTS, VOIX, TALK_ORIENTATIONS } from "../../data/parolesMots.js";
import { NOMS_DU_JOUEUR } from "../../data/parolesToi.js";
import { chronicleArticles } from "../../data/chronicleArticles.js";
import { evaluateCondition } from "../../core/chronicleEvaluator.js";

// LES MOTS (docs/PLAN-ECOUTER-PARLER.md, lot 6) : dès la période 3, le joueur parle à un
// passant ; quatre réponses, une par voix (le joueur, le dieu, l'indifférent, sa vie), ou le
// silence ; ce qu'il répond, ce qu'il fait, et ce que la cité en retient.

const textsOf = (l) => [l.fr, l.m, l.f, l.en].filter(Boolean);
const byId = (id) => PAROLES_MOTS.find((e) => e.id === id);
const voix = (o, key) => VOIX[o].find((a) => a.key === key);
// Toutes les réponses : celles des échanges et celles du répertoire, avec leur période.
const ANSWERS = [
  ...PAROLES_MOTS.flatMap((e) => Object.entries(e.choices || {}).map(([o, c]) => ({ where: `${e.id}:${o}`, o, period: e.when.period, entry: e, ...c }))),
  ...TALK_ORIENTATIONS.flatMap((o) => VOIX[o].map((a) => ({ where: `voix:${o}:${a.key}`, o, period: null, ...a }))),
];
const SILENCES = [
  ...PAROLES_MOTS.filter((e) => e.silence).map((e) => ({ where: `${e.id}:silence`, period: e.when.period, replies: e.silence })),
  { where: "voix:silence", period: null, replies: VOIX.silence },
];
const REPLIES = [...ANSWERS, ...SILENCES].flatMap((a) => a.replies.map((r) => ({ where: a.where, period: (r.when && r.when.period) || a.period || [3, 10], ...r })));
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
  it("chaque échange a sa forme ; chaque réponse sa voix, ses mots et ses répliques ; chaque réplique son geste", () => {
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
      for (const o of Object.keys(e.choices || {})) expect(TALK_ORIENTATIONS, `${e.id} : ${o}`).toContain(o);
      const w = e.when;
      if (w.trait) expect(TRAITS.some((t) => t.key === w.trait), e.id).toBe(true);
      if (w.article) for (const a of w.article) expect(ARTICLES.has(a), `${e.id} : ${a}`).toBe(true);
    }
    for (const o of TALK_ORIENTATIONS) {
      const keys = VOIX[o].map((a) => a.key);
      expect(new Set(keys).size, o).toBe(keys.length);
      for (const k of keys) expect(`v:${o}:${k}`.length, k).toBeLessThanOrEqual(40);
    }
    for (const a of ANSWERS) {
      expect(!!a.you.en && (!!a.you.fr || (!!a.you.m && !!a.you.f)), a.where).toBe(true);
      expect(a.replies.length, a.where).toBeGreaterThan(0);
    }
    for (const r of REPLIES) {
      expect(ALL_ACTS, r.where).toContain(r.act);
      for (const l of r.lines) expect(!!l.en && (!!l.fr || (!!l.m && !!l.f)), r.where).toBe(true);
    }
  });

  it("les règles d'écriture : ni tiret, ni « ! », ni points de suspension, l'apostrophe typographique", () => {
    const all = [
      ...PAROLES_MOTS.flatMap((e) => e.lines),
      ...ANSWERS.map((a) => a.you),
      ...REPLIES.flatMap((r) => r.lines),
    ];
    for (const l of all) {
      for (const t of textsOf(l)) {
        expect(t).not.toMatch(/[—–!…]|\.\.\./);
        expect(t).not.toMatch(/'/);
      }
    }
  });

  it("la réplique dit son geste : qui fuit court, qui rentre rentre, qui prie y va, qui s'agenouille le dit", () => {
    const SAYS = {
      flee: /cour|vite|file|rentre|ne reste pas|quitte/i, home: /rentre|chez moi/i, kneel: /genou/i,
      pray: /temple|culte|prier|prière/i, wave: /signe|main|salue/i, parent: /maman|papa/i, back: /recul|arrière|écart/i,
    };
    for (const r of REPLIES) {
      const re = SAYS[r.act];
      if (re) expect(r.lines.map((l) => l.fr || l.m).join(" "), `${r.where} (${r.act})`).toMatch(re);
    }
  });

  it("le tutoiement suit le lien : « tu » au coin du feu et au Démiurge, « vous » entre les deux ; l'enfant dit toujours « tu »", () => {
    const TU = /(?<!\p{L})(tu|toi|te|ton|ta|tes)(?!\p{L})|(?<!\p{L})t’/u;
    const VOUS = /(?<!\p{L})(vous|votre|vos|vôtre)(?!\p{L})/u;
    const said = (ls) => ls.map((l) => l.fr || l.m).join(" ");
    for (const e of PAROLES_MOTS) {
      const [lo, hi] = e.when.period;
      const t = said(e.lines);
      if (e.when.child) expect(t, `${e.id} : l'enfant dit « tu »`).not.toMatch(VOUS);
      else if (lo >= 4 && hi <= 9) expect(t, `${e.id} : « vous »`).not.toMatch(TU);
      else if (hi <= 3 || lo >= 10) expect(t, `${e.id} : « tu »`).not.toMatch(VOUS);
    }
    for (const r of REPLIES) {
      const [lo, hi] = r.period;
      const t = said(r.lines);
      if (r.when && r.when.child) expect(t, `${r.where} : l'enfant dit « tu »`).not.toMatch(VOUS);
      else if (lo >= 4 && hi <= 9) expect(t, `${r.where} : « vous »`).not.toMatch(TU);
      else if (hi <= 3 || lo >= 10) expect(t, `${r.where} : « tu »`).not.toMatch(VOUS);
      else {
        // Valable à toutes les périodes : ni « tu » ni « vous » à qui lui parle.
        expect(t, `${r.where} : sans tutoiement`).not.toMatch(TU);
        expect(t, `${r.where} : sans vouvoiement`).not.toMatch(VOUS);
      }
    }
  });

  it("à chaque période, un adulte comme un enfant entend ta voix, et chaque voix a de quoi lui répondre", () => {
    for (let period = 3; period <= 10; period += 1) {
      const band = BAND_OF[period];
      for (const [who, a] of [["adulte", adult()], ["enfant", adult({ child: true, family: "child" })]]) {
        const ctx = ctxOf({ period, band, a });
        const r = pickTalk(ctx, {}, () => 0.5);
        expect(r, `période ${period}, ${who}`).not.toBe(null);
        for (const e of PAROLES_MOTS.filter((x) => parolesEligible(x, ctx))) {
          const voices = talkChoices(e, ctx).map((c) => c.orientation);
          expect(voices, `${e.id}, période ${period}, ${who}`).toEqual(TALK_ORIENTATIONS);
          expect(talkSilence(e, ctx), `${e.id}, période ${period}, ${who} : le silence`).not.toBe(null);
        }
      }
    }
  });
});

describe("ce que tu dis, ce qu'il répond", () => {
  it("rien avant la période 3, ni l'échange d'une autre période", () => {
    expect(pickTalk(ctxOf({ period: 2, band: 1 }), {}, () => 0.5)).toBe(null);
    expect(parolesEligible(byId("m4-seigneur"), ctxOf({ period: 3, band: 3 }))).toBe(false);
    expect(parolesEligible(byId("m4-seigneur"), ctxOf({ period: 4, band: 3 }))).toBe(true);
  });

  it("quatre voix, dans le même ordre : le joueur, le dieu, l'indifférent, sa vie", () => {
    expect(TALK_ORIENTATIONS).toEqual(["joueur", "dieu", "indifferent", "vie"]);
    const choices = talkChoices(byId("m3-qui"), ctxOf(), {}, () => 0);
    expect(choices.map((c) => c.orientation)).toEqual(TALK_ORIENTATIONS);
    expect(choices.every((c) => c.key.startsWith(`${c.orientation}:`))).toBe(true);
  });

  it("l'échange prévoit parfois sa propre réponse pour une voix : « Lequel des deux ? »", () => {
    const ctx = ctxOf({ period: 5, band: 4 });
    const c = talkChoices(byId("m5-lequel"), ctx);
    expect(c.map((x) => [x.orientation, x.key, resolveYou(x.you, ctx).fr, x.belief])).toEqual([
      ["joueur", "joueur", "Je fais des essais.", "test"],
      ["dieu", "dieu", "Je vous guide.", "guide"],
      ["indifferent", "indifferent", "J’attends.", "wait"],
      ["vie", "vie", "Et ton frère, vous vous parlez encore ?", null],
    ]);
  });

  it("sa vie : ses enfants et son conjoint par leurs prénoms, ce qu'il fait ; jamais ce qu'il n'a pas", () => {
    const parent = ctxOf({ a: adult({ family: "married", kids: 2 }), names: { a: "Garin", enfant: "Tassin", conjoint: "Oda" } });
    const keys = (ctx) => VOIX.vie.filter((a) => parolesEligible({ kind: "talk", layer: 1, when: a.when || {}, lines: [{ who: "a", ...a.you }] }, ctx) && pickReply(a.replies, ctx)).map((a) => a.key);
    expect(keys(parent)).toEqual(expect.arrayContaining(["enfant", "conjoint", "dormi", "mange"]));
    expect(keys(ctxOf())).not.toContain("enfant");
    expect(keys(ctxOf())).not.toContain("conjoint");
    expect(keys(ctxOf({ doing: "home" }))).toContain("rentres");
    expect(keys(ctxOf({ a: adult({ child: true, family: "child" }) }))).toContain("joue-avec");
    expect(resolveYou(voix("vie", "enfant").you, parent).fr).toBe("Comment va Tassin ?");
    expect(pickReply(voix("vie", "enfant").replies, parent).lines[0].fr).toBe("Tassin ? Toujours cette toux. Comment tu connais son prénom ?");
  });

  it("le dieu dit le nom que la gazette lui donne, et seulement s'il en a un", () => {
    const nom = ctxOf({ names: { a: "Garin", nom: { fr: NOMS_DU_JOUEUR.p3_knowledge_probability.fr, en: NOMS_DU_JOUEUR.p3_knowledge_probability.en } } });
    const ok = (ctx) => VOIX.dieu.filter((a) => parolesEligible({ kind: "talk", layer: 1, when: a.when || {}, lines: [{ who: "a", ...a.you }] }, ctx)).map((a) => a.key);
    expect(ok(nom)).toContain("nom");
    expect(ok(ctxOf())).not.toContain("nom");
    expect(resolveYou(voix("dieu", "nom").you, nom).fr).toBe("C’est moi que vous appelez la main invisible.");
  });

  it("chaque âge entend le joueur avec ses mots : les osselets, les dés, le loto, l'écran", () => {
    const joue = voix("joueur", "joue");
    const at = (period) => pickReply(joue.replies, ctxOf({ period, band: BAND_OF[period] })).lines[0].fr;
    expect(at(3)).toMatch(/osselets/);
    expect(at(4)).toMatch(/dés/);
    expect(at(6)).toMatch(/loto/);
    expect(at(7)).toMatch(/écran/);
    expect(at(10)).toMatch(/archives de l’Amas/);
  });

  it("le caractère fait la réponse : le pieux s'agenouille, le superstitieux rentre, le râleur compte ce qui ne va pas", () => {
    const veille = voix("dieu", "veille");
    expect(pickReply(veille.replies, ctxOf({ a: adult({ traits: ["pious", "early"] }) })).act).toBe("kneel");
    expect(pickReply(veille.replies, ctxOf({ a: adult({ traits: ["superstitious", "proud"] }) })).act).toBe("flee");
    expect(pickReply(veille.replies, ctxOf({ period: 5, band: 4, a: adult({ traits: ["grumpy"] }) })).lines[0].fr).toMatch(/égout/);
    // Sans la pose à genoux (son dessin ne l'a pas), la réplique suivante.
    expect(pickReply(veille.replies, ctxOf({ a: adult({ traits: ["pious"] }), acts: ["look", "search", "go"] })).act).toBe("look");
  });

  it("l'enfant parle en enfant, et dit « tu »", () => {
    const kid = ctxOf({ period: 6, band: 5, a: adult({ child: true, family: "child" }) });
    expect(pickReply(voix("joueur", "joue").replies, kid).lines[0].fr).toBe("Moi aussi, je joue. Tu joues à quoi ?");
    expect(pickReply(voix("dieu", "bati").replies, kid).lines[0].fr).toBe("Tu as fait les arbres aussi ? Et les chats ?");
  });

  it("au Démiurge, il te dit son nom", () => {
    const ctx = ctxOf({ period: 10, band: 9, names: { a: "Ilya" } });
    const oui = talkChoices(byId("m10-souvenir"), ctx).find((c) => c.orientation === "dieu");
    expect(pickReply(oui.replies, ctx).lines[0].fr).toBe("Alors souviens-toi de moi. Je m’appelle Ilya.");
  });

  it("le répertoire tourne : la réponse déjà dite revient après les autres", () => {
    const ctx = ctxOf();
    const first = talkChoices(byId("m3-qui"), ctx, {}, () => 0).find((c) => c.orientation === "indifferent");
    const next = talkChoices(byId("m3-qui"), ctx, { [first.voix]: 1 }, () => 0).find((c) => c.orientation === "indifferent");
    expect(next.key).not.toBe(first.key);
  });

  it("un échange se relit : sa réplique, ta réponse ou ton silence, la sienne", () => {
    const ctx = { kind: "talk", names: { a: "Ilya" }, a: { fem: true }, b: { fem: false } };
    expect(talkTranscript(byId("m10-souvenir"), { key: "dieu", ri: 0 }, ctx).map((l) => [l.who, l.fr || null, !!l.silent])).toEqual([
      ["a", "Tu recommences tout, chaque fois. Tu te souviens de nous, après ?", false],
      ["you", "Oui.", false],
      ["a", "Alors souviens-toi de moi. Je m’appelle Ilya.", false],
    ]);
    const repertoire = talkTranscript(byId("m3-qui"), { key: "joueur:joue", ri: 2 }, ctx);
    expect(repertoire.map((l) => l.fr)).toEqual(["Qui a parlé ? Il n’y a personne.", "Je joue.", "Tu joues ? Comme les enfants aux osselets ?"]);
    const tais = talkTranscript(byId("m3-qui"), { key: "silence", ri: 0 }, ctx);
    expect(tais[1]).toEqual({ who: "you", silent: true });
    expect(tais[2].fr).toBe("J’ai dû rêver. Je dors mal depuis la dernière lune.");
    expect(talkTranscript(byId("m3-voisin"), { key: "silence:voix", ri: 1 }, ctx)[2].fr).toBe("Plus rien. J’ai dû l’imaginer.");
    // L'échange a changé depuis : rien.
    expect(talkTranscript(byId("m3-qui"), { key: "dieu:disparue", ri: 0 }, ctx)).toBe(null);
  });

  it("jamais deux fois le même échange tant qu'il en reste de neuf", () => {
    const ctx = ctxOf({ declic: true, a: adult({ traits: ["curious"] }) });
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

  it("la cité retient à qui tu as parlé et de quelle voix ; la suivante ne le sait pas ; le compte est éternel", () => {
    parolesNoteTalk("m3-qui", { key: "dieu:veille", tone: "dieu", who: "Garin", fem: false, voix: "v:dieu:veille" });
    parolesNoteTalk("m4-seigneur", { key: "silence", tone: "muet", who: "Oda", fem: true });
    expect(parolesSaid().map((x) => [x.who, x.key, x.tone])).toEqual([["Garin", "dieu:veille", "dieu"], ["Oda", "silence", "muet"]]);
    expect(state.paroles.mots.tones).toEqual({ dieu: 1, muet: 1 });
    expect(state.paroles.heard["m3-qui"]).toBe(1);
    expect(state.paroles.heard["v:dieu:veille"]).toBe(1);
    // Parler ne compte pas pour la confiance (elle ne vient que de l'écoute).
    expect(state.paroles.n | 0).toBe(0);
    state.cycles = 4;
    expect(parolesSaid()).toEqual([]);
    parolesNoteTalk("m3-qui", { key: "vie:enfant", tone: "vie", who: "Ilya", fem: true });
    expect(parolesTalks()).toBe(3);
    expect(state.paroles.mots.tones).toEqual({ vie: 1 });
    expect(TALK_TONES).toEqual(["joueur", "dieu", "indifferent", "vie", "muet"]);
  });

  it("la sauvegarde garde ce qui a été dit, et l'échange relu dans le panneau", () => {
    const out = normalizeParoles({
      mots: { n: 5, city: 3, tones: { dieu: 2, vrai: 9 }, said: [{ id: "m5-lequel", key: "joueur", tone: "joueur", belief: "test", who: "Oda", fem: true, at: 12 }, { id: "x", key: "?", tone: "dieu", who: "A" }] },
      toi: [{ id: "m5-lequel", at: 1, a: "Oda", talk: { key: "dieu:veille", ri: 1 } }, { id: "m3-qui", at: 2, a: "Garin", talk: { key: "BAD KEY" } }],
    });
    expect(out.mots).toEqual({ n: 5, city: 3, tones: { dieu: 2 }, said: [{ id: "m5-lequel", key: "joueur", tone: "joueur", belief: "test", who: "Oda", fem: true, at: 12 }] });
    expect(out.toi[0].talk).toEqual({ key: "dieu:veille", ri: 1 });
    expect(out.toi[1].talk).toBeUndefined();
    expect(normalizeParoles({}).mots).toEqual({ n: 0, city: -1, said: [], tones: {} });
  });
});

describe("la gazette en parle", () => {
  const withTones = (tones, city = 3) => ({ cycles: 3, grandResetCount: 0, paroles: { mots: { n: 9, city, said: [], tones } } });

  it("quand une voix domine dans la cité (trois échanges, le silence ne compte pas), la gazette en parle", () => {
    expect(evaluateCondition("voix_vie", withTones({ vie: 2, dieu: 1 }))).toBe(true);
    expect(evaluateCondition("voix_dieu", withTones({ vie: 2, dieu: 1 }))).toBe(false);
    expect(evaluateCondition("voix_vie", withTones({ vie: 2 }))).toBe(false);
    expect(evaluateCondition("voix_vie", withTones({ vie: 2, muet: 5 }))).toBe(false);
    // Une autre cité ne compte pas.
    expect(evaluateCondition("voix_vie", withTones({ vie: 3 }, 2))).toBe(false);
  });

  it("chaque période de la voix a son article pour chaque voix, et chacun te donne le nom de ta voix", () => {
    const NOMS = { joueur: "le Joueur", dieu: "le Maître", indifferent: "le Passant", vie: "le Voisin d’en haut" };
    for (let period = 3; period <= 10; period += 1) {
      for (const o of TALK_ORIENTATIONS) {
        const arts = chronicleArticles.filter((a) => a.period === period && a.conditionType === `voix_${o}`);
        expect(arts.length, `période ${period}, ${o}`).toBe(1);
        expect(NOMS_DU_JOUEUR[arts[0].id].fr, arts[0].id).toBe(NOMS[o]);
      }
    }
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

  it("il entend la voix, s'arrête et lève les yeux vers toi ; puis tes quatre réponses", () => {
    const p = someone();
    CM.citizens = [p];
    focusCitizen(p);
    const t0 = clock();
    expect(startTalk(t0)).toBe(true);
    signTick(t0 + REACT.notice + 50);
    expect([0, 2]).toContain(p.dir);
    expect(p.pauseT).toBeGreaterThan(5);
    expect(reactionLabel(p, t0 + REACT.notice + 50).fr).toBe("T’écoute");
    const v0 = talkView(t0 + 10);
    expect(v0.lines[0].name).toBe(p.identity.given);
    expect(v0.choices).toBe(null);
    const v1 = talkView(CM.talking.chooseAt + 1);
    expect(v1.choices.length).toBe(4);
    expect(CM.talking.choices.map((c) => c.orientation)).toEqual(TALK_ORIENTATIONS);
  });

  it("tu réponds en dieu : ta réplique, la sienne, son geste ; la cité le retient, le panneau aussi", () => {
    const p = someone({}, ["pious", "early"]);
    CM.citizens = [p];
    focusCitizen(p);
    const t0 = clock();
    startTalk(t0);
    const at = CM.talking.chooseAt + 1;
    const dieu = CM.talking.choices.find((c) => c.orientation === "dieu");
    expect(talkChoose(dieu.key, at)).toBe(true);
    const v = talkView(at + LISTEN.lineMs + 1);
    expect(v.lines[1]).toMatchObject({ who: "you", fr: dieu.fr });
    expect(v.lines.length).toBe(3);
    expect(state.paroles.mots.said.at(-1)).toMatchObject({ id: CM.talking.id, key: dieu.key, tone: "dieu", who: p.identity.given });
    expect(state.paroles.toi.at(-1)).toMatchObject({ id: CM.talking.id, a: p.identity.given, talk: { key: dieu.key } });
    talkTick(at + LISTEN.lineMs + 10);
    expect(p._react.act).toBe(CM.talking.act);
    expect(talkView(at + 3 * LISTEN.lineMs).done).toBe(true);
  });

  it("tu ne dis rien : le silence répond pour toi, et il repart", () => {
    const p = someone();
    CM.citizens = [p];
    focusCitizen(p);
    startTalk(clock());
    talkTick(CM.talking.until + 1);
    expect(CM.talking.said).toMatchObject({ tone: "muet" });
    const v = talkView(CM.talking.until + LISTEN.lineMs + 2);
    expect(v.lines[1]).toMatchObject({ who: "you", silent: true });
    talkTick(CM.talking.actAt + 1);
    expect(p._react.act).toBe(CM.talking.act);
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
    expect(state.paroles.mots.said.at(-1)).toMatchObject({ tone: "muet" });
    expect(p._react).toBe(null);
    expect(p.pauseT).toBe(0);
  });

  it("un personnage de scène entend la voix aussi : il se tourne vers toi, prend du retard sur sa scène, ne la quitte pas", () => {
    const fig = someone({ scene: "quai" });
    focusCitizen(fig);
    CM.focus.kind = "figure";
    expect(talkOffered()).toBe(true);
    const t0 = clock();
    expect(startTalk(t0)).toBe(true);
    signTick(t0 + 300);
    signTick(t0 + 1300);
    expect([0, 2]).toContain(fig._signDir);
    expect(fig._signLag).toBeGreaterThan(0);
    const T = CM.talking;
    // Ses réponses ne lui font jamais quitter sa scène.
    for (const c of T.defs) expect(["look", "search", "go"]).toContain(pickReply(c.replies, T.ctx).act);
    talkChoose(T.choices[0].key, T.chooseAt + 1);
    talkTick(T.actAt + 1);
    expect(CM.talking).toBe(T);
    // Le porteur du port : seulement s'il a encore une longue escale.
    stopTalk();
    resetSigns();
    const porteur = someone({ scene: "port", left: 40 });
    focusCitizen(porteur);
    CM.focus.kind = "figure";
    expect(talkOffered()).toBe(false);
    porteur.left = 90; porteur._talkAvail = null;
    expect(talkOffered()).toBe(true);
  });

  it("une promesse se paie : « Je reviendrai te voir. », trois jours d'absence, et l'on s'en souvient", () => {
    const p = someone();
    const q = someone({ seed: 501, gx: 14, x: 14.5 * T });
    q.identity = { ...q.identity, given: "Ilya", name: "Ilya" };
    q.name = "Ilya";
    CM.citizens = [p, q];
    focusCitizen(p);
    startTalk(clock());
    // La réponse qui promet (de la voix « sa vie »), proposée ici.
    const TK = CM.talking;
    const a = VOIX.vie.find((x) => x.key === "reviendrai");
    TK.defs = TK.defs.filter((d) => d.orientation !== "vie").concat([{ orientation: "vie", key: "vie:reviendrai", you: a.you, belief: null, replies: a.replies, voix: "v:vie:reviendrai", promise: true }]);
    expect(talkChoose("vie:reviendrai", TK.chooseAt + 1)).toBe(true);
    stopTalk();
    const who = p.identity.given;
    expect(state.paroles.promesse).toMatchObject({ who, city: 3 });
    // Il revient le lendemain : rien de spécial.
    state.paroles.promesse.at -= 1000;
    publishIdleReport({ awaySec: 26 * 3600 });
    expect(listenContext("thought", p, "citizen").promised).toBe(false);
    // Il revient après quatre jours : celui à qui il l'a dit s'en souvient, les autres le nomment.
    publishIdleReport({ awaySec: 4 * 86400 + 600 });
    const ctx = listenContext("thought", p, "citizen");
    expect(ctx.promised).toBe(true);
    const e = PAROLES.find((x) => x.id === "em-promis-p3");
    expect(parolesEligible(e, { ...ctx, trust: 1 })).toBe(true);
    expect(resolveLines(e, ctx)[0].fr).toBe("Tu avais dit que tu reviendrais. Ça fait quatre jours. Je venais ici chaque matin.");
    const other = listenContext("thought", q, "citizen");
    expect(other.promise).toBe(true);
    const r = PAROLES.find((x) => x.id === "em-promesse");
    expect(parolesEligible(r, other)).toBe(true);
    expect(resolveLines(r, other)[0].fr).toBe(`La voix avait promis à ${who} de revenir. Elle a mis quatre jours.`);
    expect(joursOf(30 * 86400)).toEqual({ fr: "30", en: "30" });
    // Dans la cité suivante, la rue ne s'en souvient plus.
    state.cycles = 4;
    expect(listenContext("thought", p, "citizen").promised).toBe(false);
  });

  it("la rue nomme celui à qui la voix a parlé, et de quelle voix ; jamais à celui qui l'a entendue", () => {
    const p = someone();
    const other = someone({ seed: 501, gx: 14, x: 14.5 * T });
    other.identity = { ...other.identity, given: "Ilya", name: "Ilya" };
    other.name = "Ilya";
    CM.citizens = [p, other];
    focusCitizen(p);
    startTalk(clock());
    const dieu = CM.talking.choices.find((c) => c.orientation === "dieu");
    talkChoose(dieu.key, CM.talking.chooseAt + 1);
    stopTalk();
    const who = p.identity.given;
    const ctx = listenContext("thought", other, "citizen");
    expect(ctx.saidBy.dieu.who).toBe(who);
    expect(ctx.saidBy[dieu.key].who).toBe(who);
    const e = PAROLES.find((x) => x.id === "em-dieu-seigneur");
    expect(parolesEligible(e, { ...ctx, band: 2 })).toBe(true);
    expect(resolveLines(e, { ...ctx, band: 2 })[0].fr).toBe(`${who} dit que la voix parle comme un seigneur. Je ne sais pas si c’est une bonne nouvelle.`);
    // Celui qui l'a entendue n'en parle pas comme d'un autre.
    expect(listenContext("thought", p, "citizen").saidBy.dieu).toBeUndefined();
    // Une seule fois : la cité ne croit encore rien.
    expect(ctx.saidMost).toBe(null);
  });

  it("après trois échanges, la cité croit ce que dit la voix qui domine", () => {
    for (const [k, t] of [["dieu:veille", "dieu"], ["dieu:bati", "dieu"], ["vie:dormi", "vie"], ["silence", "muet"]]) {
      parolesNoteTalk("m3-qui", { key: k, tone: t, who: "Oda", fem: true });
    }
    const p = someone();
    CM.citizens = [p];
    const ctx = listenContext("thought", p, "citizen");
    expect(ctx.saidMost).toBe("dieu");
    const e = PAROLES.find((x) => x.id === "em-plus-dieu");
    expect(parolesEligible(e, { ...ctx, band: 2, trust: 1 })).toBe(true);
    expect(parolesEligible(PAROLES.find((x) => x.id === "em-plus-vie"), { ...ctx, band: 2, trust: 1 })).toBe(false);
  });

  it("les mots qui demandent le déclic : Claude en parle si le joueur l'a entendu dans cette cité", () => {
    parolesNoteDeclic();
    const p = someone({}, ["chatty", "curious"]);
    CM.citizens = [p];
    focusCitizen(p);
    const seen = new Set();
    for (let i = 0; i < 6; i += 1) {
      p._talked = false; p._talkAvail = null;
      startTalk(clock());
      seen.add(CM.talking.id);
      stopTalk();
      resetSigns();
    }
    expect(seen.has("m3-claude")).toBe(true);
    expect(TALK.fromPeriod).toBe(3);
  });
});
