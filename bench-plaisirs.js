/* ============================================================================
 * bench-plaisirs.js — LA MAISON DES PLAISIRS SUR 20 HEURES (et au-delà).
 *
 * Raph, 2026-10-04 : « c'est fait pour tenir 20 heures ? » — on MESURE au lieu
 * d'estimer. Des PROFILS de joueur jouent la Maison sur le VRAI moteur : les six
 * jeux (osselets, tickets, Icare, vingt-et-un, machine, roulette, courses, duel), la
 * caisse, la Nuit du Grand Jeu et le spectacle, la réputation et les titres (avec leurs
 * cadeaux), les automatisations, l'arbre des
 * artefacts et les reliques de la Boutique, le Grand Reset (champs persistants du
 * jeu). Rien n'est recopié : seules les DÉCISIONS du joueur sont écrites ici.
 *
 * ⚠ L'ÈRE RECORD selon le temps de jeu est une HYPOTHÈSE (courbes plus bas) : la
 * simulation complète du jeu (sim-10-profils.js) ne donne plus de courbe fiable
 * (son bot reste bloqué aux ères 1-2 après un Grand Reset précoce, 2026-10-04).
 * Tout ce qui se compte en HEURES DE RECETTES (titres, bourse, ruines) ne dépend
 * pas de la courbe ; les reliques (prix fixes) et la Faveur nominale, si.
 *
 * Depuis le 2026-10-04 (décisions de Raph après la première mesure) le jeu porte
 * lui-même la roue horaire, les bourses des titres, les reliques en heures de
 * recettes, Prince à 40 h, le salon privé sans plafond et l'échelle ×1 000 de la
 * Faveur : le banc les joue tels quels (les leviers restent pour essayer autre chose).
 *
 * Mesures, par courbe × profil :
 *   - les heures où tombent les titres et les reliques ;
 *   - la bourse : nominale et en heures de recettes (la « sensation de richesse ») ;
 *   - la sensation de gagner : part des coups gagnants, gros gains par heure ;
 *   - les RUINES : la bourse retombe sous 10 % de son sommet (sommet ≥ 2 h).
 *
 * Usage : node bench-plaisirs.js [--hours=20] [--seed=7] [--profile=id] [--curve=id]
 * Sortie : docs/bench/plaisirs-20h.md, relatif au dossier courant (+ résumé console).
 * ========================================================================== */
import fs from "fs";
// Stubs DOM (avant imports jeu) : le faux navigateur commun des harnais.
import "./scripts/lib/headless.mjs";

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const HOURS = Number(argv.hours) || 20;
const SEED = Number(argv.seed) || 7;

// Hasard REPRODUCTIBLE (avant les imports : les moteurs lisent Math.random).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(SEED);

// Horloge VIRTUELLE : la caisse et les automatisations lisent Date.now.
const BASE = 1_800_000_000_000;
let VT = 0; // secondes de jeu
Date.now = () => BASE + VT * 1000;

// --- Imports jeu ------------------------------------------------------------
const S = await import("./src/game/core/state.js");
const { setState, defaultState, GR_PERSISTENT_FIELDS } = S;
await import("./src/game/core/actions.js"); // ordre d'évaluation du jeu réel
const { castAugury, doubleAugury } = await import("./src/game/core/actions/augures.js");
const { resolveIcarusHeadless, icarusUnlocked } = await import("./src/game/core/actions/icarus.js");
const { playScratch, scratchUnlocked } = await import("./src/game/core/actions/scratch.js");
const { resolveBlackjackHeadless, blackjackUnlocked } = await import("./src/game/core/actions/blackjack.js");
const { spinSlots, slotsUnlocked, slotsFreeSpins } = await import("./src/game/core/actions/slots.js");
const { spinRoulette, rouletteUnlocked, rouletteVipUnlocked } = await import("./src/game/core/actions/roulette.js");
const { spinRoue, roueReady } = await import("./src/game/core/actions/roueMaison.js");
const { jouerDuel, duelOuvert, duelMiseMin } = await import("./src/game/core/actions/duel.js");
const { lancerCourse, coursesUnlocked, coursePartants } = await import("./src/game/core/actions/courses.js");
const { lancerSpectacle, spectaclePret } = await import("./src/game/core/actions/nuitGrandJeu.js");
const { collectTrunk } = await import("./src/game/core/actions/offeringTrunk.js");
const { recettesPerHour, tableLimits } = await import("./src/game/core/actions/maisonTable.js");
const { maisonRank, RANK_LABELS } = await import("./src/game/core/actions/maisonRang.js");
const { tickTempleAutomation, setTempleAuto, buyArtifactNode, artifactTree } = await import("./src/game/core/actions/templeAutomation.js");
const { hasFreeFlight } = await import("./src/game/core/actions/templeFlights.js");
const { regulationActionUnlocked } = await import("./src/game/core/mechanics/crisis-cost.js");
const bal = await import("./src/game/core/balance.js");
const st = () => S.state;

