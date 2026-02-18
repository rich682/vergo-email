"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Send, ChevronDown, ChevronUp, Clock, Loader2 } from "lucide-react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  generatedSql: string | null
  queryResultJson: Record<string, unknown>[] | null
  queryRowCount: number | null
  queryDurationMs: number | null
  queryError: string | null
  createdAt: string
}

interface Conversation {
  id: string
  title: string
  databaseIds: string[]
  messages: Message[]
}

export default function AnalysisChatPage() {
  const router = useRouter()
  const params = useParams()
  const conversationId = params.id as string

  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const fetchConversation = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/analysis/conversations/${conversationId}`, {
        credentials: "include",
      })
      if (res.ok) {
        const data = await res.json()
        setConversation(data.conversation)
        setMessages(data.conversation.messages || [])
      }
    } catch (error) {
      console.error("Error fetching conversation:", error)
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  useEffect(() => {
    fetchConversation()
  }, [fetchConversation])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async () => {
    const msg = input.trim()
    if (!msg || sending) return

    setInput("")
    setSending(true)

    // Optimistically add user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: msg,
      generatedSql: null,
      queryResultJson: null,
      queryRowCount: null,
      queryDurationMs: null,
      queryError: null,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempUserMsg])

    try {
      const res = await fetch(`/api/analysis/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: msg }),
      })

      if (res.ok) {
        const data = await res.json()
        setMessages((prev) => [...prev.filter((m) => m.id !== tempUserMsg.id), tempUserMsg, data.message])
      } else {
        const data = await res.json()
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "assistant",
            content: data.error || "Something went wrong. Please try again.",
            generatedSql: null,
            queryResultJson: null,
            queryRowCount: null,
            queryDurationMs: null,
            queryError: data.error,
            createdAt: new Date().toISOString(),
          },
        ])
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "Failed to send message. Please check your connection.",
          generatedSql: null,
          queryResultJson: null,
          queryRowCount: null,
          queryDurationMs: null,
          queryError: "Network error",
          createdAt: new Date().toISOString(),
        },
      ])
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-100 flex-shrink-0">
        <button
          onClick={() => router.push("/dashboard/analysis")}
          className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-sm font-medium text-gray-900">
          {conversation?.title || "Analysis Chat"}
        </h1>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-lg font-medium text-gray-900 mb-1">Ask a question about your data</p>
            <p className="text-sm text-gray-500 max-w-md">
              Try something like &quot;What are the top 10 customers by revenue?&quot; or &quot;Show me monthly sales trends&quot;
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.role === "user" ? (
              <div className="flex justify-end">
                <div className="max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2.5">
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ) : (
              <div className="flex justify-start">
                <div className="max-w-[85%] space-y-3">
                  {/* Explanation */}
                  <div className="bg-gray-50 rounded-2xl rounded-bl-md px-4 py-3">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{msg.content}</p>
                  </div>

                  {/* SQL Block (collapsible) */}
                  {msg.generatedSql && <SqlBlock sql={msg.generatedSql} />}

                  {/* Query Results */}
                  {msg.queryResultJson && (msg.queryResultJson as any[]).length > 0 && (
                    <ResultTable
                      rows={msg.queryResultJson as Record<string, unknown>[]}
                      totalRows={msg.queryRowCount}
                      durationMs={msg.queryDurationMs}
                    />
                  )}

                  {/* Error */}
                  {msg.queryError && !msg.queryResultJson && (
                    <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
                      Query error: {msg.queryError}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-gray-50 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing...
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-gray-100 px-6 py-3">
        <div className="flex items-end gap-3 max-w-4xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your data..."
            rows={1}
            className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none max-h-32"
            style={{ minHeight: "42px" }}
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Sub-components ---

function SqlBlock({ sql }: { sql: string }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span>SQL Query</span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {expanded && (
        <pre className="px-3 py-2 text-xs text-gray-700 bg-gray-900 text-gray-300 overflow-x-auto">
          <code>{sql}</code>
        </pre>
      )}
    </div>
  )
}

function ResultTable({
  rows,
  totalRows,
  durationMs,
}: {
  rows: Record<string, unknown>[]
  totalRows: number | null
  durationMs: number | null
}) {
  const [showAll, setShowAll] = useState(false)
  const displayRows = showAll ? rows : rows.slice(0, 10)
  const columns = rows.length > 0 ? Object.keys(rows[0]) : []

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200">
        <span className="text-xs text-gray-500">
          {totalRows === -1 ? "500+" : totalRows} rows
          {durationMs != null && ` · ${durationMs}ms`}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-80">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              {columns.map((col) => (
                <th key={col} className="text-left px-2 py-1.5 font-medium text-gray-500 whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, i) => (
              <tr key={i} className="border-t border-gray-50">
                {columns.map((col) => (
                  <td key={col} className="px-2 py-1 text-gray-700 whitespace-nowrap max-w-[200px] truncate">
                    {row[col] != null ? String(row[col]) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Show more */}
      {rows.length > 10 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 border-t border-gray-200 transition-colors"
        >
          {showAll ? `Show less` : `Show all ${rows.length} rows`}
        </button>
      )}
    </div>
  )
}
