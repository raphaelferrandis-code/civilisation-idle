// LA PETITE BIBLIOTHÈQUE DE SON DU JEU — tout est JOUÉ PAR LE CODE (le jeu n'a pas de
// banque de sons) : chaque instrument AJOUTE sa note dans un Float32Array, à `t`
// secondes. Sortie de melodieScene.js le 2026-10-03 pour servir aussi la machine à sous
// (slotsSound.js). Pur, sauf `audioCtx` / `enTampon` / `jouerTampon` (la lecture,
// navigateur seul).

const NOTES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function hz(nom, oct = 0) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(nom);
  const midi = 12 * (Number(m[3]) + 1 + oct) + NOTES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

// PRNG mulberry32 — même algorithme que seededRng (core/utils.js), recopié
// VOLONTAIREMENT : utils.js importe l'état du jeu, et cette bibliothèque reste pure.
export function graine(n) {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Les instruments : chacun AJOUTE sa note dans `out` (Float32Array), à `t` secondes.

// Corde pincée (Karplus-Strong) : un bruit qui tourne dans une boucle de la longueur
// d'une période et s'adoucit à chaque tour. `clair` : brillance de l'attaque,
// `tenue` : perte par tour (plus près de 1, plus la corde sonne longtemps).
export function corde(out, sr, t, f, dur, g, rnd, { clair = 0.5, tenue = 0.996, queue = 0.6 } = {}) {
  const s0 = Math.round(t * sr);
  const n = Math.min(out.length - s0, Math.round((dur + queue) * sr));
  if (n <= 0) return;
  // ⚠ L'ACCORD. La boucle sonne à sr / (N − ½) — on réécrit la moyenne d'un
  // échantillon et du SUIVANT —, et N est entier : jusqu'à un sixième de demi-ton
  // faux dans l'aigu. Un passe-tout ajoute la fraction qui manque (mesuré : la, do,
  // mi justes au dixième de hertz).
  const P = sr / f;
  const N = Math.max(2, Math.floor(P + 0.4));
  const frac = P + 0.5 - N;
  const C = (1 - frac) / (1 + frac);
  let apx = 0, apy = 0;
  const buf = new Float32Array(N);
  let p = 0, moy = 0;
  for (let k = 0; k < N; k++) { p += clair * ((rnd() * 2 - 1) - p); buf[k] = p; moy += p; }
  moy /= N;
  let crete = 1e-6;
  for (let k = 0; k < N; k++) { buf[k] -= moy; crete = Math.max(crete, Math.abs(buf[k])); }
  for (let k = 0; k < N; k++) buf[k] /= crete;
  const finNote = Math.round(dur * sr), fondu = Math.round(0.04 * sr);
  let i0 = 0;
  for (let i = 0; i < n; i++) {
    const i1 = i0 + 1 === N ? 0 : i0 + 1;
    const y = buf[i0];
    // Note relâchée : la corde est étouffée (on la laisse vibrer un peu, pas à vide).
    const moyenne = 0.5 * (y + buf[i1]);
    const ap = C * moyenne + apx - C * apy;
    apx = moyenne; apy = ap;
    buf[i0] = (i < finNote ? tenue : tenue * 0.985) * ap;
    const fe = i > n - fondu ? (n - i) / fondu : 1;
    out[s0 + i] += y * g * fe;
    i0 = i1;
  }
}

// Somme de partiels sinusoïdaux, chacun avec son amortissement (en 1/s) — tournés
// par rotation de phase (deux produits par échantillon, pas de Math.sin).
export function partiels(out, sr, t, liste, dur, g, { attaque = 0.004, relache = 0.12, etouffe = 10, mod = null } = {}) {
  const s0 = Math.round(t * sr);
  const n = Math.min(out.length - s0, Math.round((dur + relache + 0.6) * sr));
  if (n <= 0) return;
  const P = liste.length;
  const c = new Float64Array(P), s = new Float64Array(P), cw = new Float64Array(P), sw = new Float64Array(P), a = new Float64Array(P), d = new Float64Array(P);
  for (let k = 0; k < P; k++) {
    const w = (2 * Math.PI * liste[k].f) / sr;
    c[k] = 1; s[k] = 0; cw[k] = Math.cos(w); sw[k] = Math.sin(w);
    a[k] = liste[k].a; d[k] = Math.exp(-liste[k].d / sr);
  }
  const nA = Math.max(1, Math.round(attaque * sr)), finNote = Math.round(dur * sr);
  const dEt = Math.exp(-etouffe / sr);
  let et = 1;
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let k = 0; k < P; k++) {
      const nc = c[k] * cw[k] - s[k] * sw[k];
      s[k] = c[k] * sw[k] + s[k] * cw[k];
      c[k] = nc;
      v += s[k] * a[k];
      a[k] *= d[k];
    }
    if (i > finNote) et *= dEt;
    const att = i < nA ? i / nA : 1;
    const m = mod ? mod(i / sr) : 1;
    out[s0 + i] += v * g * att * et * m;
  }
}

