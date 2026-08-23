// LA MÉTÉO QUI TOMBE — pluie, éclats au sol, neige.
//
// Extraite d'isoRenderer.js le 2026-08-23 (Q10). Une surcouche plein écran, en
// PIXELS : le rideau de pluie et ses rafales, les impacts qui mouillent le sol, et
// la chute de neige de l'hiver. Trois passes, une seule porte d'entrée
// (`drawIsoRain`), et une seule question publique (`precipKind` : ce qui tombe
// pour une saison et une intensité données).
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Couture mesurée avant la coupe :
// ZÉRO dépendance entrante, trois sortantes. Vérifiée ligne à ligne contre la
// version commitée.
//
// ⚠ LES TEINTES DE FLOCON VIENNENT D'AILLEURS DANS LE FICHIER. `SNOW_TOP` et
// `SNOW_SHADE` vivaient au milieu de la section « liseré d'herbe », reliquat du
// jour où la neige était encore peinte dans le bake du sol (elle vient des tuiles
// d'hiver depuis le 2026-07-28, cf. le commentaire ci-dessous, conservé tel quel).
// Elles ne servent QUE ces flocons-ci : elles les suivent, et la lisière d'herbe
// retrouve ses tons d'un seul tenant.
//
// ⚠ Ce module n'est lu par personne d'autre que le peintre : `isoRiverLife` reçoit
// `precipKind` par INJECTION (`configureRiverLife`), pas par import — c'est ce qui
// lui évitait déjà un cycle, et ça reste vrai.
import { CM } from '../layout.js';
import { worldToScreen, screenToWorld, visibleCellBounds, ISO_X } from './projection.js';
import { WINTER } from '../seasonMode.js';
import { WILD_PAD, WILD_BLOCK, isoWildForest } from './isoWildForest.js';
import { _frac, _rnd } from './isoMath.js';

// ── LISERÉ DE NEIGE (hiver seulement) ────────────────────────────────────────
// ── NEIGE D'HIVER : DANS LES TUILES, plus dans le bake procédural ─────────────
// Le liseré blanc de lisière (2026-07-22) et les mottes procédurales (2026-07-28
// matin) ont été SUPPRIMÉS le 2026-07-28 : « ton procédural clignote à chaque
// mouvement de caméra » (Raph) — tout décor du bake qui traverse une frontière
// de cellule se fait rogner aux coutures du DÉFILEMENT INCRÉMENTAL du sol (une
// bande recuite ne redessine pas ce que la cellule d'à côté faisait déborder
// chez elle) → scintillement au pan. La neige vient désormais des TUILES
// D'HIVER (`ISO_TILE_WINTER`) : neige cuite dans l'art, par cellule, donc
// incrémental-sûre par construction. SNOW_TOP/SNOW_SHADE restent : ce sont les
// teintes des FLOCONS de précipitation (isoSnowFlake), qui vivent en live, pas
// dans le bake.
const SNOW_TOP = [251, 250, 244];    // boneWhite — la neige au soleil
const SNOW_SHADE = [170, 176, 184];  // metalSlate — le creux bleuté

// ── PRÉCIPITATIONS ──────────────────────────────────────────────────────────
// Surcouche plein écran : gouttes tracées en PIXELS et inclinées par le vent
// (cf. rainStreakPixels), position = fonction pure de (phase, index) comme les
// particules d'ambiance — aucune goutte n'est un objet qu'on fait vivre. Seule
// la PHASE de chute est portée d'une image à l'autre, et pour une raison
// précise : les rafales font varier la vitesse (cf. stepRainPhase). Lit
// CM.rainF / CM.windX / CM.gustF publiés une fois par frame par le runtime
// (weatherMode.js). L'assombrissement passe par un aplat, et non par un
// filtre canvas, pour préserver les contrastes comme le fait le voile de nuit.
// La brume de rivière retirée le 2026-07-13 n'est PAS ressuscitée ici.
//
// EN HIVER LA MÊME AVERSE TOMBE EN NEIGE (cf. drawIsoSnowfall). Un seul signal
// météo, deux gestes : rien de nouveau n'est publié, donc tout ce qui lit déjà
// la météo (la foule qui rentre, les cheminées qui fument) vaut aussi sous la
// neige. La saison décide de la FORME, jamais de la fréquence.
//
// RAFALES (CM.gustF, cf. weatherMode.js) : l'averse arrive par paquets. Ce que
// la bourrasque ajoute à pleine force est réglé ci-dessous ; à gustF = 0 tout
// retombe EXACTEMENT sur l'averse d'avant.
// Molette : __rain({ on, drops, len, alpha, gust, width }) — gust: 0 coupe les
// rafales, width: 0.6 rend le filet d'un pixel d'avant. `on: false` ne coupe que
// le RIDEAU : le ciel reste chargé et les impacts continuent (c'est le geste
// qu'on fait pour juger les éclats seuls, cf. __splash).
export const RAIN_TUNE = { on: true, drops: 1, len: 1, alpha: 1, gust: 1, width: 1 };
if (typeof window !== 'undefined') {
  window.__rain = (o) => {
    if (o) Object.assign(RAIN_TUNE, o);
    return { ...RAIN_TUNE, etampes: rainStamps.size, forges: rainStampBuilds };
  };
}
const RAIN_CAP = 900;
const RAIN_FALL_PX = 900;      // px/s de la goutte la plus LENTE (les autres, jusqu'à ×1,78)
const GUST_DROPS = 0.8;        // rideau de rafale : + 80 % de densité, en FONDU (cf. drawRainVeil)
const GUST_SPEED = 0.5;        // + 50 % de vitesse de chute
const GUST_LEAN = 0.55;        // + 55 % d'inclinaison, plus une poussée plancher
const GUST_KICK = 0.15;        // ...sinon une averse sans vent ne se couche pas du tout
const RAIN_COL = [186, 206, 232];
// ⚠ DEUX RÉGLAGES RETIRÉS avec le passage aux nappes (cf. plus bas) : le rideau
// de rafale ne peut plus être NI plus long (GUST_LEN, +45 %) NI plus clair
// (sa propre teinte) que celui du fond, puisqu'il RÉUTILISE ses nappes. Il garde
// ce qui portait l'effet : la densité en fondu, la vitesse, et l'inclinaison —
// laquelle profite aussi au fond, dont la nappe se reforge sous la bourrasque.

