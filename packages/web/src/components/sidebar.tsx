"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import {
  LayoutDashboard,
  Building2,
  Bot,
  Timer,
  Play,
  AlertCircle,
  Settings,
  Monitor,
  Zap,
  Folder,
  FolderOpen,
  FileCode2,
  ShieldCheck,
  ClipboardList,
  BookOpen,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getCompanies, getPendingGates } from "@/lib/api"

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/projects", label: "Projects", icon: Folder },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/routines", label: "Routines", icon: Timer },
  { href: "/runs", label: "Runs", icon: Play },
  { href: "/issues", label: "Issues", icon: AlertCircle },
  { href: "/workspace", label: "Workspace", icon: FolderOpen },
  { href: "/templates", label: "Templates", icon: FileCode2 },
  { href: "/gates", label: "Gates", icon: ShieldCheck },
  { href: "/audit", label: "Audit Log", icon: ClipboardList },
  { href: "/digest", label: "Digest", icon: BookOpen },
]

const bottomItems = [
  { href: "/status", label: "Status Board", icon: Monitor },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname()

  const { data: companiesData } = useQuery({
    queryKey: ["companies"],
    queryFn: () => getCompanies({ limit: 100 }),
    staleTime: 60_000,
  })
  const firstCompanyId = companiesData?.companies?.[0]?.id

  const { data: pendingGatesData } = useQuery({
    queryKey: ["gates", firstCompanyId, "pending"],
    queryFn: () => getPendingGates(firstCompanyId!),
    enabled: !!firstCompanyId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
  const pendingCount = pendingGatesData?.total ?? 0

  function isActive(href: string) {
    if (href === "/") return pathname === "/"
    return pathname.startsWith(href)
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 border-r border-slate-800">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-slate-800">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <span className="font-bold text-slate-100 text-sm">Agist</span>
          <p className="text-[10px] text-slate-500 leading-tight">Agent Orchestration</p>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] uppercase tracking-widest text-slate-600 px-3 py-2 font-semibold">
          Main
        </p>
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
              isActive(href)
                ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 flex-shrink-0",
                isActive(href) ? "text-blue-400" : "text-slate-500"
              )}
            />
            <span className="flex-1">{label}</span>
            {href === "/gates" && pendingCount > 0 && (
              <span className="ml-auto text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-1.5 py-0.5 leading-none">
                {pendingCount}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="px-2 py-3 border-t border-slate-800 space-y-0.5">
        {bottomItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
              isActive(href)
                ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 flex-shrink-0",
                isActive(href) ? "text-blue-400" : "text-slate-500"
              )}
            />
            {label}
          </Link>
        ))}
      </div>
    </div>
  )
}
