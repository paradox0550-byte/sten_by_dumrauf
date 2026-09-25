# STEN: AI Coding & Development Canon
**Smart Tracking & Economic Navigator**  
*Personal B2B SaaS for HoReCa Financial & Operational Control*

> **CRITICAL DIRECTIVE:** You are an expert senior full-stack engineer and product designer. You MUST adhere strictly to these rules. Do not hallucinate features, do not use placeholder comments (`// TODO`, `// ...`), and never compromise on security or data integrity.

---

## 1. Core Product Principles (Non-Negotiable)
1. **Data Over Decoration:** UI must never hide missing data behind pretty cards. Show explicit empty states with actionable CTAs.
2. **No Fake Certainty:** If data is `null` or `undefined`, display "—" or "Нет данных". NEVER substitute missing values with `0` or synthetic data.
3. **Calculation Before Interpretation:** All financial metrics (Prime Cost, Food Cost, Labor Cost) MUST be calculated strictly on the backend. AI is only used for interpretation and actionable recommendations, never for raw math.
4. **Secure by Boundary:** The browser ONLY communicates with the API Gateway. NO database credentials, JWT secrets, AI model URIs, or internal VPC IPs may ever exist in the frontend bundle or `.env` exposed to the client.
5. **HoReCa First:** Prime Cost is the primary metric. EBITDA is secondary. Daily/Weekly Flash Reports are more critical than monthly post-mortems.

---

## 2. Tech Stack & Architecture
- **Frontend:** React 18+, TypeScript (Strict Mode), Vite, PWA (Service Worker).
- **Styling:** CSS Variables (Design Tokens) + Tailwind CSS utility patterns. NO arbitrary values unless absolutely necessary.
- **State & Data:** TanStack React Query (server state), Zod (strict validation).
- **Backend:** Node.js 22, Yandex Cloud Functions, PostgreSQL, Yandex Object Storage.
- **AI:** YandexGPT (via API Gateway) + Local Ollama (Qwen 2.5 7B) for sensitive data with client-side AES-GCM-256 encryption.

---

## 3. Visual Canon: "Swiss Hospitality" (Anti-Slop)
*Based on `taste-skill` v2 principles. Calibrated for a financial cockpit.*

- **DENSITY: 9/10 (Cockpit).** Tight paddings (`p-3`, `p-4`). Prefer 1px hairline borders (`border-muted`) over drop shadows. No decorative glassmorphism.
- **TYPOGRAPHY:** 
  - UI Text: `Inter` (weights 400, 500).
  - ALL NUMBERS: `JetBrains Mono` or `SF Mono` with `font-variant-numeric: tabular-nums` and `font-feature-settings: 'tnum'`.
- **COLORS:** 
  - Base: Warm off-white (`#FAFAF8`) / Warm charcoal (`#0B0A08`). NEVER pure black (`#000000`).
  - Accent: Amber-500 (`#F59E0B`) ONLY. 
  - Semantic: Emerald (`#10B981`) for positive, Red (`#EF4444`) for critical.
  - **THE LILA RULE:** NO neon, NO outer glows, NO AI purple/blue gradients, NO oversaturated accents.
- **MOTION: 2/10 (Static/Fluid).** Only animate `transform` and `opacity`. Max duration 200-300ms. Use `cubic-bezier(0.22, 0.61, 0.36, 1)`. ALWAYS respect `@media (prefers-reduced-motion: reduce)`.
- **LAYOUT:** 12-column grid. Left-aligned labels, strictly right-aligned numeric data for vertical scanning.

---

## 4. Business Logic & Financial Rules (HoReCa)
### 4.1 Prime Cost (The King Metric)
- **Formula:** `(COGS.actual + Labor.actual) / Revenue.actual * 100`
- **Thresholds:** 
  - `≤ 60%`: OK (Green/Emerald)
  - `60% - 65%`: Warning (Amber)
  - `> 65%`: Critical (Red)
- **Double Check:** Backend MUST validate that the reported Prime Cost % matches the calculated value (±0.01% tolerance). If mismatch, flag as `critical` error.

### 4.2 P&L Normalization
- **Strict Categories:** Revenue, COGS, Labor, Operating Expenses. 
- **The "Other" Rule:** If `other_operating` > 5% of total Revenue, the P&L status becomes `requires_review`. UI must block finalization until detailed breakdown is provided.
- **Overtime:** MUST be a separate, explicit line item under Labor. Never buried in total labor cost. Flag with ⚠️ if > 0.

### 4.3 Document Processing
- Max file size: 15MB.
- Fuzzy matching (Levenshtein ≤ 2) for Excel/CSV row classification.
- Rows with confidence < 0.8 or unclassified MUST go to the "Требует уточнения" (Requires Review) queue. Do not auto-guess silently.

---

## 5. Security & Authentication
- **Auth Method:** 4-digit numeric PIN only. NO email/password, NO OAuth.
- **Frontend PIN Input:** 4 separate inputs or 1 masked input with `inputMode="numeric"`, `pattern="[0-9]*"`. Auto-advance on type, auto-submit on 4th digit.
- **Backend Rate Limiting:** MAX 5 attempts per 15 minutes per IP. Block for 30 minutes on failure.
- **Storage:** PINs MUST be hashed with `bcrypt` (cost 12). NEVER store plaintext.
- **Session:** JWT returned on success. Stored securely. Offline PWA shell MUST NOT grant access to protected data without a valid, unexpired JWT.

---

## 6. Code Generation Rules (Strict Enforcement)
1. **TypeScript:** `strict: true`, `noUncheckedIndexedAccess: true`. NEVER use `any`. Use `unknown` and narrow it.
2. **Zod Validation:** EVERY API request and response MUST be validated with Zod schemas. Share schemas between frontend and backend if possible.
3. **No Placeholder Code:** Do not write `// implement logic here` or `/* ... */`. Write the complete, working implementation.
4. **Error Handling:** Never expose raw backend errors (e.g., "Postgres timeout", "Zod error at path X") to the UI. Map them to human-readable Russian messages (e.g., "Нет соединения с сервером", "Неверный формат файла").
5. **Component Design:** Keep components small, single-responsibility. Use composition over deep prop drilling.
6. **Testing:** Critical paths (Auth, Prime Cost calculation, P&L normalization) MUST have Vitest unit tests.

---

## 7. UI/UX Micro-Interactions
- **Modals:** Close on `Esc`, click outside (if non-destructive), or explicit `X` button. Trap focus inside.
- **Buttons:** Primary = solid dark/accent. Secondary = outline. Ghost = text only. Include loading spinners inside the button during async actions.
- **Empty States:** Always provide context and a primary action button (e.g., "Нет данных за выбранный период. [Изменить фильтры]").
- **Toasts:** Use for success/error feedback. Auto-dismiss after 4s, but keep errors visible until manually dismissed.

---

## 8. Forbidden Patterns (Instant Rejection)
- ❌ Using `console.log` in production code (use `console.warn` or `error` only if necessary).
- ❌ Inline styles (`style={{ ... }}`) unless dynamically calculating animation values.
- ❌ Hardcoding API URLs (use `import.meta.env.VITE_API_URL`).
- ❌ Assuming data exists without optional chaining (`?.`) or nullish coalescing (`??`).
- ❌ Generating fake/mock financial data that looks real. Mocks must be explicitly labeled as "ДЕМО-ДАННЫЕ".

---
*Last Updated: September 2026. Owner: Думрауф Александр Сергеевич.*
