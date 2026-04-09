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
  const criticalCount = latestResults.filter((r) => r.status === "critical").length
  const warningCount = latestResults.filter((r) => r.status === "warning").length

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
            title="Issues Found"
            value={latest?.issuesFound ?? 0}
            subtitle={`${criticalCount} critical, ${warningCount} warning`}
            color={criticalCount > 0 ? "red" : warningCount > 0 ? "orange" : "green"}
          />
          <StatCard
            title="Checks Run"
            value={latest?.checksRun ?? 0}
            subtitle="across 7 categories"
          />
          <StatCard
            title="Duration"
            value={latest ? `${(latest.durationMs / 1000).toFixed(1)}s` : "-"}
            subtitle="execution time"
          />
        </div>

        {/* Latest run results */}
        {latestResults.length > 0 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-white">Latest Check Results</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  <th className="text-left px-5 py-3 font-medium">Check</th>
                  <th className="text-left px-5 py-3 font-medium">Category</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-left px-5 py-3 font-medium">Message</th>
                  <th className="text-right px-5 py-3 font-medium">Count</th>
                </tr>
              </thead>
              <tbody>
                {latestResults.map((check, i) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-5 py-3 text-sm text-white font-mono">
                      {check.name}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded">
                        {check.category}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${
                        check.status === "critical"
                          ? "bg-red-900/40 text-red-400"
                          : check.status === "warning"
                            ? "bg-yellow-900/40 text-yellow-400"
                            : "bg-green-900/40 text-green-400"
                      }`}>
                        {check.status === "critical" ? "!!!" : check.status === "warning" ? "!" : ""}
                        {check.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-300 max-w-md truncate">
                      {check.link ? (
                        <Link href={check.link} className="hover:text-orange-400 transition-colors">
                          {check.message} <span className="text-orange-400 text-xs ml-1">View &rarr;</span>
                        </Link>
                      ) : (
                        check.message
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-right text-gray-400">
                      {check.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
