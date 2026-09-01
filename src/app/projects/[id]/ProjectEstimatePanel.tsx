"use client";

import Link from "next/link";
import Image from "next/image";
import React from "react";
import { createPortal } from "react-dom";

import { CatalogRentalPeriodPicker } from "@/app/catalog/CatalogRentalPeriodPicker";
import { usableStockUnits } from "@/lib/inventory-stock";
import {
  type OrderServicePaymentMethod,
} from "@/lib/order-service-internal-costs";
import {
  getProjectEstimateLineInternalTotal,
  summarizeProjectEstimateSections,
} from "@/lib/project-estimate-line-totals";
import { billableRentalDaysFromDateOnly, type RentalPartOfDay } from "@/lib/rental-days";
import {
  normalizedLocalLineCostClientNumber,
  normalizedLocalLineCostClientString,
  parseEstimateQtyUp,
} from "@/lib/project-estimate-local-line";
import {
  buildProjectEstimateTablePasteOperations,
  type ProjectEstimateTableColumn,
} from "@/lib/project-estimate-table";
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
import { calcOrderPricing } from "@/lib/order-pricing";
import {
  evaluateProjectEstimateCustomColumns,
  PROJECT_ESTIMATE_CUSTOM_COLUMN_LIMIT,
  PROJECT_ESTIMATE_FORMULA_FIELDS,
  type ProjectEstimateCustomColumn,
  type ProjectEstimateCustomColumnType,
  validateProjectEstimateFormula,
} from "@/lib/projects/project-estimate-custom-columns";

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
  customValues?: Record<string, string>;
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
  payMultiplierSnapshot?: number | null;
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
  clientPaymentMethod?: OrderServicePaymentMethod;
  rentalDiscountType?: "NONE" | "PERCENT" | "AMOUNT";
  rentalDiscountPercent?: number | null;
  rentalDiscountAmount?: number | null;
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
  customValues: Record<string, string>;
  orderLineId: null;
  itemId: string | null;
};

type EstimateCatalogItem = {
  id: string;
  name: string;
  description: string | null;
  photo1Key: string | null;
  total: number;
  inRepair: number;
  broken: number;
  missing: number;
  pricePerDay: number;
  availability?: {
    availableNow?: number;
  };
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
  customColumns?: ProjectEstimateCustomColumn[];
  commissionEnabled?: boolean;
  clientTaxEnabled?: boolean;
  clientChargeTaxEnabled?: boolean;
};

type EstimateSaveMode = "AUTO" | "MANUAL";
type EstimateSaveStatus = "IDLE" | "SAVING" | "SAVED" | "ERROR" | "PAUSED";
type EstimateTitleDialogMode = "CREATE" | "DUPLICATE" | "RENAME";

type EstimateTitleDialogState = {
  mode: EstimateTitleDialogMode;
  title: string;
};

