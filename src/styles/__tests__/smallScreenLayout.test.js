/**
 * PETITS ÉCRANS : LES CORRECTIFS DE MISE EN PAGE DU 05/10 NE SE DÉFONT PAS.
 * ---------------------------------------------------------------------------
 * Ces défauts ne se voient qu'au rendu (mesurés dans Chrome en 1280×800,
 * 1366×768, 1536×864 à 125 %, 1584×861 — la fenêtre de l'.exe —, 1920×1080 et
 * 2560×1340). Un test unitaire ne peut pas les rejouer ; il garde en revanche
 * les règles qui les corrigent, une par une, avec la raison à côté (audit du
 * 2026-10-05, lot 7 « petits écrans »). Chacune est sans effet tant que tout
 * tient : 1920 et 2560 ne bougent pas.
 *
 * postcss est fourni par Vite (dépendance directe de vite).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const src = path.resolve(__dirname, "../..");
const lire = (f) => fs.readFileSync(path.join(src, f), "utf8");
const norm = (s) => s.replace(/\s+/g, " ").trim();

// Déclarations (prop → valeur) de toutes les règles dont un sélecteur vaut `sel`
// (`horsMedia` : seulement celles qui ne sont pas dans un @media).
function decls(fichier, sel, { horsMedia = false } = {}) {
  const out = {};
  postcss.parse(lire(fichier), { from: fichier }).walkRules((r) => {
    if (!r.selectors.some((s) => norm(s) === sel)) return;
    if (horsMedia && r.parent?.type === "atrule") return;
    r.walkDecls((d) => { out[d.prop] = norm(d.value); });
  });
  return out;
}
// Toutes les règles (sélecteur normalisé) qui portent une propriété donnée.
function reglesAvec(fichier, prop) {
  const out = [];
  postcss.parse(lire(fichier), { from: fichier }).walkDecls(prop, (d) => {
    if (d.parent?.selector) out.push(norm(d.parent.selector));
  });
  return out;
}

describe("BUG-19 — popover Mythes : MIGRER et la dette des Atrides restent atteignables", () => {
  it("les panneaux d'action ne sont plus renvoyés en dernier par un `order`", () => {
    const ordonnes = reglesAvec("styles/base.css", "order").join(" | ");
    expect(ordonnes).not.toMatch(/atrides-debt-panel|enee-panel/);
  });

  it("et le JSX les rend AVANT les cartes de statut", () => {
    const jsx = lire("components/views/CityView.jsx");
    const grille = jsx.indexOf('className="myths-grid-redesigned"');
    expect(grille).toBeGreaterThan(0);
    expect(jsx.indexOf("atrides-debt-panel")).toBeLessThan(grille);
    expect(jsx.indexOf("enee-panel")).toBeLessThan(grille);
  });

  it("le popover défile au lieu d'écraser ses panneaux", () => {
    expect(decls("styles/views-city-hud.css", ".hud-pop--myths > *")["flex-shrink"]).toBe("0");
  });

  it("le popover est borné au bord RÉEL de la fenêtre, que CityView publie", () => {
    expect(decls("styles/views-city-hud.css", ".hud-pop")["max-height"]).toContain("var(--aux-top-vp");
    // Au doigt, il s'arrête au-dessus de la barre basse (0 au bureau).
    expect(decls("styles/views-city-hud.css", ".hud-pop")["max-height"]).toContain("var(--touch-nav-total, 0px)");
    expect(lire("components/views/CityView.jsx")).toMatch(/setProperty\(\s*['"]--aux-top-vp['"]/);
  });

  it("<main> de la Cité découpe sans pouvoir défiler (tabulation = barre de ressources perdue)", () => {
    expect(decls("styles/views-city-hud.css", '.app[data-active-view="city"] main').overflow).toBe("clip");
  });
});

describe("BUG-20 — un débit trop long se rogne par la fin, jamais par ses premiers chiffres", () => {
  it("la ligne de débit est bornée à sa case", () => {
    expect(decls("styles/components.css", ".topbar .resource-rate-row")["max-width"]).toBe("100%");
  });
});

describe("BUG-42 — Doctrine de crise : le Conseil ne déborde plus sur l'Édit", () => {
  it("les colonnes s'empilent quand elles ne tiennent plus leur ligne", () => {
    expect(decls("styles/views-crises.css", ".doctrine-grid", { horsMedia: true })["grid-template-columns"]).toMatch(/^repeat\(auto-fit, minmax\(/);
  });
  it("et un sélecteur trop large passe sous son libellé", () => {
    expect(decls("styles/views-crises.css", ".doctrine-line")["flex-wrap"]).toBe("wrap");
  });
});

describe("BUG-44 — bannières de début de cycle empilées, pas superposées", () => {
  it("un seul conteneur posé, qui les empile", () => {
    const jsx = lire("components/views/CityView.jsx");
    const conteneur = jsx.indexOf('className="cycle-banners"');
    expect(conteneur).toBeGreaterThan(0);
    expect(jsx.indexOf("enee-boost-banner")).toBeGreaterThan(conteneur);
    expect(jsx.indexOf("atrides-pact-banner")).toBeGreaterThan(conteneur);
    const c = decls("styles/views-misc.css", '.app[data-active-view="city"] .cycle-banners');
    expect(c.position).toBe("absolute");
    expect(c["flex-direction"]).toBe("column");
  });
  it("les bannières elles-mêmes ne portent plus de position absolue", () => {
    for (const sel of ['.app[data-active-view="city"] .enee-boost-banner', '.app[data-active-view="city"] .atrides-pact-banner']) {
      expect(decls("styles/views-misc.css", sel).position).toBeUndefined();
    }
  });
  it("au bureau, la colonne s'arrête avant l'identité et la boutique", () => {
    const w = decls("styles/views-misc.css", ':root:not([data-pointer="coarse"]) .app[data-active-view="city"] .cycle-banners').width;
    expect(w).toContain("var(--hud-id-w)");
    expect(w).toContain("var(--shop-w)");
  });
});

describe("BUG-116 — plus de barres de défilement de page", () => {
  it("le débord de la barre de ressources LIT le padding de <main>", () => {
    expect(decls("styles/components.css", ".topbar").margin).toContain("var(--main-pad");
    expect(decls("styles/base.css", "main")["--main-pad"]).toBe("1rem");
  });
  it("la surcharge morte de layout.css a disparu", () => {
    const marges = [];
    postcss.parse(lire("styles/layout.css")).walkDecls("margin", (d) => {
      if (norm(d.parent?.selector || "") === ".topbar") marges.push(norm(d.value));
    });
    expect(marges.filter((m) => m.startsWith("-"))).toEqual([]);
  });
  it("le cadre des Plaisirs prend la hauteur réellement offerte", () => {
    const jsx = lire("components/views/PlaisirsView.jsx");
    expect(jsx).not.toMatch(/maxHeight:\s*'calc\(100vh - 96px\)'/);
    expect(jsx).toContain("var(--plaisirs-frame-h");
    expect(lire("styles/views-plaisirs.css")).toMatch(/--plaisirs-frame-h:\s*calc\(100vh - var\(--city-topbar-h\)/);
  });
  it("la page de crise tient dans la fenêtre, la section défile seule", () => {
    expect(decls("styles/views-crises.css", ".app main:has(#prestige.crisis-backdrop)")["max-height"]).toBe("100vh");
    const s = decls("styles/views-crises.css", ".app #prestige.view.active.crisis-backdrop");
    expect(s["overflow-y"]).toBe("auto");
    expect(s["grid-auto-rows"]).toBe("max-content");
    // Base 0 : en `auto`, la barre de ressources rétrécissait avec la section.
    expect(s.flex).toBe("1 1 0");
  });
});

describe("BUG-117 — libellés coupés", () => {
  it("le registre de la Chronique passe à la ligne au lieu d'une ellipse", () => {
    for (const sel of [".chronicle-reg-name", ".chronicle-reg-meta"]) {
      const d = decls("styles/views-chronicle-timeline.css", sel);
      expect(d["white-space"], sel).toBeUndefined();
      expect(d["overflow-wrap"], sel).toBe("anywhere");
    }
  });
  it("un nom de lieu des Plaisirs tient sur deux lignes", () => {
    expect(decls("styles/views-plaisirs.css", ".pm-nom")["-webkit-line-clamp"]).toBe("2");
  });
  it("un chiffre de l'encart identité ne se coupe pas", () => {
    const d = decls("styles/cite.css", ':root:not([data-pointer="coarse"]) .city-status-panel.is-identity .csp-value:not(.csp-value--era)');
    expect(d["white-space"]).toBe("nowrap");
  });
});
