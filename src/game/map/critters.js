// ── BÉTAIL ET ANIMAUX DE RUE ────────────────────────────────────────────────
// Des bêtes POSÉES, pas des agents : elles n'ont ni cap, ni odomètre, ni cycle de
// marche. Le pack d'origine (LaserKiwi, cf. scripts/importPackAnimals.mjs) ne
// livre que des rotations fixes, et c'est très bien pour ce qu'on en fait — une
// vache broute, un chien dort au seuil. Leur seule variété est l'ORIENTATION,
// tirée par cellule sur les quatre diagonales.
//
// Elles vivent dans le tri du peintre comme les arbres : un item par bête, à SA
// profondeur, sinon un mouton se dessine par-dessus la maison devant laquelle il
// passe. Le placement, lui, est dans layout.js — c'est une donnée du plan de
// ville, pas une décision de rendu (et le rendu ne doit rien tirer au sort par
// frame, sous peine de troupeau clignotant).
//
// AUCUN IMPORT ICI, ET C'EST VOLONTAIRE. Ce module est lu par layout.js (qui pose
// les bêtes) ET par le rendu iso (qui les dessine) ; importer agents.js pour y
// prendre AGENT_SCALE fermerait le cycle layout → critters → agents → layout.
// L'échelle arrive donc en argument, depuis l'appelant qui l'a déjà sous la main.

// Hauteur de rendu en TUILES, avant AGENT_SCALE — même unité que les `scale`
// d'habitants et de bêtes de trait (le bœuf du jeu vaut 0,975). ⚠ Ces valeurs
// doivent rester en phase avec la table HERD de scripts/importPackAnimals.mjs :
// c'est elle qui décide de la taille de CUISSON, celle-ci de la taille de BOÎTE.
export const CRITTER_SIZES = { cow: 0.95, sheep: 0.66, goat: 0.64, dog: 0.55, cat: 0.42 };
export const CRITTER_DIAG = ['southeast', 'southwest', 'northwest', 'northeast'];
// Tirages de layout.js, déclarés ICI pour qu'une garde puisse vérifier que tout
// ce que le plan peut poser a bien un sprite. Répétitions volontaires : c'est la
// pondération (le mouton domine, la vache est rare, le chien plus fréquent que
// le chat).
export const CRITTER_HERD = ['sheep', 'sheep', 'goat', 'cow'];
export const CRITTER_PETS = ['dog', 'dog', 'cat'];
// Fraction de la frame où tombent les pattes (FOOT_FRAC de l'import) : c'est ce
// qui pose la bête AU SOL au lieu de la faire flotter au-dessus de son ombre.
const FOOT_FRAC = 0.94;

const cache = {};
export function ensureCritter(kind) {
  let c = cache[kind];
  if (c) return c;
  c = { img: {}, ready: 0, failed: 0 };
  cache[kind] = c;
  if (typeof Image !== 'undefined') for (const d of CRITTER_DIAG) {
    const im = new Image();
    im.onload = () => { c.ready += 1; };
    im.onerror = () => { c.failed += 1; };
    im.src = '/pixelart/agents/animals/critter-' + kind + '-' + d + '.png';
    c.img[d] = im;
  }
  return c;
}
export const critterReady = (c) => !!c && c.ready >= CRITTER_DIAG.length;

// Une bête, posée sur (x, yFeet) en pixels ÉCRAN. tilePx = CM.TILE × zoom,
// agentScale = AGENT_SCALE du moteur (liaison vive côté appelant : la molette
// __agentScale doit emporter le bétail avec les habitants).
export function drawCritterIso(ctx, x, yFeet, tilePx, cr, agentScale) {
  const c = ensureCritter(cr.kind);
  if (!critterReady(c)) return false;
  const img = c.img[CRITTER_DIAG[cr.dir & 3]];
  if (!img || !(img.naturalWidth > 0)) return false;
  const fh = img.naturalHeight || img.height;
  const h = tilePx * (CRITTER_SIZES[cr.kind] || 0.6) * agentScale, w = h;
  // ⛔ PAS D'ELLIPSE D'OMBRE (Raph 2026-08-05, retirée en même temps que celle des
  // véhicules) : le sprite porte déjà son ombre de contact, et une tache noire de
  // plus sous une bête de dix pixels se lit comme une salissure du sol.
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, fh, fh, Math.round(x - w / 2), Math.round(yFeet - h * FOOT_FRAC), w, h);
  ctx.imageSmoothingEnabled = prev;
  return true;
}
