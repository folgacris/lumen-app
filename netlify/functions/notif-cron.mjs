import { getStore } from "@netlify/blobs";
import push from "./lib/push.js";

const { RAPPELS_DEFAUT, envoyerATous, heureParis } = push;

// Tourne toutes les 5 minutes. Un rappel part dans les 10 minutes
// qui suivent son heure, une seule fois par jour.
export default async () => {
  const store = getStore("lumen");
  const { jour, minutes } = heureParis();
  const rappels = (await store.get("rappels", { type: "json" })) || RAPPELS_DEFAUT;
  const envoyes = (await store.get("rappels-envoyes", { type: "json" })) || {};
  let modifie = false;

  for (const r of rappels) {
    const [h, m] = r.heure.split(":").map(Number);
    const ecart = minutes - (h * 60 + m);
    if (ecart >= 0 && ecart < 10 && envoyes[r.id] !== jour) {
      await envoyerATous(store, { title: r.titre, body: r.message, tag: r.id });
      envoyes[r.id] = jour;
      modifie = true;
    }
  }
  if (modifie) await store.setJSON("rappels-envoyes", envoyes);
};

export const config = { schedule: "*/5 * * * *" };
