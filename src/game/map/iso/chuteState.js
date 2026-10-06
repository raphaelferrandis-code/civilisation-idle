// LA CHUTE — état partagé (module FEUILLE : aucun import).
//
// La chute de la cité se JOUE sur la carte (docs/PLAN-CHUTE.md) : quand la cité
// tombe, chaque bâtiment, du cœur vers les faubourgs, tremble puis cède sa place à
// sa RUINE dessinée, sous un nuage de poussière ; la nuit tombe ; dans le noir, le
// cycle suivant s'installe dans la même vallée, au milieu des ruines ; l'aube se
// lève sur le feu du campement.
//
// Ce module ne fait que tenir l'horloge et répondre à « où en est cette tuile ? ».
// Les peintres (isoLivePaint, isoEngineScene, isoStreet…) le lisent ; le metteur en
// scène (isoChute.js) l'écrit. Feuille exprès : les peintres l'importent sans
// risquer de cycle avec le metteur en scène, qui importe les peintres.

export const CHUTE_TUNE = {
  // La vague : début (ms), durée de la traversée du cœur au bord de l'écran, gigue.
  waveStart: 700, waveDur: 5200, waveJitter: 420, wavePow: 0.85,
  shakeMs: 420,          // le bâtiment tremble avant de céder
  dustLead: 260,         // la poussière part avant la bascule debout → ruine (elle la cache)
  dustMs: 1700,          // vie d'un nuage
  duskNight: 0.42,       // l'heure de la chute : le crépuscule du jeu (voile chaud)
  duskInMs: 700,         // montée du crépuscule au début de la chute
  nightAt: 1600, nightMs: 2600,   // après la vague : la nuit tombe sur les ruines
  fadeAt: 500, fadeMs: 900,       // puis fondu au noir
  pullBack: 0.75,        // recul de caméra à la fin de la vague (× zoom)
  // Le lever : noir tenu, fondu, nuit au feu du campement, aube.
  riseBlackMs: 700, riseFadeMs: 1400, riseNightMs: 2200, riseDawnMs: 3200,
  relicKeep: 55,         // % des maisons dont la ruine reste debout (le reste est arasé)
};

// LA VERSION COURTE (audit du 05/10, CHUTE-9 ; réglage « Chute de la cité » des
// Options, map/chuteMode.js) : toutes les durées × 0,3, sans nuit — ni la nuit qui
// tombe sur les ruines (nightAt, nightMs), ni celle tenue au feu du campement
// (riseNightMs) ; le campement sort du noir au crépuscule (isoChute.js, riseNight0).
// Crépuscule, recul de caméra et ruines arasées ne changent pas.
// Rebâtie depuis CHUTE_TUNE à chaque chute (la molette __chute.TUNE la suit).
export const CHUTE_SHORT_K = 0.3;
const TUNE_MS = ['waveStart', 'waveDur', 'waveJitter', 'shakeMs', 'dustLead', 'dustMs', 'duskInMs',
  'fadeAt', 'fadeMs', 'riseBlackMs', 'riseFadeMs', 'riseDawnMs'];
const SHORT_TUNE = { ...CHUTE_TUNE };

export const CHUTE = {
  act: null,             // null | 'fall' (la chute) | 'rise' (le lever du cycle suivant)
  short: false,          // version courte (setChuteShort), gardée de la chute à son lever
  t0: 0,                 // performance.now() au début de l'acte
  scrub: null,           // instant forcé (captures, tests) — sinon l'horloge murale
  core: { x: 0, y: 0 },  // cœur de la vague (cellules)
  maxD: 1,               // rayon de la vague à l'écran (cellules)
  fade: 0,               // noir par-dessus la carte, 0..1
  pulled: false,         // recul de caméra déjà lancé
  done: false,           // l'acte est au bout (le noir est atteint / l'aube est faite)
  fall: new WeakMap(),   // tuile → instant de sa chute (ms)
};