type SavedEstimateSnapshot = {
  sections: LocalDraftSection[];
  customColumns: ProjectEstimateCustomColumn[];
  commissionEnabled: boolean;
  clientTaxEnabled: boolean;
  clientChargeTaxEnabled: boolean;
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
    revision?: number;
    title: string;
    note: string | null;
    sortOrder: number;
    includeInProjectTotals: boolean;
    createdAt: string;
    commissionEnabled: boolean;
    clientTaxEnabled: boolean;
    clientChargeTaxEnabled: boolean;
    customColumns: ProjectEstimateCustomColumn[];
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

const ESTIMATE_DRAFT_SCHEMA_VERSION = 7;

function makeTempId(prefix: string) {
  return `draft-${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeEstimateCustomColumn(sortOrder: number): ProjectEstimateCustomColumn {
  const token = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return {
    id: `custom-${token}`,
    key: `c_${token.slice(0, 16).toLowerCase()}`,
    label: "Новая колонка",
    type: "TEXT",
    formula: null,
    sortOrder,
    width: 160,
  };
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
      title: null,
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
      title: null,
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
  return getProjectEstimateLineInternalTotal(line);
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
      kind: section.kind,
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
        customValues: { ...(line.customValues ?? {}) },
        orderLineId: null,
        itemId: line.itemId,
      })),
    }));
}

function sortSectionsBySortOrder<T extends { sortOrder: number }>(sections: T[]): T[] {
  return [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
}

function nextSectionSortOrderAtBottom(
  localSections: LocalDraftSection[],
  persistedSections: EstSection[] | null | undefined,
): number {
  const allSortOrders = [
    ...localSections.map((section) => section.sortOrder),
    ...(persistedSections ?? []).map((section) => section.sortOrder),
  ];
  return (allSortOrders.length > 0 ? Math.max(...allSortOrders) : 0) + 10;
}

function cloneLocalDraftSections(sections: LocalDraftSection[]): LocalDraftSection[] {
  return sections.map((section) => ({
    ...section,
    lines: section.lines.map((line) => ({
      ...line,
      internalExpenses: line.internalExpenses.map((expense) => ({ ...expense })),
      customValues: { ...line.customValues },
    })),
  }));
}

function cloneEstimateCustomColumns(columns: ProjectEstimateCustomColumn[]): ProjectEstimateCustomColumn[] {
  return [...columns]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((column, index) => ({ ...column, sortOrder: index }));
}

function normalizeEstimateCustomColumnsForCompare(columns: ProjectEstimateCustomColumn[]) {
  return cloneEstimateCustomColumns(columns).map((column) => ({
    id: column.id,
    key: column.key,
    label: column.label.trim(),
    type: column.type,
    formula: column.type === "FORMULA" ? column.formula?.trim() || null : null,
    width: column.width,
  }));
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
        itemId: line.itemId ?? null,
        internalExpenses: normalizeInternalExpensesForCompare(line.internalExpenses ?? []),
        customValues: Object.fromEntries(
          Object.entries(line.customValues ?? {})
            .filter(([, value]) => value !== "")
            .sort(([left], [right]) => left.localeCompare(right)),
        ),
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
  apiBase,
  standalone = false,
  workspaceMode = false,
  estimateGridEnabled = true,
  selectedVersionNumber: selectedVersionNumberProp,
  onSelectedVersionNumberChange,
  onResolvedVersionChange,
}: {
  projectId: string;
  readOnly: boolean;
  apiBase?: string;
  standalone?: boolean;
  workspaceMode?: boolean;
  estimateGridEnabled?: boolean;
  selectedVersionNumber?: number | null;
  onSelectedVersionNumberChange?: (value: number | null) => void;
  onResolvedVersionChange?: (value: { id: string; versionNumber: number } | null) => void;
}) {
  const estimateApiBase = apiBase ?? `/api/projects/${projectId}`;
  const [data, setData] = React.useState<EstimatePayload | null>(null);
  /** null = основная смета с сервера; число = явный выбор */
  const [uncontrolledSelectedVersion, setUncontrolledSelectedVersion] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [newSectionTitle, setNewSectionTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [standaloneCatalogOpen, setStandaloneCatalogOpen] = React.useState(false);
  const [selectedImportOrderIds, setSelectedImportOrderIds] = React.useState<string[]>([]);
  const [versionPickerOpen, setVersionPickerOpen] = React.useState(false);
  const [actionsOpen, setActionsOpen] = React.useState(false);
  const [downloadOpen, setDownloadOpen] = React.useState(false);
  const [titleDialog, setTitleDialog] = React.useState<EstimateTitleDialogState | null>(null);
  const [titleDialogError, setTitleDialogError] = React.useState<string | null>(null);
  const versionPickerWrapRef = React.useRef<HTMLDivElement>(null);
  const actionsWrapRef = React.useRef<HTMLDivElement>(null);
  const downloadWrapRef = React.useRef<HTMLDivElement>(null);
  const saveBarRef = React.useRef<HTMLDivElement | null>(null);
  const [localSectionsDraft, setLocalSectionsDraft] = React.useState<LocalDraftSection[]>([]);
  const [customColumns, setCustomColumns] = React.useState<ProjectEstimateCustomColumn[]>([]);
  const [customColumnsOpen, setCustomColumnsOpen] = React.useState(false);
  const [savedEstimateSnapshot, setSavedEstimateSnapshot] = React.useState<SavedEstimateSnapshot>({
    sections: [],
    customColumns: [],
    commissionEnabled: true,
    clientTaxEnabled: true,
    clientChargeTaxEnabled: false,
  });
  const [commissionEnabled, setCommissionEnabled] = React.useState(true);
  const [clientTaxEnabled, setClientTaxEnabled] = React.useState(true);
  const [clientChargeTaxEnabled, setClientChargeTaxEnabled] = React.useState(false);
  const [estimateDraftDirty, setEstimateDraftDirty] = React.useState(false);
  const [estimateSaving, setEstimateSaving] = React.useState(false);
  const [estimateSaveStatus, setEstimateSaveStatus] = React.useState<EstimateSaveStatus>("IDLE");
  const [estimateSaveMessage, setEstimateSaveMessage] = React.useState<string | null>(null);
  const [estimateConflictDetected, setEstimateConflictDetected] = React.useState(false);
  const [lastEstimateSavedAt, setLastEstimateSavedAt] = React.useState<Date | null>(null);
  const [showFloatingSave, setShowFloatingSave] = React.useState(false);
  const effectiveEstimateViewMode = estimateGridEnabled ? "TABLE" : "CARDS";
  const estimateDraftRevisionRef = React.useRef(0);
  const serverEstimateRevisionRef = React.useRef(0);
  const estimateDraftDirtyRef = React.useRef(false);
  const estimateConflictRef = React.useRef(false);
  const estimateBroadcastChannelRef = React.useRef<BroadcastChannel | null>(null);
  const restoredEstimateScrollKeyRef = React.useRef<string | null>(null);
  const estimateSaveInFlightRef = React.useRef(false);
  const autoSaveRef = React.useRef<() => void>(() => undefined);
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

  estimateDraftDirtyRef.current = estimateDraftDirty;
  estimateConflictRef.current = estimateConflictDetected;

  React.useEffect(() => {
    if (!titleDialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        setTitleDialog(null);
        setTitleDialogError(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [busy, titleDialog]);

  const load = React.useCallback(
    (v: number | null) => {
      setLoading(true);
      const q = v != null ? `?version=${v}` : "";
      fetch(`${estimateApiBase}/estimate${q}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: EstimatePayload & { error?: { message?: string } }) => {
          if (j.error?.message) {
            setError(j.error.message);
            setData(null);
          } else {
            setData(j);
            const versionNumber = j.current?.versionNumber ?? null;
            serverEstimateRevisionRef.current = j.current?.revision ?? 0;
            const baseSections = j.current?.sections ? sortSectionsBySortOrder(cloneLocalSections(j.current.sections)) : [];
            const baseCustomColumns = cloneEstimateCustomColumns(j.current?.customColumns ?? []);
            const baseCommissionEnabled = j.current?.commissionEnabled ?? true;
            const baseClientTaxEnabled = j.current?.clientTaxEnabled ?? true;
            const baseClientChargeTaxEnabled = j.current?.clientChargeTaxEnabled ?? false;
            setSavedEstimateSnapshot({
              sections: cloneLocalDraftSections(baseSections),
              customColumns: cloneEstimateCustomColumns(baseCustomColumns),
              commissionEnabled: baseCommissionEnabled,
              clientTaxEnabled: baseClientTaxEnabled,
              clientChargeTaxEnabled: baseClientChargeTaxEnabled,
            });
            estimateConflictRef.current = false;
            setEstimateConflictDetected(false);
            estimateDraftRevisionRef.current += 1;
            setEstimateSaveStatus("IDLE");
            setEstimateSaveMessage(null);
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
                    const storedCustomColumns = cloneEstimateCustomColumns(
                      parsed.customColumns ?? baseCustomColumns,
                    );
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
                    const columnsAreSameAsServer =
                      JSON.stringify(normalizeEstimateCustomColumnsForCompare(storedCustomColumns)) ===
                      JSON.stringify(normalizeEstimateCustomColumnsForCompare(baseCustomColumns));
                    if (hasDestructiveEmptyDraft || (isSameAsServer && columnsAreSameAsServer)) {
                      window.localStorage.removeItem(storageKey);
                      setLocalSectionsDraft(baseSections);
                      setCustomColumns(baseCustomColumns);
                      setCommissionEnabled(baseCommissionEnabled);
                      setClientTaxEnabled(baseClientTaxEnabled);
                      setClientChargeTaxEnabled(baseClientChargeTaxEnabled);
                      setEstimateDraftDirty(false);
                    } else {
                      setLocalSectionsDraft(storedSections);
                      setCustomColumns(storedCustomColumns);
                      setCommissionEnabled(storedCommissionEnabled);
                      setClientTaxEnabled(storedClientTaxEnabled);
                      setClientChargeTaxEnabled(storedClientChargeTaxEnabled);
                      setEstimateDraftDirty(!isSameAsServer || !columnsAreSameAsServer);
                    }
                  } else {
                    window.localStorage.removeItem(storageKey);
                    setLocalSectionsDraft(baseSections);
                    setCustomColumns(baseCustomColumns);
                    setCommissionEnabled(baseCommissionEnabled);
                    setClientTaxEnabled(baseClientTaxEnabled);
                    setClientChargeTaxEnabled(baseClientChargeTaxEnabled);
                    setEstimateDraftDirty(false);
                  }
                } catch {
                  window.localStorage.removeItem(storageKey);
                  setLocalSectionsDraft(baseSections);
                  setCustomColumns(baseCustomColumns);
                  setCommissionEnabled(baseCommissionEnabled);
                  setClientTaxEnabled(baseClientTaxEnabled);
                  setClientChargeTaxEnabled(baseClientChargeTaxEnabled);
                  setEstimateDraftDirty(false);
                }
              } else {
                setLocalSectionsDraft(baseSections);
                setCustomColumns(baseCustomColumns);
                setCommissionEnabled(baseCommissionEnabled);
                setClientTaxEnabled(baseClientTaxEnabled);
                setClientChargeTaxEnabled(baseClientChargeTaxEnabled);
                setEstimateDraftDirty(false);
              }
            } else {
              serverEstimateRevisionRef.current = 0;
              setLocalSectionsDraft([]);
              setCustomColumns([]);
              setSavedEstimateSnapshot({
                sections: [],
                customColumns: [],
                commissionEnabled: true,
                clientTaxEnabled: true,
                clientChargeTaxEnabled: false,
              });
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
    [estimateApiBase, projectId],
  );

  React.useEffect(() => {
    load(selectedVersion);
  }, [load, selectedVersion]);

  const currentVersionNumber = selectedVersion ?? data?.current?.versionNumber ?? null;

  React.useEffect(() => {
    if (
      standalone ||
      currentVersionNumber == null ||
      typeof BroadcastChannel === "undefined"
    ) {
      estimateBroadcastChannelRef.current = null;
      return;
    }
    const channel = new BroadcastChannel(
      `project-estimate:${projectId}:v${currentVersionNumber}`,
    );
    estimateBroadcastChannelRef.current = channel;
    channel.onmessage = (event: MessageEvent<{ revision?: unknown }>) => {
      const revision = Number(event.data?.revision);
      if (!Number.isInteger(revision) || revision <= serverEstimateRevisionRef.current) return;
      if (estimateDraftDirtyRef.current || estimateSaveInFlightRef.current) {
        estimateConflictRef.current = true;
        setEstimateConflictDetected(true);
        setEstimateSaveStatus("PAUSED");
        setEstimateSaveMessage(
          "Смета изменилась в другой вкладке. Выберите, какую версию оставить.",
        );
        return;
      }
      serverEstimateRevisionRef.current = revision;
      load(currentVersionNumber);
    };
    return () => {
      channel.close();
      if (estimateBroadcastChannelRef.current === channel) {
        estimateBroadcastChannelRef.current = null;
      }
    };
  }, [currentVersionNumber, load, projectId, standalone]);

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

  const estimateDraftStorageKey =
    currentVersionNumber != null ? draftEstimateStorageKey(projectId, currentVersionNumber) : null;
  const estimateScrollStorageKey =
    currentVersionNumber != null
      ? `project-estimate-scroll:${projectId}:v${currentVersionNumber}`
      : null;

  React.useEffect(() => {
    if (
      standalone ||
      loading ||
      effectiveEstimateViewMode !== "TABLE" ||
      !estimateScrollStorageKey ||
      restoredEstimateScrollKeyRef.current === estimateScrollStorageKey
    ) {
      return;
    }
    restoredEstimateScrollKeyRef.current = estimateScrollStorageKey;
    const stored = Number(window.sessionStorage.getItem(estimateScrollStorageKey));
    if (!Number.isFinite(stored) || stored <= 0) return;
    const frame = window.requestAnimationFrame(() => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo({ top: Math.min(stored, maxScroll), behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [effectiveEstimateViewMode, estimateScrollStorageKey, loading, standalone]);

  React.useEffect(() => {
    if (standalone || effectiveEstimateViewMode !== "TABLE" || !estimateScrollStorageKey) return;
    let frame: number | null = null;
    const persistScroll = () => {
      if (frame != null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        window.sessionStorage.setItem(estimateScrollStorageKey, String(Math.max(0, window.scrollY)));
      });
    };
    window.addEventListener("scroll", persistScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", persistScroll);
      if (frame != null) window.cancelAnimationFrame(frame);
      window.sessionStorage.setItem(estimateScrollStorageKey, String(Math.max(0, window.scrollY)));
    };
  }, [effectiveEstimateViewMode, estimateScrollStorageKey, standalone]);

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
      customColumns,
      commissionEnabled,
      clientTaxEnabled,
      clientChargeTaxEnabled,
    };
    window.localStorage.setItem(estimateDraftStorageKey, JSON.stringify(payload));
  }, [
    clientTaxEnabled,
    clientChargeTaxEnabled,
    commissionEnabled,
    customColumns,
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
    estimateDraftRevisionRef.current += 1;
    setEstimateDraftDirty(true);
    if (!estimateConflictRef.current) {
      setEstimateSaveStatus("IDLE");
      setEstimateSaveMessage(null);
    }
  }

  function mutateCustomColumns(
    mutator: (prev: ProjectEstimateCustomColumn[]) => ProjectEstimateCustomColumn[],
  ) {
    setCustomColumns((prev) => cloneEstimateCustomColumns(mutator(prev)));
    markEstimateDraftDirty();
  }

  function addCustomColumn() {
    if (customColumns.length >= PROJECT_ESTIMATE_CUSTOM_COLUMN_LIMIT) return;
    mutateCustomColumns((prev) => [...prev, makeEstimateCustomColumn(prev.length)]);
    setCustomColumnsOpen(true);
  }

  function patchCustomColumn(
    columnId: string,
    patch: Partial<Pick<ProjectEstimateCustomColumn, "label" | "type" | "formula" | "width">>,
  ) {
    mutateCustomColumns((prev) =>
      prev.map((column) => {
        if (column.id !== columnId) return column;
        const nextType = patch.type ?? column.type;
        return {
          ...column,
          ...patch,
          type: nextType,
          formula:
            nextType === "FORMULA"
              ? patch.formula ?? column.formula ?? "qty * unit_price"
              : null,
        };
      }),
    );
  }

  function moveCustomColumn(columnId: string, direction: -1 | 1) {
    mutateCustomColumns((prev) => {
      const ordered = cloneEstimateCustomColumns(prev);
      const index = ordered.findIndex((column) => column.id === columnId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= ordered.length) return ordered;
      const [column] = ordered.splice(index, 1);
      if (column) ordered.splice(target, 0, column);
      return ordered;
    });
  }

  function deleteCustomColumn(columnId: string) {
    const column = customColumns.find((candidate) => candidate.id === columnId);
    if (!column || !window.confirm(`Удалить колонку «${column.label}» и её значения?`)) return;
    setCustomColumns((prev) => cloneEstimateCustomColumns(prev.filter((item) => item.id !== columnId)));
    setLocalSectionsDraft((prev) =>
      prev.map((section) => ({
        ...section,
        lines: section.lines.map((line) => {
          const nextValues = { ...line.customValues };
          delete nextValues[columnId];
          return { ...line, customValues: nextValues };
        }),
      })),
    );
    markEstimateDraftDirty();
  }

  function markEstimateDraftDirty() {
    estimateDraftRevisionRef.current += 1;
    setEstimateDraftDirty(true);
    if (!estimateConflictRef.current) {
      setEstimateSaveStatus("IDLE");
      setEstimateSaveMessage(null);
    }
  }

  function openEstimateTitleDialog(mode: EstimateTitleDialogMode) {
    if (readOnly) return;
    const currentTitle = data?.current?.title?.trim() || "сметы";
    setTitleDialog({
      mode,
      title:
        mode === "DUPLICATE"
          ? `Копия ${currentTitle}`
          : mode === "RENAME"
            ? data?.current?.title ?? ""
            : "Новая смета",
    });
    setTitleDialogError(null);
  }

  async function createEstimate(duplicate: boolean, title: string) {
    if (readOnly) return;
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
        setTitleDialog(null);
        setTitleDialogError(null);
      } else {
        setTitleDialogError(j?.error?.message ?? "Не удалось создать смету");
      }
    } catch {
      setTitleDialogError("Не удалось связаться с сервером. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  async function patchCurrentEstimate(
    patch: { title?: string; includeInProjectTotals?: boolean },
    options?: { titleDialog?: boolean },
  ) {
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
        if (options?.titleDialog) {
          setTitleDialog(null);
          setTitleDialogError(null);
        }
      } else {
        if (options?.titleDialog) {
          setTitleDialogError(j?.error?.message ?? "Не удалось переименовать смету");
        } else {
          window.alert(j?.error?.message ?? "Ошибка");
        }
      }
    } catch {
      if (options?.titleDialog) {
        setTitleDialogError("Не удалось связаться с сервером. Попробуйте ещё раз.");
      } else {
        window.alert("Не удалось связаться с сервером. Попробуйте ещё раз.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitEstimateTitleDialog() {
    if (!titleDialog || busy) return;
    const title = titleDialog.title.trim();
    if (!title) {
      setTitleDialogError("Введите название сметы");
      return;
    }
    setTitleDialogError(null);
    if (titleDialog.mode === "RENAME") {
      await patchCurrentEstimate({ title }, { titleDialog: true });
      return;
    }
    await createEstimate(titleDialog.mode === "DUPLICATE", title);
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
      ...prev,
      {
        id: makeTempId("section"),
        sortOrder: nextSectionSortOrderAtBottom(prev, data?.current?.sections),
        title: newSectionTitle.trim(),
        kind: "CONTRACTOR",
        linkedOrderId: null,
        lines: [],
      },
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
      const res = await fetch(`${estimateApiBase}/estimate/sections/${id}`, { method: "DELETE" });
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
              lines: section.lines.map((line) =>
                line.id === lineId ? patchLocalDraftLine(line, patch) : line,
              ),
            }
          : section,
      ),
    );
  }

  function pasteLocalTable(
    sectionId: string,
    startLineId: string,
    startColumn: ProjectEstimateTableColumn,
    text: string,
  ) {
    const operations = buildProjectEstimateTablePasteOperations({ text, startColumn });
    if (operations.length === 0) return;
    mutateLocalSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;
        const startIndex = Math.max(0, section.lines.findIndex((line) => line.id === startLineId));
        const lines = [...section.lines];
        const neededLength = startIndex + operations.length;
        while (lines.length < neededLength) lines.push(createEmptyLocalDraftLine(lines.length));
        operations.forEach((operation) => {
          const index = startIndex + operation.rowOffset;
          const current = lines[index];
          if (!current) return;
          lines[index] = patchLocalDraftLine(current, operation.patch);
        });
        return {
          ...section,
          lines: lines.map((line, index) => ({ ...line, position: index, lineNumber: index + 1 })),
        };
      }),
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
      itemId?: string | null;
      lineType?: string;
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
              lineType: payload.lineType ?? "OTHER",
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
              customValues: {},
              orderLineId: null,
              itemId: payload.itemId ?? null,
            },
          ],
        };
      }),
    );
  }

  function attachStandaloneCatalogItem(args: {
    item: EstimateCatalogItem;
    qty: number;
    days: number;
    note: string;
  }) {
    const pricePerDay = roundMoney(args.item.pricePerDay);
    const unitPriceForPeriod = roundMoney(pricePerDay * args.days);
    const periodText = `${args.days} ${args.days === 1 ? "день" : args.days < 5 ? "дня" : "дней"} × ${formatMoneyRub(pricePerDay)} ₽/сутки`;
    const description = [args.note.trim(), periodText].filter(Boolean).join(" · ");

    mutateLocalSections((prev) => {
      const existingSection = prev.find(
        (section) => section.title.trim().toLocaleLowerCase("ru-RU") === "реквизит из каталога",
      );
      const sectionId = existingSection?.id ?? makeTempId("section");
      const target: LocalDraftSection =
        existingSection ?? {
          id: sectionId,
          sortOrder: nextSectionSortOrderAtBottom(prev, data?.current?.sections),
          title: "Реквизит из каталога",
          kind: "CONTRACTOR",
          linkedOrderId: null,
          lines: [],
        };
      const lineIndex = target.lines.length;
      const line: LocalDraftLine = {
        id: makeTempId("line"),
        position: lineIndex,
        lineNumber: lineIndex + 1,
        name: args.item.name,
        description,
        lineType: "RENTAL",
        costClient: String(roundMoney(args.qty * unitPriceForPeriod)),
        costInternal: null,
        unit: "шт",
        qty: String(args.qty),
        unitPriceClient: String(unitPriceForPeriod),
        paymentMethod: null,
        paymentStatus: null,
        contractorNote: null,
        contractorRequisites: null,
        customValues: {},
        internalExpenses: [],
        orderLineId: null,
        itemId: args.item.id,
      };

      if (existingSection) {
        return prev.map((section) =>
          section.id === existingSection.id
            ? { ...section, lines: [...section.lines, line] }
            : section,
        );
      }
      return [...prev, { ...target, lines: [line] }];
    });
  }

  async function moveSection(sectionId: string, direction: -1 | 1) {
    if (readOnly || busy) return;
    const ordered = sortSectionsBySortOrder(renderedSections);
    const currentIndex = ordered.findIndex((section) => section.id === sectionId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;

    const currentSection = ordered[currentIndex];
    const targetSection = ordered[targetIndex];
    const currentOrder = currentSection.sortOrder;
    const targetOrder = targetSection.sortOrder;
    const changedOrders = new Map<string, number>();

    if (currentOrder !== targetOrder && currentOrder >= 0 && targetOrder >= 0) {
      changedOrders.set(currentSection.id, targetOrder);
      changedOrders.set(targetSection.id, currentOrder);
    } else {
      const swapped = [...ordered];
      [swapped[currentIndex], swapped[targetIndex]] = [swapped[targetIndex], swapped[currentIndex]];
      swapped.forEach((section, index) => changedOrders.set(section.id, (index + 1) * 10));
    }

    const persistedChanges = ordered
      .filter((section) => changedOrders.has(section.id) && !section.id.startsWith("draft-"))
      .map((section) => ({ id: section.id, sortOrder: changedOrders.get(section.id)! }));

    setBusy(true);
    try {
      const responses = await Promise.all(
        persistedChanges.map(({ id, sortOrder }) =>
          fetch(`${estimateApiBase}/estimate/sections/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder }),
          }),
        ),
      );
      const failedResponse = responses.find((response) => !response.ok);
      if (failedResponse) {
        const payload = await failedResponse.json().catch(() => null);
        window.alert(payload?.error?.message ?? "Не удалось изменить порядок разделов");
        return;
      }

      setData((prev) => {
        if (!prev?.current) return prev;
        return {
          ...prev,
          current: {
            ...prev.current,
            sections: prev.current.sections.map((section) => {
              const sortOrder = changedOrders.get(section.id);
              return sortOrder == null ? section : { ...section, sortOrder };
            }),
          },
        };
      });

      const localChanged = localSectionsDraft.some((section) => changedOrders.has(section.id));
      if (localChanged) {
        mutateLocalSections((prev) =>
          sortSectionsBySortOrder(
            prev.map((section) => {
              const sortOrder = changedOrders.get(section.id);
              return sortOrder == null ? section : { ...section, sortOrder };
            }),
          ),
        );
      }
      refreshActivity();
    } catch {
      window.alert("Не удалось изменить порядок разделов");
    } finally {
      setBusy(false);
    }
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

  function deleteLines(sectionId: string, lineIds: string[]) {
    const selectedIds = new Set(lineIds);
    if (selectedIds.size === 0) return;
    mutateLocalSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              lines: section.lines
                .filter((line) => !selectedIds.has(line.id))
                .map((line, index) => ({ ...line, position: index, lineNumber: index + 1 })),
            }
          : section,
      ),
    );
  }

  function duplicateLines(sectionId: string, lineIds: string[]) {
    const selectedIds = new Set(lineIds);
    if (selectedIds.size === 0) return;
    mutateLocalSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;
        const duplicated = section.lines
          .filter((line) => selectedIds.has(line.id))
          .map((line) => ({
            ...line,
            id: makeTempId("line"),
            customValues: { ...line.customValues },
            internalExpenses: line.internalExpenses.map((expense, index) => ({
              ...expense,
              id: makeTempId("expense"),
              sortOrder: index,
            })),
          }));
        return {
          ...section,
          lines: [...section.lines, ...duplicated].map((line, index) => ({
            ...line,
            position: index,
            lineNumber: index + 1,
          })),
        };
      }),
    );
  }

  function insertEmptyLine(
    sectionId: string,
    anchorLineId: string,
    direction: "ABOVE" | "BELOW",
  ): string {
    const newLineId = makeTempId("line");
    mutateLocalSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;
        const anchorIndex = section.lines.findIndex((line) => line.id === anchorLineId);
        const insertionIndex =
          anchorIndex < 0
            ? section.lines.length
            : direction === "ABOVE"
              ? anchorIndex
              : anchorIndex + 1;
        const nextLines = [...section.lines];
        nextLines.splice(insertionIndex, 0, {
          ...createEmptyLocalDraftLine(insertionIndex),
          id: newLineId,
        });
        return {
          ...section,
          lines: nextLines.map((line, index) => ({ ...line, position: index, lineNumber: index + 1 })),
        };
      }),
    );
    return newLineId;
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

  async function saveEstimateDraft(mode: EstimateSaveMode = "MANUAL") {
    if (readOnly || currentVersionNumber == null || estimateSaveInFlightRef.current) return;

    const snapshotRevision = estimateDraftRevisionRef.current;
    const snapshotSections = sortSectionsBySortOrder(cloneLocalDraftSections(localSectionsDraft));
    const snapshotCustomColumns = cloneEstimateCustomColumns(customColumns);
    const snapshotCommissionEnabled = commissionEnabled;
    const snapshotClientTaxEnabled = clientTaxEnabled;
    const snapshotClientChargeTaxEnabled = clientChargeTaxEnabled;
    const hasIncompleteLine = snapshotSections.some((section) =>
      section.lines.some((line) => !line.name.trim()),
    );
    if (hasIncompleteLine) {
      setEstimateSaveStatus("PAUSED");
      setEstimateSaveMessage("Автосохранение продолжится после заполнения названия новой строки.");
      return;
    }

    const deletingAllLocalSections =
      snapshotSections.length === 0 && savedEstimateSnapshot.sections.length > 0;
    if (deletingAllLocalSections && mode === "AUTO") {
      setEstimateSaveStatus("PAUSED");
      setEstimateSaveMessage("Удаление всех разделов требует ручного подтверждения.");
      return;
    }
    if (deletingAllLocalSections && !window.confirm("Удалить все локальные разделы из этой сметы?")) {
      return;
    }

    estimateSaveInFlightRef.current = true;
    setEstimateSaving(true);
    setEstimateSaveStatus("SAVING");
    setEstimateSaveMessage(mode === "AUTO" ? "Сохраняю изменения…" : "Сохраняю смету…");
    try {
      const res = await fetch(`${estimateApiBase}/estimate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionNumber: currentVersionNumber,
          ...(!standalone
            ? {
                saveMode: mode,
                expectedRevision: serverEstimateRevisionRef.current,
                customColumns: snapshotCustomColumns,
              }
            : {}),
          allowDeleteAllLocalSections: deletingAllLocalSections,
          commissionEnabled: snapshotCommissionEnabled,
          clientTaxEnabled: snapshotClientTaxEnabled,
          clientChargeTaxEnabled: snapshotClientChargeTaxEnabled,
          localSections: snapshotSections.map((section) => ({
            id: section.id.startsWith("draft-") ? undefined : section.id,
            title: section.title.trim(),
            sortOrder: section.sortOrder,
            kind: section.kind,
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
              itemId: line.itemId,
              internalExpenses: line.internalExpenses
                .filter(
                  (expense) =>
                    (expense.cost != null && String(expense.cost).trim() !== "") ||
                    (expense.contractorNote?.trim() ?? "") ||
                    (expense.contractorRequisites?.trim() ?? "") ||
                    (expense.paymentMethod?.trim() ?? "") ||
                    (expense.paymentStatus?.trim() ?? ""),
                )
                .map((expense, expenseIndex) => ({
                  id: expense.id.startsWith("draft-") ? undefined : expense.id,
                  sortOrder: expenseIndex,
                  title: null,
                  cost:
                    expense.cost == null || String(expense.cost).trim() === ""
                      ? null
                      : Number(String(expense.cost).replace(",", ".")),
                  paymentMethod: expense.paymentMethod?.trim() || null,
                  paymentStatus: expense.paymentStatus?.trim() || null,
                  contractorNote: expense.contractorNote?.trim() || null,
                  contractorRequisites: expense.contractorRequisites?.trim() || null,
                })),
              ...(!standalone ? { customValues: line.customValues } : {}),
            })),
          })),
        }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        if (standalone) {
          setEstimateDraftDirty(false);
          setEstimateSaveStatus("SAVED");
          setEstimateSaveMessage("Изменения сохранены.");
          if (estimateDraftStorageKey) window.localStorage.removeItem(estimateDraftStorageKey);
          load(selectedVersion);
          refreshActivity();
          return;
        }
        if (typeof j?.revision === "number") {
          serverEstimateRevisionRef.current = j.revision;
          estimateBroadcastChannelRef.current?.postMessage({ revision: j.revision });
        }
        estimateConflictRef.current = false;
        setEstimateConflictDetected(false);
        setSavedEstimateSnapshot({
          sections: cloneLocalDraftSections(snapshotSections),
          customColumns: cloneEstimateCustomColumns(snapshotCustomColumns),
          commissionEnabled: snapshotCommissionEnabled,
          clientTaxEnabled: snapshotClientTaxEnabled,
          clientChargeTaxEnabled: snapshotClientChargeTaxEnabled,
        });
        setLastEstimateSavedAt(new Date());
        if (estimateDraftRevisionRef.current === snapshotRevision) {
          setEstimateDraftDirty(false);
          setEstimateSaveStatus("SAVED");
          setEstimateSaveMessage("Все изменения сохранены.");
          if (estimateDraftStorageKey) window.localStorage.removeItem(estimateDraftStorageKey);
        } else {
          setEstimateSaveStatus("IDLE");
          setEstimateSaveMessage("Есть новые изменения — сохраню их следом.");
        }
      } else {
        if (res.status === 409) {
          estimateConflictRef.current = true;
          setEstimateConflictDetected(true);
          setEstimateSaveStatus("PAUSED");
          setEstimateSaveMessage(
            j?.error?.message ??
              "Смета изменилась в другой вкладке. Выберите, какую версию оставить.",
          );
        } else {
          setEstimateSaveStatus("ERROR");
          setEstimateSaveMessage(j?.error?.message ?? "Не удалось сохранить смету. Черновик остался в браузере.");
        }
      }
    } catch {
      setEstimateSaveStatus("ERROR");
      setEstimateSaveMessage("Нет связи с сервером. Черновик сохранён в браузере — повторю после следующего изменения.");
    } finally {
      estimateSaveInFlightRef.current = false;
      setEstimateSaving(false);
    }
  }

  autoSaveRef.current = () => {
    void saveEstimateDraft("AUTO");
  };

  React.useEffect(() => {
    if (
      standalone ||
      readOnly ||
      !data?.current ||
      !estimateDraftDirty ||
      estimateSaving ||
      busy ||
      estimateSaveStatus === "ERROR" ||
      estimateSaveStatus === "PAUSED"
    ) {
      return;
    }
    const timer = window.setTimeout(() => autoSaveRef.current(), 1400);
    return () => window.clearTimeout(timer);
  }, [busy, data, estimateDraftDirty, estimateSaveStatus, estimateSaving, localSectionsDraft, customColumns, commissionEnabled, clientTaxEnabled, clientChargeTaxEnabled, readOnly, standalone]);

  function discardEstimateDraft() {
    if (!window.confirm("Сбросить несохранённые изменения сметы?")) return;
    if (estimateDraftStorageKey) window.localStorage.removeItem(estimateDraftStorageKey);
    estimateDraftRevisionRef.current += 1;
    setLocalSectionsDraft(cloneLocalDraftSections(savedEstimateSnapshot.sections));
    setCustomColumns(cloneEstimateCustomColumns(savedEstimateSnapshot.customColumns));
    setCommissionEnabled(savedEstimateSnapshot.commissionEnabled);
    setClientTaxEnabled(savedEstimateSnapshot.clientTaxEnabled);
    setClientChargeTaxEnabled(savedEstimateSnapshot.clientChargeTaxEnabled);
    setEstimateDraftDirty(false);
    estimateConflictRef.current = false;
    setEstimateConflictDetected(false);
    setEstimateSaveStatus("IDLE");
    setEstimateSaveMessage(null);
  }

  function keepLocalDraftAfterConflict() {
    if (!window.confirm("Повторить сохранение вашего черновика поверх свежей серверной версии?")) return;
    estimateConflictRef.current = false;
    setEstimateConflictDetected(false);
    setEstimateSaveStatus("IDLE");
    setEstimateSaveMessage("Обновляю основу и повторю сохранение черновика…");
    load(currentVersionNumber);
  }

  function acceptServerEstimateAfterConflict() {
    if (!window.confirm("Отказаться от локального черновика и загрузить серверную версию?")) return;
    if (estimateDraftStorageKey) window.localStorage.removeItem(estimateDraftStorageKey);
    estimateConflictRef.current = false;
    setEstimateConflictDetected(false);
    setEstimateDraftDirty(false);
    setEstimateSaveStatus("IDLE");
    setEstimateSaveMessage(null);
    load(currentVersionNumber);
  }

  const vn = currentVersionNumber;
  const currentVersionMeta = data?.versions.find((v) => v.versionNumber === vn) ?? null;
  const exportBase =
    vn != null
      ? `${estimateApiBase}/estimate/pdf?version=${encodeURIComponent(String(vn))}`
      : `${estimateApiBase}/estimate/pdf`;
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
    return sortSectionsBySortOrder([...requisites, ...localSectionsDraft]);
  }, [data?.current, localSectionsDraft]);

  const dirtyLocalLineIds = React.useMemo(() => {
    const dirtyIds = new Set<string>();
    if (!data?.current || !estimateDraftDirty) return dirtyIds;
    const baseline = savedEstimateSnapshot.sections;
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
  }, [data?.current, estimateDraftDirty, localSectionsDraft, savedEstimateSnapshot.sections]);

  const totals = React.useMemo(() => {
    const lineSummary = summarizeProjectEstimateSections(renderedSections);
    const estimateTotals = calcProjectEstimateTotals({
      clientSubtotal: lineSummary.clientSubtotal,
      internalSubtotal: lineSummary.internalSubtotal,
      cashInternalCostTax: lineSummary.cashInternalCostTax,
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
      cashInternalSubtotal: lineSummary.cashInternalSubtotal,
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

  const workspaceSaveState = estimateConflictDetected
    ? "conflict"
    : estimateSaveStatus === "ERROR"
      ? "error"
      : estimateSaveStatus === "PAUSED"
        ? "paused"
        : estimateSaving
          ? "saving"
          : estimateDraftDirty
            ? "dirty"
            : "saved";
  const workspaceSaveLabel = estimateConflictDetected
    ? "Конфликт версий"
    : estimateSaveStatus === "ERROR"
      ? "Не сохранено"
      : estimateSaveStatus === "PAUSED"
        ? "Сохранение на паузе"
        : estimateSaving
          ? "Сохраняю…"
          : estimateDraftDirty
            ? "Есть изменения"
            : "Сохранено автоматически";

  return (
    <div className={`project-estimate space-y-3 bg-white ${workspaceMode ? "project-estimate--workspace" : ""}`}>
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
              onClick={() => openEstimateTitleDialog("CREATE")}
              className={btnPrimary}
            >
              Создать первую смету
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="project-estimate__toolbar border-b border-zinc-300 bg-white pb-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                {standalone ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-violet-700">Независимый расчёт</span>
                      <EstimateHelpLegend title="Как работать со сметами">
                        Составьте расчёт и выгрузите клиентскую или внутреннюю версию. После согласования его можно превратить в полноценный проект.
                      </EstimateHelpLegend>
                    </div>
                    <div className="mt-1 text-xl font-black tracking-tight text-zinc-950">Смета</div>
                  </>
                ) : null}
                <div className={`${standalone ? "mt-2" : ""} flex flex-wrap items-center gap-2`}>
                <div className="relative" ref={versionPickerWrapRef}>
                  <button
                    type="button"
                    className="project-estimate__version inline-flex min-h-10 min-w-[15rem] items-center justify-between gap-3 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-left transition-colors hover:border-zinc-950"
                    onClick={() => {
                      setVersionPickerOpen((v) => !v);
                      setActionsOpen(false);
                      setDownloadOpen(false);
                    }}
                  >
                    <span>
                      {!workspaceMode ? <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">Открыта сейчас</span> : null}
                      <span className="block text-sm font-extrabold leading-tight text-zinc-950">
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

                {currentVersionMeta && !standalone && !workspaceMode ? (
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

              <div className="project-estimate__actions flex flex-wrap items-start gap-2 lg:justify-end">
                {workspaceMode ? (
                  <>
                    <div className="project-estimate__quick-totals" aria-label="Финансы выбранной сметы">
                      <span><small>Клиент</small><strong>{money(totals.revenueTotal)} ₽</strong></span>
                      <span><small>Расходы</small><strong>{money(totals.totalExpensesWithTax)} ₽</strong></span>
                      <span className={totals.marginAfterTax < 0 ? "is-negative" : "is-positive"}><small>Маржа</small><strong>{money(totals.marginAfterTax)} ₽</strong></span>
                    </div>
                    {!readOnly ? (
                      <div
                        className="project-estimate__save-control"
                        data-state={workspaceSaveState}
                        aria-live="polite"
                        title={estimateSaveMessage ?? "Изменения сохраняются автоматически"}
                      >
                        <span>{workspaceSaveLabel}</span>
                        {estimateConflictDetected ? (
                          <div className="project-estimate__save-conflict-actions">
                            <button type="button" disabled={busy || estimateSaving} onClick={acceptServerEstimateAfterConflict}>Серверная</button>
                            <button type="button" disabled={busy || estimateSaving} onClick={keepLocalDraftAfterConflict}>Моя</button>
                          </div>
                        ) : estimateDraftDirty || estimateSaveStatus === "ERROR" || estimateSaveStatus === "PAUSED" ? (
                          <button
                            type="button"
                            disabled={busy || estimateSaving}
                            onClick={() => void saveEstimateDraft("MANUAL")}
                          >
                            {estimateSaveStatus === "ERROR" ? "Повторить" : "Сохранить"}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {!readOnly ? (
                      <div className="project-estimate__column-actions">
                        <button type="button" onClick={() => setCustomColumnsOpen((value) => !value)} aria-expanded={customColumnsOpen}>Колонки</button>
                        <button type="button" disabled={busy || estimateSaving || customColumns.length >= PROJECT_ESTIMATE_CUSTOM_COLUMN_LIMIT} onClick={() => { setCustomColumnsOpen(true); addCustomColumn(); }} aria-label="Добавить колонку">+</button>
                      </div>
                    ) : null}
                  </>
                ) : null}
                {vn != null ? (
                  <div className="relative" ref={downloadWrapRef}>
                    <button
                      type="button"
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-bold text-zinc-800 transition-colors hover:border-zinc-950"
                      aria-label="Скачать смету"
                      onClick={() => {
                        setDownloadOpen((v) => !v);
                        setActionsOpen(false);
                        setVersionPickerOpen(false);
                      }}
                    >
                      <DownloadIcon />
                      <span className={workspaceMode ? "sr-only" : ""}>Скачать</span>
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
                {!readOnly && !standalone ? (
              <div className="relative flex items-start justify-start lg:justify-end" ref={actionsWrapRef}>
                <button
                  type="button"
                  disabled={busy}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-zinc-950 bg-zinc-950 px-3 text-sm font-bold text-white transition-colors hover:border-yellow-400 hover:bg-yellow-400 hover:text-zinc-950 disabled:opacity-50"
                  aria-label="Действия со сметой"
                  onClick={() => {
                    setActionsOpen((v) => !v);
                    setVersionPickerOpen(false);
                    setDownloadOpen(false);
                  }}
                >
                  <MoreIcon />
                   <span className={workspaceMode ? "sr-only" : ""}>Действия</span>
                </button>
                {actionsOpen ? (
                  <div className={menuPanel}>
                    <button
                      type="button"
                      disabled={busy}
                      className={menuAction}
                      onClick={() => {
                        setActionsOpen(false);
                        openEstimateTitleDialog("CREATE");
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
                        openEstimateTitleDialog("DUPLICATE");
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
                        openEstimateTitleDialog("RENAME");
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
              {!readOnly && !standalone && importOpen ? (
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

              {!workspaceMode ? <div className="project-estimate__section-tools flex flex-wrap items-end justify-between gap-3 border-b border-zinc-200 pb-2">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-black text-zinc-950">{workspaceMode ? `${renderedSections.length} ${renderedSections.length === 1 ? "раздел" : "раздела"}` : "Разделы сметы"}</div>
                  <EstimateHelpLegend title="Порядок разделов">
                    Открывай только нужные разделы. Стрелки справа меняют порядок; новый раздел добавляется в конец сметы.
                  </EstimateHelpLegend>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {estimateGridEnabled && !workspaceMode ? (
                    <span className="inline-flex min-h-8 items-center rounded-full bg-violet-50 px-3 text-xs font-bold text-violet-800">
                      Табличная смета
                    </span>
                  ) : null}
                  {!standalone && !readOnly ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className={btnSecondaryXs}
                        onClick={() => setCustomColumnsOpen((value) => !value)}
                        aria-expanded={customColumnsOpen}
                      >
                        {customColumnsOpen ? "Скрыть колонки" : "Настроить колонки"}{customColumns.length > 0 ? ` · ${customColumns.length}` : ""}
                      </button>
                      <button
                        type="button"
                        disabled={busy || estimateSaving || customColumns.length >= PROJECT_ESTIMATE_CUSTOM_COLUMN_LIMIT}
                        className="inline-flex min-h-8 items-center rounded-md bg-zinc-950 px-2.5 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-40"
                        onClick={() => {
                          setCustomColumnsOpen(true);
                          addCustomColumn();
                        }}
                      >
                        + Колонка
                      </button>
                    </div>
                  ) : null}
                  {standalone && !readOnly ? (
                    <button
                      type="button"
                      className={standaloneCatalogOpen ? btnPrimary : btnSecondary}
                      onClick={() => setStandaloneCatalogOpen((value) => !value)}
                      aria-expanded={standaloneCatalogOpen}
                    >
                      {standaloneCatalogOpen ? "Закрыть каталог" : "+ Реквизит из каталога"}
                    </button>
                  ) : null}
                  {!workspaceMode ? <div className="text-xs font-semibold tabular-nums text-zinc-500">
                    {renderedSections.length}{" "}
                    {renderedSections.length % 10 === 1 && renderedSections.length % 100 !== 11
                      ? "раздел"
                      : [2, 3, 4].includes(renderedSections.length % 10) &&
                          ![12, 13, 14].includes(renderedSections.length % 100)
                        ? "раздела"
                        : "разделов"}
                  </div> : null}
                </div>
              </div> : null}

              {!standalone && !readOnly && customColumnsOpen ? (
                <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-4 sm:px-4">
                  <CustomColumnManager
                    columns={customColumns}
                    busy={busy || estimateSaving}
                    onAdd={addCustomColumn}
                    onPatch={patchCustomColumn}
                    onMove={moveCustomColumn}
                    onDelete={deleteCustomColumn}
                  />
                </div>
              ) : null}

              {standalone && standaloneCatalogOpen && !readOnly ? (
                <StandaloneEstimateCatalog
                  onAttach={attachStandaloneCatalogItem}
                  onClose={() => setStandaloneCatalogOpen(false)}
                />
              ) : null}

              <div className="project-estimate__sections space-y-3">
                {renderedSections.map((sec, sectionIndex) =>
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
                      canMoveUp={sectionIndex > 0}
                      canMoveDown={sectionIndex < renderedSections.length - 1}
                      onMove={(direction) => void moveSection(sec.id, direction)}
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
                      canMoveUp={sectionIndex > 0}
                      canMoveDown={sectionIndex < renderedSections.length - 1}
                      onMove={(direction) => void moveSection(sec.id, direction)}
                      defaultOpen={sectionIndex === 0}
                      workspaceMode={workspaceMode}
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
                        effectiveEstimateViewMode === "TABLE" && (sec.kind === "LOCAL" || sec.kind === "CONTRACTOR") ? (
                          <CompactEstimateTable
                            sectionId={sec.id}
                            lines={sec.lines as LocalDraftLine[]}
                            customColumns={standalone ? [] : customColumns}
                            dirtyLineIds={dirtyLocalLineIds}
                            readOnly={readOnly}
                            busy={busy}
                            onSave={saveLine}
                            onDelete={deleteLine}
                            onDeleteMany={deleteLines}
                            onDuplicateMany={duplicateLines}
                            onInsert={insertEmptyLine}
                            onAdd={() => addEmptyLine(sec.id)}
                            onPaste={pasteLocalTable}
                            workspaceMode={workspaceMode}
                          />
                        ) : (
                          <>
                            {sec.lines.map((ln) => (
                              <LineEditor
                                key={ln.id}
                                sectionId={sec.id}
                                sectionKind={sec.kind === "LOCAL" ? "LOCAL" : "CONTRACTOR"}
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
                        )
                      )}
                    </EstimateSectionBlock>
                  ),
                )}
              </div>

              {!readOnly && !workspaceMode ? (
                <form
                  onSubmit={addSection}
                  className="mt-3 grid gap-2 border border-dashed border-zinc-300 bg-zinc-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <label htmlFor="project-estimate-new-section" className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
                      Новый раздел
                    </label>
                    <input
                      id="project-estimate-new-section"
                      value={newSectionTitle}
                      onChange={(e) => setNewSectionTitle(e.target.value)}
                      placeholder="Например: транспортные расходы"
                      className={`mt-1 min-h-11 w-full ${inputField}`}
                      maxLength={200}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy || !newSectionTitle.trim()}
                    className={`${btnPrimary} min-h-11 self-end px-5`}
                  >
                    Добавить вниз
                  </button>
                </form>
              ) : null}

              {!readOnly && workspaceMode ? (
                <details className="project-estimate__add-section">
                  <summary>+ Новый раздел</summary>
                  <form onSubmit={addSection}>
                    <input
                      id="project-estimate-new-section-compact"
                      value={newSectionTitle}
                      onChange={(event) => setNewSectionTitle(event.target.value)}
                      placeholder="Название раздела"
                      maxLength={200}
                    />
                    <button type="submit" disabled={busy || !newSectionTitle.trim()}>Добавить</button>
                  </form>
                </details>
              ) : null}

              {workspaceMode ? (
                <div className="project-estimate__finance-rail">
                  <div><span>Итого клиенту</span><strong>{money(totals.revenueTotal)} ₽</strong></div>
                  <div><span>Все расходы</span><strong>{money(totals.totalExpensesWithTax)} ₽</strong></div>
                  <div className={totals.marginAfterTax < 0 ? "is-negative" : "is-positive"}><span>Маржа после налогов</span><strong>{money(totals.marginAfterTax)} ₽</strong></div>
                  <div><span>Рентабельность</span><strong>{Number.isFinite(totals.marginAfterTaxPct) ? `${totals.marginAfterTaxPct.toFixed(0)}%` : "—"}</strong></div>
                  <details>
                    <summary>Налоги и комиссии</summary>
                    <div>
                      <EstimateFinanceToggle label={`Комиссия ${Math.round(PROJECT_ESTIMATE_COMMISSION_RATE * 100)}%`} checked={commissionEnabled} disabled={readOnly || busy} onChange={(value) => { setCommissionEnabled(value); markEstimateDraftDirty(); }} />
                      <EstimateFinanceToggle label={`Налог клиенту ${Math.round(PROJECT_ESTIMATE_TAX_RATE * 100)}%`} checked={clientChargeTaxEnabled} disabled={readOnly || busy} onChange={(value) => { setClientChargeTaxEnabled(value); markEstimateDraftDirty(); }} />
                      <EstimateFinanceToggle label={`Расходный налог ${Math.round(PROJECT_ESTIMATE_TAX_RATE * 100)}%`} checked={clientTaxEnabled} disabled={readOnly || busy} onChange={(value) => { setClientTaxEnabled(value); markEstimateDraftDirty(); }} />
                    </div>
                  </details>
                </div>
              ) : <div className="border border-zinc-300 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 p-3">
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
                <div className="grid border-t border-zinc-200 xl:grid-cols-[1.15fr_0.95fr_1fr] xl:divide-x xl:divide-zinc-200">
                <div className="bg-violet-50/45 p-4">
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
                          markEstimateDraftDirty();
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
                          markEstimateDraftDirty();
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
                <div className="border-t border-zinc-200 bg-zinc-50/70 p-4 xl:border-t-0">
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
                          markEstimateDraftDirty();
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
                <div className="border-t border-zinc-200 bg-emerald-50/55 p-4 xl:border-t-0">
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
              </div>}

              {!standalone && !workspaceMode && data.versions.length > 1 ? (
                <div className="border border-emerald-200 bg-emerald-50/45 p-4">
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
                    <div className="border border-violet-100 bg-white p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">Клиент</div>
                      <div className="mt-2 text-xl font-black tabular-nums text-violet-950">{money(projectTotals.revenueTotal)} ₽</div>
                    </div>
                    <div className="border border-zinc-200 bg-white p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-600">Расходы</div>
                      <div className="mt-2 text-xl font-black tabular-nums text-zinc-950">{money(projectTotals.totalExpensesWithTax)} ₽</div>
                    </div>
                    <div className="border border-emerald-200 bg-white p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-800">Прибыль</div>
                      <div className="mt-2 text-xl font-black tabular-nums text-emerald-950">{money(projectTotals.marginAfterTax)} ₽</div>
                    </div>
                    <div className="border border-emerald-200 bg-white p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-800">Рентабельность</div>
                      <div className="mt-2 text-xl font-black tabular-nums text-emerald-950">
                        {Number.isFinite(projectTotals.marginAfterTaxPct) ? `${projectTotals.marginAfterTaxPct.toFixed(2)}%` : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {!readOnly && data?.current && !workspaceMode ? (
                <div
                  ref={saveBarRef}
                  className="flex flex-wrap items-center justify-between gap-3 border border-zinc-300 bg-zinc-50 p-3"
                >
                  <div className="min-w-0 flex-1 text-xs text-zinc-500" aria-live="polite">
                    <div className="flex items-center gap-2 font-semibold text-zinc-700">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          estimateSaveStatus === "ERROR"
                            ? "bg-rose-500"
                            : estimateSaveStatus === "PAUSED"
                              ? "bg-amber-400"
                              : estimateSaving
                                ? "animate-pulse bg-violet-500"
                                : estimateDraftDirty
                                  ? "bg-amber-400"
                                  : "bg-emerald-500"
                        }`}
                      />
                      {estimateSaveMessage ??
                        (estimateDraftDirty ? "Изменения будут сохранены автоматически" : "Все изменения сохранены")}
                    </div>
                    {lastEstimateSavedAt && !estimateDraftDirty ? (
                      <div className="mt-1 text-[11px] text-zinc-400">
                        Последнее сохранение в {lastEstimateSavedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={busy || estimateSaving || !estimateDraftDirty}
                    onClick={discardEstimateDraft}
                    className={`${btnSecondary} min-h-11`}
                  >
                    Сбросить черновик
                  </button>
                  {estimateConflictDetected ? (
                    <>
                      <button
                        type="button"
                        disabled={busy || estimateSaving}
                        onClick={acceptServerEstimateAfterConflict}
                        className={`${btnSecondary} min-h-11`}
                      >
                        Принять серверную
                      </button>
                      <button
                        type="button"
                        disabled={busy || estimateSaving}
                        onClick={keepLocalDraftAfterConflict}
                        className="min-h-11 rounded-md border border-amber-400 bg-amber-50 px-4 py-2.5 text-sm font-extrabold text-amber-950 transition hover:bg-amber-100 disabled:opacity-50"
                      >
                        Оставить мой черновик
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy || estimateSaving || !estimateDraftDirty || estimateConflictDetected}
                    onClick={() => void saveEstimateDraft("MANUAL")}
                    className="min-h-11 rounded-md border border-zinc-950 bg-zinc-950 px-5 py-2.5 text-sm font-extrabold text-white hover:border-yellow-400 hover:bg-yellow-400 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {estimateSaving ? "Сохраняю смету…" : "Сохранить сейчас"}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
      {titleDialog && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[240] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-[2px]"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !busy) {
                  setTitleDialog(null);
                  setTitleDialogError(null);
                }
              }}
            >
              <form
                role="dialog"
                aria-modal="true"
                aria-labelledby="estimate-title-dialog-heading"
                className="w-full max-w-md overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_28px_90px_rgba(24,24,27,0.32)]"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitEstimateTitleDialog();
                }}
              >
                <div className="border-b border-zinc-200 bg-[linear-gradient(135deg,#faf5ff_0%,#ffffff_58%,#fff7cc_100%)] px-6 py-5">
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-700">
                    {titleDialog.mode === "RENAME" ? "Настройки сметы" : "Сметы проекта"}
                  </div>
                  <h2 id="estimate-title-dialog-heading" className="mt-2 text-2xl font-black tracking-tight text-zinc-950">
                    {titleDialog.mode === "CREATE"
                      ? "Новая смета"
                      : titleDialog.mode === "DUPLICATE"
                        ? "Копия текущей сметы"
                        : "Переименовать смету"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    {titleDialog.mode === "DUPLICATE"
                      ? "Все разделы и строки текущей сметы будут перенесены в новую копию."
                      : "Название поможет быстро отличать основной расчёт от дополнительных смет."}
                  </p>
                </div>
                <div className="space-y-4 px-6 py-5">
                  <label className="block">
                    <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-zinc-600">Название</span>
                    <input
                      autoFocus
                      maxLength={160}
                      value={titleDialog.title}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) => {
                        setTitleDialog((current) => current ? { ...current, title: event.target.value } : current);
                        if (titleDialogError) setTitleDialogError(null);
                      }}
                      className="mt-2 min-h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-base font-semibold text-zinc-950 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                      placeholder="Например, Основная смета"
                    />
                  </label>
                  {titleDialogError ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
                      {titleDialogError}
                    </div>
                  ) : null}
                  <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setTitleDialog(null);
                        setTitleDialogError(null);
                      }}
                      className="min-h-11 rounded-xl border border-zinc-300 bg-white px-5 text-sm font-extrabold text-zinc-800 transition hover:border-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      disabled={busy || !titleDialog.title.trim()}
                      className="min-h-11 rounded-xl border border-zinc-950 bg-zinc-950 px-5 text-sm font-extrabold text-white transition hover:border-yellow-400 hover:bg-yellow-400 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy
                        ? "Сохраняю…"
                        : titleDialog.mode === "CREATE"
                          ? "Создать смету"
                          : titleDialog.mode === "DUPLICATE"
                            ? "Создать копию"
                            : "Сохранить название"}
                    </button>
                  </div>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}
      {showFloatingSave && !workspaceMode && typeof document !== "undefined"
        ? createPortal(
            <button
              type="button"
              disabled={busy || estimateSaving || !estimateDraftDirty || estimateConflictDetected}
              onClick={() => void saveEstimateDraft("MANUAL")}
              className="fixed bottom-6 right-6 z-[160] rounded-2xl border border-violet-500 bg-[linear-gradient(135deg,#7c3aed,#111827)] px-5 py-3 text-sm font-extrabold text-white shadow-[0_18px_45px_rgba(76,29,149,0.32)] transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {estimateConflictDetected
                ? "Нужно выбрать версию"
                : estimateSaving
                  ? "Сохраняю…"
                  : "Сохранить сейчас"}
            </button>,
            document.body,
          )
        : null}
    </div>
  );
}

function patchLocalDraftLine(line: LocalDraftLine, patch: Record<string, unknown>): LocalDraftLine {
  let next: LocalDraftLine = { ...line };
  if (typeof patch.name === "string" || patch.name === null) {
    next = { ...next, name: patch.name == null ? "" : patch.name };
  }
  if (Object.prototype.hasOwnProperty.call(patch, "description")) {
    next = { ...next, description: patch.description == null ? null : String(patch.description) };
  }
  if (Object.prototype.hasOwnProperty.call(patch, "costClient")) {
    next = { ...next, costClient: patch.costClient == null ? null : String(patch.costClient) };
  }
  if (Object.prototype.hasOwnProperty.call(patch, "costInternal")) {
    next = { ...next, costInternal: patch.costInternal == null ? null : String(patch.costInternal) };
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
      paymentMethod: patch.paymentMethod == null ? null : String(patch.paymentMethod).trim() || null,
    };
  }
  if (Object.prototype.hasOwnProperty.call(patch, "paymentStatus")) {
    next = {
      ...next,
      paymentStatus: patch.paymentStatus == null ? null : String(patch.paymentStatus).trim() || null,
    };
  }
  if (Object.prototype.hasOwnProperty.call(patch, "contractorNote")) {
    next = {
      ...next,
      contractorNote: patch.contractorNote == null ? null : String(patch.contractorNote),
    };
  }
  if (Object.prototype.hasOwnProperty.call(patch, "contractorRequisites")) {
    next = {
      ...next,
      contractorRequisites: patch.contractorRequisites == null ? null : String(patch.contractorRequisites),
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
  if (patch.customValues && typeof patch.customValues === "object" && !Array.isArray(patch.customValues)) {
    next = {
      ...next,
      customValues: Object.fromEntries(
        Object.entries(patch.customValues as Record<string, unknown>).map(([columnId, value]) => [
          columnId,
          value == null ? "" : String(value),
        ]),
      ),
    };
  }

  const parsed = parseEstimateQtyUp(next);
  const touchedPricing =
    Object.prototype.hasOwnProperty.call(patch, "qty") ||
    Object.prototype.hasOwnProperty.call(patch, "unitPriceClient");
  if (parsed) {
    next = { ...next, costClient: String(roundMoney(parsed.q * parsed.up)) };
  } else if (touchedPricing) {
    next = { ...next, costClient: null };
  }
  return next;
}

function createEmptyLocalDraftLine(index: number): LocalDraftLine {
  return {
    id: makeTempId("line"),
    position: index,
    lineNumber: index + 1,
    name: "",
    description: null,
    lineType: "OTHER",
    costClient: null,
    costInternal: null,
    unit: "шт",
    qty: null,
    unitPriceClient: null,
    paymentMethod: null,
    paymentStatus: null,
    contractorNote: null,
    contractorRequisites: null,
    internalExpenses: [],
    customValues: {},
    orderLineId: null,
    itemId: null,
  };
}

function StandaloneEstimateCatalog({
  onAttach,
  onClose,
}: {
  onAttach: (args: {
    item: EstimateCatalogItem;
    qty: number;
    days: number;
    note: string;
  }) => void;
  onClose: () => void;
}) {
  const [items, setItems] = React.useState<EstimateCatalogItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [qty, setQty] = React.useState("1");
  const [days, setDays] = React.useState("1");
  const [note, setNote] = React.useState("");
  const [addedMessage, setAddedMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch("/api/catalog/items?all=true", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          items?: EstimateCatalogItem[];
          error?: { message?: string };
        } | null;
        if (!response.ok) throw new Error(payload?.error?.message ?? "Не удалось загрузить каталог");
        setItems(payload?.items ?? []);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Не удалось загрузить каталог");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const filteredItems = React.useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru-RU");
    if (!query) return items;
    return items.filter((item) =>
      `${item.name} ${item.description ?? ""}`.toLocaleLowerCase("ru-RU").includes(query),
    );
  }, [items, search]);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const available = selected
    ? selected.availability?.availableNow ??
      usableStockUnits({
        total: selected.total,
        inRepair: selected.inRepair,
        broken: selected.broken,
        missing: selected.missing,
      })
    : 0;

  function resetSelection() {
    setSelectedId(null);
    setQty("1");
    setDays("1");
    setNote("");
  }

  function attach() {
    if (!selected) return;
    const normalizedQty = Math.max(1, Math.min(parseQtyCommitInt(qty, 1), Math.max(1, available)));
    const normalizedDays = Math.max(1, parseQtyCommitInt(days, 1));
    onAttach({
      item: selected,
      qty: normalizedQty,
      days: normalizedDays,
      note,
    });
    setAddedMessage(`${selected.name} добавлен в раздел «Реквизит из каталога»`);
    resetSelection();
  }

  return (
    <section className="overflow-hidden border border-violet-200 bg-white shadow-[0_16px_44px_rgba(76,29,149,0.08)]">
      <div className="grid gap-4 border-b border-violet-100 bg-[linear-gradient(105deg,#faf8ff_0%,#fff_55%,#fff8dc_100%)] p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-700">
            Демо-каталог
          </div>
          <h3 className="mt-1 text-xl font-black text-zinc-950">Добавить реквизит в расчёт</h3>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Позиции попадут в смету без резерва склада. Количество, дни и итоговую цену можно изменить до сохранения.
          </p>
        </div>
        <button type="button" className={`${btnSecondary} self-start`} onClick={onClose}>
          Скрыть
        </button>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <div className="border-b border-zinc-200 p-4 lg:border-b-0 lg:border-r">
          <label className="block">
            <span className="sr-only">Поиск по демо-каталогу</span>
            <div className="relative">
              <svg
                viewBox="0 0 24 24"
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 fill-none stroke-zinc-400"
                strokeWidth="2"
                aria-hidden
              >
                <circle cx="11" cy="11" r="6" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={`min-h-12 w-full pl-11 ${inputField}`}
                placeholder="Название позиции или описание"
                autoFocus
              />
            </div>
          </label>

          <div className="mt-3 max-h-[420px] space-y-1 overflow-y-auto pr-1">
            {loading ? (
              Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="grid grid-cols-[56px_1fr_90px] items-center gap-3 border border-zinc-100 p-2">
                  <div className="h-14 animate-pulse bg-zinc-100" />
                  <div className="space-y-2">
                    <div className="h-3 w-2/3 animate-pulse bg-zinc-100" />
                    <div className="h-2.5 w-1/3 animate-pulse bg-zinc-100" />
                  </div>
                  <div className="h-8 animate-pulse bg-zinc-100" />
                </div>
              ))
            ) : error ? (
              <div className="border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">{error}</div>
            ) : filteredItems.length === 0 ? (
              <div className="border border-dashed border-zinc-300 px-3 py-8 text-center text-sm text-zinc-500">
                По этому запросу позиций нет.
              </div>
            ) : (
              filteredItems.map((item) => {
                const stock =
                  item.availability?.availableNow ??
                  usableStockUnits({
                    total: item.total,
                    inRepair: item.inRepair,
                    broken: item.broken,
                    missing: item.missing,
                  });
                const active = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={[
                      "grid w-full grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 border p-2 text-left transition-colors",
                      active
                        ? "border-violet-400 bg-violet-50"
                        : "border-transparent hover:border-zinc-200 hover:bg-zinc-50",
                    ].join(" ")}
                    onClick={() => {
                      setSelectedId(item.id);
                      setAddedMessage(null);
                      setQty("1");
                      setDays("1");
                      setNote("");
                    }}
                  >
                    <div className="h-14 w-14 overflow-hidden bg-zinc-100">
                      {item.photo1Key ? (
                        <Image
                          src={`/api/inventory/positions/${item.id}/photo?w=112`}
                          alt=""
                          width={56}
                          height={56}
                          unoptimized
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-lg font-black text-zinc-400">
                          {item.name.slice(0, 1).toLocaleUpperCase("ru-RU")}
                        </div>
                      )}
                    </div>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-zinc-950">{item.name}</span>
                      <span className="mt-0.5 block text-xs text-zinc-500">
                        {formatMoneyRub(item.pricePerDay)} ₽/сутки · годных: {stock}
                      </span>
                    </span>
                    <span className="text-xs font-bold text-violet-700">{active ? "Выбрано" : "Выбрать"}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="p-4">
          {selected ? (
            <div className="space-y-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
                  Выбранная позиция
                </div>
                <div className="mt-1 text-base font-black text-zinc-950">{selected.name}</div>
                <div className="mt-1 text-sm text-zinc-600">
                  {formatMoneyRub(selected.pricePerDay)} ₽ за единицу в сутки
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                  Количество
                  <input
                    value={qty}
                    onChange={(event) => setQty(digitsOnlyInput(event.target.value))}
                    onBlur={() =>
                      setQty(String(Math.max(1, Math.min(parseQtyCommitInt(qty, 1), Math.max(1, available)))))
                    }
                    className={`mt-1 w-full ${inputField} tabular-nums`}
                    inputMode="numeric"
                  />
                </label>
                <label className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                  Дней
                  <input
                    value={days}
                    onChange={(event) => setDays(digitsOnlyInput(event.target.value))}
                    onBlur={() => setDays(String(Math.max(1, parseQtyCommitInt(days, 1))))}
                    className={`mt-1 w-full ${inputField} tabular-nums`}
                    inputMode="numeric"
                  />
                </label>
              </div>
              <label className="block text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">
                Комментарий
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className={`mt-1 w-full ${inputField}`}
                  placeholder="Опционально"
                  maxLength={5000}
                />
              </label>
              <div className="border-y border-zinc-200 py-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-zinc-500">В смету</span>
                  <span className="font-black tabular-nums text-zinc-950">
                    {formatMoneyRub(
                      roundMoney(
                        selected.pricePerDay *
                          Math.max(1, parseQtyCommitInt(qty, 1)) *
                          Math.max(1, parseQtyCommitInt(days, 1)),
                      ),
                    )}{" "}
                    ₽
                  </span>
                </div>
              </div>
              {available <= 0 ? (
                <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Сейчас нет годных единиц на складе. Позицию можно увидеть в каталоге, но прикрепить к смете нельзя.
                </div>
              ) : null}
              <button
                type="button"
                className={`${btnPrimary} min-h-11 w-full`}
                disabled={available <= 0}
                onClick={attach}
              >
                Добавить в смету
              </button>
            </div>
          ) : (
            <div className="flex min-h-64 flex-col justify-center border border-dashed border-zinc-300 p-6">
              <div className="text-sm font-black text-zinc-950">Выберите позицию слева</div>
              <p className="mt-1 text-sm text-zinc-500">
                После выбора задайте количество и число дней. Цена за весь период рассчитается автоматически.
              </p>
              {addedMessage ? (
                <div className="mt-4 border-l-2 border-emerald-500 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
                  {addedMessage}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
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
  defaultOpen = false,
  workspaceMode = false,
  canMoveUp = false,
  canMoveDown = false,
  onMove,
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
  workspaceMode?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMove?: (direction: -1 | 1) => void;
}) {
  const [titleDraft, setTitleDraft] = React.useState(sec.title);
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  React.useEffect(() => {
    setTitleDraft(sec.title);
    setEditingTitle(false);
    setIsOpen(defaultOpen);
  }, [defaultOpen, sec.id, sec.title]);

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
      className={`project-estimate-section group overflow-hidden border bg-white ${workspaceMode ? "project-estimate-section--workspace" : ""} ${
        sec.kind === "REQUISITE"
          ? sectionTone.requisite
          : sec.kind === "DRAFT_REQUISITE"
            ? sectionTone.draftRequisite
            : sec.kind === "CONTRACTOR"
              ? sectionTone.contractor
              : sectionTone.local
      }`}
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="project-estimate-section__summary cursor-pointer list-none px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="project-estimate-section__kind flex flex-wrap items-center gap-2">
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
            <div className={`project-estimate-section__title mt-1.5 text-base font-black text-zinc-950 ${summaryTitleAddon ? "flex min-w-0 flex-wrap items-center gap-2" : ""}`}>
              {summaryTitleAddon}
              <span className="min-w-0">
                {sec.kind === "REQUISITE"
                  ? orderMeta?.label ?? "Реквизит"
                  : sec.kind === "DRAFT_REQUISITE"
                    ? sec.title
                    : sec.title}
              </span>
            </div>
            <div className="project-estimate-section__meta mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
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
                <span>
                  {sec.lines.length} поз. · demo без резерва
                </span>
              ) : sec.kind === "CONTRACTOR" ? (
                <span>
                  {sec.lines.length} строк · подрядчики и услуги
                </span>
              ) : (
                <span>
                  {sec.lines.length} строк · ручной раздел
                </span>
              )}
            </div>
          </div>
          <div className="project-estimate-section__actions flex flex-wrap items-start justify-end gap-2 self-start">
            <div className="project-estimate-section__totals flex flex-wrap items-center justify-end gap-3">
              <div className="text-right">
                <div className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-400">Клиенту</div>
                <div className="text-sm font-black tabular-nums text-zinc-950">{formatMoneyRub(sectionClientSubtotal)} ₽</div>
              </div>
              <div className="h-8 w-px bg-zinc-200" aria-hidden />
              <div className="text-right">
                <div className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-400">Расходы</div>
                <div className="text-sm font-black tabular-nums text-zinc-950">{formatMoneyRub(sectionInternalSubtotal)} ₽</div>
              </div>
            </div>
            {!readOnly && onMove ? (
              <div className="flex overflow-hidden rounded-md border border-zinc-200 bg-white" aria-label="Порядок раздела">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onMove(-1);
                  }}
                  disabled={busy || !canMoveUp}
                  title="Переместить раздел выше"
                  aria-label="Переместить раздел выше"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center border-l border-zinc-200 text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onMove(1);
                  }}
                  disabled={busy || !canMoveDown}
                  title="Переместить раздел ниже"
                  aria-label="Переместить раздел ниже"
                >
                  ↓
                </button>
              </div>
            ) : null}
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
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-400 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void onDeleteSection(sec.id);
                  }}
                  disabled={busy}
                  title="Удалить раздел"
                  aria-label="Удалить раздел"
                >
                  ×
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
            <svg viewBox="0 0 20 20" className={`mt-0.5 h-4 w-4 text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden>
              <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.1 1.02l-4.25 4.5a.75.75 0 01-1.1 0l-4.25-4.5a.75.75 0 01.02-1.06z" fill="currentColor" />
            </svg>
          </div>
        </div>
      </summary>
      <div className="project-estimate-section__body space-y-3 border-t border-zinc-200 bg-zinc-50/60 p-3 sm:p-4">
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
const UNIT_OPTIONS = ["шт", "час", "усл."] as const;
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

const COMPACT_TABLE_COLUMNS: Array<{
  key: ProjectEstimateTableColumn;
  label: string;
  className: string;
  defaultWidth: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  internal?: boolean;
}> = [
  { key: "name", label: "Позиция", className: "", defaultWidth: 240 },
  { key: "description", label: "Описание", className: "", defaultWidth: 256 },
  { key: "unit", label: "Ед.", className: "", defaultWidth: 80 },
  { key: "qty", label: "Кол-во", className: "", defaultWidth: 96, inputMode: "decimal" },
  { key: "unitPriceClient", label: "Цена / ед.", className: "", defaultWidth: 128, inputMode: "decimal" },
  { key: "costInternal", label: "Расход", className: "", defaultWidth: 128, inputMode: "decimal", internal: true },
  { key: "paymentMethod", label: "Тип оплаты", className: "", defaultWidth: 126, internal: true },
  { key: "paymentStatus", label: "Статус оплаты", className: "", defaultWidth: 142, internal: true },
  { key: "contractorNote", label: "Комментарий", className: "", defaultWidth: 220, internal: true },
  { key: "contractorRequisites", label: "Реквизиты / счёт", className: "", defaultWidth: 220, internal: true },
];

const CUSTOM_COLUMN_TYPE_LABELS: Record<ProjectEstimateCustomColumnType, string> = {
  TEXT: "Текст",
  NUMBER: "Число",
  DATE: "Дата",
  CHECKBOX: "Флажок",
  FORMULA: "Формула",
};

function CustomColumnManager({
  columns,
  busy,
  onAdd,
  onPatch,
  onMove,
  onDelete,
}: {
  columns: ProjectEstimateCustomColumn[];
  busy: boolean;
  onAdd: () => void;
  onPatch: (
    columnId: string,
    patch: Partial<Pick<ProjectEstimateCustomColumn, "label" | "type" | "formula" | "width">>,
  ) => void;
  onMove: (columnId: string, direction: -1 | 1) => void;
  onDelete: (columnId: string) => void;
}) {
  const formulaFields = [
    ...Object.entries(PROJECT_ESTIMATE_FORMULA_FIELDS),
    ...columns.map((column) => [column.key, column.label] as const),
  ];

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-zinc-950">Поля таблицы</div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-600">
            Свои заметки, даты и расчёты прямо в строках. Эти поля не влияют на сумму сметы,
            прибыль, аналитику и текущие выгрузки.
          </p>
        </div>
        <button
          type="button"
          disabled={busy || columns.length >= PROJECT_ESTIMATE_CUSTOM_COLUMN_LIMIT}
          className={btnSecondaryXs}
          onClick={onAdd}
        >
          + Колонка
        </button>
      </div>

      {columns.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-violet-200 bg-white/70 px-4 py-5 text-center text-xs text-zinc-500">
          Добавьте первую колонку — например, «Поставщик», «Срок оплаты» или «Маржа %».
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {columns.map((column, index) => {
            const formulaValidation =
              column.type === "FORMULA"
                ? validateProjectEstimateFormula(column.formula ?? "")
                : { ok: true as const };
            return (
              <div key={column.id} className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                <div className="grid gap-2 lg:grid-cols-[minmax(12rem,1fr)_10rem_9rem_auto]">
                  <label className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Название</span>
                    <input
                      value={column.label}
                      onChange={(event) => onPatch(column.id, { label: event.target.value })}
                      maxLength={80}
                      className={`mt-1 h-10 w-full ${inputFieldCompact}`}
                      aria-label={`Название колонки ${index + 1}`}
                    />
                  </label>
                  <label>
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Тип</span>
                    <select
                      value={column.type}
                      onChange={(event) =>
                        onPatch(column.id, { type: event.target.value as ProjectEstimateCustomColumnType })
                      }
                      className={`mt-1 h-10 w-full ${inputFieldCompact}`}
                    >
                      {Object.entries(CUSTOM_COLUMN_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Ширина</span>
                    <select
                      value={column.width}
                      onChange={(event) => onPatch(column.id, { width: Number(event.target.value) })}
                      className={`mt-1 h-10 w-full ${inputFieldCompact}`}
                    >
                      <option value={120}>Узкая</option>
                      <option value={160}>Обычная</option>
                      <option value={240}>Широкая</option>
                      <option value={320}>Очень широкая</option>
                    </select>
                  </label>
                  <div className="flex items-end justify-end gap-1">
                    <button type="button" disabled={busy || index === 0} onClick={() => onMove(column.id, -1)} className={btnGhostXs} aria-label="Сдвинуть колонку влево">←</button>
                    <button type="button" disabled={busy || index === columns.length - 1} onClick={() => onMove(column.id, 1)} className={btnGhostXs} aria-label="Сдвинуть колонку вправо">→</button>
                    <button type="button" disabled={busy} onClick={() => onDelete(column.id)} className="inline-flex h-8 items-center rounded-md px-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-40">Удалить</button>
                  </div>
                </div>

                {column.type === "FORMULA" ? (
                  <div className="mt-3 rounded-xl bg-zinc-950 p-3 text-white">
                    <label>
                      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">Формула</span>
                      <input
                        value={column.formula ?? ""}
                        onChange={(event) => onPatch(column.id, { formula: event.target.value })}
                        placeholder="qty * unit_price"
                        maxLength={500}
                        spellCheck={false}
                        className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-white/10 px-3 font-mono text-sm text-white outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-300/25"
                      />
                    </label>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {formulaFields.map(([key, label]) => (
                        <span key={`${column.id}-${key}`} title={label} className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-zinc-300">
                          {key}
                        </span>
                      ))}
                      <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-zinc-300">round()</span>
                      <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-zinc-300">min()</span>
                      <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-zinc-300">max()</span>
                    </div>
                    {!formulaValidation.ok ? (
                      <p className="mt-2 text-xs font-semibold text-rose-300">{formulaValidation.error}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CompactEstimateTable({
  sectionId,
  lines,
  customColumns,
  dirtyLineIds,
  readOnly,
  busy,
  onSave,
  onDelete,
  onDeleteMany,
  onDuplicateMany,
  onInsert,
  onAdd,
  onPaste,
  workspaceMode = false,
}: {
  sectionId: string;
  lines: LocalDraftLine[];
  customColumns: ProjectEstimateCustomColumn[];
  dirtyLineIds: Set<string>;
  readOnly: boolean;
  busy: boolean;
  onSave: (sectionId: string, lineId: string, patch: Record<string, unknown>) => void;
  onDelete: (sectionId: string, lineId: string) => void;
  onDeleteMany: (sectionId: string, lineIds: string[]) => void;
  onDuplicateMany: (sectionId: string, lineIds: string[]) => void;
  onInsert: (sectionId: string, anchorLineId: string, direction: "ABOVE" | "BELOW") => string;
  onAdd: () => void;
  onPaste: (
    sectionId: string,
    startLineId: string,
    startColumn: ProjectEstimateTableColumn,
    text: string,
  ) => void;
  workspaceMode?: boolean;
}) {
  const [selectedLineIds, setSelectedLineIds] = React.useState<Set<string>>(() => new Set());
  const [bulkNotice, setBulkNotice] = React.useState<string | null>(null);
  const [fillDrag, setFillDrag] = React.useState<{
    column: ProjectEstimateTableColumn;
    sourceRow: number;
    targetRow: number;
    value: string;
  } | null>(null);
  const fillDragRef = React.useRef(fillDrag);
  const [columnWidths, setColumnWidths] = React.useState<Record<ProjectEstimateTableColumn, number>>(() => {
    const defaults = Object.fromEntries(COMPACT_TABLE_COLUMNS.map((column) => [column.key, column.defaultWidth])) as Record<ProjectEstimateTableColumn, number>;
    if (typeof window === "undefined") return defaults;
    try {
      const stored = JSON.parse(localStorage.getItem("project-estimate-grid-column-widths:v1") ?? "{}") as Partial<Record<ProjectEstimateTableColumn, number>>;
      return Object.fromEntries(
        COMPACT_TABLE_COLUMNS.map((column) => [
          column.key,
          Math.max(72, Math.min(480, Number(stored[column.key]) || column.defaultWidth)),
        ]),
      ) as Record<ProjectEstimateTableColumn, number>;
    } catch {
      return defaults;
    }
  });
  const selectedCount = selectedLineIds.size;
  const allSelected = lines.length > 0 && selectedCount === lines.length;

  React.useEffect(() => {
    fillDragRef.current = fillDrag;
  }, [fillDrag]);

  function beginFillDrag(
    event: React.PointerEvent<HTMLSpanElement>,
    rowIndex: number,
    column: ProjectEstimateTableColumn,
    value: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const initial = { column, sourceRow: rowIndex, targetRow: rowIndex, value };
    fillDragRef.current = initial;
    setFillDrag(initial);
    document.body.classList.add("project-estimate-fill-dragging");

    const move = (moveEvent: PointerEvent) => {
      const cell = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest<HTMLElement>(
        `[data-estimate-fill-column="${column}"]`,
      );
      const nextRow = Number(cell?.dataset.estimateFillRow);
      if (!Number.isInteger(nextRow) || nextRow < 0 || nextRow >= lines.length) return;
      setFillDrag((current) => {
        if (!current || current.targetRow === nextRow) return current;
        const next = { ...current, targetRow: nextRow };
        fillDragRef.current = next;
        return next;
      });
    };
    const finish = () => {
      document.body.classList.remove("project-estimate-fill-dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      const current = fillDragRef.current;
      if (current) {
        const from = Math.min(current.sourceRow, current.targetRow);
        const to = Math.max(current.sourceRow, current.targetRow);
        for (let index = from; index <= to; index += 1) {
          if (index === current.sourceRow) continue;
          const line = lines[index];
          if (line) onSave(sectionId, line.id, { [current.column]: current.value });
        }
      }
      fillDragRef.current = null;
      setFillDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  }

  function beginColumnResize(event: React.PointerEvent<HTMLSpanElement>, column: ProjectEstimateTableColumn) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[column];

    const move = (moveEvent: PointerEvent) => {
      const nextWidth = Math.max(72, Math.min(480, startWidth + moveEvent.clientX - startX));
      setColumnWidths((current) => ({ ...current, [column]: nextWidth }));
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      setColumnWidths((current) => {
        try {
          localStorage.setItem("project-estimate-grid-column-widths:v1", JSON.stringify(current));
        } catch {
          // Column widths remain available for the current session.
        }
        return current;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  }

  React.useEffect(() => {
    const availableIds = new Set(lines.map((line) => line.id));
    setSelectedLineIds((previous) => {
      const next = new Set([...previous].filter((lineId) => availableIds.has(lineId)));
      if (next.size === previous.size && [...next].every((lineId) => previous.has(lineId))) return previous;
      return next;
    });
  }, [lines]);

  React.useEffect(() => {
    if (!bulkNotice) return;
    const timeout = window.setTimeout(() => setBulkNotice(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [bulkNotice]);

  const focusCell = React.useCallback((rowIndex: number, column: string) => {
    const cell = document.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[data-estimate-section="${sectionId}"][data-estimate-row="${rowIndex}"][data-estimate-column="${column}"]`,
    );
    cell?.focus();
    if (cell instanceof HTMLInputElement) cell.select();
  }, [sectionId]);

  function handleCellKeyDown(
    event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    rowIndex: number,
    column: string,
  ) {
    const isEnter = event.key === "Enter";
    const isVerticalArrow = event.key === "ArrowUp" || event.key === "ArrowDown";
    const isHorizontalArrow = event.key === "ArrowLeft" || event.key === "ArrowRight";
    if (!isEnter && !isVerticalArrow && !isHorizontalArrow) return;
    event.preventDefault();
    if (isHorizontalArrow) {
      const navigationColumns = [
        ...COMPACT_TABLE_COLUMNS.map((item) => item.key),
        ...customColumns.filter((item) => item.type !== "FORMULA" && item.type !== "CHECKBOX").map((item) => item.id),
      ];
      const columnIndex = navigationColumns.indexOf(column);
      const nextColumnIndex = columnIndex + (event.key === "ArrowLeft" ? -1 : 1);
      const nextColumn = navigationColumns[nextColumnIndex];
      if (nextColumn) focusCell(rowIndex, nextColumn);
      return;
    }
    const nextIndex = isEnter
      ? event.shiftKey
        ? rowIndex - 1
        : rowIndex + 1
      : event.key === "ArrowUp"
        ? rowIndex - 1
        : rowIndex + 1;
    if (nextIndex >= 0 && nextIndex < lines.length) focusCell(nextIndex, column);
  }

  function toggleAllLines() {
    setSelectedLineIds(allSelected ? new Set() : new Set(lines.map((line) => line.id)));
  }

  function toggleLine(lineId: string) {
    setSelectedLineIds((previous) => {
      const next = new Set(previous);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }

  function duplicateSelectedLines() {
    if (selectedCount === 0) return;
    onDuplicateMany(sectionId, [...selectedLineIds]);
    setSelectedLineIds(new Set());
  }

  function insertSelectedLine(direction: "ABOVE" | "BELOW") {
    if (selectedCount !== 1) return;
    const anchorLineId = [...selectedLineIds][0];
    if (!anchorLineId) return;
    const newLineId = onInsert(sectionId, anchorLineId, direction);
    setSelectedLineIds(new Set());
    window.setTimeout(() => {
      const cell = document.querySelector<HTMLInputElement>(
        `[data-estimate-section="${sectionId}"][data-estimate-line="${newLineId}"][data-estimate-column="name"]`,
      );
      cell?.focus();
    }, 0);
  }

  async function copySelectedLines() {
    const selectedLines = lines.filter((line) => selectedLineIds.has(line.id));
    if (selectedLines.length === 0) return;
    const text = selectedLines
      .map((line) =>
        COMPACT_TABLE_COLUMNS.map((column) => {
          const value = line[column.key];
          return value == null ? "" : String(value).replace(/[\t\r\n]+/g, " ");
        }).join("\t"),
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setBulkNotice("Скопировано");
    } catch {
      setBulkNotice("Не удалось скопировать");
    }
  }

  function deleteSelectedLines() {
    if (selectedCount === 0) return;
    const message =
      selectedCount === 1
        ? "Удалить выбранную строку?"
        : `Удалить выбранные строки (${selectedCount})?`;
    if (!window.confirm(message)) return;
    onDeleteMany(sectionId, [...selectedLineIds]);
    setSelectedLineIds(new Set());
  }

  return (
    <div className={`project-estimate-grid overflow-hidden rounded-lg border border-zinc-300 bg-white ${workspaceMode ? "project-estimate-grid--workspace" : ""}`}>
      {(!workspaceMode || selectedCount > 0) ? <div className="project-estimate-grid__toolbar flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-zinc-300 bg-zinc-50 px-3 py-2">
        {selectedCount > 0 && !readOnly ? (
          <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Действия с выбранными строками">
            <span className="text-xs font-black tabular-nums text-violet-800">
              Выбрано: {selectedCount}
            </span>
            <button
              type="button"
              disabled={busy}
              className="inline-flex h-8 items-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50"
              onClick={duplicateSelectedLines}
            >
              Дублировать
            </button>
            {selectedCount === 1 ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  className="inline-flex h-8 items-center rounded-lg px-2 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50"
                  onClick={() => insertSelectedLine("ABOVE")}
                >
                  Строка выше
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="inline-flex h-8 items-center rounded-lg px-2 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50"
                  onClick={() => insertSelectedLine("BELOW")}
                >
                  Строка ниже
                </button>
              </>
            ) : null}
            <button
              type="button"
              disabled={busy}
              className="inline-flex h-8 items-center rounded-lg px-2 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50"
              onClick={() => void copySelectedLines()}
            >
              Копировать
            </button>
            <button
              type="button"
              disabled={busy}
              className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-bold text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-50"
              onClick={deleteSelectedLines}
            >
              Удалить
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-lg px-2 text-xs font-semibold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              onClick={() => setSelectedLineIds(new Set())}
            >
              Снять выбор
            </button>
            {bulkNotice ? (
              <span className="text-[11px] font-semibold text-zinc-500" role="status">
                {bulkNotice}
              </span>
            ) : null}
          </div>
        ) : (
          <div className="project-estimate-grid__hint">
            <div className="text-xs font-black text-zinc-900">Табличный режим</div>
            <div className="text-[11px] text-zinc-500">
              Enter — следующая строка · можно вставлять диапазон из Excel или Google Sheets
            </div>
          </div>
        )}
        {!workspaceMode ? <div className="text-xs font-semibold tabular-nums text-zinc-500">{lines.length} строк</div> : null}
      </div> : null}

      <div className={`${workspaceMode ? "max-h-[22rem]" : "max-h-[70vh]"} overflow-auto`}>
        <table
          className="w-full table-fixed border-collapse text-left text-xs"
          style={{ minWidth: `${284 + Object.values(columnWidths).reduce((sum, width) => sum + width, 0) + customColumns.reduce((sum, column) => sum + column.width, 0)}px` }}
        >
          <thead className="sticky top-0 z-10 bg-zinc-100 text-zinc-700 shadow-[0_1px_0_#d4d4d8]">
            <tr>
              {!readOnly ? (
                <th className="w-11 px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAllLines}
                    disabled={lines.length === 0 || busy}
                    className="h-4 w-4 rounded border-zinc-500 accent-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                    aria-label={allSelected ? "Снять выбор со всех строк" : "Выбрать все строки"}
                  />
                </th>
              ) : null}
              <th className="w-12 border-l border-zinc-200 px-2 py-2 text-center text-[10px] font-bold text-zinc-500">№</th>
              {COMPACT_TABLE_COLUMNS.map((column) => (
                <React.Fragment key={column.key}>
                  <th
                    style={{ width: columnWidths[column.key] }}
                    className={`${column.className} project-estimate-grid__cell ${column.internal ? "project-estimate-grid__cell--internal" : ""} ${column.key === "costInternal" ? "project-estimate-grid__cell--internal-first" : ""} relative border-l border-zinc-200 px-2 py-2 text-[10px] font-bold text-zinc-600`}
                    title={column.internal ? "Внутреннее поле — не показывается клиенту" : undefined}
                  >
                    <span className="flex items-center gap-1.5">
                      {column.label}
                      {column.key === "costInternal" ? <span className="project-estimate-grid__internal-badge">внутр.</span> : null}
                    </span>
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Изменить ширину столбца «${column.label}»`}
                      onPointerDown={(event) => beginColumnResize(event, column.key)}
                      className="absolute -right-1 top-0 z-20 h-full w-2 cursor-col-resize touch-none hover:bg-violet-300/50"
                    />
                  </th>
                  {column.key === "unitPriceClient" ? (
                    <th className="w-32 min-w-32 border-l border-zinc-200 bg-violet-50/35 px-2 py-2 text-right text-[10px] font-bold text-zinc-700">
                      Сумма
                    </th>
                  ) : null}
                </React.Fragment>
              ))}
              {customColumns.map((column) => (
                <th
                  key={column.id}
                  style={{ width: column.width }}
                  className="border-l border-violet-200 bg-violet-50 px-2 py-2 text-[10px] font-bold text-violet-800"
                  title={`Вспомогательная колонка · ${CUSTOM_COLUMN_TYPE_LABELS[column.type]} · не влияет на финансы`}
                >
                  <span className="block truncate">{column.label}</span>
                </th>
              ))}
              {!readOnly ? <th className="w-12 border-l border-zinc-200" aria-label="Действия" /> : null}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, rowIndex) => (
              <tr
                key={line.id}
                className={`group border-t border-zinc-200 transition-colors hover:bg-violet-50/35 ${
                  dirtyLineIds.has(line.id) ? "bg-amber-50/70" : "bg-white"
                }`}
              >
                {!readOnly ? (
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={selectedLineIds.has(line.id)}
                      onChange={() => toggleLine(line.id)}
                      disabled={busy}
                      className="h-4 w-4 rounded border-zinc-300 accent-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                      aria-label={`Выбрать строку ${rowIndex + 1}`}
                    />
                  </td>
                ) : null}
                <td className="px-2 py-1.5 text-center font-bold tabular-nums text-zinc-400">{rowIndex + 1}</td>
                {COMPACT_TABLE_COLUMNS.map((column) => {
                  const rawValue = line[column.key];
                  const value = rawValue == null ? "" : String(rawValue);
                  const inFillRange =
                    fillDrag?.column === column.key &&
                    rowIndex >= Math.min(fillDrag.sourceRow, fillDrag.targetRow) &&
                    rowIndex <= Math.max(fillDrag.sourceRow, fillDrag.targetRow);
                  return (
                    <React.Fragment key={column.key}>
                    <td
                      style={{ width: columnWidths[column.key] }}
                      data-estimate-fill-column={column.key}
                      data-estimate-fill-row={rowIndex}
                      className={`${column.className} project-estimate-grid__cell ${column.internal ? "project-estimate-grid__cell--internal" : ""} ${column.key === "costInternal" ? "project-estimate-grid__cell--internal-first" : ""} border-l border-zinc-200 p-0.5 ${inFillRange ? "bg-violet-100/70" : ""}`}
                    >
                      {readOnly ? (
                        <div className="min-h-8 px-2 py-2 text-zinc-800">{value || "—"}</div>
                      ) : (
                        <div className="group/cell relative">
                          {column.key === "unit" ? (
                            <>
                              <select
                                value={value}
                                onChange={(event) => onSave(sectionId, line.id, { unit: event.target.value })}
                                onKeyDown={(event) => handleCellKeyDown(event, rowIndex, column.key)}
                                data-estimate-section={sectionId}
                                data-estimate-line={line.id}
                                data-estimate-row={rowIndex}
                                data-estimate-column={column.key}
                                className="project-estimate-grid__select h-9 w-full appearance-none border border-transparent bg-transparent px-2 pr-7 text-xs text-zinc-900 outline-none focus:border-violet-500 focus:bg-white focus:shadow-[inset_0_0_0_1px_#8b5cf6]"
                                aria-label={`${column.label}, строка ${rowIndex + 1}`}
                              >
                                {value && !UNIT_OPTIONS.includes(value as (typeof UNIT_OPTIONS)[number]) ? <option value={value}>{value}</option> : null}
                                <option value="">—</option>
                                {UNIT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                              <span className="project-estimate-grid__select-chevron" aria-hidden>⌄</span>
                            </>
                          ) : column.key === "paymentMethod" ? (
                            <>
                            <select
                              value={value}
                              onChange={(event) => onSave(sectionId, line.id, { paymentMethod: event.target.value || null })}
                              onKeyDown={(event) => handleCellKeyDown(event, rowIndex, column.key)}
                              data-estimate-section={sectionId}
                              data-estimate-line={line.id}
                              data-estimate-row={rowIndex}
                              data-estimate-column={column.key}
                              className="project-estimate-grid__select h-9 w-full appearance-none border border-transparent bg-transparent px-2 pr-7 text-xs text-zinc-900 outline-none focus:border-violet-500 focus:bg-white focus:shadow-[inset_0_0_0_1px_#8b5cf6]"
                              aria-label={`${column.label}, строка ${rowIndex + 1}`}
                            >
                              <option value="">—</option>
                              {PAYMENT_METHOD_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                            </select>
                            <span className="project-estimate-grid__select-chevron" aria-hidden>⌄</span>
                            </>
                          ) : column.key === "paymentStatus" ? (
                            <>
                            <select
                              value={value}
                              onChange={(event) => onSave(sectionId, line.id, { paymentStatus: event.target.value || null })}
                              onKeyDown={(event) => handleCellKeyDown(event, rowIndex, column.key)}
                              data-estimate-section={sectionId}
                              data-estimate-line={line.id}
                              data-estimate-row={rowIndex}
                              data-estimate-column={column.key}
                              className={`project-estimate-grid__select h-9 w-full appearance-none border border-transparent bg-transparent px-2 pr-7 text-xs outline-none focus:border-violet-500 focus:bg-white focus:shadow-[inset_0_0_0_1px_#8b5cf6] ${paymentStatusTextClass(value)}`}
                              aria-label={`${column.label}, строка ${rowIndex + 1}`}
                            >
                              <option value="">—</option>
                              <option value={PAYMENT_STATUS_PAID}>{PAYMENT_STATUS_PAID}</option>
                              <option value={PAYMENT_STATUS_UNPAID}>{PAYMENT_STATUS_UNPAID}</option>
                            </select>
                            <span className="project-estimate-grid__select-chevron" aria-hidden>⌄</span>
                            </>
                          ) : (
                            <input
                              value={value}
                              onChange={(event) => onSave(sectionId, line.id, { [column.key]: event.target.value })}
                              onKeyDown={(event) => handleCellKeyDown(event, rowIndex, column.key)}
                              onPaste={(event) => {
                                const text = event.clipboardData.getData("text/plain");
                                if (!text) return;
                                event.preventDefault();
                                onPaste(sectionId, line.id, column.key, text);
                              }}
                              data-estimate-section={sectionId}
                              data-estimate-line={line.id}
                              data-estimate-row={rowIndex}
                              data-estimate-column={column.key}
                              inputMode={column.inputMode}
                              className={`h-9 w-full border border-transparent bg-transparent px-2 text-xs text-zinc-900 outline-none transition focus:border-violet-500 focus:bg-white focus:shadow-[inset_0_0_0_1px_#8b5cf6] ${column.inputMode === "decimal" ? "text-right tabular-nums" : ""}`}
                              aria-label={`${column.label}, строка ${rowIndex + 1}`}
                            />
                          )}
                          <span
                            role="button"
                            tabIndex={-1}
                            aria-label={`Протянуть значение «${column.label}»`}
                            title="Потяните, чтобы скопировать значение по строкам"
                            onPointerDown={(event) => beginFillDrag(event, rowIndex, column.key, value)}
                            className="absolute bottom-0 right-0 hidden h-2 w-2 translate-x-1/2 translate-y-1/2 cursor-crosshair border border-white bg-violet-600 group-focus-within/cell:block"
                          />
                        </div>
                      )}
                    </td>
                    {column.key === "unitPriceClient" ? (
                      <td className="border-l border-zinc-200 bg-violet-50/25 px-2 py-1.5 text-right font-black tabular-nums text-zinc-950">
                        {formatMoneyRub(normalizedLocalLineCostClientNumber(line) ?? 0)} ₽
                      </td>
                    ) : null}
                    </React.Fragment>
                  );
                })}
                {(() => {
                  const clientTotal = normalizedLocalLineCostClientNumber(line) ?? 0;
                  const internalTotal = getProjectEstimateLineInternalTotal(line);
                  const formulaResults = evaluateProjectEstimateCustomColumns({
                    columns: customColumns,
                    rawValues: line.customValues,
                    canonicalValues: {
                      line_number: rowIndex + 1,
                      qty: Number(line.qty?.replace(",", ".") || 0) || 0,
                      unit_price: Number(line.unitPriceClient?.replace(",", ".") || 0) || 0,
                      client_total: clientTotal,
                      internal_total: internalTotal,
                      margin: roundMoney(clientTotal - internalTotal),
                    },
                  });
                  return customColumns.map((column) => {
                    const value = line.customValues[column.id] ?? "";
                    const formulaResult = formulaResults[column.id];
                    const patchValue = (nextValue: string) =>
                      onSave(sectionId, line.id, {
                        customValues: { ...line.customValues, [column.id]: nextValue },
                      });
                    return (
                      <td
                        key={column.id}
                        style={{ width: column.width }}
                        className="border-l border-violet-100 bg-violet-50/25 p-0.5"
                      >
                        {column.type === "FORMULA" ? (
                          <div
                            className={`min-h-9 px-2 py-2 text-right font-bold tabular-nums ${
                              formulaResult?.error ? "text-rose-700" : "text-violet-900"
                            }`}
                            title={formulaResult?.error ?? column.formula ?? undefined}
                          >
                            {formulaResult?.error
                              ? "Ошибка"
                              : formulaResult?.value == null
                                ? "—"
                                : formatMoneyRub(formulaResult.value)}
                          </div>
                        ) : column.type === "CHECKBOX" ? (
                          <label className="flex min-h-9 items-center justify-center">
                            <input
                              type="checkbox"
                              checked={value === "true"}
                              disabled={readOnly || busy}
                              onChange={(event) => patchValue(event.target.checked ? "true" : "false")}
                              className="h-4 w-4 rounded border-zinc-300 accent-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                              aria-label={`${column.label}, строка ${rowIndex + 1}`}
                            />
                          </label>
                        ) : readOnly ? (
                          <div className={`min-h-9 px-2 py-2 text-zinc-800 ${column.type === "NUMBER" ? "text-right tabular-nums" : ""}`}>
                            {value || "—"}
                          </div>
                        ) : (
                          <input
                            type={column.type === "DATE" ? "date" : column.type === "NUMBER" ? "number" : "text"}
                            value={value}
                            onChange={(event) => patchValue(event.target.value)}
                            onKeyDown={(event) => handleCellKeyDown(event, rowIndex, column.id)}
                            data-estimate-section={sectionId}
                            data-estimate-line={line.id}
                            data-estimate-row={rowIndex}
                            data-estimate-column={column.id}
                            inputMode={column.type === "NUMBER" ? "decimal" : undefined}
                            className={`h-9 w-full border border-transparent bg-transparent px-2 text-xs text-zinc-900 outline-none transition focus:border-violet-500 focus:bg-white focus:shadow-[inset_0_0_0_1px_#8b5cf6] ${
                              column.type === "NUMBER" ? "text-right tabular-nums" : ""
                            }`}
                            aria-label={`${column.label}, строка ${rowIndex + 1}`}
                          />
                        )}
                      </td>
                    );
                  });
                })()}
                {!readOnly ? (
                  <td className="border-l border-zinc-200 px-1 text-center">
                    <button
                      type="button"
                      disabled={busy}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-300 opacity-0 transition hover:bg-red-50 hover:text-red-700 focus:opacity-100 group-hover:opacity-100 disabled:opacity-30"
                      onClick={() => onDelete(sectionId, line.id)}
                      title="Удалить строку"
                      aria-label={`Удалить строку ${rowIndex + 1}`}
                    >
                      ×
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly ? (
        <button
          type="button"
          disabled={busy}
          className="flex w-full items-center justify-center border-t border-dashed border-zinc-200 bg-zinc-50/70 px-3 py-2 text-xs font-bold text-violet-700 transition hover:bg-violet-50 disabled:opacity-50"
          onClick={onAdd}
        >
          + Добавить строку
        </button>
      ) : null}
    </div>
  );
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
        className={`relative border p-3 text-xs transition-colors ${
          isDirty
            ? "border-orange-300 bg-orange-50/35"
            : "border-zinc-200 bg-white"
        }`}
      >
        <div className="mb-3 flex items-start justify-between gap-3 pr-9">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded border border-zinc-300 bg-zinc-50 px-2 text-[11px] font-black text-zinc-800">
              {line.lineNumber}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-violet-700">
                <span>Клиенту</span>
                {line.itemId ? (
                  <span className="border-l border-violet-200 pl-2 text-[10px] text-zinc-500">
                    из каталога
                  </span>
                ) : null}
              </div>
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

        <div className="border-t border-zinc-200 pt-3">
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
            <div className="border-l-2 border-violet-500 bg-violet-50/50 px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-violet-700">Сумма</div>
              <div className="mt-1 text-sm font-extrabold tabular-nums text-violet-950">
                {clientSum}
                {clientSum !== "—" ? <span className="ml-0.5 text-xs font-semibold text-violet-500">₽</span> : null}
              </div>
            </div>
          </div>
        </div>

        <details className="group/internal mt-2 overflow-hidden border border-zinc-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs [&::-webkit-details-marker]:hidden">
            <span className="font-bold text-zinc-700">Внутренние расходы и оплата</span>
            <span className="flex items-center gap-2">
              <span className="font-black tabular-nums text-zinc-950">{formatMoneyRub(lineInternalTotal(line))} ₽</span>
              <span className="text-zinc-400 transition-transform group-open/internal:rotate-180">⌄</span>
            </span>
          </summary>
          <div className="border-t border-zinc-200 bg-zinc-50/70 p-3">
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
              Комментарий
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
                    <div className="grid gap-2 xl:grid-cols-[6rem_9rem_13rem_minmax(0,1fr)_minmax(0,1fr)]">
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
                        Комментарий
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
        </details>
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
                  Комментарий
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
  canMoveUp,
  canMoveDown,
  onMove,
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
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
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
      payMultiplierSnapshot?: number | null;
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
          payMultiplierSnapshot: line.payMultiplierSnapshot,
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

  const servicesTotal =
    (services.deliveryEnabled ? Number(services.deliveryPrice || 0) : 0) +
    (services.montageEnabled ? Number(services.montagePrice || 0) : 0) +
    (services.demontageEnabled ? Number(services.demontagePrice || 0) : 0);
  const orderPricing = React.useMemo(() => {
    if (!order) return null;
    return calcOrderPricing({
      startDate: new Date(`${order.startDate.slice(0, 10)}T00:00:00.000Z`),
      endDate: new Date(`${order.endDate.slice(0, 10)}T00:00:00.000Z`),
      rentalStartPartOfDay: order.rentalStartPartOfDay ?? "MORNING",
      rentalEndPartOfDay: order.rentalEndPartOfDay ?? "MORNING",
      payMultiplier: order.payMultiplier,
      clientPaymentMethod: order.clientPaymentMethod,
      deliveryEnabled: services.deliveryEnabled,
      deliveryPrice: services.deliveryPrice,
      montageEnabled: services.montageEnabled,
      montagePrice: services.montagePrice,
      demontageEnabled: services.demontageEnabled,
      demontagePrice: services.demontagePrice,
      lines: linesForCap,
      discount: order,
    });
  }, [linesForCap, order, services]);
  const savedLineClientTotalsByOrderLineId = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const line of sec.lines) {
      if (line.orderLineId) map.set(line.orderLineId, getNumericAmount(line.costClient));
    }
    return map;
  }, [sec.lines]);
  const savedRentalTotal = React.useMemo(
    () =>
      roundMoney(
        sec.lines
          .filter((line) => line.lineType === "RENTAL")
          .reduce((sum, line) => sum + getNumericAmount(line.costClient), 0),
      ),
    [sec.lines],
  );
  const savedServicesTotal = React.useMemo(
    () =>
      roundMoney(
        sec.lines
          .filter((line) => line.lineType === "SERVICE")
          .reduce((sum, line) => sum + getNumericAmount(line.costClient), 0),
      ),
    [sec.lines],
  );
  const hasOrderDraftChanges = React.useMemo(() => {
    if (!order) return false;
    if (lines.length !== order.lines.length) return true;
    for (let index = 0; index < lines.length; index += 1) {
      const draft = lines[index];
      const original = order.lines[index];
      if (!original) return true;
      if (draft.id !== original.id) return true;
      if (draft.requestedQty !== original.requestedQty) return true;
      if ((draft.warehouseComment ?? "") !== (original.warehouseComment ?? "")) return true;
    }
    const servicePairs: Array<[boolean, string, string, string, OrderServicePaymentMethod | undefined]> = [
      [
        order.deliveryEnabled,
        order.deliveryComment ?? "",
        order.deliveryPrice != null ? String(order.deliveryPrice) : "",
        order.deliveryInternalCost != null ? String(order.deliveryInternalCost) : "",
        order.deliveryInternalPaymentMethod,
      ],
      [
        order.montageEnabled,
        order.montageComment ?? "",
        order.montagePrice != null ? String(order.montagePrice) : "",
        order.montageInternalCost != null ? String(order.montageInternalCost) : "",
        order.montageInternalPaymentMethod,
      ],
      [
        order.demontageEnabled,
        order.demontageComment ?? "",
        order.demontagePrice != null ? String(order.demontagePrice) : "",
        order.demontageInternalCost != null ? String(order.demontageInternalCost) : "",
        order.demontageInternalPaymentMethod,
      ],
    ];
    const draftPairs: Array<[boolean, string, string, string, OrderServicePaymentMethod]> = [
      [
        services.deliveryEnabled,
        services.deliveryComment,
        services.deliveryPrice,
        services.deliveryInternalCost,
        services.deliveryInternalPaymentMethod,
      ],
      [
        services.montageEnabled,
        services.montageComment,
        services.montagePrice,
        services.montageInternalCost,
        services.montageInternalPaymentMethod,
      ],
      [
        services.demontageEnabled,
        services.demontageComment,
        services.demontagePrice,
        services.demontageInternalCost,
        services.demontageInternalPaymentMethod,
      ],
    ];
    return servicePairs.some((original, index) => {
      const draft = draftPairs[index];
      return (
        original[0] !== draft[0] ||
        original[1] !== draft[1] ||
        original[2] !== draft[2] ||
        original[3] !== draft[3] ||
        (original[4] ?? "NON_CASH") !== draft[4]
      );
    });
  }, [lines, order, services]);
  const useSavedEstimateTotals = !hasOrderDraftChanges;
  const rentalTotal = useSavedEstimateTotals ? savedRentalTotal : (orderPricing?.rentalSubtotalAfterDiscount ?? 0);
  const rentalDiscountAmount = useSavedEstimateTotals ? 0 : (orderPricing?.discountAmount ?? 0);
  const orderBlockClientTotal = roundMoney(rentalTotal + (useSavedEstimateTotals ? savedServicesTotal : servicesTotal));

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
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      onMove={onMove}
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
                const mult = line.payMultiplierSnapshot ?? (order.payMultiplier != null ? Number(order.payMultiplier) : 1);
                const lk = String(line.id ?? `${line.itemId}-${index}`);
                const qtyDraftRaw = requisiteQtyDraft[lk];
                const qtyDisplay =
                  qtyDraftRaw !== undefined
                    ? qtyDraftRaw.trim() === ""
                      ? 0
                      : Math.max(1, Number.parseInt(qtyDraftRaw, 10) || 0)
                    : line.requestedQty;
                const savedLineTotal = line.id ? savedLineClientTotalsByOrderLineId.get(line.id) : undefined;
                const lineTotal =
                  (useSavedEstimateTotals ? savedLineTotal : undefined) ??
                  orderPricing?.lineAllocations[index]?.rentalAfterDiscount ??
                  calcProjectEstimateRequisiteTotal({
                    pricePerDay: line.pricePerDaySnapshot ?? 0,
                    qty: qtyDisplay,
                    plannedDays: dayC,
                    payMultiplier: mult,
                  }) ??
                  0;
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
              {rentalDiscountAmount > 0 ? (
                <div className="flex items-center justify-between gap-3 text-emerald-700">
                  <span>
                    Скидка
                    {orderPricing?.discountType === "PERCENT" && orderPricing.discountPercent != null
                      ? ` ${formatOrderMoney(orderPricing.discountPercent)}%`
                      : ""}
                  </span>
                  <span className="font-semibold">−{formatOrderMoney(rentalDiscountAmount)} ₽</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <span>Доп. услуги</span>
                <span className="font-semibold text-zinc-950">
                  {formatOrderMoney(useSavedEstimateTotals ? savedServicesTotal : servicesTotal)} ₽
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-violet-200 pt-2 text-base font-bold text-violet-950">
                <span>Всего</span>
                <span>{formatOrderMoney(orderBlockClientTotal)} ₽</span>
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
