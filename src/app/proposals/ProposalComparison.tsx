"use client";

import React from "react";
import { compareProposalVariants, comparisonDelta, type ComparisonBudget, type ComparisonItem, type ComparisonSection } from "@/lib/proposal-comparison";
import { proposalMoney, type ProposalVariant } from "@/lib/proposals";
import base from "./proposals.module.css";
import styles from "./comparison.module.css";

const roles = { PRIMARY: "Включено", ALTERNATIVE: "Альтернатива", OPTIONAL: "Дополнительно", EXCLUDED: "Не включать" };
const quantity = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
function budgetLabel(value: ComparisonBudget) {
  if (value.unresolved && value.client === 0) return "Цены уточняются";
  return `${value.preliminary || value.unresolved ? "от " : ""}${proposalMoney(value.client)}`;
}
function itemPrice(item: ComparisonItem) {
  if (item.clientUnitPrice == null) return "По запросу";
  return `${item.priceTypeSnapshot === "FROM" || item.priceTypeSnapshot === "RANGE" ? "от " : ""}${proposalMoney(Math.round(item.clientUnitPrice * item.qty * 100) / 100)}`;
}

function Composition({ section, Photo }: { section: ComparisonSection | null; Photo: React.ComponentType<{ url?: string | null; name: string }> }) {
  if (!section) return <p className={styles.emptyCell}>Нет раздела в этом варианте</p>;
  if (!section.items.length) return <p className={styles.emptyCell}>Услуги ещё не добавлены</p>;
  return <>
    <div className={styles.sectionPrice}><span>Основной состав</span><strong>{budgetLabel(section.budget)}</strong>
      {section.budget.unresolved ? <small>Цен по запросу: {section.budget.unresolved}. Не включены в итог.</small> : null}
    </div>
    <ul className={styles.items}>{section.items.map((item, index) => <li key={index}>
      {item.assetSnapshot?.[0]?.url ? <div className={styles.servicePhoto}><Photo url={item.assetSnapshot[0].url} name={item.offerTitleSnapshot} /></div> : null}
      <div className={styles.itemCopy}><strong>{item.offerTitleSnapshot}</strong>
        {item.contractorNameSnapshot && item.contractorNameSnapshot !== item.offerTitleSnapshot ? <span>{item.contractorNameSnapshot}</span> : null}
        <small>{roles[item.selectionRole]} · {quantity.format(item.qty)} {item.unitLabel ?? "шт."}</small>
        <b>{itemPrice(item)}</b>
        {item.offerDescriptionSnapshot || item.clientNote ? <details><summary>Описание</summary>
          {item.offerDescriptionSnapshot ? <p>{item.offerDescriptionSnapshot}</p> : null}
          {item.clientNote ? <p>{item.clientNote}</p> : null}
        </details> : null}
      </div>
    </li>)}</ul>
  </>;
}

