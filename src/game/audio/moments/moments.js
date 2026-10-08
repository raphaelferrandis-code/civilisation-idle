// LES GRANDS MOMENTS — la LECTURE (docs/PLAN-AMBIANCE-SONORE.md, lot 7). La synthèse
// vit dans momentsSynth.js ; les moments arrivent par le guichet (annonces.js) et par
// le bandeau des âges (App.jsx, sonNouvelAge). Tout suit Options › Son › Bruitages
// (getSfxEnabled, getSfxVolume), comme les jeux de la Maison des Plaisirs.
//
//   · LA CHUTE : la main qui tient « Effondrer la Cité » fait monter un grondement ;
//     la musique descend (décision de Raph du 2026-10-08) ; quand la carte joue la
//     vague, le grondement suit la DENSITÉ des bâtiments qui tombent, les plus gros de
//     l'écran s'effondrent chacun à leur instant et de leur côté, des gravats roulent
//     entre eux ; le noir l'éteint. Au deuil, le glas. La musique revient à l'aube du
//     cycle suivant.
//   · UN NOUVEL ÂGE : une frappe discrète, plus ample à une nouvelle époque ; jamais
//     pour un âge franchi pendant une absence rejouée (rattrapageRecent).
//   · UNE MAISON QUI SORT DE TERRE : un coup de maillet, de pierre, de marteau, de
//     cristal, de son côté de l'écran — seulement après un achat à la main ; un achat
//     de masse, une courte rafale. Les automatisations ne font aucun bruit.
//   · LE GRAND RESET : le sceau (souffle et gong), puis le renouveau.
//
// Ses voix passent par un gain et un limiteur à elles, sur le contexte audio du jeu.

import { audioCtx, enTampon, retenirContexte, relacherContexte } from '../synth.js';
import { getSfxEnabled, getSfxVolume, duckMusic, holdMusicLow, rattrapageRecent } from '../../core/main.js';
import { rendreAilleurs } from '../syntheseAilleurs.js';
import { rendreMoment, MOMENTS_SR, matiereDe, SONS_MOMENTS } from './momentsSynth.js';
import { surMoment, annoncer } from './annonces.js';
import { CHUTE, chuteMs, chuteTune, chuteWaveEnd } from '../../map/iso/chuteState.js';
import { enregistrerBancMoments } from '../paysage/banc.js';

// Les niveaux, × Bruitages. Discrets : l'âge et la maison se glissent sous la musique.
export const NIVEAUX = {
  grondement: 0.55, effondrement: 0.5, gravats: 0.28, glas: 0.45,
  age: 0.3, epoque: 0.48, batiment: 0.2, sceau: 0.55, renouveau: 0.35,
};
// Les molettes du banc d'écoute, × NIVEAUX (retenues d'une session à l'autre).
export const BANC_MOMENTS = Object.fromEntries(Object.keys(NIVEAUX).map((k) => [k, 1]));
const CLE_BANC = 'civ-moments-banc-1';
try {
  const j = JSON.parse(localStorage.getItem(CLE_BANC) || 'null');
  if (j && typeof j === 'object') for (const k of Object.keys(BANC_MOMENTS)) if (Number.isFinite(Number(j[k]))) BANC_MOMENTS[k] = Number(j[k]);
} catch { /* stockage indisponible : les défauts */ }
const famille = (nom) => nom.replace(/-.*$/, '');
const niveau = (nom) => (NIVEAUX[famille(nom)] || 0.3) * (BANC_MOMENTS[famille(nom)] ?? 1);

const horloge = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const D = {
  arme: false, desabonner: null, prepa: null,
  bande: 0,
  tampons: new Map(), enRoute: new Map(),
  sortie: null,
  grondement: null,        // la boucle { source, gain, pan } quand elle joue
  tenue: false,            // la main sur « Effondrer la Cité »
  chute: null,             // la chute en cours (voir debutChute)
  musique: false,          // la musique est tenue basse
  dernierAchat: -Infinity, rafale: null, dernierBat: -Infinity, dernierAge: -Infinity,
  compte: {},              // combien de fois chaque son a joué (vérifications, banc)
};

