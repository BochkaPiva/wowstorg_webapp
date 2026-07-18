"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React from "react";

import { InAppNotifications } from "@/app/_ui/InAppNotifications";
import { AppWorkspaceSkeleton } from "@/app/_ui/Skeleton";
import { useAuth } from "@/app/providers";

type NavItem = { href: string; label: string };

const commonItems: NavItem[] = [
  { href: "/home", label: "Главная" },
  { href: "/catalog", label: "Каталог" },
  { href: "/cart", label: "Корзина" },
];

const warehouseItems: NavItem[] = [
  { href: "/projects", label: "Проекты" },
  { href: "/tasks", label: "Задачи" },
  { href: "/warehouse/queue", label: "Очередь заявок" },
];

const inventoryItems: NavItem[] = [
  { href: "/inventory/items", label: "Инвентарь" },
  { href: "/inventory/positions", label: "Позиции" },
  { href: "/inventory/collections", label: "Категории" },
  { href: "/inventory/packages", label: "Пакеты" },
  { href: "/inventory/warehouse-items", label: "Складской реквизит" },
  { href: "/inventory/repair", label: "Ремонт и поломки" },
  { href: "/inventory/losses", label: "Утерянное" },
];

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className="app-nav__link"
      data-active={active || undefined}
      aria-current={active ? "page" : undefined}
    >
      <span>{item.label}</span>
      <span className="app-nav__marker" aria-hidden="true" />
    </Link>
  );
}

function Brand() {
  return (
    <Link href="/home" className="app-brand" aria-label="ВАУСТОРГ, на главную">
      <span className="app-brand__mark" aria-hidden="true">
        <Image src="/brand/dino-catalog.webp" width={48} height={48} alt="" />
      </span>
      <span className="app-brand__name">ВАУСТОРГ</span>
      <span className="app-brand__caption">рабочее пространство</span>
    </Link>
  );
}

function Navigation({ isWowstorg, onNavigate }: { isWowstorg: boolean; onNavigate?: () => void }) {
  return (
    <nav className="app-nav" aria-label="Основная навигация">
      <div className="app-nav__group">
        {commonItems.map((item) => <NavLink key={item.href} item={item} onClick={onNavigate} />)}
        {!isWowstorg ? <NavLink item={{ href: "/orders", label: "Мои заявки" }} onClick={onNavigate} /> : null}
      </div>
      {isWowstorg ? (
        <>
          <div className="app-nav__group">
            <div className="app-nav__label">Работа</div>
            {warehouseItems.map((item) => <NavLink key={item.href} item={item} onClick={onNavigate} />)}
          </div>
          <div className="app-nav__group">
            <div className="app-nav__label">Склад</div>
            {inventoryItems.map((item) => <NavLink key={item.href} item={item} onClick={onNavigate} />)}
          </div>
          <div className="app-nav__group app-nav__group--last">
            <NavLink item={{ href: "/admin", label: "Администрирование" }} onClick={onNavigate} />
          </div>
        </>
      ) : null}
    </nav>
  );
}

function sectionBackHref(path: string, role: string): string {
  if (path.startsWith("/orders/")) return role === "WOWSTORG" ? "/warehouse/queue" : "/orders";
  if (path.startsWith("/projects/")) return "/projects";
  if (path.startsWith("/warehouse/")) return "/home";
  if (path.startsWith("/admin/")) return "/admin";
  if (path === "/inventory/items") return "/home";
  if (path.startsWith("/inventory/")) return "/inventory/items";

  const parts = path.split("?")[0]?.split("#")[0]?.split("/").filter(Boolean) ?? [];
  if (parts.length <= 1) return "/home";
  return `/${parts.slice(0, -1).join("/")}`;
}

export function AppShell({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { state, refresh } = useAuth();
  const [navOpen, setNavOpen] = React.useState(false);

  React.useEffect(() => {
    if (state.status === "anonymous") router.replace("/login");
  }, [router, state.status]);

  React.useEffect(() => setNavOpen(false), [pathname]);

  React.useEffect(() => {
    if (!navOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [navOpen]);

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    } finally {
      await refresh();
      router.replace("/login");
    }
  }

  if (state.status !== "authenticated") {
    return <AppWorkspaceSkeleton />;
  }

  const isWowstorg = state.user.role === "WOWSTORG";
  const showBack = pathname !== "/home";
  const headerSubtitle = state.user.role === "GREENWICH"
    ? state.user.displayName
    : `${state.user.displayName} · ВАУСТОРГ`;

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Brand />
        <Navigation isWowstorg={isWowstorg} />
        <div className="app-sidebar__footer">
          <span>{state.user.displayName}</span>
          <button type="button" onClick={logout}>Выйти</button>
        </div>
      </aside>

      <div className="app-workspace">
        <header className="app-topbar">
          <div className="app-topbar__leading">
            <button
              type="button"
              className="app-iconButton app-topbar__menu"
              onClick={() => setNavOpen(true)}
              aria-label="Открыть меню"
              aria-expanded={navOpen}
            >
              <span className="app-menuIcon" aria-hidden="true"><i /><i /><i /></span>
            </button>
            {showBack ? (
              <button
                type="button"
                className="app-backButton"
                onClick={() => router.push(sectionBackHref(pathname, state.user.role))}
                aria-label="Назад к разделу"
              >
                <span aria-hidden="true">←</span>
                <span>Назад</span>
              </button>
            ) : null}
            <div className="app-topbar__titleBlock">
              <h1>{title}</h1>
              <p>{headerSubtitle}</p>
            </div>
          </div>
          <div className="app-topbar__actions">
            <InAppNotifications enabled />
            <span className="app-topbar__status">В работе</span>
          </div>
        </header>

        <div className="app-content">
          <main className="app-content__main">{children}</main>
        </div>
      </div>

      {navOpen ? (
        <div className="app-drawer" role="dialog" aria-modal="true" aria-label="Навигация">
          <button className="app-drawer__backdrop" type="button" onClick={() => setNavOpen(false)} aria-label="Закрыть меню" />
          <aside className="app-drawer__panel">
            <div className="app-drawer__head">
              <Brand />
              <button className="app-iconButton" type="button" onClick={() => setNavOpen(false)} aria-label="Закрыть меню">×</button>
            </div>
            <Navigation isWowstorg={isWowstorg} onNavigate={() => setNavOpen(false)} />
            <div className="app-sidebar__footer">
              <span>{state.user.displayName}</span>
              <button type="button" onClick={logout}>Выйти</button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
