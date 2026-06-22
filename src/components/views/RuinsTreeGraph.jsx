import { useMemo, useRef, useState, useEffect, useLayoutEffect, useCallback } from "react";
import { useGameState } from "../../hooks/useGameState.js";
import {
  checkNodeAvailability,
  checkDogmaAvailability,
  ownedRuinBranchPurchaseCount,
  ownedInBranchBelowTier,
  isUnlocked,
  has,
} from "../../game/core/mechanics.js";
import { buyUpgrade } from "../../game/core/actions.js";
import { upgradeById, state } from "../../game/core/state.js";
import {
  PRESTIGE_TREE,
  PRESTIGE_TREE_BRANCHES,
  PRESTIGE_DOGMAS,
} from "../../game/data/upgrades.js";
import { fmt } from "../../game/core/utils.js";
import { computeRuinTreeLayout, LAYOUT } from "./ruinsTree/layout.js";
import { branchTheme } from "./ruinsTree/branchTheme.js";
import { iconFor } from "./ruinsTree/nodeIcon.js";
import TreeNode from "./ruinsTree/TreeNode.jsx";
import NodeTooltip from "./ruinsTree/NodeTooltip.jsx";

const STATUS_LABEL = {
  purchased: "Acheté",
  available: "Disponible",
  blocked: "Exclu",
  locked: "Verrouillé",
};

const UNLOCK = Object.fromEntries(PRESTIGE_TREE_BRANCHES.map((b) => [b.id, b.unlock || []]));

function dogmaKind(id) {
  if (id.startsWith("trait_")) return "Trait";
  if (id.startsWith("skill_")) return "Compétence";
  return "Dogme";
}

function tierOpen(branch, tier) {
  return ownedInBranchBelowTier(branch, tier) >= (UNLOCK[branch]?.[tier] ?? 0);
}

function prefersReducedMotion() {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const GROW_MS = 650;          // durée d'apparition d'un nœud
const ENTER_STAGGER = 70;     // décalage par palier (pousse du centre vers l'extérieur)
const EMPTY_SET = new Set();

// Borne une translation d'axe : centre si le monde est plus petit que la vue,
// sinon le contraint à couvrir la vue (pas de zone vide au bord).
function clampAxis(p, worldSize, viewSize) {
  if (worldSize <= viewSize) return (viewSize - worldSize) / 2;
  return Math.min(0, Math.max(viewSize - worldSize, p));
}

// Fond RÉACTIF À L'USURE : isolé dans son propre composant pour que le tick
// d'usure (state.timeWear, continu) ne re-render PAS tout l'arbre. Il pousse des
// variables CSS sur le conteneur (DOM direct) : glow ambré calme à basse usure →
// froid/rougeâtre + craquelures (strates) + vignette rouge à mesure qu'elle monte.
function RuinsUsureSync({ targetRef }) {
  // Quantifié à 0,5 % : le composant ne se réveille (et ne repeint le fond) que
  // quand l'usure franchit un palier de 0,5 %, jamais à chaque micro-tick.
  const u = useGameState((s) => Math.round(Math.max(0, Math.min(1, s.timeWear || 0)) * 200) / 200);
  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    const lerp = (a, b) => Math.round(a + (b - a) * u);
    el.style.setProperty("--rt-glow", `${lerp(216, 158)}, ${lerp(150, 72)}, ${lerp(74, 66)}`);
    el.style.setProperty("--rt-glow-a", (0.13 + 0.08 * u).toFixed(3));
    el.style.setProperty("--rt-strata", `${lerp(174, 172)}, ${lerp(150, 92)}, ${lerp(118, 80)}`);
    el.style.setProperty("--rt-strata-a", (0.06 + 0.13 * u).toFixed(3));
    el.style.setProperty("--rt-usure", u.toFixed(3));
  }, [u, targetRef]);
  return null;
}

export default function RuinsTreeGraph() {
  "use no memo"; // opt-out React Compiler : hooks manuels (Sets/refs) → évite
  // une réécriture inconsistante des deps d'effet (erreur « deps changed size »).
  // Signaux de re-render : ruins (gain/dépense), lifetimePurchases (TOUT achat,
  // y compris dogmes 0-coût — `state.upgrades` est muté en place donc inobservable),
  // cycles (révélation progressive des nœuds `unlockCycles`).
  const ruins = useGameState((s) => s.ruins);
  const purchases = useGameState((s) => s.lifetimePurchases);
  const cycles = useGameState((s) => s.cycles);

  const containerRef = useRef(null);
  const worldRef = useRef(null);
  const [view, setView] = useState({ w: 0, h: 0 }); // taille px du conteneur
  // Caméra utilisateur : zoom (≥1) + translation en px conteneur.
  const [cam, setCam] = useState({ z: 1, x: 0, y: 0 });
  const camRef = useRef(cam);
  const viewRef = useRef({ w: 0, h: 0 });
  const dragRef = useRef({ active: false, moved: false, sx: 0, sy: 0, cx: 0, cy: 0 });
  const [tip, setTip] = useState(null);
  const [hoveredId, setHoveredId] = useState(null); // nœud survolé → exclusions visibles

  // camRef miroir (lecture hors-rendu par les handlers de pan).
  useEffect(() => { camRef.current = cam; }, [cam]);

  // Croissance « l'arbre pousse » : nœuds nouvellement visibles, flash d'achat,
  // annonce a11y. Le set « déjà-vu » vit dans state.ruinsSeenNodes (survit au
  // démontage en crise) → l'anim ne joue qu'UNE fois (au 1er montage post-révélation).
  const [justBought, setJustBought] = useState(null);
  const [liveMsg, setLiveMsg] = useState("");
  const [seen, setSeen] = useState(() => new Set(state.ruinsSeenNodes || []));

  // ACCESSIBILITÉ : un nœud n'apparaît que lorsqu'il est ATTEIGNABLE — palier
  // ouvert (assez de nœuds inférieurs acquis) OU déjà acheté ; plus le gate
  // unlockCycles. Les nœuds inaccessibles restent cachés et surgissent quand
  // leur palier s'ouvre — l'arbre pousse réellement à mesure qu'on progresse.
  const accessibleIds = useMemo(() => {
    void purchases; void cycles;
    const set = new Set();
    for (const n of PRESTIGE_TREE) {
      const u = upgradeById[n.id];
      if (!u) continue;
      if (has(n.id)) { set.add(n.id); continue; }
      if (isUnlocked(u) && tierOpen(n.branch, n.tier)) set.add(n.id);
    }
    return set;
  }, [purchases, cycles]);

  // Dogmes : visibles une fois le palier de branche atteint (ou déjà adoptés).
  const accessibleDogmas = useMemo(() => {
    void purchases;
    return PRESTIGE_DOGMAS.filter(
      (d) => has(d.id) || ownedRuinBranchPurchaseCount(d.branch) >= d.requiredPurchases
    );
  }, [purchases]);

  // Géométrie pure — mémoïsée sur la signature d'accessibilité.
  const layout = useMemo(
    () => computeRuinTreeLayout(accessibleIds, { dogmas: accessibleDogmas }),
    [accessibleIds, accessibleDogmas]
  );
  const R = layout.maxRadius + LAYOUT.MARGIN;
  const span = 2 * R;
  // Anneaux de strates (fond) : cercles concentriques au moyeu, un par anneau de ronds.
  const strataRadii = [];
  for (let r = LAYOUT.RC0; r <= layout.maxRadius; r += LAYOUT.RC_STEP) strataRadii.push(r);
  // Plafonné : un petit arbre (début de partie) ne doit pas être gonflé pour
  // remplir tout le cadre — il reste à taille raisonnable, centré, avec de l'air.
  const fitScale = span > 0 ? Math.min(1.3, Math.min(view.w, view.h) / span) : 0;
  // Plafond de zoom ABSOLU : on doit pouvoir atteindre une échelle lisible
  // (~1.5 → nœud ≈ 78 px) même quand l'arbre est immense (un rayon maximisé fait
  // chuter fitScale). Sinon 2.6×fitScale plafonne à des nœuds minuscules.
  const zMax = fitScale > 0 ? Math.max(2.6, 1.5 / fitScale) : 2.6;

  // Ids actuellement affichés (nœuds + dogmes) → base de la révélation.
  const shownIds = useMemo(() => {
    const s = new Set();
    layout.nodes.forEach((n) => s.add(n.id));
    layout.dogmas.forEach((d) => s.add(d.id));
    return s;
  }, [layout]);

  // Révélation progressive : ce qui est affiché mais pas encore « vu » s'anime.
  const reduced = prefersReducedMotion();
  const fresh = reduced ? [] : [...shownIds].filter((id) => !seen.has(id));
  const entering = fresh.length ? new Set(fresh) : EMPTY_SET;
  const growing = fresh.length > 0;
  const revealMsg = growing
    ? `${fresh.length} nœud${fresh.length > 1 ? "s" : ""} se révèle${fresh.length > 1 ? "nt" : ""}.`
    : "";

  // Fige les nœuds « vus » après leur apparition (persiste pour ne pas rejouer).
  useEffect(() => {
    const f = [...shownIds].filter((id) => !seen.has(id));
    if (f.length === 0) return undefined;
    if (reduced) {
      state.ruinsSeenNodes = [...new Set([...(state.ruinsSeenNodes || []), ...f])];
      return undefined;
    }
    const t = setTimeout(() => {
      const next = new Set([...seen, ...f]);
      state.ruinsSeenNodes = [...next];
      setSeen(next);
    }, GROW_MS + ENTER_STAGGER * 6 + 250);
    return () => clearTimeout(t);
  }, [shownIds, seen, reduced]);

  // Mesure du conteneur (le monde carré est ajusté à la plus petite dimension,
  // centré, puis déplaçable au zoom).
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

  // Zoom centré sur un point (cx,cy en px conteneur), pan borné.
  const zoomAt = useCallback((factor, cx, cy) => {
    setCam((c) => {
      const z = Math.max(1, Math.min(zMax, c.z * factor));
      const v = viewRef.current;
      const ws = span * fitScale * z; // taille écran du monde
      const x = clampAxis(cx - (cx - c.x) * (z / c.z), ws, v.w);
      const y = clampAxis(cy - (cy - c.y) * (z / c.z), ws, v.h);
      return { z, x, y };
    });
  }, [span, fitScale, zMax]);

  const resetCam = useCallback(() => setCam({ z: 1, x: 0, y: 0 }), []);

  // Molette = zoom vers le curseur (listener natif non-passif pour preventDefault).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Glisser = pan. On NE capture PAS le pointeur sur un simple clic (sinon le
  // clic n'atteint pas le nœud → achat cassé) : la capture n'arrive qu'au-delà
  // du seuil de déplacement (vrai drag). Le pan est appliqué DIRECTEMENT au DOM
  // pendant le drag (fluide, sans re-render), puis figé dans le state au relâché.
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
      try { d.target?.setPointerCapture(d.pointerId); } catch { /* noop */ }
    }
    if (!d.moved) return;
    const v = viewRef.current;
    const z = camRef.current.z;
    const ws = span * fitScale * z;
    d.liveX = clampAxis(d.cx + dx, ws, v.w);
    d.liveY = clampAxis(d.cy + dy, ws, v.h);
    if (worldRef.current) {
      worldRef.current.style.transform = `translate(${d.liveX}px, ${d.liveY}px) scale(${fitScale * z})`;
    }
  }, [span, fitScale]);

  const onPointerUp = useCallback((e) => {
    const d = dragRef.current;
    if (!d.active) return;
    d.active = false;
    try { d.target?.releasePointerCapture?.(d.pointerId); } catch { /* noop */ }
    if (d.moved) setCam((c) => ({ z: c.z, x: d.liveX, y: d.liveY }));
    void e;
  }, []);

  const onBuy = useCallback((id) => {
    if (dragRef.current.moved) return; // c'était un pan, pas un clic
    buyUpgrade(id);
    if (has(id)) {
      const u = upgradeById[id];
      setJustBought(id);
      setLiveMsg(`${u?.name || id} acquis.`);
      setTimeout(() => setJustBought((cur) => (cur === id ? null : cur)), 520);
    }
  }, []);

  const onHover = useCallback((vm, evt) => {
    if (!vm) {
      setTip(null);
      setHoveredId(null);
      return;
    }
    if (dragRef.current.active && dragRef.current.moved) return; // pas de tooltip pendant un pan
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

  // world (centré en 0) → pixels du calque monde (origine en haut-gauche).
  const px = (v) => v + R;

  // Exclusions affichées SEULEMENT au survol : liens dont le nœud survolé est une
  // extrémité, + l'autre extrémité (le nœud incompatible) mise en évidence.
  const activeExclusions = hoveredId
    ? layout.exclusionLinks.filter((l) => l.ids.includes(hoveredId))
    : [];
  const conflictIds = new Set();
  for (const l of activeExclusions) {
    for (const id of l.ids) if (id !== hoveredId) conflictIds.add(id);
  }

  // Modèles de vue des nœuds.
  const nodeVMs = layout.nodes.map((n) => {
    const u = upgradeById[n.id];
    const status = checkNodeAvailability(n.id);
    const open = tierOpen(n.branch, n.tier);
    const need = UNLOCK[n.branch]?.[n.tier] ?? 0;
    const ownedBelow = ownedInBranchBelowTier(n.branch, n.tier);
    const conflictName = u?.conflictsWith ? upgradeById[u.conflictsWith]?.name || u.conflictsWith : "";

    let statusLine;
    let statusKind;
    if (status === "purchased") { statusLine = "Acquis"; statusKind = "owned"; }
    else if (status === "blocked") { statusLine = `Exclu par : ${conflictName}`; statusKind = "blocked"; }
    else if (status === "available") { statusLine = "Disponible"; statusKind = "available"; }
    else if (!open) { statusLine = `Palier verrouillé · ${ownedBelow}/${need}`; statusKind = "locked"; }
    else { statusLine = "Pas assez de ruines"; statusKind = "cost"; }

    const costText = status === "purchased" ? "Acquis" : `${fmt(u?.cost?.ruins ?? 0)}`;

    return {
      id: n.id,
      kind: "node",
      branch: n.branch,
      capstone: n.capstone,
      status,
      icon: iconFor(u, n.branch),
      x: px(n.x),
      y: px(n.y),
      size: 2 * n.r,
      font: n.r * (n.capstone ? 1.04 : 0.94),
      entering: entering.has(n.id),
      bought: justBought === n.id,
      conflict: conflictIds.has(n.id),
      enterDelay: n.tier * ENTER_STAGGER,
      aria: `${u?.name || n.id} — ${STATUS_LABEL[status]} — ${costText}`,
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

  // Modèles de vue des dogmes (médaillons).
  const dogmaVMs = layout.dogmas.map((d) => {
    const u = upgradeById[d.id];
    const status = checkDogmaAvailability(d.id);
    const count = ownedRuinBranchPurchaseCount(d.branch);
    const owned = has(d.id);
    const kindLabel = dogmaKind(d.id);
    const reached = count >= d.requiredPurchases;
    const dStatusKind = owned ? "owned" : reached ? "available" : "locked";
    let statusLine = owned
      ? "Adopté"
      : reached
        ? "Palier atteint — gratuit"
        : `${count}/${d.requiredPurchases} achats`;
    return {
      id: d.id,
      kind: "dogma",
      branch: d.branch,
      capstone: false,
      status,
      icon: iconFor(u, d.branch),
      x: px(d.x),
      y: px(d.y),
      size: 2 * d.r,
      font: d.r * 0.86,
      entering: entering.has(d.id),
      bought: justBought === d.id,
      enterDelay: 6 * ENTER_STAGGER,
      aria: `${kindLabel} ${u?.name || d.id} — ${owned ? "Adopté" : statusLine}`,
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

  const edgeClass = (e) => {
    if (has(e.id)) return "rt-edge rt-edge--on";
    if (tierOpen(e.branch, e.tier)) return "rt-edge rt-edge--open";
    return "rt-edge rt-edge--gated";
  };

  return (
    <div className="ruins-tree-frame">
      <div
        className={`ruins-tree${growing ? " is-growing" : ""}${cam.z > 1 ? " is-zoomed" : ""}`}
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
      <RuinsUsureSync targetRef={containerRef} />
      <div className="rt-live" aria-live="polite" role="status">{liveMsg || revealMsg}</div>
      <div
        className="rt-world"
        ref={worldRef}
        style={{
          width: `${span}px`,
          height: `${span}px`,
          transform: `translate(${clampAxis(cam.x, span * fitScale * cam.z, view.w)}px, ${clampAxis(cam.y, span * fitScale * cam.z, view.h)}px) scale(${fitScale * cam.z})`,
        }}
      >
        <svg
          className="rt-svg"
          width={span}
          height={span}
          viewBox={`${-R} ${-R} ${span} ${span}`}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          {/* Anneaux de strates (fond) : arcs brisés/érodés, ancrés au moyeu */}
          {strataRadii.map((r, i) => (
            <circle key={`strata-${i}`} cx={0} cy={0} r={r} className="rt-strata" transform={`rotate(${i * 53})`} />
          ))}

          {/* Chaîne hub → ronds : sillon gravé (rainure sombre + rail teinté) */}
          {layout.trunks.map((t) => (
            <g key={`trunk-${t.branch}-${t.tier}`}>
              <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} className="rt-trunk-groove" />
              <line
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                className={`rt-trunk rt-b-${t.branch}`}
                style={{ stroke: branchTheme(t.branch).color }}
              />
            </g>
          ))}

          {/* Rayons cœur ↔ nœud : rainure noire (contour) + rail teinté */}
          {layout.edges.map((e, i) => {
            const d = `M${e.x1},${e.y1} Q${e.cx},${e.cy} ${e.x2},${e.y2}`;
            const cls = edgeClass(e);
            return (
              <g key={`edge-${e.id}-${i}`}>
                {!cls.includes("gated") && <path d={d} className="rt-edge-groove" />}
                <path d={d} className={cls} style={{ stroke: branchTheme(e.branch).color }} />
              </g>
            );
          })}

          {/* Fils d'exclusion (seule vraie arête, inter-branche) */}
          {activeExclusions.map((l, i) => (
            <path
              key={`excl-${l.ids.join("-")}-${i}`}
              className="rt-exclusion"
              d={`M${l.a.x},${l.a.y} Q0,0 ${l.b.x},${l.b.y}`}
            />
          ))}

          {/* Portes de palier : affichées UNIQUEMENT tant que le palier est fermé
              (cercle + compteur X/Y). Une fois le palier ouvert → rien du tout. */}
          {layout.gates.map((g) => {
            if (tierOpen(g.branch, g.tier)) return null;
            const ownedBelow = ownedInBranchBelowTier(g.branch, g.tier);
            return (
              <g key={`gate-${g.branch}-${g.tier}`} className="rt-gate is-closed">
                <circle cx={g.x} cy={g.y} r={13} style={{ stroke: branchTheme(g.branch).color }} />
                <text x={g.x} y={g.y} className="rt-gate-text" dominantBaseline="central" textAnchor="middle">
                  {ownedBelow}/{g.need}
                </text>
              </g>
            );
          })}

          {/* Moyeu */}
          <circle cx={0} cy={0} r={LAYOUT.R0 * 0.46} className="rt-hub-disc" />
        </svg>

        {/* Calque des nœuds HTML (boutons accessibles) */}
        {nodeVMs.map((vm) => (
          <TreeNode key={vm.id} vm={vm} onHover={onHover} onBuy={onBuy} />
        ))}
        {dogmaVMs.map((vm) => (
          <TreeNode key={vm.id} vm={vm} onHover={onHover} onBuy={onBuy} />
        ))}

        {/* Cœurs-sceaux (ronds sans dogme/capstone) : sceau de pierre & or qui
            s'allume une fois le rond complété. */}
        {layout.seals.map((s) => {
          const complete = s.nodeIds.length > 0 && s.nodeIds.every(has);
          return (
            <div
              key={`seal-${s.branch}-${s.tier}`}
              className={`rt-seal2${complete ? " is-complete" : ""}`}
              style={{
                left: `${px(s.x)}px`,
                top: `${px(s.y)}px`,
                width: `${2 * s.r}px`,
                height: `${2 * s.r}px`,
                "--b-rgb": branchTheme(s.branch).rgb,
              }}
            />
          );
        })}

        {/* Étiquette du moyeu */}
        <div className="rt-hub" style={{ left: `${px(0)}px`, top: `${px(0)}px` }}>
          <i className="fa-solid fa-landmark rt-hub-icon" aria-hidden="true" />
          <strong className="rt-hub-count">{fmt(ruins)}</strong>
        </div>
      </div>

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
      <span className="rt-corner rt-corner--tl" aria-hidden="true" />
      <span className="rt-corner rt-corner--tr" aria-hidden="true" />
      <span className="rt-corner rt-corner--bl" aria-hidden="true" />
      <span className="rt-corner rt-corner--br" aria-hidden="true" />
    </div>
  );
}
