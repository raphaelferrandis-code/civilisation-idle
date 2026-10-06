"use strict";

// EXPORT DES SUCCÈS POUR LE SITE STEAMWORKS (audit 2026-10-05, STEAM-9).
// Fabrique, depuis la liste du jeu (achievements.js), les deux fichiers rangés dans
// docs/steam/ : succes.json (la référence, langues au nom Steam « french » /
// « english ») et succes.csv (à ouvrir dans un tableur). Écrits par
// `node scripts/exportSteamAchievements.mjs` ; un test vérifie qu'ils suivent la
// liste (achievements.test.js). N'est importé que par ce script et ce test : le jeu
// n'en embarque rien.

import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS } from './achievements.js';

const groupLabel = (id) => {
  const g = ACHIEVEMENT_GROUPS.find((x) => x.id === id);
  return g ? g.label : { fr: id, en: id };
};

// Les deux icônes 64×64 à téléverser (scripts/bakeAchievementIcons.cjs), en chemin
// depuis la racine du dépôt : « Achieved » en couleur, « Unachieved » en gris.
const iconPath = (id, gray) => `public/pixelart/ui/achievements/${id}${gray ? "-gris" : ""}.png`;

// Une ligne par succès, dans l'ordre du jeu.
export function steamAchievementRows() {
  return ACHIEVEMENTS.map((a) => ({
    apiName: a.id,
    group: a.group,
    groupLabel: groupLabel(a.group),
    hidden: Boolean(a.secret),
    name: { french: a.name.fr, english: a.name.en },
    description: { french: a.desc.fr, english: a.desc.en },
    icon: iconPath(a.id, false),
    iconGray: iconPath(a.id, true)
  }));
}

export function steamAchievementsJson() {
  const rows = steamAchievementRows();
  const payload = {
    source: "src/game/data/achievements.js",
    generatedBy: "node scripts/exportSteamAchievements.mjs",
    count: rows.length,
    achievements: rows.map((r) => ({
      apiName: r.apiName,
      group: r.group,
      hidden: r.hidden,
      name: r.name,
      description: r.description,
      icon: r.icon,
      iconGray: r.iconGray
    }))
  };
  return JSON.stringify(payload, null, 2) + "\n";
}

// CSV (RFC 4180, champs entre guillemets), précédé d'un BOM : le tableur reconnaît
// alors l'UTF-8 (accents, guillemets « »).
export function steamAchievementsCsv() {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ["api_name", "famille", "cache", "nom_fr", "description_fr", "name_en", "description_en", "icone", "icone_grise"];
  const lines = [head.map(q).join(",")];
  for (const r of steamAchievementRows()) {
    lines.push([r.apiName, r.groupLabel.fr, r.hidden ? "oui" : "non", r.name.french, r.description.french, r.name.english, r.description.english, r.icon, r.iconGray].map(q).join(","));
  }
  return "\uFEFF" + lines.join("\n") + "\n";
}
