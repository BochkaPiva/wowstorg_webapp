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
  internalExpenses?: EstLineInternalExpense[];
};

type EstLineInternalExpense = {
  id: string;
  sortOrder: number;
  title: string | null;
  cost: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  contractorNote: string | null;
  contractorRequisites: string | null;
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
  internalExpenses: LocalDraftLineInternalExpense[];
  orderLineId: null;
  itemId: null;
};

type LocalDraftLineInternalExpense = {
  id: string;
  sortOrder: number;
  title: string | null;
  cost: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  contractorNote: string | null;
  contractorRequisites: string | null;
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
  clientChargeTaxEnabled?: boolean;
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
  financials: {
    clientSubtotal: number;
    internalSubtotal: number;
    cashInternalCostTax: number;
    internalExpensesTotal: number;
    commission: number;
    clientChargeTax: number;
    revenueTotal: number;
    tax: number;
    grossMargin: number;
    marginAfterTax: number;
    marginAfterTaxPct: number;
  };
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
    clientChargeTaxEnabled: boolean;
    sections: EstSection[];
  } | null;
};

/** Единый стиль с ProjectSchedulePanel и остальными блоками проекта */
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

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M12 3a1 1 0 011 1v8.59l2.3-2.3a1 1 0 111.4 1.42l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.42l2.3 2.3V4a1 1 0 011-1zM5 17a1 1 0 011 1v1h12v-1a1 1 0 112 0v1.5A1.5 1.5 0 0118.5 21h-13A1.5 1.5 0 014 19.5V18a1 1 0 011-1z" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
    </svg>
  );
}

function formatOrderMoney(n: number) {
  return formatMoneyRub(n);
}

/** Пустая строка → null; иначе число ≥ 0 или null при невалидном вводе. */
function parseMoneyInputOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Новая",
  ESTIMATE_SENT: "Смета отправлена",
  CHANGES_REQUESTED: "Правки",
  APPROVED_BY_GREENWICH: "Согласована",
  PICKING: "Сборка",
  ISSUED: "Выдана",
  RETURN_DECLARED: "Ожидает приемки",
  CLOSED: "Закрыта",
  CANCELLED: "Отменена",
};

function orderStatusLabel(status: string) {
  return ORDER_STATUS_LABEL[status] ?? status;
}

