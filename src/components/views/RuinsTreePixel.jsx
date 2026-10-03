import { useMemo, useRef, useState, useEffect, useLayoutEffect, useCallback } from "react";
import { useGameState } from "../../hooks/useGameState.js";
import {
  checkNodeAvailability,
  checkDogmaAvailability,
  ownedRuinBranchPurchaseCount,
  ownedInBranchBelowTier,
  isUnlocked,
  has,
  ruinNodeCost,
} from "../../game/core/mechanics.js";
import { buyUpgrade } from "../../game/core/actions.js";
import { upgradeById } from "../../game/core/state.js";
import {
  PRESTIGE_TREE,
  PRESTIGE_TREE_BRANCHES,
  PRESTIGE_DOGMAS,
} from "../../game/data/upgrades.js";
import { fmt } from "../../game/core/utils.js";
import { tr } from "../../game/core/i18n.js";
import { computePixelTreeLayout } from "./ruinsTree/pixelLayout.js";
import { TREE_ART, PIXEL_LAYOUT } from "./ruinsTree/anchors.js";
import { SAP_PATHS } from "./ruinsTree/sapPaths.js";
import { SAP_COLORS } from "./ruinsTree/sapMaterials.js";
import { prepareSapScene, paintSap, edgeStrips } from "./ruinsTree/sapRenderer.js";
import TreeNode from "./ruinsTree/TreeNode.jsx";
import NodeTooltip from "./ruinsTree/NodeTooltip.jsx";
import RuinsRegistry from "./ruinsTree/RuinsRegistry.jsx";

// L'ARBRE DE LA MÉMOIRE (piste B, choisie par Raphaël le 2026-10-03) :
// l'illustration (memoire.png, 688×384) affichée à un zoom ENTIER — pixels
// nets — porte les médaillons, posés le long de ses quatre membres. Chaque
// branche a sa MATIÈRE (runes, sève, braise, lave) ; ses lumières sont éteintes
// au départ et la sève les rallume, du cœur de braise jusqu'à chaque nœud acquis,
// en un faisceau continu (sapRenderer.js). Les médaillons vivent dans un calque
// ÉCRAN (taille constante). Le registre à gauche donne le compte des Ruines et
// des quatre branches ; le survoler n'allume qu'une branche.

const STATUS_LABEL = {
  purchased: { fr: "Acquis", en: "Owned" },
  available: { fr: "Disponible", en: "Available" },
  cost: { fr: "Pas assez de ruines", en: "Not enough ruins" },
  blocked: { fr: "Exclu", en: "Excluded" },
  locked: { fr: "Verrouillé", en: "Locked" },
};

const UNLOCK = Object.fromEntries(PRESTIGE_TREE_BRANCHES.map((b) => [b.id, b.unlock || []]));
const ART_W = TREE_ART.w;
const ART_H = TREE_ART.h;
const ALL_NODE_IDS = new Set(PRESTIGE_TREE.map((n) => n.id));
const DOGMA_IDS = new Set(PRESTIGE_DOGMAS.map((d) => d.id));
const BRANCH_OF = Object.fromEntries([
  ...PRESTIGE_TREE.map((n) => [n.id, n.branch]),
  ...PRESTIGE_DOGMAS.map((d) => [d.id, d.branch]),
]);
const CAP_OF = Object.fromEntries(PRESTIGE_TREE.filter((n) => n.capstone).map((n) => [n.branch, n.id]));
// Ordre du registre = l'arbre lu de haut en bas : couronne, gauche, droite, racines.
const REGISTRY_ORDER = ["knowledge", "prosperity", "cycle_crise", "resilience"];

function tierOpen(branch, tier) {
  return ownedInBranchBelowTier(branch, tier) >= (UNLOCK[branch]?.[tier] ?? 0);
}

function prefersReducedMotion() {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// La scène (image, lumières éteintes, faisceaux) se prépare UNE fois par session.
let scenePromise = null;
function loadScene() {
  if (!scenePromise) {
    scenePromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let scene;
        try { scene = prepareSapScene(img, SAP_PATHS, (id) => BRANCH_OF[id]); } catch { scene = null; }
        resolve({ img, scene, strips: scene ? edgeStrips(scene.base) : null });
      };
      img.onerror = () => { scenePromise = null; resolve(null); };
      img.src = TREE_ART.src;
    });
  }
  return scenePromise;
}

