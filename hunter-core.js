// Noyau Hunter System : état, XP, rangs, succès. Partagé par lumen.js et hunter.js.
const STAT_KEYS = ["FOR", "VIT", "AGI", "INT", "PER"];
const DIFF_XP = { easy: 15, medium: 30, hard: 60, extreme: 120 };
const RANKS = [
  { min: 1, name: "E" }, { min: 10, name: "D" }, { min: 20, name: "C" }, { min: 30, name: "B" },
  { min: 40, name: "A" }, { min: 50, name: "S" }, { min: 65, name: "SS" }, { min: 80, name: "SSS" },
];
const TITLES = [
  { min: 1, name: "Éveillé" }, { min: 10, name: "Traqueur d'ombres" }, { min: 20, name: "Briseur de donjons" },
  { min: 30, name: "Lame silencieuse" }, { min: 40, name: "Souverain en devenir" }, { min: 50, name: "Monarque naissant" },
  { min: 65, name: "Ombre du Système" }, { min: 80, name: "Souverain absolu" },
];
const ACHIEVEMENTS = [
  { id: "first_quest", name: "Premier pas", desc: "Complète ta première quête.", icon: "✓" },
  { id: "level5", name: "Éveil confirmé", desc: "Atteins le niveau 5.", icon: "⬆" },
  { id: "level10", name: "Rang D", desc: "Atteins le niveau 10.", icon: "◆" },
  { id: "level20", name: "Rang C", desc: "Atteins le niveau 20.", icon: "◆" },
  { id: "ten_quests", name: "Discipline", desc: "Complète 10 quêtes au total.", icon: "⚡" },
  { id: "streak_stat", name: "Spécialisation", desc: "Monte une statistique à 20.", icon: "★" },
];
const SKILLS = [
  { level: 1, name: "Focalisation", desc: "Concentration accrue lors des tâches." },
  { level: 5, name: "Endurance mentale", desc: "Résistance renforcée à la fatigue." },
  { level: 10, name: "Perception aiguisée", desc: "Analyse plus fine des situations." },
  { level: 20, name: "Instinct du Chasseur", desc: "Anticipation naturelle des priorités." },
  { level: 35, name: "Volonté inébranlable", desc: "Discipline constante sous pression." },
  { level: 50, name: "Maîtrise du Système", desc: "Contrôle total de sa progression." },
];

const xpNeeded = (niveau) => 100 + (niveau - 1) * 40;
const palier = (liste, niveau) => liste.reduce((acc, it) => (niveau >= it.min ? it.name : acc), liste[0].name);
const rang = (niveau) => palier(RANKS, niveau);
const titre = (niveau) => palier(TITLES, niveau);

function jourParis(date = new Date()) {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(date);
}

function hunterDefaut() {
  return {
    niveau: 1, xp: 0, statPoints: 5,
    stats: { FOR: 10, VIT: 10, AGI: 10, INT: 10, PER: 10 },
    quests: [], history: [], unlocked: [], totalQuestsDone: 0, lastReset: jourParis(),
  };
}

async function chargerHunter(store) {
  const h = (await store.get("hunter", { type: "json" })) || hunterDefaut();
  if (h.lastReset !== jourParis()) {
    h.quests.forEach((q) => { if (q.kind === "daily") q.done = false; });
    h.lastReset = jourParis();
  }
  return h;
}
const sauvegarderHunter = (store, h) => store.setJSON("hunter", h);

function journal(h, text) {
  const time = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date());
  h.history.unshift({ time, text });
  if (h.history.length > 50) h.history.length = 50;
}

function verifierSucces(h) {
  const ok = [];
  const test = (id, cond) => { if (cond && !h.unlocked.includes(id)) { h.unlocked.push(id); ok.push(id); } };
  test("first_quest", h.totalQuestsDone >= 1);
  test("level5", h.niveau >= 5);
  test("level10", h.niveau >= 10);
  test("level20", h.niveau >= 20);
  test("ten_quests", h.totalQuestsDone >= 10);
  test("streak_stat", STAT_KEYS.some((k) => h.stats[k] >= 20));
  ok.forEach((id) => journal(h, `Succès débloqué — ${ACHIEVEMENTS.find((a) => a.id === id).name}`));
  return ok;
}

// Ajoute (ou retire) de l'XP. Renvoie ce qui s'est passé pour l'affichage et les notifications.
function gagnerXP(h, montant) {
  const ancienRang = rang(h.niveau);
  const ancienNiveau = h.niveau;
  h.xp += montant;
  while (h.xp >= xpNeeded(h.niveau)) { h.xp -= xpNeeded(h.niveau); h.niveau += 1; h.statPoints += 3; }
  while (h.xp < 0) {
    if (h.niveau === 1) { h.xp = 0; break; }
    h.niveau -= 1; h.xp += xpNeeded(h.niveau);
  }
  verifierSucces(h);
  return { monte: h.niveau > ancienNiveau, nouveauRang: rang(h.niveau) !== ancienRang ? rang(h.niveau) : null };
}

// Vue envoyée au client (avec les constantes d'affichage).
function vue(h) {
  return {
    ...h, rang: rang(h.niveau), titre: titre(h.niveau), xpMax: xpNeeded(h.niveau),
    succes: ACHIEVEMENTS.map((a) => ({ ...a, debloque: h.unlocked.includes(a.id) })),
    competences: SKILLS.map((s) => ({ ...s, debloque: h.niveau >= s.level })),
  };
}

module.exports = { STAT_KEYS, DIFF_XP, xpNeeded, rang, titre, hunterDefaut, chargerHunter, sauvegarderHunter, journal, gagnerXP, verifierSucces, vue };
