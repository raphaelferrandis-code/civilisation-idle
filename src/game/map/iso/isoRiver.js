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
import { CM, cmHash } from '../layout.js';
import { worldToScreen, ISO_X, ISO_Y } from './projection.js';
// ⚠ L'INJECTION VIT ICI, pas dans le peintre : c'est le fleuve qui donne à la vie du
// fleuve son chemin de ruban et sa météo (`configureRiverLife`, plus bas). Le sens du
// montage est conservé — isoRiverLife n'importe toujours QUE layout et projection,
// donc rien ne boucle.
import { configureRiverLife, vieFishShadow, vieFishRipple, vieFisherWater } from './isoRiverLife.js';
import { vieK, vieZoomFade } from './isoVie.js';
import { WINTER } from '../seasonMode.js';
import { orbitPoint, FLEET_TUNE } from '../riverFleet.js';
import { ensureQuayGate, quayWallTune, quayGapRuns, quayWallTiles, quayWallColors } from '../quaysAndRiot.js';
import { drawIsoReflections } from './isoReflect.js';
import { quayTaperProfile, setQuayWave } from './isoQuay.js';
import { ISO_TILE_KEYS, isoWinterTile, beachTone, isoVariantKey, ensureIsoTileKey, BEACH } from './isoGroundTiles.js';
import { WATER, waterShoreTune, rgb } from './isoPalette.js';
import { RAIN_TUNE, precipKind } from './isoWeather.js';
import { riverEndRays } from './riverEnds.js';

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
  // 0,22 → 0,30 le 2026-10-01 (avec rainAmp 0,7 → 0,6 : le pire cas sous l'averse
  // passe de 0,374 à 0,48, toujours DANS la grève) : à 0,22 la lame avançait de
  // 4-5 px au zoom de jeu, trop peu pour que le sable qu'elle découvre se lise.
  amp: 0.3,
  len: 9, period: 3.4,                     // houle principale : longueur d'onde (tuiles), temps de parcours (s)
  len2: 4.3, period2: 2.1, mix2: 0.38,     // seconde houle — sans elle, l'onde bat la mesure comme un métronome
  // Les deux rives ne respirent PAS ensemble : en phase, le fleuve « gonfle » et
  // se dégonfle comme un tuyau au lieu de battre contre chacune de ses berges.
  sidePhase: 1.7,
  rainAmp: 0.6,                            // × amplitude à averse pleine (l'AMPLITUDE seule, jamais la vitesse)
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
  // 2026-10-01 (cf. LE SABLE MOUILLÉ EN DÉGRADÉ) : la FENÊTRE (`wetMem`, combien de
  // temps on regarde en arrière) et le SÉCHAGE (`wetDry`, en combien de secondes une
  // trace pleine s'efface) sont découplés. Avant, les deux valaient 2,2 s : la bande
  // découverte ne dépassait pas 0,1 tuile (3-4 px au zoom de jeu) et le sable mouillé
  // ne se voyait pas. Mesuré (simulation de l'onde, 30 s × 40 tuiles) : fenêtre 5 s
  // et séchage 8 s donnent une bande médiane de 0,055 tuile et 0,18 au 95e centile.
  // Le pas reste ~0,4 s (12 pas). `wetDry` absent = `wetMem` (l'ancien couplage).
  wetMem: 5, wetSteps: 12, wetDry: 8,
  // ── LE JET DE RIVE N'EST PAS UNE RESPIRATION (2026-10-01) ─────────────────
  // Raph : « on améliore le fleuve ? les vagues, l'effet humide dû aux vagues ».
  // Deux sinus purs montent et descendent à la même allure : la berge RESPIRE.
  // Une vraie lame monte VITE (elle déferle, l'écume en tête) et se retire
  // LENTEMENT en drainant le sable. `skew` déforme la phase (θ − skew·sin θ) : même
  // course 0..1, même crête, même vitesse de propagation le long de la berge — seul
  // le rythme dans le temps change, montée ×(1+skew), retrait ×(1−skew).
  // 0 = l'onde d'avant, au bit près.
  skew: 0.35,
  // ── LE SABLE MOUILLÉ EN DÉGRADÉ ────────────────────────────────────────────
  // La bande entre l'eau et la laisse est peinte en TROIS paliers francs (pixel
  // art, pas de dégradé lissé) : le plus foncé au ras de l'eau, là où le sable vient
  // d'être découvert, le plus clair à la laisse, là où il sèche déjà. `wetGrad` =
  // fractions eau → laisse des deux paliers intérieurs ; `wetA` = alpha posé par
  // chaque palier, du plus ancien au plus frais (ils s'empilent : au ras de l'eau
  // le sable reçoit les trois). `wetFill = false` rend l'ancien liseré centré sur
  // la laisse (A/B).
  wetFill: true, wetGrad: [0.34, 0.67], wetA: [0.3, 0.32, 0.5],
  // ── L'ÉCUME DE LA LAME ─────────────────────────────────────────────────────
  // Un liseré d'écume AU PIXEL sur le front de l'eau, là où elle MONTE : il naît
  // avec la lame, court le long de la berge avec elle, se déchire en dentelle
  // quand elle ralentit et disparaît au retrait. Au contact de la terre et de
  // l'eau, comme tout ce que ce fleuve a accepté — jamais au milieu du courant.
  //   foam      intensité globale (0 = coupée)
  //   foamFrom  vitesse de montée (normalisée, 1 = la plus rapide) où l'écume naît
  //   foamFull  vitesse où elle est pleine (liseré continu)
  //   foamRow2  au-delà de cette intensité, un 2e rang de pixels, plus pâle
  foam: 1, foamFrom: 0.04, foamFull: 0.42, foamRow2: 0.45,
  foamA: [0.92, 0.5], foamTone: '238,246,243',
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
  const m = Math.max(0, Math.min(1, G.mix2)), k = swashSkew(G);
  return 0.5 + 0.5 * ((1 - m) * swashSin(2 * Math.PI * (sp1 - tp1) + ph, k)
    + m * swashSin(2 * Math.PI * (sp2 - tp2) + ph * 1.6, k));
}

// LA FORME DE LA LAME (cf. `skew`). La phase θ DÉCROÎT avec le temps (θ = 2π(s/len
// − t/P)) : sin θ monte quand θ traverse π et descend quand il traverse 0. On y
// comprime donc la phase — ψ = θ − k·sin θ, dψ/dθ = 1 − k·cos θ : ×(1+k) autour de
// π (la montée), ×(1−k) autour de 0 (le retrait). ψ reste monotone pour |k| < 1,
// donc sin ψ couvre exactement [−1, 1] : les bornes du ressac (on ne découvre
// rien, on ne sort pas de la grève) ne bougent pas. Et ψ est une fonction de θ
// seul : périodique comme lui, ce qui garde le contour d'île fermé.
const swashSkew = (G) => Math.max(0, Math.min(0.9, G.skew || 0));
const swashSin = (th, k) => Math.sin(k > 0 ? th - k * Math.sin(th) : th);
// Dérivée de swashSin par rapport à θ.
const swashCosD = (th, k) => Math.cos(k > 0 ? th - k * Math.sin(th) : th) * (1 - k * Math.cos(th));

