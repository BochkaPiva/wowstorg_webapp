"use client";

import Link from "next/link";
import React from "react";
import { createPortal } from "react-dom";

import { CatalogRentalPeriodPicker } from "@/app/catalog/CatalogRentalPeriodPicker";
import { usableStockUnits } from "@/lib/inventory-stock";
import { ORDER_TAX_RATE } from "@/lib/constants";
import {
  calcOrderServicesInternalCosts,
  isCashPaymentMethod,
  type OrderServicePaymentMethod,
} from "@/lib/order-service-internal-costs";
import { billableRentalDaysFromDateOnly, type RentalPartOfDay } from "@/lib/rental-days";
import {
  normalizedLocalLineCostClientNumber,
  normalizedLocalLineCostClientString,
  parseEstimateQtyUp,
} from "@/lib/project-estimate-local-line";
import {
  calcProjectEstimateRequisiteTotal,
  calcProjectEstimateRequisiteUnitPricePerDay,
  normalizeProjectEstimateDays,
} from "@/lib/project-estimate-requisite";
import {
  calcProjectEstimateTotals,
  PROJECT_ESTIMATE_COMMISSION_RATE,
  PROJECT_ESTIMATE_TAX_RATE,
  getNumericAmount,
} from "@/lib/project-estimate-totals";
import { formatMoneyRub, roundMoney } from "@/lib/money";

type EstLine = {
  id: string;
  position: number;
  lineNumber: number;
  name: string;
  description: string | null;
  lineType: string;
  costClient: string | null;
  costInternal: string | null;
  orderLineId: string | null;
  itemId: string | null;
  unit?: string | null;
  unitPriceClient?: number | null;
  qty?: number | null;
  plannedDays?: number | null;
  pricePerDaySnapshot?: number | null;
  maxQtyPhysical?: number | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  contractorNote?: string | null;
  contractorRequisites?: string | null;
};

type RequisiteOrderLine = {
  id: string;
  itemId: string;
  requestedQty: number;
  approvedQty: number | null;
  issuedQty: number | null;
  pricePerDaySnapshot: number | null;
  warehouseComment: string | null;
  item: {
    id: string;
    name: string;
    type: string;
    total: number;
    inRepair: number;
    broken: number;
    missing: number;
  };
};

type RequisiteOrder = {
  id: string;
  status: string;
  source: string;
  readyByDate: string;
  startDate: string;
  endDate: string;
  rentalStartPartOfDay?: RentalPartOfDay;
  rentalEndPartOfDay?: RentalPartOfDay;
  eventName: string | null;
  comment: string | null;
  deliveryEnabled: boolean;
  deliveryComment: string | null;
  deliveryPrice: number | null;
  deliveryInternalCost: number | null;
  deliveryInternalPaymentMethod?: OrderServicePaymentMethod;
  montageEnabled: boolean;
  montageComment: string | null;
  montagePrice: number | null;
  montageInternalCost: number | null;
  montageInternalPaymentMethod?: OrderServicePaymentMethod;
  demontageEnabled: boolean;
  demontageComment: string | null;
  demontagePrice: number | null;
  demontageInternalCost: number | null;
  demontageInternalPaymentMethod?: OrderServicePaymentMethod;
  payMultiplier?: number | null;
  lines: RequisiteOrderLine[];
};

type EstSection = {
  id: string;
  sortOrder: number;
  title: string;
  kind: "LOCAL" | "REQUISITE" | "CONTRACTOR" | "DRAFT_REQUISITE";
  linkedOrderId: string | null;
  linkedDraftOrderId?: string | null;
  lineLocalExtras?: Record<string, { unit?: string | null }> | null;
  lines: EstLine[];
};

type LocalDraftLine = {
  id: string;
  position: number;
  lineNumber: number;
  name: string;
  description: string | null;
  lineType: string;
  costClient: string | null;
  costInternal: string | null;
  unit: string | null;
  qty: string | null;
  unitPriceClient: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  contractorNote: string | null;
  contractorRequisites: string | null;
  orderLineId: null;
  itemId: null;
};

type LocalDraftSection = {
  id: string;
  sortOrder: number;
  title: string;
  kind: "LOCAL" | "CONTRACTOR";
  linkedOrderId: null;
  lines: LocalDraftLine[];
};

type StoredEstimateDraft = {
  schemaVersion: number;
  versionNumber: number;
  sections: LocalDraftSection[];
  commissionEnabled?: boolean;
  clientTaxEnabled?: boolean;
};

type VersionMeta = {
  id: string;
  versionNumber: number;
  title: string;
  note: string | null;
  isPrimary: boolean;
  sortOrder: number;
  includeInProjectTotals: boolean;
  createdAt: string;
  createdBy: { displayName: string };
};

type EstimatePayload = {
  projectTitle: string;
  projectOrders?: Array<{
    id: string;
    status: string;
    eventName: string | null;
    startDate: string;
    endDate: string;
    assignedEstimate: { id: string; versionNumber: number; title: string } | null;
  }>;
  versions: VersionMeta[];
  current: {
    id: string;
    versionNumber: number;
    title: string;
    note: string | null;
    sortOrder: number;
    includeInProjectTotals: boolean;
    createdAt: string;
    commissionEnabled: boolean;
    clientTaxEnabled: boolean;
    sections: EstSection[];
  } | null;
};

/** Р•РґРёРЅС‹Р№ СЃС‚РёР»СЊ СЃ ProjectSchedulePanel Рё РѕСЃС‚Р°Р»СЊРЅС‹РјРё Р±Р»РѕРєР°РјРё РїСЂРѕРµРєС‚Р° */
const inputField =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/50";
const btnPrimary =
  "rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50";
const btnSecondary =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50";
const btnSecondaryXs =
  "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50";
const btnGhostXs =
  "inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-50";
const inputFieldCompact =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/50";
const menuPanel =
  "absolute right-0 top-full z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-zinc-200 bg-white p-1 shadow-[0_18px_48px_rgba(24,24,27,0.14)]";
const menuAction =
  "flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm text-zinc-800 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50";
const sectionTone = {
  requisite: "border-violet-200 bg-[linear-gradient(180deg,rgba(245,243,255,0.9),rgba(255,255,255,0.98))]",
  draftRequisite: "border-fuchsia-200 bg-[linear-gradient(180deg,rgba(253,244,255,0.94),rgba(255,255,255,0.98))]",
  local: "border-violet-100 bg-[linear-gradient(180deg,rgba(250,245,255,0.9),rgba(255,255,255,1))]",
  contractor: "border-zinc-300 bg-[linear-gradient(180deg,rgba(24,24,27,0.045),rgba(255,255,255,1))]",
};
const EDITABLE_ORDER_STATUSES = ["SUBMITTED", "ESTIMATE_SENT", "CHANGES_REQUESTED", "APPROVED_BY_GREENWICH"] as const;

function isEditableOrderStatus(status: string) {
  return EDITABLE_ORDER_STATUSES.includes(status as (typeof EDITABLE_ORDER_STATUSES)[number]);
}

function formatOrderMoney(n: number) {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

/** РџСѓСЃС‚Р°СЏ СЃС‚СЂРѕРєР° в†’ null; РёРЅР°С‡Рµ С‡РёСЃР»Рѕ в‰Ґ 0 РёР»Рё null РїСЂРё РЅРµРІР°Р»РёРґРЅРѕРј РІРІРѕРґРµ. */
function parseMoneyInputOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "РќРѕРІР°СЏ",
  ESTIMATE_SENT: "РЎРјРµС‚Р° РѕС‚РїСЂР°РІР»РµРЅР°",
  CHANGES_REQUESTED: "РР·РјРµРЅРµРЅРёСЏ",
  APPROVED_BY_GREENWICH: "РЎРѕРіР»Р°СЃРѕРІР°РЅР°",
  PICKING: "РЎР±РѕСЂРєР°",
  ISSUED: "Р’С‹РґР°РЅР°",
  RETURN_DECLARED: "РћР¶РёРґР°РµС‚ РїСЂРёРµРјРєРё",
  CLOSED: "Р—Р°РєСЂС‹С‚Р°",
  CANCELLED: "РћС‚РјРµРЅРµРЅР°",
};

function orderStatusLabel(status: string) {
  return ORDER_STATUS_LABEL[status] ?? status;
}

function formatDateRu(dateOnly: string | null | undefined) {
  if (!dateOnly) return "вЂ”";
  const [y, m, d] = dateOnly.split("-").map((v) => Number(v));
  if (!y || !m || !d) return dateOnly;
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

/** РљР°Рє `HelpLegend` РЅР° СЃС‚СЂР°РЅРёС†Рµ РїСЂРѕРµРєС‚Р° вЂ” Р»РµРіРµРЅРґР° РїРѕ РЅР°РІРµРґРµРЅРёСЋ РЅР° В«?В». */
function EstimateFinanceToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex min-w-0 items-center gap-2 text-zinc-600">
      <span className="truncate">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
          checked
            ? "border-violet-400 bg-violet-600"
            : "border-zinc-300 bg-zinc-200"
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </label>
  );
}

