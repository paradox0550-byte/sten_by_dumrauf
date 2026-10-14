# CSS Architecture Audit — STEN

Дата: 2026-10-14  
Область: `main`, CSS-карта без удаления и изменения CSS.  
Статус: статический аудит исходников; браузерная проверка computed styles ещё не выполнена.

## 1. Порядок импорта

Проверено в `src/main.tsx`, порядок сверху вниз:

1. `src/app.css`
2. `src/executive.css`
3. `src/obsidian-precision.css`
4. `src/open-workspace.css`
5. `src/obsidian-precision-responsive-v2.css`

В том же файле импортируется `@fontsource-variable/inter`, но это не CSS-файл проекта из пяти анализируемых.

**Ограничение правила «последний импорт побеждает»:** каскад учитывает слой, специфичность, `!important`, состояние/атрибуты темы и media queries. Поэтому последний файл не является универсальным победителем для любого свойства.

### Краткая роль файлов

| Файл | Роль по статическому анализу |
|---|---|
| `app.css` | Базовые и legacy-компоненты; весь файл находится внутри `@layer legacy`. |
| `executive.css` | Семантические токены и большой набор правил Executive Cockpit. Начальный блок находится в `@layer components`; далее есть правила вне этого слоя. |
| `obsidian-precision.css` | Общее оформление Obsidian Precision, токены dark/light, поверхности, кнопки, таблицы, состояния и дополнительные overrides. Включает несколько правил с `!important`. |
| `open-workspace.css` | Только `.sten-open-loading-mark` и `.loading`. |
| `obsidian-precision-responsive-v2.css` | Дополнительная адаптивность, mobile navigation, focus-visible и размеры shell. |

`index.html` также содержит inline CSS: начальные фоны страницы и view-transition анимации. Он не входит в размер пяти CSS-файлов, но относится к общей карте стилей.

## 2. Карта токенов

### 2.1. Основные определения по файлам

Обозначения: «legacy» — переменная объявлена в `app.css` внутри `@layer legacy`; «components» — начальный слой `@layer components` в `executive.css`; «вне слоя» — обычные правила CSS.

| Токен | `app.css` | `executive.css` | `obsidian-precision.css` | Остальные |
|---|---|---|---|---|
| `--bg-base` | — | Да: light и dark; есть layered и unlayered определения | Да: dark/light, плюс локально в `.unlock` | — |
| `--bg-app` | — | Да: light/dark | Да: dark/light | — |
| `--bg-surface` | — | Да: light/dark | Да: dark/light | — |
| `--bg-elevated` | — | Да: light/dark | Да: dark/light | — |
| `--bg-inset` | — | Да: light; базовое значение также задано вне light-блока | Да: dark/light | — |
| `--text-primary` | — | Да: light/dark | Да: dark/light | — |
| `--text-secondary` | — | — | Да: dark/light | В `executive.css` есть определения |
| `--color-brand` | — | Да: light/dark | Да: dark/light | — |
| `--color-accent` | — | Да: light palette | Да: dark/light | — |
| `--color-success` | — | Да: light/dark | Да: dark/light | — |
| `--color-warning` | — | Да: light/dark | Да: dark/light | — |
| `--color-danger` | — | Да: light/dark | Да: dark/light | — |
| `--border-subtle` | — | Да: light/dark | Да: dark/light | — |
| `--border-strong` | — | Да: light/dark | Да: dark/light | — |
| `--bg`, `--surface`, `--text`, `--accent`, `--good`, `--warning`, `--danger` | Да: legacy palette, light/dark | Да: aliases для совместимости | Используются через семантические токены; не основной источник этих aliases | — |
| `--sten-layout-gap` | — | — | — | Определён в `obsidian-precision-responsive-v2.css` |
| `--ui-radius-*`, `--ui-control-h`, `--ui-page-gap`, `--font-mono`, `--ui-shadow` | — | Часть токенов компонентов | Определяются в dark scope; значения отдельных токенов могут быть переопределены локально | — |

Важно: таблица показывает наличие определений, а не означает, что каждый токен задан во всех перечисленных тематических scope. Для точного runtime-значения также важен элемент, на котором переменная вычисляется: `.unlock` задаёт локальные переменные для auth-экрана.

### 2.2. Фактический источник основных цветов темы

Значения ниже — результат статического чтения поздних правил `obsidian-precision.css` для глобального `html[data-theme]`. Это ожидаемый источник для стандартного приложения, если на конкретном элементе нет более специфичного локального override.

| Токен | Light | Dark | Основной глобальный источник |
|---|---|---|---|
| `--bg-base` | `#f6f8fc` | `#080c14` | `obsidian-precision.css` |
| `--bg-surface` | `#ffffff` | `#0f1422` | `obsidian-precision.css` |
| `--text-primary` | `#0b1220` | `#ffffff` | `obsidian-precision.css` |
| `--color-brand` | `#3b5bdb` | `#5b7cfa` | `obsidian-precision.css` |
| `--color-accent` | `#0e7490` | `#00f0ff` | `obsidian-precision.css` |
| `--color-success` | `#047857` | `#00e599` | `obsidian-precision.css` |
| `--color-warning` | `#b45309` | `#fbbf24` | `obsidian-precision.css` |
| `--color-danger` | `#b91c1c` | `#ff4d6d` | `obsidian-precision.css` |

Почему: `obsidian-precision.css` импортируется после `executive.css` и содержит соответствующие глобальные правила `html[data-theme='dark']` и `:root[data-theme='light'], html[data-theme='light']`. Их специфичность также выше, чем у одиночного `:root` или `[data-theme='dark']` в части более ранних правил. При этом `!important` на отдельных компонентных свойствах способен перекрыть ожидаемый вид поверхности, не меняя сам токен.

**Вывод о светлой теме:** её основные глобальные значения задаёт поздний light-блок в `obsidian-precision.css`; `executive.css` сохраняет собственные light/dark определения и aliases, а также может влиять на свойства, для которых нет более позднего или более специфичного override. Это не означает, что все визуальные свойства страницы контролирует только один файл.

## 3. Карта основных селекторов

«Победитель» указан для типичного пересечения обычных деклараций при совпадении элемента и условий media query. Это не универсальный победитель для каждого свойства: у селекторов различаются специфичность, а в Obsidian есть `!important`.

| Класс/группа | `app.css` | `executive.css` | `obsidian-precision.css` | `open-workspace.css` | `responsive-v2.css` | Статический вывод |
|---|---|---|---|---|---|---|
| `.sidebar` | Базовый fixed sidebar, ширина 232px, padding, border, layout — legacy layer | Навигация, active/hover, tablet/mobile правила | Background и border с `!important`; tablet width override с `!important` | — | Scrollbar, min-height links, responsive width/padding/z-index | Много слоёв; свойства разделены по ответственности, но пересекаются |
| `.topbar` | Sticky header, высота, padding, фон — legacy layer | Layout, gaps, paddings, executive header | Background/border с `!important`, общая поверхность | — | `.topbar.executive-topbar`: gap/padding через clamp, mobile positioning | Реальные пересечения; responsive-v2 позднее управляет размерами в своих media |
| `.main` | Базовая ширина/отступ shell — legacy layer | Ограничения min-width и layout executive | Background/color | — | Mobile width и min-width | Несколько правил; мобильное поведение зависит от media |
| `.content` | Max-width, margin, padding — legacy layer | Min-width и animation для содержимого executive | Max-width 1600px, padding 18px 20px 32px | — | Min-width; desktop/tablet/mobile padding overrides | Явные конкурирующие размеры/отступы |
| `.panel` | Базовая поверхность и padding — legacy layer | Surface/border/radius/shadow; executive padding | Surface/border/radius/shadow с `!important`; padding 14px 16px | — | Min-width | Стиль поверхности преимущественно Obsidian; padding имеет поздние переопределения |
| `.card` | Нет отдельного базового определения, найденного в просмотренном файле | Нет отдельного базового определения, найденного в просмотренном файле | Нет отдельного базового определения, найденного в просмотренном файле | — | Только `min-width: 0` в группе с `.panel` и `.settings-card` | Не подтверждён как самостоятельная карточная система |
| `.metric-card` | KPI grid/card, padding, font-size — legacy layer | Executive surfaces, animation и shell-specific overrides | Поверхность для `.executive-shell .metric-card` с `!important`; типографика чисел | — | — | Конфликт/перекрытие поверхности и размеров; проверять в контексте shell |
| `.flash-prime` | Hero metric: padding, border, background, число | Включён в финансовую типографику и общие status/component rules | Число и border-color; общая финансовая типографика с `!important` | — | — | Структура из legacy, вид и типографика частично переопределены |
| `.empty-state` | Padding, dashed border, layout, text — legacy layer | Семантическая поверхность и общие empty states | Background/border-color/color | — | — | Пересечение есть, legacy базовые правила в слое проигрывают обычным unlayered правилам |
| `.skeleton` | Background, animation, radius — legacy layer | Skeleton variants и light-theme background | `.skeleton, [class*='skeleton']`: shimmer; light-theme override | — | — | Три определения; широкий селектор `[class*='skeleton']` может затронуть больше классов, чем ожидается |
| `.primary-button` | Базовый button layout, accent background/hover — legacy layer | Размер/радиус и control styling | Brand background/border/color, hover; общая control radius | — | — | Обычный вид задаётся поздним Obsidian; legacy остаётся fallback/структурой |
| `.secondary-button` | Layout, surface, hover — legacy layer | Control sizing/background/border | Surface/color/hover, плюс отдельные light overrides | — | — | Пересечение трёх систем; light-specific правила повышают специфичность |
| `.icon-button` | Размер, grid, border, hover — legacy layer | Дополнительные общие control правила | Surface/border/color и light-theme correction | — | Focus rules через topbar | Поздний Obsidian контролирует цвета; layout частично наследован |
| `.badge` | Нет основного определения в просмотренном фрагменте | Полный badge layout, padding, typography | Radius для badge/status-badge/pnl-badge | — | — | Executive задаёт базовую форму, Obsidian — radius |
| `.mobile-bottom-nav` | — | Mobile nav layout и item styles | Background/border с `!important` | — | Focus/transition/padding-bottom и responsive visibility | Executive отвечает за компоновку, Obsidian за поверхность, responsive-v2 за детали |
| `.sten-floating-ai` | — | В доступных селекторах не найдено базового определения | В доступных селекторах не найдено базового определения | — | Bottom/right offsets, включая mobile | Responsive файл позиционирует компонент, но не описывает его полностью |
| `.unlock-card` | Общая карточная поверхность и auth-card styles — legacy layer | Surface и несколько layout/size правил | Surface с `!important`, flex layout, padding/radius | — | — | Высокое пересечение; login/auth styles требуют отдельной визуальной проверки |
| `.legal-footer` | В просмотренном файле нет подтверждённого основного определения | Layout, gap, typography и responsive variants | Margin/padding/border/color, flex layout и mobile overrides | — | Gap на mobile | Поздние overrides меняют часть layout; порядок блоков внутри файлов тоже важен |
| `.pnl-row` | P&L row grid, padding, borders, typography — legacy layer | Financial table rules | Hover/background и financial typography | — | — | Базовый layout legacy плюс поздние финансовые стили |
| `.pnl-kpi` | KPI grid/card базовые правила — legacy layer | Card surface и animation | Surface, padding, gradient, radius с `!important`; number typography | — | — | Реальное многослойное определение KPI |
| `.prime-card` | Hero metric grid, border/background/number | Executive-specific layout/status | Number color/typography и border-color | — | — | Базовая структура из legacy, визуальные акценты переопределены |
| `.executive-shell` | В legacy есть минимальная высота shell | Большой объём контекстных правил и component tokens | Общие surfaces для дочерних компонентов | — | `min-height: 100dvh` | Это контекстная область приложения, а не одиночный компонент |
| `.scope-bar` | Grid/sticky/filter controls | Executive context-specific overrides могут менять дочерние controls | Общие стили inputs/selects | — | — | Проверять свойства отдельно: container и controls имеют разные источники |
| `.pnl-edit-row` | Grid, min-width, input/negative rules — legacy layer | Financial table/animation rules | Borders, hover, typography, number font с `!important` | — | — | Важная зона пересечения для таблиц и мобильного скролла |
| `.brand` | Базовый brand layout в sidebar — legacy layer | Отдельные workspace/nav overrides могут влиять на окружение | Общая палитра наследуется от токенов | — | Mobile min-height | Не удалять legacy layout без проверки JSX и всех brand variants |
| `.sten-open-loading-mark` | — | — | — | Полное определение loader mark | — | Локальная ответственность `open-workspace.css` |
| `.loading` | — | — | — | `text-align: center` | — | Минимальное правило; использование нужно сверить с JSX |
| `.active` | Sidebar nav active и другие state selectors в legacy | Множество state-specific selectors | Встречается в контекстных селекторах, например scale toggle | — | Mobile nav active rules в media | Не считать мёртвым: это динамический state class |

### Селекторы из примеров, которые не подтверждены как самостоятельные правила

В просмотренных пяти файлах не обнаружены отдельные базовые определения для `.app`, `.btn`, `.btn-primary`, `.btn-ghost`, `.input`, `.modal`, `.nav`, `.nav-item` и `.p-and-l-table`. Это **не** доказательство отсутствия в JSX/динамических селекторах: часть соответствующих UI использует другие имена, например `.primary-button`, `.modal-card`, `.sidebar nav a` и `.pnl-table`. Не удалять и не переименовывать их по одному этому факту.

## 4. Архитектурные выводы

### 4.1. Какой файл главный контроллер темы?

Для глобальных ключевых токенов light/dark — **`obsidian-precision.css`**: он импортируется третьим и содержит явные тематические палитры для `html[data-theme='dark']` и light scope. Это главный источник цветов, но не единственный контроллер визуального результата: `executive.css` задаёт структуру и компонентные правила, а responsive-v2 меняет размеры/позиционирование при media queries.

### 4.2. Есть ли файл, который целиком «мёртвый»?

Нет оснований объявить какой-либо из пяти файлов полностью мёртвым. `app.css` находится в `@layer legacy`, что делает многие обычные его декларации проигрывающими unlayered rules, но он всё ещё может предоставлять свойства, которых поздние файлы не задают, а также fallback-структуру. `open-workspace.css` содержит короткие, специфические правила. `responsive-v2.css` добавляет поведение, отсутствующее в глобальной палитре.

### 4.3. Реальные зоны риска каскада

- Перекрытие surface/border/radius для `.panel`, `.metric-card`, `.pnl-kpi`, `.unlock-card`.
- Повторные определения `.sidebar`, `.topbar`, `.content` и связанные с ними media queries.
- `.skeleton` плюс широкий `[class*='skeleton']`.
- Кнопки `.primary-button` / `.secondary-button`: layout в legacy, semantic controls в executive и Obsidian, light-only overrides.
- Цвета темы определены одновременно в `executive.css` и `obsidian-precision.css`; aliases `--bg`, `--surface`, `--text`, `--accent` поддерживают legacy-компоненты.
- `!important` в Obsidian намеренно усиливает часть поверхностей, но усложняет точечное переопределение.
- Inline CSS в `index.html` участвует в начальном фоне и view transitions.

### 4.4. Можно ли считать `app.css` только наследием?

**Пока нет.** Его обёртка `@layer legacy` указывает на legacy-слой, но доказательство полной ненужности требует сопоставить все селекторы с JSX/динамическими классами, а затем проверить rendered UI. Статический поиск сам по себе не обнаруживает надёжно классы, собираемые динамически, состояния, порталы и все условные маршруты.

## 5. Стратегии дальнейшей работы — без выбора

Оценки времени ориентировочные для одного frontend-инженера, включая аудит и проверку; не являются обещанием.