const OSSELETS = "prayForRain";
const RELICS = ["char", "lyre", "miroir", "corne", "toison", "pomme", "oeil"];

/* ============================================================================
 * LES LEVIERS (pour chiffrer une proposition AVANT de toucher au jeu) :
 *   --bonus=h        à chaque heure de jeu actif, h heures de recettes offertes
 *                    (le bonus horaire des casinos sociaux)
 *   --gifts=a,b,c,d  à chaque titre (Familier → Prince), un cadeau de N heures de
 *                    recettes
 *   --relics=h1,…,h7 le prix des reliques EN HEURES DE RECETTES au moment de
 *                    l'achat (Char → Œil), au lieu des prix fixes
 *   --thresholds=a,b,c,d  les seuils des titres (h de réputation)
 *   --tag=nom        le rapport s'écrit dans docs/bench/plaisirs-20h-<nom>.md (ignoré par git)
 * ========================================================================== */
const list = (v) => (typeof v === "string" ? v.split(",").map(Number) : null);
const LEVERS = {
  bonus: Number(argv.bonus) || 0,
  // --bonusRank=a,b,c,d,e : le bonus horaire selon le titre (Habitué → Prince),
  // remplace --bonus (la roue du boudoir, plus riche, au Mécène).
  bonusRank: list(argv.bonusRank),
  gifts: list(argv.gifts),
  relics: list(argv.relics),
  thresholds: list(argv.thresholds)
};
if (LEVERS.thresholds) LEVERS.thresholds.forEach((t, i) => { if (bal.MAISON_RANKS[i + 1]) bal.MAISON_RANKS[i + 1].threshold = t; });

/* ============================================================================
 * Les COURBES D'ÈRE (hypothèses) : [heure, ère record] par morceaux, et les
 * heures des Grands Resets (la Faveur, la cagnotte et l'ère record repartent
 * de zéro ; titre, artefacts, reliques et automatisations restent).
 * ========================================================================== */
const CURVES = {
  // La partie canonique de la sim de juillet (« AFK assumé ») : un premier Grand
  // Reset à 10 h, puis l'avalanche des sceaux entre 17 et 22 h.
  juillet: {
    label: "Sim de juillet (GR à 10 h, 17 h, 19 h, 20 h)",
    points: [[0, 0], [0.1, 2], [0.3, 3], [1, 4], [4, 5], [9.9, 7], [10, 0], [10.2, 2], [11, 4], [16.8, 5], [16.9, 0], [17.1, 3], [18, 8], [19.1, 12], [19.2, 0], [19.3, 6], [19.5, 22], [20.2, 33], [20.3, 0], [20.5, 20], [21.8, 58], [30, 70]],
    gr: [10, 16.9, 19.2, 20.3]
  },
  // Une seule longue époque : l'ère record monte jusqu'à la Singularité en 20 h.
  continue: {
    label: "Sans Grand Reset, jusqu'à l'ère 34 en 20 h",
    points: [[0, 0], [0.1, 2], [0.3, 3], [1, 4], [3, 6], [6, 10], [10, 16], [14, 24], [17, 30], [20, 34], [30, 45]],
    gr: []
  },
  // Un premier joueur : l'ère XII en 20 h, pas de Grand Reset.
  lent: {
    label: "Premier joueur : l'ère 12 en 20 h",
    points: [[0, 0], [0.15, 2], [0.5, 3], [2, 4], [5, 6], [10, 8], [15, 10], [20, 12], [30, 15]],
    gr: []
  }
};
function eraAt(curve, h) {
  const p = curve.points;
  if (h <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i += 1) {
    if (h <= p[i][0]) {
      const [h0, e0] = p[i - 1], [h1, e1] = p[i];
      // Une chute (Grand Reset) est un saut, pas une pente.
      if (e1 < e0) return h < h1 ? e0 : e1;
      return Math.floor(e0 + (e1 - e0) * ((h - h0) / Math.max(1e-9, h1 - h0)));
    }
  }
  return p[p.length - 1][1];
}

