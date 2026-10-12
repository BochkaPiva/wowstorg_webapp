"use client";

import { useCallback, useSyncExternalStore } from "react";

const LOCAL_CHANGE = "wowstorg:local-storage-change";
// Browser-only fallback when storage is blocked/full. Never read during SSR.
const unavailableStorage = new Map<string, string | null>();
const serverSnapshot = () => null;

/** Primitive snapshots keep SSR/hydration consistent; writers notify this tab too.
 * For non-sensitive local preferences only, never auth tokens/server data.
 */
export function useLocalStorageText(key: string | null) {
  const getSnapshot = useCallback(() => {
    if (!key || typeof window === "undefined") return null;
    if (unavailableStorage.has(key)) return unavailableStorage.get(key) ?? null;
    try { return window.localStorage.getItem(key); }
    catch { return null; }
  }, [key]);

  const subscribe = useCallback((notify: () => void) => {
    if (!key) return () => {};
    const external = (event: StorageEvent) => {
      if (event.key !== null && event.key !== key) return;
      unavailableStorage.delete(key);
      notify();
    };
    const local = (event: Event) => {
      if ((event as CustomEvent<{ key: string }>).detail?.key === key) notify();
    };
    window.addEventListener("storage", external);
    window.addEventListener(LOCAL_CHANGE, local);
    return () => { window.removeEventListener("storage", external); window.removeEventListener(LOCAL_CHANGE, local); };
  }, [key]);

  const value = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const write = useCallback((next: string | null) => {
    if (!key || typeof window === "undefined") return;
    try {
      if (next === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, next);
      unavailableStorage.delete(key);
    } catch { unavailableStorage.set(key, next); }
    window.dispatchEvent(new CustomEvent(LOCAL_CHANGE, { detail: { key } }));
  }, [key]);
  return [value, write] as const;
}
