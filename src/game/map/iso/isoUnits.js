// LES UNITÉS MOBILES — ce qui circule sur la carte, et OÙ ça se range au tri.
//
// Extraites d'isoRenderer.js le 2026-08-23 (Q10). Deux choses, qui n'en font qu'une :
//   · le DESSIN — véhicules 4 directions avec attelage et pousseur, émeutiers,
//     objets portés par les habitants ;
//   · la PROFONDEUR — la clé de tri qui les empêche de se faire avaler par une
//     emprise de bâtiment, la sonde qui la mesure, et le voile FANTÔME des unités
//     cachées.
// Le second existe POUR le premier : une unité qui circule est ponctuelle, et le
// tri scalaire `wx + wy` du peintre ne suffit pas face à un sprite multi-tuiles.
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Couture mesurée avant la coupe :
// ZÉRO dépendance entrante, six sortantes. Vérifiée ligne à ligne contre la
// version commitée.
//
// ⚠ AUCUN CYCLE : `agents.js` (d'où viennent les sprites d'habitants et de
// véhicules), `isoBridge` et `quaysAndRiot` ne remontent jamais vers le peintre —
// vérifié avant la coupe. `agents.js` cite bien `drawIsoVehicle`, mais en PROSE.
import { CM } from '../layout.js';
import { worldToScreen } from './projection.js';
import { drawRiotWeapon } from '../quaysAndRiot.js';
import { bridgeLiftWorld } from './isoBridge.js';
import {
  drawEraAgent, drawEraAgentIso, drawNamedAgent, drawNamedAgentIso, drawVehicleHeadlights,
  vehicleLaneOffset, ensureVeh, vehReady, VEH_SIZES, VEH_PULL, VEH_PUSH,
  ensureVehDiag, vehDiagReady, riotEraKey, AGENT_SCALE, VEH_SCALE,
} from '../agents.js';

// ── Véhicule en iso (Phase 1.5) : corps sprite 4-dirs + attelage/pousseur ────
// Réutilise les briques legacy (ensureVeh, VEH_PULL/PUSH, bandes de marche) mais
// TOUTES les positions passent par la projection : offsets de file/attelage
// calculés en MONDE puis projetés. Drones exclus (tri aérien, plus tard) ;
// vues encore cardinales — les diagonales arrivent avec l'art Phase 4.
const VEH_DIRS = ['east', 'west', 'south', 'north'];
// Corrections d'orientation PAR TYPE (audit visuel des rotations d'objets PixelLab,
// planches .preview-shots/<type>-4views.png, bug vu par Raph « profil d'ouest en
// est ») : le générateur INVERSE les deux vues SUD sur certains objets (voiture,
// char, caravane, tram). Tableau = fichier à afficher pour la dir MONDE 0..3
// (E,O,S,N → écran SE,NO,SO,NE). Le wagon est correct tel quel (default).
// L'entrée `cart` est partie avec le retrait des véhicules poussés à la main.
const VEH_DIAG_MAP = {
  default: ['southeast', 'northwest', 'southwest', 'northeast'],
  car: ['southwest', 'northwest', 'southeast', 'northeast'],
  chariot: ['southwest', 'northwest', 'southeast', 'northeast'],
  // caravan : labels devenus VRAIS après la régénération d'animation (le modèle
  // v3 a « redressé » l'orientation, re-audit veh-audit2.png 2026-07-11) → map
  // par défaut. ⚠ RE-AUDITER après toute régénération : les labels bougent.
  tram: ['southwest', 'northwest', 'southeast', 'northeast'],
};
// Pas de roue (fraction de tuile parcourue par frame de bande diagonale) : par défaut
// il SUIT VEH_SCALE (0.144 · 0.625 = 0.09, le réglage d'origine à taille pleine) — une
// roue rétrécie couvre moins de sol par tour, sinon elle glisse au lieu de rouler.
// __vehStride(x) impose une valeur fixe (unités finales), __vehStride(0) rend la main
// au suivi automatique. Même contrat que __strideLen pour le pas des piétons.
const vehStrideT = { v: null };
function vehStride() { return vehStrideT.v != null ? vehStrideT.v : 0.144 * VEH_SCALE; }
if (typeof window !== 'undefined') window.__vehStride = (x) => { vehStrideT.v = x > 0 ? x : null; return vehStride(); };

