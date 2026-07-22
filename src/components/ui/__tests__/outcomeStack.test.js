import { describe, it, expect } from "vitest";

import {
  emptyStack, pushOutcome, tickOutcomes, stackIsEmpty, MAX_VISIBLE, LIFE_MS,
} from "../outcomeStack.js";

// PILE DE TOASTS (C13). Avant : concaténation sans plafond, minuteur fixe,
// aucune fusion — une rafale de paliers produisait un mur de textes flottants.

const T0 = 1_000_000;
const push = (s, o, now = T0) => pushOutcome(s, o, now);

describe("fusion", () => {
  it("deux toasts identiques n'en font qu'un, avec un compteur", () => {
    let s = push(emptyStack(), { label: "Palier", kind: "gain" });
    s = push(s, { label: "Palier", kind: "gain" });
    s = push(s, { label: "Palier", kind: "gain" });
    expect(s.visible).toHaveLength(1);
    expect(s.visible[0].count).toBe(3);
  });

  it("la fusion RELANCE la vie du toast : une rafale ne s'éteint pas en plein milieu", () => {
    let s = push(emptyStack(), { label: "Palier", kind: "gain" }, T0);
    const premier = s.visible[0].expiresAt;
    s = push(s, { label: "Palier", kind: "gain" }, T0 + 2000);
    expect(s.visible[0].expiresAt).toBeGreaterThan(premier);
  });

  it("le KIND compte : un gain et un coût de même intitulé ne se confondent pas", () => {
    // Fusionner sur le seul label collerait « Récolte » gagnée et perdue dans la
    // même pastille, avec un compteur qui ne voudrait rien dire.
    let s = push(emptyStack(), { label: "Récolte", kind: "gain" });
    s = push(s, { label: "Récolte", kind: "cost" });
    expect(s.visible).toHaveLength(2);
  });

  it("un toast sans libellé est ignoré", () => {
    expect(pushOutcome(emptyStack(), { kind: "gain" }, T0).visible).toHaveLength(0);
    expect(pushOutcome(emptyStack(), null, T0).visible).toHaveLength(0);
  });
});

describe("plafond et file", () => {
  it("la pile visible ne dépasse jamais le plafond", () => {
    let s = emptyStack();
    for (let i = 0; i < 20; i += 1) s = push(s, { label: `Event ${i}`, kind: "info" });
    expect(s.visible).toHaveLength(MAX_VISIBLE);
    expect(s.queue).toHaveLength(20 - MAX_VISIBLE);
  });

  it("le surplus est MIS EN FILE, pas jeté", () => {
    let s = emptyStack();
    for (let i = 0; i < MAX_VISIBLE + 3; i += 1) s = push(s, { label: `E${i}`, kind: "info" });
    // Tout expire, la file prend la place.
    s = tickOutcomes(s, T0 + LIFE_MS + 1);
    expect(s.visible.map((f) => f.label)).toEqual(["E4", "E5", "E6"]);
  });

  it("une rafale d'un même libellé n'engorge pas la file", () => {
    let s = emptyStack();
    for (let i = 0; i < MAX_VISIBLE; i += 1) s = push(s, { label: `E${i}`, kind: "info" });
    for (let i = 0; i < 50; i += 1) s = push(s, { label: "Aubaine", kind: "gain" });
    expect(s.queue).toHaveLength(1);
    expect(s.queue[0].count).toBe(50);
  });
});

describe("priorité", () => {
  it("un jalon sort de file avant une aubaine", () => {
    let s = emptyStack();
    for (let i = 0; i < MAX_VISIBLE; i += 1) s = push(s, { label: `E${i}`, kind: "info" });
    s = push(s, { label: "Aubaine", kind: "gain", priority: 0 });
    s = push(s, { label: "Jalon", kind: "gain", priority: 10 });
    s = tickOutcomes(s, T0 + LIFE_MS + 1);
    expect(s.visible[0].label).toBe("Jalon");
  });

  it("ne chasse JAMAIS un toast déjà à l'écran", () => {
    // Évincer une entrée en cours d'animation se lit comme un bug d'affichage.
    let s = emptyStack();
    for (let i = 0; i < MAX_VISIBLE; i += 1) s = push(s, { label: `E${i}`, kind: "info" });
    const avant = s.visible.map((f) => f.label);
    s = push(s, { label: "Urgent", kind: "gain", priority: 99 });
    expect(s.visible.map((f) => f.label)).toEqual(avant);
  });
});

describe("annonce aria-live", () => {
  it("annonce une NOUVELLE entrée à l'écran", () => {
    expect(push(emptyStack(), { label: "Palier", kind: "gain" }).announce).toBe("Palier");
  });

  it("n'annonce RIEN sur une fusion : sinon le lecteur d'écran radote", () => {
    let s = push(emptyStack(), { label: "Palier", kind: "gain" });
    s = push(s, { label: "Palier", kind: "gain" });
    expect(s.announce).toBe("");
  });

  it("n'annonce rien pour une entrée mise en file, seulement à sa promotion", () => {
    let s = emptyStack();
    for (let i = 0; i < MAX_VISIBLE; i += 1) s = push(s, { label: `E${i}`, kind: "info" });
    s = push(s, { label: "Attente", kind: "info" });
    expect(s.announce).toBe("");
    s = tickOutcomes(s, T0 + LIFE_MS + 1);
    expect(s.announce).toBe("Attente");
  });

  it("n'annonce rien quand un toast expire simplement", () => {
    let s = push(emptyStack(), { label: "A", kind: "info" }, T0);
    s = tickOutcomes(s, T0 + LIFE_MS + 1);
    expect(s.announce).toBe("");
  });
});

describe("vieillissement", () => {
  it("un toast disparaît après sa durée de vie", () => {
    let s = push(emptyStack(), { label: "A", kind: "info" }, T0);
    expect(tickOutcomes(s, T0 + LIFE_MS - 1).visible).toHaveLength(1);
    expect(tickOutcomes(s, T0 + LIFE_MS + 1).visible).toHaveLength(0);
  });

  it("une entrée promue démarre sa vie à la promotion, pas à son arrivée", () => {
    let s = emptyStack();
    for (let i = 0; i < MAX_VISIBLE + 1; i += 1) s = push(s, { label: `E${i}`, kind: "info" }, T0);
    const promu = T0 + LIFE_MS + 1;
    s = tickOutcomes(s, promu);
    expect(s.visible).toHaveLength(1);
    expect(s.visible[0].expiresAt).toBe(promu + LIFE_MS);
  });

  it("la pile finit vide, sans fuite de file", () => {
    let s = emptyStack();
    for (let i = 0; i < 30; i += 1) s = push(s, { label: `E${i}`, kind: "info" }, T0);
    let now = T0;
    for (let i = 0; i < 20; i += 1) { now += LIFE_MS + 1; s = tickOutcomes(s, now); }
    expect(stackIsEmpty(s)).toBe(true);
  });
});
