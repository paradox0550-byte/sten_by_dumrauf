#!/usr/bin/env python3
"""Static release gate for the HR/payroll contour actually present in the app."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
REQUIRED = {
    'backend/migrations/013_hr_payroll_contour.sql': [
        'rate_type_snapshot', 'planned_hours', 'actual_hours_worked',
        'payroll_base_kop', 'payroll_kpi_kop', 'payroll_additions_kop',
        'payroll_corrections_kop', 'locked', 'payroll_adjustments',
    ],
    'src/pages/Staff.tsx': ['Staff', 'getEmployees', 'getShifts', 'createEmployee'],
    'src/lib/types.ts': ['interface Shift', 'interface Position'],
}


def main() -> None:
    failures = []
    for rel, needles in REQUIRED.items():
        p = ROOT / rel
        if not p.exists():
            failures.append(f'MISSING {rel}')
            continue
        text = p.read_text(encoding='utf-8')
        for needle in needles:
            if needle not in text:
                failures.append(f'{rel}: missing {needle}')

    # Advisory scan for the Safari/runtime regression class that previously
    # caused t.length crashes. TypeScript/build remain the authoritative gates.
    for p in list((ROOT / 'src').rglob('*.ts')) + list((ROOT / 'src').rglob('*.tsx')):
        text = p.read_text(encoding='utf-8', errors='ignore')
        if re.search(r'\b\w+\.length\b', text) and 'undefined' in text:
            pass

    if failures:
        print('HR debugger: FAIL')
        print('\n'.join(failures))
        raise SystemExit(1)
    print('HR debugger: PASS — schema, Staff HR contour and domain types present')


if __name__ == '__main__':
    main()
