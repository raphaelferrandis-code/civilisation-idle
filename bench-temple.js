"use strict";
/* ============================================================================
 * bench-temple.js - Banc d'equilibrage des JEUX DE LA MAISON DES PLAISIRS.
 *
 * Lot 1 des gains « vrai casino » (2026-10-04, docs/PLAN-GAINS-CASINO.md) : les
 * COTES sont fixes pour toujours, la MISE est libre, plus AUCUN jeu ne rend plus
 * de 100 % (la bascule de juillet est supprimee). Ce banc verifie, sur le VRAI
 * code (moteurs et constantes de balance.js) :
 *   A1  chaque jeu, chaque option : RTP < 1 (plus de configuration « imprimante ») ;
 *   A2  les cibles : osselets 97 % par rite, Icare 97 %, tickets 75 %, 21 parfait
 *       ~99 %, machine ~92 % ;
 *   A3  les rites des osselets forment une echelle de risque (chance qui baisse,
 *       paiements qui montent, ecart-type qui monte) ;
 *   A4  le vingt-et-un MESURE (paquet unique, croupier S17, une refente, double
 *       apres refente) : BLACKJACK_RTP_REF majore le meilleur jeu, AUTO colle au
 *       chemin de l'auto ;
 *   A5  la cagnotte : rtp_total = rtp + recycle x (1 - rtp) < 1 pour tout jeu
 *       (recycle nu ET noye) — l'invariant par algebre de juillet tient toujours ;
 *   A6  Monte-Carlo sur les moteurs (osselets, Icare, 21 auto) : le RTP empirique
 *       tombe dans l'intervalle attendu ;
 *   A7  les recettes, les limites et la Benediction par ere (table).
 *
 * Sortie : temple-faveur-impact.md (+ resume console).
 * Usage  : node bench-temple.js
 * ========================================================================== */
import fs from "fs";

// --- Stubs DOM (avant imports jeu) -----------------------------------------
global.window = { addEventListener() {}, removeEventListener() {} };
global.localStorage = { getItem() { return null; }, setItem() {} };
Object.defineProperty(global, "navigator", { value: { clipboard: { writeText() {} } }, writable: true, configurable: true });
const stubEl = () => ({ className: "", dataset: {}, innerHTML: "", textContent: "", disabled: false, value: "", checked: false, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, addEventListener() {}, setAttribute() {}, showModal() {}, remove() {}, click() {}, appendChild() {}, querySelector() { return stubEl(); }, querySelectorAll() { return []; } });
global.document = { addEventListener() {}, documentElement: { style: { setProperty() {} } }, body: { appendChild() {} }, querySelector() { return stubEl(); }, querySelectorAll() { return []; }, createElement() { return stubEl(); }, getElementById() { return stubEl(); } };
global.Audio = class { constructor() { this.volume = 1; } addEventListener() {} play() { return Promise.resolve(); } pause() {} };
global.render = () => {}; global.save = () => {};

// --- Imports jeu ------------------------------------------------------------
const { state, defaultState, setState } = await import("./src/game/core/state.js");
await import("./src/game/core/actions.js"); // ordre d'evaluation du jeu reel
const { auguryPaytable, auguryTierOdds, castAugury, AUGURY_RITES } = await import("./src/game/core/actions/augures.js");
const { icarusEffectiveEdge, resolveIcarusHeadless } = await import("./src/game/core/actions/icarus.js");
const { scratchRtpRef, scratchOdds } = await import("./src/game/core/actions/scratch.js");
const { handValue, isBlackjack, blackjackResult, resolveBlackjackHeadless, BLACKJACK_SUITS } = await import("./src/game/core/actions/blackjack.js");
const { slotsOdds } = await import("./src/game/core/actions/slots.js");
const { potRecycle } = await import("./src/game/core/actions/templePot.js");
const { recettesPerHour, tableLimits, blessingCost, potCap } = await import("./src/game/core/actions/maisonTable.js");
const { eras } = await import("./src/game/data/world.js");
const bal = await import("./src/game/core/balance.js");
const {
  AUGURY_RTP, ICARUS_RTP, BLACKJACK_MULT, BLACKJACK_DEALER_STAND,
  BLACKJACK_RTP_REF, BLACKJACK_RTP_AUTO, TEMPLE_POT_RECYCLE_CAP
} = bal;

