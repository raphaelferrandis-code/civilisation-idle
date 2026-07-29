/* ---- Calibration des feux de navigation, sur les SPRITES ---- */
//
// Même geste que `__shopCalibPool` pour les bouteilles de l'échoppe : on clique
// où la chose doit être, le HUD rend le bloc de code à recopier.
//
// ⚠ PREMIÈRE VERSION REJETÉE : elle faisait cliquer sur la carte, donc sur des
// coques qui avancent, oscillent et tournent pendant qu'on vise. « C'est
// horrible, les bateaux bougent tout le temps » (Raph, 2026-07-29). La cible
// d'un calibrage doit être IMMOBILE — ici le sprite lui-même, agrandi ×6, à
// l'arrêt, avec les feux actuels affichés dessus pour voir ce qu'on corrige.
//
// Conversion clic → réglage. Le sprite est posé par le rendu à :
//     x = centre − dwImg/2      y = centre − dwImg × BOAT_IMG_TOP
// avec dwImg = dwNav × BOAT_IMG_K. En vue EST (cap nul) l'axe d'avance du bateau
// est horizontal à l'écran et son axe travers est vertical, si bien qu'un clic
// libre (u, v) en fraction du sprite se lit directement :
//     avance du feu   fore = K × (u − 0,5)
//     hauteur + travers      K × (TOP − v)
// Deux clics donnent donc les quatre valeurs :
//     mast  = K × (TOP − (v1 + v2)/2)      (leur MOYENNE : l'élévation commune)
//     beam  = K × (v2 − v1)/2              (leur DEMI-ÉCART : le travers, signé)
//     foreP = K × (u1 − 0,5)   foreS = K × (u2 − 0,5)
//
// ⚠ Les deux `fore` ont été ajoutés après coup. La première version n'avait que
// mast et beam, donc ne lisait QUE la hauteur des clics : les feux restaient
// cloués sur l'axe central et cliquer à gauche ou à droite ne changeait rien.
// « Ça ne marche que sur la même ligne du milieu ? » (Raph). On peut désormais
// les poser n'importe où.
//
// Le premier clic est TOUJOURS bâbord, le second tribord — pas de tri par
// hauteur : rien n'oblige le feu rouge à être le plus haut si on le pose à la
// proue et le vert à la poupe. `beam` est signé pour cette raison.
// ⚠ CE MODULE N'IMPORTE RIEN D'isoRenderer, alors qu'il a besoin de trois de ses
// valeurs. isoRenderer l'importe déjà (pour exposer __navCalib) : un import en
// retour fermerait un CYCLE, et un cycle ES place les `const` du module en cours
// d'évaluation en zone morte. Ça passerait aujourd'hui — rien n'est lu au niveau
// module — mais la première constante lue au chargement exploserait, et ce projet
// a déjà payé ce piège (TDZ sur buildingById). isoRenderer POUSSE donc sa config.
const CFG = { K: 1.15, TOP: 0.58, anchorFor: () => ({ mast: 0.3, beam: 0.16 }) };
export function configureNavCalib(o) { Object.assign(CFG, o); }

// Les stades qui PORTENT des feux. Le pêcheur n'y est pas : il est à l'ancre,
// hors des règles de route, et ne porte rien.
const STAGES = ['raft', 'sail', 'steam', 'container', 'rowboat', 'dinghy', 'motorboat'];
const SPRITE = 85;      // taille source d'une rotation
const ZOOM = 6;         // sprite affiché ×6 — un pixel source reste cliquable
const VIEW = SPRITE * ZOOM;

const state = { on: false, idx: 0, pts: [], captured: {}, el: null, cnv: null, img: null };

export const navCalibOn = () => state.on;

const stage = () => STAGES[state.idx];
// Réglage courant d'un stade : ce qu'on a relevé, sinon ce que le jeu utilise.
const current = (st) => state.captured[st] || CFG.anchorFor(st);

