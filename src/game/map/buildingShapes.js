/* eslint-disable */
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
  tent: 0.5, firepit: 0.9, hut: 0.6, longhouse: 0.8, townhouse: 1.1,
  courtyard: 0.9, stonehouse: 1.1, manor: 1.4, block: 1.8, tenement: 2.2,
  tower: 3.2, megablock: 2.8, arcologyhome: 3.4,
  market: 0.8, granary: 1.2, temple: 1.5, hall: 1.6, keep: 2.2, forum: 1.4,
  palace: 1.8, station: 1.2, spire: 3.4, archive: 2.6,
  shrine: 0.6, school: 1.0, library: 1.4, scribehall: 1.0, academy: 1.5,
  university: 2.0, observatory: 1.3, datavault: 1.6
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
  const t = now || 0;
  if (variant === "firepit") {
    // Grand feu central — halo, bûches, braises, 3 flammes animées
    const cx = x + w * 0.5, cy = y + h * 0.5;
    const halo = 0.20 + 0.10 * Math.abs(Math.sin(t / 520));
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.46);
    rg.addColorStop(0, `rgba(255,160,30,${halo.toFixed(2)})`);
    rg.addColorStop(1, "rgba(255,80,5,0)");
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(cx, cy, w * 0.46, 0, Math.PI * 2); ctx.fill();
    // Rondins-bancs autour du feu (lieu de vie, pas juste un feu)
    ctx.fillStyle = "#5d3c14";
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + 0.4;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * w * 0.3, cy + Math.sin(a) * h * 0.24);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillRect(-w * 0.09, -h * 0.025, w * 0.18, h * 0.05);
      ctx.restore();
    }
    // Cercle de pierres
    ctx.fillStyle = "#5a4830";
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * w * 0.2, cy + Math.sin(a) * h * 0.16, w * 0.04, 0, Math.PI * 2); ctx.fill();
    }
    // Bûches en croix
    ctx.lineWidth = Math.max(2, w * 0.06); ctx.lineCap = "round";
    ctx.strokeStyle = "#6a3c0c";
    ctx.beginPath(); ctx.moveTo(cx - w*0.15, cy + h*0.05); ctx.lineTo(cx + w*0.15, cy - h*0.05); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + w*0.15, cy + h*0.05); ctx.lineTo(cx - w*0.15, cy - h*0.05); ctx.stroke();
    ctx.lineCap = "square";
    // Braises
    ctx.fillStyle = "rgba(200,60,5,0.8)";
    ctx.beginPath(); ctx.ellipse(cx, cy + h*0.02, w*0.11, h*0.08, 0, 0, Math.PI*2); ctx.fill();
    // 3 flammes animées
    const f1 = 0.5+0.5*Math.sin(t/170), f2 = 0.5+0.5*Math.sin(t/140+1.3), f3 = 0.5+0.5*Math.sin(t/200+2.7);
    ctx.fillStyle = `rgba(255,85,8,${(0.78+f1*0.22).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(cx-w*0.09,cy+h*0.04); ctx.quadraticCurveTo(cx-w*0.15,cy-h*(0.18+f1*0.08),cx,cy-h*(0.26+f1*0.07)); ctx.quadraticCurveTo(cx+w*0.15,cy-h*(0.18+f2*0.06),cx+w*0.09,cy+h*0.04); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,195,20,${(0.82+f2*0.18).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(cx-w*0.06,cy+h*0.04); ctx.quadraticCurveTo(cx-w*0.03,cy-h*(0.22+f2*0.1),cx,cy-h*(0.32+f2*0.08)); ctx.quadraticCurveTo(cx+w*0.03,cy-h*(0.22+f3*0.07),cx+w*0.06,cy+h*0.04); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,250,200,${(0.7+f3*0.3).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cx, cy - h*(0.3+f2*0.07), Math.max(1, w*0.04), 0, Math.PI*2); ctx.fill();
    return;
  }
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

function drawHouseShape(x, y, w, h, pad, tier, seed, variant, now) {
  const ctx = CM.ctx;
  const band = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 0;
  const lit = cmLitColor(band);
  const s = (seed || 0) % 100;
  const t = now || 0;

  if (variant === "tent" || variant === "firepit") {
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

function drawPublicShape(type, x, y, w, h, pad, tier, variant, now) {
  const ctx = CM.ctx;
  const band = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 0;
  const library = type === "library";
  const lit = cmLitColor(band);
  const t = now || 0;

  if (variant === "firepit") {
    // ── GRANGE COMMUNE — grange de bois à toit en bâtière, grandes portes
    //    à croix de Saint-André, lucarne de fenil et bottes de foin : la
    //    réserve commune du campement (ex-« foyer commun »). ──────────────
    const yTop = y + h * 0.16, yRidge = y + h * 0.34, yEave = y + h * 0.52, yBase = y + h * 0.86;
    const bx = x + w * 0.18, bw = w * 0.64;
    // Corps en planches
    ctx.fillStyle = "#8a5a2c";
    ctx.fillRect(bx, yEave, bw, yBase - yEave);
    ctx.strokeStyle = "rgba(45,26,8,0.45)"; ctx.lineWidth = Math.max(0.5, w * 0.014);
    for (let i = 1; i < 7; i++) { ctx.beginPath(); ctx.moveTo(bx + bw * i / 7, yEave); ctx.lineTo(bx + bw * i / 7, yBase); ctx.stroke(); }
    // Ombre sous l'auvent du toit
    ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fillRect(bx, yEave, bw, Math.max(0.5, (yBase - yEave) * 0.12));
    // Grandes portes (double battant) + croix de Saint-André
    const dW = bw * 0.46, dH = (yBase - yEave) * 0.72, dX = x + w * 0.5 - dW / 2, dY = yBase - dH;
    ctx.fillStyle = "#5c3a16"; ctx.fillRect(dX, dY, dW, dH);
    ctx.strokeStyle = "rgba(30,18,6,0.7)"; ctx.lineWidth = Math.max(0.5, w * 0.012);
    ctx.beginPath(); ctx.moveTo(x + w * 0.5, dY); ctx.lineTo(x + w * 0.5, yBase); ctx.stroke();
    ctx.strokeStyle = "rgba(150,104,44,0.65)";
    ctx.beginPath(); ctx.moveTo(dX, dY); ctx.lineTo(dX + dW / 2, yBase); ctx.lineTo(dX + dW, dY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(dX, yBase); ctx.lineTo(dX + dW / 2, dY); ctx.lineTo(dX + dW, yBase); ctx.stroke();
    // Toit en bâtière : versant nord clair / sud sombre
    roofGable(ctx, x + w * 0.1, w * 0.8, yTop, yRidge, yEave, "#a06a26", "#7c4e18");
    // Lucarne de fenil sombre dans le pignon + poutre de levage
    ctx.fillStyle = "rgba(25,14,4,0.75)";
    ctx.fillRect(x + w * 0.44, yRidge - h * 0.02, w * 0.12, h * 0.1);
    ctx.strokeStyle = "#4a2e10"; ctx.lineWidth = Math.max(1, w * 0.025);
    ctx.beginPath(); ctx.moveTo(x + w * 0.5, yTop + h * 0.03); ctx.lineTo(x + w * 0.5, yRidge - h * 0.04); ctx.stroke();
    // Bottes de foin devant la grange
    ctx.fillStyle = "#d8b24c";
    ctx.beginPath(); ctx.ellipse(x + w * 0.26, yBase - h * 0.02, w * 0.07, h * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + w * 0.74, yBase - h * 0.01, w * 0.06, h * 0.045, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(120,86,20,0.6)"; ctx.lineWidth = Math.max(0.5, w * 0.01);
    ctx.beginPath(); ctx.arc(x + w * 0.26, yBase - h * 0.02, w * 0.04, 0, Math.PI * 2); ctx.stroke();
    return;
  }

  if (variant === "shrine") {
    // Sanctuaire primitif : stele gravee, cercle de pierres et offrandes.
    const glow = 0.28 + 0.14 * Math.sin(t / 450);
    const rg = ctx.createRadialGradient(x + w * 0.5, y + h * 0.66, 0, x + w * 0.5, y + h * 0.66, w * 0.28);
    rg.addColorStop(0, `rgba(255,195,85,${glow.toFixed(2)})`);
    rg.addColorStop(1, "rgba(255,170,60,0)");
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(x + w * 0.5, y + h * 0.66, w * 0.28, 0, Math.PI * 2); ctx.fill();

    const pebbles = [[0.28,0.72,0.055,0.038],[0.38,0.68,0.045,0.034],[0.5,0.7,0.052,0.036],[0.62,0.68,0.045,0.034],[0.72,0.72,0.055,0.038]];
    for (const [px2, py2, rx2, ry2] of pebbles) {
      ctx.fillStyle = "#5f584b";
      ctx.beginPath(); ctx.ellipse(x + w * px2, y + h * py2, w * rx2, h * ry2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(230,220,190,0.2)";
      ctx.beginPath(); ctx.ellipse(x + w * (px2 - 0.015), y + h * (py2 - 0.012), w * rx2 * 0.45, h * ry2 * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = "#8d8472";
    ctx.beginPath();
    ctx.moveTo(x + w * 0.36, y + h * 0.64);
    ctx.lineTo(x + w * 0.4, y + h * 0.34);
    ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.22, x + w * 0.6, y + h * 0.34);
    ctx.lineTo(x + w * 0.64, y + h * 0.64);
    ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.7, x + w * 0.36, y + h * 0.64);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.moveTo(x + w * 0.42, y + h * 0.6);
    ctx.lineTo(x + w * 0.44, y + h * 0.36);
    ctx.quadraticCurveTo(x + w * 0.49, y + h * 0.29, x + w * 0.52, y + h * 0.35);
    ctx.lineTo(x + w * 0.49, y + h * 0.6);
    ctx.closePath(); ctx.fill();

    ctx.strokeStyle = "rgba(45,32,15,0.62)";
    ctx.lineWidth = Math.max(0.5, w * 0.018);
    ctx.beginPath(); ctx.arc(x + w * 0.5, y + h * 0.43, w * 0.045, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w * 0.5, y + h * 0.43); ctx.lineTo(x + w * 0.5, y + h * 0.53); ctx.stroke();

    ctx.fillStyle = "#caa14a";
    ctx.beginPath(); ctx.ellipse(x + w * 0.34, y + h * 0.72, w * 0.045, h * 0.028, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + w * 0.66, y + h * 0.72, w * 0.045, h * 0.028, 0, 0, Math.PI * 2); ctx.fill();
    return;

    // ── SANCTUAIRE — pierre dressée fleurie + offrandes + lueur ────────
    ctx.fillStyle = "#6a6254"; ctx.fillRect(x+w*0.36, y+h*0.62, w*0.28, h*0.12);
    ctx.fillStyle = "#8d8472";
    ctx.beginPath(); ctx.moveTo(x+w*0.42, y+h*0.62); ctx.lineTo(x+w*0.44, y+h*0.24); ctx.lineTo(x+w*0.56, y+h*0.24); ctx.lineTo(x+w*0.58, y+h*0.62); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(x+w*0.44, y+h*0.26, w*0.04, h*0.34);
    // Gravure
    ctx.strokeStyle = "rgba(40,30,16,0.55)"; ctx.lineWidth = Math.max(0.5, w*0.02);
    ctx.beginPath(); ctx.arc(x+w*0.5, y+h*0.38, w*0.045, 0, Math.PI*2); ctx.stroke();
    // Offrandes (lueur chaude)
    const gl = 0.35+0.2*Math.sin(t/450);
    ctx.fillStyle = `rgba(255,205,90,${gl.toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x+w*0.36, y+h*0.7, w*0.05, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x+w*0.64, y+h*0.7, w*0.05, 0, Math.PI*2); ctx.fill();
    return;
  }

  if (variant === "market") {
    // ── MARCHÉ — halle ouverte, auvent rayé, étals et caisses ──────────
    // Auvent rayé (vu de dessus)
    const x0 = x+w*0.12, y0 = y+h*0.18, wid = w*0.76, hei = h*0.46;
    for (let i = 0; i < 6; i += 1) {
      ctx.fillStyle = i % 2 ? "#b8442e" : "#e8e0cc";
      ctx.fillRect(x0 + wid*i/6, y0, wid/6 + 0.5, hei);
    }
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(x0, y0+hei*0.8, wid, hei*0.2);
    // Poteaux
    ctx.fillStyle = "#5a3c16";
    ctx.fillRect(x0, y0+hei, w*0.05, h*0.18); ctx.fillRect(x0+wid-w*0.05, y0+hei, w*0.05, h*0.18);
    // Étal frontal : tréteau + marchandises colorées
    ctx.fillStyle = "#7a5a2c"; ctx.fillRect(x+w*0.2, y+h*0.72, w*0.6, h*0.1);
    const goods = ["#c89a3a","#a04828","#7a9a3c","#b8762e"];
    for (let i=0;i<4;i++) { ctx.fillStyle = goods[i]; ctx.beginPath(); ctx.arc(x+w*(0.28+i*0.15), y+h*0.74, w*0.05, 0, Math.PI*2); ctx.fill(); }
    // Caisses sur le côté
    ctx.fillStyle = "#8a6a34"; ctx.fillRect(x+w*0.78, y+h*0.66, w*0.14, h*0.12);
    ctx.strokeStyle = "rgba(50,30,10,0.5)"; ctx.lineWidth = Math.max(0.5, w*0.016);
    ctx.strokeRect(x+w*0.78, y+h*0.66, w*0.14, h*0.12);
    return;
  }

  if (variant === "granary") {
    // ── GRENIER — deux silos ronds sur pilotis + échelle ───────────────
    for (const [sx2, r] of [[0.34, 0.21], [0.68, 0.17]]) {
      const cx = x + w*sx2, cy = y + h*0.5;
      // Pilotis
      ctx.fillStyle = "#4c3414";
      ctx.fillRect(cx-w*r*0.7, cy+h*r*0.9, w*0.04, h*0.14);
      ctx.fillRect(cx+w*r*0.5, cy+h*r*0.9, w*0.04, h*0.14);
      // Corps du silo
      ctx.fillStyle = "#b89048";
      ctx.beginPath(); ctx.arc(cx, cy, w*r, 0, Math.PI*2); ctx.fill();
      // Toit conique en anneaux
      ctx.fillStyle = "#7a5618";
      ctx.beginPath(); ctx.arc(cx, cy, w*r*0.72, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#5e3e0e";
      ctx.beginPath(); ctx.arc(cx, cy, w*r*0.4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.beginPath(); ctx.arc(cx-w*r*0.25, cy-h*r*0.3, w*r*0.3, 0, Math.PI*2); ctx.fill();
    }
    // Échelle
    ctx.strokeStyle = "#503614"; ctx.lineWidth = Math.max(0.5, w*0.02);
    ctx.beginPath(); ctx.moveTo(x+w*0.49, y+h*0.62); ctx.lineTo(x+w*0.55, y+h*0.84); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+w*0.55, y+h*0.62); ctx.lineTo(x+w*0.61, y+h*0.84); ctx.stroke();
    for (let i=0;i<3;i++) { ctx.beginPath(); ctx.moveTo(x+w*(0.5+i*0.02), y+h*(0.67+i*0.06)); ctx.lineTo(x+w*(0.56+i*0.02), y+h*(0.67+i*0.06)); ctx.stroke(); }
    return;
  }

  if (variant === "temple") {
    // ── TEMPLE — péristyle blanc, fronton doré, parvis, brasero ────────
    // Parvis / escalier
    ctx.fillStyle = "#a89a82"; ctx.fillRect(x+w*0.14, y+h*0.78, w*0.72, h*0.12);
    ctx.fillStyle = "#bcae94"; ctx.fillRect(x+w*0.2, y+h*0.74, w*0.6, h*0.06);
    // Corps (cella)
    ctx.fillStyle = "#cfc4ac"; ctx.fillRect(x+w*0.2, y+h*0.34, w*0.6, h*0.42);
    // Colonnes du péristyle
    ctx.fillStyle = "#efe7d2";
    const cols = 5;
    for (let i=0;i<cols;i++) {
      ctx.fillRect(x+w*(0.22+i*(0.52/(cols-1))), y+h*0.38, w*0.05, h*0.38);
    }
    ctx.fillStyle = "rgba(60,45,25,0.35)";
    for (let i=0;i<cols;i++) ctx.fillRect(x+w*(0.22+i*(0.52/(cols-1)))+w*0.032, y+h*0.38, w*0.018, h*0.38);
    // Architrave + fronton doré
    ctx.fillStyle = "#d9cdb2"; ctx.fillRect(x+w*0.16, y+h*0.3, w*0.68, h*0.08);
    ctx.fillStyle = "#d8b34c";
    ctx.beginPath(); ctx.moveTo(x+w*0.14, y+h*0.3); ctx.lineTo(x+w*0.5, y+h*0.08); ctx.lineTo(x+w*0.86, y+h*0.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(120,80,20,0.45)";
    ctx.beginPath(); ctx.moveTo(x+w*0.24, y+h*0.28); ctx.lineTo(x+w*0.5, y+h*0.13); ctx.lineTo(x+w*0.76, y+h*0.28); ctx.closePath(); ctx.fill();
    // Brasero sacré sur le parvis
    const fl = 0.5+0.5*Math.abs(Math.sin(t/240));
    ctx.fillStyle = "#5c5246"; ctx.fillRect(x+w*0.47, y+h*0.84, w*0.06, h*0.06);
    ctx.fillStyle = `rgba(255,160,40,${(0.5+fl*0.5).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x+w*0.5, y+h*0.83, w*(0.03+fl*0.015), 0, Math.PI*2); ctx.fill();
    return;
  }

  if (variant === "hall") {
    // ── HALLE CIVIQUE — grand toit, beffroi avec cloche et bannière ────
    const yTop = y+h*0.18, yRidge = y+h*0.36, yEave = y+h*0.54, yBase = y+h*0.88;
    facade(ctx, x+w*0.12, w*0.76, yEave, yBase, "#9a7c4a", lit, { door: 0.5, wins: 3, winRow: 0.28 });
    roofGable(ctx, x+w*0.08, w*0.84, yTop, yRidge, yEave, "#8a5a2c", "#67421c");
    // Beffroi
    ctx.fillStyle = "#8a7048"; ctx.fillRect(x+w*0.42, y+h*0.02, w*0.16, h*0.26);
    ctx.fillStyle = "#5c3c1a";
    ctx.beginPath(); ctx.moveTo(x+w*0.38, y+h*0.04); ctx.lineTo(x+w*0.5, y-h*0.08); ctx.lineTo(x+w*0.62, y+h*0.04); ctx.closePath(); ctx.fill();
    // Cloche
    ctx.fillStyle = "#d8b34c"; ctx.beginPath(); ctx.arc(x+w*0.5, y+h*0.14, w*0.035, 0, Math.PI*2); ctx.fill();
    // Bannière civique
    ctx.fillStyle = "#a03028";
    const wave = Math.sin(t/350)*w*0.02;
    ctx.beginPath(); ctx.moveTo(x+w*0.58, y+h*0.06); ctx.lineTo(x+w*0.74+wave, y+h*0.1); ctx.lineTo(x+w*0.58, y+h*0.16); ctx.closePath(); ctx.fill();
    return;
  }

  if (variant === "keep") {
    // ── DONJON — forteresse crénelée, tours d'angle, porte fortifiée ───
    // Cour intérieure
    ctx.fillStyle = "#6a6356"; ctx.fillRect(x+w*0.18, y+h*0.2, w*0.64, h*0.6);
    ctx.fillStyle = "#79705f"; ctx.fillRect(x+w*0.26, y+h*0.28, w*0.48, h*0.44);
    // Donjon central
    ctx.fillStyle = "#8a8070"; ctx.fillRect(x+w*0.38, y+h*0.34, w*0.24, h*0.28);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x+w*0.56, y+h*0.34, w*0.06, h*0.28);
    // Créneaux du donjon
    ctx.fillStyle = "#4c463c";
    for (let i=0;i<4;i++) ctx.fillRect(x+w*(0.38+i*0.065), y+h*0.32, w*0.035, h*0.04);
    // Tours d'angle rondes
    for (const [tx2, ty2] of [[0.18,0.2],[0.82,0.2],[0.18,0.8],[0.82,0.8]]) {
      ctx.fillStyle = "#7d7464"; ctx.beginPath(); ctx.arc(x+w*tx2, y+h*ty2, w*0.09, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#4c463c"; ctx.beginPath(); ctx.arc(x+w*tx2, y+h*ty2, w*0.05, 0, Math.PI*2); ctx.fill();
    }
    // Porte fortifiée + herse
    ctx.fillStyle = "#3c352a"; ctx.fillRect(x+w*0.44, y+h*0.78, w*0.12, h*0.14);
    ctx.strokeStyle = "rgba(180,160,120,0.4)"; ctx.lineWidth = Math.max(0.5, w*0.012);
    for (let i=0;i<3;i++) { ctx.beginPath(); ctx.moveTo(x+w*(0.46+i*0.04), y+h*0.78); ctx.lineTo(x+w*(0.46+i*0.04), y+h*0.92); ctx.stroke(); }
    // Étendard
    ctx.strokeStyle = "#3a342c"; ctx.lineWidth = Math.max(0.5, w*0.018);
    ctx.beginPath(); ctx.moveTo(x+w*0.5, y+h*0.34); ctx.lineTo(x+w*0.5, y+h*0.18); ctx.stroke();
    ctx.fillStyle = "#a03028";
    ctx.beginPath(); ctx.moveTo(x+w*0.5, y+h*0.18); ctx.lineTo(x+w*0.62, y+h*0.22); ctx.lineTo(x+w*0.5, y+h*0.26); ctx.closePath(); ctx.fill();
    return;
  }

  if (variant === "forum") {
    // ── FORUM — esplanade à portiques, exèdre, foule de colonnes ───────
    // Esplanade dallée
    ctx.fillStyle = "#b3a78c"; ctx.fillRect(x+w*0.12, y+h*0.18, w*0.76, h*0.66);
    ctx.strokeStyle = "rgba(90,75,50,0.3)"; ctx.lineWidth = Math.max(0.5, w*0.012);
    for (let i=1;i<4;i++) { ctx.beginPath(); ctx.moveTo(x+w*0.12, y+h*(0.18+i*0.165)); ctx.lineTo(x+w*0.88, y+h*(0.18+i*0.165)); ctx.stroke(); }
    // Portiques (rangées de colonnes sur 3 côtés)
    ctx.fillStyle = "#e7dfc8";
    for (let i=0;i<6;i++) {
      ctx.fillRect(x+w*(0.15+i*0.14), y+h*0.2, w*0.04, h*0.1);
      ctx.fillRect(x+w*(0.15+i*0.14), y+h*0.72, w*0.04, h*0.1);
    }
    for (let i=0;i<3;i++) ctx.fillRect(x+w*0.13, y+h*(0.32+i*0.14), w*0.04, h*0.1);
    // Exèdre (abside semi-circulaire à droite)
    ctx.fillStyle = "#cfc4ac";
    ctx.beginPath(); ctx.arc(x+w*0.84, y+h*0.5, w*0.13, Math.PI*0.5, Math.PI*1.5, true); ctx.fill();
    // Statue centrale sur socle
    ctx.fillStyle = "#6a6254"; ctx.fillRect(x+w*0.46, y+h*0.46, w*0.08, h*0.1);
    ctx.fillStyle = "#efe7d2"; ctx.fillRect(x+w*0.48, y+h*0.32, w*0.04, h*0.15);
    return;
  }

  if (variant === "palace") {
    // ── PALAIS — ailes symétriques, dôme doré, cour d'honneur ──────────
    // Cour d'honneur
    ctx.fillStyle = "#b3a173"; ctx.fillRect(x+w*0.3, y+h*0.62, w*0.4, h*0.26);
    // Ailes
    for (const ax of [0.08, 0.64]) {
      ctx.fillStyle = "#a8893e"; ctx.fillRect(x+w*ax, y+h*0.3, w*0.28, h*0.5);
      ctx.fillStyle = "#6c5520"; ctx.fillRect(x+w*(ax-0.01), y+h*0.26, w*0.3, h*0.08);
      ctx.fillStyle = lit;
      for (let r2=0;r2<2;r2++) for (let i=0;i<2;i++)
        ctx.fillRect(x+w*(ax+0.05+i*0.13), y+h*(0.4+r2*0.16), w*0.07, h*0.07);
    }
    // Corps central + dôme doré
    ctx.fillStyle = "#b39548"; ctx.fillRect(x+w*0.34, y+h*0.22, w*0.32, h*0.4);
    const g = ctx.createRadialGradient(x+w*0.47, y+h*0.16, 0, x+w*0.5, y+h*0.2, w*0.17);
    g.addColorStop(0, "#f4d878"); g.addColorStop(1, "#b8862e");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x+w*0.5, y+h*0.22, w*0.15, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#f4d878"; ctx.beginPath(); ctx.arc(x+w*0.5, y+h*0.07, w*0.025, 0, Math.PI*2); ctx.fill();
    // Grand portail
    ctx.fillStyle = "rgba(30,18,6,0.7)"; ctx.fillRect(x+w*0.45, y+h*0.48, w*0.1, h*0.14);
    ctx.fillStyle = lit; ctx.fillRect(x+w*0.38, y+h*0.32, w*0.06, h*0.08); ctx.fillRect(x+w*0.56, y+h*0.32, w*0.06, h*0.08);
    return;
  }

  if (variant === "school" || variant === "scribehall") {
    // ── ÉCOLE / SALLE DES SCRIBES — préau, tablettes au mur ────────────
    const yTop = y+h*0.16, yRidge = y+h*0.32, yEave = y+h*0.48, yBase = y+h*0.86;
    facade(ctx, x+w*0.14, w*0.72, yEave, yBase, library ? "#6a5a3e" : "#94804e", lit, { door: 0.3, wins: 2, winRow: 0.3 });
    roofGable(ctx, x+w*0.1, w*0.8, yTop, yRidge, yEave, "#7c6434", "#5c4820");
    // Tableau de tablettes / enseigne gravée près de la porte
    ctx.fillStyle = "#d8cba8"; ctx.fillRect(x+w*0.58, yEave+h*0.1, w*0.2, h*0.16);
    ctx.strokeStyle = "rgba(60,45,20,0.6)"; ctx.lineWidth = Math.max(0.5, w*0.014);
    for (let i=0;i<3;i++) { ctx.beginPath(); ctx.moveTo(x+w*0.6, yEave+h*(0.13+i*0.04)); ctx.lineTo(x+w*0.76, yEave+h*(0.13+i*0.04)); ctx.stroke(); }
    // Préau (auvent latéral sur poteaux)
    ctx.fillStyle = "rgba(124,100,52,0.7)"; ctx.fillRect(x+w*0.02, yEave, w*0.12, h*0.22);
    ctx.fillStyle = "#503614"; ctx.fillRect(x+w*0.03, yEave+h*0.22, w*0.025, h*0.14);
    return;
  }

  if (variant === "library") {
    // ── BIBLIOTHÈQUE — rotonde à dôme + parvis à colonnes ──────────────
    // Parvis
    ctx.fillStyle = "#a89a82"; ctx.fillRect(x+w*0.3, y+h*0.72, w*0.4, h*0.16);
    // Rotonde
    ctx.fillStyle = "#9c8c6e"; ctx.beginPath(); ctx.arc(x+w*0.5, y+h*0.46, w*0.32, 0, Math.PI*2); ctx.fill();
    // Dôme à degrés
    ctx.fillStyle = "#7c7058"; ctx.beginPath(); ctx.arc(x+w*0.5, y+h*0.44, w*0.24, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#675c48"; ctx.beginPath(); ctx.arc(x+w*0.5, y+h*0.42, w*0.15, 0, Math.PI*2); ctx.fill();
    // Oculus lumineux
    ctx.fillStyle = lit; ctx.beginPath(); ctx.arc(x+w*0.5, y+h*0.42, w*0.05, 0, Math.PI*2); ctx.fill();
    // Colonnes du porche
    ctx.fillStyle = "#e7dfc8";
    for (let i=0;i<3;i++) ctx.fillRect(x+w*(0.38+i*0.1), y+h*0.7, w*0.04, h*0.14);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.beginPath(); ctx.arc(x+w*0.42, y+h*0.36, w*0.1, 0, Math.PI*2); ctx.fill();
    return;
  }

  if (variant === "academy" || variant === "university") {
    // ── ACADÉMIE / UNIVERSITÉ — cloître, cour, tour-horloge ────────────
    const uni = variant === "university";
    // Bâtiment en carré autour d'une cour (cloître)
    ctx.fillStyle = uni ? "#7c7464" : "#94855c";
    ctx.fillRect(x+w*0.1, y+h*0.16, w*0.8, h*0.66);
    ctx.fillStyle = "#88a04c"; ctx.fillRect(x+w*0.3, y+h*0.34, w*0.4, h*0.32);
    // Arcades de la cour
    ctx.fillStyle = "rgba(40,30,16,0.4)";
    for (let i=0;i<4;i++) { ctx.beginPath(); ctx.arc(x+w*(0.34+i*0.108), y+h*0.66, w*0.034, Math.PI, 0); ctx.fill(); }
    // Toits du carré : liserés
    ctx.fillStyle = "rgba(255,245,225,0.16)"; ctx.fillRect(x+w*0.1, y+h*0.16, w*0.8, h*0.06);
    ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fillRect(x+w*0.1, y+h*0.76, w*0.8, h*0.06);
    // Tour-horloge (université) ou fronton (académie)
    if (uni) {
      ctx.fillStyle = "#6c6454"; ctx.fillRect(x+w*0.44, y+h*0.0, w*0.12, h*0.2);
      ctx.fillStyle = "#48423a";
      ctx.beginPath(); ctx.moveTo(x+w*0.42, y+h*0.02); ctx.lineTo(x+w*0.5, y-h*0.1); ctx.lineTo(x+w*0.58, y+h*0.02); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#e8dcae"; ctx.beginPath(); ctx.arc(x+w*0.5, y+h*0.1, w*0.035, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#3c342a"; ctx.lineWidth = Math.max(0.5, w*0.012);
      ctx.beginPath(); ctx.moveTo(x+w*0.5, y+h*0.1); ctx.lineTo(x+w*0.5, y+h*0.075); ctx.stroke();
    } else {
      ctx.fillStyle = "#d8cba8";
      ctx.beginPath(); ctx.moveTo(x+w*0.36, y+h*0.16); ctx.lineTo(x+w*0.5, y+h*0.04); ctx.lineTo(x+w*0.64, y+h*0.16); ctx.closePath(); ctx.fill();
    }
    // Fenêtres sur l'aile sud
    ctx.fillStyle = lit;
    for (let i=0;i<4;i++) ctx.fillRect(x+w*(0.16+i*0.18), y+h*0.7, w*0.07, h*0.07);
    return;
  }

  if (variant === "station") {
    // ── STATION CIVIQUE FUTURISTE — quai courbe, rail magnétique, écrans ──
    ctx.fillStyle = "#303848";
    ctx.beginPath(); ctx.moveTo(x+w*0.08,y+h*0.72); ctx.quadraticCurveTo(x+w*0.5,y+h*0.24,x+w*0.92,y+h*0.72); ctx.lineTo(x+w*0.92,y+h*0.84); ctx.quadraticCurveTo(x+w*0.5,y+h*0.54,x+w*0.08,y+h*0.84); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(80,160,255,0.18)";
    ctx.beginPath(); ctx.moveTo(x+w*0.16,y+h*0.68); ctx.quadraticCurveTo(x+w*0.5,y+h*0.3,x+w*0.84,y+h*0.68); ctx.lineTo(x+w*0.84,y+h*0.74); ctx.quadraticCurveTo(x+w*0.5,y+h*0.42,x+w*0.16,y+h*0.74); ctx.closePath(); ctx.fill();
    const rPulse = 0.6+0.3*Math.sin(t/350);
    ctx.strokeStyle = `rgba(60,200,255,${rPulse.toFixed(2)})`; ctx.lineWidth = Math.max(2,w*0.045); ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(x+w*0.06,y+h*0.78); ctx.lineTo(x+w*0.94,y+h*0.78); ctx.stroke();
    ctx.lineCap="square";
    const scA = 0.4+0.25*Math.sin(t/500);
    ctx.fillStyle = `rgba(40,180,255,${scA.toFixed(2)})`;
    ctx.fillRect(x+w*0.2,y+h*0.32,w*0.16,h*0.1);
    ctx.fillRect(x+w*0.64,y+h*0.32,w*0.16,h*0.1);
    ctx.fillStyle = `rgba(255,200,40,${(scA*0.8).toFixed(2)})`;
    ctx.fillRect(x+w*0.42,y+h*0.3,w*0.16,h*0.12);
    ctx.fillStyle = "#5a6070";
    ctx.fillRect(x+w*0.48,y+h*0.1,w*0.04,h*0.2);
    ctx.fillStyle = `rgba(60,200,255,${(0.5+0.4*Math.sin(t/400)).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.1,Math.max(1.5,w*0.05),0,Math.PI*2); ctx.fill();
    return;
  }
  if (variant === "datavault") {
    // ── COFFRE DE DONNÉES — cylindre serveur, flux de données circulaires ──
    const flowA = (t/700)%(Math.PI*2);
    ctx.fillStyle = "#1e2830";
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.35,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = "rgba(0,220,150,0.45)"; ctx.lineWidth = Math.max(1,w*0.022);
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.35,0,Math.PI*2); ctx.stroke();
    for (let ri = 0; ri < 4; ri++) {
      const alpha = 0.3+0.3*Math.sin(flowA+ri*0.8);
      ctx.strokeStyle = `rgba(0,${200+ri*15},${130+ri*20},${alpha.toFixed(2)})`; ctx.lineWidth = Math.max(0.5,w*0.016);
      ctx.beginPath(); ctx.ellipse(x+w*0.5,y+h*(0.34+ri*0.1),w*(0.26-ri*0.02),h*0.034,0,0,Math.PI*2); ctx.stroke();
    }
    const dotA = 0.7+0.3*Math.abs(Math.sin(flowA));
    ctx.fillStyle = `rgba(0,255,160,${dotA.toFixed(2)})`;
    for (let di = 0; di < 5; di++) {
      const da = flowA + di*Math.PI*2/5;
      ctx.beginPath(); ctx.arc(x+w*(0.5+Math.cos(da)*0.26),y+h*(0.52+Math.sin(da)*0.18),Math.max(1.5,w*0.032),0,Math.PI*2); ctx.fill();
    }
    ctx.fillStyle = `rgba(0,200,140,${(0.5+0.35*Math.sin(flowA*2)).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.1,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = `rgba(180,255,230,${(0.7+0.3*Math.sin(flowA*3)).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.04,0,Math.PI*2); ctx.fill();
    return;
  }
  if (variant === "observatory") {
    // ── OBSERVATOIRE — dôme, antenne scan rotative ────────────────────────
    const scanA = (t/2200)%(Math.PI*2);
    ctx.fillStyle = "#2e3544";
    ctx.beginPath();
    for (let i=0; i<6; i++) { const a=i*Math.PI/3; const px2=x+w*(0.5+Math.cos(a)*0.42),py2=y+h*(0.62+Math.sin(a)*0.3); if(i===0)ctx.moveTo(px2,py2);else ctx.lineTo(px2,py2); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(80,110,200,0.28)";
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.3,Math.PI,0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(140,180,255,0.65)"; ctx.lineWidth = Math.max(0.5,w*0.022);
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.3,Math.PI,0); ctx.stroke();
    for (let ni=1; ni<4; ni++) { const na=Math.PI*(ni/4);
      ctx.strokeStyle = "rgba(100,150,220,0.35)"; ctx.lineWidth = Math.max(0.5,w*0.014);
      ctx.beginPath(); ctx.moveTo(x+w*0.5,y+h*0.52); ctx.lineTo(x+w*(0.5+Math.cos(na)*0.3),y+h*(0.52-Math.sin(na)*0.22)); ctx.stroke();
    }
    const armX = x+w*(0.5+Math.cos(scanA-Math.PI/2)*0.22), armY = y+h*(0.52+Math.sin(scanA-Math.PI/2)*0.16);
    ctx.strokeStyle = "#7088a0"; ctx.lineWidth = Math.max(1,w*0.03); ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(x+w*0.5,y+h*0.52); ctx.lineTo(armX,armY); ctx.stroke();
    ctx.lineCap="square";
    ctx.fillStyle = "#a0b8cc";
    ctx.beginPath(); ctx.arc(armX,armY,Math.max(2,w*0.08),0,Math.PI*2); ctx.fill();
    ctx.fillStyle = `rgba(100,200,255,${(0.5+0.4*Math.abs(Math.sin(scanA))).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(armX,armY,Math.max(1.5,w*0.05),0,Math.PI*2); ctx.fill();
    return;
  }
  if (variant === "spire" || variant === "archive") {
    // ── FLÈCHE ADMIN / ARCHIVES — tour élancée cyberpunk ─────────────────
    const isArchive = variant === "archive";
    const bCol = isArchive ? "#2a3848" : "#3a4050";
    ctx.fillStyle = bCol; ctx.fillRect(x+w*0.36,y+h*0.18,w*0.28,h*0.72);
    ctx.fillStyle = isArchive ? "#242f3c" : "#303848";
    ctx.fillRect(x+w*0.28,y+h*0.32,w*0.44,h*0.56);
    ctx.fillRect(x+w*0.2,y+h*0.5,w*0.6,h*0.38);
    ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fillRect(x+w*0.64,y+h*0.18,w*0.12,h*0.72);
    const ledCol = isArchive ? "rgba(255,160,40," : "rgba(60,180,255,";
    for (let li=0; li<5; li++) {
      const lAlpha = 0.4+0.3*Math.sin(t/400+li*0.7);
      ctx.fillStyle = ledCol+lAlpha.toFixed(2)+")";
      ctx.fillRect(x+w*0.22,y+h*(0.52+li*0.07),w*0.56,Math.max(1,h*0.022));
    }
    ctx.fillStyle = lit;
    for (let ri=0; ri<4; ri++) for (let ci=0; ci<2; ci++)
      ctx.fillRect(x+w*(0.3+ci*0.22),y+h*(0.22+ri*0.07),w*0.1,Math.max(1,h*0.042));
    if (isArchive) {
      ctx.strokeStyle = `rgba(255,180,60,${(0.45+0.3*Math.sin(t/600)).toFixed(2)})`; ctx.lineWidth = Math.max(0.5,w*0.018);
      ctx.beginPath(); ctx.ellipse(x+w*0.5,y+h*0.75,w*0.2,h*0.06,0,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x+w*0.5,y+h*0.75,w*0.12,h*0.036,0,0,Math.PI*2); ctx.stroke();
    } else {
      ctx.fillStyle = "#c0d0e0";
      ctx.beginPath(); ctx.moveTo(x+w*0.44,y+h*0.18); ctx.lineTo(x+w*0.5,y+h*0.04); ctx.lineTo(x+w*0.56,y+h*0.18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(255,80,80,${(0.5+0.5*Math.abs(Math.sin(t/700))).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.04,Math.max(1.5,w*0.04),0,Math.PI*2); ctx.fill();
    }
    return;
  }

  // Fallback : bâtiment civique à colonnes générique
  ctx.fillStyle = library ? "#5a4a2e" : "#9f7b2a";
  ctx.fillRect(x + pad, y + h * 0.26, w - pad * 2, h * 0.6);
  ctx.fillStyle = library ? "#e8dcae" : "#e8c96a";
  ctx.beginPath();
  ctx.moveTo(x + pad * 0.7, y + h * 0.26);
  ctx.lineTo(x + w * 0.5, y + h * 0.1);
  ctx.lineTo(x + w - pad * 0.7, y + h * 0.26);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(20,12,5,0.62)";
  for (let ci = 0; ci < 3; ci += 1) {
    const cx = x + w * (0.22 + ci * 0.28);
    ctx.fillRect(cx - w * 0.025, y + h * 0.36, w * 0.05, h * 0.42);
  }
}

export { drawEngineSprite, drawHouseShape, drawPublicShape, BUILDING_HEIGHTS };
