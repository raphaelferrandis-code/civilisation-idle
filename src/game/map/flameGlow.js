import { CM } from './layout.js';
import { lightCtx } from './lightLayer.js';

/* ============================================================================
 * LUEUR DES FLAMMES — « chaque flamme doit émettre une lueur ».
 *
 * La carte savait déjà éclairer : lampadaires (LAMP_LIGHTS, isoRenderer),
 * lanternes de pont, torches d'émeutiers, halos des stades 1-3 des scènes
 * moteur. Ce qui n'éclairait PAS, c'étaient justement les feux les plus
 * soignés — les bandes animées PixelLab (forge, conteurs, culte des ancêtres,
 * tour de guet) et les braseros des merveilles : leur code de dessin `return`
 * avant tout halo. Une flamme qui n'éclaire rien ressemble à un autocollant.
 *
 * ⚠ LA LUMIÈRE EST DIFFÉRÉE, et c'est le cœur du fichier. Une flamme est peinte
 * pendant la passe des BÂTIMENTS ; le voile de nuit, lui, passe APRÈS. Un halo
 * posé sur place perdait donc plus de la moitié de son intensité — et virait au
 * bleu (le voile est un multiply « heure bleue ») : un feu qui refroidit quand
 * la nuit tombe, exactement l'inverse de ce qu'on veut. Les feux DÉPOSENT donc
 * leur lumière dans une file, et la passe de nuit la pose par-dessus le voile,
 * même doctrine que les lampadaires, les lanternes de pont et les reflets de
 * ville sur l'eau.
 *
 * Deux règles tenues aussi :
 *   - UNE seule recette pour tous les feux (même scintillement, même réponse
 *     jour/nuit) : sinon chaque site rebricole son dégradé et ils divergent ;
 *   - le halo est ADDITIF et PRÉ-CUIT : le Mausolée rang V porte 57 braseros,
 *     un createRadialGradient par flamme et par frame se paierait.
 *
 * Réglage live : window.__flameGlow({ on, gain, day, night, r }).
 * ========================================================================== */

// day  = part de lueur visible en PLEIN JOUR (un feu brûle même à midi, mais il
//        ne « rayonne » pas — sans ce plancher le halo n'existerait que la nuit).
// night= supplément atteint au cœur de la nuit (s'ajoute à day).
// r/gain = molettes globales de rayon et d'intensité.
// halo/haloA = NAPPE AMBIANTE nocturne (rayon ×, part de l'intensité du cœur) :
//        un lampadaire pose deux choses, un halo large à la tête ET une source
//        vive ; un feu qui n'aurait que sa source éclairerait sa propre flamme et
//        rien autour. La nappe est purement nocturne (de jour, le soleil la mange).
export const FLAME_GLOW = { on: true, gain: 1, day: 0.16, night: 0.30, r: 1, halo: 2.5, haloA: 0.42 };
if (typeof window !== 'undefined') {
  window.__flameGlow = (o) => { if (o) Object.assign(FLAME_GLOW, o); return { ...FLAME_GLOW }; };
}

// Teinte par défaut d'un feu (ambre chaud, accordée aux lampadaires antiques
// '255,186,84' et aux halos de stade existants).
export const FLAME_COL = '255,172,72';

// Le halo se TAIT pendant la passe de silhouette dorée du survol : celle-ci
// redessine la scène hors écran puis la remplit en source-in, si bien qu'un
// dégradé doux y deviendrait une auréole d'or autour du bâtiment au lieu d'un
// liseré net. C'est la seule passe où un feu ne doit pas éclairer.
let suspended = false;
export function suspendFlameGlow(on) { suspended = !!on; }

// Scintillement ∈ [~0.44 .. 1], déterministe (now ms + phase) : même somme de
// sinus déphasés que lampFlicker('fire') dans isoRenderer — les feux de la ville
// et ceux des scènes respirent alors au même rythme, et les captures restent
// reproductibles (aucun Math.random).
export function flameFlicker(now, phase) {
  const t = now || 0, ph = phase || 0;
  const a = 0.55 * Math.sin(t * 0.013 + ph) + 0.30 * Math.sin(t * 0.029 + ph * 1.7) + 0.15 * Math.sin(t * 0.047 + ph * 2.3);
  return 0.72 + 0.28 * a;
}

// Intensité de base d'un feu à cet instant du cycle jour/nuit (avant
// scintillement). mul = poids du site d'appel : 1 pour un foyer unique qui porte
// sa scène, moins pour une flamme parmi des dizaines (elles s'ADDITIONNENT).
export function flameGlowAlpha(mul) {
  if (!FLAME_GLOW.on || suspended) return 0;
  const night = (CM && CM.nightF) || 0;
  return (FLAME_GLOW.day + FLAME_GLOW.night * night) * FLAME_GLOW.gain * (mul == null ? 1 : mul);
}

// ── File des lueurs de la frame ─────────────────────────────────────────────
// Plafonnée : si un jour une passe oubliait de la vider, elle ne gonflerait pas
// indéfiniment (et le plafond reste loin des ~60 flammes du pire cas réel).
const MAX_QUEUE = 512;
const queue = [];

