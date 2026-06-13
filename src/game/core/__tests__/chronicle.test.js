"use strict";
// Garde-fous du système de la Chronique (Les Échos) : cohérence du cast
// récurrent (les variantes d'un même personnage sont des évolutions voulues,
// pas des fautes de frappe) et seuils de déclenchement des articles — du
// contenu de gameplay appelé à beaucoup bouger avec les ~210 articles à venir.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { vi } from "vitest";

import { chronicleArticles } from "../../data/chronicleArticles.js";
import {
  evaluateCondition,
  getPeriod,
  checkAndTriggerChronicleEntries,
  CHRONICLE_COOLDOWN_SEC,
  RERUN_NO_REPEAT_WINDOW
} from "../chronicleEvaluator.js";
import { state, setState, hydrateState } from "../state.js";
import { FIXED_NOW } from "./fixtures.js";

beforeAll(() => {
  vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("Les Échos — cohérence du cast", () => {
  it("Claude n'a qu'une seule signature", () => {
    const claudeSignatures = new Set(
      chronicleArticles
        .map((article) => article.author)
        .filter((author) => typeof author === "string" && author.startsWith("Claude"))
    );
    expect([...claudeSignatures]).toEqual(["Claude, gardien du feu"]);
  });

  it("chaque article a un id unique et les champs requis", () => {
    const ids = new Set();
    for (const article of chronicleArticles) {
      expect(ids.has(article.id), `id dupliqué : ${article.id}`).toBe(false);
      ids.add(article.id);
      expect(article.period).toBeGreaterThanOrEqual(1);
      expect(article.period).toBeLessThanOrEqual(7);
      expect(typeof article.conditionType).toBe("string");
      expect(article.title).toBeTruthy();
      expect(article.text).toBeTruthy();
    }
  });
});

describe("Les Échos — seuils de déclenchement", () => {
  const stateWith = (instability, timeWear) => ({
    instability,
    timeWear,
    food: 0,
    gold: 0,
    knowledge: 0,
    population: 0
  });

  it("crise à partir de 0.75 (instabilité ou usure)", () => {
    expect(evaluateCondition("crise", stateWith(0.75, 0))).toBe(true);
    expect(evaluateCondition("crise", stateWith(0, 0.75))).toBe(true);
    expect(evaluateCondition("crise", stateWith(0.74, 0.74))).toBe(false);
  });

  it("tension dans la fenêtre 0.5–0.75, sans chevaucher la crise", () => {
    expect(evaluateCondition("tension", stateWith(0.5, 0))).toBe(true);
    expect(evaluateCondition("tension", stateWith(0.75, 0))).toBe(false);
    expect(evaluateCondition("tension", stateWith(0.6, 0.8))).toBe(false);
    expect(evaluateCondition("tension", stateWith(0.49, 0))).toBe(false);
  });

  it("usure dans la fenêtre 0.5–0.75, sans chevaucher la crise", () => {
    expect(evaluateCondition("usure", stateWith(0, 0.5))).toBe(true);
    expect(evaluateCondition("usure", stateWith(0, 0.75))).toBe(false);
    expect(evaluateCondition("usure", stateWith(0.8, 0.6))).toBe(false);
  });

  it("paix sous 0.35 sur les deux jauges", () => {
    expect(evaluateCondition("paix", stateWith(0.34, 0.34))).toBe(true);
    expect(evaluateCondition("paix", stateWith(0.35, 0))).toBe(false);
  });

  it("publie une dépêche fraîche puis arme le cooldown de 3 min", () => {
    setState(hydrateState({}));
    state.chronicleCooldown = 0;
    checkAndTriggerChronicleEntries(state, 1);
    expect(state.chronicleEntries).toHaveLength(1);
    const entry = state.chronicleEntries[0];
    expect(entry.isRerun).toBe(false);
    expect(entry.articleId).toBe(entry.id);
    expect(entry.publishedAt).toBe(FIXED_NOW);
    expect(state.chronicleCooldown).toBe(CHRONICLE_COOLDOWN_SEC);
  });

  it("tourne en boucle quand le pool de la période est épuisé (rediffusions)", () => {
    setState(hydrateState({}));
    // Toute la période 1 est déjà parue : plus aucun article frais.
    const period1 = chronicleArticles.filter((art) => art.period === 1);
    state.chronicleEntries = period1.map((art) => ({
      id: art.id,
      articleId: art.id,
      title: art.title,
      text: art.text,
      author: art.author,
      age: "Campement",
      date: "An 1",
      category: "Chronique",
      isNew: false,
      isRerun: false,
      publishedAt: FIXED_NOW - 3_600_000
    }));
    state.chronicleCooldown = 0;

    checkAndTriggerChronicleEntries(state, 1);

    expect(state.chronicleEntries).toHaveLength(period1.length + 1);
    const rerun = state.chronicleEntries[0];
    expect(rerun.isRerun).toBe(true);
    // L'id de parution est unique, l'articleId pointe sur l'article source.
    expect(rerun.id).not.toBe(rerun.articleId);
    expect(period1.some((art) => art.id === rerun.articleId)).toBe(true);
    // La fenêtre anti-répétition écarte les dernières parutions.
    const recent = state.chronicleEntries
      .slice(1, 1 + RERUN_NO_REPEAT_WINDOW)
      .map((e) => e.articleId);
    expect(recent).not.toContain(rerun.articleId);
  });

  it("getPeriod découpe les ères aux frontières attendues", () => {
    expect(getPeriod(0)).toBe(1);
    expect(getPeriod(3)).toBe(1);
    expect(getPeriod(4)).toBe(2);
    expect(getPeriod(8)).toBe(2);
    expect(getPeriod(9)).toBe(3);
    expect(getPeriod(14)).toBe(3);
    expect(getPeriod(15)).toBe(4);
    expect(getPeriod(20)).toBe(4);
    expect(getPeriod(21)).toBe(5);
    expect(getPeriod(26)).toBe(5);
    expect(getPeriod(27)).toBe(6);
    expect(getPeriod(31)).toBe(6);
    expect(getPeriod(32)).toBe(7);
  });
});
