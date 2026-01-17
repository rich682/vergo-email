"use client"

import { useState } from "react"
import { X, Mail, Clock, Users, Calendar, Bell, ChevronDown, ChevronRight, Eye, Check, Pause, PlayCircle, AlertCircle, MoreHorizontal, MessageSquare } from "lucide-react"
import { format } from "date-fns"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Recipient {
  id: string
  entityId?: string
  name: string
  email: string
  status: string
  sentMessage: {
    subject: string
    body: string
    sentAt: string
  } | null
}

interface ReminderConfig {
  enabled: boolean
  frequencyHours: number | null
  maxCount: number | null
}

interface RequestDetail {
  id: string
  prompt: string
  generatedSubject: string | null
  generatedBody: string | null
  generatedHtmlBody: string | null
  subjectTemplate: string | null
  bodyTemplate: string | null
  htmlBodyTemplate: string | null
  suggestedCampaignName: string | null
  status: string
  sentAt: string | null
  createdAt: string
  updatedAt: string
  deadlineDate: string | null
  taskCount: number
  reminderConfig: ReminderConfig | null
  recipients: Recipient[]
  user: {
    id: string
    name: string | null
    email: string
  }
}

interface RequestDetailModalProps {
  request: RequestDetail
  onClose: () => void
  onStatusChange?: () => void
}

// Status options for recipient tasks - No reply, Replied, Complete
const RECIPIENT_STATUS_OPTIONS = [
  { value: "NO_REPLY", label: "No reply", icon: Clock, color: "amber" },
  { value: "REPLIED", label: "Replied", icon: MessageSquare, color: "blue" },
  { value: "COMPLETE", label: "Complete", icon: Check, color: "green" },
]

// Map legacy statuses to new status display
const LEGACY_STATUS_MAP: Record<string, string> = {
  AWAITING_RESPONSE: "NO_REPLY",
  IN_PROGRESS: "NO_REPLY",
  HAS_ATTACHMENTS: "REPLIED",
  VERIFYING: "REPLIED",
  FULFILLED: "COMPLETE",
  REJECTED: "COMPLETE",
  FLAGGED: "NO_REPLY",
  MANUAL_REVIEW: "NO_REPLY",
  ON_HOLD: "NO_REPLY",
}