// Piano : partiels légèrement inharmoniques (la raideur de la corde), les aigus
// meurent vite, un coup de marteau. `desaccord` : la seconde corde, faussée exprès
// pour le piano de bastringue.
export function piano(out, sr, t, f, dur, g, rnd, { desaccord = 0, clair = 1 } = {}) {
  const B = 0.00035, liste = [];
  for (let k = 1; k <= 7; k++) {
    const fk = k * f * Math.sqrt(1 + B * k * k);
    if (fk > sr / 2.2) break;
    const a = (k === 1 ? 1 : 0.55 / k ** 0.9) * (k > 2 ? clair : 1);
    liste.push({ f: fk, a, d: 0.7 + 0.55 * k });
    if (desaccord) liste.push({ f: fk * (1 + desaccord), a: a * 0.8, d: 0.7 + 0.55 * k });
  }
  partiels(out, sr, t, liste, dur, g * (desaccord ? 0.6 : 1), { attaque: 0.003, etouffe: 9 });
  const s0 = Math.round(t * sr), nM = Math.round(0.012 * sr);
  for (let i = 0; i < nM && s0 + i < out.length; i++) out[s0 + i] += (rnd() * 2 - 1) * g * 0.18 * (1 - i / nM);
}

// Vibraphone : la lame (fondamentale + 4e partiel) et le trémolo du moteur.
export function vibra(out, sr, t, f, dur, g) {
  partiels(out, sr, t, [{ f, a: 1, d: 1.1 }, { f: f * 4, a: 0.22, d: 5 }, { f: f * 9.8, a: 0.04, d: 12 }], dur, g,
    { attaque: 0.002, etouffe: 3, mod: (tt) => 1 + 0.28 * Math.sin(2 * Math.PI * 5.5 * tt) });
}

// Cloche (modulation de fréquence) : `ratio` donne le métal — jade, astre, cristal.
export function cloche(out, sr, t, f, dur, g, { ratio = 1.4, indice = 3, tenue = 1.4 } = {}) {
  const s0 = Math.round(t * sr), n = Math.min(out.length - s0, Math.round((dur + 2) * sr));
  const w = (2 * Math.PI * f) / sr, wm = w * ratio;
  for (let i = 0; i < n; i++) {
    const tt = i / sr;
    const I = indice * Math.exp(-tt * 3);
    const a = Math.exp(-tt * tenue) * Math.min(1, i / (0.002 * sr));
    out[s0 + i] += Math.sin(w * i + I * Math.sin(wm * i)) * a * g;
  }
}

