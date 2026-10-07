// LES SONS DU PAYSAGE, JOUÉS PAR LE CODE (docs/PLAN-AMBIANCE-SONORE.md § 5.1 ; décision
// de Raph du 2026-10-07 : les TEXTURES se synthétisent). Comme la machine à sous et la
// mélodie de la scène, rien n'est enregistré : chaque son est rendu ici, échantillon par
// échantillon, une fois par session.
//
// Les textures stationnaires — le vent, l'eau, la rumeur d'une ville au loin — sont
// exactement ce que la synthèse fait bien (Farnell, « Designing Sound » ; § 1.4). Les
// voix, les oiseaux et les bêtes viendront d'enregistrements, aux lots suivants.
//
//   souffle    le corps du vent : un bruit sombre qui enfle par rafales ;
//   feuillage  les feuilles : un froissement aigu qui frémit, des feuilles qui claquent ;
//   courant    le fleuve : une nappe d'eau, un clapot lent, quelques glouglous ;
//   ressac     la rive : des vaguelettes qui viennent mourir, et leur ruissellement ;
//   lointain   la ville au loin : un grondement, un murmure sans mots, des coups sourds ;
//   libellule  le battement des ailes : 34 coups par seconde, le « zzz » de la membrane ;
//   plouf1-6   le poisson qui retombe : l'impact, la gerbe, la cavité qui se referme, les gouttes ;
//   sortie1-3  le poisson qui sort de l'eau : une gerbe légère.
//
// LES BOUCLES NE CLAQUENT PAS. Une nappe est rendue un peu plus longue que sa boucle,
// et la fin se fond dans le début à puissance constante (`boucler`) : le premier
// échantillon de la boucle est la suite exacte du dernier. Ses enveloppes (rafales,
// clapot) sont PÉRIODIQUES de la longueur de la boucle. Deux nappes qui jouent
// ensemble ont des longueurs premières entre elles (23 s et 17 s) : leur motif commun
// ne revient qu'au bout de six minutes et demie.
//
// PUR (aléa à graine, ni navigateur ni état du jeu) : le test les mesure tous, et ils
// se rendent dans le Worker des sons (synthese.worker.js), hors du fil principal.
import { graine, normaliser } from '../synth.js';

export const PAYSAGE_SR = 32000;

export const SONS_PAYSAGE = [
  'souffle', 'feuillage', 'courant', 'ressac', 'lointain', 'libellule',
  'plouf1', 'plouf2', 'plouf3', 'plouf4', 'plouf5', 'plouf6',
  'sortie1', 'sortie2', 'sortie3',
];

// ── Petits outils ──────────────────────────────────────────────────────────────

