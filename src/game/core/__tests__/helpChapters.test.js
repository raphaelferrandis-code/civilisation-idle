"use strict";
// L'AIDE (Options › Aide) : garde-fous de la table des chapitres.
// Le texte lui-même se relit à la main contre le code ; ce test vérifie ce qui
// casserait SANS BRUIT à l'écran : une langue manquante (tr() retomberait sur
// l'autre), un lieu inconnu (le chapitre ne se fermerait jamais), un raccourci
// renommé (la touche afficherait son identifiant), une icône absente (img vide).

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { HELP_CHAPTERS } from "../../data/helpChapters.js";
import { PLACE_UNLOCKS, placeUnlocked } from "../places.js";
import { SHORTCUT_DEFS } from "../shortcuts.js";
import { resolveIconSrc } from "../../../components/ui/PixelIcon.jsx";

const bilingual = (v) => v && typeof v.fr === "string" && v.fr.trim() && typeof v.en === "string" && v.en.trim();

// Tous les textes d'un chapitre, avec leur emplacement pour un message lisible.
function textsOf(ch) {
  const out = [[`${ch.id}.title`, ch.title], [`${ch.id}.lede`, ch.lede]];
  for (const sec of ch.secs) {
    out.push([`${ch.id}/${sec.h?.fr}.h`, sec.h]);
    for (const it of sec.items) {
      out.push([`${ch.id}/${it.t?.fr}.t`, it.t], [`${ch.id}/${it.t?.fr}.d`, it.d]);
      if (it.tag) out.push([`${ch.id}/${it.t?.fr}.tag`, it.tag]);
    }
  }
  return out;
}

describe("chapitres de l'Aide", () => {
  it("les identifiants sont uniques", () => {
    const ids = HELP_CHAPTERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("chaque texte existe en français ET en anglais", () => {
    const missing = HELP_CHAPTERS.flatMap(textsOf).filter(([, v]) => !bilingual(v)).map(([at]) => at);
    expect(missing).toEqual([]);
  });

  it("chaque chapitre rattaché à un lieu vise un lieu connu", () => {
    const unknown = HELP_CHAPTERS.filter((c) => c.place && !(c.place in PLACE_UNLOCKS)).map((c) => c.id);
    expect(unknown).toEqual([]);
  });

  it("les raccourcis cités existent ({key:id})", () => {
    const ids = new Set(SHORTCUT_DEFS.map((d) => d.id));
    const cited = HELP_CHAPTERS.flatMap(textsOf)
      .flatMap(([, v]) => [v.fr, v.en])
      .flatMap((s) => [...s.matchAll(/\{key:([^}]+)\}/g)].map((m) => m[1]));
    expect(cited.length).toBeGreaterThan(0);
    expect(cited.filter((id) => !ids.has(id))).toEqual([]);
  });

  it("les icônes existent aux tailles demandées par HelpBook (24 et 48)", () => {
    const pub = resolve(__dirname, "../../../../public");
    const icons = [...new Set([...HELP_CHAPTERS.map((c) => c.icon), "glyphs/verrou"])];
    const absent = icons.flatMap((name) => [24, 48].map((px) => resolveIconSrc(name, "", px)))
      .filter((src) => !existsSync(resolve(pub, "." + src)));
    expect(absent).toEqual([]);
  });

  it("une partie neuve n'ouvre que les chapitres sans lieu à découvrir", () => {
    // Toute première partie, rien de dévoilé : la Régulation, l'Effondrement et
    // les Plaisirs restent fermés, comme leurs onglets.
    const fresh = { cycles: 0, grandResetCount: 0, faveur: 0, onboarding: { reveal: {} } };
    const open = HELP_CHAPTERS.filter((c) => !c.place || placeUnlocked(fresh, c.place)).map((c) => c.id);
    expect(open).toEqual(["bref", "cite", "chronique"]);
  });
});
