"use client"

import { format } from "date-fns"
import { 
  User, 
  Calendar, 
  Mail, 
  Briefcase,
  Paperclip,
  AlertTriangle,
  Check,
  Clock,
  Bot,
  FileText
} from "lucide-react"

interface ReviewData {
  message: {
    id: string
    fromAddress: string
    createdAt: string
    aiClassification: string | null
    aiReasoning: string | null
    isAutoReply: boolean
    body: string | null
  }
  task: {
    id: string
    status: string
    campaignName: string | null
    aiSummary: string | null
    aiSummaryConfidence: string | null
    riskLevel: string | null
    riskReason: string | null
    entity: {
      firstName: string
      lastName: string | null
      email: string | null
    } | null
  }
  job: {
    id: string
    name: string
    board: {
      id: string
      name: string
    } | null
  } | null
  attachments: Array<{
    id: string
    filename: string
    mimeType: string | null
    status: string
  }>
  reviewStatus: string
}

interface OverviewTabProps {
  data: ReviewData
}

function extractKeyPoints(body: string | null): string[] {
  if (!body) return []
  
  // Simple extraction: take first 3 sentences or meaningful lines
  const lines = body
    .split(/[.\n]/)
    .map(l => l.trim())
    .filter(l => l.length > 20 && !l.startsWith('>')) // Filter quoted lines
    .slice(0, 3)
    .map(l => l.length > 100 ? l.substring(0, 100) + '...' : l)
  
  return lines
}

export function OverviewTab({ data }: OverviewTabProps) {
  const keyPoints = data.task.aiSummary 
    ? [data.task.aiSummary]
    : extractKeyPoints(data.message.body)

  const entityName = data.task.entity
    ? [data.task.entity.firstName, data.task.entity.lastName].filter(Boolean).join(" ")
    : data.message.fromAddress

  return (
    <div className="p-4 space-y-6">
      {/* Summary Card */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Response Summary
        </h3>
        
        {/* Who and When */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex items-start gap-2">
            <User className="w-4 h-4 text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500">From</p>
              <p className="text-sm font-medium text-gray-900">{entityName}</p>
              <p className="text-xs text-gray-500">{data.message.fromAddress}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500">Received</p>
              <p className="text-sm font-medium text-gray-900">
                {format(new Date(data.message.createdAt), "MMM d, yyyy")}
              </p>
              <p className="text-xs text-gray-500">
                {format(new Date(data.message.createdAt), "h:mm a")}
              </p>
            </div>
          </div>
        </div>

        {/* Key Points */}
        {keyPoints.length > 0 && (
          <div className="border-t border-gray-200 pt-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Key Points
            </p>
            <ul className="space-y-2">
              {keyPoints.map((point, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="w-1.5 h-1.5 bg-orange-400 rounded-full mt-2 flex-shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Context Card */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
          <Briefcase className="w-4 h-4" />
          Request Context
        </h3>

        <div className="space-y-3">
          {data.job && (
            <div className="flex items-start gap-2">
              <Mail className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500">Job</p>
                <p className="text-sm font-medium text-gray-900">{data.job.name}</p>
              </div>
            </div>
          )}

          {data.job?.board && (
            <div className="flex items-start gap-2">
              <Briefcase className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500">Board</p>
                <p className="text-sm font-medium text-gray-900">{data.job.board.name}</p>
              </div>
            </div>
          )}

          {data.task.campaignName && (
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500">Campaign</p>
                <p className="text-sm font-medium text-gray-900">{data.task.campaignName}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Attachments Summary */}
      {data.attachments.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Paperclip className="w-4 h-4" />
            Attachments ({data.attachments.length})
          </h3>

          <div className="space-y-2">
            {data.attachments.map((att) => (
              <div 
                key={att.id}
                className="flex items-center justify-between p-2 bg-white rounded-md border border-gray-200"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-900 truncate">{att.filename}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  att.status === "APPROVED" 
                    ? "bg-green-100 text-green-700"
                    : att.status === "REJECTED"
                    ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-700"
                }`}>
                  {att.status === "APPROVED" && <Check className="w-3 h-3 inline mr-1" />}
                  {att.status.toLowerCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Classification */}
      {data.message.aiClassification && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Bot className="w-4 h-4" />
            AI Classification
          </h3>

          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              data.message.aiClassification === "BOUNCE" 
                ? "bg-red-100 text-red-700"
                : data.message.aiClassification === "DATA"
                ? "bg-green-100 text-green-700"
                : data.message.aiClassification === "QUESTION"
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-700"
            }`}>
              {data.message.aiClassification}
            </span>
            
            {data.message.isAutoReply && (
              <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                Auto-reply
              </span>
            )}
          </div>

          {data.message.aiReasoning && (
            <p className="text-sm text-gray-600">{data.message.aiReasoning}</p>
          )}
        </div>
      )}

      {/* Risk Assessment */}
      {data.task.riskLevel && (
        <div className={`rounded-lg p-4 ${
          data.task.riskLevel === "high" 
            ? "bg-red-50 border border-red-200"
            : data.task.riskLevel === "medium"
            ? "bg-amber-50 border border-amber-200"
            : "bg-green-50 border border-green-200"
        }`}>
          <h3 className="text-sm font-medium flex items-center gap-2 mb-2">
            <AlertTriangle className={`w-4 h-4 ${
              data.task.riskLevel === "high" 
                ? "text-red-500"
                : data.task.riskLevel === "medium"
                ? "text-amber-500"
                : "text-green-500"
            }`} />
            Risk Level: {data.task.riskLevel.charAt(0).toUpperCase() + data.task.riskLevel.slice(1)}
          </h3>
          {data.task.riskReason && (
            <p className="text-sm text-gray-700">{data.task.riskReason}</p>
          )}
        </div>
      )}
    </div>
  )
}
