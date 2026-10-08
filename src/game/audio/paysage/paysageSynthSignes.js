// LES SONS DES SIGNES (docs/PLAN-ECOUTER-PARLER.md, lot 8) — la SYNTHÈSE, pure, à graine
// fixe, rendue dans le Worker des sons comme les autres sons du paysage (paysageSynth.js
// la consulte pour les noms qu'il ne connaît pas). Quel son pour quel signe, à quel âge :
// sonsSignes.js. La bête, elle, crie avec les enregistrements du paysage.
//
//   · signe-vent-<monde>-<v>   la rafale qui passe sur lui (iso/isoSignes.js, WIND_SIGN : les
//       feuilles le croisent vers la première seconde, tout est passé à 2,5 s), et ce
//       qu'elle secoue, selon le monde (Raph, 2026-10-08 : « par monde ») :
//         camp    les feuilles sèches qui roulent au sol (le Feu, le Bois) ;
//         ville   le linge qui claque sur sa corde, un volet qui cogne (de la Pierre au Marbre) ;
//         fonte   les câbles qui sifflent (la Fonte, le Néon) ;
//         cosmos  un souffle sourd, rien à secouer (les âges cosmiques) ;
//   · signe-lumiere-<v>   « un petit "aaah" de chœur angélique » (Raph, 2026-10-08) : un
//       accord de quatre voix sur la voyelle a, trois chanteurs par voix, un peu
//       désaccordés, chacun avec son vibrato ; il enfle avec le rayon et se tait avant
//       lui (le rayon tient 2,6 s), dans une grande salle ;
//   · signe-feu-<monde>-<v>   le feu qui monte (flameGlow.js, FIRE_BOOST : en 0,3 s,
//       retombé à 4 s) : la flamme qui s'élève d'un coup et lèche, puis ce qu'elle mange :
//         bois      des brindilles qui crépitent (le Feu, le Bois) ;
//         brasero   les braises qui chuintent, quelques éclats (de la Pierre au Marbre) ;
//         fourneau  le fourneau sous le soufflet, qui gronde (la Fonte, le Néon).
//
// Deux variantes de chaque : le même geste, refait, ne sonne pas deux fois pareil.

import { graine, salle, normaliser } from '../synth.js';
import { modes, frappe, MODES } from '../moments/momentsSynth.js';

