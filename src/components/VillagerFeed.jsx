import { useGameState } from '../hooks/useGameState.js';
import {
  cityVitals,
  pressureBreakdown,
  rates,
  mapStage
} from '../game/core/mechanics.js';
import { getNotifEnabled } from '../game/core/main.js';

function getVillagerMessage(r, population, instability, timeWear, cityName, cycleStartedAt) {
  const stage = mapStage();
  const age = Math.floor((Date.now() - cycleStartedAt) / 1000);
  const name = cityName || "NomVille";
  const messages = [];
  const quote = (text) => ({ text, quote: true });
  const situation = (text) => ({ text, quote: false });

  if (instability >= 1 || timeWear >= 1) {
    messages.push(situation(`Des familles quittent ${name} avec quelques sacs et beaucoup de silence.`));
    messages.push(quote(`Je ne veux pas que mes enfants voient ${name} tomber.`));
    messages.push(quote("On a obei, on a travaille, et maintenant on nous demande encore d'attendre."));
    messages.push(situation(`Les places de ${name} se vident avant la tombee de la nuit.`));
  } else if (instability >= 0.75) {
    messages.push(situation(`Au marche de ${name}, on parle moins fort quand la garde passe.`));
    messages.push(quote("Les greniers montent, les murs montent, mais nos vies ne montent pas avec."));
    messages.push(quote(`Je ne reconnais plus ${name}. Tout coute plus cher, meme le calme.`));
    messages.push(situation(`Dans ${name}, les voisins se disputent pour des choses qui semblaient petites hier.`));
  } else if (timeWear >= 0.75) {
    messages.push(situation(`Les vieux de ${name} racontent les memes histoires, mais plus personne n'est sur des noms.`));
    messages.push(quote("J'ai repare ce mur trois fois. Cette fois, il ne veut plus tenir."));
    messages.push(quote(`On dit que ${name} est solide, mais tout craque quand il pleut.`));
    messages.push(situation(`On repare encore les toits de ${name}, pourtant chacun voit que les fondations fatiguent.`));
  } else if (r.food > r.gold && r.food > r.knowledge) {
    messages.push(situation(`Les greniers de ${name} se remplissent. Les retours des champs sont plus legers.`));
    messages.push(quote("Ce soir, personne ne dormira le ventre vide."));
    messages.push(quote(`A ${name}, on travaille dur, mais au moins les enfants mangent.`));
    messages.push(situation(`A ${name}, on manque de bras aux meules, mais personne ne se maintient vraiment.`));
  } else if (r.gold > r.knowledge) {
    messages.push(situation(`Les marchands reviennent a ${name} avec du sel, des tissus et des histoires arrangees.`));
    messages.push(quote("J'ai vendu plus cette semaine que mon pere en une saison."));
    messages.push(quote(`Si les routes restent ouvertes, ${name} ne manquera de rien.`));
    messages.push(situation(`A ${name}, il y a plus de bruit autour des etals que devant le temple.`));
  } else if (r.knowledge > 0) {
    messages.push(situation(`Les enfants de ${name} repetent les lettres dans la poussiere devant l'ecole.`));
    messages.push(quote("Je veux apprendre a compter les saisons avant qu'elles nous surprennent."));
    messages.push(quote(`Un jour, quelqu'un lira le nom de ${name} et saura que nous avons existe.`));
    messages.push(situation(`Un scribe de ${name} a note les reserves du mois. Les anciens trouvent ca un peu pretentieux.`));
  }

  if (stage <= 1) messages.push(situation(`Le feu central de ${name} attire encore tout le monde a la tombee du soir.`));
  if (stage >= 6) messages.push(situation(`La grande place de ${name} reste animee longtemps apres le coucher du soleil.`));
  if (stage >= 12) messages.push(situation(`Certains habitants de ${name} n'ont jamais vu l'autre bout de la cite.`));
  if (population > 10000) messages.push(quote("Je croise chaque jour des gens d'ici que je n'ai jamais vus."));
  if (instability < 0.35 && timeWear < 0.35) {
    messages.push(quote(`Pour l'instant, ${name} tient bon. On peut respirer.`));
    messages.push(situation(`Les rues de ${name} gardent un rythme calme et regulier.`));
  }
  if (!messages.length) messages.push(situation(`La journee avance tranquillement. Pour l'instant, ${name} tient.`));

  return messages[Math.floor(age / 24) % messages.length];
}

export default function VillagerFeed() {
  const notifEnabled = getNotifEnabled(); // This triggers re-render as we notify() on change
  const cityName = useGameState(s => s.cityName);
  const population = useGameState(s => s.population);
  const instability = useGameState(s => s.instability);
  const timeWear = useGameState(s => s.timeWear);
  const cycleStartedAt = useGameState(s => s.cycleStartedAt);

  if (!notifEnabled) return null;

  const vitals = cityVitals();
  const pressure = pressureBreakdown();
  const r = rates(vitals, pressure);

  const message = getVillagerMessage(r, population, instability, timeWear, cityName, cycleStartedAt);

  return (
    <section 
      key={message.text} 
      className={`villager-feed message-bump ${message.quote ? 'is-quote' : 'is-situation'}`}
      id="villagerFeed" 
      aria-live="polite"
    >
      <div className="villager-inner">
        <span className="villager-tag" id="villagerTag">
          {message.quote ? "Voix de la citÃ©" : "Chroniques"}
        </span>
        <p className="villager-text" id="villagerMessage">
          {message.text}
        </p>
        <span className="villager-source" id="villagerSource">
          {message.quote ? "â€” Un habitant" : ""}
        </span>
      </div>
    </section>
  );
}
