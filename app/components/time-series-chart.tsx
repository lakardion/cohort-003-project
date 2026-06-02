import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface TimeSeriesPoint {
  date: string;
  value: number;
}

interface TimeSeriesChartProps {
  /** Chronologically-ordered points; an empty array renders an empty state. */
  data: TimeSeriesPoint[];
  /** Accessible label / heading for the chart. */
  label: string;
  /** Formats a y value for the axis and tooltip (e.g. currency). */
  formatValue?: (value: number) => string;
  /** Tooltip series name (e.g. "Revenue", "Enrollments"). */
  seriesName: string;
  color?: string;
}

const DEFAULT_COLOR = "var(--color-primary, #6366f1)";

/**
 * Thin recharts wrapper for a single day-bucketed time series. Kept small so the
 * recharts dependency surface stays contained. Degrades gracefully: an empty
 * series renders an explanatory placeholder, and a single point still renders a
 * readable dot rather than looking broken.
 */
export function TimeSeriesChart({
  data,
  label,
  formatValue = (v) => String(v),
  seriesName,
  color = DEFAULT_COLOR,
}: TimeSeriesChartProps) {
  if (data.length === 0) {
    return (
      <div
        role="img"
        aria-label={`${label}: no data yet`}
        className="flex h-64 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground"
      >
        No data yet — this graph will populate as activity comes in.
      </div>
    );
  }

  return (
    <div className="h-64 w-full" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
        >
          <defs>
            <linearGradient id={`fill-${seriesName}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            stroke="currentColor"
            className="text-muted-foreground"
          />
          <YAxis
            tickFormatter={formatValue}
            tick={{ fontSize: 12 }}
            stroke="currentColor"
            className="text-muted-foreground"
            width={64}
            allowDecimals={false}
          />
          <Tooltip
            formatter={(value) => [formatValue(Number(value)), seriesName]}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid var(--color-border, #e5e7eb)",
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            name={seriesName}
            stroke={color}
            strokeWidth={2}
            fill={`url(#fill-${seriesName})`}
            dot={data.length === 1 ? { r: 4 } : false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
