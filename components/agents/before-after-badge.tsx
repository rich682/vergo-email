"use client"

import { ArrowRight, TrendingUp } from "lucide-react"

interface BeforeAfterBadgeProps {
  baseline: number | null | undefined
  agentRate: number | null | undefined
  className?: string
}

export function BeforeAfterBadge({ baseline, agentRate, className = "" }: BeforeAfterBadgeProps) {
  if (agentRate === null || agentRate === undefined) return null

  const hasBaseline = baseline !== null && baseline !== undefined
  const improvement = hasBaseline ? agentRate - baseline : 0
  const isImproved = improvement > 0

  return (
    <div className={`inline-flex items-center gap-1.5 text-xs ${className}`}>
      {hasBaseline && (
        <>
          <span className="text-gray-400 font-medium">{baseline}%</span>
          <ArrowRight className="w-3 h-3 text-gray-300" />
        </>
      )}
      <span className="font-semibold text-gray-900">{agentRate}%</span>
      {hasBaseline && isImproved && (
        <span className="flex items-center gap-0.5 text-emerald-600">
          <TrendingUp className="w-3 h-3" />
          +{improvement.toFixed(0)}%
        </span>
      )}
    </div>
  )
}