// ⚠ MÊME PIÈGE QUE L'EAU (cf. ⚠⚠ PHASE ACCUMULÉE) : sous rafale la vitesse de
// chute VARIE, et une vitesse variable ne se multiplie JAMAIS par un temps
// absolu — le rideau bondirait à chaque bouffée, et REMONTERAIT pendant qu'elle
// retombe. On intègre donc la descente image par image. Chaque goutte garde son
// facteur de vitesse propre (constant), donc le rideau reste dispersé, et le dt
// est plafonné : un retour d'onglet ne téléporte plus l'averse.
// PAS DE MODULO sur cette phase : la borner ferait sauter le rideau (chaque
// goutte a son facteur, aucune période commune). float64 tient des années à
// ~1,5 écran/s. Exportée pure pour le test : c'est sa CONTINUITÉ qui compte.
let rainPhase = 0, rainPhaseAt = -1;
export function stepRainPhase(prev, t, rate) {
  const dt = prev.at < 0 ? 0 : Math.min(0.25, Math.max(0, t - prev.at));
  return { at: t, phase: prev.phase + dt * rate };
}

// ── LA GOUTTE EST UN PIXEL, PAS UN TRAIT LISSÉ ──────────────────────────────
// Le rideau était le dernier élément ANTICRÉNELÉ de la carte. Un segment
// diagonal posé à coordonnées fractionnaires est étalé par l'anticrénelage sur
// deux colonnes à demi-opacité : la goutte paraît plus FINE et plus PÂLE qu'un
// vrai pixel — c'est ce qui avait fait épaissir le filet le 2026-07-29, un
// pansement sur le lissage. La neige, juste en dessous, est déjà en pixels
// pleins (`fillRect` à coordonnées ARRONDIES) ; la pluie s'y aligne.
//
// ⛔ SURTOUT PAS UN SPRITE DESSINÉ. L'inclinaison n'est pas figée : elle vit
// avec `windX` et enfle sous rafale (cf. gustWind). Un dessin à angle fixe ne se
// recolle qu'en le DÉFORMANT, et une skew sur du pixel rend du flou — soit
// exactement ce qu'on cherche à supprimer. On trace donc la goutte en escalier,
// à l'entier, une fois par rideau, et on la ré-étampe telle quelle.
const RAIN_TAIL = 0.34;          // opacité de la QUEUE : le dégradé fait la goutte, pas la longueur
const RAIN_STAMP_MAX = 64;       // le vent bouge en continu : la table se purge, elle n'enfle pas

// Pixels d'une goutte : escalier de la queue (0,0) vers la tête (dx,dy), pointe
// épaissie, queue effacée. Pur et exporté — c'est la CONTINUITÉ de l'escalier
// qui compte et aucune image ne la montre. ⚠ LE PAS SUIT L'AXE MAJEUR : à vent
// fort dx dépasse dy, et un pixel par LIGNE laisserait alors des trous en
// colonne (cf. le témoin du test).
export function rainStreakPixels(dx, dy, w = 1) {
  const X = Math.round(dx), Y = Math.max(1, Math.round(dy));
  const th = Math.max(1, w | 0);
  const steps = Math.max(Math.abs(X), Math.abs(Y));
  const ox = X < 0 ? -X : 0;                       // la queue n'est pas au bord quand le vent souffle à gauche
  const sw = Math.abs(X) + th, sh = Math.abs(Y) + th;
  const at = new Map();
  for (let s = 0; s <= steps; s += 1) {
    const u = s / steps;
    const a = RAIN_TAIL + (1 - RAIN_TAIL) * u * u;
    const tw = Math.max(1, Math.round(1 + (th - 1) * u));   // la goutte S'ÉFFILE vers l'arrière
    const px = ox + Math.round(X * u), py = Math.round(Y * u);
    for (let bx = 0; bx < tw; bx += 1) {
      for (let by = 0; by < tw; by += 1) {
        const k = (py + by) * sw + (px + bx);
        if (!(at.get(k) >= a)) at.set(k, a);       // la tête l'emporte sur la queue au recouvrement
      }
    }
  }
  const px = [];
  for (const [k, a] of at) px.push({ x: k % sw, y: (k / sw) | 0, a });
  return { w: sw, h: sh, ox, px };
}

// Étampe d'un rideau : un seul dessin pour toutes ses gouttes. Géométrie
// QUANTIFIÉE à 2 px — l'angle et la longueur glissent en continu pendant les
// 480 ms d'attaque de la rafale, sans quoi on reconstruirait une étampe par
// image. À cette taille, 2 px de longueur ne se voient pas tomber.
const rainStamps = new Map();
let rainStampBuilds = 0;          // diagnostic : une étampe neuve coûte un canvas + un putImageData
function rainStamp(dx, dy, w, rgb) {
  const kx = Math.round(dx / 2) * 2, ky = Math.max(2, Math.round(dy / 2) * 2);
  const kw = Math.max(1, w | 0);
  const key = kx + ',' + ky + ',' + kw + ',' + rgb;
  const hit = rainStamps.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  rainStampBuilds += 1;
  const s = rainStreakPixels(kx, ky, kw);
  const cv = document.createElement('canvas');
  cv.width = s.w; cv.height = s.h;
  const c2 = cv.getContext('2d');
  const img = c2.createImageData(s.w, s.h), d = img.data;
  const R = +rgb[0], G = +rgb[1], B = +rgb[2];
  for (let i = 0; i < s.px.length; i += 1) {
    const p = s.px[i], o = (p.y * s.w + p.x) * 4;
    d[o] = R; d[o + 1] = G; d[o + 2] = B; d[o + 3] = Math.round(p.a * 255);
  }
  c2.putImageData(img, 0, 0);
  const out = { cv, ox: s.ox };
  if (rainStamps.size >= RAIN_STAMP_MAX) rainStamps.clear();
  rainStamps.set(key, out);
  return out;
}

