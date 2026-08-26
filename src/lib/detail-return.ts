export type DetailSource =
  | "work"
  | "orders"
  | "projects"
  | "projects-archive"
  | "warehouse-queue"
  | "warehouse-archive"
  | "admin-quality"
  | "dashboard"
  | "project";

const INTERNAL_ORIGIN = "https://wowstorg.internal";

const ALLOWED_RETURN_PATHS = [
  /^\/work(?:[/?#]|$)/,
  /^\/orders(?:[/?#]|$)/,
  /^\/projects(?:[/?#]|$)/,
  /^\/warehouse\/(?:queue|archive)(?:[/?#]|$)/,
  /^\/admin\/quality(?:[/?#]|$)/,
  /^\/home(?:[/?#]|$)/,
];

/**
 * Возвращает только внутренний путь из разрешённых рабочих разделов.
 * Это позволяет сохранять вкладку и фильтры списка, не превращая returnTo
 * в открытый редирект.
 */
export function safeDetailReturnTo(candidate: string | null | undefined, fallback: string): string {
  if (!candidate) return fallback;

  try {
    const url = new URL(candidate, INTERNAL_ORIGIN);
    if (url.origin !== INTERNAL_ORIGIN) return fallback;

    const path = `${url.pathname}${url.search}${url.hash}`;
    return ALLOWED_RETURN_PATHS.some((pattern) => pattern.test(path)) ? path : fallback;
  } catch {
    return fallback;
  }
}

export function withDetailReturn(
  href: string,
  source: DetailSource,
  returnTo?: string | null,
): string {
  const url = new URL(href, INTERNAL_ORIGIN);
  url.searchParams.set("from", source);
  if (returnTo) url.searchParams.set("returnTo", returnTo);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function orderReturnFallback(
  source: string | null,
  options: { isWarehouse: boolean; projectId?: string | null },
): { href: string; label: string } {
  switch (source) {
    case "work":
      return { href: "/work", label: "В рабочую очередь" };
    case "orders":
      return { href: "/orders", label: "Мои заявки" };
    case "warehouse-archive":
      return { href: "/warehouse/archive", label: "В архив" };
    case "admin-quality":
      return { href: "/admin/quality", label: "К оценкам" };
    case "dashboard":
      return { href: "/home", label: "На главную" };
    case "project":
      if (options.projectId) {
        return { href: `/projects/${options.projectId}`, label: "К проекту" };
      }
      return { href: "/projects", label: "К проектам" };
    case "warehouse-queue":
      return { href: "/warehouse/queue", label: "В очередь" };
    default:
      return options.isWarehouse
        ? { href: "/warehouse/queue", label: "В очередь" }
        : { href: "/orders", label: "Мои заявки" };
  }
}

export function projectReturnFallback(source: string | null): { href: string; label: string } {
  switch (source) {
    case "work":
      return { href: "/work", label: "В рабочую очередь" };
    case "projects-archive":
      return { href: "/projects?tab=archive", label: "К архиву проектов" };
    default:
      return { href: "/projects", label: "К списку проектов" };
  }
}
