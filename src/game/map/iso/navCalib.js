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
const CFG = {
  K: 1.15, TOP: 0.58, anchorFor: () => ({ mast: 0.3, beam: 0.16 }),
  stages: null, sectors: null, uvFor: () => null,
};
export function configureNavCalib(o) { Object.assign(CFG, o); }

// Les stades à calibrer viennent d'isoRenderer (NAV_STAGES) : une liste tenue
// ici aurait fini par diverger de celle des coques qui s'allument, et on aurait
// passé du temps à régler des feux qui ne s'allument jamais. Le repli ne sert
// qu'aux tests, avant que la config soit poussée.
const STAGES = ['sail', 'steam', 'container', 'dinghy', 'motorboat'];
const SPRITE = 85;      // taille source d'une rotation
const ZOOM = 6;         // sprite affiché ×6 — un pixel source reste cliquable
const VIEW = SPRITE * ZOOM;

const SECTORS = ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'];

// `captured` est indexé par stade PUIS par face : { sail: { east: {p,s}, … } }.
const state = { on: false, idx: 0, sec: 0, pts: [], captured: {}, el: null, cnv: null, img: null };

export const navCalibOn = () => state.on;

// ── Le relevé SURVIT au rechargement ────────────────────────────────────────
// 40 faces à cliquer, et tout vivait dans une variable de module : un F5, un
// HMR, un onglet fermé par mégarde, et le travail était perdu sans aucun moyen
// de le retrouver — le bloc n'existait que dans l'historique de la console.
// Il est donc écrit dans localStorage à CHAQUE relevé, pas à la fin.
const STORE = 'cmNavCalib';
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state.captured)); } catch { /* privé/plein */ }
}
function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) Object.assign(state.captured, JSON.parse(raw));
  } catch { /* illisible : on repart de zéro plutôt que de planter l'outil */ }
}
load();

// Re-cracher le bloc à tout moment, sans rouvrir l'outil ni recliquer :
// `__navCalibDump()`. `__navCalibClear()` repart de zéro.
if (typeof window !== 'undefined') {
  window.__navCalibDump = () => { const b = codeBlock(); console.log(b || '(aucun relevé)'); return b; };
  window.__navCalibClear = () => { state.captured = {}; save(); return 'relevés effacés'; };
}

const list = () => CFG.stages || STAGES;
const secs = () => CFG.sectors || SECTORS;
const stage = () => list()[state.idx];
const sector = () => secs()[state.sec];
const capturedAt = (st, se) => (state.captured[st] || {})[se] || null;

function codeBlock() {
  const f = (n) => n.toFixed(3);
  const pair = (c) => `[${f(c[0])}, ${f(c[1])}]`;
  const blocs = list().filter((s) => state.captured[s]).map((s) => {
    const faces = secs().filter((se) => state.captured[s][se]).map((se) => {
      const v = state.captured[s][se];
      return `    ${se}: { p: ${pair(v.p)}, s: ${pair(v.s)} },`;
    });
    return `  ${s}: {\n${faces.join('\n')}\n  },`;
  });
  return blocs.length ? `const NAV_UV = {\n${blocs.join('\n')}\n};` : '';
}

// Position (fraction du sprite) des deux feux pour la face affichée : le relevé
// s'il existe, sinon la PROJECTION du réglage de profil — c'est cette projection
// qu'on est justement en train de corriger face par face, autant la voir.
function posOf(port) {
  const c = capturedAt(stage(), sector());
  if (c) { const q = port ? c.p : c.s; return { u: q[0], v: q[1] }; }
  const an = CFG.anchorFor(stage());
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
  if (img && img._key === stage() + ':' + sector() && img.complete && img.naturalWidth) {
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
  for (const [port, col] of [[true, '#ff3c34'], [false, '#3cff6e']]) {
    const p = posOf(port);
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
  // La clé porte la FACE en plus du stade : sans elle, changer de rotation
  // laissait l'image précédente sous le nouveau label (déjà corrigé une fois
  // entre stades, le même piège revient entre faces).
  img._key = stage() + ':' + sector();
  img.onload = paint;
  img.onerror = paint;
  img.src = `/pixelart/iso/boat-${stage()}-${sector()}.png`;
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
    // Position BRUTE sur le sprite de CETTE face — aucune projection, aucune
    // trigonométrie : le feu sera dessiné au pixel désigné. C'est tout l'intérêt
    // de calibrer face par face plutôt que de dériver les 7 autres d'un profil.
    const st = stage(), se = sector();
    (state.captured[st] || (state.captured[st] = {}))[se] = {
      p: [a.x / VIEW, a.y / VIEW],
      s: [b.x / VIEW, b.y / VIEW],
    };
    state.pts = [];
    save();                      // à CHAQUE relevé, pas à la fin
    // Enchaîne sur la face suivante : 8 par bateau, autant ne pas avoir à
    // cliquer « suivant » entre chaque.
    goFace(1);
    console.log(codeBlock());
    return;
  }
  paint();
  render();
}

function go(d) {
  const n = list().length;
  state.idx = (state.idx + d + n) % n;
  state.sec = 0;
  loadSprite();
}

function goFace(d) {
  const n = secs().length;
  state.sec = (state.sec + d + n) % n;
  loadSprite();
}

function render() {
  if (!state.el) return;
  const hud = state.el.querySelector('[data-hud]');
  if (!hud) return;
  // Avancement PAR BATEAU : 8 faces chacun, on veut voir d'un coup d'œil celles
  // qui restent plutôt que de compter.
  const faits = secs().map((se) => (capturedAt(stage(), se) ? '●' : '·')).join(' ');
  const nFaits = list().reduce((n, s) => n + secs().filter((se) => capturedAt(s, se)).length, 0);
  const nTotal = list().length * secs().length;
  hud.textContent = `${stage()}  (${state.idx + 1}/${list().length})\n`
    + `face ${sector()}  (${state.sec + 1}/${secs().length})`
    + `${capturedAt(stage(), sector()) ? '  ← relevée' : ''}\n`
    + `${faits}\n\n`
    + (state.pts.length
      ? 'Clique le feu VERT (tribord), où tu veux.\n'
      : 'Clique le feu ROUGE (bâbord), puis le VERT.\nN\'importe où sur le sprite.\n')
    + 'La face suivante s\'enchaîne toute seule.\n\n'
    + `Total : ${nFaits}/${nTotal} faces\n\n`
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
  const mkRow = (defs) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px';
    for (const [txt, fn] of defs) {
      const b = document.createElement('button');
      b.textContent = txt;
      b.style.cssText = 'flex:1;padding:6px 10px;background:#2a3140;color:#e8e4d8;'
        + 'border:1px solid #4a4438;border-radius:3px;cursor:pointer;font:inherit';
      b.addEventListener('click', fn);
      row.appendChild(b);
    }
    return row;
  };
  const nav = document.createElement('div');
  nav.style.cssText = 'display:flex;flex-direction:column;gap:8px';
  nav.append(
    mkRow([['◀ bateau', () => go(-1)], ['bateau ▶', () => go(1)]]),
    mkRow([['◀ face', () => goFace(-1)], ['face ▶', () => goFace(1)]]),
  );
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
