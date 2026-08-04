// Goutte de pluie tracée en PIXELS (rainStreakPixels), qui a remplacé le
// segment anticrénelé du rideau. Ce que le dessin doit garantir et qu'aucune
// image ne montre : l'escalier est CONTINU, et il tient dans sa propre étampe.
//
// ⚠ LE PIÈGE EST AU VENT FORT. Sous rafale l'inclinaison enfle (gustWind) au
// point que le déport horizontal DÉPASSE la chute : l'axe majeur n'est plus y.
// Un tracé « un pixel par LIGNE » — le réflexe quand on pense « pluie » — laisse
// alors des colonnes vides, et la goutte se lit comme des tirets. Le témoin en
// bas de fichier rejoue ce tracé pour prouver que la garde MORD.
import { describe, it, expect } from "vitest";
import {
  rainStreakPixels, rainVeilDraws,
  splashPointOk, splashRingPixels, splashFramePixels,
} from "../iso/isoRenderer.js";

// Géométries réelles : dx = wind × len × 0,8, dy = len (cf. drawIsoRain).
// windX ∈ [-0,7 ; 0,7], couché jusqu'à ±1,24 par la rafale ; len de 10 (bruine)
// à 30 px (averse pleine sous bourrasque).
const CAS = [
  { dx: 0, dy: 10, w: 1, nom: "bruine sans vent" },
  { dx: 6, dy: 24, w: 2, nom: "averse, vent d'ouest" },
  { dx: -6, dy: 24, w: 2, nom: "averse, vent d'est" },
  { dx: 30, dy: 24, w: 2, nom: "rafale couchée, dx > dy" },
  { dx: -30, dy: 24, w: 2, nom: "rafale couchée à gauche" },
  { dx: 1, dy: 30, w: 3, nom: "trait épais, quasi vertical" },
];

// Nombre d'amas 8-connexes du nuage de pixels. Un escalier sain n'en fait qu'UN.
function amas(px) {
  const reste = new Map(px.map((p) => [p.x + "," + p.y, p]));
  let n = 0;
  while (reste.size) {
    n += 1;
    const pile = [reste.keys().next().value];
    while (pile.length) {
      const k = pile.pop();
      if (!reste.has(k)) continue;
      reste.delete(k);
      const [x, y] = k.split(",").map(Number);
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const v = (x + dx) + "," + (y + dy);
          if (reste.has(v)) pile.push(v);
        }
      }
    }
  }
  return n;
}

describe("goutte de pluie en pixels", () => {
  for (const c of CAS) {
    it(`${c.nom} : escalier d'un seul tenant, aucun trou`, () => {
      const s = rainStreakPixels(c.dx, c.dy, c.w);
      expect(s.px.length).toBeGreaterThan(0);
      expect(amas(s.px)).toBe(1);
    });

    it(`${c.nom} : rien ne déborde de l'étampe`, () => {
      // Un pixel hors boîte n'est pas rogné par putImageData : il REBOUCLE sur
      // la ligne d'à côté (l'index est plat). La goutte gagnerait un point isolé
      // du mauvais côté, à l'écran ça pique.
      const s = rainStreakPixels(c.dx, c.dy, c.w);
      for (const p of s.px) {
        expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThan(s.w);
        expect(p.y).toBeLessThan(s.h);
      }
    });

    it(`${c.nom} : la queue est posée en (ox,0), la tête au bout`, () => {
      // L'étampe est blittée à (x − ox, y) pour que la QUEUE tombe sur la
      // position tirée : si l'origine glisse, tout le rideau se décale au
      // changement de vent, et le décalage bouge AVEC la rafale.
      const s = rainStreakPixels(c.dx, c.dy, c.w);
      const aux = (x, y) => s.px.some((p) => p.x === x && p.y === y);
      expect(aux(s.ox, 0)).toBe(true);
      expect(aux(s.ox + Math.round(c.dx), Math.round(c.dy))).toBe(true);
    });
  }

  it("la tête porte l'encre, la queue s'efface", () => {
    const s = rainStreakPixels(4, 24, 2);
    const queue = s.px.filter((p) => p.y <= 2).reduce((m, p) => Math.max(m, p.a), 0);
    const tete = s.px.filter((p) => p.y >= 22).reduce((m, p) => Math.max(m, p.a), 0);
    expect(tete).toBeGreaterThan(queue + 0.3);
    expect(tete).toBeCloseTo(1, 5);
  });

  it("la goutte s'effile : plus étroite derrière que devant", () => {
    const s = rainStreakPixels(0, 24, 2);
    const large = (y) => s.px.filter((p) => p.y === y).length;
    expect(large(0)).toBe(1);
    expect(large(24)).toBe(2);
  });

  it("TÉMOIN : « un pixel par ligne » casse la goutte en tirets au vent fort", () => {
    // Sans ce témoin, les tests ci-dessus passeraient aussi sur un tracé naïf :
    // à vent faible il est parfaitement continu, et c'est là qu'on le regarde.
    const parLigne = (dx, dy) => {
      const px = [];
      for (let y = 0; y <= dy; y += 1) px.push({ x: Math.round((dx * y) / dy), y, a: 1 });
      return px;
    };
    expect(amas(parLigne(6, 24))).toBe(1);        // vent faible : le défaut est INVISIBLE
    expect(amas(parLigne(30, 24))).toBeGreaterThan(1);   // rafale : la goutte se disloque
    expect(amas(rainStreakPixels(30, 24, 1).px)).toBe(1);
  });
});