function formatDateRu(dateOnly: string | null | undefined) {
  if (!dateOnly) return "—";
  const [y, m, d] = dateOnly.split("-").map((v) => Number(v));
  if (!y || !m || !d) return dateOnly;
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

/** Как `HelpLegend` на странице проекта — легенда по наведению на «?». */
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
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const [style, setStyle] = React.useState<React.CSSProperties>({});
  const updatePosition = React.useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    setStyle({
      position: "fixed",
      top: rect.bottom + 8,
      left,
      width,
      zIndex: 1000,
    });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onMouseEnter={() => {
          updatePosition();
          setOpen(true);
        }}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => {
          updatePosition();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          updatePosition();
          setOpen(true);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-sm font-black text-violet-700 shadow-sm hover:bg-violet-100"
        aria-label={title}
      >
        !
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div
          style={style}
          className="rounded-2xl border border-zinc-200 bg-white p-3 text-xs text-zinc-700 shadow-[0_20px_60px_rgba(24,24,27,0.18)]"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <div className="font-semibold text-zinc-950">{title}</div>
          <div className="mt-2">{children}</div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function draftEstimateStorageKey(projectId: string, versionNumber: number) {
  return `project-estimate-draft:${projectId}:v${versionNumber}`;
}

const ESTIMATE_DRAFT_SCHEMA_VERSION = 5;

function makeTempId(prefix: string) {
  return `draft-${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Дата YYYY-MM-DD по UTC (для полей materialize demo-заявки). */
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
        : `${formatRuDateFromISO(value.startDate)} — ${formatRuDateFromISO(value.endDate)}`,
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
      <option value="шт" />
      <option value="час" />
      <option value="усл." />
    </datalist>
  );
}

function cloneLineInternalExpenses(line: {
  internalExpenses?: EstLineInternalExpense[] | LocalDraftLineInternalExpense[] | null;
}): LocalDraftLineInternalExpense[] {
  return (line.internalExpenses ?? [])
    .map((expense, index) => ({
      id: expense.id,
      sortOrder: Number.isFinite(expense.sortOrder) ? expense.sortOrder : index,
      title: expense.title?.trim() || null,
      cost: expense.cost == null || expense.cost === "" ? null : String(expense.cost),
      paymentMethod: expense.paymentMethod?.trim() || null,
      paymentStatus: expense.paymentStatus?.trim() || null,
      contractorNote: expense.contractorNote ?? null,
      contractorRequisites: expense.contractorRequisites ?? null,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function normalizeInternalExpensesForCompare(expenses: LocalDraftLineInternalExpense[]) {
  return [...expenses]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((expense, index) => ({
      title: expense.title?.trim() || null,
      cost: expense.cost == null || expense.cost === "" ? null : String(Number(expense.cost)),
      paymentMethod: expense.paymentMethod?.trim() || null,
      paymentStatus: expense.paymentStatus?.trim() || null,
      contractorNote: expense.contractorNote?.trim() || null,
      contractorRequisites: expense.contractorRequisites?.trim() || null,
      sortOrder: index,
    }));
}

function lineInternalTotal(line: {
  costInternal?: string | number | null;
  internalExpenses?: Array<{ cost?: string | number | null }> | null;
}): number {
  return roundMoney(
    getNumericAmount(line.costInternal) +
      (line.internalExpenses ?? []).reduce((sum, expense) => sum + getNumericAmount(expense.cost), 0),
  );
}

function lineCashInternalTotal(line: {
  costInternal?: string | number | null;
  paymentMethod?: string | null;
  internalExpenses?: Array<{ cost?: string | number | null; paymentMethod?: string | null }> | null;
}): number {
  const primary = isCashPaymentMethod(line.paymentMethod) ? getNumericAmount(line.costInternal) : 0;
  const extra = (line.internalExpenses ?? []).reduce(
    (sum, expense) => sum + (isCashPaymentMethod(expense.paymentMethod) ? getNumericAmount(expense.cost) : 0),
    0,
  );
  return roundMoney(primary + extra);
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
        internalExpenses: cloneLineInternalExpenses(line),
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
        internalExpenses: normalizeInternalExpensesForCompare(line.internalExpenses ?? []),
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
          const match = line.description?.match(/Кол-во:\s*(\d+)/);
          return match ? Math.max(1, Number(match[1])) : 1;
        })();
  const plannedDays =
    typeof line.plannedDays === "number" && Number.isFinite(line.plannedDays)
      ? normalizeProjectEstimateDays(line.plannedDays) ?? 1
      : (() => {
          const match = line.description?.match(/Дней:\s*(\d+)/);
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
      .filter((chunk) => !/^Кол-во:\s*\d+$/i.test(chunk.trim()) && !/^Дней:\s*\d+$/i.test(chunk.trim()))
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

/** Только цифры (для input количества). */
function digitsOnlyInput(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Для отображения суммы при редактировании: пусто → 0; иначе целое ≥ 1, мусор → 0 */
function parseQtyDisplayInt(raw: string): number {
  const t = raw.trim();
  if (t === "") return 0;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 1 ? n : 0;
}

/** После blur: пусто или мусор → fallback (обычно 1) */
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

/** Учитывает и вёдра на складе, и «доступно на даты» из каталога (как на сервере warehouse-edit). */
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
  /** null = основная смета с сервера; число = явный выбор */
  const [uncontrolledSelectedVersion, setUncontrolledSelectedVersion] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [newSectionTitle, setNewSectionTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [selectedImportOrderIds, setSelectedImportOrderIds] = React.useState<string[]>([]);
  const [versionPickerOpen, setVersionPickerOpen] = React.useState(false);
  const [actionsOpen, setActionsOpen] = React.useState(false);
  const [downloadOpen, setDownloadOpen] = React.useState(false);
  const versionPickerWrapRef = React.useRef<HTMLDivElement>(null);
  const actionsWrapRef = React.useRef<HTMLDivElement>(null);
  const downloadWrapRef = React.useRef<HTMLDivElement>(null);
  const saveBarRef = React.useRef<HTMLDivElement | null>(null);
  const [localSectionsDraft, setLocalSectionsDraft] = React.useState<LocalDraftSection[]>([]);
  const [commissionEnabled, setCommissionEnabled] = React.useState(true);
  const [clientTaxEnabled, setClientTaxEnabled] = React.useState(true);
  const [clientChargeTaxEnabled, setClientChargeTaxEnabled] = React.useState(false);
  const [estimateDraftDirty, setEstimateDraftDirty] = React.useState(false);
  const [showFloatingSave, setShowFloatingSave] = React.useState(false);
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
            const baseClientChargeTaxEnabled = j.current?.clientChargeTaxEnabled ?? false;
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
                    const storedClientChargeTaxEnabled =
                      parsed.clientChargeTaxEnabled ?? baseClientChargeTaxEnabled;
                    const hasDestructiveEmptyDraft = storedSections.length === 0 && baseSections.length > 0;
                    const isSameAsServer =
                      JSON.stringify(normalizeLocalSectionsForCompare(storedSections)) ===
                        JSON.stringify(normalizeLocalSectionsForCompare(baseSections)) &&
                      storedCommissionEnabled === baseCommissionEnabled &&
                      storedClientTaxEnabled === baseClientTaxEnabled &&
                      storedClientChargeTaxEnabled === baseClientChargeTaxEnabled;
                    if (hasDestructiveEmptyDraft || isSameAsServer) {
                      window.localStorage.removeItem(storageKey);
                      setLocalSectionsDraft(baseSections);
                      setCommissionEnabled(baseCommissionEnabled);
                      setClientTaxEnabled(baseClientTaxEnabled);
                      setClientChargeTaxEnabled(baseClientChargeTaxEnabled);
                      setEstimateDraftDirty(false);
                    } else {
                      setLocalSectionsDraft(storedSections);
                      setCommissionEnabled(storedCommissionEnabled);
                      setClientTaxEnabled(storedClientTaxEnabled);
                      setClientChargeTaxEnabled(storedClientChargeTaxEnabled);
                      setEstimateDraftDirty(true);
                    }
                  } else {
                    window.localStorage.removeItem(storageKey);
                    setLocalSectionsDraft(baseSections);
                    setCommissionEnabled(baseCommissionEnabled);
                    setClientTaxEnabled(baseClientTaxEnabled);
                    setClientChargeTaxEnabled(baseClientChargeTaxEnabled);
                    setEstimateDraftDirty(false);
                  }
                } catch {
                  window.localStorage.removeItem(storageKey);
                  setLocalSectionsDraft(baseSections);
                  setCommissionEnabled(baseCommissionEnabled);
                  setClientTaxEnabled(baseClientTaxEnabled);
                  setClientChargeTaxEnabled(baseClientChargeTaxEnabled);
                  setEstimateDraftDirty(false);
                }
              } else {
                setLocalSectionsDraft(baseSections);
                setCommissionEnabled(baseCommissionEnabled);
                setClientTaxEnabled(baseClientTaxEnabled);
                setClientChargeTaxEnabled(baseClientChargeTaxEnabled);
                setEstimateDraftDirty(false);
              }
            } else {
              setLocalSectionsDraft([]);
              setCommissionEnabled(true);
              setClientTaxEnabled(true);
              setClientChargeTaxEnabled(false);
              setEstimateDraftDirty(false);
            }
            setError(null);
            setVersionPickerOpen(false);
            setActionsOpen(false);
            setDownloadOpen(false);
          }
        })
        .catch(() => {
          setError("Не удалось загрузить смету");
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
    if (!versionPickerOpen && !actionsOpen && !downloadOpen) return;
    function handlePointerDown(e: MouseEvent) {
      const t = e.target as Node;
      if (versionPickerWrapRef.current?.contains(t)) return;
      if (actionsWrapRef.current?.contains(t)) return;
      if (downloadWrapRef.current?.contains(t)) return;
      setVersionPickerOpen(false);
      setActionsOpen(false);
      setDownloadOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [versionPickerOpen, actionsOpen, downloadOpen]);

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
      clientChargeTaxEnabled,
    };
    window.localStorage.setItem(estimateDraftStorageKey, JSON.stringify(payload));
  }, [
    clientTaxEnabled,
    clientChargeTaxEnabled,
    commissionEnabled,
    currentVersionNumber,
    estimateDraftDirty,
    estimateDraftStorageKey,
    localSectionsDraft,
  ]);

  React.useEffect(() => {
    if (readOnly || !data?.current || !estimateDraftDirty || typeof IntersectionObserver === "undefined") {
      setShowFloatingSave(false);
      return;
    }
    const el = saveBarRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowFloatingSave(!entry?.isIntersecting);
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [data?.current, estimateDraftDirty, readOnly]);

  function mutateLocalSections(mutator: (prev: LocalDraftSection[]) => LocalDraftSection[]) {
    setLocalSectionsDraft((prev) => mutator(prev));
    setEstimateDraftDirty(true);
  }

  async function createEstimate(duplicate: boolean) {
    if (readOnly) return;
    const title =
      window.prompt("Название сметы", duplicate ? `Копия ${data?.current?.title ?? "сметы"}` : "Новая смета") ?? "";
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
        window.alert(j?.error?.message ?? "Ошибка");
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
        window.alert(j?.error?.message ?? "Ошибка");
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
    if (!window.confirm("Удалить раздел и все его строки?")) return;
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
                if (Array.isArray(patch.internalExpenses)) {
                  next = {
                    ...next,
                    internalExpenses: cloneLineInternalExpenses({
                      internalExpenses: patch.internalExpenses as LocalDraftLineInternalExpense[],
                    }).map((expense, index) => ({ ...expense, sortOrder: index })),
                  };
                }
                const q = next.qty != null ? Number(next.qty.replace(",", ".")) : NaN;
                const up =
                  next.unitPriceClient != null ? Number(next.unitPriceClient.replace(",", ".")) : NaN;
                const touchedPricing =
                  Object.prototype.hasOwnProperty.call(patch, "qty") ||
                  Object.prototype.hasOwnProperty.call(patch, "unitPriceClient");
                if (Number.isFinite(q) && q > 0 && Number.isFinite(up) && up >= 0) {
                  next = { ...next, costClient: String(roundMoney(q * up)) };
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
      unit: "шт",
      qty: null,
      unitPriceClient: null,
      costClient: null,
      costInternal: null,
      paymentMethod: null,
      paymentStatus: null,
      contractorNote: null,
      contractorRequisites: null,
      internalExpenses: [],
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
      internalExpenses?: LocalDraftLineInternalExpense[];
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
          costClientStr = String(roundMoney(q * up));
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
              internalExpenses: cloneLineInternalExpenses({ internalExpenses: payload.internalExpenses ?? [] }),
              orderLineId: null,
              itemId: null,
            },
          ],
        };
      }),
    );
  }

  function addLineInternalExpense(sectionId: string, lineId: string) {
    mutateLocalSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              lines: section.lines.map((line) => {
                if (line.id !== lineId) return line;
                const nextIndex = line.internalExpenses.length;
                return {
                  ...line,
                  internalExpenses: [
                    ...line.internalExpenses,
                    {
                      id: makeTempId("expense"),
                      sortOrder: nextIndex,
                      title: null,
                      cost: null,
                      paymentMethod: null,
                      paymentStatus: null,
                      contractorNote: null,
                      contractorRequisites: null,
                    },
                  ],
                };
              }),
            }
          : section,
      ),
    );
  }

  function patchLineInternalExpense(
    sectionId: string,
    lineId: string,
    expenseId: string,
    patch: Partial<LocalDraftLineInternalExpense>,
  ) {
    mutateLocalSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              lines: section.lines.map((line) =>
                line.id === lineId
                  ? {
                      ...line,
                      internalExpenses: line.internalExpenses.map((expense) =>
                        expense.id === expenseId
                          ? {
                              ...expense,
                              ...(Object.prototype.hasOwnProperty.call(patch, "title")
                                ? { title: patch.title == null ? null : String(patch.title) }
                                : {}),
                              ...(Object.prototype.hasOwnProperty.call(patch, "cost")
                                ? { cost: patch.cost == null || String(patch.cost).trim() === "" ? null : String(patch.cost) }
                                : {}),
                              ...(Object.prototype.hasOwnProperty.call(patch, "paymentMethod")
                                ? { paymentMethod: patch.paymentMethod?.trim() || null }
                                : {}),
                              ...(Object.prototype.hasOwnProperty.call(patch, "paymentStatus")
                                ? { paymentStatus: patch.paymentStatus?.trim() || null }
                                : {}),
                              ...(Object.prototype.hasOwnProperty.call(patch, "contractorNote")
                                ? { contractorNote: patch.contractorNote == null ? null : String(patch.contractorNote) }
                                : {}),
                              ...(Object.prototype.hasOwnProperty.call(patch, "contractorRequisites")
                                ? {
                                    contractorRequisites:
                                      patch.contractorRequisites == null ? null : String(patch.contractorRequisites),
                                  }
                                : {}),
                            }
                          : expense,
                      ),
                    }
                  : line,
              ),
            }
          : section,
      ),
    );
  }

  function deleteLineInternalExpense(sectionId: string, lineId: string, expenseId: string) {
    mutateLocalSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              lines: section.lines.map((line) =>
                line.id === lineId
                  ? {
                      ...line,
                      internalExpenses: line.internalExpenses
                        .filter((expense) => expense.id !== expenseId)
                        .map((expense, index) => ({ ...expense, sortOrder: index })),
                    }
                  : line,
              ),
            }
          : section,
      ),
    );
  }

  async function saveEstimateDraft() {
    if (readOnly || currentVersionNumber == null) return;
    const baseSections = data?.current?.sections ? cloneLocalSections(data.current.sections) : [];
    const deletingAllLocalSections = localSectionsDraft.length === 0 && baseSections.length > 0;
    if (
      deletingAllLocalSections &&
      !window.confirm("Удалить все локальные разделы из этой сметы?")
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
          clientChargeTaxEnabled,
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
              internalExpenses: line.internalExpenses
                .filter(
                  (expense) =>
                    (expense.title?.trim() ?? "") ||
                    (expense.cost != null && String(expense.cost).trim() !== "") ||
                    (expense.contractorNote?.trim() ?? "") ||
                    (expense.contractorRequisites?.trim() ?? ""),
                )
                .map((expense, expenseIndex) => ({
                  id: expense.id.startsWith("draft-") ? undefined : expense.id,
                  sortOrder: expenseIndex,
                  title: expense.title?.trim() || null,
                  cost:
                    expense.cost == null || String(expense.cost).trim() === ""
                      ? null
                      : Number(String(expense.cost).replace(",", ".")),
                  paymentMethod: expense.paymentMethod?.trim() || null,
                  paymentStatus: expense.paymentStatus?.trim() || null,
                  contractorNote: expense.contractorNote?.trim() || null,
                  contractorRequisites: expense.contractorRequisites?.trim() || null,
                })),
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
        window.alert(j?.error?.message ?? "Ошибка");
      }
    } finally {
      setBusy(false);
    }
  }

  function discardEstimateDraft() {
    if (!window.confirm("Сбросить несохранённые изменения сметы?")) return;
    if (estimateDraftStorageKey) window.localStorage.removeItem(estimateDraftStorageKey);
    const baseSections = data?.current?.sections ? cloneLocalSections(data.current.sections) : [];
    setLocalSectionsDraft(baseSections);
    setCommissionEnabled(data?.current?.commissionEnabled ?? true);
    setClientTaxEnabled(data?.current?.clientTaxEnabled ?? true);
    setClientChargeTaxEnabled(data?.current?.clientChargeTaxEnabled ?? false);
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
        label: `Заявка №${index + 1}`,
        dateLabel: `${order.startDate} — ${order.endDate}`,
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
    return [...sortSectionsBySortOrder(requisites), ...sortSectionsBySortOrder(localSectionsDraft)];
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
        const internalCost = lineInternalTotal(l);
        internalSubtotal += internalCost;
        cashInternalSubtotal += lineCashInternalTotal(l);
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
      clientChargeTaxEnabled,
    });

    return {
      clientSubtotal: estimateTotals.clientSubtotal,
      commission: estimateTotals.commission,
      clientChargeTax: estimateTotals.clientChargeTax,
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
  }, [renderedSections, commissionEnabled, clientTaxEnabled, clientChargeTaxEnabled]);

  const projectTotals = React.useMemo(() => {
    const included = (data?.versions ?? []).filter((version) => version.includeInProjectTotals);
    const revenueTotal = roundMoney(included.reduce((sum, version) => sum + version.financials.revenueTotal, 0));
    const internalSubtotal = roundMoney(included.reduce((sum, version) => sum + version.financials.internalSubtotal, 0));
    const cashInternalCostTax = roundMoney(
      included.reduce((sum, version) => sum + version.financials.cashInternalCostTax, 0),
    );
    const tax6 = roundMoney(included.reduce((sum, version) => sum + version.financials.tax, 0));
    const totalExpensesWithTax = roundMoney(internalSubtotal + cashInternalCostTax + tax6);
    const marginAfterTax = roundMoney(included.reduce((sum, version) => sum + version.financials.marginAfterTax, 0));
    const marginAfterTaxPct = revenueTotal > 0 ? roundMoney((marginAfterTax / revenueTotal) * 100) : 0;

    return {
      count: included.length,
      revenueTotal,
      internalSubtotal,
      cashInternalCostTax,
      tax6,
      totalExpensesWithTax,
      marginAfterTax,
      marginAfterTaxPct,
    };
  }, [data?.versions]);

  function money(n: number) {
    return formatMoneyRub(n);
  }

  return (
    <div className="space-y-4 rounded-[1.75rem] border border-white/70 bg-white/80 p-3 shadow-[0_18px_55px_rgba(24,24,27,0.10)] backdrop-blur sm:p-4">
      <UnitPresetDatalist />

      {loading ? (
        <p className="text-sm text-zinc-600">Загрузка…</p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : !data ? (
        <p className="text-sm text-zinc-600">Нет данных сметы.</p>
      ) : !data.current && data.versions.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-zinc-600">Смет ещё нет.</p>
          {!readOnly ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void createEstimate(false)}
              className={btnPrimary}
            >
              Создать первую смету
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="rounded-[1.75rem] border border-white/80 bg-[radial-gradient(circle_at_8%_0%,rgba(124,58,237,0.16),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(250,245,255,0.78),rgba(255,251,235,0.38))] p-4 shadow-[0_20px_58px_rgba(76,29,149,0.12)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-black uppercase tracking-[0.26em] text-violet-700">Финансы</span>
                  <EstimateHelpLegend title="Как работать со сметами">
                    Создавай отдельные сметы для основного договора и доп. соглашений. В общий итог проекта попадают только сметы с отметкой «В итогах проекта».
                  </EstimateHelpLegend>
                </div>
                <div className="mt-2 text-3xl font-black tracking-tight text-zinc-950">Сметы проекта</div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="relative" ref={versionPickerWrapRef}>
                  <button
                    type="button"
                    className="inline-flex min-h-16 min-w-[17rem] items-center justify-between gap-4 rounded-[1.25rem] border border-white/85 bg-white/88 px-4 py-3 text-left shadow-[0_14px_35px_rgba(24,24,27,0.10)] transition hover:-translate-y-0.5 hover:border-violet-200 hover:bg-white"
                    onClick={() => {
                      setVersionPickerOpen((v) => !v);
                      setActionsOpen(false);
                      setDownloadOpen(false);
                    }}
                  >
                    <span>
                      <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Открыта сейчас</span>
                      <span className="mt-1 block text-lg font-black leading-tight text-zinc-950">
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
                          {v.includeInProjectTotals ? (
                            <span className="rounded-full border border-violet-200 bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                              итог
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
                      className="inline-flex items-center rounded-full border border-violet-200 bg-white/80 px-3 py-1.5 text-xs font-extrabold text-violet-800 shadow-sm"
                    >
                      {currentVersionMeta.includeInProjectTotals ? "В итогах проекта" : "Не входит в итог"}
                    </span>
                    <span className="rounded-full border border-white/70 bg-white/55 px-3 py-1.5 text-xs font-semibold text-zinc-500">
                      {new Date(currentVersionMeta.createdAt).toLocaleDateString("ru-RU")}
                    </span>
                  </>
                ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                {vn != null ? (
                  <div className="relative" ref={downloadWrapRef}>
                    <button
                      type="button"
                      className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/80 bg-white/85 text-violet-800 shadow-[0_14px_35px_rgba(24,24,27,0.10)] transition hover:-translate-y-0.5 hover:bg-white"
                      aria-label="Скачать смету"
                      onClick={() => {
                        setDownloadOpen((v) => !v);
                        setActionsOpen(false);
                        setVersionPickerOpen(false);
                      }}
                    >
                      <DownloadIcon />
                    </button>
                    {downloadOpen ? (
                      <div className={menuPanel}>
                        <a href={exportHrefInternal} className={menuAction} target="_blank" rel="noreferrer">
                          <span>
                            <span className="block font-semibold">Внутренняя XLSX</span>
                            <span className="block text-xs text-zinc-500">Себестоимость, оплата, маржа</span>
                          </span>
                        </a>
                        <a href={exportHrefClient} className={menuAction} target="_blank" rel="noreferrer">
                          <span>
                            <span className="block font-semibold">Клиентская XLSX</span>
                            <span className="block text-xs text-zinc-500">Только то, что уходит клиенту</span>
                          </span>
                        </a>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {!readOnly ? (
              <div className="relative flex items-start justify-start lg:justify-end" ref={actionsWrapRef}>
                <button
                  type="button"
                  disabled={busy}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/80 bg-zinc-950 text-white shadow-[0_14px_35px_rgba(24,24,27,0.18)] transition hover:-translate-y-0.5 disabled:opacity-50"
                  aria-label="Действия со сметой"
                  onClick={() => {
                    setActionsOpen((v) => !v);
                    setVersionPickerOpen(false);
                    setDownloadOpen(false);
                  }}
                >
                  <MoreIcon />
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
                        <span className="block font-semibold">Новая смета</span>
                        <span className="block text-xs text-zinc-500">Создать отдельный документ</span>
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
                        <span className="block font-semibold">Дублировать текущую</span>
                        <span className="block text-xs text-zinc-500">Быстрый старт на основе этой сметы</span>
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
                        <span className="block font-semibold">Подтянуть из заявок</span>
                        <span className="block text-xs text-zinc-500">
                          {availableImportOrders.length > 0
                            ? `Доступно заявок: ${availableImportOrders.length}`
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
                        <span className="block font-semibold">Удалить смету</span>
                        <span className="block text-xs text-red-500">Недоступно для последней сметы</span>
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
                ) : null}
              </div>
            </div>
          </div>

          {!data.current ? (
            <p className="text-sm text-zinc-600">Выберите смету.</p>
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
                        Выбери заявки проекта для импорта в текущую смету
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
                          Импортировать выбранные
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setImportOpen(false);
                            setSelectedImportOrderIds([]);
                          }}
                          className={btnSecondary}
                        >
                          Отмена
                        </button>
                      </div>
                      </div>
                    </div>
                  ) : null}
                  <form
                    onSubmit={addSection}
                    className="grid gap-3 rounded-[1.4rem] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(250,245,255,0.74))] p-3 shadow-[0_12px_35px_rgba(76,29,149,0.08)] sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <input
                      value={newSectionTitle}
                      onChange={(e) => setNewSectionTitle(e.target.value)}
                      placeholder="Новый раздел: подрядчики, услуги, доп. соглашение..."
                      className={`min-w-[12rem] flex-1 ${inputField} min-h-12 rounded-2xl border-white/80 bg-white/90 shadow-sm`}
                      maxLength={200}
                    />
                    <button type="submit" disabled={busy} className={`${btnPrimary} min-h-12 rounded-2xl px-5`}>
                      Добавить раздел
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
                              onAddInternalExpense={addLineInternalExpense}
                              onPatchInternalExpense={patchLineInternalExpense}
                              onDeleteInternalExpense={deleteLineInternalExpense}
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
                                {sec.lines.length === 0 ? "+ Добавить строку" : "+ Строка"}
                              </button>
                            </div>
                          ) : null}
                        </>
                      )}
                    </EstimateSectionBlock>
                  ),
                )}
              </div>

              <div className="rounded-[1.5rem] border border-white/70 bg-white/75 p-3 shadow-[0_16px_45px_rgba(24,24,27,0.08)]">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-700">Выбранная смета</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-600">
                      {currentVersionMeta?.title?.trim() || "Текущая смета"}
                    </div>
                  </div>
                  {currentVersionMeta?.includeInProjectTotals ? (
                    <span className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-extrabold text-violet-800">
                      входит в проект
                    </span>
                  ) : (
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-extrabold text-zinc-600">
                      не входит в проект
                    </span>
                  )}
                </div>
                <div className="grid gap-3 xl:grid-cols-[1.15fr_0.95fr_1fr]">
                <div className="rounded-2xl border border-violet-200 bg-violet-50/80 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-violet-800">Клиент</div>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-600">Сумма по услугам</span>
                      <span className="font-bold tabular-nums text-violet-950">{money(totals.clientSubtotal)} ₽</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <EstimateFinanceToggle
                        label={`Комиссия ${Math.round(PROJECT_ESTIMATE_COMMISSION_RATE * 100)}%`}
                        checked={commissionEnabled}
                        disabled={readOnly || busy}
                        onChange={(value) => {
                          setCommissionEnabled(value);
                          setEstimateDraftDirty(true);
                        }}
                      />
                      <span className="font-bold tabular-nums text-violet-950">{money(totals.commission)} ₽</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <EstimateFinanceToggle
                        label={`Налог клиенту ${Math.round(PROJECT_ESTIMATE_TAX_RATE * 100)}%`}
                        checked={clientChargeTaxEnabled}
                        disabled={readOnly || busy}
                        onChange={(value) => {
                          setClientChargeTaxEnabled(value);
                          setEstimateDraftDirty(true);
                        }}
                      />
                      <span className="font-bold tabular-nums text-violet-950">{money(totals.clientChargeTax)} ₽</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-violet-200 pt-2 text-base">
                      <span className="font-extrabold text-violet-950">Итого клиенту</span>
                      <span className="font-black tabular-nums text-violet-950">{money(totals.revenueTotal)} ₽</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50/90 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-700">Внутреннее</div>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-600">Себестоимость</span>
                      <span className="font-bold tabular-nums text-zinc-950">{money(totals.internalSubtotal)} ₽</span>
                    </div>
                    {totals.cashInternalCostTax > 0 ? (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-zinc-600">Налог на наличку 3.5%</span>
                        <span className="font-bold tabular-nums text-zinc-950">{money(totals.cashInternalCostTax)} ₽</span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-600">Расходы без налога 6%</span>
                      <span className="font-bold tabular-nums text-zinc-950">{money(totals.internalWithCashTax)} ₽</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <EstimateFinanceToggle
                        label={`Расходный налог ${Math.round(PROJECT_ESTIMATE_TAX_RATE * 100)}%`}
                        checked={clientTaxEnabled}
                        disabled={readOnly || busy}
                        onChange={(value) => {
                          setClientTaxEnabled(value);
                          setEstimateDraftDirty(true);
                        }}
                      />
                      <span className="font-bold tabular-nums text-zinc-950">{money(totals.tax6)} ₽</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-zinc-200 pt-2">
                      <span className="font-semibold text-zinc-700">Расходы всего</span>
                      <span className="font-extrabold tabular-nums text-zinc-950">{money(totals.totalExpensesWithTax)} ₽</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-zinc-700">Валовая маржа</span>
                      <span className="font-extrabold tabular-nums text-zinc-950">{money(totals.grossMargin)} ₽</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Маржа</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <div>
                      <div className="text-xs font-semibold text-emerald-900">После налога</div>
                      <div className="mt-1 text-xl font-black tabular-nums text-emerald-950">{money(totals.marginAfterTax)} ₽</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-emerald-900">Рентабельность</div>
                      <div className="mt-1 text-xl font-black tabular-nums text-emerald-950">
                        {Number.isFinite(totals.marginAfterTaxPct) ? `${totals.marginAfterTaxPct.toFixed(0)}%` : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              </div>

              {data.versions.length > 1 ? (
                <div className="rounded-[1.5rem] border border-emerald-200 bg-[linear-gradient(135deg,rgba(236,253,245,0.88),rgba(255,255,255,0.96),rgba(250,245,255,0.45))] p-4 shadow-[0_16px_45px_rgba(6,78,59,0.08)]">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-800">Итоги проекта</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-600">
                        Сумма всех смет с отметкой «В итогах проекта»
                      </div>
                    </div>
                    <span className="rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-extrabold text-emerald-900">
                      {projectTotals.count} из {data.versions.length} смет
                    </span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-violet-100 bg-white/80 p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">Клиент</div>
                      <div className="mt-2 text-xl font-black tabular-nums text-violet-950">{money(projectTotals.revenueTotal)} ₽</div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-white/80 p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-600">Расходы</div>
                      <div className="mt-2 text-xl font-black tabular-nums text-zinc-950">{money(projectTotals.totalExpensesWithTax)} ₽</div>
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-white/80 p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-800">Прибыль</div>
                      <div className="mt-2 text-xl font-black tabular-nums text-emerald-950">{money(projectTotals.marginAfterTax)} ₽</div>
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-white/80 p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-800">Рентабельность</div>
                      <div className="mt-2 text-xl font-black tabular-nums text-emerald-950">
                        {Number.isFinite(projectTotals.marginAfterTaxPct) ? `${projectTotals.marginAfterTaxPct.toFixed(2)}%` : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {!readOnly && data?.current ? (
                <div
                  ref={saveBarRef}
                  className="flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-violet-200 bg-[linear-gradient(135deg,rgba(237,233,254,0.55),rgba(255,255,255,0.98),rgba(196,181,253,0.12))] p-4"
                >
                  <button
                    type="button"
                    disabled={busy || !estimateDraftDirty}
                    onClick={discardEstimateDraft}
                    className={`${btnSecondary} min-h-11`}
                  >
                    Сбросить черновик
                  </button>
                  <button
                    type="button"
                    disabled={busy || !estimateDraftDirty}
                    onClick={() => void saveEstimateDraft()}
                    className="min-h-12 rounded-xl border border-violet-500 bg-[linear-gradient(135deg,#7c3aed,#6d28d9)] px-5 py-3 text-sm font-extrabold text-white shadow-[0_12px_28px_rgba(124,58,237,0.28)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? "Сохраняю смету…" : "Сохранить смету"}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
      {showFloatingSave && typeof document !== "undefined"
        ? createPortal(
            <button
              type="button"
              disabled={busy || !estimateDraftDirty}
              onClick={() => void saveEstimateDraft()}
              className="fixed bottom-6 right-6 z-[160] rounded-2xl border border-violet-500 bg-[linear-gradient(135deg,#7c3aed,#111827)] px-5 py-3 text-sm font-extrabold text-white shadow-[0_18px_45px_rgba(76,29,149,0.32)] transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Сохраняю…" : "Сохранить смету"}
            </button>,
            document.body,
          )
        : null}
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
  defaultOpen = true,
}: {
  sec: EstSection | LocalDraftSection;
  orderMeta: { index: number; label: string; dateLabel: string; status: string; eventName: string | null } | null;
  readOnly: boolean;
  busy: boolean;
  onPatchSection: (id: string, patch: { title?: string }) => void | Promise<void>;
  onDeleteSection: (id: string) => void | Promise<void>;
  children: React.ReactNode;
  /** Рядом с заголовком секции (например, индикатор редактирования заявки). */
  summaryTitleAddon?: React.ReactNode;
  /** Если задано — подменяет стандартную колонку «Открыть заявку» справа в summary. */
  summaryTrailing?: React.ReactNode;
  defaultOpen?: boolean;
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
    sec.lines.reduce((sum, line) => sum + lineInternalTotal(line), 0),
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
      open={defaultOpen ? true : undefined}
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
                  ? "Реквизит"
                  : sec.kind === "DRAFT_REQUISITE"
                    ? "Demo-реквизит"
                    : sec.kind === "CONTRACTOR"
                      ? "Подрядчики"
                    : "Универсальный"}
              </span>
              {orderMeta ? (
                <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
                  {orderMeta.label}
                </span>
              ) : null}
              {sec.kind === "CONTRACTOR" ? (
                <EstimateHelpLegend title="Раздел подрядчиков">
                  Добавляй сюда услуги, которые делает подрядчик или команда. Клиент увидит название, описание и цену. Внутренние поля нужны только нам: сколько реально стоит работа и как ее оплатили.
                </EstimateHelpLegend>
              ) : sec.kind === "DRAFT_REQUISITE" ? (
                <EstimateHelpLegend title="Demo-реквизит">
                  Это предварительный список реквизита без дат. Он помогает посчитать смету заранее, но склад ничего не резервирует до создания реальной заявки.
                </EstimateHelpLegend>
              ) : sec.kind === "LOCAL" ? (
                <EstimateHelpLegend title="Универсальный раздел">
                  Используй его для ручных строк сметы, которые не относятся к заявке реквизита: услуги, разовые расходы, нестандартные позиции.
                </EstimateHelpLegend>
              ) : null}
            </div>
            <div
              className={`mt-2 text-lg font-semibold text-zinc-950 ${summaryTitleAddon ? "flex min-w-0 flex-wrap items-center gap-2" : ""}`}
            >
              {summaryTitleAddon}
              <span className="min-w-0">
                {sec.kind === "REQUISITE"
                  ? orderMeta?.label ?? "Реквизит"
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
                        .split(" — ")
                        .map((value) => formatDateRu(value))
                        .join(" — ")}
                    </span>
                  ) : null}
                </>
              ) : sec.kind === "DRAFT_REQUISITE" ? (
                <span className="rounded-full border border-fuchsia-100 bg-white/75 px-2 py-1">
                  {sec.lines.length} поз. · demo без резерва
                </span>
              ) : sec.kind === "CONTRACTOR" ? (
                <span className="rounded-full border border-zinc-200 bg-white/75 px-2 py-1">
                  {sec.lines.length} строк · подрядчики и услуги
                </span>
              ) : (
                <span className="rounded-full border border-indigo-100 bg-white/75 px-2 py-1">
                  {sec.lines.length} строк · ручной раздел
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-start justify-end gap-2 self-start">
            <div className="flex w-full flex-wrap justify-end gap-2 group-open:hidden sm:w-auto">
              <div className="min-w-[8.5rem] rounded-2xl border border-violet-200 bg-violet-50/80 px-3 py-2 text-right shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-wide text-violet-700">Услуги</div>
                <div className="mt-0.5 text-sm font-black tabular-nums text-violet-950">{formatMoneyRub(sectionClientSubtotal)} ₽</div>
              </div>
              <div className="min-w-[8.5rem] rounded-2xl border border-zinc-200 bg-zinc-50/90 px-3 py-2 text-right shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Себестоимость</div>
                <div className="mt-0.5 text-sm font-black tabular-nums text-zinc-950">{formatMoneyRub(sectionInternalSubtotal)} ₽</div>
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
                  title="Редактировать название раздела"
                  aria-label="Редактировать название раздела"
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
                  Удалить раздел
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
                Открыть заявку
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
                placeholder="Название раздела"
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
                Сохранить
              </button>
              <button
                type="button"
                className={btnSecondary}
                onClick={() => {
                  setTitleDraft(sec.title);
                  setEditingTitle(false);
                }}
              >
                Отмена
              </button>
            </div>
          ) : sec.kind === "LOCAL" || sec.kind === "CONTRACTOR" ? (
            <div className="hidden">
              <button
                type="button"
                className={btnGhostXs}
                onClick={() => setEditingTitle(true)}
                disabled={busy}
                title="Редактировать название раздела"
                aria-label="Редактировать название раздела"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l9.06-9.06.92.92L5.92 20.08zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                </svg>
                <span>Название</span>
              </button>
              {sec.kind === "LOCAL" || sec.kind === "CONTRACTOR" ? (
                <button
                  type="button"
                  className={`${btnGhostXs} border-red-200 text-red-700 hover:bg-red-50`}
                  onClick={() => void onDeleteSection(sec.id)}
                  disabled={busy}
                >
                  Удалить раздел
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

/** Сетка строки «клиентские» колонки — совпадает в редакторе и в форме добавления. */
const ESTIMATE_CLIENT_ROW_GRID =
  "grid gap-1.5 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_4.5rem_4rem_4.5rem_4.5rem]";

const PAYMENT_METHOD_OPTIONS = ["Наличные", "Безнал"] as const;
const PAYMENT_STATUS_PAID = "Оплачено";
const PAYMENT_STATUS_UNPAID = "Не оплачено";
/** Уникальный id datalist для комбобокса статуса (input list=… + datalist). */
const paymentStatusDatalistId = (suffix: string) => `project-estimate-pst-${suffix}`;

/** Сумма клиенту: только qty×цена; иначе наследованный costClient (старые строки). */
function displayLocalLineClientSum(line: {
  costClient?: string | null;
  qty?: string | number | null;
  unitPriceClient?: string | number | null;
}): string {
  return normalizedLocalLineCostClientString(line) ?? "—";
}

/** Цвет текста значения статуса (без фона и анимации). */
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
  onAddInternalExpense,
  onPatchInternalExpense,
  onDeleteInternalExpense,
}: {
  sectionId: string;
  sectionKind: "LOCAL" | "CONTRACTOR";
  line: LocalDraftLine | (EstLine & { unit?: string | null; paymentMethod?: string | null });
  isDirty: boolean;
  readOnly: boolean;
  busy: boolean;
  onSave: (sectionId: string, id: string, p: Record<string, unknown>) => void;
  onDelete: (sectionId: string, id: string) => void;
  onAddInternalExpense?: (sectionId: string, lineId: string) => void;
  onPatchInternalExpense?: (
    sectionId: string,
    lineId: string,
    expenseId: string,
    patch: Partial<LocalDraftLineInternalExpense>,
  ) => void;
  onDeleteInternalExpense?: (sectionId: string, lineId: string, expenseId: string) => void;
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
    const internalExpenses =
      "internalExpenses" in line ? ((line.internalExpenses ?? []) as LocalDraftLineInternalExpense[]) : [];
    const clientSum = displayLocalLineClientSum(line);
    const contractorClientGrid =
      "grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1.1fr)_5.5rem_5.5rem_6rem_7rem]";
    const paymentMethodOptions = [
      { value: "", label: "—" },
      { value: PAYMENT_METHOD_OPTIONS[0], label: "Нал." },
      { value: PAYMENT_METHOD_OPTIONS[1], label: "Безнал" },
    ];
    const paymentStatusOptions = [
      { value: "", label: "—" },
      { value: PAYMENT_STATUS_PAID, label: "Оплачено" },
      { value: PAYMENT_STATUS_UNPAID, label: "Не оплачено" },
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
              <div className="text-[11px] font-bold uppercase tracking-wide text-violet-700">Клиенту</div>
              <div className="truncate text-sm font-semibold text-zinc-950">{line.name || "Новая позиция"}</div>
            </div>
          </div>
          {isDirty ? (
            <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700">
              изменено
            </span>
          ) : null}
        </div>

        {!line.orderLineId ? (
          <button
            type="button"
            disabled={busy}
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            onClick={() => void onDelete(sectionId, line.id)}
            title="Удалить позицию"
            aria-label="Удалить позицию"
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
              Позиция
              <input
                value={line.name}
                onChange={(e) => onSave(sectionId, line.id, { name: e.target.value })}
                className={`mt-1 w-full ${cellXs}`}
              />
            </label>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Описание
              <input
                value={line.description ?? ""}
                onChange={(e) => onSave(sectionId, line.id, { description: e.target.value })}
                className={`mt-1 w-full ${cellXs}`}
              />
            </label>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Ед.
              <input
                value={unitVal}
                onChange={(e) => onSave(sectionId, line.id, { unit: e.target.value })}
                className={`mt-1 w-full ${cellXs}`}
                list={UNIT_DATALIST_ID}
                placeholder="шт"
              />
            </label>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Кол-во
              <input
                value={qtyStr}
                onChange={(e) => onSave(sectionId, line.id, { qty: e.target.value })}
                className={`mt-1 w-full ${cellXs} tabular-nums`}
                inputMode="decimal"
              />
            </label>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Цена/ед.
              <input
                value={upStr}
                onChange={(e) => onSave(sectionId, line.id, { unitPriceClient: e.target.value })}
                className={`mt-1 w-full ${cellXs} tabular-nums`}
                inputMode="decimal"
              />
            </label>
            <div className="rounded-xl border border-violet-200 bg-white/80 px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-violet-700">Сумма</div>
              <div className="mt-1 text-sm font-extrabold tabular-nums text-violet-950">
                {clientSum}
                {clientSum !== "—" ? <span className="ml-0.5 text-xs font-semibold text-violet-500">₽</span> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">Внутреннее</div>
            <div className="text-[11px] font-semibold tabular-nums text-zinc-600">
              Всего: {formatMoneyRub(lineInternalTotal(line))} ₽
            </div>
          </div>
          <div className="grid gap-2 xl:grid-cols-[6rem_9rem_13rem_minmax(0,1fr)_minmax(0,1fr)]">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Внутр. ₽
              <input
                value={line.costInternal ?? ""}
                onChange={(e) => onSave(sectionId, line.id, { costInternal: e.target.value })}
                className={`mt-1 w-full ${cellXs} tabular-nums`}
                inputMode="decimal"
              />
            </label>
            <div className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Оплата
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
              Статус оплаты
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
              Коммент. подрядчику
              <input
                value={contractorNote}
                onChange={(e) => onSave(sectionId, line.id, { contractorNote: e.target.value })}
                className={`mt-1 w-full ${cellXs}`}
              />
            </label>
            <label className="block min-w-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Реквизиты / счёт
              <input
                value={contractorRequisites}
                onChange={(e) => onSave(sectionId, line.id, { contractorRequisites: e.target.value })}
                className={`mt-1 w-full ${cellXs}`}
              />
            </label>
          </div>

          {internalExpenses.length > 0 ? (
            <div className="mt-3 space-y-2 border-t border-dashed border-zinc-200 pt-3">
              {internalExpenses.map((expense, expenseIndex) => {
                const expensePaymentMethod = expense.paymentMethod?.trim() || "";
                const expensePaymentStatus = expense.paymentStatus?.trim() || "";
                return (
                  <div
                    key={expense.id}
                    className="rounded-2xl border border-white/80 bg-white/85 p-2 shadow-sm"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                        Внутр. трата #{expenseIndex + 1}
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                        onClick={() => onDeleteInternalExpense?.(sectionId, line.id, expense.id)}
                        title="Удалить внутреннюю трату"
                        aria-label="Удалить внутреннюю трату"
                      >
                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden>
                          <path
                            d="M5.75 5.75l8.5 8.5m0-8.5l-8.5 8.5"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeWidth="2"
                          />
                        </svg>
                      </button>
                    </div>
                    <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_6rem_9rem_13rem_minmax(0,1fr)_minmax(0,1fr)]">
                      <label className="block min-w-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        Название
                        <input
                          value={expense.title ?? ""}
                          onChange={(e) =>
                            onPatchInternalExpense?.(sectionId, line.id, expense.id, { title: e.target.value })
                          }
                          className={`mt-1 w-full ${cellXs}`}
                          placeholder="Например, аренда PS5"
                        />
                      </label>
                      <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        Внутр. ₽
                        <input
                          value={expense.cost ?? ""}
                          onChange={(e) =>
                            onPatchInternalExpense?.(sectionId, line.id, expense.id, { cost: e.target.value })
                          }
                          className={`mt-1 w-full ${cellXs} tabular-nums`}
                          inputMode="decimal"
                        />
                      </label>
                      <div className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        Оплата
                        <div className="mt-1 grid min-h-8 grid-cols-3 rounded-xl border border-zinc-200 bg-white p-0.5 shadow-sm">
                          {paymentMethodOptions.map((opt) => {
                            const active = expensePaymentMethod === opt.value;
                            return (
                              <button
                                key={opt.value || "empty"}
                                type="button"
                                className={`min-w-0 truncate rounded-lg px-1.5 py-1.5 text-[11px] font-semibold leading-none transition ${
                                  active ? "bg-violet-600 text-white shadow-sm" : "text-zinc-600 hover:bg-zinc-50"
                                }`}
                                onClick={() =>
                                  onPatchInternalExpense?.(sectionId, line.id, expense.id, {
                                    paymentMethod: opt.value === "" ? null : opt.value,
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
                      <div className="block min-w-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        Статус оплаты
                        <div className="mt-1 grid min-h-8 grid-cols-3 rounded-xl border border-zinc-200 bg-white p-0.5 shadow-sm">
                          {paymentStatusOptions.map((opt) => {
                            const active = expensePaymentStatus === opt.value;
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
                                  onPatchInternalExpense?.(sectionId, line.id, expense.id, {
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
                        Коммент.
                        <input
                          value={expense.contractorNote ?? ""}
                          onChange={(e) =>
                            onPatchInternalExpense?.(sectionId, line.id, expense.id, {
                              contractorNote: e.target.value,
                            })
                          }
                          className={`mt-1 w-full ${cellXs}`}
                        />
                      </label>
                      <label className="block min-w-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        Реквизиты / счёт
                        <input
                          value={expense.contractorRequisites ?? ""}
                          onChange={(e) =>
                            onPatchInternalExpense?.(sectionId, line.id, expense.id, {
                              contractorRequisites: e.target.value,
                            })
                          }
                          className={`mt-1 w-full ${cellXs}`}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          <button
            type="button"
            disabled={busy}
            className="mt-3 inline-flex items-center rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-800 shadow-sm transition hover:bg-violet-50 disabled:opacity-50"
            onClick={() => onAddInternalExpense?.(sectionId, line.id)}
          >
            + Внутр. трата
          </button>
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
        {line.orderLineId ? " · из заявки" : ""}
      </div>
      {readOnly ? (
        <div className="mt-0.5 space-y-0.5">
          <div className="font-medium">{line.name}</div>
          {line.description ? <div className="text-[11px] text-zinc-600">{line.description}</div> : null}
          <div className="text-[11px]">
            {qtyStr || "—"} × {upStr || "—"} → {displayLocalLineClientSum(line)} ₽ · внутр. {formatMoneyRub(lineInternalTotal(line))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded-lg border border-violet-200/80 bg-violet-50/50 p-2">
            <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-violet-900/85">Клиенту</div>
            <div className={ESTIMATE_CLIENT_ROW_GRID}>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Позиция
                <input
                  value={line.name}
                  onChange={(e) => onSave(sectionId, line.id, { name: e.target.value })}
                  className={`mt-0.5 w-full ${cellXs}`}
                />
              </label>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Описание
                <input
                  value={line.description ?? ""}
                  onChange={(e) => onSave(sectionId, line.id, { description: e.target.value })}
                  className={`mt-0.5 w-full ${cellXs}`}
                />
              </label>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Ед.
                <input
                  value={unitVal}
                  onChange={(e) => onSave(sectionId, line.id, { unit: e.target.value })}
                  className={`mt-0.5 w-full ${cellXs}`}
                  list={UNIT_DATALIST_ID}
                  placeholder="шт"
                />
              </label>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Кол-во
                <input
                  value={qtyStr}
                  onChange={(e) => onSave(sectionId, line.id, { qty: e.target.value })}
                  className={`mt-0.5 w-full ${cellXs} tabular-nums`}
                  inputMode="decimal"
                />
              </label>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Цена/ед
                <input
                  value={upStr}
                  onChange={(e) => onSave(sectionId, line.id, { unitPriceClient: e.target.value })}
                  className={`mt-0.5 w-full ${cellXs} tabular-nums`}
                  inputMode="decimal"
                />
              </label>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Сумма
                <div
                  className={`mt-0.5 flex min-h-[1.75rem] w-full items-center tabular-nums ${cellXs} bg-zinc-100/90 text-zinc-800`}
                  title="Считается как количество × цена за ед."
                >
                  {displayLocalLineClientSum(line)}
                  {displayLocalLineClientSum(line) !== "—" ? <span className="ml-0.5 text-zinc-500">₽</span> : null}
                </div>
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200/95 bg-zinc-50/85 p-2">
            <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-zinc-600">Наши поля</div>
            {isContractor ? (
              <div className="grid gap-1.5 xl:grid-cols-[4.5rem_7rem_1fr_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Внутр.
                  <input
                    value={line.costInternal ?? ""}
                    onChange={(e) => onSave(sectionId, line.id, { costInternal: e.target.value })}
                    className={`mt-0.5 w-full ${cellXs} tabular-nums`}
                    inputMode="decimal"
                  />
                </label>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Оплата
                  <select
                    value={("paymentMethod" in line ? line.paymentMethod : null)?.trim() || ""}
                    onChange={(e) =>
                      onSave(sectionId, line.id, {
                        paymentMethod: e.target.value === "" ? null : e.target.value,
                      })
                    }
                    className={`mt-0.5 w-full ${cellXs} bg-white`}
                  >
                    <option value="">—</option>
                    {PAYMENT_METHOD_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block min-w-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 xl:col-span-1">
                  Статус оплаты
                  <input
                    value={paymentStatusRaw ?? ""}
                    onChange={(e) => {
                      const t = e.target.value;
                      onSave(sectionId, line.id, {
                        paymentStatus: t.trim() === "" ? null : t,
                      });
                    }}
                    list={paymentStatusDatalistId(line.id)}
                    placeholder="Выберите из списка или введите"
                    autoComplete="off"
                    className={`mt-0.5 w-full min-w-0 ${cellXs} bg-white ${paymentStatusTextClass(paymentStatusRaw)}`}
                  />
                  <datalist id={paymentStatusDatalistId(line.id)}>
                    <option value={PAYMENT_STATUS_PAID} />
                    <option value={PAYMENT_STATUS_UNPAID} />
                  </datalist>
                </label>
                <label className="block min-w-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 xl:col-span-1">
                  Коммент. подрядчику
                  <input
                    value={"contractorNote" in line ? (line.contractorNote ?? "") : ""}
                    onChange={(e) => onSave(sectionId, line.id, { contractorNote: e.target.value })}
                    className={`mt-0.5 w-full ${cellXs}`}
                  />
                </label>
                <label className="block min-w-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 xl:col-span-1">
                  Реквизиты / счёт
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
                      Уд.
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Внутр.
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
                    Уд.
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
        setError(j?.error?.message ?? "Не удалось сохранить ед. изм. в смете");
      }
    } catch {
      setError("Не удалось сохранить ед. изм. в смете");
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
        setError(orderJson?.error?.message ?? "Не удалось загрузить связанную заявку");
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
      setError("Не удалось загрузить связанную заявку");
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
        setError(json?.error?.message ?? "Не удалось сохранить заявку");
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
  const taxAmount = roundMoney((rentalTotal + servicesTotal) * ORDER_TAX_RATE);

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
          aria-label="Статус редактирования заявки"
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
            <div className="font-semibold text-zinc-900">Легенда</div>
            <div className="mt-2 flex items-center gap-2 text-zinc-700">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Зелёный: заявку можно редактировать из сметы
            </div>
            <div className="mt-1 flex items-center gap-2 text-zinc-700">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              Красный: заявка заблокирована текущим этапом
            </div>
            <div className="mt-2 text-zinc-500">Статус заявки не дублируется здесь, он уже виден в степпере сверху.</div>
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
        Открыть заявку
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
          {saving ? "Сохранение…" : "Сохранить заявку"}
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
      defaultOpen={false}
    >
      {loading ? (
        <div className="rounded-2xl border border-zinc-200 bg-white/80 px-4 py-4 text-sm text-zinc-600">Загрузка связанной заявки…</div>
      ) : !order ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error ?? "Связанная заявка не найдена"}
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
                    Позиция
                    <input value={line.name} readOnly className={`mt-0.5 w-full ${cellXs} bg-zinc-50`} />
                  </label>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    Описание
                    <input
                      value={line.description}
                      onChange={(e) => updateLine(index, { description: e.target.value })}
                      className={`mt-0.5 w-full ${cellXs}`}
                      disabled={!editable}
                      placeholder="Примечание"
                    />
                  </label>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    Ед.
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
                      placeholder="шт"
                    />
                  </label>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    Кол-во
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
                    <div className="text-[9px] font-semibold uppercase text-zinc-500">Дней</div>
                    <div className="mt-0.5 text-xs font-bold tabular-nums text-zinc-900">{dayC}</div>
                  </div>
                  <div className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5">
                    <div className="text-[9px] font-semibold uppercase text-zinc-500">Цена/ед</div>
                    <div className="mt-0.5 text-xs font-bold tabular-nums text-zinc-900">{formatOrderMoney(ppu)} ₽</div>
                  </div>
                  <div className="rounded border border-violet-100 bg-violet-50 px-2 py-1.5">
                    <div className="text-[9px] font-semibold uppercase text-violet-700">Сумма</div>
                    <div className="mt-0.5 text-xs font-bold tabular-nums text-violet-950">
                      {formatOrderMoney(lineTotal)} ₽
                    </div>
                  </div>
                  <div className="flex items-end justify-end gap-2">
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => removeLine(index)}
                        className={`${btnGhostXs} border-red-200 text-red-700 hover:bg-red-50`}
                      >
                        Удалить
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
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">Добавить позицию в заявку</div>
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
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Доп. услуги</div>
            <div className="mt-3 space-y-2">
              <OrderServiceCard
                title="Доставка"
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
                title="Монтаж"
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
                title="Демонтаж"
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
                      Доставка — ед. (смета)
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
                        placeholder="усл."
                      />
                    </label>
                  ) : null}
                  {services.montageEnabled ? (
                    <label className="block text-[10px] font-semibold text-zinc-500">
                      Монтаж — ед. (смета)
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
                        placeholder="усл."
                      />
                    </label>
                  ) : null}
                  {services.demontageEnabled ? (
                    <label className="block text-[10px] font-semibold text-zinc-500">
                      Демонтаж — ед. (смета)
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
                        placeholder="усл."
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">Итого по заявке</div>
            <div className="mt-3 space-y-2 text-sm text-zinc-700">
              <div className="flex items-center justify-between gap-3">
                <span>Аренда</span>
                <span className="font-semibold text-zinc-950">{formatOrderMoney(rentalTotal)} ₽</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Доп. услуги</span>
                <span className="font-semibold text-zinc-950">{formatOrderMoney(servicesTotal)} ₽</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Налог {Math.round(ORDER_TAX_RATE * 100)}%</span>
                <span className="font-semibold text-zinc-950">{formatOrderMoney(taxAmount)} ₽</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-violet-200 pt-2 text-base font-bold text-violet-950">
                <span>Всего</span>
                <span>{formatOrderMoney(rentalTotal + servicesTotal + taxAmount)} ₽</span>
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
        return sum + roundMoney((line.pricePerDaySnapshot ?? 0) * q * d);
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
        setError(data?.error?.message ?? "Не удалось сохранить demo-заявку");
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
      setMatError("Сначала сохраните изменения кнопкой «Сохранить demo».");
      return;
    }
    if (lines.length === 0) {
      setMatError("Нет позиций для материализации.");
      return;
    }
    if (lines.some((l) => l.id.startsWith("draft-"))) {
      setMatError("Сохраните demo-заявку: у новых строк ещё нет идентификаторов на сервере.");
      return;
    }
    if (materializeAssignments.length !== lines.length) {
      setMatError("Не удалось подготовить интервалы для всех позиций. Закройте окно и откройте снова.");
      return;
    }
    if (materializeAssignments.some((assignment) => !assignment.startDate || !assignment.endDate)) {
      setMatError("Укажите даты использования для каждой позиции.");
      return;
    }
    if (materializeAssignments.some((assignment) => assignment.startDate > assignment.endDate)) {
      setMatError("Дата окончания не может быть раньше даты начала.");
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
        setMatError(data?.error?.message ?? "Не удалось создать заявки");
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
            Demo-заявка без дат
          </div>
          <div className="relative">
            <button
              type="button"
              onMouseEnter={() => setLegendOpen(true)}
              onMouseLeave={() => setLegendOpen(false)}
              onFocus={() => setLegendOpen(true)}
              onBlur={() => setLegendOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-fuchsia-200 bg-white text-fuchsia-700"
              aria-label="Пояснение по demo-заявке"
            >
              ?
            </button>
            {legendOpen ? (
              <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-2xl border border-zinc-200 bg-white p-3 text-xs text-zinc-700 shadow-xl">
                <div className="font-semibold text-zinc-950">Легенда</div>
                <div className="mt-2">
                  Demo-заявка не резервирует остатки и нужна для расчёта сметы до подтверждения конкретных интервалов.
                </div>
                <div className="mt-2">
                  Поле `Дней` влияет только на предварительную смету. Кнопка «В реальную заявку» открывает выбор дат и
                  создаёт складскую заявку выдачи для третьих лиц (как у проекта), не Greenwich. Дата готовности в системе
                  совпадает с датой начала периода (нужно предварительно сохранить demo).
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
              title={draftDirty ? "Сначала сохраните изменения кнопкой «Сохранить demo»" : undefined}
              className={btnSecondary}
            >
              В реальную заявку
            </button>
            <button type="button" onClick={() => void saveDraft()} disabled={busy} className={btnPrimary}>
              {busy ? "Сохраняю demo…" : "Сохранить demo"}
            </button>
          </div>
        ) : null}
      </div>

      {error ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</div> : null}

      <p className="hidden">
        Количество ограничено физическим остатком на складе (годные единицы по вёдрам: total − ремонт − брак − недостача), без учёта резерва по датам. При переводе в реальные заявки дополнительно проверяется доступность на выбранные периоды.
      </p>

      {!readOnly ? (
        <div className="rounded-2xl border border-dashed border-fuchsia-300 bg-fuchsia-50/40 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fuchsia-800">
            Добавить позицию из каталога
          </div>
          {catalogLoading ? (
            <p className="text-sm text-zinc-600">Загрузка каталога…</p>
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
            qDisp > 0 && dDisp > 0 ? roundMoney((line.pricePerDaySnapshot ?? 0) * qDisp * dDisp) : 0;
          const maxRemPhysical = maxPhysicalRemainingForDraftLine(lines, index);
          const maxQtyCap =
            Number.isFinite(maxRemPhysical) && maxRemPhysical < Number.POSITIVE_INFINITY
              ? Math.max(parseQtyCommitInt(line.qty, 1), maxRemPhysical)
              : undefined;
          return (
            <div key={line.id} className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_112px_112px_132px_minmax(0,1.2fr)_auto]">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Позиция</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-950">{line.name}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {formatOrderMoney(line.pricePerDaySnapshot ?? 0)} ₽ / день
                  </div>
                </div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Кол-во
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
                  Дней
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
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-700">Сумма</div>
                  <div className="mt-1 text-sm font-bold text-fuchsia-950">{formatOrderMoney(lineTotal)} ₽</div>
                </div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Комментарий
                  <input
                    value={line.comment}
                    onChange={(e) => updateLine(index, { comment: e.target.value })}
                    className={`mt-1 w-full ${inputField}`}
                    disabled={readOnly}
                    placeholder="Опционально"
                  />
                </label>
                {!readOnly ? (
                  <div className="flex items-end justify-end">
                    <button
                      type="button"
                      onClick={() => removeDraftLine(index)}
                      className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      Удалить
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
        <div className="text-xs font-semibold uppercase tracking-wide text-fuchsia-700">Предварительный итог demo-блока</div>
        <div className="mt-2 text-lg font-extrabold text-fuchsia-950">{formatOrderMoney(total)} ₽</div>
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
                      Реальная заявка из demo
                    </div>
                    <p className="mt-1 text-sm text-zinc-600">
                      Укажи даты использования для каждой позиции. По умолчанию используются подтверждённые даты
                      мероприятия, если они есть. Система автоматически соберёт строки с одинаковым интервалом в одну
                      реальную заявку: 1 интервал = 1 заявка.
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
                    Закрыть
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
                              {parseQtyDisplayInt(line.qty)} шт. · {parseQtyDisplayInt(line.plannedDays)} дн. в demo
                            </div>
                          </div>
                          <label className="hidden">
                            Начало использования
                            <input
                              type="date"
                              value={assignment?.startDate ?? ""}
                              onChange={(e) => updateMaterializeAssignment(line.id, { startDate: e.target.value })}
                              className={`mt-1 w-full ${inputField}`}
                            />
                          </label>
                          <label className="hidden">
                            Конец использования
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
                  Будет создано {groupedMaterializePeriods.length} заявок по уникальным интервалам.
                  <div className="mt-2 space-y-1 text-xs text-zinc-600">
                    {groupedMaterializePeriods.map((period) => (
                      <div key={period.key}>
                        {period.title}: {period.lineIds.length} поз.
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
                    Отмена
                  </button>
                  <button type="button" className={btnPrimary} disabled={matBusy} onClick={() => void materializeDraft()}>
                    {matBusy ? "Создаю заявку…" : "Создать заявку"}
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
          placeholder="Найти позицию в каталоге"
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
        {open ? (
          <>
            <div className="fixed inset-0 z-10" aria-hidden onClick={() => setOpen(false)} />
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-2xl border border-zinc-200 bg-white p-1 shadow-lg">
              {filtered.length === 0 ? (
                <div className="px-3 py-3 text-sm text-zinc-500">Нет доступных позиций</div>
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
                      {item.availableNow != null ? <>Годных: {item.availableNow}</> : null}
                      {item.availableForDates != null ? (
                        <> · на даты: {item.availableForDates}</>
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
            Кол-во
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
            Описание
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`mt-1 w-full ${inputField}`}
              placeholder="Описание для новой строки"
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
            Добавить
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
            Коммент.
            <input
              value={comment}
              onChange={(e) => onCommentChange(e.target.value)}
              className={`mt-0.5 w-full ${cellXs}`}
              disabled={!editable}
              placeholder="Комментарий"
            />
          </label>
          {showClientPrice ? (
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Клиент ₽
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
            Внутр. ₽
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
            Оплата
            <select
              value={internalPaymentMethod}
              onChange={(e) => onInternalPaymentMethodChange(e.target.value as OrderServicePaymentMethod)}
              className={`mt-0.5 w-full ${cellXs}`}
              disabled={!editable}
            >
              <option value="NON_CASH">Безнал</option>
              <option value="CASH">Наличка</option>
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}
