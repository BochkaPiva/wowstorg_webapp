"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React from "react";

import { useAuth } from "@/app/providers";

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={[
        "block rounded-lg px-3 py-2 text-sm",
        active ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

export function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { state, refresh } = useAuth();

  React.useEffect(() => {
    if (state.status === "anonymous") router.replace("/login");
  }, [router, state.status]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    await refresh();
    router.replace("/login");
  }

  if (state.status !== "authenticated") {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-sm text-zinc-600">Загрузка…</div>
      </div>
    );
  }

  const isWowstorg = state.user.role === "WOWSTORG";

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold tracking-tight">{title}</div>
            <div className="text-xs text-zinc-600">
              {state.user.displayName} · {state.user.role}
            </div>
          </div>
          <button
            onClick={logout}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
          >
            Выйти
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
          <aside className="rounded-2xl border border-zinc-200 bg-white p-3">
            <div className="space-y-1">
              <NavLink href="/catalog">Каталог</NavLink>
              <NavLink href="/orders">Мои заявки</NavLink>
              {isWowstorg ? (
                <>
                  <div className="mt-3 border-t border-zinc-100 pt-3 text-xs font-semibold text-zinc-500">
                    Склад
                  </div>
                  <NavLink href="/warehouse/queue">Очередь</NavLink>
                  <NavLink href="/inventory/items">Инвентарь</NavLink>
                  <NavLink href="/admin/users">Админка</NavLink>
                  <NavLink href="/admin/customers">Заказчики</NavLink>
                  <NavLink href="/admin/analytics">Аналитика</NavLink>
                </>
              ) : null}
            </div>
          </aside>

          <main className="rounded-2xl border border-zinc-200 bg-white p-4">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

