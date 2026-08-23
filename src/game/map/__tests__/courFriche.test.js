// LE LOT VIDE CESSE D'ÊTRE MINÉRAL (lot L2) + LES SENTIERS NE S'ÉCLAIRENT PLUS
// (lot L6). docs/PLAN-TISSU-URBAIN.md.
//
// v1 classait chaque cellule sur sa distance au bâti. Sur un tissu dense ça donne
// un beau dégradé ; dès que le bâti s'espace (mégalopole, tours isolées) le seuil
// alias sur la grille et sème une peau de léopard. Mesuré sur la ville qui a valu
// le retour de Raph (« le retour des multiples petits carrés de sol entre les
// routes ») : **364 taches de cour, médiane 1 cellule, 64 % d'une ou deux
// cellules**. v2 raisonne en SURFACES — fermeture morphologique du bâti, couronne
// de cour, puis absorption des miettes.
//
// Ces gardes portent donc sur la FORME, pas sur des seuils : une table de seuils
// juste peut produire du confetti, et c'est exactement ce qui est arrivé.
import { describe, it, expect } from "vitest";
import { computeIsoLamps } from "../iso/isoStreet.js";
// Le MODÈLE (courField, COUR) est parti dans isoTissu.js le 2026-08-23 ; le PEINTRE
// des lampadaires est resté. Ce test lit les deux : la matière du sol, et ce qu on
// pose dessus.
import { courField, COUR } from "../iso/isoTissu.js";

const ROAD_E = 2, ROAD_W = 8;   // bits de masque de layout.js (N = 1, S = 4)
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Sol de ville plein N×N, bâti sur les clés fournies.
const ville = (N, batis) => {
  const urbanSet = new Set();
  for (let gy = 0; gy < N; gy += 1) for (let gx = 0; gx < N; gx += 1) urbanSet.add(gx + "," + gy);
  return { urbanSet, builtSet: new Set(batis) };
};
// Tailles des composantes connexes d'une matière.
const taches = (urbanSet, kind, want) => {
  const out = [], vus = new Set();
  for (const start of urbanSet) {
    if (vus.has(start) || kind.get(start) !== want) continue;
    const comp = [start];
    vus.add(start);
    for (let i = 0; i < comp.length; i += 1) {
      const c = comp[i].indexOf(",");
      const gx = +comp[i].slice(0, c), gy = +comp[i].slice(c + 1);
      for (const [dx, dy] of ORTHO) {
        const nk = (gx + dx) + "," + (gy + dy);
        if (vus.has(nk) || !urbanSet.has(nk) || kind.get(nk) !== want) continue;
        vus.add(nk); comp.push(nk);
      }
    }
    out.push(comp.length);
  }
  return out;
};

