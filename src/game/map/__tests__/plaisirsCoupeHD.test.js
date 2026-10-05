// LA COUPE DES PLAISIRS (2026-10-03, iso/plaisirsCoupeHD.js) — les dix âges, à la grille
// des filles, en salles-boîtes dans leur charpente.
//
// Ce qu'un œil ne vérifierait qu'au hasard d'une partie : chaque âge range TOUS ses
// lieux dans ses étages (un étage par plateau dehors), chaque lieu a son ancre ET ses
// pixels (le clic tombe au pixel), les habitants sont dans le bâtiment et à la toise,
// la coupe est opaque, et le manège de l'hôtesse a sa cabine quand l'âge en a une.
import { describe, it, expect } from 'vitest';
import { bakeCoupeHD, figuresOuvertes } from '../iso/plaisirsCoupeHD.js';
import { plaisirsProgramme } from '../iso/plaisirsPlan.js';
import { wonderKitForBand } from '../iso/wonderKits.js';

const LIEUX = ['des', 'cartes', 'tickets', 'boutique', 'scene'];
// Une cuisson par âge, tout ouvert : les jeux fermés ne changent que les figures
// montrées (figuresOuvertes, audit du 2026-10-05 PERF-30).
const BAKES = Array.from({ length: 10 }, (_, b) => bakeCoupeHD(wonderKitForBand(b)));

