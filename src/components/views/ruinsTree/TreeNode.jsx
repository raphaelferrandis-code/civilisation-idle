import { branchTheme } from "./branchTheme.js";

// Nœud (ou médaillon de dogme) de l'arbre : un vrai <button> (a11y native),
// posé en absolu dans le monde, fond = cadre Kenney teinté + icône FA centrale.
export default function TreeNode({ vm, onHover, onBuy }) {
  const { id, x, y, size, font, status, icon, kind, capstone, branch, aria, entering, bought, conflict, enterDelay } = vm;
  const theme = branchTheme(branch);
  const interactive = status === "available";

  const cls = [
    "rt-node",
    `rt-node--${kind}`,
    `rt-${status}`,
    capstone ? "rt-capstone" : "",
    entering ? "rt-entering" : "",
    bought ? "rt-bought" : "",
    conflict ? "rt-conflict" : "",
    `rt-b-${branch}`,
  ].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      className={cls}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        width: `${size}px`,
        height: `${size}px`,
        fontSize: `${font}px`,
        "--b": theme.color,
        "--b-rgb": theme.rgb,
        "--enter-delay": `${enterDelay || 0}ms`,
      }}
      aria-label={aria}
      aria-disabled={!interactive}
      onClick={() => interactive && onBuy(id)}
      onMouseEnter={(e) => onHover(vm, e)}
      onMouseLeave={() => onHover(null)}
      onFocus={(e) => onHover(vm, e)}
      onBlur={() => onHover(null)}
    >
      <span className="rt-frame" aria-hidden="true" />
      <i className={`fa-solid ${icon} rt-icon`} aria-hidden="true" />
      {capstone && <i className="fa-solid fa-crown rt-crown" aria-hidden="true" />}
      {status === "purchased" && <i className="fa-solid fa-check rt-pip rt-pip--ok" aria-hidden="true" />}
      {status === "blocked" && <i className="fa-solid fa-ban rt-pip rt-pip--no" aria-hidden="true" />}
    </button>
  );
}
