// ACTE I — le panneau de la Chute posé SUR la cité figée (au lieu d'un onglet à part).
// Mêmes pièces que la page Effondrement du jeu (titre RUPTURE, jauge-sprite pleine,
// les trois rites en emblèmes, la moisson de Ruines, le bouton à maintenir) — sans une
// phrase : les noms des rites sont en infobulle. Classes du jeu réutilisées pour la
// jauge et le bouton (views-crises.css est chargé partout).
const css = `
#chute-fige{position:fixed;right:28px;top:50%;width:340px;z-index:9000;
  transform:translate(24px,-50%);opacity:0;pointer-events:none;
  transition:opacity .45s ease, transform .45s ease;
  padding:20px 22px 22px;border-radius:14px;
  background:linear-gradient(180deg,rgba(20,16,38,.86),rgba(12,10,26,.9));
  box-shadow:0 10px 40px rgba(0,0,0,.45)}
#chute-fige.on{opacity:1;transform:translate(0,-50%);pointer-events:auto}
#chute-fige .cf-title{font-family:var(--font-number);font-size:1.85rem;letter-spacing:.08em;color:#ffb347;
  text-align:center;text-shadow:2px 2px 0 rgba(40,12,24,.9);margin-bottom:.55rem}
#chute-fige .crisis-hero{margin:0 10px 1.1rem}
#chute-fige .crisis-hero .barometer-track.rupture-bar{margin-bottom:0}
#chute-fige .cf-rites{display:flex;justify-content:space-between;gap:8px;margin:0 2px 1.1rem}
#chute-fige .cf-rite{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;background:none;border:0;
  padding:4px 0;cursor:pointer;color:inherit}
#chute-fige .cf-rite img{width:48px;height:48px;image-rendering:pixelated;filter:drop-shadow(0 2px 0 rgba(0,0,0,.5))}
#chute-fige .cf-rite:hover img{filter:brightness(1.2) drop-shadow(0 2px 0 rgba(0,0,0,.5))}
#chute-fige .cf-tiers{display:flex;gap:5px}
#chute-fige .cf-tiers i{display:block;width:8px;height:8px;background:#3a3150;box-shadow:inset 0 0 0 1px #6a5a84}
#chute-fige .cf-rite.sealed .cf-tiers i:first-child{background:#cf9c50;box-shadow:inset 0 0 0 1px #ffd08a}
#chute-fige .cf-gain{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:1rem}
#chute-fige .cf-gain img{width:24px;height:24px;image-rendering:pixelated}
#chute-fige .cf-gain b{font-family:var(--font-number);font-weight:400;font-size:1.75rem;color:#f2e6cc;
  text-shadow:2px 2px 0 rgba(20,10,20,.8)}
`;

const RITES = [
  { id: 'exode', name: 'Exode' },
  { id: 'archives', name: 'Archives' },
  { id: 'ordre', name: 'Ordre' },
];

export function makePanel({ onFall }) {
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
  const el = document.createElement('div');
  el.id = 'chute-fige';
  el.innerHTML = `
    <div class="cf-title">RUPTURE</div>
    <div class="crisis-hero"><div class="barometer-track rupture-bar"></div></div>
    <div class="cf-rites">${RITES.map((r, i) => `
      <button class="cf-rite${i === 1 ? ' sealed' : ''}" title="${r.name}">
        <img src="/pixelart/ui/prep/${r.id}@48.png" alt="">
        <span class="cf-tiers"><i></i><i></i><i></i></span>
      </button>`).join('')}</div>
    <div class="cf-gain" title="Ruines"><img src="/pixelart/ui/glyphs/ruines@24.png" alt=""><b>+1,24 M</b></div>
    <button class="collapse-btn-primary collapse-hold"><span class="hold-fill"></span><span class="hold-label">Effondrer la Cité</span></button>`;
  (document.querySelector('.app') || document.body).appendChild(el);
  // Maintenir 1,1 s (comme le jeu) : l'arc-en-ciel se remplit, puis la chute.
  const btn = el.querySelector('.collapse-hold'), fill = el.querySelector('.hold-fill');
  let t0 = 0, raf = 0;
  const reset = () => { cancelAnimationFrame(raf); raf = 0; t0 = 0; fill.style.width = '0%'; btn.classList.remove('is-holding'); };
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / 1100);
    fill.style.width = (k * 100).toFixed(1) + '%';
    if (k >= 1) { reset(); onFall(); return; }
    raf = requestAnimationFrame(step);
  };
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); t0 = performance.now(); btn.classList.add('is-holding'); raf = requestAnimationFrame(step); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => { if (raf) reset(); });
  return {
    show(on) { el.classList.toggle('on', !!on); if (!on) reset(); },
    el,
  };
}
