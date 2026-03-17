"use client";

import { useRouter } from "next/navigation";
import React from "react";

import { useAuth } from "@/app/providers";

export default function LoginPage() {
  const router = useRouter();
  const { state, refresh } = useAuth();

  const [login, setLogin] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (state.status === "authenticated") router.replace("/catalog");
  }, [router, state.status]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(data?.error?.message ?? "Не удалось войти");
        return;
      }
      await refresh();
      router.replace("/catalog");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <div className="text-xl font-semibold tracking-tight">Wowstorg</div>
          <div className="text-sm text-zinc-600">Вход в систему склада</div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <div className="text-sm font-medium text-zinc-800">Логин</div>
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-900/10"
              autoComplete="username"
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium text-zinc-800">Пароль</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-900/10"
              autoComplete="current-password"
            />
          </label>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          <button
            disabled={loading}
            className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            type="submit"
          >
            {loading ? "Входим…" : "Войти"}
          </button>
        </form>

        <div className="mt-4 text-xs text-zinc-500">
          Аккаунты создаются администратором, саморегистрации нет.
        </div>
      </div>
    </div>
  );
}

