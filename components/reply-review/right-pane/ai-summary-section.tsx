"use client"

import { useState, useEffect } from "react"
import { ChevronDown, ChevronRight, Sparkles, RefreshCw, CheckCircle, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface AISummarySectionProps {
  messageId: string
  taskSummary: string | null
  messageBody: string | null
  fromAddress: string
}

export function AISummarySection({ 
  messageId, 
  taskSummary, 
  messageBody,
  fromAddress
}: AISummarySectionProps) {
  const [expanded, setExpanded] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [recommendedAction, setRecommendedAction] = useState<string | null>(null)
  const [reasoning, setReasoning] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Generate summary on first expand if no task summary exists
  useEffect(() => {
    if (taskSummary) {
      setSummary(taskSummary)
    }
  }, [taskSummary])

  const generateSummary = async () => {
    if (loading) return
    setLoading(true)

    try {
      const response = await fetch("/api/review/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messageId })
      })

      if (response.ok) {
        const data = await response.json()
        // Combine summary bullets into a paragraph
        const summaryText = data.summaryBullets?.join(" ") || "No summary available."
        setSummary(summaryText)
        // Store the AI recommendation
        setRecommendedAction(data.recommendedAction || null)
        setReasoning(data.reasoning || null)
      }
    } catch {
      // Fallback: extract first 2-3 sentences from message body
      if (messageBody) {
        const sentences = messageBody
          .split(/[.!?]+/)
          .filter(s => s.trim().length > 10)
          .slice(0, 2)
          .map(s => s.trim())
          .join(". ")
        setSummary(sentences ? `${sentences}.` : "Reply received.")
      } else {
        setSummary("Reply received.")
      }
      // Clear recommendation on error
      setRecommendedAction(null)
      setReasoning(null)
    } finally {
      setLoading(false)
    }
  }

  const handleExpand = () => {
    setExpanded(!expanded)
    if (!expanded && !summary && !loading) {
      generateSummary()
    }
  }

  // Generate a calm, deterministic summary if none exists
  const displaySummary = summary || `${fromAddress.split('@')[0]} sent a reply to your request.`

  // Map recommended action to user-friendly label
  const getRecommendationLabel = () => {
    if (!recommendedAction) return null
    if (recommendedAction === "REVIEWED") {
      return { label: "Mark as reviewed", icon: CheckCircle, color: "text-green-600" }
    }
    if (recommendedAction === "NEEDS_FOLLOW_UP") {
      return { label: "Follow up needed", icon: AlertTriangle, color: "text-amber-600" }
    }
    return null
  }

  const recommendation = getRecommendationLabel()

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={handleExpand}
        className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-orange-500" />
          <span className="text-sm font-medium text-gray-900">AI Summary</span>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="px-4 py-3 border-t border-gray-200 bg-white">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Generating summary...
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-700 leading-relaxed">
                {displaySummary}
              </p>

              {/* AI Recommendation */}
              {recommendation && (
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <span className="text-gray-500">AI suggests:</span>
                  <span className={`flex items-center gap-1 font-medium ${recommendation.color}`}>
                    <recommendation.icon className="w-3 h-3" />
                    {recommendation.label}
                  </span>
                </div>
              )}

              {/* Reasoning (shown subtly) */}
              {reasoning && (
                <p className="mt-1 text-xs text-gray-400 italic">
                  {reasoning}
                </p>
              )}
            </>
          )}

          {!loading && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                generateSummary()
              }}
              className="mt-2 h-7 text-xs text-gray-500"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Regenerate
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
