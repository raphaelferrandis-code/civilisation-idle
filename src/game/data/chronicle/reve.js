// LE RÉVEIL (docs/PLAN-ECOUTER-PARLER.md, lot 7, § 7.5) : la première cité d'un monde
// refait par un Grand Reset (conditionType "reve", chronicleEvaluator.js). Au camp, on a
// rêvé de l'ancienne ville ; Claude reconnaît le foyer ; une braise que personne n'a
// laissée. La gazette n'en sait pas plus que les habitants : ni sceau, ni joueur.

export const chronicleReve = [
  {
    id: "p1_reve_camp",
    period: 1,
    conditionType: "reve",
    title: { fr: "TOUT LE CAMP A FAIT LE MÊME RÊVE", en: "THE WHOLE CAMP HAD THE SAME DREAM" },
    text: { fr: "« Cette nuit, chacun a rêvé d'une ville immense, puis d'une lumière qui s'éteignait. Au réveil, le feu brûlait déjà. »", en: "\"Last night everyone dreamt of a vast city, then of a light going out. When they woke, the fire was already burning.\"" },
    author: null
  },
  {
    id: "p1_reve_foyer",
    period: 1,
    conditionType: "reve",
    title: { fr: "LE GARDIEN DU FEU RECONNAÎT LE FOYER", en: "THE FIRE KEEPER RECOGNISES THE HEARTH" },
    text: { fr: "« Claude reconnaît chaque pierre du foyer. Il dit qu'il a posé une question, avant, et qu'il a rêvé de la réponse. »", en: "\"Claude recognises every stone of the hearth. He says he asked a question, before, and dreamt the answer.\"" },
    author: { fr: "Edith, comptable", en: "Edith, accountant" }
  },
  {
    id: "p2_reve_braise",
    period: 2,
    conditionType: "reve",
    title: { fr: "UNE BRAISE QUE PERSONNE N'A LAISSÉE", en: "AN EMBER NOBODY LEFT" },
    text: { fr: "« Au matin du premier jour, le foyer gardait une braise. Personne ne l'avait couverte. Claude l'a ranimée sans rien dire. »", en: "\"On the morning of the first day, the hearth held an ember. Nobody had banked it. Claude brought it back to life without a word.\"" },
    author: null
  }
];
