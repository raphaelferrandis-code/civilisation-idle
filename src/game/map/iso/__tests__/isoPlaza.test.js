import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { CM } from "../../layout.js";
import {
  isoPlazaBox, isoPlazaBoxes, isoPlazaCells, isoPlazaComposition, isoPlazaCompositions, plazaEraForBand,
  isoPlazaKitOn, isoPlazaSceneOn, isoPlazaSceneCoversGround, plazaAnchor, grateFit,
  PLAZA_TUNE, RECIPES, HOUSE_HT, TALL_PROPS, personHT,
} from "../isoPlaza.js";

// ── CE QUE CES TESTS PROTÈGENT ──────────────────────────────────────────────
// Le bug d'origine : la place était UNE image étirée sur son emprise, donc un
// banc grossissait avec la place (5×5 → banc large comme une maison). La
// correction n'est pas un réglage, c'est un INVARIANT :
//
//     taille écran d'un prop = hT × TILE × zoom     ← et RIEN d'autre
//
// Un test qui recalculerait cette formule pour la comparer à elle-même serait
// DÉCORATIF (leçon du lot « Comprendre ses chiffres » : mes gardes passaient
// 14/14 sur deux dérives volontaires parce qu'elles s'auto-comparaient). Donc
// ici les tailles attendues sont écrites EN DUR en pixels, et la garde de
// non-dépendance compare deux places de tailles DIFFÉRENTES.

// Hauteur effective d'un poste de recette, résolue comme la composition le fait :
// le mobilier est déclaré en `p` (multiples d'habitant), pas en tuiles.
const effHT = (post) => (post.p != null ? post.p * personHT() : post.hT);

// Place carrée de `n` cellules, coin en (gx0, gy0), au format roadMap du layout.
function plazaLayout(n, gx0 = 10, gy0 = 10, extra = []) {
  const roadMap = new Map();
  for (let iy = 0; iy < n; iy += 1) {
    for (let ix = 0; ix < n; ix += 1) {
      const gx = gx0 + ix, gy = gy0 + iy;
      roadMap.set(gx + "," + gy, { gx, gy, rank: "plaza" });
    }
  }
  // Cellules 'plaza' ISOLÉES ailleurs sur la carte : elles existent en vrai et
  // gonflaient la bbox à la ville entière avant le flood-fill.
  for (const [gx, gy] of extra) roadMap.set(gx + "," + gy, { gx, gy, rank: "plaza" });
  return { roadMap };
}

// Remet la molette à son état d'usine : un test qui laisse `only` ou `density`
// armé empoisonne tous les suivants (piège vu sur les molettes de la carte).
const TUNE0 = { ...PLAZA_TUNE, hT: {} };
function resetTune(over) {
  Object.assign(PLAZA_TUNE, TUNE0, { hT: {} }, over || {});
  PLAZA_TUNE.rev += 1;
}

let recomputeAt = 0;
beforeEach(() => {
  CM.TILE = 32;
  CM.cw = 800; CM.ch = 600;
  CM.cam = { x: 0, y: 0, zoom: 1 };
  CM.iso = true;
  recomputeAt += 1;
  CM.layoutRecomputeAt = recomputeAt;
  resetTune();
});
afterEach(() => { CM.iso = false; resetTune(); });

// Nouvelle identité de layout : sans ça la composition mémoïsée d'un test
// précédent ressort telle quelle.
function freshLayout(...args) {
  recomputeAt += 1;
  CM.layoutRecomputeAt = recomputeAt;
  return plazaLayout(...args);
}

// Colle plusieurs places carrées dans un même layout.
function multiPlazas(specs, extra = []) {
  recomputeAt += 1;
  CM.layoutRecomputeAt = recomputeAt;
  const roadMap = new Map();
  for (const [n, gx0, gy0] of specs) {
    for (let iy = 0; iy < n; iy += 1) {
      for (let ix = 0; ix < n; ix += 1) {
        const gx = gx0 + ix, gy = gy0 + iy;
        roadMap.set(gx + "," + gy, { gx, gy, rank: "plaza" });
      }
    }
  }
  for (const [gx, gy] of extra) roadMap.set(gx + "," + gy, { gx, gy, rank: "plaza" });
  return { roadMap };
}

describe("emprise des places", () => {
  it("découpe en composantes connexes, pas en une bbox de toutes les cellules", () => {
    const L = freshLayout(5, 10, 10, [[40, 40], [41, 41]]);
    expect(isoPlazaBox(L)).toMatchObject({ gx0: 10, gx1: 14, gy0: 10, gy1: 14 });
  });

  it("rend null quand aucune cellule de place n'existe", () => {
    recomputeAt += 1; CM.layoutRecomputeAt = recomputeAt;
    expect(isoPlazaBox({ roadMap: new Map() })).toBe(null);
  });

  it("rend TOUTES les places, pas seulement la plus grande", () => {
    // Le défaut signalé : « il n'y a que la place centrale qui construit, les
    // autres ont le sol mais aucun élément ». Ne garder que la plus grande
    // composante était un garde-fou contre une bbox géante — il jetait au
    // passage toutes les places de quartier.
    const L = multiPlazas([[6, 10, 10], [4, 30, 30], [5, 10, 40]]);
    const boxes = isoPlazaBoxes(L);
    expect(boxes).toHaveLength(3);
    // Triées par taille : la centrale d'abord, et c'est elle que rend isoPlazaBox.
    expect(boxes[0]).toMatchObject({ gx0: 10, gy0: 10 });
    expect(isoPlazaBox(L)).toBe(boxes[0]);
  });

  it("écarte les cellules 'plaza' ÉGARÉES, qui ne sont pas des places", () => {
    // Des cellules plaza isolées existent dans le réseau de rues. Une composante
    // trop petite pour porter une composition n'est pas une place.
    const L = multiPlazas([[5, 10, 10]], [[40, 40], [41, 40], [40, 41], [41, 41]]);
    const boxes = isoPlazaBoxes(L);
    expect(boxes).toHaveLength(1);          // le carré 2×2 égaré est écarté
    expect(boxes[0]).toMatchObject({ gx0: 10, gx1: 14 });
  });

  it("chaque place est meublée, et deux places ne se ressemblent pas", () => {
    const L = multiPlazas([[6, 10, 10], [5, 30, 30], [5, 10, 40]]);
    const comps = isoPlazaCompositions(L, 3);
    expect(comps).toHaveLength(3);
    for (const c of comps) {
      expect(c.props.length, `place ${c.box.gx0},${c.box.gy0}`).toBeGreaterThan(10);
      expect(c.centrePris).toBe(true);
      expect(c.lamps).toHaveLength(4);
    }
    // Les deux places 5×5 ont la même géométrie mais pas le même tirage : la
    // graine porte le COIN de la place, pas son rang.
    const [, a, b] = comps;
    const suite = (c) => c.props.map((p) => p.prop).join();
    expect(suite(a)).not.toBe(suite(b));
  });
});