// ── Petits outils (comme paysageSynth.js) ───────────────────────────────────────
// Filtre biquad (R. Bristow-Johnson) : passe-bas, passe-haut, ou passe-bande à 0 dB au
// centre. `regler` change sa fréquence sans vider sa mémoire (un sifflement qui glisse).
function regler(F, type, f, Q, sr) {
  const w0 = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
  const c = Math.cos(w0), al = Math.sin(w0) / (2 * Q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al;
  F.b0 = b0 / a0; F.b1 = b1 / a0; F.b2 = b2 / a0; F.a1 = (-2 * c) / a0; F.a2 = (1 - al) / a0;
  return F;
}
const biquad = (type, f, Q, sr) => regler({ x1: 0, x2: 0, y1: 0, y2: 0 }, type, f, Q, sr);
function bq(F, x) {
  const y = F.b0 * x + F.b1 * F.x1 + F.b2 * F.x2 - F.a1 * F.y1 - F.a2 * F.y2;
  F.x2 = F.x1; F.x1 = x; F.y2 = F.y1; F.y1 = y;
  return y;
}
// Bruit ROSE (filtre de Kellet) : la couleur du vent et de la flamme.
function rose(rnd) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  return () => {
    const w = rnd() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const o = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    return o * 0.11;
  };
}
// Ramène l'énergie (RMS) à `rms`, sans laisser la crête dépasser `crete`.
function auNiveau(buf, rms = 0.12, crete = 0.95) {
  let e = 0, m = 1e-9;
  for (let i = 0; i < buf.length; i += 1) { const v = buf[i]; e += v * v; if (Math.abs(v) > m) m = Math.abs(v); }
  const r = Math.sqrt(e / Math.max(1, buf.length));
  let k = rms / Math.max(r, 1e-9);
  if (m * k > crete) k = crete / m;
  for (let i = 0; i < buf.length; i += 1) buf[i] *= k;
  return buf;
}
// Ramène la crête à `crete` (une couche clairsemée se dose par ses crêtes, pas par son énergie).
function aCrete(buf, crete = 1) {
  let m = 1e-9;
  for (let i = 0; i < buf.length; i += 1) if (Math.abs(buf[i]) > m) m = Math.abs(buf[i]);
  for (let i = 0; i < buf.length; i += 1) buf[i] *= crete / m;
  return buf;
}
// Mélange de couches déjà au niveau : out = Σ gain · couche, sans ce qui est sous `grave` Hz.
function melanger(n, couches, grave = 0, sr = 32000) {
  const out = new Float32Array(n);
  for (const [c, g] of couches) for (let i = 0; i < n; i += 1) out[i] += c[i] * g;
  if (grave > 0) {
    const A = biquad('hp', grave, 0.7, sr), B = biquad('hp', grave, 0.7, sr);
    for (let i = 0; i < n; i += 1) out[i] = bq(B, bq(A, out[i]));
  }
  return out;
}
const lisse = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
// Une fluctuation lente entre −1 et 1 : une valeur tirée tous les 1/`hz` s, reliées en
// douceur. Lue `sr` fois par seconde.
function remous(rnd, hz, sr) {
  const pas = Math.max(1, Math.round(sr / hz));
  let a = rnd() * 2 - 1, b = rnd() * 2 - 1, i = 0;
  return () => {
    if (i >= pas) { i = 0; a = b; b = rnd() * 2 - 1; }
    const v = a + (b - a) * lisse(i / pas);
    i += 1;
    return v;
  };
}

// ── Le vent ────────────────────────────────────────────────────────────────────
// La rafale : elle monte en `monte` s (elle arrive sur lui), puis s'en va jusqu'à `fin` s.
function rafale(t, monte, fin) {
  if (t <= 0 || t >= fin) return 0;
  return t < monte ? lisse(t / monte) : Math.pow(1 - lisse((t - monte) / (fin - monte)), 1.3);
}
// Par monde : la rafale (montée, fin, en s), la coupure de son corps (Hz, de l'accalmie au
// plus fort), la part d'air aigu.
// `grave` : sous cette fréquence, rien (un haut-parleur de portable ne la rend pas, et elle
// mangerait la crête du son pour rien).
const VENT = {
  camp: { graine: 0x5e1c0a, monte: 0.9, fin: 2.5, fBas: 220, fHaut: 1900, air: 0.2, grave: 100 },
  ville: { graine: 0x5e1c0b, monte: 0.95, fin: 2.5, fBas: 200, fHaut: 1700, air: 0.17, grave: 100 },
  fonte: { graine: 0x5e1c0c, monte: 0.85, fin: 2.6, fBas: 240, fHaut: 2000, air: 0.22, grave: 100 },
  cosmos: { graine: 0x5e1c0d, monte: 1.15, fin: 2.8, fBas: 150, fHaut: 900, air: 0, grave: 70 },
};

