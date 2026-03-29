"use client"

import { useCallback, useMemo } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  Position,
  BackgroundVariant,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import type { Agent } from "@/lib/api"
import { cn } from "@/lib/utils"

interface OrgChartProps {
  agents: Agent[]
}

const MODEL_STYLES: Record<string, string> = {
  haiku: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  sonnet: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  opus: "bg-violet-500/20 text-violet-300 border-violet-500/40",
}

const STATUS_COLOR: Record<string, string> = {
  idle: "bg-emerald-400",
  running: "bg-blue-400",
  error: "bg-red-400",
  paused: "bg-amber-400",
}

function AgentNode({ data }: { data: { agent: Agent } }) {
  const { agent } = data
  const modelStyle = MODEL_STYLES[agent.model] ?? "bg-slate-500/20 text-slate-300 border-slate-500/40"
  const statusColor = STATUS_COLOR[agent.status] ?? "bg-slate-400"

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 min-w-[160px] shadow-xl hover:border-slate-500 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("w-2 h-2 rounded-full flex-shrink-0", statusColor)} />
        <span className="text-sm font-semibold text-slate-100 truncate">
          {agent.name}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded border font-mono",
            modelStyle
          )}
        >
          {agent.model}
        </span>
        <span className="text-[10px] text-slate-500 truncate">{agent.role}</span>
      </div>
    </div>
  )
}

const nodeTypes = { agentNode: AgentNode }

export function OrgChart({ agents }: OrgChartProps) {
  const HORIZONTAL_SPACING = 220
  const VERTICAL_SPACING = 120

  // Build tree layout
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const agentMap = new Map(agents.map((a) => [a.id, a]))
    const children = new Map<string | undefined, Agent[]>()

    for (const agent of agents) {
      const parentId = agent.reportsTo || undefined
      if (!children.has(parentId)) children.set(parentId, [])
      children.get(parentId)!.push(agent)
    }

    const positions = new Map<string, { x: number; y: number }>()
    let xCounter = 0

    function assignPosition(agentId: string | undefined, depth: number) {
      const kids = children.get(agentId) ?? []
      if (kids.length === 0) {
        if (agentId) {
          positions.set(agentId, { x: xCounter * HORIZONTAL_SPACING, y: depth * VERTICAL_SPACING })
          xCounter++
        }
        return
      }
      for (const child of kids) assignPosition(child.id, depth + 1)
      if (agentId) {
        const kidPositions = kids.map((k) => positions.get(k.id)!.x).filter(Boolean)
        const midX = kidPositions.length
          ? (Math.min(...kidPositions) + Math.max(...kidPositions)) / 2
          : xCounter * HORIZONTAL_SPACING
        positions.set(agentId, { x: midX, y: depth * VERTICAL_SPACING })
      }
    }

    // Find roots (no parent or parent not in list)
    const roots = agents.filter(
      (a) => !a.reportsTo || !agentMap.has(a.reportsTo)
    )
    for (const root of roots) assignPosition(root.id, 0)

    const nodes: Node[] = agents.map((agent) => ({
      id: agent.id,
      type: "agentNode",
      position: positions.get(agent.id) ?? { x: 0, y: 0 },
      data: { agent },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    }))

    const edges: Edge[] = agents
      .filter((a) => a.reportsTo && agentMap.has(a.reportsTo))
      .map((a) => ({
        id: `${a.reportsTo}-${a.id}`,
        source: a.reportsTo!,
        target: a.id,
        type: "smoothstep",
        style: { stroke: "#475569", strokeWidth: 1.5 },
        animated: false,
      }))

    return { nodes, edges }
  }, [agents])

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  return (
    <div style={{ height: 500 }} className="rounded-lg border border-slate-800 bg-slate-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#1e293b"
        />
        <Controls
          className="[&>button]:bg-slate-800 [&>button]:border-slate-700 [&>button]:text-slate-400 [&>button:hover]:bg-slate-700"
          showInteractive={false}
        />
      </ReactFlow>
    </div>
  )
}
