"use strict";

// L'ARBRE D'ARTEFACTS de la Maison (Phase 4) — des LIGNÉES en ÉCHELLE : on achète
// les rangs dans l'ordre (le rang N exige le rang N-1 acquis). Tout reste
// DÉCOUPLÉ (aucun lien à la Rupture — arbitrage Raph). Chaque lignée enchaîne des
// refontes de RISQUE (profils, pas des sticks de stats) puis son AUTOMATISATION en
// capstone. La Bénédiction reste HORS lignées (consommable).
// Lot 1 des gains « vrai casino » (2026-10-04) : plus AUCUN rang n'achète des
// chances — dés pipés, dé d'ivoire, ailes cirées, planches du graveur et Coffres
// ont disparu (remboursés) ; le double et la refente du 21 sont des règles de base.
//
// kinds :
//   'level'      — augment à niveaux (state.styletLevel), coût géométrique
//   'artifact'   — refonte booléenne (state.templeArtifacts[id]), coût fixe
//   'automation' — capstone : débloque templeAuto[game] (moteur Phase 3)

import {
  STYLET_MAX_LEVEL,
  STYLET_COST_BASE, STYLET_COST_GROWTH,
  ARTIFACT_NOYE_COST, ARTIFACT_PLUMES_COST, ARTIFACT_SOLAIRES_COST,
  ARTIFACT_ECHELLE_COST, ARTIFACT_INTERDIT_COST,
  ARTIFACT_SOUFFLE_COST, ARTIFACT_SERRES_COST, ARTIFACT_COLOMBIER_COST,
  ARTIFACT_COIN_COST, ARTIFACT_RELANCE_COST,
  ARTIFACT_VOIX_COST, ARTIFACT_MESURE_COST,
  AUTO_OSSELETS_UNLOCK_COST, AUTO_ICARUS_UNLOCK_COST,
  AUTO_SCRATCH_UNLOCK_COST, AUTO_BLACKJACK_UNLOCK_COST,
  AUGURY_DOUBLE_MAX_CRANS,
  RELIC_CHAR_COST, RELIC_CORNE_COST, RELIC_OEIL_COST,
  ICARUS_CAP_SOLAR,
  MAISON_RANKS
} from '../core/balance.js';

