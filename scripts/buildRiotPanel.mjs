// Construit un PANNEAU HTML de validation des émeutiers par ère : chaque sprite
// défile (marche animée via CSS steps sur la bande sud 6 frames), sprites inlinés
// en data-URI (l'Artifact bloque les hôtes externes). Colonne 1 = habitant de l'ère
// (repère de cohérence). Ligne = ère. Cellule manquante (pas encore assemblée) =
// placeholder. Sortie : scratchpad/riot-panel.html.
//   node scripts/buildRiotPanel.mjs
import { PNG } from 'pngjs';
import fs from 'node:fs';

const AG = 'public/pixelart/agents';
const OUT = process.env.PANEL_OUT || 'scratchpad/riot-panel.html';
const FRAMES = 6, FW = 68;

// Ordre chronologique du jeu (mêmes bandes que agentSetForBand / riotEraKey).
const ERAS = [
  { key: 'stone', label: 'Préhistoire', band: '0–1', habitant: 'caveman',      melee: 'épieu' },
  { key: '',      label: 'Médiéval',    band: '2–3', habitant: 'villager',     melee: 'fourche' },
  { key: 'anti',  label: 'Antiquité',   band: '4',   habitant: 'greekman',     melee: 'lance' },
  { key: 'ind',   label: 'Industriel',  band: '5–6', habitant: 'industrialman',melee: 'pied-de-biche' },
  { key: 'fut',   label: 'Futur',       band: '≥ 7', habitant: 'futureman',    melee: 'matraque' },
];
const TYPES = [
  { slot: 'man-torch',   cap: '♂ torche' },
  { slot: 'man-fork',    cap: '♂ %melee%' },
  { slot: 'woman-torch', cap: '♀ torche' },
  { slot: 'woman-fork',  cap: '♀ %melee%' },
];

const b64 = (p) => fs.existsSync(p) ? 'data:image/png;base64,' + fs.readFileSync(p).toString('base64') : null;
// Découpe la 1re frame (repère habitant statique) d'une bande 6×68.
function firstFrame(p) {
  if (!fs.existsSync(p)) return null;
  const src = PNG.sync.read(fs.readFileSync(p));
  const H = src.height;
  const out = new PNG({ width: FW, height: H });
  for (let y = 0; y < H; y += 1) for (let x = 0; x < FW; x += 1) {
    const si = (y * src.width + x) * 4, di = (y * FW + x) * 4;
    out.data[di] = src.data[si]; out.data[di + 1] = src.data[si + 1];
    out.data[di + 2] = src.data[si + 2]; out.data[di + 3] = src.data[si + 3];
  }
  return 'data:image/png;base64,' + PNG.sync.write(out).toString('base64');
}

const cell = (uri, animated, cap) => {
  if (!uri) return `<div class="cell empty"><div class="ph">—</div><div class="cap">${cap}</div></div>`;
  const cls = animated ? 'sprite walk' : 'sprite';
  return `<div class="cell"><div class="spritebox"><div class="${cls}" style="background-image:url(${uri})"></div></div><div class="cap">${cap}</div></div>`;
};

let rows = '';
for (const e of ERAS) {
  const pre = e.key ? e.key + '-' : '';
  const hab = firstFrame(`${AG}/inhabitants/${e.habitant}-south.png`);
  let cells = `<div class="cell ref">${hab ? `<div class="spritebox"><div class="sprite" style="background-image:url(${hab})"></div></div>` : '<div class="ph">?</div>'}<div class="cap">${e.habitant}</div></div>`;
  for (const t of TYPES) {
    const uri = b64(`${AG}/events/rioter-${pre}${t.slot}-south.png`);
    cells += cell(uri, true, t.cap.replace('%melee%', e.melee));
  }
  rows += `<div class="row"><div class="erahdr"><div class="eralabel">${e.label}</div><div class="eraband">bande ${e.band}</div></div>${cells}</div>`;
}

const hero = b64('.preview-shots/riot-stone-zoom.png');
const heroBlock = hero ? `<figure class="hero">
  <img src="${hero}" alt="Émeute préhistorique en jeu" />
  <figcaption>En jeu — émeute forcée en <strong>bande 0</strong> : les émeutiers sont des hommes/femmes des cavernes (fourrures, torches, épieux), cohérents avec le village de huttes.</figcaption>
</figure>` : '';

