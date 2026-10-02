const { getStore, connectLambda } = require("@netlify/blobs");

const DIALOGUES = {
  coup_de_feu:
    "Lumen : « Réponse. Le service commence. Je surveille vos constantes en arrière-plan. Ne laissez pas la pression du coup de feu perturber vos gestes. Une commande à la fois. »",
  surchauffe:
    "Lumen : « Alerte. Une hausse importante de votre niveau de stress est détectée. La cuisine exige de la précision, pas de la précipitation. Respirez. Réduisez momentanément votre charge. »",
  epuisement:
    "Lumen : « Évaluation terminée. Vos réserves physiques sont faibles. Votre journée de travail est suffisante. La récupération devient maintenant prioritaire. »",
  amplification:
    "Lumen : « Analyse terminée. Votre niveau d'énergie et votre motivation sont élevés. Vos capacités d'apprentissage sont actuellement favorables. C'est le moment idéal pour progresser. »",
  soiree:
    "Lumen : « Transition engagée. Le tablier est posé. La journée de travail est terminée. Relâchez les épaules. Hydratez-vous. Profitez maintenant de votre soirée. »",
  stable:
    "Lumen : « Analyse terminée. Vos constantes sont stables. Aucune alerte particulière. Avancez à votre rythme. »",
  recette:
    "Lumen : « Analyse culinaire prête. Indiquez-moi le problème de dosage, la technique ou l'ingrédient concerné. »",
};

function analyserEtat(fatigue, energie, stress, motivation) {
  if (stress >= 85) return { statut: "surchauffe_critique", message: DIALOGUES.surchauffe };
  if (fatigue >= 80) return { statut: "epuisement", message: DIALOGUES.epuisement };
  if (stress >= 75) return { statut: "surchauffe", message: DIALOGUES.surchauffe };
  if (energie >= 70 && motivation >= 70 && fatigue < 50)
    return { statut: "amplification", message: DIALOGUES.amplification };
  return { statut: "stable", message: DIALOGUES.stable };
}

const DEFAUT = { niveau: 1, xp: 0, fatigue: 50, energie: 70, stress: 20, motivation: 70 };

async function chargerEtat(store) {
  const donnees = await store.get("etat", { type: "json" });
  return donnees || { ...DEFAUT };
}

async function sauvegarderEtat(store, etat) {
  await store.setJSON("etat", etat);
}

function appliquerAction(etat, action) {
  let messageAction = null;

  switch (action) {
    case "service":
      etat.stress = Math.min(100, etat.stress + 25);
      etat.fatigue = Math.min(100, etat.fatigue + 15);
      messageAction = DIALOGUES.coup_de_feu;
      break;

    case "soiree":
      etat.stress = Math.max(0, etat.stress - 30);
      messageAction = DIALOGUES.soiree;
      break;

    case "repos":
      etat.fatigue = Math.max(0, etat.fatigue - 25);
      etat.energie = Math.min(100, etat.energie + 20);
      etat.stress = Math.max(0, etat.stress - 20);
      messageAction = `Lumen : « Repos enregistré. Fatigue : ${etat.fatigue}%, Énergie : ${etat.energie}%, Stress : ${etat.stress}%. »`;
      break;

    case "valider":
      etat.xp += 20;
      if (etat.xp >= 100) {
        etat.xp -= 100;
        etat.niveau += 1;
        messageAction = `Lumen : « ÉVOLUTION DÉTECTÉE ! Vous avez atteint le Niveau ${etat.niveau}. »`;
      } else {
        messageAction = `Lumen : « Tâche validée. +20 XP (Total : ${etat.xp}/100 XP). »`;
      }
      break;

    case "reinitialiser":
      Object.assign(etat, DEFAUT);
      messageAction = "Lumen : « Système réinitialisé. »";
      break;

    case "statut":
    default:
      break;
  }

  return messageAction;
}

// Recherche web via Tavily (clé gratuite, sans carte bancaire,
// pensée pour les assistants IA — renvoie une réponse synthétisée
// directement plutôt qu'une liste de liens à trier).
async function rechercherWeb(requete) {
  const cle = process.env.TAVILY_API_KEY;

  if (!cle) {
    return "Lumen : « La recherche web n'est pas encore configurée. Il manque une clé TAVILY_API_KEY côté serveur. »";
  }

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: cle,
        query: requete,
        search_depth: "basic",
        include_answer: true,
        max_results: 3,
      }),
    });

    if (!res.ok) {
      return `Lumen : « La recherche a échoué (serveur : ${res.status}). »`;
    }

    const data = await res.json();

    if (data.answer) {
      return `Lumen : « ${data.answer} »`;
    }

    if (data.results && data.results.length > 0) {
      const premier = data.results[0];
      return `Lumen : « D'après ${premier.url} : ${premier.content.slice(0, 280)}... »`;
    }

    return "Lumen : « Aucune information trouvée pour cette recherche. »";
  } catch (e) {
    return `Lumen : « Recherche impossible : ${e.message} »`;
  }
}

