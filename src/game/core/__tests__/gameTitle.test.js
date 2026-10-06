// LE NOM DU JEU DANS LA FENÊTRE ET L'ONGLET (audit 2026-10-05, STEAM-10 et I18N-11,
// décision de Raph) : « Effondrement Idle » en français, « Collapse Idle » en anglais.
// Le titre restait « Civilisation: Effondrement Idle » dans les deux langues ; il suit
// désormais la langue (applyDocumentLang), et la fenêtre de l'.exe reprend le titre
// de la page.
import { describe, it, expect, afterEach, vi } from "vitest";

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

async function boot(lang) {
  vi.stubGlobal("localStorage", memoryStorage({ "civ-opt-lang": lang }));
  const doc = { documentElement: {}, title: "" };
  vi.stubGlobal("document", doc);
  vi.resetModules();
  const mod = await import("../i18n.js");
  return { mod, doc };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("titre de la fenêtre et de l'onglet", () => {
  it("français : « Effondrement Idle »", async () => {
    const { mod, doc } = await boot("fr");
    mod.applyDocumentLang();
    expect(doc.title).toBe("Effondrement Idle");
    expect(doc.documentElement.lang).toBe("fr");
  });

  it("anglais : « Collapse Idle », et le titre suit un changement de langue", async () => {
    const { mod, doc } = await boot("en");
    mod.applyDocumentLang();
    expect(doc.title).toBe("Collapse Idle");
    mod.setLang("fr");
    expect(doc.title).toBe("Effondrement Idle");
  });

  it("le nom vit à un seul endroit côté page", async () => {
    const { mod } = await boot("fr");
    expect(mod.GAME_TITLE).toEqual({ fr: "Effondrement Idle", en: "Collapse Idle" });
  });
});