/* ============================================================================
 * Les PROFILS : seules décisions écrites ici.
 *   share       part de chaque heure passée aux tables (minutes = share × 60)
 *   bpm         coups par minute de table
 *   frac        mise = frac × bourse (bornée par la table) ; 1 = tout ou rien
 *   collect     relève de la caisse toutes les N minutes
 *   keep        réserve gardée hors des achats (part de la bourse)
 *   autos       allume les automatisations offertes (cadran de mise)
 *   icare       cible d'Icare ; rite des osselets ; pari de roulette
 * ========================================================================== */
const PROFILES = {
  prudent: { label: "Prudent (2 % par coup)", share: 0.2, bpm: 8, frac: 0.02, collect: 20, keep: 0.5, autos: "min", icare: 1.6, rite: "prudent", roulette: "simple" },
  joueur: { label: "Joueur (5 % par coup)", share: 0.25, bpm: 10, frac: 0.05, collect: 20, keep: 0.3, autos: "quart", icare: 2.5, rite: "classique", roulette: "douzaine" },
  agressif: { label: "Agressif (25 % par coup)", share: 0.25, bpm: 10, frac: 0.25, collect: 20, keep: 0.1, autos: "max", icare: 5, rite: "grand", roulette: "plein" },
  kamikaze: { label: "Tout ou rien (mise max)", share: 0.25, bpm: 10, frac: 1, collect: 20, keep: 0, autos: "max", icare: 10, rite: "grand", roulette: "plein" },
  collection: { label: "Collectionneur (achète tout)", share: 0.15, bpm: 8, frac: 0.03, collect: 20, keep: 0, autos: "quart", icare: 2, rite: "classique", roulette: "simple" },
  absent: { label: "Absent (caisse toutes les 3 h, autos)", share: 0, bpm: 0, frac: 0.05, collect: 180, keep: 0.3, autos: "quart", icare: 2, rite: "classique", roulette: "simple" }
};

// --- Partie neuve, et le Grand Reset (champs persistants du VRAI jeu) -------
function freshGame() {
  setState(defaultState());
  st().cycles = 1;
}
function grandReset() {
  const old = st();
  const keep = {};
  for (const k of GR_PERSISTENT_FIELDS) if (k in old) keep[k] = old[k];
  setState(defaultState());
  Object.assign(st(), keep);
  st().cycles = 1;
}

// --- Le joueur à la table ----------------------------------------------------
function stakeFor(p) {
  const { min, max } = tableLimits();
  const f = Math.floor(st().faveur || 0);
  if (f < min) return 0;
  const want = p.frac >= 1 ? f : Math.floor(f * p.frac);
  return Math.max(min, Math.min(max, f, want));
}

function openGames() {
  const o = [];
  if (regulationActionUnlocked(OSSELETS)) o.push("osselets");
  if (scratchUnlocked()) o.push("tickets");
  if (icarusUnlocked()) o.push("icare");
  if (blackjackUnlocked()) o.push("vingtetun");
  if (slotsUnlocked()) o.push("machine");
  if (rouletteUnlocked()) o.push("roulette");
  if (coursesUnlocked()) o.push("courses");
  if (duelOuvert()) o.push("duel");
  return o;
}

