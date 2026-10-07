// LE PAYSAGE SONORE DE LA CARTE : le DIRECTEUR (docs/PLAN-AMBIANCE-SONORE.md, lot 1).
//
// Dix fois par seconde, il lit la caméra et ce que la carte vient de dessiner, puis
// dose les sons. Trois couches (§ 3.2 à 3.5) :
//   · les NAPPES suivent la part de chaque milieu à l'écran (milieux.js) : le vent sur
//     la forêt et la prairie, le feuillage, le courant, le ressac ;
//   · le PROCHE suit ce que le peintre a déposé au guichet (evenements.js) : le plouf
//     du poisson qui retombe, le battement de la libellule — on n'entend que ce qu'on
//     voit ;
//   · le LOINTAIN, la ville au loin, prend la place quand on dézoome (oreille.js).
//
// SA VIE. Attaché quand la carte se monte (CityMapCanvas.jsx), détaché quand elle se
// démonte : la carte n'existe que dans l'onglet Cité. Il ne joue que si tout est
// réuni : attaché, Ambiance activée, volume non nul, fenêtre visible (ni onglet caché
// ni .exe réduit — décision de Raph, § 9). Sinon il fond en sortie, puis S'ENDORT : ses
// boucles s'arrêtent et il relâche le contexte audio, qui peut dormir à son tour
// (synth.js, MEM-10 : un contexte « running » rendrait du silence des heures durant).
// Ses tampons (~15 Mo) se gardent deux minutes de sommeil, puis s'oublient.
// Une fenêtre ouverte l'ASSOURDIT sans l'arrêter (la ville derrière la vitre) — sauf
// les Options, où l'on règle justement ce volume.
//
// Le banc d'écoute (banc.js, Ctrl+Alt+B) montre ce qu'il entend et règle ses niveaux.
import { CM } from '../../map/layout.js';
import { worldToScreen } from '../../map/iso/projection.js';
import { isWindowMinimized, onWindowMinimizedChange } from '../../core/desktopWindow.js';
import { audioCtx, enTampon, retenirContexte, relacherContexte } from '../synth.js';
import { rendreAilleurs } from '../syntheseAilleurs.js';
import { rendrePaysage, PAYSAGE_SR, SONS_PAYSAGE } from './paysageSynth.js';
import { OREILLE, proximite, hauteur, attenuation, panoramique, fondu, coupure } from './oreille.js';
import { echantillonner, mesurerFoule, nouvelleMesure, tailleVille, tirerLieu, MILIEUX, ECHANT } from './milieux.js';
import { creerMixeur, creerBoucle, jouerPonctuel, niveauSortie } from './mixeur.js';
import { paysageEcoute, releverSons, emetteursDe } from './evenements.js';
import { ENREGISTRES } from './enregistrements.js';
import { getPaysageActif, getPaysageVolume, onPaysageReglages } from './reglages.js';
import { ouvrirBanc, basculerBanc } from './banc.js';

const TICK_MS = 100;        // le proche (ponctuels, émetteurs)
const ECHANT_MS = 190;      // les nappes : l'écran est relu cinq fois par seconde
const SORTIE_MS = 1600;     // fondu de sortie avant le sommeil
const OUBLI_MS = 120000;    // les tampons survivent deux minutes de sommeil