// Bruit ROSE (filtre de Kellet) : autant d'énergie par octave, la couleur du vent et
// de l'eau.
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
// Bruit BRUN (intégrateur qui fuit) : le grondement.
function brun(rnd) {
  let b = 0;
  return () => { b = (b + 0.02 * (rnd() * 2 - 1)) / 1.02; return b * 3.5; };
}
// Filtre biquad (formules de R. Bristow-Johnson) : passe-bas, passe-haut, ou passe-
// bande à 0 dB au centre.
function biquad(type, f, Q, sr) {
  const w0 = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
  const c = Math.cos(w0), al = Math.sin(w0) / (2 * Q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * c) / a0, a2: (1 - al) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
}
function bq(F, x) {
  const y = F.b0 * x + F.b1 * F.x1 + F.b2 * F.x2 - F.a1 * F.y1 - F.a2 * F.y2;
  F.x2 = F.x1; F.x1 = x; F.y2 = F.y1; F.y1 = y;
  return y;
}
// Une enveloppe lente, PÉRIODIQUE de période L secondes, entre 0 et 1 : k sinus aux
// harmoniques de 1/L, d'amplitudes décroissantes, de phases tirées.
function periodique(rnd, L, k = 6, pente = 0.9) {
  const a = new Float64Array(k), ph = new Float64Array(k);
  for (let i = 0; i < k; i += 1) { a[i] = (0.35 + rnd()) / Math.pow(i + 1, pente); ph[i] = rnd() * 2 * Math.PI; }
  const brut = (t) => {
    let v = 0;
    for (let i = 0; i < k; i += 1) v += a[i] * Math.sin((2 * Math.PI * (i + 1) * t) / L + ph[i]);
    return v;
  };
  let mn = Infinity, mx = -Infinity;
  for (let j = 0; j < 1024; j += 1) { const v = brut((j / 1024) * L); if (v < mn) mn = v; if (v > mx) mx = v; }
  const e = mx - mn || 1;
  return (t) => Math.max(0, Math.min(1, (brut(t) - mn) / e));
}
// La couture : `src` dure Ln échantillons de plus que sa queue ; la queue (la suite
// naturelle de la fin) se fond dans le début, à puissance constante — le bruit des
// deux côtés est sans lien, leurs puissances s'ajoutent.
function boucler(src, Ln) {
  const F = src.length - Ln;
  const out = src.slice(0, Ln);
  for (let i = 0; i < F; i += 1) {
    const th = ((i / F) * Math.PI) / 2;
    out[i] = src[i] * Math.sin(th) + src[Ln + i] * Math.cos(th);
  }
  return out;
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
// Mélange de couches déjà au niveau : out = Σ gain · couche.
function melanger(n, couches) {
  const out = new Float32Array(n);
  for (const [c, g] of couches) for (let i = 0; i < n; i += 1) out[i] += c[i] * g;
  return out;
}
// Une BULLE (Farnell) : une note qui monte pendant que la bulle remonte, et meurt vite.
// `montee` : de combien la hauteur grimpe sur trois constantes de temps.
function bulle(out, sr, t, f0, tau, amp, montee = 1.6) {
  const s0 = Math.round(t * sr);
  const n = Math.min(out.length - s0, Math.round(tau * 6 * sr));
  let ph = 0;
  for (let j = 0; j < n; j += 1) {
    const tt = j / sr;
    ph += (2 * Math.PI * f0 * (1 + (montee * tt) / (tau * 3))) / sr;
    out[s0 + j] += Math.sin(ph) * Math.exp(-tt / tau) * Math.min(1, j / (0.0015 * sr)) * amp;
  }
}
// Tirage exponentiel (processus de Poisson) : le temps jusqu'au prochain événement.
const attente = (rnd, taux) => -Math.log(1 - rnd()) / Math.max(1e-6, taux);

// ── Les nappes ─────────────────────────────────────────────────────────────────

// Le CORPS DU VENT : bruit rose dans un passe-bas à deux pôles dont la coupure suit la
// rafale (140 à 900 Hz), un souffle d'air aigu dans les plus fortes. 23 s.
function rendreSouffle(sr) {
  const rnd = graine(0x50f1e), L = 23, Ln = Math.round(L * sr), n = Ln + Math.round(1.5 * sr);
  const env = periodique(rnd, L, 6, 0.8);
  const bruit = rose(rnd);
  const air = biquad('hp', 1800, 0.7, sr);
  const corps = new Float32Array(n), sifflet = new Float32Array(n);
  let l1 = 0, l2 = 0, hp = 0, g = 0, a = 0;
  for (let i = 0; i < n; i += 1) {
    if ((i & 63) === 0) {
      g = env(i / sr);
      g = 0.12 + 0.88 * g * g;                     // des accalmies et des rafales
      a = 1 - Math.exp((-2 * Math.PI * (140 + 760 * g)) / sr);
    }
    const x = bruit();
    l1 += a * (x - l1); l2 += a * (l1 - l2);
    hp += 0.004 * (l2 - hp);                      // ni continu ni infrasons (~20 Hz)
    corps[i] = (l2 - hp) * (0.25 + 0.75 * g);
    sifflet[i] = bq(air, x) * g * g;
  }
  auNiveau(corps, 1, 1e9); auNiveau(sifflet, 1, 1e9);
  return auNiveau(boucler(melanger(n, [[corps, 1], [sifflet, 0.16]]), Ln), 0.12);
}

// Le FEUILLAGE : un froissement entre 1 et 6 kHz qui frémit (~11 Hz), d'autant plus
// fort que la rafale, et des feuilles qui claquent (un éclat de 2 ms). 17 s.
function rendreFeuillage(sr) {
  const rnd = graine(0xfe11a6e), L = 17, Ln = Math.round(L * sr), n = Ln + Math.round(1.2 * sr);
  const env = periodique(rnd, L, 7, 0.7);
  const bpA = biquad('bp', 2400, 0.6, sr), bpB = biquad('bp', 5200, 0.9, sr), hp = biquad('hp', 800, 0.7, sr);
  const out = new Float32Array(n);
  const kFr = 1 - Math.exp((-2 * Math.PI * 11) / sr);
  let g = 0, fr = 0, clic = 0;
  for (let i = 0; i < n; i += 1) {
    if ((i & 63) === 0) { g = env(i / sr); g = 0.08 + 0.92 * Math.pow(g, 1.4); }
    fr += kFr * ((rnd() * 2 - 1) - fr);                     // le frémissement
    const fl = Math.min(1, Math.abs(fr) * 14);
    if (rnd() < 0.0011 * g) clic = 0.12 + rnd() * 0.22;      // une feuille qui claque
    const w = rnd() * 2 - 1;
    const y = bq(hp, bq(bpA, w) * 0.9 + bq(bpB, w) * 0.4 + clic * (rnd() * 2 - 1));
    clic *= 0.93;
    out[i] = y * g * (0.3 + 0.7 * fl);
  }
  return auNiveau(boucler(out, Ln), 0.11);
}

// Le COURANT : une nappe d'eau (bruit rose sous 650 Hz), un clapot lent autour de
// 320 Hz, et des glouglous (bulles de 250 à 1 100 Hz, cinq à quatorze par seconde
// selon le débit). 19 s.
function rendreCourant(sr) {
  const rnd = graine(0xc0c0a), L = 19, Ln = Math.round(L * sr), n = Ln + Math.round(1.2 * sr);
  const env = periodique(rnd, L, 5, 1);
  const clap = periodique(rnd, L, 12, 0.5);          // jusqu'à 12/19 ≈ 0,6 Hz
  const bruit = rose(rnd);
  const slosh = biquad('bp', 320, 0.8, sr);
  const a = 1 - Math.exp((-2 * Math.PI * 650) / sr);
  const nappe = new Float32Array(n), clapot = new Float32Array(n), glou = new Float32Array(n);
  let l1 = 0, l2 = 0, hp = 0, g = 0, c = 0;
  for (let i = 0; i < n; i += 1) {
    if ((i & 63) === 0) { g = env(i / sr); c = clap(i / sr); }
    const x = bruit();
    l1 += a * (x - l1); l2 += a * (l1 - l2); hp += 0.012 * (l2 - hp);
    nappe[i] = (l2 - hp) * (0.65 + 0.35 * g);
    clapot[i] = bq(slosh, x) * (0.15 + 0.85 * c * c);
  }
  for (let t = rnd() * 0.2; t < n / sr; t += attente(rnd, 5 + 9 * env(t % L))) {
    const f0 = Math.exp(Math.log(250) + rnd() * (Math.log(1100) - Math.log(250)));
    bulle(glou, sr, t, f0, 0.008 + 0.03 * (250 / f0), 0.4 + rnd() * 0.6, 1.4);
  }
  auNiveau(nappe, 1, 1e9); auNiveau(clapot, 1, 1e9); auNiveau(glou, 1, 1e9);
  const out = melanger(n, [[nappe, 1], [clapot, 0.45], [glou, 0.32]]);
  const lp = biquad('lp', 4800, 0.7, sr);
  for (let i = 0; i < n; i += 1) out[i] = bq(lp, out[i]);
  return auNiveau(boucler(out, Ln), 0.12);
}

// Une CLAQUE d'eau contre la berge : un bruit bref en bande (25 à 60 ms), puis un ou
// deux « plop », la poche d'air qui se referme.
function claque(out, sr, t, rnd, force) {
  const s0 = Math.round(t * sr), dec = 0.025 + rnd() * 0.035;
  const n = Math.min(out.length - s0, Math.round(dec * 6 * sr));
  const bp = biquad('bp', 480 + rnd() * 650, 1.2, sr);
  for (let j = 0; j < n; j += 1) {
    const tt = j / sr;
    out[s0 + j] += bq(bp, rnd() * 2 - 1) * Math.exp(-tt / dec) * Math.min(1, tt / 0.003) * force;
  }
  const np = 1 + Math.floor(rnd() * 2);
  for (let k = 0; k < np; k += 1) {
    bulle(out, sr, t + 0.012 + rnd() * 0.05, 600 + rnd() * 800, 0.006 + rnd() * 0.008, 0.5 * force * (0.5 + rnd() * 0.5), 1.8);
  }
}
// Le RESSAC d'un fleuve calme. Refait le 2026-10-07 : la première version faisait monter
// et mourir des vaguelettes de mer toutes les deux à quatre secondes, sur un coup sourd,
// et Raph a entendu « la tempête ». Désormais : un filet d'eau presque muet (de petites
// bulles éparses) et, toutes les 2,5 à 6 s, un petit CLAPOTIS — deux à quatre claques
// d'eau contre la berge en une demi-seconde. Ni houle ni coup sourd. 16 s.
function rendreRessac(sr) {
  const rnd = graine(0x7e55ac), L = 16, Ln = Math.round(L * sr), n = Ln + Math.round(1.2 * sr);
  const filet = new Float32Array(n), clapotis = new Float32Array(n);
  for (let t = rnd() * 0.3; t < n / sr; t += attente(rnd, 11)) {
    bulle(filet, sr, t, 700 + rnd() * 1500, 0.004 + rnd() * 0.005, 0.3 + rnd() * 0.7, 2);
  }
  for (let t = 0.4 + rnd() * 1.5; t < n / sr - 0.6; t += 2.5 + rnd() * 3.5) {
    const nc = 2 + Math.floor(rnd() * 3), force = 0.45 + rnd() * 0.55;
    let tc = t;
    for (let c = 0; c < nc; c += 1) {
      claque(clapotis, sr, tc, rnd, force * (c === 0 ? 1 : 0.55 + rnd() * 0.4));
      tc += 0.07 + rnd() * 0.12;
    }
  }
  auNiveau(filet, 1, 1e9); auNiveau(clapotis, 1, 1e9);
  return auNiveau(boucler(melanger(n, [[clapotis, 1], [filet, 0.4]]), Ln), 0.05, 0.7);
}

// Un COUP SOURD au loin : une porte, un atelier — une résonance grave, étouffée.
function coupSourd(out, sr, t, rnd) {
  const f = 160 + rnd() * 340, tau = 0.05 + rnd() * 0.07;
  const s0 = Math.round(t * sr), n = Math.min(out.length - s0, Math.round(tau * 6 * sr));
  const amp = 0.4 + rnd() * 0.6;
  for (let j = 0; j < n; j += 1) {
    const tt = j / sr;
    out[s0 + j] += (Math.sin(2 * Math.PI * f * tt) + 0.4 * (rnd() * 2 - 1) * Math.exp(-tt / 0.004)) * Math.exp(-tt / tau) * amp;
  }
}
// La VILLE AU LOIN : un grondement (bruit brun entre 28 et 150 Hz), un murmure sans mots
// (trois bandes de voix, chacune hachée au rythme des syllabes, 4 à 7 Hz, puis
// assourdie par la distance) et, rarement, un coup sourd. 29 s.
function rendreLointain(sr) {
  const rnd = graine(0x10a7a1), L = 29, Ln = Math.round(L * sr), n = Ln + Math.round(2 * sr);
  const env = periodique(rnd, L, 6, 0.9);
  const b = brun(rnd);
  const lpR = biquad('lp', 150, 0.7, sr), hpR = biquad('hp', 28, 0.7, sr), lpV = biquad('lp', 1300, 0.7, sr);
  const voix = [[380, 1.3], [610, 1.5], [930, 1.7]].map(([f, q]) => ({
    bp: biquad('bp', f, q, sr), am: 0, k: 1 - Math.exp((-2 * Math.PI * (4 + rnd() * 3)) / sr),
  }));
  const grond = new Float32Array(n), murmure = new Float32Array(n), coups = new Float32Array(n);
  let g = 0;
  for (let i = 0; i < n; i += 1) {
    if ((i & 63) === 0) g = env(i / sr);
    grond[i] = bq(hpR, bq(lpR, b())) * (0.75 + 0.25 * g);
    const w = rnd() * 2 - 1;
    let m = 0;
    for (const v of voix) {
      v.am += v.k * ((rnd() * 2 - 1) - v.am);
      const s = Math.min(1, Math.abs(v.am) * 20);
      m += bq(v.bp, w) * s * s;
    }
    murmure[i] = bq(lpV, m) * (0.6 + 0.4 * g);
  }
  for (let t = 1 + rnd() * 3; t < n / sr - 0.5; t += 2.5 + rnd() * 5) coupSourd(coups, sr, t, rnd);
  auNiveau(grond, 1, 1e9); auNiveau(murmure, 1, 1e9); auNiveau(coups, 1, 1e9);
  return auNiveau(boucler(melanger(n, [[grond, 1], [murmure, 0.4], [coups, 0.14]]), Ln), 0.12);
}

// ── Les émetteurs ──────────────────────────────────────────────────────────────

// La LIBELLULE. Refaite le 2026-10-07 : la première version découpait un bruit grave en
// 34 battements par seconde, séparés de silences, et Raph a entendu un HÉLICOPTÈRE (un
// rotor, c'est exactement cela). Désormais, le « zzz » de la demande : un bourdonnement
// fin et CONTINU, une note de 200 Hz riche en harmoniques, à peine voilée par les ailes
// (30 battements par seconde, ±15 % seulement : jamais de silence entre deux), qui
// tremble et dérive un peu, avec un souffle d'air aigu. Rien sous la note.
// La boucle tombe juste : en 3 s, 600 périodes de la note, 90 battements, 18 trémolos,
// une dérive. Seul le souffle, un bruit, se boucle en fondu.
export const LIBELLULE_HZ = 30;        // les battements d'ailes
export const LIBELLULE_NOTE = 200;     // la note du bourdonnement
function rendreLibellule(sr) {
  const rnd = graine(0x11be11), L = 3, Ln = Math.round(L * sr);
  const f0 = LIBELLULE_NOTE, fw = LIBELLULE_HZ;
  const nb = Ln + Math.round(0.15 * sr), brute = new Float32Array(nb);
  const hp = biquad('hp', 2500, 0.7, sr);
  for (let i = 0; i < nb; i += 1) brute[i] = bq(hp, rnd() * 2 - 1);
  const air = boucler(brute, Ln);
  // Les harmoniques : les impaires plus fortes, pour le grain du bourdon.
  const H = 14, amps = new Float64Array(H);
  for (let k = 1; k <= H; k += 1) amps[k - 1] = (k % 2 ? 1 : 0.6) / Math.pow(k, 1.1);
  const note = new Float32Array(Ln), souffle = new Float32Array(Ln);
  let ph = 0;
  for (let i = 0; i < Ln; i += 1) {
    const t = i / sr;
    const vib = 1 + 0.006 * Math.sin(2 * Math.PI * 6 * t) + 0.02 * Math.sin((2 * Math.PI * t) / L);
    ph += (2 * Math.PI * f0 * vib) / sr;
    let v = 0;
    for (let k = 0; k < H; k += 1) v += amps[k] * Math.sin((k + 1) * ph);
    const ailes = 0.5 + 0.5 * Math.sin(2 * Math.PI * fw * t);
    note[i] = v * (1 - 0.3 * ailes);
    souffle[i] = air[i] * (1 - 0.6 * ailes);
  }
  auNiveau(note, 1, 1e9); auNiveau(souffle, 1, 1e9);
  return auNiveau(melanger(Ln, [[note, 1], [souffle, 0.22]]), 0.12);
}

// ── Les ponctuels ──────────────────────────────────────────────────────────────

// Le PLOUF d'un poisson qui retombe (variante v) : l'impact (un claquement bref,
// assourdi), la gerbe (de l'eau qui jaillit), la cavité qui se referme (le « bloup » :
// une note qui monte de 210 à 640 Hz), puis les gouttes qui retombent. Le calibre
// tiré abaisse le tout pour un gros poisson.
function rendrePlouf(v, sr) {
  const rnd = graine(0x9100f + v * 7919);
  const s = 0.8 + rnd() * 0.45;
  const n = Math.round(0.8 * sr), out = new Float32Array(n);
  const aI = 1 - Math.exp((-2 * Math.PI * 4500) / sr);
  let li = 0;
  for (let j = 0; j < Math.round(0.03 * sr); j += 1) {
    li += aI * ((rnd() * 2 - 1) - li);
    out[j] += li * Math.exp(-j / sr / 0.0045) * 1.6;
  }
  const bpG = biquad('bp', 1300 / s, 0.6, sr);
  for (let j = 0; j < Math.round(0.35 * sr); j += 1) {
    const tt = j / sr;
    out[j] += bq(bpG, rnd() * 2 - 1) * Math.exp(-tt / 0.055) * Math.min(1, tt / 0.002) * 0.9;
  }
  const f0 = 210 / s, f1 = 640 / s, d0 = Math.round(0.006 * sr);
  let ph = 0;
  for (let j = 0; j < Math.round(0.3 * sr) && d0 + j < n; j += 1) {
    const tt = j / sr;
    ph += (2 * Math.PI * (f0 + (f1 - f0) * (1 - Math.exp(-tt / 0.022)))) / sr;
    out[d0 + j] += Math.sin(ph) * Math.exp(-tt / 0.048) * Math.min(1, tt / 0.003) * 0.85;
  }
  const ng = 3 + Math.floor(rnd() * 5);
  for (let k = 0; k < ng; k += 1) bulle(out, sr, 0.08 + rnd() * 0.34, 1300 + rnd() * 1900, 0.005 + rnd() * 0.006, 0.12 + rnd() * 0.18, 2.5);
  return normaliser(out, sr, 0.8, 0.03);
}
// La SORTIE de l'eau : une gerbe légère et deux ou trois gouttes, sans la cavité.
function rendreSortie(v, sr) {
  const rnd = graine(0x5011e + v * 104729);
  const n = Math.round(0.5 * sr), out = new Float32Array(n);
  const bpG = biquad('bp', 1700 + rnd() * 500, 0.7, sr);
  for (let j = 0; j < Math.round(0.25 * sr); j += 1) {
    const tt = j / sr;
    out[j] += bq(bpG, rnd() * 2 - 1) * Math.exp(-tt / 0.035) * Math.min(1, tt / 0.003);
  }
  const ng = 2 + Math.floor(rnd() * 2);
  for (let k = 0; k < ng; k += 1) bulle(out, sr, 0.04 + rnd() * 0.2, 1500 + rnd() * 1600, 0.005 + rnd() * 0.005, 0.15 + rnd() * 0.15, 2.5);
  return normaliser(out, sr, 0.8, 0.03);
}

// ── Le guichet ─────────────────────────────────────────────────────────────────
export function rendrePaysage(nom, sr = PAYSAGE_SR) {
  switch (nom) {
    case 'souffle': return rendreSouffle(sr);
    case 'feuillage': return rendreFeuillage(sr);
    case 'courant': return rendreCourant(sr);
    case 'ressac': return rendreRessac(sr);
    case 'lointain': return rendreLointain(sr);
    case 'libellule': return rendreLibellule(sr);
    default: break;
  }
  let m = /^plouf([1-6])$/.exec(nom);
  if (m) return rendrePlouf(Number(m[1]), sr);
  m = /^sortie([1-3])$/.exec(nom);
  if (m) return rendreSortie(Number(m[1]), sr);
  throw new Error('son de paysage inconnu : ' + nom);
}
