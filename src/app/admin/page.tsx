"use client";

import Link from "next/link";
import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";
import styles from "./admin-index.module.css";

const groups = [
  {
    id: "people",
    title: "Люди и отношения",
    links: [
      { href: "/admin/users", title: "Пользователи", description: "Учётные записи, роли, блокировка и сброс паролей." },
      { href: "/admin/customers", title: "Заказчики", description: "Данные заказчиков для оформления заявок." },
      { href: "/admin/loyalty", title: "Лояльность Grinvich", description: "Рейтинг, скидки и персональные предложения." },
    ],
  },
  {
    id: "control",
    title: "Аналитика и контроль",
    links: [
      { href: "/admin/analytics", title: "Аналитика", description: "Аренда, прибыль и востребованность реквизита." },
      { href: "/admin/quality", title: "Качество сервиса", description: "Оценки заявок, отзывы Grinvich и рейтинг команды." },
      { href: "/admin/inventory-audit", title: "Аудит инвентаря", description: "Расхождения в остатках и история проверок." },
    ],
  },
];

export default function AdminIndexPage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";

  return (
    <AppShell title="Администрирование">
      {forbidden ? <p>Этот раздел доступен только сотрудникам ВАУСТОРГ.</p> : (
        <div className={styles.workspace}>
          <header className={styles.heading}>
            <h2>Администрирование</h2>
            <p>Команда, заказчики и контроль работы — выберите нужный раздел.</p>
          </header>

          <div className={styles.groups}>
            {groups.map(group => (
              <section key={group.id} aria-labelledby={group.id}>
                <h3 id={group.id} className={styles.sectionTitle}>{group.title}</h3>
                <div className={styles.list}>
                  {group.links.map(link => (
                    <Link key={link.href} href={link.href} className={styles.link}>
                      <div><strong>{link.title}</strong><p>{link.description}</p></div>
                      <span className={styles.arrow} aria-hidden="true">↗</span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <section className={styles.technical} aria-labelledby="admin-tools">
            <h3 id="admin-tools" className={styles.sectionTitle}>Служебные инструменты</h3>
            <div className={styles.tools}>
              <Link href="/admin/telegram" className={styles.link}>
                <div><strong>Telegram</strong><p>Статус бота и проверка доставки уведомлений.</p></div>
                <span className={styles.arrow} aria-hidden="true">↗</span>
              </Link>
              <Link href="/admin/order-cleanup" className={`${styles.link} ${styles.cleanup}`}>
                <div><strong>Очистка заявок</strong><p>Безвозвратное удаление тестовых заявок и дополнительных выдач.</p></div>
                <span className={styles.arrow} aria-hidden="true">↗</span>
              </Link>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