// ── Ce qui sonne ──────────────────────────────────────────────────────────────
// `niveau` : le gain d'une nappe qui remplit l'écran. `largeur` : l'écart des deux
// têtes de lecture (mixeur.js).
// RÉGLÉS À L'OREILLE PAR RAPH le 2026-10-07 (banc d'écoute), en deux écoutes : son
// maître à 0,5 et ses multiplicateurs sont versés ici — feuillage ×0,8, courant ×0,5
// puis ×0,8, ressac ×0,7, libellule ×0,8 ; le ressac et la libellule refaits entre les
// deux (paysageSynth.js, « la tempête », « l'hélicoptère »), validés à la seconde.
export const NAPPES = {
  souffle: { bus: 'nappes', largeur: 0.35, niveau: 0.21 },
  feuillage: { bus: 'nappes', largeur: 0.45, niveau: 0.18 },
  courant: { bus: 'nappes', largeur: 0.3, niveau: 0.084 },
  // Le clapotis est clairsemé, borné par ses crêtes (0,7) et non par son énergie : son
  // niveau se juge aux claques, à peine sous celles de l'ancien ressac.
  ressac: { bus: 'nappes', largeur: 0.3, niveau: 0.18 },
  lointain: { bus: 'lointain', largeur: 0.5, niveau: 0.2 },
  // LOT 2 (la nature), niveaux de départ, à régler à l'oreille. Les insectes suivent le
  // jour, la nuit, la saison et la pluie (majNappes) ; le vent d'altitude est le souffle
  // joué plus grave, sur le bus du lointain : ce qu'on entend dézoomé au-dessus de la
  // campagne, quand la ville est petite.
  grillons: { bus: 'nappes', largeur: 0.45, niveau: 0.18 },
  stridulations: { bus: 'nappes', largeur: 0.4, niveau: 0.16 },
  cigales: { bus: 'nappes', largeur: 0.4, niveau: 0.14 },
  altitude: { son: 'souffle', vitesse: 0.72, bus: 'lointain', largeur: 0.5, niveau: 0.12 },
};
// `ref` / `max` : portée en cases (oreille.js, attenuation) ; `voix` : au plus tant à la
// fois ; `ecartMs` : jamais deux tirs plus serrés.
export const PONCTUELS = {
  plouf: { sons: ['plouf1', 'plouf2', 'plouf3', 'plouf4', 'plouf5', 'plouf6'], ref: 4.5, max: 18, niveau: 0.275, voix: 3, ecartMs: 90 },
  sortie: { sons: ['sortie1', 'sortie2', 'sortie3'], ref: 3.5, max: 14, niveau: 0.13, voix: 2, ecartMs: 90 },
  // Le poisson qui GOBE en surface (iso/isoRiver.js, au début de sa pause) : une goutte,
  // de près seulement — il y en a une douzaine sur le fleuve.
  plip: { sons: ['plip1', 'plip2', 'plip3', 'plip4'], ref: 2.5, max: 9, niveau: 0.1, voix: 2, ecartMs: 250 },
};
// Les émetteurs : seules les `voix` bêtes les plus fortes sonnent (les « voix
// virtuelles » des moteurs de jeu). La libellule s'entend de près : il faut être
// zoomé sur elle (« quand on regarde une libellule », la demande de Raph). Posée, elle
// se fait discrète ; c'est en vol franc qu'elle bourdonne (`calme`, ci-dessous).
export const EMETTEURS = {
  libellule: { son: 'libellule', ref: 1.7, max: 6.5, niveau: 0.2, voix: 2, calme: 0.35 },
};
// Les PONCTUELS SEMÉS (lot 2) : des sons ENREGISTRÉS sans support visible — l'oiseau
// qu'on entend sans le voir —, tirés au hasard (processus de Poisson) dans les parties de
// l'écran qui portent leur milieu (milieux.js, tirerLieu). Une famille joue les fichiers
// de `src/assets/sons/` dont le nom commence par elle (enregistrements.js) ; sans
// fichier, elle se tait.
//   · `milieux` : où elle vit, et combien ; `taux` : sons par minute quand ce milieu
//     remplit l'écran ;
//   · `quand(c)` : le moment, de 0 à 1 — `c.nuit`, `c.saison` (0 printemps … 3 hiver),
//     `c.sec` (0 sous l'averse), `c.vivant` (0 aux âges cosmiques, où le jeu ne dessine
//     plus de bêtes, iso/isoRiverLife.js).
// `variantes` : combien de sons il faut à la famille pour chanter à son plein taux.
// Avec moins, elle se fait plus rare d'autant — deux oiseaux qui alternent toutes les
// quatre secondes, l'oreille les reconnaît vite.
// Niveaux de départ, à régler à l'oreille.
const PRINTEMPS = 0, ETE = 1, AUTOMNE = 2, HIVER = 3;
export const SEMES = {
  oiseau: { milieux: { foret: 1, prairie: 0.3 }, taux: 14, variantes: 8, ref: 7, max: 26, niveau: 0.22, voix: 2, ecartMs: 900,
    quand: (c) => (1 - c.nuit) * [1, 0.8, 0.6, 0.15][c.saison] * c.sec * c.vivant },
  coucou: { milieux: { foret: 1 }, taux: 1.2, variantes: 2, ref: 10, max: 40, niveau: 0.18, voix: 1, ecartMs: 20000,
    quand: (c) => (1 - c.nuit) * (c.saison === PRINTEMPS ? 1 : c.saison === ETE ? 0.4 : 0) * c.sec * c.vivant },
  pic: { milieux: { foret: 1 }, taux: 1.5, variantes: 2, ref: 8, max: 30, niveau: 0.2, voix: 1, ecartMs: 12000,
    quand: (c) => (1 - c.nuit) * (c.saison === HIVER ? 0.5 : 1) * c.sec * c.vivant },
  chouette: { milieux: { foret: 1 }, taux: 1.4, variantes: 2, ref: 9, max: 34, niveau: 0.2, voix: 1, ecartMs: 15000,
    quand: (c) => c.nuit * c.sec * c.vivant },
  grenouille: { milieux: { rive: 1 }, taux: 10, variantes: 4, ref: 5, max: 20, niveau: 0.16, voix: 2, ecartMs: 700,
    quand: (c) => c.nuit * (c.saison <= ETE ? 1 : c.saison === AUTOMNE ? 0.3 : 0) * c.vivant },
  corneille: { milieux: { champ: 1, prairie: 0.6, foret: 0.3 }, taux: 3, variantes: 4, ref: 8, max: 30, niveau: 0.18, voix: 1, ecartMs: 4000,
    quand: (c) => (1 - c.nuit) * (c.saison === HIVER ? 1 : c.saison === AUTOMNE ? 0.4 : 0) * c.vivant },
  alouette: { milieux: { champ: 1, prairie: 0.7 }, taux: 2, variantes: 2, ref: 9, max: 34, niveau: 0.16, voix: 1, ecartMs: 8000,
    quand: (c) => (1 - c.nuit) * (c.saison <= ETE ? 1 : 0) * c.sec * c.vivant },
};
// Le taux (sons par seconde) d'une famille semée : sa présence à l'écran (Σ milieu ×
// part, adoucie), le moment, la proximité du zoom, l'habituation, et le nombre de sons
// qu'elle a (`nSons`, face à ses `variantes`). PUR (testé).
export function tauxSeme(def, parts, cond, proche = 1, habitue = 1, nSons = Infinity) {
  let presence = 0;
  for (const [m, k] of Object.entries(def.milieux)) presence += k * (parts[m] || 0);
  presence = Math.min(1, presence);
  if (!(presence > 0) || !(nSons > 0)) return 0;
  const variete = Math.min(1, nSons / (def.variantes || 1));
  return (def.taux / 60) * Math.pow(presence, 0.8) * Math.max(0, def.quand(cond)) * proche * habitue * variete;
}
// L'HABITUATION (§ 3.3) : la caméra n'a pas bougé depuis cinq minutes, le jeu tourne en
// fond — les sons semés se raréfient de moitié. Un jeu laissé ouvert ne doit pas picorer
// l'oreille. Les nappes restent, et le proche suit ce qui se passe à l'écran.
const HABITUATION_MS = 300000;