const NOW = 1_000_000_000_000;
Date.now = () => NOW;
setState(defaultState());

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pct = (x, d = 2) => `${(x * 100).toFixed(d)} %`;
const checks = [];
function check(id, ok, detail) {
  checks.push({ id, ok: Boolean(ok), detail });
}

/* ============================================================================
 * A1-A3 : les osselets, rite par rite (analytique exacte)
 * ========================================================================== */
const riteRows = [];
for (const rite of Object.values(AUGURY_RITES)) {
  const pay = auguryPaytable("prayForRain", rite.id);
  const o = pay.odds;
  const ev = pay.rtp - pay.flightShare;
  const ex2 = o.venus * pay.mult.venus ** 2 + o.triple * pay.mult.triple ** 2 + o.pair * pay.mult.pair ** 2;
  riteRows.push({ id: rite.id, p: rite.p, mult: pay.mult, rtp: pay.rtp, sd: Math.sqrt(ex2 - ev * ev) });
}
check("A2 osselets : chaque rite rend 97 %", riteRows.every((r) => Math.abs(r.rtp - AUGURY_RTP) < 1e-9),
  riteRows.map((r) => `${r.id} ${pct(r.rtp, 3)}`).join(", "));
const ladderOk = riteRows.every((r, i) => i === 0 || (
  r.p < riteRows[i - 1].p
  && r.mult.venus > riteRows[i - 1].mult.venus
  && r.mult.pair > riteRows[i - 1].mult.pair
  && r.sd > riteRows[i - 1].sd));
check("A3 osselets : echelle de risque (chance baisse, paiements et ecart-type montent)", ladderOk,
  riteRows.map((r) => `${r.id} ${pct(r.p, 1)} paire x${r.mult.pair.toFixed(2)} Venus x${r.mult.venus.toFixed(2)} sigma ${r.sd.toFixed(2)}`).join(" ; "));

/* ============================================================================
 * A4 : le vingt-et-un, mesure (copie fidele des regles du moteur)
 * ========================================================================== */