// Bête de trait (cheval/bœuf) en VUE DIAGONALE : bandes veh-{animal}-{diag}.png
// (objets 8-dir PixelLab animés « walking » 6 frames), frame par DISTANCE
// (v.rollDist, même odomètre que les roues). Renvoie false si les bandes ne
// sont pas prêtes → repli sur la bande cardinale legacy (drawNamedAgent).
const DRAFT_DIAG_MAP = { default: ['southeast', 'northwest', 'southwest', 'northeast'] };
function drawDraftIso(ctx, x, yFeet, z, animal, v) {
  const dchr = ensureVehDiag(animal);
  if (!vehDiagReady(dchr)) return false;
  const map = DRAFT_DIAG_MAP[animal] || DRAFT_DIAG_MAP.default;
  const img = dchr.img[map[v.dir]] || dchr.img[map[0]];
  if (!img || !(img.naturalWidth > 0)) return false;
  const fh = img.naturalHeight || 68;
  const nf = Math.max(1, Math.round((img.naturalWidth || fh) / fh));
  const fr = nf > 1 ? Math.floor((v.rollDist || 0) / (CM.TILE * vehStride())) % nf : 0;
  const s = CM.TILE * z;
  // Hauteur exprimée AVANT AGENT_SCALE, comme les `scale` d'agents (0.975·0.8 = 0.78
  // tuile, l'ancienne valeur en dur) : la bête de trait suit donc la taille des
  // habitants. Plus haut que le 0.72-0.74 legacy parce que l'objet a du vide autour.
  const dh2 = s * 0.975 * AGENT_SCALE, dw2 = dh2;
  ctx.drawImage(img, fr * fh, 0, fh, fh, x - dw2 / 2, yFeet - dh2 * 0.82, dw2, dh2);
  return true;
}

