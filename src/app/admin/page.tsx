"use client";

import Link from "next/link";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

function AdminCard({
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

export default function AdminIndexPage() {
  const { state } = useAuth();
  const forbidden =
    state.status === "authenticated" && state.user.role !== "WOWSTORG";

  return (
    <AppShell title="Админка">
      {forbidden ? (
        <div className="text-sm text-zinc-600">
          Этот раздел доступен только Wowstorg (склад).
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <AdminCard
            href="/admin/users"
            title="Пользователи"
            description="Создание, роли, блокировка, сброс пароля."
          />
          <AdminCard
            href="/admin/customers"
            title="Заказчики"
            description="Справочник заказчиков для заявок."
          />
          <AdminCard
            href="/admin/analytics"
            title="Аналитика"
            description="Топ реквизита по сдачам и прибыли, топ заказчиков."
          />
        </div>
      )}
    </AppShell>
  );
}