const BJ_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
function bjDeck(rng) {
  const d = [];
  for (const suit of BLACKJACK_SUITS) for (const rank of BJ_RANKS) d.push({ rank, suit });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
function isSoft(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    if (c.rank === "A") { aces++; total += 11; }
    else if (["10", "J", "Q", "K"].includes(c.rank)) total += 10;
    else total += Number(c.rank);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return aces > 0;
}
const upValue = (c) => (c.rank === "A" ? 11 : ["10", "J", "Q", "K"].includes(c.rank) ? 10 : Number(c.rank));
function basicHits(p, up) {
  const v = handValue(p), u = upValue(up);
  if (isSoft(p)) { if (v >= 19) return false; if (v === 18) return u >= 9; return true; }
  if (v >= 17) return false; if (v >= 13) return u >= 7; if (v === 12) return u < 4 || u > 6; return true;
}
function basicDoubles(p, up) {
  if (p.length !== 2) return false;
  const v = handValue(p), u = upValue(up);
  if (isSoft(p)) {
    if (v >= 13 && v <= 14) return u >= 5 && u <= 6;
    if (v >= 15 && v <= 16) return u >= 4 && u <= 6;
    if (v >= 17 && v <= 18) return u >= 3 && u <= 6;
    return false;
  }
  if (v === 9) return u >= 3 && u <= 6;
  if (v === 10) return u >= 2 && u <= 9;
  if (v === 11) return u >= 2 && u <= 10;
  return false;
}
function basicSplits(p, up) {
  if (p.length !== 2) return false;
  const r = (c) => (["10", "J", "Q", "K"].includes(c.rank) ? "10" : c.rank);
  if (r(p[0]) !== r(p[1])) return false;
  const u = upValue(up), pr = r(p[0]);
  if (pr === "A" || pr === "8") return true;
  if (pr === "9") return u !== 7 && u <= 9;
  if (pr === "7") return u <= 7;
  if (pr === "6") return u <= 6;
  if (pr === "4") return u === 5 || u === 6;
  if (pr === "2" || pr === "3") return u <= 7;
  return false;
}
function bjMeasure(opts, hands, seed) {
  const rng = mulberry32(seed);
  let net = 0, net2 = 0;
  for (let i = 0; i < hands; i++) {
    const deck = bjDeck(rng);
    const player = [deck.shift(), deck.shift()];
    const dealer = [deck.shift(), deck.shift()];
    let n;
    if (handValue(player) === 21 || handValue(dealer) === 21) n = (BLACKJACK_MULT[blackjackResult(player, dealer)] ?? 0) - 1;
    else if (opts.naive) {
      while (handValue(player) < BLACKJACK_DEALER_STAND) player.push(deck.shift());
      if (handValue(player) <= 21) while (handValue(dealer) < BLACKJACK_DEALER_STAND) dealer.push(deck.shift());
      n = (BLACKJACK_MULT[blackjackResult(player, dealer)] ?? 0) - 1;
    } else {
      const hs = opts.split && basicSplits(player, dealer[0])
        ? [{ cards: [player[0], deck.shift()], mult: 1 }, { cards: [player[1], deck.shift()], mult: 1 }]
        : [{ cards: player, mult: 1 }];
      for (const h of hs) {
        if (opts.double && basicDoubles(h.cards, dealer[0])) { h.mult = 2; h.cards.push(deck.shift()); continue; }
        while (handValue(h.cards) <= 21 && basicHits(h.cards, dealer[0])) h.cards.push(deck.shift());
      }
      if (hs.some((h) => handValue(h.cards) <= 21)) while (handValue(dealer) < BLACKJACK_DEALER_STAND) dealer.push(deck.shift());
      n = 0;
      for (const h of hs) {
        const res = hs.length > 1 && isBlackjack(h.cards) ? (isBlackjack(dealer) ? "push" : "win") : blackjackResult(h.cards, dealer);
        n += ((BLACKJACK_MULT[res] ?? 0) - 1) * h.mult;
      }
    }
    net += n; net2 += n * n;
  }
  const mean = net / hands;
  return { rtp: 1 + mean, se: Math.sqrt(net2 / hands - mean * mean) / Math.sqrt(hands) };
}
const BJ_HANDS = 1_000_000;
const bj = {};
for (const [name, opts] of [["naif", { naive: true }], ["base", {}], ["base + double", { double: true }], ["base + double + refente", { double: true, split: true }]]) {
  bj[name] = bjMeasure(opts, BJ_HANDS, 20261004);
}
const best = bj["base + double + refente"];
check("A4 21 : REF majore le jeu parfait (marge >= 3 ecarts-types)", BLACKJACK_RTP_REF >= best.rtp + 3 * best.se && BLACKJACK_RTP_REF < 1,
  `REF ${pct(BLACKJACK_RTP_REF)} ; parfait ${pct(best.rtp)} +- ${pct(best.se, 2)}`);
check("A4 21 : AUTO colle au chemin de l'auto (base + double, +-0,5 pt)", Math.abs(BLACKJACK_RTP_AUTO - bj["base + double"].rtp) < 0.005,
  `AUTO ${pct(BLACKJACK_RTP_AUTO)} ; mesure ${pct(bj["base + double"].rtp)}`);

/* ============================================================================
 * A1-A2 : les autres jeux (analytique)
 * ========================================================================== */
const icare = 1 - icarusEffectiveEdge();
const tickets = scratchRtpRef();
const slots = slotsOdds().rtp;
check("A2 Icare : 97 % quelle que soit la cible (C = (1 - e)/U)", Math.abs(icare - ICARUS_RTP) < 1e-12 && Math.abs(icare - 0.97) < 1e-12, pct(icare));
check("A2 tickets : la loterie rend 75 % (+-0,5 pt)", Math.abs(tickets - 0.75) < 0.005, `${pct(tickets, 3)} ; P(gain) ${pct(1 - scratchOdds("blank"))} ; gros lot 1 sur ${Math.round(1 / scratchOdds("soleil")).toLocaleString("fr-FR")}`);
check("A2 machine : ~92 % (calibree par la session machine a sous)", slots > 0.9 && slots < 0.95, pct(slots, 3));
const games = [
  ...riteRows.map((r) => [`osselets ${r.id}`, r.rtp]),
  ["Icare", icare], ["tickets", tickets], ["vingt-et-un (REF)", BLACKJACK_RTP_REF], ["machine", slots]
];
check("A1 aucun jeu ne rend 100 % ou plus", games.every(([, r]) => r < 1), games.map(([g, r]) => `${g} ${pct(r)}`).join(", "));

/* ============================================================================
 * A5 : la cagnotte (recycle nu et noye)
 * ========================================================================== */
const recNu = potRecycle();
state.templeArtifacts = { noye: true };
const recNoye = potRecycle();
state.templeArtifacts = {};
const potRows = games.map(([g, r]) => ({ g, r, nu: r + recNu * (1 - r), noye: r + recNoye * (1 - r) }));
check("A5 cagnotte : rtp + recycle x (1 - rtp) < 1 partout (recycle borne < 1)", recNoye <= TEMPLE_POT_RECYCLE_CAP && TEMPLE_POT_RECYCLE_CAP < 1 && potRows.every((x) => x.noye < 1),
  `recycle nu ${recNu}, noye ${recNoye} ; pire total ${pct(Math.max(...potRows.map((x) => x.noye)), 2)}`);

/* ============================================================================
 * A6 : Monte-Carlo sur les moteurs
 * ========================================================================== */
function seededRandom(seed, fn) {
  const rng = mulberry32(seed);
  const real = Math.random;
  Math.random = rng;
  try { return fn(); } finally { Math.random = real; }
}
function freshPlay() {
  setState(defaultState());
  state.bestEraIndex = 10; // limite 560 : toutes les tables ouvertes
  state.faveur = 1e15;
  state.icarusPotFaveur = 0;
}
const MC = {};
// Osselets, rite ancestral, mise 100 : Faveur rendue + valeur des vols offerts.
MC.osselets = seededRandom(7, () => {
  freshPlay();
  const N = 400_000, stake = 100;
  let back = 0, flights = 0;
  for (let i = 0; i < N; i++) {
    state.icarusFreeFlights = [];
    const r = castAugury("prayForRain", "classique", { stake, silent: true, render: false });
    back += r.faveurGain;
    if (r.freeFlight) flights += 1;
  }
  return { rtp: (back + flights * stake * ICARUS_RTP) / (N * stake), n: N };
});
// Icare headless, cible x2, mise 100.
MC.icare = seededRandom(11, () => {
  freshPlay();
  const N = 400_000, stake = 100;
  let back = 0;
  for (let i = 0; i < N; i++) back += (resolveIcarusHeadless(stake, 2) || {}).faveur || 0;
  return { rtp: back / (N * stake), n: N };
});
// Le 21 de l'auto (base + double, sans refente), mise 100.
MC.vingtetun = seededRandom(13, () => {
  freshPlay();
  const N = 300_000, stake = 100;
  let back = 0, staked = 0;
  for (let i = 0; i < N; i++) {
    const r = resolveBlackjackHeadless(stake);
    back += r.faveurGain;
    staked += r.stakeFaveur;
  }
  return { rtp: back / staked, n: N };
});
check("A6 Monte-Carlo osselets (ancestral) ~97 % (+-1 pt)", Math.abs(MC.osselets.rtp - 0.97) < 0.01, `${pct(MC.osselets.rtp)} sur ${MC.osselets.n.toLocaleString("fr-FR")} jets`);
check("A6 Monte-Carlo Icare (cible x2) ~97 % (+-1 pt)", Math.abs(MC.icare.rtp - 0.97) < 0.01, `${pct(MC.icare.rtp)} sur ${MC.icare.n.toLocaleString("fr-FR")} vols`);
check("A6 Monte-Carlo 21 auto ~98,3 % (+-1 pt), par Faveur misee", Math.abs(MC.vingtetun.rtp - BLACKJACK_RTP_AUTO) < 0.012, `${pct(MC.vingtetun.rtp)} sur ${MC.vingtetun.n.toLocaleString("fr-FR")} mains`);

/* ============================================================================
 * A7 : recettes, limites, Benediction par ere
 * ========================================================================== */
const eraRows = [];
for (const i of [2, 3, 5, 8, 10, 13, 15, 18, 20, 23, 25, 27, 29, 30, 32, 34, 45, 60]) {
  setState(defaultState());
  state.bestEraIndex = i;
  eraRows.push({ i, name: eras[i].name, r: recettesPerHour(), max: tableLimits().max, ben: blessingCost(), pot: potCap() });
}
const mono = eraRows.every((x, k) => k === 0 || (x.r >= eraRows[k - 1].r && x.max >= eraRows[k - 1].max));
check("A7 recettes et limite montent avec l'ere record", mono && eraRows[0].r >= 119 && eraRows[0].max === 30,
  `ere 2 : ${Math.round(eraRows[0].r)}/h, limite ${eraRows[0].max}`);

/* ============================================================================
 * Rapport
 * ========================================================================== */
const f = (x) => (x >= 1e6 ? x.toExponential(2) : Math.round(x).toLocaleString("fr-FR"));
const md = `# Jeux de la Maison des Plaisirs — banc d'equilibrage (lot 1, cotes fixes)

> Genere par \`bench-temple.js\` sur le vrai code. Lot 1 des gains « vrai casino »
> (2026-10-04, \`docs/PLAN-GAINS-CASINO.md\`) : cotes fixes pour toujours, mise libre,
> aucun jeu au-dessus de 100 %. A regenerer apres toute retouche : \`node bench-temple.js\`.

## Garde-fous

${checks.map((c) => `- **${c.ok ? "PASS" : "FAIL"}** - ${c.id} : ${c.detail}`).join("\n")}

## Les osselets : quatre paris

| Rite | Gagne | Paire | Triple | Venus | Ecart-type (mises) | RTP |
|---|---|---|---|---|---|---|
${riteRows.map((r) => `| ${r.id} | ${pct(r.p, 1)} | x${r.mult.pair.toFixed(2)} | x${r.mult.triple.toFixed(2)} | x${r.mult.venus.toFixed(2)} | ${r.sd.toFixed(2)} | ${pct(r.rtp, 2)} |`).join("\n")}

Venus offre en plus un vol d'Icare a la mise du jet (compte dans le RTP).

## Le vingt-et-un mesure (${BJ_HANDS.toLocaleString("fr-FR")} mains par politique)

| Politique | RTP |
|---|---|
${Object.entries(bj).map(([k, v]) => `| ${k} | ${pct(v.rtp)} +- ${pct(v.se, 2)} |`).join("\n")}

\`BLACKJACK_RTP_REF\` = ${pct(BLACKJACK_RTP_REF, 1)} (majore le jeu parfait), \`BLACKJACK_RTP_AUTO\` = ${pct(BLACKJACK_RTP_AUTO, 1)}.

## Tous les jeux, cagnotte comprise

| Jeu | RTP | + cagnotte (recycle ${recNu}) | + cagnotte (noye, ${recNoye}) |
|---|---|---|---|
${potRows.map((x) => `| ${x.g} | ${pct(x.r)} | ${pct(x.nu)} | ${pct(x.noye)} |`).join("\n")}

## Recettes de la Maison et limites de table (ere record)

| Ere | Recettes/h | Mise max | Benediction | Plafond cagnotte |
|---|---|---|---|---|
${eraRows.map((x) => `| ${x.i} ${x.name} | ${f(x.r)} | ${f(x.max)} | ${f(x.ben)} | ${f(x.pot)} |`).join("\n")}
`;
fs.writeFileSync("temple-faveur-impact.md", md, "utf8");

console.log(checks.map((c) => `${c.ok ? "PASS" : "FAIL"}  ${c.id}\n      ${c.detail}`).join("\n"));
const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} garde-fou(s) en echec.` : "\nTous les garde-fous passent.");
process.exitCode = failed ? 1 : 0;
