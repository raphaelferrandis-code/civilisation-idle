// L'onglet Crédits suit CREDITS.md (audit 2026-10-05, STEAM-1). C'est la dérive
// entre les deux qui avait laissé MinZinn (CC BY 4.0, attribution OBLIGATOIRE) hors
// du jeu pendant deux mois : on relit donc le tableau des packs livrés et on exige,
// pour chaque ligne qui a un « Repère », une mention en français ET en anglais.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const credits = readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');
const dialog = readFileSync(path.join(ROOT, 'src/components/dialogs/OptionsDialog.jsx'), 'utf8');

// Les lignes du tableau « Packs livrés » : | Pack | Auteur | Page | Termes | Crédit | Repère | Fichiers | Import |
function packRows() {
  const sec = credits.split(/^## /m).find((s) => s.startsWith('Packs livrés'));
  return sec.split('\n')
    .filter((l) => l.startsWith('| ') && !l.startsWith('| Pack |'))
    .map((l) => l.slice(1, -1).split(' | ').map((c) => c.trim()));
}
// Les chaînes affichées, par langue (tr({ fr: "…", en: "…" })).
const strings = (lang) => [...dialog.matchAll(new RegExp(lang + ': "([^"]*)"', 'g'))].map((m) => m[1]);

describe('crédits — CREDITS.md et l\'onglet Crédits', () => {
  it('le tableau liste les packs livrés, et tout crédit exigé a son repère', () => {
    const rows = packRows();
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const r of rows) {
      expect(r.length, r[0]).toBe(8);
      if (/exigé/.test(r[4])) expect(r[5], `${r[0]} : crédit exigé sans repère`).not.toMatch(/^(—|-)?$/);
    }
  });

  it('chaque pack qui a un repère est crédité dans l\'onglet, en français et en anglais', () => {
    const fr = strings('fr'), en = strings('en');
    for (const r of packRows()) {
      const key = r[5];
      if (/^(—|-)?$/.test(key)) continue;
      expect(fr.some((s) => s.includes(key)), `${r[0]} (FR) : « ${key} » absent`).toBe(true);
      expect(en.some((s) => s.includes(key)), `${r[0]} (EN) : « ${key} » absent`).toBe(true);
    }
  });

  it('CC BY de MinZinn : licence et modifications dites ; Crusenho : lien vers la page produit', () => {
    for (const lang of ['fr', 'en']) {
      const minzinn = strings(lang).find((s) => s.includes('MinZinn'));
      expect(minzinn).toMatch(/creativecommons\.org\/licenses\/by\/4\.0/);
      expect(minzinn).toMatch(/minzinn\.itch\.io\/pixelvehicles/);
      expect(minzinn).toMatch(lang === 'fr' ? /modifiés/ : /modified/);
      expect(strings(lang).find((s) => s.includes('Crusenho'))).toMatch(/crusenho\.itch\.io\/complete-ui-book-styles-pack/);
      const fa = strings(lang).find((s) => s.includes('Font Awesome'));
      expect(fa).toMatch(/Open Font License 1\.1/);
      expect(fa).toMatch(/MIT/);
    }
  });

  it('le pack sans licence (LaserKiwi) n\'est plus parmi les packs livrés', () => {
    expect(packRows().some((r) => /LaserKiwi/i.test(r.join(' ')))).toBe(false);
  });

  // STEAM-7 : l'outil n'exige aucun crédit, mais Raph a voulu le nommer dans le jeu —
  // la page Steam déclare le contenu généré par IA, l'onglet Crédits dit la même chose.
  it('PixelLab est nommé dans l\'onglet, en français et en anglais, comme outil d\'IA', () => {
    const fr = strings('fr').find((s) => s.includes('PixelLab'));
    const en = strings('en').find((s) => s.includes('PixelLab'));
    expect(fr).toMatch(/pixellab\.ai/);
    expect(fr).toMatch(/IA/);
    expect(en).toMatch(/pixellab\.ai/);
    expect(en).toMatch(/AI/);
  });
});
