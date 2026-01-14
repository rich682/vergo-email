"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Check, AlertCircle } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"

type Quest = {
  id: string
  originalPrompt: string
  status: string
  subject?: string
  body?: string
  htmlBody?: string
  confirmedSelection?: {
    contactTypes?: string[]
    groupIds?: string[]
  }
  scheduleConfig?: {
    type: string
    deadline?: string
  }
  remindersConfig?: {
    enabled: boolean
    frequencyHours: number
    maxCount: number
  }
  createdAt: string
  executedAt?: string
}

export default function QuestDetailPage() {
  const router = useRouter()
  const params = useParams()
  const questId = params.id as string

  const [quest, setQuest] = useState<Quest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [executing, setExecuting] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    const fetchQuest = async () => {
      try {
        const res = await fetch(`/api/quests/${questId}`)
        if (res.status === 404) {
          setError("Quest not found")
          return
        }
        if (!res.ok) {
          throw new Error("Failed to fetch quest")
        }
        const data = await res.json()
        setQuest(data.quest)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchQuest()
  }, [questId])

  const handleGenerateEmail = async () => {
    if (!quest) return
    setGenerating(true)
    try {
      const res = await fetch(`/api/quests/${questId}/generate`, {
        method: "POST"
      })
      if (!res.ok) {
        throw new Error("Failed to generate email")
      }
      const data = await res.json()
      setQuest(data.quest)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleExecute = async () => {
    if (!quest) return
    setExecuting(true)
    try {
      const res = await fetch(`/api/quests/${questId}/execute`, {
        method: "POST"
      })
      if (!res.ok) {
        throw new Error("Failed to execute quest")
      }
      setQuest(prev => prev ? { ...prev, status: "completed", executedAt: new Date().toISOString() } : null)
      router.push("/dashboard/requests")
    } catch (err: any) {
      setError(err.message)
    } finally {
      setExecuting(false)
    }
  }

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; label: string }> = {
      interpreting: { color: "border-blue-200 text-blue-700 bg-blue-50", label: "Interpreting" },
      pending_confirmation: { color: "border-amber-200 text-amber-700 bg-amber-50", label: "Pending" },
      generating: { color: "border-blue-200 text-blue-700 bg-blue-50", label: "Generating" },
      ready: { color: "border-green-200 text-green-700 bg-green-50", label: "Ready" },
      executing: { color: "border-purple-200 text-purple-700 bg-purple-50", label: "Sending" },
      completed: { color: "border-gray-200 text-gray-600", label: "Completed" },
      failed: { color: "border-red-200 text-red-700 bg-red-50", label: "Failed" }
    }
    return configs[status] || { color: "border-gray-200 text-gray-600", label: status }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
        </div>
      </div>
    )
  }

  if (error || !quest) {
    return (
      <div className="min-h-screen bg-white">
        <div className="px-8 py-6">
          <div className="max-w-lg mx-auto mt-12">
            <div className="border border-dashed border-gray-200 rounded-lg">
              <EmptyState
                icon={<AlertCircle className="w-6 h-6" />}
                title="Error"
                description={error || "Quest not found"}
                action={{
                  label: "Back to Requests",
                  onClick: () => router.push("/dashboard/requests")
                }}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const statusConfig = getStatusConfig(quest.status)

  return (
    <div className="min-h-screen bg-white">
      <div className="px-8 py-4">
        {/* Back button and status */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => router.push("/dashboard/requests")}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back</span>
          </button>
          <span className={`px-3 py-1 rounded-full text-sm font-medium border ${statusConfig.color}`}>
            {statusConfig.label}
          </span>
        </div>
        
        {/* Prompt summary */}
        <p className="text-sm text-gray-600 mb-4 bg-gray-50 px-4 py-2 rounded-lg">{quest.originalPrompt}</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Details */}
          <div className="space-y-6">
            {/* Audience */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h2 className="text-sm font-medium text-gray-900">Audience</h2>
              </div>
              <div className="p-4">
                {quest.confirmedSelection?.contactTypes?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {quest.confirmedSelection.contactTypes.map((type) => (
                      <span
                        key={type}
                        className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No audience specified</p>
                )}
              </div>
            </div>

            {/* Schedule */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h2 className="text-sm font-medium text-gray-900">Schedule</h2>
              </div>
              <div className="p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Send:</span>
                  <span className="font-medium text-gray-900">
                    {quest.scheduleConfig?.type === "immediate" ? "Immediately" : "Scheduled"}
                  </span>
                </div>
                {quest.scheduleConfig?.deadline && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Deadline:</span>
                    <span className="font-medium text-gray-900">
                      {new Date(quest.scheduleConfig.deadline).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Reminders */}
            {quest.remindersConfig?.enabled && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h2 className="text-sm font-medium text-gray-900">Reminders</h2>
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Frequency:</span>
                    <span className="font-medium text-gray-900">
                      Every {quest.remindersConfig.frequencyHours / 24} days
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Max reminders:</span>
                    <span className="font-medium text-gray-900">{quest.remindersConfig.maxCount}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="border border-gray-200 rounded-lg p-4">
              {quest.status === "pending_confirmation" && (
                <button
                  onClick={handleGenerateEmail}
                  disabled={generating}
                  className="
                    w-full px-4 py-2 rounded-lg text-sm font-medium
                    bg-gray-900 text-white
                    hover:bg-gray-800
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors
                  "
                >
                  {generating ? "Generating..." : "Generate Email"}
                </button>
              )}
              {quest.status === "ready" && (
                <button
                  onClick={handleExecute}
                  disabled={executing}
                  className="
                    w-full px-4 py-2 rounded-lg text-sm font-medium
                    bg-gray-900 text-white
                    hover:bg-gray-800
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors
                  "
                >
                  {executing ? "Sending..." : "Send Emails"}
                </button>
              )}
              {quest.status === "completed" && (
                <div className="text-center py-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Check className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="font-medium text-gray-900">Request completed</p>
                  {quest.executedAt && (
                    <p className="text-sm text-gray-500 mt-1">
                      Sent on {new Date(quest.executedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Email Preview */}
          {quest.subject && quest.body && (
            <div className="border border-gray-200 rounded-lg overflow-hidden h-fit">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h2 className="text-sm font-medium text-gray-900">Email Preview</h2>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</label>
                  <div className="mt-1 p-3 bg-gray-50 rounded-lg text-sm text-gray-900">
                    {quest.subject}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Body</label>
                  <div className="mt-1 p-3 bg-gray-50 rounded-lg text-sm text-gray-900 whitespace-pre-wrap max-h-96 overflow-auto">
                    {quest.body}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
