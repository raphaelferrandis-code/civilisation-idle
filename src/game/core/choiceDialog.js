let showChoiceDialog = null;

export function registerChoiceDialog(handler) {
  showChoiceDialog = typeof handler === "function" ? handler : null;
  return () => {
    if (showChoiceDialog === handler) showChoiceDialog = null;
  };
}

export function requestChoiceDialog(dialog) {
  if (!showChoiceDialog) return Promise.resolve(dialog.options[0]);
  return showChoiceDialog(dialog);
}
