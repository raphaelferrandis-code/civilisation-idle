import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// SAV-15 (audit du 2026-10-05) : la mise débitée par une scène de jeu n'était
// écrite qu'à l'autosave des 10 s. Tuer le processus après avoir vu l'issue
// (ticket perdant, vol brûlé, main crevée…) la remboursait au rechargement.
// Chaque scène appelle désormais saveSoon(300) juste après l'appel moteur
// réussi qui débite. Garde statique : le rendu interactif de ces scènes (canvas,
// rAF) n'est pas montable sous vitest, mais l'appel doit rester collé au débit.
// Les automatisations (templeAutomation) n'en ont pas : un JSON.stringify par
// tick serait du gaspillage.

const here = dirname(fileURLToPath(import.meta.url));
const src = (file) => readFileSync(join(here, "..", file), "utf8").split(/\r?\n/);

// [scène, motif de l'appel moteur qui débite]
const DEBITS = [
  ["ScratchStage.jsx", /const startTicket = \(res\) =>/],   // achat ET relance passent par là
  ["IcarusStage.jsx", /launchIcarus\(amount\)/],
  ["BlackjackStage.jsx", /dealBlackjack\(amount\)/],
  ["BlackjackStage.jsx", /doubleBlackjack\(\)/],
  ["BlackjackStage.jsx", /splitBlackjack\(\)/],
  ["SlotsStage.jsx", /spinSlots\(amount/],
  ["RouletteStage.jsx", /spinRoulette\(paris/],
  ["CoursesStage.jsx", /lancerCourse\(paris/],
  ["DuelStage.jsx", /jouerDuel\(amount/],
  ["AuguryStage.jsx", /castAugury\(table\.id/],
  ["AuguryStage.jsx", /doubleAugury\(table\.id/]
];

describe("scènes de jeu : la mise débitée est écrite tout de suite (SAV-15)", () => {
  for (const [file, call] of DEBITS) {
    it(`${file} — ${call.source}`, () => {
      const lines = src(file);
      const at = lines.findIndex((l) => call.test(l) && !l.trim().startsWith("//"));
      expect(at).toBeGreaterThanOrEqual(0);
      const after = lines.slice(at, at + 8).join("\n");
      expect(after).toMatch(/saveSoon\(300\)/);
      expect(lines.some((l) => /import \{[^}]*\bsaveSoon\b[^}]*\} from '..\/..\/game\/core\/state\.js'/.test(l))).toBe(true);
    });
  }
});
