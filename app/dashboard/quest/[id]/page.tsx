"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PreviewPanel } from "@/components/compose/preview-panel"

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
      const data = await res.json()
      setQuest(prev => prev ? { ...prev, status: "completed", executedAt: new Date().toISOString() } : null)
      // Redirect to requests page
      router.push("/dashboard/requests")
    } catch (err: any) {
      setError(err.message)
    } finally {
      setExecuting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; label: string }> = {
      interpreting: { color: "bg-blue-100 text-blue-800", label: "Interpreting" },
      pending_confirmation: { color: "bg-yellow-100 text-yellow-800", label: "Pending Confirmation" },
      generating: { color: "bg-blue-100 text-blue-800", label: "Generating Email" },
      ready: { color: "bg-green-100 text-green-800", label: "Ready to Send" },
      executing: { color: "bg-purple-100 text-purple-800", label: "Sending" },
      completed: { color: "bg-gray-100 text-gray-800", label: "Completed" },
      failed: { color: "bg-red-100 text-red-800", label: "Failed" }
    }
    const config = statusConfig[status] || { color: "bg-gray-100 text-gray-800", label: status }
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${config.color}`}>
        {config.label}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading quest...</div>
      </div>
    )
  }

  if (error || !quest) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Error</h1>
        <p className="text-gray-600">{error || "Quest not found"}</p>
        <Button onClick={() => router.push("/dashboard/requests")}>
          Back to Requests
        </Button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/dashboard/requests")}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h2 className="text-2xl font-bold">Quest Details</h2>
            </div>
            <p className="text-sm text-gray-600 mt-1 ml-8">{quest.originalPrompt}</p>
          </div>
          {getStatusBadge(quest.status)}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 bg-gray-50">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quest Details */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Audience</CardTitle>
              </CardHeader>
              <CardContent>
                {quest.confirmedSelection?.contactTypes?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {quest.confirmedSelection.contactTypes.map((type) => (
                      <span
                        key={type}
                        className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No audience specified</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Schedule</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Send:</span>
                    <span className="font-medium">
                      {quest.scheduleConfig?.type === "immediate" ? "Immediately" : "Scheduled"}
                    </span>
                  </div>
                  {quest.scheduleConfig?.deadline && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Deadline:</span>
                      <span className="font-medium">
                        {new Date(quest.scheduleConfig.deadline).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {quest.remindersConfig?.enabled && (
              <Card>
                <CardHeader>
                  <CardTitle>Reminders</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Frequency:</span>
                      <span className="font-medium">
                        Every {quest.remindersConfig.frequencyHours / 24} days
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Max reminders:</span>
                      <span className="font-medium">{quest.remindersConfig.maxCount}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <Card>
              <CardContent className="pt-6">
                {quest.status === "pending_confirmation" && (
                  <Button
                    onClick={handleGenerateEmail}
                    disabled={generating}
                    className="w-full"
                  >
                    {generating ? "Generating..." : "Generate Email"}
                  </Button>
                )}
                {quest.status === "ready" && (
                  <Button
                    onClick={handleExecute}
                    disabled={executing}
                    className="w-full"
                  >
                    {executing ? "Sending..." : "Send Emails"}
                  </Button>
                )}
                {quest.status === "completed" && (
                  <div className="text-center text-green-600">
                    <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="font-medium">Quest completed</p>
                    {quest.executedAt && (
                      <p className="text-sm text-gray-500">
                        Sent on {new Date(quest.executedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Email Preview */}
          {quest.subject && quest.body && (
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Email Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Subject:</label>
                    <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm">
                      {quest.subject}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Body:</label>
                    <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm whitespace-pre-wrap max-h-96 overflow-auto">
                      {quest.body}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
