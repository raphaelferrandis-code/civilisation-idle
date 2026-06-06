import { useEffect, useRef } from 'react';

export default function ChoiceDialog({ dialog, onChoose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const node = dialogRef.current;
    if (!dialog || !node) return undefined;

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
        <menu className="choice-menu">
          {dialog.options.map((option, index) => (
            <button
              key={`${option.label}-${index}`}
              type="button"
              value={index}
              onClick={() => onChoose(option)}
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
