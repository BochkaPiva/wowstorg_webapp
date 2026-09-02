"use client";

import React from "react";

import {
  PROJECT_WIDGET_REGISTRY,
  type ProjectWidgetType,
} from "@/lib/projects/project-widget-registry";
import type { ProjectWorkspaceWidgetInput } from "@/lib/projects/project-workspace";

const WIDTH_CLASS: Record<4 | 6 | 8 | 12, string> = {
  4: "md:col-span-4",
  6: "md:col-span-6",
  8: "md:col-span-8",
  12: "md:col-span-12",
};

const ICON_PATH: Record<ProjectWidgetType, React.ReactNode> = {
  ESTIMATE: <path d="M7 3h10v4H7zM7 10h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zM7 14h2v2H7zm4 0h2v2h-2zm4 0h2v2H7z" />,
  ORDERS: <path d="M9 4h6l1 2h3v15H5V6h3l1-2zm0 7h6V9H9v2zm0 4h6v-2H9v2zm0 4h4v-2H9v2z" />,
  TASKS: <path d="M4 6h3v3H4V6zm5 0h11v2H9V6zM4 11h3v3H4v-3zm5 0h11v2H9v-2zM4 16h3v3H4v-3zm5 0h11v2H9v-2z" />,
  FREE_BOARD: <path d="M4 4h16v16H4V4zm3 3v10h3V7H7zm5 0v6h5V7h-5zm0 8v2h5v-2h-5z" />,
  SCHEDULE: <path d="M6 3h2v2h8V3h2v2h2v16H4V5h2V3zm0 7v9h12v-9H6z" />,
  FILES: <path d="M6 3h8l4 4v14H6V3zm8 1.5V8h3.5L14 4.5zM9 12h6v-2H9v2zm0 4h6v-2H9v2z" />,
  CONTACTS: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0H5z" />,
  NOTES: <path d="M5 4h14v16H5V4zm3 4h8V6H8v2zm0 4h8v-2H8v2zm0 4h5v-2H8v2z" />,
  HISTORY: <path d="M12 4a8 8 0 11-7.4 5H2l3.5-4L9 9H6.7A6 6 0 1012 6V4zm-1 4h2v5l4 2-1 1.7-5-2.7V8z" />,
};

function WidgetIcon({ type }: { type: ProjectWidgetType }) {
  return <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>{ICON_PATH[type]}</svg>;
}

function ExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {expanded
        ? <path d="M8 3v5H3M12 17v-5h5" />
        : <path d="M7 3H3v4M13 3h4v4M17 13v4h-4M3 13v4h4" />}
    </svg>
  );
}

