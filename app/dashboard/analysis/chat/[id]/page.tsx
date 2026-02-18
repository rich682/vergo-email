"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import {
  ArrowLeft,
  Send,
  ChevronDown,
  ChevronUp,
  Loader2,
  Download,
  ArrowUpDown,
  BarChart3,
} from "lucide-react"

// --- Types ---

interface ChartConfig {
  type: "bar" | "line" | "pie" | "area"
  xKey: string
  yKeys: string[]
  title: string
}

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  generatedSql: string | null
  queryResultJson: Record<string, unknown>[] | null
  queryRowCount: number | null
  queryDurationMs: number | null
  queryError: string | null
  chartConfig: ChartConfig | null
  createdAt: string
}

interface Conversation {
  id: string
  title: string
  databaseIds: string[]
  messages: Message[]
}

// Streaming state for an in-progress assistant response
interface StreamingMessage {
  status: string | null
  sql: string | null
  result: { rows: Record<string, unknown>[]; totalRows: number; durationMs: number } | null
  chart: ChartConfig | null
  explanation: string | null
  error: string | null
}

// --- Chart Colors ---
const CHART_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
]

export default function AnalysisChatPage() {
  const router = useRouter()
  const params = useParams()
  const conversationId = params.id as string

  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [streaming, setStreaming] = useState<StreamingMessage | null>(null)
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
  }, [messages, streaming])

  const handleSend = async () => {
    const msg = input.trim()
    if (!msg || sending) return

    setInput("")
    setSending(true)
    setStreaming({ status: "Sending...", sql: null, result: null, chart: null, explanation: null, error: null })

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
      chartConfig: null,
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

      if (!res.ok) {
        const data = await res.json()
        setStreaming(null)
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
            chartConfig: null,
            createdAt: new Date().toISOString(),
          },
        ])
        setSending(false)
        return
      }

      // Read SSE stream
      const reader = res.body?.getReader()
      if (!reader) {
        throw new Error("No response body")
      }

      const decoder = new TextDecoder()
      let buffer = ""
      const streamState: StreamingMessage = {
        status: null,
        sql: null,
        result: null,
        chart: null,
        explanation: null,
        error: null,
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events from buffer
        const lines = buffer.split("\n")
        buffer = ""

        let currentEvent = ""
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6)
            try {
              const data = JSON.parse(dataStr)

              switch (currentEvent) {
                case "status":
                  streamState.status = data as string
                  break
                case "sql":
                  streamState.sql = data as string
                  break
                case "result":
                  streamState.result = data as StreamingMessage["result"]
                  break
                case "chart":
                  streamState.chart = data as ChartConfig
                  break
                case "explanation":
                  streamState.explanation = data as string
                  streamState.status = null
                  break
                case "error":
                  streamState.error = data as string
                  streamState.status = null
                  break
                case "done": {
                  // Build final message from streamed data
                  const doneData = data as { messageId: string | null }
                  const finalMsg: Message = {
                    id: doneData.messageId || `stream-${Date.now()}`,
                    role: "assistant",
                    content: streamState.explanation || streamState.error || "Analysis complete.",
                    generatedSql: streamState.sql,
                    queryResultJson: streamState.result?.rows || null,
                    queryRowCount: streamState.result?.totalRows ?? null,
                    queryDurationMs: streamState.result?.durationMs ?? null,
                    queryError: streamState.error,
                    chartConfig: streamState.chart,
                    createdAt: new Date().toISOString(),
                  }
                  setMessages((prev) => [...prev, finalMsg])
                  setStreaming(null)
                  setSending(false)
                  inputRef.current?.focus()
                  return
                }
              }

              setStreaming({ ...streamState })
            } catch {
              // Incomplete JSON — put back in buffer for next chunk
              buffer = line + "\n"
            }
            currentEvent = ""
          } else if (line === "") {
            // Empty line between events — nothing to do
          } else {
            // Incomplete line — put back in buffer
            buffer = line + "\n"
          }
        }
      }

      // Stream ended without done event
      setStreaming(null)
      setSending(false)
    } catch {
      setStreaming(null)
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
          chartConfig: null,
          createdAt: new Date().toISOString(),
        },
      ])
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
        {messages.length === 0 && !streaming && (
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
                <div className="max-w-[90%] w-full space-y-3">
                  {/* Explanation — hero element */}
                  <div className="bg-gray-50 rounded-2xl rounded-bl-md px-5 py-4">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>

                  {/* Chart */}
                  {msg.chartConfig && msg.queryResultJson && (msg.queryResultJson as unknown[]).length > 0 && (
                    <ChartBlock
                      config={msg.chartConfig}
                      rows={msg.queryResultJson as Record<string, unknown>[]}
                    />
                  )}

                  {/* Query Results */}
                  {msg.queryResultJson && (msg.queryResultJson as unknown[]).length > 0 && (
                    <ResultTable
                      rows={msg.queryResultJson as Record<string, unknown>[]}
                      totalRows={msg.queryRowCount}
                      durationMs={msg.queryDurationMs}
                    />
                  )}

                  {/* SQL Block — collapsed at bottom as technical detail */}
                  {msg.generatedSql && <SqlBlock sql={msg.generatedSql} />}

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

        {/* Streaming indicator */}
        {streaming && (
          <div className="flex justify-start">
            <div className="max-w-[90%] w-full space-y-3">
              {/* Status spinner */}
              {streaming.status && (
                <div className="bg-gray-50 rounded-2xl rounded-bl-md px-5 py-4">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                    {streaming.status}
                  </div>
                </div>
              )}

              {/* Streamed explanation — show as soon as available */}
              {streaming.explanation && (
                <div className="bg-gray-50 rounded-2xl rounded-bl-md px-5 py-4">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{streaming.explanation}</p>
                </div>
              )}

              {/* Streamed chart */}
              {streaming.chart && streaming.result && streaming.result.rows.length > 0 && (
                <ChartBlock config={streaming.chart} rows={streaming.result.rows} />
              )}

              {/* Streamed result */}
              {streaming.result && streaming.result.rows.length > 0 && (
                <ResultTable
                  rows={streaming.result.rows}
                  totalRows={streaming.result.totalRows}
                  durationMs={streaming.result.durationMs}
                />
              )}

              {/* Streamed SQL — technical detail at bottom */}
              {streaming.sql && <SqlBlock sql={streaming.sql} />}

              {/* Streamed error */}
              {streaming.error && (
                <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
                  {streaming.error}
                </div>
              )}
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
        <pre className="px-3 py-2 text-xs bg-gray-900 text-gray-300 overflow-x-auto">
          <code>{sql}</code>
        </pre>
      )}
    </div>
  )
}

