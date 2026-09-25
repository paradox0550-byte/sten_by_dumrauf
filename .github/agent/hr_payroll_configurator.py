#!/usr/bin/env python3
"""Deterministic HR/payroll business-rule configurator.
Fails CI when the canonical payroll example changes unexpectedly.
"""
from dataclasses import dataclass

@dataclass(frozen=True)
class PayrollCase:
    hours: float
    rate_rub: float
    kpi_rub: float
    expected_base: int
    expected_kpi: int
    expected_total: int


def calculate(start: str, end: str, break_minutes: int, rate_rub: float, kpi_rub: float) -> tuple[float, int, int, int]:
    sh, sm = map(int, start.split(':'))
    eh, em = map(int, end.split(':'))
    minutes = eh * 60 + em - (sh * 60 + sm)
    if minutes <= 0:
        minutes += 24 * 60
    actual_minutes = max(0, minutes - break_minutes)
    hours = actual_minutes / 60
    base = round(hours * rate_rub)
    kpi = round(hours * kpi_rub)
    return hours, base, kpi, base + kpi


def main() -> None:
    hours, base, kpi, total = calculate('18:00', '02:00', 30, 350, 50)
    case = PayrollCase(hours, 350, 50, 2625, 375, 3000)
    assert hours == case.hours, (hours, case.hours)
    assert base == case.expected_base, (base, case.expected_base)
    assert kpi == case.expected_kpi, (kpi, case.expected_kpi)
    assert total == case.expected_total, (total, case.expected_total)
    print('HR configurator: PASS — 18:00→02:00, break 30m, 7.5h, 2625+375=3000 RUB')

if __name__ == '__main__':
    main()
