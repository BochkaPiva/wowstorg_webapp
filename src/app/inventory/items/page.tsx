"use client";

import Link from "next/link";
import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

function CardLink({
  href,
  title,
  description,
  accent = "violet",
}: {
  href: string;
  title: string;
  description: string;
  accent?: "violet" | "emerald";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-700 group-hover:text-emerald-800"
      : "text-violet-700 group-hover:text-violet-800";
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="text-base font-semibold tracking-tight">{title}</div>
      <div className="mt-1 text-sm text-zinc-600">{description}</div>
      <div className={["mt-3 inline-flex items-center gap-2 text-sm font-medium", accentClass].join(" ")}>
        Открыть <span className="transition group-hover:translate-x-0.5">→</span>
      </div>
    </Link>
  );
}

function InventorySection({
  title,
  description,
  tone,
  children,
}: {
  title: string;
  description: string;
  tone: "catalog" | "stock";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "catalog"
      ? "border-violet-200 bg-[linear-gradient(135deg,rgba(124,58,237,0.10),rgba(255,255,255,0.92))]"
      : "border-emerald-200 bg-[linear-gradient(135deg,rgba(16,185,129,0.10),rgba(255,255,255,0.92))]";
  const markerClass = tone === "catalog" ? "bg-violet-500" : "bg-emerald-500";

  return (
    <section className={["rounded-3xl border p-4 shadow-sm", toneClass].join(" ")}>
      <div className="flex items-start gap-3">
        <div className={["mt-1 h-3 w-3 rounded-full shadow-sm", markerClass].join(" ")} />
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">{title}</h2>
          <p className="mt-1 text-sm text-zinc-600">{description}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">{children}</div>
    </section>
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

          <InventorySection
            title="Управление каталогом"
            description="То, что видит клиент в каталоге: карточки позиций, категории и готовые наборы."
            tone="catalog"
          >
            <CardLink
              href="/inventory/positions"
              title="Позиции"
              description="CRUD позиций: фото, название, описание, цена, количество и принадлежность к категориям."
            />
            <CardLink
              href="/inventory/collections"
              title="Категории"
              description="Категории позиций для каталога: одна позиция может входить в несколько категорий."
            />
            <CardLink
              href="/inventory/packages"
              title="Пакеты"
              description="Пакеты и наборы реквизита: при добавлении в корзину раскладываются на позиции."
            />
          </InventorySection>

          <InventorySection
            title="Управление реквизитом"
            description="Операционная часть склада: что сейчас в аренде, что требует ремонта, что потеряно и внутренние складские позиции."
            tone="stock"
          >
            <CardLink
              href="/inventory/in-rent"
              title="В аренде"
              description="Текущий список реквизита в аренде: сколько единиц занято и когда ожидается освобождение."
              accent="emerald"
            />
            <CardLink
              href="/inventory/repair"
              title="Ремонт / сломано"
              description="Базы «Требует ремонта» и «Сломано»: починить/утилизировать с вводом количества."
              accent="emerald"
            />
            <CardLink
              href="/inventory/losses"
              title="Утерянное"
              description="База утерянного реквизита: найдено/списать с вводом количества."
              accent="emerald"
            />
            <CardLink
              href="/inventory/warehouse-items"
              title="Складской реквизит"
              description="Внутренний реквизит склада (скотч/инструмент и т.п.). Отдельная база, не показывается в каталоге."
              accent="emerald"
            />
          </InventorySection>
        </div>
      )}
    </AppShell>
  );
}
