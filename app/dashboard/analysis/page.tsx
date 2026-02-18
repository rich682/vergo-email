"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { usePermissions } from "@/components/permissions-context"
import { Plus, Upload, MessageSquare, Database, Search, MoreHorizontal, Trash2 } from "lucide-react"
import { DatasetUploadDialog } from "@/components/analysis/dataset-upload-dialog"

interface Dataset {
  id: string
  name: string
  description: string | null
  originalFilename: string
  fileSizeBytes: number
  status: "processing" | "ready" | "failed"
  rowCount: number
  columnCount: number
  createdAt: string
  uploadedBy: { name: string | null; email: string }
}

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
  const canManage = can("analysis:manage")
  const canQuery = can("analysis:query")

  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"datasets" | "conversations">("datasets")
  const [showUpload, setShowUpload] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [dsRes, convRes] = await Promise.all([
        fetch("/api/analysis/datasets", { credentials: "include" }),
        fetch("/api/analysis/conversations", { credentials: "include" }),
      ])

      if (dsRes.ok) {
        const data = await dsRes.json()
        setDatasets(data.datasets || [])
      }
      if (convRes.ok) {
        const data = await convRes.json()
        setConversations(data.conversations || [])
      }
    } catch (error) {
      console.error("Error fetching analysis data:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleNewConversation = async () => {
    try {
      const res = await fetch("/api/analysis/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: "New Analysis" }),
      })
      if (res.ok) {
        const data = await res.json()
        router.push(`/dashboard/analysis/chat/${data.conversation.id}`)
      }
    } catch (error) {
      console.error("Error creating conversation:", error)
    }
  }

  const handleDeleteDataset = async (id: string) => {
    if (!confirm("Are you sure you want to delete this dataset? This cannot be undone.")) return
    try {
      const res = await fetch(`/api/analysis/datasets/${id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (res.ok) {
        setDatasets((prev) => prev.filter((d) => d.id !== id))
      }
    } catch (error) {
      console.error("Error deleting dataset:", error)
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

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const filteredDatasets = datasets.filter(
    (d) =>
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.originalFilename.toLowerCase().includes(searchQuery.toLowerCase())
  )

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
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {canManage && (
            <button
              onClick={() => setShowUpload(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload Dataset
            </button>
          )}
          {canQuery && (
            <button
              onClick={handleNewConversation}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("datasets")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "datasets"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            Datasets ({datasets.length})
          </div>
        </button>
        <button
          onClick={() => setActiveTab("conversations")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "conversations"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Conversations ({conversations.length})
          </div>
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : activeTab === "datasets" ? (
        filteredDatasets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Database className="w-12 h-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">No datasets yet</h3>
            <p className="text-sm text-gray-500 mb-4">
              Upload a CSV or Excel file to start analyzing your data.
            </p>
            {canManage && (
              <button
                onClick={() => setShowUpload(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Upload Dataset
              </button>
            )}
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">File</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Rows</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Columns</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Size</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Uploaded</th>
                  {canManage && <th className="w-10" />}
                </tr>
              </thead>
              <tbody>
                {filteredDatasets.map((dataset) => (
                  <tr
                    key={dataset.id}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer group"
                    onClick={() => router.push(`/dashboard/analysis/datasets/${dataset.id}`)}
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-gray-900">{dataset.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-500 truncate max-w-[200px] block">
                        {dataset.originalFilename}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {dataset.rowCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{dataset.columnCount}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatBytes(dataset.fileSizeBytes)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                          dataset.status === "ready"
                            ? "bg-green-50 text-green-700"
                            : dataset.status === "processing"
                            ? "bg-yellow-50 text-yellow-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {dataset.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(dataset.createdAt).toLocaleDateString()}
                    </td>
                    {canManage && (
                      <td className="px-2 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteDataset(dataset.id)
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded opacity-0 group-hover:opacity-100 transition-all"
                          title="Delete dataset"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : filteredConversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <MessageSquare className="w-12 h-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No conversations yet</h3>
          <p className="text-sm text-gray-500 mb-4">
            Start a new chat to ask questions about your data.
          </p>
          {canQuery && (
            <button
              onClick={handleNewConversation}
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

      {/* Upload Dialog */}
      {showUpload && (
        <DatasetUploadDialog
          onClose={() => setShowUpload(false)}
          onSuccess={() => {
            setShowUpload(false)
            fetchData()
          }}
        />
      )}
    </div>
  )
}
