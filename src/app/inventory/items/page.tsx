"use client";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

export default function InventoryItemsPage() {
  const { state } = useAuth();
  const forbidden =
    state.status === "authenticated" && state.user.role !== "WOWSTORG";

  return (
    <AppShell title="Инвентарь">
      {forbidden ? (
        <div className="text-sm text-zinc-600">
          Этот раздел доступен только Wowstorg (склад).
        </div>
      ) : (
        <div className="text-sm text-zinc-600">
          CRUD позиций/категорий/пакетов + списки “утеряно/ремонт/сломано” будут
          реализованы следующим шагом.
        </div>
      )}
    </AppShell>
  );
}

