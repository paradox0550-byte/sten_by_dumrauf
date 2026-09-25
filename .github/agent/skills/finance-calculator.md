# Skill: Finance Calculator

Goal: deterministic, auditable financial calculation shared by P&L, Budget, Dashboard and STEN.

Rules:
- money is decimal-safe; avoid binary floating-point for persisted calculations;
- every input has provenance: PLAN, FACT, CONFIRMED, DERIVED;
- missing is not zero;
- derived values are calculated only when every required input is present;
- store calculation version and formula identifiers;
- aggregation happens on raw amounts first, ratios second.

Canonical P&L:
Revenue
- COGS
= Gross Profit
- Payroll
- OPEX
= EBITDA
- Depreciation
- Interest
- Taxes
- Other confirmed items
= Net Profit

Also expose margins:
food_cost_pct = COGS / Revenue
payroll_pct = Payroll / Revenue
opex_pct = OPEX / Revenue
ebitda_margin = EBITDA / Revenue
net_margin = Net Profit / Revenue

Division by zero or missing revenue returns undefined/—, never 0%.

Calculator must be pure and testable. Frontend may preview; backend is authoritative for persisted financial facts.
