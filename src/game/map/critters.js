// ── BÉTAIL ET ANIMAUX DE RUE ────────────────────────────────────────────────
// Des bêtes POSÉES, pas des agents : elles n'ont ni cap, ni odomètre, ni cycle de
// marche. Le pack d'origine (LaserKiwi, retiré : voir plus bas) ne livrait que
// des rotations fixes, et c'est très bien pour ce qu'on en fait — une
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
//
// ⛔ PACK LASERKIWI RETIRÉ LE 2026-10-05 (audit STEAM-1, décision de Raph) : il n'a
// jamais publié de licence, et on ne vend pas un asset sans licence. Ses 20
// critter-*.png et scripts/importPackAnimals.mjs sont partis.
// ✅ BÊTES MAISON depuis le 2026-10-05 (planches/animaux-maison, validées par Raph) :
// vache, mouton, chèvre, chien et chat faits avec PixelLab, objets 8 directions
// « low top-down » (la chaîne du bœuf des attelages), 4 diagonales chacune, posées
// 1:1 dans un cadre carré, pattes sur 0,94 du cadre (FOOT_FRAC). Mêmes noms de
// fichiers que le pack : le contrat de placement et de blit n'a pas bougé.
// Éteint (false), layout.js ne pose aucune bête, ensureCritter ne demande aucun
// fichier et drawCritterIso rend false (packSprites.test.js vérifie les deux sens).
export const CRITTERS_ON = true;

// Hauteur de rendu en TUILES, avant AGENT_SCALE — même unité que les `scale`
// d'habitants et de bêtes de trait (le bœuf du jeu vaut 0,975). Le cadre de chaque
// bête maison a été choisi pour cette taille de BOÎTE (manifeste de la planche).
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
  if (CRITTERS_ON && typeof Image !== 'undefined') for (const d of CRITTER_DIAG) {
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
// __agentScale doit emporter le bétail avec les habitants). dpr = CM.dpr, pour
// rabattre le blit sur la grille DEVICE comme blitSnap.js le fait ailleurs —
// ce module n'importe rien, donc l'arrondi est réécrit ici, à l'identique.
export function drawCritterIso(ctx, x, yFeet, tilePx, cr, agentScale, dpr = 1) {
  const c = ensureCritter(cr.kind);
  if (!critterReady(c)) return false;
  const img = c.img[CRITTER_DIAG[cr.dir & 3]];
  if (!img || !(img.naturalWidth > 0)) return false;
  const fh = img.naturalHeight || img.height;
  const d = dpr || 1, snap = (v) => Math.round(v * d) / d;
  const h = Math.max(1, snap(tilePx * (CRITTER_SIZES[cr.kind] || 0.6) * agentScale)), w = h;
  // ⛔ PAS D'ELLIPSE D'OMBRE (Raph 2026-08-05, retirée en même temps que celle des
  // véhicules) : le sprite porte déjà son ombre de contact, et une tache noire de
  // plus sous une bête de dix pixels se lit comme une salissure du sol.
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, fh, fh, snap(x - w / 2), snap(yFeet - h * FOOT_FRAC), w, h);
  ctx.imageSmoothingEnabled = prev;
  // Renvoie la MESURE du blit (planche source, boîte écran) au lieu d'un simple
  // `true` — un objet reste vrai, donc les appelants en `if (!drawCritterIso…)`
  // ne changent pas de comportement. C'est la sonde G0 (docs/PLAN-GRILLE-PIXELS)
  // qui la consomme, chez l'appelant : ce module n'a AUCUN IMPORT et doit le
  // rester (cf. l'en-tête — importer pixelGrid.js, qui lit layout.js, rouvrirait
  // le cycle layout → critters → layout que cette règle existe pour interdire).
  return { src: fh, box: h };
}
