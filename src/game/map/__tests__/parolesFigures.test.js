import { describe, it, expect, beforeEach } from "vitest";

import { CM } from "../layout.js";
import { state } from "../../core/state.js";
import { defaultParoles, normalizeParoles } from "../../core/parolesState.js";
import { parolesNoteFigure, parolesFigureKnows } from "../../core/paroles.js";
import { focusCitizen, clearCitizenFocus, citizenSheet } from "../citizenFocus.js";
import { JOBS, jobLabel, ageRange } from "../citizenIdentity.js";
import { citizenSpriteName } from "../agents.js";
import { stopListening } from "../paroles/listen.js";
import { resetSigns } from "../paroles/signs.js";
import { talkOffered, startTalk, talkChoose, stopTalk } from "../paroles/talk.js";
import { pickParole, pickTalk, pickSign, talkChoices, talkSilence, parolesEligible } from "../paroles/pick.js";
import { figuresTick, figureOf, resetFigures, FIGURES_LIVE, figureOfAuthor, findFigure, showFigure } from "../paroles/figures.js";
import { PAROLES, JOB_GROUP } from "../../data/paroles.js";
import { PAROLES_SIGNES, PAROLES_REPONSES, SIGN_ACTS } from "../../data/parolesSignes.js";
import { PAROLES_MOTS, TALK_ORIENTATIONS } from "../../data/parolesMots.js";
import { FIGURES, FIGURE_KEYS, FIGURES_FROM, FIGURE_PENSEES, FIGURE_MOTS, FIGURE_SIGNES, figureJob } from "../../data/parolesFigures.js";
import { chronicleArticles } from "../../data/chronicleArticles.js";

// LES FIGURES DE LA CHRONIQUE DANS LA RUE (docs/PLAN-ECOUTER-PARLER.md, lot 6, § 7.4) :
// Claude, Edith, Raphaël, Khael et Aldric vivent dans la cité dès la période 3, avec le
// métier que signe la gazette, leurs pensées et leurs mots à eux.

const textsOf = (l) => [l.fr, l.m, l.f, l.en].filter(Boolean);
const said = (ls) => ls.map((l) => l.fr || l.m).join(" ");
// Les âges de la cité qu'une période de la gazette recouvre (eraThemes.eraBandOf).
const BANDS_OF = { 3: [1, 2], 4: [3, 4], 5: [4, 5], 6: [5, 6], 7: [6, 6], 8: [7, 7], 9: [8, 8], 10: [9, 9] };
const ARTICLES = new Set(chronicleArticles.map((a) => a.id));
const someoneView = (o = {}) => ({ fem: false, child: false, old: false, job: null, traits: [], family: "single", kids: 0, chronique: null, ...o });
// Ce que l'écoute sait d'une figure (listen.personOf) : ni famille, ni enfants.
const figureView = (key, period) => {
  const F = FIGURES[key];
  return someoneView({ fem: F.fem, old: F.age === "old", job: figureJob(key, period).job, traits: F.traits, family: null, chronique: key });
};
const ctxOf = (o = {}) => ({
  kind: "thought", band: 2, period: 3, night: false, precip: null, riot: false, wonder: false, prosper: false, cause: null,
  season: "summer", doing: null, declic: false, declics: 0, knows: false, articles: ARTICLES, acts: SIGN_ACTS,
  a: someoneView(), b: null, rel: null, kidIs: null, names: { a: "Garin" }, ...o,
});
const figureCtx = (key, period, o = {}) => ctxOf({
  period, band: BANDS_OF[period][0], a: figureView(key, period), names: { a: FIGURES[key].given }, ...o,
});
// Toutes les réponses des figures et leurs répliques, avec leur période.
const ANSWERS = FIGURE_MOTS.flatMap((e) => Object.entries(e.choices || {}).map(([o, c]) => ({ where: `${e.id}:${o}`, entry: e, ...c })));
const REPLIES = [
  ...ANSWERS.flatMap((a) => a.replies.map((r) => ({ where: a.where, entry: a.entry, ...r }))),
  ...FIGURE_MOTS.filter((e) => e.silence).flatMap((e) => e.silence.map((r) => ({ where: `${e.id}:silence`, entry: e, ...r }))),
];

