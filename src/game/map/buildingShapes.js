import { CM } from './layout.js';
import { cmLitColor } from './renderWorld.js';
import { drawEngineSprite } from './engineSprites.js';

/* ============================================================================
 * buildingShapes.js — Silhouettes des bâtiments décoratifs.
 *   Langage visuel commun "3/4 plongé" :
 *     - toit vu de dessus (versant nord clair / versant sud sombre) ;
 *     - façade sud extrudée sous le toit (pseudo-hauteur) avec portes et
 *       fenêtres éclairées la nuit ;
 *     - plus le bâtiment est haut (tour, immeuble), plus la façade est haute
 *       et plus l'ombre portée (gérée par drawTile) s'allonge.
 *   Chaque variante a une silhouette reconnaissable au premier coup d'œil.
 * ============================================================================ */

// Hauteur relative par variante — pilote l'ombre portée dans drawTile.
const BUILDING_HEIGHTS = {
  tent: 0.5, hut: 0.6, longhouse: 0.8, townhouse: 1.1,
  courtyard: 0.9, stonehouse: 1.1, manor: 1.4, block: 1.8, tenement: 2.2,
  tower: 3.2, megablock: 2.8, arcologyhome: 3.4
};

// ── Helpers du langage commun ───────────────────────────────────────────────

// Toit à deux versants (faîte horizontal) : nord clair, sud sombre.
function roofGable(ctx, x, w, yTop, yRidge, yEave, colN, colS) {
  ctx.fillStyle = colN;
  ctx.fillRect(x, yTop, w, yRidge - yTop);
  ctx.fillStyle = colS;
  ctx.fillRect(x, yRidge, w, yEave - yRidge);
  // Liseré de faîtage
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(x, yRidge - Math.max(0.5, (yEave - yTop) * 0.04), w, Math.max(1, (yEave - yTop) * 0.07));
}

// Façade extrudée : mur sous le toit, avec porte et fenêtres optionnelles.
function facade(ctx, x, w, yEave, yBase, wall, lit, { door = 0.5, wins = 2, winRow = 0.4 } = {}) {
  const fh = yBase - yEave;
  if (fh <= 0.5) return;
  ctx.fillStyle = wall;
  ctx.fillRect(x, yEave, w, fh);
  // Ombre sous l'avancée du toit
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(x, yEave, w, Math.max(0.5, fh * 0.16));
  // Fenêtres
  if (wins > 0) {
    ctx.fillStyle = lit;
    for (let i = 0; i < wins; i += 1) {
      const wx = x + w * ((i + 0.5) / wins) - w * 0.07;
      ctx.fillRect(wx, yEave + fh * winRow, w * 0.14, Math.max(1, fh * 0.3));
    }
  }
  // Porte
  if (door !== null) {
    ctx.fillStyle = "rgba(20,11,4,0.78)";
    ctx.fillRect(x + w * door - w * 0.08, yBase - fh * 0.55, w * 0.16, fh * 0.55);
  }
}

function drawTinyCamp(x, y, w, h, pad, seed, variant, now) {
  const ctx = CM.ctx;
  // ── TENTE — cône de peaux 3/4 : toile, coutures, entrée sombre, piquets ──
  const cx = x + w * 0.5;
  const apexY = y + h * 0.16, baseY = y + h * 0.82;
  // Toile (cône) : pan gauche clair, pan droit sombre
  ctx.fillStyle = "#c89a3a";
  ctx.beginPath(); ctx.moveTo(cx, apexY); ctx.lineTo(x + w * 0.16, baseY); ctx.lineTo(x + w * 0.84, baseY); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(80,48,10,0.32)";
  ctx.beginPath(); ctx.moveTo(cx, apexY); ctx.lineTo(x + w * 0.84, baseY); ctx.lineTo(cx, baseY); ctx.closePath(); ctx.fill();
  // Coutures
  ctx.strokeStyle = "rgba(90,55,10,0.5)"; ctx.lineWidth = Math.max(0.5, w * 0.02);
  ctx.beginPath(); ctx.moveTo(cx, apexY); ctx.lineTo(x + w * 0.34, baseY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, apexY); ctx.lineTo(x + w * 0.66, baseY); ctx.stroke();
  // Perches croisées au sommet
  ctx.strokeStyle = "#6a4413"; ctx.lineWidth = Math.max(1, w * 0.035);
  ctx.beginPath(); ctx.moveTo(cx - w * 0.06, apexY - h * 0.1); ctx.lineTo(cx + w * 0.04, apexY + h * 0.02); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + w * 0.06, apexY - h * 0.1); ctx.lineTo(cx - w * 0.04, apexY + h * 0.02); ctx.stroke();
  // Entrée
  ctx.fillStyle = "rgba(28,15,4,0.7)";
  ctx.beginPath(); ctx.moveTo(cx - w * 0.09, baseY); ctx.lineTo(cx, baseY - h * 0.2); ctx.lineTo(cx + w * 0.09, baseY); ctx.closePath(); ctx.fill();
  // Piquets et cordes
  ctx.strokeStyle = "rgba(120,80,30,0.5)"; ctx.lineWidth = Math.max(0.5, w * 0.018);
  ctx.beginPath(); ctx.moveTo(x + w * 0.16, baseY); ctx.lineTo(x + w * 0.06, baseY + h * 0.06); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + w * 0.84, baseY); ctx.lineTo(x + w * 0.94, baseY + h * 0.06); ctx.stroke();
}

