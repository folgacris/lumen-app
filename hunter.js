const { getStore, connectLambda } = require("@netlify/blobs");
const { envoyerATous } = require("./lib/push.js");
const H = require("./lib/hunter-core.js");

const KINDS = ["daily", "weekly", "custom"];

exports.handler = async (event) => {
  connectLambda(event);
  const store = getStore("lumen");
  const h = await H.chargerHunter(store);
  const p = event.queryStringParameters || {};
  let notif = null;
  let message = null;

  if (p.action === "ajouterQuete" && p.titre) {
    h.quests.push({
      id: "q_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: p.titre.slice(0, 60), detail: (p.detail || "").slice(0, 80),
      kind: KINDS.includes(p.kind) ? p.kind : "daily",
      difficulty: H.DIFF_XP[p.difficulty] ? p.difficulty : "medium", done: false,
    });
    H.journal(h, `Nouvelle quête assignée — ${p.titre.slice(0, 60)}`);
  } else if (p.action === "basculerQuete") {
    const q = h.quests.find((x) => x.id === p.id);
    if (q && !q.done) {
      q.done = true; h.totalQuestsDone += 1;
      const xp = H.DIFF_XP[q.difficulty];
      H.journal(h, `Quête accomplie — ${q.title} (+${xp} XP)`);
      const r = H.gagnerXP(h, xp);
      message = `+${xp} XP`;
      if (r.nouveauRang) { H.journal(h, `Rang ${r.nouveauRang} atteint`); notif = { title: "Rang supérieur", body: `Tu es désormais Rang ${r.nouveauRang}.`, tag: "niveau" }; message = `RANG ${r.nouveauRang}`; }
      else if (r.monte) { H.journal(h, `Niveau ${h.niveau} atteint — +3 points`); notif = { title: "Niveau supérieur", body: `Tu as atteint le niveau ${h.niveau}.`, tag: "niveau" }; message = `NIVEAU ${h.niveau}`; }
    } else if (q && q.done) {
      q.done = false; // décocher n'enlève pas l'XP, comme dans Hunter d'origine
    }
  } else if (p.action === "supprimerQuete") {
    h.quests = h.quests.filter((x) => x.id !== p.id);
  } else if (p.action === "allouer" && H.STAT_KEYS.includes(p.stat) && h.statPoints > 0) {
    h.stats[p.stat] += 1; h.statPoints -= 1; H.verifierSucces(h);
  } else if (p.action === "reinitialiser") {
    Object.assign(h, H.hunterDefaut());
  }

  await H.sauvegarderHunter(store, h);
  if (notif) { try { await envoyerATous(store, notif); } catch (e) { console.error("Notif échouée :", e.message); } }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({ hunter: H.vue(h), message }),
  };
};
