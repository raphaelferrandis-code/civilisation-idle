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
import { graine, normaliser, cloche } from '../synth.js';

export const PAYSAGE_SR = 32000;

export const SONS_PAYSAGE = [
  'souffle', 'feuillage', 'courant', 'ressac', 'lointain', 'libellule',
  'grillons', 'stridulations', 'cigales',
  'plouf1', 'plouf2', 'plouf3', 'plouf4', 'plouf5', 'plouf6',
  'sortie1', 'sortie2', 'sortie3',
  'plip1', 'plip2', 'plip3', 'plip4',
  // Lot 3, la ville. Les voix (brouhaha, causerie, enfants) sont ENREGISTRÉES : les voix
  // synthétisées ont été refusées à l'écoute (« cauchemardesques », Raph, 2026-10-07).
  'fontaine', 'roucoul1', 'roucoul2', 'roucoul3', 'roucoul4', 'roucoul5', 'roucoul6',
  'envol1', 'envol2', 'envol3', 'envol4', 'drone',
  // Lot 4, les métiers : la cloche d'un bateau qui accoste ou qui part ; le bourdon
  // électrique des ateliers du Néon.
  'clochebateau1', 'clochebateau2', 'electrique',
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

// ── Les insectes (lot 2) ───────────────────────────────────────────────────────
// Trois chœurs, chacun d'individus qui chantent à leur rythme. Pour qu'une boucle
// tombe juste, chaque individu chante une période qui DIVISE la boucle (L / m, m
// entier) ; une note qui déborde la fin reprend au début (écriture modulo L). Leurs
// porteuses sont des sinus remis en phase à chaque note : rien ne casse à la couture.

// Une note : un sinus à `f` Hz, attaque de 1,5 ms, qui s'éteint sur `dur` secondes,
// écrite à `t` secondes dans une boucle de longueur out.length (modulo).
function noteBoucle(out, sr, t, f, dur, amp) {
  const L = out.length, s0 = Math.round(t * sr), n = Math.round(dur * sr);
  const w = (2 * Math.PI * f) / sr, nA = Math.max(1, Math.round(0.0015 * sr));
  for (let j = 0; j < n; j += 1) {
    const e = Math.min(1, j / nA) * (1 - j / n);
    out[(((s0 + j) % L) + L) % L] += Math.sin(w * j) * e * amp;
  }
}

// Les GRILLONS de la nuit : quinze grillons des champs, porteuse entre 3,9 et 4,9 kHz,
// trois ou quatre impulsions par stridulation (~30 par seconde), une stridulation toutes
// les 0,4 à 0,9 s. Les plus lointains sont plus faibles. 21 s.
function rendreGrillons(sr) {
  const rnd = graine(0x6111a), L = 21, Ln = Math.round(L * sr);
  const out = new Float32Array(Ln);
  for (let k = 0; k < 15; k += 1) {
    const f = 3900 + rnd() * 1000, m = 24 + Math.floor(rnd() * 30), periode = L / m;
    const nb = 3 + Math.floor(rnd() * 2), pas = 1 / (28 + rnd() * 6);
    const amp = 0.2 + 0.8 * Math.pow(rnd(), 1.6), phase = rnd() * periode;
    for (let j = 0; j < m; j += 1) {
      for (let p = 0; p < nb; p += 1) noteBoucle(out, sr, phase + j * periode + p * pas, f, pas * 0.55, amp);
    }
  }
  return auNiveau(out, 0.08, 0.8);
}

// Les SAUTERELLES des prés, de jour : six chanteuses, chacune une phrase rêche (des
// grains de bruit entre 7 et 12 kHz, 12 à 20 par seconde) de 0,6 à 2 s, puis le
// silence ; une phrase toutes les 3,7 à 11 s. Chaque phrase a son propre filtre et
// s'écrit d'un bloc, modulo la boucle : une phrase à cheval sur la fin reprend au début,
// entière. 11 s.
function rendreStridulations(sr) {
  const rnd = graine(0x57a1d), L = 11, Ln = Math.round(L * sr);
  const out = new Float32Array(Ln);
  for (let k = 0; k < 6; k += 1) {
    const fc = 7000 + rnd() * 5000;
    const m = 1 + Math.floor(rnd() * 3), periode = L / m, phrase = 0.6 + rnd() * 1.4;
    const cadence = 12 + rnd() * 8, amp = 0.3 + 0.7 * rnd(), phase = rnd() * periode;
    for (let j = 0; j < m; j += 1) {
      const bp = biquad('bp', fc, 2.2, sr);
      const s0 = Math.round((phase + j * periode) * sr), ns = Math.round(phrase * sr);
      for (let i = 0; i < ns; i += 1) {
        const tt = i / sr, u = (tt * cadence) % 1;
        const grain = u < 0.45 ? Math.sin((Math.PI * u) / 0.45) : 0;
        const fond = Math.min(1, tt / 0.1, (phrase - tt) / 0.15);
        out[(s0 + i) % Ln] += bq(bp, rnd() * 2 - 1) * grain * fond * amp;
      }
    }
  }
  return auNiveau(out, 0.05, 0.8);
}

// Les CIGALES de l'été : quatre chanteuses dans les arbres, chacune un bruit serré entre
// 4,5 et 7 kHz, haché très vite (200 Hz : le grain du chant), découpé en syllabes (7 par
// seconde), qui enfle et s'arrête par cycles de 7 s. Les enveloppes sont périodiques de
// la boucle ; le bruit se boucle en fondu. 14 s.
function rendreCigales(sr) {
  const rnd = graine(0xc16a1e), L = 14, Ln = Math.round(L * sr), n = Ln + Math.round(0.8 * sr);
  const out = new Float32Array(n);
  for (let k = 0; k < 4; k += 1) {
    const bp = biquad('bp', 4500 + rnd() * 2500, 3, sr);
    const amp = 0.4 + 0.6 * rnd(), dec = rnd(), dec2 = rnd(), dec3 = rnd();
    for (let i = 0; i < n; i += 1) {
      const t = i / sr;
      const grain = 0.5 + 0.5 * Math.sin(2 * Math.PI * (200 * t + dec));
      const syll = Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * (7 * t + dec2)), 0.6);
      const u = (t / 7 + dec3) % 1;                              // le cycle du chant : 7 s
      const chant = u < 0.7 ? Math.min(1, u / 0.25) : Math.max(0, 1 - (u - 0.7) / 0.06);
      out[i] += bq(bp, rnd() * 2 - 1) * grain * grain * syll * chant * amp;
    }
  }
  return auNiveau(boucler(out, Ln), 0.07, 0.8);
}

