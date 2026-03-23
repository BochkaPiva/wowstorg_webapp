/**
 * До гидратации: подавляем известный баг Chromium (unhandledrejection с `Event`, не Error).
 * Важно: не вызывать `console.error` здесь — Next.js Dev Overlay перехватывает его как «ошибку приложения».
 */
function isBenignDomRejection(reason: unknown): boolean {
  if (reason instanceof Event) return true;
  const tag = Object.prototype.toString.call(reason);
  return tag === "[object Event]" || tag === "[object ProgressEvent]";
}

if (typeof window !== "undefined") {
  const w = window as Window & { __wowstorgRejectionInstrumented?: boolean };
  if (!w.__wowstorgRejectionInstrumented) {
    w.__wowstorgRejectionInstrumented = true;
    window.addEventListener(
      "unhandledrejection",
      (ev: PromiseRejectionEvent) => {
        if (isBenignDomRejection(ev.reason)) {
          ev.preventDefault();
          ev.stopImmediatePropagation();
        }
      },
      true,
    );
  }
}
