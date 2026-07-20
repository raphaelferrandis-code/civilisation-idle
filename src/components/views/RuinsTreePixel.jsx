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
import { TREE_ART } from "./ruinsTree/anchors.js";
import { createEmberField } from "./ruinsTree/emberParticles.js";
import { iconFor } from "./ruinsTree/nodeIcon.js";
import TreeNode from "./ruinsTree/TreeNode.jsx";
import NodeTooltip from "./ruinsTree/NodeTooltip.jsx";

// Rendu PEINT de l'Arbre des Ruines (refonte Phase C) : l'illustration
// (tree-base.png ×TREE_ART.scale, pixelated) porte les nœuds, posés LE LONG des
// branches — aucun lien dessiné, aucune nappe de brume (retours Raphaël) :
// TOUT l'arbre est visible d'emblée, les nœuds verrouillés sont simplement
// GRISÉS (.rt-locked) et les portes n/m disent la progression. Caméra,
// tooltips, achat et a11y repris du rendu radial (RuinsTreeGraph).

const STATUS_LABEL = {
  purchased: { fr: "Acheté", en: "Owned" },
  available: { fr: "Disponible", en: "Available" },
  blocked: { fr: "Exclu", en: "Excluded" },
  locked: { fr: "Verrouillé", en: "Locked" },
};

const UNLOCK = Object.fromEntries(PRESTIGE_TREE_BRANCHES.map((b) => [b.id, b.unlock || []]));

function tierOpen(branch, tier) {
  return ownedInBranchBelowTier(branch, tier) >= (UNLOCK[branch]?.[tier] ?? 0);
}

function prefersReducedMotion() {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const WORLD_W = TREE_ART.w * TREE_ART.scale;
const WORLD_H = TREE_ART.h * TREE_ART.scale;

// Horizon des BORDS EXTÉRIEURS de la fresque élargie (widen-tree.cjs y fait
// converger les colonnes extrêmes vers un aplat : transparent au-dessus de
// OUT_HORIZON, rgb(6,4,9) en dessous). Le fond du conteneur prolonge ces deux
// zones via --rtp-ground → la frontière du PNG disparaît sur les écrans plus
// larges que la fresque. La borne suit la caméra (render + drag).
const GROUND_SRC_Y = 200;

function groundStop(camYPx, worldScale) {
  return camYPx + GROUND_SRC_Y * TREE_ART.scale * worldScale;
}

// Tous les ids sont TOUJOURS affichés (l'arbre entier se lit dès le début).
const ALL_NODE_IDS = new Set(PRESTIGE_TREE.map((n) => n.id));

// Borne une translation d'axe : centre si le monde est plus petit que la vue,
// sinon le contraint à couvrir la vue (pas de zone vide au bord).
function clampAxis(p, worldSize, viewSize) {
  if (worldSize <= viewSize) return (viewSize - worldSize) / 2;
  return Math.min(0, Math.max(viewSize - worldSize, p));
}

// Fond réactif à l'usure — même mécanique que le rendu radial (variables CSS
// poussées en DOM direct, quantifiées à 0,5 % pour ne pas repeindre par tick).
function RuinsUsureSync({ targetRef }) {
  const u = useGameState((s) => Math.round(Math.max(0, Math.min(1, s.timeWear || 0)) * 200) / 200);
  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    const lerp = (a, b) => Math.round(a + (b - a) * u);
    el.style.setProperty("--rt-glow", `${lerp(216, 158)}, ${lerp(150, 72)}, ${lerp(74, 66)}`);
    el.style.setProperty("--rt-glow-a", (0.13 + 0.08 * u).toFixed(3));
    el.style.setProperty("--rt-usure", u.toFixed(3));
  }, [u, targetRef]);
  return null;
}