| Вариант | Что делать | Риски/что может сломаться | Оценка | Что нельзя подтвердить без браузера |
|---|---|---|---|---|
| **A. Точечные исправления** | Сохранить 5 файлов; документировать владельца токенов и исправлять конкретные конфликты с регрессионными проверками | Архитектурный долг остаётся; следующий override может снова изменить тему; `!important` усложняет каскад | 0.5–2 дня на первичную стабилизацию; затем по задаче | Реальные computed styles, контраст, focus, состояния меню/модалей, мобильные переходы |
| **B. Один источник темы — Obsidian** | Постепенно перенести необходимые правила/токены, проверить зависимости, затем отключать imports только после сравнения экранов; `@deprecated` сам по себе ничего не меняет | Большой риск регрессии, если legacy selectors всё ещё нужны; `executive.css` содержит layout и компоненты, а не только палитру, поэтому просто перестать импортировать его нельзя | Около 3–6 дней при наличии браузерных регресс-тестов; больше без них | Полнота покрытия маршрутов, таблиц, auth/empty/loading states, разных ширин и обеих тем |
| **C. Полный рефакторинг** | Ввести единый `tokens.css`, разделить layout/base/components/pages, определить слои каскада и контракт токенов; мигрировать экран за экраном | Самый высокий риск визуальной регрессии и пропущенных динамических состояний; потребуется длительное сравнение | Около 1–2 недель с регресс-тестами; дольше при ручной проверке | Визуальная эквивалентность, поведение всех маршрутов/порталов и точная доступность на устройствах |

### Рекомендуемый безопасный порядок независимо от выбранной стратегии

1. Зафиксировать текущие скриншоты и computed styles для light/dark на ключевых экранах и ширинах.
2. Сопоставить классы и токены с JSX, включая динамические классы и порталы.
3. Установить владельца каждого токена и правила приоритета для слоёв.
4. Исправлять небольшими группами, каждый раз сравнивая светлую и тёмную темы.
5. Не удалять файлы/селекторы на основании одного поиска по тексту.

## 6. Границы аудита

- CSS не менялся и не удалялся.
- Это статическая карта пяти импортируемых файлов плюс просмотренного inline CSS в `index.html`.
- Не утверждается, что каждое значение проверено в browser DevTools или на всех маршрутах.
- Приведённые победители токенов описывают глобальные light/dark scopes; local scopes, `!important`, специфичные селекторы и media queries могут менять фактическое свойство конкретного элемента.


## Follow-up audit: light-theme override tracing (2026-10-14)

> Scope: static scan of `src/app.css`, `src/executive.css`, `src/obsidian-precision.css`, `src/obsidian-precision-responsive-v2.css` on `chore/css-cleanup-2026-10-14`. No CSS/JSX changes were made. CSS parser counts declaration-level `!important`; line numbers refer to declarations.


### 1. All `!important` declarations

Found **139 declarations**: src/app.css: 67; src/executive.css: 28; src/obsidian-precision.css: 42; src/obsidian-precision-responsive-v2.css: 2. These include layout, responsive, motion, typography, semantic colors and surfaces. The full inventory follows.


| File | Line | Selector | Property | Value | Context |
|---|---:|---|---|---|---|
| `src/app.css` | 2687 | `*, *::before, *::after` | `scroll-behavior` | `auto !important` | `@layer legacy > @media (prefers-reduced-motion: reduce)` |
| `src/app.css` | 2688 | `*, *::before, *::after` | `animation-duration` | `0.01ms !important` | `@layer legacy > @media (prefers-reduced-motion: reduce)` |
| `src/app.css` | 2689 | `*, *::before, *::after` | `transition-duration` | `0.01ms !important` | `@layer legacy > @media (prefers-reduced-motion: reduce)` |
| `src/app.css` | 2706 | `.approved` | `color` | `var(--good) !important` | `@layer legacy` |
| `src/app.css` | 3449 | `.analytics-report-head` | `font-size` | `9px !important` | `@layer legacy` |
| `src/app.css` | 3466 | `.analytics-report-total` | `border-bottom` | `0 !important` | `@layer legacy` |
| `src/app.css` | 3914 | `.analytics-kpi-strip` | `display` | `grid !important` | `@layer legacy` |
| `src/app.css` | 3915 | `.analytics-kpi-strip` | `grid-template-columns` | `repeat(auto-fit, minmax(170px, 1fr)) !important` | `@layer legacy` |
| `src/app.css` | 3916 | `.analytics-kpi-strip` | `gap` | `10px !important` | `@layer legacy` |
| `src/app.css` | 3917 | `.analytics-kpi-strip` | `border-bottom` | `0 !important` | `@layer legacy` |
| `src/app.css` | 3918 | `.analytics-kpi-strip` | `margin-bottom` | `16px !important` | `@layer legacy` |
| `src/app.css` | 3953 | `.analytics-summary` | `grid-template-columns` | `minmax(0, 1fr) 240px !important` | `@layer legacy` |
| `src/app.css` | 3954 | `.analytics-summary` | `gap` | `20px !important` | `@layer legacy` |
| `src/app.css` | 3955 | `.analytics-summary` | `padding` | `16px 0 18px !important` | `@layer legacy` |
| `src/app.css` | 3956 | `.analytics-summary` | `margin-bottom` | `4px !important` | `@layer legacy` |
| `src/app.css` | 3959 | `.analytics-summary p` | `font-size` | `14px !important` | `@layer legacy` |
| `src/app.css` | 3960 | `.analytics-summary p` | `line-height` | `1.5 !important` | `@layer legacy` |
| `src/app.css` | 3961 | `.analytics-summary p` | `margin-top` | `6px !important` | `@layer legacy` |
| `src/app.css` | 3964 | `.analytics-summary-delta strong` | `font-size` | `22px !important` | `@layer legacy` |
| `src/app.css` | 3969 | `.pnl-kpis` | `grid-template-columns` | `repeat(auto-fit, minmax(240px, 1fr)) !important` | `@layer legacy` |
| `src/app.css` | 3972 | `.pnl-kpi > div` | `gap` | `14px !important` | `@layer legacy` |
| `src/app.css` | 3976 | `.pnl-kpi b` | `font-size` | `15px !important` | `@layer legacy` |
| `src/app.css` | 3987 | `.pnl-prime-control` | `background` | `transparent !important` | `@layer legacy` |
| `src/app.css` | 3988 | `.pnl-prime-control` | `border-top` | `1px solid var(--line) !important` | `@layer legacy` |
| `src/app.css` | 3989 | `.pnl-prime-control` | `border-bottom` | `1px solid var(--line) !important` | `@layer legacy` |
| `src/app.css` | 3990 | `.pnl-prime-control` | `padding` | `14px 0 !important` | `@layer legacy` |
| `src/app.css` | 3993 | `.pnl-prime-control strong` | `font-size` | `28px !important` | `@layer legacy` |
| `src/app.css` | 3998 | `.analytics-kpi-strip` | `grid-template-columns` | `1fr 1fr !important` | `@layer legacy > @media (max-width: 700px)` |
| `src/app.css` | 4001 | `.analytics-kpi-strip > article strong` | `font-size` | `16px !important` | `@layer legacy > @media (max-width: 700px)` |
| `src/app.css` | 4004 | `.analytics-summary` | `grid-template-columns` | `1fr !important` | `@layer legacy > @media (max-width: 700px)` |
| `src/app.css` | 4056 | `.analytics-kpi-strip` | `gap` | `12px !important` | `@layer legacy` |
| `src/app.css` | 4057 | `.analytics-kpi-strip` | `margin` | `16px 0 20px !important` | `@layer legacy` |
| `src/app.css` | 4060 | `.analytics-kpi-strip > article` | `padding` | `16px 18px !important` | `@layer legacy` |
| `src/app.css` | 4061 | `.analytics-kpi-strip > article` | `gap` | `8px !important` | `@layer legacy` |
| `src/app.css` | 4062 | `.analytics-kpi-strip > article` | `border-radius` | `12px !important` | `@layer legacy` |
| `src/app.css` | 4080 | `.pnl-kpis` | `gap` | `12px !important` | `@layer legacy` |
| `src/app.css` | 4081 | `.pnl-kpis` | `margin-bottom` | `16px !important` | `@layer legacy` |
| `src/app.css` | 4084 | `.pnl-kpi` | `padding` | `16px 18px !important` | `@layer legacy` |
| `src/app.css` | 4085 | `.pnl-kpi` | `border-radius` | `12px !important` | `@layer legacy` |
| `src/app.css` | 4088 | `.pnl-kpi > div` | `margin-top` | `12px !important` | `@layer legacy` |
| `src/app.css` | 4089 | `.pnl-kpi > div` | `gap` | `14px !important` | `@layer legacy` |
| `src/app.css` | 4092 | `.pnl-kpi em` | `margin-top` | `12px !important` | `@layer legacy` |
| `src/app.css` | 4101 | `.panel` | `padding` | `20px 22px !important` | `@layer legacy` |
| `src/app.css` | 4102 | `.panel` | `border-radius` | `14px !important` | `@layer legacy` |
| `src/app.css` | 4112 | `.dashboard-columns` | `gap` | `12px !important` | `@layer legacy` |
| `src/app.css` | 4125 | `.pnl-prime-control` | `background` | `transparent !important` | `@layer legacy` |
| `src/app.css` | 4126 | `.pnl-prime-control` | `border-top` | `1px solid var(--line) !important` | `@layer legacy` |
| `src/app.css` | 4127 | `.pnl-prime-control` | `border-bottom` | `1px solid var(--line) !important` | `@layer legacy` |
| `src/app.css` | 4128 | `.pnl-prime-control` | `border-left` | `3px solid currentColor !important` | `@layer legacy` |
| `src/app.css` | 4129 | `.pnl-prime-control` | `border-radius` | `0 12px 12px 0 !important` | `@layer legacy` |
| `src/app.css` | 4130 | `.pnl-prime-control` | `padding` | `16px 20px !important` | `@layer legacy` |
| `src/app.css` | 4137 | `.pnl-prime-control strong` | `font-weight` | `700 !important` | `@layer legacy` |
| `src/app.css` | 4141 | `.flash-prime` | `background` | `transparent !important` | `@layer legacy` |
| `src/app.css` | 4142 | `.flash-prime` | `border` | `1px solid var(--line) !important` | `@layer legacy` |
| `src/app.css` | 4143 | `.flash-prime` | `border-left` | `3px solid var(--accent) !important` | `@layer legacy` |
| `src/app.css` | 4144 | `.flash-prime` | `border-radius` | `0 12px 12px 0 !important` | `@layer legacy` |
| `src/app.css` | 4145 | `.flash-prime` | `padding` | `18px 22px !important` | `@layer legacy` |
| `src/app.css` | 4151 | `.analytics-report-table strong.positive, .pnl-edit-row strong.positive` | `color` | `var(--good) !important` | `@layer legacy` |
| `src/app.css` | 4155 | `.analytics-report-table strong.negative, .pnl-edit-row strong.negative` | `color` | `var(--danger) !important` | `@layer legacy` |
| `src/app.css` | 4160 | `.import-result, .pnl-message` | `border-radius` | `10px !important` | `@layer legacy` |
| `src/app.css` | 4161 | `.import-result, .pnl-message` | `padding` | `12px 14px !important` | `@layer legacy` |
| `src/app.css` | 4165 | `.pnl-message.ok` | `border-color` | `color-mix(in srgb, var(--good) 40%, var(--line)) !important` | `@layer legacy` |
| `src/app.css` | 4166 | `.pnl-message.ok` | `background` | `color-mix(in srgb, var(--good) 6%, var(--surface)) !important` | `@layer legacy` |
| `src/app.css` | 4169 | `.pnl-message.warn` | `border-color` | `color-mix(in srgb, var(--danger) 40%, var(--line)) !important` | `@layer legacy` |
| `src/app.css` | 4170 | `.pnl-message.warn` | `background` | `color-mix(in srgb, var(--danger) 6%, var(--surface)) !important` | `@layer legacy` |
| `src/app.css` | 4196 | `.metric-card:hover, .budget-kpi:hover, .upload-box:hover, .icon-button:hover, .primary-button:hover:not(:disabled), .secondary-button:hover:not(:disabled), .starter-grid button:hover, .workspace-btn:hover, .choice:hover, .composer-box:hover, .unlock-card input:hover, .metric-card:hover, .panel:hover` | `transform` | `none !important` | `@layer legacy > @media (hover: none)` |
| `src/app.css` | 4197 | `.metric-card:hover, .budget-kpi:hover, .upload-box:hover, .icon-button:hover, .primary-button:hover:not(:disabled), .secondary-button:hover:not(:disabled), .starter-grid button:hover, .workspace-btn:hover, .choice:hover, .composer-box:hover, .unlock-card input:hover, .metric-card:hover, .panel:hover` | `box-shadow` | `none !important` | `@layer legacy > @media (hover: none)` |
| `src/executive.css` | 353 | `.mobile-menu, .mobile-close, .backdrop, .mobile-bottom-nav` | `display` | `none !important` | `@layer components > @media (min-width: 768px)` |
| `src/executive.css` | 427 | `.pnl-edit-row > strong.positive, .budget-grid-row .num.positive` | `color` | `var(--color-success) !important` | `@layer components` |
| `src/executive.css` | 432 | `.pnl-edit-row > strong.negative, .budget-grid-row .num.negative` | `color` | `var(--color-danger) !important` | `@layer components` |
| `src/executive.css` | 580 | `.panel` | `padding` | `14px !important` | `@layer components > @media (max-width: 767px)` |
| `src/executive.css` | 581 | `.panel` | `border-radius` | `10px !important` | `@layer components > @media (max-width: 767px)` |
| `src/executive.css` | 607 | `.pnl-kpis` | `gap` | `8px !important` | `@layer components > @media (max-width: 767px)` |
| `src/executive.css` | 626 | `.mobile-bottom-nav` | `display` | `grid !important` | `@layer components > @media (max-width: 767px)` |
| `src/executive.css` | 898 | `.positive, .metric-positive` | `color` | `var(--color-success) !important` | `@layer components` |
| `src/executive.css` | 903 | `.negative, .metric-negative` | `color` | `var(--color-danger) !important` | `@layer components` |
| `src/executive.css` | 908 | `.warning, .metric-warning` | `color` | `var(--color-warning) !important` | `@layer components` |
| `src/executive.css` | 1235 | `.sidebar` | `transition` | `none !important` | `@layer components > @media (prefers-reduced-motion: reduce)` |
| `src/executive.css` | 1251 | `.ai-grid.docs-collapsed` | `grid-template-columns` | `44px 1fr !important` | `@layer components` |
| `src/executive.css` | 1257 | `.ai-grid.docs-collapsed .docs-panel` | `padding` | `8px 0 !important` | `@layer components` |
| `src/executive.css` | 1265 | `.ai-grid.docs-collapsed .docs-panel > *:not(.panel-title)` | `display` | `none !important` | `@layer components` |
| `src/executive.css` | 1269 | `.ai-grid.docs-collapsed .docs-panel .panel-title` | `padding` | `8px 0 !important` | `@layer components` |
| `src/executive.css` | 1270 | `.ai-grid.docs-collapsed .docs-panel .panel-title` | `justify-content` | `center !important` | `@layer components` |
| `src/executive.css` | 1272 | `.ai-grid.docs-collapsed .docs-panel .panel-title` | `border-bottom` | `none !important` | `@layer components` |
| `src/executive.css` | 1277 | `.ai-grid.docs-collapsed .docs-panel .panel-title > *:not(.docs-toggle)` | `display` | `none !important` | `@layer components` |
| `src/executive.css` | 1281 | `.ai-grid.docs-collapsed .docs-panel .docs-toggle` | `margin` | `0 auto !important` | `@layer components` |
| `src/executive.css` | 1286 | `.ai-grid.docs-collapsed` | `grid-template-columns` | `1fr !important` | `@layer components > @media (max-width: 900px)` |
| `src/executive.css` | 1287 | `.ai-grid.docs-collapsed .docs-panel` | `display` | `none !important` | `@layer components > @media (max-width: 900px)` |
| `src/executive.css` | 2084 | `.executive-shell *, .executive-shell *::before, .executive-shell *::after` | `animation-duration` | `0.01ms !important` | `@layer components > @media (prefers-reduced-motion: reduce)` |
| `src/executive.css` | 2085 | `.executive-shell *, .executive-shell *::before, .executive-shell *::after` | `animation-iteration-count` | `1 !important` | `@layer components > @media (prefers-reduced-motion: reduce)` |
| `src/executive.css` | 2086 | `.executive-shell *, .executive-shell *::before, .executive-shell *::after` | `transition-duration` | `0.01ms !important` | `@layer components > @media (prefers-reduced-motion: reduce)` |
| `src/executive.css` | 2864 | `html[data-reduce-motion='true'] *, html[data-reduce-motion='true'] *::before, html[data-reduce-motion='true'] *::after` | `animation-duration` | `0.01ms !important` | `top-level` |
| `src/executive.css` | 2865 | `html[data-reduce-motion='true'] *, html[data-reduce-motion='true'] *::before, html[data-reduce-motion='true'] *::after` | `animation-iteration-count` | `1 !important` | `top-level` |
| `src/executive.css` | 2866 | `html[data-reduce-motion='true'] *, html[data-reduce-motion='true'] *::before, html[data-reduce-motion='true'] *::after` | `scroll-behavior` | `auto !important` | `top-level` |
| `src/executive.css` | 2867 | `html[data-reduce-motion='true'] *, html[data-reduce-motion='true'] *::before, html[data-reduce-motion='true'] *::after` | `transition-duration` | `0.01ms !important` | `top-level` |
| `src/obsidian-precision.css` | 51 | `*, *::before, *::after` | `scroll-behavior` | `auto !important` | `@media (prefers-reduced-motion: reduce)` |
| `src/obsidian-precision.css` | 51 | `*, *::before, *::after` | `animation-duration` | `.01ms !important` | `@media (prefers-reduced-motion: reduce)` |
| `src/obsidian-precision.css` | 51 | `*, *::before, *::after` | `animation-iteration-count` | `1 !important` | `@media (prefers-reduced-motion: reduce)` |
| `src/obsidian-precision.css` | 51 | `*, *::before, *::after` | `transition-duration` | `.01ms !important` | `@media (prefers-reduced-motion: reduce)` |
| `src/obsidian-precision.css` | 53 | `html[data-reduce-motion='true'] *, html[data-reduce-motion='true'] *::before, html[data-reduce-motion='true'] *::after` | `animation` | `none !important` | `top-level` |
| `src/obsidian-precision.css` | 53 | `html[data-reduce-motion='true'] *, html[data-reduce-motion='true'] *::before, html[data-reduce-motion='true'] *::after` | `transition` | `none !important` | `top-level` |
| `src/obsidian-precision.css` | 58 | `.sidebar, .topbar, .mobile-bottom-nav` | `background` | `var(--bg-surface) !important` | `top-level` |
| `src/obsidian-precision.css` | 58 | `.sidebar, .topbar, .mobile-bottom-nav` | `border-color` | `var(--border-subtle) !important` | `top-level` |
| `src/obsidian-precision.css` | 65 | `.panel, .executive-shell .metric-card, .pnl-kpi, .budget-kpi, .chat, .docs-panel, .modal-card, .unlock-card, .analytics-gap-section` | `background` | `var(--bg-surface) !important` | `top-level` |
| `src/obsidian-precision.css` | 66 | `.panel, .executive-shell .metric-card, .pnl-kpi, .budget-kpi, .chat, .docs-panel, .modal-card, .unlock-card, .analytics-gap-section` | `border` | `1px solid var(--border-subtle) !important` | `top-level` |
| `src/obsidian-precision.css` | 67 | `.panel, .executive-shell .metric-card, .pnl-kpi, .budget-kpi, .chat, .docs-panel, .modal-card, .unlock-card, .analytics-gap-section` | `border-radius` | `var(--ui-radius-lg) !important` | `top-level` |
| `src/obsidian-precision.css` | 68 | `.panel, .executive-shell .metric-card, .pnl-kpi, .budget-kpi, .chat, .docs-panel, .modal-card, .unlock-card, .analytics-gap-section` | `box-shadow` | `none !important` | `top-level` |
| `src/obsidian-precision.css` | 88 | `.numeric, .metric-card strong, .pnl-row strong, .budget-grid .num, .prime-card strong, .flash-prime strong, .pnl-edit-row > strong, .pnl-edit-row > span, .flash-income-preview__value, .pnl-kpi strong, .budget-kpi strong` | `font-family` | `var(--font-mono) !important` | `top-level` |
| `src/obsidian-precision.css` | 96 | `.positive, .is-positive, .status-success` | `color` | `var(--color-success) !important` | `top-level` |
| `src/obsidian-precision.css` | 97 | `.negative, .is-negative, .status-danger` | `color` | `var(--color-danger) !important` | `top-level` |
| `src/obsidian-precision.css` | 98 | `.status-warning` | `color` | `var(--color-warning) !important` | `top-level` |
| `src/obsidian-precision.css` | 128 | `.sidebar` | `width` | `64px !important` | `@media (min-width: 768px) and (max-width: 1100px)` |
| `src/obsidian-precision.css` | 129 | `.main` | `margin-left` | `64px !important` | `@media (min-width: 768px) and (max-width: 1100px)` |
| `src/obsidian-precision.css` | 129 | `.main` | `width` | `calc(100% - 64px) !important` | `@media (min-width: 768px) and (max-width: 1100px)` |
| `src/obsidian-precision.css` | 161 | `.pnl-kpi` | `background` | `linear-gradient(145deg, rgba(91,124,250,.08), transparent 70%), var(--bg-surface) !important` | `top-level` |
| `src/obsidian-precision.css` | 162 | `.pnl-kpi` | `border-radius` | `var(--ui-radius-lg) !important` | `top-level` |
| `src/obsidian-precision.css` | 215 | `.chat` | `border-radius` | `var(--ui-radius-lg) !important` | `top-level` |
| `src/obsidian-precision.css` | 226 | `.docs-panel` | `border-radius` | `var(--ui-radius-lg) !important` | `top-level` |
| `src/obsidian-precision.css` | 262 | `.metric-card` | `border-radius` | `var(--ui-radius-lg) !important` | `top-level` |
| `src/obsidian-precision.css` | 268 | `.flash-prime, .prime-card` | `border` | `1px solid rgba(0,240,255,.2) !important` | `top-level` |
| `src/obsidian-precision.css` | 269 | `.flash-prime, .prime-card` | `background` | `linear-gradient(120deg, rgba(0,240,255,.055), transparent 70%), var(--bg-surface) !important` | `top-level` |
| `src/obsidian-precision.css` | 281 | `.analytics-gap-section` | `border-radius` | `var(--ui-radius-lg) !important` | `top-level` |
| `src/obsidian-precision.css` | 339 | `.sten-critical-deviation` | `color` | `#ff8097 !important` | `top-level` |
| `src/obsidian-precision.css` | 342 | `.flash-prime.critical` | `border-color` | `rgba(255,77,109,.42) !important` | `top-level` |
| `src/obsidian-precision.css` | 342 | `.flash-prime.critical` | `background` | `linear-gradient(120deg, rgba(255,77,109,.09), transparent 70%), var(--bg-surface) !important` | `top-level` |
| `src/obsidian-precision.css` | 343 | `.flash-prime.attention` | `border-color` | `rgba(251,191,36,.35) !important` | `top-level` |
| `src/obsidian-precision.css` | 343 | `.flash-prime.attention` | `background` | `linear-gradient(120deg, rgba(251,191,36,.07), transparent 70%), var(--bg-surface) !important` | `top-level` |
| `src/obsidian-precision.css` | 344 | `.flash-prime.normal` | `border-color` | `rgba(0,229,153,.28) !important` | `top-level` |
| `src/obsidian-precision.css` | 352 | `.sten-ai-page .chat` | `border-color` | `var(--border-subtle) !important` | `top-level` |
| `src/obsidian-precision.css` | 363 | `.sten-ai-page .docs-panel` | `background` | `var(--bg-surface) !important` | `top-level` |
| `src/obsidian-precision.css` | 509 | `.unlock-card` | `background` | `rgba(15,20,34,.96) !important` | `top-level` |
| `src/obsidian-precision.css` | 510 | `.unlock-card` | `border` | `1px solid var(--border-strong) !important` | `top-level` |
| `src/obsidian-precision.css` | 511 | `.unlock-card` | `border-radius` | `16px !important` | `top-level` |
| `src/obsidian-precision.css` | 512 | `.unlock-card` | `box-shadow` | `0 24px 72px rgba(0,0,0,.24) !important` | `top-level` |
| `src/obsidian-precision.css` | 524 | `.auth-brand .sten-logo` | `--sten-ink` | `#e6ecff !important` | `top-level` |
| `src/obsidian-precision.css` | 525 | `.auth-brand .sten-logo` | `--sten-muted` | `#8b9bbf !important` | `top-level` |
| `src/obsidian-precision.css` | 661 | `.unlock-card` | `border-radius` | `14px !important` | `@media (max-width: 480px)` |
| `src/obsidian-precision-responsive-v2.css` | 47 | `.mobile-bottom-nav, .mobile-menu, .mobile-close, .backdrop` | `display` | `none !important` | `@media (min-width: 1024px)` |
| `src/obsidian-precision-responsive-v2.css` | 88 | `.sidebar-toggle, .top-nav` | `display` | `none !important` | `@media (max-width: 640px)` |

