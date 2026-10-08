import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { CM } from "../layout.js";
import { state } from "../../core/state.js";
import { defaultParoles, normalizeParoles } from "../../core/parolesState.js";
import { parolesNoteDeclic, parolesDeclicHere, parolesDeclics } from "../../core/paroles.js";
import { focusCitizen, clearCitizenFocus } from "../citizenFocus.js";
import { buildIdentity, householdOf, JOBS } from "../citizenIdentity.js";
import { setDayNightMode } from "../dayNightMode.js";
import { listenContext, listenOptions, listenView, startListening, stopListening, LISTEN } from "../paroles/listen.js";
import { giveSign, signTick, resetSigns, reactionLabel, REACT } from "../paroles/signs.js";
import { veilleeTick, veilleeSite, veilleeNow, resetVeillee, VEILLEE } from "../paroles/veillee.js";
import { pickParole, pickSign, parolesEligible, resolveLines } from "../paroles/pick.js";
import { PAROLES, JOB_GROUP } from "../../data/paroles.js";
import { PAROLES_SIGNES, PAROLES_REPONSES, SIGN_ACTS } from "../../data/parolesSignes.js";
import { PAROLES_VEILLEE } from "../../data/parolesVeillee.js";
import { queueFlameGlow, paintFlameGlows } from "../flameGlow.js";
import { worldToScreen } from "../iso/projection.js";

// LE DÉCLIC ET LE DIALOGUE PAR SIGNES (docs/PLAN-ECOUTER-PARLER.md, lot 5) : la veillée de
// Claude au foyer du camp, « Mais quelqu'un écoute. », puis les passants qui demandent un
// signe, et ce qu'ils pensent de la réponse.

const textsOf = (l) => [l.fr, l.m, l.f, l.en].filter(Boolean);
const byId = (id) => PAROLES.find((e) => e.id === id);
const adult = (o = {}) => ({ fem: false, child: false, old: false, job: null, traits: [], family: "single", kids: 0, ...o });
const ctxOf = (o = {}) => ({
  kind: "thought", band: 0, night: false, precip: null, riot: false, wonder: false, prosper: false, cause: null,
  season: "summer", doing: null, period: 1, declic: true, declics: 1, fire: true,
  a: adult(), b: null, rel: null, kidIs: null, names: { a: "Garin" }, ...o,
});

