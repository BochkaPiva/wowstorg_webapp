"use client";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

export default function WarehouseQueuePage() {
  const { state } = useAuth();

  const forbidden =
    state.status === "authenticated" && state.user.role !== "WOWSTORG";

  return (
    <AppShell title="Очередь склада">
      {forbidden ? (
        <div className="text-sm text-zinc-600">
          Этот раздел доступен только Wowstorg (склад).
        </div>
      ) : (
        <div className="text-sm text-zinc-600">
          Очередь будет показывать заявки по статусам и позволять: редактировать,
          отправлять смету, запускать сборку, выдавать, принимать возврат.
        </div>
      )}
    </AppShell>
  );
}

