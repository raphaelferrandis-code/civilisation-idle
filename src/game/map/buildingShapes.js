/* eslint-disable */
import { CM } from './layout.js';
import { cmLitColor } from './renderWorld.js';
import { drawEngineSprite } from './engineSprites.js';

function drawTinyCamp(x, y, w, h, pad, seed, variant, now) {
  const ctx = CM.ctx;
  const t = now || 0;
  if (variant === "firepit") {
    // Grand feu central — halo, bûches, braises, 3 flammes animées
    const cx = x + w * 0.5, cy = y + h * 0.5;
    // Halo rayonnant (grand, en premier pour rester derrière)
    const halo = 0.20 + 0.10 * Math.abs(Math.sin(t / 520));
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.46);
    rg.addColorStop(0, `rgba(255,160,30,${halo.toFixed(2)})`);
    rg.addColorStop(1, "rgba(255,80,5,0)");
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(cx, cy, w * 0.46, 0, Math.PI * 2); ctx.fill();
    // Cercle de pierres
    ctx.fillStyle = "#5a4830";
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * w * 0.22, cy + Math.sin(a) * h * 0.18, w * 0.044, 0, Math.PI * 2); ctx.fill();
    }
    // Bûches en croix
    ctx.lineWidth = Math.max(2, w * 0.06); ctx.lineCap = "round";
    ctx.strokeStyle = "#6a3c0c";
    ctx.beginPath(); ctx.moveTo(cx - w*0.18, cy + h*0.06); ctx.lineTo(cx + w*0.18, cy - h*0.06); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + w*0.18, cy + h*0.06); ctx.lineTo(cx - w*0.18, cy - h*0.06); ctx.stroke();
    ctx.lineCap = "square";
    // Braises
    ctx.fillStyle = "rgba(200,60,5,0.8)";
    ctx.beginPath(); ctx.ellipse(cx, cy + h*0.02, w*0.13, h*0.09, 0, 0, Math.PI*2); ctx.fill();
    // 3 flammes animées
    const f1 = 0.5+0.5*Math.sin(t/170), f2 = 0.5+0.5*Math.sin(t/140+1.3), f3 = 0.5+0.5*Math.sin(t/200+2.7);
    ctx.fillStyle = `rgba(255,85,8,${(0.78+f1*0.22).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(cx-w*0.1,cy+h*0.04); ctx.quadraticCurveTo(cx-w*0.16,cy-h*(0.18+f1*0.08),cx,cy-h*(0.26+f1*0.07)); ctx.quadraticCurveTo(cx+w*0.16,cy-h*(0.18+f2*0.06),cx+w*0.1,cy+h*0.04); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,195,20,${(0.82+f2*0.18).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(cx-w*0.07,cy+h*0.04); ctx.quadraticCurveTo(cx-w*0.04,cy-h*(0.22+f2*0.1),cx,cy-h*(0.32+f2*0.08)); ctx.quadraticCurveTo(cx+w*0.04,cy-h*(0.22+f3*0.07),cx+w*0.07,cy+h*0.04); ctx.closePath(); ctx.fill();
    // Étincelle centrale
    ctx.fillStyle = `rgba(255,250,200,${(0.7+f3*0.3).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cx, cy - h*(0.3+f2*0.07), Math.max(1, w*0.04), 0, Math.PI*2); ctx.fill();
  } else {
    // TENTE — vue de dessus : polygone avec coutures
    ctx.fillStyle = "#c89a3a";
    ctx.beginPath();
    ctx.moveTo(x+w*0.5, y+h*0.18); ctx.lineTo(x+w*0.82, y+h*0.66);
    ctx.lineTo(x+w*0.5, y+h*0.74); ctx.lineTo(x+w*0.18, y+h*0.66);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(80,48,10,0.28)";
    ctx.beginPath(); ctx.moveTo(x+w*0.5,y+h*0.18); ctx.lineTo(x+w*0.82,y+h*0.66); ctx.lineTo(x+w*0.5,y+h*0.46); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(90,55,10,0.45)"; ctx.lineWidth = Math.max(0.5,w*0.022);
    ctx.beginPath(); ctx.moveTo(x+w*0.5,y+h*0.18); ctx.lineTo(x+w*0.5,y+h*0.74); ctx.stroke();
    ctx.fillStyle = "rgba(30,16,4,0.6)";
    ctx.beginPath(); ctx.moveTo(x+w*0.43,y+h*0.66); ctx.lineTo(x+w*0.5,y+h*0.58); ctx.lineTo(x+w*0.57,y+h*0.66); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#7a4e10"; ctx.fillRect(x+w*0.483,y+h*0.14,w*0.034,h*0.1);
  }
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
    // ── CABANE RONDE — vue de dessus, toit de chaume conique ──────────
    ctx.fillStyle = "#9a6e2a";
    ctx.beginPath(); ctx.ellipse(x+w*0.5,y+h*0.56,w*0.36,h*0.32,0,0,Math.PI*2); ctx.fill();
    // Anneaux de chaume (du bord vers le centre = de clair à foncé)
    const thatch = ["#8a5c18","#7a4e12","#6a400c","#522e08"];
    for (let ri=0; ri<4; ri++) {
      ctx.fillStyle = thatch[ri];
      ctx.beginPath(); ctx.ellipse(x+w*0.5,y+h*0.54,w*(0.32-ri*0.07),h*(0.29-ri*0.06),0,0,Math.PI*2); ctx.fill();
    }
    // Pointe centrale
    ctx.fillStyle = "#3a2008"; ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.055,0,Math.PI*2); ctx.fill();
    // Entrée
    ctx.fillStyle = "rgba(25,12,3,0.65)"; ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.76,w*0.065,Math.PI,0); ctx.fill();
    return;
  }

  if (variant === "longhouse") {
    // ── LONGUE MAISON — rectangle allongé, toit en bâtière ───────────
    ctx.fillStyle = "#8a6020";
    ctx.fillRect(x+w*0.1,y+h*0.36,w*0.8,h*0.46);
    // Arête faîtière
    ctx.fillStyle = "#5a3a0e"; ctx.fillRect(x+w*0.1,y+h*0.36,w*0.8,h*0.07);
    // Stries de chaume transversales
    ctx.strokeStyle = "rgba(40,22,6,0.32)"; ctx.lineWidth = Math.max(0.5,w*0.018);
    for (let i=1; i<6; i++) { ctx.beginPath(); ctx.moveTo(x+w*(0.12+i*0.13),y+h*0.36); ctx.lineTo(x+w*(0.12+i*0.13),y+h*0.82); ctx.stroke(); }
    // Pignons triangulaires (bout gauche + droit)
    ctx.fillStyle = "#7a5016";
    ctx.beginPath(); ctx.moveTo(x+w*0.1,y+h*0.36); ctx.lineTo(x+w*0.18,y+h*0.22); ctx.lineTo(x+w*0.26,y+h*0.36); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x+w*0.74,y+h*0.36); ctx.lineTo(x+w*0.82,y+h*0.22); ctx.lineTo(x+w*0.9,y+h*0.36); ctx.closePath(); ctx.fill();
    // Porte
    ctx.fillStyle = "rgba(28,14,4,0.7)"; ctx.fillRect(x+w*0.45,y+h*0.62,w*0.1,h*0.2);
    return;
  }

  if (variant === "townhouse") {
    // ── MAISON À COLOMBAGES — torchis + pans de bois ─────────────────
    ctx.fillStyle = "#c8a060"; ctx.fillRect(x+w*0.17,y+h*0.4,w*0.66,h*0.44);
    // Colombages (croisillons)
    ctx.strokeStyle = "#5a3610"; ctx.lineWidth = Math.max(1,w*0.032);
    ctx.beginPath(); ctx.moveTo(x+w*0.17,y+h*0.4); ctx.lineTo(x+w*0.5,y+h*0.52); ctx.lineTo(x+w*0.83,y+h*0.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+w*0.17,y+h*0.58); ctx.lineTo(x+w*0.83,y+h*0.58); ctx.stroke();
    // Toit à deux versants (face avant visible)
    ctx.fillStyle = "#8c3c1a";
    ctx.beginPath(); ctx.moveTo(x+w*0.13,y+h*0.43); ctx.lineTo(x+w*0.5,y+h*0.14); ctx.lineTo(x+w*0.87,y+h*0.43); ctx.lineTo(x+w*0.83,y+h*0.4); ctx.lineTo(x+w*0.5,y+h*0.18); ctx.lineTo(x+w*0.17,y+h*0.4); ctx.closePath(); ctx.fill();
    // Faîtage
    ctx.fillStyle = "#6a2a0e"; ctx.fillRect(x+w*0.47,y+h*0.13,w*0.06,h*0.05);
    // Fenêtres
    ctx.fillStyle = lit; ctx.fillRect(x+w*0.22,y+h*0.5,w*0.12,h*0.08); ctx.fillRect(x+w*0.66,y+h*0.5,w*0.12,h*0.08);
    // Porte
    ctx.fillStyle = "rgba(24,12,4,0.7)"; ctx.fillRect(x+w*0.44,y+h*0.66,w*0.12,h*0.18);
    return;
  }

  if (variant === "courtyard") {
    // ── MAISON À COUR — U visible depuis le ciel ─────────────────────
    ctx.fillStyle = "#c0a058"; ctx.fillRect(x+w*0.12,y+h*0.28,w*0.76,h*0.58);
    // Cour intérieure
    ctx.fillStyle = "#c4a462"; ctx.fillRect(x+w*0.3,y+h*0.44,w*0.4,h*0.3);
    // Toit des ailes (ardoise rouge)
    ctx.fillStyle = "#8c3820";
    ctx.fillRect(x+w*0.12,y+h*0.28,w*0.76,h*0.09);
    ctx.fillRect(x+w*0.12,y+h*0.28,w*0.11,h*0.58); ctx.fillRect(x+w*0.77,y+h*0.28,w*0.11,h*0.58);
    // Tuiles (lignes)
    ctx.strokeStyle = "rgba(55,18,6,0.3)"; ctx.lineWidth = Math.max(0.5,w*0.016);
    for (let i=1; i<4; i++) ctx.strokeRect(x+w*(0.14+i*0.05),y+h*0.3,w*(0.72-i*0.1),h*(0.54-i*0.05));
    // Fenêtres
    ctx.fillStyle = lit; ctx.fillRect(x+w*0.18,y+h*0.46,w*0.08,h*0.07); ctx.fillRect(x+w*0.74,y+h*0.46,w*0.08,h*0.07);
    return;
  }

  if (variant === "stonehouse") {
    // ── MAISON DE PIERRE — murs en moellon, toit ardoise ─────────────
    ctx.fillStyle = "#9a8c78"; ctx.fillRect(x+w*0.15,y+h*0.38,w*0.7,h*0.46);
    // Joints de maçonnerie
    ctx.strokeStyle = "rgba(55,45,30,0.38)"; ctx.lineWidth = Math.max(0.5,w*0.018);
    for (let r=1; r<3; r++) { ctx.beginPath(); ctx.moveTo(x+w*0.15,y+h*(0.38+r*0.15)); ctx.lineTo(x+w*0.85,y+h*(0.38+r*0.15)); ctx.stroke(); }
    for (let c=1; c<4; c++) { ctx.beginPath(); ctx.moveTo(x+w*(0.15+c*0.17),y+h*0.38); ctx.lineTo(x+w*(0.15+c*0.17),y+h*0.84); ctx.stroke(); }
    // Toit ardoise (2 versants)
    ctx.fillStyle = "#58534a";
    ctx.beginPath(); ctx.moveTo(x+w*0.11,y+h*0.42); ctx.lineTo(x+w*0.5,y+h*0.14); ctx.lineTo(x+w*0.89,y+h*0.42); ctx.lineTo(x+w*0.84,y+h*0.38); ctx.lineTo(x+w*0.5,y+h*0.18); ctx.lineTo(x+w*0.16,y+h*0.38); ctx.closePath(); ctx.fill();
    // Cheminée
    ctx.fillStyle = "#78685a"; ctx.fillRect(x+w*0.62,y+h*0.18,w*0.09,h*0.12);
    ctx.fillStyle = "rgba(60,50,38,0.65)"; ctx.fillRect(x+w*0.61,y+h*0.16,w*0.11,h*0.04);
    // Porte en arc brisé
    ctx.fillStyle = "rgba(18,10,4,0.72)";
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.68,w*0.065,Math.PI,0); ctx.fill();
    ctx.fillRect(x+w*0.435,y+h*0.68,w*0.13,h*0.16);
    // Fenêtres à croisée
    ctx.fillStyle = lit; ctx.fillRect(x+w*0.22,y+h*0.52,w*0.11,h*0.09); ctx.fillRect(x+w*0.67,y+h*0.52,w*0.11,h*0.09);
    ctx.strokeStyle = "rgba(80,60,30,0.5)"; ctx.lineWidth = Math.max(0.5,w*0.016);
    for (const wx of [0.22, 0.67]) { ctx.beginPath(); ctx.moveTo(x+w*(wx+0.055),y+h*0.52); ctx.lineTo(x+w*(wx+0.055),y+h*0.61); ctx.stroke(); }
    return;
  }

  if (variant === "manor") {
    // ── MANOIR — corps principal + aile + tour d'angle ───────────────
    ctx.fillStyle = "#8a7860"; ctx.fillRect(x+w*0.08,y+h*0.28,w*0.84,h*0.6);
    // Toit central ardoise foncée
    ctx.fillStyle = "#484440";
    ctx.beginPath(); ctx.moveTo(x+w*0.08,y+h*0.3); ctx.lineTo(x+w*0.5,y+h*0.1); ctx.lineTo(x+w*0.92,y+h*0.3); ctx.lineTo(x+w*0.88,y+h*0.26); ctx.lineTo(x+w*0.5,y+h*0.14); ctx.lineTo(x+w*0.12,y+h*0.26); ctx.closePath(); ctx.fill();
    // Tour d'angle (coin supérieur gauche)
    ctx.fillStyle = "#7a6858"; ctx.fillRect(x+w*0.08,y+h*0.2,w*0.22,h*0.28);
    ctx.fillStyle = "#404038"; ctx.fillRect(x+w*0.06,y+h*0.16,w*0.26,h*0.07);
    ctx.fillRect(x+w*0.1,y+h*0.1,w*0.06,h*0.09); ctx.fillRect(x+w*0.22,y+h*0.1,w*0.06,h*0.09);
    // Rangée de fenêtres
    ctx.fillStyle = lit;
    for (let i=0; i<4; i++) ctx.fillRect(x+w*(0.24+i*0.16),y+h*0.46,w*0.1,h*0.08);
    // Porte d'entrée
    ctx.fillStyle = "#3a2610"; ctx.fillRect(x+w*0.44,y+h*0.68,w*0.12,h*0.2);
    ctx.fillStyle = "rgba(210,170,80,0.5)"; ctx.fillRect(x+w*0.47,y+h*0.73,w*0.02,h*0.04);
    return;
  }

  if (variant === "block" || variant === "tenement") {
    // ── IMMEUBLE — brique, toit plat, grille de fenêtres ─────────────
    const tall = variant === "tenement";
    ctx.fillStyle = tall ? "#7a5028" : (band>=5 ? "#686448" : "#7a5820");
    ctx.fillRect(x+pad,y+h*(tall?0.12:0.18),w-pad*2,h*(tall?0.74:0.68));
    // Toit plat + rebord
    ctx.fillStyle = tall ? "#523210" : (band>=5 ? "#504830" : "#503810");
    ctx.fillRect(x+pad*0.6,y+h*(tall?0.08:0.14),w-pad*1.2,h*0.06);
    // Cheminées
    ctx.fillStyle = "#3c2a10";
    ctx.fillRect(x+w*0.28,y+h*(tall?0.04:0.09),w*0.07,h*0.07); ctx.fillRect(x+w*0.64,y+h*(tall?0.04:0.09),w*0.07,h*0.07);
    // Grille de fenêtres
    ctx.fillStyle = lit;
    const rows=tall?4:3, cols=3;
    for (let r=0; r<rows; r++) for (let c=0; c<cols; c++)
      if ((c+r+s)%3!==0) ctx.fillRect(x+w*(0.22+c*0.22),y+h*(tall?0.2:0.26)+r*h*0.15,w*0.1,Math.max(1,h*0.08));
    // Porte
    ctx.fillStyle = "rgba(18,10,3,0.7)"; ctx.fillRect(x+w*0.43,y+h*(tall?0.78:0.74),w*0.14,h*0.08);
    // Ombre côté droit
    ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.fillRect(x+w*0.72,y+h*(tall?0.12:0.18),w*0.12,h*(tall?0.74:0.68));
    return;
  }

  if (variant === "tower") {
    // ── TOUR RÉSIDENTIELLE — moderniste, bandes vitrées ───────────────
    const cBody = band>=6 ? "#585855" : band>=5 ? "#5e5a4e" : "#646058";
    ctx.fillStyle = cBody; ctx.fillRect(x+w*0.24,y+h*0.1,w*0.52,h*0.82);
    // Couronnement
    ctx.fillStyle = band>=6 ? "rgba(100,190,255,0.55)" : "#323028";
    ctx.fillRect(x+w*0.2,y+h*0.04,w*0.6,h*0.08);
    if (band>=6) { ctx.strokeStyle = "rgba(90,190,255,0.75)"; ctx.lineWidth = Math.max(1,w*0.028); ctx.beginPath(); ctx.moveTo(x+w*0.5,y+h*0.04); ctx.lineTo(x+w*0.5,y-h*0.04); ctx.stroke(); }
    // Bandes vitrées horizontales (nuit = éclairées)
    ctx.fillStyle = lit;
    const rows = band>=5 ? 8 : 5;
    for (let r=0; r<rows; r++) ctx.fillRect(x+w*0.28,y+h*(0.16+r*(0.64/rows)),w*0.44,Math.max(1,h*0.038));
    // Reflet / ombre latérale
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(x+w*0.64,y+h*0.1,w*0.12,h*0.82);
    ctx.fillStyle = "rgba(255,255,255,0.07)"; ctx.fillRect(x+w*0.24,y+h*0.1,w*0.1,h*0.82);
    return;
  }

  if (variant === "megablock" || variant === "arcologyhome") {
    // ── MEGABLOCK / ARCO-HOME — haute densité futuriste ───────────────
    const tech = variant === "arcologyhome";
    ctx.fillStyle = tech ? "#485060" : "#525046";
    ctx.fillRect(x+w*0.08,y+h*0.16,w*0.84,h*0.74);
    // Retraits progressifs (setbacks)
    ctx.fillStyle = tech ? "#384050" : "#424038";
    ctx.fillRect(x+w*0.14,y+h*0.08,w*0.72,h*0.1);
    ctx.fillRect(x+w*0.2,y+h*0.02,w*0.6,h*0.08);
    // Grille de fenêtres
    ctx.fillStyle = tech ? `rgba(70,190,255,${(0.45+(CM.nightF||0)*0.45).toFixed(2)})` : lit;
    const rows2=tech?6:5, cols2=tech?5:4;
    for (let r=0; r<rows2; r++) for (let c=0; c<cols2; c++)
      if (tech||(r+c+s)%4!==0) ctx.fillRect(x+w*(0.16+c*(0.68/Math.max(1,cols2-1))),y+h*(0.22+r*0.1),w*0.07,Math.max(1,h*0.04));
    if (tech) {
      ctx.strokeStyle = `rgba(50,175,240,${(0.28+(CM.nightF||0)*0.42).toFixed(2)})`; ctx.lineWidth = Math.max(0.5,w*0.018);
      ctx.beginPath(); ctx.moveTo(x+w*0.12,y+h*0.82); ctx.lineTo(x+w*0.5,y+h*0.1); ctx.lineTo(x+w*0.88,y+h*0.82); ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fillRect(x+w*0.74,y+h*0.16,w*0.18,h*0.74);
    return;
  }

  // fallback
  ctx.fillStyle = "#9a7426"; ctx.fillRect(x+pad,y+pad,w-pad*2,h-pad*2);
}