// ── Les tampons ─────────────────────────────────────────────────────────────────
// Rendus dans le Worker des sons (syntheseAilleurs.js), sinon ici. Une promesse par son.
function demander(nom) {
  if (D.tampons.has(nom)) return Promise.resolve(D.tampons.get(nom));
  if (D.enRoute.has(nom)) return D.enRoute.get(nom);
  const p = rendreAilleurs({ quoi: 'moment', nom })
    .catch(() => rendreMoment(nom))
    .then((data) => {
      const t = data ? enTampon(data, MOMENTS_SR) : null;
      if (t) D.tampons.set(nom, t);
      return t;
    })
    .finally(() => D.enRoute.delete(nom));
  D.enRoute.set(nom, p);
  return p;
}
// Ce qu'il faut avoir sous la main à la bande `b` : la chute de sa matière, son âge, la
// prochaine époque, la maison de sa matière, le glas et le Grand Reset.
export function sonsUtilesMoments(b) {
  const m = matiereDe(b), e = Math.min(9, b + 1);
  return ['grondement', 'glas', 'gravats-1', 'gravats-2', 'gravats-3',
    `effondrement-${m}-1`, `effondrement-${m}-2`, `effondrement-${m}-3`,
    `age-${b}`, `epoque-${e}`, `batiment-${m}-1`, `batiment-${m}-2`, 'sceau', 'renouveau'];
}
function preparer() {
  if (!getSfxEnabled()) return;
  const utiles = new Set(sonsUtilesMoments(D.bande));
  for (const k of [...D.tampons.keys()]) if (!utiles.has(k)) D.tampons.delete(k);
  for (const nom of utiles) demander(nom);
}

// ── La sortie et les voix ───────────────────────────────────────────────────────
function sortie() {
  const ctx = audioCtx();
  if (!ctx) return null;
  if (D.sortie && D.sortie.ctx === ctx) return D.sortie;
  const gain = ctx.createGain();
  const limiteur = ctx.createDynamicsCompressor();
  limiteur.threshold.value = -6; limiteur.knee.value = 4; limiteur.ratio.value = 20;
  limiteur.attack.value = 0.002; limiteur.release.value = 0.25;
  gain.connect(limiteur); limiteur.connect(ctx.destination);
  // Une sonde, pour le banc et les vérifications : ce qui sort, en dBFS efficaces.
  const sonde = typeof ctx.createAnalyser === 'function' ? ctx.createAnalyser() : null;
  if (sonde) { sonde.fftSize = 2048; limiteur.connect(sonde); }
  D.sortie = { ctx, gain, limiteur, sonde };
  return D.sortie;
}
let _lecture = null;
function niveauSortie() {
  const s = D.sortie && D.sortie.sonde;
  if (!s || typeof s.getFloatTimeDomainData !== 'function') return null;
  if (!_lecture || _lecture.length !== s.fftSize) _lecture = new Float32Array(s.fftSize);
  s.getFloatTimeDomainData(_lecture);
  let e = 0;
  for (let i = 0; i < _lecture.length; i += 1) e += _lecture[i] * _lecture[i];
  return 10 * Math.log10(e / _lecture.length + 1e-12);
}
// Joue un son prêt, au gain `g` (× niveau × Bruitages), placé à `pan`, à `vitesse`,
// dans `dans` secondes. Rend la voix { source, gain, pan } ou null.
function voix(nom, { g = 1, pan = 0, vitesse = 1, dans = 0, boucle = false } = {}) {
  if (!getSfxEnabled()) return null;
  const t = D.tampons.get(nom);
  const S = t && sortie();
  if (!S || typeof t.getChannelData !== 'function') {
    if (!t) demander(nom);
    return null;
  }
  const { ctx } = S;
  const s = ctx.createBufferSource(), gn = ctx.createGain(), p = ctx.createStereoPanner();
  s.buffer = t; s.loop = boucle; s.playbackRate.value = vitesse;
  gn.gain.value = boucle ? 0 : g * niveau(nom) * getSfxVolume();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  s.connect(gn); gn.connect(p); p.connect(S.gain);
  retenirContexte();
  s.onended = () => {
    try { s.disconnect(); gn.disconnect(); p.disconnect(); } catch { /* déjà débranchés */ }
    relacherContexte();
  };
  s.start(ctx.currentTime + Math.max(0, dans));
  D.compte[nom] = (D.compte[nom] || 0) + 1;
  return { source: s, gain: gn, pan: p, ctx };
}
// Le son tout de suite s'il est prêt ; sinon dès qu'il l'est, s'il arrive à temps.
function jouer(nom, opts = {}, delaiMax = 0.6) {
  if (!getSfxEnabled()) return;
  if (D.tampons.has(nom)) { voix(nom, opts); return; }
  const t0 = horloge();
  demander(nom).then(() => { if ((horloge() - t0) / 1000 <= delaiMax) voix(nom, opts); });
}
const cibler = (param, v, ctx, tau) => { try { param.setTargetAtTime(v, ctx.currentTime, tau); } catch { param.value = v; } };