**Potentially theme-sensitive `!important`:**

- `src/app.css:2706` `.approved` — `color: var(--good) !important` (контекст: @layer legacy)
- `src/app.css:3466` `.analytics-report-total` — `border-bottom: 0 !important` (контекст: @layer legacy)
- `src/app.css:3917` `.analytics-kpi-strip` — `border-bottom: 0 !important` (контекст: @layer legacy)
- `src/app.css:3987` `.pnl-prime-control` — `background: transparent !important` (контекст: @layer legacy)
- `src/app.css:3988` `.pnl-prime-control` — `border-top: 1px solid var(--line) !important` (контекст: @layer legacy)
- `src/app.css:3989` `.pnl-prime-control` — `border-bottom: 1px solid var(--line) !important` (контекст: @layer legacy)
- `src/app.css:4062` `.analytics-kpi-strip > article` — `border-radius: 12px !important` (контекст: @layer legacy)
- `src/app.css:4085` `.pnl-kpi` — `border-radius: 12px !important` (контекст: @layer legacy)
- `src/app.css:4102` `.panel` — `border-radius: 14px !important` (контекст: @layer legacy)
- `src/app.css:4125` `.pnl-prime-control` — `background: transparent !important` (контекст: @layer legacy)
- `src/app.css:4126` `.pnl-prime-control` — `border-top: 1px solid var(--line) !important` (контекст: @layer legacy)
- `src/app.css:4127` `.pnl-prime-control` — `border-bottom: 1px solid var(--line) !important` (контекст: @layer legacy)
- `src/app.css:4128` `.pnl-prime-control` — `border-left: 3px solid currentColor !important` (контекст: @layer legacy)
- `src/app.css:4129` `.pnl-prime-control` — `border-radius: 0 12px 12px 0 !important` (контекст: @layer legacy)
- `src/app.css:4141` `.flash-prime` — `background: transparent !important` (контекст: @layer legacy)
- `src/app.css:4142` `.flash-prime` — `border: 1px solid var(--line) !important` (контекст: @layer legacy)
- `src/app.css:4143` `.flash-prime` — `border-left: 3px solid var(--accent) !important` (контекст: @layer legacy)
- `src/app.css:4144` `.flash-prime` — `border-radius: 0 12px 12px 0 !important` (контекст: @layer legacy)
- `src/app.css:4151` `.analytics-report-table strong.positive, .pnl-edit-row strong.positive` — `color: var(--good) !important` (контекст: @layer legacy)
- `src/app.css:4155` `.analytics-report-table strong.negative, .pnl-edit-row strong.negative` — `color: var(--danger) !important` (контекст: @layer legacy)
- `src/app.css:4160` `.import-result, .pnl-message` — `border-radius: 10px !important` (контекст: @layer legacy)
- `src/app.css:4165` `.pnl-message.ok` — `border-color: color-mix(in srgb, var(--good) 40%, var(--line)) !important` (контекст: @layer legacy)
- `src/app.css:4166` `.pnl-message.ok` — `background: color-mix(in srgb, var(--good) 6%, var(--surface)) !important` (контекст: @layer legacy)
- `src/app.css:4169` `.pnl-message.warn` — `border-color: color-mix(in srgb, var(--danger) 40%, var(--line)) !important` (контекст: @layer legacy)
- `src/app.css:4170` `.pnl-message.warn` — `background: color-mix(in srgb, var(--danger) 6%, var(--surface)) !important` (контекст: @layer legacy)
- `src/app.css:4197` `.metric-card:hover, .budget-kpi:hover, .upload-box:hover, .icon-button:hover, .primary-button:hover:not(:disabled), .secondary-button:hover:not(:disabled), .starter-grid button:hover, .workspace-btn:hover, .choice:hover, .composer-box:hover, .unlock-card input:hover, .metric-card:hover, .panel:hover` — `box-shadow: none !important` (контекст: @layer legacy > @media (hover: none))
- `src/executive.css:427` `.pnl-edit-row > strong.positive, .budget-grid-row .num.positive` — `color: var(--color-success) !important` (контекст: @layer components)
- `src/executive.css:432` `.pnl-edit-row > strong.negative, .budget-grid-row .num.negative` — `color: var(--color-danger) !important` (контекст: @layer components)
- `src/executive.css:581` `.panel` — `border-radius: 10px !important` (контекст: @layer components > @media (max-width: 767px))
- `src/executive.css:898` `.positive, .metric-positive` — `color: var(--color-success) !important` (контекст: @layer components)
- `src/executive.css:903` `.negative, .metric-negative` — `color: var(--color-danger) !important` (контекст: @layer components)
- `src/executive.css:908` `.warning, .metric-warning` — `color: var(--color-warning) !important` (контекст: @layer components)
- `src/executive.css:1272` `.ai-grid.docs-collapsed .docs-panel .panel-title` — `border-bottom: none !important` (контекст: @layer components)
- `src/obsidian-precision.css:58` `.sidebar, .topbar, .mobile-bottom-nav` — `background: var(--bg-surface) !important`
- `src/obsidian-precision.css:58` `.sidebar, .topbar, .mobile-bottom-nav` — `border-color: var(--border-subtle) !important`
- `src/obsidian-precision.css:65` `.panel, .executive-shell .metric-card, .pnl-kpi, .budget-kpi, .chat, .docs-panel, .modal-card, .unlock-card, .analytics-gap-section` — `background: var(--bg-surface) !important`
- `src/obsidian-precision.css:66` `.panel, .executive-shell .metric-card, .pnl-kpi, .budget-kpi, .chat, .docs-panel, .modal-card, .unlock-card, .analytics-gap-section` — `border: 1px solid var(--border-subtle) !important`
- `src/obsidian-precision.css:67` `.panel, .executive-shell .metric-card, .pnl-kpi, .budget-kpi, .chat, .docs-panel, .modal-card, .unlock-card, .analytics-gap-section` — `border-radius: var(--ui-radius-lg) !important`
- `src/obsidian-precision.css:68` `.panel, .executive-shell .metric-card, .pnl-kpi, .budget-kpi, .chat, .docs-panel, .modal-card, .unlock-card, .analytics-gap-section` — `box-shadow: none !important`
- `src/obsidian-precision.css:96` `.positive, .is-positive, .status-success` — `color: var(--color-success) !important`
- `src/obsidian-precision.css:97` `.negative, .is-negative, .status-danger` — `color: var(--color-danger) !important`
- `src/obsidian-precision.css:98` `.status-warning` — `color: var(--color-warning) !important`
- `src/obsidian-precision.css:161` `.pnl-kpi` — `background: linear-gradient(145deg, rgba(91,124,250,.08), transparent 70%), var(--bg-surface) !important`
- `src/obsidian-precision.css:162` `.pnl-kpi` — `border-radius: var(--ui-radius-lg) !important`
- `src/obsidian-precision.css:215` `.chat` — `border-radius: var(--ui-radius-lg) !important`
- `src/obsidian-precision.css:226` `.docs-panel` — `border-radius: var(--ui-radius-lg) !important`
- `src/obsidian-precision.css:262` `.metric-card` — `border-radius: var(--ui-radius-lg) !important`
- `src/obsidian-precision.css:268` `.flash-prime, .prime-card` — `border: 1px solid rgba(0,240,255,.2) !important`
- `src/obsidian-precision.css:269` `.flash-prime, .prime-card` — `background: linear-gradient(120deg, rgba(0,240,255,.055), transparent 70%), var(--bg-surface) !important`
- `src/obsidian-precision.css:281` `.analytics-gap-section` — `border-radius: var(--ui-radius-lg) !important`
- `src/obsidian-precision.css:339` `.sten-critical-deviation` — `color: #ff8097 !important`
- `src/obsidian-precision.css:342` `.flash-prime.critical` — `border-color: rgba(255,77,109,.42) !important`
- `src/obsidian-precision.css:342` `.flash-prime.critical` — `background: linear-gradient(120deg, rgba(255,77,109,.09), transparent 70%), var(--bg-surface) !important`
- `src/obsidian-precision.css:343` `.flash-prime.attention` — `border-color: rgba(251,191,36,.35) !important`
- `src/obsidian-precision.css:343` `.flash-prime.attention` — `background: linear-gradient(120deg, rgba(251,191,36,.07), transparent 70%), var(--bg-surface) !important`
- `src/obsidian-precision.css:344` `.flash-prime.normal` — `border-color: rgba(0,229,153,.28) !important`
- `src/obsidian-precision.css:352` `.sten-ai-page .chat` — `border-color: var(--border-subtle) !important`
- `src/obsidian-precision.css:363` `.sten-ai-page .docs-panel` — `background: var(--bg-surface) !important`
- `src/obsidian-precision.css:509` `.unlock-card` — `background: rgba(15,20,34,.96) !important`
- `src/obsidian-precision.css:510` `.unlock-card` — `border: 1px solid var(--border-strong) !important`
- `src/obsidian-precision.css:511` `.unlock-card` — `border-radius: 16px !important`
- `src/obsidian-precision.css:512` `.unlock-card` — `box-shadow: 0 24px 72px rgba(0,0,0,.24) !important`
- `src/obsidian-precision.css:524` `.auth-brand .sten-logo` — `--sten-ink: #e6ecff !important`
- `src/obsidian-precision.css:525` `.auth-brand .sten-logo` — `--sten-muted: #8b9bbf !important`
- `src/obsidian-precision.css:661` `.unlock-card` — `border-radius: 14px !important` (контекст: @media (max-width: 480px))

