// Bulle d'aide épurée : nom (couleur de branche) + effet, et un pied compact
// coût / statut au code couleur (vert dispo, ambre trop cher, gris verrouillé,
// rouge exclu, vert acquis).
export default function NodeTooltip({ data }) {
  if (!data) return null;
  const { left, top, flip, kindLabel, name, effect, costText, statusLine, statusKind, branch } = data;
  return (
    <div
      className={`rt-tooltip rt-b-${branch}${flip ? " rt-tooltip--flip" : ""}`}
      style={{ left: `${left}px`, top: `${top}px` }}
      role="tooltip"
    >
      <div className="rt-tip-head">
        <strong className="rt-tip-name">{name}</strong>
        {kindLabel && <span className="rt-tip-kind">{kindLabel}</span>}
      </div>
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
