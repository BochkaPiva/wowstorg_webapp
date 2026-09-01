"use client";

import React from "react";

export function ProjectModuleSkeleton({ title = "Загрузка модуля" }: { title?: string }) {
  return (
    <div className="min-h-48 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm" aria-busy="true">
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
        <span className="text-sm font-black text-zinc-700">{title}</span>
        <span className="h-8 w-20 animate-pulse rounded-md bg-zinc-100" aria-hidden />
      </div>
      <div className="space-y-3 p-5" aria-hidden>
        <div className="h-4 w-2/5 animate-pulse rounded bg-zinc-100" />
        <div className="h-20 animate-pulse rounded-lg bg-zinc-100/80" />
        <div className="h-10 w-3/4 animate-pulse rounded-lg bg-zinc-100/80" />
      </div>
    </div>
  );
}

type BoundaryProps = {
  title: string;
  resetKey: string;
  children: React.ReactNode;
};

type BoundaryState = { failed: boolean };

export class ProjectModuleBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidUpdate(previous: BoundaryProps) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-zinc-900" role="alert">
        <div className="text-sm font-black">{this.props.title} временно не загрузился</div>
        <p className="mt-1 text-sm text-zinc-600">
          Остальная карточка проекта продолжает работать. Можно повторить загрузку только этого блока.
        </p>
        <button
          type="button"
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-bold text-white transition-colors hover:bg-violet-700"
          onClick={() => this.setState({ failed: false })}
        >
          Повторить
        </button>
      </div>
    );
  }
}