// Flûte d'os : le souffle (bruit filtré, plus fort à l'attaque) et un vibrato qui
// arrive après la prise de son.
export function flute(out, sr, t, f, dur, g, rnd) {
  const s0 = Math.round(t * sr), rel = 0.09, n = Math.min(out.length - s0, Math.round((dur + rel) * sr));
  let ph = 0, souffle = 0;
  const fin = Math.round(dur * sr);
  for (let i = 0; i < n; i++) {
    const tt = i / sr;
    const vib = tt > 0.14 ? 1 + 0.007 * Math.sin(2 * Math.PI * 5 * (tt - 0.14)) : 1;
    ph += (2 * Math.PI * f * vib) / sr;
    souffle += 0.12 * ((rnd() * 2 - 1) - souffle);
    const a = Math.min(1, tt / 0.045) * (i > fin ? Math.max(0, 1 - (i - fin) / (rel * sr)) : 1);
    const bruit = souffle * (0.5 + 1.6 * Math.exp(-tt * 18));
    out[s0 + i] += (Math.sin(ph) + 0.2 * Math.sin(2 * ph) + 0.06 * Math.sin(3 * ph) + bruit) * a * g;
  }
}

// Tambour sur cadre / tambourin : la peau (hauteur qui tombe) et la frappe.
export function tambour(out, sr, t, g, rnd, { haut = 150, bas = 62, sec = 7, frappe = 0.4 } = {}) {
  const s0 = Math.round(t * sr), n = Math.min(out.length - s0, Math.round(0.6 * sr));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / sr;
    ph += (2 * Math.PI * (bas + (haut - bas) * Math.exp(-tt * 28))) / sr;
    out[s0 + i] += (Math.sin(ph) * Math.exp(-tt * sec) + (rnd() * 2 - 1) * frappe * Math.exp(-tt * 70)) * g;
  }
}

// Balais sur la caisse claire (le néon) : un bruit doux, qui traîne.
export function balai(out, sr, t, g, rnd) {
  const s0 = Math.round(t * sr), n = Math.min(out.length - s0, Math.round(0.25 * sr));
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / sr;
    lp += 0.35 * ((rnd() * 2 - 1) - lp);
    out[s0 + i] += ((rnd() * 2 - 1) - lp) * g * Math.exp(-tt * 14) * Math.min(1, tt / 0.01);
  }
}

// Nappe (les âges cosmiques) et bourdon (la couronne) : des sinus tenus, désaccordés.
export function nappe(out, sr, t, freqs, dur, g, { attaque = 0.45, relache = 0.7, brille = 0 } = {}) {
  const liste = [];
  for (const f of freqs) {
    liste.push({ f, a: 1, d: 0 }, { f: f * 1.004, a: 0.6, d: 0 }, { f: f * 0.997, a: 0.5, d: 0 });
    if (brille) liste.push({ f: f * 2, a: brille, d: 0 });
  }
  partiels(out, sr, t, liste, dur, g / freqs.length, { attaque, etouffe: 1 / relache * 3, relache });
}

// Écho de salle (Schroeder) : quatre peignes amortis, deux passe-tout. `piece` :
// la taille de la salle (0 à 1), `mouille` : la part de réverbération.
export function salle(sec, sr, piece, mouille) {
  if (mouille <= 0) return sec;
  const k = sr / 44100;
  const out = new Float32Array(sec.length);
  const fb = 0.7 + 0.26 * piece, amort = 0.25;
  for (const L0 of [1557, 1617, 1491, 1422]) {
    const L = Math.round(L0 * k * (0.8 + 0.5 * piece));
    const b = new Float32Array(L);
    let j = 0, lp = 0;
    for (let i = 0; i < sec.length; i++) {
      const y = b[j];
      lp = y * (1 - amort) + lp * amort;
      // Entrée ramenée à (1 − fb) : un peigne qui reboucle à 0,96 amplifie ×25 — sans
      // ça l'écho des grandes salles (grotte, pierre, cosmos) noyait l'air.
      b[j] = sec[i] * (1 - fb) * 2.2 + lp * fb;
      out[i] += y * 0.25;
      j = j + 1 === L ? 0 : j + 1;
    }
  }
  for (const L0 of [556, 225]) {
    const L = Math.round(L0 * k);
    const b = new Float32Array(L);
    let j = 0;
    for (let i = 0; i < out.length; i++) {
      const bv = b[j], x = out[i];
      const y = -x + bv;
      b[j] = x + bv * 0.5;
      out[i] = y;
      j = j + 1 === L ? 0 : j + 1;
    }
  }
  const res = new Float32Array(sec.length);
  for (let i = 0; i < sec.length; i++) res[i] = sec[i] * (1 - mouille * 0.5) + out[i] * mouille;
  return res;
}

