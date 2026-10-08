export class ProposalApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function proposalRequest<T>(url: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method, cache: "no-store", signal,
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ProposalApiError(data?.error?.message ?? "Не удалось загрузить данные. Попробуйте ещё раз.", response.status);
  if (!data) throw new Error("Сервер вернул пустой ответ. Обновите страницу.");
  return data as T;
}

/** A lost response is safe to retry only for immutable, UUID-backed mutation commands. */
export async function proposalCommandRequest<T>(url: string, command: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try { return await proposalRequest<T>(url, "POST", command, controller.signal); }
    catch (error) {
      if (attempt >= 2 || (error instanceof ProposalApiError && error.status < 500)) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 400 : 1200));
    }
    finally { clearTimeout(timeout); }
  }
}
