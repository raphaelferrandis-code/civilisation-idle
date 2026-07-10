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

function dogmaKind(id) {
  if (id.startsWith("trait_")) return tr({ fr: "Trait", en: "Trait" });
  if (id.startsWith("skill_")) return tr({ fr: "Compétence", en: "Skill" });
  return tr({ fr: "Dogme", en: "Dogma" });
}

function tierOpen(branch, tier) {
  return ownedInBranchBelowTier(branch, tier) >= (UNLOCK[branch]?.[tier] ?? 0);
}

const WORLD_W = TREE_ART.w * TREE_ART.scale;
const WORLD_H = TREE_ART.h * TREE_ART.scale;

// Ligne de sol de l'œuvre, MESURÉE sur ses bords (colonnes 1 et 318) :
//   lignes  < 257  → ciel        (#444249)
//   lignes 257-264 → bande de sol (8 px, ~#1c182e)
//   lignes >= 265  → sous-sol    (#050304)
// Le fond du conteneur prolonge ces trois zones via --rtp-ground / --rtp-ground2
// → la frontière du PNG disparaît (retour « trop PNG collé »). Les deux bornes
// suivent la caméra, donc la bande garde SA hauteur exacte à tout zoom.
const GROUND_SRC_Y = 257;
const GROUND_SRC_Y2 = 265;