describe("rôles des cellules", () => {
  it("partitionne l'emprise : coins, anneau extérieur, intérieur", () => {
    const L = freshLayout(5);
    const cells = isoPlazaCells(L, isoPlazaBox(L));
    expect(cells).toHaveLength(25);
    const byRole = {};
    for (const c of cells) byRole[c.role] = (byRole[c.role] || 0) + 1;
    expect(byRole).toEqual({ corner: 4, edge: 12, inner: 9 });
    // Aucune cellule comptée deux fois.
    expect(new Set(cells.map((c) => c.gx + "," + c.gy)).size).toBe(25);
  });

  it("écarte les trous : une composante non rectangulaire ne meuble pas le vide", () => {
    const L = freshLayout(4);
    L.roadMap.delete("11,11");                  // un trou au milieu
    recomputeAt += 1; CM.layoutRecomputeAt = recomputeAt;
    const cells = isoPlazaCells(L, isoPlazaBox(L));
    expect(cells).toHaveLength(15);
    expect(cells.some((c) => c.gx === 11 && c.gy === 11)).toBe(false);
  });
});

describe("INVARIANT D'ÉCHELLE — le bug d'origine", () => {
  // La garde centrale. Deux places de tailles très différentes doivent produire
  // EXACTEMENT les mêmes hauteurs de props. C'est ce qui était faux : la scène
  // unique donnait une taille ∝ (largeur + hauteur) de la place.
  it("un prop garde sa taille quand la place passe de 4×4 à 8×8", () => {
    const small = isoPlazaComposition(freshLayout(4), 3);
    const big = isoPlazaComposition(freshLayout(8), 3);
    const hOf = (comp, prop) => [...new Set(comp.props.filter((p) => p.prop === prop).map((p) => p.hT))];
    for (const prop of ["bench", "fountain"]) {
      const a = hOf(small, prop), b = hOf(big, prop);
      expect(a.length).toBeGreaterThan(0);
      expect(b).toEqual(a);          // ← LE point : la taille ne bouge PAS
    }
    // Ce qui suit la taille de la place, c'est l'écartement, et le NOMBRE quand
    // le côté est trop court pour tenir la composition complète.
    const spread = (comp) => {
      const xs = comp.props.filter((p) => p.prop === "bench").map((p) => p.wx);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(spread(big)).toBeGreaterThan(spread(small));
  });

  it("le côté trop court REND des bancs au lieu de les empiler", () => {
    // Une place 4×4 (le plancher de cityPlan) ne peut pas loger 2 bancs + 2
    // compagnons par côté sans que les coins se télescopent : elle retombe à 1
    // par côté. C'est un arbitrage EXPLICITE, pas une suppression silencieuse
    // par le filet anti-chevauchement.
    // Les bancs vont par DUOS : un côté loge un ou plusieurs groupes, jamais un
    // banc seul. Une place 4×4 tient UN duo par côté, une 5×5 en tient deux.
    expect(isoPlazaComposition(freshLayout(4), 3).benchPerSide).toBe(2);
    expect(isoPlazaComposition(freshLayout(5), 3).benchPerSide).toBe(4);
    // 8 bancs + 8 bacs + 1 fontaine + 1 arbre + sa margelle en DEUX morceaux ;
    // puis 16 bancs + 12 bacs + 1 + 2 arbres + 4 morceaux.
    expect(isoPlazaComposition(freshLayout(4), 3).props).toHaveLength(20);
    expect(isoPlazaComposition(freshLayout(5), 3).props).toHaveLength(35);
  });

  it("les hauteurs écran sont celles attendues EN DUR (TILE 32, zoom 1)", () => {
    // Écrites à la main depuis les recettes, pas recalculées : si houseF, HOUSE_HT
    // ou une recette dérivent, ce test tombe. HOUSE_HT = 2.05 → une maison fait
    // 65,6 px de haut à TILE 32 / zoom 1.
    expect(HOUSE_HT).toBe(2.05);
    expect(HOUSE_HT * CM.TILE * CM.cam.zoom).toBeCloseTo(65.6, 1);
    const comp = isoPlazaComposition(freshLayout(5), 3);   // ère antique
    const bench = comp.props.find((p) => p.prop === "bench");
    expect(bench).toBeTruthy();
    // Le MOBILIER est à l'échelle du CORPS : un habitant adulte est dessiné à
    // 0.85 × AGENT_SCALE = 0.425 tuile de haut, soit 13,6 px ici.
    expect(personHT()).toBeCloseTo(0.425, 4);
    // banc = 0.70 habitant → hT 0.2975 → 9,5 px de haut, 15,2 px de large.
    expect(bench.hT).toBeCloseTo(0.2975, 4);
    expect(bench.hT * CM.TILE * CM.cam.zoom).toBeCloseTo(9.5, 1);
    const fountain = comp.props.find((p) => p.prop === "fountain");
    // fontaine ANTIQUE = 1.25 habitant → hT 0.5313 → 17,0 px. La plus PETITE de
    // la progression : elle grandit jusqu'à 2.60 habitants au cosmique.
    expect(fountain.hT).toBeCloseTo(0.5313, 4);
    expect(fountain.hT * CM.TILE * CM.cam.zoom).toBeCloseTo(17.0, 1);
  });

  it("plafond de sécurité : aucun MOBILIER n'atteint la taille d'une maison", () => {
    // C'est EXACTEMENT le symptôme signalé (« les bancs font la taille d'une
    // maison quasiment »). Un demi-toit de maison est la limite du mobilier.
    // Les accents verticaux (mât, statue) sont FAITS pour dépasser : ils ont
    // leur propre plafond, et un prop haut oublié dans TALL_PROPS tombe ici.
    for (const era of Object.keys(RECIPES)) {
      const R = RECIPES[era];
      const posts = [{ prop: "bench", ...R.bench }, ...(R.side || [])];
      for (const post of posts) {
        const cap = TALL_PROPS.has(post.prop) ? HOUSE_HT : HOUSE_HT * 0.5;
        expect(effHT(post), era + "/" + post.prop).toBeLessThan(cap);
      }
      // La pièce maîtresse a droit à plus — elle grandit d'ère en ère — mais
      // jamais au-delà d'une maison : au-delà ce n'est plus du mobilier.
      expect(effHT(R.centre), era + "/centre").toBeLessThan(HOUSE_HT);
    }
  });

  it("le plafond du mobilier MORD vraiment (garde de la garde)", () => {
    // Une garde qu'on n'a jamais vue échouer ne prouve rien. On rejoue ici le
    // défaut d'origine — un banc à la taille d'une maison — et on vérifie que
    // le plafond le refuse. Sans ce test, une recette pourrait passer à 2.0
    // sans que rien ne bronche.
    const banc = { prop: "bench", hT: HOUSE_HT * 0.9 };
    expect(TALL_PROPS.has(banc.prop)).toBe(false);
    expect(banc.hT).toBeGreaterThan(HOUSE_HT * 0.5);
  });
});

describe("déterminisme", () => {
  it("deux appels sur le même layout donnent la même composition", () => {
    const L = freshLayout(5);
    const a = isoPlazaComposition(L, 3);
    const b = isoPlazaComposition(L, 3);
    expect(b.props).toEqual(a.props);
  });

  it("le tirage ne dépend pas de l'identité de l'objet layout, seulement des cellules", () => {
    const a = isoPlazaComposition(freshLayout(5), 3);
    const b = isoPlazaComposition(freshLayout(5), 3);
    expect(b.props.map((p) => p.prop + "@" + p.wx + "," + p.wy))
      .toEqual(a.props.map((p) => p.prop + "@" + p.wx + "," + p.wy));
  });

  it("changer le seed rebat les tirages sans toucher la géométrie", () => {
    // Toutes les recettes n'ont plus qu'UN compagnon (les bornes cosmiques sont
    // sorties, faute d'art) : le seul tirage qui reste est la VARIANTE d'arbre.
    const a = isoPlazaComposition(freshLayout(6), 3);
    resetTune({ seed: 7 });
    const b = isoPlazaComposition(freshLayout(6), 3);
    // Même nombre de props et mêmes positions : la composition est fixe.
    expect(b.props.length).toBe(a.props.length);
    expect(b.props.map((p) => p.wx + "," + p.wy)).toEqual(a.props.map((p) => p.wx + "," + p.wy));
    // Mais les variantes d'arbre, elles, ont bougé.
    const vs = (c) => c.props.filter((p) => p.prop === "tree").map((p) => p.tr._tv).join();
    expect(vs(b)).not.toBe(vs(a));
  });

  it("le tirage des variantes n'est pas dégénéré (piège du bit faible de cmHash)", () => {
    // cmHash est un FNV-1a dont le bit faible n'est que la parité de l'entrée :
    // consommé brut sur des coordonnées, il donne un damier ou une valeur unique
    // au lieu d'un tirage. On vérifie que les 4 variantes d'arbre sortent toutes
    // sur un échantillon de graines — c'est le seul tirage encore vivant, donc
    // le seul endroit où la faute pourrait se cacher.
    const seen = new Set();
    for (let seed = 0; seed < 12; seed += 1) {
      resetTune({ seed });
      for (const p of isoPlazaComposition(freshLayout(6), 3).props) {
        if (p.prop === "tree") seen.add(p.tr._tv);
      }
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("LA COMPOSITION DEMANDÉE", () => {
  // Retour Raph 2026-07-29 : « fontaine au milieu, 2 bancs sur chaque côté, avec
  // un buisson / pot de fleur à côté. Les lampadaires au coin sont bons. »
  it("une fontaine au milieu, exactement", () => {
    const comp = isoPlazaComposition(freshLayout(5), 3);
    const f = comp.props.filter((p) => p.prop === "fountain");
    expect(f).toHaveLength(1);
    expect(f[0].wx / CM.TILE).toBeCloseTo(comp.cxc, 6);
    expect(f[0].wy / CM.TILE).toBeCloseTo(comp.cyc, 6);
  });

  it("autant de bancs par côté, un par face, tournés vers le centre", () => {
    const comp = isoPlazaComposition(freshLayout(5), 3);
    const benches = comp.props.filter((p) => p.prop === "bench");
    const n = comp.benchPerSide;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(benches).toHaveLength(n * 4);
    const perFace = {};
    for (const b of benches) perFace[b.variant] = (perFace[b.variant] || 0) + 1;
    expect(perFace).toEqual({ n, s: n, e: n, w: n });
  });

  it("les bacs garnissent les intervalles, toujours au contact d'un duo", () => {
    // Les bacs ne sont plus attachés à UN banc : ils se logent dans les creux de
    // la rangée (les deux bouts, et entre deux duos). Ils sont la GARNITURE —
    // s'il manque la place pour l'un, le filet le refuse et c'est sans gravité.
    // Ce qui ne doit jamais sauter en silence, ce sont les bancs.
    const comp = isoPlazaComposition(freshLayout(5), 3);
    const benches = comp.props.filter((p) => p.prop === "bench");
    const mates = comp.props.filter((p) => !["bench", "fountain", "tree", "grate"].includes(p.prop));
    expect(mates.length).toBeGreaterThanOrEqual(4);        // au moins un par côté
    expect(mates.length).toBeLessThanOrEqual(benches.length);
    const T = CM.TILE;
    for (const m of mates) {
      const proche = benches.some((x) => Math.hypot(x.wx - m.wx, x.wy - m.wy) / T <= 1);
      expect(proche, m.prop + "@" + m.wx + "," + m.wy).toBe(true);
    }
  });

  it("le compagnon suit l'angle de son banc", () => {
    // Un bac rectangulaire posé le long d'un bord doit avoir la même face que
    // le banc auquel il est accolé, sinon les deux se croisent à l'écran.
    const comp = isoPlazaComposition(freshLayout(5), 3);
    const T = CM.TILE;
    const benches = comp.props.filter((p) => p.prop === "bench");
    const mates = comp.props.filter((p) => !["bench", "fountain", "tree", "grate"].includes(p.prop));
    expect(mates.length).toBeGreaterThan(0);
    for (const m of mates) {
      // ⚠ Chercher « le banc le plus proche » ne suffit PAS : un bac de bout de
      // rangée est parfois plus près d'un banc du côté ADJACENT que des siens.
      // Ce qu'on vérifie, c'est qu'il a bien un banc DE SA FACE au contact.
      const sien = benches.some((x) => x.variant === m.variant
        && Math.hypot(x.wx - m.wx, x.wy - m.wy) / T <= 1);
      expect(sien, m.prop + " sans banc de sa face au contact").toBe(true);
    }
  });

  it("des ARBRES sur la place, jamais de buisson", () => {
    // Retour Raph 2026-07-29 : « ces buissons n'ont pas lieu d'être. Il faudrait
    // des arbres sur la place plutôt. 1 ou 2 max. »
    for (const era of Object.keys(RECIPES)) {
      const pools = [{ prop: "bench" }, ...RECIPES[era].side];
      expect(pools.some((p) => p.prop === "bush"), era).toBe(false);
    }
    const comp = isoPlazaComposition(freshLayout(5), 3);
    expect(comp.props.some((p) => p.prop === "bush")).toBe(false);
    expect(comp.props.filter((p) => p.prop === "tree").length).toBeGreaterThan(0);
  });

  it("1 ou 2 arbres, jamais plus, et le compte suit l'emprise", () => {
    expect(isoPlazaComposition(freshLayout(4), 3).trees).toBe(1);
    expect(isoPlazaComposition(freshLayout(5), 3).trees).toBe(2);
    expect(isoPlazaComposition(freshLayout(12), 3).trees).toBe(2);   // plafonné
    resetTune({ treeMax: 0 });
    expect(isoPlazaComposition(freshLayout(6), 3).trees).toBe(0);
  });

  it("un arbre de place est un ARBRE DE LA CARTE, pas un sosie", () => {
    // Il porte un `tr` au format des arbres du renderer : même sprites, même
    // teinte de saison, même batching. Si ce contrat casse, l'arbre de place
    // divergera visuellement de ceux qui l'entourent.
    const T = CM.TILE;
    for (const p of isoPlazaComposition(freshLayout(5), 3).props.filter((x) => x.prop === "tree")) {
      expect(p.tr).toBeTruthy();
      expect(p.tr.r).toBe(PLAZA_TUNE.treeR);
      expect(p.tr._tv).toBeGreaterThanOrEqual(1);
      expect(p.tr._tv).toBeLessThanOrEqual(4);
      // L'ancre de la carte est (gx + 0.5 + jx, gy + 0.9 + jy) : elle doit
      // retomber EXACTEMENT sur la position voulue, sinon l'arbre dérive.
      expect((p.tr.gx + 0.5 + p.tr.jx) * T).toBeCloseTo(p.wx, 6);
      expect((p.tr.gy + 0.9 + p.tr.jy) * T).toBeCloseTo(p.wy, 6);
    }
  });

  it("un lampadaire à chaque coin", () => {
    const comp = isoPlazaComposition(freshLayout(5), 3);
    expect(comp.lamps).toHaveLength(4);          // recette antique = 'corners'
  });

  it("AUCUN chevauchement d'empreinte à l'écran", () => {
    // Le second défaut signalé (« les éléments se chevauchent »). On refait le
    // test d'empreinte du filet, en espace ÉCRAN — deux props éloignés dans le
    // monde peuvent se superposer à l'écran en iso.
    const T = CM.TILE;
    for (const n of [4, 5, 6, 8]) {
      const comp = isoPlazaComposition(freshLayout(n), 3);
      // La GRILLE est exclue : elle cercle le pied de son arbre, donc elle le
      // chevauche PAR CONSTRUCTION. C'est le seul recouvrement voulu.
      const boxes = comp.props.filter((p) => p.prop !== "grate").map((p) => {
        const gx = p.wx / T, gy = p.wy / T;
        const hw = p.hT * 0.8;                   // majorant large de la demi-largeur
        return { sx: gx - gy, sy: (gx + gy) * 0.5, hw, hh: hw * 0.4, prop: p.prop };
      });
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i], b = boxes[j];
          const clash = Math.abs(a.sx - b.sx) < (a.hw + b.hw) * 0.5
            && Math.abs(a.sy - b.sy) < (a.hh + b.hh) * 0.5;
          expect(clash, n + "×" + n + " : " + a.prop + " ∩ " + b.prop).toBe(false);
        }
      }
    }
  });
});

describe("placement", () => {
  it("rien ne se pose sur la pièce maîtresse", () => {
    const comp = isoPlazaComposition(freshLayout(7), 3);
    const T = CM.TILE;
    for (const p of comp.props) {
      if (p.prop === RECIPES.antique.centre.prop && p.wx === comp.cxc * T) continue;
      const d = Math.hypot(p.wx / T - comp.cxc, p.wy / T - comp.cyc);
      expect(d, p.prop).toBeGreaterThanOrEqual(PLAZA_TUNE.coreR - 1e-9);
    }
  });

  it("tout le mobilier reste dans l'emprise de la place", () => {
    const comp = isoPlazaComposition(freshLayout(6), 3);
    const T = CM.TILE, b = comp.box;
    for (const p of comp.props) {
      expect(p.wx / T).toBeGreaterThanOrEqual(b.gx0);
      expect(p.wx / T).toBeLessThanOrEqual(b.gx1 + 1);
      expect(p.wy / T).toBeGreaterThanOrEqual(b.gy0);
      expect(p.wy / T).toBeLessThanOrEqual(b.gy1 + 1);
    }
  });

  it("les bancs de bord regardent le centre", () => {
    const comp = isoPlazaComposition(freshLayout(7), 3);
    const T = CM.TILE;
    const benches = comp.props.filter((p) => p.prop === "bench" && p.variant);
    expect(benches.length).toBeGreaterThan(0);
    // La variante nomme la direction MONDE vers laquelle le banc regarde : un
    // banc au NORD de la place (gy petit) doit regarder le sud.
    for (const p of benches) {
      const dy = p.wy / T - comp.cyc, dx = p.wx / T - comp.cxc;
      if (p.variant === "s") expect(dy).toBeLessThan(0);
      if (p.variant === "n") expect(dy).toBeGreaterThan(0);
      if (p.variant === "e") expect(dx).toBeLessThan(0);
      if (p.variant === "w") expect(dx).toBeGreaterThan(0);
    }
  });

  it("la profondeur peintre est celle du pied (tri par wx+wy en iso)", () => {
    const comp = isoPlazaComposition(freshLayout(5), 3);
    for (const p of comp.props) {
      if (p.prop === "grate") continue;          // décalée exprès, cf. test suivant
      expect(p.d).toBeCloseTo(p.wx + p.wy, 6);
    }
  });

  it("la margelle ENCADRE son arbre : arc arrière dessous, arc avant dessus", () => {
    // Les racines doivent disparaître DANS le sol. Un anneau posé entièrement
    // sous l'arbre laisse ses racines peintes sur la pierre : il faut que l'arc
    // AVANT repasse par-dessus. Même position au sol, donc même profondeur
    // naturelle — l'ordre ne peut pas dépendre de l'ordre d'insertion, il est
    // explicite dans la clé de tri.
    const comp = isoPlazaComposition(freshLayout(5), 3);
    const trees = comp.props.filter((p) => p.prop === "tree");
    expect(trees.length).toBeGreaterThan(0);
    for (const tree of trees) {
      const arcs = comp.props.filter((p) => p.prop === "grate" && p.spot === tree.spot);
      expect(arcs, "deux morceaux par arbre").toHaveLength(2);
      const arriere = arcs.find((a) => !a.front), avant = arcs.find((a) => a.front);
      expect(arriere.d).toBeLessThan(tree.d);
      expect(avant.d).toBeGreaterThan(tree.d);
      // Les deux morceaux sont le MÊME anneau, au même endroit et à la même
      // taille : seul le découpage au dessin les distingue.
      expect(avant.wx).toBe(arriere.wx);
      expect(avant.wy).toBe(arriere.wy);
      expect(avant.hT).toBe(arriere.hT);
      expect(avant.treeV).toBe(arriere.treeV);
    }
  });

  it("grateFrontF à 0 remet la margelle entièrement derrière", () => {
    resetTune({ grateFrontF: 0 });
    const comp = isoPlazaComposition(freshLayout(5), 3);
    const arcs = comp.props.filter((p) => p.prop === "grate");
    expect(arcs.length).toBeGreaterThan(0);
    expect(arcs.every((a) => !a.front)).toBe(true);
  });
});

describe("molette", () => {
  it("benchPerSide pilote le nombre de bancs, sideOn les compagnons", () => {
    resetTune({ benchPerSide: 0, treeMax: 0 });
    expect(isoPlazaComposition(freshLayout(6), 3).props).toHaveLength(1);   // la fontaine seule
    // Le plafond compte des BANCS, mais ils vont par deux : 3 donne un seul duo.
    resetTune({ benchPerSide: 3, treeMax: 0 });
    const trois = isoPlazaComposition(freshLayout(8), 3);
    expect(trois.props.filter((p) => p.prop === "bench")).toHaveLength(8);
    resetTune({ sideOn: false, treeMax: 0, benchPerSide: 2 });
    const bare = isoPlazaComposition(freshLayout(6), 3);
    expect(bare.props.filter((p) => p.prop === "bench")).toHaveLength(8);
    expect(bare.props).toHaveLength(9);          // 8 bancs + la fontaine
  });

  it("une surcharge hT ne touche QUE le prop visé", () => {
    const base = isoPlazaComposition(freshLayout(6), 3);
    const benchBase = base.props.find((p) => p.prop === "bench").hT;
    const otherBase = base.props.find((p) => p.prop === "fountain").hT;
    resetTune({ hT: { bench: 0.9 } });
    const tuned = isoPlazaComposition(freshLayout(6), 3);
    expect(tuned.props.find((p) => p.prop === "bench").hT).toBe(0.9);
    expect(tuned.props.find((p) => p.prop === "fountain").hT).toBe(otherBase);
    expect(benchBase).not.toBe(0.9);
  });

  it("le mode arbitre le kit, la scène et le sol", () => {
    resetTune({ mode: "kit" });
    expect(isoPlazaKitOn(4)).toBe(true);
    expect(isoPlazaSceneOn(4)).toBe(false);
    expect(isoPlazaSceneCoversGround(4)).toBe(false);   // la dalle de sol reprend la main
    resetTune({ mode: "scene" });
    expect(isoPlazaKitOn(4)).toBe(false);
    expect(isoPlazaSceneCoversGround(4)).toBe(true);
    resetTune({ mode: "off" });
    expect(isoPlazaKitOn(4)).toBe(false);
    expect(isoPlazaSceneOn(4)).toBe(false);
  });

  it("aucun mode ne fait apparaître de place aux stades primitifs", () => {
    for (const mode of ["kit", "scene"]) {
      resetTune({ mode });
      expect(isoPlazaKitOn(1)).toBe(false);
      expect(isoPlazaSceneOn(1)).toBe(false);
    }
  });
});

describe("ANCRAGE — le défaut « les éléments volent »", () => {
  // Retour Raph 2026-07-29. Les PNG du kit portent du vide transparent sous
  // l'objet (mesuré : 5 % à 22 % du canvas). Poser le bas du CANVAS sur le sol
  // laissait donc l'objet flotter au-dessus de son ombre — 4,3 px pour un banc
  // affiché à 16 px, 6,2 px pour un bac à fleurs. On ancre sur l'ENCRE.

  // Canvas 48×48, objet dessiné de y=10 à y=39 (donc 8 px de vide EN BAS) et de
  // x=6 à x=41. C'est le profil réel de bench-s-antique.
  const BB = { x0: 6, y0: 10, w: 36, h: 30 };

  it("le bas de l'encre touche le sol, pas le bas du canvas", () => {
    const g = plazaAnchor(BB, 48, 48, 100, 200, 16);
    // L'encre mesure bien 16 px de haut...
    expect(BB.h * (g.dh / 48)).toBeCloseTo(16, 6);
    // ...et son BAS tombe pile sur le point au sol.
    expect(g.dy + (BB.y0 + BB.h) * (g.dh / 48)).toBeCloseTo(200, 6);
    // Le canvas, lui, déborde SOUS le sol : c'est le vide transparent.
    expect(g.dy + g.dh).toBeGreaterThan(200);
  });

  it("l'ancrage naïf sur le canvas faisait flotter de 17 % de la hauteur", () => {
    // Reconstitution du défaut : hauteur imposée au CANVAS, bas du canvas au sol.
    // Le flottement vaut la marge transparente RAPPORTÉE À LA HAUTEUR DEMANDÉE,
    // donc il grandit avec le zoom — d'où « ça vole » bien visible en jeu.
    const hPx = 16, kNaif = hPx / 48;
    const flottement = 200 - (200 - 48 * kNaif + (BB.y0 + BB.h) * kNaif);
    expect(flottement / hPx).toBeCloseTo(8 / 48, 6);   // 17 % de la hauteur
    expect(flottement).toBeCloseTo(2.67, 2);
    // Second défaut du même bug : l'objet n'était pas à la taille demandée non
    // plus, l'encre ne faisant que 30/48 du canvas.
    expect(BB.h * kNaif).toBeCloseTo(10, 6);           // 10 px au lieu de 16
    // L'ancrage sur l'encre corrige les DEUX d'un coup.
    const g = plazaAnchor(BB, 48, 48, 100, 200, hPx);
    expect(BB.h * (g.dh / 48)).toBeCloseTo(hPx, 6);
  });

  it("le centre de l'encre s'aligne sur le point, pas le centre du canvas", () => {
    // Encre décentrée dans son canvas (x 6..41 → centre 24 sur un canvas de 48,
    // donc décalage nul ici ; on décale volontairement pour que le test morde).
    const g = plazaAnchor({ x0: 0, y0: 0, w: 20, h: 30 }, 48, 48, 100, 200, 30);
    expect(g.dx + 10 * (g.dh / 48)).toBeCloseTo(100, 6);
    expect(g.dx + g.dw / 2).not.toBeCloseTo(100, 1);   // le canvas, lui, est décalé
  });

  it("la taille demandée est celle de l'OBJET, quelle que soit la marge du PNG", () => {
    // Deux sprites du même objet, l'un serré, l'autre avec une grosse marge :
    // même hauteur d'encre à l'écran. C'est ce qui rend `hT` fiable pour l'art.
    const serre = plazaAnchor({ x0: 0, y0: 0, w: 30, h: 30 }, 30, 30, 0, 0, 16);
    const large = plazaAnchor({ x0: 9, y0: 9, w: 30, h: 30 }, 48, 48, 0, 0, 16);
    expect(30 * (serre.dh / 30)).toBeCloseTo(30 * (large.dh / 48), 6);
    expect(serre.inkW).toBeCloseTo(large.inkW, 6);
  });
});

describe("LES BANCS VONT PAR DEUX, ET LE CENTRE EST TOUJOURS PRIS", () => {
  // Retour Raph 2026-07-29 : « tu peux faire en sorte que 2 bancs soient côte à
  // côte ? Et il faut que le centre de la place soit pris, soit par un arbre,
  // soit une fontaine, mais obligatoirement quelque chose. »
  const T = () => CM.TILE;

  it("chaque banc a un banc JUMEAU plus proche que tout autre prop", () => {
    for (const n of [4, 5, 6, 8]) {
      const comp = isoPlazaComposition(freshLayout(n), 3);
      const benches = comp.props.filter((p) => p.prop === "bench");
      expect(benches.length % 2, `${n}×${n} : un nombre PAIR de bancs`).toBe(0);
      for (const b of benches) {
        const d = (o) => Math.hypot(o.wx - b.wx, o.wy - b.wy) / T();
        const jumeau = Math.min(...benches.filter((o) => o !== b).map(d));
        const autre = Math.min(...comp.props.filter((o) => o.prop !== "bench").map(d));
        expect(jumeau, `${n}×${n} : le voisin le plus proche d'un banc est un banc`)
          .toBeLessThan(autre);
      }
    }
  });

  it("le centre est occupé sur TOUTES les ères et TOUTES les emprises", () => {
    for (const era of ["antique", "medieval", "industrial", "modern", "cosmic"]) {
      for (const n of [4, 5, 6, 8]) {
        resetTune({ era });
        const comp = isoPlazaComposition(freshLayout(n), 3);
        expect(comp.centrePris, `${era} ${n}×${n}`).toBe(true);
        // Et il y a bien un prop AU milieu géométrique, pas juste un drapeau.
        const auCentre = comp.props.some((p) => Math.hypot(
          p.wx / T() - comp.cxc, p.wy / T() - comp.cyc,
        ) < 0.3);
        expect(auCentre, `${era} ${n}×${n} : rien au milieu`).toBe(true);
      }
    }
  });

  it("un ARBRE peut tenir le centre à la place de la fontaine", () => {
    resetTune({ centre: "tree" });
    const comp = isoPlazaComposition(freshLayout(5), 3);
    expect(comp.centrePris).toBe(true);
    expect(comp.props.some((p) => p.prop === "fountain")).toBe(false);
    const centre = comp.props.find((p) => p.prop === "tree"
      && Math.hypot(p.wx / T() - comp.cxc, p.wy / T() - comp.cyc) < 0.3);
    expect(centre, "un arbre au milieu").toBeTruthy();
    // ⚠ Ses RACINES tombent PILE au centre, pas « à peu près » (« l'arbre n'est
    // pas central, il faut que ses racines soient au centre »). C'est la
    // MARGELLE qui se décale, pas l'arbre.
    expect(centre.wx / T()).toBeCloseTo(comp.cxc, 6);
    expect(centre.wy / T()).toBeCloseTo(comp.cyc, 6);
    // Il garde sa margelle : c'est le MÊME geste que sur les côtés.
    const arcs = comp.props.filter((p) => p.prop === "grate" && p.spot === centre.spot);
    expect(arcs).toHaveLength(2);
    for (const a of arcs) {
      expect(a.wx / T()).toBeCloseTo(comp.cxc + PLAZA_TUNE.treeLift, 6);
      expect(a.wy / T()).toBeCloseTo(comp.cyc + PLAZA_TUNE.treeLift, 6);
    }
  });

  it("la garniture alterne bacs et corbeilles, elle n'est pas dégénérée", () => {
    // Deux garnitures au catalogue depuis que la corbeille existe. Le tirage
    // passe par cmHash : consommé brut il donnerait une seule espèce partout
    // (le bit faible n'est que la parité de l'entrée). On vérifie que les DEUX
    // sortent bien sur un échantillon de graines.
    const vus = new Set();
    for (let seed = 0; seed < 6; seed += 1) {
      resetTune({ seed });
      for (const p of isoPlazaComposition(freshLayout(6), 3).props) {
        if (!["bench", "fountain", "tree", "grate"].includes(p.prop)) vus.add(p.prop);
      }
    }
    expect([...vus].sort()).toEqual(["bin", "planter"]);
  });

  it("le centre s'impose au filet, il ne lui demande pas la permission", () => {
    // La pièce maîtresse est réservée SANS test d'empreinte. Si elle passait par
    // le filet, un mât ou un prop mal placé pourrait la refuser et la place
    // resterait vide en son milieu — exactement ce que Raph refuse.
    resetTune({ minGap: 99 });                 // filet absurdement strict
    const comp = isoPlazaComposition(freshLayout(5), 3);
    expect(comp.centrePris).toBe(true);
    expect(comp.props.filter((p) => p.prop === "fountain")).toHaveLength(1);
  });
});

describe("LE MOBILIER SUIT LES HABITANTS", () => {
  // Retour Raph 2026-07-29, après avoir rapetissé les habitants : « ça fait
  // toujours des places géantes ». Le mobilier était ancré sur la MAISON, donc
  // il n'a pas bougé et la place a enflé sans que rien n'ait changé.
  //
  // La garde qui manquait est STRUCTURELLE : un poste déclaré en `hT` (tuiles
  // fixes) cesse silencieusement de suivre les habitants. Tout ce qui est à
  // l'échelle du corps doit être déclaré en `p`.
  it("tout le mobilier est déclaré en `p`, jamais en tuiles fixes", () => {
    for (const era of Object.keys(RECIPES)) {
      const R = RECIPES[era];
      const postes = [
        ["centre", R.centre], ["bench", R.bench], ["grate", R.grate],
        ...(R.side || []).map((s, i) => [`side[${i}]`, s]),
      ].filter(([, post]) => post);
      for (const [nom, post] of postes) {
        expect(post.p, `${era}/${nom} doit être en p (multiples d'habitant)`).toBeTypeOf("number");
        expect(post.hT, `${era}/${nom} ne doit PAS figer une hauteur en tuiles`).toBeUndefined();
      }
    }
  });

  it("l'habitant de référence vaut bien 0,425 tuile", () => {
    // 0.85 (scale des sprites d'adulte) × 0.5 (AGENT_SCALE). Écrit en dur : si
    // l'un des deux bouge, ce test le dit au lieu de laisser dériver en silence.
    expect(personHT()).toBeCloseTo(0.425, 4);
  });

  it("les proportions du mobilier tiennent debout face au corps", () => {
    // Un banc fait ~1,8 m de long pour un habitant de ~1,70 m : sa LARGEUR doit
    // donc tourner autour d'une hauteur d'habitant. C'est le rapport que l'œil
    // juge, et celui qui était faux (le banc faisait 1,85 corps de large).
    const R = RECIPES.antique;
    const largeurBanc = effHT(R.bench) * 1.6;          // aspect du sprite de banc
    expect(largeurBanc / personHT()).toBeGreaterThan(0.9);
    expect(largeurBanc / personHT()).toBeLessThan(1.3);
    // Et un bac à fleurs reste plus bas qu'un banc.
    expect(effHT(R.side[0])).toBeLessThan(effHT(R.bench));
  });

  it("furnScale rapetisse TOUT le mobilier d'un coup, sans toucher aux arbres", () => {
    const plein = isoPlazaComposition(freshLayout(5), 3);
    const arbrePlein = plein.props.find((p) => p.prop === "tree").hT;
    const bancPlein = plein.props.find((p) => p.prop === "bench").hT;
    resetTune({ furnScale: 0.5 });
    const petit = isoPlazaComposition(freshLayout(5), 3);
    expect(petit.props.find((p) => p.prop === "bench").hT).toBeCloseTo(bancPlein / 2, 6);
    expect(petit.props.find((p) => p.prop === "fountain").hT)
      .toBeCloseTo(plein.props.find((p) => p.prop === "fountain").hT / 2, 6);
    // L'ARBRE ne bouge pas : ce sont ceux de la carte, ils ne doivent pas en
    // diverger sous prétexte qu'on règle le mobilier de la place.
    expect(petit.props.find((p) => p.prop === "tree").hT).toBeCloseTo(arbrePlein, 6);
  });
});

describe("LA FONTAINE GRANDIT D'ÈRE EN ÈRE", () => {
  // Retour Raph 2026-07-29 : « je veux qu'elles soient de plus en plus grandes
  // selon les âges, qu'on ait une évolution. »
  const ORDRE = ["antique", "medieval", "industrial", "modern", "cosmic"];

  it("la progression est STRICTEMENT croissante", () => {
    const hs = ORDRE.map((e) => effHT(RECIPES[e].centre));
    for (let i = 1; i < hs.length; i += 1) {
      expect(hs[i], `${ORDRE[i]} doit dépasser ${ORDRE[i - 1]}`).toBeGreaterThan(hs[i - 1]);
    }
    // Et l'évolution doit se VOIR : plus du double entre la première et la
    // dernière, sinon ce n'est pas une évolution, c'est du bruit.
    expect(hs[hs.length - 1] / hs[0]).toBeGreaterThan(2);
  });

  it("la progression se retrouve dans la composition, pas seulement dans la table", () => {
    const vus = ORDRE.map((era) => {
      resetTune({ era });
      const comp = isoPlazaComposition(freshLayout(5), 3);
      return comp.props.find((p) => p.prop === "fountain").hT;
    });
    for (let i = 1; i < vus.length; i += 1) expect(vus[i]).toBeGreaterThan(vus[i - 1]);
  });

  it("SEULE la fontaine grandit : le mobilier ne bouge pas d'une ère à l'autre", () => {
    // Un banc sert le même corps à toutes les époques. Si un jour une recette
    // fait grossir les bancs avec l'ère, ce test le dit.
    const bancs = ORDRE.map((e) => effHT(RECIPES[e].bench));
    expect(Math.max(...bancs) / Math.min(...bancs)).toBeLessThan(1.3);
  });

  it("la fontaine qui grandit ne MANGE pas le mobilier", () => {
    // Le vrai risque de l'agrandissement : la pièce maîtresse est posée en
    // premier et entre dans le filet, donc elle peut faire tomber des bancs sans
    // rien dire. On vérifie que le compte attendu tient à toutes les ères et sur
    // les emprises réelles.
    for (const era of ORDRE) {
      for (const n of [4, 5, 6]) {
        resetTune({ era });
        const comp = isoPlazaComposition(freshLayout(n), 3);
        const attendus = comp.benchPerSide * 4;
        expect(comp.props.filter((p) => p.prop === "bench"), `${era} ${n}×${n}`)
          .toHaveLength(attendus);
        expect(comp.props.filter((p) => p.prop === "fountain"), `${era} ${n}×${n}`)
          .toHaveLength(1);
      }
    }
  });
});

describe("MARGELLE — centrée sur le tronc, plus large que les racines", () => {
  // Retour Raph 2026-07-29 : « centrer les arbres dans les margelles, et faire
  // en sorte que les racines n'en ressortent pas. Un peu plus larges oui. »
  //
  // Métriques MESURÉES sur les quatre sprites d'arbre (fractions du canvas
  // 96×96). Elles sont recopiées ici EXPRÈS : c'est une source indépendante du
  // code testé, donc si la mesure au runtime dérive, ce test le dit.
  const FEET = {
    1: { footCx: 0.505, footW: 0.240, footBottom: 0.917 },
    2: { footCx: 0.510, footW: 0.146, footBottom: 0.906 },
    3: { footCx: 0.474, footW: 0.135, footBottom: 0.938 },
    4: { footCx: 0.521, footW: 0.167, footBottom: 0.948 },
  };
  // Sprite de margelle réel : encre 30×13 → rapport 2.31.
  const RATIO = 30 / 13;
  const canvasPx = (z) => PLAZA_TUNE.treeR * 2.7 * CM.TILE * z;

  it("la margelle couvre TOUJOURS l'étalement des racines, marge comprise", () => {
    for (const z of [1, 1.5, 3]) {
      const cpx = canvasPx(z);
      for (const [v, foot] of Object.entries(FEET)) {
        const hPx = 0.328 * CM.TILE * z;               // hauteur de recette
        const g = grateFit(RATIO, hPx, foot, cpx, PLAZA_TUNE.grateMargin);
        const largeur = g.hPx * RATIO;
        const racines = foot.footW * cpx;
        expect(largeur / racines, `arbre ${v} au zoom ${z}`)
          .toBeGreaterThanOrEqual(PLAZA_TUNE.grateMargin - 1e-9);
      }
    }
  });

  it("au réglage actuel, le PLANCHER de recette suffit même au plus large", () => {
    // tree-1 étale ses racines sur 24 % du canvas, presque le double de tree-3.
    // Après l'élargissement demandé, la largeur de recette couvre déjà ce cas :
    // le dimensionnement par variante ne se déclenche donc pas, il reste un
    // FILET. C'est l'état voulu — et ce test le dit au lieu de le supposer.
    const cpx = canvasPx(1.5);
    const hPx = 0.328 * CM.TILE * 1.5;
    for (const foot of Object.values(FEET)) {
      expect(grateFit(RATIO, hPx, foot, cpx, 1.6).hPx).toBeCloseTo(hPx, 6);
    }
  });

  it("le filet par variante MORD si la largeur de recette redescend", () => {
    // On rabaisse le plancher sous l'étalement de tree-1 : la margelle doit
    // alors être dimensionnée par SES racines, et rester plus large que celle
    // de tree-3, qui a le pied deux fois plus fin.
    const cpx = canvasPx(1.5);
    const petit = 0.15 * CM.TILE * 1.5;
    const large = grateFit(RATIO, petit, FEET[1], cpx, 1.6).hPx;
    const fine = grateFit(RATIO, petit, FEET[3], cpx, 1.6).hPx;
    expect(large).toBeGreaterThan(fine);
    expect(large).toBeGreaterThan(petit);        // le filet a bien relevé
    expect(large * RATIO / (FEET[1].footW * cpx)).toBeCloseTo(1.6, 6);
  });

  it("la margelle se recentre sur le tronc, pas sur le canvas", () => {
    const cpx = canvasPx(1.5);
    const hPx = 0.328 * CM.TILE * 1.5;
    // tree-3 a son pied à GAUCHE du centre de canvas, tree-4 à droite.
    expect(grateFit(RATIO, hPx, FEET[3], cpx, 1.6).ox).toBeLessThan(0);
    expect(grateFit(RATIO, hPx, FEET[4], cpx, 1.6).ox).toBeGreaterThan(0);
    // Décalage exact : (footCx − 0.5) × hauteur canvas de l'arbre.
    expect(grateFit(RATIO, hPx, FEET[3], cpx, 1.6).ox).toBeCloseTo((0.474 - 0.5) * cpx, 6);
  });

  it("elle se pose sur le bas d'encre RÉEL de sa variante", () => {
    const cpx = canvasPx(1.5);
    const hPx = 0.328 * CM.TILE * 1.5;
    // 0.92 est l'ancre des arbres de carte : au-dessus, l'encre descend plus bas.
    expect(grateFit(RATIO, hPx, FEET[2], cpx, 1.6).oy).toBeLessThan(0);   // 0.906
    expect(grateFit(RATIO, hPx, FEET[4], cpx, 1.6).oy).toBeGreaterThan(0); // 0.948
  });

  it("l'arbre est REMONTÉ au-dessus de sa margelle, sans dériver de côté", () => {
    // Retour Raph : l'arbre se posait sur le bord AVANT de la margelle. On le
    // remonte de treeLift, ce qui en iso se fait en reculant d'autant en x ET en
    // y — l'abscisse écran (x − y) est alors inchangée, seule l'ordonnée monte.
    const comp = isoPlazaComposition(freshLayout(5), 3);
    const T = CM.TILE;
    for (const g of comp.props.filter((p) => p.prop === "grate")) {
      const tree = comp.props.find((p) => p.prop === "tree" && p.spot === g.spot);
      const dx = (tree.wx - g.wx) / T, dy = (tree.wy - g.wy) / T;
      expect(dx).toBeCloseTo(-PLAZA_TUNE.treeLift, 6);
      expect(dy).toBeCloseTo(-PLAZA_TUNE.treeLift, 6);
      expect(dx - dy, "dérive latérale à l'écran").toBeCloseTo(0, 9);
      expect((dx + dy) / 2, "remontée à l'écran, en tuiles").toBeCloseTo(-PLAZA_TUNE.treeLift, 6);
    }
  });

  it("sans margelle, pas de remontée : l'arbre reste au sol", () => {
    resetTune({ treeMax: 2 });
    const comp = isoPlazaComposition(freshLayout(5), 3);
    const spots = comp.props.filter((p) => p.prop === "tree").map((p) => p.spot);
    expect(spots.length).toBeGreaterThan(0);
    // La recette antique A une margelle, donc ici la remontée doit être là ;
    // le test miroir est la garde `treeLift` = 0 ci-dessous.
    resetTune({ treeLift: 0 });
    const plat = isoPlazaComposition(freshLayout(5), 3);
    for (const g of plat.props.filter((p) => p.prop === "grate")) {
      const tree = plat.props.find((p) => p.prop === "tree" && p.spot === g.spot);
      expect(tree.wx).toBe(g.wx);
      expect(tree.wy).toBe(g.wy);
    }
  });

  it("chaque margelle sait de QUEL arbre elle est le pied", () => {
    const comp = isoPlazaComposition(freshLayout(5), 3);
    const grates = comp.props.filter((p) => p.prop === "grate");
    expect(grates.length).toBeGreaterThan(0);
    for (const g of grates) {
      const tree = comp.props.find((p) => p.prop === "tree" && p.spot === g.spot);
      expect(g.treeV, "variante").toBe(tree.tr._tv);
      expect(g.treeR).toBe(PLAZA_TUNE.treeR);
    }
  });
});

describe("ères", () => {
  it("chaque bande tombe sur une recette existante à partir de band 2", () => {
    expect(plazaEraForBand(1)).toBe(null);
    for (let band = 2; band <= 9; band += 1) {
      const era = plazaEraForBand(band);
      expect(RECIPES[era], "band " + band + " → " + era).toBeTruthy();
    }
  });

  it("chaque recette a une pièce maîtresse, un banc et des compagnons", () => {
    for (const era of Object.keys(RECIPES)) {
      expect(RECIPES[era].centre, era).toBeTruthy();
      expect(RECIPES[era].bench, era).toBeTruthy();
      expect(RECIPES[era].side.length, era).toBeGreaterThan(0);
    }
  });
});
