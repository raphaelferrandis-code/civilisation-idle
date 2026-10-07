// LE BANC D'ÉCOUTE DU PAYSAGE SONORE (docs/PLAN-AMBIANCE-SONORE.md, lot 1).
//
// Ctrl+Alt+B sur la carte (ou « ?son=banc » dans l'adresse) : ce que le paysage
// entend, à quel niveau joue chaque nappe, et des curseurs pour régler À L'OREILLE —
// je mesure les sons, mais seul Raph les entend. Cliquer le nom d'une nappe l'écoute
// SEULE ; ▶ fait entendre un ponctuel ou un émetteur au centre. « Copier » met les
// réglages dans le presse-papiers : collés dans la conversation, ils deviennent les
// valeurs par défaut du code. Le banc les retient d'une session à l'autre.
//
// Outil de réglage, pas interface de jeu : styles en ligne, aucune feuille de style.
// Il ne connaît le directeur que par l'objet `api` qu'il reçoit (pas d'import de
// paysage.js, donc pas de cycle).

let panneau = null, minuteur = null, api = null, vue = null;

export function bancOuvert() {
  return Boolean(panneau);
}
export function ouvrirBanc(a) {
  if (a) api = a;
  if (panneau || !api || typeof document === 'undefined') return;
  construire();
  rafraichir();
  minuteur = setInterval(rafraichir, 250);
}
export function fermerBanc() {
  clearInterval(minuteur);
  minuteur = null;
  if (panneau) panneau.remove();
  panneau = null;
  vue = null;
}
export function basculerBanc(a) {
  if (panneau) fermerBanc(); else ouvrirBanc(a);
}

const el = (tag, style, texte) => {
  const e = document.createElement(tag);
  if (style) e.style.cssText = style;
  if (texte != null) e.textContent = texte;
  return e;
};
const BOUTON = 'background:#3a332b;color:#f1e6d2;border:1px solid #6b5d4c;border-radius:3px;padding:1px 7px;cursor:pointer;font:inherit;';
const TITRE = 'margin:8px 0 3px;color:#e8b86b;font-weight:bold;';

function curseur(parent, libelle, lire, ecrire, min, max, pas) {
  const ligne = el('label', 'display:flex;align-items:center;gap:6px;margin:1px 0;');
  const nom = el('span', 'flex:0 0 78px;', libelle);
  const input = el('input', 'flex:1;min-width:0;');
  input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(pas);
  input.value = String(lire());
  const lu = el('span', 'flex:0 0 36px;text-align:right;', String(lire()));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    ecrire(v);
    lu.textContent = String(v);
    api.retenir();
  });
  ligne.append(nom, input, lu);
  parent.append(ligne);
  return { input, lu, lire };
}
function barre(parent, libelle) {
  const ligne = el('div', 'display:flex;align-items:center;gap:6px;margin:1px 0;');
  const nom = el('span', 'flex:0 0 78px;', libelle);
  const fond = el('div', 'flex:1;height:8px;background:#2a241e;border-radius:2px;overflow:hidden;');
  const plein = el('div', 'height:100%;width:0;background:#8fb27a;');
  fond.append(plein);
  const lu = el('span', 'flex:0 0 36px;text-align:right;', '0');
  ligne.append(nom, fond, lu);
  parent.append(ligne);
  return { nom, plein, lu };
}

