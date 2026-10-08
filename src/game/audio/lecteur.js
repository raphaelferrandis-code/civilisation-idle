// LE LECTEUR DES BRUITAGES (docs/PLAN-AMBIANCE-SONORE.md, lot 10) : il fait rendre des
// sons synthétisés dans le Worker des sons (sinon sur la page), les garde prêts, et les
// joue par un gain et un limiteur à lui, sous Options › Son › Bruitages (getSfxEnabled,
// getSfxVolume). Partagé par les grands moments (moments/moments.js) et les tables de
// la Maison des Plaisirs (tables/tables.js) : chacun a le sien, sa synthèse, ses niveaux.
//
//   creerLecteur({ quoi, rendre, sr, niveau, fichier }) :
//     · quoi    le nom de la tâche du Worker (synthese.worker.js) ;
//     · rendre  la synthèse pure, sur la page, quand le Worker ne répond pas ;
//     · sr      sa fréquence d'échantillonnage ;
//     · niveau  le niveau d'un son (son nom → gain), × Bruitages ;
//     · fichier (facultatif) l'adresse d'un son ENREGISTRÉ (son nom → url, ou null) :
//               il se charge et se décode au lieu de se synthétiser (lot 11 : la foule
//               des courses, prise aux enregistrements du paysage).
//   Il rend { tampons, enRoute, compte, demander, voix, jouer, bus, niveauSortie }.

import { audioCtx, enTampon, retenirContexte, relacherContexte } from './synth.js';
import { getSfxEnabled, getSfxVolume } from '../core/main.js';
import { rendreAilleurs } from './syntheseAilleurs.js';

const horloge = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Pose une cible sur un paramètre audio, en douceur (constante de temps `tau`, s).
export const cibler = (param, v, ctx, tau) => {
  try { param.setTargetAtTime(v, ctx.currentTime, tau); } catch { param.value = v; }
};

export function creerLecteur({ quoi, rendre, sr, niveau = () => 1, fichier = null }) {
  const L = { tampons: new Map(), enRoute: new Map(), compte: {}, sortie: null, _lecture: null, _decodeur: null };

  // Un enregistrement se décode à SA fréquence (`sr`), dans un contexte hors ligne :
  // celui du jeu le décoderait à la sienne, plus lourd (comme le paysage, § 3.9).
  function decodeur() {
    if (L._decodeur) return L._decodeur;
    const H = typeof window !== 'undefined' && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
    try { L._decodeur = H ? new H(1, 1, sr) : audioCtx(); } catch { L._decodeur = audioCtx(); }
    return L._decodeur;
  }
  function charger(url) {
    if (typeof fetch !== 'function') return Promise.resolve(null);
    return fetch(url)
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then((octets) => { const d = decodeur(); return d ? d.decodeAudioData(octets) : null; });
  }

  // Le tampon d'un son : rendu dans le Worker, sinon ici ; ou chargé, s'il est
  // enregistré. Une promesse par son ; un son introuvable rend null, sans erreur.
  function demander(nom) {
    if (L.tampons.has(nom)) return Promise.resolve(L.tampons.get(nom));
    if (L.enRoute.has(nom)) return L.enRoute.get(nom);
    const url = fichier ? fichier(nom) : null;
    const p = (url
      ? charger(url)
      : rendreAilleurs({ quoi, nom }).catch(() => rendre(nom)).then((data) => (data ? enTampon(data, sr) : null)))
      .then((t) => {
        if (t) L.tampons.set(nom, t);
        return t || null;
      })
      .catch(() => null)
      .finally(() => L.enRoute.delete(nom));
    L.enRoute.set(nom, p);
    return p;
  }

  // La sortie : un gain, un limiteur (rien sous −6 dBFS), une sonde pour le banc.
  function sortie() {
    const ctx = audioCtx();
    if (!ctx) return null;
    if (L.sortie && L.sortie.ctx === ctx) return L.sortie;
    const gain = ctx.createGain();
    const limiteur = ctx.createDynamicsCompressor();
    limiteur.threshold.value = -6; limiteur.knee.value = 4; limiteur.ratio.value = 20;
    limiteur.attack.value = 0.002; limiteur.release.value = 0.25;
    gain.connect(limiteur); limiteur.connect(ctx.destination);
    const sonde = typeof ctx.createAnalyser === 'function' ? ctx.createAnalyser() : null;
    if (sonde) { sonde.fftSize = 2048; limiteur.connect(sonde); }
    L.sortie = { ctx, gain, limiteur, sonde };
    return L.sortie;
  }

  // Ce qui sort, en dBFS efficaces (banc d'écoute, vérifications).
  function niveauSortie() {
    const s = L.sortie && L.sortie.sonde;
    if (!s || typeof s.getFloatTimeDomainData !== 'function') return null;
    if (!L._lecture || L._lecture.length !== s.fftSize) L._lecture = new Float32Array(s.fftSize);
    s.getFloatTimeDomainData(L._lecture);
    let e = 0;
    for (let i = 0; i < L._lecture.length; i += 1) e += L._lecture[i] * L._lecture[i];
    return 10 * Math.log10(e / L._lecture.length + 1e-12);
  }

  // Un sous-bus (un gain sur la sortie) : les voix d'une scène (un tour de roulette, une
  // course), qu'on coupe d'un coup quand la table se ferme. Rend { ctx, noeud, couper }.
  function bus() {
    const S = sortie();
    if (!S) return null;
    const noeud = S.ctx.createGain();
    noeud.connect(S.gain);
    return {
      ctx: S.ctx, noeud,
      couper(tau = 0.06) {
        cibler(noeud.gain, 0, S.ctx, tau);
        setTimeout(() => { try { noeud.disconnect(); } catch { /* déjà débranché */ } }, 400);
      },
    };
  }

  // Joue un son prêt, au gain `g` (× niveau × Bruitages), placé à `pan`, à `vitesse`,
  // dans `dans` secondes ; `boucle` : une boucle muette au départ, que l'appelant monte ;
  // `vers` : un sous-bus (bus()) plutôt que la sortie.
  // Rend la voix { source, gain, pan, ctx, t0 } ou null (son pas encore prêt : il se rend).
  function voix(nom, { g = 1, pan = 0, vitesse = 1, dans = 0, boucle = false, vers = null } = {}) {
    if (!getSfxEnabled()) return null;
    const t = L.tampons.get(nom);
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
    s.connect(gn); gn.connect(p); p.connect(vers && vers.noeud && vers.ctx === ctx ? vers.noeud : S.gain);
    retenirContexte();
    s.onended = () => {
      try { s.disconnect(); gn.disconnect(); p.disconnect(); } catch { /* déjà débranchés */ }
      relacherContexte();
    };
    const t0 = ctx.currentTime + Math.max(0, dans);
    s.start(t0);
    L.compte[nom] = (L.compte[nom] || 0) + 1;
    return { source: s, gain: gn, pan: p, ctx, t0 };
  }

  // Le son tout de suite s'il est prêt ; sinon dès qu'il l'est, s'il arrive à temps.
  function jouer(nom, opts = {}, delaiMax = 0.6) {
    if (!getSfxEnabled()) return;
    if (L.tampons.has(nom)) { voix(nom, opts); return; }
    const t0 = horloge();
    demander(nom).then(() => { if ((horloge() - t0) / 1000 <= delaiMax) voix(nom, opts); });
  }

  return Object.assign(L, { demander, voix, jouer, bus, niveauSortie });
}