// ── Le grondement ───────────────────────────────────────────────────────────────
function grondement(k, tau = 0.25) {
  if (!D.grondement) {
    if (k <= 0) return;
    D.grondement = voix('grondement', { boucle: true });
    if (!D.grondement) return;
  }
  const v = D.grondement;
  cibler(v.gain.gain, Math.max(0, k) * niveau('grondement') * getSfxVolume(), v.ctx, tau);
}
function arreterGrondement(fondu = 0.6) {
  const v = D.grondement;
  if (!v) return;
  D.grondement = null;
  cibler(v.gain.gain, 0, v.ctx, fondu / 3);
  setTimeout(() => { try { v.source.stop(); } catch { /* déjà fini */ } }, fondu * 1000 + 100);
}

// ── La musique tenue basse (de la chute à l'aube) ───────────────────────────────
function tenirMusique() {
  if (D.musique) return;
  D.musique = true;
  holdMusicLow(true);
}
function rendreMusique(rampMs = 2400) {
  if (!D.musique) return;
  D.musique = false;
  holdMusicLow(false, rampMs);
}

// ── La chute ────────────────────────────────────────────────────────────────────
const PAS_MS = 40;
// Les gros effondrements de l'écran : les plus lourds, les plus au centre, jamais deux
// trop serrés. Le reste de la vague est dans le grondement et les gravats.
export function choisirEffondrements(chutes, court = false) {
  const ecart = court ? 110 : 220, max = court ? 5 : 12;
  const poidsMax = chutes.reduce((m, c) => Math.max(m, c.poids), 1);
  const rang = [...chutes].sort((a, b) => b.poids * (1 - 0.5 * Math.abs(b.pan)) - a.poids * (1 - 0.5 * Math.abs(a.pan)));
  const pris = [];
  for (const c of rang) {
    if (pris.length >= max) break;
    if (pris.some((p) => Math.abs(p.at - c.at) < ecart)) continue;
    pris.push({ at: c.at, pan: c.pan * 0.75, g: 0.6 + 0.4 * (c.poids / poidsMax), lourd: c.poids / poidsMax });
  }
  return pris.sort((a, b) => a.at - b.at);
}
// La densité des chutes au fil de la vague (0..1), par tranches de 100 ms, lissée.
export function densiteChutes(chutes) {
  if (!chutes.length) return [];
  const n = Math.ceil((chutes[chutes.length - 1].at + 200) / 100) + 1;
  const h = new Float32Array(Math.max(1, n));
  for (const c of chutes) { const i = Math.floor(c.at / 100); if (i >= 0 && i < h.length) h[i] += c.poids; }
  const l = new Float32Array(h.length);
  let m = 1e-9;
  for (let i = 0; i < h.length; i += 1) { l[i] = ((h[i - 1] || 0) + h[i] * 2 + (h[i + 1] || 0)) / 4; m = Math.max(m, l[i]); }
  return Array.from(l, (v) => v / m);
}

