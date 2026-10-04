// LES BRUITAGES DE LA MACHINE À SOUS (2026-10-03, Raph : « vas-y pour la v2, commence
// par le son »). Tout est JOUÉ PAR LE CODE (synth.js), comme la mélodie de la scène, et
// dans l'habit de l'âge — le même que la machine (plaisirsSlotsArt.js) :
//   · FONTE  : un meuble de fonte — cliquets de fer, la CLOCHE de la Liberty Bell qui
//              sonne aux gains (les premières machines sonnaient une cloche), un cornet ;
//   · NÉON   : un bandit électrique — moteur, ressort du levier, vibraphone, fanfare ;
//   · COSMIQUE : un cadre de lumière — souffles, cloches de verre, scintillements.
// Chaque son est rendu UNE fois par habit (quelques ms) puis gardé. `rendreSon` est PUR
// (aléa à graine) : le test les écoute tous à la mesure ; la lecture passe par le
// contexte audio du jeu et suit Options › Son › Bruitages.
import { graine, cloche, partiels, tambour, salle, normaliser, jouerTampon, hz } from './synth.js';
import { getSfxEnabled, getSfxVolume, duckMusic } from '../core/main.js';

export const SFX_SR = 32000;

// ── Petits gestes de synthèse ─────────────────────────────────────────────────
// Un CLIC : un souffle très bref, filtré vers l'aigu, et la petite résonance de la pièce
// qui le fait (fer, plastique, verre).
function clic(out, sr, t, g, rnd, f = 2200, dec = 60) {
  const s0 = Math.round(t * sr), n = Math.min(out.length - s0, Math.round(0.05 * sr));
  let lp = 0, ph = 0;
  for (let i = 0; i < n; i += 1) {
    const tt = i / sr, w = rnd() * 2 - 1;
    lp += 0.3 * (w - lp);
    ph += (2 * Math.PI * f) / sr;
    out[s0 + i] += ((w - lp) * Math.exp(-tt * 400) * 0.8 + Math.sin(ph) * Math.exp(-tt * dec) * 0.5) * g;
  }
}
// Un COUP SOURD : la masse qui s'arrête (hauteur qui tombe).
function coup(out, sr, t, g, haut = 130, bas = 55, sec = 22) {
  const s0 = Math.round(t * sr), n = Math.min(out.length - s0, Math.round(0.25 * sr));
  let ph = 0;
  for (let i = 0; i < n; i += 1) {
    const tt = i / sr;
    ph += (2 * Math.PI * (bas + (haut - bas) * Math.exp(-tt * 40))) / sr;
    out[s0 + i] += Math.sin(ph) * Math.exp(-tt * sec) * g;
  }
}
// Un SOUFFLE : du bruit passé dans une bande qui glisse de `f0` à `f1`.
function souffle(out, sr, t, dur, g, rnd, f0, f1, env = null) {
  const s0 = Math.round(t * sr), n = Math.min(out.length - s0, Math.round(dur * sr));
  let lp1 = 0, lp2 = 0;
  for (let i = 0; i < n; i += 1) {
    const u = i / n, f = f0 + (f1 - f0) * u, a = Math.min(1, (2 * Math.PI * f) / sr);
    const w = rnd() * 2 - 1;
    lp1 += a * (w - lp1); lp2 += a * 0.5 * (lp1 - lp2);
    const e = env ? env(u) : Math.sin(Math.PI * u);
    out[s0 + i] += (lp1 - lp2) * e * g * 2.2;
  }
}
// Une CLOCHE frappée : des partiels inharmoniques (le bourdon, la tierce mineure de la
// cloche, la quinte, l'octave…), les aigus meurent vite.
function clocheFrappee(out, sr, t, f, g, tenue = 1) {
  partiels(out, sr, t, [
    { f: f * 0.5, a: 0.35, d: 0.8 / tenue }, { f, a: 1, d: 1.6 / tenue }, { f: f * 1.19, a: 0.5, d: 2.2 / tenue },
    { f: f * 1.5, a: 0.35, d: 2.8 / tenue }, { f: f * 2.0, a: 0.4, d: 3.5 / tenue }, { f: f * 2.52, a: 0.25, d: 5 / tenue },
    { f: f * 3.0, a: 0.12, d: 7 / tenue }
  ], 3, g, { attaque: 0.002, etouffe: 0.5 });   // 3 s : la cloche s'éteint d'elle-même (couper net claquerait)
}
// Une PIÈCE qui tinte : deux partiels aigus, inharmoniques, très courts.
function piece(out, sr, t, f, g) {
  partiels(out, sr, t, [{ f, a: 1, d: 14 }, { f: f * 2.76, a: 0.5, d: 22 }, { f: f * 5.4, a: 0.2, d: 30 }], 0.02, g, { attaque: 0.001, etouffe: 2 });
}
// Un CUIVRE (cornet, fanfare) : des harmoniques qui s'ouvrent à l'attaque, un vibrato.
function cuivre(out, sr, t, f, dur, g, brillant = 1) {
  const s0 = Math.round(t * sr), n = Math.min(out.length - s0, Math.round((dur + 0.12) * sr));
  const ph = new Float64Array(8);
  for (let i = 0; i < n; i += 1) {
    const tt = i / sr, env = Math.min(1, tt / 0.03) * (tt > dur ? Math.max(0, 1 - (tt - dur) / 0.12) : 1);
    const open = Math.min(1, tt / 0.08), vib = 1 + (tt > 0.15 ? 0.006 * Math.sin(2 * Math.PI * 5.5 * tt) : 0);
    let v = 0;
    for (let k = 1; k <= 8; k += 1) {
      ph[k - 1] += (2 * Math.PI * f * k * vib) / sr;
      v += (Math.sin(ph[k - 1]) / k) * (k === 1 ? 1 : open * brillant * Math.exp(-(k - 1) * 0.28));
    }
    out[s0 + i] += v * env * g;
  }
}
// La note de MÉLODIE de l'habit : vibraphone (néon), cloche de verre (cosmique), carillon
// de laiton (fonte).
function note(out, sr, t, f, dur, g, look) {
  if (look === 'neon') partiels(out, sr, t, [{ f, a: 1, d: 1.6 }, { f: f * 4, a: 0.22, d: 6 }, { f: f * 9.8, a: 0.04, d: 12 }], dur, g, { attaque: 0.002, etouffe: 4, mod: (tt) => 1 + 0.25 * Math.sin(2 * Math.PI * 5.5 * tt) });
  else if (look === 'cosmic') cloche(out, sr, t, f, dur, g, { ratio: 2.76, indice: 0.9, tenue: 2.2 });
  else cloche(out, sr, t, f, dur, g, { ratio: 1.4, indice: 1.1, tenue: 3.2 });
}
// La pluie de PIÈCES : `n` tintements au hasard sur `dur` secondes, de plus en plus rares.
function pluie(out, sr, t, dur, n, g, rnd) {
  for (let k = 0; k < n; k += 1) {
    const u = Math.pow(rnd(), 1.6);
    piece(out, sr, t + u * dur, 2400 + rnd() * 2600, g * (0.5 + rnd() * 0.5) * (1 - u * 0.6));
  }
}

