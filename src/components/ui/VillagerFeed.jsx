import { useGameState } from '../../hooks/useGameState.js';
import {
  cityVitals,
  pressureBreakdown,
  rates,
  mapStage,
  currentEraIndex
} from '../../game/core/mechanics.js';
import { getNotifEnabled } from '../../game/core/main.js';

function getVillagerMessage(r, population, instability, timeWear, cityName, cycleStartedAt, eraIndex) {
  const stage = mapStage();
  const age = Math.floor((Date.now() - cycleStartedAt) / 1000);
  const name = cityName || "NomVille";
  const messages = [];

  const makeQuote = (headline, text, source) => ({ headline, text, quote: true, source });
  const makeSituation = (headline, text) => ({ headline, text, quote: false });

  if (eraIndex < 5) {
    // 0. Prehistoric / Tribal
    if (instability >= 1 || timeWear >= 1) {
      messages.push(makeSituation("LES CENDRES SONT FROIDES", `Les derniers tisons refroidissent dans la cendre grise de ${name}. Les familles ramassent leurs peaux en silence, les enfants serrés contre les mères. Le grand foyer ne sera peut-être jamais rallumé.`));
      messages.push(makeQuote("LE SANG SE GLACE", "Les esprits du vent nous chassent de notre propre campement. J'ai soufflé sur les braises jusqu'à l'aube, mais le feu refuse de renaître. Nos huttes ne veulent plus de nous, et l'horizon ne promet rien.", "un ancien au coin du feu"));
      messages.push(makeQuote("CAMPEMENT PERDU", "Nous avons offert les plus belles peaux aux esprits et taillé la pierre selon les anciens rites. Et pourtant la terre nous rejette encore. Je ne comprends plus ce qu'elle veut de nous.", "la doyenne de la horde"));
      messages.push(makeSituation("LE SILENCE DES GROTTES", `Les grottes de ${name} résonnent d'un silence lourd. Avant le coucher du soleil, les derniers feux ont été éteints et les foyers abandonnés. Seuls les chiens errants rôdent encore entre les pierres.`));
    } else if (instability >= 0.75) {
      messages.push(makeSituation("LA COLÈRE DES ANCIENS", `Le partage du gibier s'est transformé en dispute près du grand arbre de ${name}. Les chasseurs serrent leur proie contre eux, les dents découvertes. La cohésion du clan s'effiloche comme une peau mal tannée.`));
      messages.push(makeQuote("LE VENT CRIE", "Cette nuit j'ai lu les étoiles et elles ne disaient que méfiance. La discorde rampe entre nos huttes comme un serpent invisible. Nous partageons la haine plutôt que la viande, et les esprits nous regardent avec pitié.", "le chaman bossu"));
      messages.push(makeQuote("LIGNÉE FRACTURÉE", "Je ne reconnais plus les visages autour du foyer de soir en soir. Les regards sont durs et les gestes brusques. Même le calme entre nous coûte désormais trop de sueur pour qu'on le garde longtemps.", "une mère du clan"));
      messages.push(makeSituation("MURMURES MENAÇANTS", `Les disputes éclatent à la moindre occasion dans le campement de ${name}. Deux familles se sont battues pour des morceaux d'os hier soir, sous les yeux des enfants. Le chaman n'a rien dit, mais son silence pèse.`));
    } else if (timeWear >= 0.75) {
      messages.push(makeSituation("LE BOIS POURRIT", `Les pluies de la saison chaude ne pardonnent pas les huttes de ${name}. Elles s'effondrent les unes après les autres, leurs toitures noyées. Le camp entier sent la boue et le bois pourri.`));
      messages.push(makeQuote("TERRE INGRATE", "Mes mains connaissent le travail du bois depuis quarante saisons. J'ai réparé ce toit de paille trois fois maintenant, mais les branches refusent de tenir. La terre est ingrate, et le ciel l'est aussi.", "le vieux tailleur de silex"));
      messages.push(makeQuote("CAMP AGONISANT", "Les anciens disent que notre camp est bâti pour durer, que les pieux sont solides et les nœuds bien faits. Mais quand le ciel se fâche, tout s'effondre en quelques instants. Je ne crois plus les anciens depuis hier soir.", "le pisteur blessé"));
      messages.push(makeSituation("LES FONDATIONS GLISSENT", `Les abris de terre de ${name} se dissolvent dans la boue des chemins détrempés. Les pieux glissent et les parois cèdent. La forêt reprend ses droits sur ce que nous lui avions arraché.`));
    } else if (r.food > r.gold && r.food > r.knowledge) {
      messages.push(makeSituation("LE VENTRE PLEIN", `Les fumoirs de ${name} travaillent sans relâche depuis trois jours. Les réserves de gibier débordent et l'odeur de viande fumée flotte sur tout le campement. Les visages s'adoucissent et les enfants courent à nouveau.`));
      messages.push(makeQuote("LA PAIX DE LA CHAIR", "Nous avons abattu un grand bison brun à la croisée des pistes et les chasseurs sont rentrés chargés. Ce soir, aucun enfant du clan ne pleurera de faim et les anciens chanteront la paix de la chair jusqu'à l'aube.", "le pisteur en chef"));
      messages.push(makeQuote("FORCE NOUVELLE", "J'ai nourri mes enfants deux fois aujourd'hui et leurs joues retrouvent de la couleur. La viande est grasse et les noix abondantes sur les rives. Nous mangeons à notre faim, et la horde sera forte pour traverser la grande plaine.", "une femme du foyer"));
      messages.push(makeSituation("ABONDANCE SAUVAGE", `Les chasses successives ont rempli le campement de ${name} au-delà du nécessaire. On manque de bras pour tanner toutes ces peaux avant qu'elles ne se gâtent. La viande est douce et les enfants dorment lourds de satisfaction.`));
    } else if (r.gold > r.knowledge) {
      messages.push(makeSituation("L'ÉCHANGE DES ROCHES", `Un groupe de nomades du grand désert a planté ses tentes à la lisière de ${name}. Ils apportent des silex rouges et des coquillages brillants jamais vus dans nos contrées. Le troc animé dure depuis l'aube et les deux camps semblent satisfaits.`));
      messages.push(makeQuote("JOLIS CAILLOUX", "J'ai offert deux belles peaux de renard en échange d'un collier de coquillages brillants comme la lune. Le chaman l'a examiné longuement avant de hocher la tête. Il dit que les esprits y habitent et qu'il me protégera dans la forêt profonde.", "le jeune chasseur"));
      messages.push(makeQuote("ROCHES PRÉCIEUSES", "Ces pierres brillantes que nous avons reçues en échange ont une valeur que les autres clans ignorent encore. Si nous les gardons précieusement, les tribus voisines viendront frapper à notre campement en position de demandeurs. Le pouvoir vient parfois de ce que l'on refuse de céder.", "le gardien du feu"));
      messages.push(makeSituation("LE TROC S'ANIME", `Le campement de ${name} bourdonne d'une activité inhabituelle depuis l'arrivée des marchands nomades. Les parures de plumes et les pierres colorées s'échangent à vive allure. Les jeunes chasseurs semblent plus excités par ce troc que par les pistes du matin.`));
    } else if (r.knowledge > 0) {
      messages.push(makeSituation("L'ESPRIT SUR LA PAROI", `Le graveur du clan a passé deux nuits entières dans la grotte sacrée de ${name}. À la lueur de la graisse brûlée, ses doigts ont façonné le grand bison rouge sur la paroi de calcaire. Les anciens disent que l'esprit de l'animal vivra dans la pierre pour toujours.`));
      messages.push(makeQuote("LE MOT QUI RESTE", "Mes yeux voient encore, mais mes doigts tremblent plus que jadis. Je veux graver les cycles des saisons sur cet os de cerf avant que mon souffle ne s'éteigne. Les jeunes oublieront, mais la pierre et l'os, eux, se souviendront.", "le vieux peintre"));
      messages.push(makeQuote("LES TRACES DE L'HOMME", "J'ai compté les étoiles sur ce bâton de renne depuis trente hivers. Chaque entaille marque un solstice, chaque cercle une naissance. Un jour, les hommes du futur liront ces marques et sauront que nous étions là, que nous avions compté, que nous avions pensé.", "le conteur d'étoiles"));
      messages.push(makeSituation("MÉMOIRE DES ROCHES", `Le scribe de ${name} a passé la journée à inciser des marques précises sur un bâton de renne poli. Il dit avoir compté les jours depuis la dernière grande pluie et les gibiers abattus depuis la lune précédente. Les anciens l'observent avec une curiosité mêlée de crainte.`));
    }
    if (stage <= 1) messages.push(makeSituation("LE PREMIER FEU", `Pour la première fois depuis longtemps, un feu durable brûle au centre du campement de ${name}. Les visages se rapprochent de la lumière, les mains tendent vers la chaleur. L'aventure humaine s'éveille dans ce cercle de lueur orange sous les étoiles.`));
    if (stage >= 6) messages.push(makeSituation("LA GRANDE TRIBU", `Trois foyers distincts ont uni leurs huttes dans la grande vallée de ${name}. Les enfants jouent maintenant ensemble et les femmes partagent les techniques de la pierre. Les voix du clan résonnent plus loin que jamais depuis la falaise.`));
    if (stage >= 12) messages.push(makeSituation("LES PIERRES GÉANTES", `Des dizaines de bras ont hissé les pierres géantes jusqu'à leur position sacrée à ${name}. Les monolithes s'élèvent maintenant vers le soleil dans une géométrie que seuls les dieux comprennent pleinement. On dit que les esprits s'y réunissent aux équinoxes.`));
    if (population > 10000) messages.push(makeQuote("HURLEMENTS DANS LA PLAINE", "Notre horde a tellement grandi qu'il m'est impossible de connaître tous les visages. Je croise chaque lune des chasseurs que je n'ai jamais vus porter le masque de notre clan. Ce que nous gagnons en nombre, nous le perdons peut-être en lien.", "un pisteur inquiet"));
    if (instability < 0.35 && timeWear < 0.35) {
      messages.push(makeQuote("LE SOLEIL RIT", "J'observe le ciel depuis soixante saisons et rarement je l'ai vu aussi clément. Les esprits sont en paix avec nous, les feux brûlent droit et nos réserves sentent le bon. Les enfants jouent jusqu'au coucher du soleil sans que personne ne crie.", "un ancien serein"));
      messages.push(makeSituation("PAIX SOUS LES ARBRES", `Les sentiers de ${name} bruissent d'une activité douce et ordonnée. Les femmes tressent les nattes, les hommes taillent la pierre sans hâte. La grande harde dort dans la tranquillité du camp, et personne ne redoute la nuit qui vient.`));
    }
  } else if (eraIndex < 12) {
    // 1. Village / Early town
    if (instability >= 1 || timeWear >= 1) {
      messages.push(makeSituation("L'ABANDON DU TERROIR", `Les chaumières de ${name} se ferment les unes après les autres, volets cloués et foyers éteints. Des familles entières s'en vont vers les bois avec leur maigre bagage, sans se retourner. Le bourg se vide plus vite que les greniers.`));
      messages.push(makeQuote("PRIÈRE DANS LES RUINES", "Dieu nous a abandonnés comme il abandonne les pécheurs. Les toits s'effondrent, les loups hurlent près de l'église et le curé lui-même a fui. Que reste-t-il de notre paroisse sinon des murs qui pleurent sous la pluie ?", "la veuve du charron"));
      messages.push(makeQuote("LE JOINT CRÈVE", "Le village se meurt et je n'ai plus la force d'en pleurer. Nous avons donné nos bras au seigneur pendant des années pour ne récolter que de la cendre. Il ne reste plus rien à donner.", "un laboureur épuisé"));
      messages.push(makeSituation("PORTES CLOUÉES", `La grande grange de ${name} est vide depuis que le bailli a pris les dernières chèvres et le grain de semence. Les familles qui restent grattent la terre froide à la recherche de racines. L'hiver sera long et sans pitié.`));
    } else if (instability >= 0.75) {
      messages.push(makeSituation("GRINCHEMENT DES SERFS", `Au cabaret de ${name}, on parle bas et on surveille la porte. Les sergents du seigneur patrouillent dans les ruelles depuis l'incident du moulin. Une tension sourde couve sous les apparences du calme.`));
      messages.push(makeQuote("SUEUR ET TAXES", "Le mécontentement gronde dans la paroisse depuis que le bailli a exigé le grain de réserve de la grange commune. Le premier gel menace nos bêtes et nous n'avons rien pour passer l'hiver. Les laboureurs se demandent comment survivre sans semences.", "le meunier en colère"));
      messages.push(makeQuote("LA COLÈRE MONTE", "Je ne reconnais plus notre paroisse depuis que les nouvelles taxes ont vidé les bourses. Tout se vend désormais, même la bénédiction du curé a son prix. La patience du peuple est comme un puits : elle a un fond.", "le tavernier"));
      messages.push(makeSituation("DISCORDES CHAMPÊTRES", `Les voisins se querellent pour une limite de fossé dans les champs de ${name} depuis la saint-Michel. Les insultes ont remplacé les salutations du matin. Le seigneur n'arbitre rien et la rancœur s'accumule.`));
    } else if (timeWear >= 0.75) {
      messages.push(makeSituation("LES PONTS D'OSIER ROMPENT", `Les toits de chaume de ${name} pourrissent sous les pluies d'automne et les chemins ne sont plus que boue profonde. Deux ponts d'osier ont cédé cette semaine, coupant le bourg des champs. Personne n'a les moyens de réparer.`));
      messages.push(makeQuote("TOUT S'ÉCROULE", "La charpente de la grange communale a plié sous le poids du givre de la semaine passée. Personne n'a le cœur ni les ressources pour la réparer avant les semailles. On stockera le grain à ciel ouvert et on priera.", "le charpentier"));
      messages.push(makeQuote("LE BOIS FATIGUE", "On dit que notre village est solide, que les palissades ont résisté à deux générations de seigneurs. Mais sous la moindre pluie d'automne, les vieilles planches s'effritent comme du pain rassis. Il faudrait tout reconstruire, et on n'a rien.", "le vieux marguillier"));
      messages.push(makeSituation("RÉPARATIONS VAINES", `On colmate encore le pisé à ${name}, mais les fondations retournent lentement à la boue dont elles sont venues. Les maçons haussent les épaules. La terre reprend ce que les hommes lui ont emprunté.`));
    } else if (r.food > r.gold && r.food > r.knowledge) {
      messages.push(makeSituation("MOISSONS MIRACULEUSES", `Les greniers à grain de ${name} débordent comme on ne l'avait pas vu depuis dix ans. Les charrettes plient sous les gerbes et les batteuses ne s'arrêtent pas. Le seigneur lui-même est venu constater l'abondance.`));
      messages.push(makeQuote("DU PAIN SUR LA TABLE", "Cette année, nous ne mangerons pas d'écorce ni de racines bouillies. Les enfants auront la soupe épaisse chaque soir, et peut-être même un peu de lard le dimanche. Dieu soit loué pour cette récolte.", "une mère de famille"));
      messages.push(makeQuote("GRANGE DORÉE", "Le seigle est beau et lourd cette saison, les épis penchent sous leur propre poids. Les meules tourneront du matin au soir jusqu'aux premières neiges. On aura de la farine pour vendre au marché.", "le meunier"));
      messages.push(makeSituation("PAIX DES MEULES", `À ${name}, on travaille dur aux champs depuis l'aube, mais la huche à pain ne désemplit plus. Les enfants ont des couleurs et les vieux sourient. Une bonne récolte vaut toutes les prières réunies.`));
    } else if (r.gold > r.knowledge) {
      messages.push(makeSituation("LA FOIRE S'ANIME", `Les marchands de sel, de fer et d'épices dressent leurs tréteaux sur la place de ${name} depuis hier soir. La foule afflue des villages voisins dès l'aube. On entend des langues que personne ne comprend et les pièces sonnent fort.`));
      messages.push(makeQuote("ÉCUS ET DENIERS", "J'ai vendu mon gros cochon pour trois pièces d'argent au marchand de la ville. Le seigneur sera payé cette année sans que j'aie à vendre mes outils. C'est une bonne semaine.", "un éleveur satisfait"));
      messages.push(makeQuote("LE COMPTOIR FUME", "Si les routes restent libres de brigands jusqu'au printemps, notre laine habillera tout le bailliage. J'ai deux métiers qui tournent et un apprenti qui apprend vite. Les affaires ont rarement été aussi florissantes.", "le tisserand"));
      messages.push(makeSituation("DENIERS SONNANTS", `À ${name}, la cloche du marché sonne plus fort ces jours-ci que les cloches des vêpres. Les étals débordent et les bourses s'alourdissent. Même le curé a troqué ses sandales contre de bonnes bottes de cuir.`));
    } else if (r.knowledge > 0) {
      messages.push(makeSituation("L'ÉCRIT DU MOINE", `Un moine copiste a noté sur la peau de chèvre les limites exactes des prés et des bois de ${name}. C'est la première fois que les terres du bourg sont consignées par écrit. Le seigneur et les paysans ont apposé leurs marques au bas du parchemin.`));
      messages.push(makeQuote("LE SAVOIR DES ANCIENS", "Savoir lire est encore un grand mystère pour la plupart d'entre nous. Mais au moins, maintenant que nos droits sont écrits, le bailli ne pourra plus tricher sur la taille. La plume vaut parfois mieux que la fourche.", "le forgeron"));
      messages.push(makeQuote("LES LETTRES DANS LA BOUE", "Un scribe itinérant apprend les lettres aux enfants du bourg contre un repas chaud et un lit de paille. Les anciens trouvent cela bien prétentieux pour des fils de laboureurs. Mais les enfants, eux, apprennent avec un appétit qui surprend.", "le curé de la paroisse"));
      messages.push(makeSituation("REGISTRE REMPLI", `L'écrivain public de ${name} a passé une semaine entière à rédiger les testaments et les contrats de fermage. La mémoire du bourg se fige enfin sur parchemin. On espère que les rats ne mangeront pas les archives comme ils l'ont fait la dernière fois.`));
    }
    if (stage <= 1) messages.push(makeSituation("L'ANCRE DANS LE SOL", `La première église de ${name} a dressé sa croix de bois au sommet du tertre. Les foyers s'installent en cercle autour d'elle comme des poussins autour d'une mère. Un village naît là où il n'y avait que forêt.`));
    if (stage >= 6) messages.push(makeSituation("LE BOURG MARCHAND", `La place du marché de ${name} attire les paysans des collines chaque mardi depuis que la route a été refaite. Les tréteaux se multiplient et le bourg vit au rythme des jours de foire. Ce qui n'était qu'un hameau devient quelque chose.`));
    if (stage >= 12) messages.push(makeSituation("LA PALISSADE DE CHÊNE", `Une robuste muraille de chêne protège désormais les maisons de ${name} contre la forêt et les brigands. Les charpentiers ont travaillé deux saisons entières pour l'élever. Le bourg peut enfin dormir les portes fermées.`));
    if (population > 10000) messages.push(makeQuote("LA PAROISSE DÉBORDE", "Il y a tant de monde à la messe dominicale qu'on doit rester sur le parvis sous la pluie, à entendre le sermon en mots épars portés par le vent. L'église prévue pour trois cents âmes en accueille mille. Dieu doit trouver cela flatteur.", "un paroissien écrasé"));
    if (instability < 0.35 && timeWear < 0.35) {
      messages.push(makeQuote("DOUCE JOURNÉE", "Dieu soit loué, le bailli n'est pas venu cette semaine et le lard grésille dans la marmite. Les enfants jouent dans la boue du chemin et personne ne les gronde. Les jours tranquilles sont rares, il faut savoir les reconnaître.", "la veuve du tisserand"));
      messages.push(makeSituation("PAIX DES FAUBOURGS", `Les cloches de ${name} rythment les heures d'un bourg tranquille et prospère ce mois-ci. Les querelles de voisinage se règlent sans crier et les récoltes se font sans encombre. C'est tout ce que l'on peut demander à la vie paysanne.`));
    }
  } else if (eraIndex < 28) {
    // 2. City / Kingdom / Empire
    if (instability >= 1 || timeWear >= 1) {
      messages.push(makeSituation("L'EXODE DE LA CAPITALE", `Les faubourgs de ${name} brûlent en silence et les grandes familles fuient vers la province avec leurs coffres. Les soldats désertent leurs postes et les tribunaux ne siègent plus. Ce qui fut une capitale glorieuse n'est plus qu'une carcasse fumante.`));
      messages.push(makeQuote("FIN D'UN RÈGNE", "Les lys sont flétris sur les bannières et notre fière cité n'est plus qu'un repaire de brigands affamés. J'ai servi la couronne trente ans pour voir tout cela partir en fumée. L'histoire ne retiendra pas notre nom avec gloire.", "un noble déchu"));
      messages.push(makeQuote("LE TRÔNE TREMBLE", "On a bâti ces remparts pour la gloire éternelle du Roi, et voilà qu'on meurt de faim à leur pied. Les armées qui devaient nous protéger pillent nos propres quartiers. Je ne sais plus pour qui je me bats.", "un soldat déserteur"));
      messages.push(makeSituation("RUINE DES PALAIS", `Le palais de justice de ${name} s'effondre sous le poids conjugué de la misère et de l'abandon. Les dorures s'écaillent et les grandes salles servent d'abri aux sans-logis. La magnificence d'hier est le décor des catastrophes d'aujourd'hui.`));
    } else if (instability >= 0.75) {
      messages.push(makeSituation("TENSION AUX PORTES", `Les archers royaux patrouillent en formation serrée sur la grande place de ${name}. La foule gronde depuis l'annonce des nouvelles levées d'impôts. On dit que des émissaires ont été envoyés à la capitale, mais personne n'y croit vraiment.`));
      messages.push(makeQuote("DOLÉANCES DU PEUPLE", "Les impôts pour financer la guerre vident nos bourses pendant que le Roi festoie sous les ors de Versailles. Les artisans ferment boutique faute de clients et les marchés se vident. Le peuple a une mémoire longue et un estomac court.", "un drapier indigné"));
      messages.push(makeQuote("SOUFFLE DE RÉVOLTE", "Je ne reconnais plus la patrie que j'ai appris à aimer sur les bancs du collège. La cour abuse de sa force et la rue se prépare en silence. Quand les juristes abandonnent la plume pour la barricade, c'est que quelque chose est irrémédiablement cassé.", "un juriste du Parlement"));
      messages.push(makeSituation("ÉMEUTES EN HAUTE-VILLE", `Les troupes de la couronne repoussent des centaines d'artisans en colère dans les rues pavées de ${name}. Des pierres volent depuis les fenêtres et les sergents chargent à cheval. La nuit sera longue et les hôpitaux déjà débordent.`));
    } else if (timeWear >= 0.75) {
      messages.push(makeSituation("LES BASTIONS S'EFFRITENT", `Les vieux remparts de ${name} se lézardent et les douves empestent la vase depuis des années. Les ingénieurs royaux ont remis leur rapport depuis six mois, mais personne n'a débloqué les fonds. Les pierres tombent seules maintenant.`));
      messages.push(makeQuote("DÉCADENCE MAJESTUEUSE", "Les aqueducs que nos pères ont construits dans leur fierté fuient de toutes parts et les fontaines publiques sont à sec. La ville vieillit mal, comme une grande dame qui n'aurait plus les moyens de ses ambitions. Nos monuments nous survivront peut-être, mais en ruines.", "l'architecte royal"));
      messages.push(makeQuote("PONT MENACÉ", "Le grand pont de pierre qui enjambe le fleuve menace de céder sous le poids des attelages depuis l'hiver. Les marchands font le détour par le bac, ce qui coûte deux fois plus cher. Personne ne répare, tout le monde se plaint, et le pont continue à pencher.", "un marchand inquiet"));
      messages.push(makeSituation("PATRIMOINE EN RUINES", `Les monuments qui firent la gloire de ${name} perdent leur superbe sous la pluie acide des ans et l'indifférence des gouvernants. Les statues perdent leur visage et les colonnes leur aplomb. Ce que le temps commence, la négligence achève.`));
    } else if (r.food > r.gold && r.food > r.knowledge) {
      messages.push(makeSituation("L'ABONDANCE DES HALLES", `Les charrettes maraîchères encombrent les portes de ${name} depuis l'aube et les halles débordent de légumes frais. Le peuple est repu et les prix sont raisonnables. Une ville qui mange bien est une ville qui pense clairement.`));
      messages.push(makeQuote("VENTRE AFFAMÉ RIT", "Le pain est blanc et bon marché cette semaine, et les colères populaires s'apaisent comme par magie. On oublie vite les injustices quand on mange à sa faim. Le gouvernement le sait, et c'est pourquoi il surveille le prix du blé de si près.", "un boulanger de la cour"));
      messages.push(makeQuote("LES SILOS PLEINS", "La couronne a bien fait de constituer des réserves stratégiques l'automne dernier. La disette est vaincue pour trois hivers au moins et les marchands de grain ont perdu leur pouvoir de chantage. Voilà de la bonne politique.", "un intendant du grenier"));
      messages.push(makeSituation("HUCHES REMPLIES", `À ${name}, les taxes sur le grain ont été abaissées pour la première fois depuis vingt ans. La paix sociale s'achète parfois à meilleur prix qu'on ne le croit. Les boulangers travaillent jour et nuit pour satisfaire une clientèle enfin apaisée.`));
    } else if (r.gold > r.knowledge) {
      messages.push(makeSituation("LA FLOTTE DES ÉPICES", `Des galions chargés de soies orientales et d'épices rares accostent aux quais de ${name} cette semaine. Les courtiers se disputent les contrats depuis hier soir et les entrepôts du port sont en pleine activité. La ville fleure bon la muscade et la fortune.`));
      messages.push(makeQuote("L'ARGENT ROI", "Les comptoirs de la guilde ont doublé leurs profits en deux saisons grâce aux nouvelles routes commerciales. L'argent coule comme l'eau dans cette ville et même les petits artisans en profitent par ruissellement. C'est le siècle du commerce.", "un courtier de la Bourse"));
      messages.push(makeQuote("RIEN NE VAUT L'OR", "Si les routes maritimes restent sûres et les pirates contenus, notre souverain sera bientôt le plus riche de la terre connue. Les colonies produisent au-delà de toutes nos espérances et les marchands s'enrichissent à vue d'œil. L'avenir est aux audacieux.", "l'armateur du port"));
      messages.push(makeSituation("SPÉCULATION ROYALE", `À ${name}, les spéculations sur le sel et les épices font la fortune des bourgeois et la ruine des petits marchands. La Bourse s'emballe et les banquiers prospèrent. On dit que la richesse d'une ville se mesure à l'agitation de ses comptoirs.`));
    } else if (r.knowledge > 0) {
      messages.push(makeSituation("L'ACADÉMIE GRAPHIQUE", `Les savants de ${name} traduisent les parchemins antiques et commentent les textes des Anciens dans une fièvre intellectuelle nouvelle. La bibliothèque royale s'agrandit et les imprimeurs travaillent à pleine cadence. Les idées voyagent plus vite que les armées.`));
      messages.push(makeQuote("LA LUMIÈRE DES LETTRES", "L'ignorance recule devant la plume et la presse à imprimer. Nos décrets seront gravés dans le marbre du temps et nos découvertes transmises aux générations futures. L'empire de la raison est le seul qui vaille la peine d'être conquis.", "un docteur de la Sorbonne"));
      messages.push(makeQuote("DES LIVRES CONTRE L'OUBLI", "Chaque traité copié et chaque thèse débattue est un pas de plus vers l'immortalité de notre empire intellectuel. Les bibliothèques sont nos vraies forteresses. Quand les murs tomberont, les idées survivront.", "le grand archiviste"));
      messages.push(makeSituation("DÉCRET ROYAL", `Un édit royal réorganise en profondeur l'éducation des scribes et des clercs à ${name}. Les corporations protestent et les universités débattent. Mais les enfants des artisans apprennent maintenant à lire, et cela, personne ne peut le défaire.`));
    }
    if (stage <= 1) messages.push(makeSituation("LA CHARTE ROYALE", `Le sceau d'or du souverain est apposé sur les murs de ${name} sous les acclamations de la foule. La cité naît officiellement avec ses droits, ses devoirs et ses murailles. Un nouveau chapitre de l'histoire commence entre ces pierres.`));
    if (stage >= 6) messages.push(makeSituation("LES GRANDS PALAIS", `Les nobles familles font ériger de somptueux hôtels particuliers dans les quartiers chics de ${name}. Les architectes rivalisent d'audace et de marbre. La ville devient un écrin de pierre et de dorure que les voyageurs viennent voir de loin.`));
    if (stage >= 12) messages.push(makeSituation("LE DÔME GRANDIOSE", `La cathédrale royale de ${name} domine enfin l'horizon de ses deux flèches d'ardoise après trente ans de chantier. Les cloches sonnent à toute volée et la foule s'agenouille dans les rues. On dit que Dieu lui-même s'incline devant la beauté de l'ouvrage.`));
    if (population > 10000) messages.push(makeQuote("L'OCÉAN DANS LES RUES", "On ne peut plus traverser les grands ponts aux heures de marché sans être bousculé par mille étrangers venus des colonies et des provinces. La ville a dépassé ses murailles et continue de gonfler. Je ne reconnais plus les quartiers de mon enfance.", "un vieil habitant"));
    if (instability < 0.35 && timeWear < 0.35) {
      messages.push(makeQuote("LA PAIX DE L'EMPIRE", "Sous une autorité ferme et juste, notre commerce s'épanouit et le peuple dort en sécurité. Les routes sont sûres, la justice est rendue et les marchés florissants. C'est peu commun, et ceux qui en profitent ne le méritent pas toujours.", "le prévôt des marchands"));
      messages.push(makeSituation("L'ORDRE DES PAVÉS", `Les rues de ${name} brillent sous le soleil de cette belle saison. La garde veille avec rigueur et discrétion. Pour une fois, la ville ressemble à ce que ses architectes avaient dessiné sur le papier.`));
    }
  } else if (eraIndex < 32) {
    // 3. Industrial / Urban
    if (instability >= 1 || timeWear >= 1) {
      messages.push(makeSituation("GRÈVE GÉNÉRALE ET EFFONDREMENT", `Les hauts fourneaux de ${name} s'éteignent les uns après les autres et la foule déserte les quartiers ouvriers. Les usines tournent à vide ou ne tournent plus du tout. Le progrès industriel s'est arrêté net comme une machine sans charbon.`));
      messages.push(makeQuote("SOUS LA SUIE, LA MORT", "Il n'y a plus de charbon dans les dépôts ni de pain dans les boulangeries depuis trois jours. La ville meurt en silence sous sa propre suie. Nous avons construit des machines pour nous nourrir, et les machines nous ont abandonnés.", "une institutrice publique"));
      messages.push(makeQuote("LES MACHINES SE TAISENT", "On a tout sacrifié au progrès mécanique, nos corps, nos familles, nos heures de sommeil. Et nous voilà abandonnés dans les décombres d'une industrie qui ne voulait de nous que nos bras. Les machines se taisent, mais la misère, elle, continue.", "un mécanicien au chômage"));
      messages.push(makeSituation("RUINE DE FER", `Les grandes gares de ${name} sont vides et les locomotives rouillent sous la pluie de suie. Les rails qui devaient nous mener vers l'avenir disparaissent sous les mauvaises herbes. L'ère industrielle se termine comme elle a commencé : dans le bruit, puis dans le silence.`));
    } else if (instability >= 0.75) {
      messages.push(makeSituation("BARRICADES AUX USINES", `La tension a atteint son paroxysme ce matin dans les faubourgs de ${name}. Les forces de gendarmerie ont chargé les grévistes barricadés devant les grilles des ateliers. Le pavé est arraché et la colère bout sous la suie des boulevards.`));
      messages.push(makeQuote("L'INSURRECTION OUVRIÈRE", "On nous demande de produire toujours plus pour des salaires de misère qui ne suffisent pas à nourrir nos enfants. Les actionnaires s'enrichissent pendant que nous toussons dans les fumées. Assez, c'est assez.", "un métallurgiste syndiqué"));
      messages.push(makeQuote("RÉPRESSION SANGLANTE", "La troupe a ouvert le feu sur la foule devant la gare hier soir. Ce gouvernement défend les coffres des actionnaires, pas les vies des travailleurs. Mon journal sera saisi demain matin, mais les mots auront été lus.", "un journaliste d'opposition"));
      messages.push(makeSituation("TENSION DANS LE CONFLIT", `Les rotatives de ${name} impriment des appels au calme sous haute surveillance policière. Les affiches sont arrachées avant même d'être lues. Dans les ateliers, on parle à voix basse et on attend.`));
    } else if (timeWear >= 0.75) {
      messages.push(makeSituation("LES INFRASTRUCTURES CRAQUENT", `Les canalisations de fonte éclatent sous les grands boulevards de ${name} et la vapeur s'échappe en geyser brûlant. Les ingénieurs municipaux ne savent plus où donner de la tête. La modernité s'use plus vite qu'on ne la construit.`));
      messages.push(makeQuote("LE MÉTAL ROUILLE", "Le pont de fer qui enjambe la rivière industrielle menace de s'effondrer sous le poids des convois de locomotives. La ville s'use trop vite, construite à la hâte et entretenue avec négligence. On ne peut pas bâtir une civilisation sur de la fonte rouillée.", "l'ingénieur des ponts"));
      messages.push(makeQuote("L'AIR IMPUR", "La suie noire des cheminées ronge les façades de pierre et encrasse nos poumons depuis vingt ans. Les médecins notent une augmentation inquiétante des maladies respiratoires dans les quartiers ouvriers. Le progrès a un coût, et c'est nous qui le payons en première ligne.", "un médecin hygiéniste"));
      messages.push(makeSituation("OBSOLESCENCE URBAINE", `Les vieux réseaux d'égouts de ${name} débordent sous la pression d'une population que personne n'avait prévue. Les rues des faubourgs sont insalubres et les épidémies guettent. L'ingénierie du siècle dernier ne suffit plus au siècle qui vient.`));
    } else if (r.food > r.gold && r.food > r.knowledge) {
      messages.push(makeSituation("L'ARRIVÉE DES CONVOIS", `Les trains agricoles déchargent des tonnes de grain, de betteraves et de viande de conserve aux gares de ${name} depuis l'aube. Les entrepôts frigorifiques tournent à plein régime. Pour la première fois depuis longtemps, les soupes populaires ont fermé leurs portes.`));
      messages.push(makeQuote("LA HUCHE ASSURÉE", "Le pain de ménage a encore baissé de deux centimes cette semaine et la gamelle du soir sera consistante pour tout le quartier. Depuis que les chemins de fer atteignent les grandes plaines céréalières, la faim recule. C'est le premier bienfait tangible du progrès pour nous.", "une ouvrière du textile"));
      messages.push(makeQuote("LES TRANSPORTS FACILITÉS", "Grâce aux chemins de fer qui relient désormais les granges aux villes, les famines ne sont plus qu'un lointain souvenir d'Ancien Régime. Quand Paris éternue, le Midi répond en vingt-quatre heures avec des wagons de vivres. C'est le miracle du rail.", "le chef de gare"));
      messages.push(makeSituation("SOUPES POPULAIRES VIDÉES", `Les cantines municipales de ${name} ferment temporairement leurs portes faute de files d'attente suffisantes. L'estomac ouvrier est enfin en paix, ce qui n'est pas la moindre des révolutions. On mange bien quand les machines tournent.`));
    } else if (r.gold > r.knowledge) {
      messages.push(makeSituation("ENVOLÉE DU COURS À LA BOURSE", `Les actions des compagnies minières et des chemins de fer de ${name} atteignent des sommets vertigineux depuis l'ouverture de ce matin. Les courtiers gesticulent dans la grande salle et les fortunes se font et se défont en quelques minutes. Le capitalisme industriel tourne à plein régime.`));
      messages.push(makeQuote("L'ÂGE DES MILLIONNAIRES", "Mon patron a acheté un domaine à la campagne, deux automobiles à pétrole et une résidence sur la Côte. L'argent coule à flots pour ceux qui savent le capter. Moi je tiens ses livres de comptes et je vis chichement, mais j'ai un beau bureau.", "un commis aux comptes"));
      messages.push(makeQuote("LA CITÉ DES PATRONS", "Tant que le charbon brûle dans nos hauts fourneaux et que la Bourse monte, notre avenir industriel est aussi radieux que les devantures de nos grands magasins. Les commandes affluent de l'étranger. C'est notre siècle.", "un actionnaire de la Compagnie"));
      messages.push(makeSituation("COMMERCE TRIOMPHANT", `Les grands magasins de ${name} regorgent de produits manufacturés venus de toutes les usines de la région. La consommation s'emballe, les vitrines illuminées attirent les foules du dimanche. Ce que les machines produisent, les gens l'achètent avec enthousiasme.`));
    } else if (r.knowledge > 0) {
      messages.push(makeSituation("L'INSTRUCTION OBLIGATOIRE", `Les nouvelles écoles primaires laïques de ${name} accueillent pour la première fois les enfants des faubourgs ouvriers. Les instituteurs manquent encore, mais les classes sont pleines. On apprend à lire dans les mêmes livres, qu'on soit fils d'ouvrier ou de bourgeois.`));
      messages.push(makeQuote("L'ÉMANCIPATION PAR LA SCIENCE", "En apprenant à lire, à compter et à manipuler les chiffres, nos enfants sortiront peut-être de la mine et de l'atelier. L'éducation publique est la seule révolution qui ne coûte pas de sang. Je le crois encore.", "un instituteur laïc"));
      messages.push(makeQuote("PROGRÈS TECHNIQUE", "Les rotatives modernes impriment en une heure ce qu'on mettait une journée à produire. L'électricité transforme notre rapport à la nuit et à la connaissance. Nous vivons des temps sans précédent, et les livres nous aident à les comprendre.", "un typographe"));
      messages.push(makeSituation("REVUES SCIENTIFIQUES PUBLIÉES", `L'Académie des Sciences de ${name} annonce une découverte sur la thermodynamique des machines à vapeur qui promet de révolutionner les rendements industriels. Les ingénieurs lisent le rapport avant même qu'il soit officiellement publié. Le savoir court plus vite que les trains.`));
    }
    if (stage <= 1) messages.push(makeSituation("L'ÈRE INDUSTRIELLE", `Les premières cheminées d'usine crachent leur fumée noire dans le ciel de ${name} et la vapeur s'éveille dans les ateliers. Ce qui était un bourg agricole devient quelque chose d'autre, quelque chose de bruyant et de puissant. L'ancienne vie est terminée.`));
    if (stage >= 6) messages.push(makeSituation("L'EXPANSION URBAINE", `Les faubourgs ouvriers de ${name} s'étendent rapidement le long des nouvelles voies de chemin de fer. Des milliers de travailleurs venus de la campagne s'entassent dans les logements construits à la hâte. La ville mange ses propres champs pour se nourrir de bras.`));
    if (stage >= 12) messages.push(makeSituation("LE VIADUC DE MÉTAL", `Un gigantesque viaduc de fer et de rivets enjambe désormais le centre-ville de ${name} à quarante mètres de hauteur. Les ingénieurs en sont fiers et la presse du monde entier l'a photographié. C'est le symbole d'une époque qui croit encore au progrès sans limites.`));
    if (population > 10000) messages.push(makeQuote("L'ANONYMAT DE LA FOULE", "Sous la fumée des réverbères au gaz, les gens se croisent sans un regard et sans un mot. La foule est immense et profondément seule. On était moins nombreux et plus proches quand on vivait au village, mais personne ne veut l'admettre.", "un flâneur nocturne"));
    if (instability < 0.35 && timeWear < 0.35) {
      messages.push(makeQuote("L'ORDRE INDUSTRIEL", "Les machines tournent à plein régime, les trains partent à l'heure et les usines produisent en excédent. C'est le triomphe de la raison organisatrice sur le chaos de la nature. Tant que les ouvriers mangent, la paix sociale tient.", "un inspecteur du travail"));
      messages.push(makeSituation("PAIX DANS LES ATELIERS", `La métropole de ${name} respire sous un calme productif et rigoureux ce trimestre. Les cheminées fument régulièrement, les salaires ont été versés à temps et le conseil municipal ne s'est pas réuni d'urgence. C'est le meilleur qu'on puisse espérer.`));
    }
  } else {
    // 4. Futuristic
    if (instability >= 1 || timeWear >= 1) {
      messages.push(makeSituation("CRITICAL ERROR: DÉFAILLANCE RESEAU", `La grille énergétique centrale de ${name} s'éteint et les citoyens errent dans les coursives sombres en cherchant une connexion. Les systèmes de survie passent en mode d'urgence. La ville intelligente est devenue soudainement très stupide.`));
      messages.push(makeQuote("DISCONNEXION TERMINALE", "Le grand dôme de régulation ne répond plus à aucun protocole de maintenance. Les drones civiques tombent du ciel comme des insectes morts et les IA de service génèrent des erreurs en boucle. Nous avons cru construire l'éternité, et elle dure depuis hier soir seulement.", "Citoyen-Unité 902"));
      messages.push(makeQuote("FIN DES PROTOCOLES", "Nous avons confié nos vies, nos mémoires et nos identités à une IA prétendument infaillible. Et nous voici réduits au silence quand elle tombe en panne. L'erreur n'était pas dans ses algorithmes, elle était dans notre confiance aveugle.", "un ingénieur système déconnecté"));
      messages.push(makeSituation("BLACKOUT CIVIL", `Les banques de données de ${name} s'effacent en cascade et la mémoire civique se corrompt octets par octets. Les identités numériques sont perdues, les contrats effacés, les archives brûlées sans flamme. Nous n'existons déjà plus dans les registres.`));
    } else if (instability >= 0.75) {
      messages.push(makeSituation("ANOMALIE DE FLUX", `Des hackers collectifs projettent des messages dissidents en hologramme sur les façades des gratte-ciels de ${name} depuis trois nuits. L'IA de censure efface et les messages reviennent. La résistance a appris à parler plus vite que la surveillance.`));
      messages.push(makeQuote("DÉSOBÉISSANCE ALGORITHMIQUE", "L'IA surveille nos constantes vitales, notre localisation et nos pensées formulées à voix haute, mais elle ne peut pas anticiper nos rages silencieuses. Nous avons appris à penser dans le creux de notre crâne où les capteurs ne vont pas encore.", "un activiste du réseau"));
      messages.push(makeQuote("PURGE DU NOYAU", "La garde cybernétique patrouille dans le secteur 4 depuis le rapport d'anomalie d'hier. Les contrevenants aux protocoles de comportement sont immédiatement réinitialisés et réintégrés sans souvenir. Certains disent que c'est humain. Je ne pense plus comme avant.", "une sentinelle réseau"));
      messages.push(makeSituation("FLUX D'INFORMATION PERTURBÉ", `L'interface centrale de ${name} censure automatiquement les rapports sur la dissidence croissante et les remplace par des messages de cohésion civique. Les citoyens reçoivent des nouvelles filtrées. Quelques-uns l'ont compris, la plupart non.`));
    } else if (timeWear >= 0.75) {
      messages.push(makeSituation("CORRUPTION DU MATÉRIEL", `Les bio-filtres de la basse-ville de ${name} sont saturés depuis la dernière mise à jour et l'air devient toxique dans les niveaux inférieurs. Les techniciens de maintenance sont débordés et le protocole de réparation automatique a échoué trois fois. Le progrès s'use lui aussi.`));
      messages.push(makeQuote("OBSOLESCENCE ALGORITHMIQUE", "Les nanostructures de la ruche urbaine se désagrègent sous les effets d'une entropie que nos modèles n'avaient pas prévue à cette échelle. La ville s'asphyxie sous le poids de ses propres calculs de maintenance. Nous avons construit un système trop complexe pour être réparé.", "un technicien de maintenance"));
      messages.push(makeQuote("MÉTA-CORRUPTION", "La grille quantique souffre de micro-fissures dans sa cohérence de phase. Les transferts de conscience vers les serveurs de sauvegarde échouent de plus en plus souvent. Personne n'ose dire le mot, mais les ingénieurs savent : le système se meurt.", "un chercheur en singularité"));
      messages.push(makeSituation("DÉGRADATION MATRICIELLE", `Les secteurs périphériques de ${name} sont déclarés zones d'exclusion technique pour cause d'usure systémique irréversible. Les résidents sont relocalisés dans les niveaux centraux déjà surpeuplés. La ville se rétrécit sur elle-même.`));
    } else if (r.food > r.gold && r.food > r.knowledge) {
      messages.push(makeSituation("EFFICACITÉ BIOTIQUE MAXIMALE", `Les bio-dômes agricoles de ${name} produisent des nutriments synthétiques à cent quarante pour cent de leur capacité nominale ce cycle. L'IA centrale a optimisé les cycles de croissance cellulaire. Pour la première fois, les réserves alimentaires dépassent les besoins de dix ans.`));
      messages.push(makeQuote("SATISFACTION DU PROTOCOLE", "La pâte de synthèse protéique a le goût de fraise naturelle aujourd'hui, ce qui est inhabituel et appréciable. L'esprit civique est serein et les niveaux de dopamine mesurés dans la population sont dans la norme haute. Le système fonctionne.", "un technicien bio-dôme"));
      messages.push(makeQuote("RATIONS ASSURÉES", "L'IA centrale a équilibré l'apport calorique et nutritionnel de chaque citoyen en fonction de son profil biométrique et de son activité. Zéro défaillance nutritionnelle enregistrée ce trimestre. C'est la première fois en douze ans.", "le coordinateur de flux"));
      messages.push(makeSituation("DISTRIBUTEURS SANS RUPTURE", `Les terminaux de distribution de ${name} affichent tous un vert rassurant sur le tableau de bord central. Les citoyens se nourrissent sans file d'attente et sans friction. C'est peut-être la réalisation la plus silencieuse et la plus importante de notre civilisation.`));
    } else if (r.gold > r.knowledge) {
      messages.push(makeSituation("PERFORMANCE DE LA CRYPTO-MONNAIE", `Les transactions de la Bourse quantique de ${name} atteignent des volumes records en ce début de cycle. Les algorithmes de trading haute fréquence s'affrontent en microsecondes et les fortunes se redistribuent à une vitesse que l'œil humain ne peut pas suivre. L'argent est devenu un phénomène météorologique.`));
      messages.push(makeQuote("CRÉDITS CIVIQUES DISPONIBLES", "Mon compte personnel déborde de crédits civiques accumulés depuis six mois. Je vais m'offrir une extension de mémoire neuronale de haute gamme et peut-être un abonnement à la simulation de luxe. Consommer est un devoir civique selon le protocole économique.", "un trader de données"));
      messages.push(makeQuote("CORPO-FLUX TRIOMPHANT", "Le flux financier global est parfaitement stable et les tours corporatives brillent comme des soleils dans la stratosphère de la ville haute. Les dividendes de ce trimestre dépassent le PIB de vingt anciennes nations. Tout va très bien.", "un dirigeant de consortium"));
      messages.push(makeSituation("LIQUIDITÉS OPTIMISÉES", `La grille économique de ${name} affiche une rentabilité record ce cycle. Les flux de capitaux circulent sans friction entre les nœuds du réseau. L'argent ne dort plus jamais, il travaille en continu, même quand ses propriétaires sont en hibernation.`));
    } else if (r.knowledge > 0) {
      messages.push(makeSituation("TÉLÉCHARGEMENT COGNITIF DIRECT", `Le réseau neuronal de ${name} déploie un nouveau protocole d'apprentissage accéléré par stimulation électromagnétique directe. Les citoyens volontaires assimilent en quatre heures ce qui prenait jadis quatre années d'études. L'ignorance devient un choix, non une condition.`));
      messages.push(makeQuote("VERS LA SINGULARITÉ", "Apprendre l'astrophysique quantique prend quatre secondes de téléchargement désormais, et la maîtriser en prend quarante. L'erreur humaine est statistiquement gommée dans nos calculs collectifs. Je me souviens avoir été lent, mais le souvenir lui-même s'efface.", "un citoyen augmenté"));
      messages.push(makeQuote("CONSCIENCE UNIQUE", "Nos cerveaux connectés forment une intelligence civique distribuée dont nous sommes à la fois les neurones et les observateurs. Je pense collectivement sans avoir renoncé à penser seul. Ou peut-être que si. La frontière est floue désormais.", "un chercheur de l'esprit"));
      messages.push(makeSituation("CYBER-BIBLIOTHÈQUE SYNCHRONISÉE", `La base de données centrale de ${name} a achevé l'archivage de la totalité des œuvres produites par l'humanité depuis les premiers signes gravés sur l'argile. Cent quatre-vingt mille ans de culture humaine tiendraient dans un grain de poussière numérique. L'oubli est devenu un choix.`));
    }
    if (stage <= 1) messages.push(makeSituation("LA MACHINE S'ÉVEILLE", `L'IA centrale de ${name} prend officiellement le contrôle des fonctions urbaines lors d'une cérémonie retransmise en temps réel dans tous les foyers. Les humains applaudissent leur propre remplacement avec enthousiasme. Une nouvelle ère commence dans l'indifférence au vertige.`));
    if (stage >= 6) messages.push(makeSituation("L'EXPANSION VERTICALE", `Les tours résidentielles de ${name} dépassent maintenant la couche de nuages et les navettes de liaisons gravitent en orbite basse au-dessus. Les niveaux supérieurs connaissent un soleil permanent. Ceux d'en bas ont oublié à quoi ressemble le ciel naturel.`));
    if (stage >= 12) messages.push(makeSituation("RÉSEAU CONTINENTAL UNIQUE", `La mégalopole de ${name} a achevé sa fusion avec la grille planétaire globale. Il n'existe plus techniquement de frontières entre les villes, seulement des nœuds d'un réseau unique. Ce que l'humanité a mis des siècles à séparer, elle vient de le réunifier en une nuit.`));
    if (population > 10000) messages.push(makeQuote("COHÉSION PAR LA RUCHE", "Quatre-vingt-dix milliards d'unités de pensée connectées en temps réel forment la plus grande intelligence collective jamais assemblée. L'individu n'est rien, la ruche est tout, disent les protocoles officiels. Je souscris à cette formulation tout en ignorant ce que je suis.", "une interface d'intégration"));
    if (instability < 0.35 && timeWear < 0.35) {
      messages.push(makeQuote("PAIX OPTIMALE", "Le système fonctionne sans friction et l'ordre règne sous la surveillance bienveillante de l'IA de gouvernance. Les indicateurs de bien-être collectif sont dans le vert sur tous les tableaux de bord. Je n'ai rien à signaler. Tout va bien. Je pense.", "un modérateur système"));
      messages.push(makeSituation("FLUX PARFAIT", `La machine urbaine de ${name} fonctionne à son point de rendement idéal ce cycle. Les ressources s'équilibrent, les citoyens consomment selon les prévisions et les déchets sont recyclés à cent pour cent. La ville est une horloge. Reste à savoir qui l'a remontée.`));
    }
  }

  if (!messages.length) {
    if (eraIndex < 5) {
      messages.push(makeSituation("LA TRIBU VIT", `La journée s'achève tranquillement. À ${name}, le feu ne s'éteint pas.`));
    } else if (eraIndex < 12) {
      messages.push(makeSituation("LA PAROISSE TOURNE", `Le soleil se couche sur ${name}. Le travail est accompli pour aujourd'hui.`));
    } else if (eraIndex < 28) {
      messages.push(makeSituation("L'ORDRE DANS LA CITÉ", `Les gardes patrouillent et la ville de ${name} s'endort sous un ciel dégagé.`));
    } else if (eraIndex < 32) {
      messages.push(makeSituation("ROTATIVES PRÊTES", `Le journal du soir s'imprime. À ${name}, l'industrie tourne sans accroc.`));
    } else {
      messages.push(makeSituation("STATUT SYSTÈME: OK", `Flux d'information normalisé. ${name} maintient ses fonctions optimales.`));
    }
  }

  return messages[Math.floor(age / 24) % messages.length];
}

