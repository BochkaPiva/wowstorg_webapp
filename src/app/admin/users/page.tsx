"use client";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

export default function AdminUsersPage() {
  const { state } = useAuth();
  const forbidden =
    state.status === "authenticated" && state.user.role !== "WOWSTORG";

  return (
    <AppShell title="Админка · Пользователи">
      {forbidden ? (
        <div className="text-sm text-zinc-600">
          Этот раздел доступен только Wowstorg (склад).
        </div>
      ) : (
        <div className="text-sm text-zinc-600">
          Тут будет CRUD пользователей: создание (логин/пароль/роль/имя), блок
          (isActive), сброс пароля.
        </div>
      )}
    </AppShell>
  );
}

