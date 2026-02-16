"use client"

import { useEffect, useState } from "react"

interface MetricPoint {
  executionId: string
  agentMatchRate: number | null
  baselineMatchRate: number | null
  humanCorrections: number | null
  createdAt: string
}

interface ImprovementChartProps {
  agentId: string
}

export function ImprovementChart({ agentId }: ImprovementChartProps) {
  const [metrics, setMetrics] = useState<MetricPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch(`/api/agents/${agentId}/metrics?limit=12`)
        if (!res.ok) return
        const data = await res.json()
        setMetrics(data.metrics || [])
      } catch {
        // Non-critical — chart just stays empty
      } finally {
        setLoading(false)
      }
    }
    fetchMetrics()
  }, [agentId])

  if (loading) {
    return <div className="h-40 bg-gray-50 rounded-lg animate-pulse" />
  }

  if (metrics.length < 2) {
    return (
      <div className="h-40 bg-gray-50 rounded-lg flex items-center justify-center text-sm text-gray-400">
        Run the agent at least twice to see improvement trends
      </div>
    )
  }

  // Calculate chart dimensions
  const chartWidth = 100
  const chartHeight = 100
  const padding = 10
  const innerWidth = chartWidth - padding * 2
  const innerHeight = chartHeight - padding * 2

  const dataPoints = metrics.reverse() // oldest first
  const maxRate = 100
  const minRate = Math.max(0, Math.min(...dataPoints.map(d => d.agentMatchRate ?? 100)) - 10)

  const getX = (index: number) => padding + (index / (dataPoints.length - 1)) * innerWidth
  const getY = (value: number) => padding + innerHeight - ((value - minRate) / (maxRate - minRate)) * innerHeight

  // Build path for agent match rate
  const agentPath = dataPoints
    .filter(d => d.agentMatchRate !== null)
    .map((d, i, arr) => {
      const originalIndex = dataPoints.indexOf(d)
      const x = getX(originalIndex)
      const y = getY(d.agentMatchRate!)
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`
    })
    .join(" ")

  // Build path for baseline
  const baselinePath = dataPoints
    .filter(d => d.baselineMatchRate !== null)
    .map((d, i) => {
      const originalIndex = dataPoints.indexOf(d)
      const x = getX(originalIndex)
      const y = getY(d.baselineMatchRate!)
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`
    })
    .join(" ")

  const latestRate = dataPoints[dataPoints.length - 1]?.agentMatchRate
  const firstRate = dataPoints[0]?.agentMatchRate

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-orange-500 rounded" />
            Agent Rate
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-gray-300 rounded border-dashed" />
            Baseline
          </span>
        </div>
        {latestRate !== null && latestRate !== undefined && firstRate !== null && firstRate !== undefined && (
          <span className={`text-xs font-medium ${latestRate >= firstRate ? "text-emerald-600" : "text-red-600"}`}>
            {latestRate >= firstRate ? "+" : ""}{(latestRate - firstRate).toFixed(0)}% overall
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full h-40"
        preserveAspectRatio="none"
      >
        {/* Grid lines */}
        {[25, 50, 75, 100].map(val => {
          if (val < minRate || val > maxRate) return null
          const y = getY(val)
          return (
            <g key={val}>
              <line x1={padding} y1={y} x2={chartWidth - padding} y2={y} stroke="#f3f4f6" strokeWidth="0.3" />
              <text x={padding - 2} y={y + 1} fontSize="3" fill="#9ca3af" textAnchor="end">{val}%</text>
            </g>
          )
        })}

        {/* Baseline path */}
        {baselinePath && (
          <path d={baselinePath} fill="none" stroke="#d1d5db" strokeWidth="0.5" strokeDasharray="2,1" />
        )}

        {/* Agent path */}
        {agentPath && (
          <path d={agentPath} fill="none" stroke="#f97316" strokeWidth="0.8" />
        )}

        {/* Data points */}
        {dataPoints.map((d, i) => {
          if (d.agentMatchRate === null) return null
          return (
            <circle
              key={i}
              cx={getX(i)}
              cy={getY(d.agentMatchRate)}
              r="1.2"
              fill="#f97316"
            />
          )
        })}
      </svg>
    </div>
  )
}