function RecipientStatusBadge({ status }: { status: string }) {
  // Map legacy status to new status if needed
  const mappedStatus = LEGACY_STATUS_MAP[status] || status
  const statusConfig = RECIPIENT_STATUS_OPTIONS.find(s => s.value === mappedStatus)
  
  const colorClasses: Record<string, string> = {
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    gray: "bg-gray-100 text-gray-700",
  }
  
  if (!statusConfig) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
        {status.replace(/_/g, ' ')}
      </span>
    )
  }
  
  const Icon = statusConfig.icon
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${colorClasses[statusConfig.color]}`}>
      <Icon className="w-3 h-3" />
      {statusConfig.label}
    </span>
  )
}

export function RequestDetailModal({ request, onClose, onStatusChange }: RequestDetailModalProps) {
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null)
  const [recipientsExpanded, setRecipientsExpanded] = useState(true)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [localRecipients, setLocalRecipients] = useState<Recipient[]>(request.recipients)

  // Get the subject and body to display
  const displaySubject = request.subjectTemplate || request.generatedSubject || "No subject"
  const displayBody = request.bodyTemplate || request.generatedBody || "No content"

  // Format reminder frequency for display
  const formatReminderFrequency = (hours: number | null) => {
    if (!hours) return "Not set"
    if (hours < 24) return `Every ${hours} hour${hours !== 1 ? 's' : ''}`
    const days = Math.round(hours / 24)
    return `Every ${days} day${days !== 1 ? 's' : ''}`
  }

  // Handle status change for a recipient
  const handleStatusChange = async (recipientId: string, newStatus: string) => {
    setUpdatingStatus(recipientId)
    try {
      const response = await fetch(`/api/tasks/${recipientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus })
      })
      
      if (!response.ok) {
        throw new Error("Failed to update status")
      }
      
      // Update local state
      setLocalRecipients(prev => 
        prev.map(r => r.id === recipientId ? { ...r, status: newStatus } : r)
      )
      
      // Update selected recipient if it's the one being changed
      if (selectedRecipient?.id === recipientId) {
        setSelectedRecipient(prev => prev ? { ...prev, status: newStatus } : null)
      }
      
      // Notify parent to refresh
      onStatusChange?.()
    } catch (err) {
      console.error("Error updating status:", err)
    } finally {
      setUpdatingStatus(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Request Details</h2>
              <p className="text-sm text-gray-500">
                {request.sentAt 
                  ? `Sent ${format(new Date(request.sentAt), "MMM d, yyyy 'at' h:mm a")}`
                  : `Created ${format(new Date(request.createdAt), "MMM d, yyyy 'at' h:mm a")}`
                }
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Request Info */}
            <div className="space-y-6">
              {/* Meta Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <Users className="w-4 h-4" />
                    Recipients
                  </div>
                  <div className="text-2xl font-semibold text-gray-900">
                    {request.taskCount}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <Clock className="w-4 h-4" />
                    Status
                  </div>
                  <div className="text-lg font-medium">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${
                      request.status === 'SENT' 
                        ? 'bg-green-100 text-green-800' 
                        : request.status === 'DRAFT'
                        ? 'bg-gray-100 text-gray-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {request.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Reminder Config */}
              {request.reminderConfig && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-blue-700 text-sm font-medium mb-2">
                    <Bell className="w-4 h-4" />
                    Reminder Schedule
                  </div>
                  {request.reminderConfig.enabled ? (
                    <div className="text-sm text-blue-900">
                      <p>{formatReminderFrequency(request.reminderConfig.frequencyHours)}</p>
                      {request.reminderConfig.maxCount && (
                        <p className="text-blue-700 mt-1">
                          Up to {request.reminderConfig.maxCount} reminder{request.reminderConfig.maxCount !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-blue-700">Reminders disabled</p>
                  )}
                </div>
              )}

              {/* Deadline */}
              {request.deadlineDate && (
                <div className="bg-amber-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-amber-700 text-sm font-medium mb-1">
                    <Calendar className="w-4 h-4" />
                    Deadline
                  </div>
                  <p className="text-sm text-amber-900">
                    {format(new Date(request.deadlineDate), "MMMM d, yyyy")}
                  </p>
                </div>
              )}

              {/* Recipients List */}
              <div className="border border-gray-200 rounded-lg">
                <button
                  onClick={() => setRecipientsExpanded(!recipientsExpanded)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-500" />
                    <span className="font-medium text-gray-900">Recipients ({localRecipients.length})</span>
                  </div>
                  {recipientsExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  )}
                </button>
                {recipientsExpanded && (
                  <div className="border-t border-gray-200 max-h-64 overflow-y-auto">
                    {localRecipients.map((recipient) => (
                      <div
                        key={recipient.id}
                        className={`flex items-center justify-between p-3 hover:bg-gray-50 transition-colors ${
                          selectedRecipient?.id === recipient.id ? 'bg-purple-50' : ''
                        }`}
                      >
                        <div 
                          className="flex items-center gap-3 flex-1 cursor-pointer"
                          onClick={() => setSelectedRecipient(recipient)}
                        >
                          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 text-xs font-medium">
                            {recipient.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{recipient.name}</div>
                            <div className="text-xs text-gray-500">{recipient.email}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Select 
                            value={recipient.status} 
                            onValueChange={(value) => handleStatusChange(recipient.id, value)}
                            disabled={updatingStatus === recipient.id}
                          >
                            <SelectTrigger className="w-[130px] h-7 text-xs border-0 bg-transparent hover:bg-gray-100">
                              <SelectValue>
                                <RecipientStatusBadge status={recipient.status} />
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {RECIPIENT_STATUS_OPTIONS.map(option => {
                                const Icon = option.icon
                                return (
                                  <SelectItem key={option.value} value={option.value}>
                                    <span className="flex items-center gap-2">
                                      <Icon className="w-3 h-3" />
                                      {option.label}
                                    </span>
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>
                          <button
                            onClick={() => setSelectedRecipient(recipient)}
                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                            title="View email"
                          >
                            <Eye className="w-4 h-4 text-gray-400" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Email Preview */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <h3 className="font-medium text-gray-900 text-sm">
                  {selectedRecipient 
                    ? `Email sent to ${selectedRecipient.name}`
                    : 'Email Template'
                  }
                </h3>
                {selectedRecipient && selectedRecipient.sentMessage?.sentAt && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Sent {format(new Date(selectedRecipient.sentMessage.sentAt), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                )}
              </div>
              <div className="p-4">
                {/* Subject */}
                <div className="mb-4">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Subject</label>
                  <div className="mt-1 text-sm text-gray-900 font-medium">
                    {selectedRecipient?.sentMessage?.subject || displaySubject}
                  </div>
                </div>
                
                {/* Body */}
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Message</label>
                  <div 
                    className="mt-2 p-4 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 max-h-80 overflow-y-auto"
                    style={{ fontFamily: 'Arial, sans-serif', whiteSpace: 'pre-wrap' }}
                  >
                    {selectedRecipient?.sentMessage?.body || displayBody}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