describe('la coupe des Plaisirs', () => {
  it('chaque âge range chaque lieu une seule fois, et grandit avec les âges', () => {
    for (let b = 0; b <= 9; b += 1) {
      const flat = plaisirsProgramme(b).flat();
      for (const id of LIEUX) expect(flat.filter((x) => x === id).length, `bande ${b} : ${id}`).toBe(1);
      expect(flat, `bande ${b} : Icare est le toit, pas un étage`).not.toContain('icare');
    }
    const n = (b) => plaisirsProgramme(b).length;
    expect(n(0)).toBe(1);
    expect(n(0)).toBeLessThan(n(3));
    expect(n(3)).toBeLessThan(n(6));
  });

  it('chaque âge cuit sa coupe, opaque, un niveau par étage, à la grille des filles', () => {
    BAKES.forEach((out, b) => {
      for (let i = 3; i < out.R.data.length; i += 4) if (out.R.data[i] !== 255) throw new Error(`bande ${b} : alpha ${out.R.data[i]}`);
      expect(out.levels.length, `bande ${b}`).toBe(plaisirsProgramme(b).length);
      expect(out.hd.spritePx).toBe(1);
      expect(out.roofTop, `bande ${b} : toit dans le cadre`).toBeGreaterThan(0);
      for (const lv of out.levels) expect(lv.y1 - lv.y0).toBeGreaterThanOrEqual(50);
    });
  });

  it('ancre chaque lieu, et le clic tombe sur ses pixels', () => {
    BAKES.forEach((out, b) => {
      for (const id of plaisirsProgramme(b).flat().concat('icare')) {
        expect(out.spots[id], `bande ${b} : ${id}`).toBeTruthy();
        let n = 0;
        const c = out.idNames.indexOf(id);
        for (let k = 0; k < out.ids.length; k += 1) if (out.ids[k] === c) n += 1;
        expect(n, `bande ${b} : ${id} cliquable`).toBeGreaterThan(200);
        // Le menu volant (PlaisirsMenu.jsx, « tableau d'étages ») range les lieux par
        // `level` : l'étage du plan, Icare au toit (99).
        const lv = plaisirsProgramme(b).findIndex((row) => row.includes(id));
        expect(out.spots[id].level, `bande ${b} : ${id} étage`).toBe(id === 'icare' ? 99 : lv);
      }
      // Le menu liste aussi le boudoir (tous les âges) et le salon (dès le Néon) et les
      // fait défiler : ils restent des lieux ancrés, même sortis un jour de la boucle.
      const visites = b >= 6 ? ['boudoir', 'salon'] : ['boudoir'];
      for (const id of visites) expect(out.spots[id] && out.spots[id].level, `bande ${b} : ${id}`).toBeGreaterThanOrEqual(0);
    });
  });

  it('ses habitants sont dans le bâtiment, la troupe danse', () => {
    BAKES.forEach((out, b) => {
      const xs = out.levels.map((lv) => [lv.cx - lv.w / 2, lv.cx + lv.w / 2]);
      for (const f of out.figures) {
        expect(f.x, `bande ${b}`).toBeGreaterThan(Math.min(...xs.map((a) => a[0])));
        expect(f.x, `bande ${b}`).toBeLessThan(Math.max(...xs.map((a) => a[1])));
        expect(f.y, `bande ${b}`).toBeLessThan(out.waterY);
      }
      expect(out.figures.some((f) => f.type === 'd'), `bande ${b} : la troupe`).toBe(true);
    });
  });

  it("l'hôtesse mène son client au boudoir ; la cabine suit quand l'âge en a une", () => {
    BAKES.forEach((out, b) => {
      expect(out.motions && out.motions.tracks.length, `bande ${b}`).toBe(2);
      expect(out.show, `bande ${b} : les ombres de la tenture`).toBeTruthy();
      if (out.lift) {
        expect(out.motions.cabin.length).toBe(out.motions.tracks[0].keys.length);
        expect(out.hd.cabin, `bande ${b} : la cabine`).toBeTruthy();
      }
    });
    // Le Fonte et le Néon montent en ascenseur, les âges cosmiques sur le disque de lumière.
    for (const b of [5, 6, 7, 8, 9]) expect(BAKES[b].lift, `bande ${b}`).toBeTruthy();
  });

  // MEM-5 : le lieu de chaque pixel tient en un octet (l'index de son nom), plus en une
  // chaîne par case d'un tableau de W×H.
  it('range le lieu de chaque pixel en un octet, nommé par idNames', () => {
    BAKES.forEach((out, b) => {
      expect(out.ids, `bande ${b}`).toBeInstanceOf(Uint8Array);
      expect(out.ids.length).toBe(out.W * out.H);
      expect(out.idNames[0]).toBe(null);
      expect(new Set(out.idNames).size, `bande ${b} : un nom par lieu`).toBe(out.idNames.length);
      for (const id of Object.keys(out.spots)) expect(out.idNames, `bande ${b} : ${id}`).toContain(id);
      let max = 0;
      for (let k = 0; k < out.ids.length; k += 1) if (out.ids[k] > max) max = out.ids[k];
      expect(max).toBe(out.idNames.length - 1);
    });
  });

  // PERF-30 : la coupe se cuit une fois par âge, tout ouvert ; un jeu fermé ne montre
  // pas ses figures (croupier, joueurs), qui portent son `gate` et se tiennent dans sa salle.
  it("les figures d'un jeu fermé restent en coulisse, celles d'un jeu ouvert dans sa salle", () => {
    const JEUX = new Set(['des', 'cartes', 'tickets', 'boutique', 'machines', 'icare']);
    BAKES.forEach((out, b) => {
      const gated = out.figures.filter((f) => f.gate);
      expect(gated.length, `bande ${b} : des figures de jeu`).toBeGreaterThan(0);
      for (const f of gated) {
        expect(JEUX.has(f.gate), `bande ${b} : ${f.gate}`).toBe(true);
        const box = out.spots[f.gate].box;
        expect(f.x, `bande ${b} : ${f.gate} x`).toBeGreaterThanOrEqual(box.x0);
        expect(f.x, `bande ${b} : ${f.gate} x`).toBeLessThan(box.x1);
        expect(f.y, `bande ${b} : ${f.gate} y`).toBeGreaterThanOrEqual(box.y0);
        expect(f.y, `bande ${b} : ${f.gate} y`).toBeLessThanOrEqual(box.y1 + 8);
      }
      // Rien d'ouvert : la scène, le salon, le boudoir, les halls et les passants.
      const rien = figuresOuvertes(out.figures, { scene: true });
      expect(rien.some((f) => f.gate), `bande ${b}`).toBe(false);
      expect(rien.length).toBe(out.figures.length - gated.length);
      // Tout ouvert : toutes, dans l'ordre de la cuisson (l'ordre de peinture).
      const tout = Object.fromEntries([...JEUX].map((id) => [id, true]));
      expect(figuresOuvertes(out.figures, tout)).toEqual(out.figures);
      // Un seul jeu : ses figures s'ajoutent, à leur place dans l'ordre.
      const des = figuresOuvertes(out.figures, { des: true });
      expect(des).toEqual(out.figures.filter((f) => !f.gate || f.gate === 'des'));
    });
  });
});
