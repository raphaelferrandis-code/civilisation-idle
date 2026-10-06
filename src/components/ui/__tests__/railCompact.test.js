// RAIL COMPACT (audit 2026-10-05, BUG-43, décision de Raph) : neuf lieux dans une
// fenêtre basse → emblèmes de 32 px, servis par les variantes CUITES nav/@32.
// Deux moitiés doivent rester d'accord — la feuille de style (taille de la boîte) et
// PixelIcon (fichier servi) — sinon on retombe sur le 48 réduit par le navigateur au
// plus proche voisin, le défaut qu'on retire.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import postcss from 'postcss';
import PixelIcon, { RAIL_ICON_COMPACT, resolveIconSrc } from '../PixelIcon.jsx';

const ROOT = path.resolve(__dirname, '../../../..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const { PNG } = require_('pngjs');
const { bakeIcon } = require_('./scripts/lib/iconBake.cjs');
const lire = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const RAIL = ['nav/cite', 'nav/regulation', 'nav/plaisirs', 'nav/effondrement', 'glyphs/ruines', 'nav/boutique', 'nav/mythes', 'nav/marchandage', 'nav/chronique'];

describe('rail compact : neuf lieux, fenêtre basse', () => {
  it('rail.css pose 32 px dans EXACTEMENT la condition de RAIL_ICON_COMPACT', () => {
    let trouve = null;
    postcss.parse(lire('src/styles/rail.css')).walkAtRules('media', (a) => {
      if (a.params !== RAIL_ICON_COMPACT.media) return;
      a.walkRules((r) => {
        if (!r.selector.includes(`.tab:nth-child(${RAIL_ICON_COMPACT.minTabs})`) || !r.selector.includes('.tab-icon')) return;
        trouve = {};
        r.walkDecls((d) => { trouve[d.prop] = d.value; });
      });
    });
    expect(trouve).toEqual({ width: `${RAIL_ICON_COMPACT.size}px`, height: `${RAIL_ICON_COMPACT.size}px` });
  });

  it('le <picture> et son <source> ne posent aucune boîte (sinon +4 px par lieu)', () => {
    const regles = {};
    postcss.parse(lire('src/styles/components.css')).walkRules((r) => {
      r.walkDecls('display', (d) => { regles[r.selector] = d.value; });
    });
    expect(regles['.px-icon-picture']).toBe('contents');
    expect(regles['.px-icon-picture > source']).toBe('none');
  });

  it('chaque emblème du rail a sa variante 32×32 sur le disque', () => {
    for (const name of RAIL) {
      const url = resolveIconSrc(name, 'tab-icon', RAIL_ICON_COMPACT.size);
      expect(url, name).toBe(`/pixelart/ui/${name}@32.png`);
      const png = PNG.sync.read(fs.readFileSync(path.join(ROOT, 'public', url)));
      expect([png.width, png.height], name).toEqual([32, 32]);
    }
  });

  it('les variantes nav/@32 sont la CUISSON du maître 48, pas une réduction du navigateur', () => {
    for (const name of RAIL.filter((n) => n.startsWith('nav/'))) {
      const maitre = PNG.sync.read(fs.readFileSync(path.join(ROOT, 'public/pixelart/ui', name + '.png')));
      const livre = PNG.sync.read(fs.readFileSync(path.join(ROOT, 'public/pixelart/ui', name + '@32.png')));
      expect(Buffer.compare(bakeIcon(maitre, 32, 0.5).out.data, livre.data), name).toBe(0);
    }
  });

  it('PixelIcon sert le 32 par un <picture>, le 48 restant l’image par défaut', () => {
    const html = renderToStaticMarkup(createElement(PixelIcon, { name: 'nav/cite', className: 'tab-icon', size: 48, compact: RAIL_ICON_COMPACT }));
    expect(html).toContain(`<source media="${RAIL_ICON_COMPACT.media}" srcSet="/pixelart/ui/nav/cite@32.png"/>`);
    expect(html).toContain('src="/pixelart/ui/nav/cite.png"');
    expect(renderToStaticMarkup(createElement(PixelIcon, { name: 'nav/cite', className: 'tab-icon', size: 48 }))).not.toContain('<picture');
  });

  it('App ne demande la variante compacte qu’au bureau, à partir de neuf lieux', () => {
    expect(lire('src/App.jsx')).toMatch(/compact=\{!coarse && ongletsBarre\.length >= RAIL_ICON_COMPACT\.minTabs \? RAIL_ICON_COMPACT : undefined\}/);
  });
});