// ── Les molettes du banc d'écoute ────────────────────────────────────────────
// Des MULTIPLICATEURS sur les niveaux ci-dessus, et les seuils de l'oreille. Retenus
// d'une session à l'autre ; une fois réglés à l'oreille, ils remontent ici comme défauts.
const GROUPES = ['nappes', 'ponctuels', 'emetteurs', 'semes'];
export const BANC = {
  maitre: 1,
  nappes: Object.fromEntries(Object.keys(NAPPES).map((k) => [k, 1])),
  ponctuels: Object.fromEntries(Object.keys(PONCTUELS).map((k) => [k, 1])),
  emetteurs: Object.fromEntries(Object.keys(EMETTEURS).map((k) => [k, 1])),
  semes: Object.fromEntries(Object.keys(SEMES).map((k) => [k, 1])),
  solo: null,
};
const OREILLE_DEFAUT = { ...OREILLE };
// La clé change quand des réglages du banc sont VERSÉS dans les niveaux ci-dessus : les
// anciens multiplicateurs, retenus chez Raph, s'appliqueraient une seconde fois.
const CLE_BANC = 'civ-paysage-banc-3';
try { for (const k of ['civ-paysage-banc', 'civ-paysage-banc-2']) localStorage.removeItem(k); } catch { /* stockage indisponible */ }
const nombre = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
function lireBanc() {
  try {
    const j = JSON.parse(localStorage.getItem(CLE_BANC) || 'null');
    if (!j || typeof j !== 'object') return;
    BANC.maitre = nombre(j.maitre, 1);
    for (const g of GROUPES) {
      for (const k of Object.keys(BANC[g])) BANC[g][k] = nombre(j[g] && j[g][k], 1);
    }
    if (j.oreille) for (const k of ['zLoin', 'zPres', 'h0']) OREILLE[k] = nombre(j.oreille[k], OREILLE_DEFAUT[k]);
  } catch { /* réglages illisibles : les défauts */ }
}
export function reglagesBanc() {
  return {
    maitre: BANC.maitre,
    nappes: { ...BANC.nappes }, ponctuels: { ...BANC.ponctuels }, emetteurs: { ...BANC.emetteurs }, semes: { ...BANC.semes },
    oreille: { zLoin: OREILLE.zLoin, zPres: OREILLE.zPres, h0: OREILLE.h0 },
  };
}
export function retenirBanc() {
  try { localStorage.setItem(CLE_BANC, JSON.stringify(reglagesBanc())); } catch { /* stockage indisponible */ }
}
export function remettreBanc() {
  BANC.maitre = 1; BANC.solo = null;
  for (const g of GROUPES) for (const k of Object.keys(BANC[g])) BANC[g][k] = 1;
  for (const k of ['zLoin', 'zPres', 'h0']) OREILLE[k] = OREILLE_DEFAUT[k];
  try { localStorage.removeItem(CLE_BANC); } catch { /* idem */ }
}
lireBanc();
const soloK = (nom) => (BANC.solo && BANC.solo !== nom ? 0 : 1);

// ── L'état du directeur ──────────────────────────────────────────────────────
const D = {
  attache: false, eveille: false, forcer: false, erreur: false,
  M: null,
  tampons: new Map(), enRoute: new Set(), repli: [],
  nappes: {}, emetteurs: {}, enCours: {}, dernier: {}, dernierA: {}, dernierGain: {},
  compte: Object.fromEntries([...Object.keys(PONCTUELS), ...Object.keys(SEMES)].map((k) => [k, 0])),
  mesure: nouvelleMesure(),
  cibles: Object.fromEntries(Object.keys(NAPPES).map((k) => [k, 0])),
  zoom: 1, p: 0, h: 0,
  rafale: { v: 1, cible: 1, prochain: 0 },
  echantA: 0, sortieA: 0, semeA: 0,
  // La dernière fois que la caméra a bougé (habituation), et où elle était.
  bougeA: 0, cam: { x: NaN, y: NaN, zoom: NaN },
  erreurSon: false,
  minuteur: null, oubli: null, geste: false, ecouteurs: null,
};
const horloge = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Ne pose une cible que si elle a bougé : chaque setTargetAtTime ajoute un événement à
// la ligne de temps du paramètre, et le directeur passe dix fois par seconde.
function cibler(param, v, t, tau) {
  const avant = param._paysageCible;
  if (avant !== undefined && Math.abs(avant - v) <= 1e-4 * (1 + Math.abs(v))) return;
  param._paysageCible = v;
  param.setTargetAtTime(v, t, tau);
}

