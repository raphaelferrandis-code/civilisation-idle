import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToString } from "react-dom/server";

// useGameState s'appuie sur useSyncExternalStore sans instantané serveur : pour
// le rendu SSR du test, il lit simplement l'état courant.
vi.mock("../../../hooks/useGameState.js", async () => {
  const { state } = await import("../../../game/core/state.js");
  return { useGameState: (selector) => selector(state), shallowEqual: Object.is };
});

import AchievementsChronique from "../AchievementsChronique.jsx";
import { state, setState, hydrateState } from "../../../game/core/state.js";
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS } from "../../../game/data/achievements.js";
import { achievementDisplaySignature } from "../../../game/core/achievements.js";

// LES SUCCÈS DANS LA CHRONIQUE (audit du 05/10, SUCCES-AFFICHAGE) : une icône par
// succès, grise tant qu'il est verrouillé, rien du tout pour un secret caché ;
// aucune phrase à l'écran (le texte passe dans l'infobulle).

const render = () => renderToString(<AchievementsChronique />).replace(/<!-- -->/g, "");
const count = (html, re) => (html.match(re) || []).length;
const secrets = ACHIEVEMENTS.filter((a) => a.secret);

beforeEach(() => {
  setState(hydrateState({}));
});

describe("Chronique — les succès", () => {
  it("partie neuve : toutes les icônes grises, les secrets en « ? », rien de débloqué", () => {
    const html = render();
    expect(html).toMatch(/0 \/ 80/);
    expect(count(html, /class="succes-tile /g)).toBe(ACHIEVEMENTS.length);
    expect(count(html, /class="succes-tile is-hidden"/g)).toBe(secrets.length);
    expect(count(html, /-gris\.png"/g)).toBe(ACHIEVEMENTS.length - secrets.length);
    // Un secret ne trahit ni son icône ni son nom.
    for (const a of secrets) {
      expect(html).not.toContain(`/achievements/${a.id}`);
      expect(html).not.toContain(a.name.fr);
    }
    // Une famille par titre, dans l'ordre de la liste.
    for (const g of ACHIEVEMENT_GROUPS) expect(html).toContain(g.label.fr);
  });

  it("un succès débloqué montre son icône en couleur et compte dans les totaux", () => {
    state.achievements = { ERE_HAMEAU: Date.UTC(2026, 9, 6), CHUTE_PREMIERE: Date.UTC(2026, 9, 6) };
    const html = render();
    expect(html).toContain('src="/pixelart/ui/achievements/ERE_HAMEAU.png"');
    expect(html).not.toContain("ERE_HAMEAU-gris.png");
    expect(html).toMatch(/2 \/ 80/);
    expect(count(html, /class="succes-tile is-unlocked"/g)).toBe(2);
  });

  it("un secret révélé par le jeu (sceau découvert) montre son icône grise et son nom", () => {
    state.grRevealed = { 1: true };
    const html = render();
    expect(html).toContain("SCEAU_I-gris.png");
    expect(html).toContain('aria-label="Le Premier Crépuscule"');
  });

  it("aucune phrase à l'écran (règle de DA) : ni paragraphe, ni condition écrite", () => {
    const html = render();
    expect(html).not.toMatch(/<p[\s>]/);
    expect(html).not.toContain(ACHIEVEMENTS[0].desc.fr);
  });

  it("la signature d'affichage ne change qu'au déblocage ou à la révélation d'un secret", () => {
    const fresh = achievementDisplaySignature(state);
    expect(fresh).toHaveLength(ACHIEVEMENTS.length);
    state.population = 12345;
    expect(achievementDisplaySignature(state)).toBe(fresh);
    state.grRevealed = { 1: true };
    const revealed = achievementDisplaySignature(state);
    expect(revealed).not.toBe(fresh);
    state.achievements = { SCEAU_I: 1 };
    expect(achievementDisplaySignature(state)).not.toBe(revealed);
  });
});
