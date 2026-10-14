"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";
import { PositionEditor } from "../PositionEditor";
import styles from "../position-workspace.module.css";
import "../../inventory.css";

export default function NewPositionPage() {
  const { state } = useAuth();
  const router = useRouter();
  return <AppShell title="Инвентарь · Новая позиция">{state.status === "authenticated" ? state.user.role === "WOWSTORG" ? <div className={`inventory-workspace ${styles.standalone}`}><PositionEditor key={state.user.id} onCancel={() => router.push("/inventory/positions")} onSaved={() => router.push("/inventory/positions")} /></div> : <p>Этот раздел доступен только Wowstorg (склад).</p> : null}</AppShell>;
}
