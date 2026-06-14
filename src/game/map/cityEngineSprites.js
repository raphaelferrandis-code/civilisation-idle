/* eslint-disable */

function drawCityEngineSprite(context) {
  const { ctx, id, tier, litWarm, litGold, ox, oy, sw, sh, px, strokeRect, now, band = 0, ei = 0, gw = 1, gh = 1 } = context;
  if (id === "foragers") {
    // 4 stades suivant l'âge de la ville (ei = eraIndex 0–34), un tous les
    // 10 âges : cueillette sauvage → verger taillé → serre industrielle →
    // hydroponie néon. tier reste la richesse intra-stade (perso/fruits/cagettes).
    const stage = ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3;
    if (stage === 0) {
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

    // === PERSONNAGE — navette panier (0.2) ↔ arbre (0.58) ===
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
    // 4 stades suivant l'âge de la ville (ei = eraIndex 0–34), un tous les
    // 10 âges : greniers sur pilotis → halle de pierre → entrepôt industriel
    // → hub logistique automatisé. tier reste la richesse intra-stade.
    const stage = ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3;
    if (stage === 0) {
    // ── STADE 0 · GRENIERS — silos sur pilotis, grain doré, oiseau picoreur ──
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
    // 4 stades suivant l'âge de la ville (ei = eraIndex 0–34), un tous les
    // 10 âges : mulet bâté → convoi caravanier pavé → fret industriel à vapeur
    // → logistique autonome néon. tier reste la richesse intra-stade (nombre de
    // bêtes/charrettes/wagons/conteneurs). Lumières via CM.nightF : nF dérivé de
    // litGold (halos additifs), lanternes chaudes via litWarm aux stades 1 et 2.
    const stage = ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3;
    const nF = parseFloat(litGold.slice(litGold.lastIndexOf(",") + 1)) || 0;
    if (stage === 0) {
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
    // 4 stades suivant l'âge de la ville (ei 0–34), un tous les 10 âges :
    // troc sur nattes → halle à toile rayée → halles de fonte vitrées →
    // place de commerce néon. Le geste animé reste le transport/échange de
    // marchandises à chaque âge (main-à-main → chaland → diable → drone).
    // tier = richesse intra-stade (étals / marchandises / travées / kiosques).
    const stage = ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3;
    const goodColors = ["#e05030", "#f0c040", "#60a840", "#e8804a", "#9060c0", "#e8e080"];
    if (stage === 0) {
      // ── STADE 0 · TROC SUR NATTES — pas de halle, échange main-à-main ──
      // Âge du Feu/Bois : on troque à même le sol sous un auvent de peau.
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
      // ── L'ATELIER (campement → bourg) : halle de bois et torchis, forge ──
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

    // ── Corps du bâtiment (s'étire sur la terre, partie nord) ───────────────────
    if (stage === 0) {
      // Abri de roseaux / hutte à toit de chaume + foyer rougeoyant la nuit
      px(0.06, 0.18, 0.30, 0.26, "#8a7030");
      ctx.fillStyle = "#6a5018";
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.03, oy + sh * 0.20); ctx.lineTo(ox + sw * 0.21, oy + sh * 0.04); ctx.lineTo(ox + sw * 0.39, oy + sh * 0.20); ctx.closePath(); ctx.fill();
      px(0.16, 0.28, 0.09, 0.16, "#2a1a0c");
      ctx.fillStyle = `rgba(220,120,40,${(0.25 + nF * 0.6).toFixed(2)})`;
      ctx.fillRect(ox + sw * 0.18, oy + sh * 0.32, sw * 0.05, sh * 0.10);
    } else if (stage === 1) {
      // Entrepôt à pignon + fenêtre en arc éclairée
      px(0.05, 0.14, 0.34, 0.30, "#7a5828");
      ctx.fillStyle = "#5a3e18";
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.03, oy + sh * 0.16); ctx.lineTo(ox + sw * 0.22, oy + sh * 0.02); ctx.lineTo(ox + sw * 0.41, oy + sh * 0.16); ctx.closePath(); ctx.fill();
      px(0.16, 0.22, 0.10, 0.12, "#2a1a0c");
      ctx.fillStyle = litWarm; ctx.beginPath(); ctx.arc(ox + sw * 0.21, oy + sh * 0.22, sw * 0.05, Math.PI, 0); ctx.fill();
    } else if (stage === 2) {
      // Entrepôt de briques + charpente fer, cheminée fumante, fenêtres éclairées
      px(0.05, 0.10, 0.36, 0.34, "#8a7060");
      ctx.fillStyle = "#2a2622";
      ctx.fillRect(ox + sw * 0.05, oy + sh * 0.10, sw * 0.016, sh * 0.34);
      ctx.fillRect(ox + sw * 0.394, oy + sh * 0.10, sw * 0.016, sh * 0.34);
      ctx.fillStyle = "#6a5848";
      ctx.beginPath(); ctx.moveTo(ox + sw * 0.03, oy + sh * 0.12); ctx.lineTo(ox + sw * 0.23, oy + sh * 0.00); ctx.lineTo(ox + sw * 0.43, oy + sh * 0.12); ctx.closePath(); ctx.fill();
      for (let i = 0; i < 2 + (tier >= 2 ? 1 : 0); i += 1) {
        ctx.fillStyle = "#2a1a10"; ctx.fillRect(ox + sw * (0.08 + i * 0.11), oy + sh * 0.24, sw * 0.08, sh * 0.10);
        ctx.fillStyle = litWarm; ctx.beginPath(); ctx.arc(ox + sw * (0.12 + i * 0.11), oy + sh * 0.24, sw * 0.04, Math.PI, 0); ctx.fill();
      }
      px(0.30, 0.04, 0.06, 0.20, "#4a3a2a");
      const smk = (now / 700) % 1;
      ctx.fillStyle = `rgba(120,110,100,${((1 - smk) * 0.35).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(ox + sw * 0.33, oy + sh * (0.04 - smk * 0.04 + 0.0), sw * (0.04 + smk * 0.06), 0, Math.PI * 2); ctx.fill();
    } else {
      // Terminal métal / verre + baies vitrées cyan pulsées
      px(0.05, 0.08, 0.38, 0.36, "#2e3c50");
      px(0.03, 0.04, 0.42, 0.05, "#1e2c40");
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
    // ── MOULIN À EAU UNIQUE — posé sur la rive, eau au sud (comme le port) ──────
    // L'emprise plonge jusqu'au centre du fleuve : la moitié basse du sprite est de
    // l'eau RÉELLEMENT peinte (cf. layout cmWaterMillSpan + branche de pose). On ne
    // peint donc plus de « bief » : on laisse le fleuve transparaître sous la ligne
    // d'eau et la roue/turbine y plonge. 4 stades d'ère (bois → pierre → brique →
    // hydro), le tier enrichissant chacun (fenêtres, fumée, lueur).
    const stage = ei < 10 ? 0 : ei < 20 ? 1 : ei < 30 ? 2 : 3;
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
