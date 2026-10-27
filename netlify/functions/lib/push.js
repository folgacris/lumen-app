const webpush = require("web-push");

// Rappels à heure fixe (heure de Paris). Modifiables ensuite via l'endpoint notif.
const RAPPELS_DEFAUT = [
  { id: "matin", heure: "08:00", titre: "Lumen", message: "Nouvelle journée. Quelle est ta priorité du jour ?" },
  { id: "service", heure: "16:30", titre: "Lumen", message: "Le service approche. Passe en mode Concentration." },
  { id: "soir", heure: "22:00", titre: "Lumen", message: "Fin de journée. Active le mode Repos et récupère." },
];

function configurer() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const sujet = process.env.VAPID_SUBJECT || process.env.URL;
  if (!pub || !priv || !sujet) return false;
  webpush.setVapidDetails(sujet, pub, priv);
  return true;
}

// Envoie une notification à tous les appareils abonnés,
// et retire ceux dont l'abonnement n'existe plus (404 / 410).
async function envoyerATous(store, payload) {
  if (!configurer()) return { envoyes: 0, raison: "VAPID non configuré" };
  const abonnements = (await store.get("abonnements", { type: "json" })) || [];
  const vivants = [];
  let envoyes = 0;
  for (const sub of abonnements) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      envoyes++;
      vivants.push(sub);
    } catch (e) {
      if (e.statusCode !== 404 && e.statusCode !== 410) vivants.push(sub);
    }
  }
  if (vivants.length !== abonnements.length) await store.setJSON("abonnements", vivants);
  return { envoyes };
}

function heureParis(date = new Date()) {
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return {
    jour: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

module.exports = { RAPPELS_DEFAUT, envoyerATous, heureParis };
