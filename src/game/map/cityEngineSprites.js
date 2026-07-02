/* ============================================================================
 * Sprites de bâtiments COSMIQUES (ères 35+, bands 7–9) — passe « Tier 1 ».
 * Un langage visuel par époque, fortement distinct (anti-bouillie) :
 *   7 Noosphère  → organique bioluminescent, jade, qui respire ;
 *   8 stellaire  → métal/orbital, anneaux + voiles, or ;
 *   9 Démiurge   → cristallin géométrique flottant sur le vide, violet-blanc.
 * Partagé par TOUS les bâtiments achetés : `kind` choisit le motif (food, market,
 * …), `band` l'époque. Coords normalisées via ox+sw*x / oy+sh*y comme le reste.
 * ========================================================================== */
import { drawEraGroundFill } from './pixelTerrain.js';

const COSMIC_PAL = {
  7: { core: "#0c241a", mid: "#16442e", glow: "90,240,180", edge: "#3aeca0", lite: "#bdf8de", deep: "#040f0a" },
  8: { core: "#221808", mid: "#3e2c10", glow: "255,205,120", edge: "#f4c25c", lite: "#ffeaba", deep: "#110a03" },
  9: { core: "#161226", mid: "#262044", glow: "170,140,255", edge: "#c8aef0", lite: "#ece2ff", deep: "#08060f" }
};

// ── Cueilleur pixel-art animé (PixelLab) ─────────────────────────────────────
// Le bonhomme du stade 0 des foragers, piloté par le code (navette panier↔buisson),
// comme les piétons d'agents.js. On ne charge QUE les clips réellement utilisés par
// la scène (pas de 404). Bandes /pixelart/agents/forager-<clip>.png, 68px/frame.
// Repli sur le perso vectoriel tant que tout n'est pas chargé. Frame carré → pieds
// ancrés à 0.88 du cadre, centré en x. Clips : walk-east/west (navette),
// pick-east (bras tendu dans l'arbre), crouch-south (accroupi au panier).
const FORAGER_FW = 68, FORAGER_FH = 68;
const FORAGER_CLIPS = { 'walk-east': 6, 'walk-west': 6, 'pick-east': 7, 'crouch-south': 5 };
const foragerImg = {};       // 'clip' -> Image
let foragerInit = false, foragerReadyN = 0;
function ensureForager() {
  if (foragerInit || typeof Image === 'undefined') return;
  foragerInit = true;
  for (const clip of Object.keys(FORAGER_CLIPS)) {
    const im = new Image();
    im.onload = () => { foragerReadyN += 1; };
    im.src = '/pixelart/agents/buildings/forager-' + clip + '.png';
    foragerImg[clip] = im;
  }
}
const foragerReady = () => { ensureForager(); return foragerReadyN >= Object.keys(FORAGER_CLIPS).length; };
// Blit d'une frame : coords en FRACTION de tuile (cx centre, fy = ligne de pieds),
// hFrac = hauteur du cadre en fraction de sh (le perso remplit ~70 % du cadre).
function blitForager(ctx, ox, oy, sw, sh, cx, fy, clip, frame, hFrac) {
  const img = foragerImg[clip]; if (!img) return;
  const drawH = sh * hFrac, drawW = drawH;
  const left = ox + sw * cx - drawW / 2;
  const top = oy + sh * fy - 0.88 * drawH;
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, frame * FORAGER_FW, 0, FORAGER_FW, FORAGER_FH, left, top, drawW, drawH);
  ctx.imageSmoothingEnabled = prev;
}

// ── Paysan des CHAMPS : perso PixelLab dédié (chapeau de paille + fourche) qui
// MARCHE le long du champ. 4 directions, 6 frames, 68px. /pixelart/agents/farmer-<dir>.png.
const FARMER_FW = 68, FARMER_FH = 68, FARMER_NF = 6;
const FARMER_DIRS = ['south', 'east', 'north', 'west'];
const farmerImg = {};
let farmerInit = false, farmerReadyN = 0;
function ensureFarmer() {
  if (farmerInit || typeof Image === 'undefined') return;
  farmerInit = true;
  for (const d of FARMER_DIRS) { const im = new Image(); im.onload = () => { farmerReadyN += 1; }; im.src = '/pixelart/agents/inhabitants/farmer-' + d + '.png'; farmerImg[d] = im; }
}
const farmerReady = () => { ensureFarmer(); return farmerReadyN >= FARMER_DIRS.length; };
function blitFarmer(ctx, ox, oy, sw, sh, cx, fy, dir, frame, hFrac) {
  const im = farmerImg[dir]; if (!im) return;
  const drawH = sh * hFrac, drawW = drawH;
  const left = ox + sw * cx - drawW / 2, top = oy + sh * fy - 0.88 * drawH;
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(im, frame * FARMER_FW, 0, FARMER_FW, FARMER_FH, left, top, drawW, drawH);
  ctx.imageSmoothingEnabled = prev;
}

// ── Bateau de l'ÈRE pour un PORT : réutilise les sprites bateau (boat-{vstage}.png,
// mêmes fichiers que drawShips). Bande éventuellement animée (largeur>hauteur).
// Dimensionné en CELLULES (taille constante). Chargement paresseux par stage.
const portBoatImg = {};
function ensurePortBoat(name) {
  let c = portBoatImg[name];
  if (c) return c;
  c = { img: null, ready: false };
  portBoatImg[name] = c;
  if (typeof Image !== 'undefined') { const im = new Image(); im.onload = () => { c.ready = true; }; im.src = '/pixelart/agents/boats/boat-' + name + '.png'; c.img = im; }
  return c;
}
function blitEraBoat(ctx, ox, oy, sw, sh, cx, cy, cells, name, now, gw) {
  const c = ensurePortBoat(name); if (!c || !c.ready || !c.img || !(c.img.naturalWidth > 0)) return false;
  const im = c.img, bfh = im.naturalHeight || 64, bnf = Math.max(1, Math.round((im.naturalWidth || bfh) / bfh));
  const bf = bnf > 1 ? Math.floor((now || 0) / 160) % bnf : 0;
  const dW = cells * (sw / Math.max(1, gw)), dH = dW;
  const bob = Math.sin((now || 0) / 1050) * dH * 0.045;
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(im, bf * bfh, 0, bfh, bfh, ox + sw * cx - dW / 2, oy + sh * cy - dH / 2 + bob, dW, dH);
  ctx.imageSmoothingEnabled = prev;
  return true;
}

// Une navette complète : marche panier→buisson, tend le bras dans l'arbre, revient
// (fruit en main), s'accroupit au panier pour déposer. phase = décalage du 2e cueilleur.
function drawPixelForager(ctx, ox, oy, sw, sh, now, phase, hFrac) {
  const T = 6400;
  const cyc = (((now || 0) / T) + phase) % 1;
  const X_BASKET = 0.26, X_BUSH = 0.56, FY = 0.78;
  const NF = (k) => FORAGER_CLIPS[k];
  let cx, clip, frame, carry = false;
  if (cyc < 0.34) {                                   // marche panier → buisson
    cx = X_BASKET + (X_BUSH - X_BASKET) * (cyc / 0.34);
    clip = 'walk-east'; frame = Math.floor((now || 0) / 150) % NF(clip);
  } else if (cyc < 0.5) {                             // bras tendu dans l'arbre
    cx = X_BUSH; clip = 'pick-east';
    frame = Math.min(NF(clip) - 1, Math.floor((cyc - 0.34) / 0.16 * NF(clip)));
  } else if (cyc < 0.84) {                            // retour (fruit en main)
    cx = X_BUSH + (X_BASKET - X_BUSH) * ((cyc - 0.5) / 0.34);
    clip = 'walk-west'; frame = Math.floor((now || 0) / 150) % NF(clip); carry = true;
  } else {                                            // accroupi au panier
    cx = X_BASKET; clip = 'crouch-south';
    frame = Math.min(NF(clip) - 1, Math.floor((cyc - 0.84) / 0.16 * NF(clip)));
  }
  // Ombre de contact
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(ox + sw * cx, oy + sh * (FY + 0.02), sw * 0.07 * hFrac / 0.46, sh * 0.022, 0, 0, Math.PI * 2); ctx.fill();
  blitForager(ctx, ox, oy, sw, sh, cx, FY, clip, frame, hFrac);
  // Petit fruit rapporté, tenu devant (côté ouest) au retour
  if (carry) {
    ctx.fillStyle = '#c83010';
    ctx.beginPath(); ctx.arc(ox + sw * (cx - 0.06), oy + sh * (FY - 0.18), sw * 0.022, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,210,160,0.4)';
    ctx.beginPath(); ctx.arc(ox + sw * (cx - 0.066), oy + sh * (FY - 0.188), sw * 0.008, 0, Math.PI * 2); ctx.fill();
  }
}

// Props pixel-art STATIQUES des scènes de moteur (PixelLab) — remplacent les formes
// procédurales. Les éléments dynamiques (fruits, sacs…) sont BAKÉS dans le sprite ;
// l'overlay procédural ne sert plus qu'en repli. Clés = nom de fichier dans
// /pixelart/agents/ (cueilleur : -prop-tree/-basket ; entrepôt : granary-prop-silo/-sacks).
const propImg = {};
let propInit = false;
const PROP_KEYS = ['forager-prop-tree', 'forager-prop-basket', 'granary-prop-silo', 'caravan-prop-sacks', 'market-prop-stall', 'guild-prop-lodge', 'field-prop-crop-green', 'field-prop-crop-gold', 'field-prop-fallow', 'port-prop-house', 'port-prop-pontoon', 'mill-prop-house', 'mill-prop-wheel', 'mint-prop-house', 'mint-prop-forge', 'exchange-prop-stall', 'storyteller-prop-fire', 'storyteller-reader', 'storyteller-back', 'scribes-prop-hall', 'schools-prop-yard', 'academies-prop-yard', 'ancestralcult-back', 'ancestralcult-prop', 'observatories-prop-dial', 'libraries-prop-archive', 'universities-prop-hall', 'printing-prop-workshop', 'think-prop-council', 'aqueduct-outlet', 'aqueduct-seg', 'aqueduct-intake', 'watch-back', 'watch-prop'];
function ensureProps() {
  if (propInit || typeof Image === 'undefined') return;
  propInit = true;
  for (const k of PROP_KEYS) {
    const im = new Image();
    im.src = '/pixelart/agents/buildings/' + k + '.png';
    propImg[k] = im;
  }
}
const propReady = (k) => { ensureProps(); const im = propImg[k]; return !!(im && im.complete && im.naturalWidth > 0); };
// Blit centré sur (cx,cy) en fraction de tuile, taille wFrac×hFrac de (sw,sh).
function blitProp(ctx, ox, oy, sw, sh, p, cx, cy, wFrac, hFrac) {
  const im = propImg[p]; if (!im) return;
  const drawW = sw * wFrac, drawH = sh * hFrac;
  const left = ox + sw * cx - drawW / 2, top = oy + sh * cy - drawH / 2;
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(im, left, top, drawW, drawH);
  ctx.imageSmoothingEnabled = prev;
}

// Centre des pixels OPAQUES d'un prop (fraction 0..1 du sprite), calculé une fois et
// mis en cache. Sert de PIVOT de rotation : une roue dont le moyeu n'est pas au centre
// exact du PNG tournerait « de travers » (orbite) si on tournait autour du centre
// géométrique — on tourne donc autour de ce centroïde (= le moyeu d'une roue symétrique).
const propPivotCache = {};
function propPivot(p) {
  if (propPivotCache[p]) return propPivotCache[p];
  const im = propImg[p];
  if (!im || !(im.naturalWidth > 0) || typeof document === 'undefined') return { x: 0.5, y: 0.5 };
  try {
    const w = im.naturalWidth, h = im.naturalHeight;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, w, h).data;
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 40) { sx += x; sy += y; n++; }
    }
    const piv = n ? { x: (sx / n) / w, y: (sy / n) / h } : { x: 0.5, y: 0.5 };
    propPivotCache[p] = piv; return piv;
  } catch (e) { propPivotCache[p] = { x: 0.5, y: 0.5 }; return propPivotCache[p]; }
}

// Comme blitProp mais TOURNE le sprite d'un angle (rad) autour de son CENTROÏDE opaque,
// placé en (cx,cy). Pour les pièces mécaniques qui tournent en continu (roue de moulin) :
// on fait tourner UN sprite statique via ctx.rotate plutôt qu'une bande d'images.
function blitPropRot(ctx, ox, oy, sw, sh, p, cx, cy, wFrac, hFrac, angle) {
  const im = propImg[p]; if (!im) return false;
  const drawW = sw * wFrac, drawH = sh * hFrac;
  const piv = propPivot(p);
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.save(); ctx.translate(ox + sw * cx, oy + sh * cy); ctx.rotate(angle);
  ctx.drawImage(im, -drawW * piv.x, -drawH * piv.y, drawW, drawH); ctx.restore();
  ctx.imageSmoothingEnabled = prev;
  return true;
}

// ── Caravane : mulet bâté pixel (PixelLab, quadrupède) MENÉ par le marchand ───
// Le « système de transport » : un mulet chargé (cargo baké dans le sprite) marche
// la piste en va-et-vient, le marchand (humain Forager réutilisé) le mène devant.
// Bandes /pixelart/agents/caravan-mule-{east,west}.png (7 frames, 80px). Repli sur
// la scène procédurale (mulet + marchand vectoriels) tant que rien n'est chargé.
const MULE_FW = 80, MULE_FH = 80;
const MULE_CLIPS = { east: 7, west: 7 };
const muleImg = {};
let muleInit = false, muleReadyN = 0;
function ensureMule() {
  if (muleInit || typeof Image === 'undefined') return;
  muleInit = true;
  for (const d of Object.keys(MULE_CLIPS)) {
    const im = new Image();
    im.onload = () => { muleReadyN += 1; };
    im.src = '/pixelart/agents/buildings/caravan-mule-' + d + '.png';
    muleImg[d] = im;
  }
}
const muleReady = () => { ensureMule(); return muleReadyN >= Object.keys(MULE_CLIPS).length; };
function blitMule(ctx, ox, oy, sw, sh, dir, frame, cx, fy, hFrac) {
  const im = muleImg[dir]; if (!im) return;
  const drawH = sh * hFrac, drawW = drawH;
  const left = ox + sw * cx - drawW / 2, top = oy + sh * fy - 0.88 * drawH;
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(im, frame * MULE_FW, 0, MULE_FW, MULE_FH, left, top, drawW, drawH);
  ctx.imageSmoothingEnabled = prev;
}
// Caravane en marche : va-et-vient lent sur la piste (est puis ouest), marchand DEVANT.
// Une ZONE DE SACS (dépôt de marchandises, statique) marque le poste de transport.
function drawCaravan(ctx, ox, oy, sw, sh, now) {
  // Dépôt de sacs (côté droit, au fond) — dessiné AVANT la caravane (elle passe devant).
  if (propReady('caravan-prop-sacks')) {
    blitProp(ctx, ox, oy, sw, sh, 'caravan-prop-sacks', 0.82, 0.76, 0.26 * 64 / 48, 0.26);
  }
  const T = 11000;
  const cyc = ((now || 0) / T) % 1;
  const going = cyc < 0.5;                       // est (→) puis ouest (←)
  const k = going ? cyc * 2 : (1 - cyc) * 2;     // 0 → 1 → 0
  const muleX = 0.22 + (0.64 - 0.22) * k, FY = 0.78;
  const dir = going ? 'east' : 'west';
  const lead = going ? 0.17 : -0.17;             // le marchand mène (devant)
  // Ombre de contact du mulet
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(ox + sw * muleX, oy + sh * (FY + 0.04), sw * 0.17, sh * 0.034, 0, 0, Math.PI * 2); ctx.fill();
  // Marchand devant (réutilise les marches Forager) ; mulet derrière.
  if (foragerReady()) {
    const ff = Math.floor((now || 0) / 150) % FORAGER_CLIPS['walk-' + dir];
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(ox + sw * (muleX + lead), oy + sh * (FY + 0.03), sw * 0.05, sh * 0.02, 0, 0, Math.PI * 2); ctx.fill();
    blitForager(ctx, ox, oy, sw, sh, muleX + lead, FY, 'walk-' + dir, ff, 0.4);
  }
  const mf = Math.floor((now || 0) / 150) % MULE_CLIPS[dir];
  blitMule(ctx, ox, oy, sw, sh, dir, mf, muleX, FY, 0.64);
}

// ── Bandes animées « feu pixel » (PixelLab animate_object → composite qui FIGE le
// bâtiment, seul le feu bouge). Bande horizontale N×FW, un Image par clé. Le feu
// animé est PIXEL (baké image par image) → il ne « dénote » pas comme un overlay
// procédural. Registry PARTAGÉ (mint forge, conteurs…) ; exporté pour engineSprites.js.
// Repli : prop statique correspondant, puis la scène procédurale d'origine.
const ANIM_BANDS = {
  'mint-forge-fire': { fw: 96, fh: 80, frames: 7, ms: 130 },
  'storyteller-fire': { fw: 96, fh: 80, frames: 7, ms: 130 },
  'ancestralcult-fire': { fw: 96, fh: 80, frames: 7, ms: 130 },
  // Eau de l'aqueduc : un module = une tuile ; même horloge (ms) partout → le flux
  // se raccorde entre tuiles adjacentes (la frame est globale, pas par tuile).
  'aqueduct-water-outlet': { fw: 48, fh: 72, frames: 7, ms: 140 },
  'aqueduct-water-seg': { fw: 48, fh: 72, frames: 7, ms: 140 },
  'aqueduct-water-intake': { fw: 48, fh: 72, frames: 7, ms: 140 },
  'watch-fire': { fw: 80, fh: 96, frames: 7, ms: 130 },
};
const animImg = {};
let animInit = false;
const animReadyN = {};
function ensureAnim() {
  if (animInit || typeof Image === 'undefined') return;
  animInit = true;
  for (const k of Object.keys(ANIM_BANDS)) {
    const im = new Image();
    im.onload = () => { animReadyN[k] = 1; };
    im.src = '/pixelart/agents/buildings/' + k + '.png';
    animImg[k] = im;
  }
}
const animReady = (k) => { ensureAnim(); return animReadyN[k] === 1; };
// Blit de la frame courante d'une bande, centrée sur (cx,cy) en fraction de tuile.
function blitAnim(ctx, ox, oy, sw, sh, key, now, cx, cy, wFrac, hFrac) {
  const meta = ANIM_BANDS[key], im = animImg[key]; if (!meta || !im) return;
  const frame = Math.floor((now || 0) / meta.ms) % meta.frames;   // ~7.7 fps
  const drawW = sw * wFrac, drawH = sh * hFrac;
  const left = ox + sw * cx - drawW / 2, top = oy + sh * cy - drawH / 2;
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(im, frame * meta.fw, 0, meta.fw, meta.fh, left, top, drawW, drawH);
  ctx.imageSmoothingEnabled = prev;
}


