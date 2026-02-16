"use client"

import { useEffect, useState } from "react"
import { Brain, Target, Archive } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface Memory {
  id: string
  scope: string
  entityKey: string | null
  category: string | null
  content: { description: string; evidence?: string[]; lastConfirmed?: string }
  confidence: number
  correctCount: number
  totalCount: number
  usageCount: number
  lastUsedAt: string | null
  isArchived: boolean
  createdAt: string
}

interface MemoryViewerProps {
  agentId: string
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-gray-500 tabular-nums">{pct}%</span>
    </div>
  )
}

export function MemoryViewer({ agentId }: MemoryViewerProps) {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState<string | null>(null)

  useEffect(() => {
    const fetchMemories = async () => {
      try {
        const url = scope
          ? `/api/agents/${agentId}/memory?scope=${scope}`
          : `/api/agents/${agentId}/memory`
        const res = await fetch(url)
        if (!res.ok) return
        const data = await res.json()
        setMemories(data.memories || [])
      } catch {
        // Non-critical
      } finally {
        setLoading(false)
      }
    }
    fetchMemories()
  }, [agentId, scope])

  const entityMemories = memories.filter(m => m.scope === "entity")
  const patternMemories = memories.filter(m => m.scope === "pattern")

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-gray-50 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (memories.length === 0) {
    return (
      <div className="text-center py-12">
        <Brain className="w-8 h-8 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">This agent hasn't learned anything yet.</p>
        <p className="text-xs text-gray-400 mt-1">Run it at least once to start building memory.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Scope filter */}
      <div className="flex items-center gap-2">
        <Button
          variant={scope === null ? "default" : "outline"}
          size="sm"
          className="text-xs h-7"
          onClick={() => setScope(null)}
        >
          All ({memories.length})
        </Button>
        <Button
          variant={scope === "entity" ? "default" : "outline"}
          size="sm"
          className="text-xs h-7"
          onClick={() => setScope("entity")}
        >
          Entities ({entityMemories.length})
        </Button>
        <Button
          variant={scope === "pattern" ? "default" : "outline"}
          size="sm"
          className="text-xs h-7"
          onClick={() => setScope("pattern")}
        >
          Patterns ({patternMemories.length})
        </Button>
      </div>

      {/* Entity memories */}
      {(!scope || scope === "entity") && entityMemories.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" />
            Entity Memories
          </h4>
          <div className="space-y-2">
            {entityMemories.map(m => (
              <div key={m.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{m.entityKey || "Unknown"}</span>
                      {m.category && <Badge variant="outline" className="text-[10px]">{m.category}</Badge>}
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{m.content.description}</p>
                  </div>
                  <ConfidenceBar value={m.confidence} />
                </div>
                <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
                  <span>{m.correctCount}/{m.totalCount} confirmations</span>
                  <span>Used {m.usageCount} times</span>
                  {m.lastUsedAt && <span>Last: {new Date(m.lastUsedAt).toLocaleDateString()}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pattern memories */}
      {(!scope || scope === "pattern") && patternMemories.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5" />
            Pattern Memories
          </h4>
          <div className="space-y-2">
            {patternMemories.map(m => (
              <div key={m.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{m.category || "General"}</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{m.content.description}</p>
                  </div>
                  <ConfidenceBar value={m.confidence} />
                </div>
                <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
                  <span>{m.correctCount}/{m.totalCount} confirmations</span>
                  <span>Used {m.usageCount} times</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
