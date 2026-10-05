"use strict";

// LES TRACES — ce qui reste sur la carte quand une histoire est finie
// (docs/PLAN-FAITS-DIVERS.md §2, règle 6). Elles sont RÉSIDENTES : présentes à chaque
// cycle suivant, sans compter dans le plafond des deux scènes, sans jamais partir.
// Discrètes comme le reste ; un clic dit ce qu'on y lit (`traceSay` des données).
//   la Secte      le cercle de pierres à la lisière, des braises la nuit
//   la Tortue     endormie au bout de son chemin
//   la Chèvre     l'enclos à la barrière ouverte, Blanquette dedans
//   Diogène       le tonneau au bord de la place, le chien dort dedans
//   les Grandvent une plaque au bord de l'eau
//   la Borne      la borne, et sa plaque
//   le Monstre    une ombre immense qui passe, lentement, dans le fleuve
//   le Musicien   un chapeau posé au coin de la place
//   Nancy-William un banc au bord de l'eau, un ruban rouge noué au dossier
import { CM } from '../layout.js';
import { worldToScreen, depthOf } from '../iso/projection.js';
import { vieK, vieSprite, vieBlit } from '../iso/isoVie.js';
import { queueFlameGlow, FLAME_COL } from '../flameGlow.js';
import { drawCritterIso } from '../critters.js';
import { AGENT_SCALE } from '../agents.js';
import { fdBlit, fdPixel, fdNoteThing } from './fdDraw.js';
import { fdHash, lisiereSpots, plazaEdgeSpots, bankSpots, engineTilesByType, doorstepOf } from './fdSpots.js';
import { tortoisePath } from './fdTortue.js';
import { T, thing, ringPoints } from './fdKit.js';
import { FD_STORIES } from '../../data/faitsDivers.js';
import { AMOUREUX } from '../../data/faitsDiversAmoureux.js';

// Les bords de champs qui se voient (le seuil de chaque champ irrigué), puis la lisière :
// l'enclos de Blanquette et la borne des Pinçon ne se disputent pas la même place.
function fieldEdges(L, seed) {
  const list = (engineTilesByType(L).get('irrigated_fields') || []).map((t) => doorstepOf(L, t, seed)).filter((d) => d && d.open >= 0);
  list.sort((x, y) => fdHash(seed + x.key) - fdHash(seed + y.key));
  return list.concat(lisiereSpots(L).slice(0, 10));
}
const sayOf = (id) => (id === 'amoureux' ? AMOUREUX.traceSay : FD_STORIES[id] && FD_STORIES[id].traceSay);

// Un décor-trace : un ou plusieurs dessins, et une chose cliquable qui le résume.
function simple(app, parts, opts = {}) {
  const s = app.spot;
  const say = sayOf(app.storyId);
  const it = thing(app, 0, s.x, s.y, 0);
  it.say = say;
  app.figs = [it];
  const phase = (fdHash(app.seed + ':ph') % 1000) / 1000;
  app.actors = (now, out, alpha) => {
    for (const part of parts) {
      const wx = (s.x + (part.dx || 0)) * T(), wy = (s.y + (part.dy || 0)) * T();
      out.push({
        wx, wy, d: depthOf(wx, wy) + (part.eps || 0),
        draw(ctx, nowD) {
          const box = part.draw ? part.draw(ctx, wx, wy, nowD, alpha, phase) : fdBlit(ctx, part.name, part.frame || 0, wx, wy, alpha, !!part.flip);
          if (box && part.click) fdNoteThing(it, box);
        },
      });
    }
    if (opts.extra) opts.extra(out, now, alpha, phase);
  };
  app.open = () => ({ who: say.who, line: say.line, isNew: false });
  return app;
}

