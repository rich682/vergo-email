"use client"

import { useState, useCallback, useEffect } from "react"
import {
  Sparkles,
  X,
  Maximize2,
  Minimize2,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Minus,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  BarChart3,
} from "lucide-react"
import { Button } from "@/components/ui/button"

// ============================================
// Types (matching service types)
// ============================================

interface KeyFinding {
  category: "positive" | "negative" | "neutral"
  title: string
  detail: string
  value?: string
  change?: string
}

interface ConcerningTrend {
  severity: "warning" | "critical"
  entity: string
  metric: string
  description: string
  value?: string
  recommendation?: string
}

interface DataHighlight {
  label: string
  value: string
  context?: string
}

interface PeriodComparison {
  currentPeriod: string
  comparePeriod: string
  changes: Array<{
    metric: string
    currentValue: string
    previousValue: string
    changePercent: string
    trend: "up" | "down" | "flat"
  }>
}

interface ReportInsight {
  executiveSummary: string
  keyFindings: KeyFinding[]
  periodComparison: PeriodComparison | null
  concerningTrends: ConcerningTrend[]
  recommendations: string[]
  dataHighlights: DataHighlight[]
  generatedAt: Date
}

// ============================================
// Component Props
// ============================================

interface ReportInsightsPanelProps {
  reportId: string
  periodKey: string
  filterBindings?: Record<string, string[]>
  compareMode?: "none" | "mom" | "yoy"
  onClose: () => void
}

// ============================================
// Component
// ============================================

