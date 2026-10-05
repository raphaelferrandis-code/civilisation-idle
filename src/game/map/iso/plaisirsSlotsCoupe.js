// ── LA SALLE DES MACHINES, dans la coupe (2026-10-03) ─────────────────────────
// La salle de la machine à sous (ui/SlotsStage.jsx) montre ce qu'on y joue : une rangée
// de machines à la toise de la coupe (un habitant fait ~10 px, la machine lui arrive
// à l'épaule, son fronton au-dessus de la tête), les joueurs aux bouts de la rangée.
// Trois habits, ceux du gros plan (plaisirsSlotsArt.js) : fonte et laiton, chrome et
// laque du néon, cadre de lumière des âges cosmiques.
import { mix, piece, contactShadow, FOOT, SD, FR } from './plaisirsHDKit.js';

const BRASS = ['#fff0b0', '#f0cf6a', '#c89a3e', '#8e6a26'];
const IRON = ['#6a6874', '#4a4852', '#34323a', '#222026'];
const CHROME = ['#ffffff', '#e2e8f0', '#b4bcc6', '#7f8892', '#4e5560'];
const LAQUE = ['#c8343a', '#3a5ab8', '#2a8a5c'];

// Une machine, posée au sol (`yb`), son axe en `x`. `k` : son rang dans la rangée.
function machine(ctx, look, x, yb, k) {
  const { O, P, N, S } = ctx;
  contactShadow(P, x - 6, x + 6, yb + 1);
  piece(O, x - 7, yb - 27, 17, 28, (Q) => {
    if (look === 'fonte') {
      Q.rect(x - 6, yb - 20, 13, 20, IRON[2]); Q.vline(x - 6, yb - 20, 20, IRON[1]); Q.vline(x + 6, yb - 20, 20, IRON[3]);
      Q.vline(x - 6, yb - 20, 20, BRASS[2]);
      // Le fronton de laiton, la petite cloche.
      for (let i = -6; i <= 6; i += 1) { const a = Math.round(4 * Math.sqrt(1 - (i * i) / 49)); for (let j = 0; j <= a; j += 1) Q.put(x + i, yb - 21 - j, j === a ? BRASS[0] : IRON[2]); }
      Q.put(x, yb - 24, BRASS[1]); Q.put(x, yb - 23, BRASS[2]);
      // La fenêtre : trois rouleaux crème, un symbole rouge chacun.
      Q.rect(x - 5, yb - 17, 11, 6, BRASS[2]); Q.rect(x - 4, yb - 16, 9, 4, '#fbf6e8');
      for (let t = 0; t < 3; t += 1) { Q.put(x - 3 + t * 3, yb - 15, (k + t) % 2 ? '#c83a3a' : '#22222a'); Q.put(x - 3 + t * 3, yb - 14, (k + t) % 2 ? '#a02a30' : '#22222a'); }
      Q.rect(x - 4, yb - 8, 9, 2, IRON[3]); Q.hline(x - 4, yb - 8, 9, BRASS[1]);            // le plateau
      Q.rect(x - 6, yb - 2, 13, 2, S.wood ? S.wood[2] : '#74502e');                          // le socle
      for (let j = 0; j < 7; j += 1) Q.put(x + 8, yb - 18 + j, BRASS[2]);                    // le levier
      Q.rect(x + 7, yb - 20, 3, 2, BRASS[1]);
    } else if (look === 'neon') {
      const body = LAQUE[k % 3];
      Q.rect(x - 6, yb - 22, 13, 22, body); Q.vline(x - 6, yb - 22, 22, mix(body, '#ffffff', 0.3)); Q.vline(x + 6, yb - 22, 22, mix(body, '#000000', 0.35));
      for (let i = -6; i <= 6; i += 1) { const a = Math.round(3 * Math.sqrt(1 - (i * i) / 49)); for (let j = 0; j <= a; j += 1) Q.put(x + i, yb - 23 - j, j === a ? CHROME[1] : '#fff2c8'); }
      Q.rect(x - 5, yb - 19, 11, 7, CHROME[3]);
      for (let t = 0; t < 3; t += 1) {
        const rx = x - 4 + t * 4;
        Q.rect(rx, yb - 18, 3, 5, '#fbf6e8');
        const sym = (k + t) % 3;
        if (sym === 0) { Q.hline(rx, yb - 17, 3, '#d8404a'); Q.put(rx + 2, yb - 16, '#d8404a'); Q.put(rx + 1, yb - 15, '#d8404a'); }
        else if (sym === 1) { Q.put(rx, yb - 15, '#d8404a'); Q.put(rx + 2, yb - 15, '#d8404a'); Q.put(rx + 1, yb - 17, '#3a8a3a'); }
        else { Q.rect(rx, yb - 16, 3, 2, '#f0cf6a'); Q.put(rx + 1, yb - 17, '#f0cf6a'); }
      }
      Q.rect(x - 5, yb - 10, 11, 2, CHROME[2]);
      Q.rect(x - 4, yb - 5, 9, 3, CHROME[3]); Q.hline(x - 4, yb - 5, 9, CHROME[1]);
      for (let j = 0; j < 9; j += 1) Q.put(x + 8, yb - 20 + j, CHROME[2]);
      Q.rect(x + 7, yb - 22, 3, 3, '#d8404a');
    } else {
      const G = S.glow, G2 = S.glow2;
      for (let j = 0; j < 19; j += 1) for (let i = -6; i <= 6; i += 1) Q.put(x + i, yb - 22 + j, (i + j * 2) % 9 === 0 ? '#ffffff' : mix(G, '#ffffff', 0.55 - j * 0.015));
      Q.vline(x - 6, yb - 22, 19, '#ffffff'); Q.vline(x + 6, yb - 22, 19, G2);
      for (let i = -5; i <= 5; i += 1) Q.put(x + i, yb - 23 - (Math.abs(i) < 3 ? 1 : 0), G);
      // La fenêtre : trois rouleaux clairs et leurs symboles (une vitre sombre à trois
      // points faisait un visage de fantôme).
      Q.rect(x - 5, yb - 18, 11, 6, G2); Q.rect(x - 4, yb - 17, 9, 4, '#ffffff');
      for (let t = 0; t < 3; t += 1) { const c = ['#ff6a8a', '#f0b020', G2][(k + t) % 3]; Q.put(x - 3 + t * 3, yb - 16, c); Q.put(x - 3 + t * 3, yb - 15, c); }
      for (let j = 0; j < 8; j += 1) Q.put(x + 8, yb - 20 + j, G);
      Q.put(x + 8, yb - 21, '#ffffff');
    }
  });
  // La nuit : la fenêtre et le fronton s'allument.
  if (look === 'neon') { for (let i = -5; i <= 5; i += 1) N.put(x + i, yb - 24, '#fff2c8'); for (let t = 0; t < 3; t += 1) N.put(x - 3 + t * 4, yb - 16, '#fff6e0'); }
  else if (look === 'cosmic') { for (let j = 0; j < 19; j += 2) { N.put(x - 6, yb - 22 + j, S.glow); N.put(x + 6, yb - 22 + j, S.glow); } }
  else { N.put(x - 1, yb - 15, '#ffe9a0'); N.put(x + 2, yb - 15, '#ffe9a0'); }
  O.mark(x, yb - 18, look === 'cosmic' ? S.glow : '#ffe0a0');
}

// La rangée, et ses joueurs aux bouts (devant, ils cachaient les rouleaux).
export function slotRow(ctx, r, look) {
  // Les joueurs ne se montrent que jeu ouvert (`crew`, plaisirsEraFurnish.js).
  const { x, y, w, crew: fig, v } = r;
  const yb = y + FOOT - 1;
  const n = Math.max(2, Math.min(5, Math.floor((w - 34) / 20))), x0 = x - Math.round(((n - 1) * 20) / 2);
  for (let k = 0; k < n; k += 1) machine(ctx, look, x0 + k * 20, yb, k);
  fig(x0 - 17, y + SD, 0, 0, v(0), { role: 'joueur' });
  fig(x0 + (n - 1) * 20 + 17, y + SD, 2, 'g', v(1));
  if (w >= 150) fig(x0 + 10, y + FR, 3, 1, v(2), { front: true });
}