// ── LE RIDEAU DÉFILE, IL NE SE REDESSINE PAS GOUTTE PAR GOUTTE ──────────────
// Étamper les gouttes une à une, c'est UN APPEL DE DESSIN PAR GOUTTE : 617 sur
// la fenêtre de Raph, 1111 sous rafale quand le second rideau s'ajoute. À ~1,5 µs
// l'appel ça fait près de 2 ms, et il l'a senti (« ça ralentit un peu ») alors
// que le profileur de frame ne voyait RIEN — la pane ne compose pas, elle empile
// les commandes sans jamais payer le rendu (cf. la fiche du harnais).
//
// Or les gouttes tombent TOUT DROIT : le vent penche leur FORME, pas leur
// trajectoire (dans le rideau d'avant, x était fixe et seul y avançait). Un
// rideau est donc une NAPPE qui défile, et une nappe se blitte en deux appels.
// Les gouttes sont réparties sur QUATRE nappes de vitesses différentes — c'est
// leur glissement les unes sur les autres qui garde le rideau dispersé ; une
// nappe unique tomberait d'un bloc et ça se verrait. La frame coûte 8 appels au
// lieu de 617, et 16 sous rafale au lieu de 1111.
//
// ⚠ BOUCLAGE EN Y : la nappe se répète tous les H pixels, donc une goutte qui
// déborde en bas doit AUSSI être peinte H plus haut. Sans ça, une bande vide
// large d'une goutte traverse l'écran à chaque tour — une ligne d'horizon qui
// descend, impossible à ne plus voir une fois repérée.
//
// ⚠ COÛT MÉMOIRE : quatre canvas plein écran (~27 Mo sur une grande fenêtre).
// Ils sont LIBÉRÉS dès que l'averse s'arrête — la pluie ne tombe que 12 % du
// cycle, rien ne justifie de les garder au sec.
const RAIN_LANES = 4;
const LANE_SPEED = [1, 1.26, 1.52, 1.78];   // même éventail qu'au temps du (1 + sd2 × 0,78) par goutte
let rainVeil = null;

// Où semer les gouttes d'une nappe, et sur quelle voie. DEUX POSES PAR GOUTTE :
// la sienne, et la même H plus haut — c'est ce doublon qui fait que la nappe se
// raccorde à elle-même quand elle reboucle. Pur et exporté : la couture est
// invisible sur une image fixe, elle ne se trahit qu'en mouvement, et trop tard.
export function rainVeilDraws(n, lw, lh, ox = 0) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const sd = _rnd(i, 1), sd2 = _rnd(i, 2);
    const lane = i % RAIN_LANES;
    const x = Math.round(_frac(sd2 + sd * 0.37) * lw) - ox;
    const y = Math.round(sd * lh);
    out.push({ lane, x, y }, { lane, x, y: y - lh });
  }
  return out;
}

// La nappe pour une géométrie donnée, reforgée seulement quand elle change.
// ⚠ QUANTIFIER, sinon on reforge à CHAQUE IMAGE : sous rafale l'inclinaison et
// la longueur glissent en continu pendant les 480 ms d'attaque. Au pas de 4 px
// une bourrasque coûte cinq reforges au lieu de trente.
function rainVeilFor(n, dx, dy, th, W, H) {
  if (typeof document === 'undefined' || n <= 0) return null;
  const dpr = CM.dpr || 1;
  const kdx = Math.round(dx / 4) * 4, kdy = Math.max(2, Math.round(dy / 4) * 4);
  const kn = n < 24 ? n : Math.round(n / 8) * 8;
  const marge = Math.abs(kdx) + th + 8;
  const lw = W + marge * 2, lh = Math.max(1, H);
  const key = [kn, kdx, kdy, th, lw, lh, dpr].join(',');
  if (rainVeil && rainVeil.key === key) return rainVeil;
  const st = rainStamp(kdx, kdy, th, RAIN_COL);
  if (!st) return null;
  const V = rainVeil && rainVeil.cv.length === RAIN_LANES ? rainVeil
    : { key: '', marge: 0, lw: 0, lh: 0, cv: [], cx: [] };
  const pw = Math.max(1, Math.round(lw * dpr)), ph = Math.max(1, Math.round(lh * dpr));
  for (let l = 0; l < RAIN_LANES; l += 1) {
    let cv = V.cv[l];
    if (!cv) { cv = V.cv[l] = document.createElement('canvas'); V.cx[l] = cv.getContext('2d'); }
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    const c2 = V.cx[l];
    if (!c2) return null;
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);   // même repère que CM.ctx : on peint en pixels LOGIQUES
    c2.clearRect(0, 0, lw, lh);
    c2.imageSmoothingEnabled = false;
  }
  // La nappe est plus large que l'écran (les gouttes de bord doivent être
  // ENTIÈRES) : on sème donc au prorata, sans quoi la marge diluerait l'averse.
  const plan = rainVeilDraws(Math.round(kn * (lw / Math.max(1, W))), lw, lh, st.ox);
  for (let i = 0; i < plan.length; i += 1) {
    const d = plan[i];
    V.cx[d.lane].drawImage(st.cv, d.x, d.y);
  }
  V.key = key; V.marge = marge; V.lw = lw; V.lh = lh;
  rainVeil = V;
  return V;
}

// Un rideau = les quatre nappes posées à leur avancement propre. `tour` fait
// tourner l'attribution nappe↔vitesse : le rideau de rafale réutilise les mêmes
// dessins que celui du fond, et sans ce décalage les deux se superposeraient
// EXACTEMENT chaque fois que leurs phases se rejoignent — la bourrasque se
// lirait alors comme un coup d'opacité au lieu d'un surcroît de gouttes.
function drawRainVeil(ctx, V, phase, tour, alpha) {
  if (!(alpha > 0.002)) return;
  ctx.globalAlpha = Math.min(1, alpha);
  for (let l = 0; l < RAIN_LANES; l += 1) {
    const cv = V.cv[(l + tour) % RAIN_LANES];
    const s = Math.round(_frac(phase * LANE_SPEED[l]) * V.lh);   // à l'ENTIER : la nappe reste sur la grille
    ctx.drawImage(cv, -V.marge, s, V.lw, V.lh);
    ctx.drawImage(cv, -V.marge, s - V.lh, V.lw, V.lh);
  }
}

// Ce qui tombe pour une saison et une intensité données. Exporté pour le test :
// c'est le seul embranchement de la fiche, et il ne se voit sur aucune image.
export function precipKind(season, rainF) {
  if (!(rainF > 0.01)) return 'none';
  return (season | 0) === WINTER ? 'snow' : 'rain';
}

