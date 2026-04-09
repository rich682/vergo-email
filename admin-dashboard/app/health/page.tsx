import Link from "next/link"
import { PrismaClient } from "@prisma/client"
import { requireAuth } from "@/lib/auth"
import { DashboardLayout } from "@/components/dashboard-layout"
import { StatCard } from "@/components/stat-card"
import { HealthDetail } from "./health-detail"

export const dynamic = "force-dynamic"

const prisma = new PrismaClient()

interface CheckResult {
  name: string
  category: string
  status: "ok" | "warning" | "critical"
  message: string
  details: Record<string, any>[]
  count: number
  link?: string
  diagnostic?: string
  fix?: string
}

async function getHealthData() {
  const results = await prisma.healthCheckResult.findMany({
    orderBy: { runAt: "desc" },
    take: 30,
  })

  return { latest: results[0] || null, history: results }
}

export default async function HealthPage() {
  requireAuth()
  const { latest, history } = await getHealthData()

  const latestResults = (latest?.results as unknown as CheckResult[] | null) || []
  const issues = latestResults.filter((r) => r.status !== "ok")
  const criticalCount = issues.filter((r) => r.status === "critical").length
  const warningCount = issues.filter((r) => r.status === "warning").length
  const passedCount = latestResults.length - issues.length

  const statusColor = latest?.status === "critical" ? "red" : latest?.status === "warning" ? "orange" : "green"
  const statusLabel = latest?.status?.toUpperCase() || "NO DATA"

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Health Monitor</h1>
            <p className="text-sm text-gray-400 mt-1">
              {latest
                ? `Last run: ${new Date(latest.runAt).toLocaleString()}`
                : "No health checks have been run yet"}
            </p>
          </div>
          <HealthDetail mode="trigger" />
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            title="Status"
            value={statusLabel}
            color={statusColor}
          />
          <StatCard
            title="Issues"
            value={issues.length}
            subtitle={`${criticalCount} critical, ${warningCount} warning`}
            color={criticalCount > 0 ? "red" : warningCount > 0 ? "orange" : "green"}
          />
          <StatCard
            title="Passed"
            value={passedCount}
            subtitle={`of ${latestResults.length} checks`}
            color="green"
          />
          <StatCard
            title="Duration"
            value={latest ? `${(latest.durationMs / 1000).toFixed(1)}s` : "-"}
            subtitle="execution time"
          />
        </div>

        {/* Issues only */}
        {issues.length > 0 ? (
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Issues Detected ({issues.length})</h2>
              <span className="text-xs text-gray-500">{passedCount} checks passed</span>
            </div>
            <div className="divide-y divide-gray-800/50">
              {issues.map((check, i) => (
                <HealthDetail key={i} mode="issue" check={check} />
              ))}
            </div>
          </div>
        ) : latest ? (
          <div className="bg-gray-900 rounded-xl border border-green-900/30 p-8 text-center">
            <p className="text-green-400 font-medium">All {latestResults.length} checks passed</p>
            <p className="text-sm text-gray-500 mt-1">No issues detected</p>
          </div>
        ) : null}

        {/* History */}
        {history.length > 1 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-white">Run History</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  <th className="text-left px-5 py-3 font-medium">Run Time</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-right px-5 py-3 font-medium">Issues</th>
                  <th className="text-right px-5 py-3 font-medium">Checks</th>
                  <th className="text-right px-5 py-3 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(1).map((run) => (
                  <HealthDetail key={run.id} mode="row" run={{ ...run, results: run.results as unknown as CheckResult[], runAt: run.runAt.toISOString() }} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