const TRACES = {
  secte: {
    build: (app) => simple(app, [
      ...ringPoints(8, 1.2, 0.2).map((p, i) => ({ name: i % 2 ? 'menhir2' : 'menhir', dx: p.dx, dy: p.dy, click: true })),
      {
        dx: 0, dy: 0, click: true,
        draw(ctx, wx, wy, now, alpha, phase) {
          const box = fdBlit(ctx, 'braises', Math.floor(now / 500 + phase * 3) % 2, wx, wy, alpha);
          const p = worldToScreen(wx, wy);
          queueFlameGlow(p.x, p.y - vieK(), 8 * vieK() / 1.135, FLAME_COL, now, phase, 0.35);
          return box;
        },
      },
    ]),
    spots: (L) => lisiereSpots(L).slice(0, 20),
  },
  tortue: {
    build: (app) => simple(app, [{
      click: true,
      draw(ctx, wx, wy, now, alpha) {
        const box = fdBlit(ctx, 'tortue', 0, wx, wy, alpha);
        // Elle dort : un « z » de temps en temps.
        const v = (now / 4000) % 1;
        if (box) fdPixel(ctx, box.x1 + vieK(), box.y0 - v * 6 * vieK(), [244, 244, 236], alpha * (1 - v));
        return box;
      },
    }]),
    spots: (L) => {
      const pts = tortoisePath(L);
      const p = pts[pts.length - 1];
      return p ? [{ x: p.x, y: p.y, key: 'trace:zenon' }] : [];
    },
  },
  chevre: {
    build: (app) => simple(app, [
      { name: 'enclos', click: true },
      {
        dx: 0.05, dy: -0.05, eps: 0.01, click: true,
        draw(ctx, wx, wy, _now, alpha) {
          const p = worldToScreen(wx, wy);
          const z = CM.cam ? CM.cam.zoom : 1;
          const pa = ctx.globalAlpha;
          if (alpha < 1) ctx.globalAlpha = pa * alpha;
          const m = drawCritterIso(ctx, p.x, p.y, CM.TILE * z, { kind: 'goat', dir: 2 }, AGENT_SCALE, CM.dpr);
          ctx.globalAlpha = pa;
          return m ? { x0: p.x - m.box * 0.45, x1: p.x + m.box * 0.45, y0: p.y - m.box * 0.85, y1: p.y } : null;
        },
      },
    ]),
    spots: (L, c, seed) => fieldEdges(L, seed + ':enclos'),
  },
  cynique: {
    build: (app) => simple(app, [
      { name: 'tonneau', click: true },
      {
        eps: 0.01, click: true,
        draw(ctx, wx, wy, now, alpha) {
          // Le chien dedans : sa tête dépasse du bord, puis le corps du tonneau devant lui.
          const p = worldToScreen(wx, wy);
          const k = vieK();
          vieBlit(ctx, vieSprite('dogSit', 0, false), p.x, p.y - 8.5 * k, k, alpha);
          return fdBlit(ctx, 'tonneau', 1, wx, wy, alpha);
        },
      },
    ]),
    spots: (L, c, seed, band) => plazaEdgeSpots(L, band).slice(0, 20),
  },
  volant: {
    build: (app) => simple(app, [{ name: 'plaque', click: true }]),
    spots: (L) => bankSpots(L).slice(0, 20),
  },
  borne: {
    build: (app) => simple(app, [{ name: 'borne', click: true }, { name: 'plaque', dx: 0.3, dy: 0.25, click: true }]),
    spots: (L, c, seed) => fieldEdges(L, seed + ':borne'),
  },
  monstre: {
    build: (app) => simple(app, [], {
      extra(out, now, alpha, phase) {
        // Une ombre immense, qui passe lentement le long de la rive, et revient.
        const s = app.spot;
        const v = Math.sin(now / 9000 + phase * 6);
        const wx = (s.wxp != null ? s.wxp : s.x) * T() + v * T() * 1.2, wy = (s.wyp != null ? s.wyp : s.y) * T() - v * T() * 0.3;
        const it = app.figs[0];
        out.push({
          wx, wy, d: wx + wy - 2,
          draw(ctx) {
            const box = fdBlit(ctx, 'dos', 0, wx, wy, alpha * 0.28, v < 0);
            if (box) fdNoteThing(it, box);
          },
        });
      },
    }),
    spots: (L) => bankSpots(L).slice(0, 20),
  },
  musicien: {
    build: (app) => simple(app, [{ name: 'chapeau', click: true }]),
    spots: (L, c, seed, band) => plazaEdgeSpots(L, band).slice(0, 20),
  },
  amoureux: {
    build: (app) => simple(app, [{
      click: true,
      draw(ctx, wx, wy, now, alpha) {
        const box = fdBlit(ctx, 'banc', 0, wx, wy, alpha);
        if (box) {
          // Le petit ruban rouge noué au dossier.
          fdPixel(ctx, box.x1 - 2 * vieK(), box.y0, [206, 34, 40], alpha);
          fdPixel(ctx, box.x1 - 2 * vieK(), box.y0 + vieK(), [150, 22, 30], alpha);
        }
        return box;
      },
    }]),
    spots: (L) => bankSpots(L).slice(0, 20),
  },
};

// Une histoire éteinte (`off`, cf. data/faitsDivers.js) ne laisse pas de trace : la
// chèvre de l'enclos n'a plus de sprite, et un enclos vide qui dit « Blanquette
// dedans » mentirait.
export const FD_TRACES = Object.fromEntries(Object.entries(TRACES)
  .filter(([id]) => !(FD_STORIES[id] && FD_STORIES[id].off)));