**Pairs / interpretation:**
- `executive.css` positive/negative/warning rules (`.positive`, `.negative`, `.warning`, `.pnl-edit-row > strong.*`) use `var(--color-success|danger|warning) !important`; they lock in semantic token usage, not a dark color by themselves. Compare with `obsidian-precision.css` semantic rules at lines 96–98, also `!important`; both resolve from the active token cascade.
- `obsidian-precision.css` lines 58 and 65–68 force surfaces/borders/radius/shadow using tokens. `background: var(--bg-surface) !important` is not inherently a dark override; however a stale/overridden `--bg-surface` value will be amplified across these components.
- **High-risk direct hardcode:** `.unlock-card` has `background: rgba(15,20,34,.96) !important` (obsidian-precision.css, see exact line in inventory below); it remains near-black in light mode. `.auth-brand .sten-logo` force-overrides logo inks to pale values and is also theme-sensitive.
- Responsive `!important` declarations for grid, padding, motion and display are not, by themselves, evidence of a color-theme bug.


### 2. Duplicate token definitions

| Token | File:line | Selector / context | Value |
|---|---|---|---|
| `--bg-surface` | `src/executive.css:56` | `:root` / @layer components | `var(--c-gray-50)` |
| `--text-primary` | `src/executive.css:60` | `:root` / @layer components | `var(--c-gray-950)` |
| `--text-secondary` | `src/executive.css:61` | `:root` / @layer components | `var(--c-gray-850)` |
| `--text-muted` | `src/executive.css:62` | `:root` / @layer components | `var(--c-gray-600)` |
| `--color-brand` | `src/executive.css:63` | `:root` / @layer components | `var(--c-blue-500)` |
| `--color-danger` | `src/executive.css:65` | `:root` / @layer components | `var(--c-red-500)` |
| `--color-warning` | `src/executive.css:67` | `:root` / @layer components | `var(--c-amber-500)` |
| `--color-success` | `src/executive.css:69` | `:root` / @layer components | `var(--c-green-600)` |
| `--bg-surface` | `src/executive.css:91` | `[data-theme='dark']` / @layer components | `var(--c-gray-925)` |
| `--text-primary` | `src/executive.css:95` | `[data-theme='dark']` / @layer components | `var(--c-gray-150)` |
| `--text-secondary` | `src/executive.css:96` | `[data-theme='dark']` / @layer components | `var(--c-gray-250)` |
| `--text-muted` | `src/executive.css:97` | `[data-theme='dark']` / @layer components | `var(--c-gray-500)` |
| `--color-brand` | `src/executive.css:98` | `[data-theme='dark']` / @layer components | `var(--c-blue-500)` |
| `--color-danger` | `src/executive.css:100` | `[data-theme='dark']` / @layer components | `var(--c-red-400)` |
| `--color-warning` | `src/executive.css:102` | `[data-theme='dark']` / @layer components | `var(--c-amber-400)` |
| `--color-success` | `src/executive.css:104` | `[data-theme='dark']` / @layer components | `var(--c-green-500)` |
| `--bg-base` | `src/executive.css:144` | `:root[data-theme='light'], [data-theme='light']` / @layer components | `#f6f8fc` |
| `--bg-surface` | `src/executive.css:146` | `:root[data-theme='light'], [data-theme='light']` / @layer components | `#ffffff` |
| `--bg-elevated` | `src/executive.css:148` | `:root[data-theme='light'], [data-theme='light']` / @layer components | `#edf1f8` |
| `--text-primary` | `src/executive.css:156` | `:root[data-theme='light'], [data-theme='light']` / @layer components | `#0b1220` |
| `--text-secondary` | `src/executive.css:157` | `:root[data-theme='light'], [data-theme='light']` / @layer components | `#33415c` |
| `--text-muted` | `src/executive.css:158` | `:root[data-theme='light'], [data-theme='light']` / @layer components | `#64748b` |
| `--color-brand` | `src/executive.css:163` | `:root[data-theme='light'], [data-theme='light']` / @layer components | `#3b5bdb` |
| `--color-accent` | `src/executive.css:166` | `:root[data-theme='light'], [data-theme='light']` / @layer components | `#0e7490` |
| `--color-success` | `src/executive.css:167` | `:root[data-theme='light'], [data-theme='light']` / @layer components | `#047857` |
| `--color-warning` | `src/executive.css:168` | `:root[data-theme='light'], [data-theme='light']` / @layer components | `#b45309` |
| `--color-danger` | `src/executive.css:169` | `:root[data-theme='light'], [data-theme='light']` / @layer components | `#b91c1c` |
| `--bg-base` | `src/executive.css:2876` | `:root` | `#f7f8fb` |
| `--bg-surface` | `src/executive.css:2877` | `:root` | `#ffffff` |
| `--bg-elevated` | `src/executive.css:2878` | `:root` | `#f1f3f7` |
| `--text-primary` | `src/executive.css:2880` | `:root` | `#0b0d10` |
| `--text-secondary` | `src/executive.css:2881` | `:root` | `#2f3844` |
| `--color-brand` | `src/executive.css:2883` | `:root` | `#5b7cfa` |
| `--color-success` | `src/executive.css:2890` | `:root` | `#16a34a` |
| `--color-warning` | `src/executive.css:2891` | `:root` | `#d97706` |
| `--color-danger` | `src/executive.css:2892` | `:root` | `#dc2626` |
| `--text-muted` | `src/executive.css:2898` | `:root` | `var(--text-tertiary)` |
| `--bg-base` | `src/executive.css:2901` | `[data-theme='dark']` | `#0b0f1a` |
| `--bg-surface` | `src/executive.css:2902` | `[data-theme='dark']` | `#131826` |
| `--bg-elevated` | `src/executive.css:2903` | `[data-theme='dark']` | `#1a2030` |
| `--text-primary` | `src/executive.css:2905` | `[data-theme='dark']` | `#e8ecf5` |
| `--text-secondary` | `src/executive.css:2906` | `[data-theme='dark']` | `#9ca3b5` |
| `--color-brand` | `src/executive.css:2908` | `[data-theme='dark']` | `#5b7cfa` |
| `--color-success` | `src/executive.css:2910` | `[data-theme='dark']` | `#34d399` |
| `--color-warning` | `src/executive.css:2911` | `[data-theme='dark']` | `#fbbf24` |
| `--color-danger` | `src/executive.css:2912` | `[data-theme='dark']` | `#f87171` |
| `--text-muted` | `src/executive.css:2915` | `[data-theme='dark']` | `var(--text-tertiary)` |
| `--bg-base` | `src/obsidian-precision.css:6` | `html[data-theme='dark']` | `#080c14` |
| `--bg-surface` | `src/obsidian-precision.css:8` | `html[data-theme='dark']` | `#0f1422` |
| `--bg-elevated` | `src/obsidian-precision.css:10` | `html[data-theme='dark']` | `#161d2e` |
| `--text-primary` | `src/obsidian-precision.css:14` | `html[data-theme='dark']` | `#ffffff` |
| `--text-secondary` | `src/obsidian-precision.css:15` | `html[data-theme='dark']` | `#b8c4dc` |
| `--text-muted` | `src/obsidian-precision.css:16` | `html[data-theme='dark']` | `#6b7899` |
| `--color-brand` | `src/obsidian-precision.css:18` | `html[data-theme='dark']` | `#5b7cfa` |
| `--color-accent` | `src/obsidian-precision.css:21` | `html[data-theme='dark']` | `#00f0ff` |
| `--color-success` | `src/obsidian-precision.css:22` | `html[data-theme='dark']` | `#00e599` |
| `--color-warning` | `src/obsidian-precision.css:23` | `html[data-theme='dark']` | `#fbbf24` |
| `--color-danger` | `src/obsidian-precision.css:24` | `html[data-theme='dark']` | `#ff4d6d` |
| `--bg-base` | `src/obsidian-precision.css:465` | `.unlock` | `#080c14` |
| `--bg-surface` | `src/obsidian-precision.css:466` | `.unlock` | `#0f1422` |
| `--bg-elevated` | `src/obsidian-precision.css:467` | `.unlock` | `#161d2e` |
| `--text-primary` | `src/obsidian-precision.css:471` | `.unlock` | `#e6ecff` |
| `--text-secondary` | `src/obsidian-precision.css:472` | `.unlock` | `#8b9bbf` |
| `--text-muted` | `src/obsidian-precision.css:473` | `.unlock` | `#8291b5` |
| `--color-brand` | `src/obsidian-precision.css:474` | `.unlock` | `#5b7cfa` |
| `--color-accent` | `src/obsidian-precision.css:476` | `.unlock` | `#00f0ff` |
| `--color-success` | `src/obsidian-precision.css:477` | `.unlock` | `#00e599` |
| `--color-danger` | `src/obsidian-precision.css:478` | `.unlock` | `#ff4d6d` |
| `--bg-base` | `src/obsidian-precision.css:708` | `:root[data-theme='light'], html[data-theme='light']` | `#f6f8fc` |
| `--bg-surface` | `src/obsidian-precision.css:710` | `:root[data-theme='light'], html[data-theme='light']` | `#ffffff` |
| `--bg-elevated` | `src/obsidian-precision.css:712` | `:root[data-theme='light'], html[data-theme='light']` | `#edf1f8` |
| `--text-primary` | `src/obsidian-precision.css:716` | `:root[data-theme='light'], html[data-theme='light']` | `#0b1220` |
| `--text-secondary` | `src/obsidian-precision.css:717` | `:root[data-theme='light'], html[data-theme='light']` | `#33415c` |
| `--text-muted` | `src/obsidian-precision.css:718` | `:root[data-theme='light'], html[data-theme='light']` | `#64748b` |
| `--color-brand` | `src/obsidian-precision.css:720` | `:root[data-theme='light'], html[data-theme='light']` | `#3b5bdb` |
| `--color-accent` | `src/obsidian-precision.css:723` | `:root[data-theme='light'], html[data-theme='light']` | `#0e7490` |
| `--color-success` | `src/obsidian-precision.css:724` | `:root[data-theme='light'], html[data-theme='light']` | `#047857` |
| `--color-warning` | `src/obsidian-precision.css:725` | `:root[data-theme='light'], html[data-theme='light']` | `#b45309` |
| `--color-danger` | `src/obsidian-precision.css:726` | `:root[data-theme='light'], html[data-theme='light']` | `#b91c1c` |

**Conflict findings:** `executive.css` contains an older token system in `@layer components` near the top (roughly lines 56–169), then another unlayered token set near lines 2876–2922; `obsidian-precision.css` has the current dark scope near lines 6–26 and light scope near lines 708–736, plus `.unlock` scoped token-like values around 466–478. These are not all equal cascade competitors: unlayered normal declarations outrank normal declarations inside named layers; specificity and selector scope also matter. The later global blocks in `executive.css` are especially concerning because they define `:root` fallbacks and dark-only overrides separately from Obsidian's html-scoped theme tokens. `--bg-base`, `--bg-elevated`, and most current theme tokens are not defined in `app.css`; older `--bg/--surface/--text/--accent` remain there.


### 3. Legacy aliases and usage

| Alias | Definitions found | Definition / value | CSS `var()` references found in audited files |
|---|---|---|---:|
| `----bg` | **no definition found** | — | 0 |
| `----surface` | **no definition found** | — | 0 |
| `----text` | **no definition found** | — | 0 |
| `----accent` | **no definition found** | — | 0 |
| `----focus` | **no definition found** | — | 0 |
| `----color-brand-glow` | **no definition found** | — | 0 |

Reference samples:

