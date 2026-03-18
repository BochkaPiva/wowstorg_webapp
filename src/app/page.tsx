"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/app/providers";

export default function Home() {
  const router = useRouter();
  const { state } = useAuth();

  useEffect(() => {
    if (state.status === "authenticated") router.replace("/home");
    if (state.status === "anonymous") router.replace("/login");
  }, [router, state.status]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans">
      <div className="text-sm text-zinc-600">Загрузка…</div>
    </div>
  );
}
