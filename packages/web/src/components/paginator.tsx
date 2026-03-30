"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { Pagination } from "@/lib/api"

interface PaginatorProps {
  pagination: Pagination
  limitOptions?: number[]
  className?: string
}

export function Paginator({
  pagination,
  limitOptions = [20, 50, 100],
  className = "",
}: PaginatorProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const createUrl = useCallback(
    (updates: Record<string, string | number>) => {
      const params = new URLSearchParams(searchParams.toString())
      Object.entries(updates).forEach(([k, v]) => params.set(k, String(v)))
      return `${pathname}?${params.toString()}`
    },
    [pathname, searchParams]
  )

  const { page, totalPages, total, limit } = pagination

  if (total === 0) return null

  const from = (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  return (
    <div className={`flex items-center justify-between gap-4 pt-2 ${className}`}>
      {/* count */}
      <span className="text-xs text-slate-500 tabular-nums shrink-0">
        {from}–{to} of {total}
      </span>

      {/* prev / page info / next */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-slate-400 hover:text-slate-100 disabled:opacity-30"
          disabled={page <= 1}
          onClick={() => router.push(createUrl({ page: page - 1 }))}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <span className="text-xs text-slate-400 min-w-[80px] text-center tabular-nums">
          Page {page} of {totalPages}
        </span>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-slate-400 hover:text-slate-100 disabled:opacity-30"
          disabled={page >= totalPages}
          onClick={() => router.push(createUrl({ page: page + 1 }))}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* limit selector */}
      <Select
        value={String(limit)}
        onValueChange={(v) => v != null && router.push(createUrl({ limit: v, page: 1 }))}
      >
        <SelectTrigger className="h-7 w-[80px] text-xs bg-slate-800 border-slate-700 text-slate-300">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-slate-800 border-slate-700">
          {limitOptions.map((n) => (
            <SelectItem key={n} value={String(n)} className="text-xs text-slate-200 focus:bg-slate-700">
              {n} / page
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