- `var(--bg)`: `src/app.css:79` background: var(--bg);; `src/app.css:172` background: var(--bg);; `src/app.css:194` color: var(--bg);; `src/app.css:261` color: var(--bg);; `src/app.css:311` background: var(--bg);; `src/app.css:1317` background: var(--bg);; `src/app.css:2081` background: var(--bg);; `src/app.css:2269` background: var(--bg);
- `var(--surface)`: `src/app.css:435` background: var(--surface);; `src/app.css:465` background: var(--surface);; `src/app.css:527` background: color-mix(in srgb, var(--accent) 8%, var(--surface));; `src/app.css:550` background: color-mix(in srgb, var(--warning) 8%, var(--surface));; `src/app.css:555` background: color-mix(in srgb, var(--danger) 8%, var(--surface));; `src/app.css:560` background: var(--surface);; `src/app.css:591` background: color-mix(in srgb, var(--accent) 7%, var(--surface));; `src/app.css:665` background: var(--surface);; `src/app.css:838` background: var(--surface);; `src/app.css:1029` color: var(--surface);; `src/app.css:1051` color: var(--surface);; `src/app.css:1078` background: var(--surface);
- `var(--text)`: `src/app.css:80` color: var(--text);; `src/app.css:125` color: var(--text);; `src/app.css:193` background: var(--text);; `src/app.css:256` color: var(--text);; `src/app.css:260` background: var(--text);; `src/app.css:344` color: var(--text);; `src/app.css:436` color: var(--text);; `src/app.css:650` color: var(--text);; `src/app.css:694` color: var(--text);; `src/app.css:722` color: var(--text);; `src/app.css:790` color: var(--text);; `src/app.css:866` color: var(--text);
- `var(--accent)`: `src/app.css:43` --focus: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);; `src/app.css:124` background: color-mix(in srgb, var(--accent) 22%, transparent);; `src/app.css:343` border-color: var(--accent);; `src/app.css:423` border: 1px solid var(--accent);; `src/app.css:424` background: var(--accent);; `src/app.css:440` border-color: var(--accent);; `src/app.css:441` color: var(--accent);; `src/app.css:525` border: 1px solid var(--accent);; `src/app.css:527` background: color-mix(in srgb, var(--accent) 8%, var(--surface));; `src/app.css:573` background: var(--accent);; `src/app.css:589` border: 1px solid var(--accent);; `src/app.css:591` background: color-mix(in srgb, var(--accent) 7%, var(--surface));
- `var(--focus)`: `src/app.css:119` box-shadow: var(--focus);; `src/app.css:703` box-shadow: var(--focus);; `src/app.css:799` box-shadow: var(--focus);; `src/app.css:1163` box-shadow: var(--focus);; `src/app.css:3284` box-shadow: var(--focus);; `src/executive.css:708` box-shadow: var(--focus);; `src/executive.css:826` box-shadow: var(--focus);; `src/obsidian-precision.css:787` box-shadow: var(--focus);; `src/obsidian-precision.css:790` box-shadow: var(--focus);
- `var(--color-brand-glow)`: `src/executive.css:85` --focus: 0 0 0 2px var(--color-brand-glow);; `src/executive.css:131` --focus: 0 0 0 2px var(--color-brand-glow);; `src/executive.css:138` --focus: 0 0 0 3px var(--color-brand-glow);; `src/executive.css:181` --focus: 0 0 0 3px var(--color-brand-glow);; `src/obsidian-precision.css:736` --focus: 0 0 0 3px var(--color-brand-glow);

**JSX limitation:** repository code search did not return indexed JSX hits for these exact `var(--...)` strings, and this session does not have a checked-out source tree for a complete recursive grep. Therefore the reference counts above are CSS-only; they must not be interpreted as proof that JSX has no inline-style use. The strongest concrete risk is `app.css` defining legacy `--bg`, `--surface`, `--text`, `--accent` values, while `executive.css` aliases some of these to modern tokens in one set of rules but also contains legacy/unlayered declarations. `--surface2` is referenced by autofill styling in `app.css` and should be included in a future broader alias sweep.


### 4. Hardcoded hex colors in component rules

| File | Line | Selector | Declaration | Likely semantic token / risk |
|---|---:|---|---|---|
| `src/executive.css` | 767 | `.primary-button` | `color: #fff` | White is likely correct on filled/brand surfaces; verify contrast in light mode |
| `src/executive.css` | 1539 | `.top-profile .avatar` | `color: #fff` | White is likely correct on filled/brand surfaces; verify contrast in light mode |
| `src/executive.css` | 2727 | `.auth-submit` | `color: #0B0D10` | Potentially dark-only foreground; verify light/dark button state |
| `src/executive.css` | 2738 | `.auth-submit:hover:not(:disabled)` | `background: color-mix(in oklch, var(--color-brand) 88%, #000)` | Review by state; hardcoded |
| `src/executive.css` | 2739 | `.auth-submit:hover:not(:disabled)` | `border-color: color-mix(in oklch, var(--color-brand) 88%, #000)` | Review by state; hardcoded |
| `src/executive.css` | 2968 | `.executive-shell .primary-button:active:not(:disabled)` | `background: linear-gradient(90deg, color-mix(in srgb, #fff 18%, var(--color-brand)) 0 12%, var(--color-brand) 42%)` | Review by state; hardcoded |
| `src/executive.css` | 3210 | `.badge--danger` | `color: #F87171` | `--color-danger` (currently dark palette) |
| `src/executive.css` | 3211 | `.badge--warning` | `color: #FBBF24` | `--color-warning` |
| `src/executive.css` | 3212 | `.badge--success` | `color: #34D399` | `--color-success` |
| `src/executive.css` | 3213 | `.badge--brand` | `color: #7A94FB` | `--color-brand` |
| `src/executive.css` | 3214 | `.badge--neutral` | `color: #9CA3B5` | `--text-secondary` / muted |
| `src/obsidian-precision.css` | 75 | `.primary-button` | `color: #fff` | White is likely correct on filled/brand surfaces; verify contrast in light mode |
| `src/obsidian-precision.css` | 78 | `.secondary-button:hover:not(:disabled), .icon-button:hover:not(:disabled)` | `background: #202a40` | `--bg-elevated` / skeleton surface |
| `src/obsidian-precision.css` | 101 | `.skeleton, [class*='skeleton']` | `background: linear-gradient(90deg, #161d2e 20%, #202a40 38%, #161d2e 60%)` | `--bg-elevated` / skeleton surface |
| `src/obsidian-precision.css` | 108 | `.sten-critical, .critical-deviation, [data-severity='critical']` | `color: #ff8097` | `--color-danger` |
| `src/obsidian-precision.css` | 110 | `.sten-attention, [data-severity='attention']` | `color: #ffd56a` | `--color-warning` |
| `src/obsidian-precision.css` | 111 | `.sten-normal, [data-severity='normal']` | `color: #54f5be` | `--color-success` |
| `src/obsidian-precision.css` | 123 | `.progress-bar, .progress-track` | `background: #252e42` | `--bg-elevated` / border |
| `src/obsidian-precision.css` | 179 | `.pnl-scale-toggle button.active` | `color: #b6c4ff` | Review by state; hardcoded |
| `src/obsidian-precision.css` | 320 | `.pnl-row-ai-action` | `color: #8ff7ff` | Review by state; hardcoded |
| `src/obsidian-precision.css` | 339 | `.sten-critical-deviation` | `color: #ff8097 !important` | `--color-danger` |
| `src/obsidian-precision.css` | 533 | `.auth-eyebrow` | `color: #9aafff` | Review by state; hardcoded |
| `src/obsidian-precision.css` | 602 | `.auth-submit` | `color: #fff` | White is likely correct on filled/brand surfaces; verify contrast in light mode |
| `src/obsidian-precision.css` | 617 | `.auth-error` | `color: #ff9aab` | `--color-danger` |

The most likely light-theme leaks are the dark-only skeleton gradient, progress track, severity text colors, badge text colors, and the `.secondary-button:hover` background. Some hardcodes (white foreground on a dark/brand-filled button) may be intentional and should not be replaced without checking the component's background and semantic state.


### 5. Focus and accessibility

| File | Line | Selector | Relevant declaration |
|---|---:|---|---|
| `src/app.css` | 43 | `:root` | `--focus: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent)` |
| `src/app.css` | 118 | `button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible` | `outline: 0` |
| `src/app.css` | 119 | `button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible` | `box-shadow: var(--focus)` |
| `src/app.css` | 702 | `.scope-bar select:focus, .scope-input:focus-within` | `border-color: var(--accent)` |
| `src/app.css` | 703 | `.scope-bar select:focus, .scope-input:focus-within` | `box-shadow: var(--focus)` |
| `src/app.css` | 704 | `.scope-bar select:focus, .scope-input:focus-within` | `outline: 0` |
| `src/app.css` | 797 | `.pnl-edit-row input:focus` | `border-color: var(--accent)` |
| `src/app.css` | 798 | `.pnl-edit-row input:focus` | `outline: 0` |
| `src/app.css` | 799 | `.pnl-edit-row input:focus` | `box-shadow: var(--focus)` |
| `src/app.css` | 1162 | `.composer-box:focus-within` | `border-color: var(--accent)` |
| `src/app.css` | 1163 | `.composer-box:focus-within` | `box-shadow: var(--focus)` |
| `src/app.css` | 1375 | `.unlock-card input:focus` | `border-color: var(--accent)` |
| `src/app.css` | 1376 | `.unlock-card input:focus` | `box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent)` |
| `src/app.css` | 3177 | `button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible` | `outline: 2px solid var(--accent)` |
| `src/app.css` | 3178 | `button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible` | `outline-offset: 2px` |
| `src/app.css` | 3283 | `.transaction-form input:focus, .transaction-form select:focus, .transaction-form textarea:focus` | `border-color: var(--accent)` |
| `src/app.css` | 3284 | `.transaction-form input:focus, .transaction-form select:focus, .transaction-form textarea:focus` | `box-shadow: var(--focus)` |
| `src/app.css` | 4207 | `input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus, textarea:-webkit-autofill, select:-webkit-autofill` | `-webkit-text-fill-color: var(--text)` |
| `src/app.css` | 4208 | `input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus, textarea:-webkit-autofill, select:-webkit-autofill` | `-webkit-box-shadow: 0 0 0 1000px var(--surface2) inset` |
| `src/app.css` | 4209 | `input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus, textarea:-webkit-autofill, select:-webkit-autofill` | `box-shadow: 0 0 0 1000px var(--surface2) inset` |
| `src/app.css` | 4210 | `input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus, textarea:-webkit-autofill, select:-webkit-autofill` | `transition: background-color 9999s ease-out 0s` |
| `src/app.css` | 4211 | `input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus, textarea:-webkit-autofill, select:-webkit-autofill` | `caret-color: var(--text)` |
| `src/executive.css` | 85 | `:root` | `--focus: 0 0 0 2px var(--color-brand-glow)` |
| `src/executive.css` | 131 | `[data-theme='dark']` | `--focus: 0 0 0 2px var(--color-brand-glow)` |
| `src/executive.css` | 137 | `[data-theme='dark']` | `--color-brand-glow: rgba(91, 124, 250, 0.35)` |
| `src/executive.css` | 138 | `[data-theme='dark']` | `--focus: 0 0 0 3px var(--color-brand-glow)` |
| `src/executive.css` | 180 | `:root[data-theme='light'], [data-theme='light']` | `--color-brand-glow: rgba(59, 91, 219, 0.35)` |
| `src/executive.css` | 181 | `:root[data-theme='light'], [data-theme='light']` | `--focus: 0 0 0 3px var(--color-brand-glow)` |
| `src/executive.css` | 707 | `button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible` | `outline: 0` |
| `src/executive.css` | 708 | `button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible` | `box-shadow: var(--focus)` |
| `src/executive.css` | 825 | `.executive-shell input:focus, .executive-shell select:focus, .executive-shell textarea:focus` | `border-color: var(--color-brand)` |
| `src/executive.css` | 826 | `.executive-shell input:focus, .executive-shell select:focus, .executive-shell textarea:focus` | `box-shadow: var(--focus)` |
| `src/executive.css` | 827 | `.executive-shell input:focus, .executive-shell select:focus, .executive-shell textarea:focus` | `outline: 0` |
| `src/executive.css` | 2269 | `.composer-box:focus-within` | `border-color: var(--color-brand)` |
| `src/executive.css` | 2273 | `[data-theme='dark'] .composer-box:focus-within` | `box-shadow: 0 0 0 2px color-mix(in oklch, var(--color-brand) 25%, transparent), 0 0 24px color-mix(in oklch, var(--color-brand) 18%, transparent)` |
| `src/executive.css` | 2304 | `.composer-box:focus-within` | `transition: none` |
| `src/executive.css` | 2707 | `.auth-field input:focus` | `border-color: var(--color-brand)` |
| `src/executive.css` | 2708 | `.auth-field input:focus` | `box-shadow: 0 0 0 3px color-mix(in oklch, var(--color-brand) 20%, transparent)` |
| `src/executive.css` | 2709 | `.auth-field input:focus` | `background: var(--bg-surface)` |
| `src/executive.css` | 2743 | `.auth-submit:focus-visible` | `outline: 0` |
| `src/executive.css` | 2744 | `.auth-submit:focus-visible` | `box-shadow: 0 0 0 3px color-mix(in oklch, var(--color-brand) 24%, transparent)` |
| `src/executive.css` | 2886 | `:root` | `--color-brand-glow: rgba(91,124,250,0.35)` |
| `src/executive.css` | 2977 | `.executive-shell button:focus-visible, .executive-shell a:focus-visible, .executive-shell input:focus-visible, .executive-shell select:focus-visible, .executive-shell textarea:focus-visible` | `outline: 2px solid var(--color-brand)` |
| `src/executive.css` | 2978 | `.executive-shell button:focus-visible, .executive-shell a:focus-visible, .executive-shell input:focus-visible, .executive-shell select:focus-visible, .executive-shell textarea:focus-visible` | `outline-offset: 2px` |
| `src/executive.css` | 3177 | `.deviations-widget__action:focus-visible` | `outline:0` |
| `src/executive.css` | 3177 | `.deviations-widget__action:focus-visible` | `box-shadow:0 0 0 2px var(--color-brand)` |
| `src/executive.css` | 3264 | `.memory-filter-chip:focus-visible, .memory-filter-field input:focus-visible, .memory-filter-field select:focus-visible, .memory-card button:focus-visible, .proposed-memory button:focus-visible` | `outline: 2px solid var(--color-brand)` |
| `src/executive.css` | 3265 | `.memory-filter-chip:focus-visible, .memory-filter-field input:focus-visible, .memory-filter-field select:focus-visible, .memory-card button:focus-visible, .proposed-memory button:focus-visible` | `outline-offset: 2px` |
| `src/executive.css` | 3523 | `.flash-income-input__field:focus-visible, .flash-income-preview input:focus-visible, .flash-income-preview select:focus-visible` | `outline: 2px solid var(--color-brand)` |
| `src/executive.css` | 3524 | `.flash-income-input__field:focus-visible, .flash-income-preview input:focus-visible, .flash-income-preview select:focus-visible` | `outline-offset: 2px` |
| `src/obsidian-precision.css` | 41 | `html[data-theme='dark']` | `--focus: 0 0 0 2px rgba(0,240,255,.88)` |
| `src/obsidian-precision.css` | 48 | `:where(button, a, input, select, textarea, [tabindex]):focus-visible` | `outline: 2px solid var(--color-accent)` |
| `src/obsidian-precision.css` | 48 | `:where(button, a, input, select, textarea, [tabindex]):focus-visible` | `outline-offset: 2px` |
| `src/obsidian-precision.css` | 48 | `:where(button, a, input, select, textarea, [tabindex]):focus-visible` | `box-shadow: none` |
| `src/obsidian-precision.css` | 208 | `.pnl-edit-row:hover .pnl-actions, .pnl-edit-row:focus-within .pnl-actions` | `opacity: 1` |
| `src/obsidian-precision.css` | 224 | `.composer-box:focus-within` | `border-color: rgba(0,240,255,.55)` |
| `src/obsidian-precision.css` | 328 | `.pnl-edit-row:hover .pnl-row-ai-action, .pnl-edit-row:focus-within .pnl-row-ai-action` | `opacity: 1` |
| `src/obsidian-precision.css` | 361 | `.sten-ai-page .composer-box:focus-within` | `border-color: rgba(91,124,250,.7)` |
| `src/obsidian-precision.css` | 361 | `.sten-ai-page .composer-box:focus-within` | `box-shadow: 0 0 0 2px rgba(91,124,250,.12)` |
| `src/obsidian-precision.css` | 584 | `.auth-field input:focus-visible` | `border-color: var(--color-accent)` |
| `src/obsidian-precision.css` | 585 | `.auth-field input:focus-visible` | `outline: 2px solid rgba(0,240,255,.8)` |
| `src/obsidian-precision.css` | 586 | `.auth-field input:focus-visible` | `outline-offset: 2px` |
| `src/obsidian-precision.css` | 587 | `.auth-field input:focus-visible` | `box-shadow: none` |
| `src/obsidian-precision.css` | 608 | `.auth-submit:focus-visible` | `outline: 2px solid var(--color-accent)` |
| `src/obsidian-precision.css` | 608 | `.auth-submit:focus-visible` | `outline-offset: 3px` |
| `src/obsidian-precision.css` | 735 | `:root[data-theme='light'], html[data-theme='light']` | `--color-brand-glow: rgba(59, 91, 219, 0.35)` |
| `src/obsidian-precision.css` | 736 | `:root[data-theme='light'], html[data-theme='light']` | `--focus: 0 0 0 3px var(--color-brand-glow)` |
| `src/obsidian-precision.css` | 785 | `html[data-theme='light'] :where(button, a, input, select, textarea, [tabindex]):focus-visible` | `outline: 2px solid var(--color-brand)` |
| `src/obsidian-precision.css` | 786 | `html[data-theme='light'] :where(button, a, input, select, textarea, [tabindex]):focus-visible` | `outline-offset: 2px` |
| `src/obsidian-precision.css` | 787 | `html[data-theme='light'] :where(button, a, input, select, textarea, [tabindex]):focus-visible` | `box-shadow: var(--focus)` |
| `src/obsidian-precision.css` | 790 | `html[data-theme='dark'] :where(button, a, input, select, textarea, [tabindex]):focus-visible` | `box-shadow: var(--focus)` |
| `src/obsidian-precision-responsive-v2.css` | 25 | `.sidebar nav a:focus-visible, .topbar button:focus-visible, .mobile-bottom-nav a:focus-visible, .mobile-bottom-nav button:focus-visible` | `outline: 2px solid var(--color-brand)` |
| `src/obsidian-precision-responsive-v2.css` | 26 | `.sidebar nav a:focus-visible, .topbar button:focus-visible, .mobile-bottom-nav a:focus-visible, .mobile-bottom-nav button:focus-visible` | `outline-offset: 2px` |

