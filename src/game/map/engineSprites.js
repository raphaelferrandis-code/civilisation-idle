import { drawCityEngineSprite, engineStage, cosmicBase, softGround, propReady, blitProp, blitCosmicTower, animReady, blitAnim, setEngineSpan, setEngineSeed, cosmicSceneKey, ENGINE_HALO, engineCraft, propChimneySmoke, setEngineNow, setEngineFace } from './cityEngineSprites.js';
import { CM } from './layout.js';
import { engineFaceOf } from './engineOrient.js';

/* Charte d'animation des sprites (DA par âge) :
 *   - Toute animation est DIÉGÉTIQUE : un geste, une flamme, une roue — jamais
 *     d'objet qui flotte ou jaillit du bâtiment (cf. ex-pièces volantes de
 *     l'hôtel des monnaies, ex-filet de grain des entrepôts).
 *   - Ères primitives/antiques : mouvement ORGANIQUE (personnages, feu, tissu).
 *   - Ères médiévales/industrielles : mouvement MÉCANIQUE (presse, grue, roue).
 *   - Ères futuristes : mouvement LUMINEUX (pulses, LED, hologrammes).
 *   - Amplitudes faibles (< 2% du sprite) et périodes désynchronisées
 *     (offset par index) pour éviter l'effet métronome. */


// Stade cosmique (ères 35+, bands 7–9) des 18 bâtiments SAVOIR/INFRA : une TOUR
// PixelLab par famille (cosmicSceneKey), ou la silhouette partagée de sa famille de
// forme (dôme/flèche/halle/temple/arches/ossature) tant que la première n'existe pas.
// Halo de bande intégré à blitCosmicTower. cosmicBase importé de cityEngineSprites.
const COSMIC_SAVOIR_FAM = {
  observatories: "dome", ministries: "dome", schools: "dome", universities: "dome",
  ancestral_cult: "spire", watch: "spire", think_tanks: "spire",
  libraries: "hall", archive_grids: "hall", bureaucracy: "hall", scribes: "hall", printing_houses: "hall", storytellers: "hall",
  academies: "temple", courthouses: "temple",
  sewers: "arch",
  public_works: "frame", ruin_architects: "frame"
};
function cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, kind) {
  const { cp } = cosmicBase(ctx, ox, oy, sw, sh, px, band); // sol no-op + palette (aucun dessin réel)
  const fam = COSMIC_SAVOIR_FAM[kind] || "hall";
  // Le bâtiment PROPRE à la famille d'abord (cosmicSceneKey), la silhouette partagée
  // de sa famille de forme ensuite, tant que le premier n'existe pas.
  const pxKey = cosmicSceneKey(kind, band) || `cosmic-${fam}-${band}`;
  // Décor pas encore chargé : RIEN (audit du 05/10, MORT-2 — la silhouette
  // procédurale de repli, jamais vue qu'aux premières frames, est retirée).
  if (!propReady(pxKey)) return;
  blitCosmicTower(ctx, ox, oy, sw, sh, pxKey, now, band, cp); // TOUR gigantesque posée (halo de bande intégré, qui respire)
}

