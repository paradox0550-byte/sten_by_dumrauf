import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

type Point = { label: string; plan: number | null; fact: number | null };

const fmt = (v: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v);

export default function PlanFactBar({ data, height = 240 }: { data: Point[]; height?: number }) {
  const clean = data.filter(d => d.plan !== null || d.fact !== null);
  if (!clean.length) return <div className="chart-empty">Нет данных для графика</div>;

  return (
    <div className="chart-wrap" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={clean} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} tickFormatter={fmt} width={70} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12 }}
            formatter={(v) => fmt(Number(v)) + ' ₽'}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="plan" fill="var(--muted)" name="План" radius={[4, 4, 0, 0]} />
          <Bar dataKey="fact" fill="#2563eb" name="Факт" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}