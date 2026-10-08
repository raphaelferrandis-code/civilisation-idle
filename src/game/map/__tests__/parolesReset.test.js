import { describe, it, expect, beforeEach } from "vitest";

import { CM } from "../layout.js";
import { state } from "../../core/state.js";
import { defaultParoles, afterGrandReset } from "../../core/parolesState.js";
import { focusCitizen, clearCitizenFocus } from "../citizenFocus.js";
import { buildIdentity, householdOf } from "../citizenIdentity.js";
import { listenContext, stopListening, declicId } from "../paroles/listen.js";
import { pickParole, pickTalk, talkChoices, talkSilence, parolesEligible } from "../paroles/pick.js";
import { PAROLES } from "../../data/paroles.js";
import { PAROLES_RESET } from "../../data/parolesReset.js";
import { VEILLEE_JOB } from "../../data/parolesVeillee.js";
import { FIGURE_MOTS, FIGURES, figureJob } from "../../data/parolesFigures.js";
import { TALK_ORIENTATIONS } from "../../data/parolesMots.js";
import { SIGN_ACTS } from "../../data/parolesSignes.js";
import { chronicleArticles } from "../../data/chronicleArticles.js";
import { evaluateCondition } from "../../core/chronicleEvaluator.js";

// LE GRAND RESET DANS LA FICTION (docs/PLAN-ECOUTER-PARLER.md, lot 7, § 7.5) : quand un sceau
// est prêt, Claude te demande « Tu vas tout effacer. Même ça ? » et la cité le pressent ;
// dans la première cité du monde refait, au premier feu, « J'ai rêvé que tu avais dit non. »,
// et le camp rêve de l'ancienne ville.

const textsOf = (l) => [l.fr, l.m, l.f, l.en].filter(Boolean);
const byId = (id) => PAROLES.find((e) => e.id === id);
const adult = (o = {}) => ({ fem: false, child: false, old: false, job: null, traits: [], family: "single", kids: 0, chronique: null, ...o });
const ctxOf = (o = {}) => ({
  kind: "thought", band: 0, period: 1, night: true, precip: null, riot: false, wonder: false, prosper: false, cause: null,
  season: "summer", doing: null, declic: true, declics: 1, trust: 3, private: true, knows: false,
  resetReady: false, afterReset: false, acts: SIGN_ACTS,
  a: adult(), b: null, rel: null, kidIs: null, names: { a: "Garin" }, ...o,
});
const claudeAuFeu = (o = {}) => ctxOf({ a: adult({ job: VEILLEE_JOB, old: true, traits: ["stubborn", "grumpy"] }), names: { a: "Claude" }, ...o });
const BANDS_OF = { 3: 1, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: 9 };
const claudeDansLaRue = (period, o = {}) => ctxOf({
  kind: "talk", period, band: BANDS_OF[period], night: false,
  a: adult({ job: figureJob("claude", period).job, old: true, traits: FIGURES.claude.traits, family: null, chronique: "claude" }),
  names: { a: "Claude" }, ...o,
});

