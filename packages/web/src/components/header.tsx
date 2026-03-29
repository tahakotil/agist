"use client"

import { useState } from "react"
import { Bell, Menu, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Sidebar } from "@/components/sidebar"
import { Badge } from "@/components/ui/badge"

export function Header() {
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <header className="h-14 border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm flex items-center px-4 gap-3 flex-shrink-0 sticky top-0 z-30">
      {/* Mobile hamburger */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-slate-400 hover:text-slate-200 md:hidden"
            />
          }
        >
          <Menu className="h-4 w-4" />
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-60 border-slate-800">
          <Sidebar onClose={() => setSheetOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
        <Input
          placeholder="Search... (⌘K)"
          className="h-8 pl-9 bg-slate-900 border-slate-700 text-slate-300 placeholder:text-slate-600 text-sm focus:border-slate-500 cursor-pointer"
          readOnly
          onClick={() => {
            const event = new KeyboardEvent("keydown", {
              key: "k",
              metaKey: true,
              bubbles: true,
            })
            document.dispatchEvent(event)
          }}
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 font-mono hidden sm:block">
          ⌘K
        </kbd>
      </div>

      <div className="flex-1" />

      {/* Notifications */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-slate-400 hover:text-slate-200 relative"
      >
        <Bell className="h-4 w-4" />
        <Badge className="absolute -top-0.5 -right-0.5 h-4 w-4 p-0 text-[9px] bg-red-500 text-white flex items-center justify-center border-0 rounded-full">
          3
        </Badge>
      </Button>

      {/* User */}
      <Avatar className="h-7 w-7">
        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-violet-600 text-white text-[10px] font-bold">
          AP
        </AvatarFallback>
      </Avatar>
    </header>
  )
}
