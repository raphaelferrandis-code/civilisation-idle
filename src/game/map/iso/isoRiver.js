// LE FLEUVE — le ruban d'eau vivant, par-dessus le sol baké.
//
// Extrait d'isoRenderer.js le 2026-08-23 (Q10). Presque deux mille lignes pour une
// seule chose vue : de l'eau qui bouge. Le ruban lissé et ses îles, le RESSAC qui
// bat la berge, les ombres de poissons, le grain de surface, les quatre corps d'eau
// (un par état de la partie) et leur fondu, la nappe en motif répété par ère, le
// sillage et le rivage des îles.
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Couture mesurée avant la coupe :
// ZÉRO dépendance entrante, et une surface publique de TROIS symboles seulement
// (`drawIsoRiver` pour peindre, `riverRibbonPath` + `WATER_FILL` pour que le
// peintre puisse découper sur l'eau). Vérifiée ligne à ligne contre la version
// commitée.
//
// ⚠ IL A FALLU TROIS TRANCHES POUR LE DÉTACHER. Ses dépendances entrantes sont
// passées de 11 à 5 (tuiles + grève), puis à 2 (palette), puis à 0 (météo) — ce
// module est l'aboutissement de ce découpage, pas son point de départ. C'est aussi
// pour ça qu'il importe autant : il lit la matière du sol, la palette et la pluie.
//
// ⚠ AUCUN CYCLE : `quaysAndRiot` et `riverFleet` ne remontent jamais vers le
// peintre (vérifié avant la coupe), et `isoRiverLife` reçoit ce dont il a besoin
// par INJECTION (`configureRiverLife`), pas par import.
import { BANK_FACE, waterSinkPx, waterZ } from './isoRelief.js';
import { CM, cmHash } from '../layout.js';
import { worldToScreen } from './projection.js';
// ⚠ L'INJECTION VIT ICI, pas dans le peintre : c'est le fleuve qui donne à la vie du
// fleuve son chemin de ruban et sa météo (`configureRiverLife`, plus bas). Le sens du
// montage est conservé — isoRiverLife n'importe toujours QUE layout et projection,
// donc rien ne boucle.
import { configureRiverLife } from './isoRiverLife.js';
import { WINTER } from '../seasonMode.js';
import { orbitPoint, FLEET_TUNE } from '../riverFleet.js';
import { ensureQuayGate, quayWallTune, quayGapRuns } from '../quaysAndRiot.js';
import { ISO_TILE_KEYS, isoWinterTile, beachTone, isoVariantKey, ensureIsoTileKey, BEACH } from './isoGroundTiles.js';
import { WATER, waterShoreTune, rgb } from './isoPalette.js';
import { RAIN_TUNE, precipKind } from './isoWeather.js';

// ── FLEUVE : ruban lissé LIVE (par-dessus le bake, sous ponts et agents) ─────
// Même philosophie que pixelRiver legacy (Approche A : ruban continu depuis
// L.river.samples, zéro escalier de cellules) mais en projection iso : gauche/
// droite calculées en MONDE (pos ± normale·hw) puis projetées. Dessin LIVE à
// chaque frame (un polygone + liserés + reflets) → l'eau peut s'animer alors
// que le sol reste baké. Bateaux/quais : Phase 5 complète.
/* ── LE RESSAC : LE FLEUVE MONTE ET REDESCEND LE LONG DE SES BERGES ───────────
 * Demande de Raph (2026-07-30) : « des vagues — pour l'instant juste faire monter
 * et descendre le niveau d'eau partout, légèrement ».
 *
 * ⚠ LA VAGUE EST AU BORD, PAS SUR LA SURFACE — et ce n'est pas une humeur, c'est
 * le seul terrain qui reste. Le milieu du fleuve a déjà refusé trois fois ce
 * qu'on pourrait y poser : le grain procédural (trois calibrages, trois refus),
 * les vaguelettes vectorielles retirées le 2026-07-22 (« enlève les traits blancs
 * du courant, on n'en a plus besoin »), et la bande d'eau elle-même qu'il a fallu
 * CALMER le 2026-07-30 (« le fleuve est trop bruyant »). Y rajouter du mouvement,
 * c'est rouvrir les trois d'un coup. Au BORD, rien n'a jamais été refusé — et
 * c'est là qu'une vague se lit vraiment : ce qu'on reconnaît d'une vague, ce
 * n'est pas sa crête au large, c'est l'eau qui monte sur le sable et redescend.
 *
 * ⚠⚠ L'EAU N'AVANCE QUE, ELLE NE RECULE JAMAIS SOUS SON LIT PEINT. Le sol sous le
 * ruban est BAKÉ, et c'est de l'HERBE (berges douces, cf. drawIsoGround) : une eau
 * qui se retirerait en deçà de son bord habituel découvrirait du vert au ras de
 * l'onde, une fois par seconde, sur toute la longueur du fleuve. On pose donc le
 * lit peint comme MARÉE BASSE et la houle ne fait qu'y ajouter (`hw + amp·u`,
 * u ∈ [0,1]). Avancer ne peut que RECOUVRIR — il n'existe aucun cas où ça
 * découvre quoi que ce soit. C'est ce qui rend l'effet sûr PARTOUT, y compris
 * dans les configurations qu'on n'a pas regardées.
 *
 * Où ça se voit : partout où le ruban borde la terre — campements, plages, îles,
 * emprise du port, extrémités du cours. Sous les QUAIS, la promenade est peinte
 * APRÈS le fleuve, de son bord d'eau jusqu'à 0,7 tuile côté terre (`fillStrip`
 * dans renderWorld) : elle recouvre une avancée qui plafonne à 0,22. Le ressac y
 * est donc simplement invisible, sans un pixel d'eau sur la pierre — rien à
 * masquer, et c'est pour ça qu'il n'y a pas de garde par ère ici.
 *
 * ⚠ PUREMENT f(now), ET C'EST L'INVERSE DE stepWaterPhase — À DESSEIN. La phase de
 * la nappe, elle, DOIT être intégrée parce que sa vitesse suit la météo (cf. ⚠⚠
 * PHASE ACCUMULÉE, et le bug « à l'envers » de juillet). Ici la vitesse est
 * CONSTANTE par construction : l'averse ne touche QUE l'amplitude. Un temps absolu
 * × une vitesse constante ne saute jamais — on garde donc une fonction pure, et
 * une capture (now figé) reste reproductible. Ne JAMAIS faire dépendre `len` ou
 * `period` de la météo sans passer d'abord à une phase intégrée.
 *
 * Molette : window.__waves. `len = 0` retombe sur la MARÉE du premier jet — tout
 * le fleuve monte et descend ensemble, sans onde qui voyage.
 * ------------------------------------------------------------------------- */
export const waveTune = {
  on: true,
  // Avancée MAXIMALE de l'eau au-delà de son lit peint, en TUILES. Se juge contre
  // la bande de sable des berges (BEACH.bankBand = 0,55 tuile) : la vague reste
  // dedans, elle mouille le sable sans jamais atteindre l'herbe.
  amp: 0.22,
  len: 9, period: 3.4,                     // houle principale : longueur d'onde (tuiles), temps de parcours (s)
  len2: 4.3, period2: 2.1, mix2: 0.38,     // seconde houle — sans elle, l'onde bat la mesure comme un métronome
  // Les deux rives ne respirent PAS ensemble : en phase, le fleuve « gonfle » et
  // se dégonfle comme un tuyau au lieu de battre contre chacune de ses berges.
  sidePhase: 1.7,
  rainAmp: 0.7,                            // × amplitude à averse pleine (l'AMPLITUDE seule, jamais la vitesse)
  // Fondu au dézoom : sous 3 px d'écran l'onde ne se lit plus, elle scintille.
  minZoom: 0.3, fullZoom: 0.5,
  // ── SILLAGE D'ÎLE ─────────────────────────────────────────────────────────
  // Une île DIVISE le courant : l'eau s'empile sur la pointe amont et la pointe
  // aval est à l'abri. C'est le seul endroit de la carte où l'eau rencontre un
  // obstacle, donc le seul où elle peut le DIRE. On module l'amplitude du ressac
  // autour du fuseau (0 = île qui respire uniformément, comme une berge).
  wake: 0.75,
  // Écume de proue : l'arc de bas-fond VIF sur la pointe amont, là où l'onde se
  // brise. C'est la partie qu'on VOIT — la modulation d'amplitude, elle, ne vaut
  // que quelques pixels au zoom de jeu. Reste dans la famille admise (un trait au
  // CONTACT de la terre et de l'eau, comme le rivage d'île), et non une nappe
  // posée au milieu du fleuve — celles-là ont été refusées trois fois.
  bow: 1, bowArc: 0.34, bowW: 2.2,         // intensité, demi-ouverture (tours), × largeur du liseré
  // ── LA LAISSE ─────────────────────────────────────────────────────────────
  // Combien de temps le sable garde la trace de l'eau, et en combien de pas on
  // regarde en arrière. `wetMem = 0` recolle la frange à la ligne d'eau, soit
  // exactement le comportement d'avant le 2026-07-30.
  wetMem: 2.2, wetSteps: 8,
};
if (typeof window !== 'undefined') window.__waves = waveTune;

// Hauteur de l'onde en un point, normalisée 0..1 (0 = lit peint, 1 = crête).
// `s` = abscisse curviligne en TUILES, `t` = secondes, `side` = ±1 (la rive).
// Exportée PURE : c'est la forme de l'onde qui se teste, pas le dessin.
export function waveReach(s, t, side = 1, G = waveTune) {
  // len ≤ 0 : le terme spatial disparaît et toute la berge monte en même temps —
  // c'est la MARÉE demandée au départ, gardée comme A/B et non comme un cas mort.
  const ph = side < 0 ? G.sidePhase : 0;
  const sp1 = G.len > 0 ? s / G.len : 0, sp2 = G.len2 > 0 ? s / G.len2 : 0;
  const tp1 = G.period > 0 ? t / G.period : 0, tp2 = G.period2 > 0 ? t / G.period2 : 0;
  const m = Math.max(0, Math.min(1, G.mix2));
  return 0.5 + 0.5 * ((1 - m) * Math.sin(2 * Math.PI * (sp1 - tp1) + ph)
    + m * Math.sin(2 * Math.PI * (sp2 - tp2) + ph * 1.6));
}

// Variante BOUCLÉE, pour le contour d'une île.
//
// ⚠ UN CONTOUR FERMÉ NE TOLÈRE PAS UNE ONDE QUELCONQUE : évaluée sur l'abscisse
// curviligne comme sur les berges, l'onde ne retomberait pas sur sa valeur de
// départ après un tour, et l'île se refermerait sur une MARCHE — une encoche fixe
// dans le rivage, à l'endroit où la polyligne boucle. On arrondit donc chaque
// houle au nombre ENTIER de périodes le plus proche le long du périmètre : le
// motif garde son échelle (à un demi-cran près sur une île de ~30 tuiles de tour)
// et sin(2πk·u) reprend exactement sa valeur en u = 1. `u` = tour parcouru, 0..1.
export function waveReachLoop(u, perim, t, phase = 0, G = waveTune) {
  const k1 = G.len > 0 ? Math.max(1, Math.round(perim / G.len)) : 0;
  const k2 = G.len2 > 0 ? Math.max(1, Math.round(perim / G.len2)) : 0;
  const tp1 = G.period > 0 ? t / G.period : 0, tp2 = G.period2 > 0 ? t / G.period2 : 0;
  const m = Math.max(0, Math.min(1, G.mix2));
  return 0.5 + 0.5 * ((1 - m) * Math.sin(2 * Math.PI * (k1 * u - tp1) + phase)
    + m * Math.sin(2 * Math.PI * (k2 * u - tp2) + phase * 1.6));
}

/* ── LA LAISSE : JUSQU'OÙ L'EAU EST MONTÉE RÉCEMMENT ──────────────────────────
 * Demande de Raph (2026-07-30) : « laisser un liseré sombre quand les vagues
 * reviennent dans l'eau ». C'est la laisse de haute mer — le sable reste mouillé
 * là où l'eau vient de passer, et sèche derrière elle. Jusqu'ici la frange humide
 * était collée à la ligne d'eau, donc elle ne laissait jamais rien : elle montait
 * et redescendait avec la vague au lieu de marquer son passage.
 *
 * ⚠ SANS AUCUN ÉTAT, ET C'EST CE QUI LA REND JUSTE. La hauteur d'eau étant une
 * fonction PURE du temps, « jusqu'où l'eau est montée dans les dernières secondes »
 * se lit en rééchantillonnant l'onde EN ARRIÈRE. Un maximum glissant accumulé
 * frame par frame aurait marché aussi — et aurait rendu les captures dépendantes
 * de leur histoire, avec un séchage qui dérive selon le nombre d'images par
 * seconde. Ici, deux machines au même `now` voient la même laisse.
 *
 * Le terme `− k·h·dry` est le SÉCHAGE. Sans lui, la laisse resterait accrochée à
 * la dernière crête puis retomberait D'UN COUP le jour où celle-ci sort de la
 * fenêtre — un liseré qui saute au lieu de s'effacer. Avec lui elle redescend
 * doucement vers la ligne d'eau. Et comme le pas k = 0 n'est pas amorti, le
 * maximum est toujours ≥ la hauteur du moment : la laisse ne peut jamais passer
 * SOUS l'eau, ce qui la ferait disparaître par le mauvais côté.
 * ------------------------------------------------------------------------- */
export function waveWetReach(s, t, side = 1, G = waveTune) {
  if (!(G.wetMem > 0)) return waveReach(s, t, side, G);
  const n = Math.max(1, G.wetSteps | 0), h = G.wetMem / n, dry = 1 / G.wetMem;
  let best = 0;
  for (let k = 0; k <= n; k += 1) {
    const v = waveReach(s, t - k * h, side, G) - k * h * dry;
    if (v > best) best = v;
  }
  return best;
}

// Même laisse, sur le contour BOUCLÉ d'une île (cf. waveReachLoop).
export function waveWetReachLoop(u, perim, t, phase = 0, G = waveTune) {
  if (!(G.wetMem > 0)) return waveReachLoop(u, perim, t, phase, G);
  const n = Math.max(1, G.wetSteps | 0), h = G.wetMem / n, dry = 1 / G.wetMem;
  let best = 0;
  for (let k = 0; k <= n; k += 1) {
    const v = waveReachLoop(u, perim, t - k * h, phase, G) - k * h * dry;
    if (v > best) best = v;
  }
  return best;
}

// SILLAGE : de combien l'onde est amplifiée ou éteinte au tour d'une île, selon
// l'angle `a` dans le repère du fuseau.
//
// ⚠ `il.tx/ty` pointe vers l'AVAL (il est calculé sur des samples d'indice
// CROISSANT, et la nappe d'eau dérive dans le même sens) : donc a = 0 est la
// pointe aval — celle qui est À L'ABRI — et a = π la pointe amont, où l'eau
// s'empile. Inverser ces deux-là ferait un fleuve qui remonte, et rien à l'écran
// ne le dirait franchement : d'où le rappel ici plutôt qu'un signe nu.
//
// Périodique en `a` par construction (un cosinus), donc le contour d'île se
// referme toujours exactement — cf. waveReachLoop, même exigence.
// Pure et exportée : c'est la forme du sillage qui se teste.
export function islandWakeK(a, G = waveTune) {
  const w = Math.max(0, Math.min(1, G.wake));
  return 1 - w * Math.cos(a);
}