describe("le catalogue du Grand Reset", () => {
  it("chaque entrée a sa forme, ses âges (cinq au plus), et vaut d'un côté du Grand Reset", () => {
    for (const e of PAROLES_RESET) {
      expect(byId(e.id), e.id).toBe(e);
      expect(["thought", "chat"]).toContain(e.kind);
      const [lo, hi] = e.bands;
      expect(lo <= hi && hi - lo <= 4, e.id).toBe(true);
      expect(!!e.when.resetReady !== !!e.when.afterReset, `${e.id} : avant OU après`).toBe(true);
      // Le rêve de l'ancien monde se fait au camp.
      if (e.when.afterReset) expect(hi, e.id).toBeLessThanOrEqual(1);
      for (const l of e.lines) {
        expect(!!l.fr && !!l.en, e.id).toBe(true);
        for (const t of textsOf(l)) {
          expect(t).not.toMatch(/[—–!…]|\.\.\./);
          expect(t).not.toMatch(/'/);
        }
      }
    }
  });

  it("le présage ne vient que si un sceau est prêt, le rêve que dans le monde refait", () => {
    const presage = byId("r-presage-pierre"), reve = byId("r-reve-pierre");
    expect(parolesEligible(presage, ctxOf())).toBe(false);
    expect(parolesEligible(presage, ctxOf({ resetReady: true }))).toBe(true);
    expect(parolesEligible(reve, ctxOf())).toBe(false);
    expect(parolesEligible(reve, ctxOf({ afterReset: true }))).toBe(true);
  });

  it("le monde refait : la première cité après un Grand Reset, jusqu'à sa chute", () => {
    expect(afterGrandReset({ cycles: 0, grandResetCount: 1 })).toBe(true);
    expect(afterGrandReset({ cycles: 1, grandResetCount: 1 })).toBe(false);
    expect(afterGrandReset({ cycles: 0, grandResetCount: 0 })).toBe(false);
    expect(afterGrandReset(null)).toBe(false);
  });
});

describe("Claude, avant : « Tu vas tout effacer. Même ça ? »", () => {
  it("au feu du camp, il le pense avant tout le reste, la première fois", () => {
    for (const x of [0, 0.5, 0.99]) {
      expect(pickParole(claudeAuFeu({ resetReady: true }), {}, () => x).id).toBe("v-t-effacer");
    }
    expect(pickParole(claudeAuFeu({ resetReady: true }), { "v-t-effacer": 1 }, () => 0.5).id).not.toBe("v-t-effacer");
    expect(pickParole(claudeAuFeu(), {}, () => 0.5).id).not.toBe("v-t-effacer");
  });

  it("dans la rue, à chaque âge : il te le demande d'abord, avec tes quatre réponses et ton silence", () => {
    const attendu = { 3: "fm-claude-effacer", 5: "fm-claude-effacer", 6: "fm-claude-effacer-flamme", 7: "fm-claude-effacer-flamme", 8: "fm-claude-effacer-braise", 10: "fm-claude-effacer-braise" };
    for (const [period, id] of Object.entries(attendu)) {
      const ctx = claudeDansLaRue(+period, { resetReady: true });
      for (const x of [0, 0.99]) expect(pickTalk(ctx, {}, () => x).id, `période ${period}`).toBe(id);
      const e = FIGURE_MOTS.find((m) => m.id === id);
      expect(e.lines[0].fr).toBe("Tu vas tout effacer. Même ça ?");
      expect(talkChoices(e, ctx).map((c) => c.orientation)).toEqual(TALK_ORIENTATIONS);
      expect(talkSilence(e, ctx)).not.toBe(null);
    }
    // Sans sceau prêt, il ne le dit pas.
    expect(pickTalk(claudeDansLaRue(5), {}, () => 0.5).id).not.toMatch(/effacer/);
  });

  it("à la veillée, il le dit aussi à celui qui veille avec lui", () => {
    const chat = byId("v-c-effacer");
    expect(chat.lines.at(-1).fr).toBe("Je ne sais pas. Je lui ai demandé.");
    expect(parolesEligible(chat, claudeAuFeu({ kind: "chat", veillee: true, b: adult(), resetReady: true }))).toBe(true);
    expect(parolesEligible(chat, claudeAuFeu({ kind: "chat", veillee: true, b: adult() }))).toBe(false);
  });
});

describe("Claude, après : « J'ai rêvé que tu avais dit non. »", () => {
  it("le déclic du premier feu d'un monde refait", () => {
    expect(declicId({ afterReset: true, declics: 3 })).toBe("v-declic-reve");
    expect(declicId({ declics: 1 })).toBe("v-declic-encore");
    expect(declicId({ declics: 0 })).toBe("v-declic");
    const reve = byId("v-declic-reve");
    expect(reve.forced).toBe("declic");
    // Sa dernière réplique, debout, tournée vers toi (paroles/veillee.js).
    expect(reve.lines.at(-1)).toMatchObject({ who: "a", fr: "J’ai rêvé que tu avais dit non." });
  });

  it("il rêve de l'ancienne ville, d'abord ; une braise que personne n'a laissée", () => {
    expect(pickParole(claudeAuFeu({ afterReset: true }), {}, () => 0.99).id).toBe("v-t-reve-ville");
    expect(parolesEligible(byId("v-t-reve-braise"), claudeAuFeu({ afterReset: true }))).toBe(true);
    expect(parolesEligible(byId("v-t-reve-braise"), claudeAuFeu())).toBe(false);
  });
});

describe("la gazette du réveil", () => {
  it("trois articles, aux périodes 1 et 2, dans la première cité du monde refait", () => {
    const reve = chronicleArticles.filter((a) => a.conditionType === "reve");
    expect(reve.map((a) => a.period).sort()).toEqual([1, 1, 2]);
    expect(evaluateCondition("reve", { cycles: 0, grandResetCount: 2 })).toBe(true);
    expect(evaluateCondition("reve", { cycles: 3, grandResetCount: 2 })).toBe(false);
    expect(evaluateCondition("reve", { cycles: 0, grandResetCount: 0 })).toBe(false);
  });
});

// ── EN JEU ─────────────────────────────────────────────────────────────────────
function villager() {
  let hh = null;
  for (let s = 1; s < 5000 && !hh; s += 1) { const h = householdOf(s * 7919, 2); if (h.couple) hh = h; }
  const identity = buildIdentity({ seed: 11, band: 2, fem: false, sprite: "villager", household: hh, slot: "m" });
  return {
    name: identity.name, seed: identity.seed, fem: false, charType: 0, skinVariant: 0, phase: 0.3,
    gx: 4, gy: 4, x: 90, y: 90, lox: 0, loy: 0, pauseT: 0, dir: 0, home: null, work: null,
    goalKind: "wander", role: "porte un panier", identity,
  };
}

describe("la situation, lue dans la partie", () => {
  beforeEach(() => {
    clearCitizenFocus();
    stopListening();
    state.paroles = defaultParoles();
    state.cycles = 2; state.grandResetCount = 1;
    state.grRevealed = {}; state.grClaimed = {};
    CM.TILE = 20;
    CM.cam = { x: 0, y: 0, zoom: 2 };
    CM.nightF = 0; CM.rainF = 0; CM.healthF = 0.6; CM.rioters = []; CM.season = 1;
    CM.layout = { counts: { eraBand: 2 } };
    CM.tileGrid = new Map();
    CM.describeTile = (t) => ({ title: t.title });
    CM.citizens = [];
  });

  it("un sceau découvert et pas encore réclamé : la cité le pressent ; la première cité du monde refait : on en rêve", () => {
    const a = villager();
    CM.citizens = [a];
    focusCitizen(a);
    expect(listenContext("thought", a, "citizen")).toMatchObject({ resetReady: false, afterReset: false });
    state.grRevealed = { 3: true };
    expect(listenContext("thought", a, "citizen").resetReady).toBe(true);
    state.grClaimed = { 3: true };
    expect(listenContext("thought", a, "citizen").resetReady).toBe(false);
    state.cycles = 0;
    expect(listenContext("thought", a, "citizen").afterReset).toBe(true);
  });
});
