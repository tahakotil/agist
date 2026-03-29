"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Bot,
  Building2,
  LayoutDashboard,
  Play,
  Settings,
  Timer,
  GitBranch,
  AlertCircle,
  Monitor,
} from "lucide-react"

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  function go(path: string) {
    router.push(path)
    setOpen(false)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => go("/")} className="cursor-pointer">
            <LayoutDashboard className="mr-2 h-4 w-4 text-slate-400" />
            Dashboard
          </CommandItem>
          <CommandItem onSelect={() => go("/companies")} className="cursor-pointer">
            <Building2 className="mr-2 h-4 w-4 text-slate-400" />
            Companies
          </CommandItem>
          <CommandItem onSelect={() => go("/agents")} className="cursor-pointer">
            <Bot className="mr-2 h-4 w-4 text-slate-400" />
            Agents
          </CommandItem>
          <CommandItem onSelect={() => go("/runs")} className="cursor-pointer">
            <Play className="mr-2 h-4 w-4 text-slate-400" />
            Runs
          </CommandItem>
          <CommandItem onSelect={() => go("/routines")} className="cursor-pointer">
            <Timer className="mr-2 h-4 w-4 text-slate-400" />
            Routines
          </CommandItem>
          <CommandItem onSelect={() => go("/issues")} className="cursor-pointer">
            <AlertCircle className="mr-2 h-4 w-4 text-slate-400" />
            Issues
          </CommandItem>
          <CommandItem onSelect={() => go("/status")} className="cursor-pointer">
            <Monitor className="mr-2 h-4 w-4 text-slate-400" />
            Status Board (Fullscreen)
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => go("/agents?action=wake")} className="cursor-pointer">
            <Play className="mr-2 h-4 w-4 text-emerald-400" />
            Wake an Agent
          </CommandItem>
          <CommandItem onSelect={() => go("/settings")} className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4 text-slate-400" />
            Open Settings
          </CommandItem>
          <CommandItem onSelect={() => go("/status")} className="cursor-pointer">
            <GitBranch className="mr-2 h-4 w-4 text-blue-400" />
            View Org Charts
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
