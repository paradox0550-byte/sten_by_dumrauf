import { LineChart, Line, ResponsiveContainer } from 'recharts';

type Point = { value: number | null };

export default function Sparkline({ data, color = '#2563eb', height = 28 }: { data: Point[]; color?: string; height?: number }) {
  const clean = data.map((d, i) => ({ i, value: d.value })).filter(d => d.value !== null) as { i: number; value: number }[];
  if (clean.length < 2) return null;

  return (
    <div className="sparkline" style={{ height, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={clean}>
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}