"use client"

import { useState, useEffect } from "react"
import { ChevronDown, ChevronUp, Sparkles, RefreshCw, AlertTriangle, CheckCircle2, Clock, Mail, Users } from "lucide-react"

interface RequestRecipient {
  name: string
  email: string
  status: string
  readStatus?: string // 'unread' | 'read' | 'replied'
  hasReplied?: boolean
}

interface Request {
  id: string
  status: string
  sentAt: string | null
  taskCount: number
  recipients: RequestRecipient[]
  reminderConfig?: {
    enabled: boolean
    frequencyHours: number | null
  } | null
}

interface TaskAISummaryProps {
  jobId: string
  jobName: string
  jobStatus: string
  dueDate: string | null
  requests: Request[]
  stakeholderCount: number
  taskCount: number
  respondedCount: number
  completedCount: number
}

interface AISummary {
  overview: string
  requestStatus: string
  responseRate: string
  recommendations: string[]
  urgentItems: string[]
}

export function TaskAISummary({
  jobId,
  jobName,
  jobStatus,
  dueDate,
  requests,
  stakeholderCount,
  taskCount,
  respondedCount,
  completedCount
}: TaskAISummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [summary, setSummary] = useState<AISummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchSummary = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/task-instances/${jobId}/ai-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          jobName,
          jobStatus,
          dueDate,
          requests,
          stakeholderCount,
          taskCount,
          respondedCount,
          completedCount
        })
      })
      
      if (!response.ok) {
        throw new Error("Failed to generate summary")
      }
      
      const data = await response.json()
      setSummary(data.summary)
    } catch (err: any) {
      console.error("Error fetching task AI summary:", err)
      setError(err.message || "Failed to load summary")
    } finally {
      setIsLoading(false)
    }
  }

  // Generate summary when expanded
  useEffect(() => {
    if (isExpanded && !summary && !isLoading) {
      fetchSummary()
    }
  }, [isExpanded])

  // Calculate quick stats
  const totalRecipients = requests.reduce((sum, r) => sum + r.recipients.length, 0)
  // Count recipients who have replied (using hasReplied flag or readStatus === 'replied')
  const repliedRecipients = requests.reduce((sum, r) => 
    sum + r.recipients.filter(rec => rec.hasReplied || rec.readStatus === "replied").length, 0
  )
  const pendingRecipients = totalRecipients - repliedRecipients
  const responseRate = totalRecipients > 0 ? Math.round((repliedRecipients / totalRecipients) * 100) : 0

  // Determine status color
  const getStatusColor = () => {
    if (jobStatus === "COMPLETE") return "green"
    if (pendingRecipients > 0 && dueDate) {
      const daysUntilDue = Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      if (daysUntilDue < 0) return "red"
      if (daysUntilDue <= 3) return "amber"
    }
    if (responseRate < 50 && totalRecipients > 0) return "amber"
    return "gray"
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

  // Don't show if no requests have been sent
  if (requests.length === 0) {
    return null
  }

  return (
    <div className={`rounded-lg border ${statusColors[statusColor]} overflow-hidden transition-all duration-200`}>
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
            {!isExpanded && (
              <p className="text-xs text-gray-500 mt-0.5">
                {totalRecipients} recipient{totalRecipients !== 1 ? 's' : ''} · {responseRate}% response rate
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
          {isLoading && !summary ? (
            <div className="flex items-center justify-center py-6">
              <div className="flex items-center gap-2 text-gray-500">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span className="text-sm">Analyzing requests...</span>
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
              {/* Quick Stats */}
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-gray-600">{requests.length} request{requests.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-purple-500" />
                  <span className="text-gray-600">{totalRecipients} recipient{totalRecipients !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-gray-600">{repliedRecipients} replied ({responseRate}%)</span>
                </div>
                {pendingRecipients > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-gray-600">{pendingRecipients} pending</span>
                  </div>
                )}
              </div>

              {/* Overview */}
              <div className="bg-white/60 rounded-lg p-3">
                <p className="text-sm text-gray-700 leading-relaxed">
                  {summary.overview}
                </p>
              </div>

              {/* Request Status */}
              {summary.requestStatus && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Request Status:</span> {summary.requestStatus}
                </div>
              )}

              {/* Urgent Items */}
              {summary.urgentItems && summary.urgentItems.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    Needs Attention
                  </h4>
                  <ul className="space-y-1.5">
                    {summary.urgentItems.map((item, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm text-gray-600 bg-white/60 rounded-lg p-2">
                        <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendations */}
              {summary.recommendations && summary.recommendations.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-500" />
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
