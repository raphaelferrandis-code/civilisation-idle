// En mode iso, TOUTE route est en biais à l'écran : un personnage privé de ses 4
// bandes diagonales retombe silencieusement sur la bande cardinale et marche donc
// face caméra pendant qu'il avance en diagonale. Repéré à l'œil par Raphaël sur le
// porteur de panier (2026-07-24) — ni le lint, ni le rendu, ni aucun test ne
// bronchaient, le repli étant justement conçu pour ne rien casser. D'où cette
// garde d'existence, ancrée sur le roster du MOTEUR (agents.js) et sur
// l'arithmétique de découpe de drawNamedAgentIso.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { ISO_AGENT_NAMES, BASKET_CARRIERS, ISO_DIAG, agentDir } from '../agents.js';

const AGENTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../public/pixelart/agents');
const bandPath = (name, dir) => path.join(AGENTS, agentDir(name), `${name}-${dir}.png`);
// Gabarit lu dans l'IHDR (largeur et hauteur en octets 16..24) : inutile
// d'embarquer un décodeur pour vérifier une découpe.
function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
// Part de la frame réellement occupée par le personnage (hauteur de sa boîte
// opaque, frame 0), = sa taille apparente une fois la bande dessinée dans la
// boîte de hauteur fixe de drawNamedAgentIso.
function charHeightFraction(file) {
  const p = PNG.sync.read(readFileSync(file));
  const F = p.height;                                   // frames carrées
  let top = -1, bottom = -1;
  for (let y = 0; y < F; y += 1) {
    for (let x = 0; x < F; x += 1) {
      if (p.data[(y * p.width + x) * 4 + 3] > 16) { if (top < 0) top = y; bottom = y; break; }
    }
  }
  return bottom < 0 ? 0 : (bottom - top + 1) / F;
}

describe('bandes diagonales des personnages de la carte iso', () => {
  it('chaque personnage dessinable en iso a ses 4 bandes diagonales', () => {
    const missing = [];
    for (const name of ISO_AGENT_NAMES) {
      for (const dir of ISO_DIAG) if (!existsSync(bandPath(name, dir))) missing.push(`${name}-${dir}`);
    }
    expect(missing).toEqual([]);
  });

  // Sans ceci la garde serait décorative : vider le roster la ferait passer au vert
  // en ne vérifiant plus rien. Les porteurs de panier sont nommés à la main parce
  // qu'ils entrent par une autre porte que les habitants (v.type === 'basket').
  it('le roster couvre les habitants de toutes les ères ET les porteurs de panier', () => {
    for (const carrier of BASKET_CARRIERS) expect(ISO_AGENT_NAMES).toContain(carrier);
    for (const era of ['caveman', 'villager', 'greekman', 'industrialman', 'modernman', 'futureman']) {
      expect(ISO_AGENT_NAMES).toContain(era);
    }
    expect(ISO_AGENT_NAMES.length).toBeGreaterThanOrEqual(30);
  });

  // drawNamedAgentIso déduit la frame de la HAUTEUR de bande et arrondit
  // largeur/hauteur pour compter les frames : une planche dont la largeur n'est pas
  // un multiple exact de sa hauteur se découpe de travers, en glissant d'un peu
  // plus de sprite à chaque frame.
  it('chaque bande est une planche de frames CARRÉES, au moins un cycle de marche', () => {
    const bad = [];
    for (const name of ISO_AGENT_NAMES) {
      for (const dir of ISO_DIAG) {
        const file = bandPath(name, dir);
        if (!existsSync(file)) continue;            // déjà signalé par le test d'existence
        const { w, h } = pngSize(file);
        if (w % h !== 0 || w / h < 4) bad.push(`${name}-${dir} (${w}×${h})`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('les 4 vues d’un même personnage partagent leur gabarit de frame', () => {
    const drifting = [];
    for (const name of ISO_AGENT_NAMES) {
      const sizes = ISO_DIAG.map((dir) => bandPath(name, dir)).filter(existsSync).map(pngSize);
      if (sizes.length > 1 && sizes.some((s) => s.h !== sizes[0].h || s.w !== sizes[0].w)) {
        drifting.push(`${name} : ${sizes.map((s) => `${s.w}×${s.h}`).join(', ')}`);
      }
    }
    expect(drifting).toEqual([]);
  });

  // Même gabarit de frame ne veut pas dire même TAILLE DE PERSONNAGE : la boîte de
  // dessin est fixe, donc c'est la part de frame réellement occupée qui décide de
  // la taille à l'écran. Une vue générée plus petite que ses sœurs fait rétrécir
  // l'habitant quand il tourne au coin d'une rue. Vu pour de vrai : une relance de
  // job PixelLab a rendu basket-man sud-ouest à 44 % de sa frame contre 64 % pour
  // les trois autres (×1,45), reconstruit au miroir depuis le sud-est. Tout le
  // roster livré tient sous ×1,13, d'où le seuil.
  it('les 4 vues d’un même personnage font la même taille à l’écran', () => {
    const drifting = [];
    for (const name of ISO_AGENT_NAMES) {
      const files = ISO_DIAG.map((dir) => bandPath(name, dir));
      if (!files.every(existsSync)) continue;           // déjà signalé par le test d'existence
      const occ = files.map(charHeightFraction);
      const spread = Math.max(...occ) / Math.min(...occ);
      if (spread > 1.25) drifting.push(`${name} : ×${spread.toFixed(2)} [${occ.map((o) => `${Math.round(o * 100)}%`).join(' ')}]`);
    }
    expect(drifting).toEqual([]);
  });
});
