"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React from "react";

import { useAuth } from "@/app/providers";
import { InAppNotifications } from "@/app/_ui/InAppNotifications";

function NavLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      onClick={onClick}
      className={[
        "block rounded-lg px-3 py-2 text-sm",
        active
          ? "bg-violet-700 text-white shadow-sm"
          : "text-zinc-800 hover:bg-violet-50",
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
  const pathname = usePathname();
  const { state, refresh } = useAuth();
  const [navOpen, setNavOpen] = React.useState(false);

  function sectionBackHref(path: string): string {
    // Явные “разделы” (чтобы кнопка была предсказуемой)
    if (path.startsWith("/orders/")) return "/orders";
    if (path.startsWith("/warehouse/")) return "/home";
    if (path.startsWith("/admin/")) return "/admin";
    if (path === "/inventory/items") return "/home";
    if (path.startsWith("/inventory/")) return "/inventory/items";

    const parts = path.split("?")[0]?.split("#")[0]?.split("/").filter(Boolean) ?? [];
    if (parts.length <= 1) return "/home";
    return "/" + parts.slice(0, -1).join("/");
  }

  React.useEffect(() => {
    if (state.status === "anonymous") router.replace("/login");
  }, [router, state.status]);

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    } finally {
      await refresh();
      router.replace("/login");
    }
  }

  if (state.status !== "authenticated") {
    return (
      <div className="min-h-screen bg-[#f6f2ff] flex items-center justify-center">
        <div className="text-sm text-zinc-600">Загрузка…</div>
      </div>
    );
  }

  const isWowstorg = state.user.role === "WOWSTORG";
  const showBack = pathname !== "/home";

  return (
    <div className="relative min-h-screen bg-[radial-gradient(1000px_600px_at_80%_10%,rgba(250,204,21,0.16),transparent_60%),radial-gradient(1000px_600px_at_10%_90%,rgba(124,58,237,0.20),transparent_60%),#f6f2ff]">
      <InAppNotifications enabled={state.status === "authenticated" && state.user.role === "GREENWICH"} />
      <div className="wow-bg" aria-hidden="true">
        <div
          className="wow-orb wow-orb--violet"
          style={{
            width: 520,
            height: 520,
            top: -180,
            left: -220,
            ["--wow-x" as never]: "60px",
            ["--wow-y" as never]: "90px",
            ["--wow-duration" as never]: "16s",
          }}
        />
        <div
          className="wow-orb wow-orb--yellow"
          style={{
            width: 460,
            height: 460,
            bottom: -220,
            right: -180,
            ["--wow-x" as never]: "-70px",
            ["--wow-y" as never]: "-60px",
            ["--wow-duration" as never]: "18s",
          }}
        />
        <div
          className="wow-orb wow-orb--violet"
          style={{
            width: 320,
            height: 320,
            top: "38%",
            right: "-140px",
            opacity: 0.45,
            ["--wow-x" as never]: "-60px",
            ["--wow-y" as never]: "40px",
            ["--wow-duration" as never]: "20s",
          }}
        />
      </div>
      {/* top bar */}
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white hover:bg-violet-50"
              aria-label="Открыть меню"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-zinc-800">
                <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
              </svg>
            </button>

            <Link
              href="/home"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-transparent hover:bg-violet-50"
              aria-label="На главную"
              title="На главную"
            >
              <img
                src="/dino.png"
                alt=""
                aria-hidden="true"
                className="h-8 w-8 object-contain [image-rendering:pixelated]"
              />
            </Link>

            {showBack ? (
              <button
                type="button"
                onClick={() => router.push(sectionBackHref(pathname))}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-800 hover:bg-violet-50"
                aria-label="Назад"
                title="Назад"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-zinc-800">
                  <path d="M19 11H7.83l4.58-4.59L11 5l-7 7 7 7 1.41-1.41L7.83 13H19v-2z" />
                </svg>
                <span className="hidden sm:inline">Назад</span>
              </button>
            ) : null}
            <div>
              <div className="text-base font-semibold tracking-tight text-zinc-900">
                {title}
              </div>
              <div className="text-xs text-zinc-600">
                {state.user.role === "GREENWICH"
                  ? state.user.displayName
                  : `${state.user.displayName} · ${state.user.role}`}
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-violet-50"
          >
            Выйти
          </button>
        </div>
      </div>

      {/* drawer */}
      {navOpen ? (
        <div className="fixed inset-0 z-20">
          <button
            className="absolute inset-0 bg-black/30"
            onClick={() => setNavOpen(false)}
            aria-label="Закрыть меню"
          />
          <div className="absolute left-0 top-0 h-full w-[290px] border-r border-zinc-200 bg-white p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="text-sm font-semibold text-zinc-900">Меню</div>
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white hover:bg-violet-50"
                onClick={() => setNavOpen(false)}
                aria-label="Закрыть"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-zinc-800">
                  <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29 10.59 10.6l6.3-6.31z" />
                </svg>
              </button>
            </div>
            <div className="space-y-1">
              <NavLink href="/home" onClick={() => setNavOpen(false)}>
                Главная
              </NavLink>
              <NavLink href="/catalog" onClick={() => setNavOpen(false)}>
                Каталог
              </NavLink>
              <NavLink href="/cart" onClick={() => setNavOpen(false)}>
                Корзина
              </NavLink>
              {isWowstorg ? (
                <>
                  <div className="mt-3 border-t border-zinc-100 pt-3 text-xs font-semibold text-zinc-500">
                    Wowstorg
                  </div>
                  <NavLink
                    href="/warehouse/queue"
                    onClick={() => setNavOpen(false)}
                  >
                    Очередь заявок
                  </NavLink>
                  <NavLink
                    href="/warehouse/archive"
                    onClick={() => setNavOpen(false)}
                  >
                    Архив заявок
                  </NavLink>
                  <NavLink
                    href="/inventory/items"
                    onClick={() => setNavOpen(false)}
                  >
                    Инвентарь
                  </NavLink>
                  <NavLink
                    href="/inventory/positions"
                    onClick={() => setNavOpen(false)}
                  >
                    Позиции
                  </NavLink>
                  <NavLink
                    href="/inventory/collections"
                    onClick={() => setNavOpen(false)}
                  >
                    Категории
                  </NavLink>
                  <NavLink
                    href="/inventory/packages"
                    onClick={() => setNavOpen(false)}
                  >
                    Пакеты
                  </NavLink>
                  <NavLink
                    href="/inventory/warehouse-items"
                    onClick={() => setNavOpen(false)}
                  >
                    Складской реквизит
                  </NavLink>
                  <NavLink
                    href="/inventory/repair"
                    onClick={() => setNavOpen(false)}
                  >
                    Ремонт / сломано
                  </NavLink>
                  <NavLink
                    href="/inventory/losses"
                    onClick={() => setNavOpen(false)}
                  >
                    Утерянное
                  </NavLink>
                  <NavLink href="/admin" onClick={() => setNavOpen(false)}>
                    Админка
                  </NavLink>
                </>
              ) : (
                <NavLink href="/orders" onClick={() => setNavOpen(false)}>
                  Мои заявки
                </NavLink>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* content */}
      <div className="mx-auto max-w-7xl px-4 py-4">
        <main className="rounded-2xl border border-violet-200/60 bg-white/90 p-4 text-zinc-900 shadow-sm backdrop-blur">
          {children}
        </main>
      </div>
    </div>
  );
}

