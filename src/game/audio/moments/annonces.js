// LE GUICHET DES GRANDS MOMENTS (docs/PLAN-AMBIANCE-SONORE.md, lot 7) : le cœur du jeu
// et la carte y ANNONCENT un moment — la chute qui commence, le deuil, un achat, une
// maison qui sort de terre, un Grand Reset — et le joueur de sons (moments.js) s'y
// abonne. Module-FEUILLE (aucun import) : core/events.js, core/actions/building.js et
// les peintres de la carte l'importent sans risque de cycle avec l'audio, qui importe,
// lui, core/main.js (ses réglages).
//
// Les annonces :
//   · 'chute:tenir', 'chute:lacher' : le bouton « Effondrer la Cité » qu'on maintient ;
//   · 'chute:debut' { raison }       : la séquence de chute commence (events.js) ;
//   · 'chute:vague'                  : la carte joue la chute (isoChute.js, CHUTE.sons) ;
//   · 'chute:deuil' { jouee }        : le noir est atteint, le deuil commence ;
//   · 'chute:fin' { jouee }          : la séquence est finie (la stèle est passée) ;
//   · 'achat' { id }                 : un achat à la main, un seul bâtiment ;
//   · 'achats' { n }                 : un achat de masse, n bâtiments d'un coup ;
//   · 'batiment' { sx, cw, vu, bande } : une maison sort de terre sur la carte (sx :
//                                      sa place à l'écran, en px ; vu : à l'écran) ;
//   · 'sceau', 'renouveau'           : le Grand Reset réclamé, puis la cité neuve.

const abonnes = new Set();

export function annoncer(nom, donnees = null) {
  for (const f of abonnes) {
    try { f(nom, donnees); } catch { /* un son ne doit jamais casser le jeu */ }
  }
}

// S'abonner : rend la fonction qui désabonne.
export function surMoment(f) {
  abonnes.add(f);
  return () => abonnes.delete(f);
}
