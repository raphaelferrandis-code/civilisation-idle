// LES FLACONS DE L'ÉCHOPPE (refonte de la Boutique, maquette V4).
//
// `BOTTLE_POS` : chaque flacon du décor (public/pixelart/boutique/echoppe-neuve.png,
// 400×224), en % de l'image — x/y/w/h = la découpe (public/pixelart/boutique/flacons/),
// cx/cy = son centre, pour le halo. Découpés au pixel, sans agrandissement
// (scratchpad cutBottles.cjs + cutExtra.cjs de la session de refonte) : l'image
// allumée se pose EXACTEMENT sur le flacon peint.
// `BOTTLE_OF` : l'article de la boutique → son flacon. Un article sans flacon
// n'allume rien (il reste dans la liste).
// ⚠ Les quatre derniers flacons (noyé, rite interdit, second souffle, serres)
// viennent de la rangée basse de l'armoire du MILIEU : celle de gauche n'en a que
// 19, pour 23 rangs de jeux.

export const BOTTLE_POS = {
  des_pipes: { x: 13.25, y: 29.911, w: 3.25, h: 9.375, cx: 14.75, cy: 34.38 },
  de_ivoire: { x: 16.75, y: 30.804, w: 2.75, h: 8.482, cx: 18, cy: 34.82 },
  echelle_venus: { x: 20.5, y: 29.911, w: 3.25, h: 9.375, cx: 22, cy: 34.38 },
  osselets_sacres: { x: 24, y: 29.911, w: 3.75, h: 9.375, cx: 25.75, cy: 34.38 },
  ailes_cirees: { x: 12.25, y: 39.286, w: 3.25, h: 8.482, cx: 13.75, cy: 43.3 },
  colombier: { x: 15.75, y: 39.286, w: 2.75, h: 8.482, cx: 17, cy: 43.3 },
  plumes_secours: { x: 19, y: 38.839, w: 3.25, h: 9.375, cx: 20.5, cy: 43.3 },
  ailes_solaires: { x: 22.25, y: 40.179, w: 2.75, h: 7.589, cx: 23.5, cy: 43.75 },
  ailes_aigle: { x: 25, y: 39.286, w: 3.25, h: 8.482, cx: 26.5, cy: 43.3 },
  stylet: { x: 11.75, y: 47.768, w: 3.25, h: 8.482, cx: 13.25, cy: 51.79 },
  planches: { x: 15, y: 47.768, w: 2.75, h: 8.482, cx: 16.25, cy: 51.79 },
  coin_decolle: { x: 18.75, y: 48.661, w: 2.75, h: 7.589, cx: 20, cy: 52.23 },
  offrande: { x: 22, y: 47.768, w: 3.25, h: 8.482, cx: 23.5, cy: 51.79 },
  sacristain: { x: 25.25, y: 47.768, w: 3.25, h: 8.482, cx: 26.75, cy: 51.79 },
  voix_oracle: { x: 11.25, y: 56.696, w: 2.75, h: 7.589, cx: 12.5, cy: 60.27 },
  mesure: { x: 14.25, y: 56.25, w: 3.25, h: 8.482, cx: 15.75, cy: 60.27 },
  double: { x: 17.5, y: 56.696, w: 3.25, h: 7.589, cx: 19, cy: 60.27 },
  refente: { x: 22.75, y: 56.25, w: 3.25, h: 8.482, cx: 24.25, cy: 60.27 },
  oracle_seul: { x: 25.75, y: 56.25, w: 3.75, h: 8.482, cx: 27.5, cy: 60.27 },
  reforme: { x: 42.25, y: 29.911, w: 4.75, h: 11.161, cx: 44.5, cy: 35.27 },
  protocoles: { x: 47.75, y: 29.018, w: 5.75, h: 12.054, cx: 50.5, cy: 34.82 },
  archivistes: { x: 54, y: 30.357, w: 4.75, h: 11.161, cx: 56.25, cy: 35.71 },
  coffres: { x: 41.75, y: 42.857, w: 3.25, h: 9.375, cx: 43.25, cy: 47.32 },
  char_soleil: { x: 45, y: 43.75, w: 2.75, h: 8.482, cx: 46.25, cy: 47.77 },
  corne: { x: 47.75, y: 42.857, w: 3.25, h: 9.375, cx: 49.25, cy: 47.32 },
  oeil_or: { x: 51, y: 43.75, w: 2.75, h: 8.482, cx: 52.25, cy: 47.77 },
  // Les reliques du lot 3 s'allument aux places laissées par les achats retirés au lot 1
  // (Coffres, double, refente, planches) : leurs flacons en sont la recoloration.
  lyre_orphee: { x: 41.75, y: 42.857, w: 3.25, h: 9.375, cx: 43.25, cy: 47.32 },
  miroir_aphrodite: { x: 17.5, y: 56.696, w: 3.25, h: 7.589, cx: 19, cy: 60.27 },
  toison_or: { x: 22.75, y: 56.25, w: 3.25, h: 8.482, cx: 24.25, cy: 60.27 },
  pomme_or: { x: 15, y: 47.768, w: 2.75, h: 8.482, cx: 16.25, cy: 51.79 },
  sebile: { x: 53.75, y: 41.964, w: 4.25, h: 10.268, cx: 55.75, cy: 46.88 },
  reseau_routes: { x: 72.25, y: 29.464, w: 3.75, h: 9.375, cx: 74, cy: 33.93 },
  memoire_cycles: { x: 76.25, y: 29.464, w: 3.75, h: 9.375, cx: 78, cy: 33.93 },
  rite_passage: { x: 80.25, y: 30.357, w: 3.25, h: 8.482, cx: 81.75, cy: 34.38 },
  benediction: { x: 83.25, y: 29.464, w: 3.75, h: 9.375, cx: 85, cy: 33.93 },
  noye: { x: 55.25, y: 53.571, w: 4.25, h: 8.482, cx: 57.25, cy: 57.59 },
  interdit: { x: 52.75, y: 54.464, w: 2.75, h: 7.589, cx: 54, cy: 58.04 },
  souffle: { x: 44.75, y: 54.464, w: 2.75, h: 7.589, cx: 46, cy: 58.04 },
  serres: { x: 47, y: 53.571, w: 3.25, h: 8.482, cx: 48.5, cy: 57.59 },
};

