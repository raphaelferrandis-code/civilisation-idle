"use strict";

// Barrel — la chronique a été découpée par période dans ./chronicle/ (Audit Phase 6 /
// E-04). L'ordre des spreads reproduit l'ordre source d'origine. Les périodes 8 à 10
// (Noosphère, Stellaire, Démiurge) sont celles du lot 3 de docs/PLAN-ECOUTER-PARLER.md :
// avant elles, les âges 7 à 9 restaient en période 7.
import { localizeData } from '../core/i18n.js';
import { chroniclePeriod1 } from './chronicle/p1.js';
import { chroniclePeriod2 } from './chronicle/p2.js';
import { chroniclePeriod3 } from './chronicle/p3.js';
import { chroniclePeriod4 } from './chronicle/p4.js';
import { chroniclePeriod5 } from './chronicle/p5.js';
import { chroniclePeriod6 } from './chronicle/p6.js';
import { chroniclePeriod7 } from './chronicle/p7.js';
import { chroniclePeriod8 } from './chronicle/p8.js';
import { chroniclePeriod9 } from './chronicle/p9.js';
import { chroniclePeriod10 } from './chronicle/p10.js';

export const chronicleArticles = [
  ...chroniclePeriod1,
  ...chroniclePeriod2,
  ...chroniclePeriod3,
  ...chroniclePeriod4,
  ...chroniclePeriod5,
  ...chroniclePeriod6,
  ...chroniclePeriod7,
  ...chroniclePeriod8,
  ...chroniclePeriod9,
  ...chroniclePeriod10
];

// Aplatit les feuilles { fr, en } (title/text/author) en chaînes de la langue
// courante, une fois au chargement (cf. i18n.js). Le spread ci-dessus partage
// les MÊMES références d'objets que les tableaux p1..p7 → les résoudre ici les
// résout partout, pour les 7 périodes.
localizeData(chronicleArticles);