// La fenêtre est-elle cachée (onglet en arrière-plan, .exe réduit) ?
function cache() {
  if (typeof document !== 'undefined' && document.hidden) return true;
  return isWindowMinimized();
}
function doitJouer() {
  if (!D.attache || !getPaysageActif() || !(getPaysageVolume() > 0)) return false;
  return D.forcer || !cache();
}
// Une fenêtre du jeu est-elle ouverte par-dessus la carte ? Les Options ne comptent pas.
function fenetreOuverte() {
  return typeof document !== 'undefined' && typeof document.querySelector === 'function'
    && Boolean(document.querySelector('dialog[open]:not(.options-dialog)'));
}

// ── Les tampons : rendus dans le Worker des sons, sinon un par tick ici ─────────
function demander(nom) {
  if (D.tampons.has(nom) || D.enRoute.has(nom)) return;
  D.enRoute.add(nom);
  rendreAilleurs({ quoi: 'paysage', nom }).then(
    (data) => { if (!D.tampons.has(nom)) D.tampons.set(nom, enTampon(data, PAYSAGE_SR)); },
    () => { if (!D.repli.includes(nom)) D.repli.push(nom); },
  ).finally(() => D.enRoute.delete(nom));
}
function rendreEnRepli() {
  const nom = D.repli.shift();
  if (nom && !D.tampons.has(nom)) D.tampons.set(nom, enTampon(rendrePaysage(nom), PAYSAGE_SR));
}
// Les enregistrements (lot 2) : lus par fetch puis décodés par le contexte. L'.exe les
// sert par son protocole app://, qui accepte fetch (main.cjs, supportFetchAPI ; la CSP
// permet connect-src 'self'). Un fichier illisible se tait, avec un seul avertissement.
function decoderEnregistres(ctx) {
  for (const e of ENREGISTRES) {
    if (D.tampons.has(e.id) || D.enRoute.has(e.id)) continue;
    D.enRoute.add(e.id);
    fetch(e.url)
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then((octets) => ctx.decodeAudioData(octets))
      .then((tampon) => { D.tampons.set(e.id, tampon); }, (err) => {
        if (!D.erreurSon) { D.erreurSon = true; console.warn('Paysage sonore : son illisible', e.id, err); }
      })
      .finally(() => D.enRoute.delete(e.id));
  }
}
// Les sons décodés d'une famille semée (leurs ids), dans l'ordre du dossier.
function sonsDe(fam) {
  const ids = [];
  for (const e of ENREGISTRES) if (e.famille === fam && D.tampons.has(e.id)) ids.push(e.id);
  return ids;
}

// ── Réveil et sommeil ────────────────────────────────────────────────────────
function reveiller() {
  const ctx = audioCtx();
  if (!ctx) return;
  retenirContexte();
  clearTimeout(D.oubli);
  D.oubli = null;
  D.M = creerMixeur(ctx);
  D.eveille = true; D.sortieA = 0; D.echantA = 0; D.semeA = 0; D.bougeA = horloge();
  paysageEcoute(true);
  for (const nom of SONS_PAYSAGE) demander(nom);
  decoderEnregistres(ctx);
  if (ctx.state !== 'running') armerGeste();
}
function endormir() {
  paysageEcoute(false);
  for (const v of Object.values(D.nappes)) v.arreter();
  for (const l of Object.values(D.emetteurs)) for (const v of l) v.boucle.arreter();
  D.nappes = {}; D.emetteurs = {}; D.enCours = {};
  if (D.M) D.M.debrancher();
  D.M = null; D.eveille = false; D.sortieA = 0;
  relacherContexte();
  clearTimeout(D.oubli);
  D.oubli = setTimeout(() => { D.oubli = null; if (!D.eveille) D.tampons.clear(); }, OUBLI_MS);
}
// Le navigateur refuse le son avant un premier geste (règle de lecture automatique) :
// le contexte se relance au premier clic ou à la première touche. L'.exe n'en a pas besoin.
function armerGeste() {
  if (D.geste || typeof document === 'undefined') return;
  D.geste = true;
  const f = () => {
    D.geste = false;
    document.removeEventListener('pointerdown', f, true);
    document.removeEventListener('keydown', f, true);
    if (D.eveille) audioCtx();
  };
  document.addEventListener('pointerdown', f, true);
  document.addEventListener('keydown', f, true);
}