// Un coup : rend { stake, gain } (gain = ce que le coup a rendu, mise comprise), ou null.
function playOne(game, p) {
  const stake = stakeFor(p);
  if (game === "icare" && hasFreeFlight()) {
    const r = resolveIcarusHeadless(0, p.icare, { free: true });
    return r ? { stake: 0, gain: r.faveur || 0, free: true } : null;
  }
  if (stake <= 0) return null;
  const before = st().faveur;
  if (game === "osselets") {
    const r = castAugury(OSSELETS, p.rite, { stake, render: false, silent: true });
    if (!r) return null;
    // Le quitte ou double : le prudent n'y touche pas, l'agressif toujours.
    if (r.win && p.frac >= 0.25 && r.faveurGain > 0) doubleAugury(OSSELETS, r.faveurGain, { render: false, silent: true });
  } else if (game === "tickets") {
    if (!playScratch(stake, { render: false, silent: true })) return null;
  } else if (game === "icare") {
    if (!resolveIcarusHeadless(stake, p.icare)) return null;
  } else if (game === "vingtetun") {
    if (!resolveBlackjackHeadless(stake)) return null;
  } else if (game === "machine") {
    const r = spinSlots(stake, { render: false, silent: true });
    if (!r) return null;
    settleSlots(r);
    // La série de tours gratuits se joue d'une traite.
    for (let guard = 0; slotsFreeSpins() && guard < 200; guard += 1) {
      const f = spinSlots(stake, { render: false, silent: true });
      if (!f) break;
      settleSlots(f);
    }
  } else if (game === "roulette") {
    // Au Mécène, le joueur qui mise gros passe au SALON PRIVÉ : plus de plafond, la
    // mise suit sa bourse (tout ou rien : toute la bourse).
    const vip = p.frac >= 0.25 && rouletteVipUnlocked();
    const f = Math.floor(st().faveur || 0);
    const s = vip ? Math.max(1, p.frac >= 1 ? f : Math.floor(f * p.frac)) : stake;
    const bets = p.roulette === "plein" ? { n17: s }
      : p.roulette === "douzaine" ? { d2: s }
      : { rouge: s };
    if (!spinRoulette(bets, { render: false, silent: true, vip })) return null;
    return { stake: s, gain: Math.max(0, st().faveur - before + s) };
  } else if (game === "courses") {
    // Le prudent joue le favori, le joueur un cheval au hasard, l'agressif l'outsider.
    const champ = coursePartants().slice().sort((a, b) => b.p - a.p);
    const c = p.frac <= 0.02 ? champ[0] : p.frac >= 0.25 ? champ[champ.length - 1] : champ[Math.floor(Math.random() * champ.length)];
    if (!lancerCourse({ [c.couloir]: stake }, { render: false, silent: true })) return null;
  } else if (game === "duel") {
    // Le duel n'a pas de plafond : la mise suit la bourse. Sous la mise minimale (une
    // heure de recettes), le profil passe son tour — sinon la mise minimale le forçait
    // à tout jouer (seul le « tout ou rien » mise toute sa bourse).
    const f = Math.floor(st().faveur || 0), mn = duelMiseMin();
    const s = p.frac >= 1 ? f : Math.floor(f * p.frac);
    if (s < mn) return null;
    if (!jouerDuel(s, { render: false, silent: true })) return null;
    return { stake: s, gain: Math.max(0, st().faveur - before + s) };
  }
  return { stake, gain: Math.max(0, st().faveur - before + stake) };
}
function settleSlots(r) {
  if (r.wheel) r.wheel.apply(Math.floor(Math.random() * 3));
  if (r.holdWin) r.holdWin.apply();
}

