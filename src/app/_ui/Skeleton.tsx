import React from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={["ui-skeleton", className].join(" ")} aria-hidden="true" />;
}

export function LoadingRegion({
  children,
  label = "Загрузка данных",
  className = "",
}: {
  children: React.ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <div className={className} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function ListSkeleton({ rows = 5, className = "" }: { rows?: number; className?: string }) {
  return (
    <LoadingRegion className={["ui-listSkeleton", className].join(" ")}>
      {Array.from({ length: rows }, (_, index) => (
        <div className="ui-listSkeleton__row" key={index}>
          <Skeleton className="ui-listSkeleton__mark" />
          <div className="ui-listSkeleton__copy">
            <Skeleton className="ui-listSkeleton__title" />
            <Skeleton className="ui-listSkeleton__meta" />
          </div>
          <Skeleton className="ui-listSkeleton__data" />
          <Skeleton className="ui-listSkeleton__action" />
        </div>
      ))}
    </LoadingRegion>
  );
}

export function DashboardSkeleton() {
  return (
    <LoadingRegion className="ui-dashboardSkeleton" label="Загрузка дашборда">
      <div className="ui-dashboardSkeleton__summary">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index}>
            <Skeleton className="ui-dashboardSkeleton__label" />
            <Skeleton className="ui-dashboardSkeleton__value" />
          </div>
        ))}
      </div>
      <div className="ui-dashboardSkeleton__split">
        <div className="ui-dashboardSkeleton__panel">
          <Skeleton className="ui-dashboardSkeleton__heading" />
          <ListSkeleton rows={3} />
        </div>
        <div className="ui-dashboardSkeleton__panel">
          <Skeleton className="ui-dashboardSkeleton__heading" />
          <ListSkeleton rows={3} />
        </div>
      </div>
    </LoadingRegion>
  );
}

export function WorkQueueSkeleton() {
  return (
    <LoadingRegion className="ui-workQueueSkeleton" label="Загрузка рабочей очереди">
      <Skeleton className="ui-workQueueSkeleton__group" />
      {Array.from({ length: 4 }, (_, index) => (
        <div className="ui-workQueueSkeleton__card" key={index}>
          <Skeleton className="ui-workQueueSkeleton__logo" />
          <div className="ui-workQueueSkeleton__identity">
            <Skeleton className="ui-workQueueSkeleton__eyebrow" />
            <Skeleton className="ui-workQueueSkeleton__title" />
            <Skeleton className="ui-workQueueSkeleton__meta" />
          </div>
          <div className="ui-workQueueSkeleton__status">
            <Skeleton />
            <Skeleton />
          </div>
          <div className="ui-workQueueSkeleton__amount">
            <Skeleton />
            <Skeleton />
          </div>
          <Skeleton className="ui-workQueueSkeleton__action" />
        </div>
      ))}
    </LoadingRegion>
  );
}

export function ProjectDetailSkeleton() {
  return (
    <LoadingRegion className="ui-detailSkeleton" label="Загрузка проекта">
      <section className="ui-detailSkeleton__hero">
        <div>
          <Skeleton className="ui-detailSkeleton__eyebrow" />
          <Skeleton className="ui-detailSkeleton__title" />
          <div className="ui-detailSkeleton__chips">
            <Skeleton /><Skeleton /><Skeleton />
          </div>
          <div className="ui-detailSkeleton__facts">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index}><Skeleton /><Skeleton /></div>
            ))}
          </div>
        </div>
        <div className="ui-detailSkeleton__actions"><Skeleton /><Skeleton /></div>
      </section>
      <section className="ui-detailSkeleton__panel">
        <Skeleton className="ui-detailSkeleton__heading" />
        <div className="ui-detailSkeleton__board">
          {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} />)}
        </div>
      </section>
      <section className="ui-detailSkeleton__panel">
        <Skeleton className="ui-detailSkeleton__heading" />
        <ListSkeleton rows={3} />
      </section>
    </LoadingRegion>
  );
}

export function OrderDetailSkeleton({ embed = false }: { embed?: boolean }) {
  return (
    <LoadingRegion
      className={["ui-orderSkeleton", embed ? "ui-orderSkeleton--embed" : ""].join(" ")}
      label="Загрузка заявки"
    >
      <section className="ui-orderSkeleton__status">
        <Skeleton className="ui-orderSkeleton__badge" />
        <div className="ui-orderSkeleton__steps">
          {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} />)}
        </div>
      </section>
      <section className="ui-orderSkeleton__summary">
        <div>
          <Skeleton className="ui-orderSkeleton__title" />
          <Skeleton className="ui-orderSkeleton__line" />
          <Skeleton className="ui-orderSkeleton__line ui-orderSkeleton__line--short" />
        </div>
        <Skeleton className="ui-orderSkeleton__button" />
      </section>
      <div className="ui-orderSkeleton__columns">
        <section><Skeleton className="ui-orderSkeleton__heading" /><ListSkeleton rows={4} /></section>
        <section><Skeleton className="ui-orderSkeleton__heading" /><ListSkeleton rows={3} /></section>
      </div>
    </LoadingRegion>
  );
}

export function AppWorkspaceSkeleton() {
  return (
    <LoadingRegion className="ui-appSkeleton" label="Загрузка рабочего пространства">
      <aside className="ui-appSkeleton__sidebar">
        <div className="ui-appSkeleton__brand"><Skeleton /><div><Skeleton /><Skeleton /></div></div>
        <div className="ui-appSkeleton__nav">
          {Array.from({ length: 7 }, (_, index) => <Skeleton key={index} />)}
        </div>
      </aside>
      <div className="ui-appSkeleton__workspace">
        <header><Skeleton /><Skeleton /></header>
        <main><DashboardSkeleton /></main>
      </div>
    </LoadingRegion>
  );
}

export function BoardSkeleton() {
  return (
    <LoadingRegion className="ui-boardSkeleton" label="Загрузка доски задач">
      {Array.from({ length: 4 }, (_, columnIndex) => (
        <section key={columnIndex}>
          <div className="ui-boardSkeleton__head"><Skeleton /><Skeleton /></div>
          <div className="ui-boardSkeleton__cards">
            {Array.from({ length: columnIndex % 2 === 0 ? 3 : 2 }, (_, cardIndex) => (
              <div key={cardIndex}>
                <Skeleton className="ui-boardSkeleton__title" />
                <Skeleton className="ui-boardSkeleton__line" />
                <Skeleton className="ui-boardSkeleton__line ui-boardSkeleton__line--short" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </LoadingRegion>
  );
}