// Ramène la crête à `crete` et pose un fondu de sortie (`fondu` secondes) : jamais d'écrêtage,
// jamais de clic de fin.
export function normaliser(buf, sr, crete = 0.8, fondu = 0.03) {
  let m = 1e-6;
  for (let i = 0; i < buf.length; i += 1) m = Math.max(m, Math.abs(buf[i]));
  const k = crete / m, n = Math.max(1, Math.round(fondu * sr));
  for (let i = 0; i < buf.length; i += 1) buf[i] *= k * (i > buf.length - n ? (buf.length - i) / n : 1);
  return buf;
}

// ── La lecture (navigateur) : UN contexte audio pour tout le jeu.
// Il DORT quand rien ne joue (audit du 2026-10-05, MEM-10) : un contexte « running »
// rend du silence sur le fil audio des heures durant, une fois la machine ou une
// mélodie entendue. Suspendu après REPOS_MS sans aucun son ; le son suivant le réveille
// (audioCtx). `_endormi` : suspend() demandé — l'état ne passe à « suspended » qu'à la
// résolution, un son lancé entre les deux doit quand même relancer le contexte.
export const REPOS_MS = 30000;
let _ctx = null, _actifs = 0, _repos = null, _endormi = false;
function endormir() {
  clearTimeout(_repos);
  _repos = setTimeout(() => {
    _repos = null;
    if (_actifs || !_ctx || _ctx.state !== 'running') return;
    _endormi = true;
    _ctx.suspend().catch(() => {});
  }, REPOS_MS);
}
export function audioCtx() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!_ctx) _ctx = new AC();
  if (_endormi || _ctx.state === 'suspended') { _endormi = false; _ctx.resume().catch(() => {}); }
  if (!_actifs) endormir();             // réveillé pour rien : il se rendort
  return _ctx;
}
// Un son qui part : le contexte reste éveillé jusqu'à sa fin. À la fin, ses nœuds sont
// débranchés (ils ne pendent plus au graphe) et, plus rien ne jouant, le repos s'arme.
function suivre(s, g) {
  _actifs += 1;
  clearTimeout(_repos);
  _repos = null;
  s.onended = () => {
    try { s.disconnect(); g.disconnect(); } catch { /* déjà débranchés */ }
    _actifs = Math.max(0, _actifs - 1);
    if (!_actifs) endormir();
  };
}
// Un tampon prêt pour la lecture : l'AudioBuffer se crée UNE fois — il ne dépend
// d'aucun contexte — au lieu d'un createBuffer + copie à chaque son (MEM-10). Les
// caches de sons gardent CE tampon, plus le Float32Array. Hors navigateur (tests),
// le Float32Array tel quel.
export function enTampon(data, sr) {
  if (!data || !data.length || typeof AudioBuffer === 'undefined') return data;
  try {
    const buf = new AudioBuffer({ numberOfChannels: 1, length: data.length, sampleRate: sr });
    buf.copyToChannel(data, 0);
    return buf;
  } catch {
    return data;
  }
}
// Joue un tampon (AudioBuffer d'`enTampon`, ou Float32Array à `sr`) au volume `vol`.
// Rend { stop, gain } ou null.
export function jouerTampon(data, sr, vol = 1, { loop = false } = {}) {
  const ctx = audioCtx();
  if (!ctx || !data || !data.length) return null;
  let buf = data;
  if (typeof data.getChannelData !== 'function') {
    buf = ctx.createBuffer(1, data.length, sr);
    buf.copyToChannel(data, 0);
  }
  const s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = buf;
  s.loop = loop;
  g.gain.value = vol;
  s.connect(g).connect(ctx.destination);
  suivre(s, g);
  s.start();
  return { stop: () => { try { s.stop(); } catch { /* déjà finie */ } }, gain: g, ctx };
}
