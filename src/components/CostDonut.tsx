import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

type Slice = { name: string; value: number | null };

const COLORS = ['#2563eb', '#f59e0b', '#7c3aed', '#0891b2', '#16a34a', '#dc2626'];
const fmt = (v: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v);

export default function CostDonut({ data, height = 240 }: { data: Slice[]; height?: number }) {
  const clean = data.filter(d => d.value !== null && d.value > 0) as { name: string; value: number }[];
  if (!clean.length) return <div className="chart-empty">Нет данных для диаграммы</div>;

  return (
    <div className="chart-wrap" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={clean} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
            {clean.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12 }}
            formatter={(v) => fmt(Number(v)) + ' ₽'}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}