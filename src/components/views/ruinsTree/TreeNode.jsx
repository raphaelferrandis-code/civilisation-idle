import { branchTheme } from "./branchTheme.js";
import { EMBLEM_ATLAS } from "./emblemAtlas.js";

// Nœud de l'arbre : un vrai <button> (a11y native) dans le calque ÉCRAN, sans
// médaillon — l'EMBLÈME lui-même, repeint dans la matière de sa branche
// (scripts/bakeRuinsEmblems.mjs), posé à même le bois. Agrandi ×2 pour que son
// grain approche celui de l'arbre (×3) ; un bourgeon verrouillé reste à ×1.
// Positionné par left/top et NON par transform : la règle globale
// `button:hover { transform }` (base.css, chrome-wizard.css) le ferait sauter.
const ROW = { purchased: 0, available: 1, cost: 2, blocked: 2, locked: 3 };
const COL = Object.fromEntries(EMBLEM_ATLAS.order.map((id, i) => [id, i]));
const ATLAS_W = EMBLEM_ATLAS.order.length * EMBLEM_ATLAS.cell;
const ATLAS_H = EMBLEM_ATLAS.states.length * EMBLEM_ATLAS.cell;

export default function TreeNode({ vm, onHover, onBuy }) {
  const { id, left, top, status, kind, capstone, branch, aria, bought, conflict, dim, k = 1 } = vm;
  const theme = branchTheme(branch);
  const interactive = status === "available";

  const row = ROW[status] ?? 3;
  const zoom = (row === 3 ? 1 : 2) * k;
  const cell = EMBLEM_ATLAS.cell * zoom;

  const cls = [
    "rt-node",
    `rt-node--${kind}`,
    `rt-${status}`,
    capstone ? "rt-capstone" : "",
    bought ? "rt-bought" : "",
    conflict ? "rt-conflict" : "",
    dim ? "rt-dim" : "",
  ].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      className={cls}
      data-id={id}
      style={{ left: `${left}px`, top: `${top}px`, "--b-rgb": theme.rgb }}
      aria-label={aria}
      aria-disabled={!interactive}
      onClick={() => interactive && onBuy(id)}
      onMouseEnter={(e) => onHover(vm, e)}
      onMouseLeave={() => onHover(null)}
      onFocus={(e) => onHover(vm, e)}
      onBlur={() => onHover(null)}
    >
      <span
        className="rt-glyph"
        aria-hidden="true"
        style={{
          width: `${cell}px`,
          height: `${cell}px`,
          margin: `${-cell / 2}px 0 0 ${-cell / 2}px`,
          backgroundImage: `url(${EMBLEM_ATLAS.src})`,
          backgroundSize: `${ATLAS_W * zoom}px ${ATLAS_H * zoom}px`,
          backgroundPosition: `${-COL[id] * cell}px ${-row * cell}px`,
        }}
      />
      {capstone && <img className="rt-crown" src="/pixelart/ui/glyphs/couronne@16.png" alt="" aria-hidden="true" draggable="false" />}
    </button>
  );
}
