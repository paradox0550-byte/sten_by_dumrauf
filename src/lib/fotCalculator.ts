export type FotPayType = 'hourly' | 'shift' | 'salary';

export type FotDay =
  | { kind: 'hours'; hours: number; raw?: string }
  | { kind: 'shift'; defaultHours?: number; raw?: string }
  | { kind: 'dayOff'; raw?: string }
  | { kind: 'salary'; raw?: string }
  | { kind: 'empty'; raw?: string }
  | { kind: 'unknown'; raw: string };

export type FotEmployeeInput = {
  employee: string;
  position: string;
  rate: string | number;
  payType: FotPayType | null;
  days: FotDay[];
};

export type FotCalculationConfig = {
  normHours: number;
};

export type FotEmployeeCalculation = {
  employee: string;
  position: string;
  payType: FotPayType | null;
  rate: number | null;
  hours: number | null;
  overtimeHours: number | null;
  shifts: number;
  accrued: number | null;
  error: string | null;
  breakdown: string;
};

export type FotTotalCalculation = {
  employeeCount: number;
  accrued: number | null;
  hours: number | null;
  overtimeHours: number | null;
  employeesWithErrors: number;
};

export function parseFotRate(value: string | number): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const cleaned = value.trim().replace(/\s/g, '').replace(/руб(?:\.|лей|ля)?/gi, '').replace(/₽/g, '').replace(',', '.');
  const match = cleaned.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const amount = Number(match[0]);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function inferFotPayType(value: string): FotPayType | null {
  const text = value.toLocaleLowerCase('ru-RU');
  if (/оклад|зарплат|salary/.test(text)) return 'salary';
  if (/\/\s*час|руб\s*\/\s*ч|почас|часовая|за\s*час/.test(text)) return 'hourly';
  if (/\/\s*смен|за\s*смен|сменная|руб\s*\/\s*см/.test(text)) return 'shift';
  return null;
}

export function calculateEmployeeMonth(
  employeeData: FotEmployeeInput,
  config: FotCalculationConfig,
): FotEmployeeCalculation {
  const rate = parseFotRate(employeeData.rate);
  const payType = employeeData.payType;
  const normHours = Number.isFinite(config.normHours) && config.normHours >= 0 ? config.normHours : null;
  const exactHours = employeeData.days.reduce((sum, day) => sum + (day.kind === 'hours' && Number.isFinite(day.hours) && day.hours > 0 ? day.hours : 0), 0);
  const shifts = employeeData.days.filter(day => day.kind === 'shift' || day.kind === 'hours').length;
  const explicitShiftHours = employeeData.days.reduce((sum, day) => sum + (
    day.kind === 'hours' ? Math.max(0, day.hours) :
    day.kind === 'shift' ? Math.max(0, day.defaultHours ?? 12) : 0
  ), 0);
  const hasSalaryMarker = employeeData.days.some(day => day.kind === 'salary');
  const hasUnknown = employeeData.days.some(day => day.kind === 'unknown');

  if (!employeeData.employee.trim()) {
    return { employee: employeeData.employee, position: employeeData.position, payType, rate, hours: null, overtimeHours: null, shifts, accrued: null, error: 'Не указано ФИО сотрудника', breakdown: 'Расчёт невозможен' };
  }
  if (rate == null) {
    return { employee: employeeData.employee, position: employeeData.position, payType, rate: null, hours: hasSalaryMarker && normHours == null ? null : explicitShiftHours, overtimeHours: null, shifts, accrued: null, error: 'Не удалось определить ставку', breakdown: 'Нет ставки — расчёт не выполнен' };
  }
  if (!payType) {
    return { employee: employeeData.employee, position: employeeData.position, payType, rate, hours: null, overtimeHours: null, shifts, accrued: null, error: 'Не определён тип ставки: укажите руб/час, руб/смена или оклад', breakdown: 'Тип ставки не определён' };
  }
  if (hasUnknown) {
    const unknown = employeeData.days.find(day => day.kind === 'unknown');
    return { employee: employeeData.employee, position: employeeData.position, payType, rate, hours: null, overtimeHours: null, shifts, accrued: null, error: `Есть нераспознанные обозначения графика: «${unknown?.kind === 'unknown' ? unknown.raw : ''}»`, breakdown: 'Проверьте обозначения перед расчётом' };
  }

  let hours: number | null = explicitShiftHours;
  let accrued: number;
  let breakdown: string;
  if (payType === 'hourly') {
    accrued = exactHours * rate;
    hours = explicitShiftHours;
    breakdown = `${fmt(exactHours)} ч × ${fmt(rate)} ₽/ч = ${fmt(accrued)} ₽`;
  } else if (payType === 'shift') {
    accrued = shifts * rate;
    hours = explicitShiftHours;
    breakdown = `${shifts} смен × ${fmt(rate)} ₽/смена = ${fmt(accrued)} ₽`;
  } else {
    accrued = rate;
    if (hasSalaryMarker && explicitShiftHours === 0) hours = normHours;
    breakdown = `Оклад за месяц = ${fmt(accrued)} ₽`;
  }

  if (hours == null) {
    return { employee: employeeData.employee, position: employeeData.position, payType, rate, hours: null, overtimeHours: null, shifts, accrued, error: 'Не задана норма часов для расчёта часов окладника', breakdown };
  }
  const overtimeHours = normHours == null ? null : Math.max(0, hours - normHours);
  return { employee: employeeData.employee, position: employeeData.position, payType, rate, hours, overtimeHours, shifts, accrued, error: null, breakdown };
}

export function calculateTotalFOT(
  employees: FotEmployeeCalculation[],
  _config: FotCalculationConfig,
): FotTotalCalculation {
  const employeesWithErrors = employees.filter(employee => employee.error || employee.accrued == null || employee.hours == null).length;
  const accrued = employees.every(employee => employee.accrued != null)
    ? employees.reduce((sum, employee) => sum + (employee.accrued ?? 0), 0)
    : null;
  const hours = employees.every(employee => employee.hours != null)
    ? employees.reduce((sum, employee) => sum + (employee.hours ?? 0), 0)
    : null;
  const overtimeHours = employees.every(employee => employee.overtimeHours != null)
    ? employees.reduce((sum, employee) => sum + (employee.overtimeHours ?? 0), 0)
    : null;
  return { employeeCount: employees.length, accrued, hours, overtimeHours, employeesWithErrors };
}

function fmt(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
}