// Helper évolution pixel (stades 1-3) des bâtiments : sol doux qui se fond + prop + lueur
// additive qui respire. Factorise le boilerplate répété (moule savoir). `glowRGB` = couleur
// de la lueur (chaude S1-2, cyan/violet/blanc S3). opt : {cx,cy,wf,hf} blit, {gcy} centre lueur,
// {warm} plancher d'intensité, {ph} déphasage du scintillement.
// Alpha d'une lueur de scène (cf. ENGINE_HALO) : `base` = ancienne part fixe, `k` = ancienne
// part de nuit. Plus rien le jour ; la nuit, une fraction de l'ancienne lueur pleine.
const haloA = (base, k, n) => {
  const night = Math.max(0, Math.min(1, ((n || 0) - 0.22) / 0.65));
  return ENGINE_HALO.day * base + ENGINE_HALO.night * night * (base + k);
};
// Le halo additif d'une scène, centré en (x, y), de rayon r, teinte `rgb` (« r,g,b »),
// d'alpha a — RIEN quand il est invisible (audit du 05/10, PERF-20). De jour
// ENGINE_HALO.day = 0 : les douze copies de ce bloc créaient quand même un dégradé, ses
// deux arrêts et un save/restore par scène et par frame avant de ne pas remplir (~2 µs
// la scène en rendu logiciel, mesuré). Visible : les mêmes appels, dans le même ordre.
function sceneHalo(ctx, x, y, r, rgb, a) {
  if (!(a > 0.004)) return;
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  const gg = ctx.createRadialGradient(x, y, 0, x, y, r);
  gg.addColorStop(0, `rgba(${rgb},${a.toFixed(2)})`); gg.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function drawStagePix(ctx, ox, oy, sw, sh, key, now, glowRGB, opt) {
  opt = opt || {};
  const cx = opt.cx ?? 0.5, cy = opt.cy ?? 0.52, wf = opt.wf ?? 0.9, hf = opt.hf ?? 0.74;
  const gcy = opt.gcy ?? 0.5, warm = opt.warm ?? 0.12, ph = opt.ph ?? 0;
  softGround(ctx, ox, oy, sw, sh, 0.84, 0.5, 0.22, "18,14,8", 0.4); // sol (désactivé par défaut)
  blitProp(ctx, ox, oy, sw, sh, key, cx, cy, wf, hf);
  const gnF = (CM && CM.nightF) ? CM.nightF : 0;
  // Lueur additive qui respire.
  const a = haloA(warm, 0.34, gnF) * (0.84 + 0.16 * Math.sin(now / 300 + ph));
  sceneHalo(ctx, ox + sw * 0.5, oy + sh * gcy, sw * 0.33, glowRGB, a);
}
// (Plus de paramètre `pass` : les plans 'back' / 'anim' / 'front' ne servaient que le
// cache des scènes cuites, retiré à l'audit du 05/10 — MORT-1. Une scène se dessine
// d'un seul tenant, dans l'ordre de ses appels.)
function drawEngineSpriteCore(t, x, y, w, h, now) {
  const ctx = CM.ctx;
  const id = t.buildingId || t.variant;
  const tier = t.tier || 0;
  const litGold = CM.litGold || `rgba(255,220,120,0.35)`;
  const ox = x, oy = y, sw = w, sh = h;
  const band = CM.layout?.counts?.eraBand ?? 0;   // hissé ici : les blocs savoir/infra (return avant la fin) en ont besoin
  const ei = CM.layout?.counts?.eraIndex ?? 0;
  // Empreinte du lot, pour la substitution de palier (grain G2). MÊME expression
  // que la retombée sur drawCityEngineSprite en fin de fonction — mais posée
  // ICI, parce que les familles savoir/infra dessinent et RETOURNENT bien avant
  // de l'atteindre : elles héritaient sinon de l'empreinte de la tuile
  // précédente, et servaient le sprite de halle sur un atelier (ou l'inverse).
  setEngineSpan(t.spanX || t.size || 1, t.spanY || t.size || 1);
  // Graine de l'instance (même hachage que la retombée sur drawCityEngineSprite).
  setEngineSeed((Math.imul(t.gx | 0, 73856093) ^ Math.imul(t.gy | 0, 19349663)) >>> 0);
  // Côté de rue du lot : les décors à quatre vues se tournent vers lui (engineOrient.js).
  setEngineFace(engineFaceOf(t));
  // Horloge des scènes vivantes (LIVE_LAYERS), lue par blitProp.
  setEngineNow(now);
  const px = (rx, ry, rw, rh, col) => { ctx.fillStyle = col; ctx.fillRect(ox + sw * rx, oy + sh * ry, sw * rw, sh * rh); };
  const strokeRect = (rx, ry, rw, rh, col) => { ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, sw * 0.025); ctx.strokeRect(ox + sw * rx, oy + sh * ry, sw * rw, sh * rh); };
  // Ombre de contact au sol RETIRÉE (demande Raph 2026-07-06 : plus d'ellipses noires sous les bâtiments).

  // ── band 4 (Marbre / toges) : sprite ROMAIN classique à la place du stade pierre médiéval. ──
  // Repli AUTOMATIQUE sur le dispatch de stade tant que le PNG n'est pas chargé (propReady=false).
  const RB4 = {
    storytellers: 'storyteller-odeon', scribes: 'scribes-tabularium', schools: 'schools-ludus', academies: 'academies-athenaeum',
    ancestral_cult: 'cult-vesta', observatories: 'observatories-horologium', libraries: 'libraries-classical', universities: 'universities-classical',
    printing_houses: 'printing-scriptorium', think_tanks: 'think-stoa-roman', watch: 'watch-classical', bureaucracy: 'bureau-tabularium',
    courthouses: 'courthouses-basilica', public_works: 'works-classical', ministries: 'ministries-curia', archive_grids: 'archive-tabularium',
    ruin_architects: 'ruins-restoration-roman', sewers: 'sewers-classical'
  };
  if (band === 4 && RB4[id] && propReady(RB4[id])) { blitProp(ctx, ox, oy, sw, sh, RB4[id], 0.5, 0.46, 0.86, 0.76); return true; }

  if (id === "storytellers") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "storytellers"); return; }
    // ── ÉVOLUTION 4 STADES (ajoutée 2026-07-05) : le conteur suit l'ère comme les bâtiments
    //    économiques (1er savoir à recevoir un dispatch de stade). Stade 0 = hutte des conteurs
    //    (plus bas) ; stades 1-3 = décor PixelLab par ère (veillée médiévale → théâtre/lecture
    //    publique → média néon) + lueur. Repli = la hutte, puis rien.
    const stStage = engineStage(ei);
    if (stStage >= 1) {
      const scene = ['', 'storyteller-hall', 'storyteller-theater', 'storyteller-media'][stStage];
      if (propReady(scene)) {
        softGround(ctx, ox, oy, sw, sh, 0.84, 0.5, 0.22, "24,16,8", 0.4); // sol (désactivé par défaut)
        blitProp(ctx, ox, oy, sw, sh, scene, 0.5, 0.52, 0.92, 0.72);
        // Lueur (foyer/lampes chaudes aux stades 1-2 ; néon cyan au stade 3), pulse douce.
        const gnF = (CM && CM.nightF) ? CM.nightF : 0;
        const col = stStage === 3 ? "90,220,235" : "255,175,70";
        const a = (stStage === 3 ? haloA(0.14, 0.4, gnF) : haloA(0.16, 0.34, gnF)) * (0.85 + 0.15 * Math.sin(now / 300));
        sceneHalo(ctx, ox + sw * 0.5, oy + sh * 0.5, sw * 0.34, col, a);
        // Pas de perso réutilisé aux stades 1-3 (retiré à la demande : position mauvaise) —
        // les décors se lisent seuls (veillée = foyer+livre+bancs ; S2 = bâtiment fermé ; S3 = média).
        return;
      }
      // sinon : repli sur la hutte (stade 0) ci-dessous, le temps que le décor d'ère charge.
    }
    // Stade 0 (ères 1-9) = HUTTE DES CONTEURS : tambour d'argile ceint de masques
    // sculptés, volume clos. Elle remplace la scène « veillée au feu de camp »
    // (galette de terre battue + lectrice assise de face) : c'était la SEULE
    // scène de stade 0 sans volume, et sa lectrice pesait 45 % de la boîte quand
    // un habitant en fait 10 px. Refonte demandée par Raph le 2026-08-05, foyer
    // retiré à sa demande — `storyteller-back`, `-reader`, `-prop-fire` et la
    // bande animée `-fire` ne sont donc plus dessinés nulle part (leurs PNG
    // restent sur le disque, gardés par flameHue.test.js).
    // ⚠ Une hutte RONDE n'a ni arête ni faîte : elle ne lit en iso que si sa base
    // et sa rive de toit sont des ellipses DEUX FOIS plus larges que hautes. Les
    // tirages à base quasi circulaire rendaient de face et juraient avec la grille.
    // Fractions ARBITRÉES PAR LA PORTE, pas par la masse (docs/PLAN-EGALISATION-GRAIN.md :
    // la porte est le trait d'union avec l'habitant de 10 px). Caler la hauteur
    // d'encre sur `schools-prop-yard` donnait hFrac 0.697 — et une porte à 19 px
    // apparents, écart +5 hors bande 10-14, la plus grossière du parc : ce dessin
    // a une porte cintrée haute (26 px source pour 83 px d'encre, soit 31 % de la
    // hauteur du bâtiment contre 22 % chez les écoles). 0.623 ramène la porte à
    // ~17 px, dans l'écart des ateliers déjà livrés (`guild-prop-lodge` 17,3,
    // `granary-prop-silo` 15,8), au prix d'une hutte 11 % plus basse que ses
    // voisines. Le rapport 0.68/0.623 vaut 96/88, la taille native : blitProp ne
    // préserve pas l'aspect, l'oublier écraserait la hutte.
    if (propReady('storyteller-prop-hut')) blitProp(ctx, ox, oy, sw, sh, 'storyteller-prop-hut', 0.5, 0.53, 0.68, 0.623);
    return;
  }
  if (id === "scribes") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "scribes"); return; }
    // ── ÉVOLUTION 4 STADES (2026-07-05, 2e savoir après conteurs) : BÂTIMENTS CLOS par ère
    //    (leçon conteur = décor autoporteur, PAS de perso réutilisé). Thème écriture/archives :
    //    abri primitif (S0, plus bas) → scriptorium médiéval → hall d'archives → data hall.
    const scStage = engineStage(ei);
    if (scStage >= 1) {
      const scb = ['', 'scribes-scriptorium', 'scribes-archive', 'scribes-data'][scStage];
      if (propReady(scb)) {
        softGround(ctx, ox, oy, sw, sh, 0.84, 0.5, 0.22, "20,14,8", 0.4); // sol (désactivé par défaut)
        blitProp(ctx, ox, oy, sw, sh, scb, 0.5, 0.52, 0.9, 0.74);
        // Lueur (fenêtres chaudes bougies/lampes S1-2 ; racks serveurs cyan S3), pulse douce.
        const gnF = (CM && CM.nightF) ? CM.nightF : 0;
        const col = scStage === 3 ? "80,210,235" : "255,180,80";
        const a = (scStage === 3 ? haloA(0.13, 0.4, gnF) : haloA(0.12, 0.34, gnF)) * (0.85 + 0.15 * Math.sin(now / 320 + 1.1));
        sceneHalo(ctx, ox + sw * 0.5, oy + sh * 0.52, sw * 0.33, col, a);
        return;
      }
      // sinon : repli sur l'abri primitif (stade 0) ci-dessous, le temps que le décor d'ère charge.
    }
    // Pixel-art = scène PixelLab STATIQUE (abri PRIMITIF : auvent de peau + table à
    // tablettes/rouleaux, registre feu/stade 0 ; ombre de contact déjà posée en amont).
    if (propReady('scribes-prop-hall')) blitProp(ctx, ox, oy, sw, sh, 'scribes-prop-hall', 0.5, 0.53, 0.88, 0.73);
    return;
  }
  if (id === "schools") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "schools"); return; }
    // ── ÉVOLUTION 4 STADES (2026-07-05, 3e savoir) : BÂTIMENTS CLOS par ère, PAS de perso
    //    (moule conteur/scribes). Thème éducation : coin de leçon primitif (S0, plus bas) →
    //    école médiévale → école victorienne à beffroi → campus moderne.
    const schStage = engineStage(ei);
    if (schStage >= 1) {
      const schb = ['', 'schools-schoolhouse', 'schools-victorian', 'schools-campus'][schStage];
      if (propReady(schb)) {
        softGround(ctx, ox, oy, sw, sh, 0.84, 0.5, 0.22, "20,14,8", 0.4); // sol (désactivé par défaut)
        blitProp(ctx, ox, oy, sw, sh, schb, 0.5, 0.52, 0.9, 0.74);
        // Lueur (fenêtres chaudes S1-2 ; écrans/LED cyan S3), pulse douce.
        const gnF = (CM && CM.nightF) ? CM.nightF : 0;
        const col = schStage === 3 ? "120,220,235" : "255,182,84";
        const a = (schStage === 3 ? haloA(0.12, 0.38, gnF) : haloA(0.12, 0.34, gnF)) * (0.85 + 0.15 * Math.sin(now / 300 + 0.6));
        sceneHalo(ctx, ox + sw * 0.5, oy + sh * 0.52, sw * 0.33, col, a);
        return;
      }
      // sinon : repli sur le coin de leçon primitif (stade 0) ci-dessous, le temps que le décor d'ère charge.
    }
    // Pixel-art = scène PixelLab STATIQUE (coin de leçon PRIMITIF : tableau sur chevalet
    // + sièges, registre feu/stade 0 ; ombre de contact déjà posée).
    if (propReady('schools-prop-yard')) blitProp(ctx, ox, oy, sw, sh, 'schools-prop-yard', 0.5, 0.53, 0.88, 0.73);
    return;
  }
  if (id === "academies") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "academies"); return; }
    // ── ÉVOLUTION 4 STADES (2026-07-05, 4e savoir) : BÂTIMENTS CLOS par ère, PAS de perso
    //    (moule conteur/scribes/écoles). Identité marbre classique + coupole + lauriers :
    //    cercle de débat primitif (S0, plus bas) → académie Renaissance → néoclassique à
    //    rotonde → institut moderne circulaire.
    const acStage = engineStage(ei);
    if (acStage >= 1) {
      const acb = ['', 'academies-renaissance', 'academies-institute', 'academies-modern'][acStage];
      if (propReady(acb)) {
        softGround(ctx, ox, oy, sw, sh, 0.84, 0.5, 0.22, "20,14,8", 0.4); // sol (désactivé par défaut)
        blitProp(ctx, ox, oy, sw, sh, acb, 0.5, 0.52, 0.9, 0.74);
        // Lueur (fenêtres chaudes marbre S1-2 ; dôme cyan-or S3), pulse douce.
        const gnF = (CM && CM.nightF) ? CM.nightF : 0;
        const col = acStage === 3 ? "150,220,235" : "255,196,110";
        const a = (acStage === 3 ? haloA(0.12, 0.38, gnF) : haloA(0.11, 0.33, gnF)) * (0.85 + 0.15 * Math.sin(now / 310 + 2.2));
        sceneHalo(ctx, ox + sw * 0.5, oy + sh * 0.5, sw * 0.33, col, a);
        return;
      }
      // sinon : repli sur le cercle de débat primitif (stade 0) ci-dessous, le temps que le décor d'ère charge.
    }
    // Pixel-art = scène PixelLab STATIQUE (cercle de débat PRIMITIF : bancs en rondins +
    // estrade de parole + totem du savoir sous auvent, registre feu/stade 0 ; ombre de
    // contact déjà posée en amont).
    if (propReady('academies-prop-yard')) blitProp(ctx, ox, oy, sw, sh, 'academies-prop-yard', 0.5, 0.53, 0.88, 0.73);
    return;
  }
  if (id === "ancestral_cult") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "ancestral_cult"); return; }
    // ── ÉVOLUTION 4 STADES (2026-07-05, 10e et DERNIER savoir) : BÂTIMENTS CLOS par ère, PAS
    //    de perso. Identité spirituel/mémoriel, fil de la FLAMME ÉTERNELLE : mégalithes+feu animé
    //    (S0, plus bas) → sanctuaire tribal → mausolée à coupole → hall du souvenir moderne.
    const ancStage = engineStage(ei);
    if (ancStage >= 1) {
      const ancb = ['', 'cult-shrine', 'cult-mausoleum', 'cult-memorial'][ancStage];
      if (propReady(ancb)) {
        softGround(ctx, ox, oy, sw, sh, 0.84, 0.5, 0.22, "18,12,8", 0.42); // sol (désactivé par défaut)
        blitProp(ctx, ox, oy, sw, sh, ancb, 0.5, 0.52, 0.9, 0.74);
        // Lueur de FLAMME (chaude S1-2 ; chaud-violet S3), scintillement un peu plus vif (rituel).
        const gnF = (CM && CM.nightF) ? CM.nightF : 0;
        const col = ancStage === 3 ? "185,150,255" : "255,150,45";
        const a = (ancStage === 3 ? haloA(0.12, 0.36, gnF) : haloA(0.14, 0.36, gnF)) * (0.8 + 0.2 * Math.sin(now / 190 + 0.7));
        sceneHalo(ctx, ox + sw * 0.5, oy + sh * 0.54, sw * 0.32, col, a);
        return;
      }
      // sinon : repli sur le cercle de mégalithes (stade 0) ci-dessous, le temps que le décor d'ère charge.
    }
    // Pixel-art = cercle de mégalithes PRIMITIF (pierres levées + foyer + feu rituel).
    // Feu ANIMÉ en 2 COUCHES (comme mint) pour ne pas faire gigoter les pierres :
    // `ancestralcult-back` (pierres/foyer SANS feu) → `ancestralcult-fire` (bande feu SEUL,
    // animée). Repli = scène pleine `ancestralcult-prop` (le MÊME dessin, feu baké), puis rien.
    // Les deux couches partagent la MÊME ancre : la flamme est assise dans le foyer
    // par sa position dans le PNG (scripts/ancestralCultFire.mjs, base y=47), pas ici.
    // Refonte 2026-08-05 : le cercle ne porte plus de sol peint — le terrain de la
    // carte passe entre les pierres, qui sont plantées dans leur mousse. Ne pas
    // rajouter de softGround ici : c'est la dalle refusée sous une autre forme.
    // 2026-10-09 : la scène pleine REDESSINÉE (quatre vues, engineOrient) passe avant le
    // couple animé, cuit sur l'ancien dessin — feu figé jusqu'à ce qu'il soit refait.
    if (propReady('ancestralcult-prop')) { blitProp(ctx, ox, oy, sw, sh, 'ancestralcult-prop', 0.5, 0.53, 0.88, 0.73); return; }
    if (animReady('ancestralcult-fire') && propReady('ancestralcult-back')) {
      blitProp(ctx, ox, oy, sw, sh, 'ancestralcult-back', 0.5, 0.53, 0.88, 0.73);
      blitAnim(ctx, ox, oy, sw, sh, 'ancestralcult-fire', now, 0.5, 0.53, 0.88, 0.73);
      return;
    }
    if (propReady('ancestralcult-prop')) blitProp(ctx, ox, oy, sw, sh, 'ancestralcult-prop', 0.5, 0.53, 0.88, 0.73);
    return;
  }
  if (id === "observatories") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "observatories"); return; }
    // ── ÉVOLUTION 4 STADES (2026-07-05, 5e savoir) : BÂTIMENTS CLOS par ère, PAS de perso.
    //    Identité dômes + télescopes : gnomon/cadran primitif (S0, plus bas) → tour d'observation
    //    médiévale → observatoire à coupole 19e → observatoire moderne à antenne.
    const obStage = engineStage(ei);
    if (obStage >= 1) {
      const obb = ['', 'observatories-tower', 'observatories-dome', 'observatories-array'][obStage];
      if (propReady(obb)) {
        softGround(ctx, ox, oy, sw, sh, 0.84, 0.5, 0.22, "14,14,24", 0.4); // sol (désactivé par défaut)
        blitProp(ctx, ox, oy, sw, sh, obb, 0.5, 0.52, 0.9, 0.74);
        // Lueur (fenêtres chaudes S1-2 ; instruments cyan S3), pulse douce.
        const gnF = (CM && CM.nightF) ? CM.nightF : 0;
        const col = obStage === 3 ? "90,215,235" : "255,190,95";
        const a = (obStage === 3 ? haloA(0.13, 0.4, gnF) : haloA(0.1, 0.32, gnF)) * (0.85 + 0.15 * Math.sin(now / 330 + 3.0));
        sceneHalo(ctx, ox + sw * 0.5, oy + sh * 0.46, sw * 0.33, col, a);
        return;
      }
      // sinon : repli sur le terrain d'observation primitif (stade 0) ci-dessous, le temps que le décor d'ère charge.
    }
    // Pixel-art = terrain d'observation PRIMITIF (gnomon central + cadran de pierre à
    // encoches pour mesurer l'ombre du soleil, pierres de visée, cartes du ciel), registre
    // feu/stade 0 ; ombre de contact déjà posée.
    if (propReady('observatories-prop-dial')) blitProp(ctx, ox, oy, sw, sh, 'observatories-prop-dial', 0.5, 0.53, 0.88, 0.73);
    return;
  }
  if (id === "libraries") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "libraries"); return; }
    // ── ÉVOLUTION 4 STADES (2026-07-05, 6e savoir) : BÂTIMENTS CLOS par ère, PAS de perso.
    //    Identité grands halls de LIVRES : archive primitive (S0, plus bas) → bibliothèque
    //    monastique → grande bibliothèque à coupole → médiathèque moderne.
    const liStage = engineStage(ei);
    if (liStage >= 1) {
      const lib = ['', 'libraries-monastic', 'libraries-grand', 'libraries-modern'][liStage];
      if (propReady(lib)) {
        softGround(ctx, ox, oy, sw, sh, 0.84, 0.5, 0.22, "20,14,8", 0.4); // sol (désactivé par défaut)
        blitProp(ctx, ox, oy, sw, sh, lib, 0.5, 0.52, 0.9, 0.74);
        // Lueur (fenêtres chaudes/rayonnages S1-2 ; chaud+cyan S3), pulse douce.
        const gnF = (CM && CM.nightF) ? CM.nightF : 0;
        const col = liStage === 3 ? "180,205,180" : "255,186,90";
        const a = (liStage === 3 ? haloA(0.11, 0.33, gnF) : haloA(0.12, 0.34, gnF)) * (0.85 + 0.15 * Math.sin(now / 340 + 1.7));
        sceneHalo(ctx, ox + sw * 0.5, oy + sh * 0.5, sw * 0.33, col, a);
        return;
      }
      // sinon : repli sur l'archive primitive (stade 0) ci-dessous, le temps que le décor d'ère charge.
    }
    // Pixel-art = BÂTIMENT-archive PRIMITIF (hutte CARRÉE toit+murs, grande façade en arc
    // laissant voir des étagères pleines de rouleaux + jarres/tas de parchemins), registre
    // feu/stade 0 ; ombre de contact déjà posée. STOCKAGE (distinct des scribes qui écrivent).
    // Sprite 96×88 (plus haut) → blit hFrac 0.80 pour ne pas écraser le toit. Bâtiment fermé
    // = forme CARRÉE, pas ronde (règle DA).
    if (propReady('libraries-prop-archive')) blitProp(ctx, ox, oy, sw, sh, 'libraries-prop-archive', 0.5, 0.50, 0.88, 0.80);
    return;
  }
  if (id === "universities") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "universities"); return; }
    // ── ÉVOLUTION 4 STADES (2026-07-05, 7e savoir) : BÂTIMENTS CLOS par ère, PAS de perso.
    //    Identité GOTHIQUE/collégial : halle primitive (S0, plus bas) → collège gothique →
    //    université collégiale à tour → campus moderne à tour de verre.
    const unStage = engineStage(ei);
    if (unStage >= 1) {
      const unb = ['', 'universities-gothic', 'universities-collegiate', 'universities-modern'][unStage];
      if (propReady(unb)) {
        softGround(ctx, ox, oy, sw, sh, 0.84, 0.5, 0.22, "20,14,8", 0.4); // sol (désactivé par défaut)
        blitProp(ctx, ox, oy, sw, sh, unb, 0.5, 0.52, 0.9, 0.74);
        // Lueur (fenêtres chaudes/vitraux S1-2 ; verre bleu S3), pulse douce.
        const gnF = (CM && CM.nightF) ? CM.nightF : 0;
        const col = unStage === 3 ? "120,180,235" : "255,186,90";
        const a = (unStage === 3 ? haloA(0.12, 0.36, gnF) : haloA(0.12, 0.34, gnF)) * (0.85 + 0.15 * Math.sin(now / 350 + 0.9));
        sceneHalo(ctx, ox + sw * 0.5, oy + sh * 0.5, sw * 0.33, col, a);
        return;
      }
      // sinon : repli sur la halle du savoir primitive (stade 0) ci-dessous, le temps que le décor d'ère charge.
    }
    // Pixel-art = BÂTIMENT-halle du savoir PRIMITIF (halle carrée sur socle de pierre,
    // façade à portique laissant voir un totem du savoir + emblème), registre feu/stade 0 ;
    // ombre déjà posée. Grande halle institutionnelle (distincte de l'école/académie/biblio).
    // Bâtiment fermé = zone CARRÉE (règle DA). Sprite 96×88 → hFrac 0.80. Couvre bands 0-6
    // (stade 0).
    if (propReady('universities-prop-hall')) blitProp(ctx, ox, oy, sw, sh, 'universities-prop-hall', 0.5, 0.50, 0.88, 0.80);
    return;
  }
  if (id === "printing_houses") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "printing_houses"); return; }
    // ── ÉVOLUTION 4 STADES (2026-07-05, 8e savoir) : BÂTIMENTS CLOS par ère, PAS de perso.
    //    Identité presse/reproduction : atelier primitif (S0, plus bas) → imprimerie Renaissance →
    //    imprimerie industrielle (cheminée) → maison de médias moderne (écrans d'actu).
    const prStage = engineStage(ei);
    if (prStage >= 1) {
      const prb = ['', 'printing-press-shop', 'printing-factory', 'printing-media'][prStage];
      if (propReady(prb)) {
        softGround(ctx, ox, oy, sw, sh, 0.84, 0.5, 0.22, "20,14,8", 0.4); // sol (désactivé par défaut)
        blitProp(ctx, ox, oy, sw, sh, prb, 0.5, 0.52, 0.9, 0.74);
        // Lueur (fenêtres chaudes S1-2 ; écrans cyan S3), pulse douce.
        const gnF = (CM && CM.nightF) ? CM.nightF : 0;
        const col = prStage === 3 ? "110,205,235" : "255,180,80";
        const a = (prStage === 3 ? haloA(0.13, 0.38, gnF) : haloA(0.12, 0.34, gnF)) * (0.85 + 0.15 * Math.sin(now / 300 + 2.5));
        sceneHalo(ctx, ox + sw * 0.5, oy + sh * 0.5, sw * 0.33, col, a);
        // L'imprimerie industrielle a une cheminée : elle fume.
        if (prStage === 2) propChimneySmoke(ctx, ox, oy, sw, sh, prb, 0.5, 0.52, 0.9, 0.74, now);
        return;
      }
      // sinon : repli sur l'atelier de reproduction primitif (stade 0) ci-dessous, le temps que le décor d'ère charge.
    }
    // Pixel-art = atelier de REPRODUCTION PRIMITIF (bâtiment carré, façade ouverte : cylindre-
    // sceau + tampons gravés + pots de pigment + tablettes identiques), registre feu/stade 0 ;
    // ombre déjà posée. Reproduire des marques (distinct des scribes qui écrivent à la main).
    // Bâtiment fermé = zone CARRÉE. Sprite 96×88 → hFrac 0.80.
    if (propReady('printing-prop-workshop')) blitProp(ctx, ox, oy, sw, sh, 'printing-prop-workshop', 0.5, 0.50, 0.88, 0.80);
    return;
  }
  if (id === "think_tanks") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "think_tanks"); return; }
    // ── ÉVOLUTION 4 STADES (2026-07-05, 9e savoir) : BÂTIMENTS CLOS par ère, PAS de perso.
    //    Identité stratégie/modélisation (globe+données) : conseil primitif (S0, plus bas) →
    //    chancellerie Renaissance → institut stratégique 19e (globe bronze) → think-tank moderne.
    const thStage = engineStage(ei);
    if (thStage >= 1) {
      const thb = ['', 'think-chancellery', 'think-institute', 'think-modern'][thStage];
      if (propReady(thb)) {
        softGround(ctx, ox, oy, sw, sh, 0.84, 0.5, 0.22, "16,16,24", 0.4); // sol (désactivé par défaut)
        blitProp(ctx, ox, oy, sw, sh, thb, 0.5, 0.52, 0.9, 0.74);
        // Lueur (fenêtres chaudes S1-2 ; globe/données cyan S3), pulse douce.
        const gnF = (CM && CM.nightF) ? CM.nightF : 0;
        const col = thStage === 3 ? "95,210,235" : "255,184,88";
        const a = (thStage === 3 ? haloA(0.13, 0.4, gnF) : haloA(0.11, 0.33, gnF)) * (0.85 + 0.15 * Math.sin(now / 320 + 1.4));
        sceneHalo(ctx, ox + sw * 0.5, oy + sh * 0.48, sw * 0.33, col, a);
        return;
      }
      // sinon : repli sur la halle de conseil primitive (stade 0) ci-dessous, le temps que le décor d'ère charge.
    }
    // Pixel-art = halle du CONSEIL STRATÉGIQUE PRIMITIF (bâtiment carré, façade ouverte :
    // grande carte du territoire au mur + table à jetons/pions + rouleaux de plans),
    // registre feu/stade 0 ; ombre déjà posée. « Des modèles pour tout » — distinct de
    // l'académie (débat)/université (apprentissage). Bâtiment fermé = zone CARRÉE. 96×88 →
    // hFrac 0.80.
    if (propReady('think-prop-council')) blitProp(ctx, ox, oy, sw, sh, 'think-prop-council', 0.5, 0.50, 0.88, 0.80);
    return;
  }
  // (Plus de scène pour les aqueducs : ils sont posés en POINTS D'EAU, un prop du kit
  // des places — iso/isoLiveCollect.js. Leur branche, jamais atteinte, est retirée — MORT-2.)
  if (id === "watch") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "watch"); return; }
    // ── ÉVOLUTION 4 STADES (2026-07-05, 1er INFRA) : TOURS closes par ère (blit tall 0.78×0.94
    //    comme le stade 0). Stade 0 = tour bois + feu animé (plus bas) → tour de pierre → tour
    //    d'observation industrielle → tour de surveillance moderne. PAS de perso.
    const waStage = engineStage(ei);
    if (waStage >= 1) {
      const wab = ['', 'watch-stone', 'watch-industrial', 'watch-modern'][waStage];
      if (propReady(wab)) {
        softGround(ctx, ox, oy, sw, sh, 0.86, 0.44, 0.2, "18,16,12", 0.4); // sol (désactivé par défaut)
        blitProp(ctx, ox, oy, sw, sh, wab, 0.5, 0.40, 0.78, 0.94);
        // Lueur au SOMMET de la tour (brasier/lanterne chauds S1-2 ; balises cyan S3).
        const gnF = (CM && CM.nightF) ? CM.nightF : 0;
        const col = waStage === 3 ? "100,215,235" : "255,170,70";
        const a = (waStage === 3 ? haloA(0.13, 0.4, gnF) : haloA(0.16, 0.36, gnF)) * (0.82 + 0.18 * Math.sin(now / 240 + 1.9));
        sceneHalo(ctx, ox + sw * 0.5, oy + sh * 0.2, sw * 0.26, col, a);
        return;
      }
      // sinon : repli sur la tour bois (stade 0) ci-dessous, le temps que le décor d'ère charge.
    }
    // Scène pixel stade 0 (PixelLab, feu ANIMÉ — pipeline cult/forge) : tour de guet
    // primitive en bois (plateforme sur poteaux croisés, échelle, feu de signal au
    // sommet). Couvre bands 0-6 comme la série savoir (une seule scène) ; repli =
    // prop statique pleine (le MÊME dessin, feu baké), puis rien.
    // 2026-10-09 : la tour REDESSINÉE (quatre vues, engineOrient) passe avant le couple
    // animé, cuit sur l'ancien dessin — feu de signal figé jusqu'à ce qu'il soit refait.
    if (propReady('watch-prop')) { blitProp(ctx, ox, oy, sw, sh, 'watch-prop', 0.5, 0.40, 0.78, 0.94); return; }
    if (animReady('watch-fire') && propReady('watch-back')) {
      blitProp(ctx, ox, oy, sw, sh, 'watch-back', 0.5, 0.40, 0.78, 0.94);
      blitAnim(ctx, ox, oy, sw, sh, 'watch-fire', now, 0.5, 0.40, 0.78, 0.94);
      return;
    }
    if (propReady('watch-prop')) blitProp(ctx, ox, oy, sw, sh, 'watch-prop', 0.5, 0.40, 0.78, 0.94);
    return;
  }
  if (id === "sewers") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "sewers"); return; }
    // ── ÉVOLUTION 4 STADES (INFRA) : stade 0 pixel (station + eau animée, plus bas) conservé,
    //    stades 1-3 = stations closes (drainage médiéval → works vapeur → station d'épuration).
    const seStage = engineStage(ei);
    if (seStage >= 1) {
      const seb = ['', 'sewers-medieval', 'sewers-works', 'sewers-plant'][seStage];
      if (propReady(seb)) {
        drawStagePix(ctx, ox, oy, sw, sh, seb, now, seStage === 3 ? '95,215,225' : '255,178,80', { wf: 0.92, hf: 0.76, ph: 1.1 });
        return;
      }
    }
    // Scène pixel stade 0 (PixelLab) : station d'évacuation — hutte trapue en
    // pierre sèche, toit bois, arche sombre grillagée, et le tuyau qui rentre
    // dans le sol au pied du mur (peint par scripts/sewerOutfall.mjs, comme aux
    // quatre autres stades). ⛔ Pas d'eau de surface, ni ici ni ailleurs : la
    // scène des égouts a porté un filet puis un caniveau, tous deux retirés le
    // 2026-08-05 — un réseau d'évacuation se raconte par ce qui disparaît sous
    // terre. Le RÉSEAU lui-même n'est pas dessiné sur la chaussée non plus
    // (plaques/caniveaux de voirie : rejetés en 2026-07-02).
    // Couvre bands 0-6.
    if (propReady('sewers-prop')) blitProp(ctx, ox, oy, sw, sh, 'sewers-prop', 0.5, 0.52, 0.92, 0.77);
    return;
  }
  if (id === "bureaucracy") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "bureaucracy"); return; }
    // ── ÉVOLUTION 4 STADES (INFRA) : quatre bâtiments CLOS pixel (hutte → chancellerie →
    //    bureau → tour de bureaux). Identité paperasse/administration.
    const buStage = engineStage(ei);
    const bub = ['bureau-hut', 'bureau-chancery', 'bureau-office', 'bureau-tower'][buStage];
    // Décor pas encore chargé : rien (MORT-2).
    if (propReady(bub)) drawStagePix(ctx, ox, oy, sw, sh, bub, now, buStage === 3 ? '218,226,255' : '255,186,90', { ph: 2.0 });
    return;
  }
  if (id === "courthouses") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "courthouses"); return; }
    // ── ÉVOLUTION 4 STADES (2026-07-05, INFRA) : quatre palais de justice CLOS pixel
    //    (loge → tribunal → néoclassique → moderne, balance + colonnes). Identité justice.
    const coStage = engineStage(ei);
    const cob = ['courthouses-lodge', 'courthouses-tribunal', 'courthouses-neoclassical', 'courthouses-modern'][coStage];
    // Décor pas encore chargé : rien (MORT-2).
    if (propReady(cob)) drawStagePix(ctx, ox, oy, sw, sh, cob, now, coStage === 3 ? '255,208,140' : '255,186,90', { ph: 1.3 });
    return;
  }
  if (id === "public_works") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "public_works"); return; }
    // ── ÉVOLUTION 4 STADES (INFRA) : quatre ateliers/dépôts CLOS pixel avec engins
    //    (camp → chantier → atelier vapeur → dépôt moderne). Identité travaux.
    const pwStage = engineStage(ei);
    const pwb = ['works-camp', 'works-yard', 'works-industrial', 'works-depot'][pwStage];
    // Décor pas encore chargé : rien (MORT-2).
    if (propReady(pwb)) drawStagePix(ctx, ox, oy, sw, sh, pwb, now, pwStage === 3 ? '110,205,235' : '255,176,78', { ph: 0.7 });
    return;
  }
  if (id === "ministries") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "ministries"); return; }
    // ── ÉVOLUTION 4 STADES (2026-07-05, INFRA) : quatre bâtiments d'État CLOS pixel
    //    (conseil → palais → capitole → tour, drapeaux + coupole). Identité gouvernement.
    const miStage = engineStage(ei);
    const mib = ['ministries-council', 'ministries-palace', 'ministries-capitol', 'ministries-tower'][miStage];
    // Décor pas encore chargé : rien (MORT-2).
    if (propReady(mib)) drawStagePix(ctx, ox, oy, sw, sh, mib, now, miStage === 3 ? '225,228,255' : '255,186,90', { ph: 0.4 });
    return;
  }
  if (id === "archive_grids") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "archive_grids"); return; }
    // ── ÉVOLUTION 4 STADES (INFRA) : quatre archives CLOSES pixel (hutte → caveau → dépôt
    //    de registres → grille de données). Identité stockage/réseau.
    const arStage = engineStage(ei);
    const arb = ['archive-hut', 'archive-vault', 'archive-records', 'archive-grid'][arStage];
    // Décor pas encore chargé : rien (MORT-2).
    if (propReady(arb)) drawStagePix(ctx, ox, oy, sw, sh, arb, now, arStage === 3 ? '90,225,205' : '255,182,84', { ph: 2.6 });
    return;
  }
  if (id === "ruin_architects") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "ruin_architects"); return; }
    // ── ÉVOLUTION 4 STADES (INFRA) : quatre bâtiments de RESTAURATION CLOS pixel (camp →
    //    lodge de maçons → institut d'antiquités → labo patrimoine).
    const ruStage = engineStage(ei);
    const rub = ['ruins-camp', 'ruins-lodge', 'ruins-institute', 'ruins-lab'][ruStage];
    // Décor pas encore chargé : rien (MORT-2).
    if (propReady(rub)) drawStagePix(ctx, ox, oy, sw, sh, rub, now, ruStage === 3 ? '120,215,205' : '255,180,90', { ph: 3.1 });
    return;
  }
  // `seed` : graine stable par instance (hash entier des coordonnées de tuile,
  // le même que le jitter du layout) pour DÉSYNCHRONISER les animations d'un
  // même type. Jamais dérivée d'ox/oy (la phase sauterait au pan).
  // gw/gh : les tuiles RECTANGULAIRES (ports, champs) portent spanX/spanY, les
  // moteurs CARRÉS (halle+ateliers) portent `size` — sans le repli, gw valait
  // toujours 1 pour eux et le palier de halle (grain G2) ne s'armait jamais.
  // `craft` : le métier d'un atelier des guildes (cf. engineCraft).
  if (drawCityEngineSprite({ ctx, id, tier, litGold, ox, oy, sw, sh, px, strokeRect, now, band, ei,
    gw: t.spanX || t.size || 1, gh: t.spanY || t.size || 1, craft: engineCraft(t),
    seed: ((Math.imul(t.gx | 0, 73856093) ^ Math.imul(t.gy | 0, 19349663)) >>> 0) })) return;

}

// Le point d'entrée des scènes moteur. (La couche de sprites plats par bâtiment,
// pixelBuildings.js, est retirée à l'audit du 05/10 — MORT-9 : son manifeste était
// vide depuis l'abandon de l'approche le 2026-06-29, et elle bâtissait pourtant une
// clé par scène et par frame avant de rendre la main.)
const drawEngineSprite = drawEngineSpriteCore;

export { drawEngineSprite, drawEngineSpriteCore };
