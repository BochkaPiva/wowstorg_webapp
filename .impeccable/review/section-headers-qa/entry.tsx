import React from "react";
import { createRoot } from "react-dom/client";
import WorkQueuePage from "../../../src/app/work/page";
import AnalyticsPage from "../../../src/app/admin/analytics/page";
import { SectionHeader } from "../../../src/app/_ui/SectionHeader";
import "../../../src/app/orders/orders.css";

const families = [
  ["projects", "Все проекты", "Планируйте мероприятия и продолжайте работу над текущими проектами.", "Создать проект"],
  ["orders", "Все заявки", "Контролируйте сроки аренды и работу склада.", "Активные"],
  ["contractors", "Подрядчики", "Соберите команду мероприятия: услуги, контакты и предложения клиенту.", "Составить КП"],
  ["inventory", "Инвентарь", "Позиции, комплекты и категории складского каталога.", "Новая позиция"],
  ["admin", "Администрирование", "Инструменты управления системой и доступа сотрудников.", "Обновить"],
  ["loyalty", "Лояльность Grinvich", "Рейтинг, награды и история работы команды.", "Обновить"],
] as const;
function Gallery() {
  const [active, setActive] = React.useState(true);
  return <main className="qa-shell" style={{ display: "grid", gap: 24 }}>
    <p>Синтетическая проверка общего компонента. Числа ниже — тестовые, не рабочая база.</p>
    <section className="my-orders__hero"><div className="my-orders__heroArt"><img src="/brand/dino-orders-hero.png" alt="" style={{ position: "absolute", width: "100%", height: "100%" }} /></div><div className="my-orders__heroContent"><span className="my-orders__eyebrow">Исходный ориентир Grinvich</span><h1>Мои заявки</h1><p>Статусы, сроки и действия по вашим заявкам.</p><div className="my-orders__heroMeta"><span><strong>0</strong>в работе</span><span><strong>0</strong>ждут вашего действия</span></div><div className="my-orders__tabs"><button aria-selected="true">В работе</button><button>Архив</button></div></div></section>
    {families.map(([mascot, title, description, action]) => <SectionHeader key={mascot} title={title} description={description} mascot={mascot}
      actions={mascot === "orders" ? undefined : <><button type="button">{action}</button><button type="button">Дополнительное действие</button></>}
      tabs={mascot === "projects" || mascot === "orders" ? <div role="group" aria-label="Статус"><button type="button" aria-pressed={active} onClick={() => setActive(true)}>Активные</button><button type="button" aria-pressed={!active} onClick={() => setActive(false)}>Архив</button></div> : undefined}
      links={<a href="/work">Рабочая очередь</a>}>
      <label style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>Поиск<input placeholder="Найти в разделе" style={{ padding: 12, border: "1px solid #d4d4cf", borderRadius: 8, maxWidth: "100%" }} /></label>
    </SectionHeader>)}
  </main>;
}
createRoot(document.getElementById("root")!).render(location.pathname === "/headers" ? <Gallery /> : location.pathname === "/analytics" ? <AnalyticsPage /> : <WorkQueuePage />);