// Les feuilles sèches qui roulent au sol : des craquements d'une milliseconde, par
// grappes (une feuille qui roule craque plusieurs fois de suite), et leur froissement.
function feuilles(env, sr, rnd) {
  const n = env.length, out = new Float32Array(n);
  const bpA = biquad('bp', 3400, 0.9, sr), bpB = biquad('bp', 1900, 1.1, sr), hp = biquad('hp', 900, 0.7, sr);
  const grappe = remous(rnd, 9, sr), amort = Math.exp(-1 / (0.0011 * sr));
  let clic = 0;
  for (let i = 0; i < n; i += 1) {
    const g = env[i], gr = Math.max(0, grappe());
    if (rnd() < (110 * g * g * gr) / sr) clic = 0.35 + 0.65 * rnd();
    const w = rnd() * 2 - 1;
    out[i] = bq(hp, bq(bpA, clic * w) + 0.22 * bq(bpB, w) * g * (0.4 + 0.6 * gr));
    clic *= amort;
  }
  return out;
}
// Le linge qui claque sur sa corde : des claques sèches, d'autant plus serrées que la
// rafale est forte (de 5 à 12 par seconde), seulement quand elle souffle fort.
function linge(env, sr, rnd) {
  const n = env.length, out = new Float32Array(n);
  const bp = biquad('bp', 620, 0.8, sr), bpH = biquad('bp', 1800, 1.3, sr);
  const amort = Math.exp(-1 / (0.035 * sr));
  let ph = 0, e = 0, pas = 1;
  for (let i = 0; i < n; i += 1) {
    const g = env[i];
    ph += ((5 + 7 * g) * pas) / sr;
    if (ph >= 1) {
      ph -= 1; pas = 0.8 + 0.4 * rnd();
      if (g > 0.3) e = Math.max(e, ((g - 0.3) / 0.7) * (0.55 + 0.45 * rnd()));
    }
    const w = rnd() * 2 - 1;
    out[i] = (bq(bp, w) + 0.45 * bq(bpH, w)) * e;
    e *= amort;
  }
  return out;
}
// Un volet qui cogne contre le mur, et rebondit.
function volet(n, sr, rnd, t) {
  const out = new Float32Array(n);
  const f = 150 + 30 * rnd();
  for (const [dt, g] of [[0, 1], [0.21, 0.4]]) {
    frappe(out, sr, t + dt, 0.35 * g, rnd, 0.004);
    modes(out, sr, t + dt, f, MODES.BOIS, g, { duree: 0.5 });
  }
  return aCrete(out);
}
// Les câbles qui sifflent : deux tons de vent (un bruit dans un filtre très étroit), dont
// la hauteur suit la force de la rafale, comme un fil tendu.
function cables(env, sr, rnd) {
  const n = env.length, out = new Float32Array(n);
  const f1 = 540 + 90 * rnd(), f2 = f1 * (1.31 + 0.1 * rnd());
  const A = biquad('bp', f1, 40, sr), B = biquad('bp', f2, 55, sr);
  for (let i = 0; i < n; i += 1) {
    const g = env[i];
    if ((i & 63) === 0) {
      const k = 0.8 + 0.4 * Math.min(1.2, g);
      regler(A, 'bp', f1 * k, 40, sr); regler(B, 'bp', f2 * k, 55, sr);
    }
    const w = rnd() * 2 - 1;
    out[i] = (bq(A, w) + 0.55 * bq(B, w)) * g * g;
  }
  return out;
}
// Un souffle sourd : le corps d'une respiration, dans le grave.
function souffleSourd(env, sr, rnd) {
  const n = env.length, out = new Float32Array(n);
  const bruit = rose(rnd), A = biquad('bp', 420, 1.2, sr), B = biquad('lp', 300, 0.7, sr);
  for (let i = 0; i < n; i += 1) {
    const x = bruit();
    out[i] = (bq(A, x) * 0.8 + bq(B, x) * 0.6) * env[i];
  }
  return out;
}

