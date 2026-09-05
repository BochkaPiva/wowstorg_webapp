"use client";
import Link from "next/link";
import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";
import "../inventory.css";

const groups = [
  { title: "Состояние склада", links: [
    ["/inventory/repair", "Ремонт и поломки", "Что требует внимания, из каких заявок и что уже восстановлено."],
    ["/inventory/losses", "Утерянное", "Найти источник утраты, вернуть найденное или оформить списание."],
    ["/inventory/in-rent", "В аренде", "Выданный реквизит и ожидаемые даты возвращения."],
    ["/inventory/warehouse-items", "Складской реквизит", "Инструменты и расходники, которые не видны клиентам."]
  ] },
  { title: "Каталог и комплектация", links: [
    ["/inventory/positions", "Позиции", "Фотографии, цены, доступность и остатки реквизита."],
    ["/inventory/collections", "Категории", "Понятная навигация по каталогу для команды и клиентов."],
    ["/inventory/packages", "Пакеты", "Готовые комплекты с составом и количеством позиций."]
  ] }
];
export default function InventoryItemsPage() {
  const { state } = useAuth();
  return <AppShell title="Инвентарь">{state.status === "authenticated" && state.user.role !== "WOWSTORG" ? <p>Раздел доступен сотрудникам склада.</p> :
    <div className="inventory-workspace">
      <header className="inventory-heading"><div><h1>Инвентарь</h1><p>Реквизит, остатки и движение по складу — в одном месте.</p></div><Link href="/inventory/positions/new" className="inv-button inv-primary">+ Новая позиция</Link></header>
      <div className="inventory-hub">{groups.map(group => <section key={group.title}><h2>{group.title}</h2><div className="inventory-list">{group.links.map(([href,title,description]) => <Link className="inventory-hub-link" href={href} key={href}><div><strong>{title}</strong><p>{description}</p></div><span aria-hidden="true">↗</span></Link>)}</div></section>)}</div>
    </div>}</AppShell>;
}
