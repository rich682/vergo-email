import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { DashboardLayout } from "@/components/dashboard-layout"
import { StatCard } from "@/components/stat-card"
import { timeAgo, formatDateTime } from "@/lib/utils"
import { LoginChart } from "./login-chart"

export const dynamic = "force-dynamic"

async function getActivityData() {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - 7)
  const thirtyDaysAgo = new Date(todayStart)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Recent logins (ordered by last login)
  const recentLogins = await prisma.user.findMany({
    where: { lastLoginAt: { not: null } },
    orderBy: { lastLoginAt: "desc" },
    take: 50,
    select: {
      id: true,
      name: true,
      email: true,
      lastLoginAt: true,
      organization: { select: { name: true, slug: true } },
    },
  })

  // Active users today and this week
  const [activeToday, activeThisWeek] = await Promise.all([
    prisma.user.count({ where: { lastLoginAt: { gte: todayStart } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: weekStart } } }),
  ])

  // Email send activity this week
  const [emailsSentThisWeek, emailsFailedThisWeek] = await Promise.all([
    prisma.emailSendAudit.count({ where: { result: "SUCCESS", createdAt: { gte: weekStart } } }),
    prisma.emailSendAudit.count({ where: { result: "FAILED", createdAt: { gte: weekStart } } }),
  ])

  // Build daily login counts for the chart (last 30 days)
  // We'll aggregate lastLoginAt by day
  const usersWithLogins = await prisma.user.findMany({
    where: { lastLoginAt: { gte: thirtyDaysAgo } },
    select: { lastLoginAt: true },
  })

  const dailyCounts: Record<string, number> = {}
  for (let d = 0; d < 30; d++) {
    const date = new Date(todayStart)
    date.setDate(date.getDate() - d)
    const key = date.toISOString().split("T")[0]
    dailyCounts[key] = 0
  }
  for (const user of usersWithLogins) {
    if (user.lastLoginAt) {
      const key = new Date(user.lastLoginAt).toISOString().split("T")[0]
      if (dailyCounts[key] !== undefined) {
        dailyCounts[key]++
      }
    }
  }

  const chartData = Object.entries(dailyCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({
      date: date.slice(5), // "MM-DD"
      logins: count,
    }))

  return {
    recentLogins,
    activeToday,
    activeThisWeek,
    emailsSentThisWeek,
    emailsFailedThisWeek,
    chartData,
  }
}

export default async function ActivityPage() {
  requireAuth()
  const data = await getActivityData()

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Activity</h1>
        <p className="text-sm text-gray-400 mt-1">Login and email activity overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Active Today" value={data.activeToday} color="green" />
        <StatCard title="Active This Week" value={data.activeThisWeek} color="blue" />
        <StatCard title="Emails Sent (Week)" value={data.emailsSentThisWeek} color="orange" />
        <StatCard title="Emails Failed (Week)" value={data.emailsFailedThisWeek} color={data.emailsFailedThisWeek > 0 ? "red" : "default"} />
      </div>

      {/* Login chart */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-8">
        <h2 className="text-sm font-semibold text-white mb-4">Logins per Day (Last 30 Days)</h2>
        <LoginChart data={data.chartData} />
      </div>

      {/* Recent logins */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Recent Logins</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
              <th className="text-left px-5 py-3">User</th>
              <th className="text-left px-5 py-3">Company</th>
              <th className="text-left px-5 py-3">Last Login</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {data.recentLogins.map((user: any) => (
              <tr key={user.id} className="hover:bg-gray-800/50 transition-colors">
                <td className="px-5 py-3">
                  <p className="text-sm text-white">{user.name || user.email}</p>
                  {user.name && <p className="text-xs text-gray-500">{user.email}</p>}
                </td>
                <td className="px-5 py-3 text-sm text-gray-300">{user.organization.name}</td>
                <td className="px-5 py-3">
                  <p className="text-sm text-gray-300">{timeAgo(user.lastLoginAt)}</p>
                  <p className="text-xs text-gray-500">{formatDateTime(user.lastLoginAt)}</p>
                </td>
              </tr>
            ))}
            {data.recentLogins.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-12 text-center text-sm text-gray-500">
                  No login activity recorded yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  )
}