export function ReportInsightsPanel({
  reportId,
  periodKey,
  filterBindings,
  compareMode = "mom",
  onClose,
}: ReportInsightsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [insights, setInsights] = useState<ReportInsight | null>(null)
  const [context, setContext] = useState<{ reportName: string; filterSummary: string } | null>(null)
  const [copiedSection, setCopiedSection] = useState<string | null>(null)

  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    findings: true,
    comparison: true,
    trends: true,
    recommendations: true,
    highlights: false,
  })

  // Fetch insights on mount
  const fetchInsights = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/reports/${reportId}/insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          periodKey,
          filterBindings,
          compareMode,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to generate insights")
      }

      const data = await response.json()
      setInsights(data.insights)
      setContext(data.context)
    } catch (err: any) {
      setError(err.message || "Failed to generate insights")
    } finally {
      setLoading(false)
    }
  }, [reportId, periodKey, filterBindings, compareMode])

  // Initial fetch on mount
  useEffect(() => {
    fetchInsights()
  }, [fetchInsights])

  // Toggle section expansion
  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  // Copy content to clipboard
  const copyToClipboard = async (text: string, section: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedSection(section)
      setTimeout(() => setCopiedSection(null), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  // Build full content for copying
  const getFullContent = () => {
    if (!insights || !context) return ""

    const lines: string[] = []
    lines.push(`AI INSIGHTS: ${context.reportName}`)
    lines.push(`Period: ${periodKey} | Filters: ${context.filterSummary}`)
    lines.push("")
    lines.push("EXECUTIVE SUMMARY")
    lines.push(insights.executiveSummary)
    lines.push("")
    
    if (insights.keyFindings.length > 0) {
      lines.push("KEY FINDINGS")
      insights.keyFindings.forEach((f, i) => {
        lines.push(`${i + 1}. ${f.title}`)
        lines.push(`   ${f.detail}`)
      })
      lines.push("")
    }

    if (insights.concerningTrends.length > 0) {
      lines.push("CONCERNING TRENDS")
      insights.concerningTrends.forEach(t => {
        lines.push(`- ${t.entity}: ${t.description}`)
        if (t.recommendation) lines.push(`  Recommendation: ${t.recommendation}`)
      })
      lines.push("")
    }

    if (insights.recommendations.length > 0) {
      lines.push("RECOMMENDATIONS")
      insights.recommendations.forEach((r, i) => {
        lines.push(`${i + 1}. ${r}`)
      })
    }

    return lines.join("\n")
  }

  return (
    <div
      className={`fixed top-0 right-0 h-full bg-white shadow-2xl border-l border-gray-200 flex flex-col z-[100] transition-all duration-300 ${
        isExpanded ? "w-[90vw]" : "w-[450px]"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-purple-100 rounded-lg">
            <Sparkles className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">AI Insights</h2>
            {context && (
              <p className="text-xs text-gray-500">{context.reportName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(getFullContent(), "all")}
            title="Copy all insights"
            className="h-8 w-8 p-0"
          >
            {copiedSection === "all" ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <Copy className="w-4 h-4 text-gray-500" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchInsights}
            disabled={loading}
            title="Regenerate insights"
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? "Collapse" : "Expand"}
            className="h-8 w-8 p-0"
          >
            {isExpanded ? (
              <Minimize2 className="w-4 h-4 text-gray-500" />
            ) : (
              <Maximize2 className="w-4 h-4 text-gray-500" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="w-4 h-4 text-gray-500" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            <p className="text-sm">Analyzing report data...</p>
            <p className="text-xs text-gray-400">This may take a few seconds</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="font-medium text-gray-900">Failed to generate insights</p>
            <p className="text-sm text-gray-500">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchInsights}
              className="mt-2"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        ) : insights ? (
          <div className="p-4 space-y-4">
            {/* Executive Summary */}
            <div className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-100">
              <p className="text-sm text-gray-800 leading-relaxed">
                {insights.executiveSummary}
              </p>
            </div>

            {/* Key Findings */}
            {insights.keyFindings.length > 0 && (
              <Section
                title="Key Findings"
                icon={<CheckCircle2 className="w-4 h-4 text-blue-500" />}
                isExpanded={expandedSections.findings}
                onToggle={() => toggleSection("findings")}
              >
                <div className="space-y-3">
                  {insights.keyFindings.map((finding, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${
                        finding.category === "positive"
                          ? "bg-green-50 border-green-200"
                          : finding.category === "negative"
                          ? "bg-red-50 border-red-200"
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {finding.category === "positive" ? (
                          <TrendingUp className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        ) : finding.category === "negative" ? (
                          <TrendingDown className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                        ) : (
                          <Minus className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-gray-900">{finding.title}</p>
                          <p className="text-sm text-gray-600 mt-0.5">{finding.detail}</p>
                          {(finding.value || finding.change) && (
                            <div className="flex items-center gap-3 mt-2 text-xs">
                              {finding.value && (
                                <span className="px-2 py-0.5 bg-white rounded border border-gray-200 font-medium">
                                  {finding.value}
                                </span>
                              )}
                              {finding.change && (
                                <span className={`font-medium ${
                                  finding.category === "positive" ? "text-green-600" :
                                  finding.category === "negative" ? "text-red-600" : "text-gray-600"
                                }`}>
                                  {finding.change}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Period Comparison */}
            {insights.periodComparison && (
              <Section
                title="Period Comparison"
                icon={<BarChart3 className="w-4 h-4 text-purple-500" />}
                isExpanded={expandedSections.comparison}
                onToggle={() => toggleSection("comparison")}
              >
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 mb-3">
                    {insights.periodComparison.currentPeriod} vs {insights.periodComparison.comparePeriod}
                  </p>
                  {insights.periodComparison.changes.map((change, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200"
                    >
                      <span className="text-sm font-medium text-gray-700">{change.metric}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{change.previousValue}</span>
                        <span className="text-gray-400">→</span>
                        <span className="text-sm font-medium text-gray-900">{change.currentValue}</span>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          change.trend === "up" ? "bg-green-100 text-green-700" :
                          change.trend === "down" ? "bg-red-100 text-red-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>
                          {change.changePercent}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Concerning Trends */}
            {insights.concerningTrends.length > 0 && (
              <Section
                title="Concerning Trends"
                icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
                isExpanded={expandedSections.trends}
                onToggle={() => toggleSection("trends")}
                badgeCount={insights.concerningTrends.length}
                badgeColor="amber"
              >
                <div className="space-y-3">
                  {insights.concerningTrends.map((trend, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${
                        trend.severity === "critical"
                          ? "bg-red-50 border-red-200"
                          : "bg-amber-50 border-amber-200"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                          trend.severity === "critical" ? "text-red-500" : "text-amber-500"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-gray-900">{trend.entity}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              trend.severity === "critical"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                            }`}>
                              {trend.severity}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">{trend.description}</p>
                          {trend.value && (
                            <p className="text-xs font-medium text-gray-700 mt-1">{trend.value}</p>
                          )}
                          {trend.recommendation && (
                            <p className="text-xs text-gray-500 mt-2 italic">
                              Recommendation: {trend.recommendation}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Recommendations */}
            {insights.recommendations.length > 0 && (
              <Section
                title="Recommendations"
                icon={<Lightbulb className="w-4 h-4 text-yellow-500" />}
                isExpanded={expandedSections.recommendations}
                onToggle={() => toggleSection("recommendations")}
              >
                <ol className="space-y-2">
                  {insights.recommendations.map((rec, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-3 p-2 bg-yellow-50 rounded border border-yellow-200"
                    >
                      <span className="flex-shrink-0 w-5 h-5 bg-yellow-200 text-yellow-800 rounded-full text-xs font-medium flex items-center justify-center">
                        {index + 1}
                      </span>
                      <p className="text-sm text-gray-700">{rec}</p>
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            {/* Data Highlights */}
            {insights.dataHighlights.length > 0 && (
              <Section
                title="Data Highlights"
                icon={<BarChart3 className="w-4 h-4 text-gray-500" />}
                isExpanded={expandedSections.highlights}
                onToggle={() => toggleSection("highlights")}
              >
                <div className="grid grid-cols-2 gap-2">
                  {insights.dataHighlights.map((highlight, index) => (
                    <div
                      key={index}
                      className="p-3 bg-gray-50 rounded border border-gray-200"
                    >
                      <p className="text-xs text-gray-500">{highlight.label}</p>
                      <p className="font-semibold text-gray-900 mt-0.5">{highlight.value}</p>
                      {highlight.context && (
                        <p className="text-xs text-gray-500 mt-1">{highlight.context}</p>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Generated timestamp */}
            <p className="text-xs text-gray-400 text-center pt-2">
              Generated {new Date(insights.generatedAt).toLocaleString()}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ============================================
// Section Component
// ============================================

interface SectionProps {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  isExpanded: boolean
  onToggle: () => void
  badgeCount?: number
  badgeColor?: "amber" | "red" | "blue"
}

function Section({
  title,
  icon,
  children,
  isExpanded,
  onToggle,
  badgeCount,
  badgeColor = "blue",
}: SectionProps) {
  const badgeColors = {
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-sm text-gray-700">{title}</span>
          {badgeCount !== undefined && badgeCount > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded ${badgeColors[badgeColor]}`}>
              {badgeCount}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {isExpanded && <div className="p-3">{children}</div>}
    </div>
  )
}

// ============================================
// Insights Button Component (for integration)
// ============================================

interface InsightsButtonProps {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}

export function InsightsButton({ onClick, disabled, loading }: InsightsButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled || loading}
      className="gap-1.5"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Sparkles className="w-4 h-4 text-purple-500" />
      )}
      <span>AI Insights</span>
    </Button>
  )
}