export default function RuinsTreePixel() {
  "use no memo"; // opt-out React Compiler : hooks manuels (Sets/refs)
  const ruins = useGameState((s) => s.ruins);
  const purchases = useGameState((s) => s.lifetimePurchases);
  const cycles = useGameState((s) => s.cycles);
  void purchases; void cycles; // signaux de re-render (achats, unlockCycles)

  const containerRef = useRef(null);
  const worldRef = useRef(null);
  const fxCanvasRef = useRef(null);
  const usureRef = useRef(0);
  const [view, setView] = useState({ w: 0, h: 0 });
  // x: null = « auto-centré sur l'arbre » (la fresque est PLUS LARGE que la vue
  // au zoom 1 : sans ça, le clamp collerait la caméra au bord gauche).
  const [cam, setCam] = useState({ z: 1, x: null, y: 0 });
  const camRef = useRef(cam);
  const viewRef = useRef({ w: 0, h: 0 });
  const dragRef = useRef({ active: false, moved: false, sx: 0, sy: 0, cx: 0, cy: 0 });
  const [tip, setTip] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);

  useEffect(() => { camRef.current = cam; }, [cam]);

  const [justBought, setJustBought] = useState(null);
  const justBoughtTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(justBoughtTimerRef.current), []);
  const [liveMsg, setLiveMsg] = useState("");

  const layout = useMemo(
    () => computePixelTreeLayout(ALL_NODE_IDS, { dogmas: PRESTIGE_DOGMAS }),
    []
  );

  // Usure pour les cendres — quantifiée à 5 %, lue par la boucle via ref (les
  // particules ne redémarrent jamais).
  const usure = useGameState((s) => Math.round(Math.max(0, Math.min(1, s.timeWear || 0)) * 20) / 20);
  useEffect(() => { usureRef.current = usure; }, [usure]);

  // ── Particules ambiantes (braises du cratère/cœur + cendres d'usure) ─────
  // Canvas à la résolution SOURCE, ~15 fps (pas-à-pas chunky assumé), en pause
  // onglet caché, coupé si prefers-reduced-motion.
  useEffect(() => {
    const canvas = fxCanvasRef.current;
    if (!canvas || prefersReducedMotion()) return undefined;
    const ctx = canvas.getContext("2d");
    const field = createEmberField();
    // Première frame SYNCHRONE : un onglet caché (rAF suspendu — cf. piège
    // preview) montre au moins la scène initiale au lieu d'un calque vide.
    field.step(0.05, usureRef.current);
    field.paint(ctx);
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const FRAME = 1000 / 15;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (document.hidden) return;
      acc += dt * 1000;
      if (acc < FRAME) return;
      acc = 0;
      field.step(Math.max(dt, FRAME / 1000), usureRef.current);
      field.paint(ctx);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Calé sur la HAUTEUR : l'arbre entier est visible au zoom 1, et la fresque
  // élargie déborde à gauche/droite (c'est son rôle — le pan y emmène ; sur les
  // écrans plus larges que 2:1, les aplats extérieurs + le fond CSS prennent
  // le relais). Un fit min(w,h) exposerait le BAS de la fresque (couture).
  const fitScale = view.h > 0 ? Math.min(1.1, view.h / WORLD_H) : 0;
  const zMax = fitScale > 0 ? Math.max(3.2, 1.6 / fitScale) : 3.2;

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const measure = () => {
      const v = { w: el.clientWidth, h: el.clientHeight };
      viewRef.current = v;
      setView(v);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // x auto-centré résolu en px concrets (pour zoomer/glisser DEPUIS cet état).
  const resolveCamX = useCallback((c, viewW) =>
    c.x == null ? (viewW - WORLD_W * fitScale * c.z) / 2 : c.x, [fitScale]);

  // ── Caméra (pan/zoom) — reprise du rendu radial, monde RECTANGULAIRE ─────
  const zoomAt = useCallback((factor, cx, cy) => {
    setCam((c) => {
      const z = Math.max(1, Math.min(zMax, c.z * factor));
      const v = viewRef.current;
      const x0 = resolveCamX(c, v.w);
      const x = clampAxis(cx - (cx - x0) * (z / c.z), WORLD_W * fitScale * z, v.w);
      const y = clampAxis(cy - (cy - c.y) * (z / c.z), WORLD_H * fitScale * z, v.h);
      return { z, x, y };
    });
  }, [fitScale, zMax, resolveCamX]);

  const resetCam = useCallback(() => setCam({ z: 1, x: null, y: 0 }), []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    let wheelTimer = 0;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX - rect.left, e.clientY - rect.top);
      el.classList.add("rt-interacting");
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => el.classList.remove("rt-interacting"), 220);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => { clearTimeout(wheelTimer); el.removeEventListener("wheel", onWheel); };
  }, [zoomAt]);

  const onPointerDown = useCallback((e) => {
    const d = dragRef.current;
    d.active = true;
    d.moved = false;
    d.sx = e.clientX;
    d.sy = e.clientY;
    d.cx = resolveCamX(camRef.current, viewRef.current.w);
    d.cy = camRef.current.y;
    d.liveX = d.cx;
    d.liveY = d.cy;
    d.pointerId = e.pointerId;
    d.target = e.currentTarget;
  }, [resolveCamX]);

  const onPointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d.active) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > 4) {
      d.moved = true;
      containerRef.current?.classList.add("rt-interacting");
      try { d.target?.setPointerCapture(d.pointerId); } catch { /* noop */ }
    }
    if (!d.moved) return;
    const v = viewRef.current;
    const z = camRef.current.z;
    d.liveX = clampAxis(d.cx + dx, WORLD_W * fitScale * z, v.w);
    d.liveY = clampAxis(d.cy + dy, WORLD_H * fitScale * z, v.h);
    if (worldRef.current) {
      worldRef.current.style.transform = `translate(${d.liveX}px, ${d.liveY}px) scale(${fitScale * z})`;
    }
    // La ligne de sol du fond suit le pan en DIRECT (même chemin sans re-render
    // que le transform du monde) — sinon le raccord ciel/sous-sol décroche.
    containerRef.current?.style.setProperty("--rtp-ground", `${groundStop(d.liveY, fitScale * z)}px`);
  }, [fitScale]);

  const onPointerUp = useCallback((e) => {
    const d = dragRef.current;
    if (!d.active) return;
    d.active = false;
    containerRef.current?.classList.remove("rt-interacting");
    try { d.target?.releasePointerCapture?.(d.pointerId); } catch { /* noop */ }
    if (d.moved) {
      setCam((c) => ({ z: c.z, x: d.liveX, y: d.liveY }));
      // Le clic qui SUIT un pan (même geste) doit rester avalé par onBuy →
      // on ne réarme qu'à la tâche suivante (le click est dispatché avant les
      // timers). Sans ça, `moved` restait vrai jusqu'au prochain pointerdown
      // et bloquait l'activation CLAVIER (Entrée/Espace) après un pan.
      setTimeout(() => { d.moved = false; }, 0);
    }
    void e;
  }, []);

  // Réglage des ancres : `window.__ruinsAnchors = true` → un clic journalise
  // les coordonnées dans le REPÈRE DE L'ART de Raphaël (celui d'anchors.js,
  // l'offset de la fresque élargie est déjà soustrait).
  const onWorldClick = useCallback((e) => {
    if (!window.__ruinsAnchors) return;
    const rect = worldRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const sx = Math.round(((e.clientX - rect.left) / rect.width) * TREE_ART.w) - (TREE_ART.artOffsetX || 0);
    const sy = Math.round(((e.clientY - rect.top) / rect.height) * TREE_ART.h);
    console.log(`[ancres] repère art: [${sx}, ${sy}]`);
  }, []);

  const onBuy = useCallback((id) => {
    if (dragRef.current.moved) return;
    buyUpgrade(id);
    if (has(id)) {
      const u = upgradeById[id];
      setJustBought(id);
      setLiveMsg(tr({ fr: `${u?.name || id} acquis.`, en: `${u?.name || id} acquired.` }));
      clearTimeout(justBoughtTimerRef.current);
      justBoughtTimerRef.current = setTimeout(() => setJustBought((cur) => (cur === id ? null : cur)), 520);
    }
  }, []);

  const onHover = useCallback((vm, evt) => {
    if (!vm) {
      setTip(null);
      setHoveredId(null);
      return;
    }
    if (dragRef.current.active && dragRef.current.moved) return;
    const rect = containerRef.current?.getBoundingClientRect();
    const cx = evt && rect ? evt.clientX - rect.left : 0;
    const cy = evt && rect ? evt.clientY - rect.top : 0;
    setTip({
      ...vm.tip,
      left: cx,
      top: cy,
      flip: rect ? cx > rect.width * 0.62 : false,
    });
    setHoveredId(vm.id);
  }, []);

  // Exclusions : le jumeau du nœud/dogme survolé est mis en évidence.
  const activeExclusions = hoveredId
    ? layout.exclusionLinks.filter((l) => l.ids.includes(hoveredId))
    : [];
  const conflictIds = new Set();
  for (const l of activeExclusions) {
    for (const id of l.ids) if (id !== hoveredId) conflictIds.add(id);
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

    const costText = status === "purchased" ? null : `${fmt(ruinNodeCost(u))}`;

    return {
      id: n.id,
      kind: "node",
      branch: n.branch,
      capstone: n.capstone,
      status,
      icon: iconFor(u, n.branch),
      x: n.x,
      y: n.y,
      size: 2 * n.r,
      font: n.r * (n.capstone ? 1.04 : 0.94),
      bought: justBought === n.id,
      conflict: conflictIds.has(n.id),
      aria: [u?.name || n.id, tr(STATUS_LABEL[status]), costText].filter(Boolean).join(", "),
      tip: {
        branch: n.branch,
        name: u?.name || n.id,
        effect: u?.effect || "",
        costText,
        statusLine,
        statusKind,
      },
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
      icon: iconFor(u, d.branch),
      x: d.x,
      y: d.y,
      size: 2 * d.r,
      font: d.r * 0.86,
      bought: justBought === d.id,
      conflict: conflictIds.has(d.id),
      aria: `${u?.name || d.id}, ${statusLine}`,
      tip: {
        branch: d.branch,
        name: u?.name || d.id,
        effect: u?.effect || "",
        costText: null,
        statusLine,
        statusKind: dStatusKind,
      },
    };
  });

  // Ligne de sol écran (le fond du conteneur y coud ciel et sous-sol) —
  // recalculée à chaque render (zoom/pan figé) et suivie en direct pendant le
  // drag (cf. onPointerMove).
  const camXClamped = clampAxis(resolveCamX(cam, view.w), WORLD_W * fitScale * cam.z, view.w);
  const camYClamped = clampAxis(cam.y, WORLD_H * fitScale * cam.z, view.h);
  const groundPx = groundStop(camYClamped, fitScale * cam.z);

  return (
    <div
      className={`rtp-stage${cam.z > 1 ? " is-zoomed" : ""}`}
      ref={containerRef}
      style={{ "--rtp-ground": `${groundPx}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <RuinsUsureSync targetRef={containerRef} />
      <div className="sr-only" aria-live="polite" role="status">{liveMsg}</div>
      <div
        className="rt-world"
        ref={worldRef}
        style={{
          width: `${WORLD_W}px`,
          height: `${WORLD_H}px`,
          transform: `translate(${camXClamped}px, ${camYClamped}px) scale(${fitScale * cam.z})`,
        }}
        onClick={onWorldClick}
      >
        {/* L'œuvre : l'arbre peint, agrandi en pixels nets. */}
        <img
          className="rtp-art"
          src={TREE_ART.src}
          alt=""
          aria-hidden="true"
          draggable="false"
          width={WORLD_W}
          height={WORLD_H}
        />
        {/* Particules ambiantes (braises + cendres), résolution source. */}
        <canvas
          className="rtp-fx"
          ref={fxCanvasRef}
          width={TREE_ART.w}
          height={TREE_ART.h}
          aria-hidden="true"
        />

        {/* Portes de palier : compteur n/m tant que le palier est fermé. */}
        {layout.gates.map((g) => {
          if (tierOpen(g.branch, g.tier)) return null;
          const ownedBelow = ownedInBranchBelowTier(g.branch, g.tier);
          return (
            <div
              key={`gate-${g.branch}-${g.tier}`}
              className="rtp-gate"
              style={{ left: `${g.x}px`, top: `${g.y}px` }}
              aria-hidden="true"
            >
              {ownedBelow}/{g.need}
            </div>
          );
        })}

        {/* Calque des nœuds HTML (boutons accessibles), posés LE LONG des branches. */}
        {nodeVMs.map((vm) => (
          <TreeNode key={vm.id} vm={vm} onHover={onHover} onBuy={onBuy} />
        ))}
        {dogmaVMs.map((vm) => (
          <TreeNode key={vm.id} vm={vm} onHover={onHover} onBuy={onBuy} />
        ))}

        {/* Le compteur de ruines vit SUR le fruit de braise (cœur du tronc). */}
        <div className="rt-hub rt-hub--core" style={{ left: `${layout.hub.x}px`, top: `${layout.hub.y}px` }}>
          <strong className="rt-hub-count">{fmt(ruins)}</strong>
        </div>
      </div>

      {/* Titre en surimpression (plus de panneau ni de cadre autour de la vue). */}
      <div className="rtp-title" aria-hidden="true">{tr({ fr: "Mémoire des Ruines", en: "Memory of the Ruins" })}</div>

      <div className="rt-zoom-controls" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="rt-zoom-btn" aria-label={tr({ fr: "Zoom avant", en: "Zoom in" })}
          onClick={() => zoomAt(1.4, view.w / 2, view.h / 2)}>
          <i className="fa-solid fa-plus" aria-hidden="true" />
        </button>
        <button type="button" className="rt-zoom-btn" aria-label={tr({ fr: "Zoom arrière", en: "Zoom out" })}
          onClick={() => zoomAt(1 / 1.4, view.w / 2, view.h / 2)}>
          <i className="fa-solid fa-minus" aria-hidden="true" />
        </button>
        <button type="button" className="rt-zoom-btn" aria-label={tr({ fr: "Recentrer la vue", en: "Recenter view" })} onClick={resetCam}>
          <i className="fa-solid fa-expand" aria-hidden="true" />
        </button>
      </div>

      <NodeTooltip data={tip} />
    </div>
  );
}