export function drawIsoVehicle(ctx, v, now, z) {
  const T = CM.TILE, s = T * z;
  const lo = vehicleLaneOffset(v, T);              // offset en px MONDE (s = TILE)
  const wx = v.x + lo.x, wy = v.y + lo.y;
  // Dos d'âne du pont sprite : attelages et porteurs montent avec le tablier —
  // l'altitude passe par l'AXE de la projection (2026-08-23), et non plus par une
  // retouche du y après coup.
  // ⚠ Le cull lit donc le point DESSINÉ et non son ombre au sol : plus juste, et sans
  // effet pratique (la marge fait deux tuiles, le dos d'âne moins d'une).
  const p = worldToScreen(wx, wy, bridgeLiftWorld(wx, wy));
  if (p.x < -s * 2 || p.y < -s * 2 || p.x > CM.cw + s * 2 || p.y > CM.ch + s * 2) return;
  if (v.type === 'basket') {                       // porteurs de panier (ères anciennes)
    // Le porteur marche sur une route, donc toujours en biais à l'écran : vue
    // DIAGONALE si sa bande est livrée (même contrat que les habitants d'ère,
    // animation par DISTANCE via l'odomètre v.rollDist), sinon repli cardinal.
    const nm = v.woman ? 'basket-woman' : 'basket-man';
    const walking = (v.pauseT || 0) <= 0;
    // 1.24 = compensation des bandes FLAT (ratio perso/canvas 0.50 vs 0.73 avant,
    // cf. tables AGENT_* d'agents.js) — diagonales ET cardinales régénérées 2026-08-03.
    if (!drawNamedAgentIso(ctx, p.x, p.y, z, nm, 1.24, v.dir, walking, now, v.x * 0.02, 1, v.rollDist != null ? v.rollDist : null)) {
      drawNamedAgent(ctx, p.x, p.y, z, nm, 1.24, v.dir, walking, now, v.x * 0.02);
    }
    return;
  }
  const size = VEH_SIZES[v.type];
  if (!size) return;                               // type sans sprite (broken_cart…) : rien en iso
  // VEH_SCALE (molette __vehScale) était ignoré ICI : la vue iso dessinait les
  // véhicules à leur taille d'art brute. Il est appliqué à la carrosserie ET aux
  // distances d'attelage plus bas, sinon l'équipage décroche de la carrosserie.
  const dh = s * size * VEH_SCALE, dw = dh;
  // VUE DIAGONALE si disponible (rotations d'objets PixelLab, direction-correcte,
  // multi-frames « rolling » quand la bande animée est livrée), sinon repli sur
  // la bande CARDINALE (animée mais orientée écran).
  let img = null, usedDiag = false;
  // Skin d'INSTANCE de la flotte moderne (veh-car-sedan-red-…) : tiré au spawn,
  // chargé paresseusement. Tant qu'il n'est pas arrivé — et il arrive une frame
  // ou deux après l'apparition du véhicule — on dessine la bande NUE du type
  // plutôt que rien : `car` a encore sa vieille automobile pour ça.
  let dchr = v.skin ? ensureVehDiag(v.type, v.skin) : null;
  let onSkin = vehDiagReady(dchr);
  if (!onSkin) dchr = ensureVehDiag(v.type);
  if (vehDiagReady(dchr)) {
    // ⚠ LA CORRECTION D'ÉTIQUETAGE SUIT LA BANDE, PAS LE TYPE. VEH_DIAG_MAP
    // rattrape une inversion sud↔sud des rotations PixelLab ; les bandes du pack
    // MinZinn, elles, sont nommées juste. Appliquer la correction `car` à un skin
    // ferait rouler les berlines de travers — et seulement dans deux directions
    // sur quatre, le genre de bug qu'on ne voit qu'en suivant une voiture.
    const map = (onSkin ? VEH_DIAG_MAP.default : VEH_DIAG_MAP[v.type]) || VEH_DIAG_MAP.default;
    img = dchr.img[map[v.dir]] || dchr.img[map[0]];
    usedDiag = true;
  } else {
    const chr = ensureVeh(v.type);
    if (!vehReady(chr)) return;
    // Vues poussées : timon vers l'arrière (échange sud↔nord, comme le legacy).
    const sdir = VEH_PUSH[v.type] ? ['east', 'west', 'north', 'south'][v.dir] : VEH_DIRS[v.dir];
    img = chr.img[sdir] || chr.img.south;
  }
  const fh = img.naturalHeight || img.height || 64;
  const nf = Math.max(1, Math.round((img.naturalWidth || img.width || fh) / fh));
  // Diagonales : frame par DISTANCE parcourue (odomètre v.rollDist — anti-
  // patinage, molette __vehStride en fraction de tuile/frame). Cardinales :
  // cadence temporelle legacy inchangée.
  const fr = nf <= 1 ? 0
    : usedDiag ? Math.floor((v.rollDist || 0) / (T * vehStride())) % nf
      : Math.floor((now || 0) / 130 + v.x * 0.1) % nf;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const drawBody = () => {
    // ⛔ PAS D'ELLIPSE D'OMBRE SOUS UN VÉHICULE (Raph 2026-08-05) : les sprites
    // portent leur propre ombre de contact, la tache du moteur faisait doublon.
    // Cf. le même retrait dans drawOneVehicle (chemin legacy).
    ctx.drawImage(img, fr * fh, 0, fh, fh, p.x - dw / 2, p.y - dh / 2, dw, dh);
  };
  // Attelage : bête(s) de trait DEVANT dans le sens de marche (monde → projeté).
  const pull = VEH_PULL[v.type];
  let drawTeam = null, teamBelow = false;
  if (pull) {
    const D = (pull.dist || 0.44) * T * VEH_SCALE;
    const front = [[D, 0], [-D, 0], [0, D], [0, -D]][v.dir] || [0, 0];
    const ap = worldToScreen(wx + front[0], wy + front[1], bridgeLiftWorld(wx + front[0], wy + front[1]));
    // Dos d'âne : la BÊTE monte aussi, et à SA position — sur la rampe elle
    // précède la carrosserie donc elle est déjà plus haut. Sans ça l'attelage
    // restait au niveau du sol et traversait le tablier (retour Raph : « les
    // animaux ne montent pas dessus »).
    teamBelow = ap.y > p.y;
    drawTeam = () => {
      ctx.strokeStyle = 'rgba(38,26,15,0.72)';
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + (ap.x - p.x) * 0.82, p.y + (ap.y - p.y) * 0.82);
      ctx.stroke();
      // Bête en VUE DIAGONALE (retour Raph : cheval de profil ouest→est) si les
      // bandes sont livrées, sinon bande cardinale legacy.
      if (!drawDraftIso(ctx, ap.x, ap.y + dh * 0.24, z, pull.animal, v)) {
        drawNamedAgent(ctx, ap.x, ap.y + dh * 0.24, z, pull.animal, pull.scale || 0.72, v.dir, true, now, v.x * 0.12);
      }
    };
  }
  // Pousseur : humain de l'ère DERRIÈRE (charrette/brouette).
  let drawPusher = null, pusherBelow = false;
  if (VEH_PUSH[v.type]) {
    const D = 0.34 * T * VEH_SCALE;
    const back = [[-D, 0], [D, 0], [0, -D], [0, D]][v.dir] || [0, 0];
    // idem attelage : le pousseur monte à SA position, par l'axe.
    const pp = worldToScreen(wx + back[0], wy + back[1], bridgeLiftWorld(wx + back[0], wy + back[1]));
    pusherBelow = pp.y > p.y;
    drawPusher = () => {
      // Vue diagonale du pousseur (nouvelle DA) si dispo, sinon bande cardinale.
      if (!drawEraAgentIso(ctx, pp.x, pp.y + dh * 0.24, z, v.dir, true, now, v.x * 0.1, 0)) {
        drawEraAgent(ctx, pp.x, pp.y + dh * 0.24, z, v.dir, true, now, v.x * 0.1, 0);
      }
    };
  }
  // Ordre nord → sud (peintre local de la petite scène).
  if (drawTeam && !teamBelow) drawTeam();
  if (drawPusher && !pusherBelow) drawPusher();
  drawBody();
  if (drawTeam && teamBelow) drawTeam();
  if (drawPusher && pusherBelow) drawPusher();
  // Phares (voiture/tram, nuit, ère motorisée) : fonction PARTAGÉE re-projetée
  // (agents.js) — dessinés À LA PROFONDEUR du véhicule, dans son item peintre,
  // comme le legacy (sinon ils brilleraient par-dessus les murs).
  drawVehicleHeadlights(ctx, v);
  ctx.imageSmoothingEnabled = prev;
}