describe("le catalogue des figures", () => {
  it("chaque entrée a sa forme, sa figure, et des âges qui vont avec ses périodes", () => {
    const ids = new Set([...PAROLES_MOTS, ...PAROLES_REPONSES].map((e) => e.id));
    for (const e of [...FIGURE_PENSEES, ...FIGURE_MOTS, ...FIGURE_SIGNES]) {
      expect(ids.has(e.id), e.id).toBe(false);
      ids.add(e.id);
      expect(FIGURE_KEYS, e.id).toContain(e.when.chronique);
      const [lo, hi] = e.bands;
      expect(lo <= hi && hi - lo <= 4, `${e.id} : âges`).toBe(true);
      if (e.when.period) {
        const [p0, p1] = e.when.period;
        expect(p0 >= FIGURES_FROM && p1 <= 10, e.id).toBe(true);
        // Ses âges sont ceux de ses périodes, ni plus ni moins.
        expect(lo, `${e.id} : premier âge`).toBe(BANDS_OF[p0][0]);
        expect(hi, `${e.id} : dernier âge`).toBe(BANDS_OF[p1][1]);
      }
      for (const l of e.lines) expect(!!l.en && !!l.fr, e.id).toBe(true);
    }
    // Les pensées et les signes sont dans les catalogues de l'écoute.
    for (const e of FIGURE_PENSEES) expect(PAROLES).toContain(e);
    for (const e of FIGURE_SIGNES) expect(PAROLES_SIGNES.some((x) => x.id === e.id), e.id).toBe(true);
    for (const a of ANSWERS) {
      expect(TALK_ORIENTATIONS, a.where).toContain(a.where.split(":").pop());
      expect(!!a.you.fr && !!a.you.en, a.where).toBe(true);
    }
    for (const r of REPLIES) {
      expect(SIGN_ACTS, r.where).toContain(r.act);
      for (const l of r.lines) expect(!!l.fr && !!l.en, r.where).toBe(true);
    }
  });

  it("les règles d'écriture : ni tiret, ni « ! », ni points de suspension, l'apostrophe typographique, aucun prénom à poser sauf la bête", () => {
    const all = [
      ...FIGURE_PENSEES.flatMap((e) => e.lines), ...FIGURE_MOTS.flatMap((e) => e.lines), ...FIGURE_SIGNES.flatMap((e) => e.lines),
      ...ANSWERS.map((a) => a.you), ...REPLIES.flatMap((r) => r.lines),
    ];
    for (const l of all) {
      for (const t of textsOf(l)) {
        expect(t).not.toMatch(/[—–!…]|\.\.\./);
        expect(t).not.toMatch(/'/);
        for (const m of t.matchAll(/\{(\w+)\}/g)) expect(["Bete"], t).toContain(m[1]);
      }
    }
  });

  it("le tutoiement : Claude dit « tu » à tous les âges ; les autres suivent le lien, « vous » de la période 4 à la 9", () => {
    const TU = /(?<!\p{L})(tu|toi|te|ton|ta|tes)(?!\p{L})|(?<!\p{L})t’/u;
    const VOUS = /(?<!\p{L})(vous|votre|vos|vôtre)(?!\p{L})/u;
    const check = (e, lines, where) => {
      const t = said(lines);
      const [lo, hi] = e.when.period;
      if (e.when.chronique === "claude") expect(t, `${where} : Claude dit « tu »`).not.toMatch(VOUS);
      else if (lo >= 4 && hi <= 9) expect(t, `${where} : « vous »`).not.toMatch(TU);
      else expect(t, `${where} : « tu »`).not.toMatch(VOUS);
    };
    for (const e of FIGURE_MOTS) check(e, e.lines, e.id);
    for (const r of REPLIES) check(r.entry, r.lines, r.where);
    // Pour que Claude ne dise jamais « vous », ses échanges des périodes 4 à 9 ont leurs quatre
    // réponses et leur silence (le répertoire, lui, vouvoie à ces périodes).
    for (const e of FIGURE_MOTS.filter((x) => x.when.chronique === "claude" && x.when.period[0] >= 4 && x.when.period[1] <= 9)) {
      expect(Object.keys(e.choices || {}).sort(), e.id).toEqual([...TALK_ORIENTATIONS].sort());
      expect(e.silence && e.silence.length, `${e.id} : son silence`).toBeTruthy();
    }
  });

  it("le métier de la fiche est celui que signe la gazette, à chaque période", () => {
    let n = 0;
    for (const a of chronicleArticles) {
      // (La gazette est aplatie à la langue courante au chargement : une chaîne, ou { fr, en }.)
      const by = typeof a.author === "string" ? a.author : a.author && a.author.fr;
      if (!by) continue;
      const [who, title] = by.split(", ");
      const key = FIGURE_KEYS.find((k) => FIGURES[k].given === who);
      if (!key) continue;
      const job = figureJob(key, a.period).job;
      expect(JOBS[job], `${a.id} : ${job}`).toBeTruthy();
      expect(jobLabel(job, FIGURES[key].fem).fr.toLowerCase(), a.id).toBe(title.toLowerCase());
      n += 1;
    }
    expect(n).toBeGreaterThan(80);
    for (const k of FIGURE_KEYS) for (const [, job] of FIGURES[k].jobs) expect(JOB_GROUP[job], job).toBeTruthy();
  });

  it("seuls Claude et Aldric sont vieux, à tous les âges (l'écoute ne demande pas à Khael comment va son dos)", () => {
    for (let band = 1; band <= 9; band += 1) {
      const oldFrom = ageRange(band, "old")[0];
      for (const k of FIGURE_KEYS) {
        const F = FIGURES[k];
        const [lo, hi] = ageRange(band, F.age);
        const age = Math.round(lo + (hi - lo) * F.ageAt);
        expect(age >= oldFrom, `${k}, âge ${band} : ${age} ans`).toBe(F.age === "old");
      }
    }
  });

  it("leur dessin à chaque âge existe ; Claude ne porte jamais celui d'une autre figure", () => {
    for (let band = 1; band <= 9; band += 1) {
      const look = Object.fromEntries(FIGURE_KEYS.map((k) => {
        const F = FIGURES[k];
        return [k, citizenSpriteName({ charType: F.fem ? 1 : 0, skinVariant: F.look[band] }, band)];
      }));
      for (const k of FIGURE_KEYS) {
        expect(look[k], `${k}, âge ${band}`).toBeTruthy();
        // La variante tombe dans la liste (pas de repli par modulo sur un autre dessin).
        expect(FIGURES[k].look[band], `${k}, âge ${band}`).toBeLessThan(FIGURES[k].fem ? 3 : 4);
        if (k !== "claude") expect(look[k], `${k} et Claude, âge ${band}`).not.toBe(look.claude);
      }
    }
  });
});

describe("à chacun ses mots", () => {
  it("à chaque période, chaque figure pense ses pensées et te parle de ses mots, de jour comme de nuit ; quatre voix pour lui répondre", () => {
    for (const k of FIGURE_KEYS) {
      for (let period = 3; period <= 10; period += 1) {
        for (const band of BANDS_OF[period]) {
          for (const night of [false, true]) {
            const th = pickParole(figureCtx(k, period, { band, night }), {}, () => 0.5);
            expect(th, `${k}, période ${period}, âge ${band} : une pensée`).not.toBe(null);
            const e = PAROLES.find((x) => x.id === th.id);
            expect(e.when.chronique === k || (e.when.job || []).includes(figureView(k, period).job), `${th.id} n'est pas à ${k}`).toBe(true);
            const ctx = figureCtx(k, period, { band, night, kind: "talk" });
            expect(pickTalk(ctx, {}, () => 0.5), `${k}, période ${period}, âge ${band} : un échange`).not.toBe(null);
            for (const m of FIGURE_MOTS.filter((x) => parolesEligible(x, ctx))) {
              expect(m.when.chronique, m.id).toBe(k);
              expect(talkChoices(m, ctx).map((c) => c.orientation), m.id).toEqual(TALK_ORIENTATIONS);
              expect(talkSilence(m, ctx), `${m.id} : le silence`).not.toBe(null);
            }
          }
        }
      }
    }
  });

  it("une figure n'a jamais les mots d'un passant, ni un passant les siens", () => {
    for (let period = 3; period <= 10; period += 1) {
      const band = BANDS_OF[period][1];
      for (const k of FIGURE_KEYS) {
        const ctx = figureCtx(k, period, { band, kind: "talk" });
        for (const e of PAROLES_MOTS) expect(parolesEligible(e, ctx), `${e.id} pour ${k}`).toBe(false);
        const th = figureCtx(k, period, { band });
        for (const e of PAROLES.filter((x) => x.kind === "thought" && !x.when?.chronique && !x.when?.job)) {
          expect(parolesEligible(e, th), `${e.id} pour ${k}`).toBe(false);
        }
      }
      const passant = ctxOf({ period, band, kind: "talk", knows: true, declic: true });
      for (const e of FIGURE_MOTS) expect(parolesEligible(e, passant), e.id).toBe(false);
      for (const e of FIGURE_PENSEES) expect(parolesEligible(e, { ...passant, kind: "thought" }), e.id).toBe(false);
    }
  });

  it("un signe à Claude : il sait qui le fait, à tous les âges ; les autres figures le reçoivent comme tout le monde", () => {
    for (let band = 1; band <= 9; band += 1) {
      for (const sign of ["wind", "light", "fire", "beast"]) {
        const base = { kind: "sign", band, period: 5, stage: 1, sign, names: { a: "Claude", bete: "le chien", Bete: "Le chien" }, beast: "dog" };
        const r = pickSign(ctxOf({ ...base, a: figureView("claude", 5) }), {}, () => 0.5);
        expect(r, `Claude, ${sign}, âge ${band}`).not.toBe(null);
        expect(r.id, `${sign}, âge ${band}`).toMatch(/^(fs-claude|v-s)-/);
        const o = pickSign(ctxOf({ ...base, a: figureView("edith", 5), names: { ...base.names, a: "Edith" } }), {}, () => 0.5);
        if (o) expect(o.id).not.toMatch(/claude/);
      }
    }
  });

  it("Claude se souvient : « On s’est déjà parlé » ne vient que si tu lui as parlé dans une autre cité", () => {
    const souvenir = FIGURE_MOTS.find((e) => e.id === "fm-claude-souvenir");
    expect(parolesEligible(souvenir, figureCtx("claude", 3, { kind: "talk" }))).toBe(false);
    expect(parolesEligible(souvenir, figureCtx("claude", 3, { kind: "talk", knows: true }))).toBe(true);
    // Il le dit d'abord, quel que soit le tirage ; ensuite, ses autres mots reviennent.
    for (const x of [0, 0.5, 0.99]) {
      expect(pickTalk(figureCtx("claude", 3, { kind: "talk", knows: true }), {}, () => x).id).toBe("fm-claude-souvenir");
    }
    expect(pickTalk(figureCtx("claude", 3, { kind: "talk", knows: true }), { "fm-claude-souvenir": 1 }, () => 0.5).id).not.toBe("fm-claude-souvenir");
    state.paroles = defaultParoles();
    state.cycles = 2; state.grandResetCount = 0;
    expect(parolesFigureKnows("claude")).toBe(false);
    parolesNoteFigure("claude");
    expect(parolesFigureKnows("claude")).toBe(false);   // la même cité
    state.cycles = 3;
    expect(parolesFigureKnows("claude")).toBe(true);    // la cité d'après
    parolesNoteFigure("claude");
    expect(parolesFigureKnows("claude")).toBe(true);    // il t'a connu avant
    expect(parolesFigureKnows("edith")).toBe(false);
    expect(state.paroles.figures.claude).toEqual({ n: 2, city: 3, before: true });
    // La sauvegarde : éternelle, bornée.
    expect(normalizeParoles({ figures: { claude: { n: 2, city: 3, before: true }, "x y": { n: 1 }, aldric: { n: 0 } } }).figures)
      .toEqual({ claude: { n: 2, city: 3, before: true } });
  });
});

// ── EN JEU ─────────────────────────────────────────────────────────────────────
const T = 20;
const clock = () => performance.now();
// Une petite cité : une rue, des maisons au nord, un marché et un tribunal au sud.
function smallCity() {
  CM.walkRoadList = []; CM.walkRoadSet = new Set();
  for (let gx = 0; gx < 30; gx += 1) {
    CM.walkRoadList.push({ gx, gy: 10 });
    CM.walkRoadSet.add(gx * 10000 + 10);
  }
  CM.homeRoadCells = [];
  for (let gx = 0; gx < 30; gx += 3) CM.homeRoadCells.push({ gx, gy: 10, t: { type: "house", gx, gy: 9, key: `${gx},9` } });
  CM.workRoadCells = [
    { gx: 4, gy: 10, t: { type: "engine", buildingId: "markets", gx: 4, gy: 11 } },
    { gx: 20, gy: 10, t: { type: "engine", buildingId: "storytellers", gx: 20, gy: 11 } },
    { gx: 25, gy: 10, t: { type: "engine", buildingId: "scribes", gx: 25, gy: 11 } },
  ];
  CM.buildingEdgeSet = null;
}

describe("les figures, en jeu", () => {
  beforeEach(() => {
    stopTalk();
    resetSigns();
    clearCitizenFocus();
    stopListening();
    resetFigures();
    state.paroles = defaultParoles();
    state.cycles = 3;
    state.grandResetCount = 0;
    state.chronicleEntries = [];
    CM.TILE = T;
    CM.cw = 800; CM.ch = 600; CM.dpr = 1;
    CM.cam = { x: 200, y: 200, zoom: 2 };
    CM.nightF = 0; CM.rainF = 0; CM.healthF = 0.6; CM.rioters = []; CM.season = 1; CM.citT = 100;
    CM.layout = { counts: { eraBand: 2, eraIndex: 11, urbanTier: 1 }, critters: [] };
    CM.tileGrid = new Map();
    CM.describeTile = (t) => ({ title: t.buildingId || t.type });
    CM.citizens = [];
    CM.citizenTarget = 40;
    CM.talking = null;
    smallCity();
  });

  it("dès la période 3, les cinq sortent de chez eux, en tête de la foule, avec le métier de leur signature", () => {
    CM.layout.counts.eraIndex = 8;            // période 2 : pas encore
    figuresTick(1000);
    expect(CM.citizens.length).toBe(0);
    CM.layout.counts.eraIndex = 11;
    figuresTick(2000);
    expect(CM.citizens.length).toBe(5);
    const khael = figureOf("khael");
    expect(khael.identity).toMatchObject({ name: "Khael", given: "Khael", job: "judge", chronique: "khael", household: null });
    expect(khael.work.t.buildingId).toBe("markets");          // pas de tribunal : il tient audience au marché
    expect(figureOf("claude").work.t.buildingId).toBe("storytellers");
    expect(figureOf("raphael").identity.job).toBe("resident");
    expect(figureOf("raphael").work).toBe(null);
    // Chacun sa maison.
    const homes = new Set(FIGURE_KEYS.map((k) => figureOf(k).home.t.key));
    expect(homes.size).toBe(5);
    // La fiche : son prénom, sa signature ; pas de logis au nom d'une autre famille.
    focusCitizen(khael);
    const sheet = citizenSheet();
    expect(sheet.name).toBe("Khael");
    expect(sheet.job.fr).toBe("Juge autoproclamé");
    expect(sheet.home).toBe(null);
  });

  it("l'âge et la gazette changent son dessin et son métier ; un tribunal bâti, Khael y va", () => {
    figuresTick(1000);
    const edith = figureOf("edith");
    expect(edith.identity.job).toBe("accountant");
    CM.layout.counts.eraIndex = 16; CM.layout.counts.eraBand = 3;   // période 4, la Couronne
    figuresTick(1100);
    expect(edith.identity.job).toBe("steward");
    CM.layout.counts.eraIndex = 22; CM.layout.counts.eraBand = 4;   // période 5, le Marbre
    CM.workRoadCells = [...CM.workRoadCells, { gx: 12, gy: 10, t: { type: "engine", buildingId: "courthouses", gx: 12, gy: 11 } }];
    figuresTick(2200);
    expect(edith.identity.job).toBe("accountant");
    expect(figureOf("khael").identity.sprite).toBe("romanman");     // la toge
    expect(figureOf("khael").work.t.buildingId).toBe("courthouses");
  });

  it("on lui parle de ses mots à lui, et l'on peut lui reparler un moment après", () => {
    figuresTick(1000);
    const aldric = figureOf("aldric");
    aldric.fade = 1;                           // sorti de chez lui (le fondu, agents.js)
    focusCitizen(aldric);
    expect(talkOffered()).toBe(true);
    const t0 = clock();
    expect(startTalk(t0)).toBe(true);
    expect(CM.talking.id).toMatch(/^fm-aldric-/);
    expect(CM.talking.choices.map((c) => c.orientation)).toEqual(TALK_ORIENTATIONS);
    expect(talkChoose(CM.talking.choices[0].key, CM.talking.chooseAt + 1)).toBe(true);
    expect(state.paroles.figures.aldric).toMatchObject({ n: 1, before: false });
    stopTalk();
    aldric._talkAvail = null;
    expect(talkOffered()).toBe(false);
    figuresTick(5000);
    aldric._react = null;                      // son geste fini (signTick)
    figuresTick(5000 + FIGURES_LIVE.againMs + 1);
    expect(talkOffered()).toBe(true);
  });

  it("parti de la rue, il ressort de chez lui ; la gazette revenue en arrière, ils rentrent", () => {
    figuresTick(1000);
    const claude = figureOf("claude");
    CM.citizens.splice(CM.citizens.indexOf(claude), 1);
    figuresTick(1500);                         // la seconde n'est pas passée
    expect(figureOf("claude")).toBe(null);
    figuresTick(2100);
    expect(figureOf("claude")).not.toBe(null);
    expect(figureOf("claude")).not.toBe(claude);
    expect(CM.citizens.filter((p) => p.chronique === "claude").length).toBe(1);
    CM.layout.counts.eraIndex = 5;             // période 2
    figuresTick(3200);
    expect(CM.citizens.filter((p) => p.chronique).every((p) => p.leaving)).toBe(true);
  });

  it("renvoyé chez lui puis ressorti avec la pluie passée, on le reprend : jamais deux Khael", () => {
    figuresTick(1000);
    const khael = figureOf("khael");
    CM.layout.counts.eraIndex = 5;             // ils rentrent chez eux…
    figuresTick(1100);
    expect(khael.leaving).toBe(true);
    CM.layout.counts.eraIndex = 11;            // …et la rue les revoit avant qu'ils y soient
    figuresTick(2100);
    expect(CM.citizens.filter((p) => p.chronique === "khael").length).toBe(1);
    expect(figureOf("khael")).toBe(khael);
    expect(khael.leaving).toBe(false);
  });

  it("la gazette mène à eux : la signature d'un article retrouve la figure sur la carte", () => {
    expect(figureOfAuthor("Khael, juge autoproclamé")).toBe("khael");
    expect(figureOfAuthor("Raphaël, citizen")).toBe("raphael");
    expect(figureOfAuthor("Garin, forgeron")).toBe(null);
    expect(figureOfAuthor(null)).toBe(null);
    expect(findFigure("khael")).toBe(null);          // pas encore dans la rue
    expect(showFigure("khael")).toBe(false);
    expect(CM.focus).toBeFalsy();
    figuresTick(1000);
    const khael = figureOf("khael");
    expect(findFigure("khael")).toBe(khael);
    expect(showFigure("khael")).toBe(true);
    expect(CM.focus).toMatchObject({ p: khael, kind: "citizen", cam: true });
  });

  it("une foule trop maigre : ils ne sortent pas", () => {
    CM.citizenTarget = 4;
    figuresTick(1000);
    expect(CM.citizens.length).toBe(0);
  });
});