// ── Caméra : zoom ENTIER (pixels nets), pan borné ──────────────────────────
// L'arbre se cadre dans l'espace LAISSÉ LIBRE par le registre (view.l à gauche
// sur grand écran, view.b en bas sur petit écran) : le registre ne cache rien.
// Le zoom de base est le plus grand entier où l'image y tient (×3 dans une
// fenêtre de 2 560 px) ; sous ×2 (petit écran) on accepte un zoom fractionnaire.
function areaOf(view) {
  const L = view.l || 0;
  const aw = Math.max(view.w - L, view.w * 0.5);
  const ah = Math.max(view.h - (view.b || 0), view.h * 0.4);
  return { L, aw, ah, cX: L + aw / 2, cY: ah / 2 };
}
function fitScale(view) {
  if (!view.w || !view.h) return 1;
  const { aw, ah } = areaOf(view);
  const f = Math.min(aw / ART_W, ah / ART_H);
  return f >= 2 ? Math.floor(f) : f;
}
function zoomLevels(view) {
  const f = fitScale(view);
  const out = [f];
  let s = Number.isInteger(f) ? f + 1 : Math.ceil(f);
  while (out.length < 6) out.push(s++);
  return out;
}
const sameLevel = (a, b) => Math.abs(a - b) < 1e-6;
// cam = { s, cx, cy } (cx/cy = point source au centre de l'espace libre) ou
// null = vue entière. Zoomé, l'image peut glisser jusque SOUS le registre.
function resolveCam(cam, view) {
  const { L, aw, ah, cX, cY } = areaOf(view);
  const s = cam?.s ?? fitScale(view);
  const cx = cam?.cx ?? ART_W / 2;
  const cy = cam?.cy ?? ART_H / 2;
  const ww = ART_W * s, wh = ART_H * s;
  let tx = cX - cx * s;
  let ty = cY - cy * s;
  tx = ww <= aw ? L + (aw - ww) / 2 : Math.min(L, Math.max(view.w - ww, tx));
  ty = wh <= ah ? (ah - wh) / 2 : Math.min(0, Math.max(ah - wh, ty));
  return { s, tx: Math.round(tx), ty: Math.round(ty) };
}
// Point source au centre de l'espace libre, pour une translation donnée.
const centerOf = (view, s, tx, ty) => { const { cX, cY } = areaOf(view); return { cx: (cX - tx) / s, cy: (cY - ty) / s }; };

// Ambiance d'usure — même mécanique qu'avant (variable CSS poussée en DOM
// direct, quantifiée à 0,5 % pour ne pas repeindre par tick).
function RuinsUsureSync({ targetRef }) {
  const u = useGameState((s) => Math.round(Math.max(0, Math.min(1, s.timeWear || 0)) * 200) / 200);
  useEffect(() => {
    targetRef.current?.style.setProperty("--rt-usure", u.toFixed(3));
  }, [u, targetRef]);
  return null;
}

