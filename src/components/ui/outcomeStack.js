// PILE DE TOASTS (C13). Logique PURE, sans React ni minuteur : une rafale
// d'événements ne doit plus produire un mur de textes flottants.
//
// Trois règles, dans cet ordre :
//   1. FUSION sur (label, kind). Fusionner sur le seul label collerait un gain
//      et un coût portant le même intitulé dans la même pastille.
//   2. PLAFOND de la pile visible. Au-delà, on met en FILE plutôt que de jeter :
//      un jalon franchi pendant une rafale d'aubaines doit finir par s'afficher.
//   3. PRIORITÉ à la sortie de file, pas à l'entrée : on ne chasse jamais un
//      toast déjà à l'écran en cours d'animation, ça se lit comme un bug.
//
// Aucun minuteur ici : chaque entrée visible porte son `expiresAt` et c'est
// l'appelant qui fait avancer l'horloge (tickOutcomes). C'est ce qui rend tout
// ceci testable sans faux temps ni DOM.

export const MAX_VISIBLE = 4;
export const LIFE_MS = 2400;

// `announce` porte le texte à passer en aria-live, et UNIQUEMENT ce qui vient
// d'apparaître : une fusion ou une simple expiration le remettent à vide, sinon
// un lecteur d'écran relirait toute la pile à chaque changement. C'est aussi ce
// qui évite de tenir cet historique dans un ref lu pendant le rendu.
export const emptyStack = () => ({ visible: [], queue: [], nextId: 1, announce: "" });

const sameToast = (a, b) => a.label === b.label && (a.kind || "info") === (b.kind || "info");

// Normalise une entrée du bus : le contrat public est { label, kind, view,
// priority }, tout le reste est ignoré.
function toEntry(outcome, id, now) {
  return {
    id,
    label: outcome.label,
    kind: outcome.kind || "info",
    view: outcome.view || null,
    priority: Number.isFinite(outcome.priority) ? outcome.priority : 0,
    count: 1,
    seq: id,                     // ordre d'arrivée, départage les priorités égales
    expiresAt: now + LIFE_MS,
  };
}

export function pushOutcome(stack, outcome, now) {
  if (!outcome || !outcome.label) return stack;

  // 1. Déjà à l'écran : on incrémente et on relance sa vie, sans nouvelle ligne.
  const visibleHit = stack.visible.findIndex((f) => sameToast(f, outcome));
  if (visibleHit >= 0) {
    const visible = stack.visible.slice();
    const hit = visible[visibleHit];
    visible[visibleHit] = { ...hit, count: hit.count + 1, expiresAt: now + LIFE_MS };
    return { ...stack, visible, announce: "" };
  }

  // 2. Déjà en file : même fusion, pour qu'une rafale n'engorge pas la file.
  const queueHit = stack.queue.findIndex((f) => sameToast(f, outcome));
  if (queueHit >= 0) {
    const queue = stack.queue.slice();
    const hit = queue[queueHit];
    queue[queueHit] = { ...hit, count: hit.count + 1 };
    return { ...stack, queue, announce: "" };
  }

  const entry = toEntry(outcome, stack.nextId, now);
  const nextId = stack.nextId + 1;
  if (stack.visible.length < MAX_VISIBLE) {
    return { ...stack, visible: [...stack.visible, entry], nextId, announce: entry.label };
  }
  // En file : rien à annoncer tant que ce n'est pas à l'écran.
  return { ...stack, queue: [...stack.queue, entry], nextId, announce: "" };
}

// Fait avancer l'horloge : retire ce qui a expiré, puis remplit les places
// libérées avec la file, du plus prioritaire au moins prioritaire.
export function tickOutcomes(stack, now) {
  const survivors = stack.visible.filter((f) => f.expiresAt > now);
  if (survivors.length === stack.visible.length && !stack.queue.length) return stack;
  // Une simple expiration n'annonce rien : seule une NOUVELLE entrée à l'écran
  // vaut d'être lue.
  if (!stack.queue.length) return { ...stack, visible: survivors, announce: "" };

  const queue = stack.queue.slice().sort((a, b) => (b.priority - a.priority) || (a.seq - b.seq));
  const visible = survivors.slice();
  const promus = [];
  while (visible.length < MAX_VISIBLE && queue.length) {
    // L'entrée promue démarre sa vie MAINTENANT : elle n'a pas encore été vue.
    const entry = { ...queue.shift(), expiresAt: now + LIFE_MS };
    visible.push(entry);
    promus.push(entry.label);
  }
  return { ...stack, visible, queue, announce: promus.join(". ") };
}

export const stackIsEmpty = (stack) => !stack.visible.length && !stack.queue.length;
