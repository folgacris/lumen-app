self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// iOS exige qu'une notification soit toujours affichée à chaque push.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch (_) {}
  e.waitUntil(
    self.registration.showNotification(d.title || "Lumen", {
      body: d.body || "",
      tag: d.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((l) =>
      l.length ? l[0].focus() : self.clients.openWindow("/")
    )
  );
});