// Palette cosmique (ères 35+, bands 7–9) pour le fond de ville procédural. Corps
// OPAQUES + fenêtres lumineuses en source-over (PAS de glow additif : la ville est
// dense → l'additif saturerait en blanc). Miroir de COSMIC_PAL (cityEngineSprites).
const CPAL = {
  7: { mid: "#16442e", edge: "#3aeca0", lite: "#bdf8de", glow: "90,240,180" },
  8: { mid: "#3e2c10", edge: "#f4c25c", lite: "#ffeaba", glow: "255,205,120" },
  9: { mid: "#262044", edge: "#c8aef0", lite: "#ece2ff", glow: "170,140,255" }
};

function drawHouseShape(x, y, w, h, pad, tier, seed, variant, now) {
  const ctx = CM.ctx;
  const band = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 0;
  const lit = cmLitColor(band);
  const s = (seed || 0) % 100;
  const t = now || 0;

  if (band >= 7) {
    // ── MAISON COSMIQUE (pod opaque + toit selon l'époque + fenêtres scintillantes) ──
    const cp = CPAL[band] || CPAL[9];
    ctx.fillStyle = cp.mid; ctx.beginPath(); ctx.roundRect(x + w * 0.18, y + h * 0.38, w * 0.64, h * 0.48, w * 0.05); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(x + w * 0.56, y + h * 0.38, w * 0.26, h * 0.48);
    if (band === 7) { ctx.fillStyle = cp.edge; ctx.beginPath(); ctx.ellipse(x + w * 0.5, y + h * 0.4, w * 0.32, h * 0.16, 0, Math.PI, 0); ctx.fill(); }
    else if (band === 8) { ctx.fillStyle = cp.edge; ctx.fillRect(x + w * 0.16, y + h * 0.33, w * 0.68, h * 0.08); ctx.fillStyle = cp.lite; ctx.fillRect(x + w * 0.46, y + h * 0.22, w * 0.08, h * 0.12); }
    else { ctx.fillStyle = cp.lite; ctx.beginPath(); ctx.moveTo(x + w * 0.18, y + h * 0.4); ctx.lineTo(x + w * 0.5, y + h * 0.22); ctx.lineTo(x + w * 0.82, y + h * 0.4); ctx.closePath(); ctx.fill(); }
    const lp = (0.45 + 0.35 * Math.sin(t / 700 + s)).toFixed(2);
    ctx.fillStyle = `rgba(${cp.glow},${lp})`;
    for (let i = 0; i < 2; i++) ctx.fillRect(x + w * (0.3 + i * 0.24), y + h * 0.56, w * 0.14, h * 0.18);
    return;
  }

  if (variant === "tent") {
    drawTinyCamp(x, y, w, h, pad, seed, variant, now); return;
  }

  if (variant === "hut") {
    // ── CABANE RONDE — chaume conique + mur de torchis extrudé ─────────
    // Mur bas visible sous le toit (pseudo-hauteur)
    ctx.fillStyle = "#8a6a3a";
    ctx.beginPath(); ctx.ellipse(x+w*0.5, y+h*0.66, w*0.3, h*0.22, 0, 0, Math.PI); ctx.fill();
    // Toit de chaume en anneaux
    ctx.fillStyle = "#9a6e2a";
    ctx.beginPath(); ctx.ellipse(x+w*0.5, y+h*0.5, w*0.36, h*0.3, 0, 0, Math.PI*2); ctx.fill();
    const thatch = ["#8a5c18","#7a4e12","#6a400c","#522e08"];
    for (let ri=0; ri<4; ri++) {
      ctx.fillStyle = thatch[ri];
      ctx.beginPath(); ctx.ellipse(x+w*0.5, y+h*0.48, w*(0.32-ri*0.07), h*(0.27-ri*0.055), 0, 0, Math.PI*2); ctx.fill();
    }
    ctx.fillStyle = "#3a2008"; ctx.beginPath(); ctx.arc(x+w*0.5, y+h*0.46, w*0.05, 0, Math.PI*2); ctx.fill();
    // Entrée sombre dans le mur
    ctx.fillStyle = "rgba(25,12,3,0.7)";
    ctx.fillRect(x+w*0.44, y+h*0.66, w*0.12, h*0.16);
    return;
  }

  if (variant === "longhouse") {
    // ── LONGUE MAISON — long toit à faîte, pignons sculptés, façade bois ──
    const yTop = y+h*0.2, yRidge = y+h*0.38, yEave = y+h*0.6, yBase = y+h*0.86;
    facade(ctx, x+w*0.1, w*0.8, yEave, yBase, "#6e4c1c", lit, { door: 0.5, wins: 3, winRow: 0.3 });
    // Planches verticales sur la façade
    ctx.strokeStyle = "rgba(40,22,6,0.4)"; ctx.lineWidth = Math.max(0.5, w*0.014);
    for (let i=1; i<8; i++) { ctx.beginPath(); ctx.moveTo(x+w*(0.1+i*0.1), yEave); ctx.lineTo(x+w*(0.1+i*0.1), yBase); ctx.stroke(); }
    roofGable(ctx, x+w*0.06, w*0.88, yTop, yRidge, yEave, "#8a6020", "#6a4612");
    // Stries de chaume
    ctx.strokeStyle = "rgba(40,22,6,0.3)"; ctx.lineWidth = Math.max(0.5, w*0.016);
    for (let i=1; i<7; i++) { ctx.beginPath(); ctx.moveTo(x+w*(0.08+i*0.12), yTop); ctx.lineTo(x+w*(0.08+i*0.12), yEave); ctx.stroke(); }
    // Cornes de pignon (décor tribal)
    ctx.strokeStyle = "#503010"; ctx.lineWidth = Math.max(1, w*0.03);
    ctx.beginPath(); ctx.moveTo(x+w*0.1, yTop+h*0.02); ctx.lineTo(x+w*0.04, yTop-h*0.06); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+w*0.9, yTop+h*0.02); ctx.lineTo(x+w*0.96, yTop-h*0.06); ctx.stroke();
    return;
  }

  if (variant === "townhouse") {
    // ── MAISON À COLOMBAGES — étage en encorbellement, toit pentu ─────
    const yTop = y+h*0.08, yRidge = y+h*0.26, yEave = y+h*0.44, yBase = y+h*0.88;
    // Façade torchis 2 niveaux
    ctx.fillStyle = "#c8a060"; ctx.fillRect(x+w*0.18, yEave, w*0.64, yBase-yEave);
    // Encorbellement : l'étage déborde
    ctx.fillStyle = "#bd9352"; ctx.fillRect(x+w*0.14, yEave, w*0.72, (yBase-yEave)*0.42);
    ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fillRect(x+w*0.14, yEave+(yBase-yEave)*0.42, w*0.72, Math.max(0.5, h*0.02));
    // Colombages
    ctx.strokeStyle = "#5a3610"; ctx.lineWidth = Math.max(1, w*0.03);
    ctx.beginPath(); ctx.moveTo(x+w*0.14, yEave+h*0.02); ctx.lineTo(x+w*0.5, yEave+h*0.14); ctx.lineTo(x+w*0.86, yEave+h*0.02); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+w*0.18, yEave+(yBase-yEave)*0.42); ctx.lineTo(x+w*0.82, yEave+(yBase-yEave)*0.42); ctx.stroke();
    // Fenêtres étage + rdc, porte
    ctx.fillStyle = lit;
    ctx.fillRect(x+w*0.24, yEave+h*0.05, w*0.12, h*0.08); ctx.fillRect(x+w*0.64, yEave+h*0.05, w*0.12, h*0.08);
    ctx.fillRect(x+w*0.26, yEave+(yBase-yEave)*0.6, w*0.11, h*0.08);
    ctx.fillStyle = "rgba(24,12,4,0.75)"; ctx.fillRect(x+w*0.52, yBase-h*0.18, w*0.14, h*0.18);
    // Toit pentu qui déborde
    roofGable(ctx, x+w*0.1, w*0.8, yTop, yRidge, yEave, "#a0482a", "#7c3216");
    // Cheminée
    ctx.fillStyle = "#6a5a48"; ctx.fillRect(x+w*0.68, yTop-h*0.05, w*0.09, h*0.12);
    return;
  }

  if (variant === "courtyard") {
    // ── MAISON À COUR — quatre ailes autour d'un jardin intérieur ──────
    const x0 = x+w*0.1, y0 = y+h*0.14, wid = w*0.8, hei = h*0.72;
    // Toits des ailes (tuiles)
    ctx.fillStyle = "#96462a"; ctx.fillRect(x0, y0, wid, hei);
    // Cour intérieure : jardin + bassin
    ctx.fillStyle = "#7a9a48"; ctx.fillRect(x0+wid*0.26, y0+hei*0.28, wid*0.48, hei*0.44);
    ctx.fillStyle = "#3c6a96"; ctx.beginPath(); ctx.ellipse(x0+wid*0.5, y0+hei*0.5, wid*0.1, hei*0.09, 0, 0, Math.PI*2); ctx.fill();
    // Versants : liserés clairs côté nord de chaque aile
    ctx.fillStyle = "rgba(255,235,200,0.22)";
    ctx.fillRect(x0, y0, wid, hei*0.08);
    ctx.fillRect(x0, y0, wid*0.06, hei);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(x0, y0+hei*0.92, wid, hei*0.08);
    ctx.fillRect(x0+wid*0.94, y0, wid*0.06, hei);
    // Lignes de tuiles
    ctx.strokeStyle = "rgba(55,18,6,0.32)"; ctx.lineWidth = Math.max(0.5, w*0.014);
    for (let i=1; i<5; i++) { ctx.beginPath(); ctx.moveTo(x0, y0+hei*i/5); ctx.lineTo(x0+wid*0.26, y0+hei*i/5); ctx.moveTo(x0+wid*0.74, y0+hei*i/5); ctx.lineTo(x0+wid, y0+hei*i/5); ctx.stroke(); }
    // Façade sud extrudée + porche d'entrée
    facade(ctx, x0+wid*0.3, wid*0.4, y0+hei, y+h*0.94, "#b08a4c", lit, { door: 0.5, wins: 0 });
    return;
  }

  if (variant === "stonehouse") {
    // ── MAISON DE PIERRE — moellon, ardoise, cheminée fumante ──────────
    const yTop = y+h*0.1, yRidge = y+h*0.3, yEave = y+h*0.5, yBase = y+h*0.88;
    facade(ctx, x+w*0.16, w*0.68, yEave, yBase, "#9a8c78", lit, { door: 0.5, wins: 2, winRow: 0.32 });
    // Joints de pierre
    ctx.strokeStyle = "rgba(55,45,30,0.4)"; ctx.lineWidth = Math.max(0.5, w*0.015);
    for (let r=1; r<3; r++) { ctx.beginPath(); ctx.moveTo(x+w*0.16, yEave+(yBase-yEave)*r/3); ctx.lineTo(x+w*0.84, yEave+(yBase-yEave)*r/3); ctx.stroke(); }
    roofGable(ctx, x+w*0.1, w*0.8, yTop, yRidge, yEave, "#6a655c", "#4c4840");
    // Cheminée + fumée douce
    ctx.fillStyle = "#78685a"; ctx.fillRect(x+w*0.66, yTop-h*0.06, w*0.1, h*0.16);
    if (band >= 2 && ((seed|0) % 3) === 0) {
      for (let k = 0; k < 2; k += 1) {
        const ph = ((t / 1600) + k * 0.5 + s * 0.01) % 1;
        ctx.fillStyle = `rgba(190,190,185,${((1 - ph) * 0.22).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(x+w*0.71 + Math.sin(ph*5+s)*w*0.05, yTop - h*0.08 - ph*h*0.3, w*(0.04+ph*0.07), 0, Math.PI*2); ctx.fill();
      }
    }
    return;
  }

  if (variant === "manor") {
    // ── MANOIR — corps + aile en L + tour d'angle pointue + jardin ─────
    // Jardin clos derrière
    ctx.fillStyle = "rgba(110,150,70,0.45)"; ctx.fillRect(x+w*0.58, y+h*0.6, w*0.34, h*0.3);
    // Corps principal
    const yTop = y+h*0.12, yRidge = y+h*0.28, yEave = y+h*0.46, yBase = y+h*0.84;
    facade(ctx, x+w*0.14, w*0.56, yEave, yBase, "#8a7860", lit, { door: 0.55, wins: 3, winRow: 0.3 });
    roofGable(ctx, x+w*0.1, w*0.62, yTop, yRidge, yEave, "#56524c", "#3e3a36");
    // Aile basse à droite
    ctx.fillStyle = "#7e6e58"; ctx.fillRect(x+w*0.66, y+h*0.5, w*0.24, h*0.3);
    ctx.fillStyle = "#4c4844"; ctx.fillRect(x+w*0.64, y+h*0.44, w*0.28, h*0.1);
    // Tour d'angle ronde + toit conique
    ctx.fillStyle = "#776655"; ctx.beginPath(); ctx.arc(x+w*0.16, y+h*0.3, w*0.13, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#39352f";
    ctx.beginPath(); ctx.moveTo(x+w*0.03, y+h*0.3); ctx.lineTo(x+w*0.16, y+h*0.02); ctx.lineTo(x+w*0.29, y+h*0.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = lit; ctx.fillRect(x+w*0.12, y+h*0.27, w*0.08, h*0.06);
    return;
  }

  if (variant === "block" || variant === "tenement") {
    // ── IMMEUBLE — brique, façade haute, toit terrasse, parapet ─────────
    const tall = variant === "tenement";
    const yRoof = y+h*(tall?0.06:0.14), yEave = y+h*(tall?0.2:0.3), yBase = y+h*0.9;
    // Toit terrasse vu de dessus
    ctx.fillStyle = tall ? "#4c3a22" : "#54422a";
    ctx.fillRect(x+w*0.12, yRoof, w*0.76, yEave-yRoof);
    ctx.fillStyle = "rgba(255,255,255,0.1)"; ctx.fillRect(x+w*0.12, yRoof, w*0.76, Math.max(1, h*0.025));
    // Cheminées / cages d'escalier
    ctx.fillStyle = "#33271a";
    ctx.fillRect(x+w*0.22, yRoof+h*0.02, w*0.1, h*0.06); ctx.fillRect(x+w*0.6, yRoof+h*0.02, w*0.12, h*0.05);
    // Façade haute
    const wall = tall ? "#7a5028" : (band>=5 ? "#6c6450" : "#7a5820");
    ctx.fillStyle = wall; ctx.fillRect(x+w*0.12, yEave, w*0.76, yBase-yEave);
    // Grille de fenêtres
    ctx.fillStyle = lit;
    const rows = tall ? 5 : 3, cols = 3;
    for (let r=0; r<rows; r++) for (let c2=0; c2<cols; c2++)
      if ((c2+r+s)%4!==0) ctx.fillRect(x+w*(0.19+c2*0.24), yEave+(yBase-yEave)*(0.1+r*(0.78/rows)), w*0.12, Math.max(1,(yBase-yEave)*0.1));
    // Corniches entre étages
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    for (let r=1; r<rows; r++) ctx.fillRect(x+w*0.12, yEave+(yBase-yEave)*(r*(0.78/rows)+0.06), w*0.76, Math.max(0.5,h*0.01));
    // Porte + ombre latérale
    ctx.fillStyle = "rgba(18,10,3,0.75)"; ctx.fillRect(x+w*0.42, yBase-h*0.12, w*0.16, h*0.12);
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(x+w*0.78, yEave, w*0.1, yBase-yEave);
    return;
  }

  if (variant === "tower") {
    // ── TOUR RÉSIDENTIELLE — élancée, retraits, antenne ───────────────
    const cBody = band>=6 ? "#585a60" : band>=5 ? "#5e5a4e" : "#646058";
    // Socle large
    ctx.fillStyle = "#46443c"; ctx.fillRect(x+w*0.16, y+h*0.72, w*0.68, h*0.2);
    // Fût principal très haut
    ctx.fillStyle = cBody; ctx.fillRect(x+w*0.28, y+h*0.08, w*0.44, h*0.84);
    // Retrait sommital
    ctx.fillStyle = "#3a3833"; ctx.fillRect(x+w*0.34, y+h*0.02, w*0.32, h*0.09);
    // Antenne clignotante
    ctx.strokeStyle = "#8a8a88"; ctx.lineWidth = Math.max(1, w*0.025);
    ctx.beginPath(); ctx.moveTo(x+w*0.5, y+h*0.02); ctx.lineTo(x+w*0.5, y-h*0.08); ctx.stroke();
    ctx.fillStyle = `rgba(255,80,80,${(0.4+0.6*Math.abs(Math.sin(t/900+s))).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x+w*0.5, y-h*0.08, Math.max(1, w*0.035), 0, Math.PI*2); ctx.fill();
    // Bandes vitrées
    ctx.fillStyle = lit;
    const rows = band>=5 ? 9 : 6;
    for (let r=0; r<rows; r++) if ((r+s)%5!==0) ctx.fillRect(x+w*0.32, y+h*(0.12+r*(0.56/rows)), w*0.36, Math.max(1,h*0.034));
    // Volume : clair à gauche, sombre à droite
    ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(x+w*0.28, y+h*0.08, w*0.08, h*0.84);
    ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(x+w*0.62, y+h*0.08, w*0.1, h*0.84);
    return;
  }

  if (variant === "megablock" || variant === "arcologyhome") {
    // ── MEGABLOCK / ARCO-HOME — strates, passerelles, néons ────────────
    const tech = variant === "arcologyhome";
    ctx.fillStyle = tech ? "#485060" : "#525046";
    ctx.fillRect(x+w*0.08, y+h*0.16, w*0.84, h*0.76);
    // Retraits progressifs
    ctx.fillStyle = tech ? "#384050" : "#424038";
    ctx.fillRect(x+w*0.16, y+h*0.07, w*0.68, h*0.11);
    ctx.fillRect(x+w*0.26, y+h*0.0, w*0.48, h*0.09);
    // Passerelles lumineuses entre strates
    ctx.fillStyle = tech ? `rgba(70,190,255,${(0.4+(CM.nightF||0)*0.45).toFixed(2)})` : `rgba(255,205,110,${(0.3+(CM.nightF||0)*0.4).toFixed(2)})`;
    ctx.fillRect(x+w*0.08, y+h*0.42, w*0.84, Math.max(1, h*0.02));
    ctx.fillRect(x+w*0.08, y+h*0.66, w*0.84, Math.max(1, h*0.02));
    // Grille de fenêtres
    ctx.fillStyle = tech ? `rgba(70,190,255,${(0.45+(CM.nightF||0)*0.45).toFixed(2)})` : lit;
    const rows2=tech?7:6, cols2=tech?5:4;
    for (let r=0; r<rows2; r++) for (let c2=0; c2<cols2; c2++)
      if (tech||(r+c2+s)%4!==0) ctx.fillRect(x+w*(0.15+c2*(0.7/Math.max(1,cols2-1))), y+h*(0.2+r*0.1), w*0.06, Math.max(1,h*0.04));
    if (tech) {
      ctx.strokeStyle = `rgba(50,175,240,${(0.3+(CM.nightF||0)*0.4).toFixed(2)})`; ctx.lineWidth = Math.max(0.5,w*0.018);
      ctx.beginPath(); ctx.moveTo(x+w*0.12, y+h*0.84); ctx.lineTo(x+w*0.5, y+h*0.06); ctx.lineTo(x+w*0.88, y+h*0.84); ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(x+w*0.76, y+h*0.16, w*0.16, h*0.76);
    return;
  }

  // fallback
  ctx.fillStyle = "#9a7426"; ctx.fillRect(x+pad,y+pad,w-pad*2,h-pad*2);
}

export { drawEngineSprite, drawHouseShape, BUILDING_HEIGHTS };