// ── LA NAPPE QUI REBOUCLE ───────────────────────────────────────────────────
// Le rideau n'est plus dessiné goutte par goutte : quatre nappes plein écran
// DÉFILENT, et une nappe se répète tous les LH pixels. Le défaut qu'on ne voit
// pas sur une image fixe : les gouttes semées près du bas dépassent la nappe et
// sont ROGNÉES, si bien qu'une bande vide large d'une goutte traverse l'écran à
// chaque tour. D'où la double pose (y, puis y − LH).
const LW = 1440, LH = 632, HH = 26;      // largeur, hauteur de nappe, hauteur d'une goutte

// Pour chaque ligne du motif RÉPÉTÉ, combien de gouttes la traversent.
function couvertureParLigne(poses) {
  const c = new Array(LH).fill(0);
  for (const p of poses) {
    for (let k = 0; k < HH; k += 1) {
      const y = p.y + k;
      if (y >= 0 && y < LH) c[y] += 1;    // ce qui sort de la nappe est ROGNÉ par le canvas
    }
  }
  return c;
}

describe("nappe de pluie qui défile", () => {
  it("sème sur les quatre voies, à parts égales", () => {
    // Une voie famélique = une vitesse de chute quasi absente du rideau.
    const par = [0, 0, 0, 0];
    for (const p of rainVeilDraws(400, LW, LH)) par[p.lane] += 1;
    for (const n of par) expect(n).toBe(200);            // 100 gouttes × 2 poses
  });

  // La couture est la bande d'une hauteur de goutte contre le HAUT de la nappe :
  // c'est là que retombe ce qui déborde par le bas.
  const moy = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const ratioCouture = (poses) => {
    const c = couvertureParLigne(poses);
    return moy(c.slice(0, HH)) / moy(c.slice(HH));
  };

  it("la couture est arrosée comme le reste de la nappe", () => {
    expect(ratioCouture(rainVeilDraws(600, LW, LH))).toBeGreaterThan(0.85);
  });

  it("TÉMOIN : sans la double pose, la couture se dégarnit", () => {
    // Sans ce témoin, le test ci-dessus passerait sur du code qui rogne. Et le
    // défaut ne se lit PAS comme un trou franc : la bande s'éclaircit en dégradé
    // sur 26 lignes de 632, et ne se voit qu'en MOUVEMENT, quand elle balaie
    // l'écran de haut en bas à chaque tour de nappe.
    const rogne = rainVeilDraws(600, LW, LH).filter((p) => p.y >= 0);
    expect(ratioCouture(rogne)).toBeLessThan(0.35);
  });

  it("les gouttes couvrent toute la largeur, marges comprises", () => {
    const xs = rainVeilDraws(600, LW, LH).map((p) => p.x);
    expect(Math.min(...xs)).toBeLessThan(LW * 0.02);
    expect(Math.max(...xs)).toBeGreaterThan(LW * 0.98);
  });
});

