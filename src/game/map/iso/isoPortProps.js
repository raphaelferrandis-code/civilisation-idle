"use strict";
// La pose « par le bas du contenu » des bâtiments du port (sortie d'iso/isoPort.js le
// 2026-10-02 : la capitainerie du Vieux-Port, iso/isoOldPort.js, s'en sert aussi).
import { blitProp, propBBox, setEngineSpan, setEngineFace } from '../cityEngineSprites.js';

// Pose un prop par le BAS DE SON CONTENU opaque : contenu large de cw px, haut
// de ch px, bas du contenu à (bx, by). Les PNG PixelLab embarquent souvent ~25 %
// de vide transparent sous les pieds (vu à la capture : moulin « flottant »
// 90 px au-dessus de sa boîte) → ancrer le PNG brut ment sur la position.
// Renvoie le rectangle ÉCRAN du contenu dessiné {x, y, w, h} (pour attacher des
// pièces au flanc au besoin). ch omis/null → hauteur à l'ASPECT NATUREL
// du contenu (imposer les deux déforme le sprite : l'aspect du contenu n'est pas
// celui du PNG).
// ⚠ Retour Raph (2026-10-03) : « les bâtiments du port ne sont pas bien alignés avec
// le ponton à certaines ères ». blitProp SUBSTITUE la version « -grand » d'un sprite
// (palier de halle) selon l'empreinte du DERNIER bâtiment-moteur peint (setEngineSpan,
// une valeur résiduelle ici : le port n'est pas peint par engineSprites) — autre cadre,
// autres proportions que la boîte d'encre lue ci-dessous. Selon ce qui précédait, la
// maison changeait de taille et de place. On pose TOUJOURS le sprite calibré.
export function blitPropAnchored(ctx, name, bx, by, cw, ch) {
  setEngineSpan(0, 0);
  setEngineFace(null);
  const bb = propBBox(name);
  if (!bb) {
    const hh2 = ch || cw;
    blitProp(ctx, bx - cw / 2, by - hh2, cw, hh2, name, 0.5, 0.5, 1, 1);
    return { x: bx - cw / 2, y: by - hh2, w: cw, h: hh2 };
  }
  const cH = ch || cw * (bb.ch / Math.max(1, bb.cw));
  const boxW = cw / (bb.wf || 1), boxH = cH / (bb.hf || 1);
  const cxf = bb.x0f + bb.wf / 2, cbf = bb.y0f + bb.hf;
  blitProp(ctx, bx - boxW * cxf, by - boxH * cbf, boxW, boxH, name, 0.5, 0.5, 1, 1);
  return { x: bx - cw / 2, y: by - cH, w: cw, h: cH };
}