function construire() {
  panneau = el('div', 'position:fixed;right:12px;top:72px;width:310px;max-height:82vh;overflow:auto;z-index:2147483000;'
    + 'background:rgba(24,20,17,0.94);color:#f1e6d2;border:1px solid #6b5d4c;border-radius:6px;'
    + 'padding:8px 10px;font:12px/1.35 ui-monospace,Consolas,monospace;box-shadow:0 6px 24px rgba(0,0,0,0.5);');
  panneau.setAttribute('data-paysage-banc', '');
  const tete = el('div', 'display:flex;align-items:center;justify-content:space-between;');
  tete.append(el('strong', '', 'Paysage sonore · banc d’écoute'));
  const fermer = el('button', BOUTON, '×');
  fermer.addEventListener('click', fermerBanc);
  tete.append(fermer);
  panneau.append(tete);

  const etat = el('pre', 'margin:6px 0 0;white-space:pre-wrap;color:#d8ccb8;');
  panneau.append(etat);

  panneau.append(el('div', TITRE, 'Ce que montre l’écran'));
  const milieux = {};
  for (const m of api.MILIEUX) milieux[m] = barre(panneau, m);
  const foule = el('div', 'color:#d8ccb8;');
  panneau.append(foule);

  panneau.append(el('div', TITRE, 'Nappes · clic sur le nom = seule'));
  const nappes = {};
  for (const nom of Object.keys(api.NAPPES)) {
    const b = barre(panneau, nom);
    b.nom.style.cursor = 'pointer';
    b.nom.title = 'Écouter cette nappe seule (cliquer de nouveau pour tout rendre)';
    b.nom.addEventListener('click', () => { api.BANC.solo = api.BANC.solo === nom ? null : nom; });
    const c = curseur(panneau, '  × niveau', () => api.BANC.nappes[nom], (v) => { api.BANC.nappes[nom] = v; }, 0, 3, 0.05);
    nappes[nom] = { ...b, curseur: c };
  }

  panneau.append(el('div', TITRE, 'Le proche'));
  const proche = {};
  const ligneProche = (nom, groupe) => {
    const l = el('div', 'display:flex;align-items:center;gap:6px;margin-top:3px;');
    const titre = el('span', 'flex:1;cursor:pointer;', nom);
    titre.title = 'Écouter seul (cliquer de nouveau pour tout rendre)';
    titre.addEventListener('click', () => { api.BANC.solo = api.BANC.solo === nom ? null : nom; });
    const lu = el('span', 'flex:0 0 150px;text-align:right;color:#d8ccb8;', '');
    const jouer = el('button', BOUTON, '▶');
    jouer.title = 'L’entendre au centre de l’écran';
    jouer.addEventListener('click', () => api.ecouter(nom));
    l.append(titre, lu, jouer);
    panneau.append(l);
    const c = curseur(panneau, '  × niveau', () => api.BANC[groupe][nom], (v) => { api.BANC[groupe][nom] = v; }, 0, 3, 0.05);
    proche[nom] = { titre, lu, curseur: c };
  };
  for (const nom of Object.keys(api.PONCTUELS)) ligneProche(nom, 'ponctuels');
  for (const nom of Object.keys(api.EMETTEURS)) ligneProche(nom, 'emetteurs');
  panneau.append(el('div', TITRE, 'Semés'));
  for (const nom of Object.keys(api.SEMES)) ligneProche(nom, 'semes');

  panneau.append(el('div', TITRE, 'L’oreille'));
  const oreille = [
    curseur(panneau, 'maître', () => api.BANC.maitre, (v) => { api.BANC.maitre = v; }, 0, 3, 0.05),
    curseur(panneau, 'zoom loin', () => api.OREILLE.zLoin, (v) => { api.OREILLE.zLoin = v; }, 0.2, 1.2, 0.01),
    curseur(panneau, 'zoom près', () => api.OREILLE.zPres, (v) => { api.OREILLE.zPres = v; }, 0.6, 3.2, 0.01),
    curseur(panneau, 'hauteur', () => api.OREILLE.h0, (v) => { api.OREILLE.h0 = v; }, 0.5, 10, 0.1),
  ];

  const pied = el('div', 'display:flex;gap:6px;margin-top:8px;');
  const copier = el('button', BOUTON, 'Copier les réglages');
  copier.addEventListener('click', () => {
    const texte = JSON.stringify(api.reglages(), null, 1);
    const ok = () => { copier.textContent = 'Copié'; setTimeout(() => { copier.textContent = 'Copier les réglages'; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texte).then(ok, () => window.prompt('Réglages :', texte));
    else window.prompt('Réglages :', texte);
  });
  const defaut = el('button', BOUTON, 'Défaut');
  defaut.addEventListener('click', () => {
    api.remettre();
    for (const c of [...Object.values(nappes).map((n) => n.curseur), ...Object.values(proche).map((n) => n.curseur), ...oreille]) {
      c.input.value = String(c.lire()); c.lu.textContent = String(c.lire());
    }
  });
  pied.append(copier, defaut);
  panneau.append(pied);
  panneau.append(el('div', 'margin-top:6px;color:#9d917f;', 'Ctrl+Alt+B pour fermer.'));

  document.body.append(panneau);
  vue = { etat, milieux, foule, nappes, proche };
}

const f2 = (v) => (v == null || !Number.isFinite(v) ? '·' : v.toFixed(2));
function rafraichir() {
  if (!panneau || !vue || !api) return;
  const e = api.etat();
  const sortie = e.sortieDb == null ? '·' : `${e.sortieDb.toFixed(1)} dBFS`;
  vue.etat.textContent = `${e.eveille ? 'éveillé' : 'endormi'} · contexte ${e.contexte || '·'}${e.cache ? ' · fenêtre cachée' : ''}${e.fenetre ? ' · assourdi' : ''}${e.habitue ? ' · habitué' : ''}\n`
    + `zoom ${f2(e.zoom)} · proximité ${f2(e.p)} · oreille à ${f2(e.h)} cases\n`
    + `sortie ${sortie} · vent ×${f2(e.rafale)} · tampons ${e.tampons}${e.enRoute ? ` (+${e.enRoute})` : ''} (${Math.round(e.memoireMo || 0)} Mo) · fichiers ${e.enregistres}`;
  for (const [m, b] of Object.entries(vue.milieux)) {
    const v = e.parts[m] || 0;
    b.plein.style.width = `${Math.round(Math.min(1, v) * 100)}%`;
    b.lu.textContent = `${Math.round(v * 100)}`;
  }
  vue.foule.textContent = `foule ${f2(e.foule)} · voix rue ${f2(e.voixRue)} place ${f2(e.voixPlace)} · ville ${Math.round(e.taille * 100)} %`;
  for (const [nom, n] of Object.entries(vue.nappes)) {
    const v = e.cibles[nom] || 0;
    n.plein.style.width = `${Math.round(Math.min(1, v) * 100)}%`;
    n.plein.style.background = api.BANC.solo && api.BANC.solo !== nom ? '#5a5048' : '#8fb27a';
    n.lu.textContent = f2(v);
    n.nom.style.color = api.BANC.solo === nom ? '#e8b86b' : '';
    n.nom.style.textDecoration = e.nappes.includes(nom) ? '' : 'line-through';
  }
  for (const [nom, n] of Object.entries(vue.proche)) {
    const s = e.semes[nom];
    n.lu.textContent = s ? (s.sons ? `${s.joues} joués · ${s.sons} sons${s.vus != null ? ` · ${s.vus} vus` : ''}` : 'aucun son')
      : nom in api.EMETTEURS ? `${(e.emetteurs[nom] || 0)} voix` : `${e.ponctuels[nom]} joués`;
    n.titre.style.color = api.BANC.solo === nom ? '#e8b86b' : '';
  }
}
