"use client";

import React from "react";

import { CartRelatedSuggestions } from "@/app/cart/CartRelatedSuggestions";
import { ClientErrorBoundary } from "@/app/_ui/ClientErrorBoundary";

type Props = React.ComponentProps<typeof CartRelatedSuggestions>;

export function CatalogRelatedBlock(props: Props) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <ClientErrorBoundary fallback={null}>
      <CartRelatedSuggestions {...props} variant="catalog" />
    </ClientErrorBoundary>
  );
}
