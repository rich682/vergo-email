"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { usePermissions } from "@/components/permissions-context"
import { Plus, MessageSquare, Search, Trash2 } from "lucide-react"
import { DatabaseSelectDialog } from "@/components/analysis/database-select-dialog"

interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  _count: { messages: number }
}

export default function AnalysisPage() {
  const router = useRouter()
  const { can } = usePermissions()
  const canQuery = can("analysis:query")

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [showDbSelect, setShowDbSelect] = useState(false)
  const [creating, setCreating] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/analysis/conversations", { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations || [])
      }
    } catch (error) {
      console.error("Error fetching conversations:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleNewConversation = async (databaseIds: string[]) => {
    try {
      setCreating(true)
      const res = await fetch("/api/analysis/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: "New Analysis", databaseIds }),
      })
      if (res.ok) {
        const data = await res.json()
        router.push(`/dashboard/analysis/chat/${data.conversation.id}`)
      }
    } catch (error) {
      console.error("Error creating conversation:", error)
    } finally {
      setCreating(false)
      setShowDbSelect(false)
    }
  }

  const handleDeleteConversation = async (id: string) => {
    if (!confirm("Delete this conversation?")) return
    try {
      const res = await fetch(`/api/analysis/conversations/${id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id))
      }
    } catch (error) {
      console.error("Error deleting conversation:", error)
    }
  }

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {canQuery && (
            <button
              onClick={() => setShowDbSelect(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </button>
          )}
        </div>
      </div>

      {/* Conversations */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : filteredConversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <MessageSquare className="w-12 h-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No conversations yet</h3>
          <p className="text-sm text-gray-500 mb-4">
            Start a new chat to ask questions about your databases.
          </p>
          {canQuery && (
            <button
              onClick={() => setShowDbSelect(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredConversations.map((conv) => (
            <div
              key={conv.id}
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer group"
              onClick={() => router.push(`/dashboard/analysis/chat/${conv.id}`)}
            >
              <div>
                <h3 className="text-sm font-medium text-gray-900">{conv.title}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {conv._count.messages} messages &middot;{" "}
                  {new Date(conv.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteConversation(conv.id)
                }}
                className="p-1.5 text-gray-400 hover:text-red-600 rounded opacity-0 group-hover:opacity-100 transition-all"
                title="Delete conversation"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Database Selection Dialog */}
      {showDbSelect && (
        <DatabaseSelectDialog
          onClose={() => setShowDbSelect(false)}
          onConfirm={handleNewConversation}
          loading={creating}
        />
      )}
    </div>
  )
}