// ── Les ponctuels ──────────────────────────────────────────────────────────────

// Le PLIP d'un poisson qui GOBE en surface (lot 2) : une goutte, une note qui monte et
// meurt en quelques millisecondes, sur un souffle d'eau à peine audible.
function rendrePlip(v, sr) {
  const rnd = graine(0x9119 + v * 6113);
  const n = Math.round(0.25 * sr), out = new Float32Array(n);
  const bp = biquad('bp', 1400 + rnd() * 600, 0.8, sr);
  for (let j = 0; j < Math.round(0.03 * sr); j += 1) {
    out[j] += bq(bp, rnd() * 2 - 1) * Math.exp(-j / sr / 0.006) * 0.4;
  }
  bulle(out, sr, 0.004, 900 + rnd() * 700, 0.008 + rnd() * 0.006, 1, 2.2);
  if (rnd() < 0.5) bulle(out, sr, 0.03 + rnd() * 0.05, 1500 + rnd() * 900, 0.005, 0.35, 2.4);
  return normaliser(out, sr, 0.8, 0.02);
}

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

// ── La ville (lot 3) ───────────────────────────────────────────────────────────

// Le ROUCOULEMENT d'un pigeon : deux à quatre notes graves, bec fermé — presque un son
// pur, que la gorge gonflée arrondit —, la première roulée (« rrrou »), la plus longue
// arquée (« COU »), la dernière qui retombe. Chaque note glisse entre trois hauteurs
// (départ, sommet, fin, en fraction de la hauteur de l'oiseau).
function rendreRoucoul(v, sr) {
  const rnd = graine(0x9160c + v * 3301);
  const base = 290 + rnd() * 130;
  const notes = [{ d: 0.2 + rnd() * 0.12, f: [0.92, 1.04, 1.07], roule: 0.6, a: 0.7 }];
  notes.push({ d: 0.32 + rnd() * 0.16, f: [1.02, 1.15, 0.94], roule: 0.12, a: 1 });
  if (rnd() < 0.7) notes.push({ d: 0.18 + rnd() * 0.12, f: [0.95, 0.9, 0.84], roule: 0.3, a: 0.6 });
  if (rnd() < 0.3) notes.push({ d: 0.15 + rnd() * 0.08, f: [0.9, 0.88, 0.82], roule: 0.2, a: 0.4 });
  const dur = notes.reduce((s, x) => s + x.d + 0.07, 0.1);
  const n = Math.round(dur * sr), out = new Float32Array(n);
  const lp = biquad('lp', 1100, 0.7, sr), souffle = biquad('bp', 700, 1.2, sr);
  const vitRoule = 24 + rnd() * 6;
  let t0 = 0.02, ph = 0;
  for (const no of notes) {
    const s0 = Math.round(t0 * sr), ns = Math.round(no.d * sr);
    for (let j = 0; j < ns && s0 + j < n; j += 1) {
      const u = j / ns, tt = j / sr;
      const lisse = (x) => x * x * (3 - 2 * x);
      const f = base * (u < 0.4 ? no.f[0] + (no.f[1] - no.f[0]) * lisse(u / 0.4) : no.f[1] + (no.f[2] - no.f[1]) * lisse((u - 0.4) / 0.6));
      ph += (2 * Math.PI * f) / sr;
      const env = Math.min(1, tt / 0.03) * Math.min(1, (no.d - tt) / 0.06);
      const roule = 1 - no.roule * (0.5 + 0.5 * Math.sin(2 * Math.PI * vitRoule * tt));
      const son = Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.12 * Math.sin(3 * ph) + 0.05 * Math.sin(4 * ph);
      out[s0 + j] += (son + bq(souffle, rnd() * 2 - 1) * 0.12) * env * roule * no.a;
    }
    t0 += no.d + 0.04 + rnd() * 0.05;
  }
  for (let i = 0; i < n; i += 1) out[i] = bq(lp, out[i]);
  return normaliser(out, sr, 0.8, 0.04);
}