function drawPublicShape(type, x, y, w, h, pad, tier, variant, now) {
  const ctx = CM.ctx;
  const band = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 0;
  const library = type === "library";
  const gold = library ? "#e8dcae" : "#e8c96a";
  const lit = cmLitColor(band);
  const body = library ? "#5a4a2e"
    : variant === "palace" ? "#a8893e"
    : variant === "keep" ? "#77715d"
    : band >= 5 ? "#5e5746"
    : "#9f7b2a";
  if (variant === "shrine" || variant === "firepit") {
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(x + w * 0.5, y + h * 0.52, w * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(30,18,7,0.45)";
    ctx.fillRect(x + w * 0.38, y + h * 0.52, w * 0.24, h * 0.18);
    return;
  }
  if (variant === "keep") {
    ctx.fillStyle = body;
    ctx.fillRect(x + w * 0.2, y + h * 0.22, w * 0.6, h * 0.62);
    ctx.fillStyle = "#4a4639";
    ctx.fillRect(x + w * 0.14, y + h * 0.16, w * 0.18, h * 0.18);
    ctx.fillRect(x + w * 0.68, y + h * 0.16, w * 0.18, h * 0.18);
    return;
  }
  if (variant === "station") {
    // ── STATION CIVIQUE FUTURISTE — quai courbe, rail magnétique, écrans ──
    const t2 = now || 0;
    // Corps aérodynamique (profil en arc)
    ctx.fillStyle = "#303848";
    ctx.beginPath(); ctx.moveTo(x+w*0.08,y+h*0.72); ctx.quadraticCurveTo(x+w*0.5,y+h*0.24,x+w*0.92,y+h*0.72); ctx.lineTo(x+w*0.92,y+h*0.84); ctx.quadraticCurveTo(x+w*0.5,y+h*0.54,x+w*0.08,y+h*0.84); ctx.closePath(); ctx.fill();
    // Verrière vitrée
    ctx.fillStyle = "rgba(80,160,255,0.18)";
    ctx.beginPath(); ctx.moveTo(x+w*0.16,y+h*0.68); ctx.quadraticCurveTo(x+w*0.5,y+h*0.3,x+w*0.84,y+h*0.68); ctx.lineTo(x+w*0.84,y+h*0.74); ctx.quadraticCurveTo(x+w*0.5,y+h*0.42,x+w*0.16,y+h*0.74); ctx.closePath(); ctx.fill();
    // Rail magnétique lumineux
    const rPulse = 0.6+0.3*Math.sin(t2/350);
    ctx.strokeStyle = `rgba(60,200,255,${rPulse.toFixed(2)})`; ctx.lineWidth = Math.max(2,w*0.045); ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(x+w*0.06,y+h*0.78); ctx.lineTo(x+w*0.94,y+h*0.78); ctx.stroke();
    ctx.lineCap="square";
    // Panneaux d'info animés
    const scA = 0.4+0.25*Math.sin(t2/500);
    ctx.fillStyle = `rgba(40,180,255,${scA.toFixed(2)})`;
    ctx.fillRect(x+w*0.2,y+h*0.32,w*0.16,h*0.1);
    ctx.fillRect(x+w*0.64,y+h*0.32,w*0.16,h*0.1);
    ctx.fillStyle = `rgba(255,200,40,${(scA*0.8).toFixed(2)})`;
    ctx.fillRect(x+w*0.42,y+h*0.3,w*0.16,h*0.12);
    // Pylônes
    ctx.fillStyle = "#5a6070";
    ctx.fillRect(x+w*0.48,y+h*0.1,w*0.04,h*0.2);
    ctx.fillStyle = `rgba(60,200,255,${(0.5+0.4*Math.sin(t2/400)).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.1,Math.max(1.5,w*0.05),0,Math.PI*2); ctx.fill();
    return;
  }
  if (variant === "datavault") {
    // ── COFFRE DE DONNÉES — cylindre serveur, flux de données circulaires ──
    const t2 = now || 0;
    const flowA = (t2/700)%(Math.PI*2);
    // Tour cylindrique
    ctx.fillStyle = "#1e2830";
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.35,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = "rgba(0,220,150,0.45)"; ctx.lineWidth = Math.max(1,w*0.022);
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.35,0,Math.PI*2); ctx.stroke();
    // Anneaux de données animés
    for (let ri = 0; ri < 4; ri++) {
      const alpha = 0.3+0.3*Math.sin(flowA+ri*0.8);
      ctx.strokeStyle = `rgba(0,${200+ri*15},${130+ri*20},${alpha.toFixed(2)})`; ctx.lineWidth = Math.max(0.5,w*0.016);
      ctx.beginPath(); ctx.ellipse(x+w*0.5,y+h*(0.34+ri*0.1),w*(0.26-ri*0.02),h*0.034,0,0,Math.PI*2); ctx.stroke();
    }
    // Particules de données en orbite
    const dotA = 0.7+0.3*Math.abs(Math.sin(flowA));
    ctx.fillStyle = `rgba(0,255,160,${dotA.toFixed(2)})`;
    for (let di = 0; di < 5; di++) {
      const da = flowA + di*Math.PI*2/5;
      ctx.beginPath(); ctx.arc(x+w*(0.5+Math.cos(da)*0.26),y+h*(0.52+Math.sin(da)*0.18),Math.max(1.5,w*0.032),0,Math.PI*2); ctx.fill();
    }
    // Noyau central pulsant
    ctx.fillStyle = `rgba(0,200,140,${(0.5+0.35*Math.sin(flowA*2)).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.1,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = `rgba(180,255,230,${(0.7+0.3*Math.sin(flowA*3)).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.04,0,Math.PI*2); ctx.fill();
    return;
  }
  if (variant === "observatory") {
    // ── OBSERVATOIRE FUTURISTE — dôme, antenne scan rotative ──────────────
    const t2 = now || 0;
    const scanA = (t2/2200)%(Math.PI*2);
    // Base hexagonale
    ctx.fillStyle = "#2e3544";
    ctx.beginPath();
    for (let i=0; i<6; i++) { const a=i*Math.PI/3; const px2=x+w*(0.5+Math.cos(a)*0.42),py2=y+h*(0.62+Math.sin(a)*0.3); if(i===0)ctx.moveTo(px2,py2);else ctx.lineTo(px2,py2); }
    ctx.closePath(); ctx.fill();
    // Dôme vitré
    ctx.fillStyle = "rgba(80,110,200,0.28)";
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.3,Math.PI,0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(140,180,255,0.65)"; ctx.lineWidth = Math.max(0.5,w*0.022);
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.3,Math.PI,0); ctx.stroke();
    // Nervures du dôme
    for (let ni=1; ni<4; ni++) { const na=Math.PI*(ni/4);
      ctx.strokeStyle = "rgba(100,150,220,0.35)"; ctx.lineWidth = Math.max(0.5,w*0.014);
      ctx.beginPath(); ctx.moveTo(x+w*0.5,y+h*0.52); ctx.lineTo(x+w*(0.5+Math.cos(na)*0.3),y+h*(0.52-Math.sin(na)*0.22)); ctx.stroke();
    }
    // Bras d'antenne rotatif
    const armX = x+w*(0.5+Math.cos(scanA-Math.PI/2)*0.22), armY = y+h*(0.52+Math.sin(scanA-Math.PI/2)*0.16);
    ctx.strokeStyle = "#7088a0"; ctx.lineWidth = Math.max(1,w*0.03); ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(x+w*0.5,y+h*0.52); ctx.lineTo(armX,armY); ctx.stroke();
    ctx.lineCap="square";
    // Capteur parabolique
    ctx.fillStyle = "#a0b8cc";
    ctx.beginPath(); ctx.arc(armX,armY,Math.max(2,w*0.08),0,Math.PI*2); ctx.fill();
    // Faisceau de scan
    ctx.fillStyle = `rgba(100,200,255,${(0.5+0.4*Math.abs(Math.sin(scanA))).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(armX,armY,Math.max(1.5,w*0.05),0,Math.PI*2); ctx.fill();
    return;
  }
  if (variant === "spire" || variant === "archive") {
    // ── FLÈCHE ADMIN / ARCHIVES — tour élancée cyberpunk ─────────────────
    const t2 = now || 0;
    const isArchive = variant === "archive";
    // Corps principal à setbacks
    const bCol = isArchive ? "#2a3848" : "#3a4050";
    ctx.fillStyle = bCol; ctx.fillRect(x+w*0.36,y+h*0.18,w*0.28,h*0.72);
    ctx.fillStyle = isArchive ? "#242f3c" : "#303848";
    ctx.fillRect(x+w*0.28,y+h*0.32,w*0.44,h*0.56);
    ctx.fillRect(x+w*0.2,y+h*0.5,w*0.6,h*0.38);
    // Ombre latérale
    ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fillRect(x+w*0.64,y+h*0.18,w*0.12,h*0.72);
    // Bandes LED horizontales
    const ledCol = isArchive ? "rgba(255,160,40," : "rgba(60,180,255,";
    for (let li=0; li<5; li++) {
      const lAlpha = 0.4+0.3*Math.sin(t2/400+li*0.7);
      ctx.fillStyle = ledCol+lAlpha.toFixed(2)+")";
      ctx.fillRect(x+w*0.22,y+h*(0.52+li*0.07),w*0.56,Math.max(1,h*0.022));
    }
    // Fenêtres grille
    ctx.fillStyle = lit;
    for (let ri=0; ri<4; ri++) for (let ci=0; ci<2; ci++)
      ctx.fillRect(x+w*(0.3+ci*0.22),y+h*(0.22+ri*0.07),w*0.1,Math.max(1,h*0.042));
    if (isArchive) {
      // Disques de stockage (hologramme)
      ctx.strokeStyle = `rgba(255,180,60,${(0.45+0.3*Math.sin(t2/600)).toFixed(2)})`; ctx.lineWidth = Math.max(0.5,w*0.018);
      ctx.beginPath(); ctx.ellipse(x+w*0.5,y+h*0.75,w*0.2,h*0.06,0,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x+w*0.5,y+h*0.75,w*0.12,h*0.036,0,0,Math.PI*2); ctx.stroke();
    } else {
      // Spire pointue avec clignotant
      ctx.fillStyle = "#c0d0e0";
      ctx.beginPath(); ctx.moveTo(x+w*0.44,y+h*0.18); ctx.lineTo(x+w*0.5,y+h*0.04); ctx.lineTo(x+w*0.56,y+h*0.18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(255,80,80,${(0.5+0.5*Math.abs(Math.sin(t2/700))).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.04,Math.max(1.5,w*0.04),0,Math.PI*2); ctx.fill();
    }
    return;
  }
  // Batiment a colonnes (temple / marche / forum / hall / academie / palais)
  ctx.fillStyle = body;
  ctx.fillRect(x + pad, y + h * 0.26, w - pad * 2, h * 0.6);
  ctx.fillStyle = gold;                           // fronton triangulaire
  ctx.beginPath();
  ctx.moveTo(x + pad * 0.7, y + h * 0.26);
  ctx.lineTo(x + w * 0.5, y + h * 0.1);
  ctx.lineTo(x + w - pad * 0.7, y + h * 0.26);
  ctx.closePath();
  ctx.fill();
  const columns = tier >= 5 || variant === "palace" ? 5 : 3;
  ctx.fillStyle = "rgba(20,12,5,0.62)";
  for (let ci = 0; ci < columns; ci += 1) {
    const cx = x + w * (0.22 + ci * (0.56 / Math.max(1, columns - 1)));
    ctx.fillRect(cx - w * 0.025, y + h * 0.36, w * 0.05, h * 0.42);
  }
  if (variant === "palace" || variant === "temple" || variant === "forum" || band >= 4) {
    ctx.fillStyle = library ? "#e8dcae" : "#c0402f"; // banniere
    ctx.fillRect(x + w * 0.46, y + h * 0.28, w * 0.08, h * 0.3);
  }
  if (variant === "palace" || variant === "academy" || tier >= 6) {
    ctx.strokeStyle = gold;
    ctx.lineWidth = Math.max(1, w * 0.04);
    ctx.strokeRect(x + w * 0.16, y + h * 0.22, w * 0.68, h * 0.62);
  }
}

/* Engine sprites moved to engineSprites.js. */


export { drawEngineSprite, drawHouseShape, drawPublicShape };