// --- La Boutique : l'arbre dans son ordre, reliques comprises ----------------
function shop(p, log) {
  // Levier : les reliques au prix en HEURES de recettes, dans l'ordre de l'échelle.
  if (LEVERS.relics) {
    const R = recettesPerHour();
    for (let i = 0; i < RELICS.length; i += 1) {
      const id = RELICS[i];
      if (st().templeArtifacts && st().templeArtifacts[id]) continue;
      const cost = Math.round((LEVERS.relics[i] || 0) * R);
      const f = st().faveur || 0;
      if (cost > 0 && f - cost >= f * p.keep) {
        st().faveur = f - cost;
        st().templeArtifacts = { ...(st().templeArtifacts || {}), [id]: true };
        log.push({ h: VT / 3600, id, cost });
      }
      break; // une relique à la fois, dans l'ordre
    }
  }
  // L'arbre de l'UI : par lignée, chaque rang avec son coût et s'il s'achète.
  for (const n of artifactTree().flatMap((l) => l.nodes)) {
    if (!n || !n.buyable || n.maxed || n.gift != null) continue;
    if (LEVERS.relics && RELICS.includes(n.id)) continue;
    const cost = n.cost || 0;
    if (!(cost > 0)) continue;
    const f = st().faveur || 0;
    if (f - cost < f * p.keep) continue;
    if (buyArtifactNode(n.id)) log.push({ h: VT / 3600, id: n.id, cost });
  }
}

// --- Une partie de N heures ---------------------------------------------------
function run(curve, p) {
  freshGame();
  const out = {
    titles: {}, relics: {}, buys: [], samples: [], ruins: 0, bets: 0, wins: 0, ldw: 0,
    tiers: { gros: 0, enorme: 0, legende: 0 }, bestMult: 0, bestGainH: 0,
    peakH: 0, peakNominal: 0, staked: 0, won: 0, income: 0, ruinLog: [],
    brokeSteps: 0, tableSteps: 0, treeDone: null, gifted: 0, spectacles: 0
  };
  let peakSinceGR = 0;
  let grIdx = 0;
  let autosOn = false;
  const STEP = 10; // secondes
  const total = HOURS * 3600;
  for (VT = 0; VT <= total; VT += STEP) {
    const h = VT / 3600;
    // Grand Reset au programme de la courbe.
    if (grIdx < curve.gr.length && h >= curve.gr[grIdx]) { grandReset(); grIdx += 1; peakSinceGR = 0; autosOn = false; }
    st().bestEraIndex = Math.max(0, eraAt(curve, h));
    const R = recettesPerHour();
    // La caisse, aux relèves du profil.
    if (VT % (p.collect * 60) === 0) out.income += collectTrunk({ silent: true, render: false });
    // Les automatisations offertes : on les allume une fois.
    if (!autosOn && p.autos) {
      for (const g of ["osselets", "icarus", "gratteux", "vingtetun", "tronc"]) {
        const a = st().templeAuto && st().templeAuto[g];
        if (a && a.unlocked && !a.on) setTempleAuto(g, { on: true, stakeStep: p.autos, ...(g === "icarus" ? { target: Math.min(10, Math.max(1.5, p.icare)) } : {}) });
      }
      autosOn = ["osselets", "icarus", "gratteux", "vingtetun"].every((g) => st().templeAuto?.[g]?.on || !st().templeAuto?.[g]?.unlocked);
    }
    const before = st().faveur;
    tickTempleAutomation();
    if (st().faveur !== before && (st().faveur || 0) > 0) { /* les autos jouent : compté dans la bourse */ }
    // Levier : le bonus horaire (le joueur actif le prend à chaque heure pleine).
    // La ROUE DE LA MAISON du jeu : le joueur présent la prend dès qu'elle est prête.
    if (p.share > 0 && roueReady()) {
      const r = spinRoue({ silent: true, render: false });
      if (r) out.gifted += r.h;
    }
    const bonusH = LEVERS.bonusRank ? (LEVERS.bonusRank[maisonRank()] || 0) : LEVERS.bonus;
    if (bonusH > 0 && p.share > 0 && VT > 0 && VT % 3600 === 0) {
      const g = Math.round(bonusH * R);
      st().faveur = (st().faveur || 0) + g;
      out.gifted += g / Math.max(1, R);
    }
    // Les minutes de table : les `share × 60` premières de chaque heure.
    const minuteOfHour = Math.floor((VT % 3600) / 60);
    const atTable = minuteOfHour < p.share * 60;
    // Le spectacle : le joueur présent le lève dès que la troupe est prête.
    if (atTable && VT % 60 === 0 && spectaclePret() && lancerSpectacle()) out.spectacles += 1;
    if (atTable && VT % 60 === 0) {
      out.tableSteps += 1;
      // « Fauché » : la bourse ne couvre plus cinq mises minimales de la table.
      if ((st().faveur || 0) < Math.max(5, tableLimits().base * 0.2)) out.brokeSteps += 1;
    }
    if (atTable && VT % 60 === 0) {
      const games = openGames();
      for (let b = 0; b < p.bpm && games.length; b += 1) {
        const g = games[Math.floor(Math.random() * games.length)];
        const r = playOne(g, p);
        if (!r) continue;
        out.bets += 1;
        out.staked += r.stake;
        out.won += r.gain;
        const base = r.stake || 1;
        const m = r.gain / base;
        if (r.stake > 0 && r.gain > r.stake) out.wins += 1;
        else if (r.stake > 0 && r.gain > 0) out.ldw += 1;
        if (r.stake > 0) {
          if (m >= 250) out.tiers.legende += 1; else if (m >= 50) out.tiers.enorme += 1; else if (m >= 10) out.tiers.gros += 1;
          if (m > out.bestMult) out.bestMult = m;
          if (R > 0 && r.gain / R > out.bestGainH) out.bestGainH = r.gain / R;
        }
      }
    }
    // Les achats, toutes les 5 minutes.
    if (VT % 300 === 0) shop(p, out.buys);
    // Titres et reliques.
    const rk = maisonRank();
    for (let r = 1; r <= rk; r += 1) {
      if (out.titles[r] != null) continue;
      out.titles[r] = h;
      // Levier : le cadeau du titre, en heures de recettes.
      if (LEVERS.gifts && LEVERS.gifts[r - 1] > 0) {
        st().faveur = (st().faveur || 0) + Math.round(LEVERS.gifts[r - 1] * R);
        out.gifted += LEVERS.gifts[r - 1];
      }
    }
    if (out.treeDone == null && VT % 300 === 0) {
      const left = artifactTree().flatMap((l) => l.nodes).filter((n) => n && n.gift == null && !RELICS.includes(n.id) && !n.maxed && !n.owned);
      if (!left.length) out.treeDone = h;
    }
    for (const id of RELICS) if (out.relics[id] == null && st().templeArtifacts && st().templeArtifacts[id]) out.relics[id] = h;
    // La bourse en heures de recettes, ses sommets, ses ruines.
    const fH = R > 0 ? (st().faveur || 0) / R : 0;
    if (fH > peakSinceGR) peakSinceGR = fH;
    if (peakSinceGR >= 2 && fH < peakSinceGR * 0.1) { out.ruins += 1; out.ruinLog.push({ h, from: peakSinceGR }); peakSinceGR = fH; }
    if (fH > out.peakH) out.peakH = fH;
    if ((st().faveur || 0) > out.peakNominal) out.peakNominal = st().faveur || 0;
    if (VT % 1800 === 0) out.samples.push({ h, era: st().bestEraIndex, R, f: st().faveur || 0, fH, rank: rk, rep: st().maisonReputation || 0 });
  }
  out.final = { f: st().faveur || 0, fH: (st().faveur || 0) / Math.max(1, recettesPerHour()), rank: maisonRank(), rep: st().maisonReputation || 0 };
  out.nuits = st().nuitCompte || 0;
  return out;
}