`--color-brand-glow` is **not defined in both themes in a single canonical token block**: it is defined for dark at `executive.css:137` and again unlayered at `executive.css:2886` (root fallback); light definitions exist at `executive.css:180` and `obsidian-precision.css:735`. The light value is present, but multiple sources can win depending on selector and layer. `obsidian-precision.css:41` sets `--focus` for `html[data-theme='dark']`; light `--focus` is set at line 736. The old `--focus` in `app.css:43` depends on legacy `--accent`. Several focus rules set `outline: 0` and rely on box-shadow, while later Obsidian focus-visible rules add outlines; retain this behavior pending keyboard-contrast validation.


### 6. Proposed fixes only — no code changed


#### A — Critical candidates for light theme

- `src/obsidian-precision.css:~502` `.unlock-card` — replace the forced dark `background: rgba(15,20,34,.96) !important` with a theme token (`var(--bg-surface)` or a dedicated auth-card token), after confirming whether this card is intended to appear in light mode.

- `src/obsidian-precision.css:101` `.skeleton, [class*='skeleton']` — replace the hardcoded dark gradient with theme-specific/tokenized skeleton colors.

- `src/obsidian-precision.css:123` `.progress-bar, .progress-track` — replace `#252e42` with a surface/border token or define light/dark track tokens.

- `src/executive.css:3210–3214` `.badge--danger/warning/success/brand/neutral` — switch hardcoded dark-palette text colors to theme-aware semantic tokens, or pair them with theme-aware badge backgrounds.

- `src/obsidian-precision.css:108–111, 339` severity selectors — align hardcoded critical/attention/normal colors with semantic tokens; `:339 !important` also defeats weaker overrides for the same property.

- `src/obsidian-precision.css:78` hover background `#202a40` and `:179`, `:320`, `:533`, `:617` hardcoded state colors — tokenize or provide light-theme overrides where contrast is insufficient.

- `src/executive.css:2876–2922` — consolidate the unlayered late token block with the canonical Obsidian token definitions; do not merely edit the earlier layered token values.


#### A — property-level change plan

| File | Line | What | Current | Proposed (not applied) |
|---|---:|---|---|---|
| `src/obsidian-precision.css` | 502 | `.unlock-card` background | `rgba(15,20,34,.96) !important` | `var(--bg-surface)` or dedicated auth-card token; validate both themes first |
| `src/obsidian-precision.css` | 101 | skeleton background | dark hardcoded gradient | tokenized gradient with light/dark values |
| `src/obsidian-precision.css` | 123 | progress track background | `#252e42` | `var(--bg-elevated)` or dedicated `--progress-track` token |
| `src/executive.css` | 3210–3214 | badge foreground colors | `#F87171`, `#FBBF24`, `#34D399`, `#7A94FB`, `#9CA3B5` | semantic tokens / theme-specific badge tokens |
| `src/obsidian-precision.css` | 108–111, 339 | severity foreground | fixed bright dark-palette colors | semantic tokens or light overrides |
| `src/obsidian-precision.css` | 78 | hover background | `#202a40` | `var(--bg-elevated)` / token |
| `src/executive.css` | 2876–2922 | global token fallbacks | second unlayered token block | consolidate into canonical token source after cascade verification |

#### B — Medium priority
- Review every hardcoded hex in section 4 for contrast in both themes; preserve intentionally white text on filled buttons where appropriate.
- Audit legacy `--bg`, `--surface`, `--text`, `--accent`, and `--surface2` references across TSX/TS as well as CSS.
- Reduce duplicate `:focus-visible` rules only after verifying keyboard focus is visible in both themes.
- Consolidate repeated `--color-brand-glow` and `--focus` declarations after cascade analysis.


#### C — Do not touch in this pass
- Responsive `display`, `grid-template-columns`, padding/radius and mobile-navigation `!important` declarations unless a separate layout bug is demonstrated.
- Reduced-motion declarations under `prefers-reduced-motion` / `data-reduce-motion`.
- Positive/negative/warning semantic status selectors merely because they use `!important`; their values are token-driven.
- Import order, API/backend, auth flow, and all CSS declarations until the plan is approved.


### 7. Playwright status

- `package.json` in the audited branch does not declare `playwright` or `@playwright/test` in dependencies/devDependencies.
- The active execution workspace has no checked-out project `package.json`; `npx --no-install playwright --version` did not complete within the session timeout. No dependency was installed. **Playwright availability is unconfirmed; computed styles were not captured.**


### Audit limitations
- No browser/computed styles. This report identifies static cascade risks, not verified runtime winners.
- Exact CSS references are counted only in the four audited stylesheets; a complete JSX/TSX search was unavailable in this execution context.
- No CSS changes, dependency changes, import-order changes, or PR creation.



---

## Three-theme token and color change plan (2026-10-14)

**Scope: plan only.** No CSS/TSX/JS, imports, dependencies, or runtime files were changed. This document is the only intended write. Dark appearance should be preserved wherever possible.

### 1. Theme map and actual system behavior

- Canonical dark palette: obsidian-precision.css:4–42, selector html[data-theme='dark'].
- Canonical light palette: obsidian-precision.css:704–740, selector :root[data-theme='light'], html[data-theme='light'].
- executive.css has an early semantic palette inside @layer components: light :root at lines 52–86, dark [data-theme='dark'] at 88–129, light override at 141–205. A second palette exists outside @layer at lines 2875–2922.
- No @media (prefers-color-scheme: ...) block was found in the audited CSS files.
- main.tsx reads sten_theme_v5; if saved value is system, it evaluates matchMedia('(prefers-color-scheme: dark)').matches once and writes resolved dark or light to document.documentElement.dataset.theme. The inspected code does not keep data-theme="system" on the document and does not show a matchMedia change listener. Thus system mode resolves at startup, but live OS changes while the app remains open are not proven to update automatically. If live-follow is a requirement, it is a separate JS/runtime task; do not create a third CSS palette.

| Token | dark | light | Status / comment |
|---|---|---|---|
| `--bg-base` | #080c14 | #f6f8fc | Complete; also has competing unlayered fallback values in executive.css. |
| `--bg-app` | #080c14 | #f6f8fc | Complete. |
| `--bg-surface` | #0f1422 | #ffffff | Complete. |
| `--bg-surface-subtle` | #12192a | #edf1f8 | Complete. |
| `--bg-elevated` | #161d2e | #edf1f8 | Complete. |
| `--bg-inset` | #0b1020 | #ffffff | Complete. |
| `--border-subtle` | rgba(255,255,255,.08) | rgba(15,23,42,.08) | Complete. |
| `--border-strong` | rgba(255,255,255,.15) | rgba(15,23,42,.20) | Complete. |
| `--text-primary` | #ffffff | #0b1220 | Complete globally; .unlock has local fixed values. |
| `--text-secondary` | #b8c4dc | #33415c | Complete globally; .unlock has local fixed values. |
| `--text-muted` | #6b7899 | #64748b | Complete globally; .unlock has local fixed values. |
| `--text-tertiary` | #b8c4dc | #64748b | Complete. |
| `--color-brand` | #5b7cfa | #3b5bdb | Complete. |
| `--color-brand-hover` | #7892ff | #304ec2 | Complete. |
| `--color-brand-strong` | #9aafff | #304ec2 | Complete. |
| `--color-accent` | #00f0ff | #0e7490 | Complete. |
| `--color-success` | #00e599 | #047857 | Complete. |
| `--color-warning` | #fbbf24 | #b45309 | Complete. |
| `--color-danger` | #ff4d6d | #b91c1c | Complete. |
| `--color-success-bg` | rgba(0,229,153,.11) | rgba(4,120,87,.10) | Complete. |
| `--color-warning-bg` | rgba(251,191,36,.11) | rgba(180,83,9,.10) | Complete. |
| `--color-danger-bg` | rgba(255,77,109,.12) | rgba(185,28,28,.10) | Complete. |
| `--color-brand-glow` | rgba(91,124,250,.35) | rgba(59,91,219,.35) | Both values exist, but definitions are duplicated across files/layers. |
| `--focus` | 2px cyan ring (base dark) | 3px brand glow | Both exist; multiple definitions and selectors compete. |
| `--skeleton-base` | not defined in canonical dark block | #e2e8f0 | Light-only; define dark counterpart or replace with --skeleton-gradient. |
| `--skeleton-shine` | not defined in canonical dark block | #f1f5f9 | Light-only; define dark counterpart or replace with --skeleton-gradient. |
| `--bg-subtle` | not defined | #e8ecf5 | Light-only. |
| `--text-disabled` | not defined | #94a3b8 | Light-only. |
| `--border-default` | not defined | rgba(15,23,42,.12) | Light-only. |
| `--text-on-accent` | not defined | #ffffff | Light-only; define dark too if used by shared controls. |
| `--skeleton-gradient` | not defined | not defined | New token proposed below. |
| `--bg-hover` | not defined canonically | not defined canonically | New token proposed below. |

**One-theme-only gaps:** --skeleton-base, --skeleton-shine, --bg-subtle, --text-disabled, --border-default and --text-on-accent are only defined in the light token block/scope. Add dark counterparts if shared components consume them. Prefer a complete --skeleton-gradient in both themes. --color-brand-glow and --focus have both dark/light values but duplicate definitions. Static definitions do not prove computed winners.

### 2. Color-bearing !important declarations

Only color-related properties (background, color, border/border-color, box-shadow, fill, stroke) are included; layout/position/grid/size !important declarations are excluded.

| File:line | Current declaration | Plan |
|---|---|---|
| `src/obsidian-precision.css:58` | `.sidebar, .topbar, .mobile-bottom-nav { background: var(--bg-surface) !important; border-color: var(--border-subtle) !important; }` | Already tokenized; retain for now |
| `src/obsidian-precision.css:65` | `background: var(--bg-surface) !important;` | Already tokenized; retain for now |
| `src/obsidian-precision.css:66` | `border: 1px solid var(--border-subtle) !important;` | Already tokenized; retain for now |
| `src/obsidian-precision.css:68` | `box-shadow: none !important;` | Already tokenized; retain for now |
| `src/obsidian-precision.css:96` | `.positive, .is-positive, .status-success { color: var(--color-success) !important; }` | Already tokenized; retain for now |
| `src/obsidian-precision.css:97` | `.negative, .is-negative, .status-danger { color: var(--color-danger) !important; }` | Already tokenized; retain for now |
| `src/obsidian-precision.css:98` | `.status-warning { color: var(--color-warning) !important; }` | Already tokenized; retain for now |
| `src/obsidian-precision.css:161` | `background: linear-gradient(145deg, rgba(91,124,250,.08), transparent 70%), var(--bg-surface) !important;` | Already tokenized; retain for now |
| `src/obsidian-precision.css:268` | `border: 1px solid rgba(0,240,255,.2) !important;` | Replace embedded rgba with var(--color-accent-border); retain important until cascade test |
| `src/obsidian-precision.css:269` | `background: linear-gradient(120deg, rgba(0,240,255,.055), transparent 70%), var(--bg-surface) !important;` | Replace gradient wash with var(--color-accent-wash-subtle); retain important |
| `src/obsidian-precision.css:339` | `color: #ff8097 !important;` | Replace hardcoded color with var(--color-danger-text) !important; define token in both themes |
| `src/obsidian-precision.css:342` | `.flash-prime.critical { border-color: rgba(255,77,109,.42) !important; background: linear-gradient(120deg, rgba(255,77,109,.09), transparent 70%), var(--bg-surface) !important; }` | Use --color-danger-border and --color-danger-wash; retain important pending cascade test |
| `src/obsidian-precision.css:343` | `.flash-prime.attention { border-color: rgba(251,191,36,.35) !important; background: linear-gradient(120deg, rgba(251,191,36,.07), transparent 70%), var(--bg-surface) !important; }` | Use --color-warning-border and --color-warning-wash; retain important pending cascade test |
| `src/obsidian-precision.css:344` | `.flash-prime.normal { border-color: rgba(0,229,153,.28) !important; }` | Use --color-success-border; retain important pending cascade test |
| `src/obsidian-precision.css:352` | `.sten-ai-page .chat { border-color: var(--border-subtle) !important; overflow: hidden; }` | Already tokenized; retain for now |
| `src/obsidian-precision.css:363` | `.sten-ai-page .docs-panel { background: var(--bg-surface) !important; }` | Already tokenized; retain for now |
| `src/obsidian-precision.css:509` | `background: rgba(15,20,34,.96) !important;` | Replace with var(--auth-card-bg) !important; remove .unlock local dark overrides |
| `src/obsidian-precision.css:510` | `border: 1px solid var(--border-strong) !important;` | Already tokenized; retain for now |
| `src/obsidian-precision.css:512` | `box-shadow: 0 24px 72px rgba(0,0,0,.24) !important;` | Replace with var(--shadow-auth-card) !important; define both theme values |
| `src/executive.css:427` | `color: var(--color-success) !important;` | Already tokenized; retain for now |
| `src/executive.css:432` | `color: var(--color-danger) !important;` | Already tokenized; retain for now |
| `src/executive.css:898` | `color: var(--color-success) !important;` | Already tokenized; retain for now |
| `src/executive.css:903` | `color: var(--color-danger) !important;` | Already tokenized; retain for now |
| `src/executive.css:908` | `color: var(--color-warning) !important;` | Already tokenized; retain for now |

**Cascade note:** light-only rules at obsidian-precision.css:744–789 already override several base declarations in light mode: skeleton, progress track, secondary/icon hover, attention/normal severity and active scale toggle. Replace base hardcodes with theme tokens, then remove redundant light overrides only after browser/cascade checks. High-risk exceptions: .unlock's local fixed dark palette (465–478), .unlock-card forced dark background, and .sten-critical-deviation hardcoded !important foreground.

### 3. Hardcoded colors in executive.css and obsidian-precision.css

