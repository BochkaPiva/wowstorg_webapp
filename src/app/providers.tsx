"use client";

import React from "react";

import { readJsonSafe } from "@/lib/fetchJson";

export type MeUser = {
  id: string;
  login: string;
  displayName: string;
  role: "GREENWICH" | "WOWSTORG";
};

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: MeUser };

const AuthContext = React.createContext<{
  state: AuthState;
  refresh: () => Promise<void>;
}>({
  state: { status: "loading" },
  refresh: async () => {},
});

export function useAuth() {
  return React.useContext(AuthContext);
}

async function fetchMe(): Promise<MeUser | null> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await readJsonSafe<{ user: MeUser | null }>(res)) ?? { user: null };
    return data.user;
  } catch {
    return null;
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>({ status: "loading" });

  const refresh = React.useCallback(async () => {
    setState({ status: "loading" });
    try {
      const user = await fetchMe();
      if (!user) setState({ status: "anonymous" });
      else setState({ status: "authenticated", user });
    } catch {
      setState({ status: "anonymous" });
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ state, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

