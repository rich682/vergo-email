"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Scale, CheckCircle, AlertTriangle, Clock, Loader2, Plus, Users } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Button } from "@/components/ui/button"

interface ReconciliationConfig {
  id: string
  name: string
  _count: { taskInstances: number }
  runs: {
    id: string
    status: string
    matchedCount: number
    exceptionCount: number
    variance: number
    createdAt: string
    completedAt: string | null
  }[]
  createdAt: string
}

const STATUS_STYLES: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  COMPLETE: { icon: <CheckCircle className="w-3.5 h-3.5" />, label: "Complete", color: "text-green-600 bg-green-50" },
  REVIEW: { icon: <AlertTriangle className="w-3.5 h-3.5" />, label: "Review", color: "text-amber-600 bg-amber-50" },
  PROCESSING: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, label: "Processing", color: "text-blue-600 bg-blue-50" },
  PENDING: { icon: <Clock className="w-3.5 h-3.5" />, label: "Pending", color: "text-gray-600 bg-gray-50" },
}

export default function ReconciliationsPage() {
  const router = useRouter()
  const [configs, setConfigs] = useState<ReconciliationConfig[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        const res = await fetch("/api/reconciliations")
        if (res.ok) {
          const data = await res.json()
          setConfigs(data.configs || [])
        }
      } catch (err) {
        console.error("Failed to load reconciliations:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchConfigs()
  }, [])

  return (
    <div className="p-8">
      <div className="flex items-center justify-end mb-6">
        <Link href="/dashboard/reconciliations/new">
          <Button className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="w-4 h-4 mr-2" />
            New Reconciliation
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : configs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <Scale className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No reconciliations yet</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
            Build your first reconciliation by uploading two data sources. AI will detect columns and configure matching rules. Then assign it to tasks.
          </p>
          <Link href="/dashboard/reconciliations/new">
            <Button className="bg-orange-500 hover:bg-orange-600 text-white">
              <Plus className="w-4 h-4 mr-2" />
              New Reconciliation
            </Button>
          </Link>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Linked Tasks</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Last Run</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {configs.map((config) => {
                const latestRun = config.runs?.[0]
                const statusInfo = latestRun
                  ? STATUS_STYLES[latestRun.status] || STATUS_STYLES.PENDING
                  : STATUS_STYLES.PENDING
                const taskCount = config._count?.taskInstances ?? 0

                return (
                  <tr
                    key={config.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/dashboard/reconciliations/${config.id}`)}
                  >
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900 text-sm">{config.name}</div>
                      <div className="text-xs text-gray-400">
                        Created {formatDistanceToNow(new Date(config.createdAt), { addSuffix: true })}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-sm text-gray-600">
                          {taskCount} {taskCount === 1 ? "task" : "tasks"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                        {statusInfo.icon}
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {latestRun ? (
                        <div>
                          <div className="text-xs text-gray-600">
                            {latestRun.matchedCount} matched, {latestRun.exceptionCount} exceptions
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {formatDistanceToNow(new Date(latestRun.createdAt), { addSuffix: true })}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">No runs yet</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {latestRun ? (
                        <span className={`text-sm font-medium ${latestRun.variance === 0 ? "text-green-600" : "text-red-600"}`}>
                          ${Math.abs(latestRun.variance).toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