// État de l'onde pour LA frame en cours, posé une seule fois par drawIsoRiver et
// lu par tout ce qui touche au bord de l'eau (ruban, îles, bas-fond, frange
// mouillée, clips de la vie de surface). UNE seule source par frame, et c'est la
// raison d'être de ces variables : si le ruban et le liseré évaluaient chacun leur
// sinus, le moindre écart de `now` entre deux appels décollerait le liseré du bord.
let waveAmp = 0, waveT = 0;
let waveArc = null, waveArcPts = null;      // abscisse curviligne des samples, en tuiles
let waveHwCache = null;                     // demi-largeurs visuelles de la frame

// Abscisse curviligne, cuite une fois par cours d'eau. Clé = l'IDENTITÉ du tableau
// de samples : un recompute de layout en crée un neuf (cf. `const riverSamples =
// []`), donc la comparaison suffit et ne peut pas servir une vieille géométrie —
// là où une clé temporelle (layoutRecomputeAt) aurait tourné pour rien.
function ensureWaveArc(pts) {
  if (waveArcPts === pts && waveArc && waveArc.length === pts.length) return waveArc;
  const a = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i += 1) {
    a[i] = a[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  waveArc = a; waveArcPts = pts;
  return a;
}

// Ouvre la frame : fige l'instant et l'amplitude. Appelée UNE fois, en tête de
// drawIsoRiver — tout ce qui suit dans la frame lit la même onde.
function beginWaveFrame(now, z) {
  const G = waveTune;
  waveT = (now || 0) / 1000;
  // Fleuve MORT pendant l'effondrement : ni tuile, ni grain, ni poisson, ni
  // liseré — donc pas de ressac non plus. (L'USURE, elle, ne coupe plus rien
  // depuis le 2026-07-27 : une cité usée reste une cité.)
  if (!G.on || !(G.amp > 0) || CM.collapseAt) { waveAmp = 0; return; }
  const k = Math.max(0, Math.min(1, (z - G.minZoom) / Math.max(1e-3, G.fullZoom - G.minZoom)));
  const rf = Math.max(0, Math.min(1, RAIN_TUNE.on ? (CM.rainF || 0) : 0));
  waveAmp = G.amp * k * (1 + G.rainAmp * rf);
}

// Demi-largeurs VISUELLES des deux rives pour la frame (lit peint + ressac), ou
// null quand l'onde est éteinte — les appelants retombent alors sur `p.hw` au bit
// près, ce qui garantit « molette off ⇒ exactement l'image d'avant ».
// Les tableaux sont RÉUTILISÉS d'une frame à l'autre : le ruban est reprojeté une
// demi-douzaine de fois par frame, en allouer deux à chaque fois ferait des
// centaines de ko/s de déchets pour un résultat identique.
function waveHalfWidths(pts) {
  if (waveAmp <= 0) return null;
  let c = waveHwCache;
  if (c && c.pts === pts && c.t === waveT && c.amp === waveAmp) return c;
  const n = pts.length;
  if (!c || c.plus.length !== n) {
    c = waveHwCache = {
      pts: null, t: -1, amp: -1,
      plus: new Float64Array(n), minus: new Float64Array(n),
      wetPlus: new Float64Array(n), wetMinus: new Float64Array(n),
    };
  }
  const arc = ensureWaveArc(pts);
  for (let i = 0; i < n; i += 1) {
    const hw = pts[i].hw;
    c.plus[i] = hw + waveAmp * waveReach(arc[i], waveT, 1);
    c.minus[i] = hw + waveAmp * waveReach(arc[i], waveT, -1);
    // La LAISSE : jusqu'où l'eau est montée récemment. Toujours ≥ la ligne d'eau
    // du moment (cf. waveWetReach), donc côté TERRE d'elle par construction.
    c.wetPlus[i] = hw + waveAmp * waveWetReach(arc[i], waveT, 1);
    c.wetMinus[i] = hw + waveAmp * waveWetReach(arc[i], waveT, -1);
  }
  c.pts = pts; c.t = waveT; c.amp = waveAmp;
  return c;
}

// Rives GAUCHE et DROITE du ruban, projetées à l'écran. Extrait de
// riverRibbonPath pour que le pavage de l'eau (drawIsoWaterTiles) puisse borner
// ses colonnes sur la vraie emprise du ruban, et pas sur sa boîte englobante.
// C'est aussi LE goulot du ressac : les sept appels du ruban dans une frame
// passent tous par ici, donc corps d'eau, nappe animée, voile, poissons, vie de
// surface et clips restent collés au bord de l'eau du moment sans un mot de plus.
// `mode` : 'wave' (le bord de l'eau du moment, défaut) ou 'wet' (la LAISSE,
// jusqu'où l'eau est montée récemment). Même vocabulaire que buildEdges et
// islandOutline — c'est ce qui permet de CLIPPER sur la laisse.
function riverRibbonScreen(pts, T, mode = 'wave') {
  const left = [], right = [];
  const wv = waveHalfWidths(pts);
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const o = pts[Math.max(0, i - 1)], q = pts[Math.min(pts.length - 1, i + 1)];
    let tx = q.x - o.x, ty = q.y - o.y;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    const hl = wv ? (mode === 'wet' ? wv.wetPlus[i] : wv.plus[i]) : p.hw;
    const hr = wv ? (mode === 'wet' ? wv.wetMinus[i] : wv.minus[i]) : p.hw;
    // ⚠ LA NAPPE DESCEND ICI, et tout la suit par construction : le lit, les vagues,
    // les reflets, les bateaux, le contour des îles. C est le point d entrée du lot 1
    // (cf. iso/isoRelief.js). Un décalage ÉCRAN, ajouté après projection — la verticale
    // ne subit pas l écrasement iso, même convention que le lift du pont.
    // L ALTITUDE PASSE PAR L AXE, plus par un décalage posé après coup.
    const wz = waterZ();
    left.push(worldToScreen((p.x + nx * hl) * T, (p.y + ny * hl) * T, wz));
    right.push(worldToScreen((p.x - nx * hr) * T, (p.y - ny * hr) * T, wz));
  }
  return { left, right };
}
// Config de la vie de surface. ⚠ Elle passe DEUX FONCTIONS, et c'est ce qui la
// rend sûre ici : `riverRibbonPath` et `precipKind` sont des déclarations de
// fonction, donc hoistées — on peut les référencer avant leur ligne. Une `const`
// (NAV_STAGES l'a montré) serait en zone morte et jetterait au chargement.
configureRiverLife({ ribbonPath: riverRibbonPath, precipKind });

// Chemin du ruban d'eau, ÎLES COMPRISES.
//
// ⚠ Les îles sont des SOUS-CHEMINS SÉPARÉS, et tout consommateur doit donc
// remplir ou clipper en 'evenodd' (cf. WATER_FILL) : en règle nonzero, une île
// tracée dans le même sens que le ruban ne creuserait rien du tout et l'eau
// passerait par-dessus la terre. C'est le seul piège de ce fichier, et il est
// silencieux — l'image est juste « comme avant ».
//
// Le contour d'île est tracé en MONDE puis projeté point par point : une ellipse
// écran serait fausse, la projection iso écrase l'axe vertical de moitié et fait
// tourner les axes avec le cap du fleuve.
export const WATER_FILL = 'evenodd';

// Contour d'une île en points ÉCRAN. Tracé en MONDE puis projeté point par
// point : une ellipse écran serait fausse, la projection iso écrase l'axe
// vertical de moitié et fait tourner les axes avec le cap du fleuve.
// Partagé par le chemin d'eau et le bas-fond, pour que la berge de l'île tombe
// exactement sur le bord de l'eau.
// `mode` : quelle des TROIS lignes de l'île tracer.
//   'wave' — le bord de l'eau du moment (le ruban et son clip)
//   'wet'  — la LAISSE, jusqu'où l'eau est montée récemment (frange humide)
//   'base' — le lit peint, fixe (le sable du rivage, qui ne bouge pas)
// Elles se confondent toutes les trois quand l'onde est éteinte.
function islandOutline(il, T, N = 30, mode = 'wave') {
  const out = [];
  // Le ressac fait aussi le tour des îles, en RONGEANT leur contour et jamais en
  // l'élargissant : une île est un TROU dans le ruban, donc « l'eau avance » s'y
  // dit « le trou rétrécit ». Même règle que les berges, même sûreté — l'herbe
  // bakée de l'île se fait recouvrir, jamais découvrir.
  const on = mode !== 'base' && waveAmp > 0;
  const reach = mode === 'wet' ? waveWetReachLoop : waveReachLoop;
  const rMid = (il.rx + il.ry) / 2, perim = 2 * Math.PI * rMid;
  // Phase propre à chaque île (sa position) : sans elle, les deux îles des bras du
  // fleuve battraient à l'unisson, ce qui se remarque tout de suite.
  const ph = on ? (il.x * 0.7 + il.y * 1.3) % (Math.PI * 2) : 0;
  for (let i = 0; i <= N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    const d = on ? waveAmp * islandWakeK(a) * reach(i / N, perim, waveT, ph) : 0;
    // Retrait MÉTRIQUE sur les deux axes (et non un facteur d'échelle) : l'Aiguille
    // fait rx 7,6 pour ry 2,4, une homothétie y creuserait trois fois plus dans le
    // sens du courant qu'en travers.
    const rx = Math.max(0.25, il.rx - d), ry = Math.max(0.25, il.ry - d);
    const al = Math.cos(a) * rx, cr = Math.sin(a) * ry;
    // Repère de l'île : `al` le long du courant, `cr` en travers.
    // Le contour d île suit la nappe : une île est un TROU dans le ruban, son bord
    // est donc au niveau de l eau, pas du sol.
    out.push(worldToScreen((il.x + al * il.tx - cr * il.ty) * T, (il.y + al * il.ty + cr * il.tx) * T, waterZ()));
  }
  return out;
}
const riverIslands = () => {
  const rv = CM.layout && CM.layout.river;
  return (rv && rv.islands) || null;
};