// ── Le tick ──────────────────────────────────────────────────────────────────
export function tick() {
  const now = horloge();
  const doit = doitJouer();
  if (doit && !D.eveille) reveiller();
  if (!D.eveille) { if (!D.attache) arreterMinuteur(); return; }
  const M = D.M, t = M.ctx.currentTime;
  if (!doit) {
    cibler(M.maitre.gain, 0, t, 0.35);
    if (!D.sortieA) D.sortieA = now;
    else if (now - D.sortieA >= SORTIE_MS) endormir();
    return;
  }
  D.sortieA = 0;
  cibler(M.maitre.gain, getPaysageVolume() * BANC.maitre, t, 0.3);
  const ferme = fenetreOuverte();
  cibler(M.etouffoir.frequency, ferme ? 1500 : 20000, t, 0.08);
  cibler(M.baisse.gain, ferme ? 0.4 : 1, t, 0.08);
  if (D.repli.length) rendreEnRepli();
  monterNappes(M);
  if (!(CM.cw > 0)) return;
  const L = CM.layout;
  const zoom = CM.cam.zoom, p = proximite(zoom, OREILLE), f = fondu(p), h = hauteur(zoom, OREILLE);
  D.zoom = zoom; D.p = p; D.h = h;
  // L'habituation : la caméra a-t-elle bougé depuis le dernier passage ?
  const cam = CM.cam;
  if (!(Math.abs(cam.x - D.cam.x) <= 2 && Math.abs(cam.y - D.cam.y) <= 2 && cam.zoom === D.cam.zoom)) {
    D.cam.x = cam.x; D.cam.y = cam.y; D.cam.zoom = cam.zoom; D.bougeA = now;
  }
  const fc = coupure(p, OREILLE);
  cibler(M.bus.nappes.filtre.frequency, fc, t, 0.25);
  cibler(M.bus.proche.filtre.frequency, fc, t, 0.25);
  // Les nappes lisent le plan de la ville ; le proche n'a besoin que de la caméra.
  if (L && now - D.echantA >= ECHANT_MS) {
    D.echantA = now;
    echantillonner(L, D.mesure);
    mesurerFoule(D.mesure);
    majRafale(now);
    majNappes(L, f, t);
  }
  majPonctuels(M, h, f, t, now);
  majEmetteurs(M, h, f, t);
  if (L) majSemes(M, L, h, f, t, now);
}
function tickSur() {
  try {
    tick();
  } catch (e) {
    // Le son est un plus : une erreur ne doit ni inonder la console ni toucher au jeu.
    if (!D.erreur) { D.erreur = true; console.error('Paysage sonore : tick en échec', e); }
  }
}
function demarrerMinuteur() {
  if (!D.minuteur) D.minuteur = setInterval(tickSur, TICK_MS);
}
function arreterMinuteur() {
  if (D.minuteur) { clearInterval(D.minuteur); D.minuteur = null; }
}

// ── Les nappes ───────────────────────────────────────────────────────────────
function monterNappes(M) {
  for (const [nom, def] of Object.entries(NAPPES)) {
    if (D.nappes[nom]) continue;
    const tampon = D.tampons.get(def.son || nom);
    if (tampon) D.nappes[nom] = creerBoucle(M, tampon, def.bus, { largeur: def.largeur, depart: Math.random(), vitesse: def.vitesse || 1 });
  }
}
// Le vent varie de lui-même, au-delà des rafales cuites dans ses boucles : une cible
// tirée toutes les 4 à 10 s, rejointe en douceur. Il souffle aussi plus fort quand la
// météo le dit (`windX`, et les rafales d'une averse, `gustF`).
function majRafale(now) {
  const r = D.rafale;
  if (now >= r.prochain) { r.cible = 0.78 + Math.random() * 0.37; r.prochain = now + 4000 + Math.random() * 6000; }
  r.v += (r.cible - r.v) * 0.08;
}
// Les SAISONS des insectes (0 printemps, 1 été, 2 automne, 3 hiver) : l'hiver se tait.
const SAISON_GRILLONS = [0.55, 1, 0.8, 0];
const SAISON_SAUTERELLES = [0.4, 1, 0.6, 0];
// Ce que chaque nappe doit jouer, selon les parts de l'écran (milieux.js) et le temps
// qu'il fait. PUR : le directeur le pose sur les gains, les tests le lisent.
//   · `proche` / `loin` : le fondu du zoom (oreille.js) ; `taille` : la ville (0..1) ;
//   · `nuit` (0..1, CM.nightF), `pluie` (0..1, CM.rainF), `saison` (0..3, CM.season) ;
//   · `vent` : la force du vent (≈ 0,5 à 1,4).
// Les insectes se taisent sous la pluie ; les grillons chantent la nuit, les
// sauterelles le jour dans les prés, les cigales les jours d'été dans les arbres.
export function ciblesNappes(P, { vent = 1, proche = 1, loin = 0, taille = 0, nuit = 0, pluie = 0, saison = 1 } = {}, out = {}) {
  // Les nappes s'effacent au dézoom, plus tard que le proche (∝ cos^0,7 contre cos²).
  const nappeK = Math.pow(proche, 0.7);
  const jour = 1 - nuit, sec = Math.pow(1 - Math.min(1, pluie), 2);
  const s = Math.max(0, Math.min(3, saison | 0));
  // Courbe adoucie (part^0,6) : un bosquet s'entend, sans couvrir le reste.
  const doux = (x) => Math.pow(Math.max(0, x), 0.6);
  const terre = P.foret + P.prairie + 0.6 * P.champ;
  out.souffle = doux(terre) * vent * nappeK;
  out.feuillage = doux(P.foret) * vent * (s === 3 ? 0.45 : 1) * nappeK;   // l'hiver déshabille les feuillus
  out.courant = doux(P.eau) * nappeK;
  out.ressac = doux(Math.min(1, P.rive)) * nappeK;
  out.lointain = taille * loin;
  out.grillons = doux(P.prairie + P.champ + 0.6 * P.foret + 0.3 * Math.min(1, P.rive)) * nuit * SAISON_GRILLONS[s] * sec * nappeK;
  out.stridulations = doux(P.prairie + P.champ) * jour * SAISON_SAUTERELLES[s] * sec * nappeK;
  out.cigales = doux(P.foret + 0.4 * P.prairie) * jour * (s === 1 ? 1 : 0) * sec * nappeK;
  // Dézoomé au-dessus de la campagne : le vent d'altitude, d'autant plus que la ville est petite.
  out.altitude = doux(Math.min(1, P.foret + P.prairie + P.champ + P.eau)) * (1 - 0.7 * taille) * vent * loin;
  return out;
}
function majNappes(L, f, t) {
  const P = D.mesure.parts, pans = D.mesure.pans;
  const vent = Math.min(1.4, 0.55 + 0.45 * Math.min(1, Math.abs(CM.windX || 0) / 0.7) + 0.35 * (CM.gustF || 0)) * D.rafale.v;
  const c = ciblesNappes(P, {
    vent, proche: f.proche, loin: f.loin, taille: tailleVille(L),
    nuit: CM.nightF || 0, pluie: CM.rainF || 0, saison: CM.season ?? 1,
  }, D.cibles);
  const terre = P.foret + P.prairie + 0.6 * P.champ, herbe = P.prairie + P.champ;
  const panTerre = terre > 0 ? (pans.foret * P.foret + pans.prairie * P.prairie + pans.champ * 0.6 * P.champ) / terre : 0;
  const panHerbe = herbe > 0 ? (pans.prairie * P.prairie + pans.champ * P.champ) / herbe : 0;
  const ou = {
    souffle: panTerre, feuillage: pans.foret, courant: pans.eau, ressac: pans.rive, lointain: 0,
    grillons: panTerre, stridulations: panHerbe, cigales: pans.foret, altitude: 0,
  };
  for (const [nom, def] of Object.entries(NAPPES)) {
    const v = D.nappes[nom];
    if (!v) continue;
    cibler(v.gain.gain, c[nom] * def.niveau * BANC.nappes[nom] * soloK(nom), t, 0.45);
    cibler(v.pan.pan, Math.max(-1, Math.min(1, ou[nom] * 0.5)), t, 0.6);
  }
}

