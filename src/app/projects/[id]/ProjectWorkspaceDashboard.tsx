"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useLocalStorageText } from "@/lib/use-local-storage-text";

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

function widgetId(type: ProjectWidgetType) {
  return `project-widget-${type.toLowerCase().replaceAll("_", "-")}`;
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

function WorkspaceWidget({ widget, collapsed, expanded, onToggleCollapsed, onToggleExpanded, onConfigure, layout, children }: {
  widget: ProjectWorkspaceWidgetInput;
  collapsed: boolean;
  expanded: boolean;
  onToggleCollapsed: () => void;
  onToggleExpanded: () => void;
  onConfigure: () => void;
  layout?: { index: number; count: number; dragging: boolean; target: boolean; onDragStart: () => void; onDragEnter: () => void; onDragEnd: () => void; onDrop: () => void; onMove: (direction: -1 | 1) => void; onWidth: (width: ProjectWorkspaceWidgetInput["width"]) => void };
  children: React.ReactNode;
}) {
  const definition = PROJECT_WIDGET_REGISTRY.find((item) => item.type === widget.type)!;
  const canExpand = widget.type !== "TASKS";
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
      const controls = Array.from(node.querySelectorAll<HTMLElement>('button:not(:disabled),summary,a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
    };
    node.addEventListener("keydown", trap);
    return () => { node.removeEventListener("keydown", trap); siblings.forEach((element, index) => { element.inert = previousInert[index]; }); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [expanded]);

  const widgetNode = (
    <section
      ref={widgetRef}
      className={`project-workspace-widget min-w-0 bg-white ${expanded ? "project-detail-page project-workspace-widget--overlay fixed inset-0 z-[230] flex h-dvh w-screen flex-col" : `col-span-1 ${WIDTH_CLASS[widget.width]}`}`}
      style={expanded ? undefined : { order: widget.sortOrder }}
      id={widgetId(widget.type)}
      tabIndex={-1}
      data-widget={widget.type}
      data-expanded={expanded || undefined}
      data-collapsed={collapsed || undefined}
      data-layout-editing={Boolean(layout) || undefined}
      data-layout-dragging={layout?.dragging || undefined}
      data-layout-target={layout?.target || undefined}
      onDragOver={layout ? (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } : undefined}
      onDragEnter={layout ? (event) => { event.preventDefault(); layout.onDragEnter(); } : undefined}
      onDrop={layout ? (event) => { event.preventDefault(); layout.onDrop(); } : undefined}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded || undefined}
      aria-label={expanded ? definition.title : undefined}
    >
      <header className="project-workspace-widget__header">
        {layout ? <button type="button" className="project-workspace-drag" draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", widget.type); layout.onDragStart(); }} onDragEnd={layout.onDragEnd} onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); layout.onMove(event.key === "ArrowUp" ? -1 : 1); } }} aria-label={`Переместить блок ${definition.title}. Для клавиатуры используйте стрелки вверх и вниз`} title="Перетащите блок"><svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden><circle cx="5" cy="4" r="1"/><circle cx="11" cy="4" r="1"/><circle cx="5" cy="8" r="1"/><circle cx="11" cy="8" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="11" cy="12" r="1"/></svg></button> : null}
        <div className="project-workspace-widget__identity">
          <span className="project-workspace-widget__icon"><WidgetIcon type={widget.type} /></span>
          <div className="project-workspace-widget__titlecopy">
            <h2 title={definition.description}>{definition.title}</h2>
          </div>
        </div>
        <div className="project-workspace-widget__controls">
          {layout ? <div className="project-workspace-layout-controls"><label><span className="sr-only">Ширина блока {definition.title}</span><select value={widget.width} onChange={(event) => layout.onWidth(Number(event.target.value) as ProjectWorkspaceWidgetInput["width"])}>{definition.allowedWidths.map((width) => <option key={width} value={width}>{width === 12 ? "Вся ширина" : width === 8 ? "⅔ ширины" : width === 6 ? "½ ширины" : "⅓ ширины"}</option>)}</select></label><span className="project-workspace-mobile-move"><button type="button" disabled={layout.index === 0} onClick={() => layout.onMove(-1)} aria-label={`Переместить ${definition.title} выше`}>↑</button><button type="button" disabled={layout.index === layout.count - 1} onClick={() => layout.onMove(1)} aria-label={`Переместить ${definition.title} ниже`}>↓</button></span></div> : null}
          {!layout ? <>
          {!collapsed && canExpand ? (
            <button type="button" data-widget-expand onClick={onToggleExpanded} className={`project-workspace-widget__control${widget.type === "ESTIMATE" ? " project-workspace-widget__estimate-expand" : ""}`} aria-label={expanded ? `Вернуть «${definition.title}» в карточку` : `Развернуть «${definition.title}» на весь экран`} title={expanded ? "Вернуть в карточку" : "На весь экран"}>
              <ExpandIcon expanded={expanded} />
              {widget.type === "ESTIMATE" ? <span aria-hidden="true">{expanded ? "К проекту" : "На весь экран"}</span> : null}
            </button>
          ) : null}
          {!expanded ? <details className="relative" data-ui-popup="actions">
            <summary className="project-workspace-widget__control" aria-label={`Действия: ${definition.title}`}><svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true"><circle cx="9" cy="3" r="1.5" /><circle cx="9" cy="9" r="1.5" /><circle cx="9" cy="15" r="1.5" /></svg></summary>
            <div className="ui-popover absolute right-0 top-full z-[90] mt-1.5 w-56 max-w-[calc(100vw-32px)]">
              <button type="button" onClick={onToggleCollapsed} className="ui-popover-item">{collapsed ? "Развернуть содержимое" : "Свернуть содержимое"}</button>
              <button type="button" onClick={(event) => {
                const popup = event.currentTarget.closest("details");
                if (popup) popup.open = false;
                popup?.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
                onConfigure();
              }} className="ui-popover-item">Порядок, размер и видимость…</button>
            </div>
          </details> : null}
          </> : null}
        </div>
      </header>
      {!collapsed ? <div inert={Boolean(layout)} className={`project-workspace-widget__body ${expanded ? "min-h-0 flex-1 overflow-auto" : ""}`}>{children}</div> : null}
    </section>
  );

  return expanded ? createPortal(widgetNode, document.body) : widgetNode;
}

type DashboardProps = {
  projectId: string;
  widgets: ProjectWorkspaceWidgetInput[];
  renderWidget: (type: ProjectWidgetType, expanded: boolean, onExpand?: () => void) => React.ReactNode;
  revision?: number;
  onSaveLayout?: (widgets: ProjectWorkspaceWidgetInput[], revision: number) => Promise<void>;
};

function readCollapsedTypes(text: string | null) {
  try {
    const stored: unknown = JSON.parse(text ?? "[]");
    return new Set(Array.isArray(stored) ? stored.filter((type): type is ProjectWidgetType => PROJECT_WIDGET_REGISTRY.some(item => item.type === type)) : []);
  } catch { return new Set<ProjectWidgetType>(); }
}

export function ProjectWorkspaceDashboard(props: DashboardProps) {
  return <WorkspaceDashboard key={props.projectId} {...props} />;
}

function WorkspaceDashboard({ projectId, widgets, renderWidget, revision, onSaveLayout }: DashboardProps) {
  const [collapsedText, writeCollapsed] = useLocalStorageText(`project-workspace-collapsed:${projectId}`);
  const [collapsedTypes, setCollapsedTypes] = React.useState(() => readCollapsedTypes(collapsedText));
  const [collapsedSource, setCollapsedSource] = React.useState(collapsedText);
  if (collapsedSource !== collapsedText) { setCollapsedSource(collapsedText); setCollapsedTypes(readCollapsedTypes(collapsedText)); }
  const [expandedType, setExpandedType] = React.useState<ProjectWidgetType | null>(null);
  const [returnToBoard, setReturnToBoard] = React.useState(false);
  const [layoutDraft, setLayoutDraft] = React.useState<ProjectWorkspaceWidgetInput[] | null>(null);
  const [layoutRevision, setLayoutRevision] = React.useState(0);
  const [dragged, setDragged] = React.useState<ProjectWidgetType | null>(null);
  const [dropTarget, setDropTarget] = React.useState<ProjectWidgetType | null>(null);
  const [layoutBusy, setLayoutBusy] = React.useState(false);
  const [layoutError, setLayoutError] = React.useState<string | null>(null);
  const [activeType, setActiveType] = React.useState<ProjectWidgetType | null>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const indexRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    if (expandedType || layoutDraft) return;
    let frame = 0;
    function measure() {
      const grid = gridRef.current;
      if (!grid) return;
      const blocks = Array.from(grid.querySelectorAll<HTMLElement>(":scope > [data-widget]"));
      const edge = Math.max(110, Number.parseFloat(getComputedStyle(blocks[0] ?? grid).scrollMarginTop) || 0) + 12;
      const positions = blocks.map((block) => {
        const { top, bottom } = block.getBoundingClientRect();
        return { type: block.dataset.widget as ProjectWidgetType, top, bottom };
      });
      const currentTop = Math.max(-Infinity, ...positions.filter(({ top, bottom }) => top <= edge && bottom > edge).map(({ top }) => top));
      if (!Number.isFinite(currentTop)) {
        const inView = positions.filter(({ top, bottom }) => top < window.innerHeight && bottom > edge);
        setActiveType((previous) => inView.some(({ type }) => type === previous) ? previous : inView[0]?.type ?? null);
        return;
      }
      const row = positions.filter(({ top }) => Math.abs(top - currentTop) < 2);
      setActiveType((previous) => row.some(({ type }) => type === previous) ? previous : row[0]?.type ?? null);
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    if (gridRef.current) resize?.observe(gridRef.current);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [expandedType, layoutDraft, widgets]);

  React.useEffect(() => {
    const links = indexRef.current?.querySelector<HTMLElement>(".project-workspace-index__links");
    const active = links?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!links || !active || links.scrollWidth <= links.clientWidth) return;
    const container = links.getBoundingClientRect(), item = active.getBoundingClientRect();
    if (item.left < container.left) links.scrollLeft -= container.left - item.left;
    if (item.right > container.right) links.scrollLeft += item.right - container.right;
  }, [activeType]);
  React.useEffect(() => {
    if (!layoutDraft) return;
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [layoutDraft]);
  function moveLayout(fromType: ProjectWidgetType, toType: ProjectWidgetType) {
    if (fromType === toType) return;
    setLayoutDraft((previous) => {
      if (!previous) return previous;
      const next = [...previous].sort((a, b) => a.sortOrder - b.sortOrder);
      const from = next.findIndex((item) => item.type === fromType), to = next.findIndex((item) => item.type === toType);
      if (from < 0 || to < 0) return previous;
      const [moved] = next.splice(from, 1); next.splice(to, 0, moved);
      return next.map((item, index) => ({ ...item, sortOrder: index, y: index }));
    });
  }
  function closeExpanded() {
    if (expandedType === "EVENT_BUILDER" && !window.dispatchEvent(new Event("proposal-workspace:close", { cancelable: true }))) return;
    if (expandedType === "CONTRACTORS" && !window.dispatchEvent(new Event("project-contractors:close", { cancelable: true }))) return;
    const closedType = expandedType;
    setExpandedType(returnToBoard ? "FREE_BOARD" : null);
    if (!returnToBoard && closedType) {
      requestAnimationFrame(() => document.getElementById(widgetId(closedType))?.querySelector<HTMLButtonElement>("[data-widget-expand]")?.focus({ preventScroll: true }));
    }
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
    const next = new Set(collapsedTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setCollapsedTypes(next);
    writeCollapsed(JSON.stringify(Array.from(next)));
  }

  const shownWidgets = layoutDraft ?? widgets;
  const visible = shownWidgets.filter((widget) => widget.isVisible).sort((a, b) => a.sortOrder - b.sortOrder);

  function goToWidget(event: React.MouseEvent<HTMLAnchorElement>, type: ProjectWidgetType) {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const id = widgetId(type);
    if (collapsedTypes.has(type) && !layoutDraft) toggleCollapsed(type);
    setActiveType(type);
    if (window.location.hash !== `#${id}`) window.history.pushState(null, "", `#${id}`);
    requestAnimationFrame(() => {
      const block = document.getElementById(id);
      block?.focus({ preventScroll: true });
      block?.scrollIntoView({ block: "start" });
    });
  }

  return (
    <div className="project-workspace-dashboard">
      <nav ref={indexRef} className="project-workspace-index" aria-label="Разделы карточки проекта">
        <div className="project-workspace-index__links">
        {visible.map((widget) => {
          const definition = PROJECT_WIDGET_REGISTRY.find((item) => item.type === widget.type)!;
          return (
            <a key={widget.type} href={`#${widgetId(widget.type)}`} aria-current={activeType === widget.type ? "location" : undefined} onClick={(event) => goToWidget(event, widget.type)}>
              <span>{definition.title}</span>
            </a>
          );
        })}
        </div>
        {onSaveLayout && revision !== undefined && !layoutDraft ? (
          <button type="button" aria-label="Изменить расположение" title="Изменить расположение" onClick={() => {
            if (!window.dispatchEvent(new Event("project-contractors:close", { cancelable: true }))) return;
            setLayoutRevision(revision);
            setLayoutDraft(widgets.map((item) => ({ ...item })));
            setLayoutError(null);
          }}>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="2" /><path d="M3 8h14M8 8v9" /></svg>
            <span>Изменить расположение</span>
          </button>
        ) : null}
      </nav>
      <div className="project-workspace-dashboard__main">
      {layoutDraft ? <div className="project-workspace-layout-bar"><div><strong>Расположение блоков</strong><span>Перетаскивайте блоки за значок. Ширину можно изменить рядом с названием.</span></div><div><button type="button" disabled={layoutBusy} onClick={() => { setLayoutDraft(null); setLayoutError(null); }}>Отменить</button><button type="button" disabled={layoutBusy} onClick={async () => { if (!onSaveLayout) return; setLayoutBusy(true); setLayoutError(null); try { await onSaveLayout(layoutDraft, layoutRevision); setLayoutDraft(null); } catch (cause) { setLayoutError(cause instanceof Error ? cause.message : "Не удалось сохранить расположение"); } finally { setLayoutBusy(false); } }}>{layoutBusy ? "Сохраняем…" : "Сохранить"}</button></div>{layoutError ? <p role="alert">{layoutError}</p> : null}</div> : null}
      <div ref={gridRef} className="project-workspace-grid grid grid-cols-1 items-start md:grid-cols-12" data-layout-editing={Boolean(layoutDraft) || undefined}>
        {shownWidgets.filter((widget) => widget.isVisible || widget.type === expandedType).sort((a, b) => a.sortOrder - b.sortOrder).map((widget) => (
          <WorkspaceWidget
            key={widget.type}
            widget={widget}
            collapsed={expandedType !== widget.type && collapsedTypes.has(widget.type)}
            expanded={expandedType === widget.type}
            onToggleCollapsed={() => toggleCollapsed(widget.type)}
            onToggleExpanded={() => {
              if (expandedType === widget.type) closeExpanded();
              else if (widget.type !== "CONTRACTORS" || window.dispatchEvent(new Event("project-contractors:close", { cancelable: true }))) setExpandedType(widget.type);
            }}
            onConfigure={() => window.dispatchEvent(new CustomEvent("project-workspace:configure"))}
            layout={layoutDraft ? { index: visible.findIndex((item) => item.type === widget.type), count: visible.length, dragging: dragged === widget.type, target: Boolean(dragged && dragged !== widget.type && dropTarget === widget.type), onDragStart: () => setDragged(widget.type), onDragEnter: () => { if (dragged !== widget.type) setDropTarget(widget.type); }, onDragEnd: () => { setDragged(null); setDropTarget(null); }, onDrop: () => { if (dragged) moveLayout(dragged, widget.type); setDragged(null); setDropTarget(null); }, onMove: (direction) => { const index = visible.findIndex((item) => item.type === widget.type); const target = visible[index + direction]; if (target) moveLayout(widget.type, target.type); }, onWidth: (width) => setLayoutDraft((current) => current?.map((item) => item.type === widget.type ? { ...item, width } : item) ?? null) } : undefined}
          >
            {renderWidget(widget.type, expandedType === widget.type, () => setExpandedType(widget.type))}
          </WorkspaceWidget>
        ))}
      </div>
      </div>
    </div>
  );
}
