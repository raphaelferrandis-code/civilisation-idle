// LES MÉTIERS QUI S'ENTENDENT (docs/PLAN-AMBIANCE-SONORE.md, lot 4) : quelle famille
// d'émetteurs une scène de moteur fait sonner, selon son id et l'âge (bande, 0 Feu … 9
// Démiurge). La carte (iso/isoEngineScene.js) la note au guichet quand elle dessine la
// scène ; le directeur (paysage.js) y attache un son.
//
//   · `forge`      l'enclume : la guilde (forge de la loge, puis de la guilde, puis
//                  l'atelier de forgeron du Marbre), l'atelier des monnaies ;
//   · `charpente`  la scie et le marteau : les travaux publics, le charron des caravanes ;
//   · `vapeur`     la machine à vapeur de la Fonte : la fabrique de monnaies, l'imprimerie,
//                  la locomobile, les travaux ;
//   · `electrique` le bourdon électrique du Néon ;
//   · `feu`        le feu d'un culte ou d'un guet, là où la scène en dessine un ;
//   · `etals`      le marché couvert, ses chalands (bandes 0 à 5) ;
//   · `port`       le port dessiné en scène, loin de l'eau (le port au bord de l'eau, lui,
//                  sonne par iso/isoPort.js).
// Les âges cosmiques n'ont pas d'atelier qui s'entende : leur bourdon est dans la rumeur.
//
// Module-FEUILLE (aucun import) : la carte l'importe sans risque de cycle. PUR, testé.

// L'artisan d'un atelier du Marbre (cityEngineSprites.js, engineCraft) : 1 forgeron,
// 2 potier, 3 teinturier.
const FORGERON = 1;

// LE LIEU DE CULTE (lot 9) : il a, en plus de son feu, sa cloche rare (la famille
// 'temple', semée par paysage.js dans la matière de l'âge). Le seul lieu de culte de la
// carte est le culte ancestral : des mégalithes au sanctuaire, au temple de Vesta, au
// mausolée, au mémorial, à la flèche cosmique.
export function familleCulte(id) {
  return id === 'ancestral_cult' ? 'temple' : null;
}

export function familleMetier(id, bande, artisan = 0) {
  const b = bande | 0;
  if (b >= 7) return null;
  if (id === 'ancestral_cult') return [0, 1, 4, 5, 6].includes(b) ? 'feu' : null;
  if (id === 'watch') return b <= 3 ? 'feu' : null;
  if (id === 'markets') return b <= 5 ? 'etals' : null;
  if (id === 'river_ports') return 'port';
  if (b === 6) return id === 'mint_houses' || id === 'printing_houses' || id === 'guilds' ? 'electrique' : null;
  if (b === 5) return id === 'mint_houses' || id === 'printing_houses' || id === 'caravans' || id === 'public_works' ? 'vapeur' : null;
  if (id === 'guilds') return b <= 3 || artisan === FORGERON ? 'forge' : null;
  if (id === 'mint_houses') return 'forge';
  if (id === 'public_works' || id === 'caravans') return b >= 2 ? 'charpente' : null;
  return null;
}