function WorkspaceWidget({ widget, collapsed, expanded, onToggleCollapsed, onToggleExpanded, onConfigure, children }: {
  widget: ProjectWorkspaceWidgetInput;
  collapsed: boolean;
  expanded: boolean;
  onToggleCollapsed: () => void;
  onToggleExpanded: () => void;
  onConfigure: () => void;
  children: React.ReactNode;
}) {
  const definition = PROJECT_WIDGET_REGISTRY.find((item) => item.type === widget.type)!;
  const canExpand = widget.type !== "TASKS";
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  return (
    <section
      className={`project-workspace-widget min-w-0 bg-white ${expanded ? "fixed inset-0 z-[130] flex h-dvh flex-col" : `col-span-1 ${collapsed ? "md:col-span-4" : WIDTH_CLASS[widget.width]}`}`}
      style={expanded ? undefined : { order: widget.sortOrder }}
      id={`project-widget-${widget.type.toLowerCase().replaceAll("_", "-")}`}
      data-widget={widget.type}
      data-expanded={expanded || undefined}
      data-collapsed={collapsed || undefined}
    >
      <header className="project-workspace-widget__header" data-menu-open={menuOpen || undefined}>
        <div className="project-workspace-widget__identity">
          <span className="project-workspace-widget__icon"><WidgetIcon type={widget.type} /></span>
          <div className="project-workspace-widget__titlecopy">
            <h2>{definition.title}</h2>
            {!collapsed ? <span>{definition.description}</span> : null}
          </div>
        </div>
        <div className="project-workspace-widget__controls">
          {!collapsed && canExpand ? (
            <button type="button" onClick={onToggleExpanded} className="project-workspace-widget__control" aria-label={expanded ? `Вернуть «${definition.title}» в карточку` : `Развернуть «${definition.title}» на весь экран`} title={expanded ? "Вернуть в карточку" : "На весь экран"}>
              <ExpandIcon expanded={expanded} />
            </button>
          ) : null}
          <div ref={menuRef} className="relative">
            <button type="button" onClick={() => setMenuOpen((value) => !value)} className="project-workspace-widget__control text-lg leading-none" aria-label={`Действия: ${definition.title}`} aria-expanded={menuOpen}>⋮</button>
            {menuOpen ? (
              <div className="absolute right-0 top-9 z-[90] w-52 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 text-xs shadow-[0_6px_8px_rgba(0,0,0,0.1)]">
                <button type="button" onClick={() => { setMenuOpen(false); onToggleCollapsed(); }} className="block w-full px-3 py-2.5 text-left font-semibold text-zinc-800 hover:bg-zinc-50">{collapsed ? "Развернуть содержимое" : "Свернуть содержимое"}</button>
                <button type="button" onClick={() => { setMenuOpen(false); onConfigure(); }} className="block w-full px-3 py-2.5 text-left font-semibold text-zinc-800 hover:bg-zinc-50">Порядок, размер и видимость…</button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      {!collapsed ? <div className={`project-workspace-widget__body ${expanded ? "min-h-0 flex-1 overflow-auto" : ""}`}>{children}</div> : null}
    </section>
  );
}

export function ProjectWorkspaceDashboard({ projectId, widgets, renderWidget }: {
  projectId: string;
  widgets: ProjectWorkspaceWidgetInput[];
  renderWidget: (type: ProjectWidgetType) => React.ReactNode;
}) {
  const [collapsedTypes, setCollapsedTypes] = React.useState<Set<ProjectWidgetType>>(new Set());
  const [expandedType, setExpandedType] = React.useState<ProjectWidgetType | null>(null);

  React.useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(`project-workspace-collapsed:${projectId}`) ?? "[]") as string[];
      setCollapsedTypes(new Set(stored.filter((type): type is ProjectWidgetType => PROJECT_WIDGET_REGISTRY.some((item) => item.type === type))));
    } catch {
      setCollapsedTypes(new Set());
    }
  }, [projectId]);

  React.useEffect(() => {
    if (!expandedType) return;
    document.body.classList.add("project-workspace-expanded");
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setExpandedType(null); };
    window.addEventListener("keydown", close);
    return () => {
      document.body.classList.remove("project-workspace-expanded");
      window.removeEventListener("keydown", close);
    };
  }, [expandedType]);

  function toggleCollapsed(type: ProjectWidgetType) {
    setCollapsedTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      try {
        localStorage.setItem(`project-workspace-collapsed:${projectId}`, JSON.stringify(Array.from(next)));
      } catch {
        // Local preference is best-effort; server layout remains the source of truth.
      }
      return next;
    });
  }

  const visible = widgets.filter((widget) => widget.isVisible).sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <div className="project-workspace-dashboard">
      <nav className="project-workspace-index" aria-label="Разделы карточки проекта">
        {visible.map((widget) => {
          const definition = PROJECT_WIDGET_REGISTRY.find((item) => item.type === widget.type)!;
          return (
            <a key={widget.type} href={`#project-widget-${widget.type.toLowerCase().replaceAll("_", "-")}`}>
              {definition.title}
            </a>
          );
        })}
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("project-workspace:configure"))}>Настроить</button>
      </nav>
      <div className="project-workspace-grid grid grid-cols-1 items-start md:grid-cols-12">
        {visible.map((widget) => (
          <WorkspaceWidget
            key={widget.type}
            widget={widget}
            collapsed={collapsedTypes.has(widget.type)}
            expanded={expandedType === widget.type}
            onToggleCollapsed={() => toggleCollapsed(widget.type)}
            onToggleExpanded={() => setExpandedType((current) => current === widget.type ? null : widget.type)}
            onConfigure={() => window.dispatchEvent(new CustomEvent("project-workspace:configure"))}
          >
            {renderWidget(widget.type)}
          </WorkspaceWidget>
        ))}
      </div>
    </div>
  );
}
