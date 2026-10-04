const { getStore, connectLambda } = require("@netlify/blobs");

// ==========================================
// ÉTAT
// ==========================================

const DIALOGUES = {
  surchauffe:
    "Lumen : « Alerte. Une hausse importante de votre niveau de stress est détectée. Respirez. Réduisez momentanément votre charge. »",
  epuisement:
    "Lumen : « Évaluation terminée. Vos réserves physiques sont faibles. La récupération devient prioritaire. »",
  amplification:
    "Lumen : « Analyse terminée. Votre niveau d'énergie et votre motivation sont élevés. C'est le moment idéal pour progresser. »",
  stable:
    "Lumen : « Analyse terminée. Vos constantes sont stables. Aucune alerte particulière. Avancez à votre rythme. »",
};

function analyserEtat(fatigue, energie, stress, motivation) {
  if (stress >= 85) return { statut: "surchauffe_critique", message: DIALOGUES.surchauffe };
  if (fatigue >= 80) return { statut: "epuisement", message: DIALOGUES.epuisement };
  if (stress >= 75) return { statut: "surchauffe", message: DIALOGUES.surchauffe };
  if (energie >= 70 && motivation >= 70 && fatigue < 50)
    return { statut: "amplification", message: DIALOGUES.amplification };
  return { statut: "stable", message: DIALOGUES.stable };
}

const ETAT_DEFAUT = { niveau: 1, xp: 0, fatigue: 50, energie: 70, stress: 20, motivation: 70 };

async function chargerEtat(store) {
  const donnees = await store.get("etat", { type: "json" });
  return donnees || { ...ETAT_DEFAUT };
}

async function sauvegarderEtat(store, etat) {
  await store.setJSON("etat", etat);
}

// ==========================================
// MODES — configurables depuis l'interface,
// pas codés en dur. Chacun a un nom, une couleur,
// et des effets sur les 4 stats + XP.
// ==========================================

const MODES_DEFAUT = [
  { id: "concentration", nom: "Concentration", couleur: "#5B8DEF", effets: { fatigue: 5, energie: -5, stress: 10, motivation: 0, xp: 0 } },
  { id: "repos", nom: "Repos", couleur: "#3FA796", effets: { fatigue: -25, energie: 20, stress: -20, motivation: 0, xp: 0 } },
  { id: "fin-journee", nom: "Fin de journée", couleur: "#8A6FD4", effets: { fatigue: 0, energie: 0, stress: -30, motivation: 0, xp: 0 } },
  { id: "tache-accomplie", nom: "Tâche accomplie", couleur: "#D4AF5A", effets: { fatigue: 0, energie: 0, stress: 0, motivation: 0, xp: 20 } },
];

async function chargerModes(store) {
  const modes = await store.get("modes", { type: "json" });
  return modes || MODES_DEFAUT.map((m) => ({ ...m }));
}

async function sauvegarderModes(store, modes) {
  await store.setJSON("modes", modes);
}

function clamp(valeur) {
  return Math.max(0, Math.min(100, valeur));
}

// Applique les effets d'un mode à l'état, avec gestion du niveau
// (le XP qui dépasse 100 fait monter de niveau, comme avant).
function appliquerEffets(etat, effets) {
  etat.fatigue = clamp(etat.fatigue + (effets.fatigue || 0));
  etat.energie = clamp(etat.energie + (effets.energie || 0));
  etat.stress = clamp(etat.stress + (effets.stress || 0));
  etat.motivation = clamp(etat.motivation + (effets.motivation || 0));

  let messageNiveau = "";
  if (effets.xp) {
    etat.xp += effets.xp;
    while (etat.xp >= 100) {
      etat.xp -= 100;
      etat.niveau += 1;
      messageNiveau += `\n\nLumen : « ÉVOLUTION DÉTECTÉE ! Vous avez atteint le Niveau ${etat.niveau}. »`;
    }
    while (etat.xp < 0) {
      etat.xp += 100;
      etat.niveau = Math.max(1, etat.niveau - 1);
    }
  }
  return messageNiveau;
}

function activerMode(etat, mode) {
  const messageNiveau = appliquerEffets(etat, mode.effets);
  return `Lumen : « Mode « ${mode.nom} » activé. »${messageNiveau}`;
}

// Un mode peut aussi être déclenché en tapant simplement son nom
// dans la barre de commande — pas besoin de cliquer le bouton.
function trouverModeParTexte(texte, modes) {
  const normalise = texte.toLowerCase();
  return modes.find((m) => normalise.includes(m.nom.toLowerCase())) || null;
}

function idUnique() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ==========================================
// RECHERCHE WEB — Tavily (gratuit, sans carte,
// pensé pour les assistants IA).
// ==========================================

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

    if (data.answer) return `Lumen : « ${data.answer} »`;

    if (data.results && data.results.length > 0) {
      const premier = data.results[0];
      return `Lumen : « D'après ${premier.url} : ${premier.content.slice(0, 280)}... »`;
    }

    return "Lumen : « Aucune information trouvée pour cette recherche. »";
  } catch (e) {
    return `Lumen : « Recherche impossible : ${e.message} »`;
  }
}

const DECLENCHEURS_RECHERCHE = [
  "cherche", "recherche", "trouve-moi", "trouve moi", "qu'est-ce que",
  "qu'est ce que", "c'est quoi", "qui est", "quelle est", "quel est",
  "info sur", "informations sur", "renseigne-moi", "renseigne moi",
];

