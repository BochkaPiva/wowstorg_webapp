self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = typeof payload.title === "string" ? payload.title : "Wowstorg";
  const body = typeof payload.body === "string" ? payload.body : "Новое уведомление";
  const href = typeof payload.href === "string" && payload.href.length > 0 ? payload.href : "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon.png",
      badge: "/icon.png",
      data: { href },
      tag: typeof payload.notificationId === "string" ? payload.notificationId : undefined,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data && event.notification.data.href ? event.notification.data.href : "/";
  const targetUrl = new URL(href, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && client.url === targetUrl) return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
