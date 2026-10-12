"use client";

import React from "react";

import { useJsonResource } from "@/lib/use-json-resource";

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

export function Providers({ children }: { children: React.ReactNode }) {
  const { data, loading, refresh } = useJsonResource<{ user: MeUser | null }>("/api/auth/me", "Не удалось проверить сессию");
  const state: AuthState = loading
    ? { status: "loading" }
    : data?.user
      ? { status: "authenticated", user: data.user }
      : { status: "anonymous" };

  return (
    <AuthContext.Provider value={{ state, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