export default function RuinsTreePixel() {
  "use no memo"; // opt-out React Compiler : hooks manuels (Sets/refs)
  const ruins = useGameState((s) => s.ruins);
  // Usure quantifiée à 5 % : la cendre qui tombe du ciel en dépend.
  const usure = useGameState((s) => Math.round(Math.max(0, Math.min(1, s.timeWear || 0)) * 20) / 20);
  const purchases = useGameState((s) => s.lifetimePurchases);
  const cycles = useGameState((s) => s.cycles);
  void purchases; void cycles; // signaux de re-render (achats, unlockCycles)

  const containerRef = useRef(null);
  const worldRef = useRef(null);
  const layersRef = useRef(null);
  const registryRef = useRef(null);
  const artRef = useRef(null);
  const sapRef = useRef(null);
  const [view, setView] = useState({ w: 0, h: 0, l: 0, b: 0 });
  const [cam, setCam] = useState(null);
  const viewRef = useRef(view);
  const camRef = useRef(cam);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { camRef.current = cam; }, [cam]);
  const [ready, setReady] = useState(null);
  const [tip, setTip] = useState(null); // { id, pinned }
  const [hoveredId, setHoveredId] = useState(null);
  const [hoverFocus, setHoverFocus] = useState(null);
  const [pinned, setPinned] = useState(null);
  const [justBought, setJustBought] = useState(null);
  const [floats, setFloats] = useState([]);
  const [liveMsg, setLiveMsg] = useState("");
  const timersRef = useRef(new Set());
  const dragRef = useRef({ active: false, moved: false });
  // État lu par la boucle de peinture de la sève (jamais pendant le rendu React).
  const sapStRef = useRef({ lit: new Set(), pending: new Set(), anim: new Map(), focus: null, colors: SAP_COLORS, still: prefersReducedMotion() });

  useEffect(() => {
    const timers = timersRef.current;
    return () => { for (const t of timers) clearTimeout(t); };
  }, []);
  const later = useCallback((fn, ms) => {
    const t = setTimeout(() => { timersRef.current.delete(t); fn(); }, ms);
    timersRef.current.add(t);
  }, []);

  const layout = useMemo(() => computePixelTreeLayout(ALL_NODE_IDS, { dogmas: PRESTIGE_DOGMAS }), []);

  // ── Scène : image + lumières éteintes + faisceaux ─────────────────────────
  useEffect(() => {
    let alive = true;
    loadScene().then((r) => { if (alive) setReady(r); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const cv = artRef.current;
    if (!cv || !ready) return;
    const ctx = cv.getContext("2d");
    if (ready.scene) ctx.putImageData(ready.scene.base, 0, 0);
    else ctx.drawImage(ready.img, 0, 0);
  }, [ready]);

  // Boucle de la sève : ~15 i/s, en pause onglet caché. Première image
  // SYNCHRONE (un onglet caché suspend rAF, cf. piège du navigateur intégré).
  useEffect(() => {
    const cv = sapRef.current;
    const scene = ready?.scene;
    if (!cv || !scene) return undefined;
    const ctx = cv.getContext("2d");
    const out = ctx.createImageData(scene.w, scene.h);
    paintSap(out, scene, sapStRef.current, performance.now());
    ctx.putImageData(out, 0, 0);
    let raf = 0;
    let last = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || now - last < 66) return;
      last = now;
      paintSap(out, scene, sapStRef.current, now);
      ctx.putImageData(out, 0, 0);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.clientWidth, h = el.clientHeight;
      // le registre est à gauche (grand écran) ou posé en bas (petit écran)
      const slot = registryRef.current;
      let l = 0, b = 0;
      if (slot && slot.offsetWidth) {
        if (slot.offsetTop > h / 3) b = h - slot.offsetTop + 8;
        else l = slot.offsetLeft + slot.offsetWidth + 16;
      }
      const v = { w, h, l, b };
      viewRef.current = v;
      setView((old) => (old.w === w && old.h === h && old.l === l && old.b === b ? old : v));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (registryRef.current) ro.observe(registryRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Caméra ────────────────────────────────────────────────────────────────
  const currentCam = useCallback(() => {
    const v = viewRef.current;
    const c = camRef.current;
    const L = zoomLevels(v);
    return resolveCam(c && L.some((x) => sameLevel(x, c.s)) ? c : null, v);
  }, []);

  const zoomStep = useCallback((dir, mx, my) => {
    const v = viewRef.current;
    const L = zoomLevels(v);
    const cur = currentCam();
    let i = L.findIndex((x) => sameLevel(x, cur.s));
    if (i < 0) i = 0;
    const ni = Math.max(0, Math.min(L.length - 1, i + dir));
    if (ni === i) return;
    if (mx == null) { const a = areaOf(v); mx = a.cX; my = a.cY; }
    const px = (mx - cur.tx) / cur.s;
    const py = (my - cur.ty) / cur.s;
    const s1 = L[ni];
    setCam({ s: s1, ...centerOf(v, s1, mx - px * s1, my - py * s1) });
  }, [currentCam]);

  // Cadre un ensemble de points au plus grand zoom entier qui les contient.
  const frameIds = useCallback((ids) => {
    const v = viewRef.current;
    const pts = ids.map((id) => layout.pos[id]).filter(Boolean);
    if (!pts.length) return;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const { aw, ah } = areaOf(v);
    const bw = Math.max(...xs) - Math.min(...xs) + 40;
    const bh = Math.max(...ys) - Math.min(...ys) + 40;
    const L = zoomLevels(v);
    let s = L[0];
    for (const x of L) if (bw * x <= aw * 0.86 && bh * x <= ah * 0.86) s = x;
    setCam({ s, cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 });
  }, [layout]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    let wheelTimer = 0;
    const onWheel = (e) => {
      if (e.target.closest?.(".rt-registry")) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomStep(e.deltaY < 0 ? 1 : -1, e.clientX - rect.left, e.clientY - rect.top);
      el.classList.add("rt-interacting");
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => el.classList.remove("rt-interacting"), 220);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => { clearTimeout(wheelTimer); el.classList.remove("rt-interacting"); el.removeEventListener("wheel", onWheel); };
  }, [zoomStep]);

  // Pan : pendant le geste, le monde ET les calques écran glissent en DOM
  // direct (aucun re-rendu React par mouvement) ; la caméra s'écrit au relâché.
  const onPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    const base = currentCam();
    const v = viewRef.current;
    dragRef.current = {
      active: true, moved: false, sx: e.clientX, sy: e.clientY, base,
      ...centerOf(v, base.s, base.tx, base.ty),
      pointerId: e.pointerId, target: e.currentTarget, live: null,
    };
  }, [currentCam]);

  const onPointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d.active) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    if (!d.moved) {
      d.moved = true;
      containerRef.current?.classList.add("rt-interacting");
      try { d.target?.setPointerCapture(d.pointerId); } catch { /* noop */ }
      setTip(null);
    }
    const v = viewRef.current;
    const s = d.base.s;
    const r = resolveCam({ s, cx: d.cx - dx / s, cy: d.cy - dy / s }, v);
    d.live = { s, ...centerOf(v, s, r.tx, r.ty) };
    if (worldRef.current) worldRef.current.style.transform = `translate(${r.tx}px, ${r.ty}px) scale(${s})`;
    if (layersRef.current) layersRef.current.style.transform = `translate(${r.tx - d.base.tx}px, ${r.ty - d.base.ty}px)`;
    containerRef.current?.style.setProperty("--rt-ty", `${r.ty}px`);
    containerRef.current?.style.setProperty("--rt-my", `${r.ty + (ART_H * s) / 2}px`);
  }, []);

  const onPointerUp = useCallback(() => {
    const d = dragRef.current;
    if (!d.active) return;
    d.active = false;
    containerRef.current?.classList.remove("rt-interacting");
    try { d.target?.releasePointerCapture?.(d.pointerId); } catch { /* noop */ }
    if (d.moved) {
      if (layersRef.current) layersRef.current.style.transform = "";
      if (d.live) setCam(d.live);
      // Le clic qui SUIT un pan reste avalé par onBuy ; on réarme à la tâche
      // suivante (le click est dispatché avant les timers).
      setTimeout(() => { d.moved = false; }, 0);
    }
  }, []);

  // Réglage des ancres : `window.__ruinsAnchors = true` → un clic journalise
  // les coordonnées SOURCE de l'illustration (celles d'anchors.js).
  const onWorldClick = useCallback((e) => {
    if (!window.__ruinsAnchors) return;
    const rect = worldRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const sx = Math.floor(((e.clientX - rect.left) / rect.width) * ART_W);
    const sy = Math.floor(((e.clientY - rect.top) / rect.height) * ART_H);
    console.log(`[ancres] source: { x: ${sx}, y: ${sy} }`);
  }, []);

  // ── Achat : la sève coule du cœur de braise jusqu'au nœud ─────────────────
  const onBuy = useCallback((id) => {
    if (dragRef.current.moved) return;
    const st = sapStRef.current;
    const chain = [];
    for (let k = id; k && k !== "hub" && SAP_PATHS[k] && !st.lit.has(k); k = SAP_PATHS[k][0]) chain.unshift(k);
    const u = upgradeById[id];
    const cost = DOGMA_IDS.has(id) ? 0 : ruinNodeCost(u);
    buyUpgrade(id);
    if (!has(id)) return;
    let t = performance.now();
    for (const e of chain) {
      const dur = st.still ? 1 : 180 + (SAP_PATHS[e][1].length / 2) * 7;
      st.anim.set(e, { t0: t, dur });
      t += dur;
    }
    const arrive = Math.max(0, t - performance.now());
    later(() => {
      setJustBought(id);
      later(() => setJustBought((cur) => (cur === id ? null : cur)), 560);
    }, arrive);
    if (cost > 0) {
      const key = `${id}-${Date.now()}`;
      setFloats((f) => [...f, { key, id, text: `−${fmt(cost)}` }]);
      later(() => setFloats((f) => f.filter((x) => x.key !== key)), 950);
    }
    setLiveMsg(tr({ fr: `${u?.name || id} acquis.`, en: `${u?.name || id} acquired.` }));
  }, [later]);

  const onHover = useCallback((vm) => {
    if (!vm) {
      setTip((t) => (t?.pinned ? t : null));
      setHoveredId(null);
      return;
    }
    if (dragRef.current.active && dragRef.current.moved) return;
    setTip({ id: vm.id, pinned: false });
    setHoveredId(vm.id);
  }, []);

  // ── Rendu ─────────────────────────────────────────────────────────────────
  const levels = zoomLevels(view);
  const camEff = cam && levels.some((x) => sameLevel(x, cam.s)) ? cam : null;
  const { s, tx, ty } = resolveCam(camEff, view);
  const k = Math.max(0.6, Math.min(1, s / PIXEL_LAYOUT.REF_SCALE)); // médaillons plus petits sous ×3
  const toLeft = (x) => Math.round(tx + (x + 0.5) * s);
  const toTop = (y) => Math.round(ty + (y + 0.5) * s);
  const focus = hoverFocus || pinned;

  // Exclusions : le jumeau du nœud/dogme survolé est mis en évidence.
  const conflictIds = new Set();
  if (hoveredId) {
    for (const l of layout.exclusionLinks) {
      if (!l.ids.includes(hoveredId)) continue;
      for (const id of l.ids) if (id !== hoveredId) conflictIds.add(id);
    }
  }

  const nodeVMs = layout.nodes.map((n) => {
    const u = upgradeById[n.id];
    const status = checkNodeAvailability(n.id);
    const open = tierOpen(n.branch, n.tier);
    const need = UNLOCK[n.branch]?.[n.tier] ?? 0;
    const ownedBelow = ownedInBranchBelowTier(n.branch, n.tier);
    const conflictName = u?.conflictsWith ? upgradeById[u.conflictsWith]?.name || u.conflictsWith : "";

    // L'essentiel seulement (retour Raphaël : nom, effet, coût) — le statut ne
    // s'affiche que s'il apporte une info que le coût ne dit pas déjà.
    let statusLine;
    let statusKind;
    if (status === "purchased") { statusLine = tr({ fr: "Acquis", en: "Acquired" }); statusKind = "owned"; }
    else if (status === "blocked") { statusLine = tr({ fr: `Exclu par : ${conflictName}`, en: `Excluded by: ${conflictName}` }); statusKind = "blocked"; }
    else if (status === "available") { statusLine = null; statusKind = "available"; }
    else if (!open) { statusLine = tr({ fr: `Verrouillé · ${ownedBelow}/${need}`, en: `Locked · ${ownedBelow}/${need}` }); statusKind = "locked"; }
    else if (!isUnlocked(u)) { statusLine = tr({ fr: "Verrouillé jusqu'aux cycles suivants", en: "Locked until later cycles" }); statusKind = "locked"; }
    else { statusLine = tr({ fr: "Pas assez de ruines", en: "Not enough ruins" }); statusKind = "cost"; }

    // « locked » (palier fermé, cycles) = un BOURGEON ; « cost » = palier ouvert,
    // il ne manque que les Ruines.
    const costText = status === "purchased" ? null : `${fmt(ruinNodeCost(u))}`;

    return {
      id: n.id,
      kind: "node",
      branch: n.branch,
      capstone: n.capstone,
      status,
      left: toLeft(n.x),
      top: toTop(n.y),
      sx: n.x,
      sy: n.y,
      k,
      bought: justBought === n.id,
      conflict: conflictIds.has(n.id),
      dim: !!focus && focus !== n.branch,
      cost: ruinNodeCost(u),
      aria: [u?.name || n.id, tr(STATUS_LABEL[status] || STATUS_LABEL.locked), costText].filter(Boolean).join(", "),
      tip: { branch: n.branch, name: u?.name || n.id, effect: u?.effect || "", costText, statusLine, statusKind },
    };
  });

  const dogmaVMs = layout.dogmas.map((d) => {
    const u = upgradeById[d.id];
    const status = checkDogmaAvailability(d.id);
    const count = ownedRuinBranchPurchaseCount(d.branch);
    const owned = status === "purchased";
    const conflictName = u?.conflictsWith ? upgradeById[u.conflictsWith]?.name || u.conflictsWith : "";
    const dStatusKind = owned ? "owned" : status === "blocked" ? "blocked" : status === "available" ? "available" : "locked";
    const statusLine = owned
      ? tr({ fr: "Acquis", en: "Acquired" })
      : status === "blocked"
        ? tr({ fr: `Exclu par : ${conflictName}`, en: `Excluded by: ${conflictName}` })
        : status === "available"
          ? tr({ fr: "Gratuit", en: "Free" })
          : tr({ fr: `${count}/${d.requiredPurchases} achats`, en: `${count}/${d.requiredPurchases} purchases` });
    return {
      id: d.id,
      kind: "dogma",
      branch: d.branch,
      capstone: false,
      status,
      left: toLeft(d.x),
      top: toTop(d.y),
      sx: d.x,
      sy: d.y,
      k,
      bought: justBought === d.id,
      conflict: conflictIds.has(d.id),
      dim: !!focus && focus !== d.branch,
      cost: 0,
      aria: `${u?.name || d.id}, ${statusLine}`,
      tip: { branch: d.branch, name: u?.name || d.id, effect: u?.effect || "", costText: null, statusLine, statusKind: dStatusKind },
    };
  });

  const allVMs = [...nodeVMs, ...dogmaVMs];
  const vmById = Object.fromEntries(allVMs.map((vm) => [vm.id, vm]));
  const availIds = allVMs.filter((vm) => vm.status === "available").map((vm) => vm.id);

  // Veines : un nœud acquis allume toute sa lignée ; un nœud à prendre tire un
  // fil continu, atténué, depuis la dernière veine allumée.
  const lit = new Set();
  for (const id of Object.keys(SAP_PATHS)) {
    if (!has(id)) continue;
    for (let k2 = id; k2 && k2 !== "hub" && SAP_PATHS[k2]; k2 = SAP_PATHS[k2][0]) lit.add(k2);
  }
  const pending = new Set();
  for (const id of availIds) {
    for (let k2 = id; k2 && k2 !== "hub" && SAP_PATHS[k2] && !lit.has(k2); k2 = SAP_PATHS[k2][0]) pending.add(k2);
  }
  // Lueurs au pixel sous les nœuds : la matière sous un nœud acquis, l'or sous un nœud à prendre.
  const marks = allVMs
    .filter((vm) => vm.status === "purchased" || vm.status === "available")
    .map((vm) => ({ x: vm.sx, y: vm.sy, branch: vm.branch, kind: vm.status === "available" ? "avail" : "lit" }));
  useEffect(() => {
    const st = sapStRef.current;
    st.lit = lit;
    st.pending = pending;
    st.focus = focus;
    st.marks = marks;
    st.usure = usure;
  });

  // Registre : une plaque par branche.
  const branches = REGISTRY_ORDER.map((bid) => {
    const def = PRESTIGE_TREE_BRANCHES.find((b) => b.id === bid);
    const nodes = PRESTIGE_TREE.filter((n) => n.branch === bid);
    const tiers = def.tiers.map((ids, t) => ({ open: tierOpen(bid, t), own: ids.filter((id) => has(id)).length, size: ids.length }));
    const firstClosed = tiers.findIndex((t) => !t.open);
    return {
      id: bid,
      capId: CAP_OF[bid],
      owned: nodes.filter((n) => has(n.id)).length,
      total: nodes.length,
      tiers,
      firstClosed,
      gate: firstClosed > 0 ? { have: ownedInBranchBelowTier(bid, firstClosed), need: UNLOCK[bid][firstClosed] } : null,
      avail: availIds.filter((id) => BRANCH_OF[id] === bid).length,
    };
  });
  // Sur l'arbre : seulement la PROCHAINE porte fermée de chaque branche.
  const gates = branches
    .filter((b) => b.gate)
    .map((b) => {
      const g = layout.gates.find((x) => x.branch === b.id && x.tier === b.firstClosed);
      return g ? { key: `${b.id}:${b.firstClosed}`, branch: b.id, left: toLeft(g.x), top: toTop(g.y), text: `${b.gate.have}/${b.gate.need}` } : null;
    })
    .filter(Boolean);

  const onPin = (bid) => {
    if (pinned === bid) { setPinned(null); setCam(null); return; }
    setPinned(bid);
    frameIds(Object.keys(layout.pos).filter((id) => BRANCH_OF[id] === bid));
  };

  // Bulle : à côté du médaillon, retournée dans le tiers droit de la vue.
  let tipData = null;
  if (tip && vmById[tip.id]) {
    const vm = vmById[tip.id];
    const flip = vm.left > view.w * 0.62;
    const r = (vm.capstone ? PIXEL_LAYOUT.CAPSTONE_R : PIXEL_LAYOUT.NODE_R) * k;
    tipData = { ...vm.tip, left: vm.left + (flip ? -r : r), top: vm.top - 30, flip };
  }

  const strips = ready?.strips;
  const artW = ART_W * s, artH = ART_H * s;

  return (
    <div
      className={`rtp-stage${focus ? " has-focus" : ""}`}
      ref={containerRef}
      style={{
        "--rt-ty": `${ty}px`,
        "--rt-my": `${ty + artH / 2}px`,
        "--rt-top": strips?.top,
        "--rt-bottom": strips?.bottom,
        "--rt-k": k.toFixed(3),
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <RuinsUsureSync targetRef={containerRef} />
      <div className="sr-only" aria-live="polite" role="status">{liveMsg}</div>

      {/* Les bords de l'illustration se prolongent : aucune couture visible. */}
      {strips && tx > 0 && (
        <>
          <div className="rtp-edge" aria-hidden="true" style={{ left: 0, width: `${tx}px`, backgroundImage: `url(${strips.left})`, backgroundSize: `${s}px ${artH}px` }} />
          <div className="rtp-edge" aria-hidden="true" style={{ left: `${tx + artW}px`, right: 0, backgroundImage: `url(${strips.right})`, backgroundSize: `${s}px ${artH}px` }} />
        </>
      )}

      <div
        className="rt-world"
        ref={worldRef}
        style={{ width: `${ART_W}px`, height: `${ART_H}px`, transform: `translate(${tx}px, ${ty}px) scale(${s})` }}
        onClick={onWorldClick}
      >
        <canvas className="rtp-art" ref={artRef} width={ART_W} height={ART_H} aria-hidden="true" />
        <canvas className="rtp-sap" ref={sapRef} width={ART_W} height={ART_H} aria-hidden="true" />
      </div>

      {/* Calques ÉCRAN : portes, médaillons, chiffres d'achat. */}
      <div className="rtp-layers" ref={layersRef}>
        {gates.map((g) => (
          <span
            key={g.key}
            className={`rtp-gate${focus && focus !== g.branch ? " rt-dim" : ""}`}
            style={{ left: `${g.left}px`, top: `${g.top}px`, "--b-rgb": SAP_COLORS[g.branch].mid.join(", ") }}
            aria-hidden="true"
          >
            <img src="/pixelart/ui/glyphs/verrou@16.png" alt="" draggable="false" />
            {g.text}
          </span>
        ))}
        {allVMs.map((vm) => (
          <TreeNode key={vm.id} vm={vm} onHover={onHover} onBuy={onBuy} />
        ))}
        {floats.map((f) => vmById[f.id] && (
          <span key={f.key} className="rtp-float" style={{ left: `${vmById[f.id].left}px`, top: `${vmById[f.id].top - 26}px` }} aria-hidden="true">
            {f.text}
          </span>
        ))}
      </div>

      <div ref={registryRef} className="rt-registry-slot" onPointerDown={(e) => e.stopPropagation()}>
        <RuinsRegistry
          ruins={ruins}
          branches={branches}
          focus={focus}
          pinned={pinned}
          onFocus={setHoverFocus}
          onPin={onPin}
        />
      </div>

      <div className="rt-zoom-controls" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="rt-zoom-btn" aria-label={tr({ fr: "Zoom avant", en: "Zoom in" })} onClick={() => zoomStep(1)}>
          <i className="fa-solid fa-plus" aria-hidden="true" />
        </button>
        <button type="button" className="rt-zoom-btn" aria-label={tr({ fr: "Zoom arrière", en: "Zoom out" })} onClick={() => zoomStep(-1)}>
          <i className="fa-solid fa-minus" aria-hidden="true" />
        </button>
        <button type="button" className="rt-zoom-btn" aria-label={tr({ fr: "Vue entière", en: "Whole tree" })} onClick={() => { setPinned(null); setCam(null); }}>
          <i className="fa-solid fa-expand" aria-hidden="true" />
        </button>
      </div>

      <NodeTooltip data={tipData} />
    </div>
  );
}
