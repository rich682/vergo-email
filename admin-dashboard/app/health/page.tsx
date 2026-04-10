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
  const allIssues = latestResults.filter((r) => r.status !== "ok")

  // Separate runtime issues from static tech debt
  const TECH_DEBT_CATEGORIES = new Set(["code_quality"])
  const runtimeIssues = allIssues.filter((r) => !TECH_DEBT_CATEGORIES.has(r.category))
  const techDebt = allIssues.filter((r) => TECH_DEBT_CATEGORIES.has(r.category))

  const criticalCount = runtimeIssues.filter((r) => r.status === "critical").length
  const warningCount = runtimeIssues.filter((r) => r.status === "warning").length
  const passedCount = latestResults.length - allIssues.length

  // Status based on runtime issues only (tech debt doesn't affect operational status)
  const runtimeStatus = criticalCount > 0 ? "critical" : warningCount > 0 ? "warning" : "healthy"
  const statusColor = runtimeStatus === "critical" ? "red" : runtimeStatus === "warning" ? "orange" : "green"
  const statusLabel = latest ? runtimeStatus.toUpperCase() : "NO DATA"

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
            title="Runtime Issues"
            value={runtimeIssues.length}
            subtitle={`${criticalCount} critical, ${warningCount} warning`}
            color={criticalCount > 0 ? "red" : warningCount > 0 ? "orange" : "green"}
          />
          <StatCard
            title="Tech Debt"
            value={techDebt.length}
            subtitle="static findings"
            color={techDebt.length > 0 ? "blue" : "green"}
          />
          <StatCard
            title="Duration"
            value={latest ? `${(latest.durationMs / 1000).toFixed(1)}s` : "-"}
            subtitle="execution time"
          />
        </div>

        {/* Runtime Issues — actionable, need attention now */}
        {runtimeIssues.length > 0 ? (
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Runtime Issues ({runtimeIssues.length})</h2>
              <span className="text-xs text-gray-500">{passedCount} checks passed</span>
            </div>
            <div className="divide-y divide-gray-800/50">
              {runtimeIssues.map((check, i) => (
                <HealthDetail key={i} mode="issue" check={check} />
              ))}
            </div>
          </div>
        ) : latest ? (
          <div className="bg-gray-900 rounded-xl border border-green-900/30 p-8 text-center">
            <p className="text-green-400 font-medium">No runtime issues detected</p>
            <p className="text-sm text-gray-500 mt-1">{passedCount} checks passed</p>
          </div>
        ) : null}

        {/* Tech Debt — static findings, plan for future sprints */}
        {techDebt.length > 0 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-400">Tech Debt ({techDebt.length})</h2>
              <span className="text-xs text-gray-600">Static findings — plan for future sprints</span>
            </div>
            <div className="divide-y divide-gray-800/50">
              {techDebt.map((check, i) => (
                <HealthDetail key={i} mode="issue" check={check} />
              ))}
            </div>
          </div>
        )}

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
