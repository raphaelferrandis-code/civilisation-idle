// SERVICE WORKER — ce qui rend le jeu JOUABLE HORS LIGNE une fois installé sur
// l'écran d'accueil du téléphone. Sans lui, la PWA reste une page web : pas de
// réseau, pas de jeu.
//
// ⚠ IL NE S'ENREGISTRE QUE SUR UNE ORIGINE SÛRE (https, ou localhost). C'est une
// règle du navigateur, pas un réglage : une adresse de réseau local en http
// (http://192.168.x.x:5173) n'y a PAS droit. Jouer hors ligne suppose donc
// d'héberger le dossier `dist/` sur une URL https — n'importe quel hébergeur
// statique gratuit fait l'affaire. Cf. main.jsx, qui n'appelle l'enregistrement
// que dans ces conditions.
//
// STRATÉGIE, et le compromis qu'elle assume :
//   · à l'installation on met en cache la COQUILLE seulement (page, scripts,
//     styles, polices) — quelques mégaoctets ;
//   · le reste (2 000 sprites, l'audio : ~30 Mo) est mis en cache AU FUR ET À
//     MESURE qu'il est demandé.
// Tout précharger à l'installation aurait fait attendre 33 Mo avant le premier
// écran, sur un lien mobile, avec le risque d'échouer en entier. La contrepartie
// est explicite : APRÈS UNE PREMIÈRE PARTIE EN LIGNE, tout ce qu'on a vu est
// disponible hors ligne ; un sprite jamais affiché ne l'est pas encore.

// ⚠ LE NUMÉRO SE BOUSSE QUAND LA STRATÉGIE CHANGE. `activate` supprime tout
// cache dont le nom diffère : c'est le seul moyen de purger d'un coup ce qu'un
// ancien service worker avait figé chez un joueur. v2 = passage du « cache
// d'abord » au « réseau d'abord » pour les navigations (cf. plus bas).
const CACHE = 'civ-effondrement-v2';

// La coquille : ce qui doit être là AVANT tout, sinon la page ne démarre pas.
// Les noms des scripts portent une empreinte qui change à chaque build — on ne
// peut donc pas les lister ici. On précharge la racine, et le reste est capté à
// la volée dès le premier chargement (qui est forcément en ligne).
const COQUILLE = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(COQUILLE))
      // Un échec sur un seul fichier ne doit pas empêcher l'installation : le
      // reste se mettra en cache au premier passage.
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // On ne s'occupe QUE des lectures de notre propre origine. Les requêtes POST
  // (le harnais de capture en dev) et les domaines tiers passent au travers.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // ⛔⛔ LA NAVIGATION VA AU RÉSEAU D'ABORD, ET C'EST CE QUI REND LES MISES À
  // JOUR POSSIBLES. En « cache d'abord », `index.html` servi depuis le cache
  // gelait la version installée POUR TOUJOURS : il porte les empreintes des
  // scripts du build, donc le navigateur ne demandait jamais les nouveaux ; et
  // comme un déploiement ne change pas `sw.js`, aucun nouveau service worker ne
  // s'installait, donc aucun cache n'était purgé. Résultat : on republie, et
  // l'appareil qui a déjà ouvert le jeu une fois ne voit RIEN changer.
  // Réseau d'abord / cache en secours : en ligne on prend la dernière version,
  // hors ligne le jeu reste jouable sur la dernière page vue.
  // ⚠ Les RESSOURCES gardent le « cache d'abord » : leur nom porte une empreinte
  // (assets/index-BSLJ9UEz.js), un contenu qui change change d'URL. Les sprites,
  // eux, sont stables et n'ont aucune raison d'être redemandés.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((rep) => {
          if (rep && rep.ok && rep.type === 'basic') {
            const copie = rep.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copie));
          }
          return rep;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((enCache) => {
      if (enCache) return enCache;
      return fetch(req).then((rep) => {
        // On ne met en cache que ce qui a réussi. Une réponse d'erreur mise en
        // cache resterait cassée jusqu'au prochain build — le pire des mondes.
        if (rep && rep.ok && rep.type === 'basic') {
          const copie = rep.clone();
          caches.open(CACHE).then((c) => c.put(req, copie));
        }
        return rep;
      }).catch(() => {
        // Hors ligne ET jamais vu : pour une navigation, on retombe sur la page
        // d'accueil (le jeu est mono-page, il repartira de la sauvegarde locale).
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