// ── Les ponctuels ────────────────────────────────────────────────────────────
// Tirage sans redite : jamais deux fois de suite la même variante.
function tirer(nom, n) {
  let i = Math.floor(Math.random() * n);
  if (n > 1 && i === D.dernier[nom]) i = (i + 1 + Math.floor(Math.random() * (n - 1))) % n;
  D.dernier[nom] = i;
  return i;
}
function majPonctuels(M, h, f, t, now) {
  const T = CM.TILE;
  releverSons((nom, x, y, force) => {
    const def = PONCTUELS[nom];
    if (!def) return;
    const r = Math.hypot(x - CM.cam.x, y - CM.cam.y) / T;
    const g = attenuation(r, h, def.ref, def.max) * def.niveau * BANC.ponctuels[nom] * soloK(nom)
      * f.proche * f.proche * (0.7 + 0.3 * Math.min(1.5, force));
    if (g < 0.008) return;
    const enCours = (D.enCours[nom] = (D.enCours[nom] || []).filter((fin) => fin > t));
    if (enCours.length >= def.voix || now - (D.dernierA[nom] || -Infinity) < def.ecartMs) return;
    const tampon = D.tampons.get(def.sons[tirer(nom, def.sons.length)]);
    if (!tampon) return;
    // Un gros poisson sonne plus grave ; chaque tir varie un peu (±6 %).
    const vitesse = (0.94 + Math.random() * 0.12) / Math.pow(Math.max(0.5, force), 0.35);
    const s = worldToScreen(x, y);
    jouerPonctuel(M, tampon, 'proche', g, panoramique(s.x, CM.cw, OREILLE.panMax), vitesse);
    enCours.push(t + tampon.duration / vitesse);
    D.dernierA[nom] = now;
    D.compte[nom] += 1;
    D.dernierGain[nom] = g;
  });
}

