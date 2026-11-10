// @vitest-environment jsdom
import React, {act} from "react";
import {createRoot, type Root} from "react-dom/client";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {CompactEstimateTable} from "@/app/projects/[id]/ProjectEstimatePanel";

let host: HTMLDivElement, root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

it("keeps subsection headings out of editable cells and reveals internal columns on demand", () => {
  const insert = vi.fn();
  const base = {position: 0, lineNumber: 1, description: null, unit: null, qty: null, unitPriceClient: null, costClient: null, costInternal: null, paymentMethod: null, paymentStatus: null, contractorNote: null, contractorRequisites: null, itemId: null, orderLineId: null, internalExpenses: [], customValues: {}};
  const props: React.ComponentProps<typeof CompactEstimateTable> = {
    sectionId: "section", dirtyLineIds: new Set(), busy: false, readOnly: false, workspaceMode: true,
    lines: [
      {...base, id: "group", name: "Свет", lineType: "SUBSECTION"},
      {...base, id: "line", name: "Прибор", lineType: "OTHER", qty: "2", unitPriceClient: "100", costClient: "200", costInternal: "50"},
    ],
    customColumns: [{id: "extra", key: "extra", label: "Заметки", type: "TEXT", width: 150, sortOrder: 0, formula: null}],
    onSave: vi.fn(), onDelete: vi.fn(), onDeleteMany: vi.fn(), onDuplicateMany: vi.fn(), onInsert: insert,
    onAdd: vi.fn(), onPaste: vi.fn(), onFillCells: vi.fn(), onAddSubsection: vi.fn(), onImport: vi.fn(),
  };
  act(() => root.render(<CompactEstimateTable {...props} />));
  expect(host.querySelectorAll('textarea[data-estimate-column="name"]')).toHaveLength(1);
  const nameCell = host.querySelector<HTMLTextAreaElement>('textarea[data-estimate-column="name"]')!;
  act(() => nameCell.dispatchEvent(new KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true})));
  expect(document.activeElement?.getAttribute("data-estimate-column")).toBe("description");
  expect(host.textContent).toContain("200");
  expect(host.querySelector('th[title*="Вспомогательная"]')).toBeNull();
  const toggle = [...host.querySelectorAll("button")].find(button => button.textContent === "Расходы и оплата")!;
  act(() => toggle.click());
  expect(host.querySelector('th[title*="Вспомогательная"]')?.textContent).toBe("Заметки");
  expect(host.querySelector('input[data-estimate-column="costInternal"]')?.getAttribute("value")).toBe("50");
  const fold = host.querySelector<HTMLButtonElement>('button[aria-label="Свернуть или развернуть подраздел"]')!;
  act(() => fold.click());
  expect(host.querySelectorAll('textarea[data-estimate-column="name"]')).toHaveLength(0);
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label^="Добавить строку в подраздел"]')!.click());
  expect(insert).toHaveBeenCalledWith("section", "line", "BELOW");
  expect(host.querySelectorAll('textarea[data-estimate-column="name"]')).toHaveLength(1);
});