// ── Les sons, un par un ───────────────────────────────────────────────────────
// Chaque entrée : (out, sr, look, rnd) ; `dur` : la longueur du tampon (s).
const SONS = {
  // Le LEVIER : le cliquet qui arme, puis le ressort (néon), la masse de fonte, le souffle.
  levier: {
    dur: 0.6,
    jouer(o, sr, look, rnd) {
      for (let k = 0; k < 6; k += 1) clic(o, sr, 0.02 + k * (0.032 - k * 0.003), 0.35, rnd, look === 'cosmic' ? 3200 : look === 'neon' ? 2400 : 1600, 90);
      if (look === 'fonte') {
        coup(o, sr, 0.2, 0.9, 150, 60, 14);
        partiels(o, sr, 0.2, [{ f: 220, a: 1, d: 9 }, { f: 531, a: 0.6, d: 12 }, { f: 1130, a: 0.35, d: 18 }], 0.05, 0.35, { attaque: 0.001, etouffe: 4 });
      } else if (look === 'neon') {
        // Le ressort : une tôle qui vibre, sa hauteur qui ondule et s'éteint.
        const s0 = Math.round(0.2 * sr), n = Math.round(0.35 * sr);
        let ph = 0;
        for (let i = 0; i < n; i += 1) { const tt = i / sr; ph += (2 * Math.PI * 190 * (1 + 0.35 * Math.sin(2 * Math.PI * 14 * tt) * Math.exp(-tt * 6))) / sr; o[s0 + i] += Math.sin(ph) * Math.exp(-tt * 9) * 0.5; }
        coup(o, sr, 0.2, 0.5, 120, 60, 25);
      } else {
        souffle(o, sr, 0.1, 0.45, 0.6, rnd, 400, 3200);
        cloche(o, sr, 0.36, 2637, 0.1, 0.25, { ratio: 2.76, indice: 0.8, tenue: 6 });
      }
    }
  },
  // Le TIC d'un symbole qui passe la fenêtre (rouleau qui ralentit).
  tic: {
    dur: 0.06,
    jouer(o, sr, look, rnd) { clic(o, sr, 0, 0.6, rnd, look === 'cosmic' ? 3400 : look === 'neon' ? 2300 : 1500, 70); }
  },
  // L'ARRÊT d'un rouleau : le coup, le clic du cran, un petit tremblement de la fonte.
  arret: {
    dur: 0.32,
    jouer(o, sr, look, rnd) {
      coup(o, sr, 0, look === 'cosmic' ? 0.5 : 0.9, look === 'fonte' ? 140 : 120, 52, 20);
      clic(o, sr, 0.002, 0.5, rnd, look === 'cosmic' ? 3000 : look === 'neon' ? 2000 : 1300, 40);
      if (look === 'fonte') clic(o, sr, 0.04, 0.18, rnd, 1100, 60);
      if (look === 'cosmic') cloche(o, sr, 0, 659, 0.1, 0.3, { ratio: 2.76, indice: 0.7, tenue: 5 });
    }
  },
  // La TENSION : le troisième rouleau traîne (deux étoiles ou deux roues déjà là).
  tension: {
    dur: 1.1,
    jouer(o, sr, look, rnd) {
      if (look === 'fonte') {
        // Un roulement de caisse claire qui s'accélère.
        let t = 0, gap = 0.09;
        while (t < 1.0) { tambour(o, sr, t, 0.25 + t * 0.35, rnd, { haut: 320, bas: 200, sec: 28, frappe: 1.2 }); t += gap; gap = Math.max(0.03, gap * 0.9); }
      } else if (look === 'neon') {
        // Un accord qui monte, en trémolo.
        for (const r of [1, 1.26, 1.5]) {
          const s0 = 0, n = Math.round(1.05 * sr);
          let ph = 0;
          for (let i = 0; i < n; i += 1) { const tt = i / sr, f = 220 * r * Math.pow(2, tt * 1.0); ph += (2 * Math.PI * f) / sr; o[s0 + i] += Math.sin(ph) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 12 * tt)) * Math.min(1, tt * 3) * 0.22; }
        }
      } else {
        for (let k = 0; k < 14; k += 1) cloche(o, sr, k * 0.07, 523 * Math.pow(2, k / 7), 0.1, 0.25 + k * 0.02, { ratio: 2.76, indice: 0.8, tenue: 4 });
        souffle(o, sr, 0, 1.05, 0.25, rnd, 600, 5000, (u) => u);
      }
    }
  },
  // Les GAINS, en trois mesures : un petit gain, un beau gain, un GROS gain.
  gain1: {
    dur: 0.9,
    jouer(o, sr, look) {
      if (look === 'fonte') clocheFrappee(o, sr, 0, 880, 0.7);
      else ['C6', 'E6', 'G6'].forEach((n, k) => note(o, sr, k * 0.08, hz(n), 0.25, 0.5, look));
    }
  },
  gain2: {
    dur: 1.6,
    jouer(o, sr, look, rnd) {
      if (look === 'fonte') { clocheFrappee(o, sr, 0, 880, 0.7); clocheFrappee(o, sr, 0.35, 880, 0.6); }
      ['C5', 'E5', 'G5', 'C6', 'E6'].forEach((n, k) => note(o, sr, 0.05 + k * 0.08, hz(n), 0.3, 0.42, look));
      ['C6', 'E6', 'G6'].forEach((n) => note(o, sr, 0.5, hz(n), 0.8, 0.3, look));
      pluie(o, sr, 0.45, 0.8, 8, 0.25, rnd);
    }
  },
  gain3: {
    dur: 3.0,
    jouer(o, sr, look, rnd) {
      fanfare(o, sr, look, 0, 1);
      if (look === 'fonte') for (let k = 0; k < 4; k += 1) clocheFrappee(o, sr, 0.9 + k * 0.28, 880, 0.55);
      pluie(o, sr, 0.8, 2.0, 40, 0.35, rnd);
    }
  },
  // La PLUIE DE PIÈCES seule (le compteur d'un gros gain).
  pieces: {
    dur: 1.6,
    jouer(o, sr, look, rnd) { pluie(o, sr, 0, 1.4, 26, 0.4, rnd); }
  },
  // Les TOURS GRATUITS : une montée scintillante, puis l'accord.
  tours: {
    dur: 1.8,
    jouer(o, sr, look, rnd) {
      const gamme = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'A6', 'C7'];
      gamme.forEach((n, k) => note(o, sr, k * 0.055, hz(n), 0.18, 0.35, look === 'neon' ? 'cosmic' : look));
      ['C6', 'E6', 'G6', 'C7'].forEach((n) => note(o, sr, 0.65, hz(n), 1.0, 0.28, look));
      souffle(o, sr, 0, 0.7, 0.25, rnd, 1500, 7000, (u) => u * (1 - u) * 4);
    }
  },
  // LA ROUE est déclenchée : une fanfare.
  roue: {
    dur: 1.8,
    jouer(o, sr, look) { fanfare(o, sr, look, 0, 0.8); }
  },
  // Le CLIQUET de la roue : un picot qui passe sous la lamelle.
  cliquet: {
    dur: 0.05,
    jouer(o, sr, look, rnd) {
      clic(o, sr, 0, 0.7, rnd, look === 'cosmic' ? 2800 : look === 'neon' ? 1900 : 1200, 110);
      coup(o, sr, 0, 0.25, 260, 160, 60);
    }
  },
  // Le JACKPOT : la grande fanfare, les cloches, une averse de pièces.
  jackpot: {
    dur: 4.2,
    jouer(o, sr, look, rnd) {
      fanfare(o, sr, look, 0, 1.2);
      for (let k = 0; k < 8; k += 1) clocheFrappee(o, sr, 1.0 + k * 0.22, k % 2 ? 1175 : 880, 0.45);
      pluie(o, sr, 0.9, 3.0, 90, 0.4, rnd);
    }
  },
  // Le COFFRE qui s'ouvre : le couvercle grince, ce qu'il y a dedans brille.
  coffre: {
    dur: 1.1,
    jouer(o, sr, look, rnd) {
      souffle(o, sr, 0, 0.45, 0.6, rnd, 260, 900, (u) => Math.sin(Math.PI * u) * (0.6 + 0.4 * Math.sin(u * 60)));
      coup(o, sr, 0.42, 0.5, 110, 60, 18);
      ['G6', 'C7', 'E7'].forEach((n, k) => note(o, sr, 0.5 + k * 0.07, hz(n), 0.3, 0.3, 'cosmic'));
    }
  },
  // HOLD & WIN : la pièce qui TOMBE et se fige (un poids, deux tintements) ; la RELANCE
  // (les cases vides repartent : un souffle, quelques cliquets).
  atterrit: {
    dur: 0.5,
    jouer(o, sr, look, rnd) {
      coup(o, sr, 0, 0.8, 170, 70, 26);
      piece(o, sr, 0.005, 2900 + rnd() * 400, 0.6);
      piece(o, sr, 0.06, 3600 + rnd() * 400, 0.35);
      if (look === 'fonte') clic(o, sr, 0.01, 0.3, rnd, 1200, 40);
    }
  },
  relance: {
    dur: 0.7,
    jouer(o, sr, look, rnd) {
      souffle(o, sr, 0, 0.55, 0.45, rnd, look === 'cosmic' ? 1500 : 500, look === 'cosmic' ? 4000 : 1600);
      for (let k = 0; k < 6; k += 1) clic(o, sr, 0.05 + k * 0.08, 0.25, rnd, look === 'cosmic' ? 3200 : look === 'neon' ? 2200 : 1500, 80);
    }
  },
  // Le VOL D'ICARE offert : trois battements d'aile, puis un carillon qui monte.
  vol: {
    dur: 1.3,
    jouer(o, sr, look, rnd) {
      for (let k = 0; k < 3; k += 1) souffle(o, sr, k * 0.18, 0.16, 0.8, rnd, 300, 1400);
      ['E6', 'A6', 'E7'].forEach((n, k) => note(o, sr, 0.55 + k * 0.1, hz(n), 0.4, 0.35, look));
    }
  }
};
// La FANFARE : « ta-ta-ta-taaa » (sol sol sol do), au cornet (fonte), aux cuivres (néon),
// aux cloches de verre (cosmique). `ampleur` : 1 pour un gros gain, 1.2 pour le jackpot.
function fanfare(o, sr, look, t, ampleur) {
  const notes = [['G4', 0, 0.11], ['G4', 0.14, 0.11], ['G4', 0.28, 0.11], ['C5', 0.42, 0.6 * ampleur]];
  for (const [n, at, d] of notes) {
    if (look === 'cosmic') { note(o, sr, t + at, hz(n, 1), d, 0.5, look); note(o, sr, t + at, hz(n, 2), d, 0.2, look); }
    else {
      cuivre(o, sr, t + at, hz(n), d, 0.32, look === 'neon' ? 1 : 0.7);
      if (look === 'neon') cuivre(o, sr, t + at, hz(n) * 1.26, d, 0.18, 1);
    }
  }
  if (ampleur >= 1) {
    const at = t + 0.42 + 0.6 * ampleur;
    for (const n of ['C5', 'E5', 'G5', 'C6']) {
      if (look === 'cosmic') note(o, sr, at, hz(n, 1), 0.9, 0.3, look);
      else cuivre(o, sr, at, hz(n), 0.7, 0.2, look === 'neon' ? 1 : 0.7);
    }
  }
}

export const SONS_SLOTS = Object.keys(SONS);
const NIVEAU = { tic: 0.35, cliquet: 0.4, arret: 0.7, levier: 0.75, tension: 0.6, coffre: 0.7, pieces: 0.6, atterrit: 0.8, relance: 0.55 };

// Le son `nom` dans l'habit `look` : Float32Array normalisé (crête 0,8), réverbéré
// selon la salle (fonte : salon de bois ; néon : casino ; cosmique : la grande nef).
export function rendreSon(nom, look, sr = SFX_SR) {
  const S = SONS[nom];
  if (!S) return null;
  const out = new Float32Array(Math.round(S.dur * sr));
  S.jouer(out, sr, look, graine(nom.length * 131 + (look === 'fonte' ? 1 : look === 'neon' ? 2 : 3) * 977));
  const court = S.dur < 0.1;
  const mix = court ? out : salle(out, sr, look === 'cosmic' ? 0.85 : 0.4, look === 'cosmic' ? 0.32 : look === 'fonte' ? 0.18 : 0.14);
  return normaliser(mix, sr, 0.8, court ? 0.005 : 0.04);
}

// ── La lecture ─────────────────────────────────────────────────────────────────
const cache = new Map();
const ronrons = new Map();
function tampon(nom, look) {
  const k = nom + '|' + look;
  if (!cache.has(k)) cache.set(k, rendreSon(nom, look));
  return cache.get(k);
}
// Prépare les sons d'un habit à l'avance (au montage de la machine), UN PAR UN : tout
// rendre d'un coup coûte ~250 ms, un à-coup visible (et le Chrome de Raph rend en
// logiciel). Les plus utiles d'abord, le jackpot en dernier. Rend de quoi annuler.
const ORDRE = ['levier', 'tic', 'arret', 'ronron', 'cliquet', 'gain1', 'tension', 'atterrit', 'relance', 'roue', 'tours', 'gain2', 'coffre', 'vol', 'pieces', 'gain3', 'jackpot'];
export function prechaufferSons(look) {
  let i = 0, id = null;
  const suite = () => {
    const nom = ORDRE[i++];
    if (!nom) return;
    if (nom === 'ronron') { if (!ronrons.has(look)) ronrons.set(look, rendreRonron(look)); } else tampon(nom, look);
    id = setTimeout(suite, 40);
  };
  id = setTimeout(suite, 40);
  return () => clearTimeout(id);
}
// Joue `nom` (fonte | neon | cosmic). `fort` : 0 à 1, le volume relatif (les tics des
// rouleaux qui ralentissent montent en approchant de l'arrêt).
export function sonSlots(nom, look, fort = 1) {
  if (typeof window === 'undefined' || !getSfxEnabled()) return null;
  const vol = getSfxVolume() * (NIVEAU[nom] ?? 1) * fort;
  if (vol <= 0) return null;
  const data = tampon(nom, look);
  // Les gros moments couvrent la musique un instant.
  if (nom === 'gain3' || nom === 'jackpot' || nom === 'roue' || nom === 'tours') duckMusic((data.length / SFX_SR) * 1000 - 400);
  return jouerTampon(data, SFX_SR, vol);
}

