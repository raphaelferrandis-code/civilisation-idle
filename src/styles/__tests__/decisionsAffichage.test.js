/**
 * DÉCISIONS DE RAPH SUR L'AFFICHAGE (audit du 2026-10-05, lot 11).
 * ---------------------------------------------------------------------------
 * Ces règles ne se voient qu'au rendu ; un test unitaire garde en revanche la
 * règle qui applique chaque décision, avec la raison à côté.
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

// Déclarations (prop → valeur) de toutes les règles dont un sélecteur vaut `sel`.
function decls(fichier, sel) {
  const out = {};
  postcss.parse(lire(fichier), { from: fichier }).walkRules((r) => {
    if (!r.selectors.some((s) => norm(s) === sel)) return;
    r.walkDecls((d) => { out[d.prop] = norm(d.value); });
  });
  return out;
}

const RUBAN = ':root:not([data-pointer="coarse"]) .app[data-active-view="city"]';

describe("BUG-20 (b) — le ruban passe sur deux lignes quand il ne tient plus", () => {
  it("les cases se rangent en ligne et vont à la ligne, centrées, sans rétrécir", () => {
    const r = decls("styles/cite.css", `${RUBAN} .topbar-resources:not(.is-partial)`);
    expect(r.display).toBe("flex");
    expect(r["flex-wrap"]).toBe("wrap");
    expect(r["justify-content"]).toBe("center");
    expect(decls("styles/cite.css", `${RUBAN} .topbar .resource-card-unified`).flex).toBe("0 0 auto");
  });
});

describe("BUG-44 — bannières de début de cycle sur une plaque opaque", () => {
  it("Énée et les Atrides : la plaque de l'identité, le liseré gardé", () => {
    const enee = decls("styles/views-city.css", ".enee-boost-banner");
    const atrides = decls("styles/views-city.css", ".atrides-pact-banner");
    expect(enee.background).toBe("rgba(12, 15, 24, 0.95)");
    expect(atrides.background).toBe("rgba(12, 15, 24, 0.95)");
    expect(enee.border).toBe("1px solid var(--green)");
    expect(atrides.border).toBe("1px solid var(--gold)");
    // Pacte scellé : la teinte d'ère reste, mais posée sur la plaque.
    expect(decls("styles/views-city.css", ".atrides-pact-banner.is-sealed").background).toContain("rgba(12, 15, 24, 0.95)");
  });
});

describe("BUG-117 (b) — le badge ⚡×N passe sous le nom quand la place manque", () => {
  it("la ligne du nom va à la ligne, l'écart horizontal reste celui d'avant", () => {
    const d = decls("styles/purchase.css", ".pr-name-row");
    expect(d["flex-wrap"]).toBe("wrap");
    expect(d.gap.split(" ")[1]).toBe("0.45rem");
  });
});

describe("BUG-118 — plus de ligne d'échéance dans la boutique", () => {
  it("ni composant, ni style : « payable dans… » a quitté l'écran", () => {
    expect(lire("components/ui/PurchaseRow.jsx")).not.toMatch(/etaLabel|pr-eta/);
    expect(lire("components/ui/BuildingShop.jsx")).not.toMatch(/etaLabel|payable dans \$\{|affordable in/);
    for (const f of ["styles/purchase.css", "styles/cite.css", "styles/touch-shell.css"]) {
      expect(lire(f), f).not.toContain(".pr-eta");
    }
  });
});

describe("BUG-53 (c) — le flou « verre » livré tel qu'on le voit en dev", () => {
  const feuilles = fs.readdirSync(src, { recursive: true })
    .map((f) => String(f).replace(/\\/g, "/"))
    .filter((f) => f.endsWith(".css"));

  it("aucune feuille ne porte -webkit-backdrop-filter", () => {
    // lightningcss ne garde au build que la DERNIÈRE des deux formes : la forme
    // préfixée, que Chromium ignore. Le flou n'existait alors qu'en dev.
    const fautifs = [];
    for (const f of feuilles) {
      postcss.parse(lire(f), { from: f }).walkDecls("-webkit-backdrop-filter", (d) => {
        fautifs.push(`${f} : ${d.parent?.selector || "?"}`);
      });
    }
    expect(feuilles.length).toBeGreaterThan(0);
    expect(fautifs).toEqual([]);
  });

  it("les modales et leur voile n'ont pas de flou ; les panneaux gardent le leur", () => {
    expect(decls("styles/components.css", "dialog")["backdrop-filter"]).toBeUndefined();
    expect(decls("styles/components.css", "dialog::backdrop")["backdrop-filter"]).toBeUndefined();
    expect(decls("styles/base.css", ".panel")["backdrop-filter"]).toBe("blur(16px)");
  });
});

describe("PERF-11 (A + C) — le pouls de crise à 20 Hz, figé sous les modales", () => {
  // cubic-bezier(.42,0,.58,1) (= ease-in-out), y(x) par bissection.
  const bez = (t, a, b) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  const ease = (x) => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (bez(m, 0.42, 0.58) < x) lo = m; else hi = m; }
    return bez((lo + hi) / 2, 0, 1);
  };

  it("49 images tenues par step-end, chacune échantillonnée sur l'ancien pouls", () => {
    const images = [];
    postcss.parse(lire("styles/layout.css")).walkAtRules("keyframes", (a) => {
      if (a.params !== "crisis-vignette-pulse") return;
      a.walkRules((r) => {
        const m = r.first.value.match(/inset 0 0 ([\d.]+)px rgba\(239, 68, 68, ([\d.]+)\)/);
        images.push({ pct: parseFloat(r.selector), flou: +m[1], alpha: +m[2] });
      });
    });
    expect(images).toHaveLength(49);
    images.forEach((im, k) => {
      expect(im.pct).toBeCloseTo((k * 100) / 48, 3);
      const y = k <= 24 ? ease(k / 24) : 1 - ease((k - 24) / 24);
      expect(Math.abs(im.flou - (45 + 40 * y))).toBeLessThan(0.051);
      expect(Math.abs(im.alpha - (0.28 + 0.27 * y))).toBeLessThan(0.0006);
    });
    // La règle de base (hors @media reduced-motion, qui coupe tout).
    let anim = null;
    postcss.parse(lire("styles/layout.css")).walkRules(".app.crisis-extreme::after", (r) => {
      if (r.parent.type === "root") r.walkDecls("animation", (d) => { anim = d.value; });
    });
    expect(anim).toBe("crisis-vignette-pulse 2.4s infinite step-end");
  });

  it("sous une <dialog> ouverte, le pouls est en pause (pas coupé)", () => {
    expect(decls("styles/layout.css", ".app.crisis-extreme:has(dialog[open])::after")["animation-play-state"])
      .toBe("paused");
  });
});

describe("PERF-65 (b) et PERF-62 — lueurs « peintes une fois, opacité animée »", () => {
  // Animations INFINIES qui animent encore une ombre ou un filtre, et pourquoi.
  // Toute nouvelle venue fait échouer la garde : la peindre une fois et n'animer que
  // l'opacité (classe .lueur, components.css), ou l'ajouter ici avec sa raison.
  const PERMISES = {
    "affordable-breathe": "souffle de la boutique, en pause joueur absent (PERF-65 c)",
    "crisis-vignette-pulse": "pouls de crise, 20 images/s tenues par step-end (PERF-11)",
    sgCollapsePulse: "jauge de chute : PERF-11 (D) non retenu",
    "pm-rampe": "lueur de TEXTE (spectacle), gardée (décision de Raph, PERF-65)",
    "slots-breathe": "lueur de TEXTE (machine), gardée (décision de Raph, PERF-65)",
    "pm-flicker": "flamme en steps(2) : deux images par cycle",
  };
  const feuilles = fs.readdirSync(path.join(src, "styles")).filter((f) => f.endsWith(".css"));
  const kf = {}, usages = [];
  for (const f of feuilles) {
    const root = postcss.parse(lire(`styles/${f}`), { from: f });
    root.walkAtRules(/keyframes$/, (a) => {
      const props = new Set();
      a.walkDecls((d) => props.add(d.prop));
      kf[a.params] = [...props];
    });
    root.walkDecls(/^animation(-name)?$/, (d) => usages.push({ f, sel: d.parent.selector || "", val: d.value }));
  }

  it("aucune animation infinie n'anime une ombre ou un filtre hors des exceptions comptées", () => {
    const fautives = new Set();
    for (const u of usages) {
      if (!/infinite/.test(u.val)) continue;
      for (const nom of u.val.split(/[\s,]+/).filter((t) => kf[t])) {
        if (kf[nom].some((p) => /shadow|filter/.test(p)) && !PERMISES[nom]) fautives.add(`${u.f} : ${nom} (${u.sel})`);
      }
    }
    expect(usages.length).toBeGreaterThan(20);
    expect([...fautives]).toEqual([]);
  });

  it("les lueurs converties ne respirent plus qu'en opacité", () => {
    for (const nom of ["lueur-fondu", "icarus-sun-breathe", "scratch-shine"]) expect(kf[nom], nom).toEqual(["opacity"]);
    for (const nom of ["nuit-lueur", "cagnotte-nuit", "gr-ready-pulse"]) expect(kf[nom], nom).toBeUndefined();
  });

  // Décisions de Raph du 2026-10-06 (PERF-65, suite) : (1) le bouton SE POSER perd son
  // onde, que le clip-path rognait et qui écrasait l'embossage et l'enfoncement ;
  // (2) la dépêche orale respire 4 fois puis reste fixe, sur l'état de repos de son pouls.
  it("SE POSER sans onde (il s'enfonce de nouveau), dépêche orale : 4 respirations puis fixe", () => {
    expect(kf["icarus-pulse"]).toBeUndefined();
    expect(usages.filter((u) => /icarus-pulse/.test(u.val))).toEqual([]);
    expect(decls("styles/views-regulation.css", ".icarus-cashout").animation).toBeUndefined();
    expect(decls("styles/views-regulation.css", ".icarus-cashout:active")["box-shadow"]).toContain("inset");
    const oral = decls("styles/components.css", ".chronicle-ticker.is-oral .ticker-masthead");
    expect(oral.animation).toBe("oralPulse 5s 4 ease-in-out");
    // Fixe = l'état des bornes du pouls : pas de saut à la dernière respiration.
    let repos = null;
    postcss.parse(lire("styles/components.css")).walkAtRules("keyframes", (a) => {
      if (a.params === "oralPulse") a.walkRules((r) => { if (norm(r.selector) === "0%, 100%") repos = r.first.value; });
    });
    expect(oral["text-shadow"]).toBe(repos);
  });

  it("les deux états d'avant sont les deux calques d'aujourd'hui", () => {
    expect(decls("styles/plaisirs-nuit.css", ".nuit-bandeau > .lueur")).toMatchObject({
      "--lueur-a": "0 0 18px rgba(232, 74, 122, 0.4)", "--lueur-b": "0 0 36px rgba(255, 179, 90, 0.7)",
      "--lueur-duree": "1.8s", "--lueur-retard": "0.7s",
    });
    expect(decls("styles/plaisirs-nuit.css", ".salle-cagnotte > .lueur")["--lueur-b"]).toContain("0 0 30px rgba(255, 200, 60, 0.85)");
    expect(decls("styles/views-shop-myths.css", ".gr-rung.is-ready > .lueur")).toMatchObject({
      "--lueur-a": "0 0 6px rgba(230, 195, 120, 0.12)", "--lueur-b": "0 0 14px rgba(230, 195, 120, 0.3)", "--lueur-duree": "1.3s",
    });
    expect(decls("styles/views-regulation.css", ".icarus-sun-halo.is-eclat::before").filter).toBe("drop-shadow(0 0 30px rgba(255, 190, 80, 0.95))");
  });

  it("les composants posent les calques", () => {
    for (const f of ["components/views/plaisirs/NuitBandeau.jsx", "components/views/plaisirs/CagnotteSalle.jsx", "components/ui/GrandResetLadder.jsx"]) {
      expect(lire(f), f).toContain('className="lueur"');
    }
    expect(lire("components/ui/IcarusStage.jsx")).toMatch(/icarus-sun-halo is-repos[\s\S]*icarus-sun-halo is-eclat/);
  });
});

describe("BUG-106 (a) — le bandeau-dépêche habillé aux ères cosmiques", () => {
  it("jade, or et irisé : titre, halo et texte, sans cadre ajouté", () => {
    for (const theme of ["is-noosphere", "is-stellar", "is-demiurge"]) {
      expect(lire("components/ui/journalThemes.js")).toContain(`"${theme}"`);
      const titre = decls("styles/components.css", `.chronicle-ticker.${theme} .ticker-masthead`);
      expect(titre.color, theme).toBeTruthy();
      expect(titre["text-shadow"], theme).toBeTruthy();
      expect(decls("styles/components.css", `.chronicle-ticker.${theme} .ticker-line`).color, theme).toBeTruthy();
      // Aucun cadre : en Cité, le HUD impose déjà le fond et la bordure.
      const racine = decls("styles/components.css", `.chronicle-ticker.${theme}`);
      expect(racine.border, theme).toBeUndefined();
      expect(racine.background, theme).toBeUndefined();
    }
  });

  it("déclarés AVANT la dépêche de crise, qui doit primer", () => {
    const css = lire("styles/components.css");
    expect(css.indexOf(".chronicle-ticker.is-demiurge .ticker-masthead"))
      .toBeLessThan(css.indexOf(".chronicle-ticker.is-crisis .ticker-masthead"));
  });
});

describe("Lisibilité de la Cité (retour extérieur du 2026-10-07, maquette validée par Raph)", () => {
  const BUREAU = ':root:not([data-pointer="coarse"])';

  it("les bonus, à côté de la clepsydre : ni liseré de couleur ni icône, le nom et la valeur en toutes lettres (Raph, 2026-10-08)", () => {
    const carte = decls("styles/cite.css", `${BUREAU} .city-status-panel.is-identity .csp-bonuses .myth-status-card`);
    expect(carte.border).toBe("0");
    expect(carte.padding).toBe("0");
    expect(decls("styles/cite.css", `${BUREAU} .city-status-panel.is-identity .csp-bonuses .myth-card-icon`).display).toBe("none");
    expect(decls("styles/cite.css", `${BUREAU} .city-status-panel.is-identity .csp-bonuses .myth-card-info :is(span, strong)`)["white-space"]).toBe("normal");
  });

  it("le rouge est réservé au danger : un coût impayable s'éteint, il ne rougit plus", () => {
    const manque = decls("styles/purchase.css", ".bp-cost-item.is-lacking");
    expect(manque.color).toBe("var(--text-weak)");
    expect(lire("styles/purchase.css")).not.toMatch(/is-lacking[^{]*\{[^}]*var\(--red\)/);
  });

  it("crise profonde et effondrement imminent ne portent plus la même couleur", () => {
    const crise = decls("styles/views-city.css", ".stability-gauge.sg-crisis")["--sg-color"];
    const imminent = decls("styles/views-city.css", ".stability-gauge.sg-collapse")["--sg-color"];
    expect(crise).toBe("var(--state-crisis)");
    expect(imminent).toBe("var(--red)");
  });

  it("au bureau, l'état passe au second corps net (27 px) : % des foyers, alerte, noms des rangées", () => {
    expect(decls("styles/cite.css", `${BUREAU} .regul-quick-val`).font).toContain("var(--fs-display)");
    expect(decls("styles/cite.css", `${BUREAU} .app[data-active-view="city"] .stability-gauge.sg-collapse .sg-label`).font)
      .toContain("var(--fs-display)");
    expect(decls("styles/cite.css", `${BUREAU} .app[data-active-view="city"] .city-shop-dock .pr-name`).font)
      .toContain("var(--fs-display)");
  });

  it("la barre repliée : le % des foyers au corps de lecture, institutions et politiques en retrait", () => {
    const pct = decls("styles/cite.css", `${BUREAU} .app[data-active-view="city"] .regul-summary-pct`);
    expect(pct.font).toContain("var(--fs-read)");
    expect(pct.color).toBe("var(--text-strong)");
    expect(decls("styles/cite.css", `${BUREAU} .app[data-active-view="city"] .regul-summary-buffer`).color).toBe("var(--text-weak)");
  });

  it("le ruban : chiffres en ivoire, débits positifs en gris (le négatif garde son rouge)", () => {
    expect(decls("styles/views-city.css", ".resource-card-unified .resource-value").color).toBe("var(--text-strong)");
    expect(decls("styles/components.css", ".topbar .resource-card-unified .rate-value.positive").color).toBe("var(--text-weak)");
    expect(decls("styles/views-city.css", ".rate-value.negative").color).toBe("var(--red)");
  });

  it("la réserve d'absence a quitté la carte d'identité pour les Options", () => {
    expect(lire("components/ui/CityStatusPanel.jsx")).toMatch(/revealMeta && !identity && \(\s*<div\s+className="csp-idle"/);
    expect(lire("components/dialogs/OptionsDialog.jsx")).toContain('data-opt="idle-reserve"');
  });
});
