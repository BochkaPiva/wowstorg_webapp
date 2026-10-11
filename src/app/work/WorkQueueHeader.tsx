"use client";

import Image from "next/image";
import Link from "next/link";
import { WorkEntityIcon } from "@/app/_ui/WorkEntityIcon";
import type { WorkCreateKind } from "@/lib/work-create";

export function WorkQueueHeader({ onCreate }: { onCreate: (kind: WorkCreateKind) => void }) {
  return <header className="work-launch">
    <div className="work-launch__content">
      <h2>От идеи — к мероприятию</h2>
      <p>Начните с предложения клиенту, расчёта или нового проекта.</p>
      <div className="work-launch__actions" aria-label="Начать новую работу">
        <div><button className="work-launch__button work-launch__button--primary" onClick={() => onCreate("proposal")}><WorkEntityIcon kind="PROPOSAL" />Составить КП</button><span>Программа и презентация</span></div>
        <div><button className="work-launch__button" onClick={() => onCreate("estimate")}><WorkEntityIcon kind="ESTIMATE" />Составить смету</button><span>Расчёт без проекта</span></div>
        <div><button className="work-launch__button" onClick={() => onCreate("project")}><WorkEntityIcon kind="PROJECT" />Начать проект</button><span>Команда и выполнение</span></div>
      </div>
      <nav className="work-launch__links" aria-label="Рабочие разделы"><Link href="/proposals">Все КП</Link><Link href="/projects">Все проекты</Link><Link href="/contractors">Подрядчики</Link></nav>
    </div>
    <div className="work-launch__art" aria-hidden="true"><Image src="/brand/dino-catalog.webp" alt="" width={180} height={355} sizes="180px" /></div>
  </header>;
}