// Compréhension de texte libre, façon Jarvis : quelques familles de
// phrases françaises mappées vers les actions existantes. Pas de LLM
// ici (ça coûterait une clé API) — juste des mots-clés, volontairement
// simple et gratuit.
const INTENTIONS = [
  { action: "service", mots: ["coup de feu", "service commence", "ça part", "rush", "débordé"] },
  { action: "repos", mots: ["fatigué", "épuisé", "je me repose", "besoin de repos", "crevé"] },
  { action: "soiree", mots: ["fini", "journée terminée", "je rentre", "soirée", "tablier posé"] },
  { action: "valider", mots: ["j'ai fini", "tâche terminée", "c'est fait", "terminé", "validé"] },
];

// Déclencheurs de recherche web — vérifiés en premier, avant les
// intentions internes, car une phrase comme "cherche-moi une recette
// de canard" doit partir sur internet, pas sur une action interne.
const DECLENCHEURS_RECHERCHE = [
  "cherche", "recherche", "trouve-moi", "trouve moi", "qu'est-ce que",
  "qu'est ce que", "c'est quoi", "qui est", "quelle est", "quel est",
  "info sur", "informations sur", "renseigne-moi", "renseigne moi",
];

function estUneRecherche(texte) {
  const normalise = texte.toLowerCase();
  return DECLENCHEURS_RECHERCHE.some((mot) => normalise.includes(mot));
}

function interpreterTexte(texte) {
  const normalise = texte.toLowerCase();
  for (const intention of INTENTIONS) {
    if (intention.mots.some((mot) => normalise.includes(mot))) {
      return intention.action;
    }
  }
  return null;
}

// Vraie conversation, via Groq (gratuit, sans carte bancaire, modèles
// Llama hébergés). Utilisé pour tout ce qui n'est ni une action interne
// (service/repos/...) ni une recherche d'info fraîche — recettes,
// questions de cuisine, conversation libre.
async function discuter(texte, etat) {
  const cle = process.env.GROQ_API_KEY;

  if (!cle) {
    return "Lumen : « La conversation libre n'est pas encore configurée. Il manque une clé GROQ_API_KEY côté serveur. »";
  }

  const systemPrompt =
    "Tu es Lumen, le système personnel d'un apprenti cuisinier. Tu l'aides dans son métier " +
    "(recettes, techniques, dosages) et dans sa vie quotidienne. Ton ton est calme, précis, " +
    "façon système ou majordome (un peu à la Raphael dans « Tensei Shitara Slime Datta Ken »), " +
    "mais reste chaleureux et concret, jamais froid. Réponds en français, de façon concise " +
    "(quelques phrases, pas un roman), sans emojis. " +
    `État actuel connu : fatigue ${etat.fatigue}%, énergie ${etat.energie}%, stress ${etat.stress}%, ` +
    `motivation ${etat.motivation}%, niveau ${etat.niveau}. Tiens-en compte seulement si c'est pertinent ` +
    "pour la réponse (par exemple adapter un conseil si la fatigue est très haute), sans le répéter à chaque fois.";

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cle}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: texte },
        ],
        temperature: 0.7,
        max_tokens: 400,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return `Lumen : « La conversation a échoué (serveur : ${res.status}). »`;
    }

    const data = await res.json();
    const reponse = data.choices?.[0]?.message?.content;

    if (!reponse) {
      return "Lumen : « Je n'ai pas réussi à formuler de réponse. »";
    }

    return `Lumen : « ${reponse.trim()} »`;
  } catch (e) {
    return `Lumen : « Conversation impossible : ${e.message} »`;
  }
}

exports.handler = async (event) => {
  connectLambda(event);
  const store = getStore("lumen");
  let etat = await chargerEtat(store);

  const params = event.queryStringParameters || {};
  let messageAction = null;

  if (params.texte) {
    if (estUneRecherche(params.texte)) {
      messageAction = await rechercherWeb(params.texte);
    } else {
      const actionTrouvee = interpreterTexte(params.texte);
      if (actionTrouvee) {
        messageAction = appliquerAction(etat, actionTrouvee);
      } else {
        messageAction = await discuter(params.texte, etat);
      }
    }
  } else {
    const action = params.action || "statut";
    messageAction = appliquerAction(etat, action);
  }

  await sauvegarderEtat(store, etat);
  const analyse = analyserEtat(etat.fatigue, etat.energie, etat.stress, etat.motivation);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
    body: JSON.stringify({
      etat,
      analyse: analyse.message,
      messageAction,
    }),
  };
};