function debutChute() {
  if (!D.chute) {
    D.chute = { debut: horloge(), vague: false, prevus: [], dens: [], variante: 0, gravatsA: 0, apres: [], finA: null, jouee: null, minuteur: null };
    D.chute.minuteur = setInterval(pasChute, PAS_MS);
  }
  tenirMusique();
  preparer();
}
function vagueChute() {
  debutChute();
  const c = D.chute, sons = CHUTE.sons;
  c.vague = true;
  c.court = CHUTE.short;
  c.prevus = sons ? choisirEffondrements(sons.chutes, CHUTE.short) : [];
  c.dens = sons ? densiteChutes(sons.chutes) : [];
  c.matiere = matiereDe(sons ? sons.bande : D.bande);
  // Les gravats après la vague, dans la version complète : trois, épars, avant le noir.
  const T = chuteTune(), fin = chuteWaveEnd();
  c.apres = CHUTE.short ? [] : [0.15, 0.45, 0.8].map((q, i) => ({ at: fin + q * (T.nightAt + T.nightMs * 0.6), n: (i % 3) + 1 }));
  for (let v = 1; v <= 3; v += 1) demander(`effondrement-${c.matiere}-${v}`);
}
function finirChute() {
  const c = D.chute;
  if (!c) return;
  clearInterval(c.minuteur);
  D.chute = null;
  arreterGrondement(0.8);
}
// Un pas du chef d'orchestre : où en est la carte ?
function pasChute() {
  const c = D.chute;
  if (!c) return;
  const now = horloge();
  // Le filet : trois minutes après le début, ou vingt secondes après la fin annoncée,
  // la musique revient quoi qu'il arrive (une séquence cassée ne la laisse jamais basse).
  if (now - c.debut > 180000 || (c.finA != null && now - c.finA > 20000)) {
    rendreMusique();
    finirChute();
    return;
  }
  if (CHUTE.act === 'fall' && c.vague) {
    const ms = chuteMs(), T = chuteTune(), fin = chuteWaveEnd();
    // Le grondement : il monte au crépuscule, suit la densité de la vague, s'apaise
    // à la nuit, s'éteint dans le noir.
    let k;
    if (ms < T.waveStart) k = 0.3 + 0.3 * (ms / Math.max(1, T.waveStart));
    else if (ms < fin) k = 0.55 + 0.45 * (c.dens[Math.floor(ms / 100)] || 0);
    else k = 0.55 * Math.max(0, 1 - (ms - fin) / Math.max(400, T.nightAt + T.nightMs + T.fadeAt));
    grondement(k * (1 - CHUTE.fade), 0.2);
    // Les gros effondrements, à leur instant. Un saut (clic, Échap) ne les joue pas
    // tous d'un coup : ceux qu'il a passés se taisent.
    while (c.prevus.length && c.prevus[0].at <= ms) {
      const e = c.prevus.shift();
      if (ms - e.at > 250) continue;
      c.variante = (c.variante % 3) + 1;
      voix(`effondrement-${c.matiere}-${c.variante}`, { g: e.g, pan: e.pan, vitesse: 1.05 - 0.1 * e.lourd + (Math.random() - 0.5) * 0.06 });
    }
    // Des gravats entre eux, d'autant plus que la vague est dense.
    if (ms >= T.waveStart && ms < fin) {
      const taux = (c.court ? 6 : 3) * (c.dens[Math.floor(ms / 100)] || 0);
      if (Math.random() < 1 - Math.exp(-taux * PAS_MS / 1000) && now - c.gravatsA > 160) {
        c.gravatsA = now;
        voix(`gravats-${1 + Math.floor(Math.random() * 3)}`, { g: 0.55, pan: (Math.random() * 2 - 1) * 0.7, vitesse: 0.9 + Math.random() * 0.2 });
      }
    }
    while (c.apres.length && c.apres[0].at <= ms) {
      const e = c.apres.shift();
      if (ms - e.at < 400) voix(`gravats-${e.n}`, { g: 0.7, pan: (Math.random() * 2 - 1) * 0.5 });
    }
    return;
  }
  if (CHUTE.act === 'rise') {
    // Le noir est passé : plus de grondement. L'aube du cycle suivant : la musique
    // revient avec la lumière.
    arreterGrondement(0.8);
    if (CHUTE.t0 !== Infinity) {
      const T = chuteTune(), aube = T.riseBlackMs + T.riseFadeMs + T.riseNightMs;
      if (chuteMs() >= aube) { rendreMusique(T.riseDawnMs + 600); finirChute(); }
    }
    return;
  }
  if (!c.vague && c.jouee == null && c.finA == null) {
    // La chute est annoncée, la carte ne la joue pas encore (elle se monte, une à deux
    // secondes) : le grondement de la main qui tenait le bouton tient, ou monte doucement.
    grondement(Math.min(0.45, 0.25 + (now - c.debut) / 4000), 0.4);
    return;
  }
  // La carte ne la joue pas, ou plus : plus de grondement. La musique revient deux
  // secondes et demie après la fin annoncée.
  arreterGrondement(0.8);
  if (c.finA != null && now - c.finA > 2500) { rendreMusique(); finirChute(); }
}

