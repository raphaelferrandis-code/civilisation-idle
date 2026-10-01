// LA PASSE AÉRIENNE — les drones. Extraite d'isoRenderer.js le 2026-08-23 (Q10,
// découpage), avec la nuée d'oiseaux partie depuis (cf. plus bas).
//
// Ils volent AU-DESSUS du tri peintre, donc ne participent pas à la profondeur des
// unités au sol et se dessinent en fin de frame.
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Le bloc est déplacé tel quel ; la
// couture a été mesurée avant la coupe (2 sortants, 2 entrants — `_frac`/`_rnd`,
// partis dans isoMath.js pour éviter un import circulaire). Vérifié par comparaison
// ligne à ligne avec la version commitée.
import { CM } from '../layout.js';
import { worldToScreen } from './projection.js';
import { ensureDrone, drawDroneRotors, VEH_SCALE } from '../agents.js';

// ── OISEAUX : 🚫 LA NUÉE QUI TRAVERSE EST PARTIE ────────────────────────────
// Réponse de Raph (2026-10-01) : des oiseaux POSÉS qui s'envolent (pigeons des places
// et des toits, mouettes des quais — iso/isoVieOiseaux.js), pas une volée en V qui
// passe dans le ciel. Elle a été retirée après validation des planches de la petite
// vie. Ne pas la rétablir sans nouvelle demande.

// ── DRONES : passe aérienne (sprite top-down pivoté au cap projeté) ──────────
export function drawIsoDrones(now) {
  if (CM.lodActive) return;
  const T = CM.TILE, z = CM.cam.zoom, s = T * z, ctx = CM.ctx;
  let dchr = null;
  for (const v of CM.vehicles) {
    if (v.type !== 'drone') continue;
    if (!dchr) dchr = ensureDrone();
    const p = worldToScreen(v.x, v.y);
    if (p.x < -s || p.y < -s * 2 || p.x > CM.cw + s || p.y > CM.ch + s) continue;
    const t2 = now || 0;
    const hover = Math.sin(t2 / 380 + v.x * 0.04) * s * 0.04;
    const dScale = (CM.droneSize || 0.58) * VEH_SCALE;   // le drone est un véhicule : même échelle
    // Ombre AU SOL (à la position projetée), drone en altitude au-dessus.
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, s * dScale * 0.2, s * dScale * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    if (!(dchr && dchr.ready && dchr.img)) continue;
    const q = worldToScreen(v.tx, v.ty);
    let hx = q.x - p.x, hy = q.y - p.y;
    const hd = Math.hypot(hx, hy);
    if (hd > 0.5) { hx /= hd; hy /= hd; } else { hx = 1; hy = 0; }
    const dsz = s * dScale;
    const prevSm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(p.x, p.y - s * 0.55 + hover);
    ctx.rotate(Math.atan2(hy, hx) + Math.PI / 2);
    ctx.drawImage(dchr.img, -dsz / 2, -dsz / 2, dsz, dsz);
    drawDroneRotors(ctx, dsz, t2, v.x * 0.1);
    ctx.restore();
    ctx.imageSmoothingEnabled = prevSm;
  }
}