function codeBlock() {
  const f = (n) => n.toFixed(3);
  const rows = STAGES.filter((s) => state.captured[s]).map((s) => {
    const v = state.captured[s];
    return `  ${s}: { mast: ${f(v.mast)}, beam: ${f(v.beam)}, foreP: ${f(v.foreP)}, foreS: ${f(v.foreS)} },`;
  });
  return rows.length ? `const NAV_ANCHOR = {\n${rows.join('\n')}\n};` : '';
}

// Position écran (fraction du sprite) d'un feu, à partir du réglage. Inverse
// exact de la formule de relevé — c'est ce qui permet de VOIR le réglage actuel
// avant de le corriger.
function posOf(an, port) {
  const fore = (port ? an.foreP : an.foreS) || 0;
  const sign = port ? 1 : -1;
  return {
    u: 0.5 + fore / CFG.K,
    v: CFG.TOP - ((an.mast || 0) + sign * (an.beam || 0)) / CFG.K,
  };
}

function paint() {
  if (!state.cnv) return;
  const g = state.cnv.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, VIEW, VIEW);
  g.fillStyle = '#1b2430';                       // fond d'eau, pour juger le contraste
  g.fillRect(0, 0, VIEW, VIEW);
  // On ne peint QUE le sprite du stade affiché. Le chargement est asynchrone :
  // en enchaînant les stades, l'image précédente est encore là quand le label a
  // déjà changé, et on calibrerait alors une coque en croyant en viser une autre
  // (vu à la capture — le HUD disait « steam » sur le sprite du voilier).
  const img = state.img;
  if (img && img._stage === stage() && img.complete && img.naturalWidth) {
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, VIEW, VIEW);
  }
  // Croix de repère au centre de coque : l'origine des mesures, pas une
  // contrainte — les feux se posent où on veut autour.
  g.strokeStyle = 'rgba(255,255,255,0.14)';
  g.beginPath();
  g.moveTo(VIEW / 2, 0); g.lineTo(VIEW / 2, VIEW);
  g.moveTo(0, CFG.TOP * VIEW); g.lineTo(VIEW, CFG.TOP * VIEW);
  g.stroke();
  const an = current(stage());
  for (const [port, col] of [[true, '#ff3c34'], [false, '#3cff6e']]) {
    const p = posOf(an, port);
    const x = Math.round(p.u * VIEW), y = Math.round(p.v * VIEW);
    g.fillStyle = col;
    g.fillRect(x - 4, y - 4, 8, 8);
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.strokeRect(x - 4.5, y - 4.5, 9, 9);
  }
  // Clics déjà posés pour ce bateau.
  g.fillStyle = '#ffd76a';
  for (const p of state.pts) g.fillRect(p.x - 2, p.y - 2, 4, 4);
}

function loadSprite() {
  state.pts = [];
  const img = new Image();
  img._stage = stage();                 // lu par paint() : jamais le mauvais sprite
  img.onload = paint;
  img.onerror = paint;
  img.src = `/pixelart/iso/boat-${img._stage}-east.png`;
  state.img = img;
  paint();
  render();
}

function onCanvasClick(ev) {
  const r = state.cnv.getBoundingClientRect();
  state.pts.push({ x: ev.clientX - r.left, y: ev.clientY - r.top });
  if (state.pts.length >= 2) {
    // Ordre des CLICS, pas ordre des hauteurs : le premier est bâbord, le second
    // tribord. Trier par y interdirait de poser le rouge à la proue et le vert à
    // la poupe — c'est justement ce qu'on vient d'ouvrir.
    const [a, b] = state.pts;
    const u1 = a.x / VIEW, v1 = a.y / VIEW;
    const u2 = b.x / VIEW, v2 = b.y / VIEW;
    state.captured[stage()] = {
      mast: CFG.K * (CFG.TOP - (v1 + v2) / 2),
      beam: CFG.K * (v2 - v1) / 2,
      foreP: CFG.K * (u1 - 0.5),
      foreS: CFG.K * (u2 - 0.5),
    };
    state.pts = [];
    console.log(codeBlock());
  }
  paint();
  render();
}

function go(d) {
  state.idx = (state.idx + d + STAGES.length) % STAGES.length;
  loadSprite();
}

