/** Default page parent. Explicit, validated returnTo supplied by detail pages wins. */
export function sectionBackHref(path: string, role: string): string {
  if (path.startsWith("/orders/")) return role === "WOWSTORG" ? "/warehouse/queue" : "/orders";
  if (path.startsWith("/projects/")) return "/projects";
  if (path.startsWith("/estimates/")) return "/work?view=estimates";
  if (path.startsWith("/work/")) return "/work";
  if (path === "/warehouse/repair" || path === "/warehouse/losses") return "/inventory/items";
  if (path.startsWith("/warehouse/")) return "/home";
  if (path.startsWith("/admin/")) return "/admin";
  if (path === "/inventory/items") return "/home";
  if (path.startsWith("/inventory/")) {
    const parts = path.split("/").filter(Boolean);
    return parts.length > 2 ? `/inventory/${parts[1]}` : "/inventory/items";
  }
  const parts = path.split("?")[0]?.split("#")[0]?.split("/").filter(Boolean) ?? [];
  return parts.length <= 1 ? "/home" : `/${parts.slice(0, -1).join("/")}`;
}

/** The label describes the actual destination, including saved archive/filter context. */
export function sectionBackLabel(href: string): string {
  const [path, query = ""] = href.split("#")[0].split("?");
  const params = new URLSearchParams(query);
  if (path === "/work") return params.get("view") === "estimates" ? "Расчёты" : "Рабочая очередь";
  if (path === "/projects") return params.get("tab") === "archive" ? "Архив проектов" : "Все проекты";
  if (path?.startsWith("/projects/")) return "Карточка проекта";
  const labels: Record<string, string> = {
    "/home": "Главная", "/admin": "Администрирование", "/admin/quality": "Оценки заявок",
    "/inventory/items": "Инвентарь", "/inventory/positions": "Позиции",
    "/inventory/collections": "Категории", "/inventory/packages": "Пакеты",
    "/inventory/warehouse-items": "Складской реквизит", "/orders": "Мои заявки",
    "/warehouse/queue": "Все заявки", "/warehouse/archive": "Архив заявок",
    "/contractors": "Подрядчики", "/proposals": "Коммерческие предложения",
    "/catalog": "Каталог", "/cart": "Корзина", "/tasks": "Задачи",
  };
  return labels[path] ?? "К разделу";
}
