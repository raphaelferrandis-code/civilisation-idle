// Bulle d'aide épurée — l'essentiel seulement (retour Raphaël) : nom, effet,
// coût. Aucune étiquette de type (« Dogme », « Capstone »...), aucun liseré de
// branche. Le pied garde le code couleur (ambre trop cher, gris verrouillé,
// rouge exclu, vert acquis).
export default function NodeTooltip({ data }) {
  if (!data) return null;
  const { left, top, flip, name, effect, costText, statusLine, statusKind, branch } = data;
  return (
    <div
      className={`rt-tooltip rt-b-${branch}${flip ? " rt-tooltip--flip" : ""}`}
      style={{ left: `${left}px`, top: `${top}px` }}
      role="tooltip"
    >
      <strong className="rt-tip-name">{name}</strong>
      {effect && <span className="rt-tip-effect">{effect}</span>}
      {(costText || statusLine) && (
        <div className="rt-tip-foot">
          {costText && (
            <span className="rt-tip-cost">
              <i className="fa-solid fa-landmark" aria-hidden="true" /> {costText}
            </span>
          )}
          {statusLine && (
            <span className={`rt-tip-status rt-status--${statusKind || "locked"}`}>{statusLine}</span>
          )}
        </div>
      )}
    </div>
  );
}