// LE RONRONNEMENT des rouleaux qui tournent : une boucle d'une seconde (moteur au néon,
// mécanisme à la fonte, souffle au cosmique) dont le volume suit la vitesse.
function rendreRonron(look, sr = SFX_SR) {
  const n = sr, out = new Float32Array(n), rnd = graine(4242 + look.length);
  if (look === 'fonte') {
    // Les cames qui claquent (40 par seconde, un peu irrégulières) et un grondement.
    for (let k = 0; k < 40; k += 1) clic(out, sr, k / 40 + rnd() * 0.004, 0.35, rnd, 900 + rnd() * 300, 120);
    souffle(out, sr, 0, 1, 0.35, rnd, 120, 140, () => 1);
  } else if (look === 'neon') {
    // Le moteur : 50 Hz et ses harmoniques, un frottement.
    for (let i = 0; i < n; i += 1) { const tt = i / sr; out[i] += (Math.sin(2 * Math.PI * 50 * tt) * 0.4 + Math.sin(2 * Math.PI * 100 * tt) * 0.25 + Math.sin(2 * Math.PI * 150 * tt) * 0.12) * 0.6; }
    souffle(out, sr, 0, 1, 0.3, rnd, 900, 900, () => 1);
  } else {
    for (let i = 0; i < n; i += 1) { const tt = i / sr; out[i] += (Math.sin(2 * Math.PI * 220 * tt) + Math.sin(2 * Math.PI * 330 * tt) * 0.6) * 0.15 * (1 + 0.3 * Math.sin(2 * Math.PI * 6 * tt)); }
    souffle(out, sr, 0, 1, 0.4, rnd, 2000, 2000, () => 1);
  }
  // La boucle sans couture : la fin se fond dans le début.
  const f = Math.round(0.06 * sr);
  for (let i = 0; i < f; i += 1) { const a = i / f; out[i] = out[i] * a + out[n - f + i] * (1 - a); }
  return normaliser(out.subarray(0, n - f), sr, 0.6, 0);
}
// Rend { vitesse(v 0..1), stop() } ou null (bruitages coupés, pas de navigateur).
export function ronronSlots(look) {
  if (typeof window === 'undefined' || !getSfxEnabled()) return null;
  if (!ronrons.has(look)) ronrons.set(look, rendreRonron(look));
  const vol = getSfxVolume() * 0.32;
  const p = jouerTampon(ronrons.get(look), SFX_SR, 0, { loop: true });
  if (!p) return null;
  return {
    vitesse(v) { p.gain.gain.setTargetAtTime(vol * Math.max(0, Math.min(1, v)), p.ctx.currentTime, 0.04); },
    stop() { p.gain.gain.setTargetAtTime(0, p.ctx.currentTime, 0.05); setTimeout(() => p.stop(), 300); }
  };
}
export { rendreRonron };
