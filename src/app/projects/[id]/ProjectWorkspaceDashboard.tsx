"use client";

import React from "react";
import { createPortal } from "react-dom";

import {
  PROJECT_WIDGET_REGISTRY,
  type ProjectWidgetType,
} from "@/lib/projects/project-widget-registry";
import type { ProjectWorkspaceWidgetInput } from "@/lib/projects/project-workspace";
import { queueProjectBoardInsertion } from "@/lib/projects/project-board-insertion";
import type { ProjectFreeBoardLinkedItemType } from "@/lib/projects/project-free-board";

const WIDTH_CLASS: Record<4 | 6 | 8 | 12, string> = {
  4: "md:col-span-4",
  6: "md:col-span-6",
  8: "md:col-span-8",
  12: "md:col-span-12",
};

const ICON_PATH: Record<ProjectWidgetType, React.ReactNode> = {
  CONTRACTORS: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0H5z" />,
  EVENT_BUILDER: <path d="M5 4h14v16H5V4zm3 3v2h8V7H8zm0 4v2h5v-2H8zm0 4v2h8v-2H8zM3 7h2v2H3V7zm16 6h2v2h-2v-2z" />,
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
  const widgetRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    if (!expanded || !widgetRef.current) return;
    const node = widgetRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const siblings = Array.from(document.body.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== node);
    const previousInert = siblings.map(element => element.inert);
    siblings.forEach(element => { element.inert = true; });
    node.querySelector<HTMLButtonElement>("button")?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      if (node.querySelector("dialog:modal")) return;
      const controls = Array.from(node.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
    };
    node.addEventListener("keydown", trap);
    return () => { node.removeEventListener("keydown", trap); siblings.forEach((element, index) => { element.inert = previousInert[index]; }); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [expanded]);

  React.useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const widgetNode = (
    <section
      ref={widgetRef}
      className={`project-workspace-widget min-w-0 bg-white ${expanded ? "project-workspace-widget--overlay fixed inset-0 z-[230] flex h-dvh w-screen flex-col" : `col-span-1 ${collapsed ? "md:col-span-4" : WIDTH_CLASS[widget.width]}`}`}
      style={expanded ? undefined : { order: widget.sortOrder }}
      id={`project-widget-${widget.type.toLowerCase().replaceAll("_", "-")}`}
      data-widget={widget.type}
      data-expanded={expanded || undefined}
      data-collapsed={collapsed || undefined}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded || undefined}
      aria-label={expanded ? definition.title : undefined}
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
            <button type="button" onClick={() => setMenuOpen((value) => !value)} className="project-workspace-widget__control" aria-label={`Действия: ${definition.title}`} aria-expanded={menuOpen}><svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true"><circle cx="9" cy="3" r="1.5" /><circle cx="9" cy="9" r="1.5" /><circle cx="9" cy="15" r="1.5" /></svg></button>
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

  return expanded ? createPortal(widgetNode, document.body) : widgetNode;
}

export function ProjectWorkspaceDashboard({ projectId, widgets, renderWidget }: {
  projectId: string;
  widgets: ProjectWorkspaceWidgetInput[];
  renderWidget: (type: ProjectWidgetType, expanded: boolean, onExpand?: () => void) => React.ReactNode;
}) {
  const [collapsedTypes, setCollapsedTypes] = React.useState<Set<ProjectWidgetType>>(new Set());
  const [expandedType, setExpandedType] = React.useState<ProjectWidgetType | null>(null);
  const [returnToBoard, setReturnToBoard] = React.useState(false);
  function closeExpanded() {
    if (expandedType === "EVENT_BUILDER" && !window.dispatchEvent(new Event("proposal-workspace:close", { cancelable: true }))) return;
    if (expandedType === "CONTRACTORS" && !window.dispatchEvent(new Event("project-contractors:close", { cancelable: true }))) return;
    setExpandedType(returnToBoard ? "FREE_BOARD" : null);
    setReturnToBoard(false);
  }
  React.useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId: string; type: ProjectWidgetType; returnToBoard?: boolean; insert?: { type: ProjectFreeBoardLinkedItemType; id: string } }>).detail;
      if (detail?.projectId !== projectId) return;
      if (!widgets.some((widget) => widget.type === detail.type)) { event.preventDefault(); return; }
      if (!window.dispatchEvent(new Event("project-contractors:close", { cancelable: true }))) { event.preventDefault(); return; }
      if (detail.insert) queueProjectBoardInsertion(projectId, detail.insert);
      setCollapsedTypes((current) => { const next = new Set(current); next.delete(detail.type); return next; });
      setReturnToBoard(Boolean(detail.returnToBoard)); setExpandedType(detail.type);
    };
    window.addEventListener("project-workspace:open", open);
    return () => window.removeEventListener("project-workspace:open", open);
  }, [projectId, widgets]);
  const closeOnEscape = React.useEffectEvent((event: KeyboardEvent) => {
    if (document.querySelector("dialog:modal")) return;
    if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); closeExpanded(); }
  });

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
    const close = (event: KeyboardEvent) => closeOnEscape(event);
    window.addEventListener("keydown", close);
    return () => {
      document.body.classList.remove("project-workspace-expanded");
      window.removeEventListener("keydown", close);
    };
  }, [expandedType]);

  function toggleCollapsed(type: ProjectWidgetType) {
    if (type === "CONTRACTORS" && !collapsedTypes.has(type) && !window.dispatchEvent(new Event("project-contractors:close", { cancelable: true }))) return;
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
        {widgets.filter((widget) => widget.isVisible || widget.type === expandedType).sort((a, b) => a.sortOrder - b.sortOrder).map((widget) => (
          <WorkspaceWidget
            key={widget.type}
            widget={widget}
            collapsed={collapsedTypes.has(widget.type)}
            expanded={expandedType === widget.type}
            onToggleCollapsed={() => toggleCollapsed(widget.type)}
            onToggleExpanded={() => {
              if (expandedType === widget.type) closeExpanded();
              else if (widget.type !== "CONTRACTORS" || window.dispatchEvent(new Event("project-contractors:close", { cancelable: true }))) setExpandedType(widget.type);
            }}
            onConfigure={() => window.dispatchEvent(new CustomEvent("project-workspace:configure"))}
          >
            {renderWidget(widget.type, expandedType === widget.type, () => setExpandedType(widget.type))}
          </WorkspaceWidget>
        ))}
      </div>
    </div>
  );
}
