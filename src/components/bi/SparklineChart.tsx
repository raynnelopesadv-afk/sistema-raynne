import { Area, AreaChart, ResponsiveContainer } from 'recharts';

interface Props {
  data: number[];
  color?: string; // raw color or hsl var()
  height?: number;
}

export function SparklineChart({ data, color = 'hsl(var(--bi-gold))', height = 40 }: Props) {
  const formatted = data.map((v, i) => ({ i, v }));
  const id = `sg-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={formatted} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#${id})`}
            isAnimationActive
            animationDuration={800}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
