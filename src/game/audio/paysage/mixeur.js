// LE MIXEUR DU PAYSAGE SONORE (docs/PLAN-AMBIANCE-SONORE.md § 3.8 et § 3.9).
//
//   sources ─► gain ─► panoramique ─► bus ─► passe-bas du bus ─► maître ─► étouffoir
//          ─► baisse ─► limiteur ─► sortie (et deux sondes, pour le banc d'écoute)
//
//   · trois BUS : les nappes, le proche (ponctuels et émetteurs), le lointain. Les
//     passe-bas des deux premiers se ferment quand on dézoome (oreille.js, coupure) ;
//     celui du lointain reste fermé : une ville au loin est sourde ;
//   · le MAÎTRE porte le volume du joueur et les fondus d'entrée et de sortie ;
//   · l'ÉTOUFFOIR et la BAISSE assourdissent tout sous une fenêtre ouverte (−8 dB,
//     passe-bas vers 1,5 kHz) : la ville derrière la vitre ;
//   · le LIMITEUR garde la sortie de l'écrêtage (lot 6) : le maître monte à 1,75 × le
//     volume du joueur, et une corneille sous l'oreille, au volume plein, monte à
//     −3 dBFS, d'autres sons par-dessus. Sous −6 dBFS, il ne fait rien.
//
// Un StereoPanner par voix, jamais de PannerNode : en 2D le HRTF n'apporte rien et
// coûte cher (padenot, « web-audio-perf »).
export const BUS = ['nappes', 'proche', 'lointain'];

export function creerMixeur(ctx) {
  const maitre = ctx.createGain();
  maitre.gain.value = 0;
  const etouffoir = ctx.createBiquadFilter();
  etouffoir.type = 'lowpass'; etouffoir.frequency.value = 20000; etouffoir.Q.value = 0.5;
  const baisse = ctx.createGain();
  baisse.gain.value = 1;
  const sonde = ctx.createAnalyser();
  sonde.fftSize = 2048;
  const limiteur = ctx.createDynamicsCompressor();
  limiteur.threshold.value = -6; limiteur.knee.value = 4; limiteur.ratio.value = 20;
  limiteur.attack.value = 0.002; limiteur.release.value = 0.25;
  maitre.connect(etouffoir); etouffoir.connect(baisse); baisse.connect(limiteur);
  limiteur.connect(ctx.destination); limiteur.connect(sonde);
  // La sonde PONDÉRÉE : la pondération K de la sonie (UIT-R BS.1770 : un plateau de
  // +4 dB au-dessus de 1,7 kHz, un passe-haut à 38 Hz), approchée par deux filtres. Le
  // grave d'un vent y pèse moins que des voix au même niveau efficace (lot 6).
  const plateau = ctx.createBiquadFilter();
  plateau.type = 'highshelf'; plateau.frequency.value = 1682; plateau.gain.value = 4;
  const sousGrave = ctx.createBiquadFilter();
  sousGrave.type = 'highpass'; sousGrave.frequency.value = 38; sousGrave.Q.value = 0.5;
  const sondeK = ctx.createAnalyser();
  sondeK.fftSize = 2048;
  limiteur.connect(plateau); plateau.connect(sousGrave); sousGrave.connect(sondeK);
  const bus = {};
  const noeuds = [maitre, etouffoir, baisse, limiteur, sonde, plateau, sousGrave, sondeK];
  for (const nom of BUS) {
    const gain = ctx.createGain();
    const filtre = ctx.createBiquadFilter();
    filtre.type = 'lowpass'; filtre.Q.value = 0.5; filtre.frequency.value = nom === 'lointain' ? 2200 : 16000;
    gain.connect(filtre); filtre.connect(maitre);
    bus[nom] = { gain, filtre };
    noeuds.push(gain, filtre);
  }
  return {
    ctx, maitre, etouffoir, baisse, limiteur, sonde, sondeK, bus,
    debrancher() { for (const x of noeuds) { try { x.disconnect(); } catch { /* déjà débranché */ } } },
  };
}

