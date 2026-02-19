"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Plus, MessageSquare, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SectionHeader } from "@/components/ui/section-header"
import { DatabaseSelectDialog } from "@/components/analysis/database-select-dialog"
import { formatDistanceToNow } from "date-fns"

interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  _count: { messages: number }
}

interface AnalysisTabProps {
  jobId: string
  taskName: string
}

export function AnalysisTab({ jobId, taskName }: AnalysisTabProps) {
  const router = useRouter()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [showDbSelect, setShowDbSelect] = useState(false)
  const [creating, setCreating] = useState(false)

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/analysis/conversations?taskInstanceId=${jobId}`, {
        credentials: "include",
      })
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations || [])
      }
    } catch (error) {
      console.error("Error fetching analysis conversations:", error)
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  const handleCreateConversation = async (databaseIds: string[]) => {
    try {
      setCreating(true)
      const res = await fetch("/api/analysis/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: `Analysis for ${taskName}`,
          databaseIds,
          taskInstanceId: jobId,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        router.push(`/dashboard/analysis/chat/${data.conversation.id}`)
      }
    } catch (error) {
      console.error("Error creating analysis conversation:", error)
    } finally {
      setCreating(false)
      setShowDbSelect(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader title="Analysis" icon={<MessageSquare className="w-4 h-4 text-cyan-500" />} />
        <Button size="sm" onClick={() => setShowDbSelect(true)}>
          <Plus className="w-4 h-4 mr-1" />
          New Analysis
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : conversations.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-3">No analysis conversations yet</p>
            <Button size="sm" variant="outline" onClick={() => setShowDbSelect(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Create New Analysis
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv) => (
            <Card
              key={conv.id}
              className="cursor-pointer hover:border-gray-300 transition-colors"
              onClick={() => router.push(`/dashboard/analysis/chat/${conv.id}`)}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <MessageSquare className="w-4 h-4 text-cyan-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{conv.title}</p>
                    <p className="text-xs text-gray-500">
                      {conv._count.messages} messages
                    </p>
                  </div>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true })}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showDbSelect && (
        <DatabaseSelectDialog
          onClose={() => setShowDbSelect(false)}
          onConfirm={handleCreateConversation}
          loading={creating}
        />
      )}
    </div>
  )
}
