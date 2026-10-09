// ── LES FENÊTRES DES BÂTIMENTS-MOTEUR, RELEVÉES À LA MAIN ────────────────────
// 2026-10-03 (Raph : « les lumières arrivent n'importe où sur les bâtiments, il faut les
// reprendre une par une »). Même relevé que les maisons (houseWindowsData.js) pour les
// scènes médiévales, romaines et XIXe que sceneWindows.js allumait au détecteur de taches
// sombres (retiré) : chaque fenêtre est posée sur l'art, dessin par dessin, version « -grand »
// comprise (c'est un autre dessin).
//
// Une fenêtre = une suite de rectangles [x, y, w, h, …] en pixels du PNG
// (public/pixelart/agents/buildings/<clé>.png). Ce qui est dedans s'allume en entier ;
// portes, arcades, portiques, étals, baies de chargement, enseignes et colombages restent
// éteints. Une liste vide = un bâtiment sans vitre (il reste noir la nuit, et c'est voulu).
// Les 113 dessins sont relevés ; la garde exige un relevé pour chaque dessin de la liste
// des fenêtres sombres (une clé absente n'allumerait rien).
//
// ⚠ Redessiner un sprite = relever ses fenêtres à nouveau : la garde
// (__tests__/sceneWindows.test.js) vérifie que chaque rectangle tombe sur l'encre.
export const SCENE_WINDOWS_DATA = {
  // Atelier de la monnaie : les deux fenêtres du pignon ; porte, emblème et appentis
  // éteints.
  'mint-prop-house': [
    [19, 56, 1, 7, 20, 56, 1, 8, 21, 57, 1, 3, 21, 61, 1, 3, 22, 57, 1, 9],
    [42, 65, 1, 4, 42, 70, 1, 2, 43, 66, 1, 9, 44, 67, 1, 2, 44, 71, 1, 1, 45, 68, 1, 8],
  ],
  // Idem, grand, et la fenêtre du flanc.
  'mint-prop-house-grand': [
    [39, 90, 1, 13, 40, 90, 1, 5, 40, 97, 1, 7, 41, 91, 1, 5, 41, 98, 1, 6, 42, 91, 1, 6, 42, 98, 1, 6, 43, 92, 1, 3, 43, 96, 1, 2, 43, 101, 1, 2, 43, 105, 1, 1, 44, 92, 1, 7, 44, 100, 1, 6, 45, 94, 1, 2, 45, 97, 1, 2, 45, 100, 1, 6, 46, 98, 1, 11],
    [78, 108, 1, 5, 78, 121, 1, 1, 79, 108, 1, 14, 80, 109, 1, 13, 81, 109, 1, 5, 81, 115, 1, 8, 82, 110, 1, 3, 82, 119, 1, 1, 82, 121, 1, 2, 83, 110, 1, 3, 83, 114, 1, 1, 83, 119, 1, 4, 84, 111, 1, 14],
    [106, 110, 1, 6, 107, 110, 1, 9, 108, 110, 1, 10, 109, 111, 1, 5, 109, 117, 1, 2, 110, 111, 1, 8, 111, 111, 1, 9],
  ],
  // Moneta : panneaux de bois sans vitre — éteinte.
  'mint-moneta': [],
  // Idem, grand.
  'mint-moneta-grand': [],
  // Tour de guet : les 2 fenêtres du fût (face éclairée, face à l'ombre) ; créneaux,
  // embrasure du parapet et porte éteints.
  'watch-stone': [
    [32, 49, 2, 4, 34, 50, 2, 3], [52, 50, 1, 4, 53, 49, 4, 5],
  ],
  // Tribunal : 3 baies géminées de la tour, la lancette de l'aile gauche, la baie du porche
  // (posée sur un socle : pas une porte), 2 lancettes de l'aile à l'ombre ; horloge,
  // abat-sons, remplage au-dessus du portail et portail éteints.
  'courthouses-tribunal': [
    [51, 30, 4, 6], [52, 40, 3, 5], [45, 40, 3, 5], [36, 53, 3, 11], [58, 62, 1, 9, 59, 61, 2, 10],
    [72, 60, 3, 11], [80, 57, 3, 12],
  ],
  // Idem, grand : 3 baies géminées de la tour, lancette de l'aile gauche, baie géminée du
  // porche, 2 lancettes de l'aile à l'ombre ; horloge, abat-sons, remplage aveugle et
  // portail éteints.
  'courthouses-tribunal-grand': [
    [75, 53, 5, 8], [66, 68, 4, 9], [78, 70, 2, 8, 81, 68, 2, 10], [51, 94, 4, 19],
    [93, 110, 1, 17, 94, 106, 2, 21, 96, 110, 1, 17],
    [114, 109, 1, 17, 115, 107, 1, 19, 116, 106, 1, 20, 117, 105, 1, 21, 118, 106, 1, 20, 119, 107, 1, 19],
    [130, 103, 2, 19, 132, 101, 2, 21],
  ],
  // Chantier : un hangar ouvert sans vitre — la halle béante, l'ouverture du palan dans le
  // toit et la grue restent éteintes.
  'works-yard': [],
  // Palais des ministères : les meurtrières du donjon, 2 fenêtres du pignon blanc ; les
  // bannières bleu et or des tours (étoffe, pas vitrail), créneaux et porte fortifiée
  // restent éteints.
  'ministries-palace': [
    [50, 25, 1, 3], [60, 28, 1, 4], [67, 29, 1, 3], [44, 39, 1, 2], [44, 43, 1, 5, 45, 44, 1, 3],
  ],
  // Idem, grand : 4 meurtrières du donjon, une de la tour droite, 2 fenêtres du pignon ;
  // bannières armoriées, créneaux, mâchicoulis et porte éteints.
  'ministries-palace-grand': [
    [76, 46, 2, 6], [95, 54, 2, 5], [108, 53, 2, 6], [125, 46, 1, 4], [66, 73, 2, 4],
    [66, 81, 2, 6], [105, 112, 1, 4],
  ],
  // Loge des ruines : la fenêtre cintrée sur appui, à droite ; l'arche-porte béante à
  // gauche, la cheminée et l'échafaudage restent éteints.
  'ruins-lodge': [
    [52, 54, 1, 9, 53, 55, 2, 8, 55, 56, 1, 7],
  ],
  // Idem, grand : la fenêtre cintrée sur appui ; arche-porte, cheminée, grue et échafaudage
  // éteints.
  'ruins-lodge-grand': [
    [78, 99, 1, 15, 79, 98, 1, 16, 80, 97, 4, 17, 84, 98, 2, 16],
  ],
  // Mausolée : la lunette de la voûte et la fenêtre cintrée du flanc ; la porte de bronze
  // et le brasero (déjà allumé, peint) restent tels quels.
  'cult-mausoleum': [
    [43, 17, 4, 6], [64, 38, 7, 11],
  ],
  // Idem, grand : 4 lucarnes, les fenêtres à guillotine des deux ailes, la baie cintrée et
  // les deux triplets du pignon central, la baie cintrée et la grande fenêtre du pignon
  // droit ; porche à fronton éteint.
  'universities-collegiate-grand': [
    [37, 67, 5, 11], [49, 71, 5, 13], [37, 87, 5, 12], [49, 93, 5, 12], [38, 50, 4, 8],
    [50, 57, 4, 7], [75, 40, 3, 6], [72, 68, 5, 10], [67, 86, 2, 12], [72, 85, 4, 11],
    [78, 88, 3, 10], [67, 105, 3, 9], [72, 105, 5, 12], [78, 108, 3, 11], [95, 69, 5, 7],
    [95, 86, 4, 11], [95, 107, 4, 11], [117, 63, 6, 9], [115, 79, 6, 12], [134, 53, 5, 6],
    [134, 66, 5, 14], [134, 89, 6, 12],
  ],
  // Atelier des travaux (XIXe) : 3 fenêtres à verre orangé ; la porte ouverte éclairée
  // (peinte) et la porte de bois restent éteintes, comme toute porte.
  'works-industrial': [
    [24, 34, 3, 8], [33, 40, 3, 7], [66, 55, 3, 8],
  ],
  // Idem, grand : 4 fenêtres cintrées du long pan, la lucarne, la grande baie et les 2
  // fenêtres du pignon ; œil-de-bœuf aveugle et porte éteints.
  'works-industrial-grand': [
    [28, 72, 7, 21], [45, 76, 8, 26], [63, 90, 8, 22], [81, 95, 8, 25], [61, 66, 7, 10],
    [125, 82, 9, 22], [142, 90, 5, 19], [112, 104, 7, 20],
  ],
  // Temple de Vesta : aucune vitre — porte close et porte ouverte, foyer sacré peint ; il
  // reste noir la nuit (le feu garde sa lueur propre).
  'cult-vesta': [],
  // Chantier romain : la petite fenêtre de la cabane ; la grue à roue, les blocs et la
  // porte éteints.
  'works-classical': [
    [83, 53, 4, 2],
  ],
  // Idem, grand : la petite fenêtre encadrée de la cabane ; grue, blocs, porte éteints.
  'works-classical-grand': [
    [138, 95, 5, 6],
  ],
  // Temple en restauration : aucune vitre — temple sans toit sous échafaudage, baraque de
  // planches ; il reste noir la nuit.
  'ruins-restoration-roman': [],
  // Idem, grand : aucune vitre — ruine ouverte, échafaudage, cabane de planches ; noir la
  // nuit.
  'ruins-restoration-roman-grand': [],
};

