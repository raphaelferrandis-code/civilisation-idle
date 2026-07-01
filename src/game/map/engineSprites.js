/* eslint-disable */
import { drawCityEngineSprite, cosmicBase, propReady, blitProp, animReady, blitAnim } from './cityEngineSprites.js';
import { CM } from './layout.js';
import { drawPixelBuilding } from './pixelBuildings.js';

/* Charte d'animation des sprites (DA par âge) :
 *   - Toute animation est DIÉGÉTIQUE : un geste, une flamme, une roue — jamais
 *     d'objet qui flotte ou jaillit du bâtiment (cf. ex-pièces volantes de
 *     l'hôtel des monnaies, ex-filet de grain des entrepôts).
 *   - Ères primitives/antiques : mouvement ORGANIQUE (personnages, feu, tissu).
 *   - Ères médiévales/industrielles : mouvement MÉCANIQUE (presse, grue, roue).
 *   - Ères futuristes : mouvement LUMINEUX (pulses, LED, hologrammes).
 *   - Amplitudes faibles (< 2% du sprite) et périodes désynchronisées
 *     (offset par index) pour éviter l'effet métronome. */


// Stade cosmique (ères 35+, bands 7–9) des 19 bâtiments SAVOIR/INFRA. Corps OPAQUE
// (cp.mid/edge/lite) pour survivre au voile de nuit ; matière selon l'époque ;
// silhouette par FAMILLE (dôme/flèche/halle/temple/arches/ossature) + emblème du
// médaillon = identité. Animation : mote de savoir en orbite + halo qui respire
// (+ anneau orbital qui tourne en band 8). cosmicBase importé de cityEngineSprites.
const COSMIC_SAVOIR_FAM = {
  observatories: "dome", ministries: "dome", schools: "dome", universities: "dome",
  ancestral_cult: "spire", watch: "spire", think_tanks: "spire",
  libraries: "hall", archive_grids: "hall", bureaucracy: "hall", scribes: "hall", printing_houses: "hall", storytellers: "hall",
  academies: "temple", courthouses: "temple",
  aqueducts: "arch", sewers: "arch",
  public_works: "frame", ruin_architects: "frame"
};
function cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, kind) {
  const { cp, glow } = cosmicBase(ctx, ox, oy, sw, sh, px, band);
  const X = (x) => ox + sw * x, Y = (y) => oy + sh * y;
  const pulse = 0.5 + 0.5 * Math.sin(now / 600);
  const rrect = (x0, y0, x1, y1, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(X(x0), Y(y0), sw * (x1 - x0), sh * (y1 - y0), sw * r); ctx.fill(); };
  const dot = (x, y, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(x), Y(y), sw * r, 0, Math.PI * 2); ctx.fill(); };
  const fam = COSMIC_SAVOIR_FAM[kind] || "hall";
  if (fam === "dome") {
    rrect(0.28, 0.5, 0.72, 0.84, 0.03, cp.mid);
    ctx.fillStyle = cp.mid; ctx.beginPath(); ctx.ellipse(X(0.5), Y(0.5), sw * 0.24, sh * 0.2, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.ellipse(X(0.5), Y(0.5), sw * 0.16, sh * 0.14, 0, Math.PI, 0); ctx.fill();
    if (band === 9) { ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.moveTo(X(0.32), Y(0.5)); ctx.lineTo(X(0.5), Y(0.3)); ctx.lineTo(X(0.68), Y(0.5)); ctx.closePath(); ctx.fill(); }
    dot(0.5, 0.46, 0.028, cp.lite);
  } else if (fam === "spire") {
    ctx.fillStyle = cp.mid; ctx.beginPath(); ctx.moveTo(X(0.4), Y(0.84)); ctx.lineTo(X(0.46), Y(0.28)); ctx.lineTo(X(0.54), Y(0.28)); ctx.lineTo(X(0.6), Y(0.84)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.moveTo(X(0.46), Y(0.28)); ctx.lineTo(X(0.54), Y(0.28)); ctx.lineTo(X(0.5), Y(0.16)); ctx.closePath(); ctx.fill();
    dot(0.5, 0.2, 0.028 + 0.012 * pulse, cp.lite);
  } else if (fam === "hall") {
    rrect(0.12, 0.42, 0.88, 0.84, 0.03, cp.mid);
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(X(0.62), Y(0.42), sw * 0.26, sh * 0.42);
    ctx.fillStyle = cp.edge; ctx.fillRect(X(0.14), Y(0.44), sw * 0.72, sh * 0.05);
    if (band === 9) { ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.moveTo(X(0.12), Y(0.42)); ctx.lineTo(X(0.5), Y(0.3)); ctx.lineTo(X(0.88), Y(0.42)); ctx.closePath(); ctx.fill(); }
    for (let i = 0; i < 4; i++) dot(0.24 + i * 0.17, 0.62, 0.025, cp.lite);
  } else if (fam === "temple") {
    ctx.fillStyle = cp.mid; ctx.beginPath(); ctx.moveTo(X(0.18), Y(0.46)); ctx.lineTo(X(0.5), Y(0.26)); ctx.lineTo(X(0.82), Y(0.46)); ctx.closePath(); ctx.fill();
    if (band === 9) { ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.moveTo(X(0.18), Y(0.46)); ctx.lineTo(X(0.5), Y(0.26)); ctx.lineTo(X(0.5), Y(0.46)); ctx.closePath(); ctx.fill(); }
    else { ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.moveTo(X(0.18), Y(0.46)); ctx.lineTo(X(0.5), Y(0.26)); ctx.lineTo(X(0.82), Y(0.46)); ctx.closePath(); ctx.fill(); ctx.fillStyle = cp.mid; ctx.beginPath(); ctx.moveTo(X(0.24), Y(0.45)); ctx.lineTo(X(0.5), Y(0.31)); ctx.lineTo(X(0.76), Y(0.45)); ctx.closePath(); ctx.fill(); }
    for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? cp.edge : cp.mid; ctx.fillRect(X(0.22 + i * 0.13), Y(0.48), sw * 0.06, sh * 0.36); }
  } else if (fam === "arch") {
    for (let i = 0; i < 3; i++) { const ax = 0.24 + i * 0.26; ctx.fillStyle = cp.mid; ctx.fillRect(X(ax - 0.05), Y(0.5), sw * 0.1, sh * 0.34); ctx.fillStyle = cp.deep; ctx.beginPath(); ctx.arc(X(ax), Y(0.66), sw * 0.07, Math.PI, 0); ctx.fill(); }
    rrect(0.12, 0.42, 0.88, 0.5, 0.02, cp.mid);
    ctx.fillStyle = cp.edge; ctx.fillRect(X(0.12), Y(0.42), sw * 0.76, sh * 0.04);
  } else {
    ctx.strokeStyle = cp.mid; ctx.lineWidth = Math.max(2, sw * 0.04);
    ctx.strokeRect(X(0.28), Y(0.44), sw * 0.4, sh * 0.4);
    ctx.beginPath(); ctx.moveTo(X(0.28), Y(0.44)); ctx.lineTo(X(0.68), Y(0.84)); ctx.moveTo(X(0.68), Y(0.44)); ctx.lineTo(X(0.28), Y(0.84)); ctx.stroke();
    ctx.fillStyle = cp.edge; ctx.fillRect(X(0.26), Y(0.42), sw * 0.44, sh * 0.04);
  }
  // Animation partagée : mote de savoir en orbite + halo qui respire
  const a = now / 1300, mx = 0.5 + Math.cos(a) * 0.34, my = 0.5 + Math.sin(a) * 0.16;
  dot(mx, my, 0.02, cp.lite); glow(mx, my, 0.05, 0.45);
  if (band === 8) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = `rgba(${cp.glow},0.45)`; ctx.lineWidth = Math.max(1, sw * 0.016); ctx.beginPath(); ctx.ellipse(X(0.5), Y(0.4), sw * 0.34, sh * 0.07, 0.15 * Math.sin(now / 900), 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  glow(0.5, 0.56, 0.18, 0.12 + 0.08 * pulse);
}

function drawEngineSpriteCore(t, x, y, w, h, now) {
  const ctx = CM.ctx;
  const id = t.buildingId || t.variant;
  const tier = t.tier || 0;
  const night = CM.nightF || 0;
  const litWarm = CM.litWarm || `rgba(255,204,68,0.25)`;
  const litGold = CM.litGold || `rgba(255,220,120,0.35)`;
  const ox = x, oy = y, sw = w, sh = h;
  const band = CM.layout?.counts?.eraBand ?? 0;   // hissé ici : les blocs savoir/infra (return avant la fin) en ont besoin
  const ei = CM.layout?.counts?.eraIndex ?? 0;
  const px = (rx, ry, rw, rh, col) => { ctx.fillStyle = col; ctx.fillRect(ox + sw * rx, oy + sh * ry, sw * rw, sh * rh); };
  const strokeRect = (rx, ry, rw, rh, col) => { ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, sw * 0.025); ctx.strokeRect(ox + sw * rx, oy + sh * ry, sw * rw, sh * rh); };
  // Ombre de contact au sol — SAUF les riverains (port, moulin) : leur emprise déborde
  // sur le fleuve, l'ombre tomberait sur l'eau (les bateaux de rivière n'en ont pas non plus).
  if (id !== "river_ports" && id !== "water_mills") {
    ctx.fillStyle = "rgba(0,0,0,0.26)";
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h * 0.84, w * 0.42, h * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (id === "storytellers") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "storytellers"); return; }
    // Pixel-art = scène PixelLab en 2 COUCHES pour glisser la lectrice ENTRE le sol et
    // le feu : `storyteller-back` (sol/pierres/livre, SANS feu) → lectrice assise →
    // `storyteller-fire` (bande feu SEUL, animée, par-dessus). Repli = scène pleine
    // `storyteller-prop-fire` (lectrice par-dessus), puis scène procédurale d'origine.
    if (animReady('storyteller-fire') || propReady('storyteller-back') || propReady('storyteller-prop-fire')) {
      if (propReady('storyteller-back')) {
        blitProp(ctx, ox, oy, sw, sh, 'storyteller-back', 0.5, 0.52, 0.92, 0.77);                            // sol/pierres/livre (sans feu)
        if (propReady('storyteller-reader')) blitProp(ctx, ox, oy, sw, sh, 'storyteller-reader', 0.316, 0.347, 0.345, 0.345); // lectrice ENTRE sol et feu
        if (animReady('storyteller-fire')) blitAnim(ctx, ox, oy, sw, sh, 'storyteller-fire', now, 0.5, 0.52, 0.92, 0.77);     // feu SEUL, DEVANT (animé)
      } else {
        blitProp(ctx, ox, oy, sw, sh, 'storyteller-prop-fire', 0.5, 0.52, 0.92, 0.77);                       // repli : scène pleine
        if (propReady('storyteller-reader')) blitProp(ctx, ox, oy, sw, sh, 'storyteller-reader', 0.316, 0.347, 0.345, 0.345);
      }
      return;
    }
    // Sol
    px(0.0, 0.58, 1.0, 0.42, "#16100a");

    // === FEU DE CAMP (droite) ===
    const fx = 0.66, fy = 0.66;
    // Pierres du foyer
    ctx.fillStyle = "#3a2e20";
    for (const [da, dr] of [[0,0.09],[ 1.0,0.09],[ 2.1,0.085],[ 3.2,0.09],[ 4.3,0.085],[ 5.4,0.09]]) {
      ctx.beginPath(); ctx.arc(ox + sw*(fx + Math.cos(da)*0.1), oy + sh*(fy + Math.sin(da)*0.065), sw*dr*0.38, 0, Math.PI*2); ctx.fill();
    }
    // Bûches en croix
    ctx.lineWidth = Math.max(1.5, sw * 0.05); ctx.lineCap = "round";
    ctx.strokeStyle = "#6a3c10";
    ctx.beginPath(); ctx.moveTo(ox+sw*(fx-0.14), oy+sh*(fy+0.04)); ctx.lineTo(ox+sw*(fx+0.14), oy+sh*(fy-0.04)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox+sw*(fx+0.14), oy+sh*(fy+0.04)); ctx.lineTo(ox+sw*(fx-0.14), oy+sh*(fy-0.04)); ctx.stroke();
    ctx.lineCap = "square";
    // Braises
    ctx.fillStyle = "rgba(210,70,5,0.75)";
    ctx.beginPath(); ctx.ellipse(ox+sw*fx, oy+sh*(fy-0.01), sw*0.11, sh*0.04, 0, 0, Math.PI*2); ctx.fill();
    // Flammes (3 langues animées) — scintillement vif, calé sur les feux
    // satellites du campement (now/130) pour battre au même rythme.
    const f1 = 0.5+0.5*Math.sin(now/130), f2 = 0.5+0.5*Math.sin(now/110+1.5), f3 = 0.5+0.5*Math.sin(now/150+2.9);
    ctx.fillStyle = `rgba(255,90,8,${(0.55+f1*0.45).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(ox+sw*(fx-0.08), oy+sh*(fy-0.02)); ctx.quadraticCurveTo(ox+sw*(fx-0.14), oy+sh*(fy-0.12-f1*0.11), ox+sw*(fx-0.04), oy+sh*(fy-0.16-f1*0.09)); ctx.quadraticCurveTo(ox+sw*(fx+0.01), oy+sh*(fy-0.08), ox+sw*(fx+0.04), oy+sh*(fy-0.02)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,195,15,${(0.6+f2*0.4).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(ox+sw*(fx-0.06), oy+sh*(fy-0.02)); ctx.quadraticCurveTo(ox+sw*(fx-0.01), oy+sh*(fy-0.17-f2*0.14), ox+sw*fx, oy+sh*(fy-0.21-f2*0.12)); ctx.quadraticCurveTo(ox+sw*(fx+0.01), oy+sh*(fy-0.12), ox+sw*(fx+0.06), oy+sh*(fy-0.02)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,130,15,${(0.5+f3*0.5).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(ox+sw*(fx+0.04), oy+sh*(fy-0.02)); ctx.quadraticCurveTo(ox+sw*(fx+0.12), oy+sh*(fy-0.1-f3*0.1), ox+sw*(fx+0.06), oy+sh*(fy-0.14-f3*0.08)); ctx.quadraticCurveTo(ox+sw*(fx+0.01), oy+sh*(fy-0.07), ox+sw*(fx-0.03), oy+sh*(fy-0.02)); ctx.closePath(); ctx.fill();
    // Halo rayonnant — pulse au rythme des flammes
    const halo = 0.24 + 0.2*Math.abs(Math.sin(now/170));
    const rg = ctx.createRadialGradient(ox+sw*fx, oy+sh*fy, 0, ox+sw*fx, oy+sh*fy, sw*0.36);
    rg.addColorStop(0, `rgba(255,170,40,${halo.toFixed(2)})`); rg.addColorStop(1, "rgba(255,90,10,0)");
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(ox+sw*fx, oy+sh*fy, sw*0.36, 0, Math.PI*2); ctx.fill();

    // === LIVRE OUVERT (gauche) ===
    const bx = 0.1, by = 0.58, bw = 0.32, bh = 0.22;
    ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.beginPath(); ctx.ellipse(ox+sw*(bx+bw*0.5), oy+sh*(by+bh+0.025), sw*bw*0.52, sh*0.04, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#5a2e06"; ctx.fillRect(ox+sw*(bx-0.012), oy+sh*(by-0.01), sw*(bw+0.024), sh*(bh+0.02));
    ctx.fillStyle = "#e8daaa"; ctx.fillRect(ox+sw*bx, oy+sh*by, sw*(bw*0.47), sh*bh);
    const pglo = 0.06+0.07*Math.sin(now/520);
    ctx.fillStyle = `rgba(255,155,35,${pglo.toFixed(2)})`; ctx.fillRect(ox+sw*bx, oy+sh*by, sw*(bw*0.47), sh*bh);
    ctx.fillStyle = "#f0dfc0"; ctx.fillRect(ox+sw*(bx+bw*0.53), oy+sh*by, sw*(bw*0.47), sh*bh);
    ctx.fillStyle = `rgba(255,180,60,${(pglo*1.6).toFixed(2)})`; ctx.fillRect(ox+sw*(bx+bw*0.53), oy+sh*by, sw*(bw*0.47), sh*bh);
    ctx.fillStyle = "#3a1a04"; ctx.fillRect(ox+sw*(bx+bw*0.487), oy+sh*by, sw*0.02, sh*bh);
    ctx.fillStyle = "rgba(70,45,15,0.5)";
    for (let li = 0; li < 4; li++) {
      ctx.fillRect(ox+sw*(bx+0.024), oy+sh*(by+0.038+li*0.044), sw*0.105, sh*0.014);
      ctx.fillRect(ox+sw*(bx+bw*0.555), oy+sh*(by+0.038+li*0.044), sw*0.105, sh*0.014);
    }

    // === PERSONNAGE ASSIS (centre) ===
    const cx2 = 0.46, cy2 = 0.54;
    ctx.fillStyle = "#2c1c0c"; ctx.fillRect(ox+sw*(cx2-0.032), oy+sh*(cy2+0.04), sw*0.064, sh*0.09);
    ctx.fillStyle = `rgba(190,130,70,${(0.7+halo*0.6).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(ox+sw*cx2, oy+sh*cy2, sw*0.048, 0, Math.PI*2); ctx.fill();

    // Tier 1+ : auditeurs
    if (tier >= 1) {
      const nb = tier >= 2 ? 4 : 2;
      for (let i = 0; i < nb; i++) {
        const ang = Math.PI*0.7 + (Math.PI*0.9)*(i/Math.max(1,nb-1));
        const px2 = fx + Math.cos(ang)*0.28, py2 = fy + Math.sin(ang)*0.2;
        if (px2 < 0.04 || px2 > 0.96) continue;
        ctx.fillStyle = "#1e140a"; ctx.fillRect(ox+sw*(px2-0.028), oy+sh*(py2+0.025), sw*0.056, sh*0.075);
        ctx.fillStyle = `rgba(170,110,55,${(0.6+halo*0.5).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(ox+sw*px2, oy+sh*py2, sw*0.038, 0, Math.PI*2); ctx.fill();
      }
    }
    return;
  }
  if (id === "scribes") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "scribes"); return; }
    // Pixel-art = scène PixelLab STATIQUE (abri PRIMITIF : auvent de peau + table à
    // tablettes/rouleaux, registre feu/stade 0 ; ombre de contact déjà posée en amont).
    // Repli sur le scriptorium procédural.
    if (propReady('scribes-prop-hall')) {
      blitProp(ctx, ox, oy, sw, sh, 'scribes-prop-hall', 0.5, 0.53, 0.88, 0.73);
      return;
    }
    // Scriptorium : salle voûtée médiévale, scribes à la lueur des bougies
    px(0.08, 0.34, 0.84, 0.48, "#705230");
    ctx.fillStyle = "#4a3218";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.06, oy+sh*0.36); ctx.lineTo(ox+sw*0.5, oy+sh*0.14); ctx.lineTo(ox+sw*0.94, oy+sh*0.36); ctx.closePath(); ctx.fill();
    px(0.06, 0.33, 0.88, 0.05, "#382410");
    const nWin = 2 + Math.min(tier, 2);
    for (let i = 0; i < nWin; i++) {
      const wx = 0.17 + i * (0.66 / Math.max(1, nWin - 1));
      ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(ox+sw*(wx-0.036), oy+sh*0.40, sw*0.072, sh*0.16);
      ctx.fillStyle = "#1a1008"; ctx.beginPath(); ctx.arc(ox+sw*wx, oy+sh*0.40, sw*0.036, Math.PI, 0); ctx.fill();
      ctx.fillStyle = litWarm; ctx.beginPath(); ctx.arc(ox+sw*wx, oy+sh*0.40, sw*0.020, Math.PI, 0); ctx.fill();
      ctx.fillRect(ox+sw*(wx-0.016), oy+sh*0.40, sw*0.032, sh*0.12);
      // Vacillement de bougie : chaque fenêtre respire à son propre rythme
      const cdl = 0.10 + 0.10 * Math.sin(now / 260 + i * 2.3);
      ctx.fillStyle = `rgba(255,190,80,${cdl.toFixed(2)})`;
      ctx.fillRect(ox+sw*(wx-0.016), oy+sh*0.40, sw*0.032, sh*0.12);
    }
    const nT = 2 + tier;
    for (let i = 0; i < nT && i < 4; i++) {
      const tx = 0.14 + (i % 2) * 0.44, ty = 0.56 + Math.floor(i / 2) * 0.10;
      px(tx, ty, 0.22, 0.07, "#c8b882");
      ctx.fillStyle = "rgba(40,22,6,0.55)"; ctx.beginPath(); ctx.arc(ox+sw*(tx+0.11), oy+sh*(ty-0.025), sw*0.022, 0, Math.PI*2); ctx.fill();
    }
    px(0.44, 0.64, 0.12, 0.18, "#1e1006");
    return;
  }
  if (id === "schools") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "schools"); return; }
    // Pixel-art = scène PixelLab STATIQUE (coin de leçon PRIMITIF : tableau sur chevalet
    // + sièges, registre feu/stade 0 ; ombre de contact déjà posée). Repli procédural.
    if (propReady('schools-prop-yard')) {
      blitProp(ctx, ox, oy, sw, sh, 'schools-prop-yard', 0.5, 0.53, 0.88, 0.73);
      return;
    }
    // École : cour à colonnades, rangées d'élèves, maître à l'avant
    px(0.08, 0.26, 0.84, 0.50, "#b8944a");
    ctx.fillStyle = "#6a4a10";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.06, oy+sh*0.28); ctx.lineTo(ox+sw*0.5, oy+sh*0.08); ctx.lineTo(ox+sw*0.94, oy+sh*0.28); ctx.closePath(); ctx.fill();
    px(0.20, 0.38, 0.60, 0.26, "#d4b86a");
    px(0.36, 0.34, 0.28, 0.06, "#c8a85a");
    const nRows = 1 + Math.min(tier, 2);
    for (let row = 0; row < nRows; row++) {
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = "rgba(60,38,14,0.6)";
        ctx.beginPath(); ctx.arc(ox+sw*(0.26+c*0.14), oy+sh*(0.50+row*0.08), sw*0.018, 0, Math.PI*2); ctx.fill();
      }
    }
    // Le maître fait les cent pas devant ses rangées d'élèves
    const pace = Math.sin(now / 1600) * 0.05;
    ctx.fillStyle = "#2a1408"; ctx.beginPath(); ctx.arc(ox+sw*(0.5+pace), oy+sh*0.43, sw*0.026, 0, Math.PI*2); ctx.fill();
    const nCol = 3 + Math.min(tier, 2);
    for (let i = 0; i < nCol; i++) px(0.14 + i * (0.72 / Math.max(1, nCol - 1)) - 0.014, 0.28, 0.028, 0.14, "rgba(30,20,8,0.42)");
    px(0.44, 0.62, 0.12, 0.16, "#1e1006");
    return;
  }
  if (id === "academies") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "academies"); return; }
    // Pixel-art = scène PixelLab STATIQUE (cercle de débat PRIMITIF : bancs en rondins +
    // estrade de parole + totem du savoir sous auvent, registre feu/stade 0 ; ombre de
    // contact déjà posée en amont). Repli sur le péristyle procédural.
    if (propReady('academies-prop-yard')) {
      blitProp(ctx, ox, oy, sw, sh, 'academies-prop-yard', 0.5, 0.53, 0.88, 0.73);
      return;
    }
    // Académie : péristyle, jardin, philosophes en cercle de discussion
    px(0.06, 0.28, 0.88, 0.52, "#d4c5a0");
    ctx.fillStyle = "#b8a882";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.04, oy+sh*0.30); ctx.lineTo(ox+sw*0.5, oy+sh*0.08); ctx.lineTo(ox+sw*0.96, oy+sh*0.30); ctx.closePath(); ctx.fill();
    px(0.06, 0.27, 0.88, 0.05, "#9a8860");
    const nCol = 4 + Math.min(tier, 2);
    for (let i = 0; i < nCol; i++) px(0.12 + i * (0.76 / Math.max(1, nCol - 1)) - 0.014, 0.32, 0.028, 0.42, "rgba(30,20,8,0.38)");
    px(0.22, 0.44, 0.56, 0.22, "#c4b890");
    const nPhil = 4 + tier;
    for (let i = 0; i < nPhil; i++) {
      const a = (i / nPhil) * Math.PI * 2;
      // Léger balancement : le cercle de discussion vit (chacun à son rythme)
      const sway = Math.sin(now / 700 + i * 1.9) * 0.006;
      ctx.fillStyle = "rgba(50,32,10,0.65)";
      ctx.beginPath(); ctx.arc(ox+sw*(0.5+Math.cos(a)*0.14+sway), oy+sh*(0.56+Math.sin(a)*0.075), sw*0.022, 0, Math.PI*2); ctx.fill();
    }
    px(0.46, 0.48, 0.08, 0.10, "#b0a070");
    px(0.44, 0.66, 0.12, 0.14, "#1e1408");
    strokeRect(0.06, 0.28, 0.88, 0.52, "#c0b090");
    return;
  }
  if (id === "ancestral_cult") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "ancestral_cult"); return; }
    // Pixel-art = cercle de mégalithes PRIMITIF (pierres levées + autel + feu rituel).
    // Feu ANIMÉ en 2 COUCHES (comme conteur/mint) pour ne pas faire gigoter les pierres :
    // `ancestralcult-back` (pierres/autel SANS feu) → `ancestralcult-fire` (bande feu SEUL,
    // animée). Repli = scène pleine `ancestralcult-prop` (feu baké), puis procédural.
    if (animReady('ancestralcult-fire') && propReady('ancestralcult-back')) {
      blitProp(ctx, ox, oy, sw, sh, 'ancestralcult-back', 0.5, 0.53, 0.88, 0.73);
      blitAnim(ctx, ox, oy, sw, sh, 'ancestralcult-fire', now, 0.5, 0.53, 0.88, 0.73);
      return;
    }
    if (propReady('ancestralcult-prop')) {
      blitProp(ctx, ox, oy, sw, sh, 'ancestralcult-prop', 0.5, 0.53, 0.88, 0.73);
      return;
    }
    // Culte des ancêtres : mégalithes en cercle, autel central, flamme rituelle
    px(0.0, 0.48, 1.0, 0.52, "#2e2416");
    const nStones = 5 + Math.min(tier, 3);
    for (let i = 0; i < nStones; i++) {
      const a = (i / nStones) * Math.PI * 2;
      const sx2 = 0.5 + Math.cos(a) * 0.34, sy2 = 0.62 + Math.sin(a) * 0.20;
      const sth = 0.10 + (i * 37 % 3) * 0.04;
      ctx.fillStyle = "#6a5a48"; ctx.fillRect(ox+sw*(sx2-0.024), oy+sh*(sy2-sth), sw*0.048, sh*sth);
      ctx.fillStyle = "rgba(180,160,120,0.38)"; ctx.fillRect(ox+sw*(sx2-0.022), oy+sh*(sy2-sth), sw*0.020, sh*sth);
    }
    px(0.46, 0.54, 0.08, 0.46, "#4a3c2a");
    px(0.40, 0.60, 0.20, 0.08, "#786040");
    const af1 = 0.5 + 0.5 * Math.sin(now / 180), af2 = 0.5 + 0.5 * Math.sin(now / 150 + 1.2);
    ctx.fillStyle = `rgba(255,120,10,${(0.7+af1*0.3).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(ox+sw*0.46, oy+sh*0.62); ctx.quadraticCurveTo(ox+sw*0.42, oy+sh*(0.46-af1*0.06), ox+sw*0.50, oy+sh*(0.40-af1*0.05)); ctx.quadraticCurveTo(ox+sw*0.58, oy+sh*(0.46-af2*0.05), ox+sw*0.54, oy+sh*0.62); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,210,40,${(0.65+af2*0.25).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(ox+sw*0.48, oy+sh*0.62); ctx.quadraticCurveTo(ox+sw*0.45, oy+sh*(0.50-af2*0.08), ox+sw*0.50, oy+sh*(0.44-af2*0.06)); ctx.quadraticCurveTo(ox+sw*0.55, oy+sh*(0.50-af1*0.05), ox+sw*0.52, oy+sh*0.62); ctx.closePath(); ctx.fill();
    if (night > 0.2) {
      const hg = ctx.createRadialGradient(ox+sw*0.5, oy+sh*0.60, 0, ox+sw*0.5, oy+sh*0.60, sw*0.36);
      hg.addColorStop(0, `rgba(255,155,30,${(0.22*night).toFixed(2)})`); hg.addColorStop(1, "rgba(255,90,5,0)");
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.60, sw*0.36, 0, Math.PI*2); ctx.fill();
    }
    if (tier >= 1) {
      for (let i = 0; i < 2 + tier; i++) {
        const a = -Math.PI / 2 + (i / (1 + tier)) * Math.PI;
        ctx.fillStyle = "#d4c8a0"; ctx.beginPath(); ctx.arc(ox+sw*(0.5+Math.cos(a)*0.18), oy+sh*(0.61+Math.sin(a)*0.04), sw*0.022, 0, Math.PI*2); ctx.fill();
      }
    }
    return;
  }
  if (id === "observatories") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "observatories"); return; }
    // Pixel-art = terrain d'observation PRIMITIF (gnomon central + cadran de pierre à
    // encoches pour mesurer l'ombre du soleil, pierres de visée, cartes du ciel), registre
    // feu/stade 0 ; ombre de contact déjà posée. Repli = le dôme/télescope procédural.
    if (propReady('observatories-prop-dial')) {
      blitProp(ctx, ox, oy, sw, sh, 'observatories-prop-dial', 0.5, 0.53, 0.88, 0.73);
      return;
    }
    // Observatoire : dôme avec fente animée, bras de télescope pivotant, rose des vents
    ctx.fillStyle = "#3a3050"; ctx.beginPath(); ctx.ellipse(ox+sw*0.5, oy+sh*0.64, sw*0.42, sh*0.18, 0, 0, Math.PI*2); ctx.fill();
    px(0.36, 0.24, 0.28, 0.40, "#2a2840");
    ctx.fillStyle = "#3c3860"; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.24, sw*0.18, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(150,160,220,0.6)"; ctx.lineWidth = Math.max(1, sw*0.022);
    ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.24, sw*0.18, Math.PI, 0); ctx.stroke();
    const slitA = (now / 3200) % Math.PI;
    ctx.strokeStyle = "#0a0818"; ctx.lineWidth = Math.max(2, sw*0.030);
    ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.24, sw*0.18, Math.PI + slitA, Math.PI + slitA + 0.38); ctx.stroke();
    const telA = slitA - Math.PI / 2;
    ctx.strokeStyle = "#8090a0"; ctx.lineWidth = Math.max(1.5, sw*0.028); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.24); ctx.lineTo(ox+sw*(0.5+Math.cos(telA)*0.15), oy+sh*(0.24+Math.sin(telA)*0.11)); ctx.stroke();
    ctx.lineCap = "square";
    ctx.fillStyle = "#a0b0c0"; ctx.beginPath(); ctx.arc(ox+sw*(0.5+Math.cos(telA)*0.16), oy+sh*(0.24+Math.sin(telA)*0.12), Math.max(1.5, sw*0.036), 0, Math.PI*2); ctx.fill();
    const pulse = 0.4 + Math.abs(Math.sin(now / 800)) * 0.5;
    ctx.fillStyle = `rgba(107,182,255,${pulse.toFixed(2)})`; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.22, sw*0.055, 0, Math.PI*2); ctx.fill();
    if (tier >= 1) {
      ctx.strokeStyle = "rgba(140,160,200,0.32)"; ctx.lineWidth = Math.max(0.5, sw*0.013);
      for (let i = 0; i < 4; i++) {
        const a2 = i * Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.64); ctx.lineTo(ox+sw*(0.5+Math.cos(a2)*0.36), oy+sh*(0.64+Math.sin(a2)*0.14)); ctx.stroke();
      }
    }
    if (tier >= 2) { px(0.68, 0.38, 0.18, 0.24, "#2a2840"); px(0.68, 0.32, 0.18, 0.08, "#3c3860"); }
    return;
  }
  if (id === "libraries") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "libraries"); return; }
    // Pixel-art = BÂTIMENT-archive PRIMITIF (hutte CARRÉE toit+murs, grande façade en arc
    // laissant voir des étagères pleines de rouleaux + jarres/tas de parchemins), registre
    // feu/stade 0 ; ombre de contact déjà posée. STOCKAGE (distinct des scribes qui écrivent).
    // Sprite 96×88 (plus haut) → blit hFrac 0.80 pour ne pas écraser le toit. Bâtiment fermé
    // = forme CARRÉE, pas ronde (règle DA). Repli = hall néoclassique procédural.
    if (propReady('libraries-prop-archive')) {
      blitProp(ctx, ox, oy, sw, sh, 'libraries-prop-archive', 0.5, 0.50, 0.88, 0.80);
      return;
    }
    // Bibliothèque : hall néoclassique, rayonnages colorés par rangées, lecteurs aux tables
    px(0.08, 0.26, 0.84, 0.54, "#c8b882");
    ctx.fillStyle = "#b0a070";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.06, oy+sh*0.28); ctx.lineTo(ox+sw*0.5, oy+sh*0.08); ctx.lineTo(ox+sw*0.94, oy+sh*0.28); ctx.closePath(); ctx.fill();
    px(0.06, 0.25, 0.88, 0.05, "#7a6434");
    const lCols = 4 + Math.min(tier, 2);
    for (let i = 0; i < lCols; i++) px(0.13 + i * (0.74 / Math.max(1, lCols - 1)) - 0.014, 0.30, 0.028, 0.42, "rgba(30,20,8,0.42)");
    const spines = ["#9c3b2f", "#7a5c2a", "#3a6a3a", "#b58f3a", "#8a4a6a", "#4a5a8a", "#c07a30"];
    const nShelves = 2 + Math.min(tier, 2);
    for (let row = 0; row < nShelves; row++) {
      for (let i = 0; i < 6; i++) px(0.18 + i * 0.108, 0.36 + row * 0.10, 0.088, 0.07, spines[(i + row) % spines.length]);
    }
    for (let i = 0; i < 1 + tier; i++) {
      px(0.22 + i * 0.22, 0.66, 0.14, 0.06, "#d8c898");
      // Tête du lecteur qui se penche sur la page puis se redresse
      const nod = Math.max(0, Math.sin(now / 1100 + i * 2.1)) * 0.012;
      ctx.fillStyle = "rgba(40,24,8,0.55)"; ctx.beginPath(); ctx.arc(ox+sw*(0.29+i*0.22), oy+sh*(0.64+nod), sw*0.018, 0, Math.PI*2); ctx.fill();
    }
    px(0.44, 0.60, 0.12, 0.20, "#2e1e0a");
    return;
  }
  if (id === "universities") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "universities"); return; }
    // Pixel-art = BÂTIMENT-halle du savoir PRIMITIF (halle carrée sur socle de pierre,
    // façade à portique laissant voir un totem du savoir + emblème), registre feu/stade 0 ;
    // ombre déjà posée. Grande halle institutionnelle (distincte de l'école/académie/biblio).
    // Bâtiment fermé = zone CARRÉE (règle DA). Sprite 96×88 → hFrac 0.80. Couvre bands 0-6
    // (stade 0) ; le staging par ère procédural ci-dessous sert de repli. Repli si non chargé.
    if (propReady('universities-prop-hall')) {
      blitProp(ctx, ox, oy, sw, sh, 'universities-prop-hall', 0.5, 0.50, 0.88, 0.80);
      return;
    }
    const t2 = now || 0;

    if (band <= 3) {
      // ── ÈRE MÉDIÉVALE/RENAISSANCE — quadrangle gothique, clocher, cour herbeuse ──
      // Pelouse de la cour
      px(0.0, 0.0, 1.0, 1.0, band >= 2 ? "#a89a60" : "#9a8e58");
      // Corps principal (4 ailes autour de la cour)
      const wallCol = band >= 2 ? "#c0a870" : "#b09860";
      px(0.06, 0.12, 0.88, 0.12, wallCol); // aile nord
      px(0.06, 0.76, 0.88, 0.12, wallCol); // aile sud
      px(0.06, 0.12, 0.12, 0.76, wallCol); // aile ouest
      px(0.82, 0.12, 0.12, 0.76, wallCol); // aile est
      // Cour intérieure (herbe)
      px(0.18, 0.24, 0.64, 0.52, band >= 2 ? "#5a7830" : "#4a6a28");
      // Allées en croix dans la cour
      px(0.18, 0.48, 0.64, 0.04, "#a89460"); px(0.48, 0.24, 0.04, 0.52, "#a89460");
      // Arbre central
      ctx.fillStyle = band >= 2 ? "#2a6018" : "#1e5014";
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.50, sw*0.078, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = band >= 2 ? "#1c4a10" : "#163c0c";
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.50, sw*0.038, 0, Math.PI*2); ctx.fill();
      // Clocher (nord-centre)
      const towerCol = band >= 2 ? "#8a7040" : "#7a6038";
      px(0.44, 0.0, 0.12, 0.16, towerCol);
      px(0.42, 0.0, 0.16, 0.04, "#5a4020");
      // Aiguille du clocher
      ctx.fillStyle = band >= 2 ? "#c8a850" : "#a88840";
      ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy-sh*0.04); ctx.lineTo(ox+sw*0.46, oy+sh*0.03); ctx.lineTo(ox+sw*0.54, oy+sh*0.03); ctx.closePath(); ctx.fill();
      // Cloche (point lumineux)
      ctx.fillStyle = litGold; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.08, sw*0.028, 0, Math.PI*2); ctx.fill();
      // Fenêtres gothiques dans les ailes (en arc brisé)
      ctx.fillStyle = litWarm;
      const winY = [0.14, 0.14, 0.14]; const winX = [0.22, 0.38, 0.54, 0.70];
      for (const wx of winX) { ctx.fillRect(ox+sw*wx, oy+sh*0.14, sw*0.06, sh*0.06); ctx.beginPath(); ctx.arc(ox+sw*(wx+0.03), oy+sh*0.14, sw*0.03, Math.PI, 0); ctx.fill(); }
      // Portail principal (sud)
      px(0.44, 0.76, 0.12, 0.09, "#3a2810");
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.76, sw*0.06, Math.PI, 0); ctx.fillStyle="#3a2810"; ctx.fill();
      // Tier 1 : chapelle annexe (est)
      if (tier >= 1) {
        px(0.80, 0.28, 0.14, 0.44, "#b8a260");
        ctx.fillStyle = "#7a6030";
        ctx.beginPath(); ctx.moveTo(ox+sw*0.87, oy+sh*0.22); ctx.lineTo(ox+sw*0.94, oy+sh*0.28); ctx.lineTo(ox+sw*0.80, oy+sh*0.28); ctx.closePath(); ctx.fill();
        ctx.fillStyle = litWarm; ctx.fillRect(ox+sw*0.84, oy+sh*0.36, sw*0.06, sh*0.08);
      }
      // Tier 2 : salle de lecture avec verrière bleue (ouest)
      if (tier >= 2) {
        px(0.06, 0.28, 0.14, 0.44, "#9a8258");
        ctx.fillStyle = "rgba(100,140,200,0.38)"; ctx.fillRect(ox+sw*0.08, oy+sh*0.30, sw*0.10, sh*0.40);
        ctx.strokeStyle = "rgba(160,200,255,0.55)"; ctx.lineWidth = Math.max(0.5, sw*0.012);
        for (let li = 1; li < 4; li++) { ctx.beginPath(); ctx.moveTo(ox+sw*0.08, oy+sh*(0.30+li*0.10)); ctx.lineTo(ox+sw*0.18, oy+sh*(0.30+li*0.10)); ctx.stroke(); }
        // Lueur chaude la nuit (lampes dans la bibliothèque)
        if (night > 0.3) {
          ctx.fillStyle = `rgba(255,200,80,${(night*0.22).toFixed(2)})`;
          ctx.fillRect(ox+sw*0.08, oy+sh*0.30, sw*0.10, sh*0.40);
        }
      }

    } else if (band <= 5) {
      // ── ÈRE INDUSTRIELLE/MODERNE — campus néoclassique, bâtiments en brique ──
      const brickCol = band >= 5 ? "#8a7058" : "#9a7848";
      // Sol du campus (gris-vert)
      px(0.0, 0.0, 1.0, 1.0, band >= 5 ? "#6a7058" : "#786838");
      // Bâtiment principal (façade néoclassique)
      px(0.08, 0.16, 0.84, 0.58, brickCol);
      ctx.fillStyle = "#5a4a38"; ctx.fillRect(ox+sw*0.06, oy+sh*0.10, sw*0.88, sh*0.08);
      // Fronton triangulaire
      ctx.fillStyle = band >= 5 ? "#7a8868" : "#b89050";
      ctx.beginPath(); ctx.moveTo(ox+sw*0.08, oy+sh*0.18); ctx.lineTo(ox+sw*0.5, oy+sh*0.04); ctx.lineTo(ox+sw*0.92, oy+sh*0.18); ctx.closePath(); ctx.fill();
      // Colonnes
      ctx.fillStyle = band >= 5 ? "#c8c8b0" : "#d4c080";
      const nCols = 4 + tier;
      for (let ci = 0; ci < nCols; ci++) { ctx.fillRect(ox+sw*(0.14+ci*(0.72/(nCols-1)))-sw*0.022, oy+sh*0.18, sw*0.044, sh*0.56); }
      // Escalier d'entrée
      for (let si = 0; si < 3; si++) { px(0.28+si*0.04, 0.74-si*0.02, 0.44-si*0.08, 0.04, band>=5?"#b0a888":"#c8aa60"); }
      // Portail central
      px(0.44, 0.54, 0.12, 0.22, "#2a1e0e");
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.54, sw*0.06, Math.PI, 0); ctx.fillStyle="#2a1e0e"; ctx.fill();
      // Grilles de fenêtres
      ctx.fillStyle = litWarm;
      const fRows = tier >= 1 ? 3 : 2;
      for (let r = 0; r < fRows; r++) for (let c = 0; c < 5; c++) {
        if (c === 2 && r === fRows-1) continue; // porte centrale
        ctx.fillRect(ox+sw*(0.16+c*0.14), oy+sh*(0.22+r*0.10), sw*0.08, sh*0.07);
        ctx.beginPath(); ctx.arc(ox+sw*(0.16+c*0.14+0.04), oy+sh*(0.22+r*0.10), sw*0.04, Math.PI, 0); ctx.fill();
      }
      // Tier 1 : aile de laboratoire (droite)
      if (tier >= 1) {
        px(0.78, 0.28, 0.22, 0.46, band>=5?"#7a8060":"#8a7048");
        ctx.fillStyle = litWarm;
        for (let ri = 0; ri < 3; ri++) ctx.fillRect(ox+sw*0.82, oy+sh*(0.30+ri*0.12), sw*0.12, sh*0.08);
        // Cheminée de labo
        px(0.84, 0.14, 0.06, 0.16, "#504838");
        const smoke2 = ((t2/1100) % 1);
        ctx.fillStyle = `rgba(100,90,75,${((1-smoke2)*0.3).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(ox+sw*0.87, oy+sh*(0.12-smoke2*0.12), sw*(0.03+smoke2*0.04), 0, Math.PI*2); ctx.fill();
      }
      // Tier 2 : coupole d'observatoire (toit)
      if (tier >= 2) {
        ctx.fillStyle = band >= 5 ? "#7890a8" : "#9090b8";
        ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.04, sw*0.14, Math.PI, 0); ctx.fill();
        const domeGlow = 0.4 + 0.25*Math.abs(Math.sin(t2/900));
        ctx.strokeStyle = `rgba(160,200,255,${domeGlow.toFixed(2)})`; ctx.lineWidth = Math.max(1, sw*0.022);
        ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.04, sw*0.14, Math.PI, 0); ctx.stroke();
      }
      // Lueur nocturne
      if (night > 0.25) {
        ctx.fillStyle = `rgba(255,200,100,${(night*0.18).toFixed(2)})`;
        ctx.fillRect(ox+sw*0.08, oy+sh*0.16, sw*0.84, sh*0.58);
      }

    } else {
      // ── ÈRE FUTURISTE — campus technologique, verre et lumière ──
      const techPulse = 0.5 + 0.35*Math.abs(Math.sin(t2/800));
      // Dalle du campus (gris-bleu)
      px(0.0, 0.0, 1.0, 1.0, "#424850");
      // Grille de sol
      ctx.strokeStyle = "rgba(80,120,160,0.22)"; ctx.lineWidth = Math.max(0.5, sw*0.010);
      for (let gi = 1; gi < 5; gi++) { ctx.beginPath(); ctx.moveTo(ox+sw*gi*0.2, oy); ctx.lineTo(ox+sw*gi*0.2, oy+sh); ctx.stroke(); ctx.beginPath(); ctx.moveTo(ox, oy+sh*gi*0.2); ctx.lineTo(ox+sw, oy+sh*gi*0.2); ctx.stroke(); }
      // Tour centrale de recherche (verre bleu-gris)
      px(0.32, 0.04, 0.36, 0.78, "#2a3848");
      ctx.fillStyle = `rgba(60,130,220,${(0.12+night*0.18).toFixed(2)})`;
      ctx.fillRect(ox+sw*0.32, oy+sh*0.04, sw*0.36, sh*0.78);
      // Reflet de façade
      ctx.fillStyle = "rgba(180,210,255,0.10)"; ctx.fillRect(ox+sw*0.33, oy+sh*0.04, sw*0.08, sh*0.78);
      ctx.fillStyle = "rgba(0,0,0,0.20)"; ctx.fillRect(ox+sw*0.60, oy+sh*0.04, sw*0.08, sh*0.78);
      // Bandes vitrées horizontales (fenêtres panoramiques)
      const fRows2 = 5 + Math.min(tier, 3);
      ctx.fillStyle = litWarm;
      for (let r = 0; r < fRows2; r++) ctx.fillRect(ox+sw*0.34, oy+sh*(0.08+r*(0.64/fRows2)), sw*0.32, Math.max(1, sh*0.038));
      // Bâtiments annexes (gauche et droite)
      for (const side of [-1, 1]) {
        const bx2 = side > 0 ? 0.72 : 0.06, bw2 = 0.22;
        px(bx2, 0.32, bw2, 0.50, "#303a48");
        ctx.fillStyle = `rgba(60,120,200,${(0.08+night*0.15).toFixed(2)})`;
        ctx.fillRect(ox+sw*bx2, oy+sh*0.32, sw*bw2, sh*0.50);
        ctx.fillStyle = litWarm;
        for (let ri = 0; ri < 3; ri++) ctx.fillRect(ox+sw*(bx2+0.03), oy+sh*(0.36+ri*0.13), sw*(bw2-0.06), sh*0.07);
      }
      // Bandes LED de façade (animées)
      for (let li = 0; li < 4; li++) {
        const lAlpha = 0.3+0.35*Math.abs(Math.sin(t2/500+li*0.9));
        ctx.fillStyle = li%2===0?`rgba(60,200,255,${lAlpha.toFixed(2)})`:`rgba(100,160,255,${(lAlpha*0.7).toFixed(2)})`;
        ctx.fillRect(ox+sw*0.32, oy+sh*(0.16+li*0.16), sw*0.36, Math.max(1.5, sh*0.018));
      }
      // Antenne / pylône de recherche (sommet)
      px(0.48, 0.0, 0.04, 0.08, "#4a5870");
      ctx.fillStyle = `rgba(60,200,255,${(0.55+0.45*Math.abs(Math.sin(t2/600))).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy, Math.max(2, sw*0.05), 0, Math.PI*2); ctx.fill();
      // Tier 1 : antennes latérales
      if (tier >= 1) {
        for (const ax2 of [0.28, 0.72]) {
          px(ax2, 0.24, 0.04, 0.10, "#3a4858");
          ctx.fillStyle = `rgba(100,220,255,${(0.4+techPulse*0.4).toFixed(2)})`;
          ctx.beginPath(); ctx.arc(ox+sw*ax2, oy+sh*0.24, Math.max(1.5, sw*0.034), 0, Math.PI*2); ctx.fill();
        }
      }
      // Tier 2 : hologramme / anneau flottant
      if (tier >= 2) {
        ctx.strokeStyle = `rgba(60,220,255,${(techPulse*0.8).toFixed(2)})`; ctx.lineWidth = Math.max(1.5, sw*0.030);
        ctx.beginPath(); ctx.ellipse(ox+sw*0.5, oy+sh*0.50, sw*0.15, sh*0.055, 0, 0, Math.PI*2); ctx.stroke();
        const orbA = t2/1400;
        ctx.fillStyle = `rgba(140,240,255,${(0.55+techPulse*0.35).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(ox+sw*(0.5+Math.cos(orbA)*0.14), oy+sh*(0.50+Math.sin(orbA)*0.052), Math.max(2, sw*0.04), 0, Math.PI*2); ctx.fill();
      }
    }
    return;
  }
  if (id === "printing_houses") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "printing_houses"); return; }
    // Pixel-art = atelier de REPRODUCTION PRIMITIF (bâtiment carré, façade ouverte : cylindre-
    // sceau + tampons gravés + pots de pigment + tablettes identiques), registre feu/stade 0 ;
    // ombre déjà posée. Reproduire des marques (distinct des scribes qui écrivent à la main).
    // Bâtiment fermé = zone CARRÉE. Sprite 96×88 → hFrac 0.80. Repli = presse procédurale.
    if (propReady('printing-prop-workshop')) {
      blitProp(ctx, ox, oy, sw, sh, 'printing-prop-workshop', 0.5, 0.50, 0.88, 0.80);
      return;
    }
    // Imprimerie : grande presse mécanique animée, feuilles, encriers, cheminée industrielle
    px(0.06, 0.24, 0.88, 0.56, "#6a5030");
    ctx.fillStyle = "#3a2818";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.04, oy+sh*0.26); ctx.lineTo(ox+sw*0.5, oy+sh*0.06); ctx.lineTo(ox+sw*0.96, oy+sh*0.26); ctx.closePath(); ctx.fill();
    px(0.04, 0.22, 0.92, 0.06, "#4a3420");
    px(0.26, 0.34, 0.48, 0.30, "#3a2e20");
    px(0.32, 0.38, 0.36, 0.22, "#8a7458");
    ctx.strokeStyle = "#c0a060"; ctx.lineWidth = Math.max(2, sw*0.032);
    ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.34); ctx.lineTo(ox+sw*0.5, oy+sh*0.64); ctx.stroke();
    ctx.fillStyle = "#c0a060"; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.34, sw*0.040, 0, Math.PI*2); ctx.fill();
    const pressRot = (now / 1200) % (Math.PI * 2);
    ctx.strokeStyle = "#b09050"; ctx.lineWidth = Math.max(1.5, sw*0.024);
    ctx.beginPath(); ctx.moveTo(ox+sw*(0.5+Math.cos(pressRot)*0.15), oy+sh*(0.34+Math.sin(pressRot)*0.06)); ctx.lineTo(ox+sw*(0.5-Math.cos(pressRot)*0.15), oy+sh*(0.34-Math.sin(pressRot)*0.06)); ctx.stroke();
    const nSheets = 2 + tier;
    for (let i = 0; i < nSheets && i < 4; i++) {
      const sx2 = 0.10 + i * 0.09, sy2 = 0.54 + i * 0.04;
      px(sx2, sy2, 0.13, 0.08, "#f0e8d0");
      ctx.fillStyle = "rgba(40,28,12,0.32)";
      for (let l = 0; l < 2; l++) ctx.fillRect(ox+sw*(sx2+0.014), oy+sh*(sy2+0.016+l*0.030), sw*0.10, sh*0.010);
    }
    px(0.76, 0.38, 0.08, 0.08, "#1a0c04"); px(0.76, 0.50, 0.08, 0.08, "#1a0c04");
    if (tier >= 1) px(0.64, 0.34, 0.08, 0.14, litWarm);
    if (tier >= 2) {
      px(0.80, 0.10, 0.08, 0.20, "#3a2a18");
      const smoke = (now / 900) % 1;
      ctx.fillStyle = `rgba(80,70,58,${((1 - smoke) * 0.28).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(ox+sw*0.84, oy+sh*(0.08 - smoke * 0.16), sw*(0.04 + smoke * 0.06), 0, Math.PI*2); ctx.fill();
    }
    return;
  }
  if (id === "think_tanks") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "think_tanks"); return; }
    // Pixel-art = halle du CONSEIL STRATÉGIQUE PRIMITIF (bâtiment carré, façade ouverte :
    // grande carte du territoire au mur + table à jetons/pions + rouleaux de plans),
    // registre feu/stade 0 ; ombre déjà posée. « Des modèles pour tout » — distinct de
    // l'académie (débat)/université (apprentissage). Bâtiment fermé = zone CARRÉE. 96×88 →
    // hFrac 0.80. Repli = institut verre/acier procédural (ères hautes).
    if (propReady('think-prop-council')) {
      blitProp(ctx, ox, oy, sw, sh, 'think-prop-council', 0.5, 0.50, 0.88, 0.80);
      return;
    }
    // Institut stratégique : verre et acier, écrans holographiques, antennes, hologramme
    px(0.08, 0.18, 0.84, 0.64, "#1e2434");
    px(0.06, 0.12, 0.88, 0.08, "#2a3248");
    ctx.fillStyle = "rgba(80,140,220,0.13)"; ctx.fillRect(ox+sw*0.12, oy+sh*0.22, sw*0.76, sh*0.55);
    ctx.strokeStyle = "rgba(60,100,180,0.25)"; ctx.lineWidth = Math.max(0.5, sw*0.013);
    for (let i = 1; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(ox+sw*(0.12+i*0.152), oy+sh*0.22); ctx.lineTo(ox+sw*(0.12+i*0.152), oy+sh*0.77); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.12, oy+sh*(0.22+i*0.11)); ctx.lineTo(ox+sw*0.88, oy+sh*(0.22+i*0.11)); ctx.stroke();
    }
    const pulse = 0.35 + Math.abs(Math.sin(now / 700)) * 0.45;
    const pStr = pulse.toFixed(2);
    for (let row = 0; row < 3 + tier; row++) {
      for (let col = 0; col < 4; col++) {
        const hue = (row + col) % 3 === 0 ? `rgba(60,200,255,${pStr})` : (row + col) % 3 === 1 ? `rgba(80,255,160,${(pulse*0.7).toFixed(2)})` : `rgba(255,180,40,${(pulse*0.5).toFixed(2)})`;
        px(0.18 + col * 0.16, 0.28 + row * 0.11, 0.10, 0.06, hue);
      }
    }
    ctx.strokeStyle = "#4a5870"; ctx.lineWidth = Math.max(1, sw*0.016);
    ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.12); ctx.lineTo(ox+sw*0.5, oy+sh*0.0); ctx.stroke();
    ctx.strokeStyle = `rgba(107,182,255,${(0.5+Math.abs(Math.sin(now/600))*0.4).toFixed(2)})`; ctx.lineWidth = Math.max(1, sw*0.022);
    ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.0, sw*0.050, 0, Math.PI*2); ctx.stroke();
    if (tier >= 1) {
      ctx.strokeStyle = "#4a5870"; ctx.lineWidth = Math.max(0.5, sw*0.013);
      for (const ax2 of [0.28, 0.72]) {
        ctx.beginPath(); ctx.moveTo(ox+sw*ax2, oy+sh*0.12); ctx.lineTo(ox+sw*ax2, oy+sh*0.04); ctx.stroke();
        ctx.fillStyle = `rgba(107,182,255,${(0.4+pulse*0.4).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(ox+sw*ax2, oy+sh*0.04, Math.max(1, sw*0.028), 0, Math.PI*2); ctx.fill();
      }
    }
    if (tier >= 2) {
      ctx.strokeStyle = `rgba(60,200,255,${(pulse*0.6).toFixed(2)})`; ctx.lineWidth = Math.max(1, sw*0.022);
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.50, sw*0.12, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.50, sw*0.06, 0, Math.PI*2); ctx.stroke();
      ctx.strokeStyle = `rgba(80,255,200,${(pulse*0.5).toFixed(2)})`;
      for (let i = 0; i < 3; i++) {
        const a = now / 1000 + i * Math.PI * 2 / 3;
        ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.50); ctx.lineTo(ox+sw*(0.5+Math.cos(a)*0.11), oy+sh*(0.50+Math.sin(a)*0.07)); ctx.stroke();
      }
    }
    return;
  }
  if (id === "aqueducts") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "aqueducts"); return; }
    // Structure linéaire : spanX arches, 1 tile de haut. sw = largeur totale.
    const spanX = t.spanX || 3;
    const aw = 1 / spanX;          // fraction de sw par travée
    const pw = Math.max(0.008, aw * 0.20); // largeur relative d'un pilier

    // Soubassement
    px(0, 0.80, 1, 0.20, "#7a6a50");
    px(0, 0.78, 1, 0.04, "rgba(255,240,200,0.12)");

    // Piliers (spanX+1 piliers : un de chaque côté + un entre chaque travée)
    for (let i = 0; i <= spanX; i++) {
      const pxL = i * aw - pw / 2;
      const pxLc = Math.max(0, Math.min(1 - pw, pxL));
      px(pxLc, 0.32, pw, 0.48, "#c0aa80");
      px(pxLc, 0.32, pw * 0.30, 0.48, "rgba(255,240,200,0.22)"); // reflet
      px(pxLc, 0.78, pw, 0.04, "#d4c090");                        // chapiteau
      // Joints de maçonnerie
      ctx.fillStyle = "rgba(75,60,35,0.25)";
      for (let ji = 1; ji < 4; ji++) ctx.fillRect(ox + sw * pxLc, oy + sh * (0.32 + ji * 0.12), sw * pw, Math.max(1, sh * 0.012));
    }

    // Arches (entre chaque paire de piliers)
    for (let i = 0; i < spanX; i++) {
      const cx2 = ox + sw * ((i + 0.5) * aw);
      const archR = sw * aw * 0.44;
      const archY = oy + sh * 0.80;
      ctx.strokeStyle = "#9a8060"; ctx.lineWidth = Math.max(1, sw * aw * 0.06);
      ctx.beginPath(); ctx.arc(cx2, archY, archR, Math.PI, 0); ctx.stroke();
      // Archivolte (bordure de l'arc)
      ctx.strokeStyle = "rgba(200,180,130,0.35)"; ctx.lineWidth = Math.max(0.5, sw * aw * 0.025);
      ctx.beginPath(); ctx.arc(cx2, archY, archR * 0.82, Math.PI, 0); ctx.stroke();
    }

    // Canal sur le dessus (toute la longueur)
    px(0, 0.16, 1, 0.18, "#c8b490");  // couronnement pierre
    px(0, 0.12, 1, 0.06, "#6a5a38"); // bandeau supérieur
    px(0.015, 0.185, 0.97, 0.10, "#1e4a6e"); // eau dans le canal

    // Eau animée (deux vagues qui coulent)
    const stream = (now / 900) % 1;
    const ww = Math.min(0.35, 0.7 / spanX);
    px(0.015 + stream * (0.97 - ww), 0.200, ww, 0.065, "rgba(107,182,255,0.75)");
    px(0.015 + ((stream + 0.5) % 1) * (0.97 - ww * 0.7), 0.200, ww * 0.7, 0.065, "rgba(160,220,255,0.45)");

    // Reflets dans l'eau (scintillements statiques)
    ctx.fillStyle = `rgba(200,240,255,${(0.25 + 0.15 * Math.sin(now / 400)).toFixed(2)})`;
    for (let i = 0; i < spanX; i++) ctx.fillRect(ox + sw * ((i + 0.3) * aw + 0.015), oy + sh * 0.205, Math.max(1, sw * aw * 0.1), Math.max(1, sh * 0.025));

    return;
  }
  if (id === "watch") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "watch"); return; }
    // Veilleurs : tour de guet qui évolue du poste de feu primitif à la tourelle de surveillance
    const ei2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
    if (ei2 >= 11) {
      // Tourelle de surveillance moderne
      px(0.38, 0.68, 0.24, 0.22, "#2a3040"); // base
      px(0.30, 0.20, 0.40, 0.50, "#3a4050"); // corps
      px(0.26, 0.16, 0.48, 0.06, "#2a3040"); // toit plat
      ctx.fillStyle = `rgba(80,180,255,${(0.35+night*0.5).toFixed(2)})`;
      ctx.fillRect(ox+sw*0.34, oy+sh*0.24, sw*0.32, sh*0.26); // vitre
      const camA = (now/2200)%(Math.PI*2);
      ctx.strokeStyle = "#8a9090"; ctx.lineWidth = Math.max(1,sw*0.028);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.18); ctx.lineTo(ox+sw*(0.5+Math.cos(camA)*0.15), oy+sh*(0.18+Math.sin(camA)*0.06)); ctx.stroke();
      ctx.fillStyle = "#4a5a6a"; ctx.beginPath(); ctx.arc(ox+sw*(0.5+Math.cos(camA)*0.15), oy+sh*(0.18+Math.sin(camA)*0.06), Math.max(2,sw*0.042), 0, Math.PI*2); ctx.fill();
      const sA = 0.4+0.3*Math.sin(now/400);
      px(0.36, 0.27, 0.12, 0.07, `rgba(60,200,255,${sA.toFixed(2)})`);
      px(0.52, 0.27, 0.12, 0.07, `rgba(80,255,120,${(sA*0.8).toFixed(2)})`);
      px(0.36, 0.38, 0.28, 0.08, `rgba(255,180,40,${(sA*0.6).toFixed(2)})`);
      if (night > 0.3) {
        ctx.strokeStyle = `rgba(255,255,200,${(night*0.32).toFixed(2)})`; ctx.lineWidth = Math.max(1,sw*0.04);
        ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.16); ctx.lineTo(ox+sw*(0.5+Math.cos(camA)*0.55), oy+sh*(0.16+Math.sin(camA)*0.38)); ctx.stroke();
      }
    } else if (tier >= 1) {
      // Tour de pierre fortifiée avec créneaux
      px(0.30, 0.22, 0.40, 0.56, "#8a8070");
      px(0.26, 0.58, 0.48, 0.22, "#7a7060");
      for (let i=0; i<3; i++) px(0.30+i*0.14, 0.16, 0.09, 0.08, "#8a8070");
      ctx.fillStyle = "#1a1208"; ctx.fillRect(ox+sw*0.36, oy+sh*0.30, sw*0.07, sh*0.14); ctx.fillRect(ox+sw*0.57, oy+sh*0.30, sw*0.07, sh*0.14);
      const glow = 0.5+0.4*Math.sin(now/600);
      ctx.fillStyle = `rgba(255,200,80,${(glow*(0.5+night*0.5)).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.19, sw*0.11, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#c09030"; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.19, sw*0.065, 0, Math.PI*2); ctx.fill();
    } else {
      // Tour de bois avec feu de signal
      px(0.40, 0.30, 0.20, 0.50, "#6a4a20");
      px(0.28, 0.58, 0.44, 0.12, "#5a3a18");
      ctx.strokeStyle = "#5a3a18"; ctx.lineWidth = Math.max(2,sw*0.04);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.28, oy+sh*0.70); ctx.lineTo(ox+sw*0.42, oy+sh*0.30); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.72, oy+sh*0.70); ctx.lineTo(ox+sw*0.58, oy+sh*0.30); ctx.stroke();
      const f1=0.5+0.5*Math.sin(now/180), f2=0.5+0.5*Math.sin(now/150+1.2);
      ctx.fillStyle = `rgba(255,80,8,${(0.65+f1*0.35).toFixed(2)})`;
      ctx.beginPath(); ctx.moveTo(ox+sw*0.42, oy+sh*0.32); ctx.quadraticCurveTo(ox+sw*0.36, oy+sh*(0.17-f1*0.06), ox+sw*0.5, oy+sh*(0.11-f1*0.04)); ctx.quadraticCurveTo(ox+sw*0.64, oy+sh*(0.17-f2*0.05), ox+sw*0.58, oy+sh*0.32); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(255,200,20,${(0.6+f2*0.3).toFixed(2)})`;
      ctx.beginPath(); ctx.moveTo(ox+sw*0.46, oy+sh*0.32); ctx.quadraticCurveTo(ox+sw*0.44, oy+sh*(0.21-f2*0.08), ox+sw*0.5, oy+sh*(0.15-f1*0.05)); ctx.quadraticCurveTo(ox+sw*0.56, oy+sh*(0.21-f2*0.06), ox+sw*0.54, oy+sh*0.32); ctx.closePath(); ctx.fill();
      if (night > 0.2) { const hg=ctx.createRadialGradient(ox+sw*0.5,oy+sh*0.22,0,ox+sw*0.5,oy+sh*0.22,sw*0.3); hg.addColorStop(0,`rgba(255,150,20,${(0.18*night).toFixed(2)})`); hg.addColorStop(1,"rgba(255,80,5,0)"); ctx.fillStyle=hg; ctx.beginPath(); ctx.arc(ox+sw*0.5,oy+sh*0.22,sw*0.3,0,Math.PI*2); ctx.fill(); }
    }
    return;
  }
  if (id === "sewers") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "sewers"); return; }
    // Égouts : canaux ouverts → réseau de pierres → conduites modernes
    const ei2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
    const band2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 2;
    if (ei2 >= 11) {
      px(0.06, 0.44, 0.88, 0.40, "#2a3040");
      ctx.strokeStyle = "#4a5870"; ctx.lineWidth = Math.max(2,sw*0.06);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.06, oy+sh*0.56); ctx.lineTo(ox+sw*0.94, oy+sh*0.56); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.06, oy+sh*0.72); ctx.lineTo(ox+sw*0.94, oy+sh*0.72); ctx.stroke();
      for (let i=0; i<3; i++) { const vx=ox+sw*(0.25+i*0.25); ctx.fillStyle="#6a7a8a"; ctx.fillRect(vx-sw*0.04,oy+sh*0.50,sw*0.08,sh*0.14); ctx.fillStyle="#3a4858"; ctx.fillRect(vx-sw*0.016,oy+sh*0.62,sw*0.032,sh*0.10); }
      const sA=0.5+0.3*Math.sin(now/500);
      for (let i=0; i<4; i++) px(0.16+i*0.2, 0.44, 0.07, 0.04, `rgba(80,220,100,${(sA*(i%2===0?1:0.6)).toFixed(2)})`);
      const str=(now/700)%1; ctx.fillStyle=`rgba(60,180,255,${(0.4+sA*0.2).toFixed(2)})`; ctx.fillRect(ox+sw*(0.08+str*0.55),oy+sh*0.545,sw*0.28,sh*0.028);
      px(0.08, 0.32, 0.28, 0.10, "#1e2434");
      for (let i=0; i<3; i++) ctx.fillRect(ox+sw*(0.11+i*0.08), oy+sh*0.35, sw*0.05, sh*0.04);
    } else if (band2 >= 3) {
      px(0.06, 0.46, 0.88, 0.30, "#3a3020"); px(0.10, 0.56, 0.80, 0.16, "#2a2015");
      const nG=2+tier;
      for (let i=0; i<nG; i++) {
        const gx2=0.18+i*(0.64/Math.max(1,nG-1));
        px(gx2-0.042, 0.45, 0.084, 0.04, "#1a1208");
        ctx.strokeStyle="#3a3020"; ctx.lineWidth=Math.max(0.5,sw*0.013);
        for (let j=0; j<3; j++) ctx.strokeRect(ox+sw*(gx2-0.038+j*0.026),oy+sh*0.45,sw*0.026,sh*0.04);
        const ph=((now/1400)+i*0.4)%1;
        ctx.fillStyle=`rgba(190,190,170,${((1-ph)*0.14).toFixed(2)})`; ctx.beginPath(); ctx.arc(ox+sw*gx2,oy+sh*(0.43-ph*0.22),sw*(0.035+ph*0.06),0,Math.PI*2); ctx.fill();
      }
      px(0.06, 0.60, 0.88, 0.08, "#1e3050");
      const str2=(now/900)%1; ctx.fillStyle="rgba(80,150,200,0.55)"; ctx.fillRect(ox+sw*(0.08+str2*0.60),oy+sh*0.62,sw*0.20,sh*0.04);
    } else {
      px(0.06, 0.48, 0.88, 0.32, "#4a3820");
      px(0.10, 0.54, 0.32, 0.18, "#1e2818"); px(0.58, 0.54, 0.32, 0.18, "#1e2818");
      ctx.fillStyle=`rgba(50,120,80,${(0.4+0.15*Math.sin(now/800)).toFixed(2)})`; ctx.fillRect(ox+sw*0.11,oy+sh*0.56,sw*0.30,sh*0.14); ctx.fillRect(ox+sw*0.59,oy+sh*0.56,sw*0.30,sh*0.14);
      for (let i=0; i<3; i++) { const ph=((now/1800)+i*0.35)%1; ctx.fillStyle=`rgba(100,180,120,${((1-ph)*0.25).toFixed(2)})`; ctx.beginPath(); ctx.arc(ox+sw*(0.20+i*0.10),oy+sh*(0.60-ph*0.16),sw*(0.02+ph*0.03),0,Math.PI*2); ctx.fill(); }
    }
    return;
  }
  if (id === "bureaucracy") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "bureaucracy"); return; }
    // Bureaucratie : salle des scribes → guichets → open space moderne
    const ei2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
    if (ei2 >= 11) {
      px(0.06, 0.18, 0.88, 0.64, "#3a4050"); px(0.06, 0.12, 0.88, 0.08, "#2a3040");
      ctx.fillStyle="rgba(100,150,200,0.12)"; ctx.fillRect(ox+sw*0.10,oy+sh*0.22,sw*0.80,sh*0.56);
      ctx.strokeStyle="rgba(80,110,160,0.28)"; ctx.lineWidth=Math.max(0.5,sw*0.012);
      for (let i=1; i<4; i++) { ctx.beginPath(); ctx.moveTo(ox+sw*(0.10+i*0.20),oy+sh*0.22); ctx.lineTo(ox+sw*(0.10+i*0.20),oy+sh*0.78); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(ox+sw*0.10,oy+sh*0.50); ctx.lineTo(ox+sw*0.90,oy+sh*0.50); ctx.stroke();
      for (let i=0; i<4; i++) { ctx.fillStyle="rgba(50,65,90,0.65)"; ctx.beginPath(); ctx.arc(ox+sw*(0.20+i*0.20),oy+sh*0.37,sw*0.038,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(ox+sw*(0.20+i*0.20),oy+sh*0.64,sw*0.038,0,Math.PI*2); ctx.fill(); }
      const sA=0.35+0.25*Math.sin(now/600);
      for (let i=0; i<4; i++) px(0.13+i*0.20, 0.31, 0.12, 0.06, `rgba(80,160,255,${(sA*(i%3===0?1:0.6)).toFixed(2)})`);
      px(0.36, 0.06, 0.28, 0.08, "#d4a017");
    } else if (ei2 >= 5) {
      px(0.08, 0.24, 0.84, 0.54, "#c9a84c"); px(0.06, 0.16, 0.88, 0.10, "#6a4a10");
      const nW=2+Math.min(tier,2);
      for (let i=0; i<nW; i++) {
        const wx2=0.16+i*(0.68/Math.max(1,nW-1));
        px(wx2-0.06, 0.56, 0.12, 0.04, "#b8904a");
        ctx.fillStyle="rgba(40,25,8,0.55)"; ctx.beginPath(); ctx.arc(ox+sw*wx2,oy+sh*0.49,sw*0.026,0,Math.PI*2); ctx.fill();
        px(wx2-0.04, 0.51, 0.08, 0.04, "#e8dcc0");
      }
      const stampA=0.3+0.4*Math.abs(Math.sin(now/800));
      ctx.fillStyle=`rgba(180,40,20,${stampA.toFixed(2)})`; ctx.beginPath(); ctx.arc(ox+sw*0.5,oy+sh*0.42,sw*0.06,0,Math.PI*2); ctx.fill();
      px(0.33, 0.12, 0.34, 0.06, "#d4a017");
      px(0.44, 0.64, 0.12, 0.18, "#2a1a08");
      for (let i=0; i<2+tier; i++) px(0.17+i*0.18, 0.32, 0.10, 0.08, litWarm);
    } else {
      px(0.08, 0.28, 0.84, 0.50, "#8a6830");
      ctx.fillStyle="#5a3e18"; ctx.beginPath(); ctx.moveTo(ox+sw*0.06,oy+sh*0.30); ctx.lineTo(ox+sw*0.5,oy+sh*0.12); ctx.lineTo(ox+sw*0.94,oy+sh*0.30); ctx.closePath(); ctx.fill();
      const nR=1+tier;
      for (let row=0; row<nR&&row<3; row++) for (let i=0; i<4; i++) { px(0.18+i*0.16,0.38+row*0.10,0.12,0.07,"#d4c090"); ctx.strokeStyle="#6a4a10"; ctx.lineWidth=Math.max(0.5,sw*0.012); ctx.beginPath(); ctx.moveTo(ox+sw*(0.19+i*0.16),oy+sh*(0.38+row*0.10)); ctx.lineTo(ox+sw*(0.19+i*0.16),oy+sh*(0.38+row*0.10+0.07)); ctx.stroke(); }
      px(0.44, 0.62, 0.12, 0.18, "#1e1006");
    }
    return;
  }
  if (id === "courthouses") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "courthouses"); return; }
    // Tribunaux : cercle des anciens → tribunal à colonnes → palais de justice
    const ei2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
    const band2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 2;
    // Sigle de justice : balance STATIQUE sur médaillon sombre — lisible de
    // loin, sans animation (remplace l'ancienne balance fil-de-fer oscillante).
    const drawScalesEmblem = (cxr, cyr, u) => {
      const bx = ox + sw * cxr, by = oy + sh * cyr, r2 = sw * u;
      ctx.fillStyle = "rgba(38,28,14,0.9)";
      ctx.beginPath(); ctx.arc(bx, by, r2 * 1.55, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#d4a017"; ctx.lineWidth = Math.max(0.8, sw * 0.018);
      ctx.beginPath(); ctx.arc(bx, by, r2 * 1.55, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "#e8b820"; ctx.lineWidth = Math.max(1, sw * 0.028); ctx.lineCap = "round";
      // Mât, fléau, socle
      ctx.beginPath(); ctx.moveTo(bx, by - r2 * 0.9); ctx.lineTo(bx, by + r2 * 0.8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx - r2, by - r2 * 0.55); ctx.lineTo(bx + r2, by - r2 * 0.55); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx - r2 * 0.5, by + r2 * 0.8); ctx.lineTo(bx + r2 * 0.5, by + r2 * 0.8); ctx.stroke();
      // Chaînes
      ctx.lineWidth = Math.max(0.7, sw * 0.014);
      ctx.beginPath(); ctx.moveTo(bx - r2, by - r2 * 0.55); ctx.lineTo(bx - r2, by + r2 * 0.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx + r2, by - r2 * 0.55); ctx.lineTo(bx + r2, by + r2 * 0.1); ctx.stroke();
      ctx.lineCap = "butt";
      // Coupelles pleines
      ctx.fillStyle = "#e8b820";
      ctx.beginPath(); ctx.arc(bx - r2, by + r2 * 0.1, r2 * 0.42, 0, Math.PI, false); ctx.fill();
      ctx.beginPath(); ctx.arc(bx + r2, by + r2 * 0.1, r2 * 0.42, 0, Math.PI, false); ctx.fill();
    };
    if (ei2 >= 11) {
      px(0.06, 0.16, 0.88, 0.66, "#d8d0b8");
      ctx.fillStyle="#c8c0a0"; ctx.beginPath(); ctx.moveTo(ox+sw*0.04,oy+sh*0.18); ctx.lineTo(ox+sw*0.5,oy+sh*0.02); ctx.lineTo(ox+sw*0.96,oy+sh*0.18); ctx.closePath(); ctx.fill();
      px(0.04, 0.15, 0.92, 0.04, "#a0906a");
      ctx.fillStyle="rgba(80,140,220,0.16)"; ctx.fillRect(ox+sw*0.28,oy+sh*0.22,sw*0.44,sh*0.44);
      ctx.strokeStyle="rgba(180,200,240,0.38)"; ctx.lineWidth=Math.max(0.5,sw*0.016);
      for (let i=1; i<4; i++) { ctx.beginPath(); ctx.moveTo(ox+sw*(0.28+i*0.11),oy+sh*0.22); ctx.lineTo(ox+sw*(0.28+i*0.11),oy+sh*0.66); ctx.stroke(); }
      drawScalesEmblem(0.5, 0.36, 0.085);
      const nC=4+Math.min(tier,2); for (let i=0; i<nC; i++) px(0.09+i*(0.82/Math.max(1,nC-1))-0.016,0.18,0.032,0.62,"rgba(20,15,8,0.36)");
      px(0.44, 0.70, 0.12, 0.14, "#2a1a08");
    } else if (band2 >= 2) {
      px(0.08, 0.28, 0.84, 0.50, "#d4c5a0");
      ctx.fillStyle="#b8a882"; ctx.beginPath(); ctx.moveTo(ox+sw*0.06,oy+sh*0.30); ctx.lineTo(ox+sw*0.5,oy+sh*0.10); ctx.lineTo(ox+sw*0.94,oy+sh*0.30); ctx.closePath(); ctx.fill();
      const nC=3+Math.min(tier,2); for (let i=0; i<nC; i++) px(0.13+i*(0.74/Math.max(1,nC-1))-0.018,0.30,0.036,0.44,"rgba(30,20,8,0.40)");
      drawScalesEmblem(0.5, 0.47, 0.08);
      px(0.44, 0.62, 0.12, 0.18, "#2a1a08");
    } else {
      px(0.0, 0.48, 1.0, 0.52, "#2e2416");
      for (let i=0; i<5+tier; i++) { const a=(i/(5+tier))*Math.PI*2; ctx.fillStyle="#7a6848"; ctx.beginPath(); ctx.ellipse(ox+sw*(0.5+Math.cos(a)*0.34),oy+sh*(0.65+Math.sin(a)*0.20),sw*0.048,sh*0.038,0,0,Math.PI*2); ctx.fill(); }
      for (let i=0; i<3; i++) { const a=-Math.PI/2+(i-1)*0.8; ctx.fillStyle="rgba(40,25,8,0.65)"; ctx.beginPath(); ctx.arc(ox+sw*(0.5+Math.cos(a)*0.20),oy+sh*(0.65+Math.sin(a)*0.12),sw*0.030,0,Math.PI*2); ctx.fill(); }
      ctx.strokeStyle="#9a7848"; ctx.lineWidth=Math.max(1,sw*0.024); ctx.beginPath(); ctx.moveTo(ox+sw*0.5,oy+sh*0.38); ctx.lineTo(ox+sw*0.5,oy+sh*0.65); ctx.stroke();
      ctx.fillStyle="#d4a017"; ctx.beginPath(); ctx.arc(ox+sw*0.5,oy+sh*0.38,sw*0.04,0,Math.PI*2); ctx.fill();
      const f1=0.5+0.5*Math.sin(now/180);
      ctx.fillStyle=`rgba(255,120,10,${(0.5+f1*0.3).toFixed(2)})`; ctx.beginPath(); ctx.moveTo(ox+sw*0.46,oy+sh*0.65); ctx.quadraticCurveTo(ox+sw*0.42,oy+sh*(0.52-f1*0.05),ox+sw*0.5,oy+sh*(0.47-f1*0.04)); ctx.quadraticCurveTo(ox+sw*0.58,oy+sh*(0.52-f1*0.04),ox+sw*0.54,oy+sh*0.65); ctx.closePath(); ctx.fill();
    }
    return;
  }
  if (id === "public_works") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "public_works"); return; }
    // Grands travaux : chantier avec outils → grue → engins modernes
    const ei2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
    if (ei2 >= 11) {
      // Engins de construction modernes
      px(0.06, 0.62, 0.88, 0.22, "#5a5040"); // sol chantier
      // Grue mécanique moderne (jaune)
      px(0.56, 0.18, 0.06, 0.54, "#d4a020"); // mât vertical
      ctx.strokeStyle = "#d4a020"; ctx.lineWidth = Math.max(2, sw * 0.04);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.59, oy+sh*0.22); ctx.lineTo(ox+sw*0.90, oy+sh*0.18); ctx.stroke(); // bras
      ctx.beginPath(); ctx.moveTo(ox+sw*0.59, oy+sh*0.22); ctx.lineTo(ox+sw*0.34, oy+sh*0.30); ctx.stroke(); // contrepoids
      const bob2 = Math.sin(now/800)*sh*0.06;
      px(0.82, 0.20, 0.05, 0.50+bob2/sh, "#3a3020"); // câble
      px(0.76, 0.64+bob2/sh, 0.18, 0.10, "#a89070"); // charge suspendue
      // Engin de terrassement (foreground)
      px(0.10, 0.66, 0.28, 0.14, "#c08020"); // bulldozer
      px(0.08, 0.72, 0.30, 0.08, "#7a6030"); // chenilles
      // Matériaux empilés
      for (let i=0; i<3; i++) px(0.16+i*0.10, 0.56, 0.08, 0.08, i%2===0?"#b8a882":"#7a6040");
    } else if (tier >= 1) {
      // Grue à poulie + échafaudages
      px(0.10, 0.62, 0.80, 0.16, "#b8a882"); // sol/fondations
      for (let i=0; i<4; i++) px(0.18+i*0.16, 0.42, 0.04, 0.32, "#6a4a10"); // piliers
      ctx.strokeStyle="#6a4a10"; ctx.lineWidth=Math.max(1,sw*0.030);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.22,oy+sh*0.40); ctx.lineTo(ox+sw*0.78,oy+sh*0.40); ctx.lineTo(ox+sw*0.64,oy+sh*0.24); ctx.stroke();
      const bob3=Math.sin(now/700)*sh*0.028;
      px(0.62, 0.26, 0.036, 0.26+bob3/sh, "#6a4a10");
      px(0.54, 0.54+bob3/sh, 0.18, 0.10, "#b8a882");
      px(0.20, 0.52, 0.18, 0.08, "#b8a882");
      // Ouvriers
      for (let i=0; i<2; i++) { ctx.fillStyle="rgba(40,25,8,0.65)"; ctx.beginPath(); ctx.arc(ox+sw*(0.28+i*0.22),oy+sh*0.58,sw*0.025,0,Math.PI*2); ctx.fill(); }
    } else {
      // Constructeurs primitifs avec paniers et pelles
      px(0.08, 0.58, 0.84, 0.18, "#7a6040"); // sol
      // Blocs de pierre en cours de pose
      for (let i=0; i<3; i++) px(0.14+i*0.22, 0.44, 0.18, 0.16, "#b8a882");
      // Ouvriers (silhouettes) — la pioche se lève et retombe en cadence
      for (let i=0; i<2+tier; i++) {
        ctx.fillStyle="rgba(50,30,10,0.65)"; ctx.beginPath(); ctx.arc(ox+sw*(0.24+i*0.20),oy+sh*0.52,sw*0.026,0,Math.PI*2); ctx.fill();
        const dig = Math.abs(Math.sin(now / 560 + i * 1.4));
        ctx.strokeStyle="#5a3818"; ctx.lineWidth=Math.max(1,sw*0.018);
        ctx.beginPath(); ctx.moveTo(ox+sw*(0.24+i*0.20),oy+sh*0.48); ctx.lineTo(ox+sw*(0.30+i*0.20),oy+sh*(0.60-dig*0.08)); ctx.stroke();
      }
      // Corde tendue (palan primitif)
      ctx.strokeStyle="#8a6830"; ctx.lineWidth=Math.max(1,sw*0.018);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.20,oy+sh*0.30); ctx.lineTo(ox+sw*0.78,oy+sh*0.26); ctx.lineTo(ox+sw*0.72,oy+sh*0.46); ctx.stroke();
    }
    return;
  }
  if (id === "ministries") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "ministries"); return; }
    // Ministères : salle du conseil → palais → ministère moderne
    const ei2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
    if (ei2 >= 11) {
      // Tour administrative moderne
      px(0.16, 0.08, 0.68, 0.76, "#2a3040"); px(0.14, 0.04, 0.72, 0.06, "#3a4258");
      ctx.fillStyle="rgba(80,140,220,0.14)"; ctx.fillRect(ox+sw*0.20,oy+sh*0.12,sw*0.60,sh*0.66);
      ctx.strokeStyle="rgba(60,100,180,0.24)"; ctx.lineWidth=Math.max(0.5,sw*0.013);
      for (let i=1; i<4; i++) { ctx.beginPath(); ctx.moveTo(ox+sw*(0.20+i*0.15),oy+sh*0.12); ctx.lineTo(ox+sw*(0.20+i*0.15),oy+sh*0.78); ctx.stroke(); }
      for (let i=1; i<6; i++) { ctx.beginPath(); ctx.moveTo(ox+sw*0.20,oy+sh*(0.12+i*0.11)); ctx.lineTo(ox+sw*0.80,oy+sh*(0.12+i*0.11)); ctx.stroke(); }
      for (let row=0; row<3+tier; row++) for (let col=0; col<4; col++) px(0.22+col*0.15, 0.16+row*0.11, 0.09, 0.06, litWarm);
      // Drapeaux
      for (const fx of [0.20, 0.76]) { ctx.strokeStyle="#6a5060"; ctx.lineWidth=Math.max(1,sw*0.016); ctx.beginPath(); ctx.moveTo(ox+sw*fx,oy+sh*0.04); ctx.lineTo(ox+sw*fx,oy-sh*0.06); ctx.stroke(); ctx.fillStyle="#c43a3a"; ctx.beginPath(); ctx.moveTo(ox+sw*fx,oy-sh*0.06); ctx.lineTo(ox+sw*(fx+0.06),oy-sh*0.02); ctx.lineTo(ox+sw*fx,oy+sh*0.02); ctx.closePath(); ctx.fill(); }
    } else if (ei2 >= 5) {
      // Grand palais avec colonnes et drapeaux
      px(0.06, 0.22, 0.88, 0.56, "#d4c5a0"); px(0.14, 0.14, 0.72, 0.10, "#6a4a10");
      px(0.38, 0.12, 0.24, 0.68, "#c9a84c"); // tour centrale
      const nC=4+Math.min(tier,2); for (let i=0; i<nC; i++) px(0.10+i*(0.80/Math.max(1,nC-1))-0.016,0.22,0.032,0.54,"rgba(30,20,8,0.34)");
      for (let row=0; row<3+tier; row++) for (let col=0; col<4; col++) px(0.16+col*0.18, 0.32+row*0.09, 0.08, 0.048, litWarm);
      for (const fx of [0.24, 0.70]) { ctx.strokeStyle="#6a4060"; ctx.lineWidth=Math.max(1,sw*0.018); ctx.beginPath(); ctx.moveTo(ox+sw*fx,oy+sh*0.14); ctx.lineTo(ox+sw*fx,oy+sh*0.0); ctx.stroke(); ctx.fillStyle="#b43a2f"; ctx.beginPath(); ctx.moveTo(ox+sw*fx,oy+sh*0.0); ctx.lineTo(ox+sw*(fx+0.07),oy+sh*0.05); ctx.lineTo(ox+sw*fx,oy+sh*0.10); ctx.closePath(); ctx.fill(); }
    } else {
      // Salle du conseil primitif : grande table ronde, sièges
      px(0.08, 0.28, 0.84, 0.52, "#8a7030");
      ctx.fillStyle="#6a4a10"; ctx.beginPath(); ctx.moveTo(ox+sw*0.06,oy+sh*0.30); ctx.lineTo(ox+sw*0.5,oy+sh*0.10); ctx.lineTo(ox+sw*0.94,oy+sh*0.30); ctx.closePath(); ctx.fill();
      // Table du conseil (ronde)
      ctx.fillStyle="#b89040"; ctx.beginPath(); ctx.ellipse(ox+sw*0.5,oy+sh*0.58,sw*0.24,sh*0.16,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="#6a4a10"; ctx.beginPath(); ctx.ellipse(ox+sw*0.5,oy+sh*0.58,sw*0.16,sh*0.10,0,0,Math.PI*2); ctx.fill();
      // Conseillers assis
      for (let i=0; i<4+tier; i++) { const a=(i/(4+tier))*Math.PI*2; ctx.fillStyle="rgba(40,24,8,0.65)"; ctx.beginPath(); ctx.arc(ox+sw*(0.5+Math.cos(a)*0.28),oy+sh*(0.58+Math.sin(a)*0.18),sw*0.026,0,Math.PI*2); ctx.fill(); }
      // Trône / siège d'honneur
      px(0.44, 0.32, 0.12, 0.14, "#d4a017");
    }
    return;
  }
  if (id === "archive_grids") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "archive_grids"); return; }
    // Réseaux d'archives : rayonnages → salle des archives → data center
    const ei2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
    if (ei2 >= 10) {
      // Data center : tours de serveurs, flux de données
      px(0.06, 0.16, 0.88, 0.70, "#1e2434");
      px(0.06, 0.10, 0.88, 0.08, "#2a3248");
      const nRacks = 3 + Math.min(tier, 2);
      for (let i=0; i<nRacks; i++) {
        const rx2=0.12+i*(0.76/Math.max(1,nRacks-1));
        px(rx2-0.06, 0.20, 0.12, 0.58, "#0e1624"); // rack
        px(rx2-0.055, 0.22, 0.11, 0.04, "#1a2a3a"); // unité
        const rA=0.4+0.3*Math.sin(now/400+i*1.1);
        for (let j=0; j<5; j++) px(rx2-0.04, 0.27+j*0.09, 0.08, 0.04, `rgba(${j%2===0?"80,220,100":"60,180,255"},${(rA*(0.5+j*0.1)).toFixed(2)})`);
      }
      const pulse2=0.35+Math.abs(Math.sin(now/700))*0.45;
      ctx.strokeStyle=`rgba(107,182,255,${pulse2.toFixed(2)})`; ctx.lineWidth=Math.max(1,sw*0.020);
      for (let i=0; i<nRacks-1; i++) {
        const x1=ox+sw*(0.12+i*(0.76/Math.max(1,nRacks-1))), x2=ox+sw*(0.12+(i+1)*(0.76/Math.max(1,nRacks-1)));
        ctx.beginPath(); ctx.moveTo(x1,oy+sh*0.50); ctx.lineTo(x2,oy+sh*0.50); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1,oy+sh*0.60); ctx.lineTo(x2,oy+sh*0.60); ctx.stroke();
      }
      // Antenne de transmission
      ctx.strokeStyle="#4a5870"; ctx.lineWidth=Math.max(1,sw*0.016);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.5,oy+sh*0.10); ctx.lineTo(ox+sw*0.5,oy); ctx.stroke();
      ctx.fillStyle=`rgba(107,182,255,${(0.5+Math.abs(Math.sin(now/600))*0.4).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(ox+sw*0.5,oy,Math.max(2,sw*0.042),0,Math.PI*2); ctx.fill();
    } else {
      // Salle des archives physiques : rangées de rayonnages
      px(0.06, 0.22, 0.88, 0.62, "#5a4828");
      ctx.fillStyle="#3a2e18"; ctx.beginPath(); ctx.moveTo(ox+sw*0.04,oy+sh*0.24); ctx.lineTo(ox+sw*0.5,oy+sh*0.08); ctx.lineTo(ox+sw*0.96,oy+sh*0.24); ctx.closePath(); ctx.fill();
      const nS=2+Math.min(tier,2);
      for (let row=0; row<nS; row++) {
        px(0.10, 0.32+row*0.14, 0.80, 0.10, "#3a2c18"); // étagère
        const spines2=["#9c3b2f","#7a5c2a","#3a6a3a","#b58f3a","#8a4a6a","#4a5a8a"];
        for (let i=0; i<6; i++) px(0.14+i*0.12, 0.33+row*0.14, 0.10, 0.08, spines2[i%spines2.length]);
      }
      // Archiviste
      ctx.fillStyle="rgba(40,24,8,0.60)"; ctx.beginPath(); ctx.arc(ox+sw*0.5,oy+sh*0.70,sw*0.026,0,Math.PI*2); ctx.fill();
      px(0.42, 0.74, 0.16, 0.08, "#e0d4aa"); // document
      px(0.44, 0.64, 0.12, 0.20, "#1e1408");
    }
    return;
  }
  if (id === "ruin_architects") {
    if (band >= 7) { cosmicSavoir(ctx, ox, oy, sw, sh, px, band, now, "ruin_architects"); return; }
    // Architectes des ruines : vestige en ruine + architectes + plans évolutifs
    // Ruine partielle (mur effondré)
    px(0.08, 0.54, 0.84, 0.24, "#4a4030");
    px(0.12, 0.28, 0.38, 0.32, "#5a5040"); // pan de mur gauche debout
    px(0.14, 0.22, 0.34, 0.08, "#3a3428"); // sommet effondré
    // Décombres
    for (let i=0; i<3; i++) { ctx.fillStyle=["#6a5a44","#5a4a38","#4a3c2c"][i]; ctx.beginPath(); ctx.ellipse(ox+sw*(0.54+i*0.12),oy+sh*(0.60-i*0.04),sw*(0.07-i*0.01),sh*(0.05-i*0.008),i*0.4,0,Math.PI*2); ctx.fill(); }
    // Plan / blueprint lumineux
    const bpA = 0.4+0.25*Math.sin(now/700);
    px(0.52, 0.26, 0.36, 0.24, `rgba(30,60,120,${bpA.toFixed(2)})`);
    ctx.strokeStyle=`rgba(120,180,255,${(bpA*0.8).toFixed(2)})`; ctx.lineWidth=Math.max(0.5,sw*0.014);
    ctx.beginPath(); ctx.rect(ox+sw*0.54,oy+sh*0.28,sw*0.32,sh*0.20); ctx.stroke();
    for (let i=1; i<3; i++) { ctx.beginPath(); ctx.moveTo(ox+sw*(0.54+i*0.11),oy+sh*0.28); ctx.lineTo(ox+sw*(0.54+i*0.11),oy+sh*0.48); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(ox+sw*0.54,oy+sh*0.38); ctx.lineTo(ox+sw*0.86,oy+sh*0.38); ctx.stroke();
    // Architectes qui étudient
    const nArch=1+tier;
    for (let i=0; i<nArch&&i<3; i++) {
      ctx.fillStyle="rgba(50,35,15,0.70)"; ctx.beginPath(); ctx.arc(ox+sw*(0.18+i*0.22),oy+sh*0.52,sw*0.028,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle="#8a7040"; ctx.lineWidth=Math.max(0.5,sw*0.016);
      ctx.beginPath(); ctx.moveTo(ox+sw*(0.18+i*0.22),oy+sh*0.48); ctx.lineTo(ox+sw*(0.24+i*0.22),oy+sh*0.60); ctx.stroke(); // outil/règle
    }
    // Tier 2+ : échafaudages de restauration
    if (tier >= 2) {
      ctx.strokeStyle="rgba(160,120,60,0.55)"; ctx.lineWidth=Math.max(1,sw*0.022);
      for (let i=0; i<3; i++) { ctx.beginPath(); ctx.moveTo(ox+sw*(0.14+i*0.10),oy+sh*0.28); ctx.lineTo(ox+sw*(0.14+i*0.10),oy+sh*0.54); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(ox+sw*0.12,oy+sh*0.40); ctx.lineTo(ox+sw*0.36,oy+sh*0.40); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.12,oy+sh*0.50); ctx.lineTo(ox+sw*0.36,oy+sh*0.50); ctx.stroke();
    }
    return;
  }
  if (drawCityEngineSprite({ ctx, id, tier, litWarm, litGold, ox, oy, sw, sh, px, strokeRect, now, band, ei, gw: t.spanX || 1, gh: t.spanY || 1 })) return;

}

// Wrapper : sprite + médaillon-emblème en surimpression (coin haut-gauche).
// Le médaillon n'apparaît que si le sprite est assez grand à l'écran pour ne
// pas écraser le pixel-art au zoom minimal.
function drawEngineSprite(t, x, y, w, h, now) {
  // Couche pixel-art (flag) : si un sprite existe pour (id, stage, tier), il
  // remplace le procédural ; sinon repli sur le rendu d'origine.
  const band = CM.layout?.counts?.eraBand ?? 0;
  const ei = CM.layout?.counts?.eraIndex ?? 0;
  if (drawPixelBuilding(t, x, y, w, h, now, band, ei)) return;
  drawEngineSpriteCore(t, x, y, w, h, now);
}

export { drawEngineSprite };