// Le glas : trois coups, au deuil.
function glas() {
  for (const [dans, g] of [[0, 1], [2.6, 0.85], [5.2, 0.7]]) jouer('glas', { g, dans, vitesse: 1 }, 1.5);
}

// ── Les annonces ────────────────────────────────────────────────────────────────
function surAnnonce(nom, d) {
  const now = horloge();
  switch (nom) {
    case 'chute:tenir':
      D.tenue = true;
      preparer();
      grondement(0.3, 0.45);
      break;
    case 'chute:lacher':
      D.tenue = false;
      // La main lâchée sans chute (le bouton relâché trop tôt) : le grondement se tait.
      // Une chute qui commence dans la foulée le garde (collapse, juste après).
      setTimeout(() => { if (!D.tenue && !D.chute) arreterGrondement(0.4); }, 120);
      break;
    case 'chute:debut':
      debutChute();
      if (D.chute) D.chute.jouee = null;
      break;
    case 'chute:vague':
      vagueChute();
      break;
    case 'chute:deuil':
      if (D.chute) D.chute.jouee = Boolean(d && d.jouee);
      // Sans carte pour la jouer : le grondement s'éteint sous le glas.
      if (!(d && d.jouee)) arreterGrondement(1.5);
      glas();
      break;
    case 'chute:fin':
      if (!D.chute) break;
      D.chute.finA = now;
      // Sans lever sur la carte, la musique revient tout de suite.
      if (!(d && d.jouee)) { rendreMusique(); finirChute(); }
      break;
    case 'achat':
      D.dernierAchat = now;
      break;
    case 'achats':
      D.rafale = { a: now, n: (d && d.n) || 2 };
      break;
    case 'batiment':
      maisonQuiSort(d || {}, now);
      break;
    case 'sceau':
      duckMusic(5500);
      jouer('sceau', {}, 0.4);
      break;
    case 'renouveau':
      jouer('renouveau', { dans: 0.3 }, 0.6);
      break;
    default:
      break;
  }
}

// Une maison sort de terre : seulement si la main vient d'acheter.
function maisonQuiSort({ sx = 0, cw = 1, vu = false, bande = D.bande }, now) {
  const rafale = D.rafale && now - D.rafale.a < 1500 ? D.rafale : null;
  if (!rafale && now - D.dernierAchat > 1500) return;
  if (now - D.dernierBat < 90) return;
  D.dernierBat = now;
  const m = matiereDe(bande);
  const pan = vu ? Math.max(-0.8, Math.min(0.8, (sx / Math.max(1, cw)) * 2 - 1)) : 0;
  const g = vu ? 1 : 0.6;
  if (rafale) {
    // Un achat de masse : une courte rafale, plus fournie pour un gros programme.
    D.rafale = null;
    const coups = Math.min(5, 2 + Math.floor(Math.log2(Math.max(1, rafale.n))));
    for (let i = 0; i < coups; i += 1) {
      voix(`batiment-${m}-${1 + (i % 2)}`, { g: g * (1 - 0.12 * i), pan: pan + (Math.random() - 0.5) * 0.5, dans: i * (0.07 + Math.random() * 0.05), vitesse: 0.94 + Math.random() * 0.12 });
    }
    return;
  }
  voix(`batiment-${m}-${1 + Math.floor(Math.random() * 2)}`, { g, pan, vitesse: 0.95 + Math.random() * 0.1 });
}