/* ============================================================================
 * Rapport
 * ========================================================================== */
const fmtH = (h) => (h == null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, "0")}`);
const fmtN = (x) => (x >= 1e6 ? x.toExponential(2).replace("e+", " e") : Math.round(x).toLocaleString("fr-FR"));
const curveIds = argv.curve ? [argv.curve] : Object.keys(CURVES);
const profileIds = argv.profile ? [argv.profile] : Object.keys(PROFILES);
const rankName = (r) => RANK_LABELS[bal.MAISON_RANKS[r].id].fr;

let md = `# La Maison des Plaisirs sur ${HOURS} h — bench-plaisirs.js\n\n`;
md += `> Généré par \`node bench-plaisirs.js\` (graine ${SEED}). Vrai moteur : huit jeux (dont les courses et le duel), caisse, Nuit du Grand Jeu et spectacle, titres et cadeaux, automatisations, arbre et reliques, Grand Reset. Les profils ne décident que de la mise, du jeu, des relèves et des achats.\n`;
md += `> ⚠ L'ère record selon le temps de jeu est une HYPOTHÈSE (trois courbes). Ce qui se compte en heures de recettes (titres, bourse, ruines) n'en dépend pas ; les reliques et la Faveur nominale, si.\n\n`;
console.log(`[bench-plaisirs] ${HOURS} h, graine ${SEED}, courbes ${curveIds.join(", ")}`);

