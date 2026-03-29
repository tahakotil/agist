"use client"

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import type { DailyCost } from "@/lib/api"
import { format, parseISO } from "date-fns"

interface CostChartProps {
  data: DailyCost[]
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ color: string; name: string; value: number }>
  label?: string
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl">
        <p className="text-xs text-slate-400 mb-2 font-medium">{label}</p>
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-slate-300 capitalize">{entry.name}</span>
            </div>
            <span className="font-mono text-slate-100">
              ${entry.value.toFixed(4)}
            </span>
          </div>
        ))}
        <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between text-xs">
          <span className="text-slate-400">Total</span>
          <span className="font-mono text-slate-100 font-semibold">
            ${payload.reduce((s, p) => s + p.value, 0).toFixed(4)}
          </span>
        </div>
      </div>
    )
  }
  return null
}

export function CostChart({ data }: CostChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    date: format(parseISO(d.date), "MMM d"),
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={formatted} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorHaiku" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorSonnet" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorOpus" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "#64748b", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          dy={8}
        />
        <YAxis
          tick={{ fill: "#64748b", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v.toFixed(2)}`}
          width={55}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: "12px", color: "#94a3b8", paddingTop: "12px" }}
          formatter={(value) => (
            <span className="capitalize text-slate-400">{value}</span>
          )}
        />
        <Area
          type="monotone"
          dataKey="haiku"
          stackId="1"
          stroke="#10b981"
          strokeWidth={1.5}
          fill="url(#colorHaiku)"
          name="haiku"
        />
        <Area
          type="monotone"
          dataKey="sonnet"
          stackId="1"
          stroke="#3b82f6"
          strokeWidth={1.5}
          fill="url(#colorSonnet)"
          name="sonnet"
        />
        <Area
          type="monotone"
          dataKey="opus"
          stackId="1"
          stroke="#8b5cf6"
          strokeWidth={1.5}
          fill="url(#colorOpus)"
          name="opus"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
