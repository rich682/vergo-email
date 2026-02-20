"use client"

import { useState, useEffect, useCallback } from "react"
import { MessageSquare, Loader2, Clock, ExternalLink } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

interface AnalysisConversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  _count: { messages: number }
  taskInstance?: {
    id: string
    name: string
  } | null
}

interface BoardAnalysisTabProps {
  boardId: string
}

export function BoardAnalysisTab({ boardId }: BoardAnalysisTabProps) {
  const router = useRouter()
  const [conversations, setConversations] = useState<AnalysisConversation[]>([])
  const [loading, setLoading] = useState(true)

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/analysis/conversations?boardId=${boardId}`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations || [])
      }
    } catch (error) {
      console.error("Error fetching board analysis:", error)
    } finally {
      setLoading(false)
    }
  }, [boardId])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-2 text-sm text-gray-500">No analysis conversations for this board yet</p>
        <p className="text-xs text-gray-400 mt-1">
          Analysis conversations linked to tasks in this board will appear here
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {conversations.map((conv) => (
        <div
          key={conv.id}
          className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
          onClick={() => router.push(`/dashboard/analysis/chat/${conv.id}`)}
        >
          <div className="flex items-center gap-3">
            <MessageSquare className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-gray-900">{conv.title}</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {conv._count.messages} messages &middot;{" "}
                {new Date(conv.updatedAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          {conv.taskInstance && (
            <Link
              href={`/dashboard/jobs/${conv.taskInstance.id}`}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {conv.taskInstance.name}
              <ExternalLink className="w-3 h-3" />
            </Link>
          )}
        </div>
      ))}
    </div>
  )
}