describe("matières du sol de ville", () => {
  it("le sol sous une emprise reste pavé, toujours", () => {
    const { urbanSet, builtSet } = ville(21, ["10,10"]);
    expect(courField(urbanSet, builtSet).get("10,10")).toBe("urban");
  });

  it("un quartier, puis sa couronne de cour, puis la friche", () => {
    // Bloc bâti 5×5 au centre d'un grand sol de ville : les trois matières
    // doivent apparaître dans cet ordre en s'éloignant, sans se mélanger.
    const batis = [];
    for (let gx = 8; gx <= 12; gx += 1) for (let gy = 8; gy <= 12; gy += 1) batis.push(gx + "," + gy);
    const { urbanSet, builtSet } = ville(31, batis);
    const k = courField(urbanSet, builtSet);
    expect(k.get("10,10")).toBe("urban");
    expect(k.get("10,13")).toBe("urban");     // encore dans le quartier (fermeture)
    expect(k.get("10,30")).toBe("grass");     // au loin, la friche
    // Et l'ordre est monotone le long d'un rayon : pavé, puis terre, puis herbe.
    const vus = [];
    for (let gy = 10; gy < 31; gy += 1) vus.push(k.get("10," + gy));
    const rang = { urban: 0, dirt: 1, grass: 2 };
    for (let i = 1; i < vus.length; i += 1) expect(rang[vus[i]]).toBeGreaterThanOrEqual(rang[vus[i - 1]]);
  });

  it("un pâté DENSE fait quartier d'un seul tenant, trous compris", () => {
    // Damier de maisons sur 9 × 9 : une cellule sur deux est bâtie, donc 25 % de
    // densité, bien au-dessus du seuil. Les trous entre les maisons doivent être
    // du quartier, pas des carrés de terre — c'est tout l'objet du lissage.
    const batis = [];
    for (let gx = 8; gx <= 16; gx += 2) for (let gy = 8; gy <= 16; gy += 2) batis.push(gx + "," + gy);
    const { urbanSet, builtSet } = ville(41, batis);
    const k = courField(urbanSet, builtSet);
    for (let gx = 8; gx <= 16; gx += 1) {
      for (let gy = 8; gy <= 16; gy += 1) expect(k.get(gx + "," + gy), gx + "," + gy).toBe("urban");
    }
  });

  it("…mais ne relie PAS deux quartiers vraiment distants", () => {
    // Deux pâtés denses à trente cellules : la ville doit respirer entre les
    // deux, sinon le lissage avalerait la campagne et on retomberait sur la
    // nappe minérale que ce lot est venu supprimer.
    const batis = [];
    for (const cx of [10, 40]) {
      for (let gx = cx - 2; gx <= cx + 2; gx += 1) for (let gy = 23; gy <= 27; gy += 1) batis.push(gx + "," + gy);
    }
    const { urbanSet, builtSet } = ville(51, batis);
    const k = courField(urbanSet, builtSet);
    expect(k.get("25,25")).toBe("grass");
  });

  // ⚠ LE point du fichier, et le grief exact de Raph.
  it("mord : plus AUCUNE tache minuscule, là où la règle par cellule en semait", () => {
    // Semis de bâtiments espacés — le régime mégalopole qui a cassé la v1 :
    // une tour tous les 5 cellules, et beaucoup de vide entre elles.
    const batis = [];
    for (let gx = 5; gx < 40; gx += 5) for (let gy = 5; gy < 40; gy += 5) batis.push(gx + "," + gy);
    const { urbanSet, builtSet } = ville(45, batis);
    const k = courField(urbanSet, builtSet);
    for (const mat of ["dirt", "grass"]) {
      const t = taches(urbanSet, k, mat);
      for (const n of t) expect(n, `tache de ${mat} de ${n} cellule(s)`).toBeGreaterThanOrEqual(COUR.minPatch);
    }
    // …et le contrôle qui donne son sens au précédent : sans l'absorption, le
    // même semis PRODUIT bien des miettes. Une garde qui passerait aussi avec et
    // sans ce qu'elle protège ne protégerait rien.
    const brut = courField(urbanSet, builtSet, { ...COUR, minPatch: 1 });
    const miettes = [...taches(urbanSet, brut, "dirt"), ...taches(urbanSet, brut, "grass")]
      .filter((n) => n < COUR.minPatch);
    expect(miettes.length).toBeGreaterThan(0);
  });

  it("une tache absorbée prend la matière qui la BORDE le plus", () => {
    // Une maison isolée en pleine friche : sa petite auréole de cour n'a que de
    // la friche autour, elle doit disparaître dans la friche, pas devenir du pavé.
    const { urbanSet, builtSet } = ville(31, ["15,15"]);
    const k = courField(urbanSet, builtSet, { ...COUR, minPatch: 400 });
    expect(k.get("15,15")).toBe("urban");
    expect(k.get("15,20")).toBe("grass");
  });

  it("l'échappatoire rend VRAIMENT la nappe minérale d'avant le lot", () => {
    const { urbanSet, builtSet } = ville(15, ["7,7"]);
    const k = courField(urbanSet, builtSet, { ...COUR, on: false });
    for (const key of urbanSet) expect(k.get(key)).toBe("urban");
  });

  it("les réglages livrés sont ceux qu'on croit", () => {
    expect(COUR.on).toBe(true);
    // Le lissage doit être NETTEMENT plus large qu'un bloc (une à quatre
    // cellules entre deux rues) : c'est la seule raison pour laquelle deux blocs
    // voisins reçoivent la même matière.
    expect(COUR.scale).toBeGreaterThanOrEqual(5);
    expect(COUR.coreDens).toBeGreaterThan(COUR.ringDens);
    expect(COUR.minPatch).toBeGreaterThanOrEqual(4);
  });

  it("une poche de sol coupée du bâti part en friche, pas en dallage perdu", () => {
    const urbanSet = new Set(["0,0", "1,0", "2,0", "9,9"]);
    const k = courField(urbanSet, new Set(["0,0"]), { ...COUR, minPatch: 1 });
    expect(k.get("9,9")).toBe("grass");
  });
});

describe("lampadaires : les sentiers ne s'éclairent pas", () => {
  const reseau = (rankRue, rankSentier) => {
    const roadMap = new Map();
    const through = ROAD_E | ROAD_W;
    for (let gx = 0; gx < 12; gx += 1) {
      roadMap.set(gx + ",0", { gx, gy: 0, mask: through, rank: rankRue });
      roadMap.set(gx + ",3", { gx, gy: 3, mask: through, rank: rankSentier });
    }
    return { roadMap, tiles: [] };
  };

  it("aucun mât sur un rang `path`, des mâts sur la rue voisine", () => {
    const lamps = computeIsoLamps(reseau("secondary", "path"), 32);
    expect(lamps.length).toBeGreaterThan(0);
    expect(lamps.every((l) => l.gy === 0)).toBe(true);
  });

  it("mord : c'est bien le RANG qui exclut, pas la géométrie", () => {
    const lamps = computeIsoLamps(reseau("secondary", "secondary"), 32);
    expect(lamps.some((l) => l.gy === 3)).toBe(true);
  });

  it("garde l'espacement le long de la rue", () => {
    const lamps = computeIsoLamps(reseau("secondary", "path"), 32);
    const xs = lamps.map((l) => l.gx).sort((a, b) => a - b);
    expect(xs).toEqual([0, 3, 6, 9]);
  });
});