describe("le catalogue de la veillée", () => {
  it("le déclic : l'autre demande si le feu les entend, Claude répond « Le feu, non. » puis « Mais quelqu'un écoute. »", () => {
    for (const id of ["v-declic", "v-declic-encore"]) {
      const e = byId(id);
      expect(e.forced, id).toBe("declic");
      expect(e.layer).toBe(3);
      expect(e.lines[0]).toMatchObject({ who: "b", fr: "Tu crois que le feu nous entend ?" });
      expect(e.lines[1]).toMatchObject({ who: "a", fr: "Le feu, non." });
      expect(e.lines[2].who).toBe("a");
      expect(e.lines[2].fr).toMatch(/^Mais quelqu’un écoute\./);
      // Il ne se tire jamais : il vient.
      expect(parolesEligible(e, ctxOf({ kind: "chat", veillee: true, declic: false, b: adult(), names: { a: "Claude", b: "Garin" } }))).toBe(false);
    }
  });

  it("le gardien du feu est un métier, avec sa famille et ses mots", () => {
    expect(JOBS.firekeeper).toMatchObject({ m: "Gardien du feu", f: "Gardienne du feu", en: "Fire keeper" });
    expect(JOB_GROUP.firekeeper).toBe("faith");
    expect(PAROLES.filter((e) => e.when && e.when.job && e.when.job.includes("firekeeper")).length).toBeGreaterThanOrEqual(6);
  });

  it("une demande est la pensée d'un passant, après le déclic, aux deux premières périodes, d'un signe qu'il peut recevoir", () => {
    const reqs = PAROLES.filter((e) => e.request);
    expect(reqs.length).toBeGreaterThanOrEqual(8);
    for (const e of reqs) {
      expect(e.kind, e.id).toBe("thought");
      expect(e.layer, e.id).toBe(2);
      expect(["wind", "light", "fire"], e.id).toContain(e.request);
      expect(e.when.declic, e.id).toBe(true);
      expect(e.when.period, e.id).toEqual([1, 2]);
      if (e.request === "fire") expect(e.when.fire, e.id).toBe(true);
    }
    // La plus simple, mot pour mot celle du plan (§ 7.1).
    expect(byId("v-d-feu").lines[0].fr).toBe("Si tu m’entends, fais monter le feu.");
  });

  it("les réponses : celle qu'il voulait, une autre, ou rien ; la pensée dit son geste ; « Comme d'habitude. »", () => {
    const SAYS = {
      flee: /cour|vite|file|rentre|ne reste pas|quitte/i, home: /rentre|chez moi/i, kneel: /genou/i,
      wave: /signe|main|salue/i, parent: /maman|papa/i, back: /recul|arrière|écart/i,
    };
    const ids = new Set([...PAROLES, ...PAROLES_SIGNES].map((e) => e.id));
    for (const e of PAROLES_REPONSES) {
      expect(ids.has(e.id), e.id).toBe(false);
      ids.add(e.id);
      expect(e.kind).toBe("sign");
      expect(["yes", "other", "none"], e.id).toContain(e.answer);
      expect(e.stage, e.id).toBeUndefined();
      expect(SIGN_ACTS, e.id).toContain(e.act);
      const t = e.lines.map((l) => l.fr).join(" ");
      if (SAYS[e.act]) expect(t, `${e.id} (${e.act})`).toMatch(SAYS[e.act]);
      if (e.answer === "none") {
        expect(t, e.id).toMatch(/^Comme d’habitude\./);
        expect(e.act, e.id).toBe("go");
      }
    }
    for (const kind of ["yes", "other", "none"]) expect(PAROLES_REPONSES.some((e) => e.answer === kind && !e.when.trait && !e.when.child && !e.when.asked)).toBe(true);
  });

  it("les règles d'écriture : ni tiret, ni « ! », ni points de suspension, l'apostrophe typographique", () => {
    for (const e of [...PAROLES_VEILLEE, ...PAROLES_REPONSES, ...PAROLES_SIGNES.filter((x) => x.id.startsWith("v-"))]) {
      for (const l of e.lines) {
        for (const t of textsOf(l)) {
          expect(t, e.id).not.toMatch(/[—–!…]|\.\.\./);
          expect(t, e.id).not.toMatch(/'/);
        }
      }
      expect(e.bands, e.id).toEqual([0, 1]);
    }
  });
});

describe("ce qu'on entend", () => {
  it("Claude ne pense que ses pensées de gardien du feu", () => {
    const claude = ctxOf({ a: adult({ job: "firekeeper", old: true, traits: ["stubborn", "grumpy"] }), declic: false, declics: 0, names: { a: "Claude" } });
    for (let i = 0; i < 40; i += 1) {
      const r = pickParole(claude, {}, () => i / 40);
      expect(byId(r.id).when.job, r.id).toContain("firekeeper");
    }
    // Un signe à Claude : il sait qui c'est.
    const s = pickSign({ ...claude, kind: "sign", sign: "fire", stage: 1, acts: ["look"] }, {}, () => 0.5);
    expect(s.id).toBe("v-s-feu");
    expect(s.lines[0].fr).toBe("Le feu monte. Je sais que c’est toi.");
  });

  it("la veillée a ses causettes, qui ne se disent qu'au feu", () => {
    const veillee = ctxOf({ kind: "chat", veillee: true, night: true, private: true, trust: 0, declic: false, b: adult(), names: { a: "Claude", b: "Garin" } });
    const ok = PAROLES.filter((e) => parolesEligible(e, veillee));
    expect(ok.length).toBeGreaterThanOrEqual(5);
    for (const e of ok) expect(e.when.veillee, e.id).toBe(true);
    const rue = { ...veillee, veillee: false };
    expect(PAROLES.filter((e) => parolesEligible(e, rue) && e.when && e.when.veillee)).toEqual([]);
    // « Tu crois qu'il va pleuvoir ? » ne se dit pas sous la pluie.
    expect(parolesEligible(byId("v-c-pluie"), { ...veillee, precip: "rain" })).toBe(false);
  });

  it("on ne demande un signe qu'après le déclic, aux deux premières périodes, et le feu seulement s'il y en a un", () => {
    const e = byId("v-d-feu");
    expect(parolesEligible(e, ctxOf())).toBe(true);
    expect(parolesEligible(e, ctxOf({ declic: false }))).toBe(false);
    expect(parolesEligible(e, ctxOf({ period: 3 }))).toBe(false);
    expect(parolesEligible(e, ctxOf({ fire: false }))).toBe(false);
    // Un personnage de scène ne s'arrête pas pour attendre.
    expect(parolesEligible(e, ctxOf({ figure: true }))).toBe(false);
    expect(parolesEligible(byId("v-d-vent"), ctxOf({ fire: false }))).toBe(true);
  });

  it("la réponse : le signe qu'il voulait, un autre (qu'il interprète), ou rien", () => {
    const sign = (o) => pickSign(ctxOf({ kind: "sign", sign: "fire", stage: 1, ...o }), {}, () => 0.5, PAROLES_REPONSES);
    expect(sign({ answer: "yes", asked: "fire" }).id).toBe("v-r-oui-feu");
    expect(sign({ answer: "other", asked: "fire", sign: "wind" }).id).toBe("v-r-feu-vent");
    expect(sign({ answer: "none", asked: "fire" }).lines[0].fr).toBe("Comme d’habitude.");
    // Le caractère fait la lecture : le pieux exaucé s'agenouille.
    const pieux = sign({ answer: "yes", asked: "fire", a: adult({ traits: ["pious", "early"] }) });
    expect(pieux.act).toBe("kneel");
    // Hors réponse, jamais une pensée de réponse ; en réponse, jamais une pensée de la fois.
    expect(PAROLES_REPONSES.some((e) => parolesEligible(e, ctxOf({ kind: "sign", sign: "fire", stage: 1 })))).toBe(false);
    expect(PAROLES_SIGNES.some((e) => parolesEligible(e, ctxOf({ kind: "sign", sign: "fire", stage: 1, answer: "yes" })))).toBe(false);
  });
});

describe("le registre", () => {
  beforeEach(() => {
    state.paroles = defaultParoles();
    state.cycles = 3;
    state.grandResetCount = 0;
  });

  it("le déclic, une fois par cité ; Claude, lui, compte les cités", () => {
    expect(parolesDeclicHere()).toBe(false);
    expect(parolesNoteDeclic()).toBe(true);
    expect(parolesNoteDeclic()).toBe(false);
    expect(parolesDeclicHere()).toBe(true);
    expect(parolesDeclics()).toBe(1);
    state.cycles = 4;
    expect(parolesDeclicHere()).toBe(false);
    parolesNoteDeclic();
    expect(parolesDeclics()).toBe(2);
    // Après un Grand Reset, `cycles` repart à 0 : c'est une autre cité.
    state.cycles = 4; state.grandResetCount = 1;
    expect(parolesDeclicHere()).toBe(false);
  });

  it("la sauvegarde garde le déclic et ceux qui ont été exaucés", () => {
    const raw = { declic: { n: 3, city: 7 }, signs: { cycle: 7, seen: [{ sign: "fire", act: "look", who: "Garin", ans: true }, { sign: "wind", act: "go", who: "Oda" }] } };
    const out = normalizeParoles(raw);
    expect(out.declic).toEqual({ n: 3, city: 7 });
    expect(out.signs.seen[0].ans).toBe(true);
    expect(out.signs.seen[1].ans).toBeUndefined();
    expect(normalizeParoles({}).declic).toEqual({ n: 0, city: -1 });
    expect(normalizeParoles({ declic: { n: -2, city: "x" } }).declic).toEqual({ n: 0, city: -1 });
  });
});

// ── EN JEU ─────────────────────────────────────────────────────────────────────
// Un camp : le foyer en (10, 10) et son anneau de terre battue, une rue au sud (y = 12),
// deux tentes au bord de la rue.
const T = 20;
const KEY = (gx, gy) => gx * 10000 + gy;
function camp({ hearth = true } = {}) {
  const cells = [];
  if (hearth) for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) if (dx || dy) cells.push({ gx: 10 + dx, gy: 10 + dy });
  for (let gx = 0; gx <= 30; gx += 1) cells.push({ gx, gy: 12 });
  CM.walkRoadList = cells;
  CM.walkRoadSet = new Set(cells.map((c) => KEY(c.gx, c.gy)));
  CM.hearthWalkSet = new Set(cells.filter((c) => c.gy !== 12).map((c) => KEY(c.gx, c.gy)));
  CM.homeRoadCells = [{ gx: 6, gy: 12, t: { gx: 6, gy: 13, type: "house", title: "Tente d’Oda" } }, { gx: 16, gy: 12, t: { gx: 16, gy: 13, type: "house" } }];
  CM.buildingEdgeSet = new Set([KEY(6, 12), KEY(16, 12)]);
  CM.workRoadCells = [];
  CM.layout = { counts: { eraBand: 0, eraIndex: 1 }, campHearth: hearth ? { gx: 10, gy: 10 } : null, critters: [] };
  CM.layoutRecomputeAt = (CM.layoutRecomputeAt || 0) + 1;
}
let hhCache = null;
function couple() {
  if (hhCache) return hhCache;
  for (let s = 1; s < 5000; s += 1) { const h = householdOf(s * 7919, 0); if (h.couple && h.kids.length) { hhCache = h; return h; } }
  throw new Error("pas de foyer");
}
function someone(extra = {}, slot = "m") {
  const hh = couple();
  const fem = slot === "f";
  const identity = buildIdentity({ seed: slot === "m" ? 11 : 22, band: 0, fem, sprite: fem ? "cavewoman" : "caveman", household: hh, slot });
  return {
    name: identity.name, seed: identity.seed, fem, charType: fem ? 1 : 0, skinVariant: 0, phase: 0.3, fade: 1,
    gx: 14, gy: 12, x: 14.5 * T, y: 12.5 * T, lox: 0, loy: 0, tx: 14.5 * T, ty: 12.5 * T, pauseT: 0, dir: 2,
    home: null, work: null, goalKind: "wander", role: "porte un panier", identity, speed: 24, ...extra,
  };
}
// Ce que fait agents.js quand il arrive à sa place (le but 'veille').
function arrive(p) {
  p.gx = p.goal.gx; p.gy = p.goal.gy; p.x = (p.gx + 0.5) * T; p.y = (p.gy + 0.5) * T; p.tx = p.x; p.ty = p.y;
  p.goal = null; p._path = null; p.pauseT = 1; p.fade = 1;
}
function fireAt(wx, wy) {
  const s = worldToScreen(wx, wy);
  queueFlameGlow(s.x, s.y, 10, null, 0, 0, 1);
  paintFlameGlows(null);
}
// La veillée en place : Claude assis, Garin à côté de lui. Rend { claude, garin, t }.
function seated() {
  const garin = someone();
  CM.citizens = [garin];
  let t = 1000;
  veilleeTick(t);
  const claude = veilleeNow().claude;
  arrive(claude);
  veilleeTick(t += 16);
  veilleeTick(t += VEILLEE.sitMs + 50);
  veilleeTick(t += 2600);                 // il va chercher quelqu'un
  arrive(garin);
  veilleeTick(t += 16);
  veilleeTick(t += VEILLEE.sitMs + 50);
  return { claude, garin, t };
}

