"use client";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

export default function AnalyticsPage() {
  const { state } = useAuth();
  const forbidden =
    state.status === "authenticated" && state.user.role !== "WOWSTORG";

  return (
    <AppShell title="Аналитика">
      {forbidden ? (
        <div className="text-sm text-zinc-600">
          Этот раздел доступен только Wowstorg (склад).
        </div>
      ) : (
        <div className="text-sm text-zinc-600">
          В v1 тут будет: топ реквизита по кол-ву сдач и по прибыли, топ
          заказчиков по LTV.
        </div>
      )}
    </AppShell>
  );
}

