import { describe, it, expect, afterEach, vi } from "vitest";

import { qualitySettings, setQualityMode } from "../qualityMode.js";

// PALIER AUTOMATIQUE SUR APPAREIL TACTILE (P3).
//
// La règle d'origine cherchait une machine « visiblement modeste » avec le
// couple HiDPI + peu de cœurs. Elle a été écrite pour des portables, et un
// téléphone récent la traverse sans être vu : il annonce 6 à 8 cœurs et un dpr
// de 3, donc « ni HiDPI-avec-peu-de-cœurs, ni très peu de cœurs » → palier
// « élevé ». C'est-à-dire plafond de résolution 2, aucun LOD, 60 fps visés et
// recuisson nette pendant le geste — le réglage le plus lourd du jeu, sur la
// machine la plus faible, alors que le coût GPU de la carte monte en dpr².
//
// Ces tests fixent la correction : c'est le POINTEUR qui décide, pas le nombre
// de cœurs. `hover: none` fait partie de la condition — un portable à écran
// tactile a un curseur et doit rester sur le chemin bureau.
const TIERS = {
  high:     { dpr: 2.0, citizenMul: 1.0, fps: 60, lodZoom: 0,    crispGesture: true },
  balanced: { dpr: 1.5, citizenMul: 0.7, fps: 30, lodZoom: 0.55, crispGesture: false },
  perf:     { dpr: 1.0, citizenMul: 0.4, fps: 30, lodZoom: 0.85, crispGesture: false },
};

// Fabrique un appareil. `pointeur` : "doigt" | "curseur" | null (pas de
// matchMedia du tout). `survol` : ce que l'appareil PRÉTEND pour `hover` —
// paramètre séparé exprès, parce que c'est là qu'ils mentent.
function appareil({ dpr, coeurs, pointeur, survol = "none", touches = 0 }) {
  const win = { devicePixelRatio: dpr };
  if (pointeur) {
    win.matchMedia = (q) => ({
      matches: q.includes("pointer: coarse")
        ? pointeur === "doigt"
        : q.includes("hover: none")
          ? survol === "none"
          : false,
    });
  }
  vi.stubGlobal("window", win);
  vi.stubGlobal("navigator", { hardwareConcurrency: coeurs, maxTouchPoints: touches });
  setQualityMode("auto");
}

afterEach(() => vi.unstubAllGlobals());

describe("palier automatique — le doigt passe avant le nombre de cœurs", () => {
  it("un téléphone récent (dpr 3, 8 cœurs) n'est PAS classé « élevé »", () => {
    // Le cas exact que l'ancienne règle laissait passer : beaucoup de cœurs
    // annoncés, écran très dense. C'était le pire réglage sur la pire machine.
    appareil({ dpr: 3, coeurs: 8, pointeur: "doigt", touches: 5 });
    expect(qualitySettings()).not.toEqual(TIERS.high);
  });

  it("… et un écran DENSE ne le fait pas dégringoler jusqu'à « perf »", () => {
    // Corrigé le 2026-07-28 sur mesure réelle : le téléphone de Raph tenait
    // 60-120 fps AU PALIER LE PLUS LOURD, et une règle `dpr >= 2.5` le jetait
    // quand même en « perf » (dpr 1, moitié des habitants, LOD précoce). Le
    // plafond de résolution du palier suffit à payer la densité de l'écran ;
    // la compter deux fois punit les bons appareils.
    appareil({ dpr: 3, coeurs: 8, pointeur: "doigt", touches: 5 });
    expect(qualitySettings()).toEqual(TIERS.balanced);
  });

  it("un téléphone qui MENT sur `hover` est quand même reconnu", () => {
    // CAS RÉEL, mesuré le 2026-07-28 : la première version exigeait
    // `(pointer: coarse) and (hover: none)`, la conjonction n'a pas matché et
    // l'appareil est reparti en « élevé ». Plusieurs navigateurs mobiles
    // annoncent `hover: hover` (héritage, stylet, mode « site pour ordinateur »).
    // Le pointeur grossier suffit désormais.
    appareil({ dpr: 3, coeurs: 8, pointeur: "doigt", survol: "hover", touches: 5 });
    expect(qualitySettings()).not.toEqual(TIERS.high);
  });

  it("un appareil purement tactile qui n'annonce PAS `coarse` est rattrapé", () => {
    // Filet inverse : pas de pointeur grossier déclaré, mais des points de
    // contact et aucun survol possible — c'est un écran qu'on touche.
    appareil({ dpr: 2, coeurs: 8, pointeur: "curseur", survol: "none", touches: 5 });
    expect(qualitySettings()).toEqual(TIERS.balanced);
  });

  it("une tablette moins dense (dpr 2, 8 cœurs) se contente de « équilibré »", () => {
    // Tactile mais pas extrême : on allège sans sacrifier la netteté.
    appareil({ dpr: 2, coeurs: 8, pointeur: "doigt", touches: 5 });
    expect(qualitySettings()).toEqual(TIERS.balanced);
  });

  it("un tactile à peu de cœurs descend en « perf » même sans écran très dense", () => {
    appareil({ dpr: 2, coeurs: 4, pointeur: "doigt", touches: 5 });
    expect(qualitySettings()).toEqual(TIERS.perf);
  });
});

describe("le chemin bureau ne bouge pas", () => {
  it("un portable à écran tactile MAIS avec curseur reste en « élevé »", () => {
    // Le vrai discriminant : son pointeur PRIMAIRE est fin, et il peut survoler.
    // Des points de contact ne suffisent pas à le faire passer pour un mobile.
    appareil({ dpr: 2, coeurs: 8, pointeur: "curseur", survol: "hover", touches: 10 });
    expect(qualitySettings()).toEqual(TIERS.high);
  });

  it("le poste de bureau de référence garde « élevé »", () => {
    appareil({ dpr: 1, coeurs: 8, pointeur: "curseur", survol: "hover" });
    expect(qualitySettings()).toEqual(TIERS.high);
  });

  it("une machine modeste garde son repli « équilibré » d'origine", () => {
    appareil({ dpr: 2, coeurs: 4, pointeur: "curseur", survol: "hover" });
    expect(qualitySettings()).toEqual(TIERS.balanced);
  });

  it("sans matchMedia (navigateur ancien), on ne plante pas et on reste au bureau", () => {
    appareil({ dpr: 1, coeurs: 8, pointeur: null });
    expect(qualitySettings()).toEqual(TIERS.high);
  });
});

describe("un choix explicite du joueur gagne toujours sur la détection", () => {
  it("« Élevée » forcée reste élevée, même sur un téléphone", () => {
    appareil({ dpr: 3, coeurs: 8, pointeur: "doigt", touches: 5 });
    setQualityMode("high");
    expect(qualitySettings()).toEqual(TIERS.high);
  });
});
