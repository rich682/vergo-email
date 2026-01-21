"use client"

import { useState, useEffect } from "react"
import { ChevronDown, ChevronUp, Sparkles, RefreshCw, AlertTriangle, CheckCircle2, Clock, Lightbulb } from "lucide-react"
import { useRouter } from "next/navigation"

interface AtRiskItem {
  id: string
  name: string
  reason: string
  dueDate: string | null
  daysUntilDue: number | null
}

interface AISummary {
  riskOverview: string
  atRiskItems: AtRiskItem[]
  recommendations: string[]
  totalItems: number
  completedItems: number
  activeItems: number
}

interface AISummaryPanelProps {
  boardId?: string | null
}

export function AISummaryPanel({ boardId }: AISummaryPanelProps) {
  const router = useRouter()
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [summary, setSummary] = useState<AISummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)

  const fetchSummary = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch("/api/task-instances/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ boardId: boardId || undefined })
      })
      
      if (!response.ok) {
        throw new Error("Failed to generate summary")
      }
      
      const data = await response.json()
      setSummary(data.summary)
      setHasLoaded(true)
    } catch (err: any) {
      console.error("Error fetching AI summary:", err)
      setError(err.message || "Failed to load summary")
    } finally {
      setIsLoading(false)
    }
  }

  // Load summary on mount and when boardId changes
  useEffect(() => {
    fetchSummary()
  }, [boardId])

  const handleItemClick = (itemId: string) => {
    router.push(`/dashboard/jobs/${itemId}`)
  }

  // Determine overall status color
  const getStatusColor = () => {
    if (!summary) return "gray"
    const overdueCount = summary.atRiskItems.filter(i => i.daysUntilDue !== null && i.daysUntilDue < 0).length
    if (overdueCount > 0) return "red"
    if (summary.atRiskItems.length > 0) return "amber"
    return "green"
  }

  const statusColor = getStatusColor()
  const statusColors = {
    red: "border-red-200 bg-red-50",
    amber: "border-amber-200 bg-amber-50",
    green: "border-green-200 bg-green-50",
    gray: "border-gray-200 bg-gray-50"
  }

  const iconColors = {
    red: "text-red-500",
    amber: "text-amber-500",
    green: "text-green-500",
    gray: "text-gray-400"
  }

  return (
    <div className={`rounded-lg border ${statusColors[statusColor]} mb-6 overflow-hidden transition-all duration-200`}>
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-lg ${statusColor === 'gray' ? 'bg-gray-100' : statusColor === 'green' ? 'bg-green-100' : statusColor === 'amber' ? 'bg-amber-100' : 'bg-red-100'}`}>
            <Sparkles className={`w-4 h-4 ${iconColors[statusColor]}`} />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-gray-900">AI Summary</h3>
            {!isExpanded && summary && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                {summary.riskOverview}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && (
            <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100/50">
          {isLoading && !hasLoaded ? (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2 text-gray-500">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span className="text-sm">Analyzing your checklist...</span>
              </div>
            </div>
          ) : error ? (
            <div className="py-4 text-center">
              <p className="text-sm text-red-600">{error}</p>
              <button
                onClick={fetchSummary}
                className="mt-2 text-sm text-blue-600 hover:text-blue-700"
              >
                Try again
              </button>
            </div>
          ) : summary ? (
            <div className="space-y-4 pt-3">
              {/* Stats Row */}
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-gray-400" />
                  <span className="text-gray-600">{summary.totalItems} total</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-gray-600">{summary.activeItems} active</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-gray-600">{summary.completedItems} completed</span>
                </div>
                {summary.atRiskItems.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-gray-600">{summary.atRiskItems.length} at risk</span>
                  </div>
                )}
              </div>

              {/* Risk Overview */}
              <div className="bg-white/60 rounded-lg p-3">
                <p className="text-sm text-gray-700 leading-relaxed">
                  {summary.riskOverview}
                </p>
              </div>

              {/* At Risk Items */}
              {summary.atRiskItems.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    Items Needing Attention
                  </h4>
                  <div className="space-y-1.5">
                    {summary.atRiskItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleItemClick(item.id)}
                        className="w-full flex items-center justify-between p-2 bg-white/60 rounded-lg hover:bg-white transition-colors text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Clock className={`w-3.5 h-3.5 flex-shrink-0 ${item.daysUntilDue !== null && item.daysUntilDue < 0 ? 'text-red-500' : 'text-amber-500'}`} />
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {item.name}
                          </span>
                        </div>
                        <span className={`text-xs flex-shrink-0 ml-2 ${item.daysUntilDue !== null && item.daysUntilDue < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                          {item.reason}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {summary.recommendations.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Lightbulb className="w-3.5 h-3.5 text-purple-500" />
                    Recommendations
                  </h4>
                  <ul className="space-y-1.5">
                    {summary.recommendations.map((rec, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm text-gray-600">
                        <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 mt-0.5" />
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Refresh Button */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={fetchSummary}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  {isLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