// Bornes écran (px) de la bande de sol pour un état de caméra donné.
function groundStops(camYPx, worldScale) {
  return {
    top: camYPx + GROUND_SRC_Y * TREE_ART.scale * worldScale,
    bottom: camYPx + GROUND_SRC_Y2 * TREE_ART.scale * worldScale,
  };
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
  const [view, setView] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState({ z: 1, x: 0, y: 0 });
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

  // Ajusté à la vue : on voit l'arbre ENTIER au zoom 1 (silhouette imposante).
  const fitScale = view.w > 0 && view.h > 0
    ? Math.min(1.1, Math.min(view.w / WORLD_W, view.h / WORLD_H))
    : 0;
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

  // ── Caméra (pan/zoom) — reprise du rendu radial, monde RECTANGULAIRE ─────
  const zoomAt = useCallback((factor, cx, cy) => {
    setCam((c) => {
      const z = Math.max(1, Math.min(zMax, c.z * factor));
      const v = viewRef.current;
      const x = clampAxis(cx - (cx - c.x) * (z / c.z), WORLD_W * fitScale * z, v.w);
      const y = clampAxis(cy - (cy - c.y) * (z / c.z), WORLD_H * fitScale * z, v.h);
      return { z, x, y };
    });
  }, [fitScale, zMax]);

  const resetCam = useCallback(() => setCam({ z: 1, x: 0, y: 0 }), []);

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
    d.cx = camRef.current.x;
    d.cy = camRef.current.y;
    d.liveX = camRef.current.x;
    d.liveY = camRef.current.y;
    d.pointerId = e.pointerId;
    d.target = e.currentTarget;
  }, []);

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
    // La bande de sol du fond suit le pan en DIRECT (même chemin sans re-render
    // que le transform du monde) — sinon le raccord ciel/sous-sol décroche.
    const g = groundStops(d.liveY, fitScale * z);
    containerRef.current?.style.setProperty("--rtp-ground", `${g.top}px`);
    containerRef.current?.style.setProperty("--rtp-ground2", `${g.bottom}px`);
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
  // les coordonnées SOURCE (px de l'illustration) du point cliqué.
  const onWorldClick = useCallback((e) => {
    if (!window.__ruinsAnchors) return;
    const rect = worldRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const sx = Math.round(((e.clientX - rect.left) / rect.width) * TREE_ART.w);
    const sy = Math.round(((e.clientY - rect.top) / rect.height) * TREE_ART.h);
    console.log(`[ancres] source: [${sx}, ${sy}]`);
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

    let statusLine;
    let statusKind;
    if (status === "purchased") { statusLine = tr({ fr: "Acquis", en: "Acquired" }); statusKind = "owned"; }
    else if (status === "blocked") { statusLine = tr({ fr: `Exclu par : ${conflictName}`, en: `Excluded by: ${conflictName}` }); statusKind = "blocked"; }
    else if (status === "available") { statusLine = tr({ fr: "Disponible", en: "Available" }); statusKind = "available"; }
    else if (!open) { statusLine = tr({ fr: `Palier verrouillé · ${ownedBelow}/${need}`, en: `Tier locked · ${ownedBelow}/${need}` }); statusKind = "locked"; }
    else if (!isUnlocked(u)) { statusLine = tr({ fr: "Scellé — se descelle aux cycles suivants", en: "Sealed — unseals in later cycles" }); statusKind = "locked"; }
    else { statusLine = tr({ fr: "Pas assez de ruines", en: "Not enough ruins" }); statusKind = "cost"; }

    const costText = status === "purchased" ? tr({ fr: "Acquis", en: "Acquired" }) : `${fmt(ruinNodeCost(u))}`;

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
      aria: `${u?.name || n.id} — ${tr(STATUS_LABEL[status])} — ${costText}`,
      tip: {
        branch: n.branch,
        kindLabel: n.capstone ? "Capstone" : null,
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
    const kindLabel = dogmaKind(d.id);
    const conflictName = u?.conflictsWith ? upgradeById[u.conflictsWith]?.name || u.conflictsWith : "";
    const dStatusKind = owned ? "owned" : status === "blocked" ? "blocked" : status === "available" ? "available" : "locked";
    let statusLine = owned
      ? tr({ fr: "Adopté", en: "Adopted" })
      : status === "blocked"
        ? tr({ fr: `Exclu par : ${conflictName}`, en: `Excluded by: ${conflictName}` })
        : status === "available"
          ? tr({ fr: "Palier atteint — choix gratuit", en: "Tier reached — free choice" })
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
      aria: `${kindLabel} ${u?.name || d.id} — ${owned ? tr({ fr: "Adopté", en: "Adopted" }) : statusLine}`,
      tip: {
        branch: d.branch,
        kindLabel,
        name: u?.name || d.id,
        effect: u?.effect || "",
        costText: null,
        statusLine,
        statusKind: dStatusKind,
      },
    };
  });

  // Bornes écran de la bande de sol de l'œuvre (le fond du conteneur y coud le
  // ciel et le sous-sol) — recalculées à chaque render (zoom/pan figé) et
  // suivies en direct pendant le drag (cf. onPointerMove).
  const camYClamped = clampAxis(cam.y, WORLD_H * fitScale * cam.z, view.h);
  const ground = groundStops(camYClamped, fitScale * cam.z);

  return (
    <div
      className={`rtp-stage${cam.z > 1 ? " is-zoomed" : ""}`}
      ref={containerRef}
      style={{ "--rtp-ground": `${ground.top}px`, "--rtp-ground2": `${ground.bottom}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <RuinsUsureSync targetRef={containerRef} />
      <div className="rt-live" aria-live="polite" role="status">{liveMsg}</div>
      <div
        className="rt-world"
        ref={worldRef}
        style={{
          width: `${WORLD_W}px`,
          height: `${WORLD_H}px`,
          transform: `translate(${clampAxis(cam.x, WORLD_W * fitScale * cam.z, view.w)}px, ${clampAxis(cam.y, WORLD_H * fitScale * cam.z, view.h)}px) scale(${fitScale * cam.z})`,
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
      <div className="rtp-title" aria-hidden="true">Mémoire des Ruines</div>

      <div className="rt-zoom-controls" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="rt-zoom-btn" aria-label="Zoom avant"
          onClick={() => zoomAt(1.4, view.w / 2, view.h / 2)}>
          <i className="fa-solid fa-plus" aria-hidden="true" />
        </button>
        <button type="button" className="rt-zoom-btn" aria-label="Zoom arrière"
          onClick={() => zoomAt(1 / 1.4, view.w / 2, view.h / 2)}>
          <i className="fa-solid fa-minus" aria-hidden="true" />
        </button>
        <button type="button" className="rt-zoom-btn" aria-label="Recentrer la vue" onClick={resetCam}>
          <i className="fa-solid fa-expand" aria-hidden="true" />
        </button>
      </div>

      <NodeTooltip data={tip} />
    </div>
  );
}