// ── IMPACTS AU SOL ──────────────────────────────────────────────────────────
// Deux règles portent tout l'effet, et aucune des deux ne se voit sur l'image
// où elle est respectée : l'anneau doit être ISO (un rond flotte au-dessus du
// pavé), et l'éclat n'a le droit de frapper que là où aucun sprite ne peut
// remonter par-dessus (la pluie passe après le peintre, elle ne peut plus
// passer DERRIÈRE quoi que ce soit).
const T = 32;
const cle = (gx, gy) => gx * 10000 + gy;
// Une bande de voirie de 6 cellules le long de y = 4.
const RUE = new Set([0, 1, 2, 3, 4, 5].map((x) => cle(x, 4)));
const centre = (gx, gy) => ({ wx: (gx + 0.5) * T, wy: (gy + 0.5) * T });

// Fiche peintre d'un bâtiment d'une cellule, à la façon de cityMapRuntime :
// `hauteur` en TUILES (2,2 pour une maison, 1,15 pour une scène basse).
const bati = (gx, gy, hauteur) => new Map([[cle(gx, gy), {
  x0: gx * T, x1: (gx + 1) * T,
  baseY: (gy + 1) * T, topY: ((gy + 1) - hauteur) * T, clipOnly: hauteur < 1.2,
}]]);

describe("impacts au sol : où on a le droit de frapper", () => {
  it("frappe la rue dégagée", () => {
    const p = centre(2, 4);
    expect(splashPointOk(RUE, new Map(), p.wx, p.wy, T)).toBe(true);
  });

  it("ne frappe jamais hors voirie", () => {
    const p = centre(2, 7);
    expect(splashPointOk(RUE, new Map(), p.wx, p.wy, T)).toBe(false);
  });

  it("recule devant la maison qui se dresse au sud", () => {
    // Maison de 2,2 tuiles sur (2,5) : son sprite remonte jusqu'à y = 3,8 tuile
    // et RECOUVRE le sol de (2,4). Un éclat y serait peint sur le toit.
    const p = centre(2, 4);
    expect(splashPointOk(RUE, bati(2, 5, 2.2), p.wx, p.wy, T)).toBe(false);
  });

  it("garde la rue quand le voisin sud est une scène BASSE", () => {
    // Champ, marché, atelier à plat : 1,15 tuile, son sprite ne remonte pas
    // jusqu'à nous. Un test cellulaire aurait refusé la rue entière.
    const p = centre(2, 4);
    expect(splashPointOk(RUE, bati(2, 5, 1.15), p.wx, p.wy, T)).toBe(true);
  });

  it("ignore le bâtiment d'à côté qui ne recouvre pas notre colonne", () => {
    const p = centre(2, 4);
    expect(splashPointOk(RUE, bati(4, 5, 2.2), p.wx, p.wy, T)).toBe(true);
  });

  it("voit la TOUR qui domine de trois rangées plus bas", () => {
    // Une maison de 2,2 tuiles basée si loin ne nous atteint pas (elle passe
    // juste en dessous), une tour de 4 tuiles si.
    const p = centre(2, 4);
    expect(splashPointOk(RUE, bati(2, 7, 2.2), p.wx, p.wy, T)).toBe(true);
    expect(splashPointOk(RUE, bati(2, 7, 4), p.wx, p.wy, T)).toBe(false);
  });

  it("TÉMOIN : sans la règle du peintre, l'éclat se pose sur le mur", () => {
    // Le test qu'on écrit spontanément — « la cellule est-elle de la voirie ? » —
    // accepte les deux cas d'occultation ci-dessus. C'est l'écart entre les deux
    // colonnes qui dit que la règle sert à quelque chose.
    const naif = (road, wx, wy) => road.has(cle(Math.floor(wx / T), Math.floor(wy / T)));
    const p = centre(2, 4);
    expect(naif(RUE, p.wx, p.wy)).toBe(true);
    expect(splashPointOk(RUE, bati(2, 5, 2.2), p.wx, p.wy, T)).toBe(false);
    expect(splashPointOk(RUE, bati(2, 7, 4), p.wx, p.wy, T)).toBe(false);
  });

  it("ni voirie ni fiches : le rendu ne tombe pas", () => {
    expect(splashPointOk(null, null, 64, 64, T)).toBe(false);
    const p = centre(2, 4);
    expect(splashPointOk(RUE, null, p.wx, p.wy, T)).toBe(true);
  });
});

