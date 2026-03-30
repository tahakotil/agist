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
import type { AgentDailyCost } from "@/lib/api"
import { format, parseISO } from "date-fns"

interface CostChartProps {
  data: AgentDailyCost[]
}

const AGENT_COLORS = [
  "#10b981", // emerald
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#ef4444", // red
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
]

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
              <span className="text-slate-300">{entry.name}</span>
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
  // Collect unique agent names
  const agentNames = Array.from(new Set(data.map((d) => d.agentName)))

  // Collect unique dates (last 7 days)
  const dates = Array.from(new Set(data.map((d) => d.date))).sort()

  // Pivot: date -> { agentName: costDollars }
  const pivoted = dates.map((date) => {
    const row: Record<string, string | number> = {
      date: format(parseISO(date), "MMM d"),
    }
    for (const name of agentNames) {
      const entry = data.find((d) => d.date === date && d.agentName === name)
      row[name] = entry ? entry.costCents / 100 : 0
    }
    return row
  })

  // If no real data, show empty state
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[220px] text-slate-600 text-sm">
        No cost data for the last 7 days
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={pivoted} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          {agentNames.map((name, i) => (
            <linearGradient key={name} id={`color-agent-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={AGENT_COLORS[i % AGENT_COLORS.length]} stopOpacity={0.3} />
              <stop offset="95%" stopColor={AGENT_COLORS[i % AGENT_COLORS.length]} stopOpacity={0} />
            </linearGradient>
          ))}
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
          tickFormatter={(v) => `$${(v as number).toFixed(2)}`}
          width={55}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: "12px", color: "#94a3b8", paddingTop: "12px" }}
          formatter={(value) => (
            <span className="text-slate-400">{value as string}</span>
          )}
        />
        {agentNames.map((name, i) => (
          <Area
            key={name}
            type="monotone"
            dataKey={name}
            stackId="1"
            stroke={AGENT_COLORS[i % AGENT_COLORS.length]}
            strokeWidth={1.5}
            fill={`url(#color-agent-${i})`}
            name={name}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