beforeEach(() => {
  resetVeillee();
  resetSigns();
  clearCitizenFocus();
  stopListening();
  paintFlameGlows(null);
  paintFlameGlows(null);
  state.paroles = defaultParoles();
  state.cycles = 3;
  state.grandResetCount = 0;
  CM.TILE = T;
  CM.cw = 800; CM.ch = 600; CM.dpr = 1;
  CM.cam = { x: 200, y: 200, zoom: 2 };
  CM.zoomGoal = 2;
  CM.nightF = 1; CM.rainF = 0; CM.healthF = 0.6; CM.rioters = []; CM.season = 1; CM.windX = 0; CM.citT = 100;
  CM.tileGrid = new Map();
  CM.describeTile = (t) => ({ title: t.title });
  CM.citizens = [];
  camp();
});
afterEach(() => {
  setDayNightMode("auto");
  vi.restoreAllMocks();
});

describe("la veillée", () => {
  it("la nuit, au Feu, Claude sort de sa tente et va s'asseoir au foyer, tourné vers le feu et vers toi", () => {
    CM.citizens = [];
    veilleeTick(1000);
    const V = veilleeNow();
    const claude = V.claude;
    expect(CM.citizens[0]).toBe(claude);
    expect(claude.identity).toMatchObject({ name: "Claude", given: "Claude", job: "firekeeper", traits: ["stubborn", "grumpy"], sprite: "caveman4", household: null });
    expect(claude.workLabel).toEqual({ fr: "Le feu du camp", en: "The camp fire" });
    // Il part de la tente la plus proche du feu, vers sa place, au nord-ouest du feu.
    expect([claude.gx, claude.gy]).toEqual([6, 12]);
    expect(claude.goal).toEqual({ gx: 9, gy: 10 });
    expect(claude.goalKind).toBe("veille");
    expect(reactionLabel(claude).fr).toBe("Va garder le feu");
    arrive(claude);
    veilleeTick(1016);
    veilleeTick(1016 + VEILLEE.sitMs + 20);
    expect(claude._react.pose).toEqual({ kind: "sit", u: 1 });
    expect(claude.dir).toBe(0);
    expect(claude.pauseT).toBeGreaterThan(0);
    // Un peu plus près du feu que le centre de sa case.
    expect(claude.lox).toBeGreaterThan(0.1 * T);
    expect(reactionLabel(claude).fr).toBe("Veille le feu");
  });

  it("un habitant le rejoint, et ils causent", () => {
    const { claude, garin } = seated();
    expect(garin._veille.role).toBe("other");
    expect(garin.dir).toBe(2);
    expect(garin._react.pose).toEqual({ kind: "sit", u: 1 });
    expect(claude._chatWith).toBe(garin);
    expect(garin._chatWith).toBe(claude);
    expect(reactionLabel(garin).fr).toBe("Veille avec Claude");
    focusCitizen(garin);
    expect(listenOptions()).toEqual({ chat: true, thought: true });
  });

  it("pas un deuxième vieux à barbe blanche au coin du feu, s'il y a le choix : on doit reconnaître Claude", () => {
    const chaman = someone({ skinVariant: 3, gx: 11, x: 11.5 * T });   // le dessin de Claude, plus près
    const garin = someone({ gx: 16, x: 16.5 * T });
    CM.citizens = [chaman, garin];
    veilleeTick(1000);
    arrive(veilleeNow().claude);
    veilleeTick(1016);
    veilleeTick(4016);
    expect(veilleeNow().other).toBe(garin);
    expect(chaman._veille).toBeUndefined();
  });

  it("personne dehors : il va chercher quelqu'un chez lui, qui ressort par sa porte", () => {
    const garin = someone({ _enter: { dawn: true }, _vanish: 0, gx: 16, x: 16.5 * T });
    CM.citizens = [garin];
    veilleeTick(1000);
    arrive(veilleeNow().claude);
    veilleeTick(1016);
    veilleeTick(4016);
    expect(garin._enter).toBe(null);
    expect(garin.goal).toEqual({ gx: 10, gy: 9 });
    expect(garin.goalKind).toBe("veille");
  });

  it("la première causette qu'on écoute est le déclic ; à « Mais quelqu'un écoute. », Claude se lève, puis se rassoit", () => {
    const { claude, garin } = seated();
    focusCitizen(garin);
    expect(startListening("chat")).toBe(true);
    expect(CM.listening.id).toBe("v-declic");
    // On écoute Garin : ses répliques d'abord, à son nom ; Claude répond.
    const L0 = CM.listening;
    const view = listenView(L0.t0 + 3 * LISTEN.lineMs);
    expect(view.lines.map((l) => [l.name, l.fr])).toEqual([
      [garin.identity.given, "Tu crois que le feu nous entend ?"],
      ["Claude", "Le feu, non."],
      ["Claude", "Mais quelqu’un écoute."],
    ]);
    expect(parolesDeclicHere()).toBe(true);
    expect(state.paroles.toi.at(-1)).toMatchObject({ id: "v-declic", a: "Claude", b: garin.identity.given });
    // Il se lève à sa dernière réplique, tourné vers toi.
    const last = L0.t0 + 2 * LISTEN.lineMs;
    veilleeTick(last);
    veilleeTick(last + VEILLEE.sitMs + 20);
    expect(claude._react.pose).toBe(null);
    expect([0, 2]).toContain(claude.dir);
    veilleeTick(last + VEILLEE.standMs + 10);
    veilleeTick(last + VEILLEE.standMs + VEILLEE.sitMs + 30);
    expect(claude._react.pose).toEqual({ kind: "sit", u: 1 });
    // Ensuite, leurs causettes de veillée ; plus le déclic.
    expect(startListening("chat")).toBe(true);
    expect(CM.listening.id).not.toMatch(/^v-declic/);
    expect(byId(CM.listening.id).when.veillee).toBe(true);
  });

  it("dans la cité suivante, le déclic revient, et Claude se souvient de l'autre feu", () => {
    parolesNoteDeclic();
    state.cycles = 4;
    const { claude } = seated();
    focusCitizen(claude);
    startListening("chat");
    expect(CM.listening.id).toBe("v-declic-encore");
    expect(CM.listening.lines[2].fr).toMatch(/l’autre feu/);
    expect(parolesDeclics()).toBe(2);
  });

  it("à l'aube, ils se lèvent ; l'autre reprend sa journée, Claude rentre dormir", () => {
    const { claude, garin, t } = seated();
    CM.nightF = 0;
    veilleeTick(t + 16);
    expect(veilleeNow().phase).toBe("rise");
    veilleeTick(t + 16 + VEILLEE.sitMs + 20);
    expect(veilleeNow().phase).toBe("end");
    expect(garin._veille).toBe(null);
    expect(garin._react).toBe(null);
    expect(garin._chatWith).toBe(null);
    expect(claude.leaving).toBe(true);
    expect(reactionLabel(claude).fr).toBe("Rentre dormir");
    // Il a passé une porte : plus de veillée avant la nuit suivante.
    CM.citizens = CM.citizens.filter((p) => p !== claude);
    veilleeTick(t + 3000);
    expect(veilleeNow()).toBe(null);
  });

  it("après la période 2, il ne sort plus ; ni de jour", () => {
    CM.layout.counts.eraIndex = 9;
    veilleeTick(1000);
    expect(veilleeNow()).toBe(null);
    CM.layout.counts.eraIndex = 3;
    CM.nightF = 0.2;
    veilleeTick(2000);
    expect(veilleeNow()).toBe(null);
  });

  it("en plein jour choisi dans les Options, il veille quand même, à l'heure de la nuit", () => {
    setDayNightMode("day");
    CM.nightF = 0;
    vi.spyOn(Date, "now").mockReturnValue(VEILLEE.cycleMs * 1000.3);
    veilleeTick(1000);
    expect(veilleeNow()).toBe(null);
    Date.now.mockReturnValue(VEILLEE.cycleMs * 1000.7);
    veilleeTick(70000);
    expect(veilleeNow().claude).toBeTruthy();
  });

  it("sans foyer, il veille devant le culte des ancêtres", () => {
    camp({ hearth: false });
    CM.workRoadCells = [{ gx: 12, gy: 12, t: { gx: 12, gy: 13, spanX: 1, spanY: 1, buildingId: "ancestral_cult" } }];
    const site = veilleeSite();
    expect(site.kind).toBe("cult");
    expect(site.seats[0]).toMatchObject({ gx: 12, gy: 12, dir: 2, sit: true });
    veilleeTick(1000);
    expect(veilleeNow().claude.goal).toEqual({ gx: 12, gy: 12 });
    expect(veilleeNow().claude.workLabel.fr).toBe("Le feu du culte");
  });

  it("un signe à Claude : il se lève, regarde, dit qu'il sait, et se rassoit", () => {
    const { claude, t } = seated();
    fireAt(10.5 * T, 10.5 * T);
    focusCitizen(claude);
    const t0 = t + 100;
    expect(giveSign("fire", t0)).toBe(true);
    expect(CM.listening.id).toBe("v-s-feu");
    // Il se lève d'abord, tourné vers toi, puis se tourne vers le feu.
    signTick(t0 + REACT.notice + REACT.rise / 2);
    veilleeTick(t0 + REACT.notice + REACT.rise / 2);
    expect(claude._react.act).toBe("look");
    expect(claude._react.pose.u).toBeCloseTo(0.5, 1);
    expect(claude.dir).toBe(0);
    signTick(t0 + REACT.notice + REACT.rise + 50);
    expect(claude._react.pose).toBe(null);
    signTick(t0 + REACT.look + 10);
    veilleeTick(t0 + REACT.look + 20);
    veilleeTick(t0 + REACT.look + VEILLEE.sitMs + 40);
    expect(claude._react.act).toBe("veille");
    expect(claude._react.pose).toEqual({ kind: "sit", u: 1 });
  });
});