// ── Émeutier en ISO ──────────────────────────────────────────────────────────
// Même recette que le rendu legacy (sprite d'ère + arme bakée, halo de torche
// la nuit, repli silhouette vectorielle) mais positionné par worldToScreen et
// trié au PEINTRE — l'appelant pousse UN item 'riot' par émeutier, clé
// isoUnitDepth aux pieds, offsets de file compris. Vues encore CARDINALES :
// repli assumé du plan (« émeutiers : PLUS TARD ») tant que le batch des
// diagonales est en pause.
export function drawIsoRioter(ctx, p, now, z) {
  const laneX = (p.dir === 2 || p.dir === 3) ? (p.lane || 0) : 0;
  const laneY = (p.dir === 0 || p.dir === 1) ? (p.lane || 0) : 0;
  // Dos d'âne du pont sprite : l'émeute aussi passe par-dessus, pas au travers.
  const sp = worldToScreen(p.x + laneX, p.y + laneY, bridgeLiftWorld(p.x + laneX, p.y + laneY));
  const wob = Math.sin(now / 170 + (p.phase || 0)) * 0.8;
  const sx = sp.x, groundY = sp.y + wob * z;
  if (sx < -24 || groundY < -24 || sx > CM.cw + 24 || groundY > CM.ch + 24) return;
  const ph = Math.max(1.5, 2.1 * z);
  const walking = p.pauseT <= 0;
  // Ombre posée au SOL STABLE (sp.y, sans le wobble) : elle ne saute pas avec le
  // corps — seul le sprite bondit dessus (le duo qui bobbait ensemble « volait »).
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(sx, sp.y, ph * 0.85, ph * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  const rgen = ((p.charType || 0) === 1 ? 'woman' : 'man') + '-' + (p.weapon === 'fork' ? 'fork' : 'torch');
  const rEra = riotEraKey((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) || 0);
  // BANDES DIAGONALES (DA « Figurine d'époque », batch riotIsoRoster) d'abord :
  // ère puis base médiévale ; repli CARDINAL legacy tant qu'une bande manque.
  // Anim par DISTANCE (p.walkDist, posé par updateCrisis) — anti-patinage.
  const wd = p.walkDist != null ? p.walkDist : null;
  // groundFeet=true : les PIEDS MESURÉS de la bande touchent groundY — l'ombre
  // (ci-dessus) est posée à ce même point ; sans ça, la marge transparente du
  // roster (~12 % du cadre) suspendait l'émeutier au-dessus de son ombre.
  let dim = drawNamedAgentIso(ctx, sx, groundY, z, 'rioter-' + rEra + rgen, 0.85, p.dir, walking, now, p.phase, 1, wd, true)
    || (rEra ? drawNamedAgentIso(ctx, sx, groundY, z, 'rioter-' + rgen, 0.85, p.dir, walking, now, p.phase, 1, wd, true) : false);
  if (!dim) dim = drawNamedAgent(ctx, sx, groundY, z, 'rioter-' + rEra + rgen, 0.85, p.dir, walking, now, p.phase);
  if (!dim && rEra) dim = drawNamedAgent(ctx, sx, groundY, z, 'rioter-' + rgen, 0.85, p.dir, walking, now, p.phase);
  if (dim) {
    // Flamme bakée ; halo chaud additif de NUIT sur les torches (cf. legacy).
    if (p.weapon !== 'fork' && (CM.nightF || 0) > 0.05) {
      const flick = 0.8 + 0.2 * Math.sin(now / 90 + (p.phase || 0) * 5);
      const gx2 = sx + dim.drawW * 0.18, gy2 = dim.top + dim.drawH * 0.16, gr = Math.max(1, dim.drawW * 0.5 * flick);
      const prevOp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      const g2 = ctx.createRadialGradient(gx2, gy2, 0, gx2, gy2, gr);
      g2.addColorStop(0, `rgba(255,120,40,${(0.2 * (CM.nightF || 0) * flick).toFixed(2)})`);
      g2.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(gx2, gy2, gr, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = prevOp;
    }
    return;
  }
  // Repli vectoriel (sprites pas encore décodés) : silhouette du legacy dont le
  // centre de corps est recalé pour poser les pieds sur groundY.
  const syB = groundY - ph * 1.35;
  if (ph > 2 && walking) {
    const step = Math.sin(now / 110 + (p.phase || 0) * 3) * ph * 0.45;
    ctx.strokeStyle = '#241a10';
    ctx.lineWidth = Math.max(1, ph * 0.28);
    ctx.beginPath(); ctx.moveTo(sx - ph * 0.12, syB + ph * 0.35); ctx.lineTo(sx - ph * 0.15 + step * 0.5, syB + ph * 1.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + ph * 0.12, syB + ph * 0.35); ctx.lineTo(sx + ph * 0.15 - step * 0.5, syB + ph * 1.3); ctx.stroke();
  }
  ctx.fillStyle = p.col || '#9a4d38';
  ctx.beginPath();
  ctx.moveTo(sx - ph * 0.62, syB - ph * 0.45);
  ctx.quadraticCurveTo(sx - ph * 0.5, syB + ph * 0.65, sx - ph * 0.3, syB + ph * 0.62);
  ctx.lineTo(sx + ph * 0.3, syB + ph * 0.62);
  ctx.quadraticCurveTo(sx + ph * 0.5, syB + ph * 0.65, sx + ph * 0.62, syB - ph * 0.45);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(sx - ph * 0.5, syB - ph * 0.45, ph, Math.max(0.5, ph * 0.2));
  ctx.fillStyle = p.skin || '#e0b890';
  ctx.beginPath(); ctx.arc(sx, syB - ph * 0.85, ph * 0.5, 0, Math.PI * 2); ctx.fill();
  if (ph > 1.8) drawRiotWeapon(ctx, sx + ph * 0.55, syB - ph * 0.2, ph, p.weapon, now, p.phase, 0.5 + 0.5 * Math.sin(now / 320));
}


// ── PROFONDEUR DES UNITÉS (habitants / véhicules / émeutiers) ────────────────
// Le tri scalaire wx+wy du peintre suffit entre objets PONCTUELS, mais face à
// une emprise multi-tuiles (clé au COIN SUD, sprite large de 0.78·(sx+sy))
// il AVALE les unités qui longent les faces sud/est : leur somme est plus
// petite que la clé du bâtiment alors qu'elles sont DEVANT son mur (retour
// Raph « pas de cohérence de profondeur », 2026-07-13). Transposition iso des
// fiches frontByPainter du legacy (Phase 2 du plan : « baseY → baseDepth »),
// même recette que la clé précalculée des lampadaires (computeIsoLamps) mais
// appliquée en DYNAMIQUE, aux pieds de chaque unité :
//   - unité au SUD de la base (wy ≥ y1) ou à l'EST du bord (wx ≥ x1), colonne
//     du rect sprite recouverte → clé REMONTÉE juste au-dessus de celle du
//     bâtiment (elle passe devant le mur au lieu d'être mangée) ;
//   - unité DERRIÈRE (nord-ouest, colonne recouverte) → remontée PLAFONNÉE
//     sous la clé de cet occulteur (jamais posée sur son toit — même arbitrage
//     que la passe 1 du peintre legacy : l'occulteur gagne).
// Fiches par cellule (Map partagée par emprise) reconstruites au recompute ;
// empreintes À PLAT (champs, triées au coin nord — jamais occultantes) et POINTS
// D'EAU exclus. Ces derniers restent dehors non par héritage de l'aqueduc mais
// parce qu'un puits est un PROP, pas un bâtiment : le calcul de fiche suppose une
// façade qui occulte, or aucun prop de place (banc, fontaine) n'y figure non plus.
// Molette : window.__isoUnitDepth(false) = retour au tri scalaire brut.
const isoUnitDepthFlag = { on: true };
if (typeof window !== 'undefined') window.__isoUnitDepth = (on) => { isoUnitDepthFlag.on = on !== false; return isoUnitDepthFlag.on; };

// ── SONDE Q9 / P23 (docs/PLAN-SUPPRESSION-LEGACY.md) ────────────────────────
// isoUnitDepth ne lit AUCUNE hauteur de bâtiment — les fiches ne portent que
// key/ax/halfW/x1/y1 — là où le legacy pesait `topY` : une hutte trop basse pour
// recouvrir la rue n'occultait pas (ysortPainter.test.js:56). Comme `cap` est un
// MINIMUM GLOBAL, on a soupçonné qu'un bâtiment bas puisse annuler un `lift`
// légitime, l'unité retombant sous la clé d'une façade qui, ELLE, la recouvre.
//
// ⚠ MESURÉ LE 2026-08-22 : LA HAUTEUR N'Y EST POUR RIEN — NE PAS REJOUER CE
// SOUPÇON. En jeu, 2 312 évaluations à l'ère 23 et 852 à l'ère 161, 557 et 183
// conflits lift+cap, `suppressed` = 0 partout. La hauteur d'un occulteur n'entre
// jamais dans le verdict, et son absence ne coûte rien au tri.
//
// ⚠⚠ EN REVANCHE un plafond PEUT écraser une remontée, pour une raison qui n'a
// rien à voir : quand le lifteur et le plafonneur ont EXACTEMENT LA MÊME CLÉ,
// lift = clé + T·0.02 et cap = clé − T·0.02 → le plafond gagne de 2·epsilon et
// l'unité bascule de « juste après les deux » à « juste avant les deux » : elle
// se fait avaler par le mur qu'elle longeait. C'est un départage d'ÉGALITÉ.
// Mesuré : 2 cas sur 19 557 géométries légales (0,01 %), tous à clé égale, tous
// d'exactement 2·epsilon, et 0 occurrence en jeu. Frontière figée par
// isoUnitDepth.test.js (« un plafond ne coûte qu'un départage d'égalité »).
//
// ⚠⚠ DEUX PIÈGES DE MESURE, chèrement payés. (1) Une force brute sur emprises
// doit REJETER LES CHEVAUCHEMENTS : sans ça, 382 faux positifs sur 400 000, et
// la géométrie testée n'est même pas la bonne (dans isoUnitFiches la seconde
// fiche écrase la première dans la Map). (2) Un tirage ALÉATOIRE à position
// continue RATE le vrai cas — 866 418 tirages, zéro trouvaille — parce que la
// remontée ne se déclenche qu'en longeant une face, bande étroite que le hasard
// visite peu. C'est une grille régulière calée près des faces qui l'a levé.
//
// CE QUE LA MESURE A TROUVÉ À LA PLACE : `cap` lève `hidden` pour 86-87 % des
// unités (2 eres mesurées, foule normale) et la passe FANTÔME redessine sans
// vérifier — voir son bloc plus bas. L'aveuglement à la hauteur ne casse donc
// pas le tri, il fait REDESSINER en transparence ~6 unités sur 7 à chaque frame.
// C'est un sujet de coût/rendu, pas de profondeur. Chantier distinct.
//
// La sonde reste : elle re-tranche en une frame si la géométrie des fiches change.
//   __depthProbe(true)  arme et remet à zéro     __depthProbe(false)  éteint
//   window.__depthProbeLast  porte le relevé
// Coût nul éteinte : un seul booléen de module lu par appel (même idiome que
// isoUnitDepthFlag juste au-dessus, et que __layoutProfile dans layout.js).
const depthProbe = { on: false, out: null };
function depthProbeReset() {
  depthProbe.out = {
    units: 0,        // appels comptés
    lift: 0,         // une remontée a été calculée
    cap: 0,          // un plafond existe (= `hidden` = passe fantôme)
    conflict: 0,     // les deux à la fois
    suppressed: 0,   // LE CAS P23 : le plafond a ÉCRASÉ la remontée
    ghostLifted: 0,  // remontée gagnante mais unité quand même marquée fantôme
    cappers: {},     // qui plafonne, dans les cas `suppressed` : id -> compte
    samples: [],     // 8 premiers cas `suppressed`, pour l'œil
  };
  if (typeof window !== 'undefined') window.__depthProbeLast = depthProbe.out;
  return depthProbe.out;
}
if (typeof window !== 'undefined') {
  window.__depthProbe = (on) => {
    depthProbe.on = on !== false;
    if (depthProbe.on) depthProbeReset();
    return depthProbe.on;
  };
}
let _unitFiches = null, _unitFichesAt = '';
function isoUnitFiches() {
  const L = CM.layout;
  if (!L) return null;
  // Mémo re-clée aussi sur la RÉVÉLATION per-achat : une maison-moteur masquée
  // n'est pas dessinée → elle ne doit ni remonter ni plafonner une unité.
  const memoKey = CM.layoutRecomputeAt + ':' + (CM.engineHomeReveal || 0);
  if (_unitFiches && _unitFichesAt === memoKey) return _unitFiches;
  const T = CM.TILE;
  const m = new Map();
  for (const t of L.tiles) {
    const idf = t.buildingId || t.variant || '';
    if (/field|farm|crop|orchard|aqueduct/i.test(idf)) continue;   // à plat (champs) / prop (point d'eau)
    if (t.type === 'enginehome' && (t.revealIdx || 0) >= (CM.engineHomeReveal || 0)) continue; // pas encore achetée
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    const x1 = (t.gx + sx) * T, y1 = (t.gy + sy) * T;
    const rec = {
      key: x1 + y1,                                  // clé peintre du bâtiment (coin sud)
      ax: x1 - y1,                                   // écran-X du coin sud (px monde)
      halfW: (sx + sy) * T * 0.39 + T * 0.45,        // demi-rect sprite (0.78/2) + demi-unité
      x1, y1,
      id: idf, sx, sy,                               // identité : lue par la SONDE Q9 seulement
    };
    for (let ay = 0; ay < sy; ay += 1) for (let ax2 = 0; ax2 < sx; ax2 += 1) m.set((t.gx + ax2) * 10000 + (t.gy + ay), rec);
  }
  _unitFiches = m; _unitFichesAt = memoKey;
  return m;
}
// Clé peintre d'une unité au sol dont les PIEDS (contact sol visuel) sont en (wx, wy).
// isoUnitDepthEx renvoie AUSSI `hidden` : vrai quand un occulteur franc au sud plafonne
// l'unité (elle sera dessinée AVANT lui, donc recouverte par son sprite s'il est assez
// haut) — c'est le signal de la passe SILHOUETTE FANTÔME. Objet de sortie PARTAGÉ
// (zéro alloc, ~600 appels/frame) : à consommer immédiatement, ne pas retenir.
const _depthOut = { d: 0, hidden: false };
export function isoUnitDepthEx(wx, wy) {
  const d = wx + wy;
  _depthOut.d = d; _depthOut.hidden = false;
  if (!isoUnitDepthFlag.on) return _depthOut;
  const F = isoUnitFiches();
  if (!F) return _depthOut;
  const T = CM.TILE, gx = Math.floor(wx / T), gy = Math.floor(wy / T);
  const sxScr = wx - wy;                             // colonne écran (px monde)
  let lift = d, cap = Infinity, capB = null;
  // Voisinage cy−1..cy+2 (comme frontByPainter) : la rangée +2 porte les
  // occulteurs francs du sud dont la clé doit PLAFONNER la remontée. Une fiche
  // partagée revue par plusieurs cellules est re-testée telle quelle (max/min
  // idempotents — pas de dédup, 12 lectures par unité restent négligeables).
  for (let cy = gy - 1; cy <= gy + 2; cy += 1) {
    for (let cx = gx - 1; cx <= gx + 1; cx += 1) {
      const b = F.get(cx * 10000 + cy);
      if (!b) continue;
      if (Math.abs(sxScr - b.ax) > b.halfW) continue;   // pas de recouvrement de colonne
      if (d >= b.key) continue;                      // déjà dessinée après lui
      if (wy >= b.y1 - T * 0.02 || wx >= b.x1 - T * 0.02) {
        if (b.key + T * 0.02 > lift) lift = b.key + T * 0.02;   // devant : passe au-dessus du mur
      } else if (b.key - T * 0.02 < cap) {
        cap = b.key - T * 0.02;                      // derrière : jamais par-dessus son toit
        if (depthProbe.on) capB = b;                 // sonde Q9 : qui plafonne
      }
    }
  }
  const out = lift < cap ? lift : cap;
  _depthOut.d = out > d ? out : d;
  _depthOut.hidden = cap < Infinity;
  if (depthProbe.on) {
    const P = depthProbe.out, hasLift = lift > d, hasCap = cap < Infinity;
    P.units += 1;
    if (hasLift) P.lift += 1;
    if (hasCap) P.cap += 1;
    if (hasLift && hasCap) {
      P.conflict += 1;
      if (cap < lift) {
        P.suppressed += 1;
        const id = (capB && capB.id) || '?';
        P.cappers[id] = (P.cappers[id] || 0) + 1;
        if (P.samples.length < 8) {
          P.samples.push({
            id, span: capB ? capB.sx + 'x' + capB.sy : '?',
            gx: Math.round(wx / T * 10) / 10, gy: Math.round(wy / T * 10) / 10,
            perte: Math.round((lift - cap) / T * 100) / 100,   // en tuiles de clé peintre
          });
        }
      } else P.ghostLifted += 1;
    }
  }
  return _depthOut;
}
export function isoUnitDepth(wx, wy) {
  return isoUnitDepthEx(wx, wy).d;
}

// Dessin d'UN habitant du tri peintre (partagé entre la passe normale et la passe
// silhouette fantôme — même rendu, seul globalAlpha diffère).
export function drawIsoCitizenItem(ctx, p, now, z) {
  // Dos d'âne du pont sprite : le piéton suit le tablier (rampes + plateau) —
  // l'altitude passe par l'AXE de la projection, et non plus par une retouche du y.
  const sp = worldToScreen(p.x + (p.lox || 0), p.y + (p.loy || 0),
    bridgeLiftWorld(p.x + (p.lox || 0), p.y + (p.loy || 0)));
  const walking = (p.pauseT || 0) <= 0;
  // Vue DIAGONALE (Phase 4) si la bande existe, sinon bande cardinale.
  // p.walkDist = odomètre → animation par DISTANCE (anti-patinage).
  if (!drawEraAgentIso(ctx, sp.x, sp.y, z, p.dir, walking, now, p.phase || 0, p.charType || 0, 1, p.walkDist != null ? p.walkDist : null)) {
    drawEraAgent(ctx, sp.x, sp.y, z, p.dir, walking, now, p.phase || 0, p.charType || 0);
  }
}

// Silhouettes fantômes : réglage live. __ghost({ on: false }) coupe, __ghost({ alpha: 0.5 })
// renforce. L'alpha par défaut est volontairement discret — on devine, on ne lit pas.
// ⚠ `cover`/`wK`/`hK` posés le 2026-08-23 avec le test de couverture exact (Q11).
// `cover` = fraction de la silhouette qu'une façade doit recouvrir pour qu'on
// redessine ; `wK`/`hK` = la silhouette elle-même, en fractions de tuile (elle suit
// l'échelle des habitants, cf. sceneHumanH).
//
// ALPHA : 0,34 → 0,58 → **0,70**, choix de Raph le 2026-08-23. Le réglage discret
// d'origine compensait le fait que la plupart des fantômes se posaient sur des unités
// que rien ne cachait ; une fois le marquage exact, ils peuvent se lire. À 0,70 la
// silhouette se voit franchement à travers la façade — c'est passé de « on devine »
// à « on voit », et c'est assumé.
// ⚠ Contrepartie signalée avant le choix : plus l'alpha monte, plus les faux positifs
// du test de couverture se voient. Ils viennent de ce que la boîte d'encre est un
// RECTANGLE autour d'une silhouette isométrique (coins vides) — cf. le § du test dans
// isoLivePaint. Si un jour ça se remarque en jeu, c'est ce test-là qu'il faut affiner,
// pas l'alpha qu'il faut redescendre.
export const GHOST_TUNE = { on: true, alpha: 0.7, cover: 0.35, wK: 0.34, hK: 0.68 };
if (typeof window !== 'undefined') {
  window.__ghost = (o) => { if (o) Object.assign(GHOST_TUNE, o); return { ...GHOST_TUNE }; };
}

