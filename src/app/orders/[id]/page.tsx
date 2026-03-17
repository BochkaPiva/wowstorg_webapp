"use client";

import { useParams } from "next/navigation";

import { AppShell } from "@/app/_ui/AppShell";

export default function OrderDetailsPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;

  return (
    <AppShell title="Заявка">
      <div className="text-sm text-zinc-600">
        Детальная страница заявки ({orderId}) будет следующей: состав, услуги,
        смета, согласование, кнопки “Редактировать/Отменить/Приёмка”.
      </div>
    </AppShell>
  );
}