describe("le dialogue par signes", () => {
  // Un passant de la rue, près du feu, après le déclic : on lui fait penser une demande.
  function asking() {
    parolesNoteDeclic();
    const p = someone({ gx: 12, x: 12.5 * T });
    CM.citizens = [p];
    fireAt(10.5 * T, 10.5 * T);
    focusCitizen(p);
    // Tout le reste est déjà entendu : il reste ses demandes.
    const ctx = listenContext("thought", p, "citizen");
    for (const e of PAROLES) if (parolesEligible(e, ctx) && !e.request) state.paroles.heard[e.id] = 1;
    expect(startListening("thought")).toBe(true);
    return p;
  }

  it("après le déclic, un passant demande un signe ; il s'arrête et l'attend", () => {
    const p = asking();
    const Q = CM.signRequest;
    expect(Q.p).toBe(p);
    expect(byId(CM.listening.id).request).toBe(Q.sign);
    // Ce qu'on lui demande va au panneau « Ce qu'on dit de toi ».
    expect(state.paroles.toi.at(-1).id).toBe(CM.listening.id);
    signTick(Q.t0 + 400);
    expect(reactionLabel(p, Q.t0 + 400).fr).toBe("Attend un signe");
    expect(p.pauseT).toBeGreaterThan(5);
  });

  it("il a eu le signe qu'il demandait : il l'a entendu, et la rue parle de celui qui a été exaucé", () => {
    const p = asking();
    const Q = CM.signRequest;
    signTick(Q.t0 + 400);
    expect(giveSign(Q.sign, Q.t0 + 3000)).toBe(true);
    const e = PAROLES_REPONSES.find((x) => x.id === CM.listening.id);
    expect(e.answer).toBe("yes");
    const who = p.identity.given;
    expect(state.paroles.signs.seen.at(-1)).toMatchObject({ who, ans: true });
    // Un autre en parle, en le nommant.
    const other = someone({ seed: 77, gx: 20, x: 20.5 * T }, "f");
    const ctx = listenContext("thought", other, "citizen");
    expect(ctx.seenBy.answered.who).toBe(who);
    const rumeur = byId("v-e-mon-tour");
    expect(parolesEligible(rumeur, ctx)).toBe(true);
    expect(resolveLines(rumeur, ctx)[0].fr).toBe(`Si ${who} a eu son signe, je peux bien demander le mien.`);
  });

  it("un autre signe que celui qu'il demandait : il l'interprète", () => {
    const p = asking();
    const Q = CM.signRequest;
    const other = Q.sign === "wind" ? "light" : "wind";
    giveSign(other, Q.t0 + 3000);
    expect(PAROLES_REPONSES.find((x) => x.id === CM.listening.id).answer).toBe("other");
    expect(state.paroles.signs.seen.at(-1).ans).toBeUndefined();
    expect(p._signN).toBe(1);
  });

  it("rien ne vient : « Comme d'habitude. », et il repart ; personne ne le regardait : rien", () => {
    const p = asking();
    const Q = CM.signRequest;
    signTick(Q.t0 + 400);
    signTick(Q.until + 10);
    expect(CM.listening.lines[0].fr).toMatch(/^Comme d’habitude\./);
    expect(reactionLabel(p, Q.until + 20).fr).toBe("Repart");
    // Une autre fois, on ne le regardait plus.
    resetSigns();
    stopListening();
    const p2 = asking();
    const Q2 = CM.signRequest;
    clearCitizenFocus();
    signTick(Q2.t0 + 400);
    signTick(Q2.until + 10);
    expect(CM.listening).toBe(null);
    expect(p2._signN | 0).toBe(0);
  });
});
