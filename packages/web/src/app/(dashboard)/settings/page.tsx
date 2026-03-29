"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Settings, Key, Globe, Bell, Palette, Shield } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

export default function SettingsPage() {
  const [apiUrl, setApiUrl] = useState(
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:4400/api"
  )
  const [wsUrl, setWsUrl] = useState(
    process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4400/ws"
  )

  function handleSave() {
    toast.success("Settings saved (restart required for env changes)")
  }

  return (
    <div className="p-6 space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure your AgentPlatform console
        </p>
      </div>

      {/* API Configuration */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-blue-400" />
            <CardTitle className="text-base text-slate-100">API Configuration</CardTitle>
          </div>
          <CardDescription className="text-slate-500">
            Configure connections to your backend API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              API Base URL
            </label>
            <Input
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              className="bg-slate-800 border-slate-700 text-slate-200 font-mono text-sm focus:border-blue-500"
              placeholder="http://localhost:4400/api"
            />
            <p className="text-xs text-slate-600">
              Set via NEXT_PUBLIC_API_URL environment variable
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              WebSocket URL
            </label>
            <Input
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              className="bg-slate-800 border-slate-700 text-slate-200 font-mono text-sm focus:border-blue-500"
              placeholder="ws://localhost:4400/ws"
            />
            <p className="text-xs text-slate-600">
              Set via NEXT_PUBLIC_WS_URL environment variable
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Display */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-violet-400" />
            <CardTitle className="text-base text-slate-100">Display</CardTitle>
          </div>
          <CardDescription className="text-slate-500">
            Appearance and dashboard preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-300">Theme</p>
              <p className="text-xs text-slate-500 mt-0.5">Current display theme</p>
            </div>
            <Badge className="bg-slate-800 text-slate-300 border border-slate-700">
              Dark Mode
            </Badge>
          </div>
          <Separator className="bg-slate-800" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-300">Auto-refresh interval</p>
              <p className="text-xs text-slate-500 mt-0.5">How often the dashboard polls the API</p>
            </div>
            <Badge className="bg-blue-500/15 text-blue-400 border border-blue-500/30">
              5 seconds
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-400" />
            <CardTitle className="text-base text-slate-100">Notifications</CardTitle>
          </div>
          <CardDescription className="text-slate-500">
            Alert preferences for agent events
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: "Agent errors", desc: "Notify when an agent enters error state", enabled: true },
            { label: "Run completions", desc: "Notify on every completed run", enabled: false },
            { label: "Budget alerts", desc: "Notify when budget usage exceeds 80%", enabled: true },
            { label: "New issues", desc: "Notify when a new issue is detected", enabled: true },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-slate-300">{item.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
              </div>
              <Badge
                className={
                  item.enabled
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "bg-slate-500/15 text-slate-500 border border-slate-700"
                }
              >
                {item.enabled ? "On" : "Off"}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-400" />
            <CardTitle className="text-base text-slate-100">Security</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              API Key
            </label>
            <div className="flex gap-2">
              <Input
                type="password"
                value="sk-platform-••••••••••••••••"
                readOnly
                className="bg-slate-800 border-slate-700 text-slate-400 font-mono text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 flex-shrink-0"
              >
                <Key className="h-3.5 w-3.5 mr-1.5" />
                Rotate
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          className="bg-blue-600 hover:bg-blue-500 text-white"
          onClick={handleSave}
        >
          <Settings className="h-4 w-4 mr-2" />
          Save Settings
        </Button>
      </div>
    </div>
  )
}