const html = `<div class="wrap">
<header>
  <h1>Émeutiers par ère</h1>
  <p class="sub">Chaque émeute porte désormais le costume de son ère, comme les habitants de la carte. La colonne <em>habitant</em> est le repère de cohérence. Dans chaque ère, deux armes : <span class="k fire">torche</span> — objet enflammé qui conserve le halo nocturne — et <span class="k melee">mêlée</span>, l'outil de l'époque.</p>
</header>
${heroBlock}
<div class="grid">
  <div class="colhdr"><span></span><span>habitant</span><span>♂ torche</span><span>♂ mêlée</span><span>♀ torche</span><span>♀ mêlée</span></div>
  ${rows}
</div>
<style>
  .wrap { font-family: system-ui, -apple-system, sans-serif; color: #ece4d4;
    background: #141009; padding: 26px 22px 34px; border-radius: 12px;
    max-width: 1040px; margin: 0 auto; }
  header { border-bottom: 2px solid #e8894018; padding-bottom: 16px; margin-bottom: 8px; }
  h1 { font-size: 25px; font-weight: 800; margin: 0 0 8px; letter-spacing: .3px;
    color: #f4ecdc; text-wrap: balance; }
  h1::before { content: ""; display: inline-block; width: 22px; height: 3px; margin: 0 11px 6px 0;
    background: #e88940; vertical-align: middle; border-radius: 2px; }
  .sub { font-size: 13.5px; color: #9c9280; margin: 0; max-width: 68ch; line-height: 1.62; }
  .sub em { color: #c8bda6; font-style: normal; font-weight: 600; }
  .k { font-weight: 700; }
  .k.fire { color: #e88940; }
  .k.melee { color: #b9a06a; }
  .hero { margin: 20px 0 6px; }
  .hero img { width: 100%; display: block; border-radius: 10px; border: 1px solid #2c2519; }
  .hero figcaption { font-size: 12px; color: #8f8672; margin-top: 8px; line-height: 1.5; }
  .hero figcaption strong { color: #e88940; font-weight: 700; }
  .grid { display: flex; flex-direction: column; }
  .colhdr, .row { display: grid; grid-template-columns: 128px repeat(5, 1fr); align-items: center; }
  .colhdr { padding: 16px 0 8px; }
  .colhdr span { font-size: 10.5px; text-transform: uppercase; letter-spacing: .09em;
    color: #6f685b; text-align: center; }
  .colhdr span:nth-child(2) { color: #5e7a72; }
  .row { border-top: 1px solid #241f17; padding: 6px 0; }
  .erahdr { display: flex; flex-direction: column; gap: 3px; padding-left: 2px; }
  .eralabel { font-size: 15.5px; font-weight: 700; color: #f0e7d6; }
  .eraband { font-size: 10.5px; color: #7a7264; font-variant-numeric: tabular-nums; letter-spacing: .02em; }
  .cell { display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 8px 0; }
  .spritebox { width: 132px; height: 122px; display: grid; place-items: center;
    background: radial-gradient(ellipse at 50% 78%, #322b20 0%, #1b160f 72%);
    border-radius: 9px; border: 1px solid #2c2519; overflow: hidden; }
  .cell.ref .spritebox { background: radial-gradient(ellipse at 50% 78%, #24332f 0%, #141d1a 72%);
    border-color: #26332e; }
  .sprite { width: ${FW}px; height: ${FW}px; image-rendering: pixelated;
    background-repeat: no-repeat; background-size: ${FW * FRAMES}px ${FW}px; transform: scale(1.55); }
  .walk { animation: march .8s steps(${FRAMES}) infinite; }
  @media (prefers-reduced-motion: reduce) { .walk { animation: none; } }
  @keyframes march { from { background-position: 0 0; } to { background-position: -${FW * FRAMES}px 0; } }
  .cap { font-size: 10.5px; color: #8f8672; letter-spacing: .02em; }
  .ph { width: 132px; height: 122px; display: grid; place-items: center; color: #4f4a3f;
    font-size: 22px; background: #17130d; border: 1px dashed #2b251b; border-radius: 9px; }
</style>`;

fs.mkdirSync(OUT.replace(/[/\\][^/\\]*$/, ''), { recursive: true });
fs.writeFileSync(OUT, html);
console.log('panneau écrit →', OUT, '(' + html.length + ' o)');