function EstimateHelpLegend({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-sm font-black text-violet-700 shadow-sm hover:bg-violet-100"
        aria-label={title}
      >
        !
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-2xl border border-zinc-200 bg-white p-3 text-xs text-zinc-700 shadow-xl sm:left-auto sm:right-0">
          <div className="font-semibold text-zinc-950">{title}</div>
          <div className="mt-2">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

function draftEstimateStorageKey(projectId: string, versionNumber: number) {
  return `project-estimate-draft:${projectId}:v${versionNumber}`;
}

const ESTIMATE_DRAFT_SCHEMA_VERSION = 4;

function makeTempId(prefix: string) {
  return `draft-${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Р”Р°С‚Р° YYYY-MM-DD РїРѕ UTC (РґР»СЏ РїРѕР»РµР№ materialize demo-Р·Р°СЏРІРєРё). */
function draftMaterializeTodayISO() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function formatRuDateFromISO(dateOnly: string) {
  const [y, m, d] = dateOnly.split("-").map((v) => Number(v));
  if (!y || !m || !d) return dateOnly;
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

type DraftMaterializeAssignment = {
  lineId: string;
  startDate: string;
  endDate: string;
  rentalStartPartOfDay: RentalPartOfDay;
  rentalEndPartOfDay: RentalPartOfDay;
};

function buildDraftMaterializeAssignments(args: {
  lineIds: string[];
  startDate: string;
  endDate: string;
}): DraftMaterializeAssignment[] {
  return args.lineIds.map((lineId) => ({
    lineId,
    startDate: args.startDate,
    endDate: args.endDate,
    rentalStartPartOfDay: "MORNING",
    rentalEndPartOfDay: "EVENING",
  }));
}

function groupDraftMaterializeAssignments(
  assignments: DraftMaterializeAssignment[],
): Array<{
  key: string;
  title: string;
  readyByDate: string;
  startDate: string;
  endDate: string;
  rentalStartPartOfDay: RentalPartOfDay;
  rentalEndPartOfDay: RentalPartOfDay;
  lineIds: string[];
}> {
  const grouped = new Map<
    string,
    {
      startDate: string;
      endDate: string;
      rentalStartPartOfDay: RentalPartOfDay;
      rentalEndPartOfDay: RentalPartOfDay;
      lineIds: string[];
    }
  >();
  for (const assignment of assignments) {
    const rentalStartPartOfDay = assignment.startDate === assignment.endDate ? "MORNING" : assignment.rentalStartPartOfDay;
    const rentalEndPartOfDay = assignment.startDate === assignment.endDate ? "EVENING" : assignment.rentalEndPartOfDay;
    const key = `${assignment.startDate}__${rentalStartPartOfDay}__${assignment.endDate}__${rentalEndPartOfDay}`;
    const current = grouped.get(key);
    if (current) {
      current.lineIds.push(assignment.lineId);
      continue;
    }
    grouped.set(key, {
      startDate: assignment.startDate,
      endDate: assignment.endDate,
      rentalStartPartOfDay,
      rentalEndPartOfDay,
      lineIds: [assignment.lineId],
    });
  }

  return [...grouped.entries()].map(([key, value]) => ({
    key,
    title:
      value.startDate === value.endDate
        ? formatRuDateFromISO(value.startDate)
        : `${formatRuDateFromISO(value.startDate)} вЂ” ${formatRuDateFromISO(value.endDate)}`,
    readyByDate: value.startDate,
    startDate: value.startDate,
    endDate: value.endDate,
    rentalStartPartOfDay: value.rentalStartPartOfDay,
    rentalEndPartOfDay: value.rentalEndPartOfDay,
    lineIds: value.lineIds,
  }));
}

const UNIT_DATALIST_ID = "project-estimate-unit-presets";

function UnitPresetDatalist() {
  return (
    <datalist id={UNIT_DATALIST_ID}>
      <option value="С€С‚" />
      <option value="С‡Р°СЃ" />
      <option value="СѓСЃР»." />
    </datalist>
  );
}

function cloneLocalSections(sections: EstSection[]): LocalDraftSection[] {
  return sections
    .filter(
      (section): section is EstSection & { kind: "LOCAL" | "CONTRACTOR" } =>
        section.kind === "LOCAL" || section.kind === "CONTRACTOR",
    )
    .map((section) => ({
      id: section.id,
      sortOrder: section.sortOrder,
      title: section.title,
      kind: "CONTRACTOR",
      linkedOrderId: null,
      lines: section.lines.map((line) => ({
        id: line.id,
        position: line.position,
        lineNumber: line.lineNumber,
        name: line.name,
        description: line.description,
        lineType: line.lineType,
        costClient: line.costClient,
        costInternal: line.costInternal,
        unit: line.unit?.trim() || null,
        qty:
          line.qty != null && Number.isFinite(Number(line.qty)) ? String(line.qty) : null,
        unitPriceClient:
          line.unitPriceClient != null && Number.isFinite(line.unitPriceClient)
            ? String(line.unitPriceClient)
            : null,
        paymentMethod: line.paymentMethod ?? null,
        paymentStatus: line.paymentStatus ?? null,
        contractorNote: line.contractorNote ?? null,
        contractorRequisites: line.contractorRequisites ?? null,
        orderLineId: null,
        itemId: null,
      })),
    }));
}

function sortSectionsBySortOrder<T extends { sortOrder: number }>(sections: T[]): T[] {
  return [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
}

function nextSectionSortOrderAtTop(
  localSections: LocalDraftSection[],
  persistedSections: EstSection[] | null | undefined,
): number {
  const allSortOrders = [
    ...localSections.map((section) => section.sortOrder),
    ...(persistedSections ?? []).map((section) => section.sortOrder),
  ];
  return (allSortOrders.length > 0 ? Math.min(...allSortOrders) : 0) - 1;
}

function normalizeLocalSectionsForCompare(sections: LocalDraftSection[]) {
  return sortSectionsBySortOrder(sections)
    .map((section, sectionIndex) => ({
      title: section.title.trim(),
      sortOrder: section.sortOrder,
      kind: section.kind,
      lines: section.lines.map((line, lineIndex) => ({
        name: line.name.trim(),
        description: line.description?.trim() || null,
        costClient: normalizedLocalLineCostClientString(line),
        costInternal: line.costInternal == null || line.costInternal === "" ? null : String(Number(line.costInternal)),
        unit: line.unit?.trim() || null,
        qty: line.qty?.trim() || null,
        unitPriceClient: line.unitPriceClient?.trim() || null,
        paymentMethod: line.paymentMethod?.trim() || null,
        paymentStatus: line.paymentStatus?.trim() || null,
        contractorNote: line.contractorNote?.trim() || null,
        contractorRequisites: line.contractorRequisites?.trim() || null,
        position: lineIndex,
        lineNumber: lineIndex + 1,
      })),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function isDraftRequisiteSection(
  section: EstSection | LocalDraftSection,
): section is EstSection & { kind: "DRAFT_REQUISITE" } {
  return section.kind === "DRAFT_REQUISITE";
}

function isRequisiteSectionWithOrder(
  section: EstSection | LocalDraftSection,
): section is EstSection & { kind: "REQUISITE"; linkedOrderId: string } {
  return section.kind === "REQUISITE" && Boolean(section.linkedOrderId);
}

function parseDraftLineMeta(line: EstLine) {
  const qty =
    typeof line.qty === "number" && Number.isFinite(line.qty)
      ? Math.max(1, line.qty)
      : (() => {
          const match = line.description?.match(/РљРѕР»-РІРѕ:\s*(\d+)/);
          return match ? Math.max(1, Number(match[1])) : 1;
        })();
  const plannedDays =
    typeof line.plannedDays === "number" && Number.isFinite(line.plannedDays)
      ? normalizeProjectEstimateDays(line.plannedDays) ?? 1
      : (() => {
          const match = line.description?.match(/Р”РЅРµР№:\s*(\d+)/);
          return match ? normalizeProjectEstimateDays(Number(match[1])) ?? 1 : 1;
        })();
  const pricePerDay =
    typeof line.pricePerDaySnapshot === "number" && Number.isFinite(line.pricePerDaySnapshot)
      ? line.pricePerDaySnapshot
      : (() => {
          if (line.costClient == null) return 0;
          const total = Number(line.costClient);
          if (!Number.isFinite(total) || qty <= 0 || plannedDays <= 0) return 0;
          return calcProjectEstimateRequisiteUnitPricePerDay({
            totalClient: total,
            qty,
            plannedDays,
          }) ?? 0;
        })();
  const extraDescription =
    line.description
      ?.split("\n")
      .filter((chunk) => !/^РљРѕР»-РІРѕ:\s*\d+$/i.test(chunk.trim()) && !/^Р”РЅРµР№:\s*\d+$/i.test(chunk.trim()))
      .join("\n")
      .trim() || "";

  return {
    qty,
    plannedDays,
    pricePerDay,
    extraDescription,
    maxQtyPhysical:
      typeof line.maxQtyPhysical === "number" && Number.isFinite(line.maxQtyPhysical) ? line.maxQtyPhysical : null,
  };
}

/** РўРѕР»СЊРєРѕ С†РёС„СЂС‹ (РґР»СЏ input РєРѕР»РёС‡РµСЃС‚РІР°). */
function digitsOnlyInput(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Р”Р»СЏ РѕС‚РѕР±СЂР°Р¶РµРЅРёСЏ СЃСѓРјРјС‹ РїСЂРё СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёРё: РїСѓСЃС‚Рѕ в†’ 0; РёРЅР°С‡Рµ С†РµР»РѕРµ в‰Ґ 1, РјСѓСЃРѕСЂ в†’ 0 */
function parseQtyDisplayInt(raw: string): number {
  const t = raw.trim();
  if (t === "") return 0;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 1 ? n : 0;
}

/** РџРѕСЃР»Рµ blur: РїСѓСЃС‚Рѕ РёР»Рё РјСѓСЃРѕСЂ в†’ fallback (РѕР±С‹С‡РЅРѕ 1) */
function parseQtyCommitInt(raw: string, fallback = 1): number {
  const t = raw.trim();
  if (t === "") return fallback;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

function maxPhysicalRemainingForDraftLine(
  lines: Array<{ itemId: string; qty: string; maxQtyPhysical: number | null }>,
  index: number,
): number {
  const row = lines[index];
  if (!row) return 0;
  const cap =
    row.maxQtyPhysical != null && Number.isFinite(row.maxQtyPhysical)
      ? Math.max(0, row.maxQtyPhysical)
      : Number.POSITIVE_INFINITY;
  const qtyForSibling = (q: string) => parseQtyCommitInt(q, 1);
  const usedOthers = lines.reduce(
    (sum, l, j) => (j !== index && l.itemId === row.itemId ? sum + qtyForSibling(l.qty) : sum),
    0,
  );
  if (cap === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  return Math.max(0, cap - usedOthers);
}

function maxPhysicalRemainingForRequisiteLine(
  lines: Array<{
    itemId: string;
    requestedQty: number;
    item: { total: number; inRepair: number; broken: number; missing: number };
  }>,
  index: number,
): number {
  const row = lines[index];
  if (!row) return 0;
  const cap = usableStockUnits(row.item);
  const usedOthers = lines.reduce(
    (sum, l, j) => (j !== index && l.itemId === row.itemId ? sum + l.requestedQty : sum),
    0,
  );
  return Math.max(0, cap - usedOthers);
}

/** РЈС‡РёС‚С‹РІР°РµС‚ Рё РІС‘РґСЂР° РЅР° СЃРєР»Р°РґРµ, Рё В«РґРѕСЃС‚СѓРїРЅРѕ РЅР° РґР°С‚С‹В» РёР· РєР°С‚Р°Р»РѕРіР° (РєР°Рє РЅР° СЃРµСЂРІРµСЂРµ warehouse-edit). */
function maxQtyAllowedForRequisiteLine(
  lines: Array<{
    itemId: string;
    requestedQty: number;
    item: { total: number; inRepair: number; broken: number; missing: number };
  }>,
  index: number,
  availableForDatesByItemId: Map<string, number>,
): number {
  const physical = maxPhysicalRemainingForRequisiteLine(lines, index);
  const row = lines[index];
  if (!row) return physical;
  const datePool = availableForDatesByItemId.get(row.itemId);
  if (datePool == null) return physical;
  const usedOthers = lines.reduce(
    (sum, l, j) => (j !== index && l.itemId === row.itemId ? sum + l.requestedQty : sum),
    0,
  );
  const dateRem = Math.max(0, datePool - usedOthers);
  return Math.min(physical, dateRem);
}

export function ProjectEstimatePanel({
  projectId,
  readOnly,
  selectedVersionNumber: selectedVersionNumberProp,
  onSelectedVersionNumberChange,
  onResolvedVersionChange,
}: {
  projectId: string;
  readOnly: boolean;
  selectedVersionNumber?: number | null;
  onSelectedVersionNumberChange?: (value: number | null) => void;
  onResolvedVersionChange?: (value: { id: string; versionNumber: number } | null) => void;
}) {
  const [data, setData] = React.useState<EstimatePayload | null>(null);
  /** null = РѕСЃРЅРѕРІРЅР°СЏ РІРµСЂСЃРёСЏ СЃ СЃРµСЂРІРµСЂР°; С‡РёСЃР»Рѕ = СЏРІРЅС‹Р№ РІС‹Р±РѕСЂ */
  const [uncontrolledSelectedVersion, setUncontrolledSelectedVersion] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [newSectionTitle, setNewSectionTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [selectedImportOrderIds, setSelectedImportOrderIds] = React.useState<string[]>([]);
  const [versionPickerOpen, setVersionPickerOpen] = React.useState(false);
  const [actionsOpen, setActionsOpen] = React.useState(false);
  const versionPickerWrapRef = React.useRef<HTMLDivElement>(null);
  const actionsWrapRef = React.useRef<HTMLDivElement>(null);
  const [localSectionsDraft, setLocalSectionsDraft] = React.useState<LocalDraftSection[]>([]);
  const [commissionEnabled, setCommissionEnabled] = React.useState(true);
  const [clientTaxEnabled, setClientTaxEnabled] = React.useState(true);
  const [estimateDraftDirty, setEstimateDraftDirty] = React.useState(false);
  const selectedVersion =
    selectedVersionNumberProp !== undefined ? selectedVersionNumberProp : uncontrolledSelectedVersion;

  const setSelectedVersion = React.useCallback(
    (value: number | null) => {
      if (onSelectedVersionNumberChange) {
        onSelectedVersionNumberChange(value);
        return;
      }
      setUncontrolledSelectedVersion(value);
    },
    [onSelectedVersionNumberChange],
  );

  const load = React.useCallback(
    (v: number | null) => {
      setLoading(true);
      const q = v != null ? `?version=${v}` : "";
      fetch(`/api/projects/${projectId}/estimate${q}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: EstimatePayload & { error?: { message?: string } }) => {
          if (j.error?.message) {
            setError(j.error.message);
            setData(null);
          } else {
            setData(j);
            const versionNumber = j.current?.versionNumber ?? null;
            const baseSections = j.current?.sections ? sortSectionsBySortOrder(cloneLocalSections(j.current.sections)) : [];
            const baseCommissionEnabled = j.current?.commissionEnabled ?? true;
            const baseClientTaxEnabled = j.current?.clientTaxEnabled ?? true;
            if (versionNumber != null) {
              const storageKey = draftEstimateStorageKey(projectId, versionNumber);
              const raw = window.localStorage.getItem(storageKey);
              if (raw) {
                try {
                  const parsed = JSON.parse(raw) as StoredEstimateDraft;
                  if (
                    parsed.schemaVersion === ESTIMATE_DRAFT_SCHEMA_VERSION &&
                    parsed.versionNumber === versionNumber &&
                    Array.isArray(parsed.sections)
                  ) {
                    const storedSections = sortSectionsBySortOrder(parsed.sections);
                    const storedCommissionEnabled = parsed.commissionEnabled ?? baseCommissionEnabled;
                    const storedClientTaxEnabled = parsed.clientTaxEnabled ?? baseClientTaxEnabled;
                    const hasDestructiveEmptyDraft = storedSections.length === 0 && baseSections.length > 0;
                    const isSameAsServer =
                      JSON.stringify(normalizeLocalSectionsForCompare(storedSections)) ===
                        JSON.stringify(normalizeLocalSectionsForCompare(baseSections)) &&
                      storedCommissionEnabled === baseCommissionEnabled &&
                      storedClientTaxEnabled === baseClientTaxEnabled;
                    if (hasDestructiveEmptyDraft || isSameAsServer) {
                      window.localStorage.removeItem(storageKey);
                      setLocalSectionsDraft(baseSections);
                      setCommissionEnabled(baseCommissionEnabled);
                      setClientTaxEnabled(baseClientTaxEnabled);
                      setEstimateDraftDirty(false);
                    } else {
                      setLocalSectionsDraft(storedSections);
                      setCommissionEnabled(storedCommissionEnabled);
                      setClientTaxEnabled(storedClientTaxEnabled);
                      setEstimateDraftDirty(true);
                    }
                  } else {
                    window.localStorage.removeItem(storageKey);
                    setLocalSectionsDraft(baseSections);
                    setCommissionEnabled(baseCommissionEnabled);
                    setClientTaxEnabled(baseClientTaxEnabled);
                    setEstimateDraftDirty(false);
                  }
                } catch {
                  window.localStorage.removeItem(storageKey);
                  setLocalSectionsDraft(baseSections);
                  setCommissionEnabled(baseCommissionEnabled);
                  setClientTaxEnabled(baseClientTaxEnabled);
                  setEstimateDraftDirty(false);
                }
              } else {
                setLocalSectionsDraft(baseSections);
                setCommissionEnabled(baseCommissionEnabled);
                setClientTaxEnabled(baseClientTaxEnabled);
                setEstimateDraftDirty(false);
              }
            } else {
              setLocalSectionsDraft([]);
              setCommissionEnabled(true);
              setClientTaxEnabled(true);
              setEstimateDraftDirty(false);
            }
            setError(null);
            setVersionPickerOpen(false);
            setActionsOpen(false);
          }
        })
        .catch(() => {
          setError("РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃРјРµС‚Сѓ");
          setData(null);
        })
        .finally(() => setLoading(false));
    },
    [projectId],
  );

  React.useEffect(() => {
    load(selectedVersion);
  }, [load, selectedVersion]);

  React.useEffect(() => {
    function onRefresh() {
      load(selectedVersion);
    }
    window.addEventListener("project-activity-refresh", onRefresh);
    return () => window.removeEventListener("project-activity-refresh", onRefresh);
  }, [load, selectedVersion]);

  React.useEffect(() => {
    if (!versionPickerOpen && !actionsOpen) return;
    function handlePointerDown(e: MouseEvent) {
      const t = e.target as Node;
      if (versionPickerWrapRef.current?.contains(t)) return;
      if (actionsWrapRef.current?.contains(t)) return;
      setVersionPickerOpen(false);
      setActionsOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [versionPickerOpen, actionsOpen]);

  function refreshActivity() {
    window.dispatchEvent(new CustomEvent("project-activity-refresh"));
  }

  React.useEffect(() => {
    if (!onResolvedVersionChange) return;
    if (!data?.current) {
      onResolvedVersionChange(null);
      return;
    }
    onResolvedVersionChange({
      id: data.current.id,
      versionNumber: data.current.versionNumber,
    });
  }, [data?.current, onResolvedVersionChange]);

  const currentVersionNumber = selectedVersion ?? data?.current?.versionNumber ?? null;
  const estimateDraftStorageKey =
    currentVersionNumber != null ? draftEstimateStorageKey(projectId, currentVersionNumber) : null;

  React.useEffect(() => {
    if (!estimateDraftStorageKey) return;
    if (!estimateDraftDirty) {
      window.localStorage.removeItem(estimateDraftStorageKey);
      return;
    }
    const payload: StoredEstimateDraft = {
      schemaVersion: ESTIMATE_DRAFT_SCHEMA_VERSION,
      versionNumber: currentVersionNumber!,
      sections: localSectionsDraft,
      commissionEnabled,
      clientTaxEnabled,
    };
    window.localStorage.setItem(estimateDraftStorageKey, JSON.stringify(payload));
  }, [
    clientTaxEnabled,
    commissionEnabled,
    currentVersionNumber,
    estimateDraftDirty,
    estimateDraftStorageKey,
    localSectionsDraft,
  ]);

  function mutateLocalSections(mutator: (prev: LocalDraftSection[]) => LocalDraftSection[]) {
    setLocalSectionsDraft((prev) => mutator(prev));
    setEstimateDraftDirty(true);
  }

  async function createEstimate(duplicate: boolean) {
    if (readOnly) return;
    const title =
      window.prompt("РќР°Р·РІР°РЅРёРµ СЃРјРµС‚С‹", duplicate ? `РљРѕРїРёСЏ ${data?.current?.title ?? "СЃРјРµС‚С‹"}` : "РќРѕРІР°СЏ СЃРјРµС‚Р°") ?? "";
    if (!title.trim()) return;
    const vNum = data?.current?.versionNumber;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          ...(duplicate && vNum != null ? { duplicateFromVersionNumber: vNum } : {}),
        }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.version) {
        setSelectedVersion(j.version.versionNumber);
        refreshActivity();
      } else {
        window.alert(j?.error?.message ?? "РћС€РёР±РєР°");
      }
    } finally {
      setBusy(false);
    }
  }

  async function patchCurrentEstimate(patch: { title?: string; includeInProjectTotals?: boolean }) {
    if (!data?.current) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate/versions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionNumber: data.current.versionNumber, ...patch }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        load(data.current.versionNumber);
      } else {
        window.alert(j?.error?.message ?? "Ошибка");
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteEstimate(versionNumber: number) {
    if (!window.confirm("Удалить эту смету? Ручные разделы тоже будут удалены.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate/versions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionNumber }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setSelectedVersion(null);
        load(null);
        refreshActivity();
      } else {
        window.alert(j?.error?.message ?? "Ошибка");
      }
    } finally {
      setBusy(false);
    }
  }

  async function importFromOrders() {
    if (selectedImportOrderIds.length === 0 || !data?.current) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate/versions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionNumber: data.current.versionNumber,
          importOrderIds: selectedImportOrderIds,
        }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setImportOpen(false);
        setSelectedImportOrderIds([]);
        load(selectedVersion);
      } else {
        window.alert(j?.error?.message ?? "РћС€РёР±РєР°");
      }
    } finally {
      setBusy(false);
    }
  }

  function addSection(e: React.FormEvent) {
    e.preventDefault();
    if (!newSectionTitle.trim() || readOnly) return;
    mutateLocalSections((prev) => [
      {
        id: makeTempId("section"),
        sortOrder: nextSectionSortOrderAtTop(prev, data?.current?.sections),
        title: newSectionTitle.trim(),
        kind: "CONTRACTOR",
        linkedOrderId: null,
        lines: [],
      },
      ...prev,
    ]);
    setNewSectionTitle("");
  }

  function deleteSection(id: string) {
    if (!window.confirm("РЈРґР°Р»РёС‚СЊ СЂР°Р·РґРµР» Рё РІСЃРµ РµРіРѕ СЃС‚СЂРѕРєРё?")) return;
    mutateLocalSections((prev) => prev.filter((section) => section.id !== id));
  }

  async function deleteServerSection(id: string) {
    if (!data?.current) return;
    if (!window.confirm("Убрать этот раздел из сметы? Сама заявка не будет удалена.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate/sections/${id}`, { method: "DELETE" });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setSelectedImportOrderIds((prev) => prev.filter((orderId) => orderId !== id));
        await load(data.current.versionNumber);
        refreshActivity();
      } else {
        window.alert(j?.error?.message ?? "Ошибка");
      }
    } finally {
      setBusy(false);
    }
  }

  function patchSection(sectionId: string, patch: { title?: string }) {
    mutateLocalSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              ...(patch.title != null ? { title: patch.title } : {}),
            }
          : section,
      ),
    );
  }

  function saveLine(sectionId: string, lineId: string, patch: Record<string, unknown>) {
    mutateLocalSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              lines: section.lines.map((line) => {
                if (line.id !== lineId) return line;
                let next: LocalDraftLine = { ...line };
                if (typeof patch.name === "string") next = { ...next, name: patch.name };
                if (Object.prototype.hasOwnProperty.call(patch, "description")) {
                  next = {
                    ...next,
                    description: patch.description == null ? null : String(patch.description),
                  };
                }
                if (Object.prototype.hasOwnProperty.call(patch, "costClient")) {
                  next = {
                    ...next,
                    costClient: patch.costClient == null ? null : String(patch.costClient),
                  };
                }
                if (Object.prototype.hasOwnProperty.call(patch, "costInternal")) {
                  next = {
                    ...next,
                    costInternal: patch.costInternal == null ? null : String(patch.costInternal),
                  };
                }
                if (Object.prototype.hasOwnProperty.call(patch, "unit")) {
                  next = {
                    ...next,
                    unit: patch.unit == null || String(patch.unit).trim() === "" ? null : String(patch.unit).trim(),
                  };
                }
                if (Object.prototype.hasOwnProperty.call(patch, "qty")) {
                  next = {
                    ...next,
                    qty: patch.qty == null || String(patch.qty).trim() === "" ? null : String(patch.qty),
                  };
                }
                if (Object.prototype.hasOwnProperty.call(patch, "unitPriceClient")) {
                  next = {
                    ...next,
                    unitPriceClient:
                      patch.unitPriceClient == null || String(patch.unitPriceClient).trim() === ""
                        ? null
                        : String(patch.unitPriceClient),
                  };
                }
                if (Object.prototype.hasOwnProperty.call(patch, "paymentMethod")) {
                  next = {
                    ...next,
                    paymentMethod:
                      patch.paymentMethod == null ? null : String(patch.paymentMethod).trim() || null,
                  };
                }
                if (Object.prototype.hasOwnProperty.call(patch, "paymentStatus")) {
                  next = {
                    ...next,
                    paymentStatus:
                      patch.paymentStatus == null ? null : String(patch.paymentStatus).trim() || null,
                  };
                }
                if (Object.prototype.hasOwnProperty.call(patch, "contractorNote")) {
                  next = {
                    ...next,
                    contractorNote:
                      patch.contractorNote == null ? null : String(patch.contractorNote),
                  };
                }
                if (Object.prototype.hasOwnProperty.call(patch, "contractorRequisites")) {
                  next = {
                    ...next,
                    contractorRequisites:
                      patch.contractorRequisites == null ? null : String(patch.contractorRequisites),
                  };
                }
                const q = next.qty != null ? Number(next.qty.replace(",", ".")) : NaN;
                const up =
                  next.unitPriceClient != null ? Number(next.unitPriceClient.replace(",", ".")) : NaN;
                const touchedPricing =
                  Object.prototype.hasOwnProperty.call(patch, "qty") ||
                  Object.prototype.hasOwnProperty.call(patch, "unitPriceClient");
                if (Number.isFinite(q) && q > 0 && Number.isFinite(up) && up >= 0) {
                  next = { ...next, costClient: String(Math.round(q * up)) };
                } else if (touchedPricing) {
                  next = { ...next, costClient: null };
                }
                return next;
              }),
            }
          : section,
      ),
    );
  }

  function deleteLine(sectionId: string, lineId: string) {
    mutateLocalSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              lines: section.lines
                .filter((line) => line.id !== lineId)
                .map((line, index) => ({ ...line, position: index, lineNumber: index + 1 })),
            }
          : section,
      ),
    );
  }

  function addEmptyLine(sectionId: string) {
    addLine(sectionId, {
      name: "",
      description: null,
      unit: "С€С‚",
      qty: null,
      unitPriceClient: null,
      costClient: null,
      costInternal: null,
      paymentMethod: null,
      paymentStatus: null,
      contractorNote: null,
      contractorRequisites: null,
    });
  }

  function addLine(
    sectionId: string,
    payload: {
      name: string;
      description: string | null;
      unit: string | null;
      qty: string | null;
      unitPriceClient: string | null;
      costClient: number | null;
      costInternal: number | null;
      paymentMethod: string | null;
      paymentStatus: string | null;
      contractorNote: string | null;
      contractorRequisites: string | null;
    },
  ) {
    mutateLocalSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;
        const index = section.lines.length;
        let costClientStr = payload.costClient == null ? null : String(payload.costClient);
        const q = payload.qty != null ? Number(payload.qty.replace(",", ".")) : NaN;
        const up =
          payload.unitPriceClient != null ? Number(payload.unitPriceClient.replace(",", ".")) : NaN;
        if (Number.isFinite(q) && q > 0 && Number.isFinite(up) && up >= 0) {
          costClientStr = String(Math.round(q * up));
        }
        return {
          ...section,
          lines: [
            ...section.lines,
            {
              id: makeTempId("line"),
              position: index,
              lineNumber: index + 1,
              name: payload.name,
              description: payload.description,
              lineType: "OTHER",
              costClient: costClientStr,
              costInternal: payload.costInternal == null ? null : String(payload.costInternal),
              unit: payload.unit?.trim() || null,
              qty: payload.qty?.trim() || null,
              unitPriceClient: payload.unitPriceClient?.trim() || null,
              paymentMethod: payload.paymentMethod?.trim() || null,
              paymentStatus: payload.paymentStatus?.trim() || null,
              contractorNote: payload.contractorNote?.trim() || null,
              contractorRequisites: payload.contractorRequisites?.trim() || null,
              orderLineId: null,
              itemId: null,
            },
          ],
        };
      }),
    );
  }

  async function saveEstimateDraft() {
    if (readOnly || currentVersionNumber == null) return;
    const baseSections = data?.current?.sections ? cloneLocalSections(data.current.sections) : [];
    const deletingAllLocalSections = localSectionsDraft.length === 0 && baseSections.length > 0;
    if (
      deletingAllLocalSections &&
      !window.confirm("РЈРґР°Р»РёС‚СЊ РІСЃРµ Р»РѕРєР°Р»СЊРЅС‹Рµ СЂР°Р·РґРµР»С‹ СЃРјРµС‚С‹ РёР· СЌС‚РѕР№ РІРµСЂСЃРёРё?")
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionNumber: currentVersionNumber,
          allowDeleteAllLocalSections: deletingAllLocalSections,
          commissionEnabled,
          clientTaxEnabled,
          localSections: sortSectionsBySortOrder(localSectionsDraft).map((section) => ({
            id: section.id.startsWith("draft-") ? undefined : section.id,
            title: section.title.trim(),
            sortOrder: section.sortOrder,
            kind: "CONTRACTOR" as const,
            lines: section.lines
              .filter((line) => line.name.trim())
              .map((line, lineIndex) => ({
              id: line.id.startsWith("draft-") ? undefined : line.id,
              position: lineIndex,
              lineNumber: lineIndex + 1,
              name: line.name.trim(),
              description: line.description?.trim() || null,
              lineType: line.lineType || "OTHER",
              costClient: normalizedLocalLineCostClientNumber(line),
              costInternal: line.costInternal == null || line.costInternal === "" ? null : Number(line.costInternal),
              unit: line.unit?.trim() || null,
              qty:
                line.qty == null || line.qty.trim() === ""
                  ? null
                  : Number(line.qty.replace(",", ".")),
              unitPriceClient:
                line.unitPriceClient == null || line.unitPriceClient.trim() === ""
                  ? null
                  : Number(line.unitPriceClient.replace(",", ".")),
              paymentMethod: line.paymentMethod?.trim() || null,
              paymentStatus: line.paymentStatus?.trim() || null,
              contractorNote: line.contractorNote?.trim() || null,
              contractorRequisites: line.contractorRequisites?.trim() || null,
            })),
          })),
        }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setEstimateDraftDirty(false);
        if (estimateDraftStorageKey) window.localStorage.removeItem(estimateDraftStorageKey);
        load(selectedVersion);
        refreshActivity();
      } else {
        window.alert(j?.error?.message ?? "РћС€РёР±РєР°");
      }
    } finally {
      setBusy(false);
    }
  }

  function discardEstimateDraft() {
    if (!window.confirm("РЎР±СЂРѕСЃРёС‚СЊ РЅРµСЃРѕС…СЂР°РЅС‘РЅРЅС‹Рµ РёР·РјРµРЅРµРЅРёСЏ СЃРјРµС‚С‹?")) return;
    if (estimateDraftStorageKey) window.localStorage.removeItem(estimateDraftStorageKey);
    const baseSections = data?.current?.sections ? cloneLocalSections(data.current.sections) : [];
    setLocalSectionsDraft(baseSections);
    setCommissionEnabled(data?.current?.commissionEnabled ?? true);
    setClientTaxEnabled(data?.current?.clientTaxEnabled ?? true);
    setEstimateDraftDirty(false);
  }

  const vn = currentVersionNumber;
  const currentVersionMeta = data?.versions.find((v) => v.versionNumber === vn) ?? null;
  const exportBase =
    vn != null
      ? `/api/projects/${projectId}/estimate/pdf?version=${encodeURIComponent(String(vn))}`
      : `/api/projects/${projectId}/estimate/pdf`;
  const exportHrefInternal = `${exportBase}${exportBase.includes("?") ? "&" : "?"}variant=internal`;
  const exportHrefClient = `${exportBase}${exportBase.includes("?") ? "&" : "?"}variant=client`;
  const availableImportOrders = React.useMemo(() => {
    if (!data?.projectOrders || !data.current) return [];
    const imported = new Set(
      data.current.sections
        .filter((s) => s.kind === "REQUISITE" && s.linkedOrderId)
        .map((s) => s.linkedOrderId as string),
    );
    return data.projectOrders.filter((o) => !imported.has(o.id) && !o.assignedEstimate);
  }, [data]);
  const orderedProjectOrders = React.useMemo(
    () =>
      [...(data?.projectOrders ?? [])].sort((a, b) => {
        if (a.startDate === b.startDate) return a.id.localeCompare(b.id);
        return a.startDate.localeCompare(b.startDate);
      }),
    [data?.projectOrders],
  );
  const orderMetaById = React.useMemo(() => {
    const map = new Map<
      string,
      { index: number; label: string; dateLabel: string; status: string; eventName: string | null }
    >();
    orderedProjectOrders.forEach((order, index) => {
      map.set(order.id, {
        index: index + 1,
        label: `Р—Р°СЏРІРєР° в„–${index + 1}`,
        dateLabel: `${order.startDate} вЂ” ${order.endDate}`,
        status: order.status,
        eventName: order.eventName,
      });
    });
    return map;
  }, [orderedProjectOrders]);

  const renderedSections = React.useMemo((): Array<EstSection | LocalDraftSection> => {
    if (!data?.current) return [];
    const requisites = data.current.sections.filter(
      (section) => section.kind === "REQUISITE" || section.kind === "DRAFT_REQUISITE",
    );
    return sortSectionsBySortOrder([...requisites, ...localSectionsDraft]);
  }, [data?.current, localSectionsDraft]);

  const dirtyLocalLineIds = React.useMemo(() => {
    const dirtyIds = new Set<string>();
    if (!data?.current) return dirtyIds;
    const baseline = cloneLocalSections(data.current.sections);
    const normalizedBase = new Map(
      sortSectionsBySortOrder(baseline).map((section) => [section.id, normalizeLocalSectionsForCompare([section])[0]]),
    );
    localSectionsDraft.forEach((section) => {
      const normalizedSection = normalizeLocalSectionsForCompare([section])[0];
      const baseSection = section.id.startsWith("draft-")
        ? null
        : baseline.find((candidate) => candidate.id === section.id) ?? null;
      if (!baseSection) {
        section.lines.forEach((line) => dirtyIds.add(line.id));
        return;
      }
      const baseLines = normalizedBase.get(baseSection.id)?.lines ?? [];
      section.lines.forEach((line, lineIndex) => {
        const current = normalizedSection?.lines[lineIndex];
        const previous = baseLines[lineIndex];
        if (!previous || JSON.stringify(current) !== JSON.stringify(previous)) {
          dirtyIds.add(line.id);
        }
      });
    });

    return dirtyIds;
  }, [data?.current, localSectionsDraft]);

  const totals = React.useMemo(() => {
    const sections = renderedSections;
    let clientSubtotal = 0;
    let internalSubtotal = 0;
    let cashInternalSubtotal = 0;
    for (const s of sections) {
      for (const l of s.lines) {
        clientSubtotal += getNumericAmount(l.costClient);
        const internalCost = getNumericAmount(l.costInternal);
        internalSubtotal += internalCost;
        if (isCashPaymentMethod(l.paymentMethod)) {
          cashInternalSubtotal += internalCost;
        }
      }
    }
    const roundedClientSubtotal = roundMoney(clientSubtotal);
    const roundedInternalSubtotal = roundMoney(internalSubtotal);
    const cashInternalCostTax = calcOrderServicesInternalCosts({
      delivery: {
        enabled: true,
        internalCost: cashInternalSubtotal,
        internalPaymentMethod: "CASH",
      },
    }).cashInternalCostTax;
    const estimateTotals = calcProjectEstimateTotals({
      clientSubtotal: roundedClientSubtotal,
      internalSubtotal: roundedInternalSubtotal,
      cashInternalCostTax,
      commissionEnabled,
      clientTaxEnabled,
    });

    return {
      clientSubtotal: estimateTotals.clientSubtotal,
      commission: estimateTotals.commission,
      revenueTotal: estimateTotals.revenueTotal,
      tax6: estimateTotals.tax,
      internalSubtotal: estimateTotals.internalSubtotal,
      cashInternalSubtotal: roundMoney(cashInternalSubtotal),
      cashInternalCostTax: estimateTotals.cashInternalCostTax,
      internalWithCashTax: estimateTotals.internalExpensesTotal,
      totalExpensesWithTax: roundMoney(estimateTotals.internalExpensesTotal + estimateTotals.tax),
      grossMargin: estimateTotals.grossMargin,
      marginAfterTax: estimateTotals.marginAfterTax,
      marginAfterTaxPct: estimateTotals.marginAfterTaxPct,
    };
  }, [renderedSections, commissionEnabled, clientTaxEnabled]);

  function money(n: number) {
    return formatMoneyRub(n);
  }

  return (
    <div className="space-y-4 rounded-[1.35rem] border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
      <UnitPresetDatalist />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-[linear-gradient(135deg,rgba(237,233,254,0.75),rgba(255,255,255,0.96))] px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-lg font-extrabold tracking-tight text-violet-900">РЎРјРµС‚Р° РїСЂРѕРµРєС‚Р°</div>
          <EstimateHelpLegend title="РљР°Рє СѓСЃС‚СЂРѕРµРЅР° СЃРјРµС‚Р° РїСЂРѕРµРєС‚Р°">
            Р—РґРµСЃСЊ СЃРѕР±РёСЂР°РµС‚СЃСЏ С„РёРЅР°РЅСЃРѕРІР°СЏ С‡Р°СЃС‚СЊ РїСЂРѕРµРєС‚Р°. Р—Р°СЏРІРєРё СЂРµРєРІРёР·РёС‚Р° РїРѕРґС‚СЏРіРёРІР°СЋС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё, Р° СѓСЃР»СѓРіРё РїРѕРґСЂСЏРґС‡РёРєРѕРІ РјРѕР¶РЅРѕ РґРѕР±Р°РІРёС‚СЊ РІСЂСѓС‡РЅСѓСЋ. Р”Р»СЏ РєР»РёРµРЅС‚Р° РІР°Р¶РЅС‹ РЅР°Р·РІР°РЅРёСЏ, РѕРїРёСЃР°РЅРёСЏ Рё РёС‚РѕРіРѕРІР°СЏ С†РµРЅР°. Р”Р»СЏ РЅР°СЃ вЂ” СЃРµР±РµСЃС‚РѕРёРјРѕСЃС‚СЊ, СЃРїРѕСЃРѕР± РѕРїР»Р°С‚С‹ Рё РїСЂРёР±С‹Р»СЊ.
          </EstimateHelpLegend>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {vn != null ? (
            <>
              <a
                href={exportHrefInternal}
                className="rounded-lg border border-emerald-600/40 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                target="_blank"
                rel="noreferrer"
              >
                XLSX РІРЅСѓС‚СЂ.
              </a>
              <a
                href={exportHrefClient}
                className="rounded-lg border border-indigo-500/35 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-950 hover:bg-indigo-100"
                target="_blank"
                rel="noreferrer"
              >
                XLSX РєР»РёРµРЅС‚
              </a>
            </>
          ) : null}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-600">Р—Р°РіСЂСѓР·РєР°вЂ¦</p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : !data ? (
        <p className="text-sm text-zinc-600">РќРµС‚ РґР°РЅРЅС‹С… СЃРјРµС‚С‹.</p>
      ) : !data.current && data.versions.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-zinc-600">Р’РµСЂСЃРёР№ СЃРјРµС‚С‹ РµС‰С‘ РЅРµС‚.</p>
          {!readOnly ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void createEstimate(false)}
              className={btnPrimary}
            >
              РЎРѕР·РґР°С‚СЊ РїРµСЂРІСѓСЋ РІРµСЂСЃРёСЋ
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Смета проекта</div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative" ref={versionPickerWrapRef}>
                  <button
                    type="button"
                    className="inline-flex min-h-11 min-w-[12rem] items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-left shadow-sm hover:border-violet-200 hover:bg-violet-50/60"
                    onClick={() => {
                      setVersionPickerOpen((v) => !v);
                      setActionsOpen(false);
                    }}
                  >
                    <span>
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">РўРµРєСѓС‰Р°СЏ</span>
                      <span className="block text-base font-semibold text-zinc-950">
                        {currentVersionMeta?.title?.trim() || (vn != null ? `Смета ${vn}` : "Смета не выбрана")}
                      </span>
                    </span>
                    <svg viewBox="0 0 20 20" className={`h-4 w-4 text-zinc-500 transition ${versionPickerOpen ? "rotate-180" : ""}`} aria-hidden>
                      <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.1 1.02l-4.25 4.5a.75.75 0 01-1.1 0l-4.25-4.5a.75.75 0 01.02-1.06z" fill="currentColor" />
                    </svg>
                  </button>
                  {versionPickerOpen ? (
                    <div className={`${menuPanel} left-0 right-auto min-w-[17rem]`}>
                      {data.versions.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left ${
                            vn === v.versionNumber ? "bg-violet-50 text-violet-950" : "text-zinc-800 hover:bg-zinc-50"
                          }`}
                          onClick={() => {
                            setSelectedVersion(v.versionNumber);
                            setVersionPickerOpen(false);
                          }}
                        >
                          <span className="min-w-0">
                            <span className="block font-semibold">{v.title?.trim() || `Смета ${v.versionNumber}`}</span>
                            <span className="block text-xs text-zinc-500">
                              {v.includeInProjectTotals ? "Учитывается в финансах проекта" : "Не входит в итог проекта"}
                            </span>
                          </span>
                          {v.isPrimary ? (
                            <span className="rounded-full border border-violet-200 bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                              первая
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {currentVersionMeta ? (
                  <>
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ${
                        currentVersionMeta.isPrimary
                          ? "border border-violet-200 bg-violet-50 text-violet-800"
                          : "border border-zinc-200 bg-zinc-50 text-zinc-700"
                      }`}
                    >
                      {currentVersionMeta.includeInProjectTotals ? "В итогах проекта" : "Не входит в итог"}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {new Date(currentVersionMeta.createdAt).toLocaleDateString("ru-RU")} В· {currentVersionMeta.createdBy.displayName}
                    </span>
                  </>
                ) : null}
              </div>
            </div>

            {!readOnly ? (
              <div className="relative flex items-start justify-start lg:justify-end" ref={actionsWrapRef}>
                <button
                  type="button"
                  disabled={busy}
                  className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
                  onClick={() => {
                    setActionsOpen((v) => !v);
                    setVersionPickerOpen(false);
                  }}
                >
                  Р”РµР№СЃС‚РІРёСЏ
                  <svg viewBox="0 0 20 20" className={`h-4 w-4 text-zinc-500 transition ${actionsOpen ? "rotate-180" : ""}`} aria-hidden>
                    <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.1 1.02l-4.25 4.5a.75.75 0 01-1.1 0l-4.25-4.5a.75.75 0 01.02-1.06z" fill="currentColor" />
                  </svg>
                </button>
                {actionsOpen ? (
                  <div className={menuPanel}>
                    <button
                      type="button"
                      disabled={busy}
                      className={menuAction}
                      onClick={() => {
                        setActionsOpen(false);
                        void createEstimate(false);
                      }}
                    >
                      <span>
                        <span className="block font-semibold">РќРѕРІР°СЏ РІРµСЂСЃРёСЏ</span>
                        <span className="block text-xs text-zinc-500">РЎРѕР·РґР°С‚СЊ С‡РёСЃС‚С‹Р№ С‡РµСЂРЅРѕРІРёРє</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busy || !data.current}
                      className={menuAction}
                      onClick={() => {
                        setActionsOpen(false);
                        void createEstimate(true);
                      }}
                    >
                      <span>
                        <span className="block font-semibold">Р”СѓР±Р»РёСЂРѕРІР°С‚СЊ С‚РµРєСѓС‰СѓСЋ</span>
                        <span className="block text-xs text-zinc-500">РЎРєРѕРїРёСЂРѕРІР°С‚СЊ СЂР°Р·РґРµР»С‹ Рё СЃС‚СЂРѕРєРё</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busy || !data.current}
                      className={menuAction}
                      onClick={() => {
                        if (!data.current) return;
                        setActionsOpen(false);
                        const title = window.prompt("Новое название сметы", data.current.title ?? "");
                        if (title == null || !title.trim()) return;
                        void patchCurrentEstimate({ title: title.trim() });
                      }}
                    >
                      <span>
                        <span className="block font-semibold">Переименовать смету</span>
                        <span className="block text-xs text-zinc-500">Название видно внутри проекта и в списке смет</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busy || !data.current}
                      className={menuAction}
                      onClick={() => {
                        if (!data.current) return;
                        setActionsOpen(false);
                        void patchCurrentEstimate({ includeInProjectTotals: !data.current.includeInProjectTotals });
                      }}
                    >
                      <span>
                        <span className="block font-semibold">
                          {currentVersionMeta?.includeInProjectTotals ? "Не учитывать в итогах" : "Учитывать в итогах"}
                        </span>
                        <span className="block text-xs text-zinc-500">
                          Только включённые сметы суммируются в финансах проекта
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busy || orderedProjectOrders.length === 0}
                      className={menuAction}
                      onClick={() => {
                        setImportOpen((v) => !v);
                        setActionsOpen(false);
                      }}
                    >
                      <span>
                        <span className="block font-semibold">РџРѕРґС‚СЏРЅСѓС‚СЊ РёР· Р·Р°СЏРІРѕРє</span>
                        <span className="block text-xs text-zinc-500">
                          {availableImportOrders.length > 0
                            ? `Р”РѕСЃС‚СѓРїРЅРѕ Р·Р°СЏРІРѕРє: ${availableImportOrders.length}`
                            : "Свободных заявок нет"}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busy || !data.current || data.versions.length <= 1}
                      className={`${menuAction} text-red-700 hover:bg-red-50`}
                      onClick={() => {
                        if (!data.current) return;
                        setActionsOpen(false);
                        void deleteEstimate(data.current.versionNumber);
                      }}
                    >
                      <span>
                        <span className="block font-semibold">РЈРґР°Р»РёС‚СЊ РІРµСЂСЃРёСЋ</span>
                        <span className="block text-xs text-red-500">РќРµРґРѕСЃС‚СѓРїРЅРѕ РґР»СЏ РїРѕСЃР»РµРґРЅРµР№ РІРµСЂСЃРёРё</span>
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {!data.current ? (
            <p className="text-sm text-zinc-600">Р’С‹Р±РµСЂРёС‚Рµ РІРµСЂСЃРёСЋ.</p>
          ) : (
            <>
              {!readOnly ? (
                <div className="space-y-3 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/65 p-3">
                  {importOpen ? (
                    <div
                      className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/35 px-4 py-6 backdrop-blur-sm"
                      onMouseDown={() => {
                        setImportOpen(false);
                        setSelectedImportOrderIds([]);
                      }}
                    >
                      <div
                        className="max-h-[min(760px,calc(100vh-48px))] w-full max-w-2xl overflow-auto rounded-3xl border border-white/70 bg-white/95 p-5 shadow-[0_30px_90px_rgba(24,24,27,0.22)]"
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Р’С‹Р±РµСЂРё Р·Р°СЏРІРєРё РїСЂРѕРµРєС‚Р° РґР»СЏ РёРјРїРѕСЂС‚Р° РІ С‚РµРєСѓС‰СѓСЋ РІРµСЂСЃРёСЋ
                      </div>
                      {orderedProjectOrders.length === 0 ? (
                        <div className="text-sm text-zinc-600">В проекте пока нет заявок.</div>
                      ) : (
                        <div className="space-y-2">
                          {orderedProjectOrders.map((order) => {
                            const isInCurrentEstimate = data.current?.sections.some(
                              (section) => section.kind === "REQUISITE" && section.linkedOrderId === order.id,
                            );
                            const assignedElsewhere =
                              order.assignedEstimate && order.assignedEstimate.id !== data.current?.id
                                ? order.assignedEstimate
                                : null;
                            const disabled = Boolean(isInCurrentEstimate || assignedElsewhere || order.status === "CANCELLED");
                            return (
                              <label
                                key={order.id}
                                className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${
                                  disabled
                                    ? "border-zinc-200 bg-zinc-50 text-zinc-400"
                                    : "border-zinc-200 bg-white text-zinc-800"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  disabled={disabled}
                                  checked={selectedImportOrderIds.includes(order.id)}
                                  onChange={(e) =>
                                    setSelectedImportOrderIds((prev) =>
                                      e.target.checked ? [...prev, order.id] : prev.filter((id) => id !== order.id),
                                    )
                                  }
                                  className="mt-0.5"
                                />
                                <span className="min-w-0">
                                  <span className="block font-medium text-zinc-900">
                                    {order.eventName?.trim() ? order.eventName : `Заявка ${order.id.slice(0, 8)}...`}
                                  </span>
                                  <span className="block text-xs text-zinc-500">
                                    {order.startDate} - {order.endDate}
                                    {isInCurrentEstimate ? " · уже в этой смете" : ""}
                                    {assignedElsewhere ? ` · уже в смете "${assignedElsewhere.title}"` : ""}
                                    {order.status === "CANCELLED" ? " · отменена" : ""}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy || selectedImportOrderIds.length === 0}
                          onClick={() => void importFromOrders()}
                          className={btnPrimary}
                        >
                          РРјРїРѕСЂС‚РёСЂРѕРІР°С‚СЊ РІС‹Р±СЂР°РЅРЅС‹Рµ
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setImportOpen(false);
                            setSelectedImportOrderIds([]);
                          }}
                          className={btnSecondary}
                        >
                          РћС‚РјРµРЅР°
                        </button>
                      </div>
                      </div>
                    </div>
                  ) : null}
                  <form
                    onSubmit={addSection}
                    className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <input
                      value={newSectionTitle}
                      onChange={(e) => setNewSectionTitle(e.target.value)}
                      placeholder="РќР°Р·РІР°РЅРёРµ СЂР°Р·РґРµР»Р° РїРѕРґСЂСЏРґС‡РёРєРѕРІ"
                      className={`min-w-[12rem] flex-1 ${inputField} bg-white`}
                      maxLength={200}
                    />
                    <button type="submit" disabled={busy} className={`${btnPrimary} rounded-2xl`}>
                      Р”РѕР±Р°РІРёС‚СЊ СЂР°Р·РґРµР»
                    </button>
                  </form>
                </div>
              ) : null}

              <div className="space-y-4">
                {renderedSections.map((sec) =>
                  isRequisiteSectionWithOrder(sec) ? (
                    <RequisiteSectionEditor
                      key={sec.id}
                      sec={sec}
                      projectId={projectId}
                      orderId={sec.linkedOrderId}
                      orderMeta={orderMetaById.get(sec.linkedOrderId) ?? null}
                      readOnly={readOnly}
                      busy={busy}
                      onPatchSection={patchSection}
                      onDeleteSection={deleteServerSection}
                      onDone={() => {
                        load(selectedVersion);
                        refreshActivity();
                      }}
                    />
                  ) : (
                    <EstimateSectionBlock
                      key={sec.id}
                      sec={sec}
                      orderMeta={sec.linkedOrderId ? orderMetaById.get(sec.linkedOrderId) ?? null : null}
                      readOnly={readOnly}
                      busy={busy}
                      onPatchSection={patchSection}
                      onDeleteSection={deleteSection}
                    >
                      {isDraftRequisiteSection(sec) ? (
                        <DraftRequisiteEditor
                          projectId={projectId}
                          sec={sec}
                          readOnly={readOnly}
                          onDone={() => {
                            load(selectedVersion);
                            refreshActivity();
                          }}
                        />
                      ) : (
                        <>
                          {sec.lines.map((ln) => (
                            <LineEditor
                              key={ln.id}
                              sectionId={sec.id}
                              sectionKind="CONTRACTOR"
                              line={ln}
                              isDirty={dirtyLocalLineIds.has(ln.id)}
                              readOnly={readOnly}
                              busy={busy}
                              onSave={saveLine}
                              onDelete={deleteLine}
                            />
                          ))}

                          {!readOnly ? (
                            <div className="border-t border-dashed border-zinc-200 pt-2">
                              <button
                                type="button"
                                disabled={busy}
                                className={`${btnSecondaryXs} border-violet-200 bg-violet-50/80 font-semibold text-violet-900 hover:bg-violet-100`}
                                onClick={() => addEmptyLine(sec.id)}
                              >
                                {sec.lines.length === 0 ? "+ Р”РѕР±Р°РІРёС‚СЊ СЃС‚СЂРѕРєСѓ" : "+ РЎС‚СЂРѕРєР°"}
                              </button>
                            </div>
                          ) : null}
                        </>
                      )}
                    </EstimateSectionBlock>
                  ),
                )}
              </div>

              <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-white/85 p-3 xl:grid-cols-[1.15fr_0.95fr_1fr]">
                <div className="rounded-2xl border border-violet-200 bg-violet-50/80 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-violet-800">РљР»РёРµРЅС‚</div>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-600">РЎСѓРјРјР° РїРѕ СѓСЃР»СѓРіР°Рј</span>
                      <span className="font-bold tabular-nums text-violet-950">{money(totals.clientSubtotal)} в‚Ѕ</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <EstimateFinanceToggle
                        label={`РљРѕРјРёСЃСЃРёСЏ ${Math.round(PROJECT_ESTIMATE_COMMISSION_RATE * 100)}%`}
                        checked={commissionEnabled}
                        disabled={readOnly || busy}
                        onChange={(value) => {
                          setCommissionEnabled(value);
                          setEstimateDraftDirty(true);
                        }}
                      />
                      <span className="font-bold tabular-nums text-violet-950">{money(totals.commission)} в‚Ѕ</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-violet-200 pt-2 text-base">
                      <span className="font-extrabold text-violet-950">РС‚РѕРіРѕ РєР»РёРµРЅС‚Сѓ</span>
                      <span className="font-black tabular-nums text-violet-950">{money(totals.revenueTotal)} в‚Ѕ</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50/90 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-700">Р’РЅСѓС‚СЂРµРЅРЅРµРµ</div>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-600">РЎРµР±РµСЃС‚РѕРёРјРѕСЃС‚СЊ</span>
                      <span className="font-bold tabular-nums text-zinc-950">{money(totals.internalSubtotal)} в‚Ѕ</span>
                    </div>
                    {totals.cashInternalCostTax > 0 ? (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-zinc-600">РќР°Р»РѕРі РЅР° РЅР°Р»РёС‡РєСѓ 3.5%</span>
                        <span className="font-bold tabular-nums text-zinc-950">{money(totals.cashInternalCostTax)} в‚Ѕ</span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-600">Р Р°СЃС…РѕРґС‹ Р±РµР· РЅР°Р»РѕРіР° 6%</span>
                      <span className="font-bold tabular-nums text-zinc-950">{money(totals.internalWithCashTax)} в‚Ѕ</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <EstimateFinanceToggle
                        label={`РќР°Р»РѕРі ${Math.round(PROJECT_ESTIMATE_TAX_RATE * 100)}%`}
                        checked={clientTaxEnabled}
                        disabled={readOnly || busy}
                        onChange={(value) => {
                          setClientTaxEnabled(value);
                          setEstimateDraftDirty(true);
                        }}
                      />
                      <span className="font-bold tabular-nums text-zinc-950">{money(totals.tax6)} в‚Ѕ</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-zinc-200 pt-2">
                      <span className="font-semibold text-zinc-700">Р Р°СЃС…РѕРґС‹ РІСЃРµРіРѕ</span>
                      <span className="font-extrabold tabular-nums text-zinc-950">{money(totals.totalExpensesWithTax)} в‚Ѕ</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-zinc-700">Р’Р°Р»РѕРІР°СЏ РјР°СЂР¶Р°</span>
                      <span className="font-extrabold tabular-nums text-zinc-950">{money(totals.grossMargin)} в‚Ѕ</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">РњР°СЂР¶Р°</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <div>
                      <div className="text-xs font-semibold text-emerald-900">РџРѕСЃР»Рµ РЅР°Р»РѕРіР°</div>
                      <div className="mt-1 text-xl font-black tabular-nums text-emerald-950">{money(totals.marginAfterTax)} в‚Ѕ</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-emerald-900">Р РµРЅС‚Р°Р±РµР»СЊРЅРѕСЃС‚СЊ</div>
                      <div className="mt-1 text-xl font-black tabular-nums text-emerald-950">
                        {Number.isFinite(totals.marginAfterTaxPct) ? `${totals.marginAfterTaxPct.toFixed(0)}%` : "вЂ”"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {!readOnly && data?.current ? (
                <div className="flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-violet-200 bg-[linear-gradient(135deg,rgba(237,233,254,0.55),rgba(255,255,255,0.98),rgba(196,181,253,0.12))] p-4">
                  <button
                    type="button"
                    disabled={busy || !estimateDraftDirty}
                    onClick={discardEstimateDraft}
                    className={`${btnSecondary} min-h-11`}
                  >
                    РЎР±СЂРѕСЃРёС‚СЊ С‡РµСЂРЅРѕРІРёРє
                  </button>
                  <button
                    type="button"
                    disabled={busy || !estimateDraftDirty}
                    onClick={() => void saveEstimateDraft()}
                    className="min-h-12 rounded-xl border border-violet-500 bg-[linear-gradient(135deg,#7c3aed,#6d28d9)] px-5 py-3 text-sm font-extrabold text-white shadow-[0_12px_28px_rgba(124,58,237,0.28)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? "РЎРѕС…СЂР°РЅСЏСЋ СЃРјРµС‚СѓвЂ¦" : "РЎРѕС…СЂР°РЅРёС‚СЊ СЃРјРµС‚Сѓ"}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}

function EstimateSectionBlock({
  sec,
  orderMeta,
  readOnly,
  busy,
  onPatchSection,
  onDeleteSection,
  children,
  summaryTitleAddon,
  summaryTrailing,
}: {
  sec: EstSection | LocalDraftSection;
  orderMeta: { index: number; label: string; dateLabel: string; status: string; eventName: string | null } | null;
  readOnly: boolean;
  busy: boolean;
  onPatchSection: (id: string, patch: { title?: string }) => void | Promise<void>;
  onDeleteSection: (id: string) => void | Promise<void>;
  children: React.ReactNode;
  /** Р СЏРґРѕРј СЃ Р·Р°РіРѕР»РѕРІРєРѕРј СЃРµРєС†РёРё (РЅР°РїСЂРёРјРµСЂ, РёРЅРґРёРєР°С‚РѕСЂ СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёСЏ Р·Р°СЏРІРєРё). */
  summaryTitleAddon?: React.ReactNode;
  /** Р•СЃР»Рё Р·Р°РґР°РЅРѕ вЂ” РїРѕРґРјРµРЅСЏРµС‚ СЃС‚Р°РЅРґР°СЂС‚РЅСѓСЋ РєРѕР»РѕРЅРєСѓ В«РћС‚РєСЂС‹С‚СЊ Р·Р°СЏРІРєСѓВ» СЃРїСЂР°РІР° РІ summary. */
  summaryTrailing?: React.ReactNode;
}) {
  const [titleDraft, setTitleDraft] = React.useState(sec.title);
  const [editingTitle, setEditingTitle] = React.useState(false);

  React.useEffect(() => {
    setTitleDraft(sec.title);
    setEditingTitle(false);
  }, [sec.id, sec.title]);

  function saveTitle() {
    const t = titleDraft.trim();
    if (!t || t === sec.title) return;
    void onPatchSection(sec.id, { title: t });
  }

  const sectionClientSubtotal = roundMoney(
    sec.lines.reduce((sum, line) => sum + getNumericAmount(line.costClient), 0),
  );
  const sectionInternalSubtotal = roundMoney(
    sec.lines.reduce((sum, line) => sum + getNumericAmount(line.costInternal), 0),
  );

  return (
    <details
      className={`group rounded-2xl border p-3 shadow-sm sm:p-4 ${
        sec.kind === "REQUISITE"
          ? sectionTone.requisite
          : sec.kind === "DRAFT_REQUISITE"
            ? sectionTone.draftRequisite
            : sec.kind === "CONTRACTOR"
              ? sectionTone.contractor
              : sectionTone.local
      }`}
      open
    >
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  sec.kind === "REQUISITE"
                    ? "border border-violet-200 bg-violet-100 text-violet-900"
                    : sec.kind === "DRAFT_REQUISITE"
                      ? "border border-fuchsia-200 bg-fuchsia-100 text-fuchsia-900"
                      : sec.kind === "CONTRACTOR"
                        ? "border border-zinc-300 bg-zinc-100 text-zinc-900"
                    : "border border-indigo-200 bg-indigo-50 text-indigo-950"
                }`}
              >
                {sec.kind === "REQUISITE"
                  ? "Р РµРєРІРёР·РёС‚"
                  : sec.kind === "DRAFT_REQUISITE"
                    ? "Demo-СЂРµРєРІРёР·РёС‚"
                    : sec.kind === "CONTRACTOR"
                      ? "РџРѕРґСЂСЏРґС‡РёРєРё"
                    : "РЈРЅРёРІРµСЂСЃР°Р»СЊРЅС‹Р№"}
              </span>
              {orderMeta ? (
                <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
                  {orderMeta.label}
                </span>
              ) : null}
              {sec.kind === "CONTRACTOR" ? (
                <EstimateHelpLegend title="Р Р°Р·РґРµР» РїРѕРґСЂСЏРґС‡РёРєРѕРІ">
                  Р”РѕР±Р°РІР»СЏР№ СЃСЋРґР° СѓСЃР»СѓРіРё, РєРѕС‚РѕСЂС‹Рµ РґРµР»Р°РµС‚ РїРѕРґСЂСЏРґС‡РёРє РёР»Рё РєРѕРјР°РЅРґР°. РљР»РёРµРЅС‚ СѓРІРёРґРёС‚ РЅР°Р·РІР°РЅРёРµ, РѕРїРёСЃР°РЅРёРµ Рё С†РµРЅСѓ. Р’РЅСѓС‚СЂРµРЅРЅРёРµ РїРѕР»СЏ РЅСѓР¶РЅС‹ С‚РѕР»СЊРєРѕ РЅР°Рј: СЃРєРѕР»СЊРєРѕ СЂРµР°Р»СЊРЅРѕ СЃС‚РѕРёС‚ СЂР°Р±РѕС‚Р° Рё РєР°Рє РµРµ РѕРїР»Р°С‚РёР»Рё.
                </EstimateHelpLegend>
              ) : sec.kind === "DRAFT_REQUISITE" ? (
                <EstimateHelpLegend title="Demo-СЂРµРєРІРёР·РёС‚">
                  Р­С‚Рѕ РїСЂРµРґРІР°СЂРёС‚РµР»СЊРЅС‹Р№ СЃРїРёСЃРѕРє СЂРµРєРІРёР·РёС‚Р° Р±РµР· РґР°С‚. РћРЅ РїРѕРјРѕРіР°РµС‚ РїРѕСЃС‡РёС‚Р°С‚СЊ СЃРјРµС‚Сѓ Р·Р°СЂР°РЅРµРµ, РЅРѕ СЃРєР»Р°Рґ РЅРёС‡РµРіРѕ РЅРµ СЂРµР·РµСЂРІРёСЂСѓРµС‚ РґРѕ СЃРѕР·РґР°РЅРёСЏ СЂРµР°Р»СЊРЅРѕР№ Р·Р°СЏРІРєРё.
                </EstimateHelpLegend>
              ) : sec.kind === "LOCAL" ? (
                <EstimateHelpLegend title="РЈРЅРёРІРµСЂСЃР°Р»СЊРЅС‹Р№ СЂР°Р·РґРµР»">
                  РСЃРїРѕР»СЊР·СѓР№ РµРіРѕ РґР»СЏ СЂСѓС‡РЅС‹С… СЃС‚СЂРѕРє СЃРјРµС‚С‹, РєРѕС‚РѕСЂС‹Рµ РЅРµ РѕС‚РЅРѕСЃСЏС‚СЃСЏ Рє Р·Р°СЏРІРєРµ СЂРµРєРІРёР·РёС‚Р°: СѓСЃР»СѓРіРё, СЂР°Р·РѕРІС‹Рµ СЂР°СЃС…РѕРґС‹, РЅРµСЃС‚Р°РЅРґР°СЂС‚РЅС‹Рµ РїРѕР·РёС†РёРё.
                </EstimateHelpLegend>
              ) : null}
            </div>
            <div
              className={`mt-2 text-lg font-semibold text-zinc-950 ${summaryTitleAddon ? "flex min-w-0 flex-wrap items-center gap-2" : ""}`}
            >
              {summaryTitleAddon}
              <span className="min-w-0">
                {sec.kind === "REQUISITE"
                  ? orderMeta?.label ?? "Р РµРєРІРёР·РёС‚"
                  : sec.kind === "DRAFT_REQUISITE"
                    ? sec.title
                    : sec.title}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
              {sec.kind === "REQUISITE" ? (
                <>
                  {orderMeta?.eventName?.trim() ? (
                    <span className="rounded-full border border-zinc-200 bg-white/80 px-2 py-1">
                      {orderMeta.eventName}
                    </span>
                  ) : null}
                  {orderMeta?.dateLabel ? (
                    <span className="rounded-full border border-zinc-200 bg-white/80 px-2 py-1">
                      {orderMeta.dateLabel
                        .split(" вЂ” ")
                        .map((value) => formatDateRu(value))
                        .join(" вЂ” ")}
                    </span>
                  ) : null}
                </>
              ) : sec.kind === "DRAFT_REQUISITE" ? (
                <span className="rounded-full border border-fuchsia-100 bg-white/75 px-2 py-1">
                  {sec.lines.length} РїРѕР·. В· demo Р±РµР· СЂРµР·РµСЂРІР°
                </span>
              ) : sec.kind === "CONTRACTOR" ? (
                <span className="rounded-full border border-zinc-200 bg-white/75 px-2 py-1">
                  {sec.lines.length} СЃС‚СЂРѕРє В· РїРѕРґСЂСЏРґС‡РёРєРё Рё СѓСЃР»СѓРіРё
                </span>
              ) : (
                <span className="rounded-full border border-indigo-100 bg-white/75 px-2 py-1">
                  {sec.lines.length} СЃС‚СЂРѕРє В· СЂСѓС‡РЅРѕР№ СЂР°Р·РґРµР»
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-start justify-end gap-2 self-start">
            <div className="flex w-full flex-wrap justify-end gap-2 group-open:hidden sm:w-auto">
              <div className="min-w-[8.5rem] rounded-2xl border border-violet-200 bg-violet-50/80 px-3 py-2 text-right shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-wide text-violet-700">РЈСЃР»СѓРіРё</div>
                <div className="mt-0.5 text-sm font-black tabular-nums text-violet-950">{formatMoneyRub(sectionClientSubtotal)} в‚Ѕ</div>
              </div>
              <div className="min-w-[8.5rem] rounded-2xl border border-zinc-200 bg-zinc-50/90 px-3 py-2 text-right shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">РЎРµР±РµСЃС‚РѕРёРјРѕСЃС‚СЊ</div>
                <div className="mt-0.5 text-sm font-black tabular-nums text-zinc-950">{formatMoneyRub(sectionInternalSubtotal)} в‚Ѕ</div>
              </div>
            </div>
            {!readOnly && (sec.kind === "LOCAL" || sec.kind === "CONTRACTOR") && !editingTitle ? (
              <>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white/90 text-zinc-500 shadow-sm hover:border-violet-200 hover:text-violet-700"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditingTitle(true);
                  }}
                  disabled={busy}
                  title="Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ РЅР°Р·РІР°РЅРёРµ СЂР°Р·РґРµР»Р°"
                  aria-label="Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ РЅР°Р·РІР°РЅРёРµ СЂР°Р·РґРµР»Р°"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l9.06-9.06.92.92L5.92 20.08zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-red-200 bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-red-700 shadow-sm hover:bg-red-50"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void onDeleteSection(sec.id);
                  }}
                  disabled={busy}
                >
                  РЈРґР°Р»РёС‚СЊ СЂР°Р·РґРµР»
                </button>
              </>
            ) : null}
            {summaryTrailing !== undefined ? (
              summaryTrailing
            ) : sec.linkedOrderId ? (
              <Link
                href={`/orders/${sec.linkedOrderId}`}
                className="rounded-lg border border-violet-200 bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:text-violet-900"
                onClick={(e) => e.stopPropagation()}
              >
                РћС‚РєСЂС‹С‚СЊ Р·Р°СЏРІРєСѓ
              </Link>
            ) : null}
            <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 text-zinc-400" aria-hidden>
              <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.1 1.02l-4.25 4.5a.75.75 0 01-1.1 0l-4.25-4.5a.75.75 0 01.02-1.06z" fill="currentColor" />
            </svg>
          </div>
        </div>
      </summary>
      <div className="mt-3 space-y-3">
        {!readOnly ? (
          (sec.kind === "LOCAL" || sec.kind === "CONTRACTOR") && editingTitle ? (
            <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 p-2.5 sm:flex-row sm:flex-wrap sm:items-end">
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                placeholder="РќР°Р·РІР°РЅРёРµ СЂР°Р·РґРµР»Р°"
                className="min-w-[10rem] flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/50"
                maxLength={200}
              />
              <button
                type="button"
                disabled={busy || titleDraft.trim() === sec.title.trim() || !titleDraft.trim()}
                className={btnPrimary}
                onClick={() => {
                  void saveTitle();
                  setEditingTitle(false);
                }}
              >
                РЎРѕС…СЂР°РЅРёС‚СЊ
              </button>
              <button
                type="button"
                className={btnSecondary}
                onClick={() => {
                  setTitleDraft(sec.title);
                  setEditingTitle(false);
                }}
              >
                РћС‚РјРµРЅР°
              </button>
            </div>
          ) : sec.kind === "LOCAL" || sec.kind === "CONTRACTOR" ? (
            <div className="hidden">
              <button
                type="button"
                className={btnGhostXs}
                onClick={() => setEditingTitle(true)}
                disabled={busy}
                title="Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ РЅР°Р·РІР°РЅРёРµ СЂР°Р·РґРµР»Р°"
                aria-label="Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ РЅР°Р·РІР°РЅРёРµ СЂР°Р·РґРµР»Р°"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l9.06-9.06.92.92L5.92 20.08zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                </svg>
                <span>РќР°Р·РІР°РЅРёРµ</span>
              </button>
              {sec.kind === "LOCAL" || sec.kind === "CONTRACTOR" ? (
                <button
                  type="button"
                  className={`${btnGhostXs} border-red-200 text-red-700 hover:bg-red-50`}
                  onClick={() => void onDeleteSection(sec.id)}
                  disabled={busy}
                >
                  РЈРґР°Р»РёС‚СЊ СЂР°Р·РґРµР»
                </button>
              ) : null}
            </div>
          ) : null
        ) : null}

        {children}
      </div>
    </details>
  );
}

const cellXs = "rounded border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-200/50";

/** РЎРµС‚РєР° СЃС‚СЂРѕРєРё В«РєР»РёРµРЅС‚СЃРєРёРµВ» РєРѕР»РѕРЅРєРё вЂ” СЃРѕРІРїР°РґР°РµС‚ РІ СЂРµРґР°РєС‚РѕСЂРµ Рё РІ С„РѕСЂРјРµ РґРѕР±Р°РІР»РµРЅРёСЏ. */
const ESTIMATE_CLIENT_ROW_GRID =
  "grid gap-1.5 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_4.5rem_4rem_4.5rem_4.5rem]";

const PAYMENT_METHOD_OPTIONS = ["РќР°Р»РёС‡РЅС‹Рµ", "Р‘РµР·РЅР°Р»"] as const;
const PAYMENT_STATUS_PAID = "РћРїР»Р°С‡РµРЅРѕ";
const PAYMENT_STATUS_UNPAID = "РќРµ РѕРїР»Р°С‡РµРЅРѕ";
/** РЈРЅРёРєР°Р»СЊРЅС‹Р№ id datalist РґР»СЏ РєРѕРјР±РѕР±РѕРєСЃР° СЃС‚Р°С‚СѓСЃР° (input list=вЂ¦ + datalist). */
const paymentStatusDatalistId = (suffix: string) => `project-estimate-pst-${suffix}`;

/** РЎСѓРјРјР° РєР»РёРµРЅС‚Сѓ: С‚РѕР»СЊРєРѕ qtyГ—С†РµРЅР°; РёРЅР°С‡Рµ РЅР°СЃР»РµРґРѕРІР°РЅРЅС‹Р№ costClient (СЃС‚Р°СЂС‹Рµ СЃС‚СЂРѕРєРё). */
function displayLocalLineClientSum(line: {
  costClient?: string | null;
  qty?: string | number | null;
  unitPriceClient?: string | number | null;
}): string {
  return normalizedLocalLineCostClientString(line) ?? "вЂ”";
}

/** Р¦РІРµС‚ С‚РµРєСЃС‚Р° Р·РЅР°С‡РµРЅРёСЏ СЃС‚Р°С‚СѓСЃР° (Р±РµР· С„РѕРЅР° Рё Р°РЅРёРјР°С†РёРё). */
function paymentStatusTextClass(raw: string | null | undefined): string {
  const t = raw?.trim() ?? "";
  if (t === PAYMENT_STATUS_PAID) return "font-semibold text-emerald-700";
  if (t === PAYMENT_STATUS_UNPAID) return "font-semibold text-red-700";
  return "text-zinc-900";
}

function LineEditor({
  sectionId,
  sectionKind,
  line,
  isDirty,
  readOnly,
  busy,
  onSave,
  onDelete,
}: {
  sectionId: string;
  sectionKind: "LOCAL" | "CONTRACTOR";
  line: LocalDraftLine | (EstLine & { unit?: string | null; paymentMethod?: string | null });
  isDirty: boolean;
  readOnly: boolean;
  busy: boolean;
  onSave: (sectionId: string, id: string, p: Record<string, unknown>) => void;
  onDelete: (sectionId: string, id: string) => void;
}) {
  const isContractor = sectionKind === "CONTRACTOR";
  const paymentStatusRaw = "paymentStatus" in line ? line.paymentStatus : null;
  const unitVal = line.unit?.trim() ? line.unit : "";
  const qtyStr =
    "qty" in line && line.qty != null && line.qty !== ""
      ? String(line.qty)
      : "";
  const upStr =
    "unitPriceClient" in line && line.unitPriceClient != null && line.unitPriceClient !== ""
      ? String(line.unitPriceClient)
      : "";

  if (!readOnly && isContractor) {
    const paymentMethodRaw = ("paymentMethod" in line ? line.paymentMethod : null)?.trim() || "";
    const contractorNote = "contractorNote" in line ? (line.contractorNote ?? "") : "";
    const contractorRequisites = "contractorRequisites" in line ? (line.contractorRequisites ?? "") : "";
    const clientSum = displayLocalLineClientSum(line);
    const contractorClientGrid =
      "grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1.1fr)_5.5rem_5.5rem_6rem_7rem]";
    const paymentMethodOptions = [
      { value: "", label: "вЂ”" },
      { value: PAYMENT_METHOD_OPTIONS[0], label: "РќР°Р»." },
      { value: PAYMENT_METHOD_OPTIONS[1], label: "Р‘РµР·РЅР°Р»" },
    ];
    const paymentStatusOptions = [
      { value: "", label: "вЂ”" },
      { value: PAYMENT_STATUS_PAID, label: "РћРїР»Р°С‡РµРЅРѕ" },
      { value: PAYMENT_STATUS_UNPAID, label: "РќРµ РѕРїР»Р°С‡РµРЅРѕ" },
    ];

    return (
      <div
        className={`relative rounded-2xl border p-3 text-xs shadow-sm transition ${
          isDirty
            ? "border-orange-300 bg-[linear-gradient(135deg,rgba(255,247,237,0.9),rgba(255,255,255,1))]"
            : "border-zinc-200 bg-white"
        }`}
      >
        <div className="mb-3 flex items-start justify-between gap-3 pr-9">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-violet-200 bg-violet-50 px-2 text-[11px] font-bold text-violet-800">
              {line.lineNumber}
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wide text-violet-700">РљР»РёРµРЅС‚Сѓ</div>
              <div className="truncate text-sm font-semibold text-zinc-950">{line.name || "РќРѕРІР°СЏ РїРѕР·РёС†РёСЏ"}</div>
            </div>
          </div>
          {isDirty ? (
            <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700">
              РёР·РјРµРЅРµРЅРѕ
            </span>
          ) : null}
        </div>

        {!line.orderLineId ? (
          <button
            type="button"
            disabled={busy}
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            onClick={() => void onDelete(sectionId, line.id)}
            title="РЈРґР°Р»РёС‚СЊ РїРѕР·РёС†РёСЋ"
            aria-label="РЈРґР°Р»РёС‚СЊ РїРѕР·РёС†РёСЋ"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
              <path
                d="M5.75 5.75l8.5 8.5m0-8.5l-8.5 8.5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
              />
            </svg>
          </button>
        ) : null}

        <div className="rounded-2xl border border-violet-100 bg-violet-50/35 p-3">
          <div className={contractorClientGrid}>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              РџРѕР·РёС†РёСЏ
              <input
                value={line.name}
                onChange={(e) => onSave(sectionId, line.id, { name: e.target.value })}
                className={`mt-1 w-full ${cellXs}`}
              />
            </label>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              РћРїРёСЃР°РЅРёРµ
              <input
                value={line.description ?? ""}
                onChange={(e) => onSave(sectionId, line.id, { description: e.target.value })}
                className={`mt-1 w-full ${cellXs}`}
              />
            </label>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Р•Рґ.
              <input
                value={unitVal}
                onChange={(e) => onSave(sectionId, line.id, { unit: e.target.value })}
                className={`mt-1 w-full ${cellXs}`}
                list={UNIT_DATALIST_ID}
                placeholder="С€С‚"
              />
            </label>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              РљРѕР»-РІРѕ
              <input
                value={qtyStr}
                onChange={(e) => onSave(sectionId, line.id, { qty: e.target.value })}
                className={`mt-1 w-full ${cellXs} tabular-nums`}
                inputMode="decimal"
              />
            </label>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Р¦РµРЅР°/РµРґ.
              <input
                value={upStr}
                onChange={(e) => onSave(sectionId, line.id, { unitPriceClient: e.target.value })}
                className={`mt-1 w-full ${cellXs} tabular-nums`}
                inputMode="decimal"
              />
            </label>
            <div className="rounded-xl border border-violet-200 bg-white/80 px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-violet-700">РЎСѓРјРјР°</div>
              <div className="mt-1 text-sm font-extrabold tabular-nums text-violet-950">
                {clientSum}
                {clientSum !== "вЂ”" ? <span className="ml-0.5 text-xs font-semibold text-violet-500">в‚Ѕ</span> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-600">Р’РЅСѓС‚СЂРµРЅРЅРµРµ</div>
          <div className="grid gap-2 xl:grid-cols-[6rem_9rem_13rem_minmax(0,1fr)_minmax(0,1fr)]">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Р’РЅСѓС‚СЂ. в‚Ѕ
              <input
                value={line.costInternal ?? ""}
                onChange={(e) => onSave(sectionId, line.id, { costInternal: e.target.value })}
                className={`mt-1 w-full ${cellXs} tabular-nums`}
                inputMode="decimal"
              />
            </label>
            <div className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              РћРїР»Р°С‚Р°
              <div className="mt-1 grid min-h-8 grid-cols-3 rounded-xl border border-zinc-200 bg-white p-0.5 shadow-sm">
                {paymentMethodOptions.map((opt) => {
                  const value = opt.value;
                  const active = paymentMethodRaw === value;
                  return (
                    <button
                      key={value || "empty"}
                      type="button"
                      className={`min-w-0 truncate rounded-lg px-1.5 py-1.5 text-[11px] font-semibold leading-none transition ${
                        active ? "bg-violet-600 text-white shadow-sm" : "text-zinc-600 hover:bg-zinc-50"
                      }`}
                      onClick={() => onSave(sectionId, line.id, { paymentMethod: value === "" ? null : value })}
                      title={opt.label}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="block min-w-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              РЎС‚Р°С‚СѓСЃ РѕРїР»Р°С‚С‹
              <div className="mt-1 grid min-h-8 grid-cols-3 rounded-xl border border-zinc-200 bg-white p-0.5 shadow-sm">
                {paymentStatusOptions.map((opt) => {
                  const active = (paymentStatusRaw ?? "") === opt.value;
                  const paid = opt.value === PAYMENT_STATUS_PAID;
                  const unpaid = opt.value === PAYMENT_STATUS_UNPAID;
                  return (
                    <button
                      key={opt.value || "empty"}
                      type="button"
                      className={`min-w-0 truncate rounded-lg px-1.5 py-1.5 text-[11px] font-semibold leading-none transition ${
                        active
                          ? paid
                            ? "bg-emerald-600 text-white shadow-sm"
                            : unpaid
                              ? "bg-rose-600 text-white shadow-sm"
                              : "bg-zinc-700 text-white shadow-sm"
                          : "text-zinc-600 hover:bg-zinc-50"
                      }`}
                      onClick={() =>
                        onSave(sectionId, line.id, {
                          paymentStatus: opt.value === "" ? null : opt.value,
                        })
                      }
                      title={opt.label}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="block min-w-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              РљРѕРјРјРµРЅС‚. РїРѕРґСЂСЏРґС‡РёРєСѓ
              <input
                value={contractorNote}
                onChange={(e) => onSave(sectionId, line.id, { contractorNote: e.target.value })}
                className={`mt-1 w-full ${cellXs}`}
              />
            </label>
            <label className="block min-w-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Р РµРєРІРёР·РёС‚С‹ / СЃС‡С‘С‚
              <input
                value={contractorRequisites}
                onChange={(e) => onSave(sectionId, line.id, { contractorRequisites: e.target.value })}
                className={`mt-1 w-full ${cellXs}`}
              />
            </label>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border p-2 text-xs shadow-sm ${
        isDirty
          ? "border-orange-300 bg-[linear-gradient(135deg,rgba(254,215,170,0.72),rgba(255,255,255,1))]"
          : "border-zinc-100 bg-zinc-50/60"
      }`}
    >
      <div className="mb-1 text-[10px] font-medium text-zinc-500">
        в„–{line.lineNumber}
        {line.orderLineId ? " В· РёР· Р·Р°СЏРІРєРё" : ""}
      </div>
      {readOnly ? (
        <div className="mt-0.5 space-y-0.5">
          <div className="font-medium">{line.name}</div>
          {line.description ? <div className="text-[11px] text-zinc-600">{line.description}</div> : null}
          <div className="text-[11px]">
            {qtyStr || "вЂ”"} Г— {upStr || "вЂ”"} в†’ {displayLocalLineClientSum(line)} в‚Ѕ В· РІРЅСѓС‚СЂ. {line.costInternal ?? "вЂ”"}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded-lg border border-violet-200/80 bg-violet-50/50 p-2">
            <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-violet-900/85">РљР»РёРµРЅС‚Сѓ</div>
            <div className={ESTIMATE_CLIENT_ROW_GRID}>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                РџРѕР·РёС†РёСЏ
                <input
                  value={line.name}
                  onChange={(e) => onSave(sectionId, line.id, { name: e.target.value })}
                  className={`mt-0.5 w-full ${cellXs}`}
                />
              </label>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                РћРїРёСЃР°РЅРёРµ
                <input
                  value={line.description ?? ""}
                  onChange={(e) => onSave(sectionId, line.id, { description: e.target.value })}
                  className={`mt-0.5 w-full ${cellXs}`}
                />
              </label>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Р•Рґ.
                <input
                  value={unitVal}
                  onChange={(e) => onSave(sectionId, line.id, { unit: e.target.value })}
                  className={`mt-0.5 w-full ${cellXs}`}
                  list={UNIT_DATALIST_ID}
                  placeholder="С€С‚"
                />
              </label>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                РљРѕР»-РІРѕ
                <input
                  value={qtyStr}
                  onChange={(e) => onSave(sectionId, line.id, { qty: e.target.value })}
                  className={`mt-0.5 w-full ${cellXs} tabular-nums`}
                  inputMode="decimal"
                />
              </label>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Р¦РµРЅР°/РµРґ
                <input
                  value={upStr}
                  onChange={(e) => onSave(sectionId, line.id, { unitPriceClient: e.target.value })}
                  className={`mt-0.5 w-full ${cellXs} tabular-nums`}
                  inputMode="decimal"
                />
              </label>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                РЎСѓРјРјР°
                <div
                  className={`mt-0.5 flex min-h-[1.75rem] w-full items-center tabular-nums ${cellXs} bg-zinc-100/90 text-zinc-800`}
                  title="РЎС‡РёС‚Р°РµС‚СЃСЏ РєР°Рє РєРѕР»РёС‡РµСЃС‚РІРѕ Г— С†РµРЅР° Р·Р° РµРґ."
                >
                  {displayLocalLineClientSum(line)}
                  {displayLocalLineClientSum(line) !== "вЂ”" ? <span className="ml-0.5 text-zinc-500">в‚Ѕ</span> : null}
                </div>
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200/95 bg-zinc-50/85 p-2">
            <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-zinc-600">РќР°С€Рё РїРѕР»СЏ</div>
            {isContractor ? (
              <div className="grid gap-1.5 xl:grid-cols-[4.5rem_7rem_1fr_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Р’РЅСѓС‚СЂ.
                  <input
                    value={line.costInternal ?? ""}
                    onChange={(e) => onSave(sectionId, line.id, { costInternal: e.target.value })}
                    className={`mt-0.5 w-full ${cellXs} tabular-nums`}
                    inputMode="decimal"
                  />
                </label>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  РћРїР»Р°С‚Р°
                  <select
                    value={("paymentMethod" in line ? line.paymentMethod : null)?.trim() || ""}
                    onChange={(e) =>
                      onSave(sectionId, line.id, {
                        paymentMethod: e.target.value === "" ? null : e.target.value,
                      })
                    }
                    className={`mt-0.5 w-full ${cellXs} bg-white`}
                  >
                    <option value="">вЂ”</option>
                    {PAYMENT_METHOD_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block min-w-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 xl:col-span-1">
                  РЎС‚Р°С‚СѓСЃ РѕРїР»Р°С‚С‹
                  <input
                    value={paymentStatusRaw ?? ""}
                    onChange={(e) => {
                      const t = e.target.value;
                      onSave(sectionId, line.id, {
                        paymentStatus: t.trim() === "" ? null : t,
                      });
                    }}
                    list={paymentStatusDatalistId(line.id)}
                    placeholder="Р’С‹Р±РµСЂРёС‚Рµ РёР· СЃРїРёСЃРєР° РёР»Рё РІРІРµРґРёС‚Рµ"
                    autoComplete="off"
                    className={`mt-0.5 w-full min-w-0 ${cellXs} bg-white ${paymentStatusTextClass(paymentStatusRaw)}`}
                  />
                  <datalist id={paymentStatusDatalistId(line.id)}>
                    <option value={PAYMENT_STATUS_PAID} />
                    <option value={PAYMENT_STATUS_UNPAID} />
                  </datalist>
                </label>
                <label className="block min-w-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 xl:col-span-1">
                  РљРѕРјРјРµРЅС‚. РїРѕРґСЂСЏРґС‡РёРєСѓ
                  <input
                    value={"contractorNote" in line ? (line.contractorNote ?? "") : ""}
                    onChange={(e) => onSave(sectionId, line.id, { contractorNote: e.target.value })}
                    className={`mt-0.5 w-full ${cellXs}`}
                  />
                </label>
                <label className="block min-w-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 xl:col-span-1">
                  Р РµРєРІРёР·РёС‚С‹ / СЃС‡С‘С‚
                  <input
                    value={"contractorRequisites" in line ? (line.contractorRequisites ?? "") : ""}
                    onChange={(e) => onSave(sectionId, line.id, { contractorRequisites: e.target.value })}
                    className={`mt-0.5 w-full ${cellXs}`}
                  />
                </label>
                <div className="flex items-end justify-end">
                  {!line.orderLineId ? (
                    <button
                      type="button"
                      disabled={busy}
                      className={`${btnGhostXs} border-red-200 text-red-700 hover:bg-red-50`}
                      onClick={() => void onDelete(sectionId, line.id)}
                    >
                      РЈРґ.
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Р’РЅСѓС‚СЂ.
                  <input
                    value={line.costInternal ?? ""}
                    onChange={(e) => onSave(sectionId, line.id, { costInternal: e.target.value })}
                    className={`mt-0.5 w-full min-w-[4.5rem] ${cellXs} tabular-nums`}
                    inputMode="decimal"
                  />
                </label>
                {!line.orderLineId ? (
                  <button
                    type="button"
                    disabled={busy}
                    className={`${btnGhostXs} border-red-200 text-red-700 hover:bg-red-50`}
                    onClick={() => void onDelete(sectionId, line.id)}
                  >
                    РЈРґ.
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RequisiteSectionEditor({
  sec,
  projectId,
  orderId,
  orderMeta,
  readOnly,
  busy,
  onPatchSection,
  onDeleteSection,
  onDone,
}: {
  sec: EstSection;
  projectId: string;
  orderId: string;
  orderMeta: { index: number; label: string; dateLabel: string; status: string; eventName: string | null } | null;
  readOnly: boolean;
  busy: boolean;
  onPatchSection: (id: string, patch: { title?: string }) => void | Promise<void>;
  onDeleteSection: (id: string) => void | Promise<void>;
  onDone: () => void;
}) {
  const [statusLegendOpen, setStatusLegendOpen] = React.useState(false);
  const [order, setOrder] = React.useState<RequisiteOrder | null>(null);
  const [catalogItems, setCatalogItems] = React.useState<
    Array<{
      id: string;
      name: string;
      total: number;
      inRepair: number;
      broken: number;
      missing: number;
      availableNow?: number;
      availableForDates?: number;
      pricePerDay?: number;
    }>
  >([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lines, setLines] = React.useState<
    Array<{
      id?: string;
      itemId: string;
      name: string;
      description: string;
      requestedQty: number;
      warehouseComment: string;
      pricePerDaySnapshot: number | null;
      item: { total: number; inRepair: number; broken: number; missing: number };
    }>
  >([]);
  const [services, setServices] = React.useState({
    deliveryEnabled: false,
    deliveryComment: "",
    deliveryPrice: "",
    deliveryInternalCost: "",
    deliveryInternalPaymentMethod: "NON_CASH" as OrderServicePaymentMethod,
    montageEnabled: false,
    montageComment: "",
    montagePrice: "",
    montageInternalCost: "",
    montageInternalPaymentMethod: "NON_CASH" as OrderServicePaymentMethod,
    demontageEnabled: false,
    demontageComment: "",
    demontagePrice: "",
    demontageInternalCost: "",
    demontageInternalPaymentMethod: "NON_CASH" as OrderServicePaymentMethod,
  });

  const [requisiteUnitDraft, setRequisiteUnitDraft] = React.useState<Record<string, string>>({});
  const [requisiteQtyDraft, setRequisiteQtyDraft] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    const ex = sec.lineLocalExtras ?? {};
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(ex)) {
      const u = v?.unit;
      if (typeof u === "string" && u.trim()) next[k] = u;
    }
    setRequisiteUnitDraft(next);
  }, [sec.id, sec.lineLocalExtras]);

  async function persistRequisiteLineLocalExtras(next: Record<string, { unit?: string | null }>) {
    try {
      const res = await fetch(`/api/projects/${projectId}/estimate/sections/${sec.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineLocalExtras: next }),
      });
      const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setError(j?.error?.message ?? "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РµРґ. РёР·Рј. РІ СЃРјРµС‚Рµ");
      }
    } catch {
      setError("РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РµРґ. РёР·Рј. РІ СЃРјРµС‚Рµ");
    }
  }

  function mergeRequisiteExtra(lineKey: string, unit: string) {
    const base = { ...(sec.lineLocalExtras ?? {}) } as Record<string, { unit?: string | null }>;
    const t = unit.trim();
    base[lineKey] = { unit: t.length > 0 ? t : null };
    return base;
  }

  const editable = !readOnly && !!order && isEditableOrderStatus(order.status);

  const availableForDatesByItemId = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const c of catalogItems) {
      if (c.availableForDates != null && Number.isFinite(c.availableForDates)) {
        m.set(c.id, c.availableForDates);
      }
    }
    return m;
  }, [catalogItems]);

  const linesForCap = React.useMemo(
    () =>
      lines.map((l, j) => {
        const lk = String(l.id ?? `${l.itemId}-${j}`);
        const d = requisiteQtyDraft[lk];
        let rq = l.requestedQty;
        if (d !== undefined) {
          const t = d.trim();
          if (t !== "") {
            const n = Number.parseInt(t, 10);
            if (Number.isFinite(n) && n >= 1) rq = n;
          }
        }
        return { ...l, requestedQty: rq };
      }),
    [lines, requisiteQtyDraft],
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orderRes = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
      const orderJson = (await orderRes.json().catch(() => null)) as {
        order?: RequisiteOrder;
        error?: { message?: string };
      } | null;
      if (!orderRes.ok || !orderJson?.order) {
        setError(orderJson?.error?.message ?? "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃРІСЏР·Р°РЅРЅСѓСЋ Р·Р°СЏРІРєСѓ");
        setOrder(null);
        return;
      }
      const nextOrder = orderJson.order;
      setOrder(nextOrder);
      setRequisiteQtyDraft({});
      setLines(
        nextOrder.lines.map((line) => ({
          id: line.id,
          itemId: line.itemId,
          name: line.item.name,
          description: "",
          requestedQty: line.requestedQty,
          warehouseComment: line.warehouseComment ?? "",
          pricePerDaySnapshot: line.pricePerDaySnapshot,
          item: {
            total: line.item.total,
            inRepair: line.item.inRepair,
            broken: line.item.broken,
            missing: line.item.missing,
          },
        })),
      );
      setServices({
        deliveryEnabled: nextOrder.deliveryEnabled,
        deliveryComment: nextOrder.deliveryComment ?? "",
        deliveryPrice: nextOrder.deliveryPrice != null ? String(nextOrder.deliveryPrice) : "",
        deliveryInternalCost:
          nextOrder.deliveryInternalCost != null ? String(nextOrder.deliveryInternalCost) : "",
        deliveryInternalPaymentMethod: nextOrder.deliveryInternalPaymentMethod ?? "NON_CASH",
        montageEnabled: nextOrder.montageEnabled,
        montageComment: nextOrder.montageComment ?? "",
        montagePrice: nextOrder.montagePrice != null ? String(nextOrder.montagePrice) : "",
        montageInternalCost:
          nextOrder.montageInternalCost != null ? String(nextOrder.montageInternalCost) : "",
        montageInternalPaymentMethod: nextOrder.montageInternalPaymentMethod ?? "NON_CASH",
        demontageEnabled: nextOrder.demontageEnabled,
        demontageComment: nextOrder.demontageComment ?? "",
        demontagePrice: nextOrder.demontagePrice != null ? String(nextOrder.demontagePrice) : "",
        demontageInternalCost:
          nextOrder.demontageInternalCost != null ? String(nextOrder.demontageInternalCost) : "",
        demontageInternalPaymentMethod: nextOrder.demontageInternalPaymentMethod ?? "NON_CASH",
      });

      const start = nextOrder.startDate.slice(0, 10);
      const end = nextOrder.endDate.slice(0, 10);
      const rsp = encodeURIComponent(nextOrder.rentalStartPartOfDay ?? "MORNING");
      const rep = encodeURIComponent(nextOrder.rentalEndPartOfDay ?? "MORNING");
      const catalogRes = await fetch(
        `/api/catalog/items?all=true&startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&rentalStartPartOfDay=${rsp}&rentalEndPartOfDay=${rep}&excludeOrderId=${encodeURIComponent(orderId)}`,
        { cache: "no-store" },
      );
      const catalogJson = (await catalogRes.json().catch(() => null)) as
        | {
            items?: Array<{
              id: string;
              name: string;
              total: number;
              inRepair: number;
              broken: number;
              missing: number;
              pricePerDay?: number;
              availability?: { availableNow: number; availableForDates?: number };
            }>;
          }
        | null;
      setCatalogItems(
        (catalogJson?.items ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          total: item.total,
          inRepair: item.inRepair,
          broken: item.broken,
          missing: item.missing,
          availableNow:
            item.availability?.availableNow != null ? Number(item.availability.availableNow) : undefined,
          availableForDates:
            item.availability?.availableForDates != null
              ? Number(item.availability.availableForDates)
              : undefined,
          pricePerDay:
            item.pricePerDay === undefined || item.pricePerDay === null
              ? undefined
              : Number(item.pricePerDay),
        })),
      );
    } catch {
      setError("РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃРІСЏР·Р°РЅРЅСѓСЋ Р·Р°СЏРІРєСѓ");
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function setServiceField<K extends keyof typeof services>(key: K, value: (typeof services)[K]) {
    setServices((prev) => ({ ...prev, [key]: value }));
  }

  function updateLine(index: number, patch: Partial<(typeof lines)[number]>) {
    setLines((prev) => prev.map((line, idx) => (idx === index ? { ...line, ...patch } : line)));
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  }

  function addLine(itemId: string, name: string, qty: number, description: string) {
    const inv = catalogItems.find((item) => item.id === itemId);
    const buckets = inv
      ? { total: inv.total, inRepair: inv.inRepair, broken: inv.broken, missing: inv.missing }
      : { total: 0, inRepair: 0, broken: 0, missing: 0 };
    const physicalCap = usableStockUnits(buckets);
    setLines((prev) => {
      const used = prev.filter((l) => l.itemId === itemId).reduce((s, l) => s + l.requestedQty, 0);
      const remainingPhysical = Math.max(0, physicalCap - used);
      const datePool = inv?.availableForDates;
      const remainingDate =
        datePool != null && Number.isFinite(datePool) ? Math.max(0, datePool - used) : Number.POSITIVE_INFINITY;
      const remaining = Math.min(remainingPhysical, remainingDate);
      const requestedQty = remaining <= 0 ? 0 : Math.max(1, Math.min(qty, remaining));
      if (requestedQty <= 0) return prev;
      return [
        ...prev,
        {
          itemId,
          name,
          description,
          requestedQty,
          warehouseComment: "",
          pricePerDaySnapshot: inv?.pricePerDay ?? null,
          item: buckets,
        },
      ];
    });
  }

  async function saveOrder() {
    if (!order) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/warehouse-edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryEnabled: services.deliveryEnabled,
          deliveryComment: services.deliveryComment.trim() || null,
          deliveryPrice:
            order.source === "WOWSTORG_EXTERNAL" && services.deliveryEnabled
            ? services.deliveryPrice.trim() === ""
              ? 0
              : Number(services.deliveryPrice.replace(",", "."))
            : 0,
          montageEnabled: services.montageEnabled,
          montageComment: services.montageComment.trim() || null,
          montagePrice:
            order.source === "WOWSTORG_EXTERNAL" && services.montageEnabled
            ? services.montagePrice.trim() === ""
              ? 0
              : Number(services.montagePrice.replace(",", "."))
            : 0,
          demontageEnabled: services.demontageEnabled,
          demontageComment: services.demontageComment.trim() || null,
          demontagePrice:
            order.source === "WOWSTORG_EXTERNAL" && services.demontageEnabled
            ? services.demontagePrice.trim() === ""
              ? 0
              : Number(services.demontagePrice.replace(",", "."))
            : 0,
          deliveryInternalCost: services.deliveryEnabled ? parseMoneyInputOrNull(services.deliveryInternalCost) : null,
          deliveryInternalPaymentMethod: services.deliveryEnabled
            ? services.deliveryInternalPaymentMethod
            : "NON_CASH",
          montageInternalCost: services.montageEnabled ? parseMoneyInputOrNull(services.montageInternalCost) : null,
          montageInternalPaymentMethod: services.montageEnabled
            ? services.montageInternalPaymentMethod
            : "NON_CASH",
          demontageInternalCost: services.demontageEnabled ? parseMoneyInputOrNull(services.demontageInternalCost) : null,
          demontageInternalPaymentMethod: services.demontageEnabled
            ? services.demontageInternalPaymentMethod
            : "NON_CASH",
          lines: lines.map((line) => ({
            ...(line.id ? { id: line.id } : {}),
            itemId: line.itemId,
            requestedQty: Math.max(1, Number(line.requestedQty) || 1),
            warehouseComment: line.warehouseComment.trim() || null,
          })),
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setError(json?.error?.message ?? "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ Р·Р°СЏРІРєСѓ");
        return;
      }
      await load();
      onDone();
    } finally {
      setSaving(false);
    }
  }

  const billableRentalDayCount = React.useMemo(() => {
    if (!order) return 1;
    return billableRentalDaysFromDateOnly({
      startDate: order.startDate,
      endDate: order.endDate,
      rentalStartPartOfDay: order.rentalStartPartOfDay ?? "MORNING",
      rentalEndPartOfDay: order.rentalEndPartOfDay ?? "MORNING",
    });
  }, [order]);

  const rentalTotal = React.useMemo(() => {
    if (!order) return 0;
    const multiplier = order.payMultiplier != null ? Number(order.payMultiplier) : 1;
    return lines.reduce(
      (sum, line) =>
        sum + (line.pricePerDaySnapshot ?? 0) * line.requestedQty * billableRentalDayCount * multiplier,
      0,
    );
  }, [billableRentalDayCount, lines, order]);
  const servicesTotal =
    (services.deliveryEnabled ? Number(services.deliveryPrice || 0) : 0) +
    (services.montageEnabled ? Number(services.montagePrice || 0) : 0) +
    (services.demontageEnabled ? Number(services.demontagePrice || 0) : 0);
  const taxAmount = Math.round((rentalTotal + servicesTotal) * ORDER_TAX_RATE);

  const summaryTitleAddon =
    order && !loading ? (
      <div className="relative shrink-0">
        <button
          type="button"
          onMouseEnter={() => setStatusLegendOpen(true)}
          onMouseLeave={() => setStatusLegendOpen(false)}
          onFocus={() => setStatusLegendOpen(true)}
          onBlur={() => setStatusLegendOpen(false)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white/90"
          aria-label="РЎС‚Р°С‚СѓСЃ СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёСЏ Р·Р°СЏРІРєРё"
        >
          <span
            className={`inline-flex h-3.5 w-3.5 animate-pulse rounded-full ${
              editable
                ? "bg-emerald-500 shadow-[0_0_0_6px_rgba(34,197,94,0.14)]"
                : "bg-red-500 shadow-[0_0_0_6px_rgba(239,68,68,0.12)]"
            }`}
          />
        </button>
        {statusLegendOpen ? (
          <div className="absolute left-0 top-full z-20 mt-2 w-64 rounded-2xl border border-zinc-200 bg-white p-3 text-xs shadow-xl sm:left-auto sm:right-0">
            <div className="font-semibold text-zinc-900">Р›РµРіРµРЅРґР°</div>
            <div className="mt-2 flex items-center gap-2 text-zinc-700">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Р—РµР»С‘РЅС‹Р№: Р·Р°СЏРІРєСѓ РјРѕР¶РЅРѕ СЂРµРґР°РєС‚РёСЂРѕРІР°С‚СЊ РёР· СЃРјРµС‚С‹
            </div>
            <div className="mt-1 flex items-center gap-2 text-zinc-700">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              РљСЂР°СЃРЅС‹Р№: Р·Р°СЏРІРєР° Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅР° С‚РµРєСѓС‰РёРј СЌС‚Р°РїРѕРј
            </div>
            <div className="mt-2 text-zinc-500">РЎС‚Р°С‚СѓСЃ Р·Р°СЏРІРєРё РЅРµ РґСѓР±Р»РёСЂСѓРµС‚СЃСЏ Р·РґРµСЃСЊ, РѕРЅ СѓР¶Рµ РІРёРґРµРЅ РІ СЃС‚РµРїРїРµСЂРµ СЃРІРµСЂС…Сѓ.</div>
          </div>
        ) : null}
      </div>
    ) : null;

  const summaryTrailing = (
    <>
      <Link
        href={`/orders/${orderId}`}
        className="rounded-lg border border-violet-200 bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:text-violet-900"
        onClick={(e) => e.stopPropagation()}
      >
        РћС‚РєСЂС‹С‚СЊ Р·Р°СЏРІРєСѓ
      </Link>
      {!readOnly ? (
        <button
          type="button"
          disabled={busy || saving}
          onClick={(e) => {
            e.stopPropagation();
            void onDeleteSection(sec.id);
          }}
          className="rounded-lg border border-red-200 bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
        >
          Убрать из сметы
        </button>
      ) : null}
      {order && editable ? (
        <button
          type="button"
          disabled={saving || lines.length === 0}
          onClick={(e) => {
            e.stopPropagation();
            void saveOrder();
          }}
          className={btnPrimary}
        >
          {saving ? "РЎРѕС…СЂР°РЅРµРЅРёРµвЂ¦" : "РЎРѕС…СЂР°РЅРёС‚СЊ Р·Р°СЏРІРєСѓ"}
        </button>
      ) : null}
    </>
  );

  return (
    <EstimateSectionBlock
      sec={sec}
      orderMeta={orderMeta}
      readOnly={readOnly}
      busy={busy}
      onPatchSection={onPatchSection}
      onDeleteSection={onDeleteSection}
      summaryTitleAddon={summaryTitleAddon}
      summaryTrailing={summaryTrailing}
    >
      {loading ? (
        <div className="rounded-2xl border border-zinc-200 bg-white/80 px-4 py-4 text-sm text-zinc-600">Р—Р°РіСЂСѓР·РєР° СЃРІСЏР·Р°РЅРЅРѕР№ Р·Р°СЏРІРєРёвЂ¦</div>
      ) : !order ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error ?? "РЎРІСЏР·Р°РЅРЅР°СЏ Р·Р°СЏРІРєР° РЅРµ РЅР°Р№РґРµРЅР°"}
        </div>
      ) : (
        <div className="space-y-4">
          {error ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</div> : null}

          <div className="space-y-3">
            <div className="space-y-2">
              {lines.map((line, index) => {
                const maxQty = maxQtyAllowedForRequisiteLine(linesForCap, index, availableForDatesByItemId);
                const dayC = normalizeProjectEstimateDays(billableRentalDayCount) ?? 1;
                const mult = order.payMultiplier != null ? Number(order.payMultiplier) : 1;
                const lk = String(line.id ?? `${line.itemId}-${index}`);
                const qtyDraftRaw = requisiteQtyDraft[lk];
                const qtyDisplay =
                  qtyDraftRaw !== undefined
                    ? qtyDraftRaw.trim() === ""
                      ? 0
                      : Math.max(1, Number.parseInt(qtyDraftRaw, 10) || 0)
                    : line.requestedQty;
                const lineTotal =
                  calcProjectEstimateRequisiteTotal({
                    pricePerDay: line.pricePerDaySnapshot ?? 0,
                    qty: qtyDisplay,
                    plannedDays: dayC,
                    payMultiplier: mult,
                  }) ?? 0;
                const ppu =
                  calcProjectEstimateRequisiteUnitPricePerDay({
                    totalClient: lineTotal,
                    qty: qtyDisplay,
                    plannedDays: dayC,
                  }) ?? 0;
                return (
              <div key={line.id ?? `${line.itemId}-${index}`} className="rounded-2xl border border-zinc-200 bg-white p-2.5 shadow-sm">
                <div className="grid gap-2 text-xs xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_4.5rem_4.5rem_4.5rem_4.5rem_5rem_auto]">
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    РџРѕР·РёС†РёСЏ
                    <input value={line.name} readOnly className={`mt-0.5 w-full ${cellXs} bg-zinc-50`} />
                  </label>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    РћРїРёСЃР°РЅРёРµ
                    <input
                      value={line.description}
                      onChange={(e) => updateLine(index, { description: e.target.value })}
                      className={`mt-0.5 w-full ${cellXs}`}
                      disabled={!editable}
                      placeholder="РџСЂРёРјРµС‡Р°РЅРёРµ"
                    />
                  </label>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    Р•Рґ.
                    <input
                      value={requisiteUnitDraft[lk] ?? ""}
                      onChange={(e) =>
                        setRequisiteUnitDraft((prev) => ({ ...prev, [lk]: e.target.value }))
                      }
                      onBlur={(e) => {
                        void persistRequisiteLineLocalExtras(mergeRequisiteExtra(lk, e.target.value));
                      }}
                      className={`mt-0.5 w-full ${cellXs}`}
                      disabled={readOnly}
                      list={UNIT_DATALIST_ID}
                      placeholder="С€С‚"
                    />
                  </label>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    РљРѕР»-РІРѕ
                    <input
                      value={requisiteQtyDraft[lk] !== undefined ? requisiteQtyDraft[lk] : String(line.requestedQty)}
                      inputMode="numeric"
                      onChange={(e) =>
                        setRequisiteQtyDraft((prev) => ({ ...prev, [lk]: digitsOnlyInput(e.target.value) }))
                      }
                      onBlur={() => {
                        const raw =
                          requisiteQtyDraft[lk] !== undefined ? requisiteQtyDraft[lk] : String(line.requestedQty);
                        let n = parseQtyCommitInt(raw, 1);
                        if (maxQty > 0) n = Math.min(n, maxQty);
                        updateLine(index, { requestedQty: n });
                        setRequisiteQtyDraft((prev) => {
                          const next = { ...prev };
                          delete next[lk];
                          return next;
                        });
                      }}
                      className={`mt-0.5 w-full ${cellXs} tabular-nums`}
                      disabled={!editable}
                      aria-valuemin={1}
                      aria-valuemax={maxQty > 0 ? maxQty : undefined}
                    />
                  </label>
                  <div className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5">
                    <div className="text-[9px] font-semibold uppercase text-zinc-500">Р”РЅРµР№</div>
                    <div className="mt-0.5 text-xs font-bold tabular-nums text-zinc-900">{dayC}</div>
                  </div>
                  <div className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5">
                    <div className="text-[9px] font-semibold uppercase text-zinc-500">Р¦РµРЅР°/РµРґ</div>
                    <div className="mt-0.5 text-xs font-bold tabular-nums text-zinc-900">{formatOrderMoney(ppu)} в‚Ѕ</div>
                  </div>
                  <div className="rounded border border-violet-100 bg-violet-50 px-2 py-1.5">
                    <div className="text-[9px] font-semibold uppercase text-violet-700">РЎСѓРјРјР°</div>
                    <div className="mt-0.5 text-xs font-bold tabular-nums text-violet-950">
                      {formatOrderMoney(lineTotal)} в‚Ѕ
                    </div>
                  </div>
                  <div className="flex items-end justify-end gap-2">
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => removeLine(index)}
                        className={`${btnGhostXs} border-red-200 text-red-700 hover:bg-red-50`}
                      >
                        РЈРґР°Р»РёС‚СЊ
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
            })}
          </div>

          {editable ? (
            <div className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/50 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">Р”РѕР±Р°РІРёС‚СЊ РїРѕР·РёС†РёСЋ РІ Р·Р°СЏРІРєСѓ</div>
              <OrderLinePicker
                catalogItems={catalogItems}
                existingItemIds={lines.map((line) => line.itemId)}
                onAdd={addLine}
              />
            </div>
          ) : null}
        </div>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Р”РѕРї. СѓСЃР»СѓРіРё</div>
            <div className="mt-3 space-y-2">
              <OrderServiceCard
                title="Р”РѕСЃС‚Р°РІРєР°"
                enabled={services.deliveryEnabled}
                comment={services.deliveryComment}
                clientPrice={services.deliveryPrice}
                internalCost={services.deliveryInternalCost}
                internalPaymentMethod={services.deliveryInternalPaymentMethod}
                editable={editable}
                showClientPrice={order.source === "WOWSTORG_EXTERNAL"}
                onEnabledChange={(value) => setServiceField("deliveryEnabled", value)}
                onCommentChange={(value) => setServiceField("deliveryComment", value)}
                onClientPriceChange={(value) => setServiceField("deliveryPrice", value)}
                onInternalCostChange={(value) => setServiceField("deliveryInternalCost", value)}
                onInternalPaymentMethodChange={(value) => setServiceField("deliveryInternalPaymentMethod", value)}
              />
              <OrderServiceCard
                title="РњРѕРЅС‚Р°Р¶"
                enabled={services.montageEnabled}
                comment={services.montageComment}
                clientPrice={services.montagePrice}
                internalCost={services.montageInternalCost}
                internalPaymentMethod={services.montageInternalPaymentMethod}
                editable={editable}
                showClientPrice={order.source === "WOWSTORG_EXTERNAL"}
                onEnabledChange={(value) => setServiceField("montageEnabled", value)}
                onCommentChange={(value) => setServiceField("montageComment", value)}
                onClientPriceChange={(value) => setServiceField("montagePrice", value)}
                onInternalCostChange={(value) => setServiceField("montageInternalCost", value)}
                onInternalPaymentMethodChange={(value) => setServiceField("montageInternalPaymentMethod", value)}
              />
              <OrderServiceCard
                title="Р”РµРјРѕРЅС‚Р°Р¶"
                enabled={services.demontageEnabled}
                comment={services.demontageComment}
                clientPrice={services.demontagePrice}
                internalCost={services.demontageInternalCost}
                internalPaymentMethod={services.demontageInternalPaymentMethod}
                editable={editable}
                showClientPrice={order.source === "WOWSTORG_EXTERNAL"}
                onEnabledChange={(value) => setServiceField("demontageEnabled", value)}
                onCommentChange={(value) => setServiceField("demontageComment", value)}
                onClientPriceChange={(value) => setServiceField("demontagePrice", value)}
                onInternalCostChange={(value) => setServiceField("demontageInternalCost", value)}
                onInternalPaymentMethodChange={(value) => setServiceField("demontageInternalPaymentMethod", value)}
              />
              {services.deliveryEnabled || services.montageEnabled || services.demontageEnabled ? (
                <div className="mt-2 grid gap-2 border-t border-zinc-200 pt-2 sm:grid-cols-3">
                  {services.deliveryEnabled ? (
                    <label className="block text-[10px] font-semibold text-zinc-500">
                      Р”РѕСЃС‚Р°РІРєР° вЂ” РµРґ. (СЃРјРµС‚Р°)
                      <input
                        value={requisiteUnitDraft[`${order.id}:delivery`] ?? ""}
                        onChange={(e) =>
                          setRequisiteUnitDraft((p) => ({
                            ...p,
                            [`${order.id}:delivery`]: e.target.value,
                          }))
                        }
                        onBlur={(e) =>
                          void persistRequisiteLineLocalExtras(
                            mergeRequisiteExtra(`${order.id}:delivery`, e.target.value),
                          )
                        }
                        className={`mt-0.5 w-full ${cellXs}`}
                        list={UNIT_DATALIST_ID}
                        disabled={readOnly}
                        placeholder="СѓСЃР»."
                      />
                    </label>
                  ) : null}
                  {services.montageEnabled ? (
                    <label className="block text-[10px] font-semibold text-zinc-500">
                      РњРѕРЅС‚Р°Р¶ вЂ” РµРґ. (СЃРјРµС‚Р°)
                      <input
                        value={requisiteUnitDraft[`${order.id}:montage`] ?? ""}
                        onChange={(e) =>
                          setRequisiteUnitDraft((p) => ({
                            ...p,
                            [`${order.id}:montage`]: e.target.value,
                          }))
                        }
                        onBlur={(e) =>
                          void persistRequisiteLineLocalExtras(
                            mergeRequisiteExtra(`${order.id}:montage`, e.target.value),
                          )
                        }
                        className={`mt-0.5 w-full ${cellXs}`}
                        list={UNIT_DATALIST_ID}
                        disabled={readOnly}
                        placeholder="СѓСЃР»."
                      />
                    </label>
                  ) : null}
                  {services.demontageEnabled ? (
                    <label className="block text-[10px] font-semibold text-zinc-500">
                      Р”РµРјРѕРЅС‚Р°Р¶ вЂ” РµРґ. (СЃРјРµС‚Р°)
                      <input
                        value={requisiteUnitDraft[`${order.id}:demontage`] ?? ""}
                        onChange={(e) =>
                          setRequisiteUnitDraft((p) => ({
                            ...p,
                            [`${order.id}:demontage`]: e.target.value,
                          }))
                        }
                        onBlur={(e) =>
                          void persistRequisiteLineLocalExtras(
                            mergeRequisiteExtra(`${order.id}:demontage`, e.target.value),
                          )
                        }
                        className={`mt-0.5 w-full ${cellXs}`}
                        list={UNIT_DATALIST_ID}
                        disabled={readOnly}
                        placeholder="СѓСЃР»."
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">РС‚РѕРіРѕ РїРѕ Р·Р°СЏРІРєРµ</div>
            <div className="mt-3 space-y-2 text-sm text-zinc-700">
              <div className="flex items-center justify-between gap-3">
                <span>РђСЂРµРЅРґР°</span>
                <span className="font-semibold text-zinc-950">{formatOrderMoney(rentalTotal)} в‚Ѕ</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Р”РѕРї. СѓСЃР»СѓРіРё</span>
                <span className="font-semibold text-zinc-950">{formatOrderMoney(servicesTotal)} в‚Ѕ</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>РќР°Р»РѕРі {Math.round(ORDER_TAX_RATE * 100)}%</span>
                <span className="font-semibold text-zinc-950">{formatOrderMoney(taxAmount)} в‚Ѕ</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-violet-200 pt-2 text-base font-bold text-violet-950">
                <span>Р’СЃРµРіРѕ</span>
                <span>{formatOrderMoney(rentalTotal + servicesTotal + taxAmount)} в‚Ѕ</span>
              </div>
            </div>
          </div>
        </div>
        </div>
      )}
    </EstimateSectionBlock>
  );
}

function DraftRequisiteEditor({
  projectId,
  sec,
  readOnly,
  onDone,
}: {
  projectId: string;
  sec: EstSection & { kind: "DRAFT_REQUISITE" };
  readOnly: boolean;
  onDone: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [legendOpen, setLegendOpen] = React.useState(false);
  const [draftDirty, setDraftDirty] = React.useState(false);
  const [catalogItems, setCatalogItems] = React.useState<
    Array<{
      id: string;
      name: string;
      total: number;
      inRepair: number;
      broken: number;
      missing: number;
      availableNow?: number;
      availableForDates?: number;
      pricePerDay?: number;
    }>
  >([]);
  const [catalogLoading, setCatalogLoading] = React.useState(true);
  const [materializeOpen, setMaterializeOpen] = React.useState(false);
  const [projectMaterializeDefaults, setProjectMaterializeDefaults] = React.useState<{
    startDate: string;
    endDate: string;
  } | null>(null);
  const [materializeAssignments, setMaterializeAssignments] = React.useState<DraftMaterializeAssignment[]>([]);
  const [matBusy, setMatBusy] = React.useState(false);
  const [matError, setMatError] = React.useState<string | null>(null);
  const [lines, setLines] = React.useState(() =>
    sec.lines.map((line) => {
      const meta = parseDraftLineMeta(line);
      return {
        id: line.id,
        itemId: line.itemId ?? "",
        name: line.name,
        qty: String(meta.qty),
        plannedDays: String(meta.plannedDays),
        pricePerDaySnapshot: meta.pricePerDay,
        comment: meta.extraDescription,
        maxQtyPhysical: meta.maxQtyPhysical,
      };
    }),
  );

  React.useEffect(() => {
    setLines(
      sec.lines.map((line) => {
        const meta = parseDraftLineMeta(line);
        return {
          id: line.id,
          itemId: line.itemId ?? "",
          name: line.name,
          qty: String(meta.qty),
          plannedDays: String(meta.plannedDays),
          pricePerDaySnapshot: meta.pricePerDay,
          comment: meta.extraDescription,
          maxQtyPhysical: meta.maxQtyPhysical,
        };
      }),
    );
    setError(null);
    setDraftDirty(false);
  }, [sec]);

  React.useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    fetch("/api/catalog/items", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then(
        (
          j: null | {
            items?: Array<{
              id: string;
              name: string;
              total: number;
              inRepair: number;
              broken: number;
              missing: number;
              pricePerDay?: number | null;
              availability?: { availableNow?: number; availableForDates?: number };
            }>;
          },
        ) => {
          if (cancelled) return;
          setCatalogItems(
            (j?.items ?? []).map((item) => ({
              id: item.id,
              name: item.name,
              total: item.total,
              inRepair: item.inRepair,
              broken: item.broken,
              missing: item.missing,
              availableNow:
                item.availability?.availableNow != null ? Number(item.availability.availableNow) : undefined,
              availableForDates:
                item.availability?.availableForDates != null
                  ? Number(item.availability.availableForDates)
                  : undefined,
              pricePerDay:
                item.pricePerDay === undefined || item.pricePerDay === null ? undefined : Number(item.pricePerDay),
            })),
          );
        },
      )
      .catch(() => {
        if (!cancelled) setCatalogItems([]);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((j: null | { project?: { eventStartDate?: string | null; eventEndDate?: string | null; eventDateConfirmed?: boolean } }) => {
        if (cancelled) return;
        const startDate = j?.project?.eventStartDate ?? null;
        const endDate = j?.project?.eventEndDate ?? null;
        if (j?.project?.eventDateConfirmed && startDate && endDate) {
          setProjectMaterializeDefaults({ startDate, endDate });
        } else {
          setProjectMaterializeDefaults(null);
        }
      })
      .catch(() => {
        if (!cancelled) setProjectMaterializeDefaults(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const total = React.useMemo(
    () =>
      lines.reduce((sum, line) => {
        const q = parseQtyDisplayInt(line.qty);
        const d = parseQtyDisplayInt(line.plannedDays);
        if (q <= 0 || d <= 0) return sum;
        return sum + Math.round((line.pricePerDaySnapshot ?? 0) * q * d);
      }, 0),
    [lines],
  );

  const groupedMaterializePeriods = React.useMemo(
    () => groupDraftMaterializeAssignments(materializeAssignments),
    [materializeAssignments],
  );

  function updateLine(
    index: number,
    patch: Partial<{
      qty: string;
      plannedDays: string;
      comment: string;
    }>,
  ) {
    setDraftDirty(true);
    setLines((prev) => prev.map((line, idx) => (idx === index ? { ...line, ...patch } : line)));
  }

  function removeDraftLine(index: number) {
    setDraftDirty(true);
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  }

  function addDraftCatalogLine(itemId: string, name: string, qty: number, description: string) {
    const inv = catalogItems.find((i) => i.id === itemId);
    const buckets = inv
      ? { total: inv.total, inRepair: inv.inRepair, broken: inv.broken, missing: inv.missing }
      : { total: 0, inRepair: 0, broken: 0, missing: 0 };
    const maxQtyPhysical = usableStockUnits(buckets);
    setDraftDirty(true);
    setLines((prev) => {
      const used = prev.filter((l) => l.itemId === itemId).reduce((s, l) => s + parseQtyCommitInt(l.qty, 1), 0);
      const remaining = Math.max(0, maxQtyPhysical - used);
      const q = remaining <= 0 ? 0 : Math.max(1, Math.min(qty, remaining));
      if (q <= 0) return prev;
      return [
        ...prev,
        {
          id: makeTempId("line"),
          itemId,
          name,
          qty: String(q),
          plannedDays: "1",
          pricePerDaySnapshot: inv?.pricePerDay ?? 0,
          comment: description.trim(),
          maxQtyPhysical,
        },
      ];
    });
  }

  async function saveDraft() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/draft-order`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimateVersionId: sec.linkedDraftOrderId ? undefined : null,
          title: sec.title,
          comment: null,
          lines: lines.map((line, index) => ({
            id: line.id,
            itemId: line.itemId,
            itemName: line.name,
            qty: parseQtyCommitInt(line.qty, 1),
            plannedDays: parseQtyCommitInt(line.plannedDays, 1),
            comment: line.comment.trim() || null,
            periodGroup: null,
            pricePerDaySnapshot: line.pricePerDaySnapshot,
            sortOrder: index,
          })),
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setError(data?.error?.message ?? "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ demo-Р·Р°СЏРІРєСѓ");
        return;
      }
      setDraftDirty(false);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  function openMaterializeModal() {
    const today = draftMaterializeTodayISO();
    const startDate = projectMaterializeDefaults?.startDate ?? today;
    const endDate = projectMaterializeDefaults?.endDate ?? startDate;
    setMatError(null);
    setMaterializeAssignments(buildDraftMaterializeAssignments({
      lineIds: lines.map((line) => line.id),
      startDate,
      endDate,
    }));
    setMaterializeOpen(true);
  }

  function updateMaterializeAssignment(
    lineId: string,
    patch: Partial<
      Pick<DraftMaterializeAssignment, "startDate" | "endDate" | "rentalStartPartOfDay" | "rentalEndPartOfDay">
    >,
  ) {
    setMaterializeAssignments((prev) =>
      prev.map((assignment) =>
        assignment.lineId === lineId ? { ...assignment, ...patch } : assignment,
      ),
    );
  }

  async function materializeDraft() {
    setMatError(null);
    if (draftDirty) {
      setMatError("РЎРЅР°С‡Р°Р»Р° СЃРѕС…СЂР°РЅРёС‚Рµ РёР·РјРµРЅРµРЅРёСЏ РєРЅРѕРїРєРѕР№ В«РЎРѕС…СЂР°РЅРёС‚СЊ demoВ».");
      return;
    }
    if (lines.length === 0) {
      setMatError("РќРµС‚ РїРѕР·РёС†РёР№ РґР»СЏ РјР°С‚РµСЂРёР°Р»РёР·Р°С†РёРё.");
      return;
    }
    if (lines.some((l) => l.id.startsWith("draft-"))) {
      setMatError("РЎРѕС…СЂР°РЅРёС‚Рµ demo-Р·Р°СЏРІРєСѓ: Сѓ РЅРѕРІС‹С… СЃС‚СЂРѕРє РµС‰С‘ РЅРµС‚ РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂРѕРІ РЅР° СЃРµСЂРІРµСЂРµ.");
      return;
    }
    if (materializeAssignments.length !== lines.length) {
      setMatError("РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґРіРѕС‚РѕРІРёС‚СЊ РёРЅС‚РµСЂРІР°Р»С‹ РґР»СЏ РІСЃРµС… РїРѕР·РёС†РёР№. Р—Р°РєСЂРѕР№С‚Рµ РѕРєРЅРѕ Рё РѕС‚РєСЂРѕР№С‚Рµ СЃРЅРѕРІР°.");
      return;
    }
    if (materializeAssignments.some((assignment) => !assignment.startDate || !assignment.endDate)) {
      setMatError("РЈРєР°Р¶РёС‚Рµ РґР°С‚С‹ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёСЏ РґР»СЏ РєР°Р¶РґРѕР№ РїРѕР·РёС†РёРё.");
      return;
    }
    if (materializeAssignments.some((assignment) => assignment.startDate > assignment.endDate)) {
      setMatError("Р”Р°С‚Р° РѕРєРѕРЅС‡Р°РЅРёСЏ РЅРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ СЂР°РЅСЊС€Рµ РґР°С‚С‹ РЅР°С‡Р°Р»Р°.");
      return;
    }
    const periods = groupDraftMaterializeAssignments(materializeAssignments);
    setMatBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/draft-order/materialize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periods,
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setMatError(data?.error?.message ?? "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ Р·Р°СЏРІРєРё");
        return;
      }
      setMaterializeOpen(false);
      onDone();
      window.dispatchEvent(new CustomEvent("project-activity-refresh"));
    } finally {
      setMatBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-fuchsia-200/80 bg-white/90 p-3 shadow-inner">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-sm font-semibold text-fuchsia-950">
            Demo-Р·Р°СЏРІРєР° Р±РµР· РґР°С‚
          </div>
          <div className="relative">
            <button
              type="button"
              onMouseEnter={() => setLegendOpen(true)}
              onMouseLeave={() => setLegendOpen(false)}
              onFocus={() => setLegendOpen(true)}
              onBlur={() => setLegendOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-fuchsia-200 bg-white text-fuchsia-700"
              aria-label="РџРѕСЏСЃРЅРµРЅРёРµ РїРѕ demo-Р·Р°СЏРІРєРµ"
            >
              ?
            </button>
            {legendOpen ? (
              <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-2xl border border-zinc-200 bg-white p-3 text-xs text-zinc-700 shadow-xl">
                <div className="font-semibold text-zinc-950">Р›РµРіРµРЅРґР°</div>
                <div className="mt-2">
                  Demo-Р·Р°СЏРІРєР° РЅРµ СЂРµР·РµСЂРІРёСЂСѓРµС‚ РѕСЃС‚Р°С‚РєРё Рё РЅСѓР¶РЅР° РґР»СЏ СЂР°СЃС‡С‘С‚Р° СЃРјРµС‚С‹ РґРѕ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ РєРѕРЅРєСЂРµС‚РЅС‹С… РёРЅС‚РµСЂРІР°Р»РѕРІ.
                </div>
                <div className="mt-2">
                  РџРѕР»Рµ `Р”РЅРµР№` РІР»РёСЏРµС‚ С‚РѕР»СЊРєРѕ РЅР° РїСЂРµРґРІР°СЂРёС‚РµР»СЊРЅСѓСЋ СЃРјРµС‚Сѓ. РљРЅРѕРїРєР° В«Р’ СЂРµР°Р»СЊРЅСѓСЋ Р·Р°СЏРІРєСѓВ» РѕС‚РєСЂС‹РІР°РµС‚ РІС‹Р±РѕСЂ РґР°С‚ Рё
                  СЃРѕР·РґР°С‘С‚ СЃРєР»Р°РґСЃРєСѓСЋ Р·Р°СЏРІРєСѓ РІС‹РґР°С‡Рё РґР»СЏ С‚СЂРµС‚СЊРёС… Р»РёС† (РєР°Рє Сѓ РїСЂРѕРµРєС‚Р°), РЅРµ Greenwich. Р”Р°С‚Р° РіРѕС‚РѕРІРЅРѕСЃС‚Рё РІ СЃРёСЃС‚РµРјРµ
                  СЃРѕРІРїР°РґР°РµС‚ СЃ РґР°С‚РѕР№ РЅР°С‡Р°Р»Р° РїРµСЂРёРѕРґР° (РЅСѓР¶РЅРѕ РїСЂРµРґРІР°СЂРёС‚РµР»СЊРЅРѕ СЃРѕС…СЂР°РЅРёС‚СЊ demo).
                </div>
              </div>
            ) : null}
          </div>
        </div>
        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openMaterializeModal}
              disabled={busy || lines.length === 0 || draftDirty}
              title={draftDirty ? "РЎРЅР°С‡Р°Р»Р° СЃРѕС…СЂР°РЅРёС‚Рµ РёР·РјРµРЅРµРЅРёСЏ РєРЅРѕРїРєРѕР№ В«РЎРѕС…СЂР°РЅРёС‚СЊ demoВ»" : undefined}
              className={btnSecondary}
            >
              Р’ СЂРµР°Р»СЊРЅСѓСЋ Р·Р°СЏРІРєСѓ
            </button>
            <button type="button" onClick={() => void saveDraft()} disabled={busy} className={btnPrimary}>
              {busy ? "РЎРѕС…СЂР°РЅСЏСЋ demoвЂ¦" : "РЎРѕС…СЂР°РЅРёС‚СЊ demo"}
            </button>
          </div>
        ) : null}
      </div>

      {error ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</div> : null}

      <p className="hidden">
        РљРѕР»РёС‡РµСЃС‚РІРѕ РѕРіСЂР°РЅРёС‡РµРЅРѕ С„РёР·РёС‡РµСЃРєРёРј РѕСЃС‚Р°С‚РєРѕРј РЅР° СЃРєР»Р°РґРµ (РіРѕРґРЅС‹Рµ РµРґРёРЅРёС†С‹ РїРѕ РІС‘РґСЂР°Рј: total в€’ СЂРµРјРѕРЅС‚ в€’ Р±СЂР°Рє в€’ РЅРµРґРѕСЃС‚Р°С‡Р°), Р±РµР· СѓС‡С‘С‚Р° СЂРµР·РµСЂРІР° РїРѕ РґР°С‚Р°Рј. РџСЂРё РїРµСЂРµРІРѕРґРµ РІ СЂРµР°Р»СЊРЅС‹Рµ Р·Р°СЏРІРєРё РґРѕРїРѕР»РЅРёС‚РµР»СЊРЅРѕ РїСЂРѕРІРµСЂСЏРµС‚СЃСЏ РґРѕСЃС‚СѓРїРЅРѕСЃС‚СЊ РЅР° РІС‹Р±СЂР°РЅРЅС‹Рµ РїРµСЂРёРѕРґС‹.
      </p>

      {!readOnly ? (
        <div className="rounded-2xl border border-dashed border-fuchsia-300 bg-fuchsia-50/40 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fuchsia-800">
            Р”РѕР±Р°РІРёС‚СЊ РїРѕР·РёС†РёСЋ РёР· РєР°С‚Р°Р»РѕРіР°
          </div>
          {catalogLoading ? (
            <p className="text-sm text-zinc-600">Р—Р°РіСЂСѓР·РєР° РєР°С‚Р°Р»РѕРіР°вЂ¦</p>
          ) : (
            <OrderLinePicker
              catalogItems={catalogItems}
              existingItemIds={lines.map((l) => l.itemId)}
              onAdd={(itemId, name, qty, description) => addDraftCatalogLine(itemId, name, qty, description)}
            />
          )}
        </div>
      ) : null}

      <div className="space-y-2">
        {lines.map((line, index) => {
          const qDisp = parseQtyDisplayInt(line.qty);
          const dDisp = parseQtyDisplayInt(line.plannedDays);
          const lineTotal =
            qDisp > 0 && dDisp > 0 ? Math.round((line.pricePerDaySnapshot ?? 0) * qDisp * dDisp) : 0;
          const maxRemPhysical = maxPhysicalRemainingForDraftLine(lines, index);
          const maxQtyCap =
            Number.isFinite(maxRemPhysical) && maxRemPhysical < Number.POSITIVE_INFINITY
              ? Math.max(parseQtyCommitInt(line.qty, 1), maxRemPhysical)
              : undefined;
          return (
            <div key={line.id} className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_112px_112px_132px_minmax(0,1.2fr)_auto]">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">РџРѕР·РёС†РёСЏ</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-950">{line.name}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {formatOrderMoney(line.pricePerDaySnapshot ?? 0)} в‚Ѕ / РґРµРЅСЊ
                  </div>
                </div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  РљРѕР»-РІРѕ
                  <input
                    value={line.qty}
                    inputMode="numeric"
                    onChange={(e) => updateLine(index, { qty: digitsOnlyInput(e.target.value) })}
                    onBlur={() => {
                      let n = parseQtyCommitInt(line.qty, 1);
                      if (maxQtyCap != null) n = Math.min(n, maxQtyCap);
                      updateLine(index, { qty: String(n) });
                    }}
                    className={`mt-1 w-full ${inputField} tabular-nums`}
                    disabled={readOnly}
                    aria-valuemin={1}
                    aria-valuemax={maxQtyCap}
                  />
                </label>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Р”РЅРµР№
                  <input
                    value={line.plannedDays}
                    inputMode="numeric"
                    onChange={(e) => updateLine(index, { plannedDays: digitsOnlyInput(e.target.value) })}
                    onBlur={() => updateLine(index, { plannedDays: String(parseQtyCommitInt(line.plannedDays, 1)) })}
                    className={`mt-1 w-full ${inputField} tabular-nums`}
                    disabled={readOnly}
                  />
                </label>
                <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-700">РЎСѓРјРјР°</div>
                  <div className="mt-1 text-sm font-bold text-fuchsia-950">{formatOrderMoney(lineTotal)} в‚Ѕ</div>
                </div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  РљРѕРјРјРµРЅС‚Р°СЂРёР№
                  <input
                    value={line.comment}
                    onChange={(e) => updateLine(index, { comment: e.target.value })}
                    className={`mt-1 w-full ${inputField}`}
                    disabled={readOnly}
                    placeholder="РћРїС†РёРѕРЅР°Р»СЊРЅРѕ"
                  />
                </label>
                {!readOnly ? (
                  <div className="flex items-end justify-end">
                    <button
                      type="button"
                      onClick={() => removeDraftLine(index)}
                      className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      РЈРґР°Р»РёС‚СЊ
                    </button>
                  </div>
                ) : (
                  <div className="hidden xl:block" aria-hidden />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/70 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-fuchsia-700">РџСЂРµРґРІР°СЂРёС‚РµР»СЊРЅС‹Р№ РёС‚РѕРі demo-Р±Р»РѕРєР°</div>
        <div className="mt-2 text-lg font-extrabold text-fuchsia-950">{formatOrderMoney(total)} в‚Ѕ</div>
      </div>

      {materializeOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-950/40 p-4">
              <div
                className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="draft-materialize-title"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div id="draft-materialize-title" className="text-lg font-extrabold tracking-tight text-zinc-950">
                      Р РµР°Р»СЊРЅР°СЏ Р·Р°СЏРІРєР° РёР· demo
                    </div>
                    <p className="mt-1 text-sm text-zinc-600">
                      РЈРєР°Р¶Рё РґР°С‚С‹ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёСЏ РґР»СЏ РєР°Р¶РґРѕР№ РїРѕР·РёС†РёРё. РџРѕ СѓРјРѕР»С‡Р°РЅРёСЋ РёСЃРїРѕР»СЊР·СѓСЋС‚СЃСЏ РїРѕРґС‚РІРµСЂР¶РґС‘РЅРЅС‹Рµ РґР°С‚С‹
                      РјРµСЂРѕРїСЂРёСЏС‚РёСЏ, РµСЃР»Рё РѕРЅРё РµСЃС‚СЊ. РЎРёСЃС‚РµРјР° Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё СЃРѕР±РµСЂС‘С‚ СЃС‚СЂРѕРєРё СЃ РѕРґРёРЅР°РєРѕРІС‹Рј РёРЅС‚РµСЂРІР°Р»РѕРј РІ РѕРґРЅСѓ
                      СЂРµР°Р»СЊРЅСѓСЋ Р·Р°СЏРІРєСѓ: 1 РёРЅС‚РµСЂРІР°Р» = 1 Р·Р°СЏРІРєР°.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => {
                      setMaterializeOpen(false);
                      setMatError(null);
                    }}
                  >
                    Р—Р°РєСЂС‹С‚СЊ
                  </button>
                </div>
                {matError ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {matError}
                  </div>
                ) : null}
                <div className="mt-4 space-y-3">
                  {lines.map((line) => {
                    const assignment = materializeAssignments.find((item) => item.lineId === line.id);
                    return (
                      <div key={line.id} className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4">
                        <div className="space-y-3">
                          <div>
                            <div className="text-sm font-semibold text-zinc-950">{line.name}</div>
                            <div className="mt-4">
                              <CatalogRentalPeriodPicker
                                startDate={assignment?.startDate ?? draftMaterializeTodayISO()}
                                endDate={assignment?.endDate ?? assignment?.startDate ?? draftMaterializeTodayISO()}
                                minDate={draftMaterializeTodayISO()}
                                rentalStartPartOfDay={assignment?.rentalStartPartOfDay ?? "MORNING"}
                                rentalEndPartOfDay={assignment?.rentalEndPartOfDay ?? "EVENING"}
                                onRangeChange={(startDate, endDate) =>
                                  updateMaterializeAssignment(line.id, { startDate, endDate })
                                }
                                onStartPartChange={(rentalStartPartOfDay) =>
                                  updateMaterializeAssignment(line.id, { rentalStartPartOfDay })
                                }
                                onEndPartChange={(rentalEndPartOfDay) =>
                                  updateMaterializeAssignment(line.id, { rentalEndPartOfDay })
                                }
                              />
                            </div>
                            <div className="mt-1 text-xs text-zinc-600">
                              {parseQtyDisplayInt(line.qty)} С€С‚. В· {parseQtyDisplayInt(line.plannedDays)} РґРЅ. РІ demo
                            </div>
                          </div>
                          <label className="hidden">
                            РќР°С‡Р°Р»Рѕ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёСЏ
                            <input
                              type="date"
                              value={assignment?.startDate ?? ""}
                              onChange={(e) => updateMaterializeAssignment(line.id, { startDate: e.target.value })}
                              className={`mt-1 w-full ${inputField}`}
                            />
                          </label>
                          <label className="hidden">
                            РљРѕРЅРµС† РёСЃРїРѕР»СЊР·РѕРІР°РЅРёСЏ
                            <input
                              type="date"
                              value={assignment?.endDate ?? ""}
                              onChange={(e) => updateMaterializeAssignment(line.id, { endDate: e.target.value })}
                              className={`mt-1 w-full ${inputField}`}
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 rounded-xl border border-fuchsia-100 bg-fuchsia-50/70 px-3 py-2 text-sm text-zinc-700">
                  Р‘СѓРґРµС‚ СЃРѕР·РґР°РЅРѕ {groupedMaterializePeriods.length} Р·Р°СЏРІРѕРє РїРѕ СѓРЅРёРєР°Р»СЊРЅС‹Рј РёРЅС‚РµСЂРІР°Р»Р°Рј.
                  <div className="mt-2 space-y-1 text-xs text-zinc-600">
                    {groupedMaterializePeriods.map((period) => (
                      <div key={period.key}>
                        {period.title}: {period.lineIds.length} РїРѕР·.
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => {
                      setMaterializeOpen(false);
                      setMatError(null);
                    }}
                  >
                    РћС‚РјРµРЅР°
                  </button>
                  <button type="button" className={btnPrimary} disabled={matBusy} onClick={() => void materializeDraft()}>
                    {matBusy ? "РЎРѕР·РґР°СЋ Р·Р°СЏРІРєСѓвЂ¦" : "РЎРѕР·РґР°С‚СЊ Р·Р°СЏРІРєСѓ"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function OrderLinePicker({
  catalogItems,
  existingItemIds,
  onAdd,
}: {
  catalogItems: Array<{
    id: string;
    name: string;
    availableNow?: number;
    availableForDates?: number;
    pricePerDay?: number;
  }>;
  existingItemIds: string[];
  onAdd: (itemId: string, name: string, qty: number, description: string) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [qtyStr, setQtyStr] = React.useState("1");
  const [description, setDescription] = React.useState("");
  const available = catalogItems.filter((item) => !existingItemIds.includes(item.id));
  const filtered =
    search.trim() === ""
      ? available
      : available.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()));
  const selected = available.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="text"
          value={selected ? selected.name : search}
          onChange={(e) => {
            setSelectedId(null);
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="РќР°Р№С‚Рё РїРѕР·РёС†РёСЋ РІ РєР°С‚Р°Р»РѕРіРµ"
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
        {open ? (
          <>
            <div className="fixed inset-0 z-10" aria-hidden onClick={() => setOpen(false)} />
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-2xl border border-zinc-200 bg-white p-1 shadow-lg">
              {filtered.length === 0 ? (
                <div className="px-3 py-3 text-sm text-zinc-500">РќРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… РїРѕР·РёС†РёР№</div>
              ) : (
                filtered.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-violet-50"
                    onClick={() => {
                      setSelectedId(item.id);
                      setSearch("");
                      setOpen(false);
                    }}
                  >
                    <span>{item.name}</span>
                    <span className="text-xs text-zinc-500">
                      {item.availableNow != null ? <>Р“РѕРґРЅС‹С…: {item.availableNow}</> : null}
                      {item.availableForDates != null ? (
                        <> В· РЅР° РґР°С‚С‹: {item.availableForDates}</>
                      ) : null}
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        ) : null}
      </div>

      {selected ? (
        <div className="grid gap-2 md:grid-cols-[120px_minmax(0,1fr)_auto]">
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            РљРѕР»-РІРѕ
            <input
              value={qtyStr}
              inputMode="numeric"
              onChange={(e) => setQtyStr(digitsOnlyInput(e.target.value))}
              onBlur={() => {
                const n = selected.availableNow ?? Number.POSITIVE_INFINITY;
                const d = selected.availableForDates ?? Number.POSITIVE_INFINITY;
                const cap = Math.min(n, d);
                let v = parseQtyCommitInt(qtyStr, 1);
                if (Number.isFinite(cap) && cap > 0) v = Math.min(v, Math.floor(cap));
                if (Number.isFinite(cap) && cap <= 0) v = 1;
                setQtyStr(String(v));
              }}
              className={`mt-1 w-28 ${inputField} tabular-nums`}
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            РћРїРёСЃР°РЅРёРµ
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`mt-1 w-full ${inputField}`}
              placeholder="РћРїРёСЃР°РЅРёРµ РґР»СЏ РЅРѕРІРѕР№ СЃС‚СЂРѕРєРё"
            />
          </label>
          <button
            type="button"
            className={`${btnPrimary} self-end`}
            onClick={() => {
              const n = selected.availableNow ?? Number.POSITIVE_INFINITY;
              const d = selected.availableForDates ?? Number.POSITIVE_INFINITY;
              const cap = Math.min(n, d);
              let v = parseQtyCommitInt(qtyStr, 1);
              if (Number.isFinite(cap) && cap > 0) v = Math.min(v, Math.floor(cap));
              onAdd(selected.id, selected.name, v, description);
              setSelectedId(null);
              setQtyStr("1");
              setDescription("");
            }}
          >
            Р”РѕР±Р°РІРёС‚СЊ
          </button>
        </div>
      ) : null}
    </div>
  );
}

function OrderServiceCard({
  title,
  enabled,
  comment,
  clientPrice,
  internalCost,
  internalPaymentMethod,
  editable,
  showClientPrice,
  onEnabledChange,
  onCommentChange,
  onClientPriceChange,
  onInternalCostChange,
  onInternalPaymentMethodChange,
}: {
  title: string;
  enabled: boolean;
  comment: string;
  clientPrice: string;
  internalCost: string;
  internalPaymentMethod: OrderServicePaymentMethod;
  editable: boolean;
  showClientPrice: boolean;
  onEnabledChange: (value: boolean) => void;
  onCommentChange: (value: string) => void;
  onClientPriceChange: (value: string) => void;
  onInternalCostChange: (value: string) => void;
  onInternalPaymentMethodChange: (value: OrderServicePaymentMethod) => void;
}) {
  return (
    <div className={`rounded-xl border bg-white/90 px-3 py-2 transition-all ${enabled ? "border-violet-200 shadow-sm" : "border-zinc-200"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-900">{title}</div>
        <button
          type="button"
          onClick={() => editable && onEnabledChange(!enabled)}
          disabled={!editable}
          className={[
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition",
            enabled ? "border-violet-500 bg-violet-600" : "border-zinc-300 bg-zinc-200",
            !editable ? "cursor-not-allowed opacity-60" : "",
          ].join(" ")}
          role="switch"
          aria-checked={enabled}
          aria-label={title}
        >
          <span
            className={[
              "inline-flex h-5 w-5 rounded-full bg-white shadow transition-transform",
              enabled ? "translate-x-6" : "translate-x-1",
            ].join(" ")}
          />
        </button>
      </div>
      {enabled ? (
        <div
          className={`mt-2 grid items-end gap-1.5 ${
            showClientPrice
              ? "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_4.75rem_4.75rem_6.5rem]"
              : "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_4.75rem_6.5rem]"
          }`}
        >
          <label className="block min-w-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            РљРѕРјРјРµРЅС‚.
            <input
              value={comment}
              onChange={(e) => onCommentChange(e.target.value)}
              className={`mt-0.5 w-full ${cellXs}`}
              disabled={!editable}
              placeholder="РљРѕРјРјРµРЅС‚Р°СЂРёР№"
            />
          </label>
          {showClientPrice ? (
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              РљР»РёРµРЅС‚ в‚Ѕ
              <input
                value={clientPrice}
                onChange={(e) => onClientPriceChange(e.target.value)}
                className={`mt-0.5 w-full max-w-[5.5rem] sm:max-w-none ${cellXs} tabular-nums`}
                disabled={!editable}
                placeholder="0"
                inputMode="decimal"
                maxLength={12}
              />
            </label>
          ) : null}
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Р’РЅСѓС‚СЂ. в‚Ѕ
            <input
              value={internalCost}
              onChange={(e) => onInternalCostChange(e.target.value)}
              className={`mt-0.5 w-full max-w-[5.5rem] sm:max-w-none ${cellXs} tabular-nums`}
              disabled={!editable}
              placeholder="0"
              inputMode="decimal"
              maxLength={12}
            />
          </label>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            РћРїР»Р°С‚Р°
            <select
              value={internalPaymentMethod}
              onChange={(e) => onInternalPaymentMethodChange(e.target.value as OrderServicePaymentMethod)}
              className={`mt-0.5 w-full ${cellXs}`}
              disabled={!editable}
            >
              <option value="NON_CASH">Р‘РµР·РЅР°Р»</option>
              <option value="CASH">РќР°Р»РёС‡РєР°</option>
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}
