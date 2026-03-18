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

export default function InventoryItemsPage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";

  return (
    <AppShell title="Инвентарь">
      {forbidden ? (
        <div className="text-sm text-zinc-600">
          Этот раздел доступен только Wowstorg (склад).
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-[linear-gradient(135deg,rgba(124,58,237,0.10),rgba(250,204,21,0.10))] p-4">
            <div className="text-sm font-semibold text-zinc-900">Разделы инвентаря</div>
            <div className="mt-1 text-sm text-zinc-600">
              Учёт доступности, ремонтов, поломок и утерь. Все движения количеств фиксируются через базы и “ведра” позиций.
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <CardLink
              href="/inventory/items"
              title="Позиции (в разработке)"
              description="CRUD позиций/категорий/пакетов — добавим следующим шагом."
            />
            <CardLink
              href="/inventory/repair"
              title="Ремонт / сломано"
              description="Базы «Требует ремонта» и «Сломано»: починить/утилизировать с вводом количества."
            />
            <CardLink
              href="/inventory/losses"
              title="Утерянное"
              description="База утерянного реквизита: найдено/списать с вводом количества."
            />
          </div>
        </div>
      )}
    </AppShell>
  );
}
