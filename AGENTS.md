# STEN — правила для ИИ-агентов

## 1. Scope изменений

### Можно
- src/**
- public/**
- docs/**
- конфигурационные frontend-файлы только если они прямо нужны задаче.

### Нельзя без явного подтверждения
- backend/**
- Yandex Cloud Function
- API Gateway
- Lockbox / secrets
- production deployment
- .github/workflows/deploy-frontend.yml
- branch protection / Ruleset main
- AuthContext, API contracts или security boundary, если задача не требует именно этого.

Если задача frontend-only — backend diff должен быть пустым.

## 2. Обязательные проверки

Перед PR:
- npm run typecheck → exit 0
- npm run lint → exit 0
- npm test → exit 0
- npm run build → exit 0

Дополнительно:
- проверить git diff --stat;
- проверить git diff;
- убедиться, что backend/**, src/lib/api.ts и src/lib/contracts/** не изменены, если они не входят в согласованный scope;
- проверить production build.

CI green не означает browser QA.

## 3. Продуктовые правила

- missing != zero;
- null нельзя превращать в 0 ради удобства UI;
- расчёт → интерпретация;
- AI не должен самовольно считать финансовые показатели;
- никаких mock/random/fake production values;
- финансовая формула и источник должны быть определимы;
- scope isolation обязательна;
- нельзя смешивать данные разных ресторанов/организаций;
- один PR = одна задача.

## 4. Storage / settings

Новые localStorage keys должны:
- иметь namespace sten_;
- иметь версию vN;
- учитывать org/user context там, где данные пользовательские или tenant-specific.

Не создавать дубликаты уже существующих appearance/settings keys.

## 5. Executive Cockpit

Tokens:
- --bg-base #0B0F1A
- --bg-surface #131826
- --bg-elevated #1A2030
- --border-subtle #232938
- --text-primary #E8ECF5
- --text-secondary #9CA3B5
- --text-tertiary #6B7280
- --color-brand #5B7CFA
- --color-brand-hover #7A94FB
- --color-success #34D399
- --color-warning #FBBF24
- --color-danger #F87171

Cards:
- border 1px;
- radius 10px;
- padding 18px 20px;
- shadow none.

Avoid:
- glassmorphism;
- excessive blur;
- neon/glow;
- parallax;
- decorative motion;
- unnecessary gradients.

Subtle gradient is acceptable only when it has a clear UI purpose, such as skeleton shimmer or active state.

## 6. Accessibility

- focus-visible must remain visible;
- keyboard navigation must not be broken;
- text scaling must remain usable at 110% and 120%;
- prefers-reduced-motion must disable non-essential motion;
- do not hide important information behind hover only;
- preserve contrast for financial positive/negative states.

## 7. Responsive

At minimum reason about:
- 360/390 mobile;
- 768 tablet;
- 1024 tablet/small laptop;
- 1440 desktop;
- 1920 wide desktop.

No accidental horizontal clipping.
No empty layout gaps created by desktop-only controls.
Tables need an intentional mobile strategy.
Browser validation remains human-owned.

## 8. Code quality

- TypeScript must remain strict.
- No new any unless explicitly justified and approved.
- No ts-ignore to silence a real type error.
- Do not make regex/copy-paste edits when a typed structural edit is possible.
- Do not rewrite unrelated code.
- Preserve existing public contracts.
- Do not introduce dead code.

## 9. Git / PR

- Start from current main.
- Use a task-specific branch.
- Keep commits understandable.
- Do not merge without explicit user approval.
- PR description must state:
  - scope;
  - changed files;
  - tests;
  - known limitations;
  - manual QA still required.
- Never claim a manual browser test was performed unless it actually was.

## 10. Final report

Always report:
- PR number and URL;
- branch;
- head SHA;
- base SHA;
- changed files;
- diff stat;
- CI result;
- build result;
- known limitations;
- whether merge was performed.

