import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { CommandPalette } from "@/components/command-palette"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar — hidden on mobile, visible on md+ */}
      <aside className="hidden md:flex flex-col w-56 flex-shrink-0">
        <Sidebar />
      </aside>

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}
