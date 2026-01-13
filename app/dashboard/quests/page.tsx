"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Quest = {
  id: string
  originalPrompt: string
  status: string
  createdAt: string
  confirmedSelection?: {
    contactTypes?: string[]
    groupIds?: string[]
  }
}

export default function QuestsListPage() {
  const router = useRouter()
  const [quests, setQuests] = useState<Quest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchQuests = async () => {
      try {
        const res = await fetch("/api/quests")
        if (res.status === 404) {
          setError("Quest feature is not enabled")
          return
        }
        if (!res.ok) {
          throw new Error("Failed to fetch quests")
        }
        const data = await res.json()
        setQuests(data.quests || [])
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchQuests()
  }, [])

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; label: string }> = {
      interpreting: { color: "bg-blue-100 text-blue-800", label: "Interpreting" },
      pending_confirmation: { color: "bg-yellow-100 text-yellow-800", label: "Pending Confirmation" },
      generating: { color: "bg-blue-100 text-blue-800", label: "Generating" },
      ready: { color: "bg-green-100 text-green-800", label: "Ready" },
      executing: { color: "bg-purple-100 text-purple-800", label: "Executing" },
      completed: { color: "bg-gray-100 text-gray-800", label: "Completed" },
      failed: { color: "bg-red-100 text-red-800", label: "Failed" }
    }
    const config = statusConfig[status] || { color: "bg-gray-100 text-gray-800", label: status }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading quests...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Error</h1>
        <p className="text-gray-600">{error}</p>
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
            <h2 className="text-2xl font-bold">Quests</h2>
            <p className="text-sm text-gray-600">AI-powered request creation</p>
          </div>
          <Link href="/dashboard/quest/new">
            <Button>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Quest
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 bg-gray-50">
        {quests.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No quests yet</h3>
              <p className="text-gray-500 mb-4 text-center max-w-md">
                Create your first AI-powered quest to send emails using natural language.
              </p>
              <Link href="/dashboard/quest/new">
                <Button>Create Your First Quest</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {quests.map((quest) => (
              <Link key={quest.id} href={`/dashboard/quest/${quest.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {quest.originalPrompt}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {getStatusBadge(quest.status)}
                          <span className="text-xs text-gray-500">
                            {new Date(quest.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        {quest.confirmedSelection?.contactTypes && (
                          <div className="flex gap-1 mt-2">
                            {quest.confirmedSelection.contactTypes.map((type) => (
                              <span
                                key={type}
                                className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
                              >
                                {type}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