export const BOTTLE_OF = {
  // Osselets
  temple_dice: 'des_pipes',
  temple_ivoire: 'de_ivoire',
  temple_noye: 'noye',
  temple_echelle: 'echelle_venus',
  temple_interdit: 'interdit',
  temple_autoOsselets: 'osselets_sacres',
  // Icare
  temple_wing: 'ailes_cirees',
  temple_colombier: 'colombier',
  temple_plumes: 'plumes_secours',
  temple_souffle: 'souffle',
  temple_solaires: 'ailes_solaires',
  temple_serres: 'serres',
  temple_autoIcare: 'ailes_aigle',
  // Tickets
  temple_stylet: 'stylet',
  temple_graveur: 'planches',
  temple_coin: 'coin_decolle',
  temple_relance: 'offrande',
  temple_autoGratteux: 'sacristain',
  // Vingt-et-un
  temple_voix: 'voix_oracle',
  temple_mesure: 'mesure',
  temple_double: 'double',
  temple_refente: 'refente',
  temple_autoVingtEtUn: 'oracle_seul',
  // Le trésor du temple + la sébile
  temple_coffre: 'coffres',
  temple_char: 'char_soleil',
  temple_corne: 'corne',
  temple_oeil: 'oeil_or',
  temple_lyre: 'lyre_orphee',
  temple_miroir: 'miroir_aphrodite',
  temple_toison: 'toison_or',
  temple_pomme: 'pomme_or',
  temple_autoTronc: 'sebile',
  // Héritage
  reforme_administrative: 'reforme',
  protocoles_urgence: 'protocoles',
  conservateurs_ruines: 'archivistes',
  reseau_routes: 'reseau_routes',
  codex_mythique: 'memoire_cycles',
  rituel_effondrement: 'rite_passage'
};

/** Le flacon d'un article (la bénédiction de la Boutique de Faveur incluse). */
export function bottleOf(wareId) {
  if (BOTTLE_OF[wareId]) return BOTTLE_OF[wareId];
  if (String(wareId).startsWith('faveur_')) return 'benediction';
  return null;
}