describe("impacts au sol : la forme", () => {
  const etendue = (px) => ({
    w: Math.max(...px.map((p) => p.x)) - Math.min(...px.map((p) => p.x)) + 1,
    h: Math.max(...px.map((p) => p.y)) - Math.min(...px.map((p) => p.y)) + 1,
  });

  it("l'anneau est ISO : deux fois plus large que haut", () => {
    for (const rx of [2, 3, 5, 8, 12]) {
      const e = etendue(splashRingPixels(rx));
      expect(e.w / e.h).toBeGreaterThan(1.6);
      expect(e.w / e.h).toBeLessThan(2.6);
    }
  });

  it("TÉMOIN : un anneau ROND passerait pour un impact et flotterait", () => {
    // La version qu'on écrit sans y penser : un cercle. Rapport 1, et sur un sol
    // en losange il se lit comme une bille posée au-dessus du pavé.
    const rond = [];
    for (let i = 0; i < 64; i += 1) {
      const a = (i / 64) * Math.PI * 2;
      rond.push({ x: Math.round(Math.cos(a) * 6), y: Math.round(Math.sin(a) * 6) });
    }
    expect(etendue(rond).w / etendue(rond).h).toBeLessThan(1.2);
  });

  it("l'anneau est CLOS : aucun trou dans le tour", () => {
    // Un anneau troué ne se lit plus comme un anneau mais comme du bruit.
    const px = splashRingPixels(8);
    for (const p of px) {
      const voisins = px.filter((q) => q !== p
        && Math.abs(q.x - p.x) <= 1 && Math.abs(q.y - p.y) <= 1).length;
      expect(voisins).toBeGreaterThanOrEqual(2);
    }
  });

  it("en arcs, il ne reste que les deux flancs", () => {
    const arcs = splashRingPixels(8, true);
    expect(arcs.some((p) => p.x > 5)).toBe(true);
    expect(arcs.some((p) => p.x < -5)).toBe(true);
    expect(arcs.some((p) => Math.abs(p.x) < 3)).toBe(false);   // le haut et le bas sont partis
  });

  it("l'anneau S'OUVRE d'une image à l'autre", () => {
    // C'est TOUT l'effet : si les deux anneaux ont la même taille, l'éclat
    // clignote au lieu de s'ouvrir.
    for (const u of [20, 32, 64]) {
      const a = etendue(splashFramePixels(1, u)), b = etendue(splashFramePixels(2, u));
      expect(b.w).toBeGreaterThan(a.w * 1.4);
    }
  });

  it("le choc est ramassé, et l'origine tombe DANS l'encre", () => {
    // L'étampe se pose par rapport au point d'impact (0,0) : s'il sortait du
    // dessin, tous les éclats seraient décalés du même biais, invisible.
    for (const f of [0, 1, 2]) {
      const px = splashFramePixels(f, 32);
      expect(Math.min(...px.map((p) => p.x))).toBeLessThanOrEqual(0);
      expect(Math.max(...px.map((p) => p.x))).toBeGreaterThanOrEqual(0);
    }
    expect(etendue(splashFramePixels(0, 32)).w)
      .toBeLessThan(etendue(splashFramePixels(1, 32)).w);
  });

  it("suit le zoom sans jamais tomber sous le pixel", () => {
    // Au dézoom l'éclat reste un pixel d'art ; au zoom il ne devient pas un pavé.
    expect(etendue(splashFramePixels(1, 4)).w).toBeGreaterThanOrEqual(3);
    expect(etendue(splashFramePixels(2, 96)).w)
      .toBeGreaterThan(etendue(splashFramePixels(2, 24)).w);
  });
});