// Inclinaison sous rafale. Le SIGNE du vent est celui de l'averse entière (cf.
// windAt) et n'est JAMAIS touché : une bourrasque couche la pluie, elle ne la
// fait pas tourner sous les yeux du joueur. Seule l'amplitude enfle — plus une
// poussée plancher, sans quoi une averse tirée à vent quasi nul ne montrerait
// ses rafales qu'en densité.
function gustWind(g) {
  const w = CM.windX || 0;
  return w + (w < 0 ? -1 : 1) * (Math.abs(w) * GUST_LEAN + GUST_KICK) * g;
}

export function drawIsoRain(now) {
  const r = CM.rainF || 0;
  const kind = precipKind(CM.season, r);
  // Horloge relâchée (l'averse suivante repart à plat) ET nappes rendues : elles
  // pèsent des dizaines de mégaoctets, et le ciel est dégagé 88 % du cycle.
  if (kind === 'none') { rainPhaseAt = -1; rainVeil = null; splashes.length = 0; return; }
  const g = Math.max(0, Math.min(1, (CM.gustF || 0) * RAIN_TUNE.gust));
  if (kind === 'snow') { drawIsoSnowfall(now, r, g); return; }
  const ctx = CM.ctx, W = CM.cw, H = CM.ch;
  // Assombrissement : même geste que NIGHT_VEIL, un aplat ardoise. La bouffée
  // charge le ciel d'un cran au passage, puis le rend.
  ctx.fillStyle = `rgba(38,46,62,${(r * 0.18 * (1 + 0.22 * g)).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  // L'averse est de l'agitation d'ambiance : elle suit le réglage Vie de la carte.
  const k = CM.ambianceK ?? 1;
  if (k <= 0) return;
  // Les impacts D'ABORD : ils sont au SOL, le rideau leur passe devant. Ils sont
  // aussi AVANT la molette du rideau et avant le compte de gouttes — sans quoi
  // `__rain({on:false})` couperait tout et il n'y aurait aucun moyen de juger
  // les éclats seuls, ce qui est précisément le geste qu'on fait pour les régler.
  drawIsoSplashes(now, r, g);
  if (!RAIN_TUNE.on) return;
  const n = Math.min(RAIN_CAP, Math.round((W * H) / 2600 * r * k * RAIN_TUNE.drops));
  if (n <= 0) return;
  // Phase intégrée (cf. stepRainPhase) : c'est ELLE qui accélère sous la rafale.
  // Jamais dans un cliché — `captureFrame` force rainF à 0, donc cette couche ne
  // dessine pas en capture et la phase n'y entre pas.
  const st = stepRainPhase(
    { at: rainPhaseAt, phase: rainPhase }, (now || 0) / 1000,
    (RAIN_FALL_PX / Math.max(1, H)) * (1 + GUST_SPEED * g)
  );
  rainPhaseAt = st.at; rainPhase = st.phase;
  const wind = gustWind(g);
  const len = (10 + 14 * r) * RAIN_TUNE.len;          // px, trait plus long sous l'averse
  const prevAA = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  // ÉPAISSEUR DE LA GOUTTE, en pixels PLEINS — 2 px de tête sous l'averse, 1 px
  // sur une bruine, la rafale ajoutant sa part comme au reste. C'est la même
  // courbe qu'au temps du trait lissé (retour Raph 2026-07-29 : « le filet est un
  // peu trop fin »), sauf qu'elle épaississait alors pour COMPENSER
  // l'anticrénelage ; ici elle dessine vraiment la goutte, et la queue s'affine
  // toute seule dans l'étampe.
  const th = Math.max(1, Math.round((1 + 0.6 * r + 0.35 * g) * RAIN_TUNE.width));
  const lenB = len * (1 + 0.25 * g);
  const V = rainVeilFor(n, wind * lenB * 0.8, lenB, th, W, H);
  if (!V) { ctx.imageSmoothingEnabled = prevAA; return; }
  // L'opacité passe par le CONTEXTE et non par la couleur : l'étampe porte déjà
  // son propre dégradé tête/queue, on ne fait que la doser.
  const prevAlpha = ctx.globalAlpha;
  drawRainVeil(ctx, V, st.phase, 0, 0.42 * r * RAIN_TUNE.alpha);
  // RIDEAU DE RAFALE — les mêmes nappes, repassées plus vite et à une autre
  // attribution de vitesses, dont seule l'OPACITÉ suit la bouffée. La densité
  // doit enfler par FONDU et jamais par le nombre : ajouter des gouttes les
  // ferait NAÎTRE en plein vol (le compte se lit en bout de liste).
  if (g > 0.02) drawRainVeil(ctx, V, st.phase * 1.18, 2, 0.42 * r * g * GUST_DROPS * RAIN_TUNE.alpha);
  ctx.globalAlpha = prevAlpha;
  ctx.imageSmoothingEnabled = prevAA;
}

// ── IMPACTS AU SOL ──────────────────────────────────────────────────────────
// Ce qui fait lire « il pleut » n'est pas le rideau, c'est ce que la pluie FAIT
// au sol. Trois images : le choc, un anneau qui s'ouvre, un anneau plus large
// qui s'efface.
//
// ⚠ L'ANNEAU EST ISO, jamais un rond. Le sol est un losange vu de trois quarts :
// un cercle posé dessus se lit comme une bille qui flotte au-dessus du pavé.
// Deux fois plus large que haut, comme la tuile.
//
// ⚠ UN POOL, PAS UNE FONCTION DU TEMPS. Tout le reste de l'ambiance est pur en
// (index, temps) — ici c'est impossible : un éclat est ancré au SOL, et une
// position tirée en coordonnées ÉCRAN glisserait sur le pavé dès que Raph
// déplace la carte (un quart de seconde de vie, mais 100 px de dérive sur un
// drag). On garde donc la position MONDE de chaque éclat, et on la reprojette.
//
// ⚠ OÙ ON A LE DROIT DE FRAPPER. La pluie passe APRÈS le peintre : à ce moment
// les bâtiments sont déjà posés, et un éclat n'a plus aucun moyen de passer
// derrière eux. On ne frappe donc que la VOIRIE, et on écarte les points qu'un
// sprite recouvre — sinon l'éclat se pose sur le mur de la maison d'en face.
// La règle n'est pas réinventée : c'est CELLE DU Y-SORT des habitants
// (CM.buildingInfo, cf. agents.js) — base plus SUD, recouvrement de COLONNE,
// et portée du sprite vers le nord. Un test cellulaire « y a-t-il un bâtiment à
// côté ? » se trompe deux fois : il refuse une venelle entière à cause d'une
// scène basse, et il accepte le pied d'une tour.
const SPLASH_TUNE = { on: true, count: 1, size: 1, alpha: 1 };
if (typeof window !== 'undefined') {
  window.__splash = (o) => { if (o) Object.assign(SPLASH_TUNE, o); return { ...SPLASH_TUNE, vivants: splashes.length }; };
}
const SPLASH_LIFE = 260;         // ms de vie de l'ÉCLAT (les trois images)
// ⚠ LA TACHE SURVIT À L'ÉCLAT (demande de Raph). L'eau gicle en un quart de
// seconde, le pavé reste mouillé après — c'est ce décalage qui donne l'averse
// plutôt qu'un clignotement. L'anneau part, le disque sombre s'efface en
// fondu, et l'opacité est CONTINUE au raccord (voir splashPhase).
const SPLASH_WET_TAIL = 900;     // ms de tache seule, après l'anneau (380 était trop court, Raph)
const SPLASH_AREA = 26000;       // px² d'écran par ÉCLAT à pleine averse
// ⚠ La cible compte les éclats VIVANTS, tache comprise : à densité d'anneaux
// constante, allonger la vie multiplie mécaniquement le pool. On la corrige donc
// par le rapport des durées — sans quoi la demande « garder la tache » aurait
// discrètement divisé le nombre d'impacts par deux et demi.
const SPLASH_LIFE_RATIO = (SPLASH_LIFE + SPLASH_WET_TAIL) / SPLASH_LIFE;
const SPLASH_CAP = 200;          // plafond dur : un éclat = un appel de dessin
const SPLASH_TILE_MIN = 18;      // px : sous cette taille de tuile l'éclat n'est que du bruit
const SPLASH_BIRTHS = 6;         // naissances par image : un pool qui se remplit d'un coup pique
// ⚠ ESSAIS PAR NAISSANCE. Le tirage-rejet ne trouve la voirie qu'à hauteur de sa
// PART D'ÉCRAN : sur un village de 70 cellules de route, six essais ne
// remplissaient qu'un dixième du pool (9 éclats pour 82 visés). On insiste — et
// c'est le rejet, pas la cible, qui borne alors la densité : peu de pavé, peu
// d'éclats, ce qui est exactement ce qu'on veut voir.
const SPLASH_TRIES = 14;
const SPLASH_COL = [206, 224, 244];
const SPLASH_WET = [34, 40, 54];   // le pavé MOUILLÉ sous l'anneau, pas une ombre portée
// Cellules d'où un ARBRE peut recouvrir notre pavé : elles sont toutes vers le
// spectateur (+gx, +gy), et le sprite monte d'autant plus loin qu'il est haut.
// Voisinage volontairement LARGE — un rejet de trop est invisible.
const TREE_SHADE = [
  [0, 0], [1, 0], [0, 1], [1, 1], [2, 0], [0, 2], [2, 1], [1, 2],
  [2, 2], [3, 1], [1, 3], [3, 2], [2, 3], [3, 3],
];
let splashes = [];
let splashSig = '';

// Cellules portant un arbre (plantés + forêt sauvage visible). Mémoïsé sur la
// LISTE de la forêt elle-même : elle est déjà mise en cache par blocs de 32
// cellules, donc tant que le cadrage ne change pas de bloc, il n'y a rien à
// refaire.
function isoTreeCells(L, b) {
  // ⚠ MÉMOÏSER SUR LES BLOCS, PAS SUR LA LISTE RENDUE. `isoWildForest` refait sa
  // liste dès qu'on l'appelle avec un cadrage qui tombe sur d'autres blocs — et
  // le renderer l'appelle DÉJÀ avec deux marges différentes (drawIsoLive et
  // drawIsoAmbient). Une mémoïsation sur l'identité du tableau reconstruirait
  // donc ces milliers de cellules à chaque image, en silence.
  const at = CM.layoutRecomputeAt || 0;
  const key = at + ':' + Math.floor((b.gx0 - WILD_PAD) / WILD_BLOCK)
    + ':' + Math.floor((b.gx1 + WILD_PAD) / WILD_BLOCK)
    + ':' + Math.floor((b.gy0 - WILD_PAD) / WILD_BLOCK)
    + ':' + Math.floor((b.gy1 + WILD_PAD) / WILD_BLOCK);
  const cache = CM._treeCells;
  if (cache && cache.key === key) return cache.set;
  const wild = isoWildForest(L, b);
  const set = new Set();
  for (const t of (L.trees || [])) set.add(t.gx * 10000 + t.gy);
  for (let i = 0; i < wild.length; i += 1) set.add(wild[i].gx * 10000 + wild[i].gy);
  CM._treeCells = { key, set };
  return set;
}

// Le point monde (wx,wy) peut-il porter un éclat ? `road` = voirie marchable
// (clés gx×10000+gy), `binfo` = fiches peintre des bâtiments (world px).
// Exporté pour le test : une règle d'OCCULTATION ne se voit que sur les rares
// images où elle a échoué, et elle échoue sur un éclat de 5 px qui dure 0,26 s.
export function splashPointOk(road, binfo, trees, wx, wy, T) {
  if (!road) return false;
  const gx = Math.floor(wx / T), gy = Math.floor(wy / T);
  if (!road.has(gx * 10000 + gy)) return false;
  // ⚠ LES ARBRES AUSSI (retour Raph : « il y a des impacts d'eau sur les
  // arbres »). Ils n'ont pas de fiche peintre — leur sprite est simplement HAUT,
  // et la cime d'un arbre planté deux ou trois cellules au sud tombe pile sur le
  // pavé qu'on visait. On les écarte largement plutôt que finement : rater
  // quelques éclats au pied d'un arbre ne se voit pas, un anneau posé sur une
  // canopée se voit tout de suite.
  if (trees) {
    for (let i = 0; i < TREE_SHADE.length; i += 1) {
      const o = TREE_SHADE[i];
      if (trees.has((gx + o[0]) * 10000 + (gy + o[1]))) return false;
    }
  }
  if (!binfo) return true;
  // ⚠ TROIS RANGÉES VERS LE SUD, pas seulement la voisine. Une maison remonte de
  // 2,2 tuiles, mais une TOUR bien plus haut : basée trois rangs plus bas, son
  // sprite recouvre encore notre pavé. Latéralement, en revanche, rien à
  // chercher — une empreinte qui recouvre notre colonne occupe forcément une
  // cellule de notre colonne (les emprises sont rectangulaires).
  for (let d = 1; d <= 3; d += 1) {
    const b = binfo.get(gx * 10000 + (gy + d));
    if (!b) continue;
    if (b.baseY > wy && b.topY <= wy && wx >= b.x0 && wx <= b.x1) return false;
  }
  return true;
}

// Pixels d'un anneau ISO de demi-largeur rx (demi-hauteur = rx/2). `arcs` ne
// garde que les flancs gauche et droit — un anneau qui s'ouvre finit en deux
// virgules, pas en bulle de savon. Pur et exporté.
export function splashRingPixels(rx, arcs = false) {
  const ax = Math.max(1, Math.round(rx));
  // ⚠ ARRONDI VERS LE BAS. Un anneau de 3 px de rayon dont on ARRONDIT la
  // demi-hauteur mesure 7 × 5 px : rapport 1,4, l'œil y lit un rond. À ces
  // tailles le ±1 pixel pèse plus que le rapport visé — dans le doute, plus
  // PLAT, jamais plus rond.
  const ay = Math.max(1, Math.floor(ax / 2));
  const seen = new Set(), px = [];
  const n = Math.max(12, ax * 6);
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    if (arcs && Math.abs(c) < 0.42) continue;
    const x = Math.round(c * ax), y = Math.round(Math.sin(a) * ay);
    const k = x + ',' + y;
    if (seen.has(k)) continue;
    seen.add(k); px.push({ x, y });
  }
  return px;
}

// Disque iso PLEIN de demi-largeur rx : le pavé MOUILLÉ à l'intérieur de
// l'anneau. Même ellipse 2:1 que le tour, sinon la tache et l'anneau ne se
// superposent pas.
export function splashDiskPixels(rx) {
  const ax = Math.max(1, Math.round(rx));
  const ay = Math.max(1, Math.floor(ax / 2));
  const px = [];
  for (let y = -ay; y <= ay; y += 1) {
    for (let x = -ax; x <= ax; x += 1) {
      if ((x * x) / (ax * ax) + (y * y) / (ay * ay) <= 1) px.push({ x, y });
    }
  }
  return px;
}

// Opacité PROPRE de la tache, par image. Elle se multiplie par celle du
// contexte (~0,33 à l'instant du raccord), donc ce qui atteint le pavé vaut à
// peine un huitième : monter d'un cran ici ne se lit que d'un poil à l'écran,
// et c'est exactement le geste demandé (Raph, deux fois : la tache, puis « un
// poil plus foncé »). ⚠ MÊME VALEUR aux images 2 et 3 : c'est le raccord.
const WET_A = [0.6, 0.52, 0.4, 0.4];

// Une image d'éclat, en pixels centrés sur le POINT D'IMPACT (0,0). `c` désigne
// la couleur : 0 = l'eau qui gicle (clair), 1 = le sol MOUILLÉ (sombre).
// ⚠ LE SOMBRE EST POUSSÉ EN PREMIER : les pixels suivants écrasent les
// précédents dans l'étampe, et c'est l'anneau clair qui doit gagner sur le bord
// de la tache — l'inverse donnerait un anneau grignoté par endroits.
export function splashFramePixels(frame, unit) {
  const u = Math.max(4, unit);
  if (frame === 0) {
    // Le choc : un noyau ramassé, plus une pointe qui rejaillit. C'est la seule
    // image qui a de la matière claire au centre — les suivantes sont creuses.
    const w = Math.max(1, Math.round(u * 0.035));
    const px = splashDiskPixels(w).map((p) => ({ ...p, a: WET_A[0], c: 1 }));
    for (let x = -w; x <= w; x += 1) px.push({ x, y: 0, a: 1, c: 0 });
    px.push({ x: 0, y: -1, a: 0.7, c: 0 });
    return px;
  }
  if (frame === 1) {
    const rx = Math.max(2, Math.round(u * 0.09));
    const px = splashDiskPixels(rx).map((p) => ({ ...p, a: WET_A[1], c: 1 }));
    for (const p of splashRingPixels(rx)) px.push({ ...p, a: 1, c: 0 });
    // deux gouttelettes qui montent, de part et d'autre : c'est ce qui donne la
    // VERTICALE, sans laquelle l'anneau se lit comme une flaque et non un choc.
    const ry = Math.max(1, Math.round(rx / 2));
    px.push({ x: -rx, y: -ry - 2, a: 0.75, c: 0 }, { x: rx, y: -ry - 2, a: 0.75, c: 0 });
    return px;
  }
  // ⚠ L'ÉCHELLE EST LE PIÈGE. Premier jet à 0,28 tuile : 25 px de large sur une
  // tuile de 42, ça ne se lit plus comme un impact mais comme une FLAQUE. Un
  // éclat de pluie est petit — il est vu de loin, et c'est son nombre qui parle.
  // 0,19 tuile faisait un BOND : l'anneau doublait de largeur d'une image à
  // l'autre et l'éclat « poppait » au lieu de s'ouvrir. Un peu moins d'un tiers
  // de plus, ça se lit comme une onde.
  const rx = Math.max(3, Math.round(u * 0.15));
  // Image 3 : LA TACHE SEULE, quand l'eau est retombée. Même disque, même
  // opacité propre que sous l'anneau — c'est le fondu du contexte qui l'éteint,
  // sinon le raccord se verrait comme un saut (cf. splashPhase).
  if (frame >= 3) return splashDiskPixels(rx).map((p) => ({ ...p, a: WET_A[3], c: 1 }));
  const px = splashDiskPixels(rx).map((p) => ({ ...p, a: WET_A[2], c: 1 }));
  for (const p of splashRingPixels(rx, true)) px.push({ ...p, a: 0.55, c: 0 });
  return px;
}

// Quelle image montrer à `age` ms, et à quelle opacité de contexte. Rend null
// quand l'éclat est éteint. Pur et exporté : le RACCORD entre l'anneau et la
// tache seule est un saut d'opacité si on se trompe, et un saut de 0,55 à 0 sur
// une image, personne ne le voit passer en relisant le code.
export function splashPhase(age) {
  if (!(age >= 0) || age > SPLASH_LIFE + SPLASH_WET_TAIL) return null;
  if (age <= SPLASH_LIFE) {
    const u = age / SPLASH_LIFE;
    return { frame: u < 0.34 ? 0 : (u < 0.67 ? 1 : 2), k: 1 - u * 0.45 };
  }
  // La tache reprend EXACTEMENT l'opacité qu'avait l'éclat à sa dernière image
  // (1 − 0,45 = 0,55), puis s'éteint. C'est ce qui rend le raccord invisible.
  // ⚠ ELLE TIENT AVANT DE PARTIR (1 − v²). En fondu LINÉAIRE elle perd la moitié
  // de son encre à mi-traîne, et à cette opacité-là — un dixième une fois posée
  // sur le pavé — il ne reste rien à voir : on aurait allongé la durée sans rien
  // montrer de plus. La marche du fondu compte autant que sa longueur.
  const v = (age - SPLASH_LIFE) / SPLASH_WET_TAIL;
  return { frame: 3, k: 0.55 * (1 - v * v) };
}

// Étampes des images pour une taille de tuile donnée (le zoom change, l'éclat
// suit — un pixel d'art, jamais un pavé, comme les flocons).
const splashStamps = new Map();
function splashStamp(frame, unit) {
  const key = frame + ':' + unit;
  const hit = splashStamps.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  const px = splashFramePixels(frame, unit);
  let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
  for (const p of px) {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c2 = cv.getContext('2d');
  const img = c2.createImageData(w, h), d = img.data;
  for (const p of px) {
    const o = ((p.y - y0) * w + (p.x - x0)) * 4;
    const col = p.c === 1 ? SPLASH_WET : SPLASH_COL;
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2];
    d[o + 3] = Math.round((p.a ?? 1) * 255);
  }
  c2.putImageData(img, 0, 0);
  const out = { cv, ox: -x0, oy: -y0 };      // où tombe le point d'impact dans l'étampe
  if (splashStamps.size >= 24) splashStamps.clear();
  splashStamps.set(key, out);
  return out;
}

// Tire un point d'impact sur la voirie VISIBLE. Tirage-rejet en coordonnées
// ÉCRAN : chaque essai tombe forcément dans le cadre, alors qu'un tirage dans la
// boîte de cellules visibles gaspillerait la moitié des coups (le champ est un
// losange dans une boîte carrée).
function splashSpawn(now, essais, trees) {
  const road = CM.walkRoadSet;
  if (!road || !road.size) return null;
  const T = CM.TILE;
  for (let t = 0; t < essais; t += 1) {
    const w = screenToWorld(Math.random() * CM.cw, Math.random() * CM.ch);
    if (!splashPointOk(road, CM.buildingInfo, trees, w.x, w.y, T)) continue;
    return { wx: w.x, wy: w.y, born: now };
  }
  return null;
}

function drawIsoSplashes(now, r, g) {
  if (!SPLASH_TUNE.on || CM.lodActive) { splashes.length = 0; return; }
  const unit = CM.TILE * CM.cam.zoom;
  const k = CM.ambianceK ?? 1;
  if (k <= 0 || unit < SPLASH_TILE_MIN) { splashes.length = 0; return; }
  // Le plan a changé (achat, émondage) : la route sous un éclat a pu être rasée.
  const sig = String(CM.layoutRecomputeAt || 0);
  if (sig !== splashSig) { splashSig = sig; splashes.length = 0; }
  const cible = Math.min(SPLASH_CAP, Math.round(
    (CM.cw * CM.ch) / SPLASH_AREA * SPLASH_LIFE_RATIO * r * k * (1 + 0.5 * g) * SPLASH_TUNE.count));
  // Même marge que drawIsoLive : on veut la MÊME découpe en blocs que la passe
  // qui dessine réellement les arbres, sinon on en fait naître une troisième.
  const L = CM.layout;
  const trees = L ? isoTreeCells(L, visibleCellBounds(CM.TILE * CM.cam.zoom * ISO_X * 2)) : null;
  // Remplacer sur place plutôt que vider/remplir : la liste ne se réalloue pas,
  // et un éclat mort laisse sa place à un NOUVEAU point d'impact.
  const total = SPLASH_LIFE + SPLASH_WET_TAIL;
  for (let i = splashes.length - 1; i >= 0; i -= 1) {
    if (splashes.length > cible) { splashes.splice(i, 1); continue; }
    if (now - splashes[i].born <= total) continue;
    const s = splashSpawn(now, SPLASH_TRIES, trees);
    if (s) splashes[i] = s; else splashes.splice(i, 1);
  }
  for (let b = 0; b < SPLASH_BIRTHS && splashes.length < cible; b += 1) {
    const s = splashSpawn(now, SPLASH_TRIES, trees);
    if (!s) break;
    s.born = now - Math.random() * total;   // âges dispersés, sinon la volée éclate en chœur
    splashes.push(s);
  }
  const ctx = CM.ctx, prevA = ctx.globalAlpha, prevAA = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const taille = unit * SPLASH_TUNE.size;
  for (let i = 0; i < splashes.length; i += 1) {
    const s = splashes[i];
    const ph = splashPhase(now - s.born);
    if (!ph) continue;
    const st = splashStamp(ph.frame, Math.round(taille));
    if (!st) break;
    const p = worldToScreen(s.wx, s.wy);
    ctx.globalAlpha = Math.min(1, 0.6 * r * ph.k * SPLASH_TUNE.alpha);
    ctx.drawImage(st.cv, Math.round(p.x) - st.ox, Math.round(p.y) - st.oy);
  }
  ctx.globalAlpha = prevA;
  ctx.imageSmoothingEnabled = prevAA;
}

// ── NEIGE (hiver) ───────────────────────────────────────────────────────────
// Repeindre la pluie en blanc donne de la pluie blanche. Trois écarts, tous
// nécessaires pour que l'œil lise « neige » :
//   - un CARRÉ, pas un trait. Une goutte se lit à sa TRAÎNÉE, un flocon à sa
//     forme. Deux tailles, la grosse plus rapide et plus opaque : la profondeur
//     vient de ce parallaxe, pas d'un dégradé.
//   - dix fois plus LENT (≈ 100 px/s contre 900 à 1600). C'est la vitesse qui
//     dit « neige » avant même la couleur.
//   - il DÉRIVE : tangage propre au flocon EN PLUS du vent de l'averse. Sans
//     lui, mille carrés descendent en rails et on retombe sur la pluie.
// Le voile est PÂLE et non ardoise : la neige diffuse la lumière au lieu de
// l'éteindre. C'est la règle du liseré au sol (cf. SNOW plus haut), où tout ce
// qui ajoutait du SOMBRE a été refusé.
// AUCUNE ACCUMULATION au sol : le sol est baké et la saison entre dans sa clé
// (cf. seasonMode.js). Faire blanchir la ville pendant l'averse paierait une
// recuisson à chaque cran d'intensité. La neige posée reste le liseré d'hiver.
// Molette : __snowfall({ on, flakes, size, alpha }).
const SNOWFALL_TUNE = { on: true, flakes: 1, size: 1, alpha: 1 };
if (typeof window !== 'undefined') {
  window.__snowfall = (o) => { if (o) Object.assign(SNOWFALL_TUNE, o); return { ...SNOWFALL_TUNE }; };
}
// Calibré à l'écran (1208×611, TILE 32, zoom 1) : ~490 flocons de 3 px et 2 px.
// Les deux crans essayés à côté disent pourquoi c'est ce couple et pas un autre :
// à 140 flocons on ne voit RIEN sur une image fixe, et à 2 px / 1 px le rideau
// se lit comme de la poussière, plus comme de la neige.
const SNOWFALL_CAP = 900;
const SNOWFALL_AREA = 1500;       // px² d'écran par flocon à pleine averse
const SNOWFALL_UNIT = 0.10;       // taille du gros flocon, en fraction de tuile à l'écran
const SNOW_DRIFT = 0.42;          // dérive horizontale par pixel de chute, à plein vent

// Un flocon, position PURE : f(index, temps) → rien à faire vivre entre les
// frames, capture reproductible (même contrat que la pluie). Exporté pour le
// test : la lenteur de la chute et l'absence de colonne vide au bord au vent
// sont deux choses qu'aucune image ne montre.
export function isoSnowFlake(i, t, W, H, wind, unit) {
  // ⚠ QUATRE tirages, et le placement en X a le SIEN. La pluie dérive son x du
  // même hash que sa vitesse ; sur des traits qui traversent l'écran en 0,5 s
  // ça ne se voit pas, mais sur des flocons lents la corrélation x↔vitesse
  // dessine des diagonales creuses dans le rideau.
  const sd = _rnd(i, 1), sd2 = _rnd(i, 2), sd3 = _rnd(i, 3), sd4 = _rnd(i, 4);
  const near = sd3 > 0.62;                            // ~1 flocon sur 3 au premier plan
  const size = near ? Math.max(2, unit) : Math.max(1, Math.round(unit * 0.6));
  const speed = (near ? 118 : 74) + sd2 * 44;         // px/s, flocons de vitesses variées
  const y = _frac((t * speed) / (H * 1000) + sd) * (H + size * 2) - size;
  // Bande de chute en PARALLÉLOGRAMME : la dérive est comptée depuis le MILIEU
  // de l'écran, donc la densité reste la même en haut et en bas. Comptée depuis
  // le haut, tout le vent se payait en flocons hors cadre d'un côté.
  const drift = wind * SNOW_DRIFT;
  const margin = Math.abs(drift) * H * 0.5 + size + 4;
  const x0 = sd4 * (W + margin * 2) - margin;
  const sway = Math.sin(t / (1500 + sd * 1200) + sd2 * 6.283) * (size * 2.2 + 3);
  return { x: x0 + drift * (y - H * 0.5) + sway, y, size, near };
}

// La rafale traverse aussi l'hiver, mais elle s'y dit AUTREMENT : sur un rideau
// qui descend dix fois moins vite, ce qui se lit c'est la POUSSÉE LATÉRALE, pas
// la densité. La bourrasque de neige couche donc les flocons (gustWind) et
// épaissit le rideau par l'opacité — aucun second jeu de flocons, aucun
// changement de vitesse : accélérer la neige la ramènerait vers la pluie, ce que
// toute cette fonction s'emploie à éviter.
function drawIsoSnowfall(now, r, g = 0) {
  const ctx = CM.ctx, W = CM.cw, H = CM.ch;
  // Voile PÂLE : le ciel se couvre et la lumière se diffuse. Le voile ardoise de
  // l'averse donnait, sous la neige, une nuit sale en plein midi.
  ctx.fillStyle = `rgba(206,214,228,${(r * 0.14 * (1 + 0.2 * g)).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  // Comme l'averse, la neige est de l'agitation d'ambiance : elle suit le
  // réglage Vie de la carte.
  const k = CM.ambianceK ?? 1;
  if (!SNOWFALL_TUNE.on || k <= 0) return;
  const n = Math.min(SNOWFALL_CAP, Math.round((W * H) / SNOWFALL_AREA * r * k * SNOWFALL_TUNE.flakes));
  if (n <= 0) return;
  // Taille indexée sur la tuile à l'écran, comme les particules d'ambiance : au
  // dézoom le flocon reste un pixel d'art, il ne devient pas un pavé.
  const unit = Math.max(1, Math.round(CM.TILE * CM.cam.zoom * SNOWFALL_UNIT * SNOWFALL_TUNE.size));
  const wind = gustWind(g);
  const gk = 1 + 0.3 * g;                              // rideau plus dense à l'œil, sans flocon neuf
  const t = now || 0;
  const prevAA = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  // Lointain d'abord, premier plan ensuite : la profondeur se joue à l'ordre.
  // Les gros sont MIS DE CÔTÉ au passage plutôt que recalculés — deux fillStyle
  // pour toute la couche, et une seule évaluation par flocon.
  const near = [];
  ctx.fillStyle = `rgba(${SNOW_SHADE[0]},${SNOW_SHADE[1]},${SNOW_SHADE[2]},${(0.44 * r * gk * SNOWFALL_TUNE.alpha).toFixed(3)})`;
  for (let i = 0; i < n; i += 1) {
    const f = isoSnowFlake(i, t, W, H, wind, unit);
    if (f.near) { near.push(Math.round(f.x), Math.round(f.y), f.size); continue; }
    ctx.fillRect(Math.round(f.x), Math.round(f.y), f.size, f.size);
  }
  ctx.fillStyle = `rgba(${SNOW_TOP[0]},${SNOW_TOP[1]},${SNOW_TOP[2]},${(Math.min(1, 0.72 * r * gk) * SNOWFALL_TUNE.alpha).toFixed(3)})`;
  for (let j = 0; j < near.length; j += 3) ctx.fillRect(near[j], near[j + 1], near[j + 2], near[j + 2]);
  ctx.imageSmoothingEnabled = prevAA;
}