// Décor cosmique commun aux stades transcendants (ères 35+) : sol OPAQUE + ombre
// de contact, et une fonction `glow` (halo additif localisé). Chaque bâtiment
// dessine ensuite son corps OPAQUE par-dessus (silhouette propre par fonction,
// matière selon l'époque via cp). Opaque ⇒ survit au voile de nuit.
function cosmicBase(ctx, ox, oy, sw, sh, px, band) {
  const cp = COSMIC_PAL[band] || COSMIC_PAL[9];
  px(0, 0.5, 1, 0.5, cp.deep);
  ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.beginPath(); ctx.ellipse(ox + sw * 0.5, oy + sh * 0.82, sw * 0.34, sh * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  const glow = (cx, cy, r, a) => { ctx.save(); ctx.globalCompositeOperation = "lighter"; const g = ctx.createRadialGradient(ox + sw * cx, oy + sh * cy, 0, ox + sw * cx, oy + sh * cy, sw * r); g.addColorStop(0, `rgba(${cp.glow},${a})`); g.addColorStop(1, `rgba(${cp.glow},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox + sw * cx, oy + sh * cy, sw * r, 0, Math.PI * 2); ctx.fill(); ctx.restore(); };
  return { cp, glow };
}

function drawCityEngineSprite(context) {
  const { ctx, id, tier, litWarm, litGold, ox, oy, sw, sh, px, strokeRect, now, band = 0, ei = 0, gw = 1, gh = 1 } = context;
  if (id === "foragers") {
    if (band >= 7) {
      // STADE COSMIQUE (ères 35+) : jardin bioluminescent (Noosphère) → serre
      // orbitale (stellaire) → jardin cristallin (Démiurge). Dessiné OPAQUE comme
      // les stades 0-3 (corps pleins) pour survivre au voile de nuit ; palette par époque.
      const cp = COSMIC_PAL[band] || COSMIC_PAL[9];
      px(0, 0.5, 1, 0.5, cp.deep); // sol cosmique opaque
      ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.beginPath(); ctx.ellipse(ox + sw * 0.5, oy + sh * 0.82, sw * 0.34, sh * 0.07, 0, 0, Math.PI * 2); ctx.fill();
      const glow = (cx, cy, r, a) => { ctx.save(); ctx.globalCompositeOperation = "lighter"; const g = ctx.createRadialGradient(ox + sw * cx, oy + sh * cy, 0, ox + sw * cx, oy + sh * cy, sw * r); g.addColorStop(0, `rgba(${cp.glow},${a})`); g.addColorStop(1, `rgba(${cp.glow},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox + sw * cx, oy + sh * cy, sw * r, 0, Math.PI * 2); ctx.fill(); ctx.restore(); };
      if (band === 7) { // bulbes-pods organiques sur tiges qui ondulent (vivant)
        for (const [bx, by, br] of [[0.32, 0.52, 0.12], [0.5, 0.4, 0.16], [0.68, 0.54, 0.11]]) {
          const ph = bx * 9;
          const sway = Math.sin(now / 760 + ph) * 0.05;           // ondulation de la tige
          const tipx = bx + sway, tipy = by - 0.008 * Math.abs(Math.sin(now / 760 + ph));
          // Tige courbe OPAQUE, ancrée au sol, fléchie au sommet (la « branche » qui bouge)
          ctx.strokeStyle = cp.mid; ctx.lineCap = "round"; ctx.lineWidth = Math.max(1.5, sw * 0.05);
          ctx.beginPath(); ctx.moveTo(ox + sw * bx, oy + sh * 0.82);
          ctx.quadraticCurveTo(ox + sw * (bx + sway * 0.45), oy + sh * ((0.82 + by) / 2), ox + sw * tipx, oy + sh * tipy);
          ctx.stroke();
          // Bulbe au bout de la tige (suit l'ondulation)
          ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.ellipse(ox + sw * tipx, oy + sh * tipy, sw * br, sh * br * 1.1, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.ellipse(ox + sw * (tipx - br * 0.3), oy + sh * (tipy - br * 0.35), sw * br * 0.42, sh * br * 0.48, 0, 0, Math.PI * 2); ctx.fill();
          glow(tipx, tipy, br * 1.5, 0.3 + 0.2 * Math.sin(now / 600 + ph));
        }
      } else if (band === 8) { // serre orbitale dorée : dôme opaque + anneau
        ctx.fillStyle = cp.mid; ctx.beginPath(); ctx.ellipse(ox + sw * 0.5, oy + sh * 0.74, sw * 0.32, sh * 0.24, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.ellipse(ox + sw * 0.5, oy + sh * 0.62, sw * 0.27, sh * 0.27, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.ellipse(ox + sw * 0.42, oy + sh * 0.56, sw * 0.1, sh * 0.13, 0, Math.PI, 0); ctx.fill();
        const rt = -0.3 + 0.1 * Math.sin(now / 900);
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = `rgba(${cp.glow},0.6)`; ctx.lineWidth = Math.max(1, sw * 0.02); ctx.beginPath(); ctx.ellipse(ox + sw * 0.5, oy + sh * 0.52, sw * 0.42, sh * 0.1, rt, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        // Satellite-pod OPAQUE qui orbite le long de l'anneau (vie)
        { const ra = now / 1400, ax = Math.cos(ra) * sw * 0.42, ay = Math.sin(ra) * sh * 0.1;
          const mxp = ox + sw * 0.5 + ax * Math.cos(rt) - ay * Math.sin(rt);
          const myp = oy + sh * 0.52 + ax * Math.sin(rt) + ay * Math.cos(rt);
          ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.arc(mxp, myp, sw * 0.03, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(mxp, myp, sw * 0.016, 0, Math.PI * 2); ctx.fill();
          glow((mxp - ox) / sw, (myp - oy) / sh, 0.06, 0.45); }
      } else { // jardin cristallin violet : cristaux opaques facettés en lévitation
        for (const [cx2, cy2, cr, rot] of [[0.36, 0.62, 0.13, 0.3], [0.5, 0.46, 0.17, 0], [0.66, 0.62, 0.12, -0.3]]) {
          const ph = cx2 * 11;
          const hd = Math.sin(now / 1300 + ph) * 0.022;            // dérive horizontale (lévitation visible)
          const bob = Math.cos(now / 900 + ph) * 0.03;             // flottaison Démiurge
          const spin = rot + 0.12 * Math.sin(now / 1500 + cx2 * 7); // tumble lent
          ctx.save(); ctx.translate(ox + sw * (cx2 + hd), oy + sh * (cy2 + bob)); ctx.rotate(spin);
          const w = sw * cr * 0.6, h = sh * cr;
          ctx.fillStyle = cp.mid; ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(w, 0); ctx.lineTo(0, h); ctx.lineTo(-w, 0); ctx.closePath(); ctx.fill();
          ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, h); ctx.lineTo(-w, 0); ctx.closePath(); ctx.fill();
          ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, h * 0.5); ctx.lineTo(-w * 0.5, 0); ctx.closePath(); ctx.fill();
          ctx.restore(); glow(cx2 + hd, cy2 + bob, cr * 1.2, 0.18 + 0.12 * Math.sin(now / 700 + cx2 * 5));
        }
        // éclat cristallin en orbite autour du cœur (mouvement franc)
        const oa = now / 1100, sx9 = 0.5 + Math.cos(oa) * 0.26, sy9 = 0.5 + Math.sin(oa) * 0.16;
        ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(ox + sw * sx9, oy + sh * sy9, sw * 0.02, 0, Math.PI * 2); ctx.fill();
        glow(sx9, sy9, 0.05, 0.4);
      }
      return true;
    }
    // 4 stades suivant l'âge de la ville (ei = eraIndex 0–34), un tous les
    // 10 âges : cueillette sauvage → verger taillé → serre industrielle →
    // hydroponie néon. tier reste la richesse intra-stade (perso/fruits/cagettes).
    const stage = ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3;
    if (stage === 0) {
    // Terre de cueillette : tache de sol foncée qui se FOND dans le terrain (plus de
    // rectangle net) — dégradé radial transparent sur les bords, ellipse via scale(y).
    {
      const cxp = ox + sw * 0.5, cyp = oy + sh * 0.76, R = sw * 0.52, ky = (sh * 0.34) / R;
      ctx.save();
      ctx.translate(cxp, cyp); ctx.scale(1, ky); ctx.translate(-cxp, -cyp);
      const g = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, R);
      g.addColorStop(0, "rgba(19,26,9,0.82)");
      g.addColorStop(0.6, "rgba(19,26,9,0.46)");
      g.addColorStop(1, "rgba(19,26,9,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cxp, cyp, R, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // === BUISSON / ARBRE (droite) ===
    const tx = 0.70, ty = 0.60;
    if (propReady('forager-prop-tree')) {
      blitProp(ctx, ox, oy, sw, sh, 'forager-prop-tree', tx, ty - 0.12, 0.74, 0.78);
    } else {
    // Tronc
    ctx.fillStyle = "#6a3c0e";
    ctx.fillRect(ox + sw * (tx - 0.024), oy + sh * (ty - 0.1), sw * 0.048, sh * 0.2);
    // Feuillage — cercles superposés plus ou moins denses selon le tier
    const foliageCfg = tier >= 2
      ? [[tx, ty-0.3, 0.19],[tx-0.11, ty-0.22, 0.16],[tx+0.11, ty-0.22, 0.15],[tx, ty-0.15, 0.17]]
      : tier >= 1
      ? [[tx, ty-0.26, 0.18],[tx-0.1, ty-0.18, 0.15],[tx+0.09, ty-0.18, 0.14]]
      : [[tx, ty-0.22, 0.17],[tx-0.09, ty-0.15, 0.13]];
    for (const [fx, fy, fr] of foliageCfg) {
      ctx.fillStyle = "#284e14";
      ctx.beginPath(); ctx.arc(ox + sw * fx, oy + sh * fy, sw * fr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(50,100,24,0.55)";
      ctx.beginPath(); ctx.arc(ox + sw * (fx - fr * 0.22), oy + sh * (fy - fr * 0.22), sw * fr * 0.62, 0, Math.PI * 2); ctx.fill();
    }
    // Fruits/baies — repli SEULEMENT (sprite arbre absent) ; sinon BAKÉS dans le sprite.
    const allFruits = [
      [tx - 0.07, ty - 0.24, "#d03808"], [tx + 0.08, ty - 0.28, "#cc5010"],
      [tx - 0.01, ty - 0.32, "#c82808"], [tx + 0.13, ty - 0.20, "#d84010"],
      [tx + 0.02, ty - 0.17, "#e04818"], [tx - 0.12, ty - 0.17, "#c03210"]
    ];
    for (let fi = 0; fi < Math.min(allFruits.length, 2 + tier * 2); fi++) {
      const [ffx, ffy, ffc] = allFruits[fi];
      ctx.fillStyle = ffc;
      ctx.beginPath(); ctx.arc(ox + sw * ffx, oy + sh * ffy, sw * 0.029, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,210,160,0.4)";
      ctx.beginPath(); ctx.arc(ox + sw * (ffx - 0.008), oy + sh * (ffy - 0.008), sw * 0.011, 0, Math.PI * 2); ctx.fill();
    }
    }

    // === PANIER — ombre de contact ICI (sous tout) ; le panier lui-même est dessiné
    // APRÈS le perso (plus bas) pour que le cueilleur passe DERRIÈRE le panier. ===
    const bkx = 0.2, bky = 0.72;
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath(); ctx.ellipse(ox + sw * bkx, oy + sh * (bky + 0.045), sw * 0.13, sh * 0.04, 0, 0, Math.PI * 2); ctx.fill();

    // === PERSONNAGE — navette panier ↔ buisson ===
    // Pixel-art animé (PixelLab) si chargé ; sinon repli sur le perso vectoriel.
    if (foragerReady()) {
      drawPixelForager(ctx, ox, oy, sw, sh, now, 0, 0.46);
      if (tier >= 2) drawPixelForager(ctx, ox, oy, sw, sh, now, 0.5, 0.40);
    } else {
    // Va vide vers l'arbre, cueille un fruit, le rapporte et le pose au panier.
    const cyc0 = (now / 3600) % 1;
    const going0 = cyc0 < 0.5;                       // panier → arbre
    const k0 = going0 ? cyc0 * 2 : (1 - cyc0) * 2;   // 0 (panier) → 1 (arbre)
    const carry0 = !going0;                          // fruit en main au retour
    const px2 = 0.28 + k0 * 0.30, py2 = 0.60;
    const step0 = Math.sin(now / 130) * 0.012;
    const dir0 = going0 ? 1 : -1;
    // Ombre au sol
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath(); ctx.ellipse(ox + sw * px2, oy + sh * (py2 + 0.13), sw * 0.06, sh * 0.024, 0, 0, Math.PI * 2); ctx.fill();
    // Jambes (alternées en marchant)
    ctx.fillStyle = "#3a2614";
    ctx.fillRect(ox + sw * (px2 - 0.03 + step0), oy + sh * (py2 + 0.06), sw * 0.024, sh * 0.1);
    ctx.fillRect(ox + sw * (px2 + 0.006 - step0), oy + sh * (py2 + 0.06), sw * 0.024, sh * 0.1);
    // Corps
    ctx.fillStyle = "#5a3c1a"; ctx.fillRect(ox + sw * (px2 - 0.034), oy + sh * (py2 - 0.06), sw * 0.068, sh * 0.12);
    // Tête
    ctx.fillStyle = "#c48c50"; ctx.beginPath(); ctx.arc(ox + sw * px2, oy + sh * (py2 - 0.1), sw * 0.048, 0, Math.PI * 2); ctx.fill();
    // Bras tendu dans le sens de la marche
    const hx0 = px2 + dir0 * 0.05, hy0 = py2 - 0.02;
    ctx.strokeStyle = "#5a3c1a"; ctx.lineWidth = Math.max(1.5, sw * 0.04); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(ox + sw * (px2 + dir0 * 0.02), oy + sh * (py2 - 0.04)); ctx.lineTo(ox + sw * hx0, oy + sh * hy0); ctx.stroke();
    ctx.lineCap = "square";
    ctx.fillStyle = "#c48c50"; ctx.beginPath(); ctx.arc(ox + sw * hx0, oy + sh * hy0, sw * 0.03, 0, Math.PI * 2); ctx.fill();
    // Fruit rapporté (visible au retour, déposé une fois au panier)
    if (carry0) {
      ctx.fillStyle = "#c83010"; ctx.beginPath(); ctx.arc(ox + sw * hx0, oy + sh * (hy0 - 0.012), sw * 0.022, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,210,160,0.4)"; ctx.beginPath(); ctx.arc(ox + sw * (hx0 - 0.006), oy + sh * (hy0 - 0.018), sw * 0.008, 0, Math.PI * 2); ctx.fill();
    }

    // Tier 2 : second cueilleur, même navette en opposition de phase
    if (tier >= 2) {
      const cyc1 = (now / 4200 + 0.5) % 1;
      const going1 = cyc1 < 0.5;
      const k1 = going1 ? cyc1 * 2 : (1 - cyc1) * 2;
      const carry1 = !going1;
      const px3 = 0.32 + k1 * 0.26, py3 = 0.70;
      const step1 = Math.sin(now / 150 + 1) * 0.01;
      const dir1 = going1 ? 1 : -1;
      ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.beginPath(); ctx.ellipse(ox + sw * px3, oy + sh * (py3 + 0.11), sw * 0.05, sh * 0.02, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2e1c0e";
      ctx.fillRect(ox + sw * (px3 - 0.026 + step1), oy + sh * (py3 + 0.05), sw * 0.02, sh * 0.08);
      ctx.fillRect(ox + sw * (px3 + 0.006 - step1), oy + sh * (py3 + 0.05), sw * 0.02, sh * 0.08);
      ctx.fillStyle = "#4a3014"; ctx.fillRect(ox + sw * (px3 - 0.03), oy + sh * (py3 - 0.04), sw * 0.06, sh * 0.1);
      ctx.fillStyle = "#b87848"; ctx.beginPath(); ctx.arc(ox + sw * px3, oy + sh * (py3 - 0.07), sw * 0.042, 0, Math.PI * 2); ctx.fill();
      const hx1 = px3 + dir1 * 0.045, hy1 = py3 - 0.015;
      ctx.strokeStyle = "#4a3014"; ctx.lineWidth = Math.max(1.5, sw * 0.036); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(ox + sw * (px3 + dir1 * 0.018), oy + sh * (py3 - 0.03)); ctx.lineTo(ox + sw * hx1, oy + sh * hy1); ctx.stroke();
      ctx.lineCap = "square";
      ctx.fillStyle = "#b87848"; ctx.beginPath(); ctx.arc(ox + sw * hx1, oy + sh * hy1, sw * 0.026, 0, Math.PI * 2); ctx.fill();
      if (carry1) { ctx.fillStyle = "#d04818"; ctx.beginPath(); ctx.arc(ox + sw * hx1, oy + sh * (hy1 - 0.01), sw * 0.02, 0, Math.PI * 2); ctx.fill(); }
    }
    }

    // === PANIER (corps) — APRÈS le perso → le cueilleur passe DERRIÈRE le panier ===
    if (propReady('forager-prop-basket')) {
      blitProp(ctx, ox, oy, sw, sh, 'forager-prop-basket', bkx, bky - 0.01, 0.34, 0.32);
    } else {
      ctx.fillStyle = "#8a5520";
      ctx.beginPath(); ctx.ellipse(ox + sw * bkx, oy + sh * bky, sw * 0.12, sh * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#6a3c10"; ctx.lineWidth = Math.max(0.5, sw * 0.018);
      for (let bi = 1; bi <= 3; bi++) {
        const by2 = bky - 0.06 + bi * 0.036;
        const bwi = 0.12 * Math.sqrt(1 - Math.pow((by2 - bky) / 0.08, 2));
        ctx.beginPath(); ctx.moveTo(ox + sw * (bkx - bwi), oy + sh * by2); ctx.lineTo(ox + sw * (bkx + bwi), oy + sh * by2); ctx.stroke();
      }
      ctx.fillStyle = "#5e3210";
      ctx.beginPath(); ctx.ellipse(ox + sw * bkx, oy + sh * (bky - 0.045), sw * 0.12, sh * 0.038, 0, Math.PI, 0); ctx.fill();
      // Fruits récoltés — repli SEULEMENT (sprite panier absent) ; sinon BAKÉS dans le sprite.
      if (tier >= 1) {
        ctx.fillStyle = "#c83010"; ctx.beginPath(); ctx.arc(ox + sw * (bkx - 0.04), oy + sh * (bky - 0.04), sw * 0.026, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#d04818"; ctx.beginPath(); ctx.arc(ox + sw * (bkx + 0.03), oy + sh * (bky - 0.05), sw * 0.023, 0, Math.PI * 2); ctx.fill();
      }
    }
    } else if (stage === 1) {
      // ── STADE 1 · VERGER DOMESTIQUÉ — arbre taillé, enclos, échelle, cagettes ──
      // La ville se pave et a des marchés : la récolte s'organise et se stocke.
      px(0.0, 0.58, 1.0, 0.42, "#16200c");        // herbe entretenue
      px(0.46, 0.66, 0.5, 0.2, "#2a1f10");        // terre retournée au pied de l'arbre
      // Clôture d'enclos (poteaux + lisse)
      ctx.strokeStyle = "#6a4a1e"; ctx.lineWidth = Math.max(1, sw * 0.018); ctx.lineCap = "round";
      for (let i = 0; i <= 4; i++) {
        const fxp = 0.12 + i * 0.075;
        ctx.beginPath(); ctx.moveTo(ox + sw * fxp, oy + sh * 0.74); ctx.lineTo(ox + sw * fxp, oy + sh * 0.82); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.12, oy + sh * 0.77); ctx.lineTo(ox + sw * 0.42, oy + sh * 0.77); ctx.stroke();
      ctx.lineCap = "square";
      // Arbre fruitier taillé : tronc droit + houppier rond et dense
      const tx = 0.66, ty = 0.6;
      ctx.fillStyle = "#6a3c0e";
      ctx.fillRect(ox + sw * (tx - 0.026), oy + sh * (ty - 0.06), sw * 0.052, sh * 0.26);
      for (const [cx2, cy2, cr] of [[tx, ty - 0.26, 0.22], [tx - 0.12, ty - 0.16, 0.15], [tx + 0.12, ty - 0.16, 0.15]]) {
        ctx.fillStyle = "#2c5416";
        ctx.beginPath(); ctx.arc(ox + sw * cx2, oy + sh * cy2, sw * cr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(58,110,28,0.5)";
        ctx.beginPath(); ctx.arc(ox + sw * (cx2 - cr * 0.25), oy + sh * (cy2 - cr * 0.25), sw * cr * 0.6, 0, Math.PI * 2); ctx.fill();
      }
      // Fruits réguliers (verger = plus ordonné que le buisson sauvage)
      const orchardFruit = [[tx-0.1,ty-0.26],[tx+0.02,ty-0.3],[tx+0.13,ty-0.22],[tx-0.04,ty-0.18],[tx+0.08,ty-0.16],[tx-0.13,ty-0.15]];
      for (let fi = 0; fi < Math.min(orchardFruit.length, 3 + tier * 2); fi++) {
        const [ffx, ffy] = orchardFruit[fi];
        ctx.fillStyle = "#d23410";
        ctx.beginPath(); ctx.arc(ox + sw * ffx, oy + sh * ffy, sw * 0.028, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,210,160,0.4)";
        ctx.beginPath(); ctx.arc(ox + sw * (ffx - 0.008), oy + sh * (ffy - 0.008), sw * 0.01, 0, Math.PI * 2); ctx.fill();
      }
      // Échelle en bois appuyée au tronc
      const lbx = tx - 0.2, lby = 0.78, ltx = tx - 0.06, lty = ty - 0.18;
      ctx.strokeStyle = "#8a5a22"; ctx.lineWidth = Math.max(1, sw * 0.02);
      ctx.beginPath(); ctx.moveTo(ox+sw*lbx, oy+sh*lby); ctx.lineTo(ox+sw*ltx, oy+sh*lty); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*(lbx+0.05), oy+sh*lby); ctx.lineTo(ox+sw*(ltx+0.05), oy+sh*lty); ctx.stroke();
      for (let r = 1; r <= 3; r++) {
        const rt = r / 4;
        ctx.beginPath();
        ctx.moveTo(ox+sw*(lbx+(ltx-lbx)*rt), oy+sh*(lby+(lty-lby)*rt));
        ctx.lineTo(ox+sw*(lbx+0.05+(ltx-lbx)*rt), oy+sh*(lby+(lty-lby)*rt));
        ctx.stroke();
      }
      // Cueilleur qui monte/descend l'échelle : vide en montant, un fruit en
      // main au sommet, qu'il rapporte en descendant (plus de fruit en bas).
      const cyc = (now / 4400) % 1;
      const up = cyc < 0.5;
      const m = up ? cyc * 2 : (1 - cyc) * 2;        // 0 (bas) → 1 (haut)
      const carry = !up;                              // fruit cueilli au sommet
      const cpx = lbx + (ltx - lbx) * m + 0.03, cpy = lby + (lty - lby) * m;
      const climb = Math.sin(now / 110) * 0.006;      // léger ballant des jambes
      ctx.fillStyle = "#4a3014"; ctx.fillRect(ox+sw*(cpx-0.016), oy+sh*(cpy-0.02), sw*0.036, sh*0.085);
      ctx.fillStyle = "#3a2410";
      ctx.fillRect(ox+sw*(cpx-0.014+climb), oy+sh*(cpy+0.05), sw*0.014, sh*0.04);
      ctx.fillRect(ox+sw*(cpx+0.006-climb), oy+sh*(cpy+0.05), sw*0.014, sh*0.04);
      ctx.fillStyle = "#c48c50"; ctx.beginPath(); ctx.arc(ox+sw*(cpx+0.002), oy+sh*(cpy-0.045), sw*0.026, 0, Math.PI*2); ctx.fill();
      // Bras vers l'échelle (montée) ou tenant le fruit (descente)
      ctx.strokeStyle="#4a3014"; ctx.lineWidth=Math.max(1.2,sw*0.028); ctx.lineCap="round";
      const ahx = cpx - 0.04, ahy = cpy - (carry ? 0.04 : 0.06);
      ctx.beginPath(); ctx.moveTo(ox+sw*(cpx-0.01),oy+sh*(cpy-0.02)); ctx.lineTo(ox+sw*ahx,oy+sh*ahy); ctx.stroke();
      ctx.lineCap="square";
      ctx.fillStyle="#c48c50"; ctx.beginPath(); ctx.arc(ox+sw*ahx,oy+sh*ahy,sw*0.02,0,Math.PI*2); ctx.fill();
      if (carry) { ctx.fillStyle = "#d23410"; ctx.beginPath(); ctx.arc(ox+sw*ahx, oy+sh*(ahy-0.012), sw*0.02, 0, Math.PI*2); ctx.fill(); }
      // Cagettes empilées (remplacent le panier d'osier)
      const cgx = 0.2, cgy = 0.74, cgN = 2 + Math.min(2, tier);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath(); ctx.ellipse(ox+sw*cgx, oy+sh*(cgy+0.04), sw*0.11, sh*0.03, 0, 0, Math.PI*2); ctx.fill();
      for (let c = 0; c < cgN; c++) {
        const cyB = cgy - c * 0.06;
        px(cgx - 0.08, cyB, 0.16, 0.055, c % 2 ? "#9a6a2c" : "#8a5a22");
        strokeRect(cgx - 0.08, cyB, 0.16, 0.055, "rgba(40,24,8,0.5)");
        if (c === cgN - 1) {
          for (let k = 0; k < 3; k++) { ctx.fillStyle = "#c83010"; ctx.beginPath(); ctx.arc(ox+sw*(cgx-0.05+k*0.05), oy+sh*(cyB-0.005), sw*0.018, 0, Math.PI*2); ctx.fill(); }
        }
      }
      // Tier 2 : second cueilleur au sol, une cagette dans les bras
      if (tier >= 2) {
        const gpx = 0.36, gpy = 0.72;
        ctx.fillStyle="rgba(0,0,0,0.18)"; ctx.beginPath(); ctx.ellipse(ox+sw*gpx,oy+sh*(gpy+0.16),sw*0.05,sh*0.022,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle="#2e1c0e"; ctx.fillRect(ox+sw*(gpx-0.025),oy+sh*(gpy+0.05),sw*0.05,sh*0.1);
        ctx.fillStyle="#4a3014"; ctx.fillRect(ox+sw*(gpx-0.03),oy+sh*(gpy-0.04),sw*0.06,sh*0.1);
        ctx.fillStyle="#b87848"; ctx.beginPath(); ctx.arc(ox+sw*gpx,oy+sh*(gpy-0.07),sw*0.04,0,Math.PI*2); ctx.fill();
        px(gpx-0.045, gpy-0.02, 0.09, 0.045, "#8a5a22");
      }
    } else if (stage === 2) {
      // ── STADE 2 · RÉCOLTE INDUSTRIELLE — châssis de serre vitré, chariot, outils métal ──
      // Brique sombre & métal, faubourgs : la production est mise à l'échelle.
      px(0.0, 0.62, 1.0, 0.38, "#1c2412");        // sol travaillé
      px(0.0, 0.78, 1.0, 0.22, "#241a0e");        // allée de terre
      // Châssis de serre : structure basse vitrée à montants métal
      const gx0 = 0.46, gw = 0.46, gy0 = 0.4, gh = 0.32;
      px(gx0, gy0, gw, gh, "#34524a");            // vitres (teinte froide)
      ctx.fillStyle = "rgba(180,220,210,0.18)";   // reflet
      ctx.beginPath();
      ctx.moveTo(ox+sw*gx0, oy+sh*(gy0+gh)); ctx.lineTo(ox+sw*(gx0+gw*0.5), oy+sh*gy0);
      ctx.lineTo(ox+sw*(gx0+gw*0.7), oy+sh*gy0); ctx.lineTo(ox+sw*(gx0+gw*0.2), oy+sh*(gy0+gh));
      ctx.closePath(); ctx.fill();
      // Toit en bâtière vitré
      ctx.fillStyle = "#2c443d";
      ctx.beginPath(); ctx.moveTo(ox+sw*(gx0-0.02), oy+sh*gy0); ctx.lineTo(ox+sw*(gx0+gw*0.5), oy+sh*(gy0-0.1)); ctx.lineTo(ox+sw*(gx0+gw+0.02), oy+sh*gy0); ctx.closePath(); ctx.fill();
      // Montants métal (mullions)
      ctx.strokeStyle = "#5a6a68"; ctx.lineWidth = Math.max(1, sw*0.016);
      for (let i=0;i<=4;i++){const mx=gx0+(gw/4)*i; ctx.beginPath(); ctx.moveTo(ox+sw*mx,oy+sh*gy0); ctx.lineTo(ox+sw*mx,oy+sh*(gy0+gh)); ctx.stroke();}
      ctx.beginPath(); ctx.moveTo(ox+sw*gx0,oy+sh*(gy0+gh*0.5)); ctx.lineTo(ox+sw*(gx0+gw),oy+sh*(gy0+gh*0.5)); ctx.stroke();
      // Rangées de plants + fruits derrière la vitre (densité selon tier)
      for (let r=0;r<2+Math.min(2,tier);r++){
        const ry=gy0+0.08+r*0.09;
        px(gx0+0.03, ry, gw-0.06, 0.03, "#2e6a22");
        for(let f=0;f<3;f++){ctx.fillStyle="#d6440f"; ctx.beginPath(); ctx.arc(ox+sw*(gx0+0.08+f*0.12), oy+sh*(ry+0.005), sw*0.013,0,Math.PI*2); ctx.fill();}
      }
      // Ouvrier poussant une brouette de cagettes (va-et-vient comme aux greniers)
      const cyc=(now/4600)%1, going=cyc<0.5, k=going?cyc*2:(1-cyc)*2;
      const wx=0.34 - k*0.16, wy=0.82, step=Math.sin(now/120)*0.01;
      ctx.fillStyle="rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(ox+sw*(wx+0.06),oy+sh*(wy+0.07),sw*0.12,sh*0.025,0,0,Math.PI*2); ctx.fill();
      // Roue (rayon qui tourne)
      ctx.fillStyle="#3a2c18"; ctx.beginPath(); ctx.arc(ox+sw*(wx+0.13),oy+sh*(wy+0.05),sw*0.03,0,Math.PI*2); ctx.fill();
      const wr=(now/200)%(Math.PI*2);
      ctx.strokeStyle="#1c140a"; ctx.lineWidth=Math.max(0.5,sw*0.01);
      ctx.beginPath(); ctx.moveTo(ox+sw*(wx+0.13-0.022*Math.cos(wr)),oy+sh*(wy+0.05-0.022*Math.sin(wr))); ctx.lineTo(ox+sw*(wx+0.13+0.022*Math.cos(wr)),oy+sh*(wy+0.05+0.022*Math.sin(wr))); ctx.stroke();
      // Benne de la brouette + cagette
      ctx.fillStyle="#6a4a1e";
      ctx.beginPath(); ctx.moveTo(ox+sw*(wx+0.02),oy+sh*(wy-0.02)); ctx.lineTo(ox+sw*(wx+0.16),oy+sh*(wy-0.02)); ctx.lineTo(ox+sw*(wx+0.13),oy+sh*(wy+0.04)); ctx.lineTo(ox+sw*(wx+0.05),oy+sh*(wy+0.04)); ctx.closePath(); ctx.fill();
      px(wx+0.04, wy-0.07, 0.1, 0.05, "#8a5a22");
      if(going){for(let k2=0;k2<3;k2++){ctx.fillStyle="#c83010"; ctx.beginPath(); ctx.arc(ox+sw*(wx+0.06+k2*0.035),oy+sh*(wy-0.075),sw*0.015,0,Math.PI*2); ctx.fill();}}
      // Brancards
      ctx.strokeStyle="#5a3c1a"; ctx.lineWidth=Math.max(1,sw*0.014);
      ctx.beginPath(); ctx.moveTo(ox+sw*(wx+0.02),oy+sh*(wy-0.01)); ctx.lineTo(ox+sw*(wx-0.05),oy+sh*(wy+0.01)); ctx.stroke();
      // Ouvrier
      ctx.fillStyle="#2e2010"; ctx.fillRect(ox+sw*(wx-0.09+step),oy+sh*wy,sw*0.018,sh*0.05); ctx.fillRect(ox+sw*(wx-0.06-step),oy+sh*wy,sw*0.018,sh*0.05);
      ctx.fillStyle="#4a3014"; ctx.fillRect(ox+sw*(wx-0.095),oy+sh*(wy-0.08),sw*0.05,sh*0.085);
      ctx.fillStyle="#c48c50"; ctx.beginPath(); ctx.arc(ox+sw*(wx-0.07),oy+sh*(wy-0.1),sw*0.024,0,Math.PI*2); ctx.fill();
      // Outil métal appuyé (râteau)
      ctx.strokeStyle="#7a7468"; ctx.lineWidth=Math.max(1,sw*0.012);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.1,oy+sh*0.84); ctx.lineTo(ox+sw*0.16,oy+sh*0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.145,oy+sh*0.6); ctx.lineTo(ox+sw*0.175,oy+sh*0.6); ctx.stroke();
    } else {
      // ── STADE 3 · HYDROPONIE NÉON — rack vertical, fruits lumineux, bras robotisé ──
      // Néon froid, arcologies, automatisation : plus aucun humain, la récolte
      // est entièrement robotisée. Facteur nuit dérivé de litGold (alpha = CM.nightF*0.95).
      const nF = parseFloat(litGold.slice(litGold.lastIndexOf(",") + 1)) || 0;
      px(0.0, 0.6, 1.0, 0.4, "#10161a");          // dalle sombre
      px(0.0, 0.82, 1.0, 0.18, "#0c1014");
      // Bac récepteur automatisé (à gauche)
      px(0.1, 0.74, 0.18, 0.1, "#1a2228");
      strokeRect(0.1, 0.74, 0.18, 0.1, "#2c3a44");
      // Rack hydroponique vertical : plateaux empilés (hauteur selon tier)
      const rkx = 0.5, rkw = 0.42, rows = 3 + Math.min(2, tier);
      px(rkx-0.02, 0.32, 0.03, 0.46, "#1c262c"); px(rkx+rkw-0.01, 0.32, 0.03, 0.46, "#1c262c");
      for (let r = 0; r < rows; r++) {
        const ry = 0.36 + r * (0.4 / rows);
        px(rkx, ry, rkw, 0.045, "#16323a");
        ctx.fillStyle = "#2f8fa0"; ctx.fillRect(ox+sw*rkx, oy+sh*(ry+0.04), sw*rkw, Math.max(1, sh*0.006)); // liseré cyan
        for (let f = 0; f < 4; f++) {
          const fx = rkx + 0.05 + f * (rkw - 0.1) / 3, fy = ry + 0.018;
          ctx.fillStyle = "#1f6a3a"; ctx.fillRect(ox+sw*(fx-0.006), oy+sh*(fy-0.02), sw*0.012, sh*0.022); // plant
          ctx.fillStyle = "#7ef0d8"; ctx.beginPath(); ctx.arc(ox+sw*fx, oy+sh*fy, sw*0.012, 0, Math.PI*2); ctx.fill(); // fruit (pigment)
          if (nF > 0.02) { // halo additif piloté par la nuit
            ctx.save(); ctx.globalCompositeOperation = "lighter";
            ctx.fillStyle = `rgba(120,240,220,${(nF*0.5).toFixed(2)})`;
            ctx.beginPath(); ctx.arc(ox+sw*fx, oy+sh*fy, sw*0.03, 0, Math.PI*2); ctx.fill();
            ctx.restore();
          }
        }
      }
      // Rail/gantry en haut
      px(rkx-0.04, 0.28, rkw+0.08, 0.025, "#22303a");
      // Bras robotisé : parcourt le rail (now) et descend cueillir par à-coups
      const t = (now/2600) % 1;
      const armx = rkx + 0.02 + (Math.sin(t*Math.PI*2)*0.5 + 0.5) * (rkw - 0.08);
      const dip = 0.3 + Math.max(0, Math.sin(now/430)) * 0.18;
      ctx.fillStyle = "#4a5a64"; px(armx-0.03, 0.278, 0.06, 0.03, "#4a5a64"); // chariot
      ctx.strokeStyle = "#3a4a54"; ctx.lineWidth = Math.max(1.5, sw*0.022); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(ox+sw*armx, oy+sh*0.3); ctx.lineTo(ox+sw*armx, oy+sh*dip); ctx.stroke();
      ctx.lineWidth = Math.max(1, sw*0.014); // pince
      ctx.beginPath(); ctx.moveTo(ox+sw*armx, oy+sh*dip); ctx.lineTo(ox+sw*(armx-0.02), oy+sh*(dip+0.03)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*armx, oy+sh*dip); ctx.lineTo(ox+sw*(armx+0.02), oy+sh*(dip+0.03)); ctx.stroke();
      ctx.lineCap = "square";
      // Lueur d'ambiance du bac (nuit)
      if (nF > 0.02) {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(90,220,230,${(nF*0.35).toFixed(2)})`;
        ctx.beginPath(); ctx.ellipse(ox+sw*0.19, oy+sh*0.76, sw*0.1, sh*0.05, 0, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }
    }
    return true;
  }
  if (id === "granaries_city") {
    if (band >= 7) { // silos/coffres opaques — organiques (Noo.) / orbitaux (Stel.) / cristallins (Dém.)
      const { cp, glow } = cosmicBase(ctx, ox, oy, sw, sh, px, band, now);
      for (let i = 0; i < 3; i++) {
        const x = 0.32 + i * 0.18, w = 0.07;
        const bob = band === 9 ? Math.sin(now / 950 + i * 1.4) * 0.022 : 0;   // lévitation Démiurge
        ctx.save(); ctx.translate(0, sh * bob);
        ctx.fillStyle = cp.mid; ctx.beginPath(); ctx.roundRect(ox + sw * (x - w), oy + sh * 0.4, sw * w * 2, sh * 0.42, sw * w * 0.8); ctx.fill();
        ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.roundRect(ox + sw * (x - w * 0.8), oy + sh * 0.42, sw * w * 1.6, sh * 0.15, sw * w * 0.6); ctx.fill();
        if (band === 9) { ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.moveTo(ox + sw * (x - w), oy + sh * 0.42); ctx.lineTo(ox + sw * x, oy + sh * 0.31); ctx.lineTo(ox + sw * (x + w), oy + sh * 0.42); ctx.closePath(); ctx.fill(); }
        else { ctx.fillStyle = cp.lite; ctx.fillRect(ox + sw * (x - w * 0.5), oy + sh * 0.45, sw * w, sh * 0.03); }
        ctx.restore();
        if (band === 7) { // pousse organique qui ondule au sommet (rime avec les foragers)
          const sway = Math.sin(now / 700 + i * 2.1) * 0.055, tipx = x + sway, tipy = 0.24;
          ctx.strokeStyle = cp.edge; ctx.lineCap = "round"; ctx.lineWidth = Math.max(1.5, sw * 0.04);
          ctx.beginPath(); ctx.moveTo(ox + sw * x, oy + sh * 0.4);
          ctx.quadraticCurveTo(ox + sw * (x + sway * 0.5), oy + sh * 0.32, ox + sw * tipx, oy + sh * tipy);
          ctx.stroke();
          ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(ox + sw * tipx, oy + sh * tipy, sw * 0.032, 0, Math.PI * 2); ctx.fill();
          glow(tipx, tipy, 0.07, 0.4);
        }
        glow(x, 0.5 + bob, w * 2.2, 0.18 + 0.08 * Math.sin(now / 720 + i * 1.7));  // halo qui respire
      }
      if (band === 9) { // éclats cristallins en orbite au-dessus des silos (Démiurge)
        for (let sft = 0; sft < 2; sft++) {
          const oa = now / 1200 + sft * Math.PI, ssx = 0.5 + Math.cos(oa) * 0.32, ssy = 0.4 + Math.sin(oa) * 0.12;
          ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(ox + sw * ssx, oy + sh * ssy, sw * 0.022, 0, Math.PI * 2); ctx.fill();
          glow(ssx, ssy, 0.05, 0.4);
        }
      }
      if (band === 8) { // anneau orbital + satellite-pod OPAQUE qui le parcourt
        const rt = -0.2 + 0.1 * Math.sin(now / 900);
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = `rgba(${cp.glow},0.5)`; ctx.lineWidth = Math.max(1, sw * 0.016); ctx.beginPath(); ctx.ellipse(ox + sw * 0.5, oy + sh * 0.45, sw * 0.42, sh * 0.08, rt, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        const ra = now / 1500, ax = Math.cos(ra) * sw * 0.42, ay = Math.sin(ra) * sh * 0.08;
        const mxp = ox + sw * 0.5 + ax * Math.cos(rt) - ay * Math.sin(rt);
        const myp = oy + sh * 0.45 + ax * Math.sin(rt) + ay * Math.cos(rt);
        ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.arc(mxp, myp, sw * 0.026, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(mxp, myp, sw * 0.014, 0, Math.PI * 2); ctx.fill();
      }
      return true;
    }
    // 4 stades suivant l'âge de la ville (ei = eraIndex 0–34), un tous les
    // 10 âges : greniers sur pilotis → halle de pierre → entrepôt industriel
    // → hub logistique automatisé. tier reste la richesse intra-stade.
    const stage = ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3;
    if (stage === 0) {
    // ── STADE 0 · GRENIERS — silos sur pilotis, grain doré, oiseau picoreur ──
    // Sol : tache de terre battue qui se FOND dans le terrain (comme la scène cueilleur).
    {
      const cxp = ox + sw * 0.5, cyp = oy + sh * 0.82, R = sw * 0.56, ky = (sh * 0.3) / R;
      ctx.save();
      ctx.translate(cxp, cyp); ctx.scale(1, ky); ctx.translate(-cxp, -cyp);
      const g = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, R);
      g.addColorStop(0, "rgba(36,26,12,0.82)");
      g.addColorStop(0.6, "rgba(36,26,12,0.46)");
      g.addColorStop(1, "rgba(36,26,12,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cxp, cyp, R, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // UN SEUL grand silo (sprite PixelLab « bien travaillé »), repli procédural.
    if (propReady('granary-prop-silo')) {
      const hFrac = 0.82;                                  // grand silo portrait (80×96)
      // Pieds posés sur la tache d'ombre (cyp ≈ 0.82) : on ancre la BASE du cadre plus
      // bas (0.92) pour compenser le padding transparent sous le silo dans le sprite.
      blitProp(ctx, ox, oy, sw, sh, 'granary-prop-silo', 0.5, 0.92 - hFrac / 2, hFrac * 80 / 96, hFrac);
    } else {
      const scx = 0.5, srad = 0.26, base = 0.72;
      ctx.fillStyle = "#4c3414";
      ctx.fillRect(ox + sw * (scx - srad * 0.7), oy + sh * base, sw * 0.04, sh * 0.13);
      ctx.fillRect(ox + sw * (scx + srad * 0.55), oy + sh * base, sw * 0.04, sh * 0.13);
      ctx.fillStyle = "#b89048";
      ctx.fillRect(ox + sw * (scx - srad), oy + sh * (base - srad * 1.4), sw * srad * 2, sh * srad * 1.4);
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.fillRect(ox + sw * (scx + srad * 0.5), oy + sh * (base - srad * 1.4), sw * srad * 0.5, sh * srad * 1.4);
      ctx.fillStyle = "#e8c860";
      ctx.beginPath(); ctx.ellipse(ox + sw * scx, oy + sh * (base - srad * 1.4), sw * srad * 0.92, sh * srad * 0.4, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#7a5618";
      ctx.beginPath();
      ctx.moveTo(ox + sw * (scx - srad * 1.15), oy + sh * (base - srad * 1.55));
      ctx.lineTo(ox + sw * scx, oy + sh * (base - srad * 2.4));
      ctx.lineTo(ox + sw * (scx + srad * 1.15), oy + sh * (base - srad * 1.55));
      ctx.closePath(); ctx.fill();
    }
    // (entrepôt = un seul silo statique : ni sacs, ni porteur, ni oiseau)
    } else if (stage === 1) {
      // ── STADE 1 · HALLE DE PIERRE — façade à arcade, toit de tuiles, fanion ──
      // La ville se pave et se fortifie : le grain se mesure en jarres, un commis
      // tient le registre. Pierre claire + tuiles (Âge de la Pierre/Couronne).
      px(0.0, 0.66, 1.0, 0.34, "#2a2620");            // pavé sombre
      const bx = 0.26, bw = 0.5, by = 0.38, bh = 0.32;
      // Corps maçonné
      px(bx, by, bw, bh, "#9a8c70");
      px(bx + bw * 0.64, by, bw * 0.36, bh, "rgba(0,0,0,0.12)"); // ombre côté droit
      // Assises de pierre (lits + joints décalés)
      ctx.strokeStyle = "rgba(58,48,34,0.42)"; ctx.lineWidth = Math.max(0.5, sw * 0.01);
      for (let r = 1; r < 5; r++) {
        const ry = by + bh * (r / 5);
        ctx.beginPath(); ctx.moveTo(ox + sw * bx, oy + sh * ry); ctx.lineTo(ox + sw * (bx + bw), oy + sh * ry); ctx.stroke();
      }
      for (let r = 0; r < 5; r++) {
        const ry0 = by + bh * (r / 5), ry1 = by + bh * ((r + 1) / 5), off = (r % 2) ? 0.5 : 0;
        for (let c = 0; c <= 4; c++) {
          const jx = bx + bw * ((c + off) / 4);
          if (jx > bx + 0.002 && jx < bx + bw - 0.002) { ctx.beginPath(); ctx.moveTo(ox + sw * jx, oy + sh * ry0); ctx.lineTo(ox + sw * jx, oy + sh * ry1); ctx.stroke(); }
        }
      }
      // Porte en arc plein cintre
      const dx = bx + bw * 0.5, dw2 = bw * 0.2, dtop = by + bh * 0.42, dbot = by + bh;
      ctx.fillStyle = "#241c14";
      ctx.beginPath();
      ctx.moveTo(ox + sw * (dx - dw2), oy + sh * dbot);
      ctx.lineTo(ox + sw * (dx - dw2), oy + sh * dtop);
      ctx.ellipse(ox + sw * dx, oy + sh * dtop, sw * dw2, sh * dw2 * 1.15, 0, Math.PI, 0);
      ctx.lineTo(ox + sw * (dx + dw2), oy + sh * dbot);
      ctx.closePath(); ctx.fill();
      // Clé de voûte
      ctx.fillStyle = "#b6a886";
      ctx.fillRect(ox + sw * (dx - 0.013), oy + sh * (dtop - dw2 * 1.15 - 0.012), sw * 0.026, sh * 0.032);
      // Toit de tuiles en bâtière
      ctx.fillStyle = "#9a4a2c";
      ctx.beginPath();
      ctx.moveTo(ox + sw * (bx - 0.03), oy + sh * by);
      ctx.lineTo(ox + sw * (bx + bw * 0.5), oy + sh * (by - 0.14));
      ctx.lineTo(ox + sw * (bx + bw + 0.03), oy + sh * by);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.16)"; // versant ombré (droite)
      ctx.beginPath();
      ctx.moveTo(ox + sw * (bx + bw * 0.5), oy + sh * (by - 0.14));
      ctx.lineTo(ox + sw * (bx + bw + 0.03), oy + sh * by);
      ctx.lineTo(ox + sw * (bx + bw * 0.5), oy + sh * by);
      ctx.closePath(); ctx.fill();
      // Rangs de tuiles
      ctx.strokeStyle = "rgba(60,24,12,0.4)"; ctx.lineWidth = Math.max(0.5, sw * 0.008);
      for (let tr = 1; tr <= 3; tr++) {
        const tt = tr / 4, ly = by - 0.14 * (1 - tt), lhw = (bw * 0.5 + 0.03) * tt;
        ctx.beginPath(); ctx.moveTo(ox + sw * (bx + bw * 0.5 - lhw), oy + sh * ly); ctx.lineTo(ox + sw * (bx + bw * 0.5 + lhw), oy + sh * ly); ctx.stroke();
      }
      // Fanion seigneurial au faîte (flamme qui ondule)
      const flagX = bx + bw * 0.5, flagBase = by - 0.14;
      ctx.strokeStyle = "#5a4a30"; ctx.lineWidth = Math.max(1, sw * 0.012); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(ox + sw * flagX, oy + sh * flagBase); ctx.lineTo(ox + sw * flagX, oy + sh * (flagBase - 0.1)); ctx.stroke();
      ctx.lineCap = "square";
      const wav = Math.sin(now / 420) * 0.014;
      ctx.fillStyle = "#9a2c3a";
      ctx.beginPath();
      ctx.moveTo(ox + sw * flagX, oy + sh * (flagBase - 0.1));
      ctx.lineTo(ox + sw * (flagX + 0.075), oy + sh * (flagBase - 0.082 + wav));
      ctx.lineTo(ox + sw * flagX, oy + sh * (flagBase - 0.062));
      ctx.closePath(); ctx.fill();
      // Jarres / amphores alignées (le grain se mesure ; densité selon tier)
      const nJars = 2 + Math.min(3, tier + 1);
      for (let j = 0; j < nJars; j++) {
        const jx = 0.14 + (j % 3) * 0.07, jy = 0.84 - Math.floor(j / 3) * 0.1;
        ctx.fillStyle = j % 2 ? "#b07840" : "#9a6838";
        ctx.beginPath(); ctx.ellipse(ox + sw * jx, oy + sh * jy, sw * 0.03, sh * 0.052, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,222,166,0.16)";
        ctx.beginPath(); ctx.ellipse(ox + sw * (jx - 0.009), oy + sh * (jy - 0.012), sw * 0.011, sh * 0.024, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = j % 2 ? "#8a5a2c" : "#7a4e26";
        ctx.fillRect(ox + sw * (jx - 0.008), oy + sh * (jy - 0.082), sw * 0.016, sh * 0.03);
      }
      // Commis : registre contre le corps, pointe les jarres en comptant (à-coups)
      {
        const px3 = 0.72, py3 = 0.82;
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath(); ctx.ellipse(ox + sw * px3, oy + sh * (py3 + 0.075), sw * 0.045, sh * 0.016, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#3a4a5a"; ctx.fillRect(ox + sw * (px3 - 0.026), oy + sh * (py3 - 0.05), sw * 0.052, sh * 0.12);
        ctx.fillStyle = "#c48c50"; ctx.beginPath(); ctx.arc(ox + sw * px3, oy + sh * (py3 - 0.075), sw * 0.024, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#7a5a30"; ctx.fillRect(ox + sw * (px3 + 0.02), oy + sh * (py3 - 0.03), sw * 0.03, sh * 0.042); // registre
      }
      // Tier 1+ : charrette à bras avec un sac, livraison à droite
      if (tier >= 1) {
        const cvx = 0.9, cvy = 0.8;
        ctx.fillStyle = "#6a4a1e"; ctx.fillRect(ox + sw * (cvx - 0.06), oy + sh * cvy, sw * 0.12, sh * 0.035);
        ctx.fillStyle = "#c8a058"; ctx.beginPath(); ctx.ellipse(ox + sw * cvx, oy + sh * (cvy - 0.02), sw * 0.04, sh * 0.04, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#2a1c0c";
        ctx.beginPath(); ctx.arc(ox + sw * (cvx - 0.04), oy + sh * (cvy + 0.05), sw * 0.024, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ox + sw * (cvx + 0.04), oy + sh * (cvy + 0.05), sw * 0.024, 0, Math.PI * 2); ctx.fill();
      }
    } else if (stage === 2) {
      // ── STADE 2 · ENTREPÔT INDUSTRIEL — brique, charpente fer, palan à poulie ──
      // Mise à l'échelle : un palan hisse des caisses vers la porte de chargement.
      // Brique sombre & métal (Âge du Marbre/Fonte) ; réverbère à gaz la nuit.
      px(0.0, 0.62, 1.0, 0.38, "#1c1a18");            // sol travaillé
      px(0.0, 0.82, 1.0, 0.18, "#141210");
      const bx = 0.24, bw = 0.52, by = 0.3, bh = 0.42;
      // Corps de brique + charpente fer
      px(bx, by, bw, bh, "#5a322a");
      px(bx + bw * 0.66, by, bw * 0.34, bh, "rgba(0,0,0,0.18)");
      ctx.strokeStyle = "rgba(20,10,6,0.4)"; ctx.lineWidth = Math.max(0.5, sw * 0.008);
      for (let r = 1; r < 8; r++) { const ry = by + bh * (r / 8); ctx.beginPath(); ctx.moveTo(ox + sw * bx, oy + sh * ry); ctx.lineTo(ox + sw * (bx + bw), oy + sh * ry); ctx.stroke(); }
      ctx.fillStyle = "#2a2622";
      ctx.fillRect(ox + sw * bx, oy + sh * by, sw * 0.02, sh * bh);
      ctx.fillRect(ox + sw * (bx + bw - 0.02), oy + sh * by, sw * 0.02, sh * bh);
      // Toit plat + corniche
      px(bx - 0.02, by - 0.03, bw + 0.04, 0.04, "#3a2620");
      // Cheminée + filet de fumée
      const chx = bx + 0.08;
      px(chx, by - 0.14, 0.05, 0.12, "#3a2c26");
      ctx.strokeStyle = "rgba(180,180,180,0.18)"; ctx.lineWidth = Math.max(1, sw * 0.016); ctx.lineCap = "round";
      const smoke = Math.sin(now / 600);
      ctx.beginPath();
      ctx.moveTo(ox + sw * (chx + 0.025), oy + sh * (by - 0.14));
      ctx.quadraticCurveTo(ox + sw * (chx + 0.025 + smoke * 0.03), oy + sh * (by - 0.22), ox + sw * (chx + 0.01 + smoke * 0.02), oy + sh * (by - 0.3));
      ctx.stroke(); ctx.lineCap = "square";
      // Fenêtres (éclairées la nuit via litWarm)
      for (let wcol = 0; wcol < 3; wcol++) {
        const wx2 = bx + 0.14 + wcol * 0.12;
        px(wx2, by + 0.08, 0.06, 0.08, litWarm);
        strokeRect(wx2, by + 0.08, 0.06, 0.08, "rgba(20,10,6,0.6)");
      }
      // Porte de chargement en hauteur + poutre de levage en saillie
      const beamY = by + 0.02, beamX = bx + bw * 0.5;
      px(beamX - 0.05, beamY + 0.02, 0.12, 0.16, "#1a1410");      // baie sombre
      px(beamX - 0.02, beamY - 0.02, 0.22, 0.025, "#2a2420");     // poutre
      const ropeX = beamX + 0.18;
      ctx.fillStyle = "#3a3430"; ctx.beginPath(); ctx.arc(ox + sw * ropeX, oy + sh * (beamY + 0.01), sw * 0.018, 0, Math.PI * 2); ctx.fill(); // poulie
      // Caisse cerclée hissée (monte puis redescend)
      const cyc = (now / 4200) % 1, up = cyc < 0.5, m = up ? cyc * 2 : (1 - cyc) * 2;
      const crateY = 0.72 - m * 0.32;
      ctx.strokeStyle = "#15110c"; ctx.lineWidth = Math.max(1, sw * 0.01);
      ctx.beginPath(); ctx.moveTo(ox + sw * ropeX, oy + sh * (beamY + 0.01)); ctx.lineTo(ox + sw * ropeX, oy + sh * crateY); ctx.stroke();
      px(ropeX - 0.045, crateY, 0.09, 0.075, "#7a5226");
      strokeRect(ropeX - 0.045, crateY, 0.09, 0.075, "rgba(20,12,4,0.6)");
      ctx.strokeStyle = "#3a2a14"; ctx.lineWidth = Math.max(0.5, sw * 0.012);
      ctx.beginPath(); ctx.moveTo(ox + sw * (ropeX - 0.045), oy + sh * (crateY + 0.037)); ctx.lineTo(ox + sw * (ropeX + 0.045), oy + sh * (crateY + 0.037)); ctx.stroke();
      // Pile de caisses palettisées au sol (hauteur selon tier)
      const stackN = 2 + Math.min(3, tier + 1);
      for (let s = 0; s < stackN; s++) {
        const col = s % 2, row = Math.floor(s / 2);
        const sx = 0.16 + col * 0.1, sy = 0.78 - row * 0.075;
        px(sx, sy, 0.09, 0.07, col ? "#8a5a28" : "#7a5226");
        strokeRect(sx, sy, 0.09, 0.07, "rgba(20,12,4,0.55)");
        ctx.strokeStyle = "#3a2a14"; ctx.lineWidth = Math.max(0.5, sw * 0.01);
        ctx.beginPath(); ctx.moveTo(ox + sw * sx, oy + sh * (sy + 0.035)); ctx.lineTo(ox + sw * (sx + 0.09), oy + sh * (sy + 0.035)); ctx.stroke();
      }
      px(0.15, 0.85, 0.22, 0.025, "#4a3418");           // palette de bois sous la pile
      // Ouvrier au sol qui guide la charge (bras tendu vers la caisse)
      {
        const wx = ropeX - 0.02, wy = 0.8;
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.beginPath(); ctx.ellipse(ox + sw * wx, oy + sh * (wy + 0.075), sw * 0.045, sh * 0.016, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#2e2820"; ctx.fillRect(ox + sw * (wx - 0.022), oy + sh * (wy + 0.02), sw * 0.02, sh * 0.05); ctx.fillRect(ox + sw * (wx + 0.004), oy + sh * (wy + 0.02), sw * 0.02, sh * 0.05);
        ctx.fillStyle = "#4a3a2a"; ctx.fillRect(ox + sw * (wx - 0.026), oy + sh * (wy - 0.06), sw * 0.052, sh * 0.085);
        ctx.fillStyle = "#c48c50"; ctx.beginPath(); ctx.arc(ox + sw * wx, oy + sh * (wy - 0.085), sw * 0.024, 0, Math.PI * 2); ctx.fill();
      }
      // Réverbère à gaz (halo chaud la nuit, dérivé de litWarm)
      const lampX = 0.9, lampY = 0.5;
      ctx.strokeStyle = "#2a2622"; ctx.lineWidth = Math.max(1, sw * 0.016);
      ctx.beginPath(); ctx.moveTo(ox + sw * lampX, oy + sh * 0.84); ctx.lineTo(ox + sw * lampX, oy + sh * lampY); ctx.stroke();
      px(lampX - 0.018, lampY - 0.03, 0.036, 0.04, "#3a3026");
      const nF2 = parseFloat(litWarm.slice(litWarm.lastIndexOf(",") + 1)) || 0;
      if (nF2 > 0.02) {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(255,200,120,${(nF2 * 0.5).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(ox + sw * lampX, oy + sh * (lampY - 0.01), sw * 0.05, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    } else {
      // ── STADE 3 · HUB LOGISTIQUE AUTOMATISÉ — conteneurs, portique robotisé ──
      // Néon froid, plus aucun humain : un portique-navette déplace les palettes
      // le long d'un rail. Halo cyan piloté par la nuit (litGold → CM.nightF).
      const nF = parseFloat(litGold.slice(litGold.lastIndexOf(",") + 1)) || 0;
      px(0.0, 0.6, 1.0, 0.4, "#10161a");
      px(0.0, 0.82, 1.0, 0.18, "#0c1014");
      // Pile de modules-conteneurs (hauteur selon tier)
      const cols = 3, rows = 2 + Math.min(2, tier);
      const palette = ["#27414a", "#2e4a44", "#33414e", "#2a4650"];
      const gx0 = 0.14, cw = 0.2, chh = 0.1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cxp = gx0 + c * (cw + 0.005), cyp = 0.78 - r * (chh + 0.006) - chh;
          px(cxp, cyp, cw, chh, palette[(r + c) % palette.length]);
          strokeRect(cxp, cyp, cw, chh, "rgba(8,14,18,0.7)");
          // Nervures de conteneur
          ctx.strokeStyle = "rgba(8,14,18,0.5)"; ctx.lineWidth = Math.max(0.5, sw * 0.006);
          for (let g = 1; g < 4; g++) { const gxr = cxp + cw * (g / 4); ctx.beginPath(); ctx.moveTo(ox + sw * gxr, oy + sh * cyp); ctx.lineTo(ox + sw * gxr, oy + sh * (cyp + chh)); ctx.stroke(); }
          // Diode d'état cyan (clignote ; halo additif la nuit)
          const blink = (Math.sin(now / 540 + (r * 3 + c) * 1.3) > 0.3) ? 1 : 0.35;
          ctx.fillStyle = "#7ef0d8"; ctx.beginPath(); ctx.arc(ox + sw * (cxp + 0.02), oy + sh * (cyp + 0.02), sw * 0.008, 0, Math.PI * 2); ctx.fill();
          if (nF > 0.02) {
            ctx.save(); ctx.globalCompositeOperation = "lighter";
            ctx.fillStyle = `rgba(120,240,220,${(nF * 0.4 * blink).toFixed(2)})`;
            ctx.beginPath(); ctx.arc(ox + sw * (cxp + 0.02), oy + sh * (cyp + 0.02), sw * 0.022, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          }
        }
      }
      // Portique : montants + rail horizontal en hauteur
      const railY = 0.3, railX0 = 0.1, railX1 = 0.9;
      px(railX0, railY, railX1 - railX0, 0.022, "#22303a");
      px(railX0 - 0.005, railY, 0.022, 0.5, "#1c262c");
      px(railX1 - 0.017, railY, 0.022, 0.5, "#1c262c");
      ctx.fillStyle = "#2f8fa0"; ctx.fillRect(ox + sw * railX0, oy + sh * (railY + 0.022), sw * (railX1 - railX0), Math.max(1, sh * 0.005)); // liseré cyan
      // Navette qui parcourt le rail + hisse une palette par à-coups
      const t = (now / 3000) % 1;
      const trolX = railX0 + 0.06 + (Math.sin(t * Math.PI * 2) * 0.5 + 0.5) * (railX1 - railX0 - 0.16);
      const dip = railY + 0.06 + Math.max(0, Math.sin(now / 480)) * 0.22;
      px(trolX - 0.035, railY - 0.005, 0.07, 0.03, "#3a4a54"); // chariot
      ctx.strokeStyle = "#3a4a54"; ctx.lineWidth = Math.max(1.5, sw * 0.018); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(ox + sw * trolX, oy + sh * (railY + 0.025)); ctx.lineTo(ox + sw * trolX, oy + sh * dip); ctx.stroke();
      ctx.lineCap = "square";
      // Palette suspendue + liseré cyan
      px(trolX - 0.045, dip, 0.09, 0.04, "#2a4650");
      strokeRect(trolX - 0.045, dip, 0.09, 0.04, "rgba(8,14,18,0.7)");
      ctx.fillStyle = "#7ef0d8"; ctx.fillRect(ox + sw * (trolX - 0.04), oy + sh * (dip + 0.036), sw * 0.08, Math.max(1, sh * 0.004));
      // Lueur d'ambiance au sol sous la navette (nuit)
      if (nF > 0.02) {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(90,220,230,${(nF * 0.3).toFixed(2)})`;
        ctx.beginPath(); ctx.ellipse(ox + sw * trolX, oy + sh * 0.84, sw * 0.1, sh * 0.04, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    return true;
  }
  if (id === "caravans") {
    if (band >= 7) { // PORTAIL DE TRANSIT cosmique : pod de fret qui traverse (motion franche)
      const { cp, glow } = cosmicBase(ctx, ox, oy, sw, sh, px, band);
      const tt = (now / 2600) % 1, k = tt < 0.5 ? tt * 2 : (1 - tt) * 2; // navette triangle 0..1..0
      const podx = 0.2 + k * 0.6;
      if (band === 7) { // arche organique vivante : 2 piliers courbes + linteau
        for (const s of [-1, 1]) {
          ctx.strokeStyle = cp.mid; ctx.lineCap = "round"; ctx.lineWidth = Math.max(2, sw * 0.07);
          ctx.beginPath(); ctx.moveTo(ox + sw * (0.5 + s * 0.26), oy + sh * 0.82); ctx.quadraticCurveTo(ox + sw * (0.5 + s * 0.3), oy + sh * 0.46, ox + sw * (0.5 + s * 0.12), oy + sh * 0.32); ctx.stroke();
        }
        ctx.strokeStyle = cp.edge; ctx.lineWidth = Math.max(1.5, sw * 0.05); ctx.beginPath(); ctx.moveTo(ox + sw * 0.38, oy + sh * 0.33); ctx.quadraticCurveTo(ox + sw * 0.5, oy + sh * 0.25, ox + sw * 0.62, oy + sh * 0.33); ctx.stroke();
        glow(0.5, 0.32, 0.16, 0.25 + 0.15 * Math.sin(now / 700));
      } else if (band === 8) { // portail-anneau orbital : montants + anneau + satellite
        for (const s of [-1, 1]) { ctx.fillStyle = cp.mid; ctx.fillRect(ox + sw * (0.5 + s * 0.28) - sw * 0.025, oy + sh * 0.36, sw * 0.05, sh * 0.46); }
        ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.ellipse(ox + sw * 0.5, oy + sh * 0.5, sw * 0.22, sh * 0.26, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = cp.deep; ctx.beginPath(); ctx.ellipse(ox + sw * 0.5, oy + sh * 0.5, sw * 0.14, sh * 0.17, 0, 0, Math.PI * 2); ctx.fill();
        const ra = now / 1500, mx = 0.5 + Math.cos(ra) * 0.22, my = 0.5 + Math.sin(ra) * 0.26;
        ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(ox + sw * mx, oy + sh * my, sw * 0.03, 0, Math.PI * 2); ctx.fill();
        glow(mx, my, 0.07, 0.5);
      } else { // arche cristalline : 2 pylônes facettés + clé de voûte flottante
        for (const s of [-1, 1]) {
          ctx.save(); ctx.translate(ox + sw * (0.5 + s * 0.26), oy + sh * 0.58);
          ctx.fillStyle = cp.mid; ctx.beginPath(); ctx.moveTo(0, -sh * 0.26); ctx.lineTo(sw * 0.06, 0); ctx.lineTo(0, sh * 0.24); ctx.lineTo(-sw * 0.06, 0); ctx.closePath(); ctx.fill();
          ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.moveTo(0, -sh * 0.26); ctx.lineTo(0, sh * 0.24); ctx.lineTo(-sw * 0.06, 0); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        const cb = Math.sin(now / 900) * 0.025;
        ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.moveTo(ox + sw * 0.5, oy + sh * (0.26 + cb)); ctx.lineTo(ox + sw * 0.57, oy + sh * (0.34 + cb)); ctx.lineTo(ox + sw * 0.5, oy + sh * (0.42 + cb)); ctx.lineTo(ox + sw * 0.43, oy + sh * (0.34 + cb)); ctx.closePath(); ctx.fill();
        glow(0.5, 0.34 + cb, 0.12, 0.3);
      }
      // Pod de fret qui traverse le portail (toutes époques) — mouvement horizontal franc
      ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.roundRect(ox + sw * podx - sw * 0.05, oy + sh * 0.72, sw * 0.1, sh * 0.08, sw * 0.02); ctx.fill();
      ctx.fillStyle = cp.lite; ctx.fillRect(ox + sw * podx - sw * 0.03, oy + sh * 0.735, sw * 0.06, sh * 0.02);
      glow(podx, 0.75, 0.07, 0.35);
      return true;
    }
    // 4 stades suivant l'âge de la ville (ei = eraIndex 0–34), un tous les
    // 10 âges : mulet bâté → convoi caravanier pavé → fret industriel à vapeur
    // → logistique autonome néon. tier reste la richesse intra-stade (nombre de
    // bêtes/charrettes/wagons/conteneurs). Lumières via CM.nightF : nF dérivé de
    // litGold (halos additifs), lanternes chaudes via litWarm aux stades 1 et 2.
    const stage = ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3;
    const nF = parseFloat(litGold.slice(litGold.lastIndexOf(",") + 1)) || 0;
    if (stage === 0) {
      if (muleReady()) {
      // ── STADE 0 · CARAVANE EN MARCHE — mulet bâté pixel mené par le marchand ──
      // Piste battue (tache fondue large) + caravane qui plie la route (va-et-vient).
      {
        const cxp = ox + sw * 0.5, cyp = oy + sh * 0.84, R = sw * 0.62, ky = (sh * 0.2) / R;
        ctx.save();
        ctx.translate(cxp, cyp); ctx.scale(1, ky); ctx.translate(-cxp, -cyp);
        const g = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, R);
        g.addColorStop(0, "rgba(36,26,12,0.72)");
        g.addColorStop(0.65, "rgba(36,26,12,0.4)");
        g.addColorStop(1, "rgba(36,26,12,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cxp, cyp, R, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      drawCaravan(ctx, ox, oy, sw, sh, now);
      } else {
      // ── STADE 0 · MULET BÂTÉ — bête de somme menée par un marchand ──────
      // Le commerce le plus ancien : on charge une bête et on part sur la piste.
      px(0.0, 0.6, 1.0, 0.4, "#241a0c");           // piste de terre
      px(0.0, 0.8, 1.0, 0.2, "#2c2010");           // ornière plus claire
      ctx.fillStyle = "rgba(20,14,6,0.5)";          // cailloux épars
      for (const [sx, sy] of [[0.16, 0.9], [0.66, 0.88], [0.92, 0.84]]) { ctx.beginPath(); ctx.arc(ox+sw*sx, oy+sh*sy, sw*0.012, 0, Math.PI*2); ctx.fill(); }
      // === MULET (vue de côté, tête à gauche) ===
      const bob = Math.sin(now / 720) * 0.012;      // la tête dodeline
      const tail = Math.sin(now / 300) * 0.028;     // la queue bat
      const legSh = Math.sin(now / 900) * 0.004;    // léger report de poids
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath(); ctx.ellipse(ox+sw*0.52, oy+sh*0.72, sw*0.2, sh*0.05, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#3f2a14";                     // pattes
      for (const [lx, sg] of [[0.42, 1], [0.48, -1], [0.58, 1], [0.64, -1]]) ctx.fillRect(ox+sw*(lx+sg*legSh), oy+sh*0.55, sw*0.03, sh*0.16);
      ctx.strokeStyle = "#2e1d0c"; ctx.lineWidth = Math.max(1, sw*0.02); ctx.lineCap = "round";  // queue
      ctx.beginPath(); ctx.moveTo(ox+sw*0.67, oy+sh*0.45); ctx.quadraticCurveTo(ox+sw*0.72, oy+sh*0.54, ox+sw*(0.71+tail), oy+sh*0.62); ctx.stroke();
      ctx.lineCap = "square";
      ctx.fillStyle = "#6a4a2a";                     // corps
      ctx.beginPath(); ctx.ellipse(ox+sw*0.53, oy+sh*0.48, sw*0.16, sh*0.1, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.beginPath(); ctx.ellipse(ox+sw*0.53, oy+sh*0.52, sw*0.15, sh*0.05, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = "#6a4a2a";                     // encolure
      ctx.beginPath();
      ctx.moveTo(ox+sw*0.4, oy+sh*0.42); ctx.lineTo(ox+sw*0.33, oy+sh*(0.32+bob));
      ctx.lineTo(ox+sw*0.29, oy+sh*(0.35+bob)); ctx.lineTo(ox+sw*0.39, oy+sh*0.5);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(ox+sw*0.28, oy+sh*(0.35+bob), sw*0.055, sh*0.04, -0.5, 0, Math.PI*2); ctx.fill();  // tête
      ctx.fillStyle = "#432c14"; ctx.beginPath(); ctx.ellipse(ox+sw*0.245, oy+sh*(0.38+bob), sw*0.025, sh*0.02, 0, 0, Math.PI*2); ctx.fill();  // museau
      ctx.fillStyle = "#5a3c20";                     // oreilles
      ctx.beginPath(); ctx.moveTo(ox+sw*0.29, oy+sh*(0.31+bob)); ctx.lineTo(ox+sw*0.275, oy+sh*(0.25+bob)); ctx.lineTo(ox+sw*0.305, oy+sh*(0.3+bob)); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.32, oy+sh*(0.31+bob)); ctx.lineTo(ox+sw*0.315, oy+sh*(0.245+bob)); ctx.lineTo(ox+sw*0.345, oy+sh*(0.3+bob)); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#140d05"; ctx.beginPath(); ctx.arc(ox+sw*0.3, oy+sh*(0.35+bob), sw*0.008, 0, Math.PI*2); ctx.fill();  // œil
      // Tapis de bât + ballots de marchandise (nombre selon tier)
      ctx.fillStyle = "#a8442a"; ctx.fillRect(ox+sw*0.44, oy+sh*0.4, sw*0.2, sh*0.05);
      ctx.fillStyle = "rgba(255,210,150,0.2)"; ctx.fillRect(ox+sw*0.44, oy+sh*0.4, sw*0.2, sh*0.012);
      const nBales = 2 + Math.min(3, tier);
      for (let b = 0; b < nBales; b++) {
        const bx = 0.46 + b * (0.16 / nBales);
        ctx.fillStyle = b % 2 ? "#8a5a22" : "#9a6a2c";
        ctx.beginPath(); ctx.ellipse(ox+sw*bx, oy+sh*0.37, sw*0.05, sh*0.05, 0, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = "rgba(40,24,8,0.5)"; ctx.lineWidth = Math.max(0.5, sw*0.012);
        ctx.beginPath(); ctx.moveTo(ox+sw*(bx-0.03), oy+sh*0.37); ctx.lineTo(ox+sw*(bx+0.03), oy+sh*0.37); ctx.stroke();
      }
      // Pile de marchandises où le marchand se ravitaille
      ctx.fillStyle = "#9a6828"; ctx.fillRect(ox+sw*0.84, oy+sh*0.64, sw*0.11, sh*0.12);
      ctx.fillStyle = "#7a5018"; ctx.fillRect(ox+sw*0.84, oy+sh*0.58, sw*0.11, sh*0.06);
      strokeRect(0.84, 0.64, 0.11, 0.12, "rgba(40,24,8,0.5)");
      // Marchand : navette pile (0.84) → mulet (0.44), un ballot à l'aller
      const cyc = (now / 5600) % 1, going = cyc < 0.5;
      const k = going ? cyc * 2 : (1 - cyc) * 2;
      const wx = 0.84 - k * 0.4, wy = 0.78, step = Math.sin(now / 130) * 0.014;
      ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.beginPath(); ctx.ellipse(ox+sw*wx, oy+sh*(wy+0.075), sw*0.045, sh*0.018, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#2e2010"; ctx.fillRect(ox+sw*(wx-0.022+step), oy+sh*(wy+0.02), sw*0.02, sh*0.05); ctx.fillRect(ox+sw*(wx+0.004-step), oy+sh*(wy+0.02), sw*0.02, sh*0.05);
      ctx.fillStyle = "#5a3c1a"; ctx.fillRect(ox+sw*(wx-0.03), oy+sh*(wy-0.06), sw*0.06, sh*0.085);
      ctx.fillStyle = "#c48c50"; ctx.beginPath(); ctx.arc(ox+sw*wx, oy+sh*(wy-0.085), sw*0.026, 0, Math.PI*2); ctx.fill();
      if (going) { ctx.fillStyle = "#9a6a2c"; ctx.beginPath(); ctx.ellipse(ox+sw*(wx-0.012), oy+sh*(wy-0.115), sw*0.036, sh*0.026, -0.35, 0, Math.PI*2); ctx.fill(); }
      }
    } else if (stage === 1) {
      // ── STADE 1 · CONVOI CARAVANIER — file de charrettes sur route pavée ──
      // La ville se pave et règne : le commerce s'organise en convois gardés.
      px(0.0, 0.58, 1.0, 0.42, "#2a2418");          // accotement
      px(0.0, 0.68, 1.0, 0.24, "#4a4438");          // route pavée
      for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) {  // pavés
        strokeRect(c*0.15 + (r % 2) * 0.07 - 0.05, 0.7 + r*0.07, 0.13, 0.06, "rgba(20,18,12,0.4)");
      }
      // Borne milliaire
      ctx.fillStyle = "#8a8076"; ctx.fillRect(ox+sw*0.06, oy+sh*0.5, sw*0.05, sh*0.18);
      ctx.fillStyle = "#6a6258"; ctx.beginPath(); ctx.arc(ox+sw*0.085, oy+sh*0.5, sw*0.025, Math.PI, 0); ctx.fill();
      const roll = Math.sin(now / 2400) * 0.015;    // le convoi avance/recule doucement
      const spin = now / 320;                        // rotation des roues
      const drawCart = (cxC) => {
        const cy = 0.56;
        ctx.fillStyle = "#7a5018"; ctx.fillRect(ox+sw*(cxC-0.1), oy+sh*cy, sw*0.2, sh*0.1);
        ctx.fillStyle = "#5a3a0c"; ctx.fillRect(ox+sw*(cxC-0.1), oy+sh*cy, sw*0.2, sh*0.018);
        ctx.fillStyle = "#c8a840";                   // bâche bombée
        ctx.beginPath(); ctx.moveTo(ox+sw*(cxC-0.09), oy+sh*cy);
        ctx.bezierCurveTo(ox+sw*(cxC-0.09), oy+sh*(cy-0.12), ox+sw*(cxC+0.09), oy+sh*(cy-0.12), ox+sw*(cxC+0.09), oy+sh*cy);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.fillRect(ox+sw*(cxC+0.03), oy+sh*(cy-0.1), sw*0.06, sh*0.1);
        for (const wrx of [cxC-0.06, cxC+0.06]) {    // roues à rayons tournants
          ctx.fillStyle = "#2a1606"; ctx.beginPath(); ctx.arc(ox+sw*wrx, oy+sh*(cy+0.12), sw*0.045, 0, Math.PI*2); ctx.fill();
          ctx.strokeStyle = "#5a3210"; ctx.lineWidth = Math.max(0.5, sw*0.012);
          for (let ri = 0; ri < 4; ri++) { const ra = spin + ri*Math.PI/4; ctx.beginPath(); ctx.moveTo(ox+sw*wrx, oy+sh*(cy+0.12)); ctx.lineTo(ox+sw*(wrx+Math.cos(ra)*0.042), oy+sh*(cy+0.12+Math.sin(ra)*0.042)); ctx.stroke(); }
          ctx.strokeStyle = "#4a2808"; ctx.lineWidth = Math.max(1, sw*0.016); ctx.beginPath(); ctx.arc(ox+sw*wrx, oy+sh*(cy+0.12), sw*0.045, 0, Math.PI*2); ctx.stroke();
        }
      };
      const nCarts = 1 + Math.min(2, tier + 1);
      const baseX = [0.58, 0.82, 1.04];
      for (let c = 0; c < nCarts; c++) drawCart(baseX[c] + roll);
      // Cheval de trait en tête
      const hx = 0.22 + roll, hbob = Math.sin(now / 520) * 0.008, trot = Math.sin(now / 220) * 0.01;
      ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.beginPath(); ctx.ellipse(ox+sw*hx, oy+sh*0.74, sw*0.13, sh*0.035, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#3a2410"; for (const [lx, sg] of [[hx-0.07, 1], [hx-0.03, -1], [hx+0.05, 1], [hx+0.08, -1]]) ctx.fillRect(ox+sw*(lx+sg*trot), oy+sh*0.6, sw*0.022, sh*0.14);
      ctx.fillStyle = "#5a3a1e"; ctx.beginPath(); ctx.ellipse(ox+sw*hx, oy+sh*0.54, sw*0.12, sh*0.075, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath();                               // encolure + tête
      ctx.moveTo(ox+sw*(hx-0.09), oy+sh*0.5); ctx.lineTo(ox+sw*(hx-0.15), oy+sh*(0.4+hbob));
      ctx.lineTo(ox+sw*(hx-0.12), oy+sh*(0.4+hbob)); ctx.lineTo(ox+sw*(hx-0.06), oy+sh*0.52);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(ox+sw*(hx-0.15), oy+sh*(0.4+hbob), sw*0.045, sh*0.03, -0.6, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#2e1c0c"; ctx.fillRect(ox+sw*(hx-0.12), oy+sh*(0.4+hbob), sw*0.02, sh*0.1);  // crinière
      ctx.strokeStyle = "#2e1c0c"; ctx.lineWidth = Math.max(1, sw*0.012);  // trait
      ctx.beginPath(); ctx.moveTo(ox+sw*(hx+0.1), oy+sh*0.54); ctx.lineTo(ox+sw*(0.48+roll), oy+sh*0.6); ctx.stroke();
      // Lanterne suspendue à la charrette de tête (chaude la nuit)
      const lampx = 0.49 + roll, lampy = 0.46;
      ctx.strokeStyle = "#3a2a16"; ctx.lineWidth = Math.max(0.5, sw*0.01);
      ctx.beginPath(); ctx.moveTo(ox+sw*lampx, oy+sh*0.44); ctx.lineTo(ox+sw*lampx, oy+sh*lampy); ctx.stroke();
      ctx.fillStyle = "#3a2a16"; ctx.fillRect(ox+sw*(lampx-0.012), oy+sh*lampy, sw*0.024, sh*0.03);
      ctx.fillStyle = litWarm; ctx.fillRect(ox+sw*(lampx-0.008), oy+sh*(lampy+0.004), sw*0.016, sh*0.022);
      if (nF > 0.02) {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(255,180,90,${(nF*0.42).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(ox+sw*lampx, oy+sh*(lampy+0.015), sw*0.07, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }
      // Garde en faction (tier 1+)
      if (tier >= 1) {
        const gx = 0.36, gsway = Math.sin(now / 700) * 0.006;
        ctx.fillStyle = "#3a3a44"; ctx.fillRect(ox+sw*(gx-0.024+gsway), oy+sh*0.62, sw*0.05, sh*0.1);
        ctx.fillStyle = "#c49060"; ctx.beginPath(); ctx.arc(ox+sw*(gx+gsway), oy+sh*0.6, sw*0.028, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = "#6a6258"; ctx.lineWidth = Math.max(1, sw*0.014);  // lance
        ctx.beginPath(); ctx.moveTo(ox+sw*(gx+0.04), oy+sh*0.5); ctx.lineTo(ox+sw*(gx+0.04), oy+sh*0.74); ctx.stroke();
      }
      // Porteur déchargeant une amphore vers une pile (tier 2+, navette)
      if (tier >= 2) {
        for (let a = 0; a < 3; a++) { ctx.fillStyle = "#9a6a3a"; ctx.beginPath(); ctx.ellipse(ox+sw*(0.92 - (a%2)*0.05), oy+sh*(0.82 - a*0.045), sw*0.022, sh*0.04, 0, 0, Math.PI*2); ctx.fill(); }
        const pc = (now / 4800) % 1, pgo = pc < 0.5, pk = pgo ? pc*2 : (1-pc)*2;
        const ppx = 0.72 + pk * 0.16, ppy = 0.8, pstep = Math.sin(now / 140) * 0.012;
        ctx.fillStyle = "#2e2010"; ctx.fillRect(ox+sw*(ppx-0.02+pstep), oy+sh*(ppy+0.02), sw*0.018, sh*0.045); ctx.fillRect(ox+sw*(ppx+0.004-pstep), oy+sh*(ppy+0.02), sw*0.018, sh*0.045);
        ctx.fillStyle = "#5a3c1a"; ctx.fillRect(ox+sw*(ppx-0.028), oy+sh*(ppy-0.05), sw*0.056, sh*0.08);
        ctx.fillStyle = "#c48c50"; ctx.beginPath(); ctx.arc(ox+sw*ppx, oy+sh*(ppy-0.07), sw*0.024, 0, Math.PI*2); ctx.fill();
        if (pgo) { ctx.fillStyle = "#9a6a3a"; ctx.beginPath(); ctx.ellipse(ox+sw*(ppx+0.03), oy+sh*(ppy-0.06), sw*0.02, sh*0.036, 0.3, 0, Math.PI*2); ctx.fill(); }
      }
    } else if (stage === 2) {
      // ── STADE 2 · FRET INDUSTRIEL — wagon à vapeur sur rails + quai ──────
      // Fonte et vapeur : la marchandise roule sur rail, fumée et acier.
      px(0.0, 0.6, 1.0, 0.4, "#1c1a16");            // ballast sombre
      ctx.fillStyle = "#3a352e";                     // rails
      ctx.fillRect(ox, oy+sh*0.72, sw, sh*0.012); ctx.fillRect(ox, oy+sh*0.78, sw, sh*0.012);
      ctx.fillStyle = "#241f18";                     // traverses
      for (let t = 0; t < 8; t++) ctx.fillRect(ox+sw*(0.02+t*0.125), oy+sh*0.71, sw*0.03, sh*0.09);
      // Locomotive de fret (corps métal)
      const lx0 = 0.34, ly0 = 0.4;
      ctx.fillStyle = "#3a4048"; ctx.fillRect(ox+sw*lx0, oy+sh*ly0, sw*0.46, sh*0.26);
      ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(ox+sw*(lx0+0.34), oy+sh*ly0, sw*0.12, sh*0.26);
      ctx.fillStyle = "#2a2f36"; ctx.fillRect(ox+sw*lx0, oy+sh*(ly0-0.06), sw*0.16, sh*0.06);  // cabine
      ctx.fillStyle = litWarm; ctx.fillRect(ox+sw*(lx0+0.03), oy+sh*(ly0-0.04), sw*0.05, sh*0.05);  // fenêtre chaude
      // Cheminée + panaches de fumée qui montent et se dissipent
      const stackx = lx0 + 0.4;
      ctx.fillStyle = "#22272d"; ctx.fillRect(ox+sw*(stackx-0.03), oy+sh*(ly0-0.1), sw*0.06, sh*0.1);
      for (let s = 0; s < 4; s++) {
        const sp = ((now / 1600) + s * 0.25) % 1;
        ctx.fillStyle = `rgba(120,116,110,${(0.4 * (1 - sp)).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(ox+sw*(stackx + Math.sin(sp*3)*0.03), oy+sh*(ly0 - 0.12 - sp*0.26), sw*(0.02 + sp*0.05), 0, Math.PI*2); ctx.fill();
      }
      // Roues motrices + bielle qui tourne
      const spin2 = now / 240, wy2 = 0.7;
      const wheels = [lx0+0.08, lx0+0.22, lx0+0.36];
      for (const wrx of wheels) {
        ctx.fillStyle = "#1a1e22"; ctx.beginPath(); ctx.arc(ox+sw*wrx, oy+sh*wy2, sw*0.05, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = "#4a525a"; ctx.lineWidth = Math.max(1, sw*0.014); ctx.beginPath(); ctx.arc(ox+sw*wrx, oy+sh*wy2, sw*0.05, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = "#6a727a"; ctx.beginPath(); ctx.arc(ox+sw*(wrx+Math.cos(spin2)*0.03), oy+sh*(wy2+Math.sin(spin2)*0.03), sw*0.01, 0, Math.PI*2); ctx.fill();
      }
      ctx.strokeStyle = "#5a626a"; ctx.lineWidth = Math.max(1.5, sw*0.02); ctx.lineCap = "round";  // bielle
      ctx.beginPath(); ctx.moveTo(ox+sw*(wheels[0]+Math.cos(spin2)*0.03), oy+sh*(wy2+Math.sin(spin2)*0.03)); ctx.lineTo(ox+sw*(wheels[2]+Math.cos(spin2)*0.03), oy+sh*(wy2+Math.sin(spin2)*0.03)); ctx.stroke();
      ctx.lineCap = "square";
      // Caisses + barils sur le wagon (densité selon tier)
      const nCrates = 2 + Math.min(3, tier + 1);
      for (let c = 0; c < nCrates; c++) {
        const ccx = lx0 + 0.04 + (c % 3) * 0.13, ccy = ly0 - 0.02 - Math.floor(c / 3) * 0.08;
        ctx.fillStyle = c % 2 ? "#8a5a22" : "#9a6a2c"; ctx.fillRect(ox+sw*ccx, oy+sh*ccy, sw*0.1, sh*0.07);
        strokeRect(ccx, ccy, 0.1, 0.07, "rgba(30,20,8,0.5)");
      }
      // Quai de chargement + lampadaire chaud
      ctx.fillStyle = "#3a352e"; ctx.fillRect(ox+sw*0.0, oy+sh*0.82, sw*0.24, sh*0.18);
      ctx.fillStyle = "#2a2620"; ctx.fillRect(ox+sw*0.18, oy+sh*0.4, sw*0.02, sh*0.42);  // mât
      ctx.fillStyle = "#1a1814"; ctx.fillRect(ox+sw*0.16, oy+sh*0.38, sw*0.06, sh*0.03);
      ctx.fillStyle = litWarm; ctx.beginPath(); ctx.arc(ox+sw*0.19, oy+sh*0.41, sw*0.018, 0, Math.PI*2); ctx.fill();
      if (nF > 0.02) {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(255,190,100,${(nF*0.4).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(ox+sw*0.19, oy+sh*0.42, sw*0.1, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }
      // Manutentionnaire poussant un diable de caisses (navette sur le quai)
      const dc = (now / 4600) % 1, dgo = dc < 0.5, dk = dgo ? dc*2 : (1-dc)*2;
      const dx = 0.04 + dk * 0.14, dy = 0.86, dstep = Math.sin(now / 130) * 0.012;
      ctx.fillStyle = "#1a1e22"; ctx.beginPath(); ctx.arc(ox+sw*(dx+0.06), oy+sh*(dy+0.05), sw*0.022, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#3a352e"; ctx.lineWidth = Math.max(1, sw*0.014); ctx.beginPath(); ctx.moveTo(ox+sw*(dx+0.06), oy+sh*(dy-0.04)); ctx.lineTo(ox+sw*(dx+0.02), oy+sh*(dy+0.05)); ctx.stroke();
      if (dgo) { ctx.fillStyle = "#9a6a2c"; ctx.fillRect(ox+sw*(dx+0.02), oy+sh*(dy-0.06), sw*0.08, sh*0.07); strokeRect(dx+0.02, dy-0.06, 0.08, 0.07, "rgba(30,20,8,0.5)"); }
      ctx.fillStyle = "#2e2620"; ctx.fillRect(ox+sw*(dx-0.02+dstep), oy+sh*(dy+0.02), sw*0.018, sh*0.045); ctx.fillRect(ox+sw*(dx+0.004-dstep), oy+sh*(dy+0.02), sw*0.018, sh*0.045);
      ctx.fillStyle = "#4a525a"; ctx.fillRect(ox+sw*(dx-0.026), oy+sh*(dy-0.05), sw*0.056, sh*0.08);
      ctx.fillStyle = "#c48c50"; ctx.beginPath(); ctx.arc(ox+sw*dx, oy+sh*(dy-0.07), sw*0.024, 0, Math.PI*2); ctx.fill();
    } else {
      // ── STADE 3 · LOGISTIQUE AUTONOME — pod cargo à sustentation néon ──
      // Néon froid, automatisation : plus aucun humain, le fret se charge seul.
      px(0.0, 0.6, 1.0, 0.4, "#10161a");
      px(0.0, 0.84, 1.0, 0.16, "#0c1014");
      // Rail lumineux au sol + liseré cyan
      px(0.04, 0.8, 0.92, 0.02, "#16323a");
      ctx.fillStyle = "#2f8fa0"; ctx.fillRect(ox+sw*0.04, oy+sh*0.805, sw*0.92, Math.max(1, sh*0.006));
      // Balises de route (néon, pulsent)
      for (let b = 0; b < 4; b++) {
        const bx = 0.14 + b * 0.24, pulse = 0.5 + 0.5 * Math.sin(now / 600 + b * 1.3);
        ctx.fillStyle = "#1c262c"; ctx.fillRect(ox+sw*(bx-0.008), oy+sh*0.74, sw*0.016, sh*0.06);
        ctx.fillStyle = `rgba(120,240,220,${(0.4 + pulse*0.4).toFixed(2)})`; ctx.fillRect(ox+sw*(bx-0.006), oy+sh*0.74, sw*0.012, sh*0.012);
        if (nF > 0.02) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = `rgba(90,220,230,${(nF*0.3*pulse).toFixed(2)})`; ctx.beginPath(); ctx.arc(ox+sw*bx, oy+sh*0.746, sw*0.04, 0, Math.PI*2); ctx.fill(); ctx.restore(); }
      }
      // Pod cargo : glisse lentement et flotte (léger ballant)
      const glide = Math.sin(now / 3000) * 0.04, podbob = Math.sin(now / 900) * 0.012;
      const podx = 0.5 + glide, podY = 0.5 + podbob;
      ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(ox+sw*podx, oy+sh*0.78, sw*(0.18-podbob), sh*0.03, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#243038";
      ctx.beginPath(); ctx.moveTo(ox+sw*(podx-0.22), oy+sh*podY); ctx.lineTo(ox+sw*(podx+0.22), oy+sh*podY); ctx.lineTo(ox+sw*(podx+0.18), oy+sh*(podY+0.12)); ctx.lineTo(ox+sw*(podx-0.18), oy+sh*(podY+0.12)); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#2f3e48"; ctx.fillRect(ox+sw*(podx-0.2), oy+sh*(podY-0.06), sw*0.4, sh*0.06);
      // Conteneurs lumineux empilés (nombre selon tier)
      const nCont = 2 + Math.min(2, tier);
      for (let c = 0; c < nCont; c++) {
        const ccx = podx - 0.16 + c * (0.32 / nCont), cyan = c % 2 === 0;
        ctx.fillStyle = cyan ? "#1c5a64" : "#3a2c6a"; ctx.fillRect(ox+sw*ccx, oy+sh*(podY-0.05), sw*0.07, sh*0.05);
        ctx.fillStyle = cyan ? "#7ef0d8" : "#b49cff"; ctx.fillRect(ox+sw*ccx, oy+sh*(podY-0.05), sw*0.07, Math.max(1, sh*0.008));
        if (nF > 0.02) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = cyan ? `rgba(120,240,220,${(nF*0.4).toFixed(2)})` : `rgba(150,120,255,${(nF*0.4).toFixed(2)})`; ctx.beginPath(); ctx.arc(ox+sw*(ccx+0.035), oy+sh*(podY-0.04), sw*0.04, 0, Math.PI*2); ctx.fill(); ctx.restore(); }
      }
      // Propulseurs sous le pod (lueur pulsée, nuit)
      if (nF > 0.02) {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        const th = 0.5 + 0.5 * Math.sin(now / 200);
        ctx.fillStyle = `rgba(90,220,230,${(nF*0.45*th).toFixed(2)})`;
        for (const tx of [podx-0.12, podx+0.12]) { ctx.beginPath(); ctx.ellipse(ox+sw*tx, oy+sh*(podY+0.16), sw*0.05, sh*0.06, 0, 0, Math.PI*2); ctx.fill(); }
        ctx.restore();
      }
      // Portique + bras robotisé qui cycle (charge depuis la pile de droite)
      px(0.04, 0.28, 0.92, 0.022, "#22303a");
      const at = (now / 3000) % 1;
      const armx = 0.3 + (Math.sin(at*Math.PI*2)*0.5 + 0.5) * 0.4;
      const dip = 0.3 + Math.max(0, Math.sin(now / 500)) * 0.16;
      ctx.fillStyle = "#4a5a64"; ctx.fillRect(ox+sw*(armx-0.03), oy+sh*0.282, sw*0.06, sh*0.03);
      ctx.strokeStyle = "#3a4a54"; ctx.lineWidth = Math.max(1.5, sw*0.02); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(ox+sw*armx, oy+sh*0.31); ctx.lineTo(ox+sw*armx, oy+sh*dip); ctx.stroke();
      ctx.lineWidth = Math.max(1, sw*0.012);
      ctx.beginPath(); ctx.moveTo(ox+sw*armx, oy+sh*dip); ctx.lineTo(ox+sw*(armx-0.02), oy+sh*(dip+0.03)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*armx, oy+sh*dip); ctx.lineTo(ox+sw*(armx+0.02), oy+sh*(dip+0.03)); ctx.stroke();
      ctx.lineCap = "square";
      // Pile de conteneurs source (droite)
      for (let s = 0; s < 3; s++) {
        ctx.fillStyle = s % 2 ? "#243038" : "#2a3a44"; ctx.fillRect(ox+sw*0.84, oy+sh*(0.66 - s*0.06), sw*0.1, sh*0.055);
        ctx.fillStyle = "#2f8fa0"; ctx.fillRect(ox+sw*0.84, oy+sh*(0.66 - s*0.06), sw*0.1, Math.max(1, sh*0.005));
      }
    }
    return true;
  }
  if (id === "markets") {
    if (band >= 7) { // NEXUS D'ÉCHANGE cosmique : cœur relié à des nœuds (réseau qui pulse)
      const { cp, glow } = cosmicBase(ctx, ox, oy, sw, sh, px, band);
      const cxc = 0.5, cyc = 0.52;
      if (band === 7) { // tendrils organiques + paquet lumineux qui file vers un nœud
        const nodes = [[0.2, 0.4], [0.8, 0.4], [0.26, 0.72], [0.74, 0.72]];
        for (const [nx, ny] of nodes) {
          const sway = Math.sin(now / 800 + nx * 7) * 0.02;
          ctx.strokeStyle = cp.mid; ctx.lineCap = "round"; ctx.lineWidth = Math.max(1.5, sw * 0.035);
          ctx.beginPath(); ctx.moveTo(ox + sw * cxc, oy + sh * cyc); ctx.quadraticCurveTo(ox + sw * ((cxc + nx) / 2 + sway), oy + sh * ((cyc + ny) / 2), ox + sw * (nx + sway), oy + sh * ny); ctx.stroke();
          ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.arc(ox + sw * (nx + sway), oy + sh * ny, sw * 0.05, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.ellipse(ox + sw * cxc, oy + sh * cyc, sw * 0.13, sh * 0.13, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(ox + sw * (cxc - 0.03), oy + sh * (cyc - 0.03), sw * 0.05, 0, Math.PI * 2); ctx.fill();
        const pk = (now / 1500) % 1, n0 = nodes[0], pkx = cxc + (n0[0] - cxc) * pk, pky = cyc + (n0[1] - cyc) * pk;
        ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(ox + sw * pkx, oy + sh * pky, sw * 0.022, 0, Math.PI * 2); ctx.fill();
        glow(pkx, pky, 0.05, 0.45);
      } else if (band === 8) { // moyeu + bras-rayons qui tournent (rotation visible)
        const rot = now / 2200, R = sw * 0.3;
        for (let a = 0; a < 4; a++) {
          const ang = rot + a * Math.PI / 2, exp = ox + sw * cxc + Math.cos(ang) * R, eyp = oy + sh * cyc + Math.sin(ang) * R * 0.7;
          ctx.strokeStyle = cp.mid; ctx.lineCap = "round"; ctx.lineWidth = Math.max(2, sw * 0.04);
          ctx.beginPath(); ctx.moveTo(ox + sw * cxc, oy + sh * cyc); ctx.lineTo(exp, eyp); ctx.stroke();
          ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.arc(exp, eyp, sw * 0.045, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(exp, eyp, sw * 0.02, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.arc(ox + sw * cxc, oy + sh * cyc, sw * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(ox + sw * cxc, oy + sh * cyc, sw * 0.05, 0, Math.PI * 2); ctx.fill();
      } else { // cristal central + nœuds-cristaux en orbite
        const rot = now / 2000, R = sw * 0.3;
        ctx.save(); ctx.translate(ox + sw * cxc, oy + sh * cyc);
        const w0 = sw * 0.1, h0 = sh * 0.17;
        ctx.fillStyle = cp.mid; ctx.beginPath(); ctx.moveTo(0, -h0); ctx.lineTo(w0, 0); ctx.lineTo(0, h0); ctx.lineTo(-w0, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.moveTo(0, -h0); ctx.lineTo(0, h0); ctx.lineTo(-w0, 0); ctx.closePath(); ctx.fill();
        ctx.restore();
        for (let a = 0; a < 3; a++) {
          const ang = rot + a * 2.094, exp = ox + sw * cxc + Math.cos(ang) * R, eyp = oy + sh * cyc + Math.sin(ang) * R * 0.6;
          ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.arc(exp, eyp, sw * 0.035, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(exp, eyp, sw * 0.016, 0, Math.PI * 2); ctx.fill();
        }
      }
      glow(cxc, cyc, 0.2, 0.16 + 0.1 * Math.sin(now / 650));
      return true;
    }
    // 4 stades suivant l'âge de la ville (ei 0–34), un tous les 10 âges :
    // troc sur nattes → halle à toile rayée → halles de fonte vitrées →
    // place de commerce néon. Le geste animé reste le transport/échange de
    // marchandises à chaque âge (main-à-main → chaland → diable → drone).
    // tier = richesse intra-stade (étals / marchandises / travées / kiosques).
    const stage = ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3;
    const goodColors = ["#e05030", "#f0c040", "#60a840", "#e8804a", "#9060c0", "#e8e080"];
    if (stage === 0) {
      // ── STADE 0 · TROC SUR NATTES ──
      // Âge du Feu/Bois : étal de troc sous auvent de peau. Pixel-art = prop PixelLab
      // (étal statique) + cueilleurs RÉUTILISÉS animés (vendeur accroupi + chaland qui
      // s'approche et troque). Repli sur la scène procédurale d'origine tant que le
      // prop ou les sprites du cueilleur ne sont pas chargés (zéro tuile vide).
      if (propReady('market-prop-stall')) {
        // Tache de sol douce qui se fond dans le terrain (sous l'étal)
        {
          const cxp = ox + sw * 0.5, cyp = oy + sh * 0.73, R = sw * 0.5, ky = (sh * 0.3) / R;
          ctx.save(); ctx.translate(cxp, cyp); ctx.scale(1, ky); ctx.translate(-cxp, -cyp);
          const g = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, R);
          g.addColorStop(0, "rgba(40,28,14,0.5)");
          g.addColorStop(0.6, "rgba(40,28,14,0.26)");
          g.addColorStop(1, "rgba(40,28,14,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cxp, cyp, R, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        // Étal de troc (prop PixelLab) — pièce maîtresse, aspect 96×72 préservé
        blitProp(ctx, ox, oy, sw, sh, 'market-prop-stall', 0.5, 0.46, 0.92, 0.69);
        // Tier 1+ : panier de marchandises latéral (réutilise le prop cueilleur)
        if (tier >= 1) blitProp(ctx, ox, oy, sw, sh, 'forager-prop-basket', 0.78, 0.82, 0.2, 0.19);
        if (foragerReady()) {
          // Vendeur accroupi au bord de l'étal (idle lent, face caméra)
          const vf = Math.floor((now || 0) / 280) % FORAGER_CLIPS['crouch-south'];
          ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.beginPath(); ctx.ellipse(ox + sw * 0.34, oy + sh * 0.69, sw * 0.05, sh * 0.02, 0, 0, Math.PI * 2); ctx.fill();
          blitForager(ctx, ox, oy, sw, sh, 0.34, 0.66, 'crouch-south', vf, 0.42);
          // Chaland : arrive de la droite, troque au plus près, repart
          const cyc0 = ((now || 0) / 4200) % 1;
          const coming = cyc0 < 0.5;
          const k0 = coming ? cyc0 * 2 : (1 - cyc0) * 2;     // 0 (bord) → 1 (étal)
          const cpx = 0.86 - k0 * 0.28;                       // 0.86 → 0.58
          const cdir = coming ? 'west' : 'east';
          const cfr = Math.floor((now || 0) / 150) % FORAGER_CLIPS['walk-' + cdir];
          ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.beginPath(); ctx.ellipse(ox + sw * cpx, oy + sh * 0.73, sw * 0.05, sh * 0.02, 0, 0, Math.PI * 2); ctx.fill();
          blitForager(ctx, ox, oy, sw, sh, cpx, 0.7, 'walk-' + cdir, cfr, 0.42);
          // Tier 2+ : second chaland qui flâne (gauche, opposition de phase)
          if (tier >= 2) {
            const cyc1 = ((now || 0) / 5200 + 0.5) % 1;
            const coming1 = cyc1 < 0.5;
            const k1 = coming1 ? cyc1 * 2 : (1 - cyc1) * 2;
            const cpx1 = 0.14 + k1 * 0.22;                    // arrive de la gauche
            const cdir1 = coming1 ? 'east' : 'west';
            const cfr1 = Math.floor((now || 0) / 160) % FORAGER_CLIPS['walk-' + cdir1];
            blitForager(ctx, ox, oy, sw, sh, cpx1, 0.84, 'walk-' + cdir1, cfr1, 0.38);
          }
        }
      } else {
      // ── repli procédural (scène d'origine, échange main-à-main) ──
      px(0.0, 0.52, 1.0, 0.48, "#3a2c18");          // terre battue
      px(0.06, 0.6, 0.88, 0.34, "#46361f");         // aire damée plus claire
      // Auvent de peau tendu sur deux perches (au-dessus de la natte vendeur)
      ctx.strokeStyle = "#5a3c16"; ctx.lineWidth = Math.max(1, sw * 0.02); ctx.lineCap = "round";
      for (const pp of [0.16, 0.44]) { ctx.beginPath(); ctx.moveTo(ox + sw * pp, oy + sh * 0.74); ctx.lineTo(ox + sw * pp, oy + sh * 0.42); ctx.stroke(); }
      ctx.lineCap = "square";
      ctx.fillStyle = "#8a6a40";                    // peau tendue, ventre affaissé
      ctx.beginPath();
      ctx.moveTo(ox + sw * 0.14, oy + sh * 0.42);
      ctx.quadraticCurveTo(ox + sw * 0.3, oy + sh * 0.5, ox + sw * 0.46, oy + sh * 0.42);
      ctx.lineTo(ox + sw * 0.46, oy + sh * 0.46);
      ctx.quadraticCurveTo(ox + sw * 0.3, oy + sh * 0.54, ox + sw * 0.14, oy + sh * 0.46);
      ctx.closePath(); ctx.fill();
      // Natte du vendeur (tapis tressé) + marchandises
      ctx.fillStyle = "#8a6a2c";
      ctx.beginPath(); ctx.ellipse(ox + sw * 0.3, oy + sh * 0.78, sw * 0.17, sh * 0.075, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(50,32,12,0.5)"; ctx.lineWidth = Math.max(0.5, sw * 0.01);
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(ox + sw * (0.3 + i * 0.05), oy + sh * 0.73); ctx.lineTo(ox + sw * (0.3 + i * 0.05), oy + sh * 0.83); ctx.stroke(); }
      const nGoods0 = 3 + tier * 2;
      for (let gi = 0; gi < nGoods0; gi++) {
        const gx2 = 0.2 + gi * (0.2 / Math.max(1, nGoods0 - 1));
        ctx.fillStyle = goodColors[gi % goodColors.length];
        ctx.beginPath(); ctx.arc(ox + sw * gx2, oy + sh * 0.755, sw * 0.022, 0, Math.PI * 2); ctx.fill();
      }
      // Poterie posée au bord de la natte
      ctx.fillStyle = "#9a5a2c";
      ctx.beginPath(); ctx.ellipse(ox + sw * 0.42, oy + sh * 0.77, sw * 0.03, sh * 0.04, 0, 0, Math.PI * 2); ctx.fill();
      // Vendeur accroupi derrière la natte, bras tendu vers le client
      ctx.fillStyle = "#5a3c1a"; ctx.fillRect(ox + sw * 0.27, oy + sh * 0.6, sw * 0.06, sh * 0.1);
      ctx.fillStyle = "#c48c50"; ctx.beginPath(); ctx.arc(ox + sw * 0.3, oy + sh * 0.58, sw * 0.036, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#5a3c1a"; ctx.lineWidth = Math.max(1.2, sw * 0.03); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.32, oy + sh * 0.63); ctx.lineTo(ox + sw * 0.4, oy + sh * 0.66); ctx.stroke();
      ctx.lineCap = "square";
      // === CLIENT — s'approche, troque main-à-main au plus près, repart ===
      const cyc0 = (now / 4200) % 1;
      const coming = cyc0 < 0.5;
      const k0 = coming ? cyc0 * 2 : (1 - cyc0) * 2;   // 0 (loin) → 1 (natte)
      const cpx = 0.82 - k0 * 0.28, cpy = 0.74;         // 0.82 → 0.54
      const step0 = k0 > 0.82 ? 0 : Math.sin(now / 120) * 0.012;
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath(); ctx.ellipse(ox + sw * cpx, oy + sh * (cpy + 0.14), sw * 0.055, sh * 0.022, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#3f5a6a";                        // jambes
      ctx.fillRect(ox + sw * (cpx - 0.026 + step0), oy + sh * (cpy + 0.06), sw * 0.022, sh * 0.09);
      ctx.fillRect(ox + sw * (cpx + 0.006 - step0), oy + sh * (cpy + 0.06), sw * 0.022, sh * 0.09);
      ctx.fillStyle = "#4f7088"; ctx.fillRect(ox + sw * (cpx - 0.032), oy + sh * (cpy - 0.06), sw * 0.064, sh * 0.12);
      ctx.fillStyle = "#c49060"; ctx.beginPath(); ctx.arc(ox + sw * cpx, oy + sh * (cpy - 0.1), sw * 0.04, 0, Math.PI * 2); ctx.fill();
      // Bras tendu vers le vendeur (échange main-à-main)
      const chx = cpx - 0.05, chy = cpy - 0.02;
      ctx.strokeStyle = "#4f7088"; ctx.lineWidth = Math.max(1.2, sw * 0.032); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(ox + sw * (cpx - 0.02), oy + sh * (cpy - 0.03)); ctx.lineTo(ox + sw * chx, oy + sh * chy); ctx.stroke();
      ctx.lineCap = "square";
      ctx.fillStyle = "#c49060"; ctx.beginPath(); ctx.arc(ox + sw * chx, oy + sh * chy, sw * 0.024, 0, Math.PI * 2); ctx.fill();
      // Marchandise emportée (visible au retour)
      if (!coming) { ctx.fillStyle = "#e05030"; ctx.beginPath(); ctx.arc(ox + sw * chx, oy + sh * (chy - 0.01), sw * 0.02, 0, Math.PI * 2); ctx.fill(); }
      // Tier 1+ : seconde natte de marchandises
      if (tier >= 1) {
        ctx.fillStyle = "#80622a"; ctx.beginPath(); ctx.ellipse(ox + sw * 0.64, oy + sh * 0.82, sw * 0.12, sh * 0.05, 0, 0, Math.PI * 2); ctx.fill();
        for (let gi = 0; gi < 3; gi++) { ctx.fillStyle = goodColors[(gi + 2) % goodColors.length]; ctx.beginPath(); ctx.arc(ox + sw * (0.58 + gi * 0.06), oy + sh * 0.81, sw * 0.02, 0, Math.PI * 2); ctx.fill(); }
      }
      // Tier 2+ : pile de paniers d'osier
      if (tier >= 2) {
        for (let c = 0; c < 2; c++) { ctx.fillStyle = c % 2 ? "#9a6a2c" : "#8a5a22"; ctx.beginPath(); ctx.ellipse(ox + sw * 0.12, oy + sh * (0.8 - c * 0.05), sw * 0.05, sh * 0.03, 0, 0, Math.PI * 2); ctx.fill(); }
      }
      } // ── fin du repli procédural ──
    } else if (stage === 1) {
      // ── STADE 1 · HALLE À TOILE RAYÉE — marché médiéval, comptoir, fanions ──
      // Âge de la Pierre/Couronne : la halle couverte canonique. Le chaland
      // repart du comptoir avec un panier rempli (transport de marchandises).
      px(0.02, 0.34, 0.96, 0.62, "#5a4a34");        // esplanade pavée
      // Grande toile rayée à double pente (vue de dessus)
      const awnA = "#c03828", awnB = "#e8e0cc";
      const ax = 0.08, aw = 0.84, ay = 0.14, ah2 = 0.34;
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? awnB : awnA;
        ctx.fillRect(ox + sw * (ax + aw * i / 8), oy + sh * ay, sw * aw / 8 + 0.5, sh * ah2);
      }
      // Faîtage central + ombre du bord de toile
      px(ax, ay + ah2 * 0.46, aw, 0.022, "rgba(90,20,10,0.55)");
      px(ax, ay + ah2 - 0.03, aw, 0.045, "rgba(0,0,0,0.28)");
      // Poteaux
      ctx.fillStyle = "#5a3c16";
      for (const pp of [ax + 0.015, ax + aw - 0.05]) ctx.fillRect(ox + sw * pp, oy + sh * (ay + ah2), sw * 0.045, sh * 0.16);
      // Comptoir frontal + marchandises colorées
      px(ax + 0.04, 0.6, aw - 0.08, 0.09, "#7a5020");
      px(ax + 0.04, 0.6, aw - 0.08, 0.022, "#9a6830");
      const nGoods1 = 5 + tier * 2;
      for (let gi = 0; gi < nGoods1; gi++) {
        const gx2 = ax + 0.08 + gi * ((aw - 0.16) / Math.max(1, nGoods1 - 1));
        ctx.fillStyle = goodColors[gi % goodColors.length];
        ctx.beginPath(); ctx.arc(ox + sw * gx2, oy + sh * 0.62, sw * 0.026, 0, Math.PI * 2); ctx.fill();
      }
      // Marchand derrière le comptoir
      ctx.fillStyle = "#4a3018"; ctx.fillRect(ox + sw * 0.47, oy + sh * 0.5, sw * 0.06, sh * 0.1);
      ctx.fillStyle = "#c49060"; ctx.beginPath(); ctx.arc(ox + sw * 0.5, oy + sh * 0.48, sw * 0.034, 0, Math.PI * 2); ctx.fill();
      // === CHALAND — arrive les mains vides, repart avec un panier plein ===
      const cyc1 = (now / 4000) % 1;
      const coming = cyc1 < 0.5;
      const k1 = coming ? cyc1 * 2 : (1 - cyc1) * 2;    // 0 (bord) → 1 (comptoir)
      const carry = !coming;
      const spx = 0.86 - k1 * 0.28, spy = 0.8;
      const step1 = Math.sin(now / 130) * 0.012;
      ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(ox + sw * spx, oy + sh * (spy + 0.13), sw * 0.055, sh * 0.022, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#6a8a3c";
      ctx.fillRect(ox + sw * (spx - 0.026 + step1), oy + sh * (spy + 0.06), sw * 0.022, sh * 0.09);
      ctx.fillRect(ox + sw * (spx + 0.006 - step1), oy + sh * (spy + 0.06), sw * 0.022, sh * 0.09);
      ctx.fillStyle = "#7a9a4c"; ctx.fillRect(ox + sw * (spx - 0.032), oy + sh * (spy - 0.06), sw * 0.064, sh * 0.12);
      ctx.fillStyle = "#c49060"; ctx.beginPath(); ctx.arc(ox + sw * spx, oy + sh * (spy - 0.1), sw * 0.04, 0, Math.PI * 2); ctx.fill();
      // Panier au bras (vide à l'aller, plein au retour)
      const bx = spx - (coming ? 0.05 : 0.06), by = spy + 0.01;
      ctx.fillStyle = "#8a5a22"; ctx.beginPath(); ctx.ellipse(ox + sw * bx, oy + sh * by, sw * 0.03, sh * 0.025, 0, 0, Math.PI * 2); ctx.fill();
      if (carry) { for (let k = 0; k < 3; k++) { ctx.fillStyle = goodColors[k]; ctx.beginPath(); ctx.arc(ox + sw * (bx - 0.018 + k * 0.018), oy + sh * (by - 0.018), sw * 0.013, 0, Math.PI * 2); ctx.fill(); } }
      // Tier 1+ : étal latéral avec son propre auvent
      if (tier >= 1) {
        px(0.0, 0.36, 0.14, 0.2, "#2a6888");
        ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(ox, oy + sh * 0.36, sw * 0.045, sh * 0.2);
        px(0.01, 0.56, 0.12, 0.06, "#7a5020");
      }
      // Tier 2+ : fanions colorés au-dessus de la halle
      if (tier >= 2) {
        ctx.strokeStyle = "rgba(60,40,16,0.6)"; ctx.lineWidth = Math.max(0.5, sw * 0.012);
        ctx.beginPath(); ctx.moveTo(ox + sw * ax, oy + sh * 0.1); ctx.lineTo(ox + sw * (ax + aw), oy + sh * 0.1); ctx.stroke();
        for (let fi = 0; fi < 6; fi++) {
          const fx2 = ax + 0.08 + fi * (aw - 0.16) / 5;
          const flap = Math.sin(now / 380 + fi) * 0.01;
          ctx.fillStyle = goodColors[fi % goodColors.length];
          ctx.beginPath();
          ctx.moveTo(ox + sw * (fx2 - 0.025), oy + sh * 0.1);
          ctx.lineTo(ox + sw * (fx2 + 0.025), oy + sh * 0.1);
          ctx.lineTo(ox + sw * (fx2 + flap), oy + sh * 0.15);
          ctx.closePath(); ctx.fill();
        }
      }
    } else if (stage === 2) {
      // ── STADE 2 · HALLES DE FONTE VITRÉES — charpente Baltard, verrière ──
      // Âge du Marbre/Fonte : nef vitrée à montants de fonte. Un porteur pousse
      // un diable de caisses qui fait la navette le long de l'allée.
      const nF = parseFloat(litGold.slice(litGold.lastIndexOf(",") + 1)) || 0;
      px(0.0, 0.5, 1.0, 0.5, "#241d14");            // pavé sombre
      px(0.0, 0.82, 1.0, 0.18, "#1c1610");          // allée
      // Corps vitré de la nef
      const hx0 = 0.12, hw = 0.76, hy0 = 0.34, hh = 0.46;
      px(hx0, hy0, hw, hh, "#34524a");
      // Reflet diagonal
      ctx.fillStyle = "rgba(180,220,210,0.16)";
      ctx.beginPath();
      ctx.moveTo(ox + sw * hx0, oy + sh * (hy0 + hh)); ctx.lineTo(ox + sw * (hx0 + hw * 0.45), oy + sh * hy0);
      ctx.lineTo(ox + sw * (hx0 + hw * 0.62), oy + sh * hy0); ctx.lineTo(ox + sw * (hx0 + hw * 0.17), oy + sh * (hy0 + hh));
      ctx.closePath(); ctx.fill();
      // Toit en bâtière vitré + faîtage
      ctx.fillStyle = "#2c443d";
      ctx.beginPath(); ctx.moveTo(ox + sw * (hx0 - 0.03), oy + sh * hy0); ctx.lineTo(ox + sw * (hx0 + hw * 0.5), oy + sh * (hy0 - 0.12)); ctx.lineTo(ox + sw * (hx0 + hw + 0.03), oy + sh * hy0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#1f3029"; ctx.lineWidth = Math.max(1, sw * 0.012);
      ctx.beginPath(); ctx.moveTo(ox + sw * (hx0 + hw * 0.5), oy + sh * (hy0 - 0.12)); ctx.lineTo(ox + sw * (hx0 + hw * 0.5), oy + sh * (hy0 + hh)); ctx.stroke();
      // Montants de fonte (mullions) — travées selon tier
      const bays = 4 + Math.min(3, tier);
      ctx.strokeStyle = "#2a2420"; ctx.lineWidth = Math.max(1, sw * 0.018);
      for (let i = 0; i <= bays; i++) { const mxx = hx0 + (hw / bays) * i; ctx.beginPath(); ctx.moveTo(ox + sw * mxx, oy + sh * hy0); ctx.lineTo(ox + sw * mxx, oy + sh * (hy0 + hh)); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(ox + sw * hx0, oy + sh * (hy0 + hh * 0.5)); ctx.lineTo(ox + sw * (hx0 + hw), oy + sh * (hy0 + hh * 0.5)); ctx.stroke();
      // Arcade d'entrée centrale
      ctx.fillStyle = "rgba(12,10,6,0.7)";
      ctx.beginPath(); ctx.arc(ox + sw * 0.5, oy + sh * (hy0 + hh - 0.02), sw * 0.08, Math.PI, 0); ctx.fill();
      ctx.fillRect(ox + sw * 0.42, oy + sh * (hy0 + hh - 0.02), sw * 0.16, sh * 0.08);
      // Verrière éclairée la nuit (vitres chaudes + halo additif via CM.nightF)
      if (nF > 0.02) {
        for (let i = 0; i < bays; i++) { const wx = hx0 + (hw / bays) * i + (hw / bays) * 0.2; px(wx, hy0 + 0.06, (hw / bays) * 0.6, hh * 0.3, litWarm); }
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(255,210,130,${(nF * 0.2).toFixed(2)})`;
        ctx.fillRect(ox + sw * hx0, oy + sh * hy0, sw * hw, sh * hh * 0.5);
        ctx.restore();
      }
      // === PORTEUR + DIABLE DE CAISSES — navette le long de l'allée ===
      const cyc2 = (now / 4600) % 1, going = cyc2 < 0.5, k2 = going ? cyc2 * 2 : (1 - cyc2) * 2;
      const wx = 0.18 + k2 * 0.5, wy = 0.86, dir = going ? 1 : -1, step2 = Math.sin(now / 120) * 0.01;
      ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(ox + sw * wx, oy + sh * (wy + 0.06), sw * 0.1, sh * 0.022, 0, 0, Math.PI * 2); ctx.fill();
      // Roue qui tourne
      ctx.fillStyle = "#2a2018"; ctx.beginPath(); ctx.arc(ox + sw * (wx - dir * 0.05), oy + sh * (wy + 0.04), sw * 0.028, 0, Math.PI * 2); ctx.fill();
      const wr2 = (now / 180) * dir;
      ctx.strokeStyle = "#0e0a06"; ctx.lineWidth = Math.max(0.5, sw * 0.01);
      ctx.beginPath(); ctx.moveTo(ox + sw * (wx - dir * 0.05 - 0.02 * Math.cos(wr2)), oy + sh * (wy + 0.04 - 0.02 * Math.sin(wr2))); ctx.lineTo(ox + sw * (wx - dir * 0.05 + 0.02 * Math.cos(wr2)), oy + sh * (wy + 0.04 + 0.02 * Math.sin(wr2))); ctx.stroke();
      // Caisses empilées sur le diable
      px(wx - 0.05, wy - 0.12, 0.1, 0.06, "#8a5a22"); strokeRect(wx - 0.05, wy - 0.12, 0.1, 0.06, "rgba(40,24,8,0.5)");
      px(wx - 0.04, wy - 0.18, 0.08, 0.055, "#9a6a2c"); strokeRect(wx - 0.04, wy - 0.18, 0.08, 0.055, "rgba(40,24,8,0.5)");
      // Porteur derrière le diable
      ctx.fillStyle = "#3a2c1c";
      ctx.fillRect(ox + sw * (wx + dir * 0.07 - 0.01 + step2), oy + sh * (wy - 0.04), sw * 0.018, sh * 0.07);
      ctx.fillRect(ox + sw * (wx + dir * 0.07 + 0.012 - step2), oy + sh * (wy - 0.04), sw * 0.018, sh * 0.07);
      ctx.fillStyle = "#4a3624"; ctx.fillRect(ox + sw * (wx + dir * 0.07 - 0.022), oy + sh * (wy - 0.13), sw * 0.05, sh * 0.1);
      ctx.fillStyle = "#c49060"; ctx.beginPath(); ctx.arc(ox + sw * (wx + dir * 0.07), oy + sh * (wy - 0.15), sw * 0.03, 0, Math.PI * 2); ctx.fill();
    } else {
      // ── STADE 3 · PLACE DE COMMERCE NÉON — kiosques auto, drone, hologramme ──
      // Âge du Néon : dalle sombre, kiosques à liserés cyan et prix défilants,
      // hologramme flottant, drone de livraison qui glisse sur un rail. Lumières
      // additives pilotées par la nuit (litGold → CM.nightF).
      const nF = parseFloat(litGold.slice(litGold.lastIndexOf(",") + 1)) || 0;
      px(0.0, 0.5, 1.0, 0.5, "#10161a");            // dalle
      px(0.0, 0.84, 1.0, 0.16, "#0b0f13");
      // Joints de dalle lumineux (nuit)
      if (nF > 0.02) {
        ctx.strokeStyle = `rgba(80,200,220,${(nF * 0.4).toFixed(2)})`; ctx.lineWidth = Math.max(0.5, sw * 0.008);
        for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(ox + sw * 0.05, oy + sh * (0.6 + i * 0.1)); ctx.lineTo(ox + sw * 0.95, oy + sh * (0.6 + i * 0.1)); ctx.stroke(); }
      }
      // Kiosques automatisés (nombre selon tier)
      const nK = 2 + Math.min(2, tier);
      const kioskCol = ["#1a2630", "#202d38", "#18222b"];
      for (let i = 0; i < nK; i++) {
        const kx = 0.1 + i * (0.8 / nK), kw = (0.8 / nK) * 0.7, ky = 0.52, kh = 0.26;
        px(kx, ky, kw, kh, kioskCol[i % 3]);
        strokeRect(kx, ky, kw, kh, "#2c3a44");
        // Liseré cyan en bas du kiosque
        ctx.fillStyle = nF > 0.02 ? `rgba(110,230,240,${(0.3 + nF * 0.5).toFixed(2)})` : "#2f6a78";
        ctx.fillRect(ox + sw * kx, oy + sh * (ky + kh - 0.02), sw * kw, Math.max(1, sh * 0.008));
        // Panneau de prix + chiffres défilants (segments lumineux)
        px(kx + kw * 0.15, ky + 0.03, kw * 0.7, 0.06, "#0c1418");
        ctx.fillStyle = nF > 0.02 ? `rgba(120,240,180,${(0.4 + nF * 0.5).toFixed(2)})` : "#2e6a4a";
        const seg = Math.floor(now / 600 + i) % 3;
        for (let s = 0; s < 3; s++) { if (s !== seg) ctx.fillRect(ox + sw * (kx + kw * 0.22 + s * kw * 0.2), oy + sh * (ky + 0.05), sw * kw * 0.12, sh * 0.025); }
      }
      // Hologramme de prix flottant au-dessus (scintille doucement)
      if (nF > 0.02) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 700);
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(90,200,240,${(nF * 0.18 * (0.6 + 0.4 * pulse)).toFixed(2)})`;
        ctx.fillRect(ox + sw * 0.34, oy + sh * 0.22, sw * 0.32, sh * 0.12);
        ctx.restore();
        ctx.strokeStyle = `rgba(120,230,250,${(nF * 0.5).toFixed(2)})`; ctx.lineWidth = Math.max(0.5, sw * 0.01);
        ctx.strokeRect(ox + sw * 0.34, oy + sh * 0.22, sw * 0.32, sh * 0.12);
      }
      // === DRONE DE LIVRAISON — glisse sur un rail, colis suspendu ===
      px(0.06, 0.18, 0.88, 0.02, "#1c262c");        // rail
      const t = (now / 3000) % 1;
      const dxp = 0.1 + (Math.sin(t * Math.PI * 2) * 0.5 + 0.5) * 0.72;
      px(dxp - 0.04, 0.165, 0.08, 0.03, "#3a4a54");  // chariot du rail
      ctx.strokeStyle = "#3a4a54"; ctx.lineWidth = Math.max(1, sw * 0.014);
      ctx.beginPath(); ctx.moveTo(ox + sw * dxp, oy + sh * 0.2); ctx.lineTo(ox + sw * dxp, oy + sh * 0.3); ctx.stroke();
      px(dxp - 0.03, 0.3, 0.06, 0.05, "#8a5a22"); strokeRect(dxp - 0.03, 0.3, 0.06, 0.05, "rgba(40,24,8,0.6)"); // colis
      // Feu de position du drone (nuit)
      if (nF > 0.02) {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(120,240,220,${(nF * 0.5).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(ox + sw * dxp, oy + sh * 0.18, sw * 0.025, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    return true;
  }
  if (id === "guilds") {
    if (band >= 7) { // ASSEMBLEUR cosmique : corps + bras qui forgent (contre-phase) + cœur
      const { cp, glow } = cosmicBase(ctx, ox, oy, sw, sh, px, band);
      const swing = Math.sin(now / 600);            // va-et-vient des bras (forge)
      const beat = 0.5 + 0.5 * Math.sin(now / 400); // pulsation du cœur
      if (band === 7) { // pod-forge organique + 2 bras-tendrils qui pompent
        ctx.fillStyle = cp.mid; ctx.beginPath(); ctx.ellipse(ox + sw * 0.5, oy + sh * 0.64, sw * 0.24, sh * 0.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.ellipse(ox + sw * 0.5, oy + sh * 0.58, sw * 0.15, sh * 0.13, 0, 0, Math.PI * 2); ctx.fill();
        for (const s of [-1, 1]) {
          const tipY = 0.42 + s * swing * 0.06;
          ctx.strokeStyle = cp.mid; ctx.lineCap = "round"; ctx.lineWidth = Math.max(2, sw * 0.05);
          ctx.beginPath(); ctx.moveTo(ox + sw * (0.5 + s * 0.1), oy + sh * 0.58); ctx.quadraticCurveTo(ox + sw * (0.5 + s * 0.28), oy + sh * 0.46, ox + sw * (0.5 + s * 0.32), oy + sh * tipY); ctx.stroke();
          ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(ox + sw * (0.5 + s * 0.32), oy + sh * tipY, sw * 0.03, 0, Math.PI * 2); ctx.fill();
        }
        glow(0.5, 0.58, 0.12, 0.2 + 0.25 * beat);
      } else if (band === 8) { // bloc d'assemblage métal + 2 bras qui forgent + mote-outil
        ctx.fillStyle = cp.mid; ctx.beginPath(); ctx.roundRect(ox + sw * 0.32, oy + sh * 0.52, sw * 0.36, sh * 0.32, sw * 0.04); ctx.fill();
        ctx.fillStyle = cp.edge; ctx.fillRect(ox + sw * 0.36, oy + sh * 0.55, sw * 0.28, sh * 0.06);
        for (const s of [-1, 1]) {
          const tipY = 0.42 + s * swing * 0.07;
          ctx.strokeStyle = cp.edge; ctx.lineCap = "round"; ctx.lineWidth = Math.max(2, sw * 0.045);
          ctx.beginPath(); ctx.moveTo(ox + sw * (0.5 + s * 0.08), oy + sh * 0.54); ctx.lineTo(ox + sw * (0.5 + s * 0.3), oy + sh * tipY); ctx.stroke();
          ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(ox + sw * (0.5 + s * 0.3), oy + sh * tipY, sw * 0.026, 0, Math.PI * 2); ctx.fill();
        }
        glow(0.5, 0.62, 0.1, 0.2 + 0.25 * beat);
        const ra = now / 1300, mx = 0.5 + Math.cos(ra) * 0.3, my = 0.5 + Math.sin(ra) * 0.12;
        ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(ox + sw * mx, oy + sh * my, sw * 0.022, 0, Math.PI * 2); ctx.fill();
      } else { // assembleur cristallin + bras facettés + cœur prismatique + éclat orbital
        ctx.save(); ctx.translate(ox + sw * 0.5, oy + sh * 0.64);
        const w0 = sw * 0.2, h0 = sh * 0.22;
        ctx.fillStyle = cp.mid; ctx.beginPath(); ctx.moveTo(0, -h0); ctx.lineTo(w0, 0); ctx.lineTo(0, h0); ctx.lineTo(-w0, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.moveTo(0, -h0); ctx.lineTo(0, h0); ctx.lineTo(-w0, 0); ctx.closePath(); ctx.fill();
        ctx.restore();
        for (const s of [-1, 1]) {
          const tipY = 0.44 + s * swing * 0.05;
          ctx.strokeStyle = cp.edge; ctx.lineCap = "round"; ctx.lineWidth = Math.max(2, sw * 0.04);
          ctx.beginPath(); ctx.moveTo(ox + sw * (0.5 + s * 0.08), oy + sh * 0.58); ctx.lineTo(ox + sw * (0.5 + s * 0.3), oy + sh * tipY); ctx.stroke();
        }
        ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(ox + sw * 0.5, oy + sh * 0.6, sw * (0.045 + 0.02 * beat), 0, Math.PI * 2); ctx.fill();
        const ra = now / 1200, mx = 0.5 + Math.cos(ra) * 0.32, my = 0.6 + Math.sin(ra) * 0.14;
        ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(ox + sw * mx, oy + sh * my, sw * 0.02, 0, Math.PI * 2); ctx.fill();
        glow(0.5, 0.6, 0.1, 0.2 + 0.2 * beat);
      }
      return true;
    }
    // ── GUILDES — confrérie de métier ─────────────────────────────────
    // 4 stades suivant l'âge de la ville (ei = eraIndex 0–34), un tous les
    // 10 âges, calés sur les eraBand du design ville (ageVisualConfig.js) :
    //   0 atelier de bois → 1 maison de guilde (pans de bois) →
    //   2 chambre des corporations (pierre/fronton) → 3 consortium (verre/néon).
    // Marqueur d'identité constant à chaque ère : emblème de métier doré
    // (roue dentée / marteaux) + bannière ou enseigne. tier reste la richesse
    // intra-stade. nF = facteur nuit dérivé de litGold (même convention que
    // les autres sprites du module, cf. river_ports/markets). Aléa nul :
    // tout est déterministe en now/tier (pas de Math.random dans le rendu).
    const stage = ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3;
    const nF = parseFloat(litGold.slice(litGold.lastIndexOf(",") + 1)) || 0;
    const flap = Math.sin(now / 420) * 0.018; // bannière/enseigne au vent
    if (stage === 0) {
      // ── LE LODGE D'ARTISANS (clos) ──
      // Pixel-art = prop PixelLab (hall clos qui grandit) + animation par-dessus :
      // lueur de forge à la porte + fumée du faîte + artisan RÉUTILISÉ qui livre.
      // Bâtiment CLOS distinct des maisons (cf DA). Repli procédural (l'atelier
      // d'origine) tant que le prop n'est pas chargé.
      if (propReady('guild-prop-lodge')) {
        // Tache de sol douce sous le lodge
        {
          const cxp = ox + sw * 0.5, cyp = oy + sh * 0.85, R = sw * 0.46, ky = (sh * 0.24) / R;
          ctx.save(); ctx.translate(cxp, cyp); ctx.scale(1, ky); ctx.translate(-cxp, -cyp);
          const g = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, R);
          g.addColorStop(0, "rgba(38,26,12,0.45)");
          g.addColorStop(0.6, "rgba(38,26,12,0.22)");
          g.addColorStop(1, "rgba(38,26,12,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cxp, cyp, R, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        // Le lodge (prop PixelLab) — aspect 96×96 carré
        blitProp(ctx, ox, oy, sw, sh, 'guild-prop-lodge', 0.5, 0.5, 0.86, 0.86);
        // Lueur de forge à la porte (additive, vacille + monte la nuit)
        {
          const dgx = ox + sw * 0.58, dgy = oy + sh * 0.6;
          // Lueur de forge DOUCE qui « sort » de l'embrasure : clignotement LENT (/1100)
          // et de faible amplitude ; rayon resserré → reste dans la porte/le mur, pas sur la terre.
          const fl = 0.22 + 0.05 * Math.abs(Math.sin((now || 0) / 1100)) + nF * 0.22;
          const gr = sw * 0.065;
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          const g = ctx.createRadialGradient(dgx, dgy, 0, dgx, dgy, gr);
          g.addColorStop(0, `rgba(255,150,55,${Math.min(0.5, fl).toFixed(2)})`);
          g.addColorStop(1, "rgba(255,150,55,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(dgx, dgy, gr, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        // Fumée du faîte : 3 bouffées qui montent en boucle (dérivent vers la droite)
        for (let i = 0; i < 3; i++) {
          const t = (((now || 0) / 2600) + i / 3) % 1;
          const spx = 0.5 + 0.07 * t + 0.012 * Math.sin((now || 0) / 300 + i);
          const spy = 0.3 - 0.26 * t;
          ctx.fillStyle = `rgba(208,198,188,${(0.28 * (1 - t)).toFixed(2)})`;
          ctx.beginPath(); ctx.arc(ox + sw * spx, oy + sh * spy, sw * (0.022 + 0.05 * t), 0, Math.PI * 2); ctx.fill();
        }
        // Tier 1+ : bannière de guilde sur perche (gauche) qui ondule
        if (tier >= 1) {
          const bpx = 0.15, bTop = 0.4, bBot = 0.82;
          ctx.strokeStyle = "#4a3418"; ctx.lineWidth = Math.max(1, sw * 0.016); ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(ox + sw * bpx, oy + sh * bBot); ctx.lineTo(ox + sw * bpx, oy + sh * bTop); ctx.stroke(); ctx.lineCap = "square";
          const fl2 = Math.sin((now || 0) / 420) * 0.022;
          ctx.fillStyle = "#9a3a2c";
          ctx.beginPath();
          ctx.moveTo(ox + sw * bpx, oy + sh * bTop);
          ctx.lineTo(ox + sw * (bpx + 0.12 + fl2), oy + sh * (bTop + 0.035));
          ctx.lineTo(ox + sw * bpx, oy + sh * (bTop + 0.085));
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#c8a83c"; ctx.fillRect(ox + sw * (bpx - 0.006), oy + sh * (bTop - 0.005), sw * 0.012, sh * 0.1);
        }
        // Tier 2+ : ballot de marchandises livré près de la porte (prop réutilisé)
        if (tier >= 2) blitProp(ctx, ox, oy, sw, sh, 'forager-prop-basket', 0.66, 0.78, 0.18, 0.17);
        // (pas d'artisan animé ici — retiré à la demande de l'utilisateur ; l'anim
        //  vient de la fumée + lueur de porte + bannière au vent)
      } else {
      // ── repli procédural (l'atelier ouvert d'origine) ──
      px(0.08, 0.8, 0.84, 0.14, "#2f2113");                   // terrasse de travail
      px(0.18, 0.42, 0.64, 0.44, "#9a7a4e");                  // corps en torchis
      ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fillRect(ox+sw*0.68, oy+sh*0.42, sw*0.14, sh*0.44);
      // Colombage
      ctx.strokeStyle = "#5a3c1e"; ctx.lineWidth = Math.max(1, sw*0.022);
      for (let i = 0; i < 3; i++) { const bx = 0.3 + i*0.2; ctx.beginPath(); ctx.moveTo(ox+sw*bx, oy+sh*0.44); ctx.lineTo(ox+sw*bx, oy+sh*0.86); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(ox+sw*0.18, oy+sh*0.6); ctx.lineTo(ox+sw*0.82, oy+sh*0.6); ctx.stroke();
      // Toit de chaume débordant
      ctx.fillStyle = "#7c5a2c";
      ctx.beginPath(); ctx.moveTo(ox+sw*0.1, oy+sh*0.46); ctx.lineTo(ox+sw*0.5, oy+sh*0.16); ctx.lineTo(ox+sw*0.9, oy+sh*0.46); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(ox+sw*0.1, oy+sh*0.44, sw*0.8, sh*0.03);
      // Atelier ouvert (intérieur sombre) + lueur de forge (monte la nuit)
      px(0.36, 0.56, 0.3, 0.3, "rgba(18,11,5,0.72)");
      {
        const glow = Math.min(0.85, 0.35 + 0.2*Math.abs(Math.sin(now/300)) + nF*0.4);
        ctx.fillStyle = `rgba(255,120,30,${glow.toFixed(2)})`;
        ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.76, sw*0.09, 0, Math.PI*2); ctx.fill();
      }
      // Enclume
      ctx.fillStyle = "#2a2a2e"; ctx.fillRect(ox+sw*0.43, oy+sh*0.74, sw*0.14, sh*0.05); ctx.fillRect(ox+sw*0.47, oy+sh*0.78, sw*0.06, sh*0.06);
      // Marteau du forgeron qui bat en cadence : le manche pivote autour de
      // l'épaule et la tête vient frapper la surface de l'enclume (~y 0.73).
      const beat = (now/560) % 1;
      const down = beat < 0.5 ? 1 - Math.cos(beat*2*Math.PI) : 0; // 0 levé → 1 frappe
      const ha = -0.3 + down*0.83;                                // levé modéré → enclume
      const shx = ox+sw*0.38, shy = oy+sh*0.66, arm = sw*0.14;
      const hex = shx + Math.cos(ha)*arm, hey = shy + Math.sin(ha)*arm;
      ctx.strokeStyle = "#6a4a24"; ctx.lineWidth = Math.max(1.5, sw*0.03); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(shx, shy); ctx.lineTo(hex, hey); ctx.stroke(); ctx.lineCap = "square";
      ctx.fillStyle = "#3a3a40"; ctx.fillRect(hex-sw*0.03, hey-sw*0.022, sw*0.06, sw*0.045);
      // Étincelles au point d'impact (seulement quand la tête touche l'enclume)
      if (down > 0.85) {
        ctx.fillStyle = "rgba(255,210,90,0.9)";
        for (let s = 0; s < 4; s++) {
          const sa = -2.6 + s*0.5, sd = sw*(0.04 + (((now>>4)+s*7) & 3)*0.012);
          ctx.beginPath(); ctx.arc(hex + Math.cos(sa)*sd, hey + Math.sin(sa)*sd, sw*0.012, 0, Math.PI*2); ctx.fill();
        }
      }
      // Emblème de métier sur le pignon : épée sur un bouclier
      {
        const bx = ox+sw*0.5, by = oy+sh*0.3, bw = sw*0.11, bh = sh*0.14;
        // Écu (haut droit, pointe en bas)
        ctx.fillStyle = tier >= 1 ? "#c8a83c" : "#9a8050";
        ctx.beginPath();
        ctx.moveTo(bx-bw/2, by-bh/2);
        ctx.lineTo(bx+bw/2, by-bh/2);
        ctx.lineTo(bx+bw/2, by);
        ctx.lineTo(bx, by+bh/2);
        ctx.lineTo(bx-bw/2, by);
        ctx.closePath(); ctx.fill();
        // Épée verticale par-dessus
        ctx.strokeStyle = "#eae6da"; ctx.lineWidth = Math.max(1, sw*0.02); ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(bx, by-bh*0.46); ctx.lineTo(bx, by+bh*0.32); ctx.stroke();        // lame
        ctx.strokeStyle = "#6a4a24"; ctx.lineWidth = Math.max(1, sw*0.018);
        ctx.beginPath(); ctx.moveTo(bx-bw*0.34, by+bh*0.08); ctx.lineTo(bx+bw*0.34, by+bh*0.08); ctx.stroke(); // garde
        ctx.fillStyle = "#6a4a24"; ctx.beginPath(); ctx.arc(bx, by+bh*0.38, sw*0.013, 0, Math.PI*2); ctx.fill();   // pommeau
        ctx.lineCap = "square";
      }
      // Roue de meule qui tourne (tier >= 2)
      if (tier >= 2) {
        const gx = ox+sw*0.16, gy = oy+sh*0.74, gr = sw*0.08;
        ctx.fillStyle = "#5a5650"; ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = "#2c2a26"; ctx.lineWidth = Math.max(0.8, sw*0.012);
        const ga = now/240; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx+Math.cos(ga)*gr, gy+Math.sin(ga)*gr); ctx.stroke();
      }
      } // ── fin du repli procédural ──
    } else if (stage === 1) {
      // ── LA MAISON DE GUILDE (bourg → fortifié) : pans de bois, pignon à redans ──
      const x0 = 0.16, x1 = 0.84, yTop = 0.36, yBase = 0.86, yMid = 0.60;
      px(x0, yTop, x1 - x0, yBase - yTop, "#b89a68");          // mur (torchis)
      ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.fillRect(ox+sw*0.74, oy+sh*yTop, sw*0.1, sh*(yBase-yTop));
      // Pignon à redans (au-dessus du corps)
      ctx.fillStyle = "#8a6a3c";
      for (let s = 0; s < 4; s++) { const gw = 0.46 - s*0.1, gy = yTop - 0.02 - s*0.05; ctx.fillRect(ox+sw*(0.5-gw/2), oy+sh*gy, sw*gw, sh*0.06); }
      // Charpente : 4 montants + 2 traverses qui ENCADRENT les baies (sans les couper)
      ctx.strokeStyle = "#5a3c1e"; ctx.lineWidth = Math.max(1, sw*0.022);
      for (const pxp of [0.16, 0.385, 0.615, 0.84]) { ctx.beginPath(); ctx.moveTo(ox+sw*pxp, oy+sh*yTop); ctx.lineTo(ox+sw*pxp, oy+sh*yBase); ctx.stroke(); }
      for (const ry of [yTop, yMid]) { ctx.beginPath(); ctx.moveTo(ox+sw*x0, oy+sh*ry); ctx.lineTo(ox+sw*x1, oy+sh*ry); ctx.stroke(); }
      // Fenêtres à meneaux, centrées dans chaque baie (cadre sombre + verre chaud)
      const drawWin = (cx, cy, ww, wh) => {
        ctx.fillStyle = "rgba(20,12,4,0.85)"; ctx.fillRect(ox+sw*(cx-ww/2)-sw*0.008, oy+sh*(cy-wh/2)-sh*0.008, sw*ww+sw*0.016, sh*wh+sh*0.016);
        ctx.fillStyle = litWarm; ctx.fillRect(ox+sw*(cx-ww/2), oy+sh*(cy-wh/2), sw*ww, sh*wh);
        ctx.strokeStyle = "rgba(40,24,8,0.7)"; ctx.lineWidth = Math.max(0.5, sw*0.012);
        ctx.beginPath(); ctx.moveTo(ox+sw*cx, oy+sh*(cy-wh/2)); ctx.lineTo(ox+sw*cx, oy+sh*(cy+wh/2)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox+sw*(cx-ww/2), oy+sh*cy); ctx.lineTo(ox+sw*(cx+ww/2), oy+sh*cy); ctx.stroke();
      };
      drawWin(0.27, 0.47, 0.11, 0.13); drawWin(0.5, 0.47, 0.11, 0.13); drawWin(0.73, 0.47, 0.11, 0.13);
      drawWin(0.27, 0.72, 0.11, 0.12); drawWin(0.73, 0.72, 0.11, 0.12);
      // Porte cochère à arc, au centre bas (baie centrale)
      ctx.fillStyle = "rgba(20,12,4,0.85)";
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.72, sw*0.07, Math.PI, 0); ctx.fill();
      ctx.fillRect(ox+sw*0.43, oy+sh*0.72, sw*0.14, sh*0.14);
      // Petite lanterne murale à côté de la porte : cadre noir + verre chaud
      // qui vacille la nuit (dans l'esprit des réverbères de la ville)
      {
        const lx = ox+sw*0.35, lw = sw*0.05, lh = sh*0.08, lyTop = oy+sh*0.62;
        const fl = Math.min(1, 0.45 + 0.35*Math.abs(Math.sin(now/360)) + nF*0.4);
        // Crochet/potence depuis le mur
        ctx.strokeStyle = "#2a2420"; ctx.lineWidth = Math.max(1, sw*0.014); ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(ox+sw*0.35, oy+sh*0.6); ctx.lineTo(lx, lyTop); ctx.stroke(); ctx.lineCap = "square";
        // Verre chaud
        ctx.fillStyle = `rgba(255,200,90,${fl.toFixed(2)})`;
        ctx.fillRect(lx-lw*0.5, lyTop, lw, lh);
        // Cadre noir (chapeau, base, meneau)
        ctx.fillStyle = "#1f1b18";
        ctx.fillRect(lx-lw*0.5, lyTop, lw, lh*0.18);
        ctx.fillRect(lx-lw*0.5, lyTop+lh*0.82, lw, lh*0.18);
        ctx.fillRect(lx-sw*0.005, lyTop, sw*0.01, lh);
        // Petit fleuron au sommet
        ctx.beginPath(); ctx.arc(lx, lyTop-sh*0.014, sw*0.009, 0, Math.PI*2); ctx.fill();
      }
      // Emblème de guilde sur le pignon : deux épées croisées DERRIÈRE un écu.
      // Les épées (fer sombre) sont tracées d'abord ; l'écu doré recouvre le
      // croisement → on ne voit que pommeaux (coins haut) et pointes (coins bas).
      {
        // Or OPAQUE (jamais litGold, qui est translucide → l'écu laisserait
        // voir les épées par transparence sur les grandes guildes tier ≥ 2).
        const gold = tier >= 2 ? "#d8b43e" : "#c0a030";
        const iron = "#2a2018";
        const sword = (pfx, pfy, tfx, tfy) => {
          const p0x = ox+sw*pfx, p0y = oy+sh*pfy, t0x = ox+sw*tfx, t0y = oy+sh*tfy;
          const vx = t0x-p0x, vy = t0y-p0y, L = Math.hypot(vx, vy) || 1, ux = vx/L, uy = vy/L;
          const nx = -uy, ny = ux;
          ctx.strokeStyle = iron; ctx.lineCap = "round";
          // lame (du dessous de la garde jusqu'à la pointe)
          ctx.lineWidth = Math.max(1.2, sw*0.02);
          ctx.beginPath(); ctx.moveTo(p0x+ux*L*0.16, p0y+uy*L*0.16); ctx.lineTo(t0x, t0y); ctx.stroke();
          // poignée (pommeau → garde)
          ctx.beginPath(); ctx.moveTo(p0x+ux*L*0.04, p0y+uy*L*0.04); ctx.lineTo(p0x+ux*L*0.16, p0y+uy*L*0.16); ctx.stroke();
          // garde (perpendiculaire)
          const gx = p0x+ux*L*0.16, gy = p0y+uy*L*0.16, gh = sw*0.045;
          ctx.lineWidth = Math.max(1.2, sw*0.026);
          ctx.beginPath(); ctx.moveTo(gx-nx*gh, gy-ny*gh); ctx.lineTo(gx+nx*gh, gy+ny*gh); ctx.stroke();
          // pommeau
          ctx.fillStyle = iron; ctx.beginPath(); ctx.arc(p0x, p0y, sw*0.022, 0, Math.PI*2); ctx.fill();
          ctx.lineCap = "square";
        };
        sword(0.38, 0.12, 0.61, 0.41);   // épée \  (pommeau haut-gauche → pointe bas-droite)
        sword(0.62, 0.12, 0.39, 0.41);   // épée /  (pommeau haut-droite → pointe bas-gauche)
        // Écu par-dessus le croisement (côtés courbes convergeant en pointe)
        const ex = ox+sw*0.5, ey = oy+sh*0.26, bw = sw*0.13, bh = sh*0.18;
        const shield = () => {
          ctx.beginPath();
          ctx.moveTo(ex-bw/2, ey-bh/2); ctx.lineTo(ex+bw/2, ey-bh/2);
          ctx.lineTo(ex+bw/2, ey+bh*0.08);
          ctx.quadraticCurveTo(ex+bw*0.42, ey+bh*0.42, ex, ey+bh/2);
          ctx.quadraticCurveTo(ex-bw*0.42, ey+bh*0.42, ex-bw/2, ey+bh*0.08);
          ctx.closePath();
        };
        ctx.fillStyle = gold; shield(); ctx.fill();
        // moitié droite assombrie (héraldique mi-parti)
        ctx.save(); shield(); ctx.clip();
        ctx.fillStyle = "rgba(30,20,8,0.5)"; ctx.fillRect(ex, ey-bh, bw, bh*2);
        ctx.restore();
        // liseré
        ctx.strokeStyle = iron; ctx.lineWidth = Math.max(1, sw*0.016); shield(); ctx.stroke();
      }
      // Mât + fanion clairement accroché au mât (marqueur constant)
      const mx = 0.18;
      ctx.strokeStyle = "#5a4326"; ctx.lineWidth = Math.max(1, sw*0.018); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(ox+sw*mx, oy+sh*yTop); ctx.lineTo(ox+sw*mx, oy+sh*0.07); ctx.stroke(); ctx.lineCap = "square";
      ctx.fillStyle = "#c8a83c"; ctx.beginPath(); ctx.arc(ox+sw*mx, oy+sh*0.07, sw*0.014, 0, Math.PI*2); ctx.fill(); // pomme du mât
      ctx.fillStyle = "#a02020";
      ctx.beginPath();
      ctx.moveTo(ox+sw*mx, oy+sh*0.1);
      ctx.lineTo(ox+sw*(mx+0.15), oy+sh*(0.135+flap));
      ctx.lineTo(ox+sw*mx, oy+sh*0.18);
      ctx.closePath(); ctx.fill();
    } else if (stage === 2) {
      // ── LA CHAMBRE DES CORPORATIONS (impérial → monumental) : pierre néoclassique ──
      px(0.1, 0.84, 0.8, 0.06, "#9a9488");                    // soubassement
      px(0.16, 0.4, 0.68, 0.46, "#c4bdaa");                   // corps en pierre claire
      ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.fillRect(ox+sw*0.74, oy+sh*0.4, sw*0.1, sh*0.46);
      // Colonnes
      const nCol = 5;
      ctx.fillStyle = "#d8d2c2"; for (let i = 0; i < nCol; i++) ctx.fillRect(ox+sw*(0.2+i*0.15), oy+sh*0.46, sw*0.05, sh*0.4);
      ctx.fillStyle = "rgba(0,0,0,0.18)"; for (let i = 0; i < nCol; i++) ctx.fillRect(ox+sw*(0.235+i*0.15), oy+sh*0.46, sw*0.015, sh*0.4);
      // Entablement
      px(0.14, 0.4, 0.72, 0.06, "#b4ad9c");
      // Fronton triangulaire (versant sud ombré)
      ctx.fillStyle = "#cfc8b6";
      ctx.beginPath(); ctx.moveTo(ox+sw*0.14, oy+sh*0.4); ctx.lineTo(ox+sw*0.5, oy+sh*0.18); ctx.lineTo(ox+sw*0.86, oy+sh*0.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.18); ctx.lineTo(ox+sw*0.86, oy+sh*0.4); ctx.lineTo(ox+sw*0.5, oy+sh*0.4); ctx.closePath(); ctx.fill();
      // Coupole + lanternon doré (tier >= 2)
      if (tier >= 2) {
        ctx.fillStyle = "#b8b0a0"; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.2, sw*0.1, Math.PI, 0); ctx.fill();
        ctx.fillStyle = litGold; ctx.fillRect(ox+sw*0.49, oy+sh*0.07, sw*0.02, sh*0.05);
      }
      // Horloge du fronton, cerclée d'or (emblème intégré) + aiguilles animées
      const clx = ox+sw*0.5, cly = oy+sh*0.31, clr = sw*0.05;
      ctx.fillStyle = tier >= 1 ? (tier >= 2 ? litGold : "#b89030") : "#8a8478";
      ctx.beginPath(); ctx.arc(clx, cly, clr*1.18, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#cfc8b6"; ctx.beginPath(); ctx.arc(clx, cly, clr*0.9, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#2c2a24"; ctx.lineWidth = Math.max(0.8, sw*0.012); ctx.lineCap = "round";
      const ma = now/2000 - Math.PI/2, hra = now/24000 - Math.PI/2;
      ctx.beginPath(); ctx.moveTo(clx, cly); ctx.lineTo(clx+Math.cos(ma)*clr*0.7, cly+Math.sin(ma)*clr*0.7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(clx, cly); ctx.lineTo(clx+Math.cos(hra)*clr*0.45, cly+Math.sin(hra)*clr*0.45); ctx.stroke(); ctx.lineCap = "square";
      // Fenêtres entre colonnes : s'allument une à une la nuit (séquence cyclique)
      for (let i = 0; i < 4; i++) {
        const on = nF > 0.1 && ((Math.floor(now/900) + i) % 4) !== 0;
        ctx.fillStyle = on ? litWarm : "rgba(40,38,32,0.6)";
        ctx.fillRect(ox+sw*(0.245+i*0.15), oy+sh*0.52, sw*0.06, sh*0.26);
      }
      // Bannière sur mât latéral (marqueur constant)
      ctx.strokeStyle = "#8a8478"; ctx.lineWidth = Math.max(1, sw*0.016);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.12, oy+sh*0.86); ctx.lineTo(ox+sw*0.12, oy+sh*0.12); ctx.stroke();
      ctx.fillStyle = "#a02020";
      ctx.beginPath();
      ctx.moveTo(ox+sw*0.12, oy+sh*0.14);
      ctx.lineTo(ox+sw*0.26, oy+sh*(0.15+flap));
      ctx.lineTo(ox+sw*0.26, oy+sh*(0.23+flap));
      ctx.lineTo(ox+sw*0.12, oy+sh*0.24);
      ctx.closePath(); ctx.fill();
    } else {
      // ── LE CONSORTIUM (mégalopole / singularité) : tour de verre + néon ──
      // Hauteur du fût croît avec tier (clin d'œil à BUILDING_HEIGHTS.tower = 3.2).
      const top = 0.12 - Math.min(0.06, tier*0.025);
      const fh = 0.86 - top;
      px(0.26, top, 0.48, fh, "#1e2b38");                     // fût vitré
      ctx.fillStyle = "rgba(120,170,210,0.12)"; ctx.fillRect(ox+sw*0.26, oy+sh*top, sw*0.14, sh*fh); // reflet
      ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(ox+sw*0.64, oy+sh*top, sw*0.1, sh*fh);        // ombre
      // Damier de baies, certaines allumées (scintillement déterministe)
      const cols = 5, rows = 11, rh = (fh - 0.06) / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const lit2 = ((c*7 + r*3 + Math.floor(now/700)) % 5) === 0;
        ctx.fillStyle = lit2 ? `rgba(150,210,255,${(0.5+nF*0.4).toFixed(2)})` : "rgba(40,60,80,0.5)";
        ctx.fillRect(ox+sw*(0.285+c*0.088), oy+sh*(top+0.04+r*rh), sw*0.06, sh*rh*0.6);
      }
      // Balayage lumineux vertical qui descend la façade
      {
        const sweep = (now/2200) % 1;
        ctx.fillStyle = `rgba(120,210,255,${(0.18+nF*0.22).toFixed(2)})`;
        ctx.fillRect(ox+sw*0.26, oy+sh*(top + sweep*fh), sw*0.48, sh*0.05);
      }
      // Couronnement
      px(0.3, top-0.02, 0.4, 0.03, "#2c3c4c");
      // Logo néon de la guilde (roue dentée) qui pulse — marqueur constant
      const lgx = ox+sw*0.5, lgy = oy+sh*(top+0.1), lgr = sw*0.06;
      const pulse = 0.55 + 0.45*Math.abs(Math.sin(now/700));
      const neon = 0.4 + nF*0.6;
      ctx.strokeStyle = `rgba(80,220,255,${(pulse*neon).toFixed(2)})`; ctx.lineWidth = Math.max(1.2, sw*0.022);
      ctx.beginPath(); ctx.arc(lgx, lgy, lgr, 0, Math.PI*2); ctx.stroke();
      for (let k = 0; k < 8; k++) { const ka = k*Math.PI/4; ctx.beginPath(); ctx.moveTo(lgx+Math.cos(ka)*lgr, lgy+Math.sin(ka)*lgr); ctx.lineTo(lgx+Math.cos(ka)*lgr*1.3, lgy+Math.sin(ka)*lgr*1.3); ctx.stroke(); }
      ctx.fillStyle = `rgba(255,210,120,${(pulse*neon).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(lgx, lgy, lgr*0.32, 0, Math.PI*2); ctx.fill();
      // Bandeau-enseigne néon en pied (remplace la bannière, marqueur constant)
      ctx.fillStyle = `rgba(80,220,255,${(0.3+pulse*nF*0.5).toFixed(2)})`;
      ctx.fillRect(ox+sw*0.24, oy+sh*0.8, sw*0.52, sh*0.03);
    }
    return true;
  }
  if (id === "irrigated_fields") {
    if (band >= 7) { // BIO-PARCELLES cosmiques : rangées de pousses qui ondulent (vague)
      const { cp, glow } = cosmicBase(ctx, ox, oy, sw, sh, px, band);
      ctx.fillStyle = cp.mid; ctx.beginPath(); ctx.roundRect(ox + sw * 0.1, oy + sh * 0.6, sw * 0.8, sh * 0.26, sw * 0.03); ctx.fill();
      ctx.fillStyle = cp.edge; ctx.fillRect(ox + sw * 0.12, oy + sh * 0.62, sw * 0.76, sh * 0.03);
      if (band === 8) { // drone récolteur qui survole les rangs (motion horizontale franche)
        const tt = (now / 3000) % 1, dx = 0.15 + tt * 0.7;
        ctx.fillStyle = cp.mid; ctx.beginPath(); ctx.roundRect(ox + sw * dx - sw * 0.06, oy + sh * 0.3, sw * 0.12, sh * 0.05, sw * 0.02); ctx.fill();
        ctx.fillStyle = cp.lite; ctx.fillRect(ox + sw * dx - sw * 0.04, oy + sh * 0.31, sw * 0.08, sh * 0.015);
        glow(dx, 0.36, 0.08, 0.4);
      }
      for (let r = 0; r < 9; r++) {
        const bx = 0.16 + r * 0.085, wv = Math.sin(now / 700 + r * 0.6), hh = 0.2 + 0.04 * wv, tilt = wv * 0.04;
        if (band === 9) {
          ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.moveTo(ox + sw * (bx + tilt), oy + sh * (0.62 - hh)); ctx.lineTo(ox + sw * (bx + 0.03), oy + sh * 0.62); ctx.lineTo(ox + sw * (bx - 0.03), oy + sh * 0.62); ctx.closePath(); ctx.fill();
          ctx.fillStyle = cp.lite; ctx.fillRect(ox + sw * (bx + tilt) - sw * 0.004, oy + sh * (0.62 - hh), sw * 0.008, sh * hh * 0.5);
        } else {
          ctx.strokeStyle = cp.edge; ctx.lineCap = "round"; ctx.lineWidth = Math.max(1.5, sw * 0.022);
          ctx.beginPath(); ctx.moveTo(ox + sw * bx, oy + sh * 0.62); ctx.quadraticCurveTo(ox + sw * (bx + tilt * 1.5), oy + sh * (0.62 - hh * 0.6), ox + sw * (bx + tilt), oy + sh * (0.62 - hh)); ctx.stroke();
          ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(ox + sw * (bx + tilt), oy + sh * (0.62 - hh), sw * 0.012, 0, Math.PI * 2); ctx.fill();
        }
      }
      glow(0.5, 0.6, 0.3, 0.12 + 0.06 * Math.sin(now / 800));
      return true;
    }
    // ── CHAMPS IRRIGUÉS — PATCHWORK DE PARCELLES + 4 stades ───────────────
    // Le bloc (gw×gh tuiles) est pavé en parcelles distinctes (teinte + motif
    // de sillons variés, séparées par des chemins de terre), comme une vraie
    // campagne en damier. Ce qui évolue tous les 10 âges (ei 0-9/10-19/20-29/
    // 30+) : la palette des cultures, le réseau d'eau (rigole → canal → aqueduc
    // → conduites) et la palette nocturne (braise → lanterne litWarm → cyan).
    const stage = ei >= 30 ? 3 : ei >= 20 ? 2 : ei >= 10 ? 1 : 0;
    // ~1 parcelle par tuile du bloc (bornée pour le coût de rendu).
    const cols = Math.max(2, Math.min(8, Math.round(gw)));
    const rows = Math.max(2, Math.min(6, Math.round(gh)));
    // Hash entier déterministe (pas de Math.random dans le rendu).
    const fhash = (a, b) => ((Math.imul((a + 1) | 0, 73856093) ^ Math.imul((b + 1) | 0, 19349663) ^ Math.imul(stage + 1, 83492791)) >>> 0);
    // Palette de cultures par stade : du rustique (jachères brunes) à
    // l'hydroponie (verts vifs réguliers).
    const PAL = [
      { crops: ["#4a6e2a", "#3c5e22", "#5a7232", "#6a7a30"], ripe: ["#9a8636", "#8a7a30"], fallow: ["#6a4f2c", "#5c4526"], fallowRoll: 4, ripeRoll: 2 },
      { crops: ["#4a7c28", "#3c6820", "#5a8a30", "#6f9a38"], ripe: ["#b9a23a", "#c8b048"], fallow: ["#6a4f2c"], fallowRoll: 2, ripeRoll: 3 },
      { crops: ["#5a8a3a", "#4a8030", "#6f9a38", "#7faa42"], ripe: ["#c8b048", "#d4bc52", "#b9a23a"], fallow: ["#6a5430"], fallowRoll: 1, ripeRoll: 4 },
      { crops: ["#3f9a55", "#46a85f", "#52b06a", "#4aa860"], ripe: ["#7fb84a", "#6fb040"], fallow: ["#3a6a52"], fallowRoll: 1, ripeRoll: 2 },
    ][stage];
    const pathCol = stage === 3 ? "#5a646c" : "#6a5436"; // béton clair / terre battue
    // ── PIXEL-ART (stade 0) : SOL DE TERRE (l'ancien fond, préféré) + GRANDES
    //    parcelles PixelLab COHÉRENTES (types groupés en clusters → identiques
    //    côte à côte) ; paysan qui marche LENTEMENT entre les parcelles. Stades
    //    1-3 = patchwork procédural + arroseur (plus bas). Repli sinon.
    if (stage === 0 && propReady('field-prop-crop-green')) {
      // Sol = MATIÈRE DE L'ÂGE (tuile pleine du tileset route de la bande : terre
      // battue → gravier → pavé…) ; repli sur un aplat brun si pas encore chargée.
      if (!drawEraGroundFill(ctx, ox, oy, sw, sh, band, sw / Math.max(1, gw))) px(0, 0, 1, 1, pathCol);
      const GREEN = 'field-prop-crop-green', GOLD = 'field-prop-crop-gold', FALLOW = 'field-prop-fallow';
      const blitTile = (key, cx, cy, w, h, rot) => {
        const im = propImg[key]; if (!im) return;
        const dW = sw * w, dH = sh * h, X = ox + sw * cx, Y = oy + sh * cy;
        const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
        if (rot) { ctx.save(); ctx.translate(X, Y); ctx.rotate(rot); ctx.drawImage(im, -dH / 2, -dW / 2, dH, dW); ctx.restore(); } // dims permutées → l'empreinte écran reste dW×dH
        else ctx.drawImage(im, X - dW / 2, Y - dH / 2, dW, dH);
        ctx.imageSmoothingEnabled = prev;
      };
      // Parcelles GRANDES mais SERRÉES : assez nombreuses pour couvrir le bloc sans
      // larges allées brunes (les sprites sont clairsemés → on déborde un peu au blit).
      const pcols = Math.max(2, Math.round(cols * 0.85));
      const prows = Math.max(2, Math.round(rows * 0.9));
      for (let ri = 0; ri < prows; ri++) {
        for (let ci = 0; ci < pcols; ci++) {
          // Cohérence : type + sens des rangs décidés par un CLUSTER 2×2 → les
          // parcelles identiques se retrouvent côte à côte (pas de damier aléatoire).
          const ch = fhash(ci >> 1, ri >> 1);
          const roll = ch % 12;
          let key;
          // Poids /12 (mêmes que le repli procédural) : SANS ×2, sinon le vert (roll
          // ≥ somme) n'est JAMAIS tiré au stade 0 (fallowRoll*2 + ripeRoll*2 = 12).
          if (roll < PAL.fallowRoll) key = propReady(FALLOW) ? FALLOW : GREEN;
          else if (roll < PAL.fallowRoll + PAL.ripeRoll) key = propReady(GOLD) ? GOLD : GREEN;
          else key = GREEN;
          // Tout à l'HORIZONTAL : le sprite vert a un grain NATIF vertical (canaux
          // bleus) → on le tourne de 90° ; doré/jachère sont déjà horizontaux.
          const rot = (key === GREEN) ? Math.PI / 2 : 0;
          const x0 = ci / pcols, y0 = ri / prows, pw = 1 / pcols, ph = 1 / prows;
          // Déborde un peu (>1) : les sprites étant clairsemés (contenu centré, marge
          // transparente), un léger chevauchement rapproche les cultures et referme
          // les allées brunes — sans masquer complètement le sol entre les rangs.
          blitTile(key, x0 + pw * 0.5, y0 + ph * 0.5, pw * 1.16, ph * 1.1, rot);
        }
      }
      // Paysan qui MARCHE LENTEMENT entre les parcelles (allée horizontale médiane).
      // TAILLE HUMAINE CONSTANTE : dimensionné par CELLULE (÷ gh), pas par l'emprise
      // du champ → il ne grandit pas quand le champ s'agrandit (cohérent avec les
      // humains des tuiles 1-cellule des autres bâtiments).
      const fhF = 0.75 / Math.max(1, gh);
      if (farmerReady()) {
        const cyc = ((now || 0) / 17000) % 1;            // lent
        const going = cyc < 0.5;
        const k = going ? cyc * 2 : (1 - cyc) * 2;
        const fx2 = 0.08 + 0.84 * k;
        const fy2 = Math.round(prows / 2) / prows;        // sur l'allée entre 2 rangées
        const dir = going ? 'east' : 'west';
        const fr = Math.floor((now || 0) / 185) % FARMER_NF;   // cadence plus lente
        ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(ox + sw * fx2, oy + sh * fy2, sw * (0.16 / gw), sh * (0.055 / gh), 0, 0, Math.PI * 2); ctx.fill();
        blitFarmer(ctx, ox, oy, sw, sh, fx2, fy2, dir, fr, fhF);
      } else if (foragerReady()) {   // repli tant que le paysan n'est pas chargé
        const fr = Math.floor((((now || 0) / 1500) % 1) * FORAGER_CLIPS['pick-east']) % FORAGER_CLIPS['pick-east'];
        blitForager(ctx, ox, oy, sw, sh, 0.4, 0.5, 'pick-east', fr, fhF);
      }
      return true;
    }
    // Fond = chemins (les écarts entre parcelles laissent voir cette couche).
    px(0, 0, 1, 1, pathCol);
    // Sillons d'une parcelle (sens & nombre variables) — translucide.
    const furrows = (fx, fy, fw, fhh, vertical, nn, col) => {
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.5, sw * 0.006);
      for (let k = 1; k < nn; k++) {
        if (vertical) { const xx = fx + fw * (k / nn); ctx.beginPath(); ctx.moveTo(ox + sw * xx, oy + sh * (fy + fhh * 0.08)); ctx.lineTo(ox + sw * xx, oy + sh * (fy + fhh * 0.92)); ctx.stroke(); }
        else { const yy = fy + fhh * (k / nn); ctx.beginPath(); ctx.moveTo(ox + sw * (fx + fw * 0.08), oy + sh * yy); ctx.lineTo(ox + sw * (fx + fw * 0.92), oy + sh * yy); ctx.stroke(); }
      }
    };
    // Pavage des parcelles.
    for (let ri = 0; ri < rows; ri++) {
      for (let ci = 0; ci < cols; ci++) {
        const hv = fhash(ci, ri);
        const x0 = ci / cols, y0 = ri / rows, pw = 1 / cols, ph = 1 / rows;
        const fx = x0 + pw * 0.07, fy = y0 + ph * 0.07, fw = pw * 0.86, fhh = ph * 0.86;
        const roll = hv % 12;
        let col, brown = false;
        if (roll < PAL.fallowRoll) { col = PAL.fallow[hv % PAL.fallow.length]; brown = true; }
        else if (roll < PAL.fallowRoll + PAL.ripeRoll) col = PAL.ripe[(hv >> 2) % PAL.ripe.length];
        else col = PAL.crops[(hv >> 2) % PAL.crops.length];
        px(fx, fy, fw, fhh, col);
        // Motif de sillons : 0 plein, 1 horizontal, 2 vertical, 3 dense.
        const pat = brown ? 1 : (hv >> 5) % 4;
        if (pat !== 0) furrows(fx, fy, fw, fhh, pat === 2, pat === 3 ? 6 : 4, brown ? "rgba(40,28,12,0.35)" : "rgba(20,45,12,0.30)");
        // Liseré clair en haut de parcelle (relief).
        ctx.fillStyle = "rgba(230,245,200,0.08)"; ctx.fillRect(ox + sw * fx, oy + sh * fy, sw * fw, Math.max(1, sh * fhh * 0.06));
      }
    }

    // ── ARROSEUR ROTATIF CENTRAL — un seul jet en arc qui balaie en tournant ──
    // Remplace l'ancien réseau de canaux (trop chargé) : un arroseur à impact,
    // au centre du bloc, projette de petits jets en arc qui tournent (cf. réf.).
    // Évolution douce par stade : matériau du socle + teinte de l'eau + lumière.
    const ST = [
      { base: "#6a4a1a", post: "#5a3810", jet: "200,225,250", glow: "255,150,70" },  // bois (primitif)
      { base: "#8a7c62", post: "#6a5c44", jet: "175,215,255", glow: "255,200,120" }, // pierre (médiéval)
      { base: "#7a7468", post: "#5a564c", jet: "160,220,255", glow: "255,210,130" }, // métal (mécanique)
      { base: "#9aa4aa", post: "#6a747a", jet: "120,225,255", glow: "80,210,255" },  // hi-tech (auto)
    ][stage];
    const sCx = ox + sw * 0.5, sCy = oy + sh * 0.5;
    const reach = Math.min(sw, sh) * 0.42;       // portée d'un jet (petit)
    const baseR = Math.min(sw, sh) * 0.05;
    const rot = now / 1100;                       // rotation de la tête
    const nF = stage === 3
      ? (parseFloat(litGold.slice(litGold.lastIndexOf(",") + 1)) || 0)
      : (parseFloat(litWarm.slice(litWarm.lastIndexOf(",") + 1)) || 0);
    // Tache d'humidité au sol sous l'arroseur.
    ctx.fillStyle = `rgba(${ST.jet},0.10)`;
    ctx.beginPath(); ctx.ellipse(sCx, sCy, reach * 0.95, reach * 0.66, 0, 0, Math.PI * 2); ctx.fill();
    // 3 bras de gouttelettes en arc (parabole : montent puis retombent), décalés.
    for (let j = 0; j < 3; j++) {
      const ang = rot + (j * Math.PI * 2) / 3;
      const ca = Math.cos(ang), sa = Math.sin(ang) * 0.62; // aplatissement iso
      for (let k = 1; k <= 6; k++) {
        const t = k / 6;
        const dist = t * reach;
        const lift = Math.sin(Math.PI * t) * reach * 0.34; // arc
        const a = (1 - t) * 0.85;
        ctx.fillStyle = `rgba(${ST.jet},${a.toFixed(2)})`;
        ctx.beginPath(); ctx.arc(sCx + ca * dist, sCy + sa * dist - lift, baseR * (0.7 - t * 0.4), 0, Math.PI * 2); ctx.fill();
      }
    }
    // Socle + tube + tête pivotante.
    ctx.fillStyle = ST.post; ctx.fillRect(sCx - baseR * 0.32, sCy - baseR * 0.1, baseR * 0.64, baseR * 1.7);
    ctx.fillStyle = ST.base; ctx.beginPath(); ctx.arc(sCx, sCy - baseR * 0.2, baseR * 0.85, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ST.post; ctx.lineWidth = Math.max(1, baseR * 0.3);
    ctx.beginPath(); ctx.moveTo(sCx, sCy - baseR * 0.2); ctx.lineTo(sCx + Math.cos(rot) * baseR * 1.15, sCy - baseR * 0.2 + Math.sin(rot) * baseR * 0.72); ctx.stroke();
    // Lueur nocturne (chaude stades 0-2, cyan stade 3) via CM.nightF.
    if (nF > 0.02) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(${ST.glow},${(nF * 0.5).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(sCx, sCy - baseR * 0.2, baseR * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    return true;
  }
  if (id === "river_ports") {
    if (band >= 7) { // GRAND PORT cosmique : halle + conteneurs + ponton ; le VRAI fleuve sert d'eau (pas d'eau fake)
      const cp = COSMIC_PAL[band] || COSMIC_PAL[9];
      const glow = (cx, cy, r, a) => { ctx.save(); ctx.globalCompositeOperation = "lighter"; const g = ctx.createRadialGradient(ox + sw * cx, oy + sh * cy, 0, ox + sw * cx, oy + sh * cy, sw * r); g.addColorStop(0, `rgba(${cp.glow},${a})`); g.addColorStop(1, `rgba(${cp.glow},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox + sw * cx, oy + sh * cy, sw * r, 0, Math.PI * 2); ctx.fill(); ctx.restore(); };
      // Grande plateforme / quai cosmique (le ponton la dépasse pour atteindre le fleuve)
      ctx.fillStyle = cp.deep; ctx.fillRect(ox, oy + sh * 0.34, sw, sh * 0.54);
      ctx.fillStyle = "rgba(0,0,0,0.30)"; ctx.fillRect(ox, oy + sh * 0.862, sw, sh * 0.02); // bord de quai
      // Grande halle portuaire (corps imposant, agrandi)
      ctx.fillStyle = cp.mid; ctx.beginPath(); ctx.roundRect(ox + sw * 0.02, oy + sh * 0.04, sw * 0.62, sh * 0.64, sw * 0.03); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(ox + sw * 0.42, oy + sh * 0.04, sw * 0.22, sh * 0.64);
      ctx.fillStyle = cp.edge; ctx.fillRect(ox + sw * 0.04, oy + sh * 0.06, sw * 0.58, sh * 0.06);
      if (band === 9) { ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.moveTo(ox + sw * 0.02, oy + sh * 0.04); ctx.lineTo(ox + sw * 0.33, oy - sh * 0.08); ctx.lineTo(ox + sw * 0.64, oy + sh * 0.04); ctx.closePath(); ctx.fill(); }
      else { for (let r3 = 0; r3 < 2; r3++) for (let i = 0; i < 6; i++) { ctx.fillStyle = cp.lite; ctx.fillRect(ox + sw * (0.06 + i * 0.093), oy + sh * (0.2 + r3 * 0.2), sw * 0.06, sh * 0.1); } }
      // Tour/silo annexe (agrandie)
      ctx.fillStyle = cp.mid; ctx.fillRect(ox + sw * 0.68, oy + sh * 0.12, sw * 0.26, sh * 0.56);
      ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(ox + sw * 0.86, oy + sh * 0.12, sw * 0.08, sh * 0.56);
      ctx.fillStyle = cp.edge; ctx.fillRect(ox + sw * 0.68, oy + sh * 0.12, sw * 0.26, sh * 0.04);
      // Conteneurs empilés sur le quai
      for (let r2 = 0; r2 < 2; r2++) for (let i = 0; i < 4; i++) { const cxx = 0.08 + i * 0.1; ctx.fillStyle = (i + r2) % 2 ? cp.edge : cp.mid; ctx.fillRect(ox + sw * cxx, oy + sh * (0.72 + r2 * 0.05), sw * 0.085, sh * 0.045); }
      // Plusieurs pontons depuis le quai jusque DANS le fleuve, chacun avec un vaisseau futuriste
      const fboat = (bxc, byc, L, ph) => {
        const yb2 = byc + Math.sin(now / 1100 + ph) * 0.012, hw = L * 0.5;
        // Clapotis : anneaux qui s'élargissent autour de la coque, à la surface du fleuve
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        for (let r = 0; r < 2; r++) { const t = (now / 1500 + ph + r * 0.5) % 1, rr2 = L * (0.45 + t * 0.7); ctx.strokeStyle = `rgba(210,235,255,${(0.24 * (1 - t)).toFixed(3)})`; ctx.lineWidth = Math.max(1, sw * 0.01); ctx.beginPath(); ctx.ellipse(ox + sw * bxc, oy + sh * (yb2 + hw * 0.55), sw * rr2, sh * rr2 * 0.42, 0, 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
        ctx.fillStyle = cp.mid; ctx.beginPath();
        ctx.moveTo(ox + sw * bxc, oy + sh * (yb2 + hw));                        // nez profilé vers le fleuve
        ctx.lineTo(ox + sw * (bxc + L * 0.32), oy + sh * (yb2 + hw * 0.2));
        ctx.lineTo(ox + sw * (bxc + L * 0.22), oy + sh * (yb2 - hw * 0.7));
        ctx.lineTo(ox + sw * (bxc - L * 0.22), oy + sh * (yb2 - hw * 0.7));
        ctx.lineTo(ox + sw * (bxc - L * 0.32), oy + sh * (yb2 + hw * 0.2));
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.ellipse(ox + sw * bxc, oy + sh * (yb2 + hw * 0.05), sw * L * 0.1, sh * hw * 0.55, 0, 0, Math.PI * 2); ctx.fill(); // canopy
        ctx.fillStyle = cp.edge; // ailerons
        ctx.fillRect(ox + sw * (bxc - L * 0.46), oy + sh * (yb2 - hw * 0.2), sw * L * 0.18, Math.max(1, sh * 0.02));
        ctx.fillRect(ox + sw * (bxc + L * 0.28), oy + sh * (yb2 - hw * 0.2), sw * L * 0.18, Math.max(1, sh * 0.02));
        glow(bxc, yb2 - hw * 0.7, L * 0.5, 0.35 + 0.2 * Math.sin(now / 300 + ph)); // propulseur qui pulse
        ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(ox + sw * bxc, oy + sh * (yb2 - hw * 0.62), sw * L * 0.08, 0, Math.PI * 2); ctx.fill();
      };
      for (const [px2, top, len, bly, bl] of [[0.26, 0.62, 0.46, 1.02, 0.15], [0.52, 0.6, 0.66, 1.2, 0.2], [0.78, 0.63, 0.42, 0.98, 0.14]]) {
        ctx.fillStyle = cp.mid; ctx.fillRect(ox + sw * (px2 - 0.03), oy + sh * top, sw * 0.06, sh * len);
        ctx.fillStyle = cp.edge; ctx.fillRect(ox + sw * (px2 - 0.03), oy + sh * top, sw * 0.06, sh * 0.018);
        fboat(px2, bly, bl, px2 * 7);
      }
      glow(0.4, 0.4, 0.24, 0.12 + 0.06 * Math.sin(now / 800));
      if (band === 8) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = `rgba(${cp.glow},0.45)`; ctx.lineWidth = Math.max(1, sw * 0.016); ctx.beginPath(); ctx.ellipse(ox + sw * 0.5, oy + sh * 0.16, sw * 0.34, sh * 0.06, 0.1 * Math.sin(now / 900), 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
      return true;
    }
    // ── PORT FLUVIAL UNIQUE ───────────────────────────────────────────────────
    // Un seul port sur la carte, posé sur la rive nord, bord SUD plaqué sur l'eau
    // (cf. layout.js) : le bas du sprite (y→1) EST la berge, le vrai fleuve est
    // juste en dessous. On compose donc du nord (haut) vers l'eau (bas) :
    //   • corps du bâtiment qui s'étire sur la terre (haut),
    //   • esplanade + PARKING À BATEAUX (designs d'époques passées sur cale),
    //   • pontons qui plongent dans le fleuve + bateau ACTIF à quai.
    // Le PORT change de design tous les 10 âges (stage) ; le BATEAU tous les 2
    // âges (bv = ei/2) — l'actif suit l'ère, le parking conserve les anciens.
    const stage = ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3;
    // ── PIXEL-ART (stade 0) : remplace le port procédural par des SPRITES TRANSPARENTS
    //    posés sur la tuile NATURELLE (berge + fleuve déjà rendus = base nickel) :
    //    bâtiment vue de-face-de-haut sur la berge + bateau de l'ère dans le fleuve.
    //    AUCUN procédural, aucun fond peint, aucune modif moteur (cf. leçon du carré brun).
    if (stage === 0 && propReady('port-prop-house')) {
      const bWc = Math.min(1.5, gw * 0.72), bhF = bWc / Math.max(1, gh);   // bâtiment RÉDUIT (prop carré 96×96)
      const bwF = bWc / Math.max(1, gw);
      blitProp(ctx, ox, oy, sw, sh, 'port-prop-house', 0.5, 0.4 - bhF * 0.5, bwF, bhF);   // base ancrée ~0.4 (raccord ponton inchangé)
      // ponton de planches : de la base du bâtiment (berge) vers l'eau, le bateau s'amarre au bout
      blitProp(ctx, ox, oy, sw, sh, 'port-prop-pontoon', 0.5, 0.54, 0.82 / Math.max(1, gw), 1.7 / Math.max(1, gh));
      const vstage = band >= 7 ? 'cosmic' : ei >= 30 ? 'container' : ei >= 20 ? 'steam' : ei >= 10 ? 'sail' : 'raft';
      // taille STRICTEMENT alignée sur les bateaux de rivière (drawShips) : largeur écran
      // = 0.7 × sizeMul cellules (sizeMul = même barème croissant par ère) → grandit avec l'ère.
      const sizeMul = vstage === 'cosmic' ? (band >= 9 ? 5.6 : band >= 8 ? 4.8 : 4.0)
        : vstage === 'container' ? 3.2 : vstage === 'steam' ? 2.4 : vstage === 'sail' ? 1.8 : 1.36;
      const boatName = vstage === 'cosmic' ? 'cosmic-' + Math.min(9, Math.max(7, band)) : vstage;
      blitEraBoat(ctx, ox, oy, sw, sh, 0.5, 0.72, 0.7 * sizeMul, boatName, now, gw);   // amarré au bout du ponton
      return true;
    }
    const nF = parseFloat(litWarm.slice(litWarm.lastIndexOf(",") + 1)) || 0;
    // Pixels carrés quelle que soit l'emprise (large × peu profonde) : convertit
    // une fraction horizontale (de sw) en fraction verticale équivalente (de sh).
    const aspect = sw / Math.max(1, sh);
    const vf = (f) => f * aspect;
    const bv = Math.floor(ei / 2);                       // version bateau (/2 âges)
    const boatStageOf = (b) => { const e = b * 2; return e < 10 ? 0 : e < 20 ? 1 : e < 30 ? 2 : 3; };
    const bhash = (b, k) => ((Math.imul((b + 1) | 0, 2654435761) ^ Math.imul((k + 1) | 0, 40503)) >>> 0);

    // ── Bateau paramétrique ────────────────────────────────────────────────────
    // Silhouette par stade (radeau → voilier → vapeur → porte-conteneurs), variée
    // tous les 2 âges via la version b. (bx,by) centre ; L longueur (fraction sw) ;
    // alive = à quai (gréé, animé, éclairé) vs garé (statique, voilure ferlée).
    const drawBoat = (bx, by, L, b, alive) => {
      const bs = boatStageOf(b);
      const H = bhash(b, 5);
      const half = L / 2;
      const hullH = vf(L * 0.18);
      const y = by + (alive ? Math.sin(now / (950 + (b % 5) * 70) + b * 1.3) * 0.010 : 0);
      // Coque (trapèze), liseré de pont clair
      ctx.fillStyle = ["#5a3a12", "#6a4518", "#3a2c22", "#27323d"][bs];
      ctx.beginPath();
      ctx.moveTo(ox + sw * (bx - half), oy + sh * y);
      ctx.lineTo(ox + sw * (bx + half), oy + sh * y);
      ctx.lineTo(ox + sw * (bx + half * 0.72), oy + sh * (y + hullH));
      ctx.lineTo(ox + sw * (bx - half * 0.72), oy + sh * (y + hullH));
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,235,195,0.16)";
      ctx.fillRect(ox + sw * (bx - half), oy + sh * y, sw * L, Math.max(1, sh * vf(L * 0.025)));

      if (bs === 0) {
        // Radeau de rondins + petit mât à voile triangulaire (ou pagaie ferlée)
        ctx.strokeStyle = "rgba(40,26,8,0.45)"; ctx.lineWidth = Math.max(0.5, sw * 0.004);
        for (let i = 0; i < 3; i += 1) { ctx.beginPath(); ctx.moveTo(ox + sw * (bx - half * 0.85), oy + sh * (y + hullH * (0.25 + i * 0.25))); ctx.lineTo(ox + sw * (bx + half * 0.85), oy + sh * (y + hullH * (0.25 + i * 0.25))); ctx.stroke(); }
        const mh = vf(L * 0.55);
        ctx.strokeStyle = "#7a5828"; ctx.lineWidth = Math.max(1, sw * 0.008);
        ctx.beginPath(); ctx.moveTo(ox + sw * bx, oy + sh * y); ctx.lineTo(ox + sw * bx, oy + sh * (y - mh)); ctx.stroke();
        if (alive) {
          const fl = 0.04 + Math.sin(now / 800 + b) * 0.02;
          ctx.fillStyle = "rgba(208,184,126,0.72)";
          ctx.beginPath(); ctx.moveTo(ox + sw * bx, oy + sh * (y - mh * 0.95));
          ctx.lineTo(ox + sw * (bx + half * (0.66 + fl)), oy + sh * (y - mh * 0.22));
          ctx.lineTo(ox + sw * bx, oy + sh * (y - mh * 0.22)); ctx.closePath(); ctx.fill();
        } else {
          ctx.fillStyle = "rgba(150,120,80,0.5)";
          ctx.fillRect(ox + sw * (bx - half * 0.04), oy + sh * (y - mh), Math.max(1, sw * half * 0.12), sh * mh * 0.8);
        }
      } else if (bs === 1) {
        // Voilier : poupe relevée + 1-2 mâts à voile carrée (gonflée vs ferlée)
        ctx.fillStyle = ["#5a3a12", "#6a4518", "#3a2c22", "#27323d"][bs];
        ctx.beginPath(); ctx.moveTo(ox + sw * (bx + half), oy + sh * y); ctx.lineTo(ox + sw * (bx + half * 1.06), oy + sh * (y - hullH * 0.7)); ctx.lineTo(ox + sw * (bx + half * 0.8), oy + sh * y); ctx.closePath(); ctx.fill();
        const masts = 1 + (H % 2);
        const mh = vf(L * 0.72);
        for (let m = 0; m < masts; m += 1) {
          const mx = bx + (masts === 1 ? 0 : (m ? half * 0.34 : -half * 0.34));
          ctx.strokeStyle = "#6a4a1c"; ctx.lineWidth = Math.max(1, sw * 0.008);
          ctx.beginPath(); ctx.moveTo(ox + sw * mx, oy + sh * y); ctx.lineTo(ox + sw * mx, oy + sh * (y - mh)); ctx.stroke();
          const sl = half * 0.32;
          if (alive) {
            const bulge = Math.sin(now / 950 + m * 1.6 + b) * 0.05;
            ctx.fillStyle = "rgba(234,222,190,0.85)";
            ctx.beginPath();
            ctx.moveTo(ox + sw * (mx - sl), oy + sh * (y - mh * 0.9));
            ctx.quadraticCurveTo(ox + sw * (mx + sl + bulge * half), oy + sh * (y - mh * 0.5), ox + sw * (mx - sl), oy + sh * (y - mh * 0.12));
            ctx.lineTo(ox + sw * (mx + sl), oy + sh * (y - mh * 0.12));
            ctx.lineTo(ox + sw * (mx + sl), oy + sh * (y - mh * 0.9));
            ctx.closePath(); ctx.fill();
          } else {
            ctx.fillStyle = "rgba(200,186,150,0.55)";
            ctx.fillRect(ox + sw * (mx - sl), oy + sh * (y - mh * 0.9), sw * sl * 2, Math.max(1, sh * vf(L * 0.05)));
          }
        }
        if (alive) {
          ctx.fillStyle = stage === 3 ? "rgba(80,180,255,0.85)" : "rgba(190,60,40,0.85)";
          const fx = bx + (masts === 1 ? 0 : -half * 0.34);
          ctx.beginPath(); ctx.moveTo(ox + sw * fx, oy + sh * (y - mh)); ctx.lineTo(ox + sw * (fx + half * 0.22), oy + sh * (y - mh * 0.92)); ctx.lineTo(ox + sw * fx, oy + sh * (y - mh * 0.84)); ctx.closePath(); ctx.fill();
        }
      } else if (bs === 2) {
        // Vapeur : superstructure, 1-2 cheminées fumantes, roue à aubes, hublots
        ctx.fillStyle = "#4a4038"; ctx.fillRect(ox + sw * (bx - half * 0.5), oy + sh * (y - vf(L * 0.22)), sw * L * 0.5, sh * vf(L * 0.22));
        const funnels = 1 + (H % 2);
        for (let f = 0; f < funnels; f += 1) {
          const fx = bx - half * 0.2 + f * half * 0.34;
          ctx.fillStyle = "#2a2420"; ctx.fillRect(ox + sw * (fx - half * 0.06), oy + sh * (y - vf(L * 0.46)), sw * half * 0.12, sh * vf(L * 0.28));
          if (alive) {
            const smk = (now / 700 + f * 0.4) % 1;
            ctx.fillStyle = `rgba(120,112,104,${((1 - smk) * 0.32).toFixed(2)})`;
            ctx.beginPath(); ctx.arc(ox + sw * fx, oy + sh * (y - vf(L * 0.46) - smk * vf(L * 0.3)), sw * half * (0.1 + smk * 0.12), 0, Math.PI * 2); ctx.fill();
          }
        }
        const wx = ox + sw * (bx - half * 0.92), wy = oy + sh * (y + hullH * 0.2), rr = Math.min(sw, sh) * L * 0.18;
        ctx.strokeStyle = "#5a3a18"; ctx.lineWidth = Math.max(1, sw * 0.01);
        ctx.beginPath(); ctx.arc(wx, wy, rr, 0, Math.PI * 2); ctx.stroke();
        if (alive) {
          ctx.strokeStyle = "#7a5428";
          for (let i = 0; i < 6; i += 1) { const wa = now / 600 + i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + Math.cos(wa) * rr, wy + Math.sin(wa) * rr); ctx.stroke(); }
          ctx.fillStyle = litWarm;
          for (let i = 0; i < 3; i += 1) { ctx.beginPath(); ctx.arc(ox + sw * (bx - half * 0.3 + i * half * 0.3), oy + sh * (y - vf(L * 0.1)), sw * half * 0.05, 0, Math.PI * 2); ctx.fill(); }
        }
      } else {
        // Porte-conteneurs : conteneurs empilés (couleurs/nombre variés) + château
        const CC = ["#b5503a", "#3a78a8", "#c8a23a", "#4a9a5a", "#8a4a6a"];
        const cols = 3 + (H % 3);
        for (let c = 0; c < cols; c += 1) {
          const stacks = 1 + (bhash(b, c) % 2);
          for (let lv = 0; lv < stacks; lv += 1) {
            ctx.fillStyle = CC[bhash(b, c * 7 + lv) % CC.length];
            ctx.fillRect(ox + sw * (bx - half * 0.8 + c * (L * 0.8 / cols)), oy + sh * (y - vf(L * 0.1) - lv * vf(L * 0.12)), sw * (L * 0.8 / cols) * 0.85, sh * vf(L * 0.11));
          }
        }
        ctx.fillStyle = "#cfd6dc"; ctx.fillRect(ox + sw * (bx + half * 0.5), oy + sh * (y - vf(L * 0.34)), sw * half * 0.4, sh * vf(L * 0.34));
        if (alive) {
          ctx.fillStyle = `rgba(80,180,255,${(0.4 + nF * 0.4).toFixed(2)})`;
          for (let i = 0; i < 2; i += 1) ctx.fillRect(ox + sw * (bx + half * 0.54 + i * half * 0.16), oy + sh * (y - vf(L * 0.28)), sw * half * 0.1, sh * vf(L * 0.08));
        }
      }
    };

    // ── Esplanade / berge selon le stade. Le quai s'arrête à ~0.80 : en dessous,
    //    le fleuve réellement peint reste visible et reçoit pontons + bateau. ─────
    const apronCol = ["#6e5320", "#6a4a12", "#6a6050", "#3a4858"][stage];
    px(0.0, 0.40, 1.0, 0.40, apronCol);
    px(0.0, 0.78, 1.0, 0.03, "rgba(0,0,0,0.28)");   // lèvre humide au bord du quai

    // ── Ombrage volumétrique (lumière en haut-gauche) : face droite à l'ombre,
    //    liseré haut + arête gauche éclairés. Appliqué au corps ET aux toits. ─────
    const shadeBox = (bx, by, bw, bh) => {
      ctx.fillStyle = "rgba(0,0,0,0.20)"; ctx.fillRect(ox + sw * (bx + bw * 0.6), oy + sh * by, sw * bw * 0.4, sh * bh);
      ctx.fillStyle = "rgba(255,242,210,0.15)";
      ctx.fillRect(ox + sw * bx, oy + sh * by, sw * bw, Math.max(1, sh * bh * 0.05));   // liseré haut
      ctx.fillRect(ox + sw * bx, oy + sh * by, Math.max(1, sw * bw * 0.04), sh * bh);   // arête gauche
    };
    const shadeRoof = (lx, ly, ax, ay, rx, ry) => {
      const mx = (lx + rx) / 2, my = (ly + ry) / 2;
      ctx.fillStyle = "rgba(0,0,0,0.24)";
      ctx.beginPath(); ctx.moveTo(ox + sw * ax, oy + sh * ay); ctx.lineTo(ox + sw * rx, oy + sh * ry); ctx.lineTo(ox + sw * mx, oy + sh * my); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,244,214,0.45)"; ctx.lineWidth = Math.max(1, sw * 0.009);
      ctx.beginPath(); ctx.moveTo(ox + sw * lx, oy + sh * ly); ctx.lineTo(ox + sw * ax, oy + sh * ay); ctx.stroke();
    };

    // ── Corps du bâtiment (s'étire sur la terre, partie nord) ───────────────────
    if (stage === 0) {
      // Abri de roseaux / hutte à toit de chaume + foyer rougeoyant la nuit
      px(0.06, 0.18, 0.30, 0.26, "#8a7030");
      shadeBox(0.06, 0.18, 0.30, 0.26);
      ctx.fillStyle = "#6a5018";
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.03, oy + sh * 0.20); ctx.lineTo(ox + sw * 0.21, oy + sh * 0.04); ctx.lineTo(ox + sw * 0.39, oy + sh * 0.20); ctx.closePath(); ctx.fill();
      shadeRoof(0.03, 0.20, 0.21, 0.04, 0.39, 0.20);
      px(0.16, 0.28, 0.09, 0.16, "#2a1a0c");
      ctx.fillStyle = `rgba(220,120,40,${(0.25 + nF * 0.6).toFixed(2)})`;
      ctx.fillRect(ox + sw * 0.18, oy + sh * 0.32, sw * 0.05, sh * 0.10);
    } else if (stage === 1) {
      // Entrepôt à pignon + fenêtre en arc éclairée
      px(0.05, 0.14, 0.34, 0.30, "#7a5828");
      shadeBox(0.05, 0.14, 0.34, 0.30);
      ctx.fillStyle = "#5a3e18";
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.03, oy + sh * 0.16); ctx.lineTo(ox + sw * 0.22, oy + sh * 0.02); ctx.lineTo(ox + sw * 0.41, oy + sh * 0.16); ctx.closePath(); ctx.fill();
      shadeRoof(0.03, 0.16, 0.22, 0.02, 0.41, 0.16);
      px(0.16, 0.22, 0.10, 0.12, "#2a1a0c");
      ctx.fillStyle = litWarm; ctx.beginPath(); ctx.arc(ox + sw * 0.21, oy + sh * 0.22, sw * 0.05, Math.PI, 0); ctx.fill();
    } else if (stage === 2) {
      // Entrepôt de briques + charpente fer, cheminée fumante, fenêtres éclairées
      px(0.05, 0.10, 0.36, 0.34, "#8a7060");
      shadeBox(0.05, 0.10, 0.36, 0.34);
      ctx.fillStyle = "#2a2622";
      ctx.fillRect(ox + sw * 0.05, oy + sh * 0.10, sw * 0.016, sh * 0.34);
      ctx.fillRect(ox + sw * 0.394, oy + sh * 0.10, sw * 0.016, sh * 0.34);
      ctx.fillStyle = "#6a5848";
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.03, oy + sh * 0.12); ctx.lineTo(ox + sw * 0.23, oy + sh * 0.00); ctx.lineTo(ox + sw * 0.43, oy + sh * 0.12); ctx.closePath(); ctx.fill();
      shadeRoof(0.03, 0.12, 0.23, 0.00, 0.43, 0.12);
      for (let i = 0; i < 2 + (tier >= 2 ? 1 : 0); i += 1) {
        ctx.fillStyle = "#2a1a10"; ctx.fillRect(ox + sw * (0.08 + i * 0.11), oy + sh * 0.24, sw * 0.08, sh * 0.10);
        ctx.fillStyle = litWarm; ctx.beginPath(); ctx.arc(ox + sw * (0.12 + i * 0.11), oy + sh * 0.24, sw * 0.04, Math.PI, 0); ctx.fill();
      }
      px(0.30, 0.04, 0.06, 0.20, "#4a3a2a");
      ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(ox + sw * 0.336, oy + sh * 0.04, sw * 0.024, sh * 0.20); // ombre cheminée
      const smk = (now / 700) % 1;
      ctx.fillStyle = `rgba(120,110,100,${((1 - smk) * 0.35).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(ox + sw * 0.33, oy + sh * (0.04 - smk * 0.04 + 0.0), sw * (0.04 + smk * 0.06), 0, Math.PI * 2); ctx.fill();
    } else {
      // Terminal métal / verre + baies vitrées cyan pulsées
      px(0.05, 0.08, 0.38, 0.36, "#2e3c50");
      shadeBox(0.05, 0.08, 0.38, 0.36);
      px(0.03, 0.04, 0.42, 0.05, "#1e2c40");                                           // acrotère (toit plat)
      ctx.fillStyle = "rgba(255,250,230,0.12)"; ctx.fillRect(ox + sw * 0.03, oy + sh * 0.04, sw * 0.42, Math.max(1, sh * 0.012)); // liseré d'acrotère
      const pulse = 0.5 + 0.3 * Math.sin(now / 500);
      ctx.fillStyle = `rgba(80,180,255,${(0.30 + nF * 0.4 + pulse * 0.15).toFixed(2)})`;
      for (let i = 0; i < 3; i += 1) ctx.fillRect(ox + sw * (0.09 + i * 0.11), oy + sh * 0.16, sw * 0.075, sh * 0.10);
    }

    // ── Grue / palan de quai (apparaît avec le tier, balance animée) ────────────
    if (tier >= 1) {
      const craneX = 0.56;
      ctx.strokeStyle = stage >= 3 ? "#607080" : stage >= 2 ? "#707880" : "#6a4a1c";
      ctx.lineWidth = Math.max(1.5, sw * 0.02);
      ctx.beginPath(); ctx.moveTo(ox + sw * craneX, oy + sh * 0.62); ctx.lineTo(ox + sw * craneX, oy + sh * 0.18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox + sw * craneX, oy + sh * 0.18); ctx.lineTo(ox + sw * (craneX + 0.16), oy + sh * 0.23); ctx.stroke();
      const swingX = Math.sin(now / 1200) * 0.025;
      ctx.strokeStyle = "rgba(180,160,100,0.7)"; ctx.lineWidth = Math.max(1, sw * 0.01);
      ctx.beginPath(); ctx.moveTo(ox + sw * (craneX + 0.15), oy + sh * 0.23); ctx.lineTo(ox + sw * (craneX + 0.15 + swingX), oy + sh * 0.40); ctx.stroke();
    }

    // ── PARKING À BATEAUX : designs d'époques passées, garés sur cale ───────────
    // On affiche les versions précédentes distinctes (bv-1, bv-2, …) → un petit
    // musée vivant des bateaux d'antan. Densité ∝ tier.
    const parked = 1 + tier;
    for (let i = 0; i < parked; i += 1) {
      const pbv = bv - 1 - i;
      if (pbv < 0) break;                                  // pas encore d'ancêtre
      const slotX = 0.16 + i * 0.20;
      if (slotX > 0.9) break;
      const py = 0.66;
      const pl = 0.15;
      // Cale en bois sous la coque
      ctx.strokeStyle = "#4a3a22"; ctx.lineWidth = Math.max(1, sw * 0.007);
      for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(ox + sw * (slotX + sgn * pl * 0.42), oy + sh * (py + vf(pl * 0.24))); ctx.lineTo(ox + sw * (slotX + sgn * pl * 0.2), oy + sh * (py + vf(pl * 0.05))); ctx.stroke(); }
      ctx.save(); ctx.globalAlpha *= 0.8;                  // épave patinée
      drawBoat(slotX, py, pl, pbv, false);
      ctx.restore();
    }

    // ── Bollards d'amarrage le long de la lèvre du quai ─────────────────────────
    ctx.fillStyle = stage >= 3 ? "#4a5868" : stage >= 2 ? "#786858" : "#5a4020";
    for (let i = 0; i < 3; i += 1) ctx.fillRect(ox + sw * (0.2 + i * 0.22), oy + sh * 0.73, sw * 0.03, sh * 0.04);

    // ── Ponton + pilotis (courts) qui plongent dans le fleuve + effet de courant ─
    const dockCol = stage >= 3 ? "#2a3848" : stage >= 2 ? "#58504a" : "#5a3a10";
    // Platelage longitudinal à la lèvre de l'eau
    px(0.08, 0.79, 0.84, 0.04, dockCol);
    // Pilotis plus courts & fins qui s'enfoncent dans l'eau
    const pilingsX = [0.22, 0.50, 0.78];
    for (const fx of pilingsX) px(fx - 0.013, 0.80, 0.026, 0.16, dockCol);
    // Courant : fines ondes claires qui glissent au pied de chaque pilotis (l'eau
    // file devant les pieux). Phase dérivée de now → déterministe, pas de scintillement.
    ctx.strokeStyle = `rgba(190,222,250,${(0.20 + nF * 0.14).toFixed(2)})`;
    ctx.lineWidth = Math.max(0.5, sw * 0.006); ctx.lineCap = "round";
    const flow = (now / 1300) % 1;
    for (let i = 0; i < pilingsX.length; i += 1) {
      const fx = pilingsX[i];
      for (let r = 0; r < 2; r += 1) {
        const ph = (flow + i * 0.37 + r * 0.5) % 1;
        const wy = 0.915 + r * 0.045;
        const drift = (ph - 0.5) * 0.07;                  // file latéralement (sens du courant)
        const wl = 0.045 * (1 - Math.abs(ph - 0.5) * 1.4); // s'étire puis se résorbe
        if (wl <= 0) continue;
        ctx.beginPath();
        ctx.moveTo(ox + sw * (fx - wl + drift), oy + sh * wy);
        ctx.quadraticCurveTo(ox + sw * (fx + drift), oy + sh * (wy - vf(0.012)), ox + sw * (fx + wl + drift), oy + sh * wy);
        ctx.stroke();
      }
    }
    ctx.lineCap = "square";
    // Bateau ACTIF amarré au ponton central, flottant en pleine eau
    drawBoat(0.5, 0.98, Math.min(0.34, 0.22 + tier * 0.04), bv, true);

    // ── Lampe de quai (halo chaud/cyan la nuit ∝ nF) ────────────────────────────
    px(0.04, 0.66, 0.012, 0.12, "#3a3026");
    ctx.fillStyle = stage >= 3 ? `rgba(60,200,255,${(0.16 + nF * 0.45).toFixed(2)})` : `rgba(255,210,120,${(0.16 + nF * 0.5).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(ox + sw * 0.046, oy + sh * 0.66, sw * 0.045, 0, Math.PI * 2); ctx.fill();
    return true;
  }
  if (id === "water_mills") {
    if (band >= 7) { // ROUE D'ÉNERGIE cosmique : moulin sur berge, roue qui plonge dans le VRAI fleuve (pas d'eau fake)
      const cp = COSMIC_PAL[band] || COSMIC_PAL[9];
      const glow = (cx, cy, r, a) => { ctx.save(); ctx.globalCompositeOperation = "lighter"; const g = ctx.createRadialGradient(ox + sw * cx, oy + sh * cy, 0, ox + sw * cx, oy + sh * cy, sw * r); g.addColorStop(0, `rgba(${cp.glow},${a})`); g.addColorStop(1, `rgba(${cp.glow},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox + sw * cx, oy + sh * cy, sw * r, 0, Math.PI * 2); ctx.fill(); ctx.restore(); };
      // PAS de plateforme cosmique : le vrai fleuve + le sol de la carte restent visibles dessous
      ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.beginPath(); ctx.ellipse(ox + sw * 0.62, oy + sh * 0.68, sw * 0.26, sh * 0.05, 0, 0, Math.PI * 2); ctx.fill(); // ombre de contact (ancre le bâtiment)
      // Gros bâtiment du moulin (droite)
      ctx.fillStyle = cp.mid; ctx.beginPath(); ctx.roundRect(ox + sw * 0.44, oy + sh * 0.2, sw * 0.44, sh * 0.5, sw * 0.03); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(ox + sw * 0.7, oy + sh * 0.2, sw * 0.18, sh * 0.5);
      ctx.fillStyle = cp.edge; ctx.fillRect(ox + sw * 0.46, oy + sh * 0.22, sw * 0.4, sh * 0.05);
      if (band === 9) { ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.moveTo(ox + sw * 0.44, oy + sh * 0.2); ctx.lineTo(ox + sw * 0.66, oy + sh * 0.08); ctx.lineTo(ox + sw * 0.88, oy + sh * 0.2); ctx.closePath(); ctx.fill(); }
      else { for (let i = 0; i < 3; i++) { ctx.fillStyle = cp.lite; ctx.fillRect(ox + sw * (0.5 + i * 0.12), oy + sh * 0.36, sw * 0.08, sh * 0.09); } }
      // Roue qui plonge dans le VRAI fleuve (gauche) — gros diamètre, bas dans l'eau
      const wcx = 0.27, wcy = 0.66, R = sw * 0.25, rot = now / 900;
      ctx.strokeStyle = cp.mid; ctx.lineWidth = Math.max(2, sw * 0.03); ctx.beginPath(); ctx.moveTo(ox + sw * wcx, oy + sh * wcy); ctx.lineTo(ox + sw * 0.46, oy + sh * 0.52); ctx.stroke(); // essieu vers le bâtiment
      ctx.strokeStyle = cp.edge; ctx.lineWidth = Math.max(2, sw * 0.04); ctx.beginPath(); ctx.arc(ox + sw * wcx, oy + sh * wcy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = cp.mid; ctx.lineWidth = Math.max(1.5, sw * 0.028);
      for (let a = 0; a < 8; a++) { const ang = rot + a * Math.PI / 4; ctx.beginPath(); ctx.moveTo(ox + sw * wcx, oy + sh * wcy); ctx.lineTo(ox + sw * wcx + Math.cos(ang) * R, oy + sh * wcy + Math.sin(ang) * R); ctx.stroke(); }
      for (let a = 0; a < 8; a++) { const ang = rot + a * Math.PI / 4; ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(ox + sw * wcx + Math.cos(ang) * R, oy + sh * wcy + Math.sin(ang) * R, sw * 0.02, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(ox + sw * wcx, oy + sh * wcy, sw * 0.05, 0, Math.PI * 2); ctx.fill();
      // Clapotis churnés par la roue, qui filent dans le sens de rotation (bas de roue → gauche)
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 3; i++) { const t = (now / 800 + i * 0.34) % 1, cxr = wcx - t * 0.14; ctx.strokeStyle = `rgba(210,235,255,${(0.3 * (1 - t)).toFixed(3)})`; ctx.lineWidth = Math.max(1, sw * 0.012); ctx.beginPath(); ctx.ellipse(ox + sw * cxr, oy + sh * 0.87, sw * (0.05 + t * 0.08), sh * (0.02 + t * 0.03), 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
      glow(wcx, wcy, 0.16, 0.16 + 0.08 * Math.sin(now / 700));
      if (band === 8) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = `rgba(${cp.glow},0.45)`; ctx.lineWidth = Math.max(1, sw * 0.014); ctx.beginPath(); ctx.ellipse(ox + sw * wcx, oy + sh * wcy, R * 1.3, R * 0.4, rot * 0.5, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
      return true;
    }
    // ── MOULIN À EAU UNIQUE — posé sur la rive, eau au sud (comme le port) ──────
    // L'emprise plonge jusqu'au centre du fleuve : la moitié basse du sprite est de
    // l'eau RÉELLEMENT peinte (cf. layout cmWaterMillSpan + branche de pose). On ne
    // peint donc plus de « bief » : on laisse le fleuve transparaître sous la ligne
    // d'eau et la roue/turbine y plonge. 4 stades d'ère (bois → pierre → brique →
    // hydro), le tier enrichissant chacun (fenêtres, fumée, lueur).
    const stage = ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3;
    // ── PIXEL-ART (stade 0) : remplace le moulin procédural par des SPRITES
    //    TRANSPARENTS posés sur la tuile NATURELLE (berge+fleuve déjà rendus = base
    //    nickel) : bâtiment de moulin sur la berge + ROUE À AUBES qui tourne en
    //    plongeant dans le fleuve (sprite statique tourné via ctx, vitesse now/900 =
    //    la roue procédurale). AUCUN procédural/fond peint/hack moteur (leçon du port).
    if (stage === 0 && propReady('mill-prop-house')) {
      // Cabane-moulin EN BOIS (vue 3/4) posée sur la berge : base au ras de la ligne
      // d'eau, roue à aubes montée sur le flanc GAUCHE qui plonge dans le fleuve.
      // Boîte ~CARRÉE (la cabane, ≠ l'ancienne tour étroite 1.18×1.85) → pas de distorsion.
      const twW = 1.5 / Math.max(1, gw), twH = 1.5 / Math.max(1, gh);
      const twCx = 0.58, twBaseCy = 0.53, twCy = twBaseCy - twH / 2;   // cabane légèrement relevée sur la berge (au-dessus du liseré d'herbe) ; la roue plonge plus bas dans l'eau
      blitProp(ctx, ox, oy, sw, sh, 'mill-prop-house', twCx, twCy, twW, twH);
      // Roue COLLÉE au flanc gauche de la cabane (chevauchement = montée sur le mur), bas dans l'eau.
      if (propReady('mill-prop-wheel')) {
        const wF = 1.06, wAng = -(now || 0) / 900;   // sens INVERSÉ
        const wCx = twCx - twW * 0.27;               // MOYEU sur le flanc gauche
        blitPropRot(ctx, ox, oy, sw, sh, 'mill-prop-wheel', wCx, 0.46, wF / Math.max(1, gw), wF / Math.max(1, gh), wAng);
      }
      return true;
    }
    const nF = parseFloat(litWarm.slice(litWarm.lastIndexOf(",") + 1)) || 0;
    const minWH = Math.min(sw, sh);
    // Volume (lumière en haut-gauche) : face DROITE à l'ombre + lisère clair en
    // haut. Appliqué à chaque corps/soubassement pour donner du relief à tous les âges.
    const shadeBox = (x, y, w, h) => {
      ctx.fillStyle = "rgba(0,0,0,0.20)"; ctx.fillRect(ox + sw * (x + w * 0.64), oy + sh * y, sw * w * 0.36, sh * h);
      ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fillRect(ox + sw * x, oy + sh * y, sw * w, Math.max(1, sh * h * 0.05));
    };
    // Moitié droite d'un toit en pignon, à l'ombre (apex → base droite → aplomb).
    const shadeTri = (ax, ay, brx, byy) => {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath(); ctx.moveTo(ox + sw * ax, oy + sh * ay); ctx.lineTo(ox + sw * brx, oy + sh * byy); ctx.lineTo(ox + sw * ax, oy + sh * byy); ctx.closePath(); ctx.fill();
    };

    // ── Soubassement / pierrée sous le corps (gauche, x<0.60) : ancre le moulin
    //    au-dessus de l'eau et masque la ligne de berge (variable selon le fleuve).
    //    À droite (x>0.60) on laisse l'eau libre pour que la roue y plonge. ───────
    const baseTop = 0.46, baseBot = 0.74;
    const foundCol = ["#5a3a18", "#6b6358", "#7c6c60", "#39454f"][stage];
    px(0.06, baseTop, 0.56, baseBot - baseTop, foundCol);
    ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fillRect(ox + sw * (0.06 + 0.56 * 0.66), oy + sh * baseTop, sw * 0.56 * 0.34, sh * (baseBot - baseTop)); // face droite à l'ombre
    px(0.06, baseBot - 0.025, 0.56, 0.025, "rgba(0,0,0,0.32)");      // lèvre humide
    const pileCol = ["#3a2810", "#4a4640", "#564b44", "#27313b"][stage];
    for (const fx of [0.16, 0.34, 0.52]) px(fx - 0.012, baseBot, 0.024, 0.16, pileCol); // pilotis dans l'eau

    // ── Corps du moulin selon le stade ────────────────────────────────────────
    if (stage === 0) {
      // Bois + toit de chaume (moulin primitif)
      px(0.10, 0.18, 0.46, 0.32, "#8a6a30");
      shadeBox(0.10, 0.18, 0.46, 0.32);
      ctx.fillStyle = "#6a5018";
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.06, oy + sh * 0.20); ctx.lineTo(ox + sw * 0.33, oy + sh * 0.04); ctx.lineTo(ox + sw * 0.60, oy + sh * 0.20); ctx.closePath(); ctx.fill();
      shadeTri(0.33, 0.04, 0.60, 0.20);
      px(0.18, 0.32, 0.10, 0.16, "#2a1a0c");                          // porte
      ctx.fillStyle = litWarm; ctx.fillRect(ox + sw * 0.37, oy + sh * 0.28, sw * 0.10, sh * 0.09); // fenêtre
    } else if (stage === 1) {
      // Pierre + colombage + double lucarne (moulin médiéval) + bief en bois
      px(0.10, 0.16, 0.46, 0.34, "#9a8050");
      shadeBox(0.10, 0.16, 0.46, 0.34);
      ctx.strokeStyle = "rgba(70,45,12,0.5)"; ctx.lineWidth = Math.max(0.5, sw * 0.016);
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.10, oy + sh * 0.33); ctx.lineTo(ox + sw * 0.56, oy + sh * 0.33); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.33, oy + sh * 0.16); ctx.lineTo(ox + sw * 0.33, oy + sh * 0.48); ctx.stroke();
      ctx.fillStyle = "#5a3a10";
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.05, oy + sh * 0.18); ctx.lineTo(ox + sw * 0.33, oy + sh * 0.02); ctx.lineTo(ox + sw * 0.61, oy + sh * 0.18); ctx.closePath(); ctx.fill();
      shadeTri(0.33, 0.02, 0.61, 0.18);
      ctx.fillStyle = litWarm; ctx.fillRect(ox + sw * 0.18, oy + sh * 0.22, sw * 0.10, sh * 0.08); ctx.fillRect(ox + sw * 0.38, oy + sh * 0.22, sw * 0.10, sh * 0.08);
      // Bief / vanne de bois amenant l'eau en haut de la roue (overshot)
      ctx.fillStyle = "#6a4a1c";
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.52, oy + sh * 0.40); ctx.lineTo(ox + sw * 0.74, oy + sh * 0.50); ctx.lineTo(ox + sw * 0.74, oy + sh * 0.56); ctx.lineTo(ox + sw * 0.52, oy + sh * 0.46); ctx.closePath(); ctx.fill();
    } else if (stage === 2) {
      // Minoterie industrielle : brique multi-étages, chaînage de pierre aux angles,
      // toit d'ardoise à deux pentes, lucarne de levage (poulie qui hisse les sacs),
      // grande cheminée à bandeau. Fenêtres en arc éclairées (rangées ∝ tier).
      px(0.09, 0.16, 0.50, 0.34, "#9a4e3c");
      // Assises de brique (lignes claires fines)
      ctx.strokeStyle = "rgba(40,16,10,0.28)"; ctx.lineWidth = Math.max(0.5, sw * 0.008);
      for (let r = 1; r < 5; r += 1) { const yy = 0.16 + 0.34 * r / 5; ctx.beginPath(); ctx.moveTo(ox + sw * 0.09, oy + sh * yy); ctx.lineTo(ox + sw * 0.59, oy + sh * yy); ctx.stroke(); }
      shadeBox(0.09, 0.16, 0.50, 0.34);
      // Chaînage de pierre aux angles
      ctx.fillStyle = "#c9b48a";
      ctx.fillRect(ox + sw * 0.09, oy + sh * 0.16, sw * 0.028, sh * 0.34);
      ctx.fillRect(ox + sw * 0.562, oy + sh * 0.16, sw * 0.028, sh * 0.34);
      // Toit d'ardoise à deux pentes
      ctx.fillStyle = "#3c4450";
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.06, oy + sh * 0.16); ctx.lineTo(ox + sw * 0.34, oy + sh * 0.04); ctx.lineTo(ox + sw * 0.62, oy + sh * 0.16); ctx.closePath(); ctx.fill();
      shadeTri(0.34, 0.04, 0.62, 0.16);
      // Lucarne de levage + potence + poulie
      ctx.fillStyle = "#5a4a40"; ctx.fillRect(ox + sw * 0.30, oy + sh * 0.075, sw * 0.10, sh * 0.085);
      ctx.fillStyle = "#1e1712"; ctx.fillRect(ox + sw * 0.325, oy + sh * 0.10, sw * 0.05, sh * 0.06);
      ctx.strokeStyle = "#2e2620"; ctx.lineWidth = Math.max(1, sw * 0.016); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.35, oy + sh * 0.075); ctx.lineTo(ox + sw * 0.35, oy + sh * 0.025); ctx.lineTo(ox + sw * 0.44, oy + sh * 0.035); ctx.stroke();
      ctx.lineCap = "butt";
      ctx.fillStyle = "#1e1712"; ctx.beginPath(); ctx.arc(ox + sw * 0.44, oy + sh * 0.055, sw * 0.012, 0, Math.PI * 2); ctx.fill();
      // Fenêtres en arc éclairées (2 colonnes × 1-2 rangées)
      const wcols = [0.18, 0.40], wrows = [0.225, 0.355];
      const nRows = tier >= 1 ? 2 : 1;
      for (let ci = 0; ci < wcols.length; ci += 1) for (let ri = 0; ri < nRows; ri += 1) {
        const wx = wcols[ci], wy = wrows[ri];
        ctx.fillStyle = "#2a1410"; ctx.fillRect(ox + sw * wx, oy + sh * wy, sw * 0.09, sh * 0.085);
        ctx.beginPath(); ctx.arc(ox + sw * (wx + 0.045), oy + sh * wy, sw * 0.045, Math.PI, 0); ctx.fill();
        ctx.fillStyle = litGold; ctx.fillRect(ox + sw * (wx + 0.013), oy + sh * (wy + 0.004), sw * 0.064, sh * 0.078);
        ctx.beginPath(); ctx.arc(ox + sw * (wx + 0.045), oy + sh * (wy + 0.004), sw * 0.032, Math.PI, 0); ctx.fill();
      }
      // Grande cheminée à bandeau (gauche) + fumée
      px(0.035, 0.0, 0.05, 0.50, "#7a3e30");
      px(0.03, 0.04, 0.06, 0.028, "#caa07a");
      ctx.fillStyle = "rgba(0,0,0,0.20)"; ctx.fillRect(ox + sw * 0.066, oy, sw * 0.019, sh * 0.50); // face droite cheminée
      const smk = (now / 700) % 1;
      ctx.fillStyle = `rgba(120,110,100,${((1 - smk) * 0.35).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(ox + sw * (0.06 + smk * 0.02), oy + sh * (-smk * 0.05), sw * (0.03 + smk * 0.05), 0, Math.PI * 2); ctx.fill();
    } else {
      // Béton/verre + conduite forcée + baies cyan pulsées (centrale hydro)
      px(0.10, 0.14, 0.50, 0.36, "#33414f");
      shadeBox(0.10, 0.14, 0.50, 0.36);
      px(0.08, 0.10, 0.54, 0.05, "#27333d");
      ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(ox + sw * (0.08 + 0.54 * 0.66), oy + sh * 0.10, sw * 0.54 * 0.34, sh * 0.05);
      const pulse = 0.5 + 0.3 * Math.sin(now / 500);
      ctx.fillStyle = `rgba(80,200,255,${(0.28 + nF * 0.4 + pulse * 0.15).toFixed(2)})`;
      for (let i = 0; i < 3; i += 1) ctx.fillRect(ox + sw * (0.13 + i * 0.15), oy + sh * 0.20, sw * 0.10, sh * 0.12);
      // Conduite forcée (penstock) vers la turbine
      ctx.strokeStyle = "#5a6470"; ctx.lineWidth = Math.max(2, sw * 0.05); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.56, oy + sh * 0.40); ctx.lineTo(ox + sw * 0.72, oy + sh * 0.62); ctx.stroke(); ctx.lineCap = "butt";
    }

    // ── Roue à aubes / turbine (identité du moulin) — moitié basse dans l'eau ───
    const cx = ox + sw * 0.76, cy = oy + sh * 0.72, rr = minWH * 0.20;
    if (stage < 3) {
      const rimCol = ["#4a2e0c", "#5a3a14", "#3a3a40"][stage];
      const armCol = ["#7a5418", "#8a5e1e", "#6a6a72"][stage];
      ctx.strokeStyle = rimCol; ctx.lineWidth = Math.max(1.5, sw * 0.045);
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = rimCol; ctx.lineWidth = Math.max(1, sw * 0.028);
      ctx.beginPath(); ctx.arc(cx, cy, rr * 0.55, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 8; i += 1) {
        const a = now / 620 + i * Math.PI / 4;
        ctx.strokeStyle = armCol; ctx.lineWidth = Math.max(1, sw * 0.022);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); ctx.stroke();
        ctx.save();
        ctx.translate(cx + Math.cos(a) * rr * 0.92, cy + Math.sin(a) * rr * 0.92);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillStyle = armCol; ctx.fillRect(-sw * 0.04, -sh * 0.014, sw * 0.08, sh * 0.028);
        ctx.restore();
      }
      ctx.fillStyle = rimCol; ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.5, rr * 0.14), 0, Math.PI * 2); ctx.fill();
    } else {
      // Turbine hydro : carter + rotor cyan lumineux qui tourne
      ctx.fillStyle = "#2c3640"; ctx.beginPath(); ctx.arc(cx, cy, rr * 1.12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(80,200,255,${(0.4 + nF * 0.5).toFixed(2)})`; ctx.lineWidth = Math.max(1.5, sw * 0.04);
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 7; i += 1) {
        const a = now / 360 + i * Math.PI * 2 / 7;
        ctx.strokeStyle = `rgba(120,220,255,${(0.5 + nF * 0.4).toFixed(2)})`; ctx.lineWidth = Math.max(1, sw * 0.03);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * rr * 0.92, cy + Math.sin(a) * rr * 0.92); ctx.stroke();
      }
      ctx.fillStyle = `rgba(160,235,255,${(0.6 + nF * 0.4).toFixed(2)})`; ctx.beginPath(); ctx.arc(cx, cy, rr * 0.2, 0, Math.PI * 2); ctx.fill();
    }

    // ── Éclaboussures / remous là où la roue frappe l'eau réelle ───────────────
    const splCol = stage >= 3 ? "180,235,255" : "210,235,255";
    for (let si = 0; si < 4; si += 1) {
      const sph = ((now / 450) + si / 4) % 1;
      ctx.fillStyle = `rgba(${splCol},${((1 - sph) * 0.55).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(cx - rr * 0.3 + sph * rr * 0.6, cy + rr * 0.9 - sph * sh * 0.05, Math.max(0.8, sw * 0.015), 0, Math.PI * 2);
      ctx.fill();
    }
    return true;
  }
  if (id === "mint_houses") {
    if (band >= 7) { // CHAMBRE FORTE cosmique : voûte + pièces + frappe qui bat + pièce en orbite
      const { cp, glow } = cosmicBase(ctx, ox, oy, sw, sh, px, band);
      ctx.fillStyle = cp.mid; ctx.beginPath(); ctx.roundRect(ox + sw * 0.28, oy + sh * 0.46, sw * 0.44, sh * 0.38, sw * 0.05); ctx.fill();
      ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.ellipse(ox + sw * 0.5, oy + sh * 0.46, sw * 0.22, sh * 0.1, 0, Math.PI, 0); ctx.fill();
      if (band === 9) { ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.moveTo(ox + sw * 0.28, oy + sh * 0.46); ctx.lineTo(ox + sw * 0.5, oy + sh * 0.34); ctx.lineTo(ox + sw * 0.72, oy + sh * 0.46); ctx.closePath(); ctx.fill(); }
      for (let i = 0; i < 3; i++) { const cy3 = 0.74 - i * 0.06, pl = 0.5 + 0.5 * Math.sin(now / 500 + i); ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.ellipse(ox + sw * 0.5, oy + sh * cy3, sw * 0.09, sh * 0.03, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 0.4 + 0.4 * pl; ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.ellipse(ox + sw * 0.5, oy + sh * cy3, sw * 0.05, sh * 0.018, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      const press = 0.36 + Math.max(0, Math.sin(now / 360)) * 0.14;
      ctx.fillStyle = cp.lite; ctx.fillRect(ox + sw * 0.46, oy + sh * 0.2, sw * 0.08, sh * (press - 0.2));
      ctx.fillStyle = cp.edge; ctx.fillRect(ox + sw * 0.44, oy + sh * press, sw * 0.12, sh * 0.03);
      if (band !== 7) { const ra = now / 1300, mx = 0.5 + Math.cos(ra) * 0.3, my = 0.5 + Math.sin(ra) * 0.14; ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.ellipse(ox + sw * mx, oy + sh * my, sw * 0.028, sh * 0.014, 0, 0, Math.PI * 2); ctx.fill(); glow(mx, my, 0.06, 0.4); }
      glow(0.5, 0.6, 0.16, 0.14 + 0.08 * Math.sin(now / 650));
      return true;
    }
    // 4 stades suivant l'âge de la ville (ei = eraIndex 0–34), un tous les
    // 10 âges : atelier de frappe à la masse → hôtel des monnaies classique →
    // manufacture à vapeur (balancier) → frappe numérique automatisée.
    // tier reste la richesse intra-stade (piles de pièces / cadence / lueur).
    const stage = ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3;
    if (stage === 0) {
      // ── STADE 0 · ATELIER DE FRAPPE — four à creuset, enclume, coin gravé ──
      // Pixel-art = atelier PixelLab : le BÂTIMENT reste figé, seul le FEU de forge
      // est ANIMÉ (bande de 7 frames, cf. blitForge — feu PIXEL baké, pas d'overlay
      // procédural). Repli : prop statique mint-prop-forge, puis l'atelier vectoriel
      // d'origine tant que rien n'est chargé.
      if (animReady('mint-forge-fire') || propReady('mint-prop-forge')) {
        // Tache de sol douce qui se fond dans le terrain (sous l'atelier)
        {
          const cxp = ox + sw * 0.5, cyp = oy + sh * 0.83, R = sw * 0.46, ky = (sh * 0.22) / R;
          ctx.save(); ctx.translate(cxp, cyp); ctx.scale(1, ky); ctx.translate(-cxp, -cyp);
          const g = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, R);
          g.addColorStop(0, "rgba(38,26,12,0.45)");
          g.addColorStop(0.6, "rgba(38,26,12,0.22)");
          g.addColorStop(1, "rgba(38,26,12,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cxp, cyp, R, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        // L'atelier (PixelLab) — aspect 96×80 préservé ; feu animé si la bande est prête,
        // sinon prop statique (frame figée équivalente).
        if (animReady('mint-forge-fire')) blitAnim(ctx, ox, oy, sw, sh, 'mint-forge-fire', now, 0.5, 0.53, 0.88, 0.73);
        else blitProp(ctx, ox, oy, sw, sh, 'mint-prop-forge', 0.5, 0.53, 0.88, 0.73);
        return true;
      }
      // ── repli procédural (l'atelier de frappe vectoriel d'origine) ──
      // L'or se monnaie déjà mais à la main : on fond le flan au creuset puis on
      // le frappe entre deux coins à coups de masse. Pierre brute + braises.
      px(0.0, 0.66, 1.0, 0.34, "#241a10");                   // sol de terre battue
      // Appentis ouvert : poteaux de bois + auvent de chaume abritant l'atelier
      ctx.fillStyle = "#5a3c18";
      ctx.fillRect(ox+sw*0.1, oy+sh*0.32, sw*0.045, sh*0.36);
      ctx.fillRect(ox+sw*0.855, oy+sh*0.32, sw*0.045, sh*0.36);
      ctx.fillStyle = "#7a5a24";
      ctx.beginPath(); ctx.moveTo(ox+sw*0.05, oy+sh*0.34); ctx.lineTo(ox+sw*0.5, oy+sh*0.16); ctx.lineTo(ox+sw*0.95, oy+sh*0.34); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,235,170,0.16)";              // versant éclairé
      ctx.beginPath(); ctx.moveTo(ox+sw*0.05, oy+sh*0.34); ctx.lineTo(ox+sw*0.5, oy+sh*0.16); ctx.lineTo(ox+sw*0.5, oy+sh*0.34); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(40,26,10,0.5)"; ctx.lineWidth = Math.max(0.5, sw*0.012); // chevrons de chaume
      for (let s=1;s<5;s++){const t=s/5; ctx.beginPath(); ctx.moveTo(ox+sw*(0.05+(0.5-0.05)*t), oy+sh*(0.34-(0.34-0.16)*t)); ctx.lineTo(ox+sw*(0.95-(0.95-0.5)*t), oy+sh*(0.34-(0.34-0.16)*t)); ctx.stroke();}
      // Four à creuset (gauche) — maçonnerie + gueule de braises qui respirent
      px(0.15, 0.48, 0.2, 0.26, "#46301e");
      px(0.15, 0.48, 0.055, 0.26, "rgba(255,255,255,0.07)"); // arête éclairée
      strokeRect(0.15, 0.48, 0.2, 0.26, "rgba(20,12,6,0.6)");
      const glow = 0.5 + 0.5*Math.sin(now/320);
      ctx.fillStyle = `rgba(${(215+glow*40)|0},${(85+glow*75)|0},22,0.95)`;
      ctx.beginPath(); ctx.arc(ox+sw*0.25, oy+sh*0.64, sw*0.052, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = `rgba(255,232,150,${(0.45+glow*0.4).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(ox+sw*0.25, oy+sh*0.64, sw*0.026, 0, Math.PI*2); ctx.fill();
      // Volute de fumée au-dessus du four
      ctx.fillStyle = "rgba(70,58,46,0.28)";
      for (let s=0;s<3;s++){const sy=0.46-s*0.08-((now/950)%0.08); ctx.beginPath(); ctx.arc(ox+sw*(0.25+Math.sin(now/520+s)*0.025), oy+sh*sy, sw*(0.018+s*0.01), 0, Math.PI*2); ctx.fill();}
      // Enclume de pierre + flan posé dessus (centre-droit)
      const avx = 0.6, avy = 0.7;
      ctx.fillStyle = "#5a5a64"; ctx.fillRect(ox+sw*(avx-0.02), oy+sh*avy, sw*0.04, sh*0.1);      // pied
      ctx.fillStyle = "#7a7a86"; ctx.fillRect(ox+sw*(avx-0.07), oy+sh*(avy-0.04), sw*0.14, sh*0.05); // table
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(ox+sw*(avx+0.01), oy+sh*(avy-0.04), sw*0.06, sh*0.05);
      ctx.fillStyle = "#e8c040"; ctx.beginPath(); ctx.ellipse(ox+sw*avx, oy+sh*(avy-0.045), sw*0.022, sh*0.01, 0, 0, Math.PI*2); ctx.fill(); // flan doré
      // Monnayeur à la masse (frappe périodique sur l'enclume)
      const strike = Math.max(0, Math.sin(now / 460));
      const wx = avx + 0.13, wy = 0.74;
      ctx.fillStyle = "#4a3014"; ctx.fillRect(ox+sw*(wx-0.025), oy+sh*(wy-0.05), sw*0.05, sh*0.1);
      ctx.fillStyle = "#c48c50"; ctx.beginPath(); ctx.arc(ox+sw*wx, oy+sh*(wy-0.075), sw*0.026, 0, Math.PI*2); ctx.fill();
      const ha = -2.1 + strike * 1.1;                        // bras lève (haut) puis abat vers l'enclume
      const hx3 = wx - 0.02 + Math.cos(ha)*0.09, hy3 = wy - 0.04 + Math.sin(ha)*0.09;
      ctx.strokeStyle = "#4a3014"; ctx.lineWidth = Math.max(1, sw*0.024); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(ox+sw*(wx-0.02), oy+sh*(wy-0.04)); ctx.lineTo(ox+sw*hx3, oy+sh*hy3); ctx.stroke();
      ctx.lineCap = "butt";
      ctx.fillStyle = "#6a4a22"; ctx.fillRect(ox+sw*(hx3-0.022), oy+sh*(hy3-0.018), sw*0.044, sh*0.03); // masse (maillet bois)
      // Étincelle d'impact (masse au plus bas, sur le flan)
      if (strike < 0.12) {
        ctx.fillStyle = "rgba(255,236,150,0.9)";
        for (const [ex,ey] of [[avx-0.02,avy-0.06],[avx+0.02,avy-0.07],[avx,avy-0.09]]) { ctx.beginPath(); ctx.arc(ox+sw*ex, oy+sh*ey, Math.max(0.8, sw*0.012), 0, Math.PI*2); ctx.fill(); }
      }
      // Pièces frappées rangées au sol (croît avec le tier)
      for (let k = 0; k < 2 + tier && k < 4; k++) {
        const pileX = 0.2 + k * 0.085, nCoins = 2 + ((k * 7) % 3);
        for (let c = 0; c < nCoins; c++) {
          ctx.fillStyle = c === nCoins - 1 ? "#e8c040" : "#c89828";
          ctx.beginPath(); ctx.ellipse(ox+sw*pileX, oy+sh*(0.84 - c*0.02), sw*0.026, sh*0.01, 0, 0, Math.PI*2); ctx.fill();
        }
      }
      return true;
    }
    if (stage === 1) {
    // ── STADE 1 · HÔTEL DES MONNAIES — coffre, balance, monnayeur au marteau ──
    // Pixel-art = prop PixelLab STATIQUE (le BÂTIMENT médiéval — pierre/colombages,
    // toit, fenêtres à barreaux et emblème pièce sont BAKÉS dans le sprite). Aucun
    // overlay procédural (pas de pièces jaunes ni de lueur clignotante — retirés à la
    // demande). Repli sur l'hôtel des monnaies vectoriel d'origine tant que le prop
    // n'est pas chargé (zéro tuile vide).
    if (propReady('mint-prop-house')) {
      // Tache de sol douce qui se fond dans le terrain (sous le bâtiment)
      {
        const cxp = ox + sw * 0.5, cyp = oy + sh * 0.87, R = sw * 0.46, ky = (sh * 0.24) / R;
        ctx.save(); ctx.translate(cxp, cyp); ctx.scale(1, ky); ctx.translate(-cxp, -cyp);
        const g = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, R);
        g.addColorStop(0, "rgba(38,26,12,0.45)");
        g.addColorStop(0.6, "rgba(38,26,12,0.22)");
        g.addColorStop(1, "rgba(38,26,12,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cxp, cyp, R, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      // Le bâtiment (prop PixelLab) — aspect 96×96 carré, calé comme guild-prop-lodge
      blitProp(ctx, ox, oy, sw, sh, 'mint-prop-house', 0.5, 0.5, 0.86, 0.86);
      return true;
    }
    // ── repli procédural (l'hôtel des monnaies vectoriel d'origine) ──
    // Bâtiment sécurisé (murs épais, pierre)
    ctx.fillStyle = "#a89060"; ctx.fillRect(ox+sw*0.14, oy+sh*0.24, sw*0.72, sh*0.6);
    ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fillRect(ox+sw*0.7, oy+sh*0.24, sw*0.16, sh*0.6);
    // Toit mansardé (banque classique)
    ctx.fillStyle = "#6a5838"; ctx.fillRect(ox+sw*0.1, oy+sh*0.18, sw*0.8, sh*0.1);
    ctx.fillStyle = "#504430";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.08, oy+sh*0.28); ctx.lineTo(ox+sw*0.5, oy+sh*0.1); ctx.lineTo(ox+sw*0.92, oy+sh*0.28); ctx.lineTo(ox+sw*0.86, oy+sh*0.22); ctx.lineTo(ox+sw*0.5, oy+sh*0.14); ctx.lineTo(ox+sw*0.14, oy+sh*0.22); ctx.closePath(); ctx.fill();
    // Grilles de fenêtres (sécurité)
    ctx.fillStyle = litGold;
    ctx.fillRect(ox+sw*0.22, oy+sh*0.38, sw*0.14, sh*0.11);
    ctx.fillRect(ox+sw*0.64, oy+sh*0.38, sw*0.14, sh*0.11);
    ctx.strokeStyle = "rgba(60,40,10,0.6)"; ctx.lineWidth = Math.max(0.5, sw*0.018);
    for (const gx2 of [0.22, 0.64]) {
      ctx.strokeRect(ox+sw*gx2, oy+sh*0.38, sw*0.14, sh*0.11);
      ctx.beginPath(); ctx.moveTo(ox+sw*(gx2+0.07), oy+sh*0.38); ctx.lineTo(ox+sw*(gx2+0.07), oy+sh*0.49); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*gx2, oy+sh*0.445); ctx.lineTo(ox+sw*(gx2+0.14), oy+sh*0.445); ctx.stroke();
    }
    // Porte de coffre (centrale, ronde)
    ctx.fillStyle = "#4a3818"; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.68, sw*0.1, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#c8a030"; ctx.lineWidth = Math.max(1.5, sw*0.03);
    ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.68, sw*0.1, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = "#a07820"; ctx.lineWidth = Math.max(1, sw*0.022);
    for (let ri = 0; ri < 4; ri++) {
      const ra = ri * Math.PI/4;
      ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.68); ctx.lineTo(ox+sw*(0.5+Math.cos(ra)*0.09), oy+sh*(0.68+Math.sin(ra)*0.09)); ctx.stroke();
    }
    ctx.fillStyle = "#d4a828"; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.68, sw*0.04, 0, Math.PI*2); ctx.fill();
    // Frappe de la monnaie : piles de pièces devant le coffre + coup de
    // marteau périodique avec étincelle (diégétique — fini les pièces qui
    // s'envolaient du toit comme de la fumée).
    {
      // Piles de pièces (grandissent avec le tier)
      for (let k = 0; k < 2 + tier && k < 4; k++) {
        const pileX = 0.24 + k * 0.13;
        const nCoins = 2 + ((k * 7) % 3);
        for (let c = 0; c < nCoins; c++) {
          ctx.fillStyle = c === nCoins - 1 ? "#e8c040" : "#c89828";
          ctx.beginPath(); ctx.ellipse(ox + sw * pileX, oy + sh * (0.82 - c * 0.022), sw * 0.032, sh * 0.012, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
      // Monnayeur au marteau (droite du coffre)
      const strike = Math.max(0, Math.sin(now / 480));     // lève puis frappe
      const hx2 = 0.74, hy2 = 0.76;
      ctx.fillStyle = "#3a2c14";
      ctx.fillRect(ox + sw * (hx2 - 0.025), oy + sh * (hy2 - 0.05), sw * 0.05, sh * 0.09);
      ctx.fillStyle = "#c49060";
      ctx.beginPath(); ctx.arc(ox + sw * hx2, oy + sh * (hy2 - 0.07), sw * 0.024, 0, Math.PI * 2); ctx.fill();
      // Bras + marteau (angle suit la frappe)
      const ha = -0.4 - strike * 0.9;
      ctx.strokeStyle = "#3a2c14"; ctx.lineWidth = Math.max(1, sw * 0.022); ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(ox + sw * (hx2 + 0.02), oy + sh * (hy2 - 0.03));
      ctx.lineTo(ox + sw * (hx2 + 0.02 + Math.cos(ha) * 0.07), oy + sh * (hy2 - 0.03 + Math.sin(ha) * 0.07));
      ctx.stroke();
      ctx.lineCap = "butt";
      ctx.fillStyle = "#8a8a92";
      ctx.fillRect(ox + sw * (hx2 + 0.02 + Math.cos(ha) * 0.07 - 0.015), oy + sh * (hy2 - 0.03 + Math.sin(ha) * 0.07 - 0.012), sw * 0.03, sh * 0.024);
      // Étincelle au moment de l'impact (marteau bas)
      if (strike < 0.12) {
        ctx.fillStyle = "rgba(255,230,120,0.9)";
        ctx.beginPath(); ctx.arc(ox + sw * (hx2 + 0.055), oy + sh * (hy2 + 0.02), Math.max(1, sw * 0.018), 0, Math.PI * 2); ctx.fill();
      }
    }
    // Balance (symbole sur le fronton)
    ctx.fillStyle = "#c8a030"; ctx.fillRect(ox+sw*0.47, oy+sh*0.14, sw*0.06, sh*0.07);
    ctx.beginPath(); ctx.moveTo(ox+sw*0.38, oy+sh*0.16); ctx.lineTo(ox+sw*0.62, oy+sh*0.16); ctx.stroke();
    ctx.beginPath(); ctx.arc(ox+sw*0.38, oy+sh*0.19, sw*0.04, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(ox+sw*0.62, oy+sh*0.19, sw*0.04, 0, Math.PI); ctx.stroke();
    return true;
    }
    if (stage === 2) {
      // ── STADE 2 · MANUFACTURE À VAPEUR — brique, cheminée, balancier mécanisé ──
      // La frappe s'industrialise : un balancier monétaire entraîné par volant
      // d'inertie bat la monnaie en cadence, la vapeur fume, les pièces défilent.
      px(0.0, 0.7, 1.0, 0.3, "#1c1812");                     // sol d'atelier
      // Corps de brique
      px(0.12, 0.3, 0.76, 0.46, "#7a3c2a");
      px(0.7, 0.3, 0.18, 0.46, "rgba(0,0,0,0.18)");          // ombre côté droit
      // Assises de brique
      ctx.strokeStyle = "rgba(40,18,12,0.4)"; ctx.lineWidth = Math.max(0.5, sw*0.01);
      for (let r=1;r<7;r++){ ctx.beginPath(); ctx.moveTo(ox+sw*0.12, oy+sh*(0.3+r*0.065)); ctx.lineTo(ox+sw*0.88, oy+sh*(0.3+r*0.065)); ctx.stroke(); }
      // Toit à shed dentelé (verrières d'usine)
      ctx.fillStyle = "#4a4a52";
      for (let k=0;k<3;k++){const rx=0.14+k*0.25; ctx.beginPath(); ctx.moveTo(ox+sw*rx, oy+sh*0.3); ctx.lineTo(ox+sw*(rx+0.12), oy+sh*0.22); ctx.lineTo(ox+sw*(rx+0.24), oy+sh*0.3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = litWarm; ctx.fillRect(ox+sw*(rx+0.005), oy+sh*0.245, sw*0.1, sh*0.05); ctx.fillStyle = "#4a4a52"; }
      // Cheminée + fumée
      px(0.74, 0.1, 0.08, 0.22, "#5a2c1e");
      px(0.74, 0.08, 0.08, 0.03, "#3a1c12");
      ctx.fillStyle = "rgba(80,72,64,0.32)";
      for (let s=0;s<4;s++){const sy=0.1-s*0.06-((now/780)%0.06); if(sy<0.02) continue; ctx.beginPath(); ctx.arc(ox+sw*(0.78+Math.sin(now/600+s)*0.03), oy+sh*sy, sw*(0.02+s*0.012), 0, Math.PI*2); ctx.fill();}
      // Fenêtres d'atelier éclairées (gaz)
      ctx.fillStyle = litWarm;
      for (let wi=0; wi<3; wi++) ctx.fillRect(ox+sw*(0.18+wi*0.2), oy+sh*0.5, sw*0.1, sh*0.12);
      ctx.strokeStyle = "rgba(40,18,12,0.5)"; ctx.lineWidth = Math.max(0.5, sw*0.012);
      for (let wi=0; wi<3; wi++) ctx.strokeRect(ox+sw*(0.18+wi*0.2), oy+sh*0.5, sw*0.1, sh*0.12);
      // Balancier monétaire au premier plan : socle + volant d'inertie tournant
      const fwx = 0.32, fwy = 0.72, fr = 0.09;
      ctx.fillStyle = "#3a3a44"; ctx.fillRect(ox+sw*(fwx-0.02), oy+sh*0.78, sw*0.04, sh*0.16); // bâti
      ctx.fillStyle = "#2c2c34"; ctx.beginPath(); ctx.arc(ox+sw*fwx, oy+sh*fwy, sw*fr, 0, Math.PI*2); ctx.fill(); // volant
      ctx.strokeStyle = "#6a6a76"; ctx.lineWidth = Math.max(1, sw*0.02);
      ctx.beginPath(); ctx.arc(ox+sw*fwx, oy+sh*fwy, sw*fr, 0, Math.PI*2); ctx.stroke();
      const fa = (now/240) % (Math.PI*2);                    // rayons qui tournent
      ctx.strokeStyle = "#52525c"; ctx.lineWidth = Math.max(0.8, sw*0.014);
      for (let r=0;r<4;r++){const a=fa+r*Math.PI/4; ctx.beginPath(); ctx.moveTo(ox+sw*(fwx-Math.cos(a)*fr*0.9), oy+sh*(fwy-Math.sin(a)*fr*0.9)); ctx.lineTo(ox+sw*(fwx+Math.cos(a)*fr*0.9), oy+sh*(fwy+Math.sin(a)*fr*0.9)); ctx.stroke();}
      ctx.fillStyle = "#8a8a92"; ctx.beginPath(); ctx.arc(ox+sw*fwx, oy+sh*fwy, sw*0.018, 0, Math.PI*2); ctx.fill(); // moyeu
      // Bielle + coulisseau de frappe (monte/descend en cadence avec le volant)
      const press = (Math.sin(now/240) * 0.5 + 0.5);         // 0 haut → 1 bas
      const pcx = fwx + 0.22;
      ctx.fillStyle = "#3a3a44"; ctx.fillRect(ox+sw*(pcx-0.05), oy+sh*0.4, sw*0.1, sh*0.46); // colonnes du balancier
      ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fillRect(ox+sw*(pcx+0.02), oy+sh*0.4, sw*0.03, sh*0.46);
      ctx.strokeStyle = "#6a6a76"; ctx.lineWidth = Math.max(1, sw*0.018);
      ctx.beginPath(); ctx.moveTo(ox+sw*(fwx+fr*0.6), oy+sh*fwy); ctx.lineTo(ox+sw*pcx, oy+sh*(0.5+press*0.12)); ctx.stroke(); // bielle
      ctx.fillStyle = "#7a7a86"; ctx.fillRect(ox+sw*(pcx-0.045), oy+sh*(0.5+press*0.12), sw*0.09, sh*0.05); // coulisseau (matrice)
      // Enclume basse + flan frappé + étincelle au point bas
      ctx.fillStyle = "#52525c"; ctx.fillRect(ox+sw*(pcx-0.05), oy+sh*0.66, sw*0.1, sh*0.05);
      ctx.fillStyle = "#e8c040"; ctx.beginPath(); ctx.ellipse(ox+sw*pcx, oy+sh*0.655, sw*0.02, sh*0.009, 0, 0, Math.PI*2); ctx.fill();
      if (press > 0.92) { ctx.fillStyle = "rgba(255,236,150,0.9)"; for (const dx of [-0.03,0.03,0]) { ctx.beginPath(); ctx.arc(ox+sw*(pcx+dx), oy+sh*(0.65-Math.abs(dx)), Math.max(0.8,sw*0.012), 0, Math.PI*2); ctx.fill(); } }
      // Pièces fraîchement frappées en tas (croît avec le tier)
      for (let k = 0; k < 2 + tier && k < 4; k++) {
        const pileX = pcx + 0.12 + k*0.06, nCoins = 2 + ((k*7)%3);
        if (pileX > 0.95) break;
        for (let c=0;c<nCoins;c++){ ctx.fillStyle = c===nCoins-1?"#e8c040":"#c89828"; ctx.beginPath(); ctx.ellipse(ox+sw*pileX, oy+sh*(0.86-c*0.018), sw*0.024, sh*0.009, 0, 0, Math.PI*2); ctx.fill(); }
      }
      return true;
    }
    // ── STADE 3 · FRAPPE NUMÉRIQUE — monolithe néon, hologramme, presse robot ──
    // La monnaie devient signal : un bras automatisé estampe des jetons qui
    // glissent sous un hologramme de devise. Lueur cyan/or pilotée par la nuit.
    const nF = parseFloat(litGold.slice(litGold.lastIndexOf(",") + 1)) || 0;
    px(0.0, 0.66, 1.0, 0.34, "#0c1016");                     // dalle sombre
    px(0.0, 0.84, 1.0, 0.16, "#080b10");
    // Monolithe (bloc sombre à façade lisse + liseré néon)
    px(0.14, 0.2, 0.72, 0.56, "#161c24");
    px(0.7, 0.2, 0.16, 0.56, "rgba(0,0,0,0.3)");
    ctx.fillStyle = "#2f8fa0"; ctx.fillRect(ox+sw*0.14, oy+sh*0.2, sw*0.72, Math.max(1, sh*0.006)); // liseré haut
    ctx.fillRect(ox+sw*0.14, oy+sh*0.755, sw*0.72, Math.max(1, sh*0.006));                          // liseré bas
    if (nF > 0.02) {                                         // halos néon (nuit)
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(90,220,230,${(nF*0.25).toFixed(2)})`;
      ctx.fillRect(ox+sw*0.14, oy+sh*0.19, sw*0.72, sh*0.02);
      ctx.restore();
    }
    // Bandes de données lumineuses (fenêtres-écrans), densité selon tier
    for (let r=0; r<2+Math.min(2,tier); r++){
      const ry = 0.3 + r*0.1;
      ctx.fillStyle = "#123038"; ctx.fillRect(ox+sw*0.2, oy+sh*ry, sw*0.4, sh*0.05);
      ctx.fillStyle = `rgba(120,240,220,${(0.4+nF*0.5).toFixed(2)})`;
      for (let c=0;c<5;c++){ if (((now/300|0)+r*2+c)%3) ctx.fillRect(ox+sw*(0.22+c*0.075), oy+sh*(ry+0.012), sw*0.04, sh*0.026); }
    }
    // Hologramme de devise au-dessus du toit : pièce filaire qui tourne (largeur sinusoïdale)
    const hw = Math.abs(Math.cos(now/700));
    const hcx = 0.5, hcy = 0.13;
    ctx.save(); if (nF > 0.02) ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgba(130,245,225,${(0.5+nF*0.45).toFixed(2)})`; ctx.lineWidth = Math.max(1, sw*0.02);
    ctx.beginPath(); ctx.ellipse(ox+sw*hcx, oy+sh*hcy, sw*(0.012+0.05*hw), sh*0.06, 0, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = `rgba(180,250,235,${(0.35+nF*0.4).toFixed(2)})`; ctx.font = `${Math.max(6,sw*0.09)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (hw > 0.4) ctx.fillText("¤", ox+sw*hcx, oy+sh*hcy);   // glyphe devise quand la pièce est de face
    ctx.restore();
    // Faisceau projecteur reliant le toit à l'hologramme
    if (nF > 0.02) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(90,220,230,${(nF*0.2).toFixed(2)})`;
      ctx.beginPath(); ctx.moveTo(ox+sw*(hcx-0.02), oy+sh*0.2); ctx.lineTo(ox+sw*(hcx-0.05), oy+sh*(hcy+0.05)); ctx.lineTo(ox+sw*(hcx+0.05), oy+sh*(hcy+0.05)); ctx.lineTo(ox+sw*(hcx+0.02), oy+sh*0.2); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // Convoyeur de jetons (premier plan) + bras presse automatisé
    px(0.18, 0.8, 0.64, 0.035, "#1a222a");
    ctx.fillStyle = "#2f8fa0"; ctx.fillRect(ox+sw*0.18, oy+sh*0.8, sw*0.64, Math.max(1, sh*0.004));
    const beltT = (now/900) % 0.16;                          // jetons qui défilent
    for (let j=0;j<5;j++){const jx=0.22+j*0.14+beltT; if(jx>0.82) continue;
      ctx.fillStyle = "#d6b840"; ctx.beginPath(); ctx.ellipse(ox+sw*jx, oy+sh*0.793, sw*0.022, sh*0.009, 0, 0, Math.PI*2); ctx.fill();
      if (nF>0.02){ ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.fillStyle=`rgba(255,220,120,${(nF*0.4).toFixed(2)})`; ctx.beginPath(); ctx.arc(ox+sw*jx, oy+sh*0.793, sw*0.018, 0, Math.PI*2); ctx.fill(); ctx.restore(); }
    }
    // Bras robotisé qui estampe en cadence sur le convoyeur (gauche)
    const stamp = (Math.sin(now/360)*0.5+0.5);               // 0 haut → 1 bas
    const rax = 0.3, rtop = 0.62, rbot = 0.76;
    px(rax-0.04, 0.56, 0.08, 0.06, "#283038");               // tête de portique
    ctx.strokeStyle = "#3a4a54"; ctx.lineWidth = Math.max(1.5, sw*0.024); ctx.lineCap = "round";
    const ray = rtop + (rbot-rtop)*stamp;
    ctx.beginPath(); ctx.moveTo(ox+sw*rax, oy+sh*0.62); ctx.lineTo(ox+sw*rax, oy+sh*ray); ctx.stroke();
    ctx.lineCap = "butt";
    ctx.fillStyle = "#52525c"; ctx.fillRect(ox+sw*(rax-0.03), oy+sh*ray, sw*0.06, sh*0.025); // matrice
    if (stamp > 0.9 && nF > 0.02) { ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.fillStyle=`rgba(130,245,225,${(0.6).toFixed(2)})`; ctx.beginPath(); ctx.arc(ox+sw*rax, oy+sh*(ray+0.02), Math.max(1,sw*0.02), 0, Math.PI*2); ctx.fill(); ctx.restore(); }
    return true;
  }
  if (id === "imperial_exchanges") {
    if (band >= 7) { // GRAND AXE cosmique : flèche monumentale + anneaux qui tournent
      const { cp, glow } = cosmicBase(ctx, ox, oy, sw, sh, px, band);
      ctx.fillStyle = cp.mid; ctx.beginPath(); ctx.moveTo(ox + sw * 0.38, oy + sh * 0.84); ctx.lineTo(ox + sw * 0.47, oy + sh * 0.26); ctx.lineTo(ox + sw * 0.53, oy + sh * 0.26); ctx.lineTo(ox + sw * 0.62, oy + sh * 0.84); ctx.closePath(); ctx.fill();
      ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.moveTo(ox + sw * 0.47, oy + sh * 0.26); ctx.lineTo(ox + sw * 0.53, oy + sh * 0.26); ctx.lineTo(ox + sw * 0.5, oy + sh * 0.18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(ox + sw * 0.5, oy + sh * 0.22, sw * (0.03 + 0.012 * Math.sin(now / 400)), 0, Math.PI * 2); ctx.fill();
      const rot = now / 1600;
      for (let r = 0; r < 2; r++) {
        const ry = 0.46 + r * 0.16, tilt = (r ? -0.4 : 0.4) + 0.15 * Math.sin(rot * (r ? -1 : 1)), rx = 0.26 - r * 0.04;
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = `rgba(${cp.glow},0.5)`; ctx.lineWidth = Math.max(1.5, sw * 0.02); ctx.beginPath(); ctx.ellipse(ox + sw * 0.5, oy + sh * ry, sw * rx, sh * 0.05, tilt, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        const ang = rot * (r ? -1.3 : 1.3), mx = 0.5 + Math.cos(ang) * rx, my = ry + Math.sin(ang) * 0.05 * Math.cos(tilt);
        ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.arc(ox + sw * mx, oy + sh * my, sw * 0.022, 0, Math.PI * 2); ctx.fill();
      }
      glow(0.5, 0.4, 0.24, 0.14 + 0.08 * Math.sin(now / 700));
      return true;
    }
    // 4 stades suivant l'âge de la ville (ei = eraIndex 0–34), un tous les
    // 10 âges : comptoir de change à ciel ouvert → banco Renaissance →
    // grande banque néoclassique → bourse de verre & néon.
    // tier reste la richesse intra-stade (piles d'or / vitres / écrans).
    const stage = ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3;
    if (stage === 0) {
      // ── STADE 0 · COMPTOIR DE CHANGE — table de changeur, trébuchet, abaque ──
      // Pixel-art = prop PixelLab STATIQUE (auvent rouge + table-balance + or + coffre
      // BAKÉS dans le sprite). Repli sur le comptoir vectoriel d'origine tant que le
      // prop n'est pas chargé.
      if (propReady('exchange-prop-stall')) {
        // Tache de sol douce sous le comptoir (cyp calé sur la base opaque mesurée)
        {
          const cxp = ox + sw * 0.5, cyp = oy + sh * 0.86, R = sw * 0.5, ky = (sh * 0.24) / R;
          ctx.save(); ctx.translate(cxp, cyp); ctx.scale(1, ky); ctx.translate(-cxp, -cyp);
          const g = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, R);
          g.addColorStop(0, "rgba(38,26,12,0.45)");
          g.addColorStop(0.6, "rgba(38,26,12,0.22)");
          g.addColorStop(1, "rgba(38,26,12,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cxp, cyp, R, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        // Le comptoir (prop PixelLab) — aspect 96×80 préservé
        blitProp(ctx, ox, oy, sw, sh, 'exchange-prop-stall', 0.5, 0.53, 0.88, 0.73);
        return true;
      }
      // ── repli procédural (le comptoir de change vectoriel d'origine) ──
      // Avant la banque, le trapézite : sous un auvent, on pèse l'or au fléau et
      // on compte sur les lignes gravées de la table. Le change précède le crédit.
      px(0.0, 0.68, 1.0, 0.32, "#241a0c");                  // terre battue
      // Auvent sur deux poteaux (toile rouge passée)
      ctx.fillStyle = "#5a3c18";
      ctx.fillRect(ox+sw*0.12, oy+sh*0.3, sw*0.04, sh*0.4);
      ctx.fillRect(ox+sw*0.84, oy+sh*0.3, sw*0.04, sh*0.4);
      ctx.fillStyle = "#9a3a2a";
      ctx.beginPath(); ctx.moveTo(ox+sw*0.08, oy+sh*0.32); ctx.lineTo(ox+sw*0.92, oy+sh*0.32); ctx.lineTo(ox+sw*0.88, oy+sh*0.4); ctx.lineTo(ox+sw*0.12, oy+sh*0.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,235,200,0.14)";             // arête éclairée de la toile
      ctx.fillRect(ox+sw*0.12, oy+sh*0.32, sw*0.8, sh*0.022);
      ctx.fillStyle = "#7a2c20";                            // festons (bord ondulé)
      for (let k=0;k<8;k++){ ctx.beginPath(); ctx.arc(ox+sw*(0.17+k*0.095), oy+sh*0.4, sw*0.024, 0, Math.PI); ctx.fill(); }
      // Table de change : plateau sur tréteaux
      const tbx=0.2, tbw=0.6, tby=0.6;
      px(tbx, tby, tbw, 0.05, "#6a4a24");
      px(tbx, tby, tbw, 0.013, "rgba(255,235,190,0.25)");   // arête éclairée
      ctx.fillStyle = "#4a3216";
      ctx.fillRect(ox+sw*(tbx+0.04), oy+sh*(tby+0.05), sw*0.03, sh*0.16);
      ctx.fillRect(ox+sw*(tbx+tbw-0.07), oy+sh*(tby+0.05), sw*0.03, sh*0.16);
      // Lignes de comptage gravées sur le plateau (abaque romain)
      ctx.strokeStyle = "rgba(30,18,8,0.5)"; ctx.lineWidth=Math.max(0.5,sw*0.01);
      for (let l=1;l<5;l++){ ctx.beginPath(); ctx.moveTo(ox+sw*(tbx+0.05+l*0.05), oy+sh*tby); ctx.lineTo(ox+sw*(tbx+0.05+l*0.05), oy+sh*(tby+0.05)); ctx.stroke(); }
      // Piles de pièces sur la table (croît avec le tier)
      for (let k=0;k<2+tier && k<4;k++){
        const pileX = tbx+0.42+k*0.05, nC = 2+((k*5)%3);
        for (let c=0;c<nC;c++){ ctx.fillStyle = c===nC-1?"#e8c040":"#c89828"; ctx.beginPath(); ctx.ellipse(ox+sw*pileX, oy+sh*(tby-0.005-c*0.016), sw*0.02, sh*0.008, 0,0,Math.PI*2); ctx.fill(); }
      }
      // Trébuchet (balance à fléau) — les plateaux oscillent doucement
      const balx=tbx+0.15, baly=0.6, tilt=Math.sin(now/700)*0.05;
      ctx.strokeStyle="#7a6a3a"; ctx.lineWidth=Math.max(1,sw*0.016); ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(ox+sw*balx, oy+sh*baly); ctx.lineTo(ox+sw*balx, oy+sh*(baly-0.16)); ctx.stroke(); // mât
      const bx0=balx-0.08, bx1=balx+0.08, by0=baly-0.15;
      ctx.beginPath(); ctx.moveTo(ox+sw*bx0, oy+sh*(by0+tilt)); ctx.lineTo(ox+sw*bx1, oy+sh*(by0-tilt)); ctx.stroke(); // fléau
      for (const [pxa,dy] of [[bx0,tilt],[bx1,-tilt]]){
        ctx.beginPath(); ctx.moveTo(ox+sw*pxa, oy+sh*(by0+dy)); ctx.lineTo(ox+sw*pxa, oy+sh*(by0+dy+0.05)); ctx.stroke();
        ctx.fillStyle="#9a8440"; ctx.beginPath(); ctx.ellipse(ox+sw*pxa, oy+sh*(by0+dy+0.06), sw*0.028, sh*0.011, 0,0,Math.PI*2); ctx.fill();
      }
      ctx.lineCap="butt";
      // Changeur assis derrière la table, bras qui pose une pièce
      const mx=0.7, my=0.6, reach=Math.sin(now/520)*0.02;
      ctx.fillStyle="#3a2c5a"; ctx.fillRect(ox+sw*(mx-0.04), oy+sh*(my-0.13), sw*0.08, sh*0.15); // robe
      ctx.fillStyle="#c49060"; ctx.beginPath(); ctx.arc(ox+sw*mx, oy+sh*(my-0.17), sw*0.03, 0, Math.PI*2); ctx.fill(); // tête
      ctx.strokeStyle="#3a2c5a"; ctx.lineWidth=Math.max(1,sw*0.022); ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(ox+sw*(mx-0.03), oy+sh*(my-0.09)); ctx.lineTo(ox+sw*(mx-0.13+reach), oy+sh*(my-0.04)); ctx.stroke();
      ctx.lineCap="butt";
      ctx.fillStyle="#c49060"; ctx.beginPath(); ctx.arc(ox+sw*(mx-0.13+reach), oy+sh*(my-0.04), sw*0.018, 0, Math.PI*2); ctx.fill();
      // Cassette ferrée posée au sol (le coffre du changeur), couvercle + serrure
      const cbx=0.13, cby=0.8;
      ctx.fillStyle="rgba(0,0,0,0.26)"; ctx.beginPath(); ctx.ellipse(ox+sw*(cbx+0.06), oy+sh*(cby+0.085), sw*0.07, sh*0.016, 0,0,Math.PI*2); ctx.fill();
      px(cbx, cby+0.02, 0.12, 0.065, "#3e2c14");            // caisse
      px(cbx, cby+0.02, 0.016, 0.065, "#5a4220");           // arête éclairée gauche
      px(cbx+0.09, cby+0.02, 0.03, 0.065, "rgba(0,0,0,0.28)"); // ombre droite
      px(cbx, cby+0.006, 0.12, 0.02, "#503a1c");            // couvercle
      px(cbx, cby+0.006, 0.12, 0.006, "rgba(255,236,190,0.22)"); // reflet du couvercle
      ctx.fillStyle="#7a6a44"; px(cbx+0.034, cby+0.01, 0.012, 0.075, "#7a6a44"); px(cbx+0.072, cby+0.01, 0.012, 0.075, "#7a6a44"); // ferrures
      ctx.fillStyle="#1c140a"; ctx.fillRect(ox+sw*(cbx+0.05), oy+sh*(cby+0.04), sw*0.022, sh*0.022); // serrure
      ctx.fillStyle="#d4a828"; ctx.beginPath(); ctx.arc(ox+sw*(cbx+0.061), oy+sh*(cby+0.05), sw*0.008, 0, Math.PI*2); ctx.fill();
      return true;
    }
    if (stage === 1) {
      // ── STADE 1 · BANCO RENAISSANCE — palais marchand, banc drapé, grand livre ──
      // « Banco » : le banc drapé de vert où le changeur florentin tient ses
      // comptes. Loggia à arcades, registre et plume, coffre cerclé de fer.
      px(0.0, 0.74, 1.0, 0.26, "#241c12");                  // dallage
      // Corps du palais (pierre ocre)
      px(0.1, 0.22, 0.8, 0.56, "#b89c66");
      px(0.72, 0.22, 0.18, 0.56, "rgba(0,0,0,0.16)");       // ombre droite
      ctx.strokeStyle="rgba(60,42,20,0.35)"; ctx.lineWidth=Math.max(0.5,sw*0.01);
      for (let r=1;r<5;r++){ ctx.beginPath(); ctx.moveTo(ox+sw*0.1, oy+sh*(0.22+r*0.11)); ctx.lineTo(ox+sw*0.9, oy+sh*(0.22+r*0.11)); ctx.stroke(); }
      // Corniche de toit débordante
      ctx.fillStyle="#7a4424"; ctx.fillRect(ox+sw*0.06, oy+sh*0.18, sw*0.88, sh*0.06);
      ctx.fillStyle="rgba(0,0,0,0.18)"; ctx.fillRect(ox+sw*0.06, oy+sh*0.225, sw*0.88, sh*0.014);
      // Loggia : trois arcades en plein cintre, embrasure creusée + vitre chaude
      for (let a=0;a<3;a++){
        const axc=0.27+a*0.23;
        ctx.fillStyle="#2c2012";                            // fond d'ombre profond
        ctx.fillRect(ox+sw*(axc-0.07), oy+sh*0.42, sw*0.14, sh*0.3);
        ctx.beginPath(); ctx.arc(ox+sw*axc, oy+sh*0.42, sw*0.07, Math.PI, 0); ctx.fill();
        ctx.fillStyle=litWarm;                              // lueur de bougie au fond
        ctx.fillRect(ox+sw*(axc-0.048), oy+sh*0.47, sw*0.096, sh*0.23);
        ctx.beginPath(); ctx.arc(ox+sw*axc, oy+sh*0.47, sw*0.048, Math.PI, 0); ctx.fill();
        ctx.fillStyle="rgba(20,12,6,0.55)";                 // meneau central de l'arcade
        ctx.fillRect(ox+sw*(axc-0.006), oy+sh*0.47, sw*0.012, sh*0.23);
        // Voussoirs + claveau (clef) éclairés
        ctx.strokeStyle="#cdb074"; ctx.lineWidth=Math.max(0.8,sw*0.012);
        ctx.beginPath(); ctx.arc(ox+sw*axc, oy+sh*0.42, sw*0.064, Math.PI, 0); ctx.stroke();
        ctx.fillStyle="#d8bd80"; ctx.fillRect(ox+sw*(axc-0.014), oy+sh*0.348, sw*0.028, sh*0.03); // claveau
      }
      ctx.fillStyle="#9a814e";                              // pilastres entre arcades
      for (const pxc of [0.16,0.385,0.615,0.84]){
        ctx.fillRect(ox+sw*(pxc-0.014), oy+sh*0.4, sw*0.028, sh*0.32);
        ctx.fillStyle="rgba(255,238,200,0.18)"; ctx.fillRect(ox+sw*(pxc-0.014), oy+sh*0.4, sw*0.008, sh*0.32); // arête éclairée
        ctx.fillStyle="#9a814e";
      }
      // Banc drapé de vert au premier plan (le « banco »)
      const bnx=0.2, bnw=0.44, bny=0.78;
      px(bnx, bny, bnw, 0.04, "#1f5a32");                   // drap vert
      px(bnx, bny+0.04, bnw, 0.09, "#17441f");              // pan qui tombe
      ctx.fillStyle="rgba(255,255,255,0.08)"; ctx.fillRect(ox+sw*bnx, oy+sh*bny, sw*bnw, sh*0.01);
      ctx.fillStyle="#d4a828"; ctx.fillRect(ox+sw*bnx, oy+sh*(bny+0.12), sw*bnw, sh*0.012); // galon doré
      // Grand livre ouvert + plume qui court sur la page
      const lgx=bnx+0.1, lgy=bny-0.02;
      ctx.fillStyle="#e8e0c8"; ctx.fillRect(ox+sw*(lgx-0.06), oy+sh*lgy, sw*0.12, sh*0.04);
      ctx.fillStyle="rgba(0,0,0,0.14)"; ctx.fillRect(ox+sw*(lgx-0.001), oy+sh*lgy, sw*0.004, sh*0.04); // reliure
      ctx.strokeStyle="rgba(60,40,20,0.5)"; ctx.lineWidth=Math.max(0.4,sw*0.006);
      for (let l=0;l<3;l++){ ctx.beginPath(); ctx.moveTo(ox+sw*(lgx-0.05), oy+sh*(lgy+0.013+l*0.009)); ctx.lineTo(ox+sw*(lgx-0.01), oy+sh*(lgy+0.013+l*0.009)); ctx.stroke(); }
      const quillx=lgx+0.02+Math.sin(now/300)*0.015;
      ctx.strokeStyle="#d8d0b0"; ctx.lineWidth=Math.max(1,sw*0.014); ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(ox+sw*quillx, oy+sh*(lgy+0.02)); ctx.lineTo(ox+sw*(quillx+0.03), oy+sh*(lgy-0.06)); ctx.stroke();
      ctx.lineCap="butt";
      // Piles d'or sur le banc (croît avec le tier)
      for (let k=0;k<2+tier && k<4;k++){
        const pileX=bnx+0.32+k*0.04, nC=2+((k*5)%3);
        for (let c=0;c<nC;c++){ ctx.fillStyle=c===nC-1?"#e8c040":"#c89828"; ctx.beginPath(); ctx.ellipse(ox+sw*pileX, oy+sh*(bny-0.005-c*0.013), sw*0.017, sh*0.007, 0,0,Math.PI*2); ctx.fill(); }
      }
      // Coffre cerclé de fer (droite), couvercle bombé + ferrures + serrure
      const kfx=0.74, kfw=0.17, kfy=0.7;
      ctx.fillStyle="rgba(0,0,0,0.28)"; ctx.beginPath(); ctx.ellipse(ox+sw*(kfx+kfw/2), oy+sh*0.855, sw*0.1, sh*0.022, 0,0,Math.PI*2); ctx.fill(); // ombre au sol
      px(kfx, kfy+0.04, kfw, 0.1, "#3e2c14");               // caisse
      px(kfx, kfy+0.04, 0.022, 0.1, "#5a4220");             // arête éclairée gauche
      px(kfx+kfw-0.03, kfy+0.04, 0.03, 0.1, "rgba(0,0,0,0.3)"); // ombre droite
      ctx.fillStyle="#503a1c";                              // couvercle bombé
      ctx.beginPath(); ctx.moveTo(ox+sw*kfx, oy+sh*(kfy+0.045)); ctx.quadraticCurveTo(ox+sw*(kfx+kfw/2), oy+sh*(kfy-0.01), ox+sw*(kfx+kfw), oy+sh*(kfy+0.045)); ctx.lineTo(ox+sw*(kfx+kfw), oy+sh*(kfy+0.055)); ctx.lineTo(ox+sw*kfx, oy+sh*(kfy+0.055)); ctx.closePath(); ctx.fill();
      ctx.strokeStyle="rgba(255,236,190,0.3)"; ctx.lineWidth=Math.max(0.8,sw*0.012); // reflet du couvercle
      ctx.beginPath(); ctx.moveTo(ox+sw*(kfx+0.02), oy+sh*(kfy+0.04)); ctx.quadraticCurveTo(ox+sw*(kfx+kfw*0.4), oy+sh*(kfy+0.004), ox+sw*(kfx+kfw*0.6), oy+sh*(kfy+0.02)); ctx.stroke();
      ctx.fillStyle="#7a6a44";                              // ferrures verticales
      for (const bx of [kfx+0.03, kfx+kfw-0.05]) px(bx, kfy+0.02, 0.014, 0.12, "#7a6a44");
      px(kfx, kfy+0.06, kfw, 0.012, "#7a6a44");             // cerclage horizontal
      ctx.fillStyle="#1c140a"; ctx.fillRect(ox+sw*(kfx+kfw/2-0.018), oy+sh*(kfy+0.075), sw*0.036, sh*0.03); // serrure
      ctx.fillStyle="#d4a828"; ctx.beginPath(); ctx.arc(ox+sw*(kfx+kfw/2), oy+sh*(kfy+0.088), sw*0.01, 0, Math.PI*2); ctx.fill(); // pêne doré
      return true;
    }
    if (stage === 2) {
    // ── STADE 2 · GRANDE BANQUE NÉOCLASSIQUE (Banque de France / FMI) ──
    // Composition classique : deux ailes de pierre percées de fenêtres encadrées,
    // un portique central à colonnes creusé d'ombre, grande porte de bronze.
    // Lumière au haut-gauche → faces gauches claires, faces droites ombrées.
    const podY = 0.6, bodyH = 0.28;
    // Fenêtre encadrée : chambranle + embrasure sombre + vitre chaude + croisillon
    const litWindow = (x, y, w, h) => {
      px(x-0.008, y-0.01, w+0.016, h+0.02, "#8a7e58");      // chambranle de pierre
      px(x, y, w, h, "#2a2110");                            // embrasure sombre
      ctx.fillStyle = litGold; ctx.fillRect(ox+sw*(x+0.006), oy+sh*(y+0.006), sw*(w-0.012), sh*(h-0.012)); // vitre
      ctx.strokeStyle = "rgba(34,24,10,0.8)"; ctx.lineWidth = Math.max(0.6, sw*0.009);
      ctx.beginPath(); ctx.moveTo(ox+sw*(x+w/2), oy+sh*(y+0.006)); ctx.lineTo(ox+sw*(x+w/2), oy+sh*(y+h-0.006)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*(x+0.006), oy+sh*(y+h*0.5)); ctx.lineTo(ox+sw*(x+w-0.006), oy+sh*(y+h*0.5)); ctx.stroke();
      px(x-0.014, y+h, w+0.028, 0.012, "#b6ad86");          // appui éclairé
    };
    // Escalier monumental (giron clair dessus, contremarche ombrée)
    for (let si = 4; si >= 0; si--) {
      const sw2 = 0.12 + (si/4)*0.74, sy = 0.78 - si*0.034;
      px(0.5-sw2/2, sy, sw2, 0.018, "#e8e0c0");
      px(0.5-sw2/2, sy+0.018, sw2, 0.016, "#ada585");
    }
    // Deux ailes de pierre (corps), ombrage gauche→droite
    px(0.06, podY, 0.88, bodyH, "#d4c898");
    px(0.06, podY, 0.03, bodyH, "#e2d8aa");                 // jour à gauche
    px(0.80, podY, 0.14, bodyH, "rgba(60,50,28,0.18)");     // ombre à droite
    ctx.strokeStyle="rgba(110,96,56,0.3)"; ctx.lineWidth=Math.max(0.5,sw*0.008); // assises
    for (let r=1;r<4;r++){ ctx.beginPath(); ctx.moveTo(ox+sw*0.06, oy+sh*(podY+r*0.07)); ctx.lineTo(ox+sw*0.94, oy+sh*(podY+r*0.07)); ctx.stroke(); }
    // Fenêtres encadrées dans les ailes (2 par aile, hors colonnade)
    for (const wx of [0.115, 0.205, 0.715, 0.805]) litWindow(wx, podY+0.06, 0.06, 0.12);
    // Portique central : mur de péristyle sombre (l'ombre derrière les colonnes)
    px(0.31, podY-0.02, 0.38, bodyH+0.02, "#4e4530");
    // Grande porte de bronze à double battant + chambranle de pierre
    const dx=0.435, dw=0.13, dy=podY+0.06, dh=0.22;
    px(dx-0.016, dy-0.018, dw+0.032, dh+0.018, "#cfc6a0");  // chambranle
    px(dx-0.016, dy-0.018, 0.01, dh+0.018, "#efe8c8");      // arête éclairée
    px(dx, dy, dw, dh, "#140e04");                          // embrasure
    ctx.fillStyle="#8a6526";                                // vantaux bronze
    ctx.fillRect(ox+sw*(dx+0.005), oy+sh*(dy+0.006), sw*(dw/2-0.008), sh*(dh-0.01));
    ctx.fillRect(ox+sw*(dx+dw/2+0.003), oy+sh*(dy+0.006), sw*(dw/2-0.008), sh*(dh-0.01));
    ctx.fillStyle="rgba(255,228,150,0.22)";                 // reflet bronze (gauche)
    ctx.fillRect(ox+sw*(dx+0.005), oy+sh*(dy+0.006), sw*0.016, sh*(dh-0.01));
    ctx.fillStyle="rgba(0,0,0,0.45)";                       // joint central
    ctx.fillRect(ox+sw*(dx+dw/2-0.004), oy+sh*(dy+0.006), sw*0.008, sh*(dh-0.01));
    ctx.fillStyle="#3a2a0e";                                // caissons des vantaux
    for (let pr=0; pr<3; pr++) for (let pc=0; pc<2; pc++)
      ctx.fillRect(ox+sw*(dx+0.016+pc*dw*0.46), oy+sh*(dy+0.028+pr*0.058), sw*0.026, sh*0.034);
    ctx.fillStyle=litGold;                                  // lueur chaude au seuil
    ctx.fillRect(ox+sw*(dx+0.018), oy+sh*(dy+dh-0.022), sw*(dw-0.036), sh*0.022);
    // Colonnes du portique devant le mur sombre, ombrage gauche→droite
    const nCols = 4 + Math.min(2, tier);
    for (let ci = 0; ci < nCols; ci++) {
      const cxc = 0.335 + ci*(0.33/(nCols-1)), cw = 0.036;
      px(cxc-cw/2, podY-0.01, cw, bodyH+0.01, "#d8cfa6");   // fût
      px(cxc-cw/2, podY-0.01, cw*0.3, bodyH+0.01, "#f0e9ca"); // arête éclairée
      px(cxc+cw*0.18, podY-0.01, cw*0.32, bodyH+0.01, "rgba(58,48,24,0.4)"); // cannelure ombrée
      px(cxc-cw*0.8, podY-0.026, cw*1.6, 0.016, "#f0e9ca"); // chapiteau
      px(cxc-cw*0.68, podY+bodyH-0.012, cw*1.36, 0.012, "#bcb288"); // base
    }
    // Entablement plein cadre : corniche saillante + ombre portée + frise
    px(0.05, podY-0.05, 0.9, 0.024, "#cfc6a0");             // corniche
    px(0.06, podY-0.026, 0.88, 0.012, "rgba(0,0,0,0.28)");  // ombre sous corniche
    px(0.07, podY-0.072, 0.86, 0.026, "#bcb38e");           // frise
    px(0.06, podY-0.092, 0.2, 0.02, "#c8bf98"); px(0.74, podY-0.092, 0.2, 0.02, "#c8bf98"); // attique des ailes
    // Dôme cuivré derrière le fronton (tiers élevés) — éclairé à gauche
    if (tier >= 2) {
      const domeX=ox+sw*0.5, domeY=oy+sh*(podY-0.082);
      ctx.fillStyle="#b8af6a"; ctx.beginPath(); ctx.arc(domeX, domeY, sw*0.078, Math.PI, 0); ctx.fill();
      ctx.fillStyle="rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.arc(domeX, domeY, sw*0.078, Math.PI*1.5, 0); ctx.fill();
      ctx.fillStyle="#ecdc88"; ctx.beginPath(); ctx.arc(domeX-sw*0.022, domeY-sh*0.016, sw*0.03, Math.PI*1.1, Math.PI*1.85); ctx.fill();
      ctx.fillStyle="#9a8840"; ctx.fillRect(domeX-sw*0.006, domeY-sw*0.13, sw*0.012, sw*0.055); // lanterneau
      ctx.fillStyle="#e8d27a"; ctx.beginPath(); ctx.arc(domeX, domeY-sw*0.135, sw*0.012, 0, Math.PI*2); ctx.fill();
    }
    // Fronton triangulaire au-dessus du portique (versant droit ombré)
    const pL=0.28, pR=0.72, baseY=podY-0.072, apexY=baseY-0.13;
    ctx.fillStyle="#c4ba90"; ctx.beginPath(); ctx.moveTo(ox+sw*pL, oy+sh*baseY); ctx.lineTo(ox+sw*0.5, oy+sh*apexY); ctx.lineTo(ox+sw*pR, oy+sh*baseY); ctx.closePath(); ctx.fill();
    ctx.fillStyle="rgba(56,46,24,0.32)"; ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*apexY); ctx.lineTo(ox+sw*pR, oy+sh*baseY); ctx.lineTo(ox+sw*0.5, oy+sh*baseY); ctx.closePath(); ctx.fill();
    ctx.fillStyle="rgba(255,244,200,0.18)"; ctx.beginPath(); ctx.moveTo(ox+sw*pL, oy+sh*baseY); ctx.lineTo(ox+sw*0.5, oy+sh*apexY); ctx.lineTo(ox+sw*0.5, oy+sh*(apexY+0.018)); ctx.lineTo(ox+sw*(pL+0.04), oy+sh*baseY); ctx.closePath(); ctx.fill();
    // Médaillon doré au tympan (balance — emblème bancaire)
    ctx.fillStyle="#c8a83c"; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*(baseY-0.04), sw*0.026, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle="#6a521c"; ctx.lineWidth=Math.max(0.6,sw*0.009);
    ctx.beginPath(); ctx.moveTo(ox+sw*0.475, oy+sh*(baseY-0.045)); ctx.lineTo(ox+sw*0.525, oy+sh*(baseY-0.045)); ctx.stroke();
    ctx.beginPath(); ctx.arc(ox+sw*0.475, oy+sh*(baseY-0.036), sw*0.012, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(ox+sw*0.525, oy+sh*(baseY-0.036), sw*0.012, 0, Math.PI); ctx.stroke();
    // Acrotères (faîte + angles du fronton + angles des ailes)
    ctx.fillStyle="#c8b858";
    for (const [ax,ay] of [[0.5,apexY],[pL,baseY],[pR,baseY],[0.07,podY-0.092],[0.93,podY-0.092]]) {
      ctx.beginPath(); ctx.moveTo(ox+sw*(ax-0.02), oy+sh*ay); ctx.lineTo(ox+sw*ax, oy+sh*(ay-0.04)); ctx.lineTo(ox+sw*(ax+0.02), oy+sh*ay); ctx.closePath(); ctx.fill();
    }
    return true;
    }
    // ── STADE 3 · BOURSE DE VERRE — tour-rideau, ticker défilant, chandeliers néon ──
    // « Les fortunes bougent plus vite que les armées » : une tour de verre, un
    // ruban de cotations qui file et un graphique en chandeliers qui monte et
    // chute. Lueur cyan/or pilotée par la nuit (nF dérivé de litGold).
    const nF = parseFloat(litGold.slice(litGold.lastIndexOf(",") + 1)) || 0;
    px(0.0, 0.72, 1.0, 0.28, "#0c1016");                    // parvis sombre
    px(0.0, 0.88, 1.0, 0.12, "#080b10");
    // Tour-rideau de verre (mur-rideau bleu nuit + ombre côté droit)
    px(0.2, 0.1, 0.6, 0.66, "#10202c");
    px(0.64, 0.1, 0.16, 0.66, "rgba(0,0,0,0.3)");
    // Trame du mur-rideau (meneaux verticaux + nez de dalle)
    ctx.strokeStyle="#1f3a48"; ctx.lineWidth=Math.max(0.5,sw*0.008);
    for (let c=1;c<5;c++){ ctx.beginPath(); ctx.moveTo(ox+sw*(0.2+c*0.12), oy+sh*0.1); ctx.lineTo(ox+sw*(0.2+c*0.12), oy+sh*0.76); ctx.stroke(); }
    for (let r=1;r<9;r++){ ctx.beginPath(); ctx.moveTo(ox+sw*0.2, oy+sh*(0.1+r*0.073)); ctx.lineTo(ox+sw*0.8, oy+sh*(0.1+r*0.073)); ctx.stroke(); }
    // Vitres éclairées (scintillement déterministe piloté par now → pas de Math.random)
    for (let r=0;r<8;r++) for (let c=0;c<5;c++){
      if (((r*5+c+(now/700|0))*7)%5===0){
        ctx.fillStyle=`rgba(120,200,230,${(0.18+nF*0.4).toFixed(2)})`;
        ctx.fillRect(ox+sw*(0.21+c*0.12), oy+sh*(0.11+r*0.073), sw*0.1, sh*0.06);
      }
    }
    // Liserés néon en tête et pied de tour
    ctx.fillStyle="#2f8fa0";
    ctx.fillRect(ox+sw*0.2, oy+sh*0.1, sw*0.6, Math.max(1,sh*0.006));
    ctx.fillRect(ox+sw*0.2, oy+sh*0.754, sw*0.6, Math.max(1,sh*0.006));
    if (nF > 0.02){
      ctx.save(); ctx.globalCompositeOperation="lighter";
      ctx.fillStyle=`rgba(90,220,230,${(nF*0.25).toFixed(2)})`;
      ctx.fillRect(ox+sw*0.2, oy+sh*0.09, sw*0.6, sh*0.02);
      ctx.restore();
    }
    // Hologramme de graphique en chandeliers au-dessus de la tour (rouge/vert)
    ctx.save(); if (nF > 0.02) ctx.globalCompositeOperation="lighter";
    const chN = 5 + Math.min(3, tier);
    for (let i=0;i<chN;i++){
      const cx2 = 0.28 + i*(0.44/(chN-1));
      const phase = Math.sin(now/600 + i*1.3);
      const mid = 0.06 - phase*0.018;                       // le corps monte/descend
      const bodyH = 0.016 + Math.abs(phase)*0.014;
      const up = phase >= 0;
      const col = up ? `rgba(80,230,150,${(0.45+nF*0.4).toFixed(2)})` : `rgba(240,95,95,${(0.45+nF*0.4).toFixed(2)})`;
      ctx.fillStyle = col;
      ctx.fillRect(ox+sw*(cx2-0.012), oy+sh*(mid-bodyH/2), sw*0.024, sh*bodyH);
      ctx.strokeStyle = col; ctx.lineWidth=Math.max(0.5,sw*0.006);          // mèches
      ctx.beginPath(); ctx.moveTo(ox+sw*cx2, oy+sh*(mid-bodyH/2-0.016)); ctx.lineTo(ox+sw*cx2, oy+sh*(mid+bodyH/2+0.016)); ctx.stroke();
    }
    ctx.restore();
    // Bandeau-ticker au pied de la tour : cotations qui défilent vers la gauche
    px(0.16, 0.78, 0.68, 0.06, "#06222a");
    ctx.fillStyle="#2f8fa0"; ctx.fillRect(ox+sw*0.16, oy+sh*0.78, sw*0.68, Math.max(1,sh*0.004));
    ctx.font=`${Math.max(5,sw*0.05)}px monospace`; ctx.textBaseline="middle"; ctx.textAlign="center";
    const slot=0.13, off=(now/1400)%slot;
    for (let s=0;s<7;s++){
      const gx = 0.18 + s*slot - off;
      if (gx < 0.18 || gx > 0.82) continue;                 // hors bandeau → on saute
      const up = (s*3+1)%2===0;
      ctx.fillStyle = up ? `rgba(80,230,150,${(0.7+nF*0.3).toFixed(2)})` : `rgba(240,95,95,${(0.7+nF*0.3).toFixed(2)})`;
      ctx.fillText(up?"▲":"▼", ox+sw*gx, oy+sh*0.812);
    }
    ctx.textAlign="left"; ctx.textBaseline="alphabetic";
    // Hall d'entrée vitré au pied de la tour : auvent + portes à meneaux + lueur chaude
    const exc=0.5, ew=0.2, ey=0.835, eh=0.065;
    px(exc-ew/2-0.012, ey-0.014, ew+0.024, 0.012, "#243a44");           // auvent
    px(exc-ew/2, ey, ew, eh, "#0a1820");                                 // embrasure du hall
    ctx.fillStyle=`rgba(150,210,225,${(0.32+nF*0.5).toFixed(2)})`;       // hall éclairé
    ctx.fillRect(ox+sw*(exc-ew/2+0.006), oy+sh*(ey+0.006), sw*(ew-0.012), sh*(eh-0.01));
    ctx.fillStyle=`rgba(255,224,150,${(0.3+nF*0.45).toFixed(2)})`;       // chaleur de comptoir au fond
    ctx.fillRect(ox+sw*(exc-0.03), oy+sh*(ey+eh*0.45), sw*0.06, sh*eh*0.5);
    ctx.strokeStyle="#1f3a48"; ctx.lineWidth=Math.max(0.6,sw*0.01);      // meneaux des portes
    for (const mxr of [-0.5,-0.16,0.16,0.5]){ ctx.beginPath(); ctx.moveTo(ox+sw*(exc+ew*mxr), oy+sh*ey); ctx.lineTo(ox+sw*(exc+ew*mxr), oy+sh*(ey+eh)); ctx.stroke(); }
    if (nF > 0.02){                                                      // halo de seuil la nuit
      ctx.save(); ctx.globalCompositeOperation="lighter";
      ctx.fillStyle=`rgba(120,210,230,${(nF*0.3).toFixed(2)})`;
      ctx.beginPath(); ctx.ellipse(ox+sw*exc, oy+sh*(ey+eh), sw*0.14, sh*0.03, 0,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
    return true;
  }
  return false;
}

export { drawCityEngineSprite, cosmicBase, propReady, blitProp, animReady, blitAnim };
