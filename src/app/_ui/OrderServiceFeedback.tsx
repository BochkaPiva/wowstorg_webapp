"use client";

import * as React from "react";

import { readJsonSafe } from "@/lib/fetchJson";
import "./order-service-feedback.css";

export type ServiceFeedback = {
  id: string;
  orderId?: string;
  rating: number;
  comment: string | null;
  updatedAt: string;
};

type ApiError = { error?: { message?: string } };
type PendingOrder = {
  id: string;
  eventName: string | null;
  closedAt: string | null;
  endDate: string;
  customer: { name: string };
};

function Stars({ value, onChange, disabled = false }: { value: number; onChange: (rating: number) => void; disabled?: boolean }) {
  return (
    <div className="service-stars" role="radiogroup" aria-label="Оценка качества заявки">
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          role="radio"
          aria-checked={value === rating}
          aria-label={`${rating} ${rating === 1 ? "звезда" : rating < 5 ? "звезды" : "звёзд"}`}
          className={rating <= value ? "is-active" : undefined}
          disabled={disabled}
          onClick={() => onChange(rating)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function OrderFeedbackEditor({
  orderId,
  feedback,
  prompt = false,
  onSaved,
}: {
  orderId: string;
  feedback?: ServiceFeedback | null;
  prompt?: boolean;
  onSaved?: (feedback: ServiceFeedback) => void;
}) {
  const [open, setOpen] = React.useState(prompt);
  const [rating, setRating] = React.useState(feedback?.rating ?? 0);
  const [comment, setComment] = React.useState(feedback?.comment ?? "");
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    setRating(feedback?.rating ?? 0);
    setComment(feedback?.comment ?? "");
  }, [feedback]);

  async function submit() {
    if (rating < 1) {
      setMessage("Выберите от одной до пяти звёзд.");
      return;
    }
    if (rating <= 3 && comment.trim().length < 3) {
      setMessage("Расскажите, что можно улучшить — так мы сможем разобраться.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/greenwich/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SUBMIT", orderId, rating, comment: comment.trim() }),
      });
      const payload = await readJsonSafe<{ feedback?: ServiceFeedback } | ApiError>(response);
      if (!response.ok || !payload || !("feedback" in payload) || !payload.feedback) {
        throw new Error((payload as ApiError | null)?.error?.message ?? "Не удалось сохранить оценку");
      }
      setOpen(false);
      setMessage("Спасибо — оценка сохранена.");
      onSaved?.(payload.feedback);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Не удалось сохранить оценку");
    } finally {
      setSaving(false);
    }
  }

  if (!open && feedback) {
    return (
      <div className="service-feedbackSaved">
        <div>
          <span>Ваша оценка</span>
          <strong>{"★".repeat(feedback.rating)}<i>{"★".repeat(5 - feedback.rating)}</i></strong>
        </div>
        <button type="button" onClick={() => { setOpen(true); setMessage(null); }}>Изменить</button>
      </div>
    );
  }

  if (!open && !feedback) {
    return (
      <button type="button" className="service-feedbackOpen" onClick={() => { setOpen(true); setMessage(null); }}>
        <span aria-hidden>☆</span>
        Оценить работу Wowstorg
      </button>
    );
  }

  return (
    <div className={`service-feedbackEditor${prompt ? " is-prompt" : ""}`}>
      <Stars value={rating} onChange={(value) => { setRating(value); setMessage(null); }} disabled={saving} />
      {rating > 0 ? (
        <div className="service-feedbackEditor__details">
          <label>
            <span>{rating <= 3 ? "Что нам обязательно исправить?" : "Комментарий или пожелание"}</span>
            <textarea
              value={comment}
              maxLength={2000}
              rows={prompt ? 3 : 2}
              onChange={(event) => setComment(event.target.value)}
              placeholder={rating <= 3 ? "Опишите, что было не так" : "Можно оставить пустым"}
            />
          </label>
          <div className="service-feedbackEditor__actions">
            <button type="button" className="is-primary" disabled={saving} onClick={() => void submit()}>
              {saving ? "Сохраняем…" : feedback ? "Обновить оценку" : "Отправить оценку"}
            </button>
            {!prompt && feedback ? <button type="button" onClick={() => setOpen(false)}>Отмена</button> : null}
          </div>
        </div>
      ) : <p>Нажмите на звезду — комментарий можно добавить следующим шагом.</p>}
      {message ? <div className="service-feedbackEditor__message" role="status">{message}</div> : null}
    </div>
  );
}

export function PendingOrderFeedbackCard({ enabled }: { enabled: boolean }) {
  const [pending, setPending] = React.useState<PendingOrder | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [skipping, setSkipping] = React.useState(false);
  const [skipError, setSkipError] = React.useState<string | null>(null);
  const [completed, setCompleted] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    void fetch("/api/greenwich/feedback", { cache: "no-store" })
      .then((response) => readJsonSafe<{ pending?: PendingOrder | null }>(response))
      .then((payload) => { if (!cancelled) setPending(payload?.pending ?? null); })
      .catch(() => { if (!cancelled) setPending(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled]);

  async function skip() {
    if (!pending) return;
    setSkipping(true);
    setSkipError(null);
    try {
      const response = await fetch("/api/greenwich/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SKIP", orderId: pending.id }),
      });
      const payload = await readJsonSafe<{ skipped?: boolean } | ApiError>(response);
      if (!response.ok) throw new Error((payload as ApiError | null)?.error?.message ?? "Не удалось отложить оценку");
      setPending(null);
    } catch (cause) {
      setSkipError(cause instanceof Error ? cause.message : "Не удалось отложить оценку");
    } finally {
      setSkipping(false);
    }
  }

  if (!enabled || loading || (!pending && !completed)) return null;
  if (completed) {
    return (
      <section className="service-feedbackThanks" aria-live="polite">
        <strong>Спасибо за честную оценку</strong>
        <span>Она уже попала в отчёт качества Wowstorg.</span>
      </section>
    );
  }
  if (!pending) return null;

  return (
    <section className="service-feedbackPrompt">
      <div className="service-feedbackPrompt__copy">
        <span>Заявка закрыта</span>
        <h2>Как мы справились?</h2>
        <p>
          <strong>{pending.eventName || pending.customer.name}</strong>
          {pending.eventName && pending.eventName !== pending.customer.name ? <> · {pending.customer.name}</> : null}
        </p>
        <small>Оценка поможет Wowstorg понять, что работает хорошо, а что стоит исправить.</small>
      </div>
      <div className="service-feedbackPrompt__form">
        <OrderFeedbackEditor orderId={pending.id} prompt onSaved={() => setCompleted(true)} />
        <button type="button" className="service-feedbackSkip" disabled={skipping} onClick={() => void skip()}>
          {skipping ? "Убираем…" : "Не сейчас — оценить можно в архиве"}
        </button>
        {skipError ? <div className="service-feedbackEditor__message" role="alert">{skipError}</div> : null}
      </div>
    </section>
  );
}
