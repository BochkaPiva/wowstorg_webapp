"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readJsonSafe } from "./fetchJson";

type Result<T> = { key: string | null; data: T | null; error: string | null };

/** GET-only resource. A null URL disables it; refresh is an explicit user action.
 * Initial/key-change loading is derived, not set by an effect. Only the latest
 * request may publish a result, including transports that ignore AbortSignal.
 */
export function useJsonResource<T>(url: string | null, errorMessage: string) {
  const [result, setResult] = useState<Result<T> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [source, setSource] = useState(url);
  const flight = useRef(0);
  const activeUrl = useRef<string | null>(null);

  if (source !== url) {
    setSource(url);
    setResult(null);
    setRefreshing(false);
  }

  const request = useCallback((signal?: AbortSignal) => {
    if (!url || activeUrl.current !== url) return Promise.resolve();
    const version = ++flight.current;
    const current = () => !signal?.aborted && version === flight.current;
    return fetch(url, { cache: "no-store", signal })
      .then(async (response) => {
        const payload = await readJsonSafe<T & { error?: { message?: string } }>(response);
        if (!response.ok || payload == null) throw new Error(payload?.error?.message ?? errorMessage);
        return payload;
      })
      .then((payload) => { if (current()) setResult({ key: url, data: payload, error: null }); })
      .catch((cause: unknown) => {
        if (current()) setResult({ key: url, data: null, error: cause instanceof Error ? cause.message : errorMessage });
      })
      .finally(() => { if (current()) setRefreshing(false); });
  }, [url, errorMessage]);

  useEffect(() => {
    const controller = new AbortController();
    activeUrl.current = url;
    void request(controller.signal);
    return () => {
      controller.abort();
      flight.current += 1;
      activeUrl.current = null;
    };
  }, [request, url]);

  const refresh = useCallback(async () => {
    if (!url || activeUrl.current !== url) return;
    setRefreshing(true);
    await request();
  }, [url, request]);

  const matching = result?.key === url ? result : null;
  return {
    data: url ? matching?.data ?? null : null,
    error: refreshing ? null : matching?.error ?? null,
    loading: Boolean(url) && (!matching || refreshing),
    refresh,
  };
}