// ── Un nouvel âge (App.jsx, le bandeau) ─────────────────────────────────────────
export function sonNouvelAge({ bande = 0, epoque = false } = {}) {
  if (!getSfxEnabled() || rattrapageRecent(6000)) return;
  if (typeof document !== 'undefined' && document.hidden) return;
  const now = horloge();
  if (now - D.dernierAge < 1500) return;      // deux âges d'affilée : un seul son
  D.dernierAge = now;
  const b = Math.max(0, Math.min(9, bande | 0));
  if (epoque) duckMusic(3500);
  jouer(epoque ? `epoque-${b}` : `age-${b}`, {}, 0.5);
}
// La bande de la partie (App.jsx, à chaque âge) : les sons de sa matière se préparent.
export function suivreBande(bande) {
  const b = Math.max(0, Math.min(9, bande | 0));
  if (b === D.bande && D.arme) return;
  D.bande = b;
  if (D.arme && !D.prepa) preparer();
}

// ── Armer, désarmer (App.jsx) ───────────────────────────────────────────────────
export function armerMoments(bande = D.bande) {
  D.bande = Math.max(0, Math.min(9, bande | 0));
  if (D.arme) return desarmerMoments;
  D.arme = true;
  D.desabonner = surMoment(surAnnonce);
  // Les sons se préparent une fois la partie lancée, sans gêner le démarrage.
  D.prepa = setTimeout(() => { D.prepa = null; preparer(); }, 8000);
  return desarmerMoments;
}
export function desarmerMoments() {
  if (!D.arme) return;
  D.arme = false;
  if (D.desabonner) D.desabonner();
  D.desabonner = null;
  clearTimeout(D.prepa);
  D.prepa = null;
  finirChute();
  rendreMusique();
}

// Ce que les moments font (banc d'écoute, vérifications).
export function etatMoments() {
  return {
    arme: D.arme, bande: D.bande, tampons: [...D.tampons.keys()], enRoute: D.enRoute.size,
    chute: D.chute ? { vague: D.chute.vague, prevus: D.chute.prevus.length, matiere: D.chute.matiere } : null,
    grondement: Boolean(D.grondement), musiqueTenue: D.musique, compte: { ...D.compte },
    sortieDb: niveauSortie(),
  };
}

// ── Le banc d'écoute (Ctrl+Alt+B, la section « Grands moments ») ───────────────
function ecouterMoment(fam) {
  const b = D.bande, m = matiereDe(b);
  const nom = {
    grondement: 'grondement', effondrement: `effondrement-${m}-${1 + Math.floor(Math.random() * 3)}`,
    gravats: `gravats-${1 + Math.floor(Math.random() * 3)}`, glas: 'glas', age: `age-${b}`,
    epoque: `epoque-${Math.min(9, b + 1)}`, batiment: `batiment-${m}-${1 + Math.floor(Math.random() * 2)}`,
    sceau: 'sceau', renouveau: 'renouveau',
  }[fam];
  if (!nom) return;
  if (nom === 'grondement') {
    demander(nom).then(() => {
      grondement(0.7, 0.3);
      setTimeout(() => { if (!D.chute && !D.tenue) arreterGrondement(0.8); }, 3000);
    });
    return;
  }
  jouer(nom, {}, 2);
}
function retenirBancMoments() {
  try { localStorage.setItem(CLE_BANC, JSON.stringify(BANC_MOMENTS)); } catch { /* stockage indisponible */ }
}
enregistrerBancMoments({
  familles: Object.keys(NIVEAUX), BANC: BANC_MOMENTS, ecouter: ecouterMoment, retenir: retenirBancMoments,
  reglages: () => ({ ...BANC_MOMENTS }),
});

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__moments = {
    etat: etatMoments, ecouter: ecouterMoment, annoncer, NIVEAUX, BANC: BANC_MOMENTS, SONS: SONS_MOMENTS,
    jouer: (nom, opts) => jouer(nom, opts, 2),
  };
}
