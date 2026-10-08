---
name: WowStorg Analytics
description: "Локальные паттерны реализованной аналитики в общем мире WowStorg."
colors:
  wow-paper: "#f4f4f0"
  wow-surface: "#ffffff"
  wow-ink-soft: "#20201f"
  wow-muted: "#686863"
  wow-line: "#d4d4cf"
  wow-yellow: "#ffd21f"
  wow-yellow-hover: "#ffe36b"
  wow-purple: "#5e20bb"
  wow-purple-soft: "#eee7ff"
  wow-success: "#207a52"
  wow-danger: "#a12b20"
  chart-purple: "#662abb"
  chart-purple-soft: "#b295de"
  chart-revenue: "#c8c4ce"
  row-line: "#eeecef"
  chart-muted: "#66616d"
  table-ground: "#faf9f7"
  forecast-ground: "#fbf8ef"
  forecast-line: "#e5dece"
  warning-ground: "#fff5df"
  warning-ink: "#885500"
typography:
  headline:
    fontFamily: "Onest, Arial, sans-serif"
    fontSize: "32px"
    fontWeight: 750
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Onest, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Onest, Arial, sans-serif"
    fontSize: "14px"
  table:
    fontFamily: "Onest, Arial, sans-serif"
    fontSize: "13px"
  label:
    fontFamily: "Onest, Arial, sans-serif"
    fontSize: "12px"
  metric:
    fontFamily: "Onest, Arial, sans-serif"
    fontSize: "27px"
    fontWeight: 750
    letterSpacing: "-0.025em"
rounded:
  badge: "6px"
  filter: "8px"
  field: "9px"
  button: "10px"
  panel: "12px"
spacing:
  control: "8px"
  page: "10px"
  mobile-panel: "16px"
  section: "18px"
  panel-inline: "20px"
components:
  button-primary:
    backgroundColor: "{colors.wow-yellow}"
    textColor: "{colors.wow-ink-soft}"
    rounded: "{rounded.button}"
    padding: "8px 14px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.wow-yellow-hover}"
  button-secondary:
    backgroundColor: "{colors.wow-surface}"
    textColor: "{colors.wow-ink-soft}"
    rounded: "{rounded.button}"
    padding: "8px 14px"
    height: "40px"
  input:
    backgroundColor: "{colors.wow-surface}"
    textColor: "{colors.wow-ink-soft}"
    rounded: "{rounded.field}"
    padding: "8px 11px"
    height: "40px"
  tab-active:
    backgroundColor: "transparent"
    textColor: "{colors.wow-purple}"
    padding: "13px 16px"
  filter-active:
    backgroundColor: "{colors.wow-purple-soft}"
    textColor: "{colors.wow-purple}"
    rounded: "{rounded.filter}"
    padding: "7px 10px"
  panel:
    backgroundColor: "{colors.wow-surface}"
    rounded: "{rounded.panel}"
  badge:
    backgroundColor: "{colors.wow-purple-soft}"
    textColor: "{colors.wow-purple}"
    rounded: "{rounded.badge}"
    padding: "4px 8px"
---

# Design System: WowStorg Analytics

## Overview

**Creative North Star: "Спокойное рабочее пространство"**

Аналитика сохраняет светлые рабочие поверхности и общий AppShell WowStorg. Компактный обзор показывает результат и его источники; остальные вкладки дают сопоставимые строки с подробностями по запросу.

Это локальная Scan-mode фиксация фактических `analytics.module.css`, компонентов аналитики и `globals.css`. Она не заменяет корневой DESIGN.md и не вводит новые CSS-переменные. Компактные размеры таблиц, локальные цвета графиков и радиусы описывают этот рабочий контекст, а не общесайтовый стандарт.

**Key Characteristics:**

- Факт и прогноз визуально разделены.
- Сравнение сумм через табличные цифры и общую шкалу графика.
- Поиск, фильтры и подробности вместо длинных постоянных пояснений.
- Читаемые названия и локальная прокрутка таблиц на телефоне.

## Colors

Нормативные значения извлечённых ролей находятся в frontmatter; существующие глобальные custom properties остаются источником истины.

### Primary

Жёлтый `wow-yellow` обозначает экспорт или сохранение проверенного снимка; hover использует существующий светлый вариант.

### Secondary

Фиолетовый `wow-purple` обозначает выбранную вкладку, фильтр и keyboard focus. `chart-purple` и `chart-purple-soft` — фактические локальные варианты для линии прибыли и источников; они не переопределяют брендовый фиолетовый.

### Tertiary

`wow-success` и `wow-danger` различают положительный и отрицательный финансовый результат. Янтарные warning-роли сопровождаются текстом статуса. Forecast-роли выделяют отдельный расчёт ожидаемой работы.

### Neutral

Белые панели располагаются на бумажном фоне. Чернила и приглушённые подписи поддерживают иерархию; нейтральные границы разделяют панели и строки. `chart-revenue` обозначает столбцы выручки, `chart-muted` — подписи осей, `table-ground` — заголовки и раскрываемые детали таблиц.