export const ARTIFACT_LINEAGES = [
  {
    id: "osselets",
    icon: "🎲",
    label: { fr: "Osselets", en: "Knucklebones" },
    subtitle: { fr: "la chance des dés · Ère II", en: "the luck of the dice · Era II" },
    nodes: [
      {
        // ⚠ 2026-07-17 : il multipliait la part de la MISE versée à la cagnotte (ce qui
        // faisait imprimer la table à 133,4 %) ; il multiplie désormais le RECYCLE de
        // l'edge, clampé par TEMPLE_POT_RECYCLE_CAP. L'effet ressenti est le même (la
        // cella s'engraisse bien plus vite) mais l'invariant tient. Le texte dit
        // maintenant la contrainte que la table subissait en silence : les osselets
        // versent et ne reprennent JAMAIS — c'est ce qui rendait l'achat illisible.
        id: "noye", kind: "artifact", cost: ARTIFACT_NOYE_COST,
        label: { fr: "Osselet du noyé", en: "Drowned bone" },
        desc: {
          fr: "Tes revers aux osselets versent bien plus au trésor du temple. Cette table ne le rafle jamais : il se prend au Vol d'Icare.",
          en: "Your knucklebones losses pay far more into the temple hoard. This table never sweeps it: it is taken at the Flight of Icarus."
        }
      },
      {
        // EV exactement nulle à chaque cran (p = 0.5, gain = +wager) : enchaîner ne
        // déplace pas le RTP d'un dixième, A8/A9 intacts par construction. C'est un
        // achat de DÉCISION : le seul pari non taxé du temple devient chaînable.
        id: "echelle", kind: "artifact", cost: ARTIFACT_ECHELLE_COST,
        label: { fr: "L'Échelle de Vénus", en: "The Ladder of Venus" },
        desc: {
          fr: `Le quitte ou double s'enchaîne jusqu'à ${AUGURY_DOUBLE_MAX_CRANS} fois. Chaque marche remet tout en jeu.`,
          en: `Double or nothing can be chained up to ${AUGURY_DOUBLE_MAX_CRANS} times. Each step stakes everything again.`
        }
      },
      {
        // Pur achat de VARIANCE (spread 2.5) : la normalisation égalise le RTP,
        // seules les queues gonflent. La garde vit dans castAugury (moteur).
        id: "interdit", kind: "artifact", cost: ARTIFACT_INTERDIT_COST,
        label: { fr: "Le rite interdit", en: "The forbidden rite" },
        desc: {
          fr: "Ouvre un quatrième rite : mise lourde, Vénus abondantes, et le Chien règne sur les revers.",
          en: "Opens a fourth rite: heavy stake, abundant Venus, and the Dog rules the setbacks."
        }
      },
      {
        id: "autoOsselets", kind: "automation", game: "osselets", cost: AUTO_OSSELETS_UNLOCK_COST,
        label: { fr: "Osselets sacrés", en: "Sacred knucklebones" },
        desc: { fr: "Débloque l'auto-lancé : le temple joue les osselets tout seul, selon tes réglages. Coûte en moyenne plus qu'il ne rapporte.", en: "Unlocks auto-cast: the temple plays the knucklebones on its own, at your settings. Costs more than it pays on average." }
      }
    ]
  },
  {
    id: "icarus",
    icon: "🪽",
    label: { fr: "Icare", en: "Icarus" },
    subtitle: { fr: "le vol · Ère III", en: "the flight · Era III" },
    nodes: [
      {
        // Rang 2 et pas rang 6 (déplacé le 2026-07-17) : une bouteille de CONFORT à
        // 200 n'a rien à faire derrière les serres à 550, et son utilité est
        // maximale TÔT — c'est quand les billets de vol commencent à tomber qu'une
        // file pleine en gaspille. L'échelle devient strictement croissante :
        // 90 → 200 → 380 → 450 → 520 → 550 → capstone.
        id: "colombier", kind: "artifact", cost: ARTIFACT_COLOMBIER_COST,
        label: { fr: "Le colombier du guetteur", en: "The watcher's dovecote" },
        desc: {
          fr: "La file des vols offerts passe de 5 à 8, et le guetteur note 24 vols au lieu de 12.",
          en: "The free flight queue grows from 5 to 8, and the watcher records 24 flights instead of 12."
        }
      },
      {
        // ⚠ 2026-07-17 : la consolation est PRÉLEVÉE SUR LA CAGNOTTE, elle n'est plus
        // créée. Avant, elle mintait round(mise × 0.5) à chaque crash hors de tout
        // paiement, et P(crash) → 1 quand la cible monte : c'était le poste le plus
        // lourd de l'imprimante (+51 pts à ×50, devant la cagnotte). L'artefact est
        // vendu 380 Faveur : le changement de contrat DOIT être dit, d'où la 2e phrase.
        id: "plumes", kind: "artifact", cost: ARTIFACT_PLUMES_COST,
        label: { fr: "Plumes de secours", en: "Rescue feathers" },
        desc: {
          fr: "Chaque chute reprend une part de ta mise au trésor du temple. Une cella vide ne rend rien : le filet est tissé de tes revers passés.",
          en: "Every fall takes part of your stake back from the temple hoard. An empty cella gives nothing: the net is woven from your past losses."
        }
      },
      {
        // Transfert PUR (drawFromPot) : la consolation sort de la cella, jamais du
        // néant — c'est pour ça qu'elle peut monter à 0.7 sans toucher A9.
        id: "souffle", kind: "artifact", cost: ARTIFACT_SOUFFLE_COST,
        label: { fr: "Le second souffle", en: "The second wind" },
        desc: {
          fr: "Chaque chute reprend une part plus grande de ta mise au trésor du temple. Une cella vide ne rend toujours rien.",
          en: "Every fall takes a larger share of your stake back from the temple hoard. An empty cella still gives nothing."
        }
      },
      {
        id: "solaires", kind: "artifact", cost: ARTIFACT_SOLAIRES_COST,
        label: { fr: "Ailes solaires", en: "Solar wings" },
        desc: { fr: `Relève le plafond du multiplicateur de ×100 à ×${ICARUS_CAP_SOLAR}.`, en: `Raises the multiplier cap from ×100 to ×${ICARUS_CAP_SOLAR}.` }
      },
      {
        // SORTIE de pot uniquement : la sortie ne change pas le RTP long terme
        // (démontré, cf. templePot.js) — les serres vendent du TEMPO.
        id: "serres", kind: "artifact", cost: ARTIFACT_SERRES_COST,
        label: { fr: "Les serres", en: "The talons" },
        desc: {
          fr: "Frôler le soleil emporte une part de cagnotte moitié plus grande, à mise égale.",
          en: "Grazing the sun takes a half larger share of the pot, at equal stake."
        }
      },
      {
        id: "autoIcare", kind: "automation", game: "icarus", cost: AUTO_ICARUS_UNLOCK_COST,
        label: { fr: "Ailes d'aigle", en: "Eagle wings" },
        desc: { fr: "Débloque l'autopush : le temple fait voler Icare tout seul, au multiplicateur cible que tu fixes.", en: "Unlocks autopush: the temple flies Icarus on its own, at the target multiplier you set." }
      }
    ]
  },
  {
    id: "gratteux",
    icon: "🎟️",
    label: { fr: "Tickets", en: "Tickets" },
    subtitle: { fr: "le vernis · Ère II", en: "the varnish · Era II" },
    nodes: [
      {
        // Augment de GESTE, zéro impact math : le rayon de base a été durci
        // (13/11/9) et le stylet revend le confort, sous l'ancien rayon même au max.
        id: "stylet", kind: "level", levelField: "styletLevel", maxLevel: STYLET_MAX_LEVEL, costBase: STYLET_COST_BASE, costGrowth: STYLET_COST_GROWTH,
        label: { fr: "Stylet du sacristain", en: "Sacristan's stylus" },
        desc: { fr: "Un stylet mieux taillé : chaque niveau élargit le grattoir.", en: "A better cut stylus: each level widens the scratcher." }
      },
      {
        // Info PURE : la grille est peinte APRÈS le tirage (scratchGrid est
        // cosmétique), donc dévoiler une case ne change RIEN à l'issue.
        id: "coin", kind: "artifact", cost: ARTIFACT_COIN_COST,
        label: { fr: "Le coin décollé", en: "The lifted corner" },
        desc: {
          fr: "Une case de chaque ticket arrive déjà dégagée. Le vernis a ses faiblesses.",
          en: "One cell of every ticket comes already cleared. The varnish has its weaknesses."
        }
      },
      {
        // TRANSFERT (drawFromPot, strict) : la cella paie la mise entière ou rien.
        // A9-neutre par construction, et le pot gagne un sens pour ce jeu qui le
        // nourrit sans jamais le reprendre.
        id: "relance", kind: "artifact", cost: ARTIFACT_RELANCE_COST,
        label: { fr: "L'offrande recopiée", en: "The copied offering" },
        desc: {
          fr: "Un ticket perdant peut être rejoué une fois : le trésor du temple paie la mise, s'il la couvre en entier.",
          en: "A losing ticket can be replayed once: the temple hoard pays the stake, if it covers it in full."
        }
      },
      {
        id: "autoGratteux", kind: "automation", game: "gratteux", cost: AUTO_SCRATCH_UNLOCK_COST,
        label: { fr: "Le sacristain gratte", en: "The sacristan scratches" },
        desc: {
          fr: "Débloque l'auto-gratteux : le temple achète et racle les tickets tout seul, à la mise et au tempo que tu règles.",
          en: "Unlocks auto-scratch: the temple buys and scrapes tickets on its own, at the stake and tempo you set."
        }
      }
    ]
  },
  {
    id: "vingtetun",
    icon: "🃏",
    label: { fr: "Vingt-et-un", en: "Twenty-one" },
    subtitle: { fr: "la mesure · Ère III", en: "the measure · Era III" },
    nodes: [
      {
        // Zéro math : un compteur et des répliques. Le temple compte les défaites
        // (Clémence) ; la Voix compte enfin les victoires.
        id: "voix", kind: "artifact", cost: ARTIFACT_VOIX_COST,
        label: { fr: "La voix de l'oracle", en: "The oracle's voice" },
        desc: {
          fr: "L'oracle se souvient de tes séries et te parle. Il ne compte que les mains jouées de ta main.",
          en: "The oracle remembers your streaks and speaks to you. It only counts hands played by your own hand."
        }
      },
      {
        // Info PURE : le conseil affiche basicAction. Le naïf joue à 93 %, la
        // mesure (avec le double) à 98,3 % : cet artefact vend ~5 pts de RTP en pure
        // information, sans toucher une constante — c'est de l'habileté, pas de la
        // chance achetée.
        id: "mesure", kind: "artifact", cost: ARTIFACT_MESURE_COST,
        label: { fr: "La mesure gravée", en: "The graven measure" },
        desc: {
          fr: "Le fronton conseille chaque main : tirer, rester ou doubler, comme la mesure l'exige.",
          en: "The pediment advises every hand: hit, stand or double, as the measure demands."
        }
      },
      {
        id: "autoVingtEtUn", kind: "automation", game: "vingtetun", cost: AUTO_BLACKJACK_UNLOCK_COST,
        label: { fr: "L'oracle joue seul", en: "The oracle plays alone" },
        desc: {
          fr: "Débloque l'auto-vingt-et-un : la Maison joue la mesure à ta place, double quand il faut, ne refend jamais. Les séries restent à ta main.",
          en: "Unlocks auto-twenty-one: the House plays the measure for you, doubles when it should, never splits. Streaks stay in your own hand."
        }
      }
    ]
  },
  {
    // LE TRÉSOR (2026-07-17, arbitrage Raphaël) : les Reliques, puits légendaires
    // qui paient dans la CITÉ (les jeux financent la production). Les Coffres qui
    // ouvraient la lignée ont disparu au lot 1 (la limite des tables suit les
    // recettes de la Maison).
    id: "tresor",
    icon: "🏺",
    label: { fr: "Le Trésor", en: "The Treasury" },
    subtitle: { fr: "les reliques · Ère III", en: "the relics · Era III" },
    nodes: [
      {
        id: "char", kind: "artifact", cost: RELIC_CHAR_COST,
        label: { fr: "Le Char du Soleil", en: "The Chariot of the Sun" },
        desc: { fr: "La Bénédiction ne s'éteint plus jamais : la production de la cité reste élevée à demeure.", en: "The Blessing never fades again: the city's production stays raised for good." }
      },
      {
        id: "corne", kind: "artifact", cost: RELIC_CORNE_COST,
        label: { fr: "La Corne du temple", en: "The temple Horn" },
        desc: { fr: "La production entière de la cité est doublée, pour toujours.", en: "The city's entire production is doubled, forever." }
      },
      {
        id: "oeil", kind: "artifact", cost: RELIC_OEIL_COST,
        label: { fr: "L'Œil d'or", en: "The Golden Eye" },
        desc: { fr: "La production entière de la cité est quadruplée, pour toujours.", en: "The city's entire production is quadrupled, forever." }
      }
    ]
  }
];

// Les CADEAUX DE RANG (lot 2 des gains « vrai casino ») : ces nœuds ne s'achètent
// plus, la Maison les offre au titre indiqué (MAISON_RANKS, balance.js). `gift` =
// l'index du titre qui les offre ; l'échelle d'achat les saute.
export const RANK_OF_GIFT = Object.fromEntries(MAISON_RANKS.flatMap((rk, r) => rk.gifts.map((id) => [id, r])));
for (const lin of ARTIFACT_LINEAGES) {
  for (const n of lin.nodes) if (RANK_OF_GIFT[n.id] != null) n.gift = RANK_OF_GIFT[n.id];
}

// Index id → node (avec sa lignée). Utilisé par le dispatcher d'achat.
export const ARTIFACT_NODES = {};
for (const lin of ARTIFACT_LINEAGES) {
  for (const n of lin.nodes) ARTIFACT_NODES[n.id] = { ...n, lineage: lin.id };
}
