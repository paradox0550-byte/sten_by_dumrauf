/* Единый формат денег для всего UI: «10 000 ₽», «10,0 тыс. ₽», «1,2 млн ₽».
   Внутренне хранятся сырые рубли; масштаб — только отображение.
   Правило продукта: отсутствующее значение — «—», никогда 0 ₽. */

export type MoneyUnit = 'RUB' | 'THOUSAND' | 'MILLION';

const UNITS: Record<MoneyUnit, { divisor: number; suffix: string }> = {
  RUB: { divisor: 1, suffix: '₽' },
  THOUSAND: { divisor: 1_000, suffix: 'тыс. ₽' },
  MILLION: { divisor: 1_000_000, suffix: 'млн ₽' },
};

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Автоматический компактный масштаб для дашбордов: 10 000 ₽ → «10,0 тыс. ₽». */
export function formatMoneyAuto(value?: number | null): string {
  if (!finite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return formatMoney(value, 'MILLION');
  if (abs >= 10_000) return formatMoney(value, 'THOUSAND');
  return formatMoney(value, 'RUB');
}

export function formatMoney(value?: number | null, unit: MoneyUnit = 'RUB'): string {
  if (!finite(value)) return '—';
  const cfg = UNITS[unit];
  const display = value / cfg.divisor;
  const maxDigits = unit === 'RUB' ? 0 : Math.abs(display) < 100 ? 1 : 0;
  const num = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: maxDigits, minimumFractionDigits: maxDigits }).format(display);
  return `${num} ${cfg.suffix}`;
}

export function formatPercent(value?: number | null, digits = 1): string {
  if (!finite(value)) return '—';
  return `${value.toFixed(digits).replace('.', ',')} %`;
}

export function formatDeltaPct(plan?: number | null, fact?: number | null): string {
  if (!finite(plan) || !finite(fact) || plan === 0) return '—';
  const p = ((fact - plan) / Math.abs(plan)) * 100;
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(1).replace('.', ',')} %`;
}
