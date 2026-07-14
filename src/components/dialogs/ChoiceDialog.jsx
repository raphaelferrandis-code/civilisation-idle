import { useEffect, useRef, useState } from 'react';
import { tr } from '../../game/core/i18n.js';

export default function ChoiceDialog({ dialog, onChoose }) {
  const dialogRef = useRef(null);
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    const node = dialogRef.current;
    if (!dialog || !node) return undefined;
    setSelectedIds(Array.isArray(dialog.defaultSelectedIds) ? dialog.defaultSelectedIds : []);

    const handleCancel = (event) => {
      if (dialog.preventClose) event.preventDefault();
    };
    const handleClose = () => {
      if (!dialog.preventClose && dialog.options?.length) onChoose(dialog.options[0]);
    };
    // Raccourcis d'épitaphe : les touches 1–N gravent directement (réservé au
    // deuil — les autres dialogues gardent leurs interactions propres).
    const handleDigit = (event) => {
      if (!dialog.mourning) return;
      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= (dialog.options?.length || 0)) return;
      event.preventDefault();
      onChoose({ ...dialog.options[index], selectedIds: [] });
    };

    node.addEventListener("cancel", handleCancel);
    node.addEventListener("close", handleClose);
    node.addEventListener("keydown", handleDigit);
    if (!node.open) node.showModal();

    return () => {
      node.removeEventListener("cancel", handleCancel);
      node.removeEventListener("close", handleClose);
      node.removeEventListener("keydown", handleDigit);
      if (node.open) node.close();
    };
  }, [dialog, onChoose]);

  if (!dialog) return null;

  const labelText = dialog.mourning
    ? tr({ fr: "Epitaphe", en: "Epitaph" })
    : dialog.variant === "cadmos"
      ? tr({ fr: "Cadmos", en: "Cadmos" })
      : tr({ fr: "Crise active", en: "Active Crisis" });
  const className = dialog.mourning
    ? "event-dialog epitaph-dialog"
    : dialog.variant
      ? `event-dialog ${dialog.variant}-dialog`
      : "event-dialog";

  return (
    <dialog ref={dialogRef} className={className}>
      <form method="dialog" onSubmit={(event) => event.preventDefault()}>
        <span className="label">{labelText}</span>
        <h2>{dialog.title}</h2>
        {String(dialog.body).split("\n").map((line, index) => (
          <p key={`${line}-${index}`}>{line || "\u00a0"}</p>
        ))}
        {dialog.inscription && <p className="dialog-inscription">{dialog.inscription}</p>}
        {Array.isArray(dialog.multiSelectOptions) && (
          <div className="active-ruins-choice">
            {dialog.multiSelectOptions.map((option) => {
              const checked = selectedIds.includes(option.id);
              return (
                <label
                  key={option.id}
                  className={`active-ruin-option ${checked ? "is-selected" : ""} ${option.disabled ? "is-disabled" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={option.disabled}
                    onChange={() => {
                      setSelectedIds((current) => checked
                        ? current.filter((id) => id !== option.id)
                        : [...current, option.id]);
                    }}
                  />
                  <span className="active-ruin-option-text">
                    <strong>{option.label}</strong>
                    <span>{option.bonus}</span>
                    <span>{option.malus}</span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
        <menu className="choice-menu">
          {(dialog.options || []).map((option, index) => {
            const hasStructure = option.headline || option.badge || (Array.isArray(option.effects) && option.effects.length > 0);
            const hasBadges = option.lastWill || option.badge;
            const headlineEl = option.headline ? (
              <span className="choice-headline">
                {option.headline}
                {option.delta && (
                  <span className={`effect-chip is-${option.delta.kind}${option.delta.boosted ? " is-boosted" : ""}`}>{option.delta.label}</span>
                )}
              </span>
            ) : null;
            const chipsEl = Array.isArray(option.effects) && option.effects.length > 0 ? (
              <span className="effect-chips">
                {option.effects.map((effect, effectIndex) => (
                  <span key={`${effect.label}-${effectIndex}`} className={`effect-chip is-${effect.kind || "info"}${effect.boosted ? " is-boosted" : ""}`}>
                    {effect.label}
                  </span>
                ))}
              </span>
            ) : null;
            return (
              <button
                key={`${option.label}-${index}`}
                type="button"
                value={index}
                className={`${hasStructure ? "choice-structured" : ""}${option.highlight ? " is-favored" : ""}`}
                onClick={() => onChoose({ ...option, selectedIds })}
              >
                <span className="choice-option-head">
                  <strong>{option.label}</strong>
                </span>
                {(option.rowLabelNow || hasBadges) && (
                  <span className="choice-badges-row">
                    {option.lastWill && (
                      <span className="choice-badge choice-badge--lastwill" title={tr({ fr: "Gravé à la chute précédente", en: "Engraved at the previous fall" })}>↺</span>
                    )}
                    {option.badge && <span className="choice-badge" title={option.badgeTitle || undefined}>{option.badge}</span>}
                  </span>
                )}
                {headlineEl && (option.rowLabelNow ? (
                  <span className="choice-row">
                    <span className="choice-row-label">{option.rowLabelNow}</span>
                    {headlineEl}
                  </span>
                ) : headlineEl)}
                {chipsEl && (option.rowLabelNext ? (
                  <span className="choice-row choice-row--chips">
                    <span className="choice-row-label">{option.rowLabelNext}</span>
                    {chipsEl}
                  </span>
                ) : chipsEl)}
                {option.detail && <small>{option.detail}</small>}
              </button>
            );
          })}
        </menu>
        {dialog.footnote && <p className="dialog-footnote">{dialog.footnote}</p>}
      </form>
    </dialog>
  );
}
