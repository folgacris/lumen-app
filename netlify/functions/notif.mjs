import { getStore } from "@netlify/blobs";
import push from "./lib/push.js";

const { RAPPELS_DEFAUT, envoyerATous } = push;

const reponse = (donnees, statut = 200) =>
  new Response(JSON.stringify(donnees), {
    status: statut,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export default async (req) => {
  const store = getStore("lumen");

  if (req.method === "GET") {
    const action = new URL(req.url).searchParams.get("action");
    if (action === "rappels") {
      return reponse({ rappels: (await store.get("rappels", { type: "json" })) || RAPPELS_DEFAUT });
    }
    return reponse({ cle: process.env.VAPID_PUBLIC_KEY || null });
  }

  const corps = await req.json().catch(() => ({}));

  if (corps.action === "abonner" && corps.abonnement?.endpoint) {
    const liste = (await store.get("abonnements", { type: "json" })) || [];
    const autres = liste.filter((s) => s.endpoint !== corps.abonnement.endpoint);
    await store.setJSON("abonnements", [...autres, corps.abonnement]);
    return reponse({ ok: true });
  }

  if (corps.action === "tester") {
    const res = await envoyerATous(store, {
      title: "Lumen", body: "Notifications actives. Le système est en ligne.", tag: "test",
    });
    return reponse(res);
  }

  if (corps.action === "rappels" && Array.isArray(corps.rappels)) {
    const valides = corps.rappels.filter(
      (r) => r.id && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.heure || "") && r.message
    ).map((r) => ({ id: String(r.id), heure: r.heure, titre: r.titre || "Lumen", message: String(r.message) }));
    await store.setJSON("rappels", valides);
    return reponse({ ok: true, rappels: valides });
  }

  return reponse({ erreur: "action inconnue" }, 400);
};