// 2026-10-09 — LA REPRISE DES SPRITES (Codex, repixelisée ; engineOrientKeys.js) a redessiné
// ces bâtiments et leur a donné quatre vues : leurs relevés tombaient à côté et ont été
// retirés (Raph : « on fera le relevé des fenêtres une fois tous les bâtiments refaits »).
// Ils attendent leur relevé, vue par vue (« -fr », « -bl », « -br » comprises) ; la garde
// les attend dans cette liste plutôt que dans les relevés.
export const SCENE_WINDOWS_A_RELEVER = [
  'granary-hall', 'granary-hall-grand', 'guild-house', 'guild-house-grand',
  'bank-house-renaissance', 'bank-house-renaissance-grand', 'market-hall-tent', 'granary-warehouse',
  'granary-warehouse-grand', 'guild-chamber', 'guild-chamber-grand', 'mint-house-steam',
  'mint-house-steam-grand', 'bank-house-neoclassical', 'bank-house-neoclassical-grand', 'granary-horreum-classical',
  'granary-horreum-classical-grand', 'guild-collegium', 'guild-collegium-grand', 'bank-basilica-roman',
  'bank-basilica-roman-grand', 'market-macellum', 'market-macellum-grand', 'storyteller-hall',
  'scribes-scriptorium', 'schools-schoolhouse', 'schools-schoolhouse-grand', 'academies-renaissance',
  'cult-shrine', 'cult-shrine-grand', 'observatories-tower', 'observatories-tower-grand',
  'libraries-monastic', 'libraries-monastic-grand', 'universities-gothic', 'universities-gothic-grand',
  'printing-press-shop', 'printing-press-shop-grand', 'think-chancellery', 'think-chancellery-grand',
  'bureau-chancery', 'bureau-chancery-grand', 'archive-vault', 'archive-vault-grand',
  'storyteller-theater', 'scribes-archive', 'schools-victorian', 'schools-victorian-grand',
  'academies-institute', 'cult-mausoleum-grand', 'libraries-grand', 'libraries-grand-grand',
  'universities-collegiate', 'printing-factory', 'printing-factory-grand', 'think-institute',
  'think-institute-grand', 'watch-industrial', 'sewers-works', 'bureau-office',
  'bureau-office-grand', 'courthouses-neoclassical', 'courthouses-neoclassical-grand', 'ministries-capitol',
  'ministries-capitol-grand', 'archive-records', 'archive-records-grand', 'ruins-institute',
  'ruins-institute-grand', 'storyteller-odeon', 'scribes-tabularium', 'schools-ludus',
  'academies-athenaeum', 'observatories-horologium', 'observatories-horologium-grand', 'libraries-classical',
  'libraries-classical-grand', 'universities-classical', 'universities-classical-grand', 'printing-scriptorium',
  'printing-scriptorium-grand', 'think-stoa-roman', 'think-stoa-roman-grand', 'watch-classical',
  'bureau-tabularium', 'bureau-tabularium-grand', 'courthouses-basilica', 'courthouses-basilica-grand',
  'ministries-curia', 'ministries-curia-grand', 'archive-tabularium', 'archive-tabularium-grand',
];
