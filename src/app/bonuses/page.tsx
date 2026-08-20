"use client";

import Image from "next/image";
import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { ListSkeleton } from "@/app/_ui/Skeleton";
import { useAuth } from "@/app/providers";
import "./bonuses.css";

type OrderRef = {
  id: string;
  eventName: string | null;
  customer: { name: string };
};

type MonthlyBonus = {
  id: string;
  code: string;
  discountPercent: number;
  status: "ACTIVE" | "REDEEMED" | "EXPIRED";
  earnedMonth: string;
  validFrom: string;
  validUntil: string;
  awardedAt: string;
  redeemedAt: string | null;
  restoredAt: string | null;
  redeemedOrder: OrderRef | null;
};

type HistoryEntry =
  | {
      kind: "BONUS";
      id: string;
      type: "AWARDED" | "REDEEMED" | "RESTORED" | "EXPIRED";
      title: string;
      createdAt: string;
      discountPercent: number;
      code: string;
      order: OrderRef | null;
    }
  | {
      kind: "RATING";
      id: string;
      type: string;
      title: string;
      createdAt: string;
      delta: number;
      originalDelta: number;
      recoveryEndsAt: string | null;
    };

type BonusesData = {
  rating: {
    score: number;
    tierName: string;
    tierDiscountPercent: number;
    monthPosition: number | null;
    monthDelta: number;
    activeParticipants: number;
  };
  activeBonuses: MonthlyBonus[];
  bonuses: MonthlyBonus[];
  history: HistoryEntry[];
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Asia/Omsk",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Asia/Omsk",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function orderTitle(order: OrderRef): string {
  return order.eventName?.trim() || order.customer.name;
}

function bonusStatusLabel(status: MonthlyBonus["status"]): string {
  if (status === "ACTIVE") return "Можно применить";
  if (status === "REDEEMED") return "Использован";
  return "Срок завершён";
}

export default function BonusesPage() {
  const { state } = useAuth();
  const isGrinvich = state.status === "authenticated" && state.user.role === "GREENWICH";
  const [data, setData] = React.useState<BonusesData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const primaryBonus = data?.activeBonuses[0] ?? null;

  React.useEffect(() => {
    if (!isGrinvich) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetch("/api/greenwich/bonuses", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const json = (await response.json().catch(() => null)) as BonusesData | { error?: { message?: string } } | null;
        if (!response.ok || !json || !("rating" in json)) {
          throw new Error(json && "error" in json ? json.error?.message : "Не удалось загрузить бонусы");
        }
        setData(json);
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить бонусы");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [isGrinvich]);

  async function copyCode() {
    if (!primaryBonus) return;
    await navigator.clipboard.writeText(primaryBonus.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <AppShell title="Мои бонусы">
      <div className="bonus-page">
        {!isGrinvich ? (
          <div className="bonus-state bonus-state--warning">Раздел доступен только сотрудникам Grinvich.</div>
        ) : loading ? (
          <ListSkeleton rows={6} />
        ) : error ? (
          <div className="bonus-state bonus-state--error">{error}</div>
        ) : data ? (
          <>
            <section className="bonus-hero" aria-labelledby="bonus-title">
              <div className="bonus-hero__copy">
                <p className="bonus-kicker">Награда лидеру месяца</p>
                <h1 id="bonus-title">Хорошая работа возвращается бонусом.</h1>
                <p className="bonus-hero__lead">
                  Первое место по активности получает персональную скидку 5–20% на одну заявку следующего месяца.
                </p>
                <div className="bonus-hero__stats">
                  <div><span>Рейтинг</span><strong>{data.rating.score}</strong></div>
                  <div><span>Позиция месяца</span><strong>{data.rating.monthPosition ? `№ ${data.rating.monthPosition}` : "—"}</strong></div>
                  <div><span>Динамика</span><strong>{data.rating.monthDelta > 0 ? "+" : ""}{data.rating.monthDelta}</strong></div>
                </div>
              </div>
              <div className="bonus-hero__art" aria-hidden="true">
                <span className="bonus-orbit" />
                <Image
                  src="/brand/dino-rating-star-cutout.png"
                  alt=""
                  fill
                  priority
                  sizes="(max-width: 760px) 220px, 390px"
                  className="bonus-dino"
                />
              </div>
            </section>

            <div className="bonus-grid">
              <section className="bonus-pass" data-active={primaryBonus ? "true" : undefined}>
                <div className="bonus-pass__topline">
                  <span>{primaryBonus ? `Активные бонусы · ${data.activeBonuses.length}` : "Бонус пока не открыт"}</span>
                  <span>GRINVICH · WOWSTORG</span>
                </div>
                {primaryBonus ? (
                  <>
                    <div className="bonus-pass__value"><span>+</span>{primaryBonus.discountPercent}<small>%</small></div>
                    <p>Добавится к скидке вашего уровня, если это выгоднее персонального предложения.</p>
                    <div className="bonus-codeRow">
                      <code>{primaryBonus.code}</code>
                      <button type="button" onClick={() => void copyCode()}>{copied ? "Скопировано" : "Копировать"}</button>
                    </div>
                    {data.activeBonuses.length > 1 ? (
                      <div className="bonus-pass__more">
                        {data.activeBonuses.slice(1).map((bonus) => (
                          <span key={bonus.id}><strong>+{bonus.discountPercent}%</strong><code>{bonus.code}</code><small>до {dateFormatter.format(new Date(bonus.validUntil))}</small></span>
                        ))}
                      </div>
                    ) : null}
                    <div className="bonus-pass__footer">
                      <span>До {dateFormatter.format(new Date(primaryBonus.validUntil))}</span>
                      <Link href="/cart">Применить в корзине →</Link>
                    </div>
                  </>
                ) : (
                  <div className="bonus-pass__empty">
                    <strong>Следующая награда — за первое место.</strong>
                    <p>Позиция определяется по реальным действиям за месяц, а не по накопленному рейтингу.</p>
                    <Link href="/home">Посмотреть рейтинг →</Link>
                  </div>
                )}
              </section>

              <aside className="bonus-rules">
                <p className="bonus-kicker">Как это работает</p>
                <ol>
                  <li><span>01</span><p><strong>Станьте лидером.</strong> Учитываются действия внутри текущего месяца.</p></li>
                  <li><span>02</span><p><strong>Получите 5–20%.</strong> Бонус начисляется автоматически в новом месяце.</p></li>
                  <li><span>03</span><p><strong>Выберите в корзине.</strong> Он действует на одну самостоятельную заявку.</p></li>
                </ol>
                <p className="bonus-rules__note">Если заявка отменена до выдачи, бонус вернётся автоматически и получит минимум 7 дней на повторное использование.</p>
              </aside>
            </div>

            <section className="bonus-ledger">
              <div className="bonus-sectionHead">
                <div><p className="bonus-kicker">Прозрачная история</p><h2>Начисления и изменения рейтинга</h2></div>
                <span>{data.history.length} событий</span>
              </div>
              {data.history.length === 0 ? (
                <p className="bonus-ledger__empty">Здесь появятся первые изменения рейтинга и бонусы.</p>
              ) : (
                <ol className="bonus-history">
                  {data.history.map((entry) => (
                    <li key={`${entry.kind}-${entry.id}`}>
                      <span className={`bonus-history__mark bonus-history__mark--${entry.kind.toLowerCase()}`} aria-hidden="true" />
                      <div className="bonus-history__body">
                        <div><strong>{entry.title}</strong><time>{dateTimeFormatter.format(new Date(entry.createdAt))}</time></div>
                        {entry.kind === "BONUS" ? (
                          <p>Промокод {entry.code}{entry.order ? <> · <Link href={`/orders/${entry.order.id}`}>{orderTitle(entry.order)}</Link></> : null}</p>
                        ) : entry.recoveryEndsAt ? (
                          <p>Восстановление завершится {dateFormatter.format(new Date(entry.recoveryEndsAt))}</p>
                        ) : null}
                      </div>
                      <span className={`bonus-history__delta ${entry.kind === "RATING" && entry.delta < 0 ? "is-negative" : ""}`}>
                        {entry.kind === "BONUS" ? `+${entry.discountPercent}%` : `${entry.delta > 0 ? "+" : ""}${entry.delta}`}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {data.bonuses.length > 0 ? (
              <section className="bonus-archive">
                <div className="bonus-sectionHead"><div><p className="bonus-kicker">Архив</p><h2>Все промокоды</h2></div></div>
                <div className="bonus-archive__grid">
                  {data.bonuses.map((bonus) => (
                    <article key={bonus.id}>
                      <span>{bonusStatusLabel(bonus.status)}</span>
                      <strong>+{bonus.discountPercent}%</strong>
                      <code>{bonus.code}</code>
                      <small>до {dateFormatter.format(new Date(bonus.validUntil))}</small>
                      {bonus.redeemedOrder ? <Link href={`/orders/${bonus.redeemedOrder.id}`}>{orderTitle(bonus.redeemedOrder)} →</Link> : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
