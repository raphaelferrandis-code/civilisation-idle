"use strict";
// Porte anti-régression i18n (audit 2026-07, plan §A.5) : importer chaque module
// de données qui appelle localizeData() au chargement peuple i18nMissingEn avec
// toute unité { fr } rencontrée SANS son { en } (repli FR silencieux en mode EN).
// Le test échoue si un tel oubli subsiste → attrape les migrations partielles.

import { describe, it, expect } from "vitest";
import { i18nMissingEn } from "../i18n.js";

// Ces imports DÉCLENCHENT le localizeData(...) de chaque module → alimentent
// i18nMissingEn avant l'exécution du test. Liste = tous les consommateurs de
// localizeData (grep). À COMPLÉTER si un nouveau module de données en appelle un.
import "../../data/activeRuins.js";
import "../../data/boons.js";
import "../../data/buildings.js";
import "../../data/chronicleArticles.js";
import "../../data/epitaphs.js";
import "../../data/eraThemes.js";
import "../../data/myths.js";
import "../../data/olympus.js";
import "../../data/regulationActions.js";
import "../../data/upgrades.js";
import "../../data/world.js";
import "../chronicleEvaluator.js";
import "../../../components/ui/journalThemes.js";
import "../../../components/views/ruinsTree/branchTheme.js";

describe("i18n — couverture EN des données", () => {
  it("aucune unité { fr } sans son { en } (migration complète)", () => {
    const sample = i18nMissingEn.slice(0, 15).join(" | ");
    expect(i18nMissingEn, `${i18nMissingEn.length} unité(s) FR sans EN. Ex : ${sample}`).toEqual([]);
  });
});