**The Financial Context Rule.** Факт и прогноз имеют явные подписи и отдельные области; цвет не заменяет значение показателя.

## Typography

Onest с Arial и sans-serif в fallback наследуется от приложения. Заголовок страницы, заголовок панели, табличная строка, подпись и денежный KPI имеют отдельные роли в frontmatter. Заголовок уменьшается до 26px при 1250px и до 24px при 600px; KPI — до 25px при 600px. Заголовки таблиц и badges используют локальные 11px, вторичные подписи — 12px. Это наблюдаемая плотность аналитики.

Числа используют `tabular-nums`, денежные ячейки выровнены вправо и не переносятся. Длинные названия допускают перенос; entity-колонки сохраняют минимальную ширину. UI сохраняет до двух знаков денег, проценты до одного; Excel — две десятичные позиции. Суммы факта, клиента и динамики согласованы до копейки.

## Layout

Шапка объединяет заголовок, раскрываемый период, presets и действия; шесть вкладок прокручиваются горизонтально при нехватке места. Между главными блоками используется локальный ритм (18px). Панели имеют собственную высоту (`align-self: start`), поэтому короткие сигналы не растягиваются под соседей.

Desktop-график и источники стоят в колонках `minmax(0,1.8fr) minmax(280px,1fr)`; нижняя пара — равные колонки. При 900px обе пары становятся последовательными блоками, импорт — одной колонкой, прогноз — двумя. При 600px KPI складываются в один столбец; действия, tabs и filter buttons получают минимальную высоту 44px. Внутренние отступы панели уменьшаются с 20px до 16px.

При 1250px donut уменьшается, итог переносится в отдельную строку источников. Таблицы прокручиваются внутри собственного focusable region. Названия проектов, клиентов и реквизита имеют минимум 180px, сверки — 190px; это позволяет читать сущность без сжатия до нескольких букв.

## Elevation & Depth

Панели, period popup и методологические раскрытия отделены тонкими границами, без локальных декоративных теней. Popup периода использует слой `z-index: 15`, help — `10`. Белая основа и более тёплая полоса прогноза создают различие контекстов; AppShell сохраняет собственную глубину.

## Shapes

Умеренное скругление панелей и popup сочетается с компактными controls. Badge имеет меньший радиус, filter button — промежуточный, поле и обычная кнопка — собственные наблюдаемые роли. Таблицы сохраняют обычную строковую геометрию; donut является формой диаграммы, а не шаблоном карточек.

## Components

### Buttons

Primary жёлтая, secondary белая с границей, quiet прозрачная с фиолетовым текстом. Hover меняет фон; focus-visible — фиолетовый outline (2px, offset 3px). Disabled снижает opacity до .45. Декоративных переходов аналитика не добавляет.

### Inputs / Fields

Белые date/search/select поля имеют подписи и нейтральную границу. Поиск учитывает все слова запроса и возвращает первую страницу. Неверный период показывает ошибку и не запускает запрос или экспорт.

### Navigation and filters

Вкладки используют `aria-pressed`, фиолетовый текст и нижнюю линию выбора; фильтры — светлую фиолетовую заливку и границу. AppShell остаётся общим компонентом приложения.

### Cards / Containers

Panel содержит заголовок, необязательное действие и область данных. KPI объединены в одну полосу с разделителями; forecast размещён отдельно. Empty state объясняет отсутствие данных, ошибка предлагает повторить загрузку, загрузка использует существующий DashboardSkeleton.

### Tables

SmartTable показывает десять строк на страницу, поиск, сортировку, текст счётчика и явные кнопки страниц. Nullable значения остаются неизвестными, не становятся нулями. Подробности раскрываются одной строкой под выбранной сущностью; `aria-expanded` и `aria-controls` передают состояние. Статические расчёты бонусов и сравнение итогов сверки остаются компактными формулами/таблицей, без искусственной пагинации.

### Charts and disclosures

Recharts строит месячные столбцы выручки и линию прибыли на общей денежной оси; анимации отключены. Источники имеют абсолютные суммы и доли от общего итога. Donut появляется только при положительном итоге и неотрицательных источниках; в иных случаях остаются денежные строки. Методология проектов, клиентов и бонусов доступна через native details, справка реквизита — через отдельное раскрытие. Постоянного методологического подвала в обзоре нет.

## Do's and Don'ts

### Do:

- **Do** сохранять подписи факта, прогноза и расчётного бонуса рядом с суммами.
- **Do** сохранять читабельную ширину названий и прокрутку внутри таблицы.
- **Do** раскрывать дополнительные детали по запросу и показывать неизвестные значения явно.
- **Do** использовать существующие глобальные роли для controls, сохраняя фактические локальные роли графиков.

### Don't:

- **Don't** подписывать результат выбранного периода как LTV, повторные оплаты или число впервые привлечённых клиентов.
- **Don't** складывать пересекающиеся группы рисков вместо уникальных projectId.
- **Don't** превращать эти локальные размеры, цвета и композицию в обязательный стандарт других модулей.
- **Don't** заявлять строгий exact-comp pass: сохранённый fidelity gate остаётся OPEN.
