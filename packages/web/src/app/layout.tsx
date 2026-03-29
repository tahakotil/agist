import type { Metadata } from "next"
import "./globals.css"
import { Providers } from "@/components/providers"

export const metadata: Metadata = {
  title: "AgentPlatform — Orchestration Console",
  description: "AI agent orchestration dashboard",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full bg-slate-950 text-slate-100 font-sans">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
