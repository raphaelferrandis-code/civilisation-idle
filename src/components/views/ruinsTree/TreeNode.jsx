import { branchTheme } from "./branchTheme.js";

// Médaillon de l'arbre : un vrai <button> (a11y native), posé dans le calque
// ÉCRAN au-dessus de l'illustration (taille fixe quel que soit le zoom, emblème
// à 1:1). Positionné par left/top et NON par transform : la règle globale
// `button:hover { transform }` (base.css, chrome-wizard.css) le ferait sauter.
// Anneaux DURS (box-shadow sans flou) : c'est du pixel, pas un halo.
export default function TreeNode({ vm, onHover, onBuy }) {
  const { id, left, top, status, kind, capstone, branch, aria, bought, conflict, dim } = vm;
  const theme = branchTheme(branch);
  const interactive = status === "available";

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
      style={{ left: `${left}px`, top: `${top}px`, "--b-rgb": theme.rgb, "--b-glow": theme.glow }}
      aria-label={aria}
      aria-disabled={!interactive}
      onClick={() => interactive && onBuy(id)}
      onMouseEnter={(e) => onHover(vm, e)}
      onMouseLeave={() => onHover(null)}
      onFocus={(e) => onHover(vm, e)}
      onBlur={() => onHover(null)}
    >
      <span className="rt-disc" aria-hidden="true" />
      <img className="rt-emblem" src={`/pixelart/ui/ruins/node-${id}@32.png`} alt="" aria-hidden="true" draggable="false" />
      {capstone && <img className="rt-crown" src="/pixelart/ui/glyphs/couronne@16.png" alt="" aria-hidden="true" draggable="false" />}
    </button>
  );
}