for (const cid of curveIds) {
  const curve = CURVES[cid];
  md += `## Courbe « ${cid} » — ${curve.label}\n\n`;
  md += `| Profil | ${bal.MAISON_RANKS.slice(1).map((r) => RANK_LABELS[r.id].fr).join(" | ")} | Arbre (hors reliques) | Reliques (heure) | Bourse max (h de recettes) | Bourse max (Faveur) | Bourse finale (h) | Ruines | Fauché (temps de table) | Coups | Gagnants | Gros/Énormes/Légende | Plus gros gain (h) |\n`;
  md += `|---|${bal.MAISON_RANKS.slice(1).map(() => "---").join("|")}|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const pid of profileIds) {
    const p = PROFILES[pid];
    Math.random = mulberry32(SEED);
    const o = run(curve, p);
    const titles = bal.MAISON_RANKS.slice(1).map((_, i) => fmtH(o.titles[i + 1]));
    const relics = RELICS.filter((id) => o.relics[id] != null).map((id) => `${id} ${fmtH(o.relics[id])}`).join(", ") || "—";
    const winRate = o.bets ? `${Math.round((o.wins / o.bets) * 100)} %` : "—";
    const broke = o.tableSteps ? `${Math.round((o.brokeSteps / o.tableSteps) * 100)} %` : "—";
    md += `| ${p.label} | ${titles.join(" | ")} | ${fmtH(o.treeDone)} | ${relics} | ${o.peakH.toFixed(1)} | ${fmtN(o.peakNominal)} | ${o.final.fH.toFixed(1)} | ${o.ruins} | ${broke} | ${fmtN(o.bets)} | ${winRate} | ${o.tiers.gros}/${o.tiers.enorme}/${o.tiers.legende} | ${o.bestGainH.toFixed(1)} |\n`;
    console.log(`  ${cid} · ${p.label} : titre ${rankName(o.final.rank)} (rép. ${o.final.rep.toFixed(1)} h), bourse max ${o.peakH.toFixed(1)} h, finale ${o.final.fH.toFixed(1)} h, ruines ${o.ruins}, fauché ${broke}, arbre ${fmtH(o.treeDone)}, reliques ${relics}, nuits ${o.nuits}, spectacles ${o.spectacles}`);
    if (pid === "joueur") {
      md += `\n<details><summary>Le joueur, heure par heure</summary>\n\n| Heure | Ère | Recettes/h | Bourse | Bourse (h) | Titre | Réputation (h) |\n|---|---|---|---|---|---|---|\n`;
      for (const s of o.samples.filter((x) => Math.abs(x.h - Math.round(x.h)) < 1e-6)) {
        md += `| ${Math.round(s.h)} | ${s.era} | ${fmtN(s.R)} | ${fmtN(s.f)} | ${s.fH.toFixed(1)} | ${rankName(s.rank)} | ${s.rep.toFixed(2)} |\n`;
      }
      md += `\n</details>\n\n`;
    }
  }
  md += `\n`;
}
// Le rapport versionné vit dans docs/bench/ (audit du 05/10, GIT-6) ; les variantes
// --tag y sont ignorées par git (.gitignore).
const OUT = argv.tag ? `docs/bench/plaisirs-20h-${argv.tag}.md` : "docs/bench/plaisirs-20h.md";
if (LEVERS.bonus || LEVERS.bonusRank || LEVERS.gifts || LEVERS.relics || LEVERS.thresholds) {
  md = md.replace("\n\n## ", `\n\n> Leviers : ${JSON.stringify(LEVERS)}\n\n## `);
}
fs.mkdirSync("docs/bench", { recursive: true });
fs.writeFileSync(OUT, md, "utf8");
console.log(`Écrit : ${OUT}`);