// Un BATTEMENT d'ailes : un souffle d'air en bande, attaque vive, vite éteint ; les
// premiers CLAQUENT (au décollage, les ailes du pigeon se touchent au-dessus du dos).
function battement(out, sr, t, rnd, amp, claque, bp) {
  const s0 = Math.round(t * sr), n = Math.min(out.length - s0, Math.round(0.09 * sr));
  for (let j = 0; j < n; j += 1) {
    const tt = j / sr;
    const air = bq(bp, rnd() * 2 - 1) * Math.min(1, tt / 0.006) * Math.exp(-tt / 0.024);
    const clac = claque ? (rnd() * 2 - 1) * Math.exp(-tt / 0.0015) * 0.7 : 0;
    out[s0 + j] += (air + clac) * amp;
  }
}
// L'ENVOL de pigeons : des coups d'ailes, 8 à 11 par seconde, qui s'éloignent. Variantes
// 1 et 2 : un pigeon ; 3 et 4 : une volée, quatre à sept oiseaux décalés.
function rendreEnvol(v, sr) {
  const rnd = graine(0xe4f01 + v * 2749);
  const n = Math.round(1.9 * sr), out = new Float32Array(n);
  const oiseaux = v <= 2 ? 1 : 4 + Math.floor(rnd() * 4);
  for (let o = 0; o < oiseaux; o += 1) {
    const bp = biquad('bp', 900 + rnd() * 800, 0.7, sr);
    const rythme = 8 + rnd() * 3, nb = 8 + Math.floor(rnd() * 5), amp = o === 0 ? 1 : 0.45 + 0.45 * rnd();
    let t = o === 0 ? 0.005 : rnd() * 0.3;
    for (let k = 0; k < nb && t < 1.75; k += 1) {
      battement(out, sr, t, rnd, amp * Math.pow(0.84, Math.max(0, k - 2)), k < 2 + Math.floor(rnd() * 2), bp);
      t += (1 / rythme) * (k < 2 ? 1.15 : 1);
    }
  }
  return normaliser(out, sr, 0.8, 0.08);
}