export function ProposalComparison({ variants, activeVariantId, disabled, copyDisabled, onOpen, onCopy, Photo }: {
  variants: ProposalVariant[]; activeVariantId: string; disabled: boolean; copyDisabled: boolean;
  onOpen: (id: string, mode: "compose" | "preview") => void; onCopy: () => void;
  Photo: React.ComponentType<{ url?: string | null; name: string }>;
}) {
  const [selectedIds, setSelectedIds] = React.useState(() => [activeVariantId, ...variants.filter((v) => v.id !== activeVariantId).map((v) => v.id)].filter(Boolean).slice(0, 3));
  const [onlyDifferences, setOnlyDifferences] = React.useState(false);
  const heading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const comparison = React.useMemo(() => compareProposalVariants(variants, selectedIds), [variants, selectedIds]);
  const rows = onlyDifferences ? comparison.rows.filter((row) => row.different) : comparison.rows;
  const baseline = comparison.variants[0];
  const enough = comparison.variants.length >= 2;

  function toggle(id: string) {
    setSelectedIds((previous) => {
      const current = previous.filter((entry) => variants.some((variant) => variant.id === entry));
      return current.includes(id) ? current.filter((entry) => entry !== id) : current.length < 3 ? [...current, id] : current;
    });
  }
  return <section className={styles.comparison} aria-labelledby="comparison-title">
    <header className={styles.heading}><div><h2 id="comparison-title" ref={heading} tabIndex={-1}>Сравнение вариантов</h2>
      <p>Выберите до трёх вариантов. Сравниваем состав, количество, клиентские цены и описания.</p></div>
      <label className={styles.filter}><input type="checkbox" checked={onlyDifferences} disabled={!enough} onChange={(event) => setOnlyDifferences(event.target.checked)} />Только различия</label>
    </header>
    <div className={styles.selection} role="group" aria-label="Варианты для сравнения">
      {variants.map((variant) => <button key={variant.id} aria-pressed={selectedIds.includes(variant.id)} disabled={!selectedIds.includes(variant.id) && comparison.variants.length >= 3} onClick={() => toggle(variant.id)}>{variant.title}</button>)}
    </div>
    {variants.length > 3 ? <p className={styles.hint}>Чтобы выбрать другой вариант, сначала снимите выбор с одного из трёх.</p> : null}
    {!enough ? <div className={styles.empty}><h3>{variants.length < 2 ? "Создайте второй вариант" : "Выберите хотя бы два варианта"}</h3><p>{variants.length < 2 ? "Скопируйте текущий состав, измените услуги или цены и сравните варианты рядом." : "Нажмите на названия вариантов выше, чтобы увидеть отличия."}</p>{variants.length < 2 ? <button className={base.secondary} disabled={copyDisabled} onClick={onCopy}>Создать вариант на основе текущего</button> : null}</div> : <>
      <p className={styles.hint} role="status">Разделов с отличиями: {comparison.differenceCount}. Разделы сопоставлены по названию; одноимённые — по порядку. Фото и внутренние расходы не сравниваются.</p>
      <table className={styles.table} role="table">
        <caption className={styles.srOnly}>Клиентский состав вариантов. Точка сравнения: {baseline.title}.</caption>
        <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Состав мероприятия</th>{comparison.variants.map((variant, index) => {
          const delta = index ? comparisonDelta(variant.budget, baseline.budget) : null;
          return <th key={variant.id} scope="col" role="columnheader" className={styles.variantHeader}>
            <h3>{variant.title}</h3><strong>{budgetLabel(variant.budget)}</strong>
            <p>{variant.budget.unresolved ? `Цен по запросу: ${variant.budget.unresolved}. Итог неполный.` : variant.budget.preliminary ? "Предварительный нижний итог" : "Основной состав"}</p>
            {index === 0 ? <span className={styles.baseline}>Точка сравнения</span> : <>
              <span className={styles.delta}>{delta == null ? "Разница в бюджете пока не определена" : delta === 0 ? "Такой же бюджет" : `${delta > 0 ? "+" : "−"}${proposalMoney(Math.abs(delta))} к «${baseline.title}»`}</span>
              <button className={base.quiet} onClick={() => setSelectedIds((current) => [variant.id, ...current.filter((id) => id !== variant.id)])}>Сравнивать с этим</button>
            </>}
            <div className={styles.actions}><button className={base.secondary} disabled={disabled} aria-label={`Посмотреть для клиента: ${variant.title}`} onClick={() => onOpen(variant.id, "preview")}>Вид для клиента</button><button className={base.quiet} disabled={disabled} aria-label={`Редактировать: ${variant.title}`} onClick={() => onOpen(variant.id, "compose")}>Редактировать</button></div>
          </th>;
        })}</tr></thead>
        <tbody role="rowgroup">{rows.map((row) => <tr key={row.key} role="row"><th scope="row" role="rowheader"><h3>{row.title}</h3>{row.different ? <span className={styles.rowState}>Состав различается</span> : <span className={styles.same}>Одинаковый состав</span>}</th>{row.cells.map((cell, index) => <td key={comparison.variants[index].id} role="cell" data-changed={row.changed[index] || undefined}>
          <div className={styles.cellLabel} aria-hidden="true">{comparison.variants[index].title}</div>
          {row.changed[index] ? <span className={styles.changed}>Отличается от точки сравнения</span> : null}
          <Composition section={cell} Photo={Photo} />
        </td>)}</tr>)}</tbody>
      </table>
      {!rows.length ? <div className={styles.empty}><h3>{onlyDifferences ? "Состав совпадает" : "Разделов ещё нет"}</h3><p>{onlyDifferences ? "Услуги, количества, клиентские цены и описания одинаковы. Можно вернуться ко всему составу." : "Добавьте разделы в режиме составления мероприятия."}</p>{onlyDifferences ? <button className={base.quiet} onClick={() => setOnlyDifferences(false)}>Показать весь состав</button> : null}</div> : null}
      <p className={styles.hint}>В итог входят только включённые услуги. Альтернативы и дополнительные опции считаются отдельно. Чтобы сохранить PDF, откройте «Вид для клиента» нужного варианта.</p>
    </>}
  </section>;
}