function estUneRecherche(texte) {
  const normalise = texte.toLowerCase();
  return DECLENCHEURS_RECHERCHE.some((mot) => normalise.includes(mot));
}

// ==========================================
// CONVERSATION LIBRE — Groq (gratuit, sans carte).
// Assistant généraliste : pas ciblé sur un métier.
// ==========================================

async function discuter(texte, etat) {
  const cle = process.env.GROQ_API_KEY;

  if (!cle) {
    return "Lumen : « La conversation libre n'est pas encore configurée. Il manque une clé GROQ_API_KEY côté serveur. »";
  }

  const systemPrompt =
    "Tu es Lumen, un assistant personnel généraliste. Tu aides la personne qui te parle dans " +
    "n'importe quel domaine de sa vie — travail, études, sport, organisation, questions pratiques " +
    "ou conversation simple. Tu ne présupposes jamais son métier ou son contexte. Ton ton est calme, " +
    "précis, façon système, mais reste chaleureux et concret, jamais froid. Réponds en français, " +
    "de façon concise (quelques phrases, pas un roman), sans emojis. " +
    `État actuel connu : fatigue ${etat.fatigue}%, énergie ${etat.energie}%, stress ${etat.stress}%, ` +
    `motivation ${etat.motivation}%, niveau ${etat.niveau}. Tiens-en compte seulement si c'est pertinent, ` +
    "sans le répéter à chaque fois.";

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
      return `Lumen : « La conversation a échoué (serveur : ${res.status}). »`;
    }

    const data = await res.json();
    const reponse = data.choices?.[0]?.message?.content;

    if (!reponse) return "Lumen : « Je n'ai pas réussi à formuler de réponse. »";
    return `Lumen : « ${reponse.trim()} »`;
  } catch (e) {
    return `Lumen : « Conversation impossible : ${e.message} »`;
  }
}

// ==========================================
// TRANSCRIPTION VOCALE — Whisper via Groq
// (gratuit, sans carte, ~8h d'audio/jour).
// ==========================================

async function transcrire(audioBuffer, mimeType) {
  const cle = process.env.GROQ_API_KEY;

  if (!cle) {
    throw new Error("GROQ_API_KEY manquante côté serveur — la voix n'est pas encore configurée.");
  }

  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: mimeType || "audio/webm" }), "audio.webm");
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "fr");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${cle}` },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Transcription échouée (serveur : ${res.status})`);
  }

  const data = await res.json();
  return (data.text || "").trim();
}

// ==========================================
// TRAITEMENT D'UN TEXTE (tapé ou transcrit) :
// recherche web > mode reconnu par son nom > conversation libre.
// ==========================================

async function traiterTexte(texte, etat, modes) {
  if (estUneRecherche(texte)) {
    return await rechercherWeb(texte);
  }

  const mode = trouverModeParTexte(texte, modes);
  if (mode) {
    return activerMode(etat, mode);
  }

  return await discuter(texte, etat);
}

// ==========================================
// POINT D'ENTRÉE
// ==========================================

exports.handler = async (event) => {
  connectLambda(event);
  const store = getStore("lumen");

  let etat = await chargerEtat(store);
  let modes = await chargerModes(store);

  let messageAction = null;
  let texteEntendu = null;

  if (event.httpMethod === "POST") {
    // Entrée vocale : le corps JSON contient l'audio encodé en base64.
    try {
      const corps = JSON.parse(event.body || "{}");
      const buffer = Buffer.from(corps.audioBase64 || "", "base64");
      texteEntendu = await transcrire(buffer, corps.mimeType);
      messageAction = texteEntendu
        ? await traiterTexte(texteEntendu, etat, modes)
        : "Lumen : « Je n'ai rien entendu de clair. »";
    } catch (e) {
      messageAction = `Lumen : « ${e.message} »`;
    }
  } else {
    const params = event.queryStringParameters || {};

    if (params.texte) {
      messageAction = await traiterTexte(params.texte, etat, modes);
    } else if (params.action === "activerMode" && params.modeId) {
      const mode = modes.find((m) => m.id === params.modeId);
      messageAction = mode ? activerMode(etat, mode) : "Lumen : « Mode introuvable. »";
    } else if (params.action === "creerMode") {
      const nouveauMode = {
        id: idUnique(),
        nom: params.nom || "Nouveau mode",
        couleur: params.couleur || "#D4AF5A",
        effets: {
          fatigue: Number(params.fatigue) || 0,
          energie: Number(params.energie) || 0,
          stress: Number(params.stress) || 0,
          motivation: Number(params.motivation) || 0,
          xp: Number(params.xp) || 0,
        },
      };
      modes.push(nouveauMode);
      await sauvegarderModes(store, modes);
      messageAction = `Lumen : « Mode « ${nouveauMode.nom} » créé. »`;
    } else if (params.action === "supprimerMode" && params.modeId) {
      modes = modes.filter((m) => m.id !== params.modeId);
      await sauvegarderModes(store, modes);
      messageAction = "Lumen : « Mode supprimé. »";
    } else if (params.action === "reinitialiser") {
      Object.assign(etat, ETAT_DEFAUT);
      messageAction = "Lumen : « Système réinitialisé. »";
    }
    // action=statut (ou rien) : pas d'effet, juste lire l'état actuel.
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
      modes,
      analyse: analyse.message,
      messageAction,
      texteEntendu,
    }),
  };
};