// La FONTAINE : un jet qui retombe dans son bassin — une pluie serrée de gouttelettes
// (700 par seconde, de 1,2 à 5 kHz, beaucoup de petites, peu de grosses), un
// ruissellement en bande, et le grave sourd de l'eau qui plonge. 9 s.
function rendreFontaine(sr) {
  const rnd = graine(0xf0a7a1), L = 9, Ln = Math.round(L * sr), n = Ln + Math.round(0.8 * sr);
  const gouttes = new Float32Array(n), ruis = new Float32Array(n), plonge = new Float32Array(n);
  for (let t = rnd() * 0.01; t < n / sr - 0.05; t += attente(rnd, 700)) {
    const f0 = Math.exp(Math.log(1200) + rnd() * (Math.log(5000) - Math.log(1200)));
    bulle(gouttes, sr, t, f0, 0.0015 + 0.003 * rnd(), Math.pow(rnd(), 2), 2);
  }
  const env = periodique(rnd, L, 5, 0.8);
  const bpR = biquad('bp', 2600, 0.5, sr), bpP = biquad('bp', 380, 0.7, sr), r = rose(rnd);
  let g = 0;
  for (let i = 0; i < n; i += 1) {
    if ((i & 63) === 0) g = env((i / sr) % L);
    ruis[i] = bq(bpR, rnd() * 2 - 1) * (0.75 + 0.25 * g);
    plonge[i] = bq(bpP, r()) * (0.8 + 0.2 * g);
  }
  auNiveau(gouttes, 1, 1e9); auNiveau(ruis, 1, 1e9); auNiveau(plonge, 1, 1e9);
  return auNiveau(boucler(melanger(n, [[gouttes, 1], [ruis, 0.4], [plonge, 0.5]]), Ln), 0.1);
}

// Le DRONE des âges cosmiques : quatre rotors, chacun une note riche (le passage des
// pales, vers 150 Hz), légèrement désaccordés — leurs battements font vivre le son —, le
// sifflement d'un moteur électrique et un souffle d'air. Toutes les fréquences sont des
// multiples de ¼ Hz : la boucle de 4 s tombe juste ; seul le souffle se boucle en fondu.
function rendreDrone(sr) {
  const rnd = graine(0xd70e5), L = 4, Ln = L * sr;
  const rotors = new Float32Array(Ln);
  for (const f of [148, 151.5, 155, 158.25]) {
    const ph = rnd() * 2 * Math.PI, a = 0.7 + 0.3 * rnd();
    for (let h = 1; h <= 10; h += 1) {
      const w = (2 * Math.PI * f * h) / sr, g = a / Math.pow(h, 1.25), p = ph * h;
      for (let i = 0; i < Ln; i += 1) rotors[i] += Math.sin(w * i + p) * g;
    }
  }
  const sifflet = new Float32Array(Ln);
  for (let i = 0; i < Ln; i += 1) sifflet[i] = Math.sin((2 * Math.PI * 1180 * i) / sr) + 0.4 * Math.sin((2 * Math.PI * 2360 * i) / sr);
  const n = Ln + Math.round(0.4 * sr), brut = new Float32Array(n);
  const hp = biquad('hp', 1500, 0.7, sr), lp = biquad('lp', 6000, 0.7, sr);
  for (let i = 0; i < n; i += 1) brut[i] = bq(lp, bq(hp, rnd() * 2 - 1));
  const air = boucler(brut, Ln);
  const lpR = biquad('lp', 2200, 0.7, sr);
  for (let k = 0; k < 2; k += 1) for (let i = 0; i < Ln; i += 1) { const y = bq(lpR, rotors[i]); if (k) rotors[i] = y; }
  auNiveau(rotors, 1, 1e9); auNiveau(sifflet, 1, 1e9); auNiveau(air, 1, 1e9);
  return auNiveau(melanger(Ln, [[rotors, 1], [sifflet, 0.05], [air, 0.12]]), 0.1);
}

