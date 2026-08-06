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
  splashPointOk, splashRingPixels, splashDiskPixels, splashFramePixels, splashPhase,
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
    expect(splashPointOk(RUE, new Map(), null, p.wx, p.wy, T)).toBe(true);
  });

  it("ne frappe jamais hors voirie", () => {
    const p = centre(2, 7);
    expect(splashPointOk(RUE, new Map(), null, p.wx, p.wy, T)).toBe(false);
  });

  it("recule devant la maison qui se dresse au sud", () => {
    // Maison de 2,2 tuiles sur (2,5) : son sprite remonte jusqu'à y = 3,8 tuile
    // et RECOUVRE le sol de (2,4). Un éclat y serait peint sur le toit.
    const p = centre(2, 4);
    expect(splashPointOk(RUE, bati(2, 5, 2.2), null, p.wx, p.wy, T)).toBe(false);
  });

  it("garde la rue quand le voisin sud est une scène BASSE", () => {
    // Champ, marché, atelier à plat : 1,15 tuile, son sprite ne remonte pas
    // jusqu'à nous. Un test cellulaire aurait refusé la rue entière.
    const p = centre(2, 4);
    expect(splashPointOk(RUE, bati(2, 5, 1.15), null, p.wx, p.wy, T)).toBe(true);
  });

  it("ignore le bâtiment d'à côté qui ne recouvre pas notre colonne", () => {
    const p = centre(2, 4);
    expect(splashPointOk(RUE, bati(4, 5, 2.2), null, p.wx, p.wy, T)).toBe(true);
  });

  it("voit la TOUR qui domine de trois rangées plus bas", () => {
    // Une maison de 2,2 tuiles basée si loin ne nous atteint pas (elle passe
    // juste en dessous), une tour de 4 tuiles si.
    const p = centre(2, 4);
    expect(splashPointOk(RUE, bati(2, 7, 2.2), null, p.wx, p.wy, T)).toBe(true);
    expect(splashPointOk(RUE, bati(2, 7, 4), null, p.wx, p.wy, T)).toBe(false);
  });

  it("TÉMOIN : sans la règle du peintre, l'éclat se pose sur le mur", () => {
    // Le test qu'on écrit spontanément — « la cellule est-elle de la voirie ? » —
    // accepte les deux cas d'occultation ci-dessus. C'est l'écart entre les deux
    // colonnes qui dit que la règle sert à quelque chose.
    const naif = (road, wx, wy) => road.has(cle(Math.floor(wx / T), Math.floor(wy / T)));
    const p = centre(2, 4);
    expect(naif(RUE, p.wx, p.wy)).toBe(true);
    expect(splashPointOk(RUE, bati(2, 5, 2.2), null, p.wx, p.wy, T)).toBe(false);
    expect(splashPointOk(RUE, bati(2, 7, 4), null, p.wx, p.wy, T)).toBe(false);
  });

  it("recule devant l'ARBRE, dont la cime retombe sur le pavé", () => {
    // Retour Raph : « il y a des impacts d'eau sur les arbres ». Un arbre n'a
    // pas de fiche peintre — il est juste HAUT, et sa cime tombe deux ou trois
    // cellules plus au nord, pile là où l'éclat visait.
    const p = centre(2, 4);
    expect(splashPointOk(RUE, null, new Set([cle(2, 4)]), p.wx, p.wy, T)).toBe(false);  // sous l'arbre
    expect(splashPointOk(RUE, null, new Set([cle(3, 5)]), p.wx, p.wy, T)).toBe(false);  // sa cime
    expect(splashPointOk(RUE, null, new Set([cle(4, 6)]), p.wx, p.wy, T)).toBe(false);  // encore
  });

  it("l'arbre au NORD, lui, ne gêne pas", () => {
    // Il est derrière nous chez le peintre : son sprite ne peut pas nous
    // recouvrir. Refuser aussi ce côté-là, ce serait vider les allées bordées.
    const p = centre(2, 4);
    expect(splashPointOk(RUE, null, new Set([cle(1, 3)]), p.wx, p.wy, T)).toBe(true);
    expect(splashPointOk(RUE, null, new Set([cle(2, 2)]), p.wx, p.wy, T)).toBe(true);
  });

  it("TÉMOIN : sans l'écart aux arbres, l'anneau se pose sur la canopée", () => {
    const naif = (road, wx, wy) => road.has(cle(Math.floor(wx / T), Math.floor(wy / T)));
    const p = centre(2, 4);
    expect(naif(RUE, p.wx, p.wy)).toBe(true);
    expect(splashPointOk(RUE, null, new Set([cle(3, 5)]), p.wx, p.wy, T)).toBe(false);
  });

  it("ni voirie ni fiches : le rendu ne tombe pas", () => {
    expect(splashPointOk(null, null, null, 64, 64, T)).toBe(false);
    const p = centre(2, 4);
    expect(splashPointOk(RUE, null, null, p.wx, p.wy, T)).toBe(true);
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
      expect(b.w).toBeGreaterThan(a.w * 1.35);
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

  it("le sol s'ASSOMBRIT dans l'anneau, et seulement dedans", () => {
    // Demande de Raph : la tache mouillée. Elle doit rester STRICTEMENT à
    // l'intérieur du tour — un disque sombre plus large que l'anneau ne se lit
    // plus comme du pavé mouillé mais comme une ombre portée, et un impact de
    // pluie ne porte pas d'ombre.
    for (const f of [0, 1, 2]) {
      const px = splashFramePixels(f, 42);
      const sombre = px.filter((p) => p.c === 1), clair = px.filter((p) => p.c === 0);
      expect(sombre.length).toBeGreaterThan(0);
      expect(clair.length).toBeGreaterThan(0);
      const bord = (l) => Math.max(...l.map((p) => Math.abs(p.x)));
      expect(bord(sombre)).toBeLessThanOrEqual(bord(clair));
    }
  });

  it("la tache mouillée S'EFFACE quand l'anneau s'ouvre", () => {
    const opac = (f) => Math.max(...splashFramePixels(f, 42).filter((p) => p.c === 1).map((p) => p.a));
    expect(opac(1)).toBeGreaterThan(opac(2));
  });

  it("le disque mouillé est ISO comme l'anneau, sinon il déborde du tour", () => {
    for (const rx of [3, 5, 8, 12]) {
      const d = splashDiskPixels(rx), r = splashRingPixels(rx);
      const ext = (l) => [Math.max(...l.map((p) => Math.abs(p.x))), Math.max(...l.map((p) => Math.abs(p.y)))];
      expect(ext(d)).toEqual(ext(r));
      // et il est PLEIN : chaque ligne de l'ellipse est continue
      for (let y = -ext(d)[1]; y <= ext(d)[1]; y += 1) {
        const xs = d.filter((p) => p.y === y).map((p) => p.x).sort((a, b) => a - b);
        expect(xs.length).toBe(xs[xs.length - 1] - xs[0] + 1);
      }
    }
  });

  it("la tache ne CHANGE PAS d'encre au moment où l'anneau part", () => {
    // Image 2 et image 3 partagent le même disque : si leur opacité propre
    // diffère, la tache s'assombrit ou s'éclaircit d'un coup au raccord — et
    // l'assombrissement du contexte, lui, est déjà continu, donc rien ne le
    // rattraperait.
    const wet = (f) => splashFramePixels(f, 42).filter((p) => p.c === 1)[0].a;
    expect(wet(3)).toBe(wet(2));
  });

  it("la tache reste SEULE quand l'eau est retombée", () => {
    // Image 3 : plus une goutte claire, rien que le pavé mouillé.
    const px = splashFramePixels(3, 42);
    expect(px.every((p) => p.c === 1)).toBe(true);
    // et elle a exactement l'empreinte de la tache de l'image d'avant
    const disque = (l) => l.filter((p) => p.c === 1);
    const ext = (l) => Math.max(...l.map((p) => Math.abs(p.x)));
    expect(ext(px)).toBe(ext(disque(splashFramePixels(2, 42))));
  });

  it("suit le zoom sans jamais tomber sous le pixel", () => {
    // Au dézoom l'éclat reste un pixel d'art ; au zoom il ne devient pas un pavé.
    expect(etendue(splashFramePixels(1, 4)).w).toBeGreaterThanOrEqual(3);
    expect(etendue(splashFramePixels(2, 96)).w)
      .toBeGreaterThan(etendue(splashFramePixels(2, 24)).w);
  });
});

