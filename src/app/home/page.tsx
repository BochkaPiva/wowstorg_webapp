"use client";

import Link from "next/link";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

function CardLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="text-base font-semibold tracking-tight">{title}</div>
      <div className="mt-1 text-sm text-zinc-600">{description}</div>
      <div className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-violet-700">
        Открыть <span className="transition group-hover:translate-x-0.5">→</span>
      </div>
    </Link>
  );
}

export default function HomeDashboardPage() {
  const { state } = useAuth();

  const isWowstorg =
    state.status === "authenticated" && state.user.role === "WOWSTORG";

  return (
    <AppShell title="Главная">
      <div className="space-y-6">
        <div className="rounded-2xl border border-zinc-200 bg-[linear-gradient(135deg,rgba(124,58,237,0.10),rgba(250,204,21,0.10))] p-4">
          <div className="text-sm font-semibold text-zinc-900">
            Быстрые разделы
          </div>
          <div className="mt-1 text-sm text-zinc-600">
            Здесь позже добавим дашборды: активные заявки, ближайшие даты, топ
            позиций.
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <CardLink
            href="/catalog"
            title="Каталог"
            description="Маркет реквизита: карточки, поиск, корзина, оформление."
          />

          {isWowstorg ? (
            <>
              <CardLink
                href="/warehouse/queue"
                title="Очередь заявок"
                description="Согласование, сборка, выдача, приёмка."
              />
              <CardLink
                href="/warehouse/archive"
                title="Архив заявок"
                description="Завершённые и отменённые заявки."
              />
              <CardLink
                href="/inventory/items"
                title="Инвентарь"
                description="CRUD позиций, категории, пакеты, списки ремонта/утерь."
              />
              <CardLink
                href="/admin"
                title="Админка"
                description="Пользователи, заказчики, аналитика."
              />
            </>
          ) : (
            <CardLink
              href="/orders"
              title="Мои заявки"
              description="Статусы, детали, согласование, возврат."
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