// ── Les émetteurs ────────────────────────────────────────────────────────────
const _cands = [];
function majEmetteurs(M, h, f, t) {
  const T = CM.TILE;
  for (const [fam, def] of Object.entries(EMETTEURS)) {
    const tampon = D.tampons.get(def.son);
    const voix = D.emetteurs[fam] || (D.emetteurs[fam] = []);
    for (const v of voix) v.pris = false;
    const notes = tampon ? emetteursDe(fam) : null;
    let nc = 0;
    if (notes) {
      for (let i = 0; i < notes.n; i += 1) {
        const x = notes.x[i], y = notes.y[i], k = notes.k[i];
        const r = Math.hypot(x - CM.cam.x, y - CM.cam.y) / T;
        // `k` : 1 en vol franc, ½ posée ; posée, la bête descend à `calme`.
        const g = attenuation(r, h, def.ref, def.max) * def.niveau * BANC.emetteurs[fam] * soloK(fam)
          * f.proche * f.proche * (def.calme + (1 - def.calme) * Math.max(0, 2 * k - 1));
        if (g < 0.004) continue;
        const c = _cands[nc] || (_cands[nc] = { g: 0, x: 0, y: 0, k: 0 });
        c.g = g; c.x = x; c.y = y; c.k = k;
        nc += 1;
      }
    }
    // Les plus forts d'abord (tri par insertion : quelques candidats tout au plus).
    for (let i = 1; i < nc; i += 1) {
      const c = _cands[i];
      let j = i - 1;
      while (j >= 0 && _cands[j].g < c.g) { _cands[j + 1] = _cands[j]; j -= 1; }
      _cands[j + 1] = c;
    }
    for (let j = 0; j < Math.min(nc, def.voix); j += 1) {
      const c = _cands[j];
      // La voix qui suivait déjà cette bête (la plus proche de sa dernière position) la
      // garde : deux libellules à égale distance ne s'échangent pas leurs voix.
      let v = null, bd = 2.5 * T;
      for (const w of voix) {
        if (w.pris || w.libre) continue;
        const d = Math.hypot(w.x - c.x, w.y - c.y);
        if (d < bd) { bd = d; v = w; }
      }
      if (!v) v = voix.find((w) => !w.pris && w.libre) || null;
      if (!v && voix.length < def.voix) {
        v = { boucle: creerBoucle(M, tampon, 'proche', { depart: Math.random() }), x: c.x, y: c.y, libre: true, pris: false, vitesse: 1 };
        voix.push(v);
      }
      if (!v) continue;
      if (v.libre) v.vitesse = 0.93 + Math.random() * 0.14;   // une autre bête, une autre voix
      v.pris = true; v.libre = false; v.x = c.x; v.y = c.y;
      const s = worldToScreen(c.x, c.y);
      cibler(v.boucle.gain.gain, c.g, t, 0.08);
      cibler(v.boucle.pan.pan, panoramique(s.x, CM.cw, OREILLE.panMax), t, 0.08);
      // En vol franc, le battement monte un peu.
      for (const src of v.boucle.sources) cibler(src.playbackRate, v.vitesse * (1 + 0.06 * c.k), t, 0.1);
    }
    for (const v of voix) {
      if (v.pris) continue;
      cibler(v.boucle.gain.gain, 0, t, 0.15);
      v.libre = true;
    }
  }
}

// ── Les ponctuels semés ──────────────────────────────────────────────────────
function majSemes(M, L, h, f, t, now) {
  const dt = Math.min(0.5, Math.max(0, (now - (D.semeA || now)) / 1000));
  D.semeA = now;
  if (!(dt > 0) || !(f.proche > 0.02)) return;
  const cond = {
    nuit: CM.nightF || 0,
    saison: Math.max(0, Math.min(3, (CM.season ?? 1) | 0)),
    sec: Math.pow(1 - Math.min(1, CM.rainF || 0), 2),
    vivant: ((L.counts && L.counts.eraBand) | 0) >= 7 ? 0 : 1,
  };
  const habitue = now - D.bougeA > HABITUATION_MS ? 0.5 : 1;
  const T = CM.TILE, mes = D.mesure;
  for (const [nom, def] of Object.entries(SEMES)) {
    const sons = sonsDe(nom);
    if (!sons.length) continue;
    const taux = tauxSeme(def, mes.parts, cond, f.proche, habitue, sons.length);
    if (!(taux > 0) || Math.random() >= 1 - Math.exp(-taux * dt)) continue;
    // Où : un milieu de la famille, tiré en proportion de sa présence, puis un lieu de
    // l'écran qui le porte, à une case et demie près.
    let tot = 0;
    for (const [m, k] of Object.entries(def.milieux)) tot += k * (mes.parts[m] || 0);
    let r = Math.random() * tot, milieu = null;
    for (const [m, k] of Object.entries(def.milieux)) { r -= k * (mes.parts[m] || 0); if (r < 0) { milieu = m; break; } }
    const i = milieu ? tirerLieu(mes, milieu, Math.random()) : -1;
    if (i < 0) continue;
    const x = mes.lieux.px[i] + (Math.random() * 2 - 1) * 1.5 * T;
    const y = mes.lieux.py[i] + (Math.random() * 2 - 1) * 1.5 * T;
    const g = attenuation(Math.hypot(x - CM.cam.x, y - CM.cam.y) / T, h, def.ref, def.max)
      * def.niveau * BANC.semes[nom] * soloK(nom) * f.proche * f.proche;
    if (g < 0.006) continue;
    const enCours = (D.enCours[nom] = (D.enCours[nom] || []).filter((fin) => fin > t));
    if (enCours.length >= def.voix || now - (D.dernierA[nom] || -Infinity) < def.ecartMs) continue;
    const tampon = D.tampons.get(sons[tirer(nom, sons.length)]);
    // Un chant ne se transpose presque pas : ±3 %.
    const vitesse = 0.97 + Math.random() * 0.06;
    const s = worldToScreen(x, y);
    jouerPonctuel(M, tampon, 'proche', g, panoramique(s.x, CM.cw, OREILLE.panMax), vitesse);
    enCours.push(t + tampon.duration / vitesse);
    D.dernierA[nom] = now;
    D.compte[nom] += 1;
    D.dernierGain[nom] = g;
  }
}

