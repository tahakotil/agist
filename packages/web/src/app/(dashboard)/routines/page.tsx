"use client"

import { useQuery } from "@tanstack/react-query"
import { getCompanies, getCompanyRoutines, updateRoutine, type Routine, type Company } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { relativeTime, cn } from "@/lib/utils"
import { Clock, Play, Pause, Timer } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"

export default function RoutinesPage() {
  const queryClient = useQueryClient()

  const { data: companies } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: getCompanies,
  })

  // Fetch routines for all companies in parallel; flatten results
  const companyIds = companies?.map((c) => c.id) ?? []

  const routineQueries = companyIds.map((cid) => ({
    queryKey: ["companies", cid, "routines"],
    queryFn: () => getCompanyRoutines(cid),
  }))

  // Use a single derived state by watching the query cache
  const { data: allRoutines, isLoading } = useQuery<Routine[]>({
    queryKey: ["routines", "all", companyIds.join(",")],
    queryFn: async () => {
      if (companyIds.length === 0) return []
      const results = await Promise.all(companyIds.map((cid) => getCompanyRoutines(cid)))
      return results.flat()
    },
    enabled: companyIds.length > 0,
  })

  const routines = allRoutines ?? []

  async function handleToggle(routine: Routine) {
    try {
      await updateRoutine(routine.id, { enabled: !routine.enabled })
      toast.success(routine.enabled ? "Routine paused" : "Routine enabled")
      queryClient.invalidateQueries({ queryKey: ["routines"] })
      queryClient.invalidateQueries({ queryKey: ["companies"] })
    } catch {
      toast.error("Failed to update routine")
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Routines</h1>
        <p className="text-sm text-slate-500 mt-1">
          Scheduled tasks and recurring workflows
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-lg bg-slate-900 border border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : routines && routines.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {routines.map((routine) => (
            <Card key={routine.id} className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-all duration-200">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Timer className="h-4 w-4 text-blue-400 flex-shrink-0" />
                    <CardTitle className="text-sm font-semibold text-slate-200">
                      {routine.title}
                    </CardTitle>
                  </div>
                  <Badge
                    className={cn(
                      "text-[10px] border flex-shrink-0",
                      routine.enabled
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-slate-500/15 text-slate-400 border-slate-500/30"
                    )}
                  >
                    {routine.enabled ? "Active" : "Paused"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Clock className="h-3 w-3" />
                  <span className="font-mono">{routine.cronExpression}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-600 block">Last run</span>
                    <span className="text-slate-400">{routine.lastRunAt ? relativeTime(routine.lastRunAt) : "Never"}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 block">Next run</span>
                    <span className="text-slate-400">{routine.nextRunAt ? relativeTime(routine.nextRunAt) : "—"}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className={cn(
                    "h-7 w-full text-xs border-slate-700 bg-slate-800 text-slate-300 transition-colors",
                    routine.enabled
                      ? "hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/40"
                      : "hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/40"
                  )}
                  onClick={() => handleToggle(routine)}
                >
                  {routine.enabled ? (
                    <>
                      <Pause className="h-3 w-3 mr-1.5" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3 mr-1.5" />
                      Enable
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center h-48 rounded-lg border border-dashed border-slate-800 text-slate-600 text-sm">
          No routines configured
        </div>
      )}
    </div>
  )
}