// La CLOCHE d'un bateau (lot 4) : deux ou trois coups d'une petite cloche de bronze (la
// cloche de modulation de fréquence de synth.js, métal de bronze), le dernier laissé
// sonner. Variante 1 : deux coups ; variante 2 : trois, un ton plus bas.
function rendreClocheBateau(v, sr) {
  const f = v === 1 ? 1046 : 932, coups = v === 1 ? 2 : 3;
  const out = new Float32Array(Math.round((0.4 * coups + 2.2) * sr));
  for (let k = 0; k < coups; k += 1) cloche(out, sr, 0.01 + k * 0.38, f, 1.2, k === coups - 1 ? 1 : 0.8, { ratio: 1.41, indice: 2.6, tenue: 1.6 });
  return normaliser(out, sr, 0.8, 0.2);
}

// Le BOURDON ÉLECTRIQUE d'un atelier du Néon (lot 4) : le ronflement d'un transformateur
// (100 Hz et ses harmoniques, les impaires plus fortes — le grain d'un noyau de fer), qui
// respire à peine, et un grésillement d'arc rare. Les fréquences tombent juste sur la
// boucle de 4 s ; seul le grésillement, un bruit, se boucle en fondu.
function rendreElectrique(sr) {
  const rnd = graine(0xe1ec7), L = 4, Ln = L * sr;
  const ronfle = new Float32Array(Ln);
  for (let h = 1; h <= 9; h += 1) {
    const w = (2 * Math.PI * 100 * h) / sr, a = (h % 2 ? 1 : 0.45) / Math.pow(h, 0.9), p = rnd() * 2 * Math.PI;
    for (let i = 0; i < Ln; i += 1) ronfle[i] += Math.sin(w * i + p) * a;
  }
  for (let i = 0; i < Ln; i += 1) ronfle[i] *= 0.85 + 0.15 * Math.sin((2 * Math.PI * i) / Ln);
  const n = Ln + Math.round(0.2 * sr), brut = new Float32Array(n);
  const bp = biquad('bp', 3200, 0.8, sr);
  let arc = 0;
  for (let i = 0; i < n; i += 1) {
    if (rnd() < 0.00008) arc = 0.5 + 0.5 * rnd();
    arc *= 0.9993;
    brut[i] = bq(bp, rnd() * 2 - 1) * (0.15 + arc);
  }
  const gres = boucler(brut, Ln);
  auNiveau(ronfle, 1, 1e9); auNiveau(gres, 1, 1e9);
  return auNiveau(melanger(Ln, [[ronfle, 1], [gres, 0.08]]), 0.12);
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
    case 'grillons': return rendreGrillons(sr);
    case 'stridulations': return rendreStridulations(sr);
    case 'cigales': return rendreCigales(sr);
    case 'fontaine': return rendreFontaine(sr);
    case 'drone': return rendreDrone(sr);
    case 'electrique': return rendreElectrique(sr);
    default: break;
  }
  let m = /^plouf([1-6])$/.exec(nom);
  if (m) return rendrePlouf(Number(m[1]), sr);
  m = /^sortie([1-3])$/.exec(nom);
  if (m) return rendreSortie(Number(m[1]), sr);
  m = /^plip([1-4])$/.exec(nom);
  if (m) return rendrePlip(Number(m[1]), sr);
  m = /^roucoul([1-6])$/.exec(nom);
  if (m) return rendreRoucoul(Number(m[1]), sr);
  m = /^envol([1-4])$/.exec(nom);
  if (m) return rendreEnvol(Number(m[1]), sr);
  m = /^clochebateau([1-2])$/.exec(nom);
  if (m) return rendreClocheBateau(Number(m[1]), sr);
  throw new Error('son de paysage inconnu : ' + nom);
}
