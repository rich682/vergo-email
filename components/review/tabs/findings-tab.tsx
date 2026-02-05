"use client"

import { useState, useEffect } from "react"
import { 
  Search, 
  AlertTriangle, 
  AlertCircle, 
  Info,
  CheckCircle,
  RefreshCw,
  Sparkles,
  ChevronRight
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface Finding {
  severity: "info" | "warning" | "critical"
  title: string
  explanation: string
  evidenceRef?: {
    type: "email_snippet" | "attachment"
    content?: string
    attachmentId?: string
    page?: number
  }
  suggestedAction?: string
}

interface AnalysisResult {
  summaryBullets: string[]
  findings: Finding[]
  confidence: "high" | "medium" | "low"
}

interface ReviewData {
  message: {
    id: string
  }
}

interface FindingsTabProps {
  data: ReviewData
}

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertTriangle,
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    badge: "bg-red-100 text-red-700"
  },
  warning: {
    icon: AlertCircle,
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    badge: "bg-amber-100 text-amber-700"
  },
  info: {
    icon: Info,
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    badge: "bg-blue-100 text-blue-700"
  }
}

export function FindingsTab({ data }: FindingsTabProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [expandedFindings, setExpandedFindings] = useState<Set<number>>(new Set())

  const runAnalysis = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch("/api/review/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messageId: data.message.id })
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || "Analysis failed")
      }

      const result = await response.json()
      setAnalysis(result)
    } catch (err: any) {
      console.error("Analysis error:", err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Auto-run analysis on mount
  useEffect(() => {
    runAnalysis()
  }, [data.message.id])

  const toggleFinding = (index: number) => {
    setExpandedFindings(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <RefreshCw className="w-8 h-8 animate-spin text-orange-500 mx-auto mb-3" />
        <p className="text-sm text-gray-600">Analyzing response...</p>
        <p className="text-xs text-gray-400 mt-1">This may take a few seconds</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
        <p className="text-sm text-red-600 mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={runAnalysis}>
          <RefreshCw className="w-4 h-4 mr-1" />
          Retry Analysis
        </Button>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="p-8 text-center">
        <Search className="w-8 h-8 text-gray-400 mx-auto mb-3" />
        <p className="text-sm text-gray-600 mb-3">No analysis available</p>
        <Button onClick={runAnalysis}>
          <Sparkles className="w-4 h-4 mr-1" />
          Run AI Analysis
        </Button>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      {/* Summary Bullets */}
      {analysis.summaryBullets.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-orange-500" />
            AI Summary
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              analysis.confidence === "high" 
                ? "bg-green-100 text-green-700"
                : analysis.confidence === "medium"
                ? "bg-amber-100 text-amber-700"
                : "bg-gray-100 text-gray-600"
            }`}>
              {analysis.confidence} confidence
            </span>
          </h3>
          <ul className="space-y-2">
            {analysis.summaryBullets.map((bullet, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="w-1.5 h-1.5 bg-orange-400 rounded-full mt-2 flex-shrink-0" />
                {bullet}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Findings */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-900">
            Findings ({analysis.findings.length})
          </h3>
          <Button variant="ghost" size="sm" onClick={runAnalysis}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Re-analyze
          </Button>
        </div>

        {analysis.findings.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-green-800">No Issues Flagged</p>
            <p className="text-xs text-green-600 mt-1">
              This response appears straightforward with no concerns detected.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {analysis.findings.map((finding, idx) => {
              const config = SEVERITY_CONFIG[finding.severity]
              const Icon = config.icon
              const isExpanded = expandedFindings.has(idx)

              return (
                <div
                  key={idx}
                  className={`border rounded-lg overflow-hidden ${config.border} ${config.bg}`}
                >
                  <button
                    onClick={() => toggleFinding(idx)}
                    className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-white/50 transition-colors"
                  >
                    <Icon className={`w-5 h-5 ${config.text} flex-shrink-0 mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.badge}`}>
                          {finding.severity}
                        </span>
                        <h4 className="text-sm font-medium text-gray-900">{finding.title}</h4>
                      </div>
                      {!isExpanded && (
                        <p className="text-sm text-gray-600 mt-1 truncate">
                          {finding.explanation}
                        </p>
                      )}
                    </div>
                    <ChevronRight 
                      className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${
                        isExpanded ? 'rotate-90' : ''
                      }`} 
                    />
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 space-y-3">
                      <p className="text-sm text-gray-700 pl-8">{finding.explanation}</p>

                      {finding.evidenceRef && (
                        <div className="ml-8 p-3 bg-white/70 rounded-md border border-gray-200">
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                            Source
                          </p>
                          {finding.evidenceRef.content && (
                            <p className="text-sm text-gray-600 italic">
                              "{finding.evidenceRef.content}"
                            </p>
                          )}
                          {finding.evidenceRef.attachmentId && (
                            <p className="text-xs text-gray-500 mt-1">
                              Referenced in attachment
                              {finding.evidenceRef.page && ` (page ${finding.evidenceRef.page})`}
                            </p>
                          )}
                        </div>
                      )}

                      {finding.suggestedAction && (
                        <div className="ml-8 flex items-start gap-2 text-sm">
                          <span className="font-medium text-gray-700">Suggested:</span>
                          <span className="text-gray-600">{finding.suggestedAction}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
