import React from "react";
const navigate = (href: string) => { history.pushState({}, "", href); window.dispatchEvent(new PopStateEvent("popstate")); };
export const useRouter = () => ({ push: navigate, replace: navigate, refresh: () => {}, back: () => history.back() });
export const useSearchParams = () => new URLSearchParams(location.search);
export const useAuth = () => ({ state: { status: "authenticated", user: { id: "qa-user", role: "WOWSTORG", displayName: "Демо" } } });
export function AppShell({ title, children, backHref }: { title: string; children: React.ReactNode; backHref?: string }) {
  return <><header className="app-topbar qa-topbar">{backHref ? <a href={backHref}>Назад</a> : null}<strong>{title}</strong><span>Тестовые данные · без рабочей БД</span></header><main className="qa-shell">{children}</main></>;
}
export function Link({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) { return <a href={href} {...props}>{children}</a>; }
export function Image({ fill, unoptimized, priority, sizes, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; unoptimized?: boolean; priority?: boolean }) { return <img {...props} style={fill ? { ...props.style, position: "absolute", width: "100%", height: "100%", objectFit: "cover" } : props.style} />; }