// ── LA TACHE SURVIT À L'ÉCLAT ───────────────────────────────────────────────
// Demande de Raph : « la tache sombre reste un peu plus longtemps que
// l'impact ». Deux durées au lieu d'une, donc un RACCORD — et un raccord raté
// est un saut d'opacité sur une image, qu'on ne voit ni en relisant le code ni
// sur un cliché.
const VIE = 260, TRAINE = 900;         // cf. SPLASH_LIFE / SPLASH_WET_TAIL

describe("rémanence de la tache mouillée", () => {
  it("l'anneau vit sa vie, la tache lui survit", () => {
    expect(splashPhase(0).frame).toBe(0);
    expect(splashPhase(VIE * 0.5).frame).toBe(1);
    expect(splashPhase(VIE * 0.9).frame).toBe(2);
    expect(splashPhase(VIE + 10).frame).toBe(3);        // l'eau est retombée
    expect(splashPhase(VIE + TRAINE - 10).frame).toBe(3);
  });

  it("le raccord ne SAUTE pas", () => {
    // Juste avant et juste après le passage à la tache seule, l'opacité doit
    // être la même — c'est le seul instant où deux formules se rejoignent.
    const avant = splashPhase(VIE).k, apres = splashPhase(VIE + 1).k;
    expect(Math.abs(avant - apres)).toBeLessThan(0.01);
  });

  it("TÉMOIN : sans la traîne, l'opacité tombait de 0,55 à rien d'un coup", () => {
    // La version d'avant : l'éclat mourait à VIE. Le geste demandé n'a de sens
    // que si ce qui suit est CONTINU, pas si on rallonge un plateau.
    const sansTraine = (age) => (age > VIE ? null : { k: 1 - (age / VIE) * 0.45 });
    expect(sansTraine(VIE + 1)).toBe(null);
    expect(splashPhase(VIE + 1).k).toBeCloseTo(0.55, 2);
  });

  it("s'éteint en fondu, et ne revient jamais", () => {
    expect(splashPhase(VIE + TRAINE).k).toBeCloseTo(0, 5);
    expect(splashPhase(VIE + TRAINE + 1)).toBe(null);
    expect(splashPhase(-1)).toBe(null);
    // décroissance stricte sur toute la traîne
    let prec = Infinity;
    for (let t = VIE; t <= VIE + TRAINE; t += 20) {
      const k = splashPhase(t).k;
      expect(k).toBeLessThan(prec + 1e-9);
      prec = k;
    }
  });

  it("elle TIENT avant de partir, elle ne s'évapore pas aussitôt", () => {
    // À mi-traîne, un fondu linéaire n'aurait plus que la moitié de son encre —
    // et à un dixième d'opacité une fois posée sur le pavé, il ne resterait rien
    // à voir. On aurait allongé la durée sans rien montrer de plus.
    const debut = splashPhase(VIE + 1).k;
    const milieu = splashPhase(VIE + TRAINE / 2).k;
    expect(milieu).toBeGreaterThan(debut * 0.65);        // linéaire donnerait 0,50
  });

  it("la tache dure plus longtemps que l'éclat, sans l'écraser", () => {
    // Assez pour se voir (Raph l'a demandée deux fois plus longue), pas au point
    // de laisser une flaque permanente : au-delà, le pavé ne sèche plus jamais
    // entre deux gouttes et la ville prend un voile sombre qu'on ne s'explique
    // pas. La borne haute est là pour ça, pas par frilosité.
    expect(TRAINE).toBeGreaterThan(VIE * 2);
    expect(TRAINE).toBeLessThan(VIE * 5);
  });
});
