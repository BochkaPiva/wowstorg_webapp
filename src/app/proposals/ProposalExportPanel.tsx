"use client";

import React from "react";
import { proposalRequest } from "./api";
import base from "./proposals.module.css";
import styles from "./workspace.module.css";

export function ProposalExportPanel({ proposalId, revision, variantId, variantTitle, disabled }: {
  proposalId: string; revision: number; variantId: string; variantTitle: string; disabled: boolean;
}) {
  const [working, setWorking] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");
  const request = React.useRef<{ revision: number; variantId: string; exportId: string } | null>(null);
  const running = React.useRef(false);
  async function download(format: "pdf" | "pptx") {
    if (disabled || running.current) return;
    running.current = true; setWorking(true); setError(""); setMessage("Готовим файл. Можно продолжать работу с КП.");
    if (!request.current || request.current.revision !== revision || request.current.variantId !== variantId) {
      request.current = { revision, variantId, exportId: crypto.randomUUID() };
    }
    const saved = request.current;
    try {
      const result = await proposalRequest<{ snapshotId: string; version: number }>(`/api/proposals/${proposalId}/exports`, "POST", {
        expectedRevision: saved.revision, variantId: saved.variantId, exportId: saved.exportId,
      }, AbortSignal.timeout(65_000));
      const response = await fetch(`/api/proposals/${proposalId}/exports/${result.snapshotId}?format=${format}`, { cache: "no-store", signal: AbortSignal.timeout(65_000) });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Не удалось подготовить файл. Попробуйте ещё раз.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `КП-${variantTitle.replace(/[<>:"/\\|?*]/g, "-")}-v${result.version}.${format}`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage(`Файл готов · версия ${result.version}`);
    } catch (cause) {
      setMessage("");
      setError(cause instanceof Error && ["TimeoutError", "AbortError"].includes(cause.name)
        ? "Подготовка заняла слишком долго. Повторите скачивание — сохранённая версия не будет создана второй раз."
        : cause instanceof Error ? cause.message : "Не удалось скачать КП");
    }
    finally { running.current = false; setWorking(false); }
  }
  return <div className={styles.form}>
    <p className={styles.context}>Вариант «{variantTitle}». Фото, описания, клиентские цены и комментарии. Внутренние расходы и заметки в файл не попадут.</p>
    <button className={base.primary} disabled={disabled || working} onClick={() => void download("pdf")}>Скачать PDF</button>
    <button className={base.secondary} disabled={disabled || working} onClick={() => void download("pptx")}>Скачать PowerPoint</button>
    <p className={styles.context}>Фирменный макет ВАУСТОРГ. Неуказанные цены останутся «По запросу», альтернативы и опции — отдельно от основного бюджета.</p>
    <p className={styles.context}>В PDF Oks Free встроен. Для редактирования PowerPoint установите Oks Free на компьютере — иначе шрифт может замениться.</p>
    {message ? <p className={styles.context} role="status">{message}</p> : null}
    {error ? <p className={base.error} role="alert">{error}</p> : null}
  </div>;
}