// --- Chart Block ---

function ChartBlock({
  config,
  rows,
}: {
  config: ChartConfig
  rows: Record<string, unknown>[]
}) {
  if (!rows.length || !config.xKey || !config.yKeys?.length) return null

  // Limit chart data to 50 points for readability
  const chartData = rows.slice(0, 50)

  if (config.type === "pie") {
    return <PieChartBlock config={config} data={chartData} />
  }

  return <BarLineAreaChart config={config} data={chartData} />
}

/**
 * Simple bar/line/area chart using pure SVG.
 * No external charting library needed.
 */
function BarLineAreaChart({
  config,
  data,
}: {
  config: ChartConfig
  data: Record<string, unknown>[]
}) {
  const width = 600
  const height = 300
  const padding = { top: 30, right: 20, bottom: 60, left: 70 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  // Extract numeric values for y-axis
  const allValues: number[] = []
  for (const row of data) {
    for (const yKey of config.yKeys) {
      const val = Number(row[yKey])
      if (!isNaN(val)) allValues.push(val)
    }
  }

  if (allValues.length === 0) return null

  const minVal = Math.min(0, ...allValues)
  const maxVal = Math.max(...allValues)
  const range = maxVal - minVal || 1

  const scaleY = (v: number) => chartH - ((v - minVal) / range) * chartH
  const barGroupWidth = chartW / data.length

  // Y-axis ticks (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) => minVal + (range * i) / 4)

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <BarChart3 className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs font-medium text-gray-600">{config.title}</span>
      </div>
      <div className="p-4 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[600px] h-auto">
          {/* Y-axis grid lines and labels */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={padding.left}
                y1={padding.top + scaleY(tick)}
                x2={width - padding.right}
                y2={padding.top + scaleY(tick)}
                stroke="#e5e7eb"
                strokeDasharray="4"
              />
              <text
                x={padding.left - 8}
                y={padding.top + scaleY(tick) + 4}
                textAnchor="end"
                className="text-[10px] fill-gray-400"
              >
                {formatChartValue(tick)}
              </text>
            </g>
          ))}

          {/* Bars / Lines / Area */}
          {config.yKeys.map((yKey, yIdx) => {
            const color = CHART_COLORS[yIdx % CHART_COLORS.length]
            const points = data.map((row, i) => ({
              x: padding.left + i * barGroupWidth + barGroupWidth / 2,
              y: padding.top + scaleY(Number(row[yKey]) || 0),
              val: Number(row[yKey]) || 0,
            }))

            if (config.type === "bar") {
              const barW = Math.max(2, (barGroupWidth / config.yKeys.length) * 0.7)
              const barOffset = yIdx * barW - (config.yKeys.length * barW) / 2 + barW / 2
              return (
                <g key={yKey}>
                  {points.map((pt, i) => {
                    const barH = chartH - scaleY(pt.val) + scaleY(minVal) - (chartH - scaleY(minVal))
                    const barTop = pt.y
                    const actualH = padding.top + chartH - barTop
                    return (
                      <rect
                        key={i}
                        x={pt.x + barOffset - barW / 2}
                        y={barTop}
                        width={barW}
                        height={Math.max(0, actualH)}
                        fill={color}
                        opacity={0.85}
                        rx={1}
                      />
                    )
                  })}
                </g>
              )
            }

            if (config.type === "area") {
              const baseline = padding.top + scaleY(minVal)
              const areaPath = `M${points[0].x},${baseline} ${points.map((p) => `L${p.x},${p.y}`).join(" ")} L${points[points.length - 1].x},${baseline} Z`
              const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")
              return (
                <g key={yKey}>
                  <path d={areaPath} fill={color} opacity={0.15} />
                  <path d={linePath} fill="none" stroke={color} strokeWidth={2} />
                  {points.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
                  ))}
                </g>
              )
            }

            // Line chart (default)
            const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")
            return (
              <g key={yKey}>
                <path d={linePath} fill="none" stroke={color} strokeWidth={2} />
                {points.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
                ))}
              </g>
            )
          })}

          {/* X-axis labels */}
          {data.map((row, i) => {
            const x = padding.left + i * barGroupWidth + barGroupWidth / 2
            const label = String(row[config.xKey] ?? "")
            // Show every Nth label if too many
            const step = Math.ceil(data.length / 15)
            if (i % step !== 0) return null
            return (
              <text
                key={i}
                x={x}
                y={height - padding.bottom + 16}
                textAnchor="middle"
                className="text-[9px] fill-gray-500"
                transform={`rotate(-30, ${x}, ${height - padding.bottom + 16})`}
              >
                {label.length > 12 ? label.slice(0, 11) + "…" : label}
              </text>
            )
          })}

          {/* Legend */}
          {config.yKeys.length > 1 &&
            config.yKeys.map((yKey, i) => (
              <g key={yKey}>
                <rect
                  x={padding.left + i * 100}
                  y={6}
                  width={10}
                  height={10}
                  rx={2}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                />
                <text
                  x={padding.left + i * 100 + 14}
                  y={15}
                  className="text-[10px] fill-gray-600"
                >
                  {yKey}
                </text>
              </g>
            ))}
        </svg>
      </div>
    </div>
  )
}