// Un feu annonce sa lumière : centre (x,y) et rayon r en px ÉCRAN, déjà projetés
// par l'appelant. Renvoie true si la lumière est retenue (les gardes coupent
// bien avant l'invisible → testable).
export function queueFlameGlow(x, y, r, col, now, phase, mul) {
  const R = r * FLAME_GLOW.r;
  const a = flameGlowAlpha(mul) * flameFlicker(now, phase);
  if (!(a > 0.004) || !(R > 0.5)) return false;
  if (queue.length >= MAX_QUEUE) return false;
  const c = col || FLAME_COL;
  // Nappe ambiante D'ABORD (elle passe sous le cœur, qui doit rester le point le
  // plus chaud), et seulement la nuit.
  const night = (CM && CM.nightF) || 0;
  const ha = a * FLAME_GLOW.haloA * night;
  const halo = ha > 0.004 ? { x, y, r: R * FLAME_GLOW.halo, col: c, a: Math.min(1, ha) } : null;
  const core = { x, y, r: R, col: c, a: Math.min(1, a) };
  // COUCHE DE LUMIÈRE ARMÉE (rendu iso) : on dépose la lueur SUR PLACE, à
  // l'instant du tri peintre où le feu est dessiné — c'est ce qui la fait
  // masquer par les bâtiments qui passent devant. La couche est blitée après le
  // voile de nuit, donc la doctrine « jamais de lumière avant le voile » tient
  // toujours. Sans couche (chemin legacy, tests), on retombe sur la file.
  const big = halo || core;
  const lc = lightCtx(big.x - big.r, big.y - big.r, big.x + big.r, big.y + big.r);
  if (lc) {
    if (halo) paintGlow(lc, halo);
    paintGlow(lc, core);
    return true;
  }
  if (halo && queue.length < MAX_QUEUE - 1) queue.push(halo);
  queue.push(core);
  return true;
}

// Vide la file en peignant tout en ADDITIF. À appeler dans la passe de nuit,
// APRÈS le voile — et AVANT ses retours anticipés (un feu brûle aussi de jour,
// et une file jamais vidée traînerait sa lumière d'une frame sur l'autre).
export function paintFlameGlows(ctx) {
  const n = queue.length;
  if (!n) return 0;
  if (!ctx) { queue.length = 0; return 0; }
  const prevOp = ctx.globalCompositeOperation, prevA = ctx.globalAlpha;
  const prevSm = ctx.imageSmoothingEnabled;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i += 1) paintGlow(ctx, queue[i]);
  ctx.globalAlpha = prevA;
  ctx.globalCompositeOperation = prevOp;
  ctx.imageSmoothingEnabled = prevSm;
  queue.length = 0;
  return n;
}

// Une lueur, en additif (le composite est posé par l'appelant). Partagé par la
// file et par le dépôt direct dans la couche de lumière : une seule recette.
function paintGlow(ctx, g) {
  const puff = glowPuff(g.col);
  if (puff) {
    ctx.imageSmoothingEnabled = true;          // un halo est LISSE, même sur du pixel-art
    ctx.globalAlpha = g.a;
    ctx.drawImage(puff, 0, 0, PUFF, PUFF, g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
    ctx.globalAlpha = 1;
  } else {
    // Repli sans canvas hors écran (Node/test, contexte exotique) : même
    // dégradé, recalculé à chaque appel.
    const rg = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
    rg.addColorStop(0, `rgba(${g.col},${g.a.toFixed(3)})`);
    rg.addColorStop(0.45, `rgba(${g.col},${(g.a * 0.34).toFixed(3)})`);
    rg.addColorStop(1, `rgba(${g.col},0)`);
    ctx.fillStyle = rg;
    ctx.fillRect(g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
  }
}

// Nombre de lueurs en attente (diagnostic/test — la file est privée).
export const pendingFlameGlows = () => queue.length;

// ── Halo pré-cuit ───────────────────────────────────────────────────────────
// Un disque de dégradé par teinte, dessiné UNE fois puis blité à la taille
// voulue. Le palier intermédiaire (0.45 → 0.34) creuse un cœur franc et une
// retombée douce : un dégradé linéaire pur fait un rond de brume trop égal.
const PUFF = 64;
const puffs = new Map();
function glowPuff(col) {
  if (puffs.has(col)) return puffs.get(col);
  let cv = null;
  try {
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = PUFF; c.height = PUFF;
      const g = c.getContext('2d');
      if (g) {
        const rg = g.createRadialGradient(PUFF / 2, PUFF / 2, 0, PUFF / 2, PUFF / 2, PUFF / 2);
        rg.addColorStop(0, `rgba(${col},1)`);
        rg.addColorStop(0.45, `rgba(${col},0.34)`);
        rg.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = rg;
        g.fillRect(0, 0, PUFF, PUFF);
        cv = c;
      }
    }
  } catch { cv = null; }
  puffs.set(col, cv);   // null mémorisé aussi : on ne retente pas à chaque frame
  return cv;
}

// ── Quels overlays de merveille sont des FEUX ? ─────────────────────────────
// Règle par la DONNÉE, pas par une liste de merveilles : un overlay éclaire s'il
// est peint avec un asset de flamme (flame-small/flame-large aujourd'hui, un
// éventuel flame-spiral demain). Les éclats de gemme, rayons et pulsations sont
// déjà de la lumière — leur ajouter un halo les empâterait. Un JSON peut trancher
// explicitement : "glow": false (jamais) ou "glow": "255,120,40" (teinte imposée).
export function flameAssetGlow(asset) {
  if (!asset) return null;
  if (asset.glow === false) return null;
  if (typeof asset.glow === 'string') return asset.glow;
  return /flame/i.test(asset.file || '') ? FLAME_COL : null;
}
