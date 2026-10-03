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
  // Grange : la baie du mur latéral ; portes du pignon éteintes.
  'granary-hall': [
    [79, 57, 2, 11, 81, 56, 1, 12, 82, 56, 1, 9, 83, 57, 1, 4, 83, 62, 1, 2],
  ],
  // Idem, grand.
  'granary-hall-grand': [
    [108, 108, 1, 2, 109, 107, 1, 8, 110, 108, 1, 1, 110, 110, 1, 1, 110, 112, 1, 4, 111, 113, 1, 5, 112, 113, 1, 3, 113, 113, 1, 2],
  ],
  // Maison de guilde : la haute vitre de façade et celle de la face gauche ; colombage gris
  // et arches éteints.
  'guild-house': [
    [44, 57, 1, 12], [24, 50, 1, 13, 25, 52, 1, 10],
  ],
  // Idem, grand : lucarne et deux hautes vitres d'angle.
  'guild-house-grand': [
    [98, 65, 2, 7, 100, 65, 1, 6, 101, 65, 1, 5],
    [44, 94, 1, 1, 46, 88, 1, 1, 47, 89, 2, 1, 48, 92, 1, 1, 49, 81, 1, 2, 49, 85, 1, 5, 49, 91, 1, 3, 49, 95, 1, 10, 50, 98, 1, 1],
    [80, 116, 1, 1, 81, 90, 1, 7, 81, 98, 1, 17, 85, 113, 1, 2, 85, 117, 1, 2, 86, 104, 1, 1, 86, 107, 1, 1, 86, 110, 1, 9],
  ],
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
  // Palais de la banque : 2 rangs de 5 fenêtres, 3 rangs de 2 côté ombre ; arcade éteinte.
  'bank-house-renaissance': [
    [35, 27, 1, 7, 36, 27, 1, 8, 37, 28, 1, 7], [42, 30, 1, 7, 43, 30, 2, 8],
    [49, 32, 1, 7, 49, 40, 1, 1, 50, 32, 1, 9, 51, 33, 1, 7],
    [56, 34, 1, 8, 56, 43, 1, 1, 57, 35, 1, 7, 57, 43, 1, 1, 58, 34, 1, 1, 58, 36, 1, 7],
    [28, 38, 1, 7, 29, 38, 1, 8, 30, 39, 1, 7], [35, 40, 2, 8, 37, 41, 1, 7],
    [42, 43, 1, 4, 42, 49, 1, 1, 43, 43, 1, 5, 44, 45, 1, 5, 45, 43, 1, 1, 45, 46, 1, 4],
    [49, 46, 1, 7, 50, 46, 1, 8, 51, 47, 1, 7],
    [56, 48, 1, 8, 57, 49, 1, 7, 57, 57, 1, 1, 58, 48, 1, 1, 58, 50, 1, 8],
    [72, 35, 1, 1, 72, 37, 1, 6, 73, 34, 1, 9, 74, 34, 1, 8, 74, 43, 1, 1, 75, 35, 1, 7, 75, 43, 1, 1, 76, 41, 1, 1, 76, 43, 1, 1, 77, 34, 1, 6, 77, 41, 1, 1, 77, 43, 1, 1],
    [79, 40, 1, 1, 80, 33, 1, 8, 81, 32, 1, 9, 82, 32, 1, 8, 83, 33, 1, 7],
    [72, 49, 1, 8, 73, 48, 1, 9, 74, 47, 1, 9, 75, 48, 1, 8],
    [80, 46, 1, 9, 81, 45, 1, 10, 82, 45, 1, 9, 83, 46, 1, 8, 84, 53, 1, 1, 85, 45, 1, 9],
    [28, 25, 2, 7, 30, 26, 1, 7],
    [72, 65, 1, 7, 73, 62, 1, 1, 73, 64, 1, 8, 74, 63, 1, 9, 75, 64, 1, 7],
    [80, 63, 1, 7, 81, 60, 1, 10, 82, 61, 1, 8, 83, 62, 1, 7],
  ],
  // Idem, grand ; arcade et blason éteints.
  'bank-house-renaissance-grand': [
    [35, 42, 4, 14], [47, 47, 5, 13], [61, 51, 4, 14], [73, 56, 5, 14], [86, 60, 5, 15],
    [35, 67, 3, 14], [47, 71, 5, 14], [61, 76, 5, 9], [73, 81, 5, 15], [86, 85, 4, 15],
    [115, 60, 8, 16], [130, 57, 7, 15], [116, 85, 7, 17], [130, 81, 7, 17], [115, 113, 8, 17],
    [130, 110, 7, 15],
  ],
  // Halle de marché : aucune vitre lisible — l'étal et la porte restent éteints.
  'market-hall-tent': [],
  // Entrepôt : paires de fenêtres côté éclairé, 4 × 5 côté ombre ; baies de chargement
  // éteintes.
  'granary-warehouse': [
    [26, 27, 2, 8], [30, 28, 3, 8], [85, 31, 2, 6], [80, 32, 2, 6], [50, 33, 3, 7], [75, 33, 2, 6],
    [55, 34, 3, 7], [70, 34, 2, 6], [65, 35, 2, 6], [26, 40, 2, 8], [30, 41, 3, 8], [85, 44, 2, 6],
    [80, 45, 2, 6], [50, 46, 3, 7], [75, 46, 2, 6], [55, 47, 3, 7], [70, 47, 2, 6], [65, 48, 2, 6],
    [26, 53, 2, 8], [30, 54, 3, 8], [85, 57, 2, 6], [80, 58, 2, 6], [50, 59, 3, 7], [75, 59, 2, 6],
    [55, 60, 3, 7], [70, 60, 2, 6], [65, 61, 2, 6], [26, 66, 2, 8], [30, 67, 3, 8], [85, 70, 2, 6],
    [80, 71, 2, 6], [50, 72, 3, 7], [75, 72, 2, 6], [55, 73, 3, 7], [70, 73, 2, 6], [65, 74, 2, 6],
  ],
  // Idem, grand.
  'granary-warehouse-grand': [
    [37, 42, 4, 11], [46, 43, 3, 12], [36, 64, 6, 12], [46, 67, 3, 7], [36, 86, 5, 12],
    [45, 87, 4, 10], [36, 109, 5, 12], [45, 116, 4, 7], [78, 51, 6, 13], [86, 53, 6, 14],
    [78, 74, 6, 13], [86, 76, 6, 13], [78, 97, 6, 13], [86, 99, 6, 12], [78, 120, 6, 13],
    [86, 123, 6, 12], [101, 53, 8, 14], [125, 49, 5, 11], [136, 45, 6, 12], [101, 77, 6, 12],
    [112, 76, 4, 9], [125, 73, 2, 8], [135, 69, 5, 11], [101, 101, 6, 11], [128, 93, 2, 11],
    [136, 90, 6, 10], [101, 122, 7, 14], [112, 122, 5, 11], [128, 117, 2, 11], [135, 114, 7, 11],
    [112, 51, 6, 13], [112, 96, 6, 13],
  ],
  // Chambre des guildes : 4 fenêtres de façade (au-dessus des balcons), 6 côté ombre ;
  // marquise éteinte.
  'guild-chamber': [
    [14, 39, 2, 12, 16, 38, 2, 13, 18, 38, 1, 11],
    [25, 51, 1, 2, 26, 41, 2, 12, 28, 41, 1, 1, 28, 43, 1, 10, 29, 41, 1, 12], [34, 43, 5, 11],
    [44, 44, 5, 9], [59, 47, 4, 10], [72, 47, 1, 3, 72, 52, 1, 2, 73, 47, 3, 11], [81, 45, 3, 10],
    [59, 69, 1, 9, 60, 68, 3, 10], [72, 69, 1, 6, 72, 76, 1, 1, 73, 68, 3, 10], [81, 67, 3, 9],
  ],
  // Idem, grand, et deux lucarnes.
  'guild-chamber-grand': [
    [33, 67, 4, 18, 37, 69, 1, 16, 38, 69, 1, 12, 39, 69, 1, 11, 40, 67, 1, 11, 41, 67, 1, 2, 41, 70, 1, 8],
    [52, 68, 1, 17, 53, 68, 1, 3, 53, 72, 1, 13, 54, 68, 1, 3, 54, 72, 1, 13, 55, 68, 1, 2, 55, 72, 1, 3, 55, 76, 1, 9, 56, 68, 1, 1, 56, 72, 1, 2, 57, 68, 1, 3, 57, 72, 1, 13, 58, 73, 1, 1, 58, 79, 1, 6],
    [69, 71, 1, 3, 69, 75, 1, 12, 70, 71, 1, 3, 70, 75, 1, 12, 71, 71, 1, 3, 71, 75, 1, 12, 72, 75, 1, 2, 73, 71, 1, 16, 74, 71, 1, 1, 74, 73, 1, 1, 74, 75, 1, 12, 75, 72, 1, 2, 75, 76, 1, 11, 76, 74, 1, 1, 76, 76, 1, 11],
    [84, 76, 1, 13, 85, 76, 1, 1, 85, 78, 1, 11, 86, 76, 1, 1, 86, 78, 1, 11, 87, 78, 1, 1, 87, 83, 1, 6, 88, 76, 1, 2, 88, 79, 1, 1, 88, 82, 1, 7, 89, 76, 1, 2, 89, 79, 1, 8, 90, 79, 1, 3, 90, 83, 1, 3],
    [107, 78, 2, 19, 109, 78, 1, 4, 109, 83, 1, 14, 110, 78, 1, 3, 110, 83, 1, 14, 111, 78, 1, 2, 111, 83, 1, 1, 112, 78, 1, 4, 112, 83, 1, 14, 113, 79, 1, 1, 113, 81, 1, 1, 113, 83, 1, 14, 114, 80, 1, 2, 114, 83, 1, 14],
    [130, 79, 1, 17, 131, 78, 4, 18], [144, 75, 4, 18],
    [108, 113, 2, 16, 110, 113, 1, 4, 110, 118, 1, 11, 111, 113, 1, 2, 111, 119, 1, 1, 111, 125, 1, 4, 112, 113, 1, 4, 112, 119, 1, 10, 113, 113, 1, 5, 113, 119, 1, 10, 114, 115, 1, 3, 114, 119, 1, 10],
    [130, 113, 1, 16, 131, 112, 4, 17], [145, 110, 3, 16],
    [128, 35, 1, 1, 128, 38, 1, 2, 129, 36, 1, 4, 130, 35, 2, 5], [137, 52, 4, 6],
  ],
  // Monnaie à vapeur : les deux fenêtres cintrées à vitres jaunes ; porte éteinte.
  'mint-house-steam': [
    [33, 50, 6, 12], [39, 54, 6, 11],
  ],
  // Idem, grand : chaque fenêtre à carreaux jaunes, regroupés ; porte et imposte éteintes.
  'mint-house-steam-grand': [
    [34, 71, 2, 4], [127, 73, 2, 4], [41, 75, 2, 3], [33, 76, 2, 8], [118, 78, 2, 14],
    [127, 78, 2, 9], [41, 79, 2, 3], [52, 79, 2, 5], [109, 82, 2, 4], [41, 83, 2, 4],
    [33, 85, 2, 3], [51, 85, 3, 4], [55, 87, 1, 3], [69, 87, 3, 4], [100, 87, 2, 4],
    [41, 88, 2, 4], [127, 88, 2, 3], [51, 90, 3, 8], [55, 91, 1, 4], [77, 91, 3, 4],
    [91, 91, 2, 4], [69, 92, 2, 8], [100, 92, 2, 12], [110, 92, 1, 3], [145, 92, 2, 4],
    [118, 93, 2, 3], [55, 96, 1, 3], [77, 96, 4, 13], [91, 96, 2, 12], [109, 97, 2, 3],
    [137, 97, 1, 3], [145, 97, 2, 8], [33, 100, 2, 3], [69, 101, 2, 4], [137, 101, 1, 3],
    [42, 104, 1, 3], [127, 104, 2, 3], [33, 105, 2, 12], [137, 105, 1, 4], [145, 106, 2, 2],
    [49, 107, 4, 1], [80, 109, 1, 1], [41, 108, 2, 8], [127, 108, 2, 3], [118, 109, 2, 3],
    [137, 110, 1, 3], [127, 112, 2, 4], [118, 113, 2, 12], [109, 114, 2, 16], [41, 117, 2, 3],
    [69, 117, 2, 3], [127, 117, 2, 3], [100, 118, 2, 16], [92, 120, 1, 4], [69, 121, 2, 13],
    [77, 121, 3, 17], [91, 125, 2, 13], [80, 135, 1, 4],
  ],
  // Banque néoclassique : les deux hautes fenêtres du flanc ; portique éteint.
  'bank-house-neoclassical': [
    [57, 45, 5, 15], [68, 40, 5, 15],
  ],
  // Idem, grand : 2 fenêtres de façade, 3 du flanc.
  'bank-house-neoclassical-grand': [
    [35, 69, 1, 26, 36, 67, 1, 28, 37, 67, 1, 29, 38, 68, 1, 28, 39, 69, 1, 27, 40, 67, 1, 1, 40, 74, 1, 17, 40, 92, 1, 4, 41, 66, 1, 3, 41, 70, 1, 26, 42, 69, 1, 1, 42, 73, 1, 23],
    [75, 87, 1, 1, 76, 86, 1, 5, 76, 92, 1, 7, 76, 100, 1, 14, 77, 86, 2, 29, 79, 87, 1, 29, 80, 88, 1, 5, 80, 94, 1, 22, 81, 89, 1, 27, 82, 91, 1, 25],
    [97, 90, 1, 26, 98, 88, 1, 28, 99, 87, 1, 28, 100, 86, 1, 29, 101, 85, 1, 30, 102, 85, 1, 29, 103, 87, 1, 26],
    [113, 74, 2, 1, 115, 81, 1, 28, 116, 79, 1, 28, 117, 78, 1, 29, 118, 77, 1, 29, 119, 76, 1, 30, 120, 76, 1, 29, 121, 78, 1, 27],
    [129, 66, 2, 1, 133, 73, 1, 26, 134, 70, 1, 28, 135, 69, 1, 29, 136, 68, 1, 29, 137, 67, 1, 30],
  ],
  // Horreum : arcades ouvertes et portail — aucune fenêtre.
  'granary-horreum-classical': [],
  // Idem, grand : les petites fenêtres de l'étage ; arcades et portail éteints.
  'granary-horreum-classical-grand': [
    [76, 71, 3, 11], [38, 84, 2, 8], [102, 87, 2, 4], [129, 68, 2, 4], [128, 78, 4, 12],
    [101, 114, 3, 6], [38, 60, 1, 3], [59, 64, 2, 8],
  ],
  // Collège : les deux fentes du flanc ; portique éteint.
  'guild-collegium': [
    [60, 67, 1, 6], [64, 69, 1, 5, 65, 70, 1, 4],
  ],
  // Idem, grand.
  'guild-collegium-grand': [
    [95, 112, 2, 8], [103, 116, 2, 8],
  ],
  // Moneta : panneaux de bois sans vitre — éteinte.
  'mint-moneta': [],
  // Idem, grand.
  'mint-moneta-grand': [],
  // Basilique : colonnade et porte — aucune fenêtre.
  'bank-basilica-roman': [],
  // Idem, grand : 3 baies de la nef, 3 des bas-côtés, 2 du transept, 1 à gauche.
  'bank-basilica-roman-grand': [
    [84, 79, 1, 12, 85, 77, 1, 5, 85, 83, 1, 7, 86, 77, 1, 13, 87, 78, 1, 11],
    [95, 73, 1, 12, 96, 72, 1, 9, 96, 82, 1, 2, 97, 71, 1, 13, 98, 71, 1, 12],
    [104, 69, 1, 11, 105, 68, 1, 12, 106, 67, 2, 12],
    [95, 122, 1, 13, 96, 121, 1, 2, 96, 124, 1, 2, 96, 128, 1, 6, 97, 121, 1, 5, 97, 127, 1, 7, 98, 120, 1, 13, 99, 131, 1, 2],
    [107, 116, 1, 13, 108, 115, 1, 3, 108, 119, 1, 9, 109, 115, 1, 3, 109, 119, 1, 9, 110, 114, 2, 13],
    [119, 110, 1, 13, 120, 109, 1, 3, 120, 113, 1, 2, 120, 116, 1, 6, 121, 109, 1, 3, 121, 113, 1, 1, 121, 115, 1, 6, 122, 108, 1, 13, 123, 108, 1, 1],
    [140, 93, 1, 13, 141, 93, 1, 5, 141, 99, 1, 7, 142, 92, 1, 13, 143, 93, 1, 12],
    [148, 91, 1, 12, 149, 89, 1, 8, 149, 98, 1, 4, 150, 88, 1, 6, 150, 95, 1, 4, 150, 100, 1, 1, 151, 88, 1, 13, 152, 99, 1, 1],
    [25, 96, 1, 12, 26, 98, 1, 1, 26, 102, 1, 1, 26, 105, 1, 1, 29, 98, 1, 1, 30, 93, 1, 17],
  ],
  // Macellum : 2 fenêtres à grille, 3 oculus ; portes éteintes.
  'market-macellum': [
    [43, 58, 7, 9], [65, 56, 9, 13], [82, 45, 4, 5], [27, 46, 3, 4], [76, 28, 4, 7],
  ],
  // Idem, grand.
  'market-macellum-grand': [
    [41, 73, 7, 8], [125, 54, 2, 4], [21, 66, 1, 3], [87, 101, 4, 8], [146, 73, 4, 7],
  ],
  // Salle des conteurs : aucune vitre franche — les panneaux gris du flanc à l'ombre sont
  // le hourdis du colombage, du MUR (Raph, 2026-10-03), et le long côté éclairé est une
  // galerie à poteaux ; elle reste noire la nuit.
  'storyteller-hall': [],
  // Scriptorium : les deux fenêtres à vitres jaunes ; porte et pignon éteints.
  'scribes-scriptorium': [
    [48, 59, 1, 11, 49, 58, 1, 12, 50, 57, 1, 13, 51, 57, 2, 12, 53, 59, 1, 10],
    [71, 54, 2, 1, 73, 54, 1, 10, 74, 53, 1, 11, 75, 51, 1, 12, 76, 52, 2, 11],
  ],
  // Maison d'école : 11 fenêtres et lucarnes du colombage ; porte éteinte.
  'schools-schoolhouse': [
    [45, 30, 6, 6], [41, 40, 5, 5], [50, 40, 4, 7], [41, 48, 5, 6], [65, 35, 5, 9], [63, 48, 6, 6],
    [63, 56, 5, 5], [49, 52, 6, 9], [75, 42, 2, 4], [79, 47, 2, 6], [38, 57, 4, 4],
  ],
  // Idem, grand ; clocheton, porte et cour éteints.
  'schools-schoolhouse-grand': [
    [62, 57, 3, 5], [66, 58, 7, 12], [104, 71, 3, 6], [60, 71, 6, 8], [81, 80, 2, 3],
    [60, 86, 5, 8], [101, 86, 4, 8], [106, 87, 6, 10], [101, 100, 5, 9],
    [105, 109, 1, 3, 106, 102, 6, 10], [125, 86, 3, 8],
  ],
  // Académie : les deux hautes fenêtres du flanc ; loggia, porte et coupole éteintes.
  'academies-renaissance': [
    [89, 46, 3, 11], [80, 57, 3, 12],
  ],
  // Chapelle : 5 fenêtres (apside, flanc, façade) ; clocher et porte éteints.
  'cult-shrine': [
    [80, 53, 4, 10], [70, 60, 3, 9], [64, 62, 4, 8], [30, 60, 3, 5], [40, 63, 1, 7],
  ],
  // Idem, grand : les 3 vitraux ambrés de l'apside et du flanc.
  'cult-shrine-grand': [
    [134, 96, 3, 12], [115, 109, 3, 11], [104, 111, 4, 11],
  ],
  // Tour de l'observatoire : 3 fentes de la tour, 2 fenêtres de l'annexe ; la coupole reste
  // éteinte.
  'observatories-tower': [
    [41, 32, 1, 6], [44, 44, 1, 4], [46, 46, 4, 11], [56, 56, 2, 3], [60, 60, 5, 5],
  ],
  // Idem, grand : 2 fentes hautes et la fenêtre gothique de la tour, 2 fentes du pied, la
  // lucarne et les 2 fenêtres de l'annexe ; sphère armillaire et bannière éteintes.
  'observatories-tower-grand': [
    [68, 87, 8, 18], [55, 53, 2, 17], [102, 57, 5, 22], [57, 110, 3, 13], [66, 116, 2, 7],
    [107, 131, 5, 6], [98, 133, 5, 6], [94, 110, 6, 6],
  ],
  // Bibliothèque monastique : la rosace, la lancette dessous, deux lancettes superposées
  // par pignon, la fenêtre de la nef, le vitrail sombre du chevet ; portail et lanterne
  // éteints.
  'libraries-monastic': [
    [31, 40, 5, 9], [33, 53, 2, 4], [44, 60, 2, 6, 46, 60, 1, 7], [45, 70, 2, 5],
    [57, 55, 2, 10, 59, 60, 2, 5], [56, 68, 3, 6, 59, 70, 2, 4],
    [69, 50, 1, 12, 70, 49, 3, 13, 73, 50, 1, 12], [81, 47, 4, 20],
  ],
  // Idem, grand : rosace, deux lancettes dessous, deux lancettes par pignon, fenêtre de la
  // nef, deux vitraux du chevet ; portail et lanterne du clocher (abat-sons) éteints.
  'libraries-monastic-grand': [
    [41, 74, 1, 9, 42, 72, 1, 15, 43, 72, 1, 17, 44, 72, 3, 19, 47, 74, 1, 17, 48, 76, 2, 15, 50, 80, 1, 11],
    [40, 95, 3, 9], [45, 96, 2, 6], [65, 106, 6, 16], [66, 126, 5, 11],
    [89, 100, 3, 18, 92, 103, 4, 15], [89, 123, 7, 13],
    [112, 93, 2, 17, 114, 91, 4, 19, 118, 93, 2, 17], [132, 83, 8, 18], [133, 104, 5, 13],
  ],
  // Université gothique : 2 fenêtres de la tour-porche, les fenêtres à meneaux des pignons
  // et du flanc, la lucarne ; porche, cloître et pinacles éteints.
  'universities-gothic': [
    [68, 51, 4, 8], [29, 55, 1, 7], [80, 62, 3, 7], [89, 44, 2, 4], [96, 45, 4, 7], [86, 53, 4, 3],
    [37, 32, 5, 3], [37, 42, 5, 8], [14, 50, 4, 9],
  ],
  // Idem, grand : rosace et grande verrière de la tour, la fenêtre du pignon ouest, 2
  // lancettes de l'aile basse, 3 lucarnes, la fenêtre du pignon est et les 5 lancettes
  // jumelées du flanc à l'ombre (leurs fentes sombres) ; porche, cloître et niches du pied
  // de la tour éteints.
  'universities-gothic-grand': [
    [56, 58, 1, 8, 57, 57, 1, 9, 58, 57, 4, 11, 62, 58, 1, 10],
    [55, 78, 1, 17, 56, 76, 1, 19, 57, 75, 1, 20, 58, 74, 1, 21, 59, 73, 2, 22, 61, 75, 1, 20, 62, 76, 1, 19, 63, 78, 1, 17, 64, 79, 2, 16],
    [15, 89, 1, 20, 16, 88, 1, 21, 17, 87, 2, 22, 19, 88, 1, 21, 20, 89, 1, 20, 21, 91, 2, 18],
    [33, 94, 2, 18, 35, 98, 3, 14], [41, 99, 1, 15, 42, 97, 1, 17, 43, 96, 2, 18, 45, 99, 1, 15],
    [43, 84, 2, 3], [88, 99, 2, 4], [108, 105, 3, 4],
    [145, 86, 1, 5, 146, 84, 2, 7, 148, 86, 1, 5], [129, 116, 1, 10, 131, 120, 1, 6],
    [133, 116, 1, 10, 136, 115, 1, 11], [138, 114, 1, 10, 139, 110, 1, 16, 141, 116, 1, 10],
    [143, 104, 1, 20, 146, 102, 1, 20], [154, 101, 1, 17, 155, 98, 1, 17, 157, 99, 1, 15],
  ],
  // Atelier d'imprimerie : la lucarne, la fenêtre du pignon à l'ombre, les 2 fenêtres à
  // croisée de la façade ; grande porte ouverte et son vantail éteints.
  'printing-press-shop': [
    [65, 31, 1, 5, 65, 37, 1, 2, 66, 31, 1, 5, 66, 37, 1, 2, 67, 31, 1, 5, 67, 37, 1, 2, 68, 31, 1, 5, 68, 37, 2, 2],
    [28, 33, 3, 8], [63, 48, 9, 8, 72, 48, 4, 7], [63, 61, 2, 8, 65, 60, 7, 9, 72, 60, 5, 8],
  ],
  // Idem, grand : la lucarne (arc vitré vert + 2 carreaux), la fenêtre du pignon, les 2
  // fenêtres à petits bois de la façade ; porte et vantail éteints.
  'printing-press-shop-grand': [
    [104, 66, 1, 3, 105, 60, 1, 4, 105, 66, 1, 3, 106, 60, 3, 4, 108, 66, 1, 3, 109, 60, 1, 4, 109, 66, 1, 3, 110, 63, 1, 1, 110, 66, 1, 3],
    [42, 60, 1, 11, 43, 63, 5, 8], [99, 89, 16, 11, 115, 89, 6, 10, 121, 89, 3, 9, 124, 94, 1, 4],
    [99, 109, 1, 16, 100, 109, 3, 17, 103, 108, 2, 18, 105, 108, 3, 17, 108, 107, 1, 18, 109, 107, 6, 17, 115, 106, 4, 17, 119, 105, 5, 17, 124, 104, 1, 18, 125, 106, 1, 15],
  ],
  // Chancellerie : les 3 lancettes du grand pignon, la fente du petit pignon, la lucarne, 4
  // fentes de la tourelle, la fenêtre ogivale de l'aile à l'ombre ; loggia, bannières,
  // porte éteintes.
  'think-chancellery': [
    [36, 33, 1, 10], [38, 30, 2, 13], [42, 36, 1, 10, 43, 38, 1, 8],
    [31, 30, 1, 4, 32, 29, 1, 2, 33, 29, 1, 1], [52, 37, 1, 6, 53, 37, 1, 9], [56, 44, 1, 7],
    [63, 45, 2, 6], [57, 61, 2, 8], [66, 61, 1, 8], [73, 54, 1, 13, 74, 52, 3, 15, 77, 54, 1, 13],
  ],
  // Idem, grand : 3 lancettes du pignon, fenêtre du petit pignon, lucarne, 4 fentes de la
  // tourelle, fenêtre ogivale de l'aile ; loggia à balustres, bannières bleues et porte
  // éteintes.
  'think-chancellery-grand': [
    [51, 58, 1, 18, 52, 58, 1, 19, 53, 61, 1, 16], [56, 52, 2, 26, 58, 54, 1, 24],
    [62, 64, 2, 17, 64, 67, 1, 14], [39, 50, 5, 7], [79, 72, 2, 7], [88, 80, 1, 5, 89, 79, 1, 11],
    [100, 82, 1, 5, 101, 80, 1, 12, 102, 80, 1, 11],
    [90, 110, 1, 14, 91, 109, 1, 14, 92, 111, 1, 10, 93, 116, 1, 3], [105, 107, 3, 16],
    [119, 91, 4, 28, 123, 89, 1, 30, 124, 91, 4, 28],
  ],
  // Tour de guet : les 2 fenêtres du fût (face éclairée, face à l'ombre) ; créneaux,
  // embrasure du parapet et porte éteints.
  'watch-stone': [
    [32, 49, 2, 4, 34, 50, 2, 3], [52, 50, 1, 4, 53, 49, 4, 5],
  ],
  // Bureau de chancellerie : 3 fenêtres à volets des pignons, celle du flanc à jardinière,
  // 2 fenêtres du rez ; l'étage derrière la galerie à balustres, la porte et la porte
  // latérale restent éteints.
  'bureau-chancery': [
    [32, 33, 4, 6], [44, 38, 4, 6], [59, 42, 2, 6],
    [68, 45, 1, 1, 69, 43, 2, 3, 71, 41, 1, 5, 72, 41, 3, 4], [32, 57, 4, 7], [55, 65, 4, 7],
  ],
  // Idem, grand : 3 fenêtres à volets des pignons, celle du flanc, 2 fenêtres du rez à
  // jardinière ; galerie, porte d'entrée et porte du flanc éteintes.
  'bureau-chancery-grand': [
    [45, 59, 6, 9], [67, 66, 2, 12, 69, 67, 6, 11], [94, 76, 4, 9], [114, 76, 2, 8, 116, 76, 3, 6],
    [47, 103, 5, 13], [87, 118, 6, 12],
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
  // Chartrier : 3 fenêtres ogivales de l'étage, 2 du rez ; porte grillée et sceau rouge
  // éteints.
  'archive-vault': [
    [40, 37, 4, 10], [56, 42, 5, 10], [70, 37, 5, 10], [56, 60, 5, 8], [70, 58, 2, 6],
  ],
  // Idem, grand : 3 fenêtres ogivales à meneaux de l'étage, 2 du rez ; porte grillée et
  // sceau éteints.
  'archive-vault-grand': [
    [59, 66, 1, 2, 60, 66, 3, 17, 63, 67, 2, 16, 65, 68, 2, 15],
    [89, 78, 1, 14, 90, 77, 2, 15, 92, 76, 2, 16, 94, 74, 2, 18, 96, 77, 1, 15, 97, 78, 1, 14],
    [116, 70, 1, 13, 117, 69, 2, 14, 119, 70, 1, 13],
    [89, 110, 2, 12, 91, 109, 1, 13, 92, 108, 2, 14, 94, 109, 3, 12, 97, 110, 1, 11],
    [117, 102, 1, 10, 118, 101, 4, 11],
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
  // Théâtre (XIXe) : 3 fenêtres cintrées de l’étage en façade, l’oculus du fronton, 6
  // fenêtres du flanc sur deux étages — leur verre orangé ; les 3 portes du rez restent
  // éteintes.
  'storyteller-theater': [
    [32, 33, 3, 11], [42, 38, 3, 9], [52, 42, 3, 9], [64, 43, 2, 7], [70, 38, 3, 9],
    [77, 36, 4, 9], [64, 58, 2, 8], [71, 54, 2, 8], [77, 51, 4, 9],
    [41, 24, 1, 4, 42, 24, 3, 5, 45, 26, 1, 2],
  ],
  // Archives (XIXe) : 4 fenêtres à petits bois de la façade, 4 du flanc à l’ombre — leur
  // verre jaune ; l’horloge du pignon et le portique restent éteints.
  'scribes-archive': [
    [31, 32, 3, 8], [31, 50, 3, 6], [48, 41, 3, 6], [48, 58, 3, 8], [62, 41, 3, 7], [62, 57, 3, 7],
    [77, 33, 3, 7], [77, 49, 3, 8],
  ],
  // École (XIXe) : la fenêtre cintrée et la lucarne du pignon, la fenêtre droite de la
  // façade, 2 fenêtres cintrées et l’œil-de-bœuf du flanc à l’ombre ; porte cintrée
  // éteinte.
  'schools-victorian': [
    [31, 41, 4, 11], [42, 36, 4, 4], [55, 52, 4, 10],
    [68, 50, 2, 12, 70, 49, 1, 13, 71, 48, 1, 14, 72, 49, 1, 13, 73, 50, 1, 12],
    [78, 45, 1, 10, 79, 44, 2, 11, 81, 43, 3, 12, 84, 44, 1, 11], [73, 36, 5, 4],
  ],
  // Idem, grand (collège en H) : par pignon l’œil-de-bœuf et les fenêtres à guillotine (3 +
  // 2 au flanc à gauche, 3 + 3 à droite), 4 au corps central, 6 à l’aile à l’ombre ; porte
  // à fronton et descentes d’eau (bleues, verticales) éteintes.
  'schools-victorian-grand': [
    [21, 71, 3, 11], [21, 92, 3, 9], [38, 69, 5, 7], [32, 82, 4, 11], [38, 85, 5, 13],
    [46, 89, 2, 11], [65, 95, 4, 11], [74, 99, 5, 11], [65, 114, 4, 12], [74, 118, 5, 12],
    [101, 80, 5, 6], [95, 100, 3, 11], [101, 96, 5, 11], [109, 93, 3, 10], [94, 120, 3, 11],
    [101, 117, 5, 10], [109, 115, 3, 9], [123, 85, 4, 11], [123, 104, 4, 12], [137, 79, 5, 10],
    [137, 99, 5, 11], [151, 72, 4, 10], [151, 91, 4, 11],
  ],
  // Institut : 2 fenêtres à verre jaune de la façade, 2 du flanc à l’ombre ; porte de bois
  // et péristyle éteints.
  'academies-institute': [
    [31, 36, 4, 11], [53, 47, 3, 11], [64, 48, 6, 10], [75, 42, 6, 9],
  ],
  // Mausolée : la lunette de la voûte et la fenêtre cintrée du flanc ; la porte de bronze
  // et le brasero (déjà allumé, peint) restent tels quels.
  'cult-mausoleum': [
    [43, 17, 4, 6], [64, 38, 7, 11],
  ],
  // Mausolée à coupole, grand : aucune vitre — le tambour n’a que des panneaux aveugles,
  // l’entrée est une porte ; il reste noir la nuit.
  'cult-mausoleum-grand': [],
  // Grande bibliothèque : 6 lucarnes du brisis, 6 fenêtres de l’étage (verre sombre), 4 du
  // rez (verre orangé) ; les 2 portes éteintes.
  'libraries-grand': [
    [30, 32, 3, 12], [38, 36, 4, 11], [47, 40, 4, 12], [62, 40, 4, 11], [71, 36, 4, 11],
    [79, 32, 4, 11], [30, 18, 4, 7], [39, 22, 3, 7], [47, 26, 4, 7], [62, 25, 4, 6],
    [70, 22, 4, 6], [77, 19, 4, 6], [30, 50, 4, 12], [47, 58, 4, 10], [61, 58, 3, 11],
    [78, 49, 3, 12],
  ],
  // Idem, grand : 2 lucarnes et 2 lucarnes de mansarde, les fenêtres des 2 pignons, 12
  // fenêtres cintrées sur deux étages (verre orangé) ; porte grillée éteinte.
  'libraries-grand-grand': [
    [38, 47, 3, 7], [135, 47, 3, 7], [53, 58, 5, 6], [118, 58, 5, 7], [76, 66, 3, 7],
    [96, 66, 4, 7], [36, 71, 5, 19], [53, 80, 5, 19], [75, 90, 4, 18], [96, 91, 5, 17],
    [118, 79, 5, 20], [135, 71, 5, 17], [36, 103, 5, 17], [53, 112, 6, 17], [75, 123, 4, 15],
    [96, 122, 5, 16], [135, 102, 5, 18],
  ],
  // Collège universitaire : 5 fenêtres à guillotine de la façade, 4 du flanc à l’ombre ;
  // horloge du pignon et porche éteints.
  'universities-collegiate': [
    [28, 41, 3, 7], [28, 52, 3, 8], [37, 42, 5, 8], [51, 47, 4, 9], [52, 61, 4, 7], [64, 47, 5, 9],
    [76, 41, 5, 9], [64, 60, 5, 9], [76, 54, 5, 9],
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
  // Imprimerie industrielle : 4 fenêtres à petits bois (verre orangé) de la longue façade ;
  // les 2 portes et le pignon aveugle à l’ombre éteints.
  'printing-factory': [
    [18, 35, 5, 10], [26, 39, 5, 10], [58, 55, 5, 10], [66, 59, 5, 10],
  ],
  // Idem, grand : 2 fenêtres de l’appentis, 4 de l’aile gauche, 4 du pignon central, 4 du
  // bloc droit ; les portes de remise à lames et la cheminée restent éteintes.
  'printing-factory-grand': [
    [31, 82, 5, 5], [39, 86, 5, 9], [52, 76, 4, 7], [58, 77, 3, 7], [71, 84, 5, 10],
    [78, 87, 4, 9], [96, 78, 4, 6], [102, 84, 4, 7], [90, 88, 4, 9], [96, 88, 4, 6],
    [136, 59, 4, 6], [136, 66, 4, 6], [142, 63, 4, 7], [129, 70, 4, 10],
  ],
  // Institut de réflexion : la lucarne du fronton, 5 fenêtres à verre jaune de la façade, 6
  // du flanc à l’ombre et la petite lucarne du pignon ; porte éteinte.
  'think-institute': [
    [44, 28, 3, 4], [34, 35, 3, 6], [43, 40, 4, 5], [53, 44, 4, 5], [34, 48, 3, 8], [53, 56, 4, 9],
    [82, 37, 3, 6], [74, 42, 3, 5], [67, 45, 3, 4], [82, 50, 3, 7], [74, 54, 3, 6], [67, 57, 3, 7],
    [71, 31, 2, 2],
  ],
  // Idem, grand : 12 fenêtres à croisée (verre jaune) des deux pignons et des flancs ;
  // œils-de-bœuf aveugles des pignons et les 2 portes éteints.
  'think-institute-grand': [
    [51, 65, 7, 12], [119, 65, 6, 11], [33, 78, 7, 13], [52, 87, 6, 12], [119, 84, 7, 15],
    [136, 78, 7, 13], [72, 98, 7, 13], [96, 98, 7, 13], [33, 101, 7, 14], [136, 100, 7, 14],
    [72, 120, 7, 14], [96, 120, 7, 14],
  ],
  // Tour de guet (XIXe) : la fenêtre de la façade, 2 fenêtres à verre orangé du flanc à
  // l’ombre ; porte cintrée éteinte.
  'watch-industrial': [
    [33, 40, 4, 6], [53, 40, 3, 6], [55, 68, 3, 7],
  ],
  // Station des égouts : 2 fenêtres cintrées de la façade ; la porte grise et le grand
  // portail cintré du pignon à l’ombre restent éteints.
  'sewers-works': [
    [35, 44, 4, 10], [47, 50, 4, 10],
  ],
  // Ministère-bureau (Second Empire) : 6 lucarnes, 6 fenêtres de l’aile gauche, 6 de l’aile
  // droite, 4 du flanc à l’ombre ; porte centrale, balcons de fer et fronton sculpté
  // éteints.
  'bureau-office': [
    [19, 41, 3, 9], [27, 42, 3, 9], [33, 43, 3, 9], [19, 56, 3, 10], [27, 60, 3, 9],
    [33, 61, 3, 8], [55, 50, 2, 8], [60, 51, 3, 8], [68, 53, 3, 8], [55, 65, 2, 10],
    [60, 67, 3, 10], [68, 68, 3, 10], [80, 53, 3, 8], [87, 48, 3, 8], [80, 67, 3, 9],
    [87, 62, 3, 9], [20, 30, 2, 3], [28, 32, 3, 3], [56, 37, 3, 4], [62, 38, 2, 4], [67, 38, 3, 4],
    [83, 35, 4, 6],
  ],
  // Idem, grand : 7 lucarnes, 7 fenêtres de l’aile gauche et du pavillon, 6 de l’aile
  // droite, 4 du flanc à l’ombre ; porte cintrée, balcons de fer et médaillon du fronton
  // éteints.
  'bureau-office-grand': [
    [17, 48, 5, 8], [37, 55, 5, 8], [43, 56, 4, 8], [86, 68, 4, 8], [98, 68, 3, 9],
    [104, 68, 4, 10], [138, 62, 6, 9], [21, 69, 6, 15], [36, 71, 5, 14], [46, 74, 5, 13],
    [62, 73, 5, 13], [21, 94, 6, 17], [35, 98, 6, 17], [46, 103, 5, 17], [85, 85, 5, 14],
    [96, 87, 6, 14], [109, 89, 5, 15], [85, 110, 5, 18], [95, 112, 6, 19], [109, 116, 5, 18],
    [130, 89, 5, 11], [145, 84, 5, 13], [130, 115, 5, 17], [143, 110, 6, 18],
  ],
  // Palais de justice néoclassique : la fenêtre au fond du portique (gauche) et 2 fenêtres
  // du flanc à l’ombre ; les portes à poignées dorées sous le portique et le fronton
  // restent éteints.
  'courthouses-neoclassical': [
    [34, 34, 3, 11], [70, 43, 5, 11], [77, 40, 5, 10],
  ],
  // Idem, grand : 2 hautes fenêtres et l’imposte du portique, 3 fenêtres de chaque flanc ;
  // porte et fronton doré éteints.
  'courthouses-neoclassical-grand': [
    [28, 65, 4, 28], [36, 69, 5, 28], [43, 72, 4, 28], [62, 75, 8, 28], [107, 75, 8, 28],
    [83, 70, 11, 13], [130, 72, 4, 29], [136, 69, 5, 29], [145, 65, 4, 28],
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
  // Capitole (petit temple) : les 2 fenêtres vitrées du flanc éclairé ; le portique, sa
  // porte et l’ombre derrière les colonnes restent éteints.
  'ministries-capitol': [
    [30, 39, 3, 12], [39, 43, 3, 12],
  ],
  // Capitole à coupole, grand : 2 lucarnes de la coupole, 4 baies du tambour, 4 fenêtres
  // vitrées et 4 hautes fenêtres à l’ombre, les impostes au-dessus des deux portes ; portes
  // (dont la dorée) éteintes.
  'ministries-capitol-grand': [
    [24, 80, 3, 23], [33, 84, 3, 22], [46, 95, 6, 11], [69, 102, 3, 21], [78, 106, 3, 23],
    [127, 97, 3, 6],
    [89, 107, 1, 24, 90, 106, 1, 25, 91, 106, 1, 24, 92, 105, 1, 25, 93, 105, 1, 24, 94, 104, 1, 25],
    [98, 102, 1, 25, 99, 102, 1, 24, 100, 101, 1, 25, 101, 101, 1, 24, 102, 100, 1, 25, 103, 100, 1, 24],
    [134, 82, 1, 29, 135, 84, 1, 27, 136, 83, 1, 28, 137, 83, 1, 24, 138, 82, 1, 25, 139, 82, 1, 24],
    [144, 79, 2, 25, 146, 78, 1, 25, 147, 78, 1, 24, 148, 77, 1, 25], [71, 55, 3, 12],
    [80, 59, 3, 12], [86, 58, 3, 13], [93, 56, 3, 14], [71, 42, 4, 6], [92, 41, 4, 7],
  ],
  // Archives (XIXe) : les 2 verrières du toit, 4 fenêtres à volets de la façade, la fenêtre
  // du pignon, 6 du flanc à l’ombre ; le cartouche du toit, l’horloge et la grande porte
  // éteints.
  'archive-records': [
    [34, 23, 1, 2, 35, 22, 1, 4, 36, 20, 1, 6, 37, 20, 1, 5, 38, 19, 1, 5, 39, 18, 1, 5, 40, 19, 1, 4, 41, 19, 1, 3, 42, 19, 1, 2],
    [59, 32, 1, 2, 60, 31, 1, 4, 61, 30, 1, 5, 62, 29, 1, 6, 63, 28, 1, 6, 64, 28, 1, 5, 65, 29, 1, 2, 66, 30, 1, 1],
    [27, 35, 4, 10], [27, 51, 3, 10], [36, 40, 4, 11], [51, 45, 4, 10], [51, 60, 4, 10],
    [67, 44, 5, 10], [76, 39, 4, 10], [84, 36, 4, 10], [67, 58, 5, 10], [76, 53, 4, 10],
    [84, 48, 4, 11],
  ],
  // Idem, grand : 2 verrières, 2 fenêtres à volets de l’aile gauche, celle du pignon, 2 de
  // l’avant-corps, 6 du flanc à l’ombre (les volets eux-mêmes restent sombres) ; cartouche,
  // horloge, œil-de-bœuf et portail éteints.
  'archive-records-grand': [
    [46, 41, 1, 1, 47, 40, 1, 2, 48, 38, 1, 4, 49, 36, 2, 7, 51, 35, 1, 9, 52, 35, 1, 8, 53, 33, 1, 10, 54, 32, 1, 10, 55, 31, 1, 10, 56, 30, 1, 10, 57, 30, 1, 8, 58, 31, 1, 6, 59, 31, 1, 5, 60, 32, 1, 4, 61, 32, 1, 2, 62, 33, 1, 1],
    [90, 59, 1, 1, 91, 57, 2, 3, 93, 56, 1, 5, 94, 54, 1, 5, 94, 60, 1, 1, 95, 53, 1, 9, 96, 52, 1, 10, 97, 51, 1, 11, 98, 50, 1, 11, 99, 49, 1, 11, 100, 48, 1, 11, 101, 48, 1, 10, 102, 49, 1, 8, 103, 49, 1, 7, 104, 50, 1, 5, 105, 50, 1, 4, 106, 51, 1, 2, 107, 51, 1, 1],
    [34, 61, 5, 20], [35, 91, 4, 17], [57, 73, 5, 18], [81, 81, 5, 20], [82, 110, 5, 19],
    [107, 80, 8, 20], [123, 72, 7, 22], [138, 64, 7, 21], [107, 106, 8, 22], [123, 99, 7, 22],
    [138, 91, 7, 22],
  ],
  // Institut des ruines : 3 fenêtres de la façade, l’œil du pignon et 2 fenêtres du flanc à
  // l’ombre ; porte de bois éteinte.
  'ruins-institute': [
    [37, 29, 3, 8], [48, 35, 3, 8], [37, 45, 3, 7], [69, 26, 3, 6], [69, 34, 3, 10],
    [69, 48, 3, 9],
  ],
  // Idem, grand : l’œil-de-bœuf et la croisée du pignon, la fenêtre de l’aile gauche, 4
  // fenêtres de l’aile basse, 2 du flanc derrière l’échafaudage (les perches passent
  // devant) ; porte dorée éteinte.
  'ruins-institute-grand': [
    [50, 79, 8, 13], [52, 61, 5, 6], [32, 92, 5, 10], [101, 90, 4, 10], [79, 111, 3, 10],
    [102, 110, 4, 12],
    [129, 70, 1, 2, 129, 74, 1, 10, 130, 73, 1, 11, 132, 72, 1, 2, 132, 75, 1, 9, 133, 71, 2, 13, 135, 70, 1, 14, 136, 70, 1, 4, 136, 75, 1, 9, 137, 70, 1, 14],
    [129, 91, 1, 4, 129, 96, 1, 11, 130, 91, 1, 3, 130, 95, 1, 12, 132, 91, 5, 16, 137, 91, 1, 8, 137, 100, 1, 1, 137, 103, 1, 4],
  ],
  // Odéon (petit) : la fenêtre carrée du flanc ; la porte de bois et la voûte éteintes.
  'storyteller-odeon': [
    [67, 49, 5, 7],
  ],
  // Tabularium : les 5 baies cintrées de l’étage (sur appui), la baie cintrée du pignon à
  // l’ombre ; porte du rez éteinte.
  'scribes-tabularium': [
    [31, 26, 4, 10], [38, 29, 4, 10], [46, 31, 4, 11], [54, 33, 3, 10], [62, 37, 5, 10],
    [77, 31, 3, 8],
  ],
  // Ludus : aucune vitre — les hautes ouvertures de la façade sont un portique (Raph,
  // 2026-10-03), l'entrée et le péristyle de la cour aussi ; il reste noir la nuit.
  'schools-ludus': [],
  // Athénée : les 2 fenêtres du flanc ; portique, porte et fronton éteints.
  'academies-athenaeum': [
    [78, 40, 5, 9], [65, 46, 5, 10],
  ],
  // Temple de Vesta : aucune vitre — porte close et porte ouverte, foyer sacré peint ; il
  // reste noir la nuit (le feu garde sa lueur propre).
  'cult-vesta': [],
  // Horloge romaine (petite) : 2 fenêtres hautes de la tour octogonale ; l’arche-porte et
  // le cadran gravé éteints.
  'observatories-horologium': [
    [66, 40, 4, 6], [54, 42, 4, 6],
  ],
  // Idem, grand : les 2 grandes roses à rayons de la tour (vitrail plutôt que cadran —
  // doute signalé) et la petite fenêtre ovale ; créneaux et porte éteints.
  'observatories-horologium-grand': [
    [68, 65, 1, 9, 69, 64, 1, 12, 70, 64, 1, 14, 71, 64, 1, 15, 72, 64, 1, 17, 73, 64, 2, 18, 75, 65, 1, 15, 76, 66, 1, 17, 77, 67, 1, 16, 78, 69, 1, 13, 79, 70, 1, 7, 80, 74, 1, 6],
    [95, 74, 1, 6, 96, 70, 1, 11, 97, 65, 1, 17, 98, 66, 2, 17, 100, 65, 1, 18, 101, 65, 1, 17, 102, 64, 1, 18, 103, 64, 1, 17, 104, 64, 1, 15, 105, 64, 1, 14, 106, 64, 1, 12, 107, 65, 1, 9],
    [106, 109, 1, 7, 107, 109, 3, 6],
  ],
  // Bibliothèque romaine (petite) : les 2 fenêtres du flanc ; portique, porte et fronton
  // éteints.
  'libraries-classical': [
    [63, 43, 2, 13, 65, 44, 2, 11, 67, 43, 1, 11],
    [72, 40, 1, 11, 73, 38, 1, 13, 74, 37, 1, 14, 75, 37, 1, 13, 76, 38, 1, 12, 77, 38, 1, 13, 78, 37, 1, 12],
  ],
  // Idem, grand : l’oculus bleu du fronton, la fenêtre de chaque annexe ; porte sous l’arc,
  // colonnade latérale éteintes.
  'libraries-classical-grand': [
    [56, 39, 5, 7], [26, 86, 4, 12], [112, 102, 3, 13],
  ],
  // Université romaine (petite) : les 2 fenêtres du flanc à l’ombre ; portique, porte et
  // couronne du fronton éteints.
  'universities-classical': [
    [69, 41, 1, 14, 70, 42, 1, 13, 71, 42, 1, 12, 72, 41, 1, 13, 73, 41, 1, 14],
    [80, 35, 1, 13, 81, 35, 1, 14, 82, 36, 1, 10, 83, 35, 1, 13, 84, 35, 1, 12],
  ],
  // Idem, grand : aucune vitre — long mur aveugle, porte sous portique et médaillon du
  // fronton ; il reste noir la nuit.
  'universities-classical-grand': [],
  // Scriptorium : la fenêtre du pignon à l’ombre ; l’auvent-échoppe et ses étals éteints.
  'printing-scriptorium': [
    [74, 50, 6, 8],
  ],
  // Idem, grand : la fenêtre encadrée du pignon ; auvent et étals éteints.
  'printing-scriptorium-grand': [
    [122, 93, 2, 11, 124, 92, 2, 12, 126, 92, 1, 11, 127, 91, 2, 12, 129, 90, 3, 12],
  ],
  // Stoa : la fenêtre à petits bois du pignon ; la colonnade ouverte et la grande
  // claire-voie du rez éteintes.
  'think-stoa-roman': [
    [85, 42, 7, 7],
  ],
  // Idem, grand : la baie cintrée à petits bois du pignon ; colonnade et claire-voie du rez
  // éteintes.
  'think-stoa-roman-grand': [
    [134, 68, 2, 14, 136, 66, 3, 16, 139, 64, 6, 18, 145, 66, 1, 16, 146, 68, 1, 14],
  ],
  // Tour de garde romaine : la fenêtre grillée de la façade et la baie cintrée du flanc à
  // l’ombre ; porte de bois éteinte.
  'watch-classical': [
    [37, 59, 6, 11], [67, 59, 6, 11],
  ],
  // Bureau du tabularium (petit) : la fenêtre à verre bleu-vert du flanc ; plaque gravée,
  // portique et porte éteints.
  'bureau-tabularium': [
    [76, 43, 2, 3, 77, 47, 1, 6, 78, 42, 1, 11, 79, 41, 1, 11, 80, 44, 1, 1],
  ],
  // Idem, grand : la baie cintrée à verre bleu-vert du flanc ; plaque, portique, porte et
  // couronne du fronton éteints.
  'bureau-tabularium-grand': [
    [125, 78, 1, 4, 125, 85, 1, 11, 126, 76, 1, 20, 127, 75, 1, 21, 128, 74, 2, 21, 130, 73, 1, 21, 131, 73, 1, 19, 132, 77, 1, 2],
  ],
  // Basilique judiciaire (petite) : aucune vitre franche — les 3 hautes baies du flanc ont
  // des vantaux de bois (comme la porte de la grande), l’œil du fronton est sombre ; elle
  // reste noire la nuit (doute signalé).
  'courthouses-basilica': [],
  // Idem, grand : aucune vitre — porte cintrée de bois au flanc, porte sous portique,
  // oculus aveugle du fronton ; noire la nuit.
  'courthouses-basilica-grand': [],
  // Chantier romain : la petite fenêtre de la cabane ; la grue à roue, les blocs et la
  // porte éteints.
  'works-classical': [
    [83, 53, 4, 2],
  ],
  // Idem, grand : la petite fenêtre encadrée de la cabane ; grue, blocs, porte éteints.
  'works-classical-grand': [
    [138, 95, 5, 6],
  ],
  // Curie : 3 hautes fenêtres derrière les colonnes (gauche, au-dessus de la porte,
  // droite), 2 du flanc ; porte et escalier éteints.
  'ministries-curia': [
    [38, 31, 3, 18], [45, 34, 5, 12], [56, 38, 4, 18], [69, 39, 4, 18], [83, 31, 4, 19],
  ],
  // Idem, grand : 3 hautes fenêtres à traverse sous le portique, 2 du flanc de brique ;
  // porte et escalier éteints.
  'ministries-curia-grand': [
    [53, 55, 5, 33], [69, 61, 8, 23], [88, 68, 6, 33], [113, 70, 5, 29], [135, 57, 6, 29],
  ],
  // Archives du tabularium (petites) : les 5 fentes hautes des deux ailes ; portique et
  // porte éteints.
  'archive-tabularium': [
    [24, 29, 1, 4], [26, 29, 1, 4], [66, 38, 1, 4], [70, 39, 1, 4], [74, 40, 1, 4],
  ],
  // Idem, grand : 2 fentes de l’aile gauche, 3 de l’aile droite ; portique, porte et niche
  // aveugle du flanc éteints.
  'archive-tabularium-grand': [
    [30, 52, 2, 6], [36, 53, 3, 6], [109, 70, 3, 6], [116, 72, 2, 5], [123, 73, 3, 6],
  ],
  // Temple en restauration : aucune vitre — temple sans toit sous échafaudage, baraque de
  // planches ; il reste noir la nuit.
  'ruins-restoration-roman': [],
  // Idem, grand : aucune vitre — ruine ouverte, échafaudage, cabane de planches ; noir la
  // nuit.
  'ruins-restoration-roman-grand': [],
};