/**
 * Simple pie chart using pure SVG.
 */
function PieChartBlock({
  config,
  data,
}: {
  config: ChartConfig
  data: Record<string, unknown>[]
}) {
  const yKey = config.yKeys[0]
  if (!yKey) return null

  const slices = data
    .map((row) => ({
      label: String(row[config.xKey] ?? ""),
      value: Math.abs(Number(row[yKey]) || 0),
    }))
    .filter((s) => s.value > 0)
    .slice(0, 12) // Max 12 slices for readability

  const total = slices.reduce((sum, s) => sum + s.value, 0)
  if (total === 0) return null

  const size = 240
  const cx = size / 2
  const cy = size / 2
  const r = 90

  let cumulative = 0
  const paths = slices.map((slice, i) => {
    const startAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2
    cumulative += slice.value
    const endAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2
    const largeArc = slice.value / total > 0.5 ? 1 : 0

    const x1 = cx + r * Math.cos(startAngle)
    const y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle)
    const y2 = cy + r * Math.sin(endAngle)

    const d = slices.length === 1
      ? `M${cx},${cy - r} A${r},${r} 0 1 1 ${cx - 0.01},${cy - r} Z`
      : `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z`

    return { d, color: CHART_COLORS[i % CHART_COLORS.length], label: slice.label, pct: ((slice.value / total) * 100).toFixed(1) }
  })

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <BarChart3 className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs font-medium text-gray-600">{config.title}</span>
      </div>
      <div className="p-4 flex items-center gap-6 flex-wrap justify-center">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {paths.map((p, i) => (
            <path key={i} d={p.d} fill={p.color} opacity={0.85} stroke="white" strokeWidth={2} />
          ))}
        </svg>
        <div className="flex flex-col gap-1">
          {paths.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: p.color }} />
              <span className="truncate max-w-[120px]">{p.label}</span>
              <span className="text-gray-400">{p.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatChartValue(val: number): string {
  if (Math.abs(val) >= 1_000_000) return (val / 1_000_000).toFixed(1) + "M"
  if (Math.abs(val) >= 1_000) return (val / 1_000).toFixed(1) + "K"
  if (Number.isInteger(val)) return String(val)
  return val.toFixed(2)
}

// --- Result Table ---

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
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const columns = rows.length > 0 ? Object.keys(rows[0]) : []

  // Sort rows
  const sortedRows = sortCol
    ? [...rows].sort((a, b) => {
        const aVal = a[sortCol]
        const bVal = b[sortCol]
        const aNum = Number(aVal)
        const bNum = Number(bVal)
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortDir === "asc" ? aNum - bNum : bNum - aNum
        }
        const aStr = String(aVal ?? "")
        const bStr = String(bVal ?? "")
        return sortDir === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr)
      })
    : rows

  const displayRows = showAll ? sortedRows : sortedRows.slice(0, 20)
  const displayCount = totalRows === -1 ? "2,000+" : totalRows?.toLocaleString() ?? rows.length.toLocaleString()

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortCol(col)
      setSortDir("asc")
    }
  }

  const handleDownloadCSV = () => {
    const header = columns.map(escapeCSV).join(",")
    const csvRows = rows.map((row) =>
      columns.map((col) => escapeCSV(String(row[col] ?? ""))).join(",")
    )
    const csv = [header, ...csvRows].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `query-results-${Date.now()}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200">
        <span className="text-xs text-gray-500">
          {displayCount} rows
          {durationMs != null && ` · ${durationMs}ms`}
        </span>
        <button
          onClick={handleDownloadCSV}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
        >
          <Download className="w-3 h-3" />
          CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-96">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  onClick={() => handleSort(col)}
                  className="text-left px-2 py-1.5 font-medium text-gray-500 whitespace-nowrap cursor-pointer hover:bg-gray-100 select-none"
                >
                  <span className="flex items-center gap-1">
                    {col}
                    <ArrowUpDown className={`w-2.5 h-2.5 ${sortCol === col ? "text-blue-500" : "text-gray-300"}`} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                {columns.map((col) => (
                  <td key={col} className="px-2 py-1 text-gray-700 whitespace-nowrap max-w-[200px] truncate">
                    {formatCellValue(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Show more */}
      {rows.length > 20 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 border-t border-gray-200 transition-colors"
        >
          {showAll ? `Show less` : `Show all ${rows.length.toLocaleString()} rows`}
        </button>
      )}
    </div>
  )
}

// --- Helpers ---

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function formatCellValue(val: unknown): string {
  if (val == null) return "—"
  if (typeof val === "number") {
    if (Number.isInteger(val)) return val.toLocaleString()
    return val.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  return String(val)
}