// La rafale : un bruit rose dans un passe-bas à deux pôles qui s'ouvre quand elle forcit
// (comme le corps du vent, paysageSynth.js), un souffle d'air aigu au plus fort, et ce
// qu'elle secoue.
function rendreVent(monde, v, sr) {
  const P = VENT[monde], rnd = graine(P.graine + 0x9e3 * v);
  const monte = P.monte * (v === 2 ? 1.15 : 1), fin = P.fin * (v === 2 ? 1.08 : 1);
  const n = Math.round((fin + 0.3) * sr);
  const bruit = rose(rnd), trouble = remous(rnd, 6, sr / 32), air = biquad('hp', 1800, 0.7, sr);
  const env = new Float32Array(n), corps = new Float32Array(n), sifflet = new Float32Array(n);
  let l1 = 0, l2 = 0, hp = 0, g = 0, a = 0;
  for (let i = 0; i < n; i += 1) {
    if ((i & 31) === 0) {
      // La rafale n'est pas lisse : elle se reprend (±20 %).
      g = Math.max(0, rafale(i / sr, monte, fin) * (1 + 0.2 * trouble()));
      a = 1 - Math.exp((-2 * Math.PI * (P.fBas + (P.fHaut - P.fBas) * Math.min(1, g))) / sr);
    }
    env[i] = g;
    const x = bruit();
    l1 += a * (x - l1); l2 += a * (l1 - l2);
    hp += 0.004 * (l2 - hp);                      // ni continu ni infrasons
    corps[i] = (l2 - hp) * g;
    sifflet[i] = bq(air, x) * g * g;
  }
  auNiveau(corps, 1, 1e9); auNiveau(sifflet, 1, 1e9);
  const couches = [[corps, 1], [sifflet, P.air]];
  if (monde === 'camp') couches.push([auNiveau(feuilles(env, sr, rnd), 1, 1e9), 0.5]);
  else if (monde === 'ville') {
    couches.push([auNiveau(linge(env, sr, rnd), 1, 1e9), 0.55]);
    // Le volet, une fois sur deux : il cogne au plus fort de la rafale.
    if (v === 1) couches.push([volet(n, sr, rnd, monte + 0.08), 2.2]);
  } else if (monde === 'fonte') couches.push([auNiveau(cables(env, sr, rnd), 1, 1e9), 0.4]);
  else couches.push([auNiveau(souffleSourd(env, sr, rnd), 1, 1e9), 0.6]);
  return normaliser(melanger(n, couches, P.grave, sr), sr, 0.8, 0.15);
}

// ── La lumière : le chœur ──────────────────────────────────────────────────────
// Les accords (Hz) : la majeur (mi, la, do dièse, mi) ; ré majeur (fa dièse, la, ré, fa dièse).
const ACCORDS = [[329.63, 440, 554.37, 659.26], [369.99, 440, 587.33, 739.99]];
// La voyelle a d'un chœur : ses formants (Hz), leur largeur (Hz), leur poids. Des largeurs
// de chœur (une voix seule est plus pointue) ; un premier formant large, vers le grave,
// garde les fondamentales : une voix claire d'enfant, pas une voix nasillarde.
const VOYELLE_A = [[520, 420, 0.45], [800, 170, 1], [1150, 190, 0.55], [2900, 450, 0.3], [3900, 500, 0.2]];
const CHANTEURS = 3;
// La scie à bords adoucis (PolyBLEP) : la vibration des cordes vocales, sans repliement.
function blep(t, dt) {
  if (t < dt) { const x = t / dt; return x + x - x * x - 1; }
  if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; }
  return 0;
}
function rendreLumiere(v, sr) {
  const rnd = graine(0x1a0a0 + 0x51 * v);
  const n = Math.round(4.2 * sr), src = new Float32Array(n), air = new Float32Array(n);
  for (const f of ACCORDS[v - 1]) {
    for (let c = 0; c < CHANTEURS; c += 1) {
      // Chacun un peu à côté (±9 cents), son vibrato à lui, qui vient après l'attaque, et
      // sa façon d'attaquer et de lâcher.
      const f0 = f * Math.pow(2, ((rnd() * 2 - 1) * 9) / 1200);
      const vf = 4.6 + 1.2 * rnd(), va = 0.0025 + 0.002 * rnd(), vp = rnd() * 2 * Math.PI;
      const derive = remous(rnd, 0.8, sr / 32);
      const t0 = 0.1 * rnd(), lache = 1.7 + 0.35 * rnd(), g = 0.8 + 0.2 * rnd();
      // La hauteur et l'enveloppe changent lentement : recalculées tous les 16 échantillons
      // (une demi-milliseconde), le rendu va deux fois plus vite.
      let ph = rnd(), d = 0, dt = 0, e = 0;
      for (let i = Math.round(t0 * sr); i < n; i += 1) {
        if ((i & 15) === 0) {
          const t = i / sr - t0;
          if ((i & 31) === 0) d = derive() * 0.0018;         // ±3 cents qui flottent
          dt = (f0 * (1 + va * lisse(t / 0.7) * Math.sin(2 * Math.PI * vf * t + vp) + d)) / sr;
          e = lisse(t / 0.42) * (1 - lisse((t - lache) / 1.25)) * (0.85 + 0.15 * lisse(t / 1.1)) * g;
        }
        ph += dt;
        if (ph >= 1) ph -= 1;
        src[i] += (2 * ph - 1 - blep(ph, dt)) * e;
      }
    }
  }
  // Le souffle des chanteurs : un peu d'air, qui suit la voix.
  for (let i = 0; i < n; i += 1) {
    const t = i / sr;
    air[i] = (rnd() * 2 - 1) * lisse(t / 0.42) * (1 - lisse((t - 1.85) / 1.25));
  }
  // La pente d'une voix chantée doucement, puis la voyelle : les formants, en parallèle.
  const pente = biquad('lp', 3400, 0.6, sr);
  const F = VOYELLE_A.map(([f, l, p]) => ({ F: biquad('bp', f, f / l, sr), p }));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = bq(pente, src[i]) + air[i] * 0.35;
    let y = 0;
    for (const r of F) y += bq(r.F, x) * r.p;
    out[i] = y;
  }
  return normaliser(salle(out, sr, 0.8, 0.4), sr, 0.8, 0.3);
}

