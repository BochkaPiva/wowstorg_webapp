"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readJsonSafe } from "./fetchJson";

type Result<T> = { key: string | null; data: T | null; error: string | null };

/** Read-only resource. A null key disables it; refresh is an explicit user action.
 * Initial/key-change loading is derived, not set by an effect. Only the latest
 * request may publish a result, including transports that ignore AbortSignal.
 * Keep the reader stable with useCallback; key must identify its input scope.
 */
export function useReadResource<T>(url: string | null, reader: (signal?: AbortSignal) => Promise<T>, errorMessage: string) {
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
    let response: Promise<T>;
    try { response = reader(signal); }
    catch (cause) { response = Promise.reject(cause); }
    return response
      .then((payload) => { if (current()) setResult({ key: url, data: payload, error: null }); })
      .catch((cause: unknown) => {
        if (current()) setResult({ key: url, data: null, error: cause instanceof Error ? cause.message : errorMessage });
      })
      .finally(() => { if (current()) setRefreshing(false); });
  }, [url, reader, errorMessage]);

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

/** HTTP GET adapter; preserves both standard jsonError and legacy string errors. */
export function useJsonResource<T>(url: string | null, errorMessage: string) {
  const reader = useCallback(async (signal?: AbortSignal): Promise<T> => {
    if (!url) throw new Error(errorMessage);
    const response = await fetch(url, { cache: "no-store", signal });
    const payload = await readJsonSafe<T & { error?: string | { message?: string } }>(response);
    const message = typeof payload?.error === "string" ? payload.error : payload?.error?.message;
    if (!response.ok || payload == null) throw new Error(message ?? errorMessage);
    return payload;
  }, [url, errorMessage]);
  return useReadResource(url, reader, errorMessage);
}