The inventory excludes custom-property token definitions, SVG data URLs and color-scheme media blocks. Multiple values on a declaration line are all listed. Proposed token targets are not applied; decorative effects marked for browser review must not be changed blindly.

| File:line | Current selector/declaration | Literal(s) | Proposed token / disposition |
|---|---|---|---|
| `src/obsidian-precision.css:46` | `::selection { background: rgba(0,240,255,.2); color: var(--text-primary); }` | rgba(0,240,255,.2) | --selection-bg; keep foreground tokenized |
| `src/obsidian-precision.css:75` | `.primary-button { background: var(--color-brand); border-color: var(--color-brand); color: #fff; }` | #fff | --text-on-accent (define in both themes; preserve white in dark) |
| `src/obsidian-precision.css:78` | `.secondary-button:hover:not(:disabled), .icon-button:hover:not(:disabled) { background: #202a40; border-color: rgba(0,240,255,.38); }` | #202a40; rgba(0,240,255,.38) | --bg-hover + --border-hover |
| `src/obsidian-precision.css:83` | `.workspace-popover, .memory-card__menu-popover { background: var(--bg-elevated); border-color: var(--border-strong); box-shadow: 0 16px 44px rgba(0,0,0,.4); }` | rgba(0,0,0,.4) | --shadow-popover |
| `src/obsidian-precision.css:94` | `.pnl-edit-row:hover, .pnl-row:hover, .pnl-table tbody tr:hover { background: rgba(91,124,250,.07); }` | rgba(91,124,250,.07) | --color-brand-wash |
| `src/obsidian-precision.css:101` | `.skeleton, [class*='skeleton'] { background: linear-gradient(90deg, #161d2e 20%, #202a40 38%, #161d2e 60%); background-size: 240% 100%; animation: sten-shimmer 1.35s ease infinite; }` | #161d2e; #202a40 | --skeleton-gradient (dark preserves existing; light matches current override) |
| `src/obsidian-precision.css:106` | `border: 1px solid rgba(255,77,109,.42);` | rgba(255,77,109,.42) | --color-danger-border |
| `src/obsidian-precision.css:108` | `color: #ff8097;` | #ff8097 | --color-danger-text; preserve #ff8097 in dark |
| `src/obsidian-precision.css:110` | `.sten-attention, [data-severity='attention'] { border: 1px solid rgba(251,191,36,.35); background: var(--color-warning-bg); color: #ffd56a; }` | rgba(251,191,36,.35); #ffd56a | --color-warning-border + --color-warning-text |
| `src/obsidian-precision.css:111` | `.sten-normal, [data-severity='normal'] { border: 1px solid rgba(0,229,153,.28); background: var(--color-success-bg); color: #54f5be; }` | rgba(0,229,153,.28); #54f5be | --color-success-border + --color-success-text |
| `src/obsidian-precision.css:123` | `.progress-bar, .progress-track { height: 4px; border-radius: 999px; overflow: hidden; background: #252e42; }` | #252e42 | --progress-track |
| `src/obsidian-precision.css:161` | `background: linear-gradient(145deg, rgba(91,124,250,.08), transparent 70%), var(--bg-surface) !important;` | rgba(91,124,250,.08) | --color-brand-wash |
| `src/obsidian-precision.css:179` | `.pnl-scale-toggle button.active { background: rgba(91,124,250,.2); color: #b6c4ff; }` | rgba(91,124,250,.2); #b6c4ff | --color-brand-wash-strong + --color-brand-text |
| `src/obsidian-precision.css:205` | `.pnl-edit-row:not(.pnl-edit-head):hover { background: rgba(91,124,250,.075); }` | rgba(91,124,250,.075) | --color-brand-wash |
| `src/obsidian-precision.css:217` | `.chat-body { background: radial-gradient(ellipse at 50% 0%, rgba(91,124,250,.045), transparent 58%), var(--bg-base); }` | rgba(91,124,250,.045) | --color-brand-wash-subtle |
| `src/obsidian-precision.css:219` | `.welcome-mark { border: 1px solid rgba(0,240,255,.22); background: rgba(0,240,255,.06); color: var(--color-accent); }` | rgba(0,240,255,.22); rgba(0,240,255,.06) | --color-accent-border + --color-accent-wash |
| `src/obsidian-precision.css:222` | `.starter-grid button:hover { border-color: rgba(0,240,255,.4); background: var(--bg-elevated); }` | rgba(0,240,255,.4) | --color-accent-border-hover |
| `src/obsidian-precision.css:223` | `.composer-box { border: 1px solid var(--border-strong); border-radius: var(--ui-radius-lg); background: var(--bg-surface); box-shadow: 0 8px 28px rgba(0,0,0,.2); }` | rgba(0,0,0,.2) | --shadow-composer |
| `src/obsidian-precision.css:224` | `.composer-box:focus-within { border-color: rgba(0,240,255,.55); }` | rgba(0,240,255,.55) | --border-focus |
| `src/obsidian-precision.css:228` | `.upload-box:hover { border-color: var(--color-accent); background: rgba(0,240,255,.035); }` | rgba(0,240,255,.035) | --color-accent-wash-subtle |
| `src/obsidian-precision.css:247` | `.secretary-event:hover { border-color: rgba(91,124,250,.4); }` | rgba(91,124,250,.4) | --color-brand-border-hover |
| `src/obsidian-precision.css:268` | `border: 1px solid rgba(0,240,255,.2) !important;` | rgba(0,240,255,.2) | --color-accent-border |
| `src/obsidian-precision.css:269` | `background: linear-gradient(120deg, rgba(0,240,255,.055), transparent 70%), var(--bg-surface) !important;` | rgba(0,240,255,.055) | --color-accent-wash-subtle |
| `src/obsidian-precision.css:279` | `.analytics-report-table tbody tr:hover { background: rgba(91,124,250,.06); }` | rgba(91,124,250,.06) | --color-brand-wash |
| `src/obsidian-precision.css:280` | `.analytics-report-total { background: rgba(91,124,250,.07); color: var(--text-primary); font-weight: 600; }` | rgba(91,124,250,.07) | --color-brand-wash |
| `src/obsidian-precision.css:317` | `border: 1px solid rgba(0,240,255,.25);` | rgba(0,240,255,.25) | --color-accent-border |
| `src/obsidian-precision.css:319` | `background: rgba(0,240,255,.06);` | rgba(0,240,255,.06) | --color-accent-wash |
| `src/obsidian-precision.css:320` | `color: #8ff7ff;` | #8ff7ff | --color-accent-text |
| `src/obsidian-precision.css:329` | `.pnl-row-ai-action:hover { background: rgba(0,240,255,.12); border-color: rgba(0,240,255,.55); }` | rgba(0,240,255,.12); rgba(0,240,255,.55) | --color-accent-wash-hover + --color-accent-border-hover |
| `src/obsidian-precision.css:336` | `border: 1px solid rgba(255,77,109,.42);` | rgba(255,77,109,.42) | --color-danger-border |
| `src/obsidian-precision.css:338` | `background: rgba(255,77,109,.13);` | rgba(255,77,109,.13) | --color-danger-wash-strong |
| `src/obsidian-precision.css:339` | `color: #ff8097 !important;` | #ff8097 | --color-danger-text (important; define both themes) |
| `src/obsidian-precision.css:342` | `.flash-prime.critical { border-color: rgba(255,77,109,.42) !important; background: linear-gradient(120deg, rgba(255,77,109,.09), transparent 70%), var(--bg-surface) !important; }` | rgba(255,77,109,.42); rgba(255,77,109,.09) | --color-danger-border + --color-danger-wash |
| `src/obsidian-precision.css:343` | `.flash-prime.attention { border-color: rgba(251,191,36,.35) !important; background: linear-gradient(120deg, rgba(251,191,36,.07), transparent 70%), var(--bg-surface) !important; }` | rgba(251,191,36,.35); rgba(251,191,36,.07) | --color-warning-border + --color-warning-wash |
| `src/obsidian-precision.css:344` | `.flash-prime.normal { border-color: rgba(0,229,153,.28) !important; }` | rgba(0,229,153,.28) | --color-success-border |
| `src/obsidian-precision.css:359` | `.sten-ai-page .starter-grid button:hover { border-color: rgba(91,124,250,.55); background: var(--bg-elevated); color: var(--text-primary); }` | rgba(91,124,250,.55) | --color-brand-border-hover |
| `src/obsidian-precision.css:360` | `.sten-ai-page .composer-box { border: 1px solid var(--border-strong); border-radius: 14px; background: var(--bg-surface); box-shadow: 0 8px 26px rgba(0,0,0,.18); }` | rgba(0,0,0,.18) | --shadow-composer |
| `src/obsidian-precision.css:361` | `.sten-ai-page .composer-box:focus-within { border-color: rgba(91,124,250,.7); box-shadow: 0 0 0 2px rgba(91,124,250,.12); }` | rgba(91,124,250,.7); rgba(91,124,250,.12) | --border-focus + --focus |
| `src/obsidian-precision.css:404` | `.team-page .analytics-report-table > div:not(.analytics-report-head):hover { background: rgba(91,124,250,.06); }` | rgba(91,124,250,.06) | --color-brand-wash |
| `src/obsidian-precision.css:415` | `.admin-organizations-page .data-table tbody tr:hover { background: rgba(91,124,250,.06); }` | rgba(91,124,250,.06) | --color-brand-wash |
| `src/obsidian-precision.css:488` | `radial-gradient(ellipse at 50% 0%, rgba(91,124,250,.075), transparent 42%),` | rgba(91,124,250,.075) | --auth-brand-wash |
| `src/obsidian-precision.css:499` | `background-image: linear-gradient(rgba(139,155,191,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(139,155,191,.055) 1px, transparent 1px);` | rgba(139,155,191,.055) | --auth-grid-line |
| `src/obsidian-precision.css:509` | `background: rgba(15,20,34,.96) !important;` | rgba(15,20,34,.96) | --auth-card-bg; dark preserves rgba(15,20,34,.96), light uses white surface |
| `src/obsidian-precision.css:512` | `box-shadow: 0 24px 72px rgba(0,0,0,.24) !important;` | rgba(0,0,0,.24) | --shadow-auth-card; dark preserve current, light softer neutral shadow |
| `src/obsidian-precision.css:533` | `color: #9aafff;` | #9aafff | --color-brand-strong |
| `src/obsidian-precision.css:545` | `box-shadow: 0 0 0 3px rgba(0,229,153,.1);` | rgba(0,229,153,.1) | --color-success-wash |
| `src/obsidian-precision.css:582` | `.auth-field input:hover:not(:disabled) { border-color: rgba(139,155,191,.5); }` | rgba(139,155,191,.5) | --border-hover |
| `src/obsidian-precision.css:585` | `outline: 2px solid rgba(0,240,255,.8);` | rgba(0,240,255,.8) | --focus-outline |
| `src/obsidian-precision.css:602` | `color: #fff;` | #fff | --text-on-accent |
| `src/obsidian-precision.css:614` | `border: 1px solid rgba(255,77,109,.34);` | rgba(255,77,109,.34) | --color-danger-border |
| `src/obsidian-precision.css:617` | `color: #ff9aab;` | #ff9aab | --color-danger-text |
| `src/obsidian-precision.css:643` | `text-decoration-color: rgba(139,155,191,.5);` | rgba(139,155,191,.5) | --text-decoration-muted |
| `src/obsidian-precision.css:765` | `border-color: rgba(180, 83, 9, 0.35);` | rgba(180, 83, 9, 0.35) | --color-warning-border (preserve current light value) |
| `src/obsidian-precision.css:771` | `border-color: rgba(4, 120, 87, 0.28);` | rgba(4, 120, 87, 0.28) | --color-success-border (preserve current light value) |
| `src/obsidian-precision.css:781` | `background: rgba(59, 91, 219, 0.10);` | rgba(59, 91, 219, 0.10) | --color-brand-wash |
| `src/executive.css:240` | `rgba(91,124,250,0.06) 0%,` | rgba(91,124,250,0.06) | --auth-brand-wash or --color-brand-wash |
| `src/executive.css:241` | `rgba(58,87,214,0.04) 100%` | rgba(58,87,214,0.04) | same --auth-brand-wash |
| `src/executive.css:409` | `box-shadow: 0 12px 32px rgba(15, 23, 42, .12);` | rgba(15, 23, 42, .12) | --shadow-popover |
| `src/executive.css:458` | `box-shadow: 12px 0 32px rgba(15, 23, 42, .16);` | rgba(15, 23, 42, .16) | --shadow-sidebar |
| `src/executive.css:767` | `color: #fff;` | #fff | --text-on-accent |
| `src/executive.css:865` | `box-shadow: 0 16px 40px rgba(0, 0, 0, .18);` | rgba(0, 0, 0, .18) | --shadow-modal |
| `src/executive.css:932` | `background: rgba(2, 6, 23, .48);` | rgba(2, 6, 23, .48) | --overlay-backdrop |
| `src/executive.css:1337` | `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);` | rgba(0, 0, 0, 0.04) | --shadow-card |
| `src/executive.css:1539` | `color: #fff;` | #fff | --text-on-accent |
| `src/executive.css:2508` | `.loading .sten-neon-spinner{display:block;width:48px;height:48px;filter:drop-shadow(0 0 8px rgba(91,124,250,.42))}` | rgba(91,124,250,.42) | --shadow-spinner-brand |
| `src/executive.css:2510` | `.login-spinner{display:block;flex:0 0 auto;filter:drop-shadow(0 0 5px rgba(255,255,255,.35))}` | rgba(255,255,255,.35) | --shadow-spinner-neutral |
| `src/executive.css:2727` | `color: #0B0D10;` | #0B0D10 | --text-on-accent (current #0B0D10; don't change without contrast check) |
| `src/executive.css:2738` | `background: color-mix(in oklch, var(--color-brand) 88%, #000);` | #000 | --color-brand-pressed or retain color-mix pending visual check |
| `src/executive.css:2739` | `border-color: color-mix(in oklch, var(--color-brand) 88%, #000);` | #000 | same --color-brand-pressed |
| `src/executive.css:2968` | `background: linear-gradient(90deg, color-mix(in srgb, #fff 18%, var(--color-brand)) 0 12%, var(--color-brand) 42%);` | #fff | --color-brand-sweep-highlight; browser review |
| `src/executive.css:2996` | `background: linear-gradient(90deg, rgba(255,255,255,.03) 0%, rgba(255,255,255,.07) 50%, rgba(255,255,255,.03) 100%);` | rgba(255,255,255,.03); rgba(255,255,255,.07) | --skeleton-gradient dark |
| `src/executive.css:3004` | `background: linear-gradient(90deg, rgba(11,13,16,.03) 0%, rgba(11,13,16,.07) 50%, rgba(11,13,16,.03) 100%);` | rgba(11,13,16,.03); rgba(11,13,16,.07) | --skeleton-gradient light |
| `src/executive.css:3210` | `.badge--danger  { background: rgba(248,113,113,0.15); color: #F87171; }` | rgba(248,113,113,0.15); #F87171 | --color-danger + --color-danger-bg |
| `src/executive.css:3211` | `.badge--warning { background: rgba(251,191,36,0.15);  color: #FBBF24; }` | rgba(251,191,36,0.15); #FBBF24 | --color-warning + --color-warning-bg |
| `src/executive.css:3212` | `.badge--success { background: rgba(52,211,153,0.15);  color: #34D399; }` | rgba(52,211,153,0.15); #34D399 | --color-success + --color-success-bg |
| `src/executive.css:3213` | `.badge--brand   { background: rgba(91,124,250,0.15);  color: #7A94FB; }` | rgba(91,124,250,0.15); #7A94FB | --color-brand + --color-brand-wash |
| `src/executive.css:3214` | `.badge--neutral { background: rgba(156,163,181,0.12); color: #9CA3B5; }` | rgba(156,163,181,0.12); #9CA3B5 | --text-muted + --neutral-bg |

