"use client";

import { useRouter } from "next/navigation";
import React from "react";

export default function CheckoutPage() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace("/cart");
  }, [router]);
  return (
    <div className="min-h-[40vh] flex items-center justify-center text-zinc-600 text-sm">
      Перенаправление в корзину…
    </div>
  );
}

