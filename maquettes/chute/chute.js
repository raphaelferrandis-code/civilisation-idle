// Régie de la maquette « la Chute » — une barre discrète en bas de l'écran.
// (Outil de maquette : elle ne fait pas partie de la proposition.)
import { init, D, TUNE, actFige, actChute, actNuit, actReste, restoreCity, stop, frameCore, setEra } from './director.js';
import { makePanel } from './panel.js';

const css = `
#chute-regie{position:fixed;left:50%;transform:translateX(-50%);bottom:10px;z-index:99999;display:flex;gap:4px;
  align-items:center;padding:5px 6px;background:rgba(14,12,22,.86);border:1px solid #5a4a36;border-radius:8px;
  font:12px/1 'Pixelify Sans',system-ui,sans-serif;color:#e8dcc4;box-shadow:0 4px 18px rgba(0,0,0,.5)}
#chute-regie button{font:inherit;color:inherit;background:#2a2238;border:1px solid #4a3e5c;border-radius:5px;
  padding:6px 9px;cursor:pointer}
#chute-regie button:hover{border-color:#cf9c50}
#chute-regie button.on{background:#5a3a22;border-color:#cf9c50;color:#ffd08a}
#chute-regie .sep{width:1px;height:20px;background:#4a3e5c;margin:0 3px}
html.chute-clean .city-stage-hud, html.chute-clean .city-shop-dock, html.chute-clean .shop-fab,
html.chute-clean .buy-all-fab, html.chute-clean .map-tools, html.chute-clean .city-aux,
html.chute-busy .city-shop-dock, html.chute-busy .shop-fab, html.chute-busy .buy-all-fab{visibility:hidden!important}
html.chute-noregie #chute-regie{display:none}
`;

function ui() {
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
  const bar = document.createElement('div');
  bar.id = 'chute-regie';
  const B = (label, title, fn) => {
    const b = document.createElement('button');
    b.textContent = label; b.title = title;
    b.addEventListener('click', fn);
    bar.appendChild(b);
    return b;
  };
  const sep = () => { const s = document.createElement('span'); s.className = 'sep'; bar.appendChild(s); };
  let last = null;
  const play = (fn) => { last = fn; return fn(); };
  B('Cité', 'Rendre la cité debout', async () => { await stop(); await restoreCity(); });
  B('Marbre', 'Une cité de l\'âge du Marbre', () => setEra('1e22'));
  B('Fonte', 'Une cité de l\'âge de la Fonte', () => setEra('1e27'));
  B('⌖', 'Cadrer le cœur de la cité', () => frameCore(1.25));
  sep();
  const b1 = B('I · Figée', 'À 100 % de Rupture : la cité s\'arrête sous le panneau de la Chute', () => play(actFige));
  let fall = actChute;
  const b2 = B('II · La vague', 'La chute jouée sur la cité : chaque bâtiment tombe, du cœur vers les faubourgs', () => { fall = actChute; play(actChute); });
  const b2n = B('II · La nuit', "Variante sobre : les lumières s'éteignent, la nuit tombe, l'aube se lève sur les ruines", () => { fall = actNuit; play(actNuit); });
  const b3 = B('III · Ce qui reste', 'Le cycle suivant, au milieu des ruines', () => play(actReste));
  B('↺', 'Rejouer', () => last && last());
  B('■', 'Rendre la cité à la vie', () => stop());
  sep();
  const bc = B('II→III', 'Enchaîner la chute sur le cycle suivant', () => { TUNE.chain = !TUNE.chain; bc.classList.toggle('on', TUNE.chain); });
  const bd = B('Poussière', 'Nuages de poussière pendant la vague (sans : la ruine paraît après la secousse)', () => { TUNE.dust = !TUNE.dust; bd.classList.toggle('on', TUNE.dust); });
  bd.classList.toggle('on', TUNE.dust);
  bc.classList.toggle('on', TUNE.chain);
  B('▢', 'Masquer l\'interface du jeu', () => document.documentElement.classList.toggle('chute-clean'));
  document.body.appendChild(bar);
  const panel = makePanel({ onFall: () => { last = actFige; fall(); } });
  D.listeners.add(() => {
    panel.show(D.act === 'fige' && D.frozen);
    // Pendant la chute, l'échoppe se retire (le jeu verrouille déjà les achats en crise).
    document.documentElement.classList.toggle('chute-busy', !!D.act);
    b1.classList.toggle('on', D.act === 'fige');
    b2.classList.toggle('on', D.act === 'chute');
    b2n.classList.toggle('on', D.act === 'nuit');
    b3.classList.toggle('on', D.act === 'reste');
    // (hors de la frame : l'émission vient du crochet d'horloge, en pleine peinture)
    if ((D.act === 'chute' || D.act === 'nuit') && D.switching && !D.switchQueued) { D.switchQueued = true; Promise.resolve().then(() => { D.switchQueued = false; actReste(); }); }
  });
}

init().then(ui);
console.log('[chute] régie chargée');
