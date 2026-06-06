"use strict";

/* ============================================================================
 * events.js - Dialogues et cinematiques: openChoiceDialog, collapseCause, generateEpitaph, runCollapseSequence.
 * Ordre de chargement (index.html): U -> DB -> DU -> DW -> ST -> ME -> EV -> AC -> RE -> MA
 * Scope global partage (pas de modules) - ne pas envelopper dans une IIFE.
 * ============================================================================ */

function openChoiceDialog({ title, body, options, mourning = false, variant = "", preventClose = false }) {
  const dialog = document.createElement("dialog");
  dialog.className = mourning ? "event-dialog epitaph-dialog" : variant ? `event-dialog ${variant}-dialog` : "event-dialog";
  const labelText = mourning ? "Epitaphe" : variant === "dynasty" ? "Fondation" : "Crise active";
  const choices = options.map((option, index) => `<button value="${index}">${option.label}<small>${option.detail || ""}</small></button>`).join("");
  dialog.innerHTML = `
    <form method="dialog">
      <span class="label">${labelText}</span>
      <h2>${title}</h2>
      <p>${body}</p>
      <menu class="choice-menu">${choices}</menu>
    </form>
  `;
  document.body.appendChild(dialog);
  return new Promise((resolve) => {
    if (preventClose) dialog.addEventListener("cancel", (e) => e.preventDefault());
    dialog.addEventListener("close", () => {
      const choice = options[Number(dialog.returnValue)] || options[0];
      dialog.remove();
      resolve(choice);
    }, { once: true });
    dialog.showModal();
  });
}

function collapseCause() {
  const vitals = cityVitals();
  const pressure = pressureBreakdown();
  const inequalityWithoutInfra = state.gold > Math.max(500, state.infrastructure * 400 + state.population * 0.7);
  if ((state.timeWear || 0) >= 1) return "time";
  if (vitals.foodScore < 0.16 || pressure.scarcity >= pressure.inequality && pressure.scarcity >= pressure.complexity) return "famine";
  if (inequalityWithoutInfra || pressure.inequality > Math.max(pressure.scarcity, pressure.complexity, pressure.structural)) return "avarice";
  return "rupture";
}

function generateEpitaph() {
  const era = eras[currentEraIndex()].name;
  const cause = collapseCause();
  if (cause === "time") {
    return "Le temps a efface ses fondations. Elle s'eteignit doucement, oubliee par l'histoire.";
  }
  if (cause === "famine") {
    return `Ici s'arrete l'Age ${era}. Detruite par ses propres famines, elle ne laissa que des poteries brisees.`;
  }
  if (cause === "avarice") {
    return `Ici s'arrete l'Age ${era}. Detruite par l'avarice de ses elites, son opulence fut ensevelie sous les sables.`;
  }
  return `Ici s'arrete l'Age ${era}. Trop vaste pour se gouverner, elle confondit sa grandeur avec une promesse d'eternite.`;
}

async function runCollapseSequence(gain, reason) {
  const app = document.querySelector(".app");
  app?.classList.add("mourning");
  const dynastyIndex = state.dynastyCount % dynastyNames.length;
  const fallenDynasty = dynastyNames[dynastyIndex];
  const epitaph = generateEpitaph();
  await new Promise((resolve) => setTimeout(resolve, 2000));
  // "Rite de Passage" : +25% ruines de base à chaque effondrement
  const riteBonus = has("rituel_effondrement") ? 1.25 : 1;
  const gainBase    = Math.round(gain * riteBonus);
  const gainPrepare = Math.round(gainBase * 1.2);
  // "Rite de Passage" : sélectionne auto "Préparer la chute" (le dialogue s'ouvre quand même)
  let finalGain;
  if (has("rituel_effondrement")) {
    // Auto-selection visible : on affiche le dialogue avec indication que c'est automatique
    const choice = await openChoiceDialog({
      title: `Chute de ${fallenDynasty}`,
      body: `${epitaph}\n\nLes survivants rassemblent des ruines. Que faire ?`,
      mourning: true,
      preventClose: true,
      options: [
        { label: "Effondrement", detail: `Accepter la chute. ${fmt(gainBase)} ruines (+25% Rite).`, ruinGain: gainBase },
        { label: "Preparer la chute", detail: `Organiser le repli. ${fmt(gainPrepare)} ruines (+25% +20%). Rite actif.`, ruinGain: gainPrepare }
      ]
    });
    finalGain = choice.ruinGain ?? gainPrepare;
  } else {
    const choice = await openChoiceDialog({
      title: `Chute de ${fallenDynasty}`,
      body: `${epitaph}\n\nLes survivants rassemblent des ruines. Que faire ?`,
      mourning: true,
      preventClose: true,
      options: [
        { label: "Effondrement", detail: `Accepter la chute. ${fmt(gainBase)} ruines recoltees.`, ruinGain: gainBase },
        { label: "Preparer la chute", detail: `Organiser le repli, preserver l'essentiel. ${fmt(gainPrepare)} ruines (+20%).`, ruinGain: gainPrepare }
      ]
    });
    finalGain = choice.ruinGain ?? gainBase;
  }
  completeCollapse(finalGain, fallenDynasty, epitaph, reason);
  app?.classList.remove("mourning");
  collapseInProgress = false;
  gamePaused = false;
  save();
  openView("city");
  render();
}
