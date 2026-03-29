"use client"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface StatCardProps {
  title: string
  value: string | number
  delta?: number
  deltaLabel?: string
  icon: LucideIcon
  iconColor?: string
  loading?: boolean
}

export function StatCard({
  title,
  value,
  delta,
  deltaLabel,
  icon: Icon,
  iconColor = "text-slate-400",
  loading = false,
}: StatCardProps) {
  const isPositive = delta !== undefined && delta >= 0
  const isNeutral = delta === undefined || delta === 0

  return (
    <Card className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-all duration-200 hover:shadow-lg hover:shadow-slate-900/50 hover:-translate-y-0.5">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">
              {title}
            </p>
            {loading ? (
              <div className="mt-2 h-8 w-24 bg-slate-800 rounded animate-pulse" />
            ) : (
              <p className="mt-2 text-3xl font-bold text-slate-100 tabular-nums">
                {value}
              </p>
            )}
            {delta !== undefined && !loading && (
              <div className="mt-2 flex items-center gap-1">
                <span
                  className={cn(
                    "text-xs font-medium flex items-center gap-0.5",
                    isNeutral
                      ? "text-slate-400"
                      : isPositive
                      ? "text-emerald-400"
                      : "text-red-400"
                  )}
                >
                  {!isNeutral && (
                    <span>{isPositive ? "▲" : "▼"}</span>
                  )}
                  {Math.abs(delta)}
                  {deltaLabel && (
                    <span className="text-slate-500 ml-1 font-normal">
                      {deltaLabel}
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
          <div
            className={cn(
              "p-3 rounded-xl bg-slate-800/80",
              iconColor
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
