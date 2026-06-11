import { useEffect, useRef, useState } from 'react';

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
      if (!dialog.preventClose) onChoose(dialog.options[0]);
    };

    node.addEventListener("cancel", handleCancel);
    node.addEventListener("close", handleClose);
    if (!node.open) node.showModal();

    return () => {
      node.removeEventListener("cancel", handleCancel);
      node.removeEventListener("close", handleClose);
      if (node.open) node.close();
    };
  }, [dialog, onChoose]);

  if (!dialog) return null;

  const labelText = dialog.mourning
    ? "Epitaphe"
    : dialog.variant === "dynasty"
      ? "Fondation"
      : dialog.variant === "cadmos"
        ? "Cadmos"
        : "Crise active";
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
          {dialog.options.map((option, index) => (
            <button
              key={`${option.label}-${index}`}
              type="button"
              value={index}
              onClick={() => onChoose({ ...option, selectedIds })}
            >
              {option.label}
              {option.detail && <small>{option.detail}</small>}
            </button>
          ))}
        </menu>
      </form>
    </dialog>
  );
}