// `keep` : n'ouvre PAS un chemin neuf, ajoute le ruban à celui en cours. Sert au
// clip « côté TERRE » (rect plein + ruban en evenodd) du liseré de galets humides.
// `mode` : 'wave' (le bord de l'eau du moment) ou 'wet' (la LAISSE). Le second sert
// à BORNER la frange mouillée au terrain que la vague vient de découvrir.
export function riverRibbonPath(ctx, pts, T, keep = false, mode = 'wave') {
  const { left, right } = riverRibbonScreen(pts, T, mode);
  if (!keep) ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i += 1) ctx.lineTo(left[i].x, left[i].y);
  for (let i = right.length - 1; i >= 0; i -= 1) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  const isles = riverIslands();
  if (!isles) return;
  for (const il of isles) {
    const o = islandOutline(il, T, undefined, mode);
    ctx.moveTo(o[0].x, o[0].y);
    for (let i = 1; i < o.length; i += 1) ctx.lineTo(o[i].x, o[i].y);
    ctx.closePath();
  }
}
// ── OMBRES DE POISSONS (retour Raph, réf. Animal Crossing) ───────────────────
// Silhouettes sombres fusiformes qui dérivent SOUS la surface : corps + queue
// qui bat, serpentage lent le long du ruban, et un FRÉTILLEMENT périodique
// (anneaux de rides en surface). Purement f(now) — aucune sim, aucun état :
// une capture (now figé) les fige, un même now redonne la même scène, coût ~0.
// Dessinées AVANT les vaguelettes (les reflets clairs passent PAR-DESSUS →
// lecture « sous la surface ») et clippées au ruban. Le fleuve ruiné
// (effondrement/usure) n'a plus de vie. Molette : window.__fishTune
// ({ on, count, alpha, speed, size }) — count = poissons par sample (~0.05).
export const fishTune = { on: true, count: 0.07, alpha: 0.34, speed: 1, size: 1 };
if (typeof window !== 'undefined') window.__fishTune = fishTune;
function drawIsoFishShadows(ctx, rv, T, z, now) {
  if (!fishTune.on || z < 0.5) return;
  // L'Usure ne vide plus le fleuve de ses poissons (Raph, 2026-07-27, même
  // arbitrage que la texture d'eau, les quais et le bas-fond) : une cité usée
  // reste une cité, pas un décor mort. Seul l'effondrement en cours les retire.
  if (CM.collapseAt) return;
  const sm = rv.samples, len = sm.length;
  if (len < 4) return;
  const n = Math.max(3, Math.min(12, Math.round(len * fishTune.count)));
  const t = (now || 0) / 1000;
  ctx.save();
  riverRibbonPath(ctx, sm, T);
  ctx.clip(WATER_FILL);
  for (let i = 0; i < n; i += 1) {
    // ⚠ cmHash renvoie du SIGNÉ (piège connu) : h forcé en unsigned, sinon les
    // modulos sortent négatifs → tailles négatives (ellipse() jette) et alphas
    // écrasés (poissons invisibles, vu au débogage).
    const h = cmHash('fish:' + i + ':' + (CM.layoutRecomputeAt || 0)) >>> 0;
    const size = (0.55 + ((h >>> 3) % 100) / 100 * 0.9) * fishTune.size;
    const dir = (h & 1) ? 1 : -1;
    // CYCLE nage → arrêt (retour Raph « plus lents, et qu'ils s'arrêtent de
    // temps en temps »), toujours f(now) : dans chaque cycle le poisson GLISSE
    // en ease-in-out (départ et arrêt doux) puis reste posé le reste du cycle
    // — et c'est au début de la pause qu'il frétille (rides, plus bas).
    const P = 12 + (h % 9);                             // période du cycle (s)
    const swimF = 0.58 + ((h >>> 7) % 20) / 100;        // fraction du cycle en nage
    const Ps = P * swimF;
    const tf = t + (((h >>> 15) % 1000) / 1000) * P;    // horloge propre au poisson
    const cyc = tf % P;
    const swimming = cyc < Ps;
    const xw = swimming ? cyc / Ps : 1;
    const easep = xw * xw * (3 - 2 * xw);               // progression 0..1 du cycle courant
    const D = (0.0013 + ((h >>> 9) % 100) / 100 * 0.0016) * P * fishTune.speed; // fraction de ruban / cycle
    const drift = (Math.floor(tf / P) + easep) * D * dir;
    let ft = (((h >>> 5) % 1000) / 1000 + drift) % 1;
    if (ft < 0) ft += 1;
    const fi = ft * (len - 1);
    const i0 = Math.min(len - 2, Math.floor(fi)), f = fi - i0;
    const a = sm[i0], b = sm[i0 + 1];
    const cx = a.x + (b.x - a.x) * f, cy = a.y + (b.y - a.y) * f;
    const hw = (a.hw || 2) + (((b.hw || 2)) - (a.hw || 2)) * f;
    // Voie latérale : ligne personnelle stable + serpentage, bornée DANS le ruban.
    let nx = -(b.y - a.y), ny = (b.x - a.x);
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    const latBase = (((h >>> 11) % 100) / 100 - 0.5) * 1.1;
    const lat = (latBase + Math.sin(t * 0.13 + (h % 11)) * 0.16) * Math.max(0, hw - 0.55);
    const p = worldToScreen((cx + nx * lat) * T, (cy + ny * lat) * T);
    if (p.x < -40 || p.x > CM.cw + 40 || p.y < -40 || p.y > CM.ch + 40) continue;
    // Cap écran = tangente projetée (± sens de nage) + ondulation du corps —
    // presque figée à l'arrêt (le poisson se maintient, il ne danse pas).
    const pa = worldToScreen(a.x * T, a.y * T), pb = worldToScreen(b.x * T, b.y * T);
    const ang = Math.atan2((pb.y - pa.y) * dir, (pb.x - pa.x) * dir)
      + Math.sin(t * 1.1 + (h % 13)) * (swimming ? 0.13 : 0.045);
    const L2 = T * z * 0.18 * size;                     // demi-longueur écran du corps
    const al = fishTune.alpha * (0.8 + ((h >>> 13) % 40) / 100);
    ctx.fillStyle = `rgba(12,26,34,${al.toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, L2, L2 * 0.38, ang, 0, Math.PI * 2);
    ctx.fill();
    // Queue : petite goutte derrière le corps ; battement ample en nage,
    // lent et discret à l'arrêt.
    const wag = Math.sin(t * (swimming ? 5.2 : 2.1) + (h % 17)) * L2 * (swimming ? 0.22 : 0.09);
    const qx = p.x - Math.cos(ang) * L2 * 1.15 - Math.sin(ang) * wag;
    const qy = p.y - Math.sin(ang) * L2 * 1.15 + Math.cos(ang) * wag;
    ctx.beginPath();
    ctx.ellipse(qx, qy, L2 * 0.34, L2 * 0.18, ang, 0, Math.PI * 2);
    ctx.fill();
    // Frétillement AU DÉBUT DE LA PAUSE (le poisson s'arrête et gobe en
    // surface) : 1-2 anneaux de rides éphémères, couchés au sol (scale 1:0.5).
    if (!swimming) {
      const k = (cyc - Ps) / 1.4;                       // 0..1 sur ~1,4 s de pause
      if (k < 1) {
        const r = (4 + k * 10) * z * (0.7 + size * 0.4);
        ctx.strokeStyle = `rgba(214,236,240,${(0.35 * (1 - k)).toFixed(2)})`;
        ctx.lineWidth = Math.max(1, z * 0.8);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(1, 0.5);
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
        if (k > 0.35) { ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
      }
    }
  }
  ctx.restore();
}

/* ── GRAIN DE SURFACE DE L'EAU ────────────────────────────────────────────────
 * Le corps d'eau était un APLAT (un seul `ctx.fill()` de WATER) : la seule
 * surface non texturée de la carte, alors que sol/routes/bâtiments sont tous en
 * pixel-art. On tile ici un moucheté seamless DANS le clip du ruban.
 *
 * Pourquoi une tuile de bruit et pas un tileset d'eau acheté : le fleuve est un
 * RUBAN spline clippé (zéro escalier, cf. riverRibbonPath) — des tuiles d'eau
 * autotile sont indexées sur des CELLULES et obligeraient à rasteriser le fleuve
 * sur la grille, ce qui réintroduirait pile l'escalier que le ruban supprime.
 * Seule une texture pleine-cadre seamless se branche ici. Si un jour on achète
 * une vraie tuile animée, elle se substitue à `grainTile()` sans toucher au reste.
 *
 * La tuile est TRANSPARENTE au repos (mouchetures claires/sombres seulement) :
 * le ton de l'eau reste porté par le fill de WATER, donc impossible de dériver
 * hors palette.
 *
 * ⚠ ÉCHELLE AVANT CONTRASTE. Première version invisible en jeu : GRAIN_PX valait 2
 * px monde, soit ~1,1 px ÉCRAN au zoom réel (mesuré 0,55) — les octaves fines
 * tombaient sous le pixel et se moyennaient à néant. Un moucheté d'eau doit être
 * porté par les BASSES fréquences (nappes larges de profondeur), pas par du grain
 * fin : d'où le poids massif sur l'octave 4 et un GRAIN_PX qui garde des blocs
 * lisibles à l'écran. Le contraste ne rattrape jamais une échelle sous-pixel.
 *
 * Tiling en espace ÉCRAN mais ancré au monde (worldToScreen(0,0)) : la projection
 * iso étant affine, la nappe translate exactement avec le monde au pan et à la
 * molette. Elle n'est PAS cisaillée sur le plan du sol — invisible pour un
 * moucheté isotrope, et ça préserve le nearest-neighbor (pixels nets).
 * Purement f(now) → une capture reste déterministe. Molette : window.__waterGrain.
 * ------------------------------------------------------------------------- */
// ⛔ COUPÉ PAR DÉFAUT — ÉCHEC ASSUMÉ, NE PAS RALLUMER SANS CHANGER DE PRIMITIVE.
// Trois calibrages, trois refus de Raph, et les deux extrémités du réglage sont
// mauvaises pour la MÊME raison de fond :
//   • grain fin  → tombe sous le pixel écran (1,1 px au zoom réel), invisible ;
//   • grain large → nappes pâles et FLOUES (« un truc bizarre »), du brouillard
//     posé au milieu d'une scène en pixel art net.
// Un champ de bruit n'a pas de STRUCTURE : l'eau a des crêtes, des rides, une
// direction ; le bruit n'a que des taches. Aucun réglage intermédiaire ne sauve
// ça. Ce qui reste utile ici, c'est le HARNAIS (tiling seamless ancré au monde
// dans le clip du ruban + compensation de nuit) : une vraie tuile d'eau animée
// se substitue à `grainTile()` et réutilise tout le reste tel quel.
// L'effet qui MARCHE sur cette eau est ailleurs : drawIsoCityReflections.
export const waterGrainTune = {
  on: false,
  minZoom: 0.5,                  // sous ce zoom le grain est invisible : on ne paie pas
  dark: '10,26,34', light: '196,226,235',
  // Balayage mesuré sur l'encre du canvas (A/B grain on/off, pixels exactement à
  // l'ardoise) : 0,36/0,26 → 6,4 par canal = INVISIBLE en jeu (retour Raph « t'as
  // rien changé »). 0,60/0,45 → 11,5. 0,85/0,65 → 17,3 (~7 %), retenu. Le cran
  // suivant (1/0,85 → 23,1) couvre 99 % et perd le ton de l'ardoise.
  aDark: 0.85, aLight: 0.65,     // opacité des mouchetures (de jour)
  nightBoost: 1,                 // × opacité à nuit pleine, compense le voile (cf. grainTile)
  nightSpread: 0.05,             // rapproche les seuils du milieu la nuit (opacité saturée)
  loDark: 0.44, hiLight: 0.59,   // seuils de quantification (entre les deux = transparent)
  // Deux nappes à vitesses différentes : c'est ce qui casse la lecture « papier
  // peint » d'une tuile unique qui défile. Vitesses en px monde/s vers l'aval.
  layers: [{ speed: 4.5, alpha: 1, lat: 0 }, { speed: 2.0, alpha: 0.55, lat: 0.35 }]
};
if (typeof window !== 'undefined') window.__waterGrain = waterGrainTune;

const GRAIN_SRC = 128;           // taille de la tuile bakée (px monde) = période du motif
const GRAIN_PX = 2;              // taille d'un « pixel » de grain (chunky, pixel-art)
let grainCanvas = null, grainKey = '';

// Bruit de valeur à lattice PÉRIODIQUE (indices modulo n) → la tuile est seamless
// par construction, aucun raccord à masquer.
function grainNoise(n, seed, u, v) {
  const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
  const xa = ((x0 % n) + n) % n, ya = ((y0 % n) + n) % n;
  const xb = (xa + 1) % n, yb = (ya + 1) % n;
  const at = (x, y) => ((cmHash('wg:' + seed + ':' + (y * n + x)) >>> 0) % 10000) / 10000;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);   // smoothstep
  const t = at(xa, ya) + (at(xb, ya) - at(xa, ya)) * sx;
  const b = at(xa, yb) + (at(xb, yb) - at(xa, yb)) * sx;
  return t + (b - t) * sy;
}

// Tuile bakée une fois (invalidée seulement si les réglages changent).
function grainTile() {
  const G = waterGrainTune;
  // ⚠ COMPENSATION DE NUIT. Le voile de nuit est peint PAR-DESSUS l'eau et écrase
  // le grain de moitié : mesuré 16,8 d'écart de luminance moyen le jour contre 8,7
  // à nightF=1 — soit un retour sous le seuil du visible pour une ville de nuit.
  // On bake donc des mouchetures plus opaques à mesure que la nuit tombe. Palier de
  // 1/4 : sans quantification la tuile serait recuite à CHAQUE frame du cycle
  // jour/nuit. ⚠ `captureFrame` force le JOUR — une mesure faite via captureFrame
  // ne voit jamais ce cas, c'est le piège qui a fait passer deux calibrages à côté.
  const nf = Math.round(Math.min(1, Math.max(0, CM.nightF || 0)) * 4) / 4;
  const boost = 1 + (G.nightBoost || 0) * nf;
  const aD = Math.min(1, G.aDark * boost), aL = Math.min(1, G.aLight * boost);
  // L'opacité SATURE à 1 : passé nightBoost ≈ 1,5 la monter encore ne fait plus
  // rien. Le seul levier qui reste la nuit est le SEUIL — on rapproche les deux
  // bornes du milieu pour que davantage de pixels reçoivent une moucheture au
  // lieu de rester transparents.
  const spread = (G.nightSpread || 0) * nf;
  const lo = Math.min(0.5, G.loDark + spread), hi = Math.max(0.5, G.hiLight - spread);
  const key = [G.dark, G.light, aD, aL, lo, hi].join('|');
  if (grainCanvas && grainKey === key) return grainCanvas;
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = GRAIN_SRC;
  const c = cv.getContext('2d');
  const img = c.createImageData(GRAIN_SRC, GRAIN_SRC);
  const D = G.dark.split(',').map(Number), Lt = G.light.split(',').map(Number);
  const N = GRAIN_SRC / GRAIN_PX;                       // cellules de grain par côté
  // 3 octaves, poids ÉCRASANT sur la plus basse : l'eau se lit par nappes larges
  // (~1 tuile de jeu = 32 px monde) qui survivent à n'importe quel zoom, pas par
  // du grain fin qui tombe sous le pixel écran et se moyenne à néant.
  const OCT = [[4, 0.70], [8, 0.22], [16, 0.08]];
  for (let cy = 0; cy < N; cy += 1) {
    for (let cx = 0; cx < N; cx += 1) {
      let v = 0;
      for (let o = 0; o < OCT.length; o += 1) {
        const [ln, w] = OCT[o];
        v += grainNoise(ln, o, (cx / N) * ln, (cy / N) * ln) * w;
      }
      let r = 0, g = 0, b = 0, a = 0;
      if (v < lo) { r = D[0]; g = D[1]; b = D[2]; a = aD * (1 - v / lo); }
      else if (v > hi) { r = Lt[0]; g = Lt[1]; b = Lt[2]; a = aL * ((v - hi) / (1 - hi)); }
      if (a <= 0) continue;                              // reste transparent
      const A = Math.round(Math.max(0, Math.min(1, a)) * 255);
      for (let py = 0; py < GRAIN_PX; py += 1) {         // bloc chunky
        for (let px = 0; px < GRAIN_PX; px += 1) {
          const i = (((cy * GRAIN_PX + py) * GRAIN_SRC) + (cx * GRAIN_PX + px)) * 4;
          img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = A;
        }
      }
    }
  }
  c.putImageData(img, 0, 0);
  grainCanvas = cv; grainKey = key;
  return cv;
}

function drawIsoWaterGrain(ctx, pts, T, z, now) {
  const G = waterGrainTune;
  if (!G.on || z < G.minZoom) return;
  const tile = grainTile();
  if (!tile) return;
  const len = pts.length;
  // Boîte écran du fleuve (centres projetés + marge de la demi-largeur max),
  // intersectée au viewport : on ne tile QUE ce qui peut être vu.
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, maxHw = 0;
  for (let i = 0; i < len; i += 1) {
    const p = pts[i], w = worldToScreen(p.x * T, p.y * T);
    if (w.x < bx0) bx0 = w.x; if (w.x > bx1) bx1 = w.x;
    if (w.y < by0) by0 = w.y; if (w.y > by1) by1 = w.y;
    if ((p.hw || 0) > maxHw) maxHw = p.hw || 0;
  }
  const pad = maxHw * T * z * 2 + 4;
  bx0 = Math.max(0, bx0 - pad); by0 = Math.max(0, by0 - pad);
  bx1 = Math.min(CM.cw, bx1 + pad); by1 = Math.min(CM.ch, by1 + pad);
  if (bx1 <= bx0 || by1 <= by0) return;
  // Aval en espace écran (tangente globale projetée) → le grain dérive avec le
  // courant, jamais « en travers » du fleuve.
  const pA = worldToScreen(pts[0].x * T, pts[0].y * T);
  const pB = worldToScreen(pts[len - 1].x * T, pts[len - 1].y * T);
  let dx = pB.x - pA.x, dy = pB.y - pA.y;
  const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  const anchor = worldToScreen(0, 0);                    // ancrage monde (suit le pan)
  const step = GRAIN_SRC * z;
  const sz = Math.ceil(step) + 1;                        // +1 px : coutures au zoom fractionnaire
  const t = (now || 0) / 1000;
  const prevS = ctx.imageSmoothingEnabled, prevA = ctx.globalAlpha;
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  riverRibbonPath(ctx, pts, T);
  ctx.clip(WATER_FILL);
  for (const ly of G.layers) {
    const d = t * ly.speed * z;
    const ox = anchor.x + dx * d - dy * d * (ly.lat || 0);
    const oy = anchor.y + dy * d + dx * d * (ly.lat || 0);
    const c0 = Math.floor((bx0 - ox) / step), c1 = Math.ceil((bx1 - ox) / step);
    const r0 = Math.floor((by0 - oy) / step), r1 = Math.ceil((by1 - oy) / step);
    ctx.globalAlpha = ly.alpha;
    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) {
        ctx.drawImage(tile, Math.floor(ox + col * step), Math.floor(oy + row * step), sz, sz);
      }
    }
  }
  ctx.restore();
  ctx.globalAlpha = prevA;
  ctx.imageSmoothingEnabled = prevS;
}

/* ---------------------------------------------------------------------------
 * TEXTURE D'EAU ANIMÉE — la primitive qui remplace le grain.
 *
 * Le grain procédural ci-dessus a été refusé trois fois pour une raison de
 * fond : un champ de bruit n'a pas de STRUCTURE, l'eau a des rides et une
 * direction. On blitte donc une vraie tuile pixel-art animée (8 frames), cuite
 * par scripts/bakeWaterTiles.mjs depuis le pack Zro Dfects et REMAPPÉE sur
 * l'ardoise du jeu — la moyenne pondérée de la rampe retombe sur WATER à 3
 * près par canal, donc la texture apporte le relief sans déplacer le ton.
 *
 * ⚠ ÉCHELLE, ET LE PIÈGE EST DANS LES DEUX SENS. Trop petit, le motif tombe
 * sous le pixel écran et se moyenne à néant (c'est ce qui a tué le grain). Mais
 * trop grand, il ne lit plus comme de l'eau : `worldPx` valait 6, soit des
 * pixels d'eau SIX FOIS plus gros que ceux du sol — retour Raph « on a un gros
 * fleuve énervé ». Le bon repère n'est pas un seuil abstrait mais l'ÉCHELLE DU
 * PIXEL D'ART DU JEU : les tuiles de sol iso font 64×64 px d'art pour une
 * cellule, donc à zoom 1 un pixel d'art = un pixel écran = 0,5 px monde.
 * `worldPx = 2` met le pixel d'eau à deux crans de cette référence — assez fin
 * pour appartenir à la même image, assez gros pour survivre au dézoom (1,1 px
 * écran au zoom 0,55). Période 32 px monde = 1 tuile de jeu.
 *
 * Reprend le harnais du grain : tiling en espace écran ancré à worldToScreen(0,0)
 * (la projection iso est affine → la nappe translate exactement avec le monde au
 * pan et au zoom, et le nearest-neighbor est préservé), dans le clip du ruban.
 * La tuile étant OPAQUE, `strength` la mélange au fill WATER : comme sa moyenne
 * EST WATER, baisser strength atténue le relief sans bouger la teinte.
 * Purement f(now) → une capture reste déterministe. Molette : window.__waterTiles.
 * ------------------------------------------------------------------------- */
export const waterTilesTune = {
  on: true,
  minZoom: 0.32,        // sous ce zoom la structure passe sous le pixel : on ne paie pas
  worldPx: 2,           // px MONDE par pixel de tuile (cf. ⚠ ÉCHELLE ci-dessus)
  strength: 1,          // 0..1 — mélange au fill WATER, sans dérive de teinte
  // ── BANDE CALME (retour Raph 2026-07-30 : « le fleuve est trop bruyant ») ───
  // Les 8 frames du pack ne sont pas une vague qui avance, ce sont huit champs
  // de bruit indépendants : 48,6 % des pixels changent à CHAQUE transition, dont
  // 30,4 points dans le seul CORPS de l'eau, et PAS UN SEUL pixel n'est stable
  // sur le cycle. À worldPx = 2 un pixel de tuile fait ~1 px écran : l'œil ne
  // résout plus les formes, il ne perçoit que le clignotement → neige de télé.
  // Et aucun réglage n'en sort : la distance MINIMALE entre deux frames
  // quelconques est de 33 %, donc ni un fps plus bas ni un sous-ensemble de
  // frames ne calment quoi que ce soit — baisser le fps ne fait que ralentir le
  // bouillonnement, ce qui rend chaque saut plus visible, pas moins.
  //
  // La règle des tutos d'eau pixel art (Slynyrd « Water in Motion », Wolthera
  // « Animating Water Tiles ») : on n'anime PAS toute la surface, on FIGE le
  // corps et on ne fait bouger que les reflets. `scripts/calmWaterTiles.mjs`
  // recompose donc la bande — substrat gelé + seuls les éclats réimprimés,
  // frames réordonnées pour que les reflets se déplacent au lieu de sauter.
  // Mesuré : churn 48,6 % → 10,5 %, ton du fleuve inchangé (dérive 1/1/0).
  // A/B : window.__waterTiles.calm = false rejoue la bande d'origine (brute) —
  // et court-circuite du même coup les coloris d'état (cf. WATER_SHEETS).
  calm: true,
  fade: 1.2,            // secondes de fondu quand le fleuve change de coloris
  // DEUX AMBIANCES, interpolées par CM.rainF (le même signal que l'averse).
  // Retour Raph : sous la pluie l'eau sombre et agitée « c'était très bien », mais
  // il la veut CLAIRE et le clapot LENT par beau temps. `drawIsoRain` ne touche
  // pas l'eau — elle pose rgba(38,46,62) à 0,18 sur TOUT l'écran — donc ce qui
  // avait plu, c'est l'eau ASSOMBRIE : on rejoue ce voile dans le seul clip du
  // ruban, et on l'inverse au beau fixe.
  //   tint > 0 : voile ardoise rgba(38,46,62)  → eau sombre (aspect averse)
  //   tint < 0 : voile pâle rgba(158,184,192)  → eau claire (aspect beau temps)
  // Le pâle EST l'éclat de la tuile elle-même : impossible de dériver hors palette.
  // ⚠⚠ LA DÉRIVE EST LE SECOND BRUIT, ET ON NE LE VOIT QU'À L'ÉCRAN. La bande ne
  // dit que la moitié de l'histoire : la nappe DÉFILE aussi, et un motif à fort
  // contraste translaté d'une fraction de pixel fait BASCULER ses bords d'un ton
  // à l'autre (nearest-neighbor, règle du projet) — un scintillement de bord qui
  // ne se lit dans aucun PNG. Mesuré en jeu à zoom 0,55 sur 46 102 px de fleuve
  // visible, en comptant les pixels qui changent de plus de 20 de luminance en
  // une seconde, fond de scène déduit :
  //   dérive 0,7 → 0,5 → 0,2 → 0 : 26 024 / 10 063 / 7 156 / 4 632 px.
  // À 0,7 px monde/s la nappe met 46 s à parcourir une période : personne n'y lit
  // un sens de courant, mais tout le monde en voit le grésillement. On garde donc
  // juste un souffle de courant au beau fixe, et on met la vraie vitesse sous
  // l'averse — où l'eau DOIT s'agiter, et où Raph l'avait justement trouvée bien.
  fair: { fps: 1.8, drift: 0.2, tint: -0.10 },   // beau temps : claire, clapot posé
  rain: { fps: 4, drift: 1.2, tint: 0.18 },      // averse : sombre et agitée
};
if (typeof window !== 'undefined') window.__waterTiles = waterTilesTune;

const WATER_TILE = 16, WATER_FRAMES = 8;
// ⚠⚠ PHASE ACCUMULÉE — une VITESSE VARIABLE NE SE MULTIPLIE JAMAIS PAR UN TEMPS
// ABSOLU. `Math.floor(t * fps)` avec un fps qui suit la météo saute à chaque
// changement : à t = 1000 s, passer de 2,5 à 7 images/s fait bondir `t * fps` de
// 2500 à 7000, et l'index de frame atterrit n'importe où. Pire, quand l'averse
// FAIBLIT le produit DÉCROÎT → l'animation joue À L'ENVERS (retour Raph
// 2026-07-22 : « quand il pleut c'est accéléré, mais surtout à l'envers, et
// après la pluie ça saccade »). Un premier pansement (`t % period`) n'y changeait
// rien : `period` dépendait elle-même de la vitesse, donc sautait aussi.
// On INTÈGRE donc la phase image par image — continue par construction quelle que
// soit la variation de vitesse — et on la borne par un modulo sur une période
// CONSTANTE (nombre de frames, période SPATIALE en px monde), jamais sur une
// période dérivée de la vitesse.
let waterPhaseFrame = 0, waterPhaseDrift = 0, waterPhaseAt = -1;
// Un pas d'intégration. Exportée PURE pour être testable : c'est la continuité de
// cette fonction sous vitesse variable qui a été le bug, pas le rendu.
export function stepWaterPhase(prev, t, fps, drift, spatial) {
  const dt = prev.at < 0 ? 0 : Math.min(0.25, Math.max(0, t - prev.at));
  const wrap = (v, m) => ((v % m) + m) % m;
  return {
    at: t,
    frame: wrap(prev.frame + dt * fps, WATER_FRAMES),
    drift: wrap(prev.drift + dt * drift, spatial)
  };
}
// ── QUATRE CORPS D'EAU, UN PAR ÉTAT DE LA PARTIE ────────────────────────────
// Demande de Raph (2026-07-30) : le fleuve change de coloris selon ce que vit la
// cité — azur quand tout va bien, turquoise quand l'usure monte, bleu pâle en
// hiver, ardoise sous l'averse. Coloris NATIFS du pack (`bakeWaterTiles --native`)
// : ici la teinte EST l'information, la rabattre sur WATER la détruirait — c'est
// l'exception assumée à la règle « la texture ne déplace pas le ton du fleuve ».
//
// Chaque coloris porte TOUT ce qui doit s'accorder à lui, et pas seulement son
// PNG — sinon le fleuve change de couleur en laissant derrière lui un liseré et
// des reflets restés en ardoise (constaté en jeu le 2026-07-30) :
//   `pale`  la teinte la plus CLAIRE de la bande, celle que le voile de beau temps
//           (tint < 0) vient poser. Prise DANS la bande, sinon l'éclat ardoise de
//           l'ancienne planche désature l'azur.
//   `dim`   AJOUTÉ au tint (positif = plus sombre). Retour Raph « l'état normal est
//           un peu trop flashy en jeu » : l'azur natif est nettement plus vif que
//           la carte, et il recevait EN PLUS le voile pâle du beau temps (−0,10),
//           donc on l'éclaircissait encore. `dim` renverse ce voile et pose un
//           soupçon d'ardoise par-dessus. Les autres coloris restent à 0.
//   `shore` les 3 bandes du bas-fond, du halo doux au liseré vif (waterShoreTune).
//   `quay`  le bas-fond que trace le MUR DE QUAI (renderWorld drawRun) dès la
//           bande 2 : sans lui, faire suivre le liseré n'aurait rien changé aux
//           ères qui ont des quais, c'est-à-dire presque toutes.
//   `wash`  la teinte vers laquelle on tire les reflets nocturnes de la ville.
// Exportée : un coloris ajouté sans son accord complet ferait retomber le liseré
// en ardoise sans que rien ne proteste — c'est la table elle-même qu'on teste.
export const WATER_SHEETS = {
  beau: {
    src: '/pixelart/water/river-tiles-calm-azur.png', pale: '207,255,255', dim: 0.14,
    shore: ['96,175,250', '140,212,252', '206,242,255'],
    quay: ['rgba(120,190,235,0.50)', 'rgba(206,238,252,0.62)'], wash: '95,200,250',
  },
  usure: {
    src: '/pixelart/water/river-tiles-calm-turquoise.png', pale: '207,255,255', dim: 0,
    shore: ['74,190,175', '132,222,210', '206,248,242'],
    quay: ['rgba(110,200,188,0.50)', 'rgba(206,244,236,0.62)'], wash: '80,220,205',
  },
  hiver: {
    src: '/pixelart/water/river-tiles-calm-hiver.png', pale: '219,243,243', dim: 0,
    shore: ['140,168,214', '178,202,232', '224,240,248'],
    quay: ['rgba(160,186,214,0.50)', 'rgba(224,238,248,0.62)'], wash: '150,190,225',
  },
  // Ardoise : valeurs HISTORIQUES à l'identique (liseré validé le 2026-07-16,
  // bas-fond de quai d'origine) — ce coloris ne doit rien changer à l'existant.
  pluie: {
    src: '/pixelart/water/river-tiles-calm.png', pale: '158,184,192', dim: 0,
    shore: ['120,160,175', '150,192,205', '190,224,232'],
    quay: ['rgba(150,184,180,0.50)', 'rgba(202,224,214,0.62)'], wash: '150,190,205',
  },
  brute: {
    src: '/pixelart/water/river-tiles.png', pale: '158,184,192', dim: 0,
    shore: ['120,160,175', '150,192,205', '190,224,232'],
    quay: ['rgba(150,184,180,0.50)', 'rgba(202,224,214,0.62)'], wash: '150,190,205',
  },
};
// Molette des coloris : régler à chaud la teinte d'un corps d'eau et de tout ce qui
// s'y accorde, p.ex. `__waterSheets.beau.dim = 0.2` ou `.shore[2] = '210,240,255'`.
// ⚠ Posée APRÈS la table : un `window.x = WATER_SHEETS` écrit plus haut dans le
// module lève un ReferenceError de TDZ à l'import et tue tout le renderer.
if (typeof window !== 'undefined') window.__waterSheets = WATER_SHEETS;
// ── L'EAU SUIT LES ÈRES ─────────────────────────────────────────────────────
// Raph 2026-08-03 : « le fleuve garde le même bleu vif du néolithique à l'ère
// cosmique — au milieu des tours sombres il vire au bleu plastique ». Un cran
// d'ardoise par PALIER de bande, AJOUTÉ au tint comme le `dim` du coloris (même
// canal, mêmes deux chemins de rendu motif/tuiles) : le corps de l'eau se
// rabat, le liseré du bas-fond et le quai gardent leur éclat — c'est le
// contraste voulu d'une eau profonde. États DIRIGÉS, jamais d'interpolation
// libre (la règle des saisons vaut ici aussi). S'additionne uniformément à
// tous les coloris : l'averse reste plus sombre que le beau temps, l'usure
// reste turquoise — les rapports entre humeurs ne bougent pas. En dessous de
// la bande 5, zéro : l'azur validé des ères basses ne change pas d'un pixel.
// Molette : window.__waterEra (p.ex. __waterEra[0] = [9, 0.3]).
export const WATER_ERA_DIM = [
  [9, 0.34],   // cosmique : eau profonde, presque d'encre sous les tours
  [7, 0.22],   // futuriste : nettement rabattue
  [5, 0.10],   // industrielle/moderne : un voile discret
];
export function waterEraDim(band) {
  for (const [b, d] of WATER_ERA_DIM) if (band >= b) return d;
  return 0;
}
if (typeof window !== 'undefined') window.__waterEra = WATER_ERA_DIM;
// PRIORITÉ : averse > hiver > usure > beau fixe. La précipitation et la saison
// habillent TOUTE la scène (sol enneigé, voile de pluie) — un fleuve turquoise au
// milieu d'une carte blanche se lirait comme un bug, alors que l'usure, elle, se
// lit ailleurs (bâtiments, palette). Et l'averse ne peut pas entrer en conflit
// avec l'hiver : en hiver elle tombe en NEIGE (precipKind), donc `snow` coupe la
// branche pluie. Pure et exportée : c'est une table de décision, ça se teste.
export function waterBandKey({ rainF = 0, snow = false, winter = false, ruined = false, calm = true }) {
  if (!calm) return 'brute';
  if (!snow && rainF > 0.3) return 'pluie';
  if (winter) return 'hiver';
  if (ruined) return 'usure';
  return 'beau';
}
// Une entrée PAR BANDE, et non une seule remplacée au basculement : sinon
// chaque aller-retour d'A/B relance un chargement et le fleuve retombe à l'aplat
// le temps du décodage — de quoi faire conclure « la bande calme ne s'affiche
// pas » alors qu'elle n'est simplement pas encore prête. Ici c'est devenu
// indispensable : les coloris s'échangent en cours de partie.
// ⚠ CETTE ENTRÉE NE PORTE QUE L'IMAGE. Elle a d'abord recopié `pale` depuis la
// table, et le jour où `dim` est arrivé la recopie ne l'a pas suivi : le réglage
// existait, les tests passaient, et le rendu lisait `undefined`. Les teintes se
// lisent donc TOUJOURS dans WATER_SHEETS (via wb.cfg), jamais ici.
const waterSheets = new Map();            // clé -> { img, ready, frames }
function waterSheet(key) {
  const cfg = WATER_SHEETS[key] || WATER_SHEETS.pluie;
  let e = waterSheets.get(key);
  if (e) return e;
  if (typeof Image === 'undefined') return null;
  const im = new Image();
  // ⚠ L'entrée est capturée en LOCAL, jamais relue depuis la Map dans le
  // callback : deux chargements peuvent se croiser au basculement.
  e = { img: im, ready: false, frames: null };
  waterSheets.set(key, e);
  im.onload = () => { e.ready = true; };
  im.onerror = () => { e.ready = false; };   // PNG absent → fill WATER nu
  im.src = cfg.src;
  return e;
}
// FONDU ENTRE COLORIS. Un changement sec se verrait claquer sur toute la largeur
// du fleuve d'une frame à l'autre. On intègre donc la transition pas à pas —
// même raison que la phase (cf. ⚠⚠ PHASE ACCUMULÉE) : jamais de fonction du
// temps ABSOLU, sans quoi un changement d'état en plein fondu ferait sauter le
// mélange. Pure et exportée pour la même raison qu'elle : c'est la continuité
// qui compte, pas le dessin.
export function stepWaterBand(prev, t, key, fade) {
  const dt = prev.at < 0 ? 0 : Math.min(0.25, Math.max(0, t - prev.at));
  if (prev.key == null) return { key, from: key, mix: 1, at: t };
  // Nouvel état : on repart de la bande actuellement DOMINANTE. Si un fondu
  // était en cours, sa source est déjà largement recouverte — repartir d'elle
  // rendrait le nouveau fondu invisible.
  if (key !== prev.key) return { key, from: prev.mix < 0.5 ? prev.from : prev.key, mix: 0, at: t };
  return { key, from: prev.from, mix: fade > 0 ? Math.min(1, prev.mix + dt / fade) : 1, at: t };
}
let waterBand = { key: null, from: null, mix: 1, at: -1 };
let waterPreloaded = false;               // déclaré AVANT son lecteur (piège de TDZ)
// ── NAPPE EN MOTIF RÉPÉTÉ ────────────────────────────────────────────────────
// `createPattern` répète TOUTE l'image, pas un rectangle source : la frame
// courante de la bande doit donc vivre dans son propre canvas 16×16. Huit
// frames, cuites une fois pour la session (le contenu ne dépend que du PNG) et
// portées par l'entrée de bande, donc jamais mélangées entre les deux planches.
function waterFrameTile(sheet, fi) {
  const img = sheet.img;
  if (!sheet.frames) sheet.frames = new Array(WATER_FRAMES).fill(null);
  let c = sheet.frames[fi];
  if (c) return c;
  if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(WATER_TILE, WATER_TILE);
  else { c = document.createElement('canvas'); c.width = WATER_TILE; c.height = WATER_TILE; }
  const cx = c.getContext('2d');
  if (!cx) return null;
  cx.imageSmoothingEnabled = false;
  cx.drawImage(img, fi * WATER_TILE, 0, WATER_TILE, WATER_TILE, 0, 0, WATER_TILE, WATER_TILE);
  sheet.frames[fi] = c;
  return c;
}

// Coloris courant du fleuve — RÉSOLU UNE FOIS PAR FRAME, au tout début du dessin
// du fleuve, et publié sur CM pour tout ce qui doit s'y accorder (bas-fond du
// quai dans renderWorld, reflets nocturnes). Il ne peut pas vivre dans
// `drawIsoWaterTiles` : cette fonction ne s'exécute pas pendant un effondrement,
// or le liseré, lui, continue de se dessiner — il aurait gardé le coloris d'avant.
// ⚠ À n'appeler QU'UNE FOIS par frame : le fondu s'intègre pas à pas.
function waterBandNow(now) {
  const G = waterTilesTune, t = (now || 0) / 1000;
  // Météo : même signal que l'averse. ⚠ `captureFrame` force rainF à 0
  // (cityMapRuntime) — une mesure faite en capture ne voit JAMAIS le cas pluie.
  const rf0 = Math.max(0, Math.min(1, RAIN_TUNE.on ? (CM.rainF || 0) : 0));
  // EN HIVER l'averse tombe en NEIGE (cf. precipKind) : le ciel se couvre encore
  // un peu, mais un flocon ne CREUSE pas l'eau. On garde donc un tiers de l'effet
  // — sans quoi l'eau se mettait à claquer comme sous l'orage pendant qu'il neige.
  const snow = precipKind(CM.season, rf0) === 'snow';
  const key = waterBandKey({
    rainF: rf0, snow, winter: CM.season === WINTER, ruined: !!CM.frameRuined, calm: G.calm,
  });
  // En capture on force le fondu à son terme : une frame de synthèse doit être
  // reproductible, pas prise au milieu d'un mélange.
  let band;
  if (CM.capture) band = { key, from: key, mix: 1, at: t };
  else { waterBand = stepWaterBand(waterBand, t, key, G.fade); band = waterBand; }
  const cfg = WATER_SHEETS[band.key] || WATER_SHEETS.pluie;
  CM.waterShore = cfg;
  // PRÉCHARGE des autres coloris, une seule fois. Un coloris demandé pour la
  // première fois n'est pas décodé : `drawIsoWaterTiles` sort alors sur « image
  // non prête » et le fleuve retombe à l'aplat ardoise le temps du décodage. Le
  // fondu masque ce trou (l'ancienne bande tient l'écran), mais pas au tout
  // premier passage d'une partie. Quatre PNG de 2,7 ko : autant les tenir prêts.
  if (!waterPreloaded) { waterPreloaded = true; for (const k of Object.keys(WATER_SHEETS)) waterSheet(k); }
  return { band, cfg, rf0, snow, t };
}

function drawIsoWaterTiles(ctx, pts, T, z, now, wb) {
  const G = waterTilesTune;
  const { band, rf0, snow, t } = wb;
  // Diagnostic opt-in (globalThis.__waterSpanStats = true) : dit PAR QUEL
  // garde-fou la nappe est coupée. Éteint, coût nul (un test de drapeau).
  // Hors du bloc de cull, sinon __waterSpanCull = false le rendait muet.
  const sheet = waterSheet(band.key);
  const fromSheet = band.mix < 1 && band.from !== band.key ? waterSheet(band.from) : null;
  const dbg = globalThis.__waterSpanStats
    ? (sortie, extra) => {
      globalThis.__waterSpanStatsLast = {
        sortie, on: G.on, zoom: +z.toFixed(3), minZoom: G.minZoom, strength: G.strength,
        calm: !!G.calm, bande: band.key, depuis: band.from, mix: +band.mix.toFixed(2),
        image: !!sheet && !!sheet.ready, ...extra,
      };
    }
    : null;
  if (!G.on || z < G.minZoom || G.strength <= 0) { if (dbg) dbg('reglage'); return; }
  if (!sheet || !sheet.ready) { if (dbg) dbg('image non prete'); return; }
  const img = sheet.img;
  const len = pts.length;
  // Boîte écran du fleuve (mêmes bornes que le grain : on ne tile que le visible).
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, maxHw = 0;
  for (let i = 0; i < len; i += 1) {
    const p = pts[i], w = worldToScreen(p.x * T, p.y * T);
    if (w.x < bx0) bx0 = w.x; if (w.x > bx1) bx1 = w.x;
    if (w.y < by0) by0 = w.y; if (w.y > by1) by1 = w.y;
    if ((p.hw || 0) > maxHw) maxHw = p.hw || 0;
  }
  const pad = maxHw * T * z * 2 + 4;
  bx0 = Math.max(0, bx0 - pad); by0 = Math.max(0, by0 - pad);
  bx1 = Math.min(CM.cw, bx1 + pad); by1 = Math.min(CM.ch, by1 + pad);
  if (bx1 <= bx0 || by1 <= by0) { if (dbg) dbg('boite vide', { bx0, by0, bx1, by1, cw: CM.cw, ch: CM.ch }); return; }
  // Aval en espace écran : la nappe dérive avec le courant, jamais en travers.
  const pA = worldToScreen(pts[0].x * T, pts[0].y * T);
  const pB = worldToScreen(pts[len - 1].x * T, pts[len - 1].y * T);
  let dx = pB.x - pA.x, dy = pB.y - pA.y;
  const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  const anchor = worldToScreen(0, 0);
  const step = WATER_TILE * G.worldPx * z;               // période à l'écran
  if (step < 2) { if (dbg) dbg('pas trop fin', { step }); return; }
  const sz = Math.ceil(step) + 1;                        // +1 px : coutures au zoom fractionnaire
  const rf = snow ? rf0 * 0.35 : rf0;
  const mix = (a, b) => a + (b - a) * rf;
  // RAFALE : la bouffée passe SUR l'eau, la surface claque et file le temps
  // qu'elle traverse — c'est là qu'on la voit le mieux, mieux que dans le ciel.
  // Sur le RYTHME et la DÉRIVE seulement : la teinte reste celle de l'averse,
  // sinon la bourrasque assombrirait le ruban hors de sa palette. Sans danger
  // pour la phase, qui est intégrée (cf. ⚠⚠ PHASE ACCUMULÉE) — une vitesse qui
  // bouge est exactement ce qu'elle a été écrite pour absorber.
  const gustK = 1 + 0.35 * (snow ? 0.35 : 1)
    * Math.max(0, Math.min(1, RAIN_TUNE.on ? (CM.gustF || 0) * RAIN_TUNE.gust : 0));
  const fps = mix(G.fair.fps, G.rain.fps) * gustK;
  const drift = mix(G.fair.drift, G.rain.drift) * gustK;
  // `dim` du coloris : l'azur natif recevait le voile PÂLE du beau temps, donc on
  // l'éclaircissait encore alors qu'il était déjà trop vif (cf. WATER_SHEETS).
  // + le cran d'ÈRE (WATER_ERA_DIM) : l'eau se rabat aux bandes hautes.
  const tint = mix(G.fair.tint, G.rain.tint) + (wb.cfg.dim || 0)
    + waterEraDim(CM.layout && CM.layout.counts ? CM.layout.counts.eraBand | 0 : 0);
  // Phase : intégrée en jeu (cf. ⚠⚠ PHASE ACCUMULÉE), analytique en capture.
  // `captureFrame` force rainF à 0 → la vitesse y est CONSTANTE, donc le produit
  // temps × vitesse ne saute pas et reste déterministe, ce qu'exige une capture.
  const spatial = WATER_TILE * G.worldPx;          // période spatiale, CONSTANTE
  let phaseFrame, phaseDrift;
  if (CM.capture) {
    phaseFrame = t * G.fair.fps;
    phaseDrift = t * G.fair.drift;
  } else {
    const st = stepWaterPhase(
      { at: waterPhaseAt, frame: waterPhaseFrame, drift: waterPhaseDrift },
      t, fps, drift, spatial
    );
    waterPhaseAt = st.at; waterPhaseFrame = st.frame; waterPhaseDrift = st.drift;
    phaseFrame = st.frame;
    phaseDrift = st.drift;
  }
  const fi = ((Math.floor(phaseFrame) % WATER_FRAMES) + WATER_FRAMES) % WATER_FRAMES;
  const d = (((phaseDrift % spatial) + spatial) % spatial) * z;
  const ox = anchor.x + dx * d, oy = anchor.y + dy * d;
  // ── UN SEUL FILL, AU LIEU DE MILLIERS DE TUILES SOUS CLIP ───────────────────
  // MESURE 2026-07-28 (build de production, Electron, barrière GPU par
  // getImageData) : au dézoom maximum cette nappe pesait 1 147 drawImage pour
  // 0,19 Mpx — et **18 ms de GPU sur les 33 de la frame**. Cent fois le coût au
  // pixel de tout le reste de la carte : ce n'est pas du remplissage, c'est le
  // `clip()` de forme complexe (le ruban, des centaines de points) que le GPU
  // ré-applique à CHAQUE tuile.
  //
  // Or ce double balayage n'est qu'un pavage régulier : exactement ce qu'un
  // motif répété fait en UN appel, le ruban servant alors de RÉGION DE
  // REMPLISSAGE au lieu de clip. Même réseau de tuiles (origines à ox + k·step),
  // même frame d'animation, même alpha — et plus de coutures, la répétition
  // étant faite par l'échantillonneur au lieu du `+1 px` de recouvrement.
  // Le cull par bandes ci-dessous devient sans objet : rien à écarter quand il
  // n'y a qu'un fill. A/B : globalThis.__waterPattern = false rejoue les tuiles.
  if (globalThis.__waterPattern !== false) {
    // Repli SILENCIEUX sur le pavage tuile à tuile si le motif n'est pas
    // disponible (canvas hors écran refusé, source pas décodable) : la nappe
    // s'affiche toujours, elle coûte seulement plus cher.
    const k = step / WATER_TILE;
    const paint = (sh, alpha) => {
      if (!sh || !sh.ready || alpha <= 0) return false;
      let pat = null;
      try {
        const tile = waterFrameTile(sh, fi);
        if (tile) pat = ctx.createPattern(tile, 'repeat');
      } catch { pat = null; }
      if (!pat) return false;
      pat.setTransform({ a: k, b: 0, c: 0, d: k, e: ox, f: oy });
      ctx.globalAlpha = alpha;
      ctx.fillStyle = pat;
      riverRibbonPath(ctx, pts, T);
      ctx.fill(WATER_FILL);
      return true;
    };
    ctx.save();
    ctx.imageSmoothingEnabled = G.worldPx * z < 1;
    // FONDU : l'ancien coloris à plein, le nouveau par-dessus à `mix`. Le second
    // fill n'existe QUE pendant la transition (une seconde environ) — le reste du
    // temps on reste au fill unique qui avait fait tomber les 18 ms de GPU.
    const fade = !!fromSheet && fromSheet !== sheet;
    if (fade) paint(fromSheet, Math.min(1, G.strength));
    let ok = paint(sheet, Math.min(1, G.strength) * (fade ? band.mix : 1));
    if (!ok && fade) ok = true;               // le nouveau n'est pas décodé : l'ancien tient l'écran
    if (ok) {
      if (dbg) dbg('motif', { step: +step.toFixed(2), ox: +ox.toFixed(1), oy: +oy.toFixed(1), fondu: fade });
      if (tint !== 0) {
        ctx.globalAlpha = 1;
        const a = Math.min(1, Math.abs(tint)).toFixed(3);
        // Le voile clair est l'ÉCLAT DE LA BANDE elle-même : pris ailleurs, il
        // désaturerait l'azur avec le gris de l'ancienne planche ardoise.
        ctx.fillStyle = tint > 0 ? `rgba(38,46,62,${a})` : `rgba(${wb.cfg.pale},${a})`;
        riverRibbonPath(ctx, pts, T);
        ctx.fill(WATER_FILL);
      }
      ctx.restore();
      return;
    }
    ctx.restore();
  }
  const c0 = Math.floor((bx0 - ox) / step), c1 = Math.ceil((bx1 - ox) / step);
  const r0 = Math.floor((by0 - oy) / step), r1 = Math.ceil((by1 - oy) / step);
  // ── EMPRISE RÉELLE DU RUBAN, BANDE DE LIGNE PAR BANDE DE LIGNE ──────────────
  // Le pavage balayait la BOÎTE ENGLOBANTE du fleuve. Or un ruban en diagonale
  // n'occupe qu'une fraction de sa boîte : sur une fenêtre de 2005×1369 à zoom
  // 0,35 (pas de 11 px), cela faisait ~22 000 drawImage par frame dont ~85 %
  // étaient intégralement jetés par le clip() — mais seulement APRÈS avoir été
  // envoyés au GPU. Or c'est le GPU qui sature (relevé DevTools sur 13 s de
  // dézoom : piste GPU pleine du début à la fin, thread principal à 35 %).
  //
  // On borne donc les colonnes bande par bande. L'enveloppe est CONSERVATRICE :
  // pour chaque quadrilatère du ruban (entre deux échantillons consécutifs) on
  // marque sa boîte englobante sur toutes les bandes qu'il traverse, élargie
  // d'une bande de chaque côté. C'est un sur-ensemble strict de l'aire clippée,
  // y compris si le fleuve serpente ou repasse sur lui-même — le clip reste seul
  // juge du découpage. Ce filtre ne retire QUE des tuiles déjà invisibles : le
  // rendu est identique au pixel près.
  // A/B : globalThis.__waterSpanCull = false rejoue le balayage complet.
  const nRows = r1 - r0 + 1;
  let spanLo = null, spanHi = null;
  if (nRows > 0 && globalThis.__waterSpanCull !== false) {
    spanLo = new Float64Array(nRows).fill(Infinity);
    spanHi = new Float64Array(nRows).fill(-Infinity);
    const { left: rl, right: rr } = riverRibbonScreen(pts, T);
    for (let i = 1; i < rl.length; i += 1) {
      const x0 = Math.min(rl[i - 1].x, rl[i].x, rr[i - 1].x, rr[i].x);
      const x1 = Math.max(rl[i - 1].x, rl[i].x, rr[i - 1].x, rr[i].x);
      const y0 = Math.min(rl[i - 1].y, rl[i].y, rr[i - 1].y, rr[i].y);
      const y1 = Math.max(rl[i - 1].y, rl[i].y, rr[i - 1].y, rr[i].y);
      let ra = Math.floor((y0 - oy) / step) - r0 - 1;   // −1/+1 : une tuile est
      let rb = Math.floor((y1 - oy) / step) - r0 + 1;   // plus haute qu'une bande
      if (rb < 0 || ra >= nRows) continue;
      if (ra < 0) ra = 0;
      if (rb >= nRows) rb = nRows - 1;
      for (let r = ra; r <= rb; r += 1) {
        if (x0 < spanLo[r]) spanLo[r] = x0;
        if (x1 > spanHi[r]) spanHi[r] = x1;
      }
    }
  }
  // Diagnostic : on est arrivé jusqu'au dessin. Rapporte combien de bandes ont
  // été marquées (0 = le cull écarte tout, donc il est faux) et les bornes qui
  // ont servi. Posé HORS du bloc de cull pour rester lisible même quand
  // __waterSpanCull = false.
  if (dbg) {
    let marked = 0, lo = Infinity, hi = -Infinity;
    if (spanLo) {
      for (let r = 0; r < nRows; r += 1) {
        if (spanHi[r] >= spanLo[r]) { marked += 1; if (spanLo[r] < lo) lo = spanLo[r]; if (spanHi[r] > hi) hi = spanHi[r]; }
      }
    }
    dbg('dessine', {
      cull: !!spanLo, nRows, marked, r0, r1, c0, c1,
      step: +step.toFixed(2), oy: +oy.toFixed(1),
      by0: +by0.toFixed(1), by1: +by1.toFixed(1),
      spanX: marked ? [+lo.toFixed(1), +hi.toFixed(1)] : null,
      cw: CM.cw, ch: CM.ch,
    });
  }
  const prevS = ctx.imageSmoothingEnabled, prevA = ctx.globalAlpha;
  // Nearest-neighbor tant qu'un pixel de tuile couvre au moins un pixel écran
  // (pixel art NET, la règle du projet). En dessous, le nearest SAUTE des pixels
  // et la nappe scintille en défilant : on lisse, ce qui rend au loin une eau
  // douce — exactement ce qu'elle était avant la texture. Le basculement se fait
  // à un zoom où le motif n'est de toute façon plus lisible.
  ctx.imageSmoothingEnabled = G.worldPx * z < 1;
  ctx.save();
  riverRibbonPath(ctx, pts, T);
  ctx.clip(WATER_FILL);
  ctx.globalAlpha = Math.min(1, G.strength);
  for (let row = r0; row <= r1; row += 1) {
    let cA = c0, cB = c1;
    if (spanLo) {
      const ri = row - r0;
      if (spanHi[ri] < spanLo[ri]) continue;                     // bande hors ruban
      // −1 : une tuile posée à gauche de l'emprise déborde dedans (sz > step).
      cA = Math.max(c0, Math.floor((spanLo[ri] - ox) / step) - 1);
      cB = Math.min(c1, Math.ceil((spanHi[ri] - ox) / step) + 1);
    }
    for (let col = cA; col <= cB; col += 1) {
      ctx.drawImage(img, fi * WATER_TILE, 0, WATER_TILE, WATER_TILE,
        Math.floor(ox + col * step), Math.floor(oy + row * step), sz, sz);
    }
  }
  // Voile de météo, même geste que l'averse mais confiné au ruban : ardoise pour
  // assombrir sous la pluie, éclat de la BANDE COURANTE pour éclaircir au beau
  // fixe (ce repli tuile à tuile ne fait pas de fondu : un seul coloris à la fois).
  if (tint !== 0) {
    ctx.globalAlpha = 1;
    const a = Math.min(1, Math.abs(tint)).toFixed(3);
    ctx.fillStyle = tint > 0 ? `rgba(38,46,62,${a})` : `rgba(${wb.cfg.pale},${a})`;
    riverRibbonPath(ctx, pts, T);
    ctx.fill(WATER_FILL);
  }
  ctx.restore();
  ctx.globalAlpha = prevA;
  ctx.imageSmoothingEnabled = prevS;
}

/* ── MOTIF RÉPÉTABLE DE LA MATIÈRE DE PLAGE ───────────────────────────────────
 * Retour Raph : « tu ne peux pas faire le liseré en texture de sable ? » — oui, et
 * c'est mieux qu'un aplat : le trait cesse d'être un trait, il devient la matière.
 *
 * ⚠ LE PIÈGE EST LA FORME DE LA TUILE. Les tuiles de sol sont des LOSANGES 64×32
 * aux quatre coins transparents : passée telle quelle à `createPattern`, la
 * répétition laisse un trou en losange à chaque angle. On recompose donc un carré
 * PLEIN en dessinant la même tuile cinq fois — au centre, puis décalée d'un
 * demi-pas dans les quatre diagonales : les voisins bouchent exactement les coins.
 * C'est la géométrie du pavage iso, pas une bidouille.
 *
 * Cuit une fois par (matière, saison). Le motif est ensuite posé à l'échelle du
 * zoom et ancré à worldToScreen(0,0), comme la nappe d'eau : la projection iso
 * étant affine, la texture translate exactement avec le monde au pan et au zoom.
 * ------------------------------------------------------------------------- */
let beachPatCache = null;               // { key, canvas }
function beachPatternCanvas() {
  const mat = ISO_TILE_KEYS[BEACH.mat] || 'iso-sand';
  const key = (CM.season === WINTER && isoWinterTile(mat)) || mat;
  if (beachPatCache && beachPatCache.key === key) return beachPatCache.canvas;
  const e = ensureIsoTileKey(isoVariantKey(key, 0));
  if (!e || !e.ready || !e.img) return null;
  const W = 64, H = 32;
  let c;
  if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(W, H);
  else { c = document.createElement('canvas'); c.width = W; c.height = H; }
  const g = c.getContext('2d');
  if (!g) return null;
  g.imageSmoothingEnabled = false;
  for (const [ox, oy] of [[0, 0], [-32, -16], [32, -16], [-32, 16], [32, 16]]) g.drawImage(e.img, ox, oy);
  beachPatCache = { key, canvas: c };
  return c;
}
// Style de tracé de la plage : la texture si elle est décodée, sinon l'aplat au ton
// MESURÉ de la même matière (repli silencieux le temps du décodage).
function beachStrokeStyle(ctx, z) {
  const tone = beachTone(BEACH.mat);
  const canvas = beachPatternCanvas();
  if (canvas) {
    try {
      const pat = ctx.createPattern(canvas, 'repeat');
      if (pat) {
        const a = worldToScreen(0, 0);
        pat.setTransform({ a: z, b: 0, c: 0, d: z, e: a.x, f: a.y });
        return pat;
      }
    } catch { /* motif refusé : on garde l'aplat */ }
  }
  return rgb(tone, 1);
}

/* ── RIVAGE D'ÎLE : UN TRAIT, PAS DES CELLULES ────────────────────────────────
 * Raph, 2026-07-30 : « le contour n'est pas bien fait, on veut un joli contour
 * identique ». Deux essais par cellule ont échoué pour la même raison de fond :
 * l'Aiguille ne fait que 4,8 tuiles de large, donc son pourtour tient dans une à
 * deux cellules — à cette échelle la grille ne peut pas rendre une largeur
 * régulière. Tester le centre de la cellule donnait un POINTILLÉ ; tester la
 * cellule entière fermait bien l'anneau mais son épaisseur sautait de une à trois
 * cellules selon l'orientation locale du bord.
 *
 * On trace donc le contour LE LONG de l'ellipse (islandOutline, la même polyligne
 * que le ruban utilise pour percer son trou), clippé à l'intérieur de l'île, avec
 * une épaisseur DOUBLE : la moitié extérieure tombe dans l'eau et le clip la
 * retire, il reste exactement `islandW` tuiles de sable à l'intérieur, partout
 * pareil. C'est le seul endroit du rivage où un trait est justifié — et c'est
 * assumé : il est au CONTACT de l'eau, pas posé au milieu du sol, et il ne bouge
 * pas (les nappes vectorielles rejetées trois fois sur ce projet étaient toutes
 * animées et posées en plein sol).
 *
 * Le ton est celui MESURÉ de la matière (SAND_TONE / SHINGLE_TONE) : le grain de
 * la tuile est très fin (écart de 4,0 entre variantes), donc un aplat à la même
 * moyenne se lit comme elle à l'échelle d'un rebord d'une tuile.
 * ------------------------------------------------------------------------- */
/* ── L'EAU AUTOUR DU PÊCHEUR : CLAPOTIS, ET SON BANC DE POISSONS ──────────────
 * Raph, 2026-07-30 : « il faut qu'il ait des clapotis autour de lui et un sillage,
 * et à l'arrêt un petit banc de poissons qui tourne autour de son bateau ».
 *
 * Le sillage est rendu par la mécanique d'écume des bateaux (shipVisual, `wake`) ;
 * ici on pose les deux choses que le fleuve seul peut dire : l'eau qui clapote
 * contre la coque, et le banc qui vient tourner quand la ligne est à l'eau.
 *
 * ⚠ DESSINÉ AVANT LES BATEAUX (depuis drawIsoRiver, avec les ombres de poissons)
 * et non avec eux : un poisson passe SOUS la barque. Peint après, le banc lui
 * serait monté dessus — le même défaut de couche que les feuilles sur l'île.
 *
 * Le banc EST la pose : c'est lui qui la rend lisible. Retour de Raph avant celui-
 * ci : « je le vois tourner mais pas s'arrêter » — la barque s'immobilisait bien
 * (35 s toutes les ~90 s, mesuré) mais rien ne le SIGNALAIT à cette taille. Les
 * poissons arrivent et repartent en fondu autour de la pose : on ne voit plus un
 * bateau qui cesse d'avancer, on voit un pêcheur qui a trouvé son coin.
 *
 * Purement f(now) comme les ombres de poissons : aucune sim, aucun état, une
 * capture au même `now` redonne la même scène.
 * ------------------------------------------------------------------------- */
export const FISHER_WATER = {
  on: true, rings: 2, ringR: 0.62, ringA: 0.30, ringP: 2600,   // clapotis : nombre, rayon (tuiles), alpha, période (ms)
  school: 6, schoolR: 0.95, schoolA: 0.38, schoolP: 9000,      // banc : effectif, rayon, alpha, tour complet (ms)
  fade: 3.5,                                                    // s d'arrivée et de départ du banc
};
if (typeof window !== 'undefined') window.__fisherWater = FISHER_WATER;

function drawIsoFisherWater(ctx, T, z, now, wb) {
  const F = FISHER_WATER;
  if (!F.on || CM.lodActive || z < 0.5 || CM.collapseAt) return;
  const ships = CM.ships;
  if (!ships || !ships.length) return;
  const isles = riverIslands();
  const il = isles && isles[0];
  if (!il) return;
  const tone = (wb && wb.cfg && wb.cfg.shore) ? wb.cfg.shore[2] : '206,242,255';
  const t = (now || 0) / 1000;
  for (const sh of ships) {
    if (!sh.orbit) continue;
    const o = orbitPoint(il, sh.orbit.ang);
    const p = worldToScreen(o.x * T, o.y * T);
    const s = T * z;
    if (p.x < -s * 4 || p.x > CM.cw + s * 4 || p.y < -s * 4 || p.y > CM.ch + s * 4) continue;
    ctx.save();
    // Le sol iso est un losange 2:1 : tout ce qui est POSÉ À PLAT sur l'eau se
    // dessine en cercle puis s'écrase de moitié. Un vrai ovale calculé donnerait
    // le même résultat pour plus cher.
    ctx.translate(p.x, p.y);
    ctx.scale(1, 0.5);
    // ── CLAPOTIS : l'eau bat contre la coque, à l'arrêt comme en route ────────
    ctx.lineWidth = Math.max(1, z * 0.9);
    for (let i = 0; i < F.rings; i += 1) {
      // Anneaux DÉPHASÉS qui naissent au bordé et s'élargissent en s'effaçant.
      const k = ((t * 1000 / F.ringP) + i / F.rings) % 1;
      const r = s * F.ringR * (0.45 + k * 0.85);
      const a = F.ringA * (1 - k) * (sh.state === 'anchor' ? 1 : 0.55);
      if (a < 0.02) continue;
      ctx.strokeStyle = `rgba(${tone},${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    }
    // ── LE BANC : il ne vient QUE quand la ligne est à l'eau ──────────────────
    if (sh.state === 'anchor' && F.school > 0) {
      // Fondu sur la pose : `stateT` décompte le temps restant. Les poissons
      // arrivent, tournent, repartent — un banc qui apparaîtrait d'un coup se
      // lirait comme un défaut d'affichage.
      const reste = Math.max(0, sh.stateT || 0);
      const ecoule = FLEET_TUNE.orbitDwell - reste;
      const g = Math.max(0, Math.min(1, Math.min(ecoule, reste) / F.fade));
      if (g > 0.01) {
        const h0 = (cmHash('school:' + sh.id) >>> 0);
        for (let i = 0; i < F.school; i += 1) {
          const h = (h0 + i * 2654435761) >>> 0;
          // Chacun sa voie et son allure : un banc parfaitement régulier tourne
          // comme un manège, pas comme des poissons.
          const rr = s * F.schoolR * (0.62 + ((h >>> 3) % 100) / 220);
          const spd = 1 + ((h >>> 9) % 100) / 260;
          const ang = (t * 1000 / F.schoolP) * Math.PI * 2 * spd
            + (i / F.school) * Math.PI * 2 + ((h >>> 15) % 100) / 100;
          const fx = Math.cos(ang) * rr, fy = Math.sin(ang) * rr;
          // ⚠ MÊME ÉCHELLE QUE LES POISSONS DU FLEUVE (drawIsoFishShadows :
          // `T·z·0,18`). Le premier jet était à 0,085, soit la moitié — lisible
          // au cadrage serré de la vérif, et rigoureusement invisible au zoom où
          // l'on joue. Un banc qu'il faut zoomer pour voir ne signale aucune pose.
          const L2 = s * 0.15 * (0.8 + ((h >>> 21) % 100) / 250);
          ctx.fillStyle = `rgba(12,26,34,${(F.schoolA * g).toFixed(3)})`;
          // Cap TANGENT au cercle : un poisson qui tourne regarde où il va.
          ctx.save();
          ctx.translate(fx, fy);
          ctx.rotate(ang + Math.PI / 2);
          ctx.beginPath(); ctx.ellipse(0, 0, L2, L2 * 0.4, 0, 0, Math.PI * 2); ctx.fill();
          // Queue qui bat, comme les ombres de poissons du fleuve.
          const wag = Math.sin(t * 6.1 + i) * L2 * 0.3;
          ctx.beginPath(); ctx.ellipse(-L2 * 1.2, wag, L2 * 0.36, L2 * 0.2, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }
}

/* ── ÉCUME DE PROUE : LE SILLAGE, MAIS VISIBLE ────────────────────────────────
 * La modulation d'amplitude autour du fuseau (islandWakeK) dit la bonne chose mais
 * ne vaut que quelques pixels au zoom de jeu. Ce qui se VOIT, c'est que l'eau
 * blanchit là où elle se brise : on repasse donc un liseré vif sur le seul arc
 * AMONT. Rien en aval — le calme de l'abri se lit par contraste, sans rien
 * dessiner, ce qui est la moitié gratuite de l'effet.
 *
 * Le trait est du même bois que le rivage d'île, et c'est ce qui le rend
 * admissible : il est AU CONTACT de la terre et de l'eau, pas posé en plein
 * courant. Les trois nappes vectorielles refusées sur ce projet (grain ×3,
 * vaguelettes) étaient toutes au milieu du fleuve.
 *
 * ⚠ PASSE À PART, ET C'EST LE FRUIT D'UN ÉCHEC. Écrite d'abord dans le bloc du
 * bas-fond des berges, elle n'a JAMAIS rien dessiné : ce bloc était alors gardé
 * par `waterShoreTune.islands`, à false à l'époque. Le drapeau est repassé à true
 * depuis, mais la passe RESTE à part, et pour une raison qui ne dépend pas de
 * lui : le sillage n'est pas un liseré de berge. Il ne suit qu'un ARC, il pulse
 * avec la houle, et sous le bloc des berges il hériterait de leurs tronçons de
 * quai et de leur épaisseur. Ne pas l'y replier en voyant le drapeau relevé.
 *
 * Il PULSE avec la houle qui arrive sur la pointe — MÊME valeur d'onde que le
 * contour au même endroit (u = 0,5, soit a = π) : l'écume monte exactement quand
 * l'eau monte. Deux horloges séparées se seraient vues tout de suite.
 * ------------------------------------------------------------------------- */
function drawIsoIslandWake(ctx, pts, T, z, wb) {
  const G = waveTune;
  if (waveAmp <= 0 || !(G.bow > 0) || CM.lodActive) return;
  const isles = riverIslands();
  if (!isles || !isles.length) return;
  const S = waterShoreTune;
  // Teinte du CORPS D'EAU COURANT, comme le reste des liserés : une écume restée
  // ardoise sous un fleuve azur se verrait comme un calque étranger.
  const tone = (S.follow !== false && wb && wb.cfg && wb.cfg.shore) ? wb.cfg.shore[2] : S.c3;
  ctx.save();
  riverRibbonPath(ctx, pts, T);
  ctx.clip(WATER_FILL);                      // la moitié terrestre du trait tombe
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, z * S.w3 * G.bowW);
  for (const il of isles) {
    const path = islandOutline(il, T);
    if (!path || path.length < 3) continue;
    const n = path.length - 1;               // contour FERMÉ : le dernier point = le premier
    const half = Math.max(1, Math.round(n * G.bowArc / 2));
    const mid = Math.round(n / 2);           // a = π, la pointe AMONT (cf. islandWakeK)
    const perim = 2 * Math.PI * ((il.rx + il.ry) / 2);
    const ph = (il.x * 0.7 + il.y * 1.3) % (Math.PI * 2);
    const puls = 0.45 + 0.55 * waveReachLoop(0.5, perim, waveT, ph);
    ctx.strokeStyle = `rgba(${tone},${(S.a3 * G.bow * puls).toFixed(3)})`;
    ctx.beginPath();
    for (let i = mid - half; i <= mid + half; i += 1) {
      const p = path[i];
      if (i === mid - half) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawIsoIslandShore(ctx, T, z) {
  if (!BEACH.on || BEACH.islandW <= 0) return;
  const isles = riverIslands();
  if (!isles || !isles.length) return;
  const w = Math.max(2, BEACH.islandW * T * z * 2);      // ×2 : la moitié part dans l'eau
  ctx.save();
  ctx.imageSmoothingEnabled = false;                     // pixel art NET, règle du projet
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = beachStrokeStyle(ctx, z);
  ctx.lineWidth = w;
  const trace = (path) => {
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i += 1) ctx.lineTo(path[i].x, path[i].y);
    ctx.closePath();
  };
  for (const il of isles) {
    // DEUX contours, et c'est tout le principe du ressac sur une île : le sable ne
    // bouge pas (il est tracé sur le contour FIXE), c'est l'eau qui le RONGE — le
    // clip, lui, suit le bord d'eau du moment. Tracer le sable sur le contour animé
    // aurait fait glisser tout le rivage avec l'onde : une plage qui respire au
    // lieu d'une eau qui monte. Et le clipper sur le contour fixe aurait repeint du
    // sable par-dessus l'eau montée, effaçant la vague à chaque frame.
    const clipPath = islandOutline(il, T);
    const sandPath = waveAmp > 0 ? islandOutline(il, T, undefined, 'base') : clipPath;
    if (!clipPath || clipPath.length < 3) continue;
    ctx.save();
    trace(clipPath);
    ctx.clip();                                          // le sable reste sur l'île, sous le bord d'eau
    trace(sandPath);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

export function drawIsoRiver(now) {
  const L = CM.layout, rv = L.river;
  if (!rv || !rv.present || !rv.samples || rv.samples.length < 2) return;
  const T = CM.TILE, ctx = CM.ctx, z = CM.cam.zoom;
  const pts = rv.samples;
  // RESSAC : l'instant et l'amplitude de l'onde, figés pour toute la frame. ⚠ À
  // n'appeler QU'ICI et AVANT le premier tracé du ruban : tout ce qui borde l'eau
  // (ruban, îles, bas-fond, sable, vie de surface, reflets) lit cet état-là, et
  // deux évaluations décalées décolleraient le liseré du bord de l'eau.
  beginWaveFrame(now, z);
  // Coloris de l'état AVANT tout dessin : le liseré ci-dessous, le bas-fond du
  // quai (renderWorld) et les reflets nocturnes le lisent tous sur CM.
  const wb = waterBandNow(now);
  // Corps d'eau (ardoise).
  riverRibbonPath(ctx, pts, T);
  ctx.fillStyle = rgb(WATER, 1);
  ctx.fill(WATER_FILL);
  // Surface de l'eau, SOUS les liserés de bas-fond (qui portent la lecture du
  // bord) et sous poissons/vaguelettes.
  // La tuile animée porte le relief ; le grain procédural reste là, coupé.
  //
  // ⚠ L'USURE NE COUPE PLUS LA TEXTURE (demande de Raph, 2026-07-27). Avant,
  // au-delà de 70 % d'Usure le fleuve retombait à un aplat ardoise nu — l'idée
  // était « l'eau morte en déclin ». En jeu, à 78 % d'Usure sur une partie
  // avancée, ça se lit comme un bug d'affichage et non comme une intention :
  // le fleuve perd sa matière alors que toute la ville garde la sienne.
  // Seul l'EFFONDREMENT en cours (CM.collapseAt) dénude encore l'eau.
  if (!CM.collapseAt) {
    drawIsoWaterTiles(ctx, pts, T, z, now, wb);
    drawIsoWaterGrain(ctx, pts, T, z, now);
  }
  // Rivage des îles : par-dessus le sol baké (qui y peint l'herbe ou le sol de la
  // merveille), sous la frange humide qui viendra border l'eau.
  drawIsoIslandShore(ctx, T, z);
  // Sillage : par-dessus le rivage de sable (l'écume est DANS l'eau, elle passe
  // donc devant la grève) et sous la frange humide qui bordera le tout.
  drawIsoIslandWake(ctx, pts, T, z, wb);
  // BAS-FOND CLAIR le long des rives (façon TheoTown, retour Raph « les bords de
  // l'eau plus clairs ») : l'eau S'ÉCLAIRCIT au bord (peu profond) et fonce vers le
  // centre (profond). Bandes strokées le long du ruban, CLIPPÉES → seule la moitié
  // intérieure reste. Actif aux ÈRES SANS QUAI (band ≤ maxBand) : ensuite la berge
  // maçonnée porte son propre bas-fond au pied du mur. Réglable via waterShoreTune.
  {
    const S = waterShoreTune, len0 = pts.length;
    const bandW = (L.counts && L.counts.eraBand) | 0;
    // Le quai ne trace son bas-fond qu'au REPOS (drawRun : `wallOn && !lod`).
    // Partout ailleurs c'est nous, sinon la rive perd sa lecture pile quand on
    // prend du recul. Fleuve RUINÉ exclu du relais : l'eau morte n'a ni tuile ni
    // grain, lui ajouter un liseré clair la ferait paraître vivante.
    //
    // ⚠ « RUINÉ » NE COUVRE PLUS L'USURE (demande de Raph, 2026-07-27, en même
    // temps que la texture d'eau et le quai). Sans ce changement l'exclusion
    // mutuelle se retournait : le quai revenait à 78 % d'Usure mais `ruined`
    // restait vrai, donc NI le quai NI le fleuve ne traçait le bas-fond, et la
    // rive perdait sa lisière claire alors même que son mur était revenu.
    // ⚠⚠ L'EXCLUSION ÉTAIT UN BOOLÉEN GLOBAL POUR UN QUAI QUI, LUI, EST LOCAL.
    // Retour Raph 2026-07-30 (capture du port) : « il n'y a plus de quais ni de
    // liseré, ça fait une coupe nette ». Cause : `quayDrawsShore = band > maxB &&
    // !lod` supposait que dès qu'une ère a des quais, le quai dessine le bord de
    // l'eau PARTOUT. Faux. `ensureQuayGate` le COUPE EXPRÈS sur l'emprise du port
    // (« sa scène pose son propre front d'eau »), là où le fleuve est trop étroit
    // pour un mur, et sur les 3 premiers/derniers samples. Mesuré sur une démo
    // d'ère 7 : 4 samples coupés au port (≈ 4,5 tuiles de berge) + 3 à chaque
    // bout — et sur ces tronçons PERSONNE ne dessinait le bord d'eau, ni quai, ni
    // bas-fond, ni roseaux (le rendu iso n'en a pas). Il ne restait que le bord
    // peint du ruban : un pixel. Le trou existait avant les coloris ; une eau
    // ardoise contre une berge grise ne le montrait pas, l'azur l'a révélé.
    //
    // On reprend donc la main TRONÇON PAR TRONÇON, sur le complément exact du
    // masque que le quai va utiliser (publié par ensureQuayGate, cf. quayGapRuns).
    const maxB = S.maxBand != null ? S.maxBand : 1;
    const ruined = !!CM.collapseAt;
    const quayEra = bandW > maxB;
    const tout = [[0, len0 - 1]];
    let runsPlus, runsMinus;
    if (ruined) {
      // Fleuve mort : comportement d'avant à l'identique. L'eau morte n'a ni tuile
      // ni grain, un liseré clair la ferait paraître vivante.
      runsPlus = runsMinus = quayEra ? [] : tout;
    } else if (!quayEra || !quayWallTune.on || (CM.lodActive && S.lodFallback)) {
      // Aucun quai (ère de campement, molette coupée) ou quai qui lâche son
      // bas-fond au dézoom : le ruban porte tout.
      runsPlus = runsMinus = tout;
    } else if (CM.lodActive) {
      runsPlus = runsMinus = [];               // lodFallback coupé : on ne reprend pas la main
    } else {
      ensureQuayGate();
      const g = CM.quayGate;
      runsPlus = quayGapRuns(g && g.drawPlus, len0);
      runsMinus = quayGapRuns(g && g.drawMinus, len0);
    }
    // ÎLES : aucun quai ne les borde, donc rien ne leur dispute le bord de l'eau,
    // et elles entrent d'un seul morceau. Le drapeau `islands` (cf. le réglage)
    // dit s'il faut leur donner le bas-fond bleu — il a fait l'aller-retour en un
    // jour, l'histoire est racontée là-bas.
    const islandsOn = S.islands !== false && (!ruined || !quayEra);
    const shoreOn = S.on && (runsPlus.length > 0 || runsMinus.length > 0 || islandsOn);
    const nAt = (i) => { const o = pts[Math.max(0, i - 1)], q = pts[Math.min(len0 - 1, i + 1)]; let tx = q.x - o.x, ty = q.y - o.y; const tl = Math.hypot(tx, ty) || 1; return { nx: -ty / tl, ny: tx / tl }; };
    if (shoreOn) {
      // Les deux rives décalées, projetées UNE SEULE FOIS. Avant, chacune des
      // trois bandes rejouait la même projection (nAt + worldToScreen sur tous
      // les échantillons) : six parcours complets du ruban par frame.
      // Chaque bord porte SES tronçons : les deux rives sont découpées par le
      // masque du quai, les îles sont d'un seul morceau.
      // TROIS jeux de rives depuis le RESSAC : le BORD D'EAU DU MOMENT (qui porte
      // le bas-fond — il EST l'eau, il monte avec elle), la LAISSE (jusqu'où l'eau
      // est montée récemment : c'est là que va la frange mouillée, pour qu'elle
      // reste sur le sable quand la vague se retire) et le LIT PEINT, fixe, réservé
      // au SABLE sec. Le sable ne bouge pas :
      // sa bande reste sur le lit peint et c'est le ruban, animé, qui la ronge par
      // son clip quand la vague monte. Coller le sable au bord de l'eau aurait fait
      // glisser toute la plage avec l'onde — une plage qui respire au lieu d'une eau
      // qui monte. Onde éteinte : les deux jeux sont identiques et on n'en bâtit
      // qu'un (`edgesBase = edges`), donc pas un projeté de plus qu'avant.
      const wv = waveHalfWidths(pts);
      // `mode` : 'wave' (bord de l'eau), 'wet' (la LAISSE) ou 'base' (le lit peint).
      // `withIslands` — ⚠ DEUX RÉGLAGES DISTINCTS SE PARTAGEAIENT UN SEUL DRAPEAU.
      // Quand `S.islands` est passé à false pour retirer le BAS-FOND BLEU autour
      // de l'île, il a coupé du même coup la bande de sable et la FRANGE HUMIDE,
      // qui ne sont ni de la même couleur ni du même côté de la ligne d'eau —
      // d'où une île découpée au couteau. Le bas-fond passe donc `islandsOn`, la
      // plage passe `true` en dur.
      // Le drapeau est repassé à true depuis, si bien que les deux chemins
      // coïncident aujourd'hui : NE PAS EN CONCLURE que la séparation est morte.
      // C'est elle qui garantit qu'un futur retrait du bleu ne remmènera pas le
      // sable avec lui. Elle ne se voit que le jour où le drapeau retombe.
      const buildEdges = (mode, withIslands = islandsOn) => {
        const out = [];
        [1, -1].forEach((sgn, si) => {
          const runs = si ? runsMinus : runsPlus;
          if (!runs.length) return;
          const path = [];
          for (let i = 0; i < len0; i += 1) {
            const p = pts[i], n = nAt(i);
            // ⚠ `si = 0` ↔ `sgn = +1` ↔ rive `plus` : même convention de signe que
            // riverRibbonScreen (left = +n). L'inverser décollerait le liseré du
            // bord de l'eau d'un côté sur deux, et seulement quand l'onde est haute.
            const hw = (mode === 'base' || !wv) ? p.hw
              : mode === 'wet' ? (si ? wv.wetMinus[i] : wv.wetPlus[i])
                : (si ? wv.minus[i] : wv.plus[i]);
            const q = worldToScreen((p.x + sgn * n.nx * hw) * T, (p.y + sgn * n.ny * hw) * T,
              mode !== 'base' ? waterZ() : 0);
            // ⚠⚠ CETTE FONCTION PROJETTE ELLE-MÊME — elle ne passe PAS par
            // `riverRibbonScreen`, donc elle n'héritait PAS de l'enfoncement de la
            // nappe (lot 1). Le bas-fond et le liseré restaient au niveau d'avant
            // pendant que l'eau descendait : ils se décollaient du bord.
            //
            // Et la règle qui suit EST la géométrie de la berge : le BORD D'EAU
            // (`wave`) et la LAISSE (`wet`) descendent avec la nappe — ils SONT l'eau ;
            // le LIT PEINT (`base`) ne bouge pas — il est le sable sec, qui reste à
            // hauteur de terre. La bande qui s'ouvre entre les deux a exactement la
            // hauteur de l'enfoncement : **c'est la face de berge**, et c'est ce que
            // `drawBankFace` y peint.
            path.push(q);
          }
          out.push({ path, runs });
        });
        // La BERGE D'UNE ÎLE est une rive comme les autres : elle reçoit le même
        // bas-fond. Sans ça, l'île se découpait au couteau dans l'eau — un ovale
        // posé sur le fleuve au lieu d'une terre qui en émerge. Le clip en
        // 'evenodd' garde la moitié du trait qui tombe dans l'eau, exactement
        // comme pour les rives.
        if (withIslands) {
          for (const il of (riverIslands() || [])) {
            const path = islandOutline(il, T, undefined, mode);
            if (path && path.length > 1) out.push({ path, runs: [[0, path.length - 1]] });
          }
        }
        return out;
      };
      const edges = buildEdges('wave');
      const shore = (color, width, set = edges) => {
        ctx.strokeStyle = color; ctx.lineWidth = width;
        for (const e of set) {
          for (const [a, b] of e.runs) {
            if (b <= a) continue;
            ctx.beginPath();
            ctx.moveTo(e.path[a].x, e.path[a].y);
            for (let i = a + 1; i <= b; i += 1) ctx.lineTo(e.path[i].x, e.path[i].y);
            ctx.stroke();
          }
        }
      };
      // ── FACE DE BERGE NATURELLE (lot 1 du relief) ──────────────────────────
      // ⚠ AVANT le clip d'eau, et c'est la raison d'être de sa place ici : une face
      // de berge est AU-DESSUS de l'eau, elle serait entièrement rognée à l'intérieur.
      //
      // Là où le quai ne trace rien (`runsPlus`/`runsMinus` viennent de
      // `quayGapRuns`), la berge n'a que sa ligne — elle se lit comme un autocollant.
      // On lui donne la même face que le mur de quai : deux assises, haut clair vers
      // bas sombre, en matière de TERRE. Sa hauteur n'est pas un réglage : elle est
      // bornée par la géométrie, du lit peint (`base`, hauteur de terre) au bord
      // d'eau (`wave`, descendu). Elle vaut donc exactement l'enfoncement, comme le
      // parement du quai — la garde du plan (« même hauteur au sample de jonction »)
      // est vraie PAR CONSTRUCTION, pas par réglage.
      //
      // ⚠ VISIBLE D'UN SEUL CÔTÉ, même règle que le mur : une face ne se voit que
      // sur la rive dont l'eau est DEVANT (plus bas à l'écran). Sur l'autre, elle
      // regarde ailleurs et sa propre berge l'occulte — la dessiner quand même
      // poserait un bandeau de terre par-dessus le sol.
      if (waterSinkPx() > 0 && BANK_FACE.on) {
        const bas = buildEdges('wave', false);      // bord d'eau, descendu
        const haut = buildEdges('base', false);     // lit peint, à hauteur de terre
        ctx.save();
        for (let s = 0; s < bas.length && s < haut.length; s += 1) {
          const eb = bas[s], eh = haut[s];
          for (const [a, b] of eb.runs) {
            if (b <= a) continue;
            // L'eau est-elle devant ? On lit la géométrie déjà construite : le bord
            // d'eau plus bas que le lit à l'écran.
            let devant = 0;
            for (let i = a; i <= b; i += 1) if (eb.path[i].y > eh.path[i].y) devant += 1;
            if (devant * 2 < (b - a + 1)) continue;   // majorité contre : rive occultée
            for (const [t0, t1, col] of [[0, 0.5, BANK_FACE.top], [0.5, 1, BANK_FACE.bot]]) {
              ctx.beginPath();
              for (let i = a; i <= b; i += 1) {
                const y = eh.path[i].y + (eb.path[i].y - eh.path[i].y) * t0;
                if (i === a) ctx.moveTo(eh.path[i].x, y); else ctx.lineTo(eh.path[i].x, y);
              }
              for (let i = b; i >= a; i -= 1) {
                const y = eh.path[i].y + (eb.path[i].y - eh.path[i].y) * t1;
                ctx.lineTo(eh.path[i].x, y);
              }
              ctx.closePath(); ctx.fillStyle = col; ctx.fill();
            }
          }
        }
        ctx.restore();
      }
      ctx.save();
      riverRibbonPath(ctx, pts, T);
      ctx.clip(WATER_FILL);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      // A/B utilisable EN PRODUCTION (globalThis.__waterShoreMerge = false),
      // comme __waterSpanCull : la molette __waterShore, elle, est gardée par
      // import.meta.env.DEV et n'existe pas dans le .exe — or c'est justement
      // là que le lag se reproduit. Pour RÉGLER l'aspect (lodW/lodA/lodC),
      // passer par `npm run dev`.
      // Teintes DU CORPS D'EAU COURANT (cf. waterShoreTune.follow) : le bas-fond
      // est la même eau en moins profond, il ne peut pas rester ardoise sous un
      // fleuve azur. Repli sur les c1/c2/c3 du réglage si `follow` est coupé.
      const sc = (S.follow !== false && wb.cfg.shore) ? wb.cfg.shore : [S.c1, S.c2, S.c3];
      if (S.lodMerge && CM.lodActive && globalThis.__waterShoreMerge !== false) {
        // AU DÉZOOM : UN SEUL TRAIT. Les trois bandes (18/10/4,5 × zoom) se
        // réduisent alors à 6,3 / 3,5 / 1,6 px : elles se confondent à l'œil en
        // une seule lisière claire, mais coûtent toujours six traits pleine
        // longueur DANS UN CLIP — et ce, précisément quand le LOD vient de les
        // rallumer (le quai cesse de tracer son bas-fond, cf. quayDrawsShore).
        // On garde donc la lecture du bord clair — demandée « tout le temps »
        // le 2026-07-22 — pour un tiers du tracé. Réglable à chaud :
        // window.__waterShore({ lodMerge, lodW, lodC, lodA }).
        // lodC EST la teinte vive du liseré (= c3) : elle suit donc le coloris
        // comme les trois autres, sinon le dézoom ramènerait l'ardoise.
        const lc = (S.follow !== false && wb.cfg.shore) ? sc[2] : S.lodC;
        shore(`rgba(${lc},${S.lodA})`, Math.max(2, z * S.lodW));
      } else {
        shore(`rgba(${sc[0]},${S.a1})`, Math.max(3, z * S.w1));   // bas-fond large et doux
        shore(`rgba(${sc[1]},${S.a2})`, Math.max(2, z * S.w2));   // eau peu profonde
        shore(`rgba(${sc[2]},${S.a3})`, Math.max(1, z * S.w3));   // liseré clair au bord
      }
      ctx.restore();
      // ── GALETS HUMIDES, CÔTÉ TERRE ──────────────────────────────────────────
      // Ce qui fait lire une plage comme une plage : galets secs → galets MOUILLÉS
      // → eau. La matière sèche est bakée par cellule (kind 'shingle') ; cette
      // frange-ci ne peut pas l'être, parce que c'est exactement au ras de l'eau
      // que l'alignement sur la grille se verrait. Un trait est ici le bon outil :
      // mince, il suit la spline, et il est au CONTACT de l'eau — pas posé au
      // milieu du sol, là où une nappe vectorielle sur du pixel art a déjà été
      // rejetée trois fois.
      //
      // Clip « côté terre » : rectangle plein + le ruban (îles comprises) en
      // evenodd → l'intérieur du fleuve est retiré, l'intérieur des îles rendu.
      // La moitié intérieure du trait tombe donc dans l'eau et disparaît, et il ne
      // reste que la lisière mouillée sur la berge. Même géométrie, mêmes tronçons
      // que le bas-fond : les deux franges se répondent au pixel.
      if (BEACH.on && BEACH.wet > 0 && !CM.lodActive) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, CM.cw, CM.ch);
        riverRibbonPath(ctx, pts, T, true);
        ctx.clip(WATER_FILL);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        // Les deux jeux de rives de la PLAGE, bâtis UNE fois. Ils portent les
        // îles même quand le bas-fond bleu ne les porte pas, donc ils ne peuvent
        // pas réutiliser `edges` — mais rien n'oblige à les reconstruire à
        // chaque trait, et le ruban est déjà le goulot de la frame.
        const edgesSand = buildEdges('base', true);
        const edgesWet = wv ? buildEdges('wet', true) : edgesSand;
        // BANDE DE SABLE, en TEXTURE (Raph : « tu ne peux pas faire le liseré en
        // texture de sable ? »). Même géométrie et mêmes tronçons que le bas-fond,
        // mais de l'autre côté de la ligne d'eau : elle suit la spline au pixel, là
        // où les cellules bakées de la berge s'arrêtent en escalier. Les deux se
        // complètent — les cellules donnent la profondeur vers l'intérieur, la
        // bande donne le bord net contre l'eau. Épaisseur DOUBLE : la moitié qui
        // tombe dans le fleuve est retirée par le clip.
        if (BEACH.bankBand > 0) {
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          // SUR LE LIT PEINT, pas sur le bord d'eau du moment (cf. les deux jeux de
          // rives plus haut) : la grève est fixe, c'est la vague qui la recouvre.
          // Le clip côté terre, lui, est bien celui du ruban ANIMÉ — d'où la bande
          // qui s'amincit quand l'onde monte et se rouvre quand elle redescend.
          shore(beachStrokeStyle(ctx, z), Math.max(2, BEACH.bankBand * T * z * 2), edgesSand);
          ctx.restore();
        }
        // Frange mouillée : elle suit la MATIÈRE, donc la même règle de neige que
        // le sable sec au-dessus d'elle — sinon la grève reste sable et sa lisière
        // d'eau vire au gris d'hiver, ce qui se lit comme une bande étrangère.
        const wt = (CM.season === WINTER && BEACH.snow) ? BEACH.wetWinter
          : (BEACH.wetTone[BEACH.mat] || BEACH.wetTone.shingle);
        // ── SUR LA LAISSE, ET NON SUR LA LIGNE D'EAU ───────────────────────────
        // Demande de Raph : « laisser un liseré sombre quand les vagues reviennent
        // dans l'eau ». Collée au bord de l'eau, cette frange montait et
        // redescendait AVEC la vague : elle ne marquait donc jamais rien. Posée sur
        // la laisse — jusqu'où l'eau est montée dans les dernières secondes — elle
        // se DÉCROCHE quand l'onde se retire, reste sur le sable, et sèche.
        //
        // Le trait est CENTRÉ sur la laisse et large de `wetW` : à l'échelle où ça
        // se joue (l'écart entre l'eau et la laisse plafonne à ~4 px au zoom de
        // jeu), il couvre le sable mouillé sans qu'on ait besoin d'un polygone
        // entre les deux courbes — lequel coûterait un remplissage de plus par
        // rive pour un résultat indiscernable.
        // Îles COMPRISES (dernier argument) : c'est la frange que Raph veut voir
        // border l'île, et elle est indépendante du bas-fond bleu qu'il a fait
        // retirer — sable mouillé côté terre contre bleu clair côté eau.
        //
        // ── ⚠ BORNÉE PAR LA LAISSE : JAMAIS DEVANT LA VAGUE ────────────────────
        // Retour Raph : « le liseré sombre ne doit pas s'avancer devant la vague,
        // juste être sur le retrait de celle-ci ». Le trait est CENTRÉ sur la
        // laisse, donc sa moitié terrestre débordait au-delà — sur du sable que
        // l'eau n'avait jamais atteint. Il se lisait comme une bande sombre qui
        // PRÉCÈDE l'onde au lieu de marquer ce qu'elle vient de quitter.
        //
        // On ajoute donc un second clip, le ruban de la LAISSE. L'intersection
        // avec le clip côté terre (le ruban de l'eau DU MOMENT) ne laisse
        // exactement que la bande découverte : entre la ligne d'eau et la laisse.
        // Elle s'ouvre quand l'onde se retire, se referme quand l'onde remonte —
        // et disparaît quand l'eau est à son plus haut, ce qui est juste : il n'y
        // a alors plus de sable mouillé à voir.
        //
        // Vaut pour les ÎLES par la même construction : leur contour de laisse est
        // un trou du même chemin, donc l'intersection y donne l'anneau entre les
        // deux lignes. Onde éteinte (`wv` nul), les deux rubans se confondent et
        // le clip viderait tout : on garde alors l'ancien tracé, non borné.
        if (wv) {
          ctx.save();
          riverRibbonPath(ctx, pts, T, false, 'wet');
          ctx.clip(WATER_FILL);
          shore(`rgba(${wt},${BEACH.wet})`, Math.max(2, z * BEACH.wetW), edgesWet);
          ctx.restore();
        } else {
          shore(`rgba(${wt},${BEACH.wet})`, Math.max(2, z * BEACH.wetW), edgesWet);
        }
        ctx.restore();
      }
    }
  }
  // OMBRES DE POISSONS : sous les reflets (dessinées AVANT les vaguelettes).
  drawIsoFishShadows(ctx, rv, T, z, now);
  // Clapotis du pêcheur et son banc : même couche que les poissons du fleuve —
  // sous la surface, donc SOUS les coques (les bateaux passent bien après).
  drawIsoFisherWater(ctx, T, z, now, wb);
  // (Vaguelettes animées RETIRÉES le 2026-07-22 — nappe de petits traits clairs
  // rgba(184,214,224) dont la brillance courait vers l'aval. Elles portaient la
  // lecture du courant tant que l'eau était un APLAT ; la tuile animée
  // (drawIsoWaterTiles) porte désormais et la matière et le mouvement, et ces
  // traits vectoriels se voyaient comme un calque étranger posé sur du pixel art
  // — retour Raph « enlève les traits blancs du courant, on n'en a plus besoin ».
  // `waterRippleTune` vit toujours dans pixelRiver.js pour le rendu legacy.)
}

// (Brume de rivière RETIRÉE le 2026-07-13 — essayée en nappes puis en voile
// plein, jugée « pas terrible et pas si utile » par Raph. Ne pas re-proposer.)

