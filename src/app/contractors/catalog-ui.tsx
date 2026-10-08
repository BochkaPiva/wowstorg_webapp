"use client";

import Image from "next/image";
import React from "react";
import { priceFreshness, type ContractorPriceType } from "@/lib/contractor-offers";
import styles from "./contractors.module.css";

export type Category = { id: string; name: string };
export type Offer = { id: string; title: string; description: string | null; priceType: ContractorPriceType; clientPrice: number | null; clientPriceMax: number | null; internalCost?: number | null; currencyCode: string; unitLabel: string | null; priceConfirmedAt: string | null; validUntil: string | null; revision: number; category: Category };
export type ContractorCard = { id: string; name: string; shortDescription: string | null; city: string | null; photoUrl: string | null; offers: Offer[] };
export type ContractorDetail = ContractorCard & { websiteUrl: string | null; internalNotes: string | null; revision: number; photos: Array<{ id: string; url: string; caption: string | null }>; contacts: Array<{ id: string; personName: string | null; role: string | null; phone: string | null; email: string | null; telegram: string | null }> };

export function offerPrice(offer: Offer) {
  const money = (value: number | null) => value == null ? "По запросу" : new Intl.NumberFormat("ru-RU", { style: "currency", currency: offer.currencyCode || "RUB", maximumFractionDigits: 2 }).format(value);
  if (offer.priceType === "ON_REQUEST" || offer.clientPrice == null) return "По запросу";
  const base = money(offer.clientPrice);
  if (offer.priceType === "FROM") return `от ${base}`;
  if (offer.priceType === "RANGE" && offer.clientPriceMax != null) return `${base} — ${money(offer.clientPriceMax)}`;
  const unit = offer.unitLabel || ({ PER_PERSON: "человек", PER_HOUR: "час", PER_DAY: "день", PER_UNIT: "шт." } as Record<string, string>)[offer.priceType];
  return unit ? `${base} / ${unit}` : base;
}
export function freshnessCopy(offer: Offer) {
  if (offer.validUntil && new Date(offer.validUntil).getTime() < Date.now()) return "Срок цены истёк";
  return { FRESH: "Цена подтверждена", AGING: "Пора проверить цену", STALE: "Цена устарела", UNKNOWN: "Цена не подтверждена" }[priceFreshness(offer.priceConfirmedAt)];
}
export function seedHref(contractor: ContractorCard, offer: Offer) {
  return `/proposals?${new URLSearchParams({ new: "1", seedOfferId: offer.id, contractorId: contractor.id })}`;
}
export async function catalogRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message ?? "Не удалось выполнить действие. Попробуйте ещё раз.");
  return data as T;
}
export function ContractorPhoto({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <span className={styles.cardMonogram}>{name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("ru-RU")}</span>;
  return <Image className={styles.cardPhoto} src={src} alt={`Фотография подрядчика ${name}`} fill sizes="(max-width: 720px) 100vw, 420px" unoptimized onError={() => setFailed(true)} />;
}

export function CatalogIcon({ kind }: { kind: "close" | "open" }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === "close" ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M7 17L17 7M7 7h10v10" />}</svg>;
}