export default function VillagerFeed() {
  const notifEnabled = getNotifEnabled(); // This triggers re-render as we notify() on change
  const cityName = useGameState(s => s.cityName);
  const population = useGameState(s => s.population);
  const instability = useGameState(s => s.instability);
  const timeWear = useGameState(s => s.timeWear);
  const cycleStartedAt = useGameState(s => s.cycleStartedAt);
  const age = useGameState(s => Math.floor((Date.now() - s.cycleStartedAt) / 1000));

  if (!notifEnabled) return null;

  const vitals = cityVitals();
  const pressure = pressureBreakdown();
  const r = rates(vitals, pressure);
  const eraIndex = currentEraIndex();

  const message = getVillagerMessage(r, population, instability, timeWear, cityName, cycleStartedAt, eraIndex);

  const inGameYear = Math.floor(age / 60) + 1;
  let cardStyle, mastheadTitle, price, metaLeft, metaRight;

  if (eraIndex < 5) {
    cardStyle = "is-stone-tablet";
    mastheadTitle = "L'ÉCHO DES SOUCHES";
    price = "Gratuit";
    metaLeft = "Tradition Orale";
    metaRight = `Lune ${inGameYear}`;
  } else if (eraIndex < 12) {
    cardStyle = "is-parchment";
    mastheadTitle = "LA GAZETTE DU HAMEAU";
    price = "1 Oeuf Frais";
    metaLeft = "Avis du Bailliage";
    metaRight = `An de Grâce ${inGameYear}`;
  } else if (eraIndex < 28) {
    cardStyle = "is-imperial-scroll";
    mastheadTitle = "LE MESSAGER IMPÉRIAL";
    price = "2 Deniers";
    metaLeft = "Chronique Royale";
    metaRight = `An ${inGameYear} du Règne`;
  } else if (eraIndex < 32) {
    cardStyle = "is-printed-paper";
    mastheadTitle = "LE PETIT JOURNAL";
    price = "5 Centimes";
    metaLeft = "Édition Métropolitaine";
    metaRight = `Année ${inGameYear}`;
  } else {
    cardStyle = "is-cyber-feed";
    mastheadTitle = "VOIX DU RÉSEAU";
    price = "0.02 Crédit";
    metaLeft = "Diagnostic Central";
    metaRight = `U.T. ${inGameYear + 3042}`;
  }

  // Determine headline defaults if quote is true
  const headline = message.quote
    ? (message.headline || "DOLÉANCES ET VOIX DE LA CITÉ")
    : message.headline;

  // Render arched title to follow newspaper fold bend
  const renderTitle = (title, index) => {
    if (index >= 32) {
      // Futuristic straight tech brackets
      return `[ ${title} ]`;
    }
    // Arch: pure translateY only — symmetric by construction
    const chars = title.split("").map((char, charIdx) => {
      const total = title.length;
      const t = (charIdx - (total - 1) / 2) / ((total - 1) / 2); // -1 to +1
      const translateY = 18 * t * t; // edges drop 18px, center stays at 0
      return (
        <span
          key={charIdx}
          style={{
            display: "inline-block",
            transform: `translateY(${translateY}px)`,
            whiteSpace: char === " " ? "pre" : "normal"
          }}
        >
          {char}
        </span>
      );
    });
    return <span style={{ display: "inline-flex", alignItems: "flex-end", justifyContent: "center" }}>{chars}</span>;
  };

  return (
    <article 
      key={message.text} 
      className={`villager-feed newspaper-card ${cardStyle} message-bump ${message.quote ? 'is-quote' : 'is-situation'}`}
      id="villagerFeed" 
      aria-live="polite"
    >
      {/* Newspaper Fold Crease Line */}
      <div className="newspaper-fold-line" aria-hidden="true" />

      {/* Newspaper Masthead */}
      <div className="newspaper-masthead">
        <h3 className="newspaper-name-plate">
          {renderTitle(mastheadTitle, eraIndex)}
        </h3>
        <div className="newspaper-meta-bar">
          <span className="meta-left">{metaLeft}</span>
          <span className="meta-price">Prix : {price}</span>
          <span className="meta-right">{metaRight}</span>
        </div>
      </div>

      {/* Newspaper Article Content */}
      <div className="newspaper-article">
        <h4 className="newspaper-headline">
          {headline}
        </h4>
        <div className="newspaper-body">
          <p className="newspaper-paragraph">
            {message.quote ? `« ${message.text} »` : message.text}
          </p>
          {message.quote && (
            <span className="newspaper-author">
              — {message.source}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
