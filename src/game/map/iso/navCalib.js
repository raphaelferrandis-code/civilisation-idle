/* ---- Calibration des feux de navigation, au clic ---- */
//
// Même geste que `__shopCalibPool` pour les bouteilles de l'échoppe (Raph,
// 2026-07-15) : on clique où la chose doit être, et le HUD rend le bloc de code
// à recopier. Régler ça au jugé dans le source, recharger, regarder, recommencer
// est le genre de boucle qui coûte dix allers-retours pour un pixel.
//
// Ici la cible n'est pas une image fixe mais une COQUE, à un zoom quelconque et
// sous un cap quelconque. Deux clics par bateau — le feu rouge (bâbord) puis le
// vert (tribord) — et on en déduit les deux seules valeurs qui comptent :
//
//   mast = hauteur du feu au-dessus du centre de coque, en fraction de la
//          largeur du sprite (donc indépendante du zoom ET du stade) ;
//   beam = demi-écartement des deux feux, même unité.
//
// Passer par le MILIEU des deux clics rend la mesure robuste : à cap oblique,
// un seul clic laisse le système mal conditionné (division par sin(cap) qui
// dégénère quand le bateau va vers le nord ou le sud).
//
// Rien de tout ceci n'est chargé en jeu tant que `__navCalib()` n'est pas tapé :
// l'overlay est créé à la demande et retiré à la sortie.
import { CM } from '../layout.js';

const state = {
  on: false,
  pts: [],          // clics du bateau en cours (max 2)
  captured: {},     // stage -> { mast, beam }
  el: null,         // overlay DOM
  target: null,     // { stage, x, y, dw } figé au début de la capture
};

export const navCalibOn = () => state.on;

// Le bateau à calibrer : celui dont l'ancre écran est la plus proche du centre
// du champ. C'est la lecture la plus naturelle — on cadre ce qu'on veut régler.
function pickTarget() {
  if (!CM.ships || !CM.ships.length) return null;
  const cx = (CM.cw || 0) / 2, cy = (CM.ch || 0) / 2;
  let best = null, bestD = Infinity;
  for (const sh of CM.ships) {
    if (!sh._nav) continue;
    const d = (sh._nav.x - cx) ** 2 + (sh._nav.y - cy) ** 2;
    if (d < bestD) { bestD = d; best = sh; }
  }
  if (!best) return null;
  return { stage: best._nav.stage || best.kind, x: best._nav.x, y: best._nav.y, dw: best._nav.dw };
}

function codeBlock() {
  const rows = Object.entries(state.captured)
    .map(([k, v]) => `  ${k}: { mast: ${v.mast.toFixed(3)}, beam: ${v.beam.toFixed(3)} },`);
  return rows.length ? `const NAV_ANCHOR = {\n${rows.join('\n')}\n};` : '';
}

function render() {
  if (!state.el) return;
  // Entre deux captures, `target` est nul : on REGARDE quand même qui serait
  // visé, sinon le HUD retomberait sur « aucun bateau » juste après un relevé
  // réussi et effacerait le code sous les yeux de celui qui allait le copier.
  const t = state.target || pickTarget();
  const quoi = state.pts.length === 0 ? 'le feu ROUGE (bâbord)' : 'le feu VERT (tribord)';
  const faits = Object.keys(state.captured);
  state.el.innerHTML = '';
  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:12px;top:12px;max-width:420px;padding:10px 12px;'
    + 'background:rgba(12,14,20,0.92);color:#e8e4d8;font:12px/1.5 monospace;border:1px solid #4a4438;'
    + 'border-radius:4px;white-space:pre-wrap;pointer-events:none';
  hud.textContent = 'CALIBRAGE FEUX\n'
    + (t ? `Bateau visé : ${t.stage} — clique ${quoi}.\n`
      : 'Aucun bateau dans le champ. Amène-en un (le plus proche du centre est visé).\n')
    + `Relevés : ${faits.length ? faits.join(', ') : '(aucun)'}\n`
    + '__navCalib() pour finir.'
    + (faits.length ? `\n\n${codeBlock()}` : '');
  state.el.appendChild(hud);
}

function onClick(ev) {
  const rect = CM.canvas.getBoundingClientRect();
  const cx = ev.clientX - rect.left, cy = ev.clientY - rect.top;
  // La cible est FIGÉE au premier clic : entre les deux clics le bateau
  // continue d'avancer, et mesurer le second par rapport à sa nouvelle position
  // fausserait l'écartement.
  if (!state.pts.length) state.target = pickTarget();
  if (!state.target) { render(); return; }
  state.pts.push({ x: cx, y: cy });
  if (state.pts.length >= 2) {
    const [a, b] = state.pts;
    const { y, dw } = state.target;
    // MILIEU des deux clics = le mât ; DEMI-DISTANCE = l'écartement. Passer par
    // le milieu rend la mesure robuste au cap : avec un seul clic, la résolution
    // divise par sin(cap) et dégénère dès qu'un bateau monte ou descend le
    // fleuve plein nord.
    const my = (a.y + b.y) / 2;
    const mast = (y - my) / dw;                        // au-dessus du centre → positif
    const beam = Math.hypot(a.x - b.x, a.y - b.y) / 2 / dw;
    state.captured[state.target.stage] = { mast, beam };
    state.pts = [];
    state.target = null;
    console.log(codeBlock());
  }
  render();
}

function mount() {
  if (state.el || typeof document === 'undefined' || !CM.canvas) return;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:crosshair;background:rgba(0,0,0,0.02)';
  el.addEventListener('click', onClick);
  document.body.appendChild(el);
  state.el = el;
  render();
}

function unmount() {
  if (!state.el) return;
  state.el.removeEventListener('click', onClick);
  state.el.remove();
  state.el = null;
}

export function toggleNavCalib() {
  state.on = !state.on;
  state.pts = [];
  state.target = null;
  if (state.on) mount(); else unmount();
  if (!state.on && Object.keys(state.captured).length) {
    console.log('Calibrage terminé — bloc à recopier dans isoRenderer.js :\n' + codeBlock());
  }
  return state.on;
}

if (typeof window !== 'undefined') window.__navCalib = toggleNavCalib;
