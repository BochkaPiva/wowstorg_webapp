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