**Authentication palette note:** .unlock currently defines its own fixed dark palette at obsidian-precision.css:465–478, and .auth-brand .sten-logo has fixed logo custom properties around lines 522–525. Tokenizing only .unlock-card background will not make authentication follow theme while these local overrides remain. Future implementation must remove/replace the local fixed palette with inherited semantic tokens and define theme-aware logo ink/muted values.

### 4. Legacy aliases

| Alias | app.css :root | app.css dark | executive light | executive dark / late block | CSS uses |
|---|---|---|---|---|---|
| --bg | #FAFAF8 | #0B0A08 | var(--bg-app) | var(--bg-base) | yes, many app.css references |
| --surface | #FFFFFF | #11100E | var(--bg-surface) | var(--bg-surface) | yes, many app.css references |
| --surface2 | #F3F2EE | #181714 | var(--bg-surface-subtle) | var(--bg-elevated) | yes, including autofill |
| --text | #0B0A08 | #FAFAF8 | var(--text-primary) | var(--text-primary) | yes, including autofill |
| --accent | #F59E0B | #F59E0B | var(--color-brand) | var(--color-brand) | yes, including focus styles |

**Conclusion:** aliases are explicitly re-mapped in the executive.css light selector. app.css is inside @layer legacy; executive.css uses the later @layer components, so its light alias mapping should beat the legacy values. The late unlayered executive block redefines aliases only under [data-theme='dark'], not in its :root fallback. This is not proof of a light-mode failure, though the duplicated alias architecture should be consolidated only after a full TSX/TS scan.

CSS references (not a TSX scan): var(--bg) at app.css lines 79, 172, 194, 261, 311, 1317, 2081, 2269; var(--surface) at 435, 465, 527, 550, 555, 560, 591, 665, 838, 1078, 1366, 2162, 2210, 2277, 2426, 2906, 2954, 3246, 3637, 3924, 4166, 4170; var(--text) is widespread including autofill at 4207 and 4211; var(--accent) is widespread including focus styles at 702, 797, 1162, 1375, 3177, 3283; var(--surface2) is widespread including autofill at 4208–4209. These are CSS references, not proof of runtime failure.

### 5. Exact late token block in executive.css:2875–2922

The block is outside @layer components. It has a root fallback palette (light-looking) and a separate dark override, but no paired explicit light selector. As unlayered declarations it outranks normal declarations in named layers; later unlayered Obsidian selectors can still win by source order/specificity. Import order alone does not decide every token.

```css
:root { /* executive.css:2875–2899, outside @layer */
  --bg-base: #f7f8fb;
  --bg-surface: #ffffff;
  --bg-elevated: #f1f3f7;
  --border-subtle: #d4dae3;
  --text-primary: #0b0d10;
  --text-secondary: #2f3844;
  --text-tertiary: #6b7280;
  --color-brand: #5b7cfa;
  --color-brand-hover: #6e8dff;
  --bg-inset: #0a0d16;
  --color-brand-glow: rgba(91,124,250,0.35);
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo,
               "JetBrains Mono", Consolas, monospace;
  --border-width: 1px;
  --color-success: #16a34a;
  --color-warning: #d97706;
  --color-danger: #dc2626;
  --ui-radius-sm: 6px;
  --ui-radius-md: 10px;
  --ui-radius-lg: 14px;
  --bg-app: var(--bg-base);
  --bg-surface-subtle: var(--bg-elevated);
  --text-muted: var(--text-tertiary);
}
[data-theme='dark'] { /* executive.css:2900+ */
  --bg-base: #0b0f1a;
  --bg-surface: #131826;
  --bg-elevated: #1a2030;
  --border-subtle: #232938;
  --text-primary: #e8ecf5;
  --text-secondary: #9ca3b5;
  --text-tertiary: #6b7280;
  --color-brand: #5b7cfa;
  --color-brand-hover: #6e8dff;
  --color-success: #34d399;
  --color-warning: #fbbf24;
  --color-danger: #f87171;
  --bg-app: var(--bg-base);
  --bg-surface-subtle: var(--bg-elevated);
  --text-muted: var(--text-tertiary);
  --bg: var(--bg-base);
  --surface: var(--bg-surface);
  --surface2: var(--bg-elevated);
  --text: var(--text-primary);
  --muted: var(--text-secondary);
  --line: var(--border-subtle);
  --accent: var(--color-brand);
  --accent2: var(--color-brand);
  --good: var(--color-success);
  --danger: var(--color-danger);
  --warning: var(--color-warning);
}
```

Duplicate/conflicting examples (source declarations, not computed-style claims):

| Token | Earlier executive.css inside @layer components | Late unlayered fallback / dark | Later Obsidian theme value | Risk |
|---|---|---|---|---|
| --bg-base | light var(--c-gray-100), dark var(--c-gray-950), light override #f6f8fc | root #f7f8fb; dark #0b0f1a | dark #080c14; light #f6f8fc | duplicate palette |
| --bg-surface | var(--c-gray-50) / var(--c-gray-925), light #fff | root #fff; dark #131826 | dark #0f1422; light #fff | dark values differ |
| --bg-elevated | semantic palette + light #edf1f8 | root #f1f3f7; dark #1a2030 | dark #161d2e; light #edf1f8 | duplicate semantics |
| --text-primary | var(--c-gray-950) / var(--c-gray-150), light #0b1220 | root #0b0d10; dark #e8ecf5 | dark #fff; light #0b1220 | dark values differ |
| --color-success | var(--c-green-600) / var(--c-green-500) | root #16a34a; dark #34d399 | dark #00e599; light #047857 | status hue/value differs |
| --color-warning | var(--c-amber-500) / var(--c-amber-400) | root #d97706; dark #fbbf24 | dark #fbbf24; light #b45309 | duplicate |
| --color-danger | var(--c-red-500) / var(--c-red-400) | root #dc2626; dark #f87171 | dark #ff4d6d; light #b91c1c | dark values differ |
| --color-brand-glow | dark rgba(91,124,250,.35), light rgba(59,91,219,.35) | root rgba(91,124,250,.35) | light same as executive light; dark not re-declared in Obsidian dark block | duplicated |
| --focus | root/dark 2px var(--color-brand-glow), dark/light 3px overrides | not declared in late unlayered block | dark 2px cyan; light 3px brand glow | competing focus styles |

**Interpretation:** the late block defines a fallback and dark overrides, not an explicit light selector. This is a cascade risk, not proof that the light palette fails at runtime. Computed styles were not captured.

### 6. Plan lists

#### List A — critical theme fixes

| # | File:line | What changes | Before | Proposed after | Dark check | Light check |
|---:|---|---|---|---|---|---|
| 1 | obsidian-precision.css:465–478 | Remove fixed local palette from .unlock / make auth surfaces inherit theme | fixed dark local vars | inherited semantic tokens | preserve current auth appearance as closely as possible | auth background/surfaces/text become light |
| 2 | obsidian-precision.css:509 | .unlock-card background | rgba(15,20,34,.96) !important | var(--auth-card-bg) !important | dark token exact rgba(15,20,34,.96) | white/light auth-card surface |
| 3 | obsidian-precision.css:512 | auth card shadow | 0 24px 72px rgba(0,0,0,.24) !important | var(--shadow-auth-card) !important | same existing value | softer neutral shadow, e.g. rgba(15,23,42,.14) |
| 4 | obsidian-precision.css:101; executive.css:2996,3004 | skeleton | hardcoded dark/light gradients | var(--skeleton-gradient) | preserve dark shimmer | preserve current light shimmer |
| 5 | obsidian-precision.css:123 | progress track | #252e42 | var(--progress-track) | #252e42 | #edf1f8 |
| 6 | obsidian-precision.css:78 | secondary/icon hover | #202a40 and cyan rgba | var(--bg-hover), var(--border-hover) | preserve dark hover | neutral light hover and border |
| 7 | obsidian-precision.css:108,110–111,339 | severity foregrounds | #ff8097, #ffd56a, #54f5be; one !important | --color-danger-text / --color-warning-text / --color-success-text | preserve dark foregrounds | readable semantic colors on pale backgrounds |
| 8 | executive.css:3210–3214 | badge foregrounds/backgrounds | fixed dark-palette hex/rgba | semantic status/brand tokens with paired backgrounds | preserve current dark values | readable light foreground/background pairs |
| 9 | obsidian-precision.css:179 | active P&L scale toggle | rgba(91,124,250,.2) + #b6c4ff | --color-brand-wash-strong + --color-brand-text | preserve #b6c4ff | brand text suitable for light |
| 10 | obsidian-precision.css:317–329 | P&L AI action | cyan literals | --color-accent-border/wash/text family | preserve current dark cyan | accessible light accent instead of neon cyan |
| 11 | obsidian-precision.css:342–344 | Flash severity borders/gradients | fixed status rgba inside !important | status border/wash tokens | preserve dark alpha values | light status tokens |
| 12 | executive.css:2875–2922 | late duplicate token block | root fallback + separate dark override | consolidate into canonical theme source | compare computed styles before/after | compare computed styles before/after |
| 13 | obsidian-precision.css:735–736; executive.css:85,131,137–138,180–181,2886 | --color-brand-glow and --focus | duplicate layers/scopes and 2px/3px rings | one canonical definition per theme | retain visible dark ring | retain visible light ring |
| 14 | main.tsx (separate JS task, not this CSS write) | live system-follow behavior | system resolves once at startup | if live OS changes are required, add a guarded matchMedia change listener separately | follow dark OS | follow light OS |

**Three-mode proof status:** the token approach makes system use whichever theme JS resolves. Exact dark appearance is predictable only if token values match current dark literals; it is not proven by computed styles. Rows 1–3 and 7–13 require browser verification because local auth scope, !important, specificity, layers and overlapping rules affect the result. If a change cannot preserve dark output, move it to “browser review required.”

#### List B — new or missing tokens

| Token | Where | Dark | Light | Use |
|---|---|---|---|---|
| --auth-card-bg | canonical dark/light blocks | rgba(15,20,34,.96) | #fff or agreed light auth surface | .unlock-card |
| --shadow-auth-card | canonical dark/light blocks | 0 24px 72px rgba(0,0,0,.24) | 0 24px 72px rgba(15,23,42,.14) | .unlock-card |
| --skeleton-gradient | canonical dark/light blocks | linear-gradient(90deg,#161d2e 20%,#202a40 38%,#161d2e 60%) | linear-gradient(90deg,#e2e8f0 20%,#f1f5f9 38%,#e2e8f0 60%) | skeleton components |
| --progress-track | canonical dark/light blocks | #252e42 | #edf1f8 | progress track |
| --bg-hover | canonical dark/light blocks | #202a40 | #edf1f8 | secondary/icon hover |
| --border-hover | canonical dark/light blocks | rgba(0,240,255,.38) if cyan intentional | var(--border-strong) | hover border |
| --text-on-accent | canonical dark/light blocks | #fff for filled brand controls; .auth-submit is an exception | #fff | primary controls/avatar |
| --color-brand-wash | canonical dark/light blocks | rgba(91,124,250,.07) | rgba(59,91,219,.07) | row hover/active surfaces |
| --color-brand-wash-strong | canonical dark/light blocks | rgba(91,124,250,.20) | rgba(59,91,219,.10) | active scale toggle |
| --color-brand-text | canonical dark/light blocks | #b6c4ff | #3b5bdb | active scale toggle |
| --color-brand-border-hover | canonical dark/light blocks | rgba(91,124,250,.55) | rgba(59,91,219,.45) | brand hover borders |
| --color-accent-border | canonical dark/light blocks | rgba(0,240,255,.22) | rgba(14,116,144,.25) | accent chips/AI action |
| --color-accent-wash | canonical dark/light blocks | rgba(0,240,255,.06) | rgba(14,116,144,.06) | welcome mark/action |
| --color-accent-text | canonical dark/light blocks | #8ff7ff | #0e7490 | P&L AI action |
| --color-danger-text | canonical dark/light blocks | #ff8097 | #b91c1c | critical severity/auth errors |
| --color-warning-text | canonical dark/light blocks | #ffd56a | #b45309 | attention severity |
| --color-success-text | canonical dark/light blocks | #54f5be | #047857 | normal severity |
| --color-danger-border | canonical dark/light blocks | rgba(255,77,109,.42) | rgba(185,28,28,.28) | critical states |
| --color-warning-border | canonical dark/light blocks | rgba(251,191,36,.35) | rgba(180,83,9,.35) | attention states |
| --color-success-border | canonical dark/light blocks | rgba(0,229,153,.28) | rgba(4,120,87,.28) | normal states |
| --color-danger-wash | canonical dark/light blocks | rgba(255,77,109,.13) | rgba(185,28,28,.10) | critical cards/actions |
| --color-warning-wash | canonical dark/light blocks | rgba(251,191,36,.07) | rgba(180,83,9,.10) | attention cards |
| --color-success-wash | canonical dark/light blocks | rgba(0,229,153,.11) | rgba(4,120,87,.10) | success states |
| --shadow-popover / --shadow-modal / --shadow-sidebar / --shadow-card / --shadow-composer | canonical dark/light blocks | preserve current values | softer neutral variants | elevation |
| --overlay-backdrop | canonical dark/light blocks | rgba(2,6,23,.48) | rgba(15,23,42,.28) | modal backdrop |
| --color-brand-pressed | canonical dark/light blocks | preserve current darkened brand | darkened light brand | pressed primary button |
| --color-brand-glow / --focus | one canonical definition per theme | approved current dark values | approved current light values | keyboard focus |

These are proposals, not implemented values. Check existing token use before adding a duplicate token and validate contrast.

#### List C — do not touch in this pass

| Item | Why |
|---|---|
| Responsive !important for grid/display/position/width/padding/mobile navigation | Outside color scope; layout risk |
| prefers-reduced-motion and data-reduce-motion | Explicitly out of scope; preserve accessibility |
| prefers-color-scheme media blocks | None found in audited CSS; system is currently resolved in JS |
| Semantic !important using var(--color-success/danger/warning) | Already tokenized; retain until cascade proves otherwise |
| White text on filled brand controls | Likely intentional; tokenize while preserving dark and checking contrast |
| Auth palette before .unlock local overrides are handled as one unit | A single background change leaves inconsistent auth controls |
| Late token consolidation, focus-ring simplification, or removing any !important | Requires computed styles/browser validation |
| Legacy aliases --bg/--surface/--text/--accent/--surface2 | Light remapping exists; no removal before TSX/TS scan |
| API/backend, auth flow, JS listener, imports, dependencies, deployment | Outside this CSS-only plan |

### 7. Three-mode validation matrix

| Proposed change | dark | light | system | Evidence/caveat |
|---|---|---|---|---|
| Skeleton/progress/hover tokens | use current dark literals | use current light override values | whichever palette JS resolves | existing light overrides already exist for several; computed styles unavailable |
| Severity and badges | preserve dark semantic values | readable foreground/background pairs | resolved theme | contrast and cascade require check |
| Auth surfaces/card/shadow | dedicated dark values preserve current auth look | light values and remove .unlock local dark palette | resolved theme | highest risk |
| Brand/accent wash and hover | retain existing values where possible | use light-specific wash/border/text | resolved theme | contrast/browser review |
| Focus/glow consolidation | preserve visible dark ring | preserve visible light ring | resolved theme | competing rules; do not consolidate blindly |
| Live system preference | OS dark selects dark | OS light selects light | currently resolved once at startup; live updates unverified | separate JS listener needed if live changes required |

**Acceptance before CSS changes:** (1) no unintended dark computed-style change; (2) every shared semantic token has dark and light values; (3) light surfaces/statuses/badges/skeletons/progress/auth are light where intended; (4) keyboard focus remains visible in both themes; (5) system mode follows OS and, if required, reacts to OS changes without reload. No browser screenshot/computed-style proof is available in this static pass.
