/* eslint-disable */

function drawCityEngineSprite(context) {
  const { ctx, id, tier, litWarm, litGold, ox, oy, sw, sh, px, strokeRect, now, band = 0, ei = 0 } = context;
  if (id === "foragers") {
    // Sol herbe sombre
    px(0.0, 0.58, 1.0, 0.42, "#131a09");

    // === BUISSON / ARBRE (droite) ===
    const tx = 0.70, ty = 0.60;
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
    // Fruits/baies (points colorés dans le feuillage)
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

    // === PANIER (gauche, posé au sol) ===
    const bkx = 0.2, bky = 0.72;
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath(); ctx.ellipse(ox + sw * bkx, oy + sh * (bky + 0.045), sw * 0.13, sh * 0.04, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#8a5520";
    ctx.beginPath(); ctx.ellipse(ox + sw * bkx, oy + sh * bky, sw * 0.12, sh * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    // Tressage (lignes horizontales)
    ctx.strokeStyle = "#6a3c10"; ctx.lineWidth = Math.max(0.5, sw * 0.018);
    for (let bi = 1; bi <= 3; bi++) {
      const by2 = bky - 0.06 + bi * 0.036;
      const bwi = 0.12 * Math.sqrt(1 - Math.pow((by2 - bky) / 0.08, 2));
      ctx.beginPath(); ctx.moveTo(ox + sw * (bkx - bwi), oy + sh * by2); ctx.lineTo(ox + sw * (bkx + bwi), oy + sh * by2); ctx.stroke();
    }
    // Rebord supérieur
    ctx.fillStyle = "#5e3210";
    ctx.beginPath(); ctx.ellipse(ox + sw * bkx, oy + sh * (bky - 0.045), sw * 0.12, sh * 0.038, 0, Math.PI, 0); ctx.fill();
    // Fruits déjà récoltés dans le panier
    if (tier >= 1) {
      ctx.fillStyle = "#c83010"; ctx.beginPath(); ctx.arc(ox + sw * (bkx - 0.04), oy + sh * (bky - 0.04), sw * 0.026, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#d04818"; ctx.beginPath(); ctx.arc(ox + sw * (bkx + 0.03), oy + sh * (bky - 0.05), sw * 0.023, 0, Math.PI * 2); ctx.fill();
    }

    // === PERSONNAGE — bras animé en train de cueillir ===
    const pick = (now / 680) % (Math.PI * 2);
    const reach = 0.45 + 0.55 * Math.abs(Math.sin(pick));
    const px2 = 0.43, py2 = 0.50;
    // Ombre au sol
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath(); ctx.ellipse(ox + sw * px2, oy + sh * (py2 + 0.2), sw * 0.07, sh * 0.028, 0, 0, Math.PI * 2); ctx.fill();
    // Jambes
    ctx.fillStyle = "#3a2614"; ctx.fillRect(ox + sw * (px2 - 0.032), oy + sh * (py2 + 0.06), sw * 0.062, sh * 0.14);
    // Corps
    ctx.fillStyle = "#5a3c1a"; ctx.fillRect(ox + sw * (px2 - 0.036), oy + sh * (py2 - 0.06), sw * 0.072, sh * 0.12);
    // Tête
    ctx.fillStyle = "#c48c50"; ctx.beginPath(); ctx.arc(ox + sw * px2, oy + sh * (py2 - 0.1), sw * 0.05, 0, Math.PI * 2); ctx.fill();
    // Bras tendu vers le buisson
    const aex = px2 + 0.08 + reach * 0.16, aey = py2 - 0.08 - reach * 0.09;
    ctx.strokeStyle = "#5a3c1a"; ctx.lineWidth = Math.max(1.5, sw * 0.042); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(ox + sw * (px2 + 0.032), oy + sh * (py2 - 0.02)); ctx.lineTo(ox + sw * aex, oy + sh * aey); ctx.stroke();
    ctx.lineCap = "square";
    ctx.fillStyle = "#c48c50"; ctx.beginPath(); ctx.arc(ox + sw * aex, oy + sh * aey, sw * 0.032, 0, Math.PI * 2); ctx.fill();

    // Tier 2 : second cueilleur près du buisson
    if (tier >= 2) {
      const px3 = 0.54, py3 = 0.64;
      ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.beginPath(); ctx.ellipse(ox + sw * px3, oy + sh * (py3 + 0.14), sw * 0.06, sh * 0.025, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2e1c0e"; ctx.fillRect(ox + sw * (px3 - 0.028), oy + sh * (py3 + 0.05), sw * 0.056, sh * 0.1);
      ctx.fillStyle = "#4a3014"; ctx.fillRect(ox + sw * (px3 - 0.032), oy + sh * (py3 - 0.04), sw * 0.064, sh * 0.1);
      ctx.fillStyle = "#b87848"; ctx.beginPath(); ctx.arc(ox + sw * px3, oy + sh * (py3 - 0.07), sw * 0.044, 0, Math.PI * 2); ctx.fill();
      const pick2 = (now / 620 + 1.8) % (Math.PI * 2);
      const reach2 = 0.4 + 0.5 * Math.abs(Math.sin(pick2));
      const ae2x = px3 + 0.06 + reach2 * 0.12, ae2y = py3 - 0.07 - reach2 * 0.08;
      ctx.strokeStyle = "#4a3014"; ctx.lineWidth = Math.max(1.5, sw * 0.038); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(ox + sw * (px3 + 0.028), oy + sh * (py3 - 0.01)); ctx.lineTo(ox + sw * ae2x, oy + sh * ae2y); ctx.stroke();
      ctx.lineCap = "square";
      ctx.fillStyle = "#b87848"; ctx.beginPath(); ctx.arc(ox + sw * ae2x, oy + sh * ae2y, sw * 0.028, 0, Math.PI * 2); ctx.fill();
    }
    return true;
  }
  if (id === "granaries_city") {
    // ── GRENIERS — silos sur pilotis, grain doré, sacs, oiseau picoreur ──
    // Sol en terre battue
    px(0.0, 0.66, 1.0, 0.34, "#241a0c");
    // Deux silos ronds sur pilotis (anti-rongeurs)
    for (const [scx, srad] of [[0.32, 0.2], [0.68, 0.16]]) {
      // Pilotis
      ctx.fillStyle = "#4c3414";
      ctx.fillRect(ox + sw * (scx - srad * 0.7), oy + sh * 0.66, sw * 0.035, sh * 0.12);
      ctx.fillRect(ox + sw * (scx + srad * 0.55), oy + sh * 0.66, sw * 0.035, sh * 0.12);
      // Corps torchis
      ctx.fillStyle = "#b89048";
      ctx.fillRect(ox + sw * (scx - srad), oy + sh * (0.66 - srad * 1.4), sw * srad * 2, sh * srad * 1.4);
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.fillRect(ox + sw * (scx + srad * 0.5), oy + sh * (0.66 - srad * 1.4), sw * srad * 0.5, sh * srad * 1.4);
      // Grain doré qui déborde au sommet
      ctx.fillStyle = "#e8c860";
      ctx.beginPath(); ctx.ellipse(ox + sw * scx, oy + sh * (0.66 - srad * 1.4), sw * srad * 0.92, sh * srad * 0.4, 0, Math.PI, 0); ctx.fill();
      // Toit conique de chaume au-dessus (sur poteaux)
      ctx.fillStyle = "#7a5618";
      ctx.beginPath();
      ctx.moveTo(ox + sw * (scx - srad * 1.15), oy + sh * (0.66 - srad * 1.55));
      ctx.lineTo(ox + sw * scx, oy + sh * (0.66 - srad * 2.4));
      ctx.lineTo(ox + sw * (scx + srad * 1.15), oy + sh * (0.66 - srad * 1.55));
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,235,170,0.2)";
      ctx.beginPath();
      ctx.moveTo(ox + sw * (scx - srad * 1.15), oy + sh * (0.66 - srad * 1.55));
      ctx.lineTo(ox + sw * scx, oy + sh * (0.66 - srad * 2.4));
      ctx.lineTo(ox + sw * scx, oy + sh * (0.66 - srad * 1.55));
      ctx.closePath(); ctx.fill();
    }
    // Sacs de grain empilés (plus nombreux avec le niveau)
    const nSacks = 2 + Math.min(3, tier + 1);
    for (let si = 0; si < nSacks; si += 1) {
      const sx2 = 0.42 + (si % 3) * 0.09, sy2 = 0.78 - Math.floor(si / 3) * 0.08;
      ctx.fillStyle = si % 2 ? "#c8a058" : "#b08c48";
      ctx.beginPath(); ctx.ellipse(ox + sw * sx2, oy + sh * sy2, sw * 0.045, sh * 0.05, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#6a4a18";
      ctx.fillRect(ox + sw * (sx2 - 0.012), oy + sh * (sy2 - 0.065), sw * 0.024, sh * 0.02);
    }
    // Manutentionnaire : un ouvrier fait la navette entre la pile de sacs et
    // le grand silo, un sac sur l'épaule à l'aller, les mains vides au retour.
    {
      const cyc = (now / 5200) % 1;                  // un aller-retour ~5 s
      const going = cyc < 0.5;
      const k = going ? cyc * 2 : (1 - cyc) * 2;     // 0 → 1 → 0
      const wx = 0.56 - k * 0.22;                     // pile (0.56) → silo (0.34)
      const wy = 0.8;
      const step = Math.sin(now / 130) * 0.012;
      // Ombre
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath(); ctx.ellipse(ox + sw * wx, oy + sh * (wy + 0.075), sw * 0.045, sh * 0.018, 0, 0, Math.PI * 2); ctx.fill();
      // Jambes
      ctx.fillStyle = "#2e2010";
      ctx.fillRect(ox + sw * (wx - 0.022 + step), oy + sh * (wy + 0.02), sw * 0.02, sh * 0.05);
      ctx.fillRect(ox + sw * (wx + 0.004 - step), oy + sh * (wy + 0.02), sw * 0.02, sh * 0.05);
      // Corps légèrement penché sous la charge
      ctx.fillStyle = "#5a3c1a";
      ctx.fillRect(ox + sw * (wx - 0.03), oy + sh * (wy - 0.06), sw * 0.06, sh * 0.085);
      // Tête
      ctx.fillStyle = "#c48c50";
      ctx.beginPath(); ctx.arc(ox + sw * wx, oy + sh * (wy - 0.085), sw * 0.026, 0, Math.PI * 2); ctx.fill();
      // Sac de grain sur l'épaule (à l'aller seulement)
      if (going) {
        ctx.fillStyle = "#c8a058";
        ctx.beginPath(); ctx.ellipse(ox + sw * (wx - 0.012), oy + sh * (wy - 0.115), sw * 0.038, sh * 0.026, -0.35, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#6a4a18"; ctx.lineWidth = Math.max(0.5, sw * 0.01);
        ctx.beginPath(); ctx.ellipse(ox + sw * (wx - 0.012), oy + sh * (wy - 0.115), sw * 0.038, sh * 0.026, -0.35, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // Oiseau picoreur (pivote la tête)
    const peck = Math.sin(now / 320) > 0.4 ? 0.025 : 0;
    ctx.fillStyle = "#3a3a44";
    ctx.beginPath(); ctx.ellipse(ox + sw * 0.85, oy + sh * 0.82, sw * 0.035, sh * 0.025, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ox + sw * (0.87 + peck), oy + sh * (0.795 + peck * 1.4), sw * 0.018, 0, Math.PI * 2); ctx.fill();
    return true;
  }
  if (id === "caravans") {
    // ── CHARRETTE MARCHANDE À L'ARRÊT ────────────────────────────────
    const cx2 = 0.5, cy2 = 0.5;
    // Ombre portée
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath(); ctx.ellipse(ox+sw*(cx2+0.02), oy+sh*(cy2+0.24), sw*0.3, sh*0.07, 0, 0, Math.PI*2); ctx.fill();
    // Timon (avant, part vers la gauche)
    ctx.strokeStyle = "#7a4a18"; ctx.lineWidth = Math.max(1.5, sw*0.032); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(ox+sw*(cx2-0.22), oy+sh*(cy2+0.06)); ctx.lineTo(ox+sw*(cx2-0.4), oy+sh*(cy2-0.02)); ctx.stroke();
    ctx.lineCap = "square";
    // Plancher de la charrette
    ctx.fillStyle = "#7a5018"; ctx.fillRect(ox+sw*(cx2-0.22), oy+sh*(cy2-0.04), sw*0.44, sh*0.18);
    // Planches (texture bois)
    ctx.strokeStyle = "rgba(50,28,6,0.3)"; ctx.lineWidth = Math.max(0.5, sw*0.016);
    for (let pi = 1; pi < 4; pi++) ctx.strokeRect(ox+sw*(cx2-0.20+pi*0.09), oy+sh*(cy2-0.03), sw*0.08, sh*0.16);
    // Ridelles et montants
    ctx.fillStyle = "#5a3a0c";
    ctx.fillRect(ox+sw*(cx2-0.22), oy+sh*(cy2-0.04), sw*0.44, sh*0.02);
    ctx.fillRect(ox+sw*(cx2-0.22), oy+sh*(cy2+0.12), sw*0.44, sh*0.02);
    ctx.fillRect(ox+sw*(cx2-0.22), oy+sh*(cy2-0.04), sw*0.02, sh*0.18);
    ctx.fillRect(ox+sw*(cx2+0.20), oy+sh*(cy2-0.04), sw*0.02, sh*0.18);
    // Bâche (toile de couverture bombée)
    ctx.fillStyle = "#c8a840";
    ctx.beginPath();
    ctx.moveTo(ox+sw*(cx2-0.19), oy+sh*(cy2-0.04));
    ctx.bezierCurveTo(ox+sw*(cx2-0.19), oy+sh*(cy2-0.22), ox+sw*(cx2+0.19), oy+sh*(cy2-0.22), ox+sw*(cx2+0.19), oy+sh*(cy2-0.04));
    ctx.closePath(); ctx.fill();
    // Plis de la bâche — la toile frémit doucement sous le vent
    ctx.strokeStyle = "rgba(155,120,25,0.48)"; ctx.lineWidth = Math.max(0.5, sw*0.02);
    for (let bi = -1; bi <= 1; bi++) {
      const bpx = cx2 + bi * 0.1;
      const wind = Math.sin(now / 640 + bi * 1.7) * 0.008;
      ctx.beginPath(); ctx.moveTo(ox+sw*bpx, oy+sh*(cy2-0.04)); ctx.quadraticCurveTo(ox+sw*(bpx+0.015+wind), oy+sh*(cy2-0.16), ox+sw*(bpx+wind), oy+sh*(cy2-0.22)); ctx.stroke();
    }
    // Grandes roues (vue de côté légèrement inclinée)
    for (const wrx of [cx2-0.17, cx2+0.17]) {
      ctx.fillStyle = "#2a1606";
      ctx.beginPath(); ctx.ellipse(ox+sw*wrx, oy+sh*(cy2+0.2), sw*0.065, sh*0.046, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#5a3210"; ctx.lineWidth = Math.max(0.5, sw*0.015);
      for (let ri = 0; ri < 4; ri++) {
        const ra = ri * Math.PI / 4;
        ctx.beginPath(); ctx.moveTo(ox+sw*wrx, oy+sh*(cy2+0.2)); ctx.lineTo(ox+sw*(wrx+Math.cos(ra)*0.06), oy+sh*(cy2+0.2+Math.sin(ra)*0.042)); ctx.stroke();
      }
      ctx.strokeStyle = "#4a2808"; ctx.lineWidth = Math.max(1, sw*0.022);
      ctx.beginPath(); ctx.ellipse(ox+sw*wrx, oy+sh*(cy2+0.2), sw*0.065, sh*0.046, 0, 0, Math.PI*2); ctx.stroke();
    }
    // Marchandises et barils à côté (tier 1+)
    if (tier >= 1) {
      // Baril
      ctx.fillStyle = "#6a3c10";
      ctx.beginPath(); ctx.ellipse(ox+sw*(cx2+0.34), oy+sh*(cy2+0.12), sw*0.058, sh*0.048, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#8a5020";
      ctx.beginPath(); ctx.ellipse(ox+sw*(cx2+0.34), oy+sh*(cy2+0.07), sw*0.058, sh*0.025, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#4a2808"; ctx.lineWidth = Math.max(0.5, sw*0.016);
      ctx.beginPath(); ctx.ellipse(ox+sw*(cx2+0.34), oy+sh*(cy2+0.12), sw*0.058, sh*0.048, 0, 0, Math.PI*2); ctx.stroke();
      // Caisse
      ctx.fillStyle = "#9a6828"; ctx.fillRect(ox+sw*(cx2-0.42), oy+sh*(cy2+0.08), sw*0.1, sh*0.09);
      ctx.fillStyle = "#7a5018"; ctx.fillRect(ox+sw*(cx2-0.42), oy+sh*(cy2), sw*0.1, sh*0.09);
      ctx.strokeStyle = "rgba(50,28,8,0.45)"; ctx.lineWidth = Math.max(0.5, sw*0.014);
      ctx.strokeRect(ox+sw*(cx2-0.42), oy+sh*(cy2+0.08), sw*0.1, sh*0.09);
      ctx.strokeRect(ox+sw*(cx2-0.42), oy+sh*(cy2), sw*0.1, sh*0.09);
    }
    return true;
  }
  if (id === "markets") {
    // ── GRANDE HALLE DE MARCHÉ ───────────────────────────────────────
    // Refonte lisibilité : une halle couverte qui déborde légèrement de la
    // tuile (1.25×), au lieu de micro-étals illisibles au zoom normal.
    const mx = ox - sw * 0.125, my = oy - sh * 0.125;
    const mw = sw * 1.25, mh = sh * 1.25;
    const P = (rx, ry, rw, rh, col) => { ctx.fillStyle = col; ctx.fillRect(mx + mw * rx, my + mh * ry, mw * rw, mh * rh); };
    // Esplanade de terre battue
    P(0.04, 0.3, 0.92, 0.62, "#3a2c18");
    // Grande toile rayée à double pente (vue de dessus)
    const awnA = "#c03828", awnB = "#e8e0cc";
    const ax = 0.1, aw = 0.8, ay = 0.12, ah2 = 0.4;
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? awnB : awnA;
      ctx.fillRect(mx + mw * (ax + aw * i / 8), my + mh * ay, mw * aw / 8 + 0.5, mh * ah2);
    }
    // Faîtage central + ombre du bord de toile
    P(ax, ay + ah2 * 0.46, aw, 0.025, "rgba(90,20,10,0.55)");
    P(ax, ay + ah2 - 0.03, aw, 0.05, "rgba(0,0,0,0.28)");
    // Poteaux de la halle
    ctx.fillStyle = "#5a3c16";
    for (const ppx of [ax + 0.015, ax + aw - 0.05]) {
      ctx.fillRect(mx + mw * ppx, my + mh * (ay + ah2), mw * 0.045, mh * 0.16);
    }
    // Comptoir frontal sur toute la largeur + marchandises colorées
    P(ax + 0.04, 0.62, aw - 0.08, 0.1, "#7a5020");
    P(ax + 0.04, 0.62, aw - 0.08, 0.025, "#9a6830");
    const goodColors = ["#e05030", "#f0c040", "#60a840", "#e8804a", "#9060c0", "#e8e080"];
    const nGoods = 5 + tier * 2;
    for (let gi = 0; gi < nGoods; gi++) {
      const gx2 = ax + 0.08 + gi * ((aw - 0.16) / Math.max(1, nGoods - 1));
      ctx.fillStyle = goodColors[gi % goodColors.length];
      ctx.beginPath(); ctx.arc(mx + mw * gx2, my + mh * 0.645, mw * 0.028, 0, Math.PI * 2); ctx.fill();
    }
    // Sacs et caisses sur l'esplanade
    ctx.fillStyle = "#9a6828"; ctx.fillRect(mx + mw * 0.08, my + mh * 0.76, mw * 0.1, mh * 0.09);
    ctx.fillStyle = "#b08a4a";
    ctx.beginPath(); ctx.ellipse(mx + mw * 0.86, my + mh * 0.8, mw * 0.05, mh * 0.045, 0, 0, Math.PI * 2); ctx.fill();
    // Marchand derrière le comptoir + chalands devant (badauds animés)
    const folk = [[0.5, 0.58, "#4a3018"], [0.32, 0.8, "#3f6a8a"], [0.58, 0.84, "#7a8a3c"]];
    const nFolk = 1 + Math.min(2, tier + 1);
    for (let fi = 0; fi < nFolk; fi++) {
      const [fx2, fy2, fcol] = folk[fi];
      const sway = Math.sin(now / 540 + fi * 2.1) * 0.012;
      ctx.fillStyle = fcol;
      ctx.fillRect(mx + mw * (fx2 - 0.03 + sway), my + mh * fy2, mw * 0.06, mh * 0.09);
      ctx.fillStyle = "#c49060";
      ctx.beginPath(); ctx.arc(mx + mw * (fx2 + sway), my + mh * (fy2 - 0.02), mw * 0.034, 0, Math.PI * 2); ctx.fill();
    }
    // Tier 1+ : étal latéral avec son propre auvent
    if (tier >= 1) {
      P(0.0, 0.34, 0.16, 0.2, "#2a6888");
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(mx, my + mh * 0.34, mw * 0.05, mh * 0.2);
      P(0.01, 0.54, 0.14, 0.07, "#7a5020");
    }
    // Tier 2+ : fanions colorés au-dessus de la halle
    if (tier >= 2) {
      ctx.strokeStyle = "rgba(60,40,16,0.6)"; ctx.lineWidth = Math.max(0.5, mw * 0.012);
      ctx.beginPath(); ctx.moveTo(mx + mw * ax, my + mh * 0.08); ctx.lineTo(mx + mw * (ax + aw), my + mh * 0.08); ctx.stroke();
      for (let fi = 0; fi < 6; fi++) {
        const fx2 = ax + 0.08 + fi * (aw - 0.16) / 5;
        const flap = Math.sin(now / 380 + fi) * 0.01;
        ctx.fillStyle = goodColors[fi % goodColors.length];
        ctx.beginPath();
        ctx.moveTo(mx + mw * (fx2 - 0.025), my + mh * 0.08);
        ctx.lineTo(mx + mw * (fx2 + 0.025), my + mh * 0.08);
        ctx.lineTo(mx + mw * (fx2 + flap), my + mh * 0.135);
        ctx.closePath(); ctx.fill();
      }
    }
    return true;
  }
  if (id === "guilds") {
    // ── QG MILITAIRE / RELIGIEUX ──────────────────────────────────────
    // Corps principal (pierre massive)
    ctx.fillStyle = "#8a7860"; ctx.fillRect(ox+sw*0.12, oy+sh*0.26, sw*0.76, sh*0.6);
    // Ombre côté droit
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(ox+sw*0.72, oy+sh*0.26, sw*0.16, sh*0.6);
    // Tours d'angle
    ctx.fillStyle = "#7a6850";
    ctx.fillRect(ox+sw*0.08, oy+sh*0.2, sw*0.2, sh*0.66);
    ctx.fillRect(ox+sw*0.72, oy+sh*0.2, sw*0.2, sh*0.66);
    // Créneaux sur les tours
    ctx.fillStyle = "#6a5840";
    for (let ci = 0; ci < 3; ci++) {
      ctx.fillRect(ox+sw*(0.09+ci*0.055), oy+sh*0.16, sw*0.035, sh*0.07);
      ctx.fillRect(ox+sw*(0.73+ci*0.055), oy+sh*0.16, sw*0.035, sh*0.07);
    }
    // Mâchicoulis du corps principal
    ctx.fillStyle = "#6a5840"; ctx.fillRect(ox+sw*0.12, oy+sh*0.22, sw*0.76, sh*0.055);
    for (let ci = 0; ci < 5; ci++) ctx.fillRect(ox+sw*(0.16+ci*0.14), oy+sh*0.18, sw*0.06, sh*0.06);
    // Grande porte à arc en plein cintre
    ctx.fillStyle = "rgba(15,10,4,0.75)";
    ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.62, sw*0.1, Math.PI, 0); ctx.fill();
    ctx.fillRect(ox+sw*0.4, oy+sh*0.62, sw*0.2, sh*0.24);
    ctx.fillStyle = "#5a4030"; // herse/portail
    ctx.fillRect(ox+sw*0.42, oy+sh*0.64, sw*0.16, sh*0.14);
    ctx.strokeStyle = "rgba(80,55,20,0.6)"; ctx.lineWidth = Math.max(0.5, sw*0.02);
    for (let gi = 0; gi < 3; gi++) { ctx.beginPath(); ctx.moveTo(ox+sw*(0.44+gi*0.06), oy+sh*0.64); ctx.lineTo(ox+sw*(0.44+gi*0.06), oy+sh*0.78); ctx.stroke(); }
    // Fenêtres à meurtrières
    ctx.fillStyle = litWarm;
    ctx.fillRect(ox+sw*0.22, oy+sh*0.42, sw*0.06, sh*0.1);
    ctx.fillRect(ox+sw*0.72, oy+sh*0.42, sw*0.06, sh*0.1);
    ctx.fillRect(ox+sw*0.26, oy+sh*0.56, sw*0.05, sh*0.08);
    ctx.fillRect(ox+sw*0.69, oy+sh*0.56, sw*0.05, sh*0.08);
    // Croix / emblème sur le corps
    ctx.fillStyle = tier >= 2 ? "#c0a030" : "#9a8060";
    ctx.fillRect(ox+sw*0.47, oy+sh*0.3, sw*0.06, sh*0.18); // vertical
    ctx.fillRect(ox+sw*0.4, oy+sh*0.38, sw*0.2, sh*0.06);  // horizontal
    // Bannière qui claque au vent
    {
      const flap = Math.sin(now / 420) * 0.018;
      ctx.fillStyle = "#a02020";
      ctx.beginPath();
      ctx.moveTo(ox+sw*0.46, oy+sh*0.12);
      ctx.lineTo(ox+sw*0.62, oy+sh*(0.13+flap));
      ctx.lineTo(ox+sw*0.62, oy+sh*(0.21+flap));
      ctx.lineTo(ox+sw*0.46, oy+sh*0.22);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#7a1010"; ctx.lineWidth = Math.max(0.5, sw*0.016);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.46, oy+sh*0.08); ctx.lineTo(ox+sw*0.46, oy+sh*0.22); ctx.stroke();
    }
    return true;
  }
  if (id === "irrigated_fields") {
    // ── CHAMPS IRRIGUÉS + ANIMATION D'ARROSAGE ───────────────────────
    const nRows = 4 + tier;
    // Rangées de cultures (alternance vert clair/foncé)
    for (let ri = 0; ri < nRows; ri++) {
      const fy = 0.1 + ri * (0.8 / nRows), fh = 0.8 / nRows * 0.82;
      ctx.fillStyle = ri % 2 === 0 ? "#4a7c28" : "#3c6820";
      ctx.fillRect(ox+sw*0.1, oy+sh*fy, sw*0.8, sh*fh);
      // Sillons (petits traits dans chaque rangée)
      ctx.strokeStyle = "rgba(28,50,12,0.3)"; ctx.lineWidth = Math.max(0.5, sw*0.012);
      for (let si2 = 1; si2 < 4; si2++) ctx.strokeRect(ox+sw*(0.12+si2*0.17), oy+sh*(fy+0.01), sw*0.15, sh*(fh-0.02));
    }
    // Canal vertical central (eau)
    ctx.fillStyle = "#2a5a8a"; ctx.fillRect(ox+sw*0.47, oy+sh*0.08, sw*0.06, sh*0.84);
    // Canal horizontal central
    ctx.fillStyle = "#2a5a8a"; ctx.fillRect(ox+sw*0.1, oy+sh*0.47, sw*0.8, sh*0.05);
    // Reflets d'eau animés sur les canaux
    ctx.fillStyle = "rgba(120,190,255,0.35)";
    ctx.fillRect(ox+sw*0.485, oy+sh*0.08, sw*0.03, sh*0.84);
    ctx.fillRect(ox+sw*0.1, oy+sh*0.476, sw*0.8, sh*0.022);
    // Animation : gouttelettes / vaguelettes qui se déplacent sur les canaux
    const waterFlow = (now / 600) % 1;
    ctx.fillStyle = "rgba(160,220,255,0.55)";
    for (let di = 0; di < 4; di++) {
      const dropY = ((waterFlow + di * 0.25) % 1);
      ctx.beginPath(); ctx.ellipse(ox+sw*0.5, oy+sh*(0.1+dropY*0.8), sw*0.018, sh*0.014, 0, 0, Math.PI*2); ctx.fill();
    }
    // Gouttelettes horizontales
    const flowH = (now / 700) % 1;
    for (let di = 0; di < 3; di++) {
      const dropX = ((flowH + di * 0.33) % 1);
      ctx.beginPath(); ctx.ellipse(ox+sw*(0.12+dropX*0.76), oy+sh*0.495, sw*0.014, sh*0.018, 0, 0, Math.PI*2); ctx.fill();
    }
    // Puits / vanne d'irrigation (coin)
    px(0.72, 0.08, 0.18, 0.16, "#6a4a1a");
    ctx.fillStyle = "#8a6428"; ctx.beginPath(); ctx.arc(ox+sw*0.81, oy+sh*0.16, sw*0.06, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#5a3810"; ctx.lineWidth = Math.max(1, sw*0.025);
    ctx.beginPath(); ctx.moveTo(ox+sw*0.81, oy+sh*0.1); ctx.lineTo(ox+sw*0.81, oy+sh*0.22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox+sw*0.75, oy+sh*0.16); ctx.lineTo(ox+sw*0.87, oy+sh*0.16); ctx.stroke();
    return true;
  }
  if (id === "river_ports") {
    if (ei >= 11) {
      // ── Port moderne / industriel avancé (correspond aux vapeurs modernes) ──
      const isLateMod = ei >= 14;
      // Quai en béton
      ctx.fillStyle = isLateMod ? "#3a4858" : "#5a6070";
      ctx.fillRect(ox + sw * 0.06, oy + sh * 0.58, sw * 0.88, sh * 0.14);
      ctx.fillStyle = isLateMod ? "#2a3848" : "#48525e";
      ctx.fillRect(ox + sw * 0.06, oy + sh * 0.68, sw * 0.88, sh * 0.06);
      // Entrepôt métallique (bâtiment principal)
      ctx.fillStyle = isLateMod ? "#2e3c50" : "#48525e";
      ctx.fillRect(ox + sw * 0.12, oy + sh * 0.22, sw * 0.46, sh * 0.36);
      ctx.fillStyle = isLateMod ? "#1e2c40" : "#38424e";
      ctx.fillRect(ox + sw * 0.10, oy + sh * 0.18, sw * 0.50, sh * 0.07);
      // Fenêtres entrepôt illuminées
      const pulse = 0.5 + 0.3 * Math.sin(now / 500);
      ctx.fillStyle = isLateMod
        ? `rgba(80,180,255,${(0.5 + pulse * 0.3).toFixed(2)})`
        : `rgba(255,220,120,${(0.4 + pulse * 0.2).toFixed(2)})`;
      for (let i = 0; i < 3; i += 1) ctx.fillRect(ox + sw * (0.16 + i * 0.13), oy + sh * 0.30, sw * 0.08, sh * 0.10);
      // Grue métallique
      ctx.strokeStyle = isLateMod ? "#607080" : "#707880";
      ctx.lineWidth = Math.max(1.5, sw * 0.028);
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.72, oy + sh * 0.58); ctx.lineTo(ox + sw * 0.72, oy + sh * 0.12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.72, oy + sh * 0.12); ctx.lineTo(ox + sw * 0.92, oy + sh * 0.18); ctx.stroke();
      ctx.lineWidth = Math.max(1, sw * 0.016);
      ctx.strokeStyle = isLateMod ? "#405060" : "#585e68";
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.92, oy + sh * 0.18); ctx.lineTo(ox + sw * 0.92, oy + sh * 0.42); ctx.stroke();
      // Câble de grue animé
      const swingX = Math.sin(now / 1200) * 0.04;
      ctx.strokeStyle = isLateMod ? `rgba(60,200,255,0.7)` : `rgba(180,160,100,0.7)`;
      ctx.lineWidth = Math.max(1, sw * 0.012);
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.92, oy + sh * 0.42); ctx.lineTo(ox + sw * (0.92 + swingX), oy + sh * 0.58); ctx.stroke();
      // Bollards métalliques
      ctx.fillStyle = isLateMod ? "#607890" : "#686e78";
      for (let i = 0; i < 4; i += 1) {
        ctx.beginPath(); ctx.arc(ox + sw * (0.14 + i * 0.22), oy + sh * 0.60, sw * 0.025, 0, Math.PI * 2); ctx.fill();
      }
      // Lumières de quai (lueur)
      if (isLateMod) {
        ctx.fillStyle = `rgba(60,200,255,${(0.3 + pulse * 0.2).toFixed(2)})`;
        for (let i = 0; i < 4; i += 1) {
          ctx.beginPath(); ctx.arc(ox + sw * (0.14 + i * 0.22), oy + sh * 0.57, sw * 0.04, 0, Math.PI * 2); ctx.fill();
        }
      }
    } else if (band >= 4) {
      // ── Port industriel (correspond aux vapeurs à roue à aube) ──
      // Quai en pierre
      px(0.06, 0.58, 0.88, 0.16, "#6a6050");
      px(0.08, 0.68, 0.84, 0.06, "#58504a");
      // Entrepôt de briques
      px(0.10, 0.26, 0.44, 0.32, "#8a7060");
      ctx.fillStyle = "#6a5848";
      ctx.beginPath();
      ctx.moveTo(ox + sw * 0.08, oy + sh * 0.28); ctx.lineTo(ox + sw * 0.32, oy + sh * 0.12); ctx.lineTo(ox + sw * 0.56, oy + sh * 0.28);
      ctx.closePath(); ctx.fill();
      // Fenêtres à arc
      ctx.fillStyle = litWarm;
      for (let i = 0; i < 2; i += 1) {
        ctx.beginPath(); ctx.arc(ox + sw * (0.20 + i * 0.20), oy + sh * 0.44, sw * 0.055, Math.PI, 0); ctx.fill();
        ctx.fillStyle = "#2a1a10"; ctx.fillRect(ox + sw * (0.145 + i * 0.20), oy + sh * 0.44, sw * 0.11, sh * 0.10);
        ctx.fillStyle = litWarm;
      }
      // Cheminée / four de forge (fumée animée)
      px(0.60, 0.28, 0.08, 0.30, "#4a3a2a");
      const smk = (now / 700) % 1;
      ctx.fillStyle = `rgba(120,110,100,${((1 - smk) * 0.35).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(ox + sw * 0.64, oy + sh * (0.28 - smk * 0.22), sw * (0.05 + smk * 0.07), 0, Math.PI * 2); ctx.fill();
      // Roue à palettes de quai (décoration, animée)
      const cx2 = ox + sw * 0.82, cy2 = oy + sh * 0.50, rr2 = Math.min(sw, sh) * 0.16;
      ctx.strokeStyle = "#5a3a18"; ctx.lineWidth = Math.max(1, sw * 0.03);
      ctx.beginPath(); ctx.arc(cx2, cy2, rr2, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "#7a5428";
      for (let i = 0; i < 6; i += 1) {
        const wa = now / 600 + i * Math.PI / 3;
        ctx.beginPath(); ctx.moveTo(cx2, cy2); ctx.lineTo(cx2 + Math.cos(wa) * rr2, cy2 + Math.sin(wa) * rr2); ctx.stroke();
      }
      // Bollards en pierre
      ctx.fillStyle = "#786858";
      for (let i = 0; i < 5; i += 1) px(0.10 + i * 0.15, 0.55, 0.04, 0.12, "#786858");
    } else if (band >= 2) {
      // ── Port médiéval (correspond aux voiliers marchands) ──
      // Appontement en bois
      px(0.08, 0.56, 0.84, 0.16, "#6a4a10");
      px(0.10, 0.66, 0.80, 0.06, "#5a3a10");
      // Hangar / entrepôt (toit en triangle)
      px(0.12, 0.32, 0.44, 0.24, "#7a5828");
      ctx.fillStyle = "#5a3e18";
      ctx.beginPath();
      ctx.moveTo(ox + sw * 0.10, oy + sh * 0.34); ctx.lineTo(ox + sw * 0.34, oy + sh * 0.16); ctx.lineTo(ox + sw * 0.58, oy + sh * 0.34);
      ctx.closePath(); ctx.fill();
      // Fenêtre de l'entrepôt
      px(0.26, 0.38, 0.12, 0.14, "#2a1a0c");
      ctx.fillStyle = litWarm; ctx.beginPath(); ctx.arc(ox + sw * 0.32, oy + sh * 0.38, sw * 0.06, Math.PI, 0); ctx.fill();
      // Mât et voile (identique au bateau médiéval)
      px(0.70, 0.20, 0.030, 0.38, "#d8cdb0");
      ctx.fillStyle = `rgba(230,215,180,${(0.7 + 0.2 * Math.sin(now / 900)).toFixed(2)})`;
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.715, oy + sh * 0.22); ctx.lineTo(ox + sw * 0.86, oy + sh * 0.38); ctx.lineTo(ox + sw * 0.715, oy + sh * 0.44); ctx.closePath(); ctx.fill();
      if (band >= 3) {
        ctx.fillStyle = "rgba(210,195,158,0.65)";
        ctx.beginPath(); ctx.moveTo(ox + sw * 0.715, oy + sh * 0.22); ctx.lineTo(ox + sw * 0.56, oy + sh * 0.34); ctx.lineTo(ox + sw * 0.715, oy + sh * 0.40); ctx.closePath(); ctx.fill();
      }
      // 5 poteaux d'amarrage
      for (let i = 0; i < 5; i += 1) px(0.12 + i * 0.14, 0.44, 0.035, 0.28, "#5a3a10");
    } else {
      // ── Berge primitive (correspond aux radeaux à pagaie) ──
      // Berge renforcée (planches brutes)
      px(0.10, 0.62, 0.80, 0.10, "#7a5a1a");
      for (let i = 0; i < 4; i += 1) px(0.14 + i * 0.18, 0.56, 0.10, 0.16, "#6a4a12");
      // Abri de roseaux / hutte
      px(0.18, 0.38, 0.34, 0.24, "#8a7030");
      ctx.fillStyle = "#6a5018";
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.14, oy + sh * 0.40); ctx.lineTo(ox + sw * 0.35, oy + sh * 0.22); ctx.lineTo(ox + sw * 0.56, oy + sh * 0.40); ctx.closePath(); ctx.fill();
      // Mât simple avec petite voile (radeau amarré)
      px(0.70, 0.24, 0.020, 0.38, "#7a5828");
      ctx.fillStyle = "rgba(200,170,110,0.6)";
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.715, oy + sh * 0.26); ctx.lineTo(ox + sw * 0.82, oy + sh * 0.36); ctx.lineTo(ox + sw * 0.715, oy + sh * 0.42); ctx.closePath(); ctx.fill();
      // Pieux d'amarrage rudimentaires
      for (let i = 0; i < 3; i += 1) px(0.18 + i * 0.22, 0.52, 0.030, 0.20, "#5a3a10");
    }
    return true;
  }
  if (id === "water_mills") {
    // ── MOULIN À EAU — bief qui coule, grande roue à aubes, éclaboussures ──
    // Bief (canal d'eau animé sous la roue)
    px(0.04, 0.6, 0.92, 0.2, "#2a5a8b");
    const flow = (now / 600) % 1;
    ctx.strokeStyle = "rgba(190,220,250,0.4)"; ctx.lineWidth = Math.max(0.5, sw * 0.014);
    for (let fi = 0; fi < 3; fi += 1) {
      const fx2 = ((flow + fi / 3) % 1) * 0.84 + 0.06;
      ctx.beginPath(); ctx.moveTo(ox + sw * fx2, oy + sh * (0.64 + fi * 0.05)); ctx.lineTo(ox + sw * (fx2 + 0.08), oy + sh * (0.64 + fi * 0.05)); ctx.stroke();
    }
    // Corps du moulin (pierre + colombage)
    px(0.14, 0.24, 0.38, 0.4, "#8b6914");
    ctx.strokeStyle = "rgba(70,45,12,0.5)"; ctx.lineWidth = Math.max(0.5, sw * 0.018);
    ctx.beginPath(); ctx.moveTo(ox + sw * 0.14, oy + sh * 0.44); ctx.lineTo(ox + sw * 0.52, oy + sh * 0.44); ctx.stroke();
    ctx.fillStyle = "#5a3a10";
    ctx.beginPath(); ctx.moveTo(ox + sw * 0.1, oy + sh * 0.27); ctx.lineTo(ox + sw * 0.33, oy + sh * 0.06); ctx.lineTo(ox + sw * 0.56, oy + sh * 0.27); ctx.closePath(); ctx.fill();
    // Porte + fenêtre éclairée
    px(0.24, 0.46, 0.1, 0.18, "#2a1a0c");
    ctx.fillStyle = litWarm; ctx.fillRect(ox + sw * 0.4, oy + sh * 0.32, sw * 0.07, sh * 0.08);
    // Grande roue à aubes (pales rectangulaires, rotation continue)
    const cx = ox + sw * 0.7, cy = oy + sh * 0.58, rr = Math.min(sw, sh) * 0.26;
    ctx.strokeStyle = "#4a2e0c"; ctx.lineWidth = Math.max(1.5, sw * 0.045);
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#6a4615"; ctx.lineWidth = Math.max(1, sw * 0.03);
    ctx.beginPath(); ctx.arc(cx, cy, rr * 0.55, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i += 1) {
      const a = now / 520 + i * Math.PI / 4;
      ctx.strokeStyle = "#7a5418"; ctx.lineWidth = Math.max(1, sw * 0.024);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); ctx.stroke();
      // Pale au bout du rayon
      ctx.save();
      ctx.translate(cx + Math.cos(a) * rr * 0.92, cy + Math.sin(a) * rr * 0.92);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = "#8a5e1e";
      ctx.fillRect(-sw * 0.045, -sh * 0.016, sw * 0.09, sh * 0.032);
      ctx.restore();
    }
    // Moyeu
    ctx.fillStyle = "#3a240a"; ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.5, rr * 0.14), 0, Math.PI * 2); ctx.fill();
    // Éclaboussures au pied de la roue
    for (let si = 0; si < 4; si += 1) {
      const sph = ((now / 450) + si / 4) % 1;
      ctx.fillStyle = `rgba(210,235,255,${((1 - sph) * 0.6).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(cx - rr * 0.5 + sph * rr * 0.4 - si * sw * 0.02, oy + sh * 0.66 - sph * sh * 0.1, Math.max(0.8, sw * 0.016), 0, Math.PI * 2);
      ctx.fill();
    }
    return true;
  }
  if (id === "mint_houses") {
    // ── HÔTEL DES MONNAIES — coffres, pièces, balances ───────────────
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
  if (id === "imperial_exchanges") {
    // ── GRANDE BANQUE NÉOCLASSIQUE (style Banque de France / FMI) ────
    // Escalier monumental
    const nSteps = 4;
    for (let si = nSteps; si >= 0; si--) {
      const sw2 = 0.1 + (si/nSteps)*0.8, sh2 = 0.04;
      ctx.fillStyle = si%2===0 ? "#d8d0b0" : "#e8e0c0";
      ctx.fillRect(ox+sw*(0.5-sw2/2), oy+sh*(0.76-si*sh2), sw*sw2, sh*(sh2+0.005));
    }
    const podY = 0.6;
    // Corps principal (marbre / pierre de taille)
    ctx.fillStyle = "#d4c898"; ctx.fillRect(ox+sw*0.06, oy+sh*podY, sw*0.88, sh*0.28);
    ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.fillRect(ox+sw*0.78, oy+sh*podY, sw*0.16, sh*0.28);
    // Colonnes (proportionnelles au tier)
    const nCols = 6 + Math.min(4, tier * 2);
    ctx.fillStyle = "#e8e0c0";
    for (let ci = 0; ci < nCols; ci++) {
      const cx2 = ox + sw*(0.1 + ci*(0.8/(nCols-1)));
      ctx.fillRect(cx2 - sw*0.02, oy+sh*podY, sw*0.04, sh*0.28);
      ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.fillRect(cx2+sw*0.01, oy+sh*podY, sw*0.012, sh*0.28);
      ctx.fillStyle = "#e8e0c0";
      // Chapiteau
      ctx.fillRect(cx2-sw*0.032, oy+sh*podY, sw*0.064, sh*0.026);
    }
    // Architrave
    ctx.fillStyle = "#b8b090"; ctx.fillRect(ox+sw*0.06, oy+sh*podY, sw*0.88, sh*0.03);
    // Frise
    ctx.fillStyle = "#c8c0a0"; ctx.fillRect(ox+sw*0.06, oy+sh*(podY-0.05), sw*0.88, sh*0.05);
    for (let fi = 0; fi < 8; fi++) {
      ctx.fillStyle = fi%2===0 ? "rgba(120,100,50,0.5)" : "rgba(200,180,100,0.4)";
      ctx.fillRect(ox+sw*(0.08+fi*0.11), oy+sh*(podY-0.048), sw*0.075, sh*0.045);
    }
    // Grand fronton triangulaire
    const frontH = 0.14;
    ctx.fillStyle = "#9a9070";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.06, oy+sh*(podY-0.05)); ctx.lineTo(ox+sw*0.5, oy+sh*(podY-0.05-frontH)); ctx.lineTo(ox+sw*0.94, oy+sh*(podY-0.05)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#b0a880";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.1, oy+sh*(podY-0.05)); ctx.lineTo(ox+sw*0.5, oy+sh*(podY-0.05-frontH+0.02)); ctx.lineTo(ox+sw*0.9, oy+sh*(podY-0.05)); ctx.closePath(); ctx.fill();
    // Acrotères + ornements
    ctx.fillStyle = "#c8b858";
    for (const ax of [0.06, 0.5, 0.94]) {
      const ay = ax===0.5 ? podY-0.05-frontH : podY-0.05;
      ctx.beginPath(); ctx.moveTo(ox+sw*(ax-0.024), oy+sh*ay); ctx.lineTo(ox+sw*ax, oy+sh*(ay-0.048)); ctx.lineTo(ox+sw*(ax+0.024), oy+sh*ay); ctx.closePath(); ctx.fill();
    }
    // Dôme central (tiers élevés)
    if (tier >= 2) {
      const domeX = ox+sw*0.5, domeY = oy+sh*(podY-0.05-frontH);
      ctx.fillStyle = "#c0b870"; ctx.beginPath(); ctx.arc(domeX, domeY, sw*0.08, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#e8d880"; ctx.beginPath(); ctx.arc(domeX-sw*0.02, domeY-sh*0.02, sw*0.035, Math.PI*1.1, Math.PI*1.9); ctx.fill();
      ctx.strokeStyle = "#9a8840"; ctx.lineWidth = Math.max(0.5, sw*0.018);
      ctx.beginPath(); ctx.moveTo(domeX, domeY-sw*0.08); ctx.lineTo(domeX, domeY-sw*0.13); ctx.stroke();
    }
    // Grandes portes + fenêtres hautes
    ctx.fillStyle = "rgba(15,12,6,0.7)"; ctx.fillRect(ox+sw*0.42, oy+sh*(podY+0.14), sw*0.16, sh*0.14);
    ctx.fillStyle = litGold;
    for (let wi = 0; wi < 4; wi++) ctx.fillRect(ox+sw*(0.14+wi*0.18), oy+sh*(podY+0.05), sw*0.08, sh*0.1);
    return true;
  }
  return false;
}

export { drawCityEngineSprite };