// Pose la version de la chute qui commence (et de son lever).
export function setChuteShort(on) {
  CHUTE.short = !!on;
  if (!CHUTE.short) return;
  Object.assign(SHORT_TUNE, CHUTE_TUNE);
  for (const k of TUNE_MS) SHORT_TUNE[k] = CHUTE_TUNE[k] * CHUTE_SHORT_K;
  SHORT_TUNE.nightAt = 0; SHORT_TUNE.nightMs = 0; SHORT_TUNE.riseNightMs = 0;
}
// Les réglages de la chute en cours : CHUTE_TUNE, ou sa version courte.
export const chuteTune = () => (CHUTE.short ? SHORT_TUNE : CHUTE_TUNE);

export function chuteMs(now = (typeof performance !== 'undefined' ? performance.now() : 0)) {
  return CHUTE.scrub != null ? CHUTE.scrub : now - CHUTE.t0;
}

function hash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
export { hash as chuteHash };

// Instant de chute d'une tuile : distance au cœur rapportée au rayon visible,
// courbée (la vague accélère un peu au départ), plus une gigue fixe par tuile.
export function chuteFallAt(t) {
  let v = CHUTE.fall.get(t);
  if (v !== undefined) return v;
  const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
  const d = Math.hypot(t.gx + sx / 2 - CHUTE.core.x, t.gy + sy / 2 - CHUTE.core.y) / Math.max(1, CHUTE.maxD);
  const j = (hash('chute:' + t.gx + ':' + t.gy) % 1000) / 1000;
  const T = chuteTune();
  v = T.waveStart + Math.pow(d, T.wavePow) * T.waveDur + (j - 0.5) * T.waveJitter;
  CHUTE.fall.set(t, v);
  return v;
}
// Rayon tombé (cellules) à l'instant ms : sous lui, les rues se vident.
export function chuteFallenRadius(ms) {
  const T = chuteTune();
  const q = (ms - T.waveStart) / T.waveDur;
  return q <= 0 ? -1 : CHUTE.maxD * Math.pow(q, 1 / T.wavePow);
}
// Fin de la vague, gigue comprise (les tuiles hors champ finissent de tomber après).
export function chuteWaveEnd() {
  const T = chuteTune();
  return T.waveStart + T.waveDur * 1.25 + T.waveJitter;
}

export const DUST_FRAMES = 18;
const SHAKE = [[1, 0], [-1, 0], [1, 1], [-1, 1], [0, 2], [0, 3]];

// État d'une tuile à l'instant : null (debout, rien à faire), { ph:'shake', ox, oy,
// dust } (secouée, décalage en px de SPRITE), { ph:'ruin', dust } (ruine). `dust` =
// image du nuage (0..DUST_FRAMES-1) ou -1.
// ⚠ L'objet rendu est RÉUTILISÉ d'un appel à l'autre (un par phase) : appelé pour
// chaque tuile visible à chaque frame, il en allouait autant. À lire tout de suite,
// jamais à garder.
const SHAKE_ST = { ph: 'shake', ox: 0, oy: 0, dust: -1 };
const RUIN_ST = { ph: 'ruin', dust: -1 };
export function chuteTileState(t) {
  if (CHUTE.act !== 'fall') return null;
  const ms = chuteMs(), tf = chuteFallAt(t), T = chuteTune();
  if (ms < tf - T.shakeMs) return null;
  const df = Math.floor((ms - (tf - T.dustLead)) / T.dustMs * DUST_FRAMES);
  const dust = df >= 0 && df < DUST_FRAMES ? df : -1;
  if (ms < tf) {
    const o = SHAKE[Math.min(SHAKE.length - 1, Math.floor((ms - (tf - T.shakeMs)) / 70))];
    SHAKE_ST.ox = o[0]; SHAKE_ST.oy = o[1]; SHAKE_ST.dust = dust;
    return SHAKE_ST;
  }
  RUIN_ST.dust = dust;
  return RUIN_ST;
}

// Réverbères, braseros et fenêtres éteints : la chute a commencé.
export const chuteLightsOut = () => CHUTE.act === 'fall';