// ── Pour le banc : écouter un son seul, au centre ─────────────────────────────
export function ecouter(nom) {
  const M = D.M;
  if (!D.eveille || !M) return false;
  if (PONCTUELS[nom]) {
    const def = PONCTUELS[nom];
    const tampon = D.tampons.get(def.sons[tirer(nom, def.sons.length)]);
    if (!tampon) return false;
    jouerPonctuel(M, tampon, 'proche', def.niveau * BANC.ponctuels[nom], 0, 0.94 + Math.random() * 0.12);
    return true;
  }
  if (EMETTEURS[nom]) {
    const def = EMETTEURS[nom];
    const tampon = D.tampons.get(def.son);
    if (!tampon) return false;
    const b = creerBoucle(M, tampon, 'proche', { depart: Math.random() });
    const t = M.ctx.currentTime;
    b.gain.gain.setTargetAtTime(def.niveau * BANC.emetteurs[nom], t, 0.05);
    b.gain.gain.setTargetAtTime(0, t + 2.5, 0.12);
    setTimeout(() => b.arreter(), 3400);
    return true;
  }
  if (SEMES[nom]) {
    const sons = sonsDe(nom);
    if (!sons.length) return false;
    jouerPonctuel(M, D.tampons.get(sons[tirer(nom, sons.length)]), 'proche', SEMES[nom].niveau * BANC.semes[nom], 0, 1);
    return true;
  }
  return false;
}

// ── Ce que le paysage entend (banc d'écoute, vérifications) ───────────────────
export function etatPaysage() {
  const ctx = D.M ? D.M.ctx : null;
  return {
    attache: D.attache, eveille: D.eveille, forcer: D.forcer,
    actif: getPaysageActif(), volume: getPaysageVolume(), cache: cache(), fenetre: fenetreOuverte(),
    contexte: ctx ? ctx.state : null,
    zoom: D.zoom, p: D.p, h: D.h, rafale: D.rafale.v,
    parts: { ...D.mesure.parts }, foule: D.mesure.foule, points: D.mesure.points,
    taille: CM.layout ? tailleVille(CM.layout) : 0,
    cibles: { ...D.cibles },
    nappes: Object.keys(D.nappes),
    tampons: D.tampons.size, enRoute: D.enRoute.size,
    emetteurs: Object.fromEntries(Object.entries(D.emetteurs).map(([k, l]) => [k, l.filter((v) => v.pris).length])),
    ponctuels: { ...D.compte },
    // Par famille semée : combien joués, combien de sons prêts (fichiers décodés).
    semes: Object.fromEntries(Object.keys(SEMES).map((k) => [k, { joues: D.compte[k] || 0, sons: sonsDe(k).length }])),
    enregistres: ENREGISTRES.length,
    habitue: D.eveille && horloge() - D.bougeA > HABITUATION_MS,
    sortieDb: D.M ? niveauSortie(D.M) : null,
  };
}
const API = {
  etat: etatPaysage, ecouter, BANC, OREILLE, ECHANT, MILIEUX, NAPPES, PONCTUELS, EMETTEURS, SEMES,
  retenir: retenirBanc, remettre: remettreBanc, reglages: reglagesBanc,
};

// ── Attacher, détacher ───────────────────────────────────────────────────────
function installerEcouteurs() {
  if (D.ecouteurs || typeof document === 'undefined' || typeof window === 'undefined') return;
  const reveil = () => { if (D.attache || D.eveille) { demarrerMinuteur(); tickSur(); } };
  document.addEventListener('visibilitychange', reveil);
  const offFenetre = onWindowMinimizedChange(reveil);
  const offReglages = onPaysageReglages(reveil);
  const touche = (e) => {
    if (e.ctrlKey && e.altKey && !e.shiftKey && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); basculerBanc(API); }
  };
  window.addEventListener('keydown', touche);
  D.ecouteurs = () => {
    document.removeEventListener('visibilitychange', reveil);
    offFenetre(); offReglages();
    window.removeEventListener('keydown', touche);
  };
}
function adresseDemandeBanc() {
  try { return new URLSearchParams(window.location.search).get('son') === 'banc'; } catch { return false; }
}
// La carte se monte : le paysage s'éveille (si tout le permet).
export function paysageAttacher() {
  D.attache = true;
  installerEcouteurs();
  demarrerMinuteur();
  if (adresseDemandeBanc()) ouvrirBanc(API);
  tickSur();
}
// La carte se démonte : fondu de sortie, puis sommeil.
export function paysageDetacher() {
  D.attache = false;
  tickSur();
}

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__paysage = {
    etat: etatPaysage,
    tick: () => { tick(); return etatPaysage(); },
    // La pane de vérification est un onglet CACHÉ : sans ce forçage, le paysage s'y tait.
    forcer: (on = true) => { D.forcer = Boolean(on); tickSur(); return D.forcer; },
    banc: () => basculerBanc(API),
    ecouter, BANC, OREILLE,
  };
}
