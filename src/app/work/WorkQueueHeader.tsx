"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { SectionHeader } from "@/app/_ui/SectionHeader";
import { WorkEntityIcon } from "@/app/_ui/WorkEntityIcon";
import type { WorkCreateKind } from "@/lib/work-create";

export function WorkQueueHeader({ onCreate, tabs, metrics }: { onCreate: (kind: WorkCreateKind) => void; tabs?: ReactNode; metrics?: Array<{ label: string; value: ReactNode }> }) {
  return <SectionHeader title="Рабочая очередь" description="От первого предложения до готового мероприятия. Начните новую работу или продолжите текущую." mascot="work" metrics={metrics} tabs={tabs} actions={<>
    <button type="button" onClick={() => onCreate("proposal")}><WorkEntityIcon kind="PROPOSAL" />Составить КП</button>
    <button type="button" onClick={() => onCreate("estimate")}><WorkEntityIcon kind="ESTIMATE" />Составить смету</button>
    <button type="button" onClick={() => onCreate("project")}><WorkEntityIcon kind="PROJECT" />Начать проект</button>
  </>} links={<><Link href="/proposals">Все КП</Link><Link href="/projects">Все проекты</Link><Link href="/contractors">Подрядчики</Link></>} />;
}