function render() {
  if (!state.el) return;
  const hud = state.el.querySelector('[data-hud]');
  if (!hud) return;
  const an = current(stage());
  const done = STAGES.filter((s) => state.captured[s]);
  const f = (n) => (n || 0).toFixed(3);
  hud.textContent = `${stage()}  (${state.idx + 1}/${STAGES.length})`
    + `${state.captured[stage()] ? '  ← relevé' : ''}\n`
    + `mast ${f(an.mast)}  beam ${f(an.beam)}\n`
    + `foreP ${f(an.foreP)}  foreS ${f(an.foreS)}\n\n`
    + (state.pts.length
      ? 'Clique le feu VERT (tribord), où tu veux.\n'
      : 'Clique le feu ROUGE (bâbord), puis le VERT.\nN\'importe où sur le sprite.\n')
    + `Relevés : ${done.length ? done.join(', ') : '(aucun)'}\n\n`
    + (codeBlock() || '(rien à copier pour l\'instant)');
}

function mount() {
  if (state.el || typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(8,10,14,0.88);'
    + 'display:flex;align-items:center;justify-content:center;gap:24px;font:12px/1.5 monospace;color:#e8e4d8';

  const cnv = document.createElement('canvas');
  cnv.width = VIEW; cnv.height = VIEW;
  cnv.style.cssText = `width:${VIEW}px;height:${VIEW}px;flex:none;image-rendering:pixelated;`
    + 'cursor:crosshair;border:1px solid #4a4438;border-radius:4px';
  cnv.addEventListener('click', onCanvasClick);

  // ⚠ TAILLES FIXES, et c'est tout l'enjeu : le HUD s'allonge dès qu'un relevé
  // apparaît (le bloc de code s'y ajoute). En largeur libre, ce panneau poussait
  // le canvas de quelques pixels ENTRE LE PREMIER ET LE SECOND CLIC — le sprite
  // glissait sous le curseur et le second feu atterrissait à côté. Mesuré : 6 px
  // d'erreur sur l'avance. Un outil de calibrage ne doit pas bouger, c'est la
  // raison d'être de sa réécriture.
  const side = document.createElement('div');
  side.style.cssText = `display:flex;flex-direction:column;gap:10px;width:360px;height:${VIEW}px;flex:none`;
  const hud = document.createElement('pre');
  hud.setAttribute('data-hud', '1');
  hud.style.cssText = 'margin:0;padding:10px 12px;background:rgba(20,24,32,0.95);'
    + 'border:1px solid #4a4438;border-radius:4px;white-space:pre-wrap;'
    + 'flex:1;overflow:auto;min-height:0';
  const nav = document.createElement('div');
  nav.style.cssText = 'display:flex;gap:8px';
  for (const [txt, d] of [['◀ précédent', -1], ['suivant ▶', 1]]) {
    const b = document.createElement('button');
    b.textContent = txt;
    b.style.cssText = 'flex:1;padding:6px 10px;background:#2a3140;color:#e8e4d8;'
      + 'border:1px solid #4a4438;border-radius:3px;cursor:pointer;font:inherit';
    b.addEventListener('click', () => go(d));
    nav.appendChild(b);
  }
  const quit = document.createElement('button');
  quit.textContent = 'terminer (__navCalib)';
  quit.style.cssText = 'padding:6px 10px;background:#3a2f22;color:#e8e4d8;'
    + 'border:1px solid #4a4438;border-radius:3px;cursor:pointer;font:inherit';
  quit.addEventListener('click', () => toggleNavCalib());

  side.append(hud, nav, quit);
  el.append(cnv, side);
  document.body.appendChild(el);
  state.el = el; state.cnv = cnv;
  loadSprite();
}

function unmount() {
  if (!state.el) return;
  state.el.remove();
  state.el = null; state.cnv = null; state.img = null;
}

export function toggleNavCalib() {
  state.on = !state.on;
  state.pts = [];
  if (state.on) mount(); else unmount();
  if (!state.on && Object.keys(state.captured).length) {
    console.log('Calibrage terminé — bloc à recopier dans isoRenderer.js :\n' + codeBlock());
  }
  return state.on;
}

if (typeof window !== 'undefined') window.__navCalib = toggleNavCalib;
