"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Download, Database } from "lucide-react"

interface SchemaColumn {
  name: string
  duckdbType: string
  sampleValues?: string[]
}

interface Dataset {
  id: string
  name: string
  description: string | null
  tableName: string
  originalFilename: string
  fileSizeBytes: number
  status: string
  rowCount: number
  columnCount: number
  schemaSnapshot: { columns: SchemaColumn[] }
  summaryStats: any
  createdAt: string
  uploadedBy: { name: string | null; email: string }
}

export default function DatasetDetailPage() {
  const router = useRouter()
  const params = useParams()
  const datasetId = params.id as string

  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [preview, setPreview] = useState<{ rows: Record<string, unknown>[]; totalRows: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [previewLoading, setPreviewLoading] = useState(false)

  const fetchDataset = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/analysis/datasets/${datasetId}`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setDataset(data.dataset)
      }
    } catch (error) {
      console.error("Error fetching dataset:", error)
    } finally {
      setLoading(false)
    }
  }, [datasetId])

  const fetchPreview = useCallback(async () => {
    try {
      setPreviewLoading(true)
      const res = await fetch(`/api/analysis/datasets/${datasetId}/preview`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setPreview(data)
      }
    } catch (error) {
      console.error("Error fetching preview:", error)
    } finally {
      setPreviewLoading(false)
    }
  }, [datasetId])

  useEffect(() => {
    fetchDataset()
  }, [fetchDataset])

  useEffect(() => {
    if (dataset?.status === "ready") {
      fetchPreview()
    }
  }, [dataset?.status, fetchPreview])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (!dataset) {
    return (
      <div className="p-8">
        <p className="text-gray-500">Dataset not found</p>
      </div>
    )
  }

  const columns = dataset.schemaSnapshot?.columns || []

  return (
    <div className="p-8">
      {/* Back button + header */}
      <button
        onClick={() => router.push("/dashboard/analysis")}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Analysis
      </button>

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">{dataset.name}</h1>
        {dataset.description && (
          <p className="text-sm text-gray-500 mt-1">{dataset.description}</p>
        )}
        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
          <span>{dataset.rowCount.toLocaleString()} rows</span>
          <span>&middot;</span>
          <span>{dataset.columnCount} columns</span>
          <span>&middot;</span>
          <span>{dataset.originalFilename}</span>
          <span>&middot;</span>
          <span>Uploaded {new Date(dataset.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Schema */}
      <div className="mb-8">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Schema ({columns.length} columns)</h2>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Column</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Sample Values</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="px-4 py-2 text-sm font-mono text-gray-900">{col.name}</td>
                  <td className="px-4 py-2 text-sm text-gray-500">{col.duckdbType}</td>
                  <td className="px-4 py-2 text-sm text-gray-400">
                    {col.sampleValues?.join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview */}
      <div>
        <h2 className="text-sm font-medium text-gray-700 mb-3">
          Data Preview {preview && `(showing ${preview.rows.length} of ${dataset.rowCount.toLocaleString()} rows)`}
        </h2>
        {previewLoading ? (
          <div className="flex items-center justify-center py-10 border border-gray-200 rounded-lg">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : preview && preview.rows.length > 0 ? (
          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {columns.map((col, i) => (
                    <th key={i} className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="border-b border-gray-50">
                    {columns.map((col, colIdx) => (
                      <td key={colIdx} className="px-3 py-1.5 text-gray-600 whitespace-nowrap max-w-[200px] truncate">
                        {row[col.name] != null ? String(row[col.name]) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center justify-center py-10 border border-gray-200 rounded-lg text-sm text-gray-500">
            {dataset.status === "ready" ? "No preview available" : `Dataset status: ${dataset.status}`}
          </div>
        )}
      </div>
    </div>
  )
}
