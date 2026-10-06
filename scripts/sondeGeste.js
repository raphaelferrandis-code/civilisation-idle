// SONDE DE GESTE — à coller dans la console du jeu (F12), build de PROD (npm run preview).
// Enregistre 12 s : rythme des frames DESSINÉES, coût par poste (framePerf), blits,
// lectures de pixels, canvas créés, événements souris, pyramide de tuiles du sol.
// Puis imprime UN JSON compact à coller dans la conversation. Se désinstalle seule.
(() => {
  const DUR = 12000;
  const screen = document.getElementById('cityCanvas');
  const cnt = { blit: 0, rb: 0, rbScreen: 0, cnv: 0, clip: 0 };
  const undo = [];
  const wrap = (proto, name, fn) => {
    if (!proto || !proto[name]) return;
    const o = proto[name];
    proto[name] = function (...a) { fn(this); return o.apply(this, a); };
    undo.push(() => { proto[name] = o; });
  };
  const protos = [CanvasRenderingContext2D.prototype,
    typeof OffscreenCanvasRenderingContext2D !== 'undefined' ? OffscreenCanvasRenderingContext2D.prototype : null];
  for (const p of protos) {
    wrap(p, 'drawImage', () => { cnt.blit += 1; });
    wrap(p, 'getImageData', (c) => { cnt.rb += 1; if (c.canvas === screen) cnt.rbScreen += 1; });
    wrap(p, 'clip', () => { cnt.clip += 1; });
  }
  const ce = document.createElement.bind(document);
  document.createElement = (t, ...r) => { if (String(t).toLowerCase() === 'canvas') cnt.cnv += 1; return ce(t, ...r); };
  undo.push(() => { document.createElement = ce; });
  const OC = window.OffscreenCanvas;
  if (OC) { window.OffscreenCanvas = new Proxy(OC, { construct(T, a) { cnt.cnv += 1; return new T(...a); } }); undo.push(() => { window.OffscreenCanvas = OC; }); }
  const ev = { move: 0, drag: 0, wheel: 0 };
  let down = false;
  const h = {
    mousedown: () => { down = true; }, mouseup: () => { down = false; },
    mousemove: () => { ev.move += 1; if (down) ev.drag += 1; }, wheel: () => { ev.wheel += 1; },
  };
  for (const k in h) { window.addEventListener(k, h[k], { capture: true, passive: true }); undo.push(() => window.removeEventListener(k, h[k], { capture: true })); }
  const prevProf = globalThis.__isoFrameProfile;
  globalThis.__isoFrameProfile = true;
  undo.push(() => { globalThis.__isoFrameProfile = prevProf; });
  const py0 = Object.assign({}, globalThis.__solPyramideStats || {});
  const traceOn = typeof globalThis.__solTrace === 'function';
  if (traceOn) { globalThis.__solTrace(true); undo.push(() => globalThis.__solTrace(false)); }
  const prevGP = globalThis.__isoGroundProfile;
  globalThis.__isoGroundProfile = true;
  undo.push(() => { globalThis.__isoGroundProfile = prevGP; });
  const prevLP = globalThis.__layoutProfile;
  globalThis.__layoutProfile = true;
  undo.push(() => { globalThis.__layoutProfile = prevLP; });
  const frames = [];
  let lastT = performance.now(), lastProf = globalThis.__isoFrameProfileLast, prev = { ...cnt };
  const t0 = performance.now();
  const q = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1); };
  const tick = (t) => {
    const prof = globalThis.__isoFrameProfileLast;
    const drawn = prof && prof !== lastProf;
    lastProf = prof;
    frames.push({ t: t - t0, gap: t - lastT, drawn, prof: drawn ? prof : null,
      blit: cnt.blit - prev.blit, rb: cnt.rb - prev.rb, cnv: cnt.cnv - prev.cnv, clip: cnt.clip - prev.clip });
    prev = { ...cnt }; lastT = t;
    if (t - t0 < DUR) requestAnimationFrame(tick); else finish();
  };
  const finish = () => {
    for (const u of undo.reverse()) { try { u(); } catch { /* rien */ } }
    const drawn = frames.filter((f) => f.drawn);
    const gaps = []; let lastDrawn = null;
    for (const f of drawn) { if (lastDrawn != null) gaps.push(f.t - lastDrawn); lastDrawn = f.t; }
    const postes = {}, postesMax = {};
    for (const f of drawn) for (const k in f.prof) { if (k === 'total') continue; postes[k] = (postes[k] || 0) + f.prof[k]; postesMax[k] = Math.max(postesMax[k] || 0, f.prof[k]); }
    const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => k + ':' + v.toFixed(1));
    const worst = [...drawn].sort((a, b) => b.prof.total - a.prof.total).slice(0, 6).map((f) => ({
      t: Math.round(f.t), cpu: +f.prof.total.toFixed(1), blit: f.blit, rb: f.rb, cnv: f.cnv, clip: f.clip, postes: top(Object.fromEntries(Object.entries(f.prof).filter(([k]) => k !== 'total')), 4) }));
    let gpu = null;
    try { const g = ce('canvas').getContext('webgl'); const d = g && g.getExtension('WEBGL_debug_renderer_info'); gpu = d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : null; } catch { /* rien */ }
    // (Le poste « cache_sol » lisait __groundZoomCacheStats, le cache de crans d'avant
    //  la pyramide : plus personne ne l'écrit. Le sol se lit dans « pyramide ».)
    const out = {
      build: [...document.scripts].map((s) => (s.src.match(/index-[^/]+\.js/) || [])[0]).filter(Boolean)[0] || '?',
      env: { dpr: devicePixelRatio, win: innerWidth + 'x' + innerHeight, canvas: screen ? screen.width + 'x' + screen.height : '?', cores: navigator.hardwareConcurrency, gpu },
      duree_s: +((performance.now() - t0) / 1000).toFixed(1),
      raf: frames.length, dessinees: drawn.length,
      rythme_ms: { p50: q(gaps, 0.5), p90: q(gaps, 0.9), p99: q(gaps, 0.99), max: q(gaps, 1), sup25: gaps.filter((g) => g > 25).length, sup50: gaps.filter((g) => g > 50).length, sup100: gaps.filter((g) => g > 100).length },
      cpu_ms: { p50: q(drawn.map((f) => f.prof.total), 0.5), p90: q(drawn.map((f) => f.prof.total), 0.9), max: q(drawn.map((f) => f.prof.total), 1) },
      blits: { parFrame_p50: q(drawn.map((f) => f.blit), 0.5), max: q(drawn.map((f) => f.blit), 1), total: cnt.blit },
      lectures_px: { total: cnt.rb, surEcran: cnt.rbScreen }, canvas_crees: cnt.cnv, clips: cnt.clip,
      souris: { move_par_s: +(ev.move / ((performance.now() - t0) / 1000)).toFixed(0), drag: ev.drag, wheel: ev.wheel },
      pyramide: (() => { const p = globalThis.__solPyramideStats; if (!p) return null; const d = { on: typeof globalThis.__solPyramide === 'function' ? globalThis.__solPyramide() : null }; for (const k in p) d[k] = typeof p[k] === 'number' ? Math.round((p[k] - (py0[k] || 0)) * 10) / 10 : p[k]; return d; })(),
      postes_total_ms: top(postes, 8), postes_pire_ms: top(postesMax, 6),
      pires_frames: worst,
    };
    // Trace du sol (solTrace.js, en prod). Seule sorte d'entrée encore produite :
    // les RECOMPUTES DU PLAN (durée, segment de signature déclencheur, phases).
    // Les recuissons 'bake', restaurations 'restore', décisions 'sol' et
    // tranches 'strip' sont parties avec leurs producteurs (cf. solTrace.js).
    if (traceOn) {
      const tr = globalThis.__solTraceDump();
      const rel = (e) => Math.round(e.t - t0);
      out.recomputes_plan = tr.filter((e) => e.k === 'layout').map((e) => ({ t: rel(e), ms: e.ms, core: e.core, diff: e.diff, tiles: e.tiles, phases: top(Object.fromEntries(Object.entries(e.phases || {}).filter(([k]) => k !== 'total')), 8) }));
    }
    console.log('SONDE-GESTE ' + JSON.stringify(out));
  };
  console.log('sonde armée : 12 s — fais le geste maintenant (dézoom, zoom, drag)');
  requestAnimationFrame(tick);
})();