// ── Le feu ─────────────────────────────────────────────────────────────────────
// La flamme monte en 0,12 s (le feu du jeu en 0,3 s), lèche, et retombe vers 3 s.
const elan = (t) => lisse(t / 0.12) * (0.6 + 0.4 * Math.exp(-t / 0.45)) * (1 - lisse((t - 2.1) / 1.1));
// Par monde : le souffle de la flamme (sa coupure au plus haut, puis au repos, Hz), les
// crépitements (par seconde quand elle saisit), les éclats graves (par seconde), le
// chuintement des braises, le soufflet du fourneau.
const FEU = {
  bois: { graine: 0xf1a3e0, haut: 2000, repos: 750, crepite: 45, eclats: 1.2, chuinte: 0.12, soufflet: 0 },
  brasero: { graine: 0xf1a3e1, haut: 1700, repos: 650, crepite: 16, eclats: 0.8, chuinte: 0.45, soufflet: 0 },
  fourneau: { graine: 0xf1a3e2, haut: 1200, repos: 420, crepite: 5, eclats: 0, chuinte: 0.15, soufflet: 1 },
};
// Une braise qui saute : un « pop » grave de quinze millisecondes.
function eclat(out, i0, sr, rnd, g) {
  const f = 260 + 420 * rnd(), n = Math.min(out.length - i0, Math.round(0.06 * sr));
  for (let j = 0; j < n; j += 1) {
    const t = j / sr;
    out[i0 + j] += Math.sin(2 * Math.PI * f * t * (1 - 0.3 * t / 0.06)) * Math.exp(-t / 0.015) * g;
  }
}
// Le soufflet qu'on presse : une poussée d'air grave qui enfle sur une demi-seconde puis
// s'apaise, et le grondement de la chambre.
function soufflet(n, sr, rnd) {
  const out = new Float32Array(n);
  const bruit = rose(rnd), A = biquad('bp', 320, 0.8, sr), B = biquad('lp', 180, 0.7, sr);
  let brun = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / sr;
    const pousse = lisse(t / 0.45) * (1 - lisse((t - 0.6) / 2.2));
    brun = (brun + 0.02 * (rnd() * 2 - 1)) / 1.02;
    out[i] = (bq(A, bruit()) + bq(B, brun * 3.5) * 0.9) * pousse;
  }
  return out;
}
function rendreFeu(monde, v, sr) {
  const P = FEU[monde], rnd = graine(P.graine + 0x3d * v);
  const n = Math.round(3.4 * sr), haut = P.haut * (v === 2 ? 0.88 : 1);
  const bruit = rose(rnd), leche = remous(rnd, 8, sr / 32), frem = remous(rnd, 23, sr);
  const sif = biquad('hp', 3600, 0.7, sr), crep = biquad('bp', 2600, 0.6, sr);
  const flamme = new Float32Array(n), crepit = new Float32Array(n), chuint = new Float32Array(n), graves = new Float32Array(n);
  const amort = Math.exp(-1 / (0.0009 * sr));
  let l1 = 0, l2 = 0, hp = 0, e = 0, a = 0, lk = 1, clic = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / sr;
    if ((i & 31) === 0) {
      e = elan(t);
      lk = 1 + 0.35 * leche();                       // la flamme lèche (±35 %)
      // Claire quand elle s'élève, plus sourde ensuite.
      const fc = (P.repos + (haut - P.repos) * Math.exp(-t / 0.35)) * (0.7 + 0.3 * e);
      a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
    }
    const x = bruit();
    l1 += a * (x - l1); l2 += a * (l1 - l2);
    hp += 0.003 * (l2 - hp);
    flamme[i] = (l2 - hp) * e * lk;
    // Les crépitements : nombreux quand la flamme saisit, plus rares ensuite.
    if (rnd() < (P.crepite * e * (0.35 + 0.65 * Math.exp(-t / 0.7))) / sr) clic = 0.3 + 0.7 * rnd();
    crepit[i] = bq(crep, clic * (rnd() * 2 - 1));
    clic *= amort;
    if (P.eclats && rnd() < (P.eclats * e) / sr) eclat(graves, i, sr, rnd, 0.5 + 0.5 * rnd());
    // Le chuintement des braises : un bruit aigu qui frémit.
    chuint[i] = bq(sif, rnd() * 2 - 1) * e * (0.55 + 0.45 * frem());
  }
  auNiveau(flamme, 1, 1e9); auNiveau(chuint, 1, 1e9);
  const couches = [[flamme, 1], [aCrete(crepit), 2.6], [chuint, P.chuinte]];
  if (P.eclats) couches.push([aCrete(graves), 1.6]);
  if (P.soufflet) couches.push([auNiveau(soufflet(n, sr, rnd), 1, 1e9), 0.9 * P.soufflet]);
  return normaliser(melanger(n, couches, 90, sr), sr, 0.8, 0.2);
}

// ── Le catalogue ────────────────────────────────────────────────────────────────
export const MONDES_VENT = ['camp', 'ville', 'fonte', 'cosmos'];
export const MONDES_FEU = ['bois', 'brasero', 'fourneau'];
const NOMS = [];
for (const m of MONDES_VENT) NOMS.push(`signe-vent-${m}-1`, `signe-vent-${m}-2`);
NOMS.push('signe-lumiere-1', 'signe-lumiere-2');
for (const m of MONDES_FEU) NOMS.push(`signe-feu-${m}-1`, `signe-feu-${m}-2`);
export const SONS_SIGNES = NOMS;

// Rend un son des signes, ou null si le nom n'en est pas un.
export function rendreSigne(nom, sr) {
  let m = /^signe-vent-(camp|ville|fonte|cosmos)-([12])$/.exec(nom);
  if (m) return rendreVent(m[1], Number(m[2]), sr);
  m = /^signe-lumiere-([12])$/.exec(nom);
  if (m) return rendreLumiere(Number(m[1]), sr);
  m = /^signe-feu-(bois|brasero|fourneau)-([12])$/.exec(nom);
  if (m) return rendreFeu(m[1], Number(m[2]), sr);
  return null;
}
