import { redirect } from "next/navigation";

export default function WarehouseArchivePage() {
  redirect("/warehouse/queue?tab=archive");
}