// VITESSE DE MONTÉE de l'eau, normalisée : +1 = la lame la plus rapide possible,
// négatif = elle se retire. C'est ce que lit l'ÉCUME : elle naît là où l'eau monte.
// Dérivée ANALYTIQUE (pas une différence finie entre deux instants) : exacte, et
// sans pas de temps à régler. Pure et exportée, comme l'onde qu'elle dérive.
export function waveRise(s, t, side = 1, G = waveTune) {
  const ph = side < 0 ? G.sidePhase : 0;
  const sp1 = G.len > 0 ? s / G.len : 0, sp2 = G.len2 > 0 ? s / G.len2 : 0;
  const w1 = G.period > 0 ? 1 / G.period : 0, w2 = G.period2 > 0 ? 1 / G.period2 : 0;
  const m = Math.max(0, Math.min(1, G.mix2)), k = swashSkew(G);
  // d/dt sin ψ(θ(t)) = cos ψ · (1 − k cos θ) · (−2π/P)
  const d = -((1 - m) * w1 * swashCosD(2 * Math.PI * (sp1 - t * w1) + ph, k)
    + m * w2 * swashCosD(2 * Math.PI * (sp2 - t * w2) + ph * 1.6, k));
  const max = (1 + k) * ((1 - m) * w1 + m * w2);
  return max > 0 ? d / max : 0;
}

// Même vitesse, sur le contour BOUCLÉ d'une île (cf. waveReachLoop).
export function waveRiseLoop(u, perim, t, phase = 0, G = waveTune) {
  const k1 = G.len > 0 ? Math.max(1, Math.round(perim / G.len)) : 0;
  const k2 = G.len2 > 0 ? Math.max(1, Math.round(perim / G.len2)) : 0;
  const w1 = G.period > 0 ? 1 / G.period : 0, w2 = G.period2 > 0 ? 1 / G.period2 : 0;
  const m = Math.max(0, Math.min(1, G.mix2)), k = swashSkew(G);
  const d = -((1 - m) * w1 * swashCosD(2 * Math.PI * (k1 * u - t * w1) + phase, k)
    + m * w2 * swashCosD(2 * Math.PI * (k2 * u - t * w2) + phase * 1.6, k));
  const max = (1 + k) * ((1 - m) * w1 + m * w2);
  return max > 0 ? d / max : 0;
}

// Intensité d'écume 0..1 pour une vitesse de montée normalisée (cf. waveRise).
export function swashFoam(rise, G = waveTune) {
  const a = G.foamFrom, b = Math.max(a + 1e-3, G.foamFull);
  return Math.max(0, Math.min(1, (rise - a) / (b - a)));
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
  const m = Math.max(0, Math.min(1, G.mix2)), k = swashSkew(G);
  return 0.5 + 0.5 * ((1 - m) * swashSin(2 * Math.PI * (k1 * u - tp1) + phase, k)
    + m * swashSin(2 * Math.PI * (k2 * u - tp2) + phase * 1.6, k));
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
  const n = Math.max(1, G.wetSteps | 0), h = G.wetMem / n, dry = wetDryRate(G);
  let best = 0;
  for (let k = 0; k <= n; k += 1) {
    // Sortie EXACTE : l'onde ne dépasse jamais 1, donc aucun pas plus ancien ne
    // peut battre `best` dès que le séchage a mangé l'écart (cf. waveHalfWidths,
    // la laisse est le gros du calcul de la frame).
    if (best >= 1 - k * h * dry) break;
    const v = waveReach(s, t - k * h, side, G) - k * h * dry;
    if (v > best) best = v;
  }
  return best;
}

// Vitesse de séchage (course de l'onde par seconde) : `wetDry` s'il est donné,
// sinon la fenêtre elle-même (le couplage d'avant le 2026-10-01).
const wetDryRate = (G) => 1 / (G.wetDry > 0 ? G.wetDry : G.wetMem);

