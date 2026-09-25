# Skill: Finance Integrity

Goal: prevent plausible-looking but false management numbers.

Rules:
- distinguish PLAN, FACT, CONFIRMED and missing states;
- missing values never become zero unless the source explicitly records zero;
- revenue = hall + delivery;
- personnel = salaries + KPI bonuses;
- EBITDA = revenue − cost − OPEX;
- net profit = EBITDA − depreciation − interest − taxes;
- preserve source/category mapping during P&L import;
- show source and period for derived figures where the UI supports it.

AI may explain evidence; deterministic code owns financial arithmetic.
