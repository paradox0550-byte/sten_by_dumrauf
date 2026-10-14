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