// Une BOUCLE, muette au départ (le directeur la monte). Avec `largeur`, deux têtes de
// lecture sur le même tampon, décalées de près de la moitié et écartées de ±largeur :
// une nappe large pour la mémoire d'une mono (§ 3.9). `depart` (0..1) : où la lecture
// commence, pour que deux sessions ne démarrent pas sur la même rafale.
export function creerBoucle(M, tampon, bus, { largeur = 0, depart = 0, vitesse = 1 } = {}) {
  const ctx = M.ctx;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const pan = ctx.createStereoPanner();
  pan.pan.value = 0;
  gain.connect(pan); pan.connect(M.bus[bus].gain);
  const noeuds = [gain, pan], sources = [];
  const duree = tampon.duration || tampon.length / (tampon.sampleRate || 32000);
  const tetes = largeur > 0 ? [-largeur, largeur] : [0];
  const t0 = ctx.currentTime, fracs = [];
  tetes.forEach((ecart, i) => {
    const s = ctx.createBufferSource();
    s.buffer = tampon; s.loop = true; s.playbackRate.value = vitesse;
    if (tetes.length > 1) {
      // Deux bruits sans lien : leurs puissances s'ajoutent, d'où √½ chacun.
      const g2 = ctx.createGain(); g2.gain.value = Math.SQRT1_2;
      const p2 = ctx.createStereoPanner(); p2.pan.value = ecart;
      s.connect(g2); g2.connect(p2); p2.connect(gain);
      noeuds.push(g2, p2);
    } else {
      s.connect(gain);
    }
    const frac = (((depart + i * 0.47) % 1) + 1) % 1;
    fracs.push(frac);
    s.start(t0, frac * duree);
    sources.push(s); noeuds.push(s);
  });
  return {
    gain, pan, sources,
    // Où en est chaque tête de lecture, en secondes de la boucle (les arbres de la carte
    // se penchent sur la rafale qu'on entend, iso/isoVie.js).
    phases(out = []) {
      const el = (ctx.currentTime - t0) * vitesse;
      for (let i = 0; i < fracs.length; i += 1) out[i] = (fracs[i] * duree + el) % duree;
      return out;
    },
    arreter() {
      for (const s of sources) { try { s.stop(); } catch { /* déjà finie */ } }
      for (const x of noeuds) { try { x.disconnect(); } catch { /* déjà débranché */ } }
    },
  };
}

// Un PONCTUEL : joué une fois, débranché à sa fin.
export function jouerPonctuel(M, tampon, bus, gain, pan, vitesse = 1) {
  const ctx = M.ctx;
  const s = ctx.createBufferSource(), g = ctx.createGain(), p = ctx.createStereoPanner();
  s.buffer = tampon; s.playbackRate.value = vitesse; g.gain.value = gain; p.pan.value = pan;
  s.connect(g); g.connect(p); p.connect(M.bus[bus].gain);
  s.onended = () => { for (const x of [s, g, p]) { try { x.disconnect(); } catch { /* déjà débranché */ } } };
  s.start();
  return s;
}

// Niveau de sortie (dBFS, efficace) lu sur la sonde : pour le banc d'écoute, et pour
// vérifier qu'il sort quelque chose là où personne n'écoute (la pane de vérif).
let _lecture = null;
function lire(sonde) {
  if (!sonde || typeof sonde.getFloatTimeDomainData !== 'function') return null;
  if (!_lecture || _lecture.length !== sonde.fftSize) _lecture = new Float32Array(sonde.fftSize);
  sonde.getFloatTimeDomainData(_lecture);
  let e = 0;
  for (let i = 0; i < _lecture.length; i += 1) e += _lecture[i] * _lecture[i];
  return 10 * Math.log10(e / _lecture.length + 1e-12);
}
export function niveauSortie(M) {
  return lire(M && M.sonde);
}
// Sa SONIE, lue sur la sonde pondérée : des dB relatifs, pas des LUFS (la sonde mêle les
// deux canaux). De quoi COMPARER deux mélanges, deux zooms, deux âges.
export function sonieSortie(M) {
  return lire(M && M.sondeK);
}
