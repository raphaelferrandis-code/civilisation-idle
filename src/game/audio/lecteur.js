// LE LECTEUR DES BRUITAGES (docs/PLAN-AMBIANCE-SONORE.md, lot 10) : il fait rendre des
// sons synthétisés dans le Worker des sons (sinon sur la page), les garde prêts, et les
// joue par un gain et un limiteur à lui, sous Options › Son › Bruitages (getSfxEnabled,
// getSfxVolume). Partagé par les grands moments (moments/moments.js) et les tables de
// la Maison des Plaisirs (tables/tables.js) : chacun a le sien, sa synthèse, ses niveaux.
//
//   creerLecteur({ quoi, rendre, sr, niveau }) :
//     · quoi    le nom de la tâche du Worker (synthese.worker.js) ;
//     · rendre  la synthèse pure, sur la page, quand le Worker ne répond pas ;
//     · sr      sa fréquence d'échantillonnage ;
//     · niveau  le niveau d'un son (son nom → gain), × Bruitages.
//   Il rend { tampons, enRoute, compte, demander, voix, jouer, niveauSortie }.

import { audioCtx, enTampon, retenirContexte, relacherContexte } from './synth.js';
import { getSfxEnabled, getSfxVolume } from '../core/main.js';
import { rendreAilleurs } from './syntheseAilleurs.js';

const horloge = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Pose une cible sur un paramètre audio, en douceur (constante de temps `tau`, s).
export const cibler = (param, v, ctx, tau) => {
  try { param.setTargetAtTime(v, ctx.currentTime, tau); } catch { param.value = v; }
};

export function creerLecteur({ quoi, rendre, sr, niveau = () => 1 }) {
  const L = { tampons: new Map(), enRoute: new Map(), compte: {}, sortie: null, _lecture: null };

  // Le tampon d'un son : rendu dans le Worker, sinon ici. Une promesse par son.
  function demander(nom) {
    if (L.tampons.has(nom)) return Promise.resolve(L.tampons.get(nom));
    if (L.enRoute.has(nom)) return L.enRoute.get(nom);
    const p = rendreAilleurs({ quoi, nom })
      .catch(() => rendre(nom))
      .then((data) => {
        const t = data ? enTampon(data, sr) : null;
        if (t) L.tampons.set(nom, t);
        return t;
      })
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

  // Joue un son prêt, au gain `g` (× niveau × Bruitages), placé à `pan`, à `vitesse`,
  // dans `dans` secondes ; `boucle` : une boucle muette au départ, que l'appelant monte.
  // Rend la voix { source, gain, pan, ctx } ou null (son pas encore prêt : il se rend).
  function voix(nom, { g = 1, pan = 0, vitesse = 1, dans = 0, boucle = false } = {}) {
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
    s.connect(gn); gn.connect(p); p.connect(S.gain);
    retenirContexte();
    s.onended = () => {
      try { s.disconnect(); gn.disconnect(); p.disconnect(); } catch { /* déjà débranchés */ }
      relacherContexte();
    };
    s.start(ctx.currentTime + Math.max(0, dans));
    L.compte[nom] = (L.compte[nom] || 0) + 1;
    return { source: s, gain: gn, pan: p, ctx };
  }

  // Le son tout de suite s'il est prêt ; sinon dès qu'il l'est, s'il arrive à temps.
  function jouer(nom, opts = {}, delaiMax = 0.6) {
    if (!getSfxEnabled()) return;
    if (L.tampons.has(nom)) { voix(nom, opts); return; }
    const t0 = horloge();
    demander(nom).then(() => { if ((horloge() - t0) / 1000 <= delaiMax) voix(nom, opts); });
  }

  return Object.assign(L, { demander, voix, jouer, niveauSortie });
}