// Même laisse, sur le contour BOUCLÉ d'une île (cf. waveReachLoop).
export function waveWetReachLoop(u, perim, t, phase = 0, G = waveTune) {
  if (!(G.wetMem > 0)) return waveReachLoop(u, perim, t, phase, G);
  const n = Math.max(1, G.wetSteps | 0), h = G.wetMem / n, dry = wetDryRate(G);
  let best = 0;
  for (let k = 0; k <= n; k += 1) {
    if (best >= 1 - k * h * dry) break;               // sortie exacte (cf. waveWetReach)
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
// Abscisses et demi-largeurs, UNE ENTRÉE PAR TABLEAU de samples. Deux tableaux
// se croisent dans une frame depuis que le fleuve se prolonge à l'écran (cf.
// riverDrawPts) : le ruban dessiné lit le tableau RALLONGÉ, la vie de surface et
// les reflets des lampadaires lisent le fleuve seul. Un cache à une place se
// serait vidé à chaque alternance.
const waveArcByPts = new WeakMap();
const waveHwByPts = new WeakMap();

// Abscisse curviligne, cuite une fois par cours d'eau. Clé = l'IDENTITÉ du tableau
// de samples : un recompute de layout en crée un neuf (cf. `const riverSamples =
// []`), donc la comparaison suffit et ne peut pas servir une vieille géométrie —
// là où une clé temporelle (layoutRecomputeAt) aurait tourné pour rien.
// ⚠ ORIGINE = LE PREMIER SAMPLE DU VRAI FLEUVE (`pts.core0`), même sur un tableau
// rallongé : l'onde dépend de l'abscisse, et un ruban dont l'origine reculerait
// avec sa rallonge verrait tout son ressac se décaler — donc décoller du liseré
// que les autres couches tracent sur le fleuve seul. Les samples de rallonge
// amont reçoivent des abscisses NÉGATIVES, et l'onde les prolonge sans couture.
export function riverArc(pts) {
  let a = waveArcByPts.get(pts);
  if (a && a.length === pts.length) return a;
  a = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i += 1) {
    a[i] = a[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  const o = pts.core0 | 0;
  if (o > 0) { const a0 = a[o]; for (let i = 0; i < a.length; i += 1) a[i] -= a0; }
  waveArcByPts.set(pts, a);
  return a;
}
const ensureWaveArc = riverArc;

// LE CLAPOTIS DES QUAIS (iso/isoQuay.js) bat sur la MÊME onde que la grève : on lui
// passe, pour un sample du fleuve et une rive, la hauteur du moment, la laisse et la
// vitesse de montée, plus le facteur d'amplitude de la frame (zoom, averse). Poussé
// d'ici parce qu'isoQuay ne peut pas importer ce module (cycle). Lu APRÈS
// drawIsoRiver dans la frame : l'instant et l'amplitude sont ceux de la frame.
setQuayWave((i, side) => {
  if (waveAmp <= 0 || !(waveTune.amp > 0)) return null;
  const rv = CM.layout && CM.layout.river, core = rv && rv.samples;
  if (!core || i < 0 || i >= core.length) return null;
  const s = riverArc(core)[i];
  return {
    u: waveReach(s, waveT, side), wet: waveWetReach(s, waveT, side),
    rise: waveRise(s, waveT, side), k: waveAmp / waveTune.amp,
  };
});

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
//
// ⚠ SEULS LES SAMPLES À L'ÉCRAN SONT CALCULÉS (2026-10-01). La laisse regarde
// 12 instants en arrière, l'écume lit la vitesse : ~56 sinus par sample et par
// frame, et le fleuve d'une ville de bande 9 en compte 606 — mesuré +1 ms par
// frame sur la passe du fleuve, presque tout HORS de la vue. Un sample loin de
// l'écran garde son lit peint (pas d'onde) : rien n'y est dessiné. Le masque est
// ÉLARGI de deux samples de chaque côté, pour qu'un segment qui traverse la vue
// ait ses deux bouts animés — sinon son tracé se tordrait au bord de l'écran.
// Clé = l'instant, l'amplitude ET la caméra : tous les appels d'une frame la
// partagent, un pan la renouvelle.
const WAVE_VIEW_DILATE = 2;
function waveViewMask(pts, c) {
  const n = pts.length, T = CM.TILE, z = CM.cam.zoom;
  if (!c.vis || c.vis.length !== n) { c.vis = new Uint8Array(n); c.vis0 = new Uint8Array(n); }
  const v0 = c.vis0, v = c.vis;
  const W = CM.cw, H = CM.ch;
  for (let i = 0; i < n; i += 1) {
    const p = pts[i], s = worldToScreen(p.x * T, p.y * T);
    // Demi-largeur + course maximale de l'onde + une tuile, projetées au pire.
    const m = ((p.hw || 2) + 2) * T * z * 1.2 + 8;
    v0[i] = (s.x > -m && s.x < W + m && s.y > -m && s.y < H + m) ? 1 : 0;
  }
  for (let i = 0; i < n; i += 1) {
    let on = 0;
    for (let d = -WAVE_VIEW_DILATE; d <= WAVE_VIEW_DILATE && !on; d += 1) {
      const j = i + d;
      if (j >= 0 && j < n && v0[j]) on = 1;
    }
    v[i] = on;
  }
  return v;
}
function waveHalfWidths(pts) {
  if (waveAmp <= 0) return null;
  let c = waveHwByPts.get(pts);
  const cam = CM.cam;
  if (c && c.t === waveT && c.amp === waveAmp && c.cx === cam.x && c.cy === cam.y
    && c.cz === cam.zoom && c.cw === CM.cw && c.ch === CM.ch) return c;
  const n = pts.length;
  if (!c || c.plus.length !== n) {
    c = {
      pts: null, t: -1, amp: -1, cx: NaN, cy: NaN, cz: NaN, cw: 0, ch: 0, vis: null, vis0: null,
      plus: new Float64Array(n), minus: new Float64Array(n),
      wetPlus: new Float64Array(n), wetMinus: new Float64Array(n),
      risePlus: new Float64Array(n), riseMinus: new Float64Array(n),
    };
    waveHwByPts.set(pts, c);
  }
  const arc = ensureWaveArc(pts);
  const foam = waveTune.foam > 0;
  const vis = waveViewMask(pts, c);
  for (let i = 0; i < n; i += 1) {
    const hw = pts[i].hw;
    if (!vis[i]) {
      c.plus[i] = c.minus[i] = c.wetPlus[i] = c.wetMinus[i] = hw;
      c.risePlus[i] = c.riseMinus[i] = 0;
      continue;
    }
    c.plus[i] = hw + waveAmp * waveReach(arc[i], waveT, 1);
    c.minus[i] = hw + waveAmp * waveReach(arc[i], waveT, -1);
    // La LAISSE : jusqu'où l'eau est montée récemment. Toujours ≥ la ligne d'eau
    // du moment (cf. waveWetReach), donc côté TERRE d'elle par construction.
    c.wetPlus[i] = hw + waveAmp * waveWetReach(arc[i], waveT, 1);
    c.wetMinus[i] = hw + waveAmp * waveWetReach(arc[i], waveT, -1);
    // Vitesse de montée, pour l'écume (cf. drawSwashFoam).
    c.risePlus[i] = foam ? waveRise(arc[i], waveT, 1) : 0;
    c.riseMinus[i] = foam ? waveRise(arc[i], waveT, -1) : 0;
  }
  c.pts = pts; c.t = waveT; c.amp = waveAmp;
  c.cx = cam.x; c.cy = cam.y; c.cz = cam.zoom; c.cw = CM.cw; c.ch = CM.ch;
  return c;
}

// Les BORDS que l'on sait tracer, par leur nom (même vocabulaire pour le ruban,
// buildEdges et le contour d'île) : 'wave' le bord de l'eau du moment, 'base' le
// lit peint, 'wet' la laisse, 'wet1'/'wet2' les deux paliers du sable mouillé
// entre l'eau et la laisse (cf. `wetGrad`). Rend la fraction eau → laisse.
function wetFracOf(mode) {
  if (mode === 'wet') return 1;
  if (mode === 'wet1') return waveTune.wetGrad[0];
  if (mode === 'wet2') return waveTune.wetGrad[1];
  return 0;
}
// Demi-largeur d'un bord pour un sample : `u` = eau du moment, `w` = laisse.
// La laisse elle-même est rendue TELLE QUELLE (et non `u + 1·(w − u)`, qui peut
// différer au dernier bit) : le clip de la frange doit retomber pile sur elle.
const edgeAt = (u, w, f) => (f >= 1 ? w : f > 0 ? u + f * (w - u) : u);

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
  const f = wetFracOf(mode);
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const o = pts[Math.max(0, i - 1)], q = pts[Math.min(pts.length - 1, i + 1)];
    let tx = q.x - o.x, ty = q.y - o.y;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    const hl = wv ? edgeAt(wv.plus[i], wv.wetPlus[i], f) : p.hw;
    const hr = wv ? edgeAt(wv.minus[i], wv.wetMinus[i], f) : p.hw;
    left.push(worldToScreen((p.x + nx * hl) * T, (p.y + ny * hl) * T));
    right.push(worldToScreen((p.x - nx * hr) * T, (p.y - ny * hr) * T));
  }
  return { left, right };
}

/* ── LE FLEUVE NE FINIT PAS À L'ÉCRAN ─────────────────────────────────────────
 * Capture de Raph (2026-09-29) : « pourquoi mon bout de fleuve est comme ça ? ».
 * Le cours d'eau du layout va de cx − 1,8 N à cx + 1,8 N ; la caméra, bornée
 * sur lui, peut se poser à trois cellules de ses bouts — et au dézoom, le bout
 * se voit : le ruban coupé droit, les deux bandes de sable finies en arrondi.
 *
 * On PROLONGE donc le ruban tout droit, dans l'axe de ses derniers samples, le
 * temps de sortir de l'écran — au DESSIN seulement. Les samples du layout ne
 * bougent pas : îles, quais (« 3 premiers/derniers samples »), bateaux, ponts,
 * cellules d'eau et boîte de la caméra lisent tous `L.river.samples` par index
 * ou par bout, et rallonger le tableau les aurait décalés en silence.
 *
 * La longueur est calculée À CHAQUE FRAME, au plus juste : tout point visible
 * est à moins de D (monde) du centre caméra, avec, pour la projection iso,
 *   |dx − dy| ≤ A = cw / (2·ISO_X·z)   et   |dx + dy| ≤ B = ch / (2·ISO_Y·z),
 * donc |d| ≤ D = √((A² + B²) / 2). La rallonge s'arrête là où la demi-droite
 * quitte le disque de rayon D + marge (demi-largeur, grève, onde). Près de la
 * ville, les bouts sont loin : rallonge NULLE, et le fleuve dessiné est le
 * tableau du layout lui-même — rien ne change et rien ne coûte.
 * ------------------------------------------------------------------------- */
const RIVER_EXT_QUANT = 16;       // la rallonge grandit par paquets : le tableau ne se refait pas à chaque pixel de pan
const RIVER_EXT_MARGIN = 6;       // cellules au-delà de la demi-largeur : grève, onde, arrondis de trait

// Longueur (en cellules) qu'il faut à la demi-droite P + t·u pour sortir du
// disque de centre C et de rayon R. Pure et exportée : c'est la géométrie qui
// se teste.
export function riverExtensionLength(P, u, C, R) {
  const dx = P.x - C.x, dy = P.y - C.y;
  const b = dx * u.x + dy * u.y;
  const disc = b * b - (dx * dx + dy * dy - R * R);
  if (disc < 0) return 0;                          // la demi-droite ne croise jamais la vue
  return Math.max(0, -b + Math.sqrt(disc));
}

// Rayon (en cellules) du disque qui contient tout ce que la vue peut montrer.
export function riverViewRadius(cw, ch, zoom, T) {
  const A = cw / (2 * ISO_X * zoom), B = ch / (2 * ISO_Y * zoom);
  return Math.sqrt((A * A + B * B) / 2) / T;
}

// Tableau rallongé de `kh` samples en amont et `kt` en aval. `core0`/`core1`
// disent où commence et finit le VRAI fleuve (cf. riverArc et la dérive de la
// nappe). Pur et exporté.
export function extendRiverSamples(core, kh, kt) {
  const n = core.length;
  if (n < 2 || (!kh && !kt)) return core;
  // Les MÊMES demi-droites que celles que la forêt évite (riverEnds.js).
  const [h, e] = riverEndRays(core);
  const out = [];
  for (let k = kh; k >= 1; k -= 1) out.push({ x: h.x + h.ux * h.step * k, y: h.y + h.uy * h.step * k, hw: core[0].hw });
  for (const p of core) out.push(p);
  for (let k = 1; k <= kt; k += 1) out.push({ x: e.x + e.ux * e.step * k, y: e.y + e.uy * e.step * k, hw: core[n - 1].hw });
  out.core0 = kh;
  out.core1 = kh + n - 1;
  return out;
}

// Tronçons de rive (index sur le fleuve SEUL) reportés sur le tableau rallongé :
// décalés de `kh`, et les rallonges — qui n'ont jamais de quai — prolongent le
// tronçon du bout, ou en ouvrent un. Pure et exportée.
export function extendRiverRuns(runs, kh, n, len) {
  if (!kh && len === n) return runs;
  const out = runs.map(([a, b]) => [a + kh, b + kh]);
  if (kh > 0) {
    if (out.length && out[0][0] === kh) out[0][0] = 0;
    else out.unshift([0, kh]);
  }
  const last = kh + n - 1;
  if (len - 1 > last) {
    const tail = out[out.length - 1];
    if (tail && tail[1] === last) tail[1] = len - 1;
    else out.push([last, len - 1]);
  }
  return out;
}

let riverExtCache = null;         // { core, kh, kt, pts }
function riverDrawPts(core) {
  const n = core.length;
  // A/B : globalThis.__riverExtend = false rejoue le ruban coupé net aux bouts.
  if (n < 2 || !CM.cw || !CM.ch || globalThis.__riverExtend === false) return core;
  const T = CM.TILE, z = CM.cam.zoom || 1;
  const C = { x: CM.cam.x / T, y: CM.cam.y / T };
  const R = riverViewRadius(CM.cw, CM.ch, z, T);
  const need = (r) => {
    const len = riverExtensionLength(r, { x: r.ux, y: r.uy }, C, R + r.hw + RIVER_EXT_MARGIN);
    if (!(len > 0)) return 0;
    return Math.ceil(Math.ceil(len / r.step) / RIVER_EXT_QUANT) * RIVER_EXT_QUANT;
  };
  const [rh, rt] = riverEndRays(core);
  const kh = need(rh), kt = need(rt);
  const c = riverExtCache;
  if (c && c.core === core && c.kh === kh && c.kt === kt) return c.pts;
  const pts = extendRiverSamples(core, kh, kt);
  riverExtCache = { core, kh, kt, pts };
  return pts;
}
if (typeof window !== 'undefined') window.__riverExt = () => (riverExtCache ? { kh: riverExtCache.kh, kt: riverExtCache.kt, n: riverExtCache.core.length } : null);

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

// ── L'EAU HORS DU RUBAN : le bassin du Vieux-Port (docs/PLAN-PORTS.md, lot P3) ──
// Un port creusé dans la berge prend la MÊME eau que le fleuve : corps, surface
// animée (même motif, même phase, même dérive), voile d'ère, et le clip des reflets.
// Le peintre du port publie ses polygones (tuiles monde) par `setRiverExtraWater` ;
// ce module ne sait rien des ports.
// ⚠ JAMAIS DANS LE CHEMIN DU RUBAN : il est rempli en 'evenodd' (les îles sont des
// trous), et le bassin le chevauche à son entrée — la zone commune s'y annulerait.
// D'où un second remplissage, en nonzero, au même style. Pour le CLIP des reflets
// (evenodd aussi), le polygone s'arrête avant le bord du ruban (`clip`).
let _extraWater = null;
export function setRiverExtraWater(fn) { _extraWater = typeof fn === 'function' ? fn : null; }
function extraWaterPolys(clip) {
  if (!_extraWater) return null;
  const polys = _extraWater(clip);
  return polys && polys.length ? polys : null;
}
function traceExtraWater(ctx, T, polys) {
  for (const poly of polys) {
    poly.forEach((p, i) => { const q = worldToScreen(p.x * T, p.y * T); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
    ctx.closePath();
  }
}
// Remplit l'eau hors ruban avec le style COURANT du contexte (motif, aplat, voile).
function fillExtraWater(ctx, T) {
  const polys = extraWaterPolys(false);
  if (!polys) return;
  ctx.beginPath();
  traceExtraWater(ctx, T, polys);
  ctx.fill();
}

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
  const f = wetFracOf(mode);
  const rMid = (il.rx + il.ry) / 2, perim = 2 * Math.PI * rMid;
  // Phase propre à chaque île (sa position) : sans elle, les deux îles des bras du
  // fleuve battraient à l'unisson, ce qui se remarque tout de suite.
  const ph = on ? (il.x * 0.7 + il.y * 1.3) % (Math.PI * 2) : 0;
  for (let i = 0; i <= N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    // Paliers du sable mouillé : entre l'eau et la laisse, comme sur les berges.
    const r = !on ? 0 : f >= 1 ? waveWetReachLoop(i / N, perim, waveT, ph)
      : f > 0 ? edgeAt(waveReachLoop(i / N, perim, waveT, ph), waveWetReachLoop(i / N, perim, waveT, ph), f)
        : waveReachLoop(i / N, perim, waveT, ph);
    const d = on ? waveAmp * islandWakeK(a) * r : 0;
    // Retrait MÉTRIQUE sur les deux axes (et non un facteur d'échelle) : l'Aiguille
    // fait rx 7,6 pour ry 2,4, une homothétie y creuserait trois fois plus dans le
    // sens du courant qu'en travers.
    const rx = Math.max(0.25, il.rx - d), ry = Math.max(0.25, il.ry - d);
    const al = Math.cos(a) * rx, cr = Math.sin(a) * ry;
    // Repère de l'île : `al` le long du courant, `cr` en travers.
    out.push(worldToScreen((il.x + al * il.tx - cr * il.ty) * T, (il.y + al * il.ty + cr * il.tx) * T));
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
    const al = fishTune.alpha * (0.8 + ((h >>> 13) % 40) / 100);
    // PETITE VIE (2026-10-01, PLAN-MAQUETTE-VIVANTE §9) : la silhouette est DESSINÉE
    // (vieArt.js, quatre caps par miroir) et posée au pixel entier — elle remplace
    // les deux ellipses lissées ; le mouvement ci-dessus ne change pas. Au début de
    // la pause (le poisson gobe en surface), des rides au pixel.
    if (vieFishShadow(ctx, p.x, p.y, ang, size, swimming, t, h, al) && !swimming) {
      const q = (cyc - Ps) / 1.4;                       // 0..1 sur ~1,4 s de pause
      if (q < 1) vieFishRipple(ctx, p.x, p.y, q, size, 0.4 * (1 - q));
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
  // courant, jamais « en travers » du fleuve. Bouts du VRAI fleuve : une
  // rallonge d'écran ne doit pas faire pivoter la dérive.
  const iA = pts.core0 | 0, iB = pts.core1 != null ? pts.core1 : len - 1;
  const pA = worldToScreen(pts[iA].x * T, pts[iA].y * T);
  const pB = worldToScreen(pts[iB].x * T, pts[iB].y * T);
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
// LE CARREAU N'EST PLUS FORCÉMENT DE 16 PX (2026-10-02, planche « écailles ») : sa
// taille est lue sur la planche elle-même (hauteur de l'image, 8 images en largeur).
// Un carreau de 16 px = UNE tuile de jeu, et ses anneaux clairs dessinaient une grille
// d'alvéoles à partir du zoom 1,5. La période de DÉRIVE est celle du plus grand carreau
// admis (64 px) : multiple de toutes les autres, elle ne change rien aux petites.
const WATER_TILE_MAX = 64;
const tileOf = (sh) => (sh && sh.tile) || WATER_TILE;
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
// cité — azur quand tout va bien, turquoise quand l'usure monte (eau TROUBLE
// depuis le 2026-10-04, cf. le coloris `usure`), bleu pâle en
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
//   `quay`  le bas-fond que trace le MUR DE QUAI (iso/isoQuay.js) dès la
//           bande 2 : sans lui, faire suivre le liseré n'aurait rien changé aux
//           ères qui ont des quais, c'est-à-dire presque toutes.
//   `wash`  la teinte vers laquelle on tire les reflets nocturnes de la ville.
// Exportée : un coloris ajouté sans son accord complet ferait retomber le liseré
// en ardoise sans que rien ne proteste — c'est la table elle-même qu'on teste.
export const WATER_SHEETS = {
  // ── LA NAPPE SANS ÉCAILLES (2026-10-02, Raph sur planche : « go pour la nouvelle ») ──
  // Les quatre coloris pointent vers les bandes « -v2 » de `scripts/eauSansEcailles.mjs` :
  // un carreau de 64 px (4 tuiles de jeu, cf. WATER_TILE_MAX) sans forme fermée — creux
  // allongés à l'horizontale, crête d'un pixel, reflets semés au hasard — au lieu du
  // carreau de 16 px dont les anneaux clairs dessinaient une grille d'alvéoles dès le
  // zoom 1,5. MÊMES cinq couleurs par coloris (lues sur les bandes de 16 px, qui
  // restent sur le disque pour l'A/B : `__waterSheets.beau.src =
  // '/pixelart/water/river-tiles-calm-ciel.png'`), donc liseré, quai et lavis inchangés.
  // ⚠ La nouvelle nappe est un peu plus SOMBRE en moyenne (moins de pixels clairs :
  // luminosité −3 au beau fixe, −8 à −10 sous l'averse, en hiver et à l'usure, même
  // couleur dominante), vu sur planche (waterSansEcailles.test.js).
  // 2026-10-03 (Raph : « maintenant l'eau est très lisse ») : la première nappe ne
  // bougeait que de 0,8 % de ses pixels par image ; ses creux RESPIRENT désormais et
  // de petites ondulations s'y ajoutent — 6,5 % (l'ancienne à écailles : ~10 %).
  // Variante « B » choisie sur planche animée parmi trois densités.
  // ⚠ BEAU TEMPS RECOLORÉ le 2026-09-30 (docs/PLAN-MAQUETTE-VIVANTE.md, lot 1 ; Raph :
  // « oui, calme-la ») : l'azur natif était 3 à 7 fois plus saturé que la ville.
  // Même dessin, cinq couleurs remplacées une pour une (scripts/eauCalme.mjs) ; le
  // liseré, le bas-fond du quai et le lavis de nuit suivent. L'azur reste sur le
  // disque : `src: '/pixelart/water/river-tiles-calm-azur.png'` avec `dim: 0.14`
  // rejoue l'ancien. `dim` tombe à 0 : il existait pour RABATTRE l'azur trop vif
  // (« l'état normal est un peu trop flashy »), la nappe l'est désormais d'elle-même.
  beau: {
    src: '/pixelart/water/river-tiles-calm-ciel-v2.png', pale: '104,148,162', dim: 0,
    shore: ['86,128,142', '112,150,158', '160,188,186'],
    quay: ['rgba(104,146,158,0.50)', 'rgba(170,198,196,0.55)'], wash: '120,168,184',
  },
  // EAU TROUBLE (2026-10-04, analyse du visuel de crise, Raph : oui) : la cité en
  // ruine avait le fleuve le plus VIF de l'écran (turquoise, éclats 207,255,255) —
  // un lagon au pire moment. Même dessin, cinq couleurs remplacées par rôle
  // (scripts/eauTrouble.mjs) : boue olive-brun presque sans saturation, reflets
  // éteints ; liseré, bas-fond du quai et lavis de nuit suivent. Le turquoise reste
  // sur le disque : `src: '/pixelart/water/river-tiles-calm-turquoise-v2.png'` avec
  // pale '207,255,255', shore ['74,190,175','132,222,210','206,248,242'],
  // quay ['rgba(110,200,188,0.50)','rgba(206,244,236,0.62)'], wash '80,220,205'.
  usure: {
    src: '/pixelart/water/river-tiles-calm-trouble-v2.png', pale: '126,124,98', dim: 0,
    shore: ['94,97,76', '114,116,92', '148,150,120'],
    quay: ['rgba(106,108,86,0.50)', 'rgba(148,150,120,0.60)'], wash: '124,124,100',
  },
  hiver: {
    src: '/pixelart/water/river-tiles-calm-hiver-v2.png', pale: '219,243,243', dim: 0,
    shore: ['140,168,214', '178,202,232', '224,240,248'],
    quay: ['rgba(160,186,214,0.50)', 'rgba(224,238,248,0.62)'], wash: '150,190,225',
  },
  // Ardoise : valeurs HISTORIQUES à l'identique (liseré validé le 2026-07-16,
  // bas-fond de quai d'origine) — ce coloris ne doit rien changer à l'existant.
  pluie: {
    src: '/pixelart/water/river-tiles-calm-v2.png', pale: '158,184,192', dim: 0,
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
// reste trouble — les rapports entre humeurs ne bougent pas. En dessous de
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
// habillent TOUTE la scène (sol enneigé, voile de pluie) — un fleuve trouble au
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
  // Une entrée vaut pour SA source : changer `src` d'un coloris (molette
  // __waterSheets, essais de planche) recharge l'image au lieu de servir l'ancienne.
  if (e && e.src === cfg.src) return e;
  if (typeof Image === 'undefined') return null;
  const im = new Image();
  // ⚠ L'entrée est capturée en LOCAL, jamais relue depuis la Map dans le
  // callback : deux chargements peuvent se croiser au basculement.
  e = { img: im, ready: false, frames: null, src: cfg.src, tile: WATER_TILE };
  waterSheets.set(key, e);
  im.onload = () => {
    const h = im.naturalHeight || WATER_TILE;
    e.tile = h >= 4 && h <= WATER_TILE_MAX && WATER_TILE_MAX % h === 0 ? h : WATER_TILE;
    e.ready = true;
  };
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
  const W = tileOf(sheet);
  if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(W, W);
  else { c = document.createElement('canvas'); c.width = W; c.height = W; }
  const cx = c.getContext('2d');
  if (!cx) return null;
  cx.imageSmoothingEnabled = false;
  cx.drawImage(img, fi * W, 0, W, W, 0, 0, W, W);
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
  // Bouts du VRAI fleuve, comme le grain : la rallonge d'écran ne la fait pas pivoter.
  const iA = pts.core0 | 0, iB = pts.core1 != null ? pts.core1 : len - 1;
  const pA = worldToScreen(pts[iA].x * T, pts[iA].y * T);
  const pB = worldToScreen(pts[iB].x * T, pts[iB].y * T);
  let dx = pB.x - pA.x, dy = pB.y - pA.y;
  const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  const anchor = worldToScreen(0, 0);
  const TW = tileOf(sheet);                              // côté du carreau, px de tuile
  const step = TW * G.worldPx * z;                       // période à l'écran
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
  // La capture LIVE (« Garder une image », BUG-89) garde l'averse : teinte et
  // coloris suivent la pluie, mais la phase reste à la cadence de beau temps — une
  // image fixe n'a pas de mouvement à raccorder.
  const spatial = WATER_TILE_MAX * G.worldPx;      // période spatiale, CONSTANTE (cf. WATER_TILE_MAX)
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
    const k = G.worldPx * z;                     // un pixel de carreau → k px d'écran, quel que soit le carreau
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
      fillExtraWater(ctx, T);
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
        fillExtraWater(ctx, T);
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
      ctx.drawImage(img, fi * TW, 0, TW, TW,
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
    // PETITE VIE (2026-10-01, PLAN-MAQUETTE-VIVANTE §9) : clapotis et banc AU PIXEL
    // (anneaux tracés pixel par pixel, silhouettes dessinées) — mêmes horloges, mêmes
    // rayons que le tracé vectoriel qu'ils remplacent (isoRiverLife.vieFisherWater).
    vieFisherWater(ctx, p, sh, t, s, F, tone, FLEET_TUNE.orbitDwell);
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

/* ── L'ÉCUME DE LA LAME (2026-10-01) ──────────────────────────────────────────
 * Raph : « on améliore le fleuve ? les vagues, l'effet humide dû aux vagues ».
 * Le ressac avançait et reculait sans rien qui dise qu'il DÉFERLE : le bord de
 * l'eau n'était qu'un liseré bleu clair lissé, le même à la montée et au retrait.
 *
 * Ici, un liseré d'écume AU PIXEL (pixels d'art pleins, rabattus au pixel
 * d'écran comme toute la petite vie — vieK), juste dans l'eau, sur le front :
 *   · il n'existe que là où l'eau MONTE (waveRise) — il naît avec la lame, court
 *     le long de la berge avec elle (l'onde voyage, l'écume aussi), et s'éteint
 *     quand elle s'arrête ; au retrait, le sable mouillé prend le relais ;
 *   · sa DENSITÉ suit la vitesse : lame franche = trait continu, lame qui ralentit
 *     = dentelle qui se déchire. Chaque pixel a son seuil, tiré au hasard mais
 *     ANCRÉ À L'ABSCISSE DU FLEUVE (pas à l'écran) : la dentelle ne grésille pas
 *     au pan, et un pixel allumé le reste tant que la lame est assez forte ;
 *   · un second rang plus pâle, vers le large, quand la lame est pleine.
 * Au CONTACT de la terre et de l'eau, comme le bas-fond et la laisse — jamais au
 * milieu du courant, où trois nappes animées ont été refusées.
 * Purement f(now) comme toute l'onde : une capture au même `now` redonne la même
 * écume. Sous les quais : seuls les tronçons de berge naturelle (mêmes `runs` que
 * le bas-fond).
 * ------------------------------------------------------------------------- */
// Tronçons [a, b] privés des samples marqués dans `dock` (cf. drawIsoRiver, les
// ports du XIXe). Sans masque, ou masque vide : les tronçons tels quels, même
// tableau — rien ne change tant qu'aucun port ne publie. Pure et exportée.
export function withoutDocks(runs, dock) {
  if (!dock || !runs.length || dock.indexOf(1) < 0) return runs;
  const out = [];
  for (const [a, b] of runs) {
    let i = a;
    while (i <= b) {
      if (dock[i]) { i += 1; continue; }
      const s = i;
      while (i + 1 <= b && !dock[i + 1]) i += 1;
      if (i > s) out.push([s, i]);            // un sample seul ne trace rien
      i += 1;
    }
  }
  return out;
}

const FOAM_PX_PER_TILE = 24;            // ~ un pixel d'art par pas le long de la berge
const FOAM_DASH = 3.5;                  // longueur moyenne d'un tiret d'écume, en pas
function foamHash(n, salt) {
  let x = Math.imul((n | 0) ^ Math.imul(salt | 0, 0x27d4eb2d), 0x9e3779b1);
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
// Seuil de la dentelle au pas `id` : un BRUIT LISSÉ le long de la berge et non un
// tirage par pixel. Tiré pixel par pixel, l'écume clairsemée faisait du SEL — des
// points isolés qu'on lit comme des reflets, pas comme de l'écume ; lissé sur
// quelques pas, les pixels allumés se groupent en TIRETS qui s'allongent quand la
// lame forcit et se cassent quand elle faiblit.
function foamLace(id, salt) {
  const x = id / FOAM_DASH, i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return foamHash(i, salt) * (1 - u) + foamHash(i + 1, salt) * u;
}
function drawSwashFoam(ctx, pts, T, runsPlus, runsMinus, withIslands) {
  const G = waveTune;
  if (!(G.foam > 0) || waveAmp <= 0 || CM.lodActive || CM.collapseAt) return;
  const fade = Math.min(1, G.foam) * vieZoomFade();
  if (fade <= 0.01) return;
  const wv = waveHalfWidths(pts);
  if (!wv) return;
  const k = vieK(), d = CM.dpr || 1, K = Math.max(1, Math.round(k * d));
  const r1 = [], r2 = [];
  const W = CM.cw, H = CM.ch, M = 4 * k;
  const r2From = Math.min(0.99, G.foamRow2);
  // Un pas le long d'un segment de bord : E = bord de l'eau (écran), D = direction
  // unitaire VERS LE LARGE, f = intensité d'écume, s = abscisse (tuiles), salt =
  // la rive (deux berges voisines ne tirent pas la même dentelle).
  const walk = (E0, E1, D0, D1, f0, f1, s0, s1, salt) => {
    if (f0 <= 0 && f1 <= 0) return;
    if ((E0.x < -M && E1.x < -M) || (E0.x > W + M && E1.x > W + M)
      || (E0.y < -M && E1.y < -M) || (E0.y > H + M && E1.y > H + M)) return;
    const n = Math.max(1, Math.ceil(Math.hypot(E1.x - E0.x, E1.y - E0.y) / k));
    for (let q = 0; q < n; q += 1) {
      const t = (q + 0.5) / n;
      const f = (f0 + (f1 - f0) * t) * fade;
      if (f <= 0) continue;
      const id = Math.floor((s0 + (s1 - s0) * t) * FOAM_PX_PER_TILE);
      if (foamLace(id, salt) >= f) continue;
      const x = E0.x + (E1.x - E0.x) * t, y = E0.y + (E1.y - E0.y) * t;
      const dx = D0.x + (D1.x - D0.x) * t, dy = D0.y + (D1.y - D0.y) * t;
      r1.push(Math.round((x + dx * 0.5 * k) * d - K / 2), Math.round((y + dy * 0.5 * k) * d - K / 2));
      if (f > r2From && foamLace(id, salt + 101) < (f - r2From) / (1 - r2From)) {
        r2.push(Math.round((x + dx * 1.5 * k) * d - K / 2), Math.round((y + dy * 1.5 * k) * d - K / 2));
      }
    }
  };
  const arc = ensureWaveArc(pts), len0 = pts.length;
  const unit = (ax, ay) => { const l = Math.hypot(ax, ay) || 1; return { x: ax / l, y: ay / l }; };
  [1, -1].forEach((sgn, si) => {
    const runs = si ? runsMinus : runsPlus;
    if (!runs || !runs.length) return;
    const hwA = si ? wv.minus : wv.plus, rise = si ? wv.riseMinus : wv.risePlus;
    // Bord, direction du large et écume, projetés une fois par sample du tronçon.
    const E = new Array(len0), D = new Array(len0), F = new Float64Array(len0);
    const need = (i) => {
      if (E[i]) return;
      const p = pts[i], o = pts[Math.max(0, i - 1)], q = pts[Math.min(len0 - 1, i + 1)];
      const tl = Math.hypot(q.x - o.x, q.y - o.y) || 1;
      const nx = -(q.y - o.y) / tl, ny = (q.x - o.x) / tl, hw = hwA[i];
      const e = worldToScreen((p.x + sgn * nx * hw) * T, (p.y + sgn * ny * hw) * T);
      const c = worldToScreen(p.x * T, p.y * T);
      E[i] = e; D[i] = unit(c.x - e.x, c.y - e.y); F[i] = swashFoam(rise[i]);
    };
    for (const [a, b] of runs) {
      for (let i = a; i < b; i += 1) {
        need(i); need(i + 1);
        walk(E[i], E[i + 1], D[i], D[i + 1], F[i], F[i + 1], arc[i], arc[i + 1], si ? 7919 : 104729);
      }
    }
  });
  if (withIslands) {
    const N = 30;
    for (const il of (riverIslands() || [])) {
      const path = islandOutline(il, T, N, 'wave');
      if (!path || path.length < 2) continue;
      const c = worldToScreen(il.x * T, il.y * T);
      const perim = 2 * Math.PI * ((il.rx + il.ry) / 2);
      const ph = (il.x * 0.7 + il.y * 1.3) % (Math.PI * 2);
      const salt = 1301 + Math.round(il.x * 31 + il.y * 17);
      // L'onde est modulée par le sillage (islandWakeK) : sa vitesse aussi.
      const F = path.map((_, i) => swashFoam(islandWakeK((i / N) * Math.PI * 2) * waveRiseLoop(i / N, perim, waveT, ph)));
      const D = path.map((e) => unit(e.x - c.x, e.y - c.y));
      for (let i = 0; i < path.length - 1; i += 1) {
        walk(path[i], path[i + 1], D[i], D[i + 1], F[i], F[i + 1], (i / N) * perim, ((i + 1) / N) * perim, salt);
      }
    }
  }
  if (!r1.length) return;
  const put = (arr, a) => {
    if (!arr.length || !(a > 0)) return;
    ctx.fillStyle = `rgba(${G.foamTone},${a})`;
    ctx.beginPath();
    for (let j = 0; j < arr.length; j += 2) ctx.rect(arr[j] / d, arr[j + 1] / d, K / d, K / d);
    ctx.fill();
  };
  put(r2, G.foamA[1]);
  put(r1, G.foamA[0]);
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
  // Le fleuve DESSINÉ, rallongé si l'un de ses bouts approche de la vue (cf. LE
  // FLEUVE NE FINIT PAS À L'ÉCRAN). `core` reste le fleuve du layout : les quais,
  // les poissons et les index de tronçon s'y réfèrent.
  const core = rv.samples;
  const pts = riverDrawPts(core);
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
  fillExtraWater(ctx, T);
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
    // Le quai (iso/isoQuay.js, 2026-10-01) trace son bas-fond à TOUS les zooms —
    // l'ancien le lâchait au dézoom (LOD), d'où un relais `lodFallback`, retiré
    // avec lui : il doublait désormais le liseré du mur. Fleuve RUINÉ exclu du relais : l'eau morte n'a ni tuile ni
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
    } else if (!quayEra || !quayWallTune.on) {
      // Aucun quai (ère de campement, molette coupée) : le ruban porte tout.
      runsPlus = runsMinus = tout;
    } else {
      ensureQuayGate();
      const g = CM.quayGate;
      // Le masque du quai est indexé sur le fleuve SEUL : les tronçons se
      // découpent sur lui, puis se reportent sur le ruban rallongé (dont les
      // rallonges, sans quai, prolongent la berge naturelle des bouts).
      const kh = pts.core0 | 0, n = core.length;
      // ⚠ LES PORTS DU XIXe (docs/PLAN-PORTS.md, session du port, 2026-10-02) : l'entrée
      // du BASSIN et le terre-plein du port de COMMERCE coupent le quai mais ne sont
      // PAS des grèves — un mur y tient le bord. Leurs samples (`dockPlus/dockMinus`)
      // sortent donc des tronçons : ni bas-fond de grève, ni sable, ni sable mouillé,
      // ni écume en travers de l'embouchure. Retirés APRÈS le rembourrage de
      // quayGapRuns (qui déborde d'un sample sur la pointe du quai voisin, voulu),
      // sans rembourrage à eux : le bord du port est franc.
      runsPlus = extendRiverRuns(withoutDocks(quayGapRuns(g && g.drawPlus, n), g && g.dockPlus), kh, n, len0);
      runsMinus = extendRiverRuns(withoutDocks(quayGapRuns(g && g.drawMinus, n), g && g.dockMinus), kh, n, len0);
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
              : si ? edgeAt(wv.minus[i], wv.wetMinus[i], wetFracOf(mode))
                : edgeAt(wv.plus[i], wv.wetPlus[i], wetFracOf(mode));
            path.push(worldToScreen((p.x + sgn * n.nx * hw) * T, (p.y + sgn * n.ny * hw) * T));
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
        // (Le remplissage en paliers n'a pas besoin des bords de la laisse.)
        const edgesWet = (wv && !waveTune.wetFill) ? buildEdges('wet', true) : edgesSand;
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
        //
        // ── LE SABLE MOUILLÉ EN DÉGRADÉ (2026-10-01) ────────────────────────────
        // Raph : « l'effet humide dû aux vagues ». Mesuré avant : le liseré ne
        // couvrait que `wetW/2` px de part et d'autre de la laisse — au zoom 3, la
        // moitié de la bande découverte au mieux, et au zoom de jeu la bande
        // entière tenait dans 3-4 px. On voyait l'eau bouger, rien ne le marquait
        // sur le sable.
        // On REMPLIT désormais toute la bande découverte, en trois paliers. Chaque
        // palier est un POLYGONE MINCE fermé entre deux bords : le bord de l'eau du
        // moment, puis le palier parcouru à rebours — rien que le sable découvert,
        // sur les tronçons de berge naturelle (mêmes `runs` que le reste de la
        // grève). Les trois s'empilent : le plus foncé au ras de l'eau (le sable
        // qu'elle vient de quitter), le plus clair à la laisse (celui qui sèche).
        // Même règle que le liseré qu'il remplace — rien devant la vague, tout
        // derrière. Sur une île, les deux contours parcourus en sens inverse
        // ferment un ANNEAU (règle nonzero).
        // ⚠ Pas en remplissant le ruban entier sous le clip côté terre (premier
        // jet) : trois remplissages de tout le fleuve pour en garder un liseré,
        // mesuré +1 ms par frame en rendu logiciel sur une ville de bande 9.
        if (wv && waveTune.wetFill) {
          const A = waveTune.wetA;
          const edgesU = buildEdges('wave', true);
          ['wet', 'wet2', 'wet1'].forEach((mode, j) => {
            if (!(A[j] > 0)) return;
            const edgesJ = buildEdges(mode, true);
            ctx.fillStyle = `rgba(${wt},${A[j]})`;
            ctx.beginPath();
            for (let e = 0; e < edgesU.length && e < edgesJ.length; e += 1) {
              const U = edgesU[e].path, J = edgesJ[e].path;
              for (const [a, b] of edgesU[e].runs) {
                if (b <= a) continue;
                ctx.moveTo(U[a].x, U[a].y);
                for (let i = a + 1; i <= b; i += 1) ctx.lineTo(U[i].x, U[i].y);
                for (let i = b; i >= a; i -= 1) ctx.lineTo(J[i].x, J[i].y);
                ctx.closePath();
              }
            }
            ctx.fill('nonzero');
          });
        } else if (wv) {
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
      // L'ÉCUME DE LA LAME : sur le front de l'eau qui monte, par-dessus le bas-fond
      // clair (elle est la crête blanche de ce liseré) et sur les seuls tronçons de
      // berge naturelle — les mêmes que le bas-fond. Îles comprises.
      drawSwashFoam(ctx, pts, T, runsPlus, runsMinus, true);
    }
  }
  // OMBRES DE POISSONS : sous les reflets (dessinées AVANT les vaguelettes).
  drawIsoFishShadows(ctx, rv, T, z, now);
  // Clapotis du pêcheur et son banc : même couche que les poissons du fleuve —
  // sous la surface, donc SOUS les coques (les bateaux passent bien après).
  drawIsoFisherWater(ctx, T, z, now, wb);
  // REFLETS (iso/isoReflect.js) : la rive d'en face, les bateaux, ce qui borde l'eau,
  // SUR la surface et sous la vie de surface, les quais, les coques et le pont. Le
  // miroir passe à la hauteur de l'eau : sous la promenade de toute la hauteur du
  // mur quand l'ère a des quais (bandes 2+), au ras du sol sinon.
  {
    const band = (L.counts && L.counts.eraBand) | 0;
    const drop = (band >= 2 && quayWallTune.on) ? quayWallTiles(band) * quayWallTune.heightK * T * z : 0;
    const tint = (CM.waterShore && CM.waterShore.shore && CM.waterShore.shore[0]) || '86,128,142';
    const edges = riverRibbonScreen(pts, T);
    // Le MUR de la rive d'en face se reflète aussi : là où le quai le trace
    // (masque du portail — ni au port ni aux bouts), sur le bord HAUT du ruban à
    // l'écran, celui dont l'eau est devant. Polylignes du bord d'eau, par tronçon.
    let wall = null;
    if (drop > 0 && !CM.lodActive && !CM.collapseAt) {
      ensureQuayGate();
      const g = CM.quayGate;
      if (g && g.drawPlus && g.drawMinus) {
        const kh = pts.core0 | 0, n = core.length, runs = [];
        // Part du mur plein par sample (1, puis → 0 là où le quai descend sur une
        // grève, cf. quayTaperProfile) : le reflet descend de CETTE hauteur.
        const tpP = quayTaperProfile(g, n, 1), tpM = quayTaperProfile(g, n, -1);
        let cur = null;
        for (let i = 0; i < pts.length; i += 1) {
          const c = i - kh;
          const upLeft = edges.left[i].y <= edges.right[i].y;
          const on = c >= 0 && c < n && (upLeft ? g.drawPlus[c] : g.drawMinus[c]);
          if (!on) { cur = null; continue; }
          if (!cur) { cur = []; runs.push(cur); }
          const e = upLeft ? edges.left[i] : edges.right[i];
          const tp = upLeft ? tpP : tpM;
          cur.push({ x: e.x, y: e.y, f: tp ? tp[c] : 1 });
        }
        wall = { runs, cols: quayWallColors(band) };
      }
    }
    drawIsoReflections(ctx, now, (c) => {
      riverRibbonPath(c, pts, T);
      const xp = extraWaterPolys(true);
      if (xp) traceExtraWater(c, T, xp);
    }, edges, drop, tint, wall);
  }
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

