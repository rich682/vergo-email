import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { DashboardLayout } from "@/components/dashboard-layout"
import { StatCard } from "@/components/stat-card"

export const dynamic = "force-dynamic"

async function getStats() {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - 7)
  const monthStart = new Date(todayStart)
  monthStart.setDate(weekStart.getDate() - 30)

  const [
    totalOrgs,
    totalUsers,
    newUsersThisWeek,
    newUsersThisMonth,
    activeUsersToday,
    activeUsersThisWeek,
    totalRequests,
    requestsThisWeek,
    emailsSentThisWeek,
    errorsToday,
    errorsThisWeek,
    unresolvedErrors,
    recentOrgs,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: todayStart } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: weekStart } } }),
    prisma.request.count(),
    prisma.request.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.emailSendAudit.count({ where: { result: "SUCCESS", createdAt: { gte: weekStart } } }),
    prisma.appError.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.appError.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.appError.count({ where: { resolved: false } }),
    prisma.organization.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { users: true } } },
    }),
  ])

  return {
    totalOrgs,
    totalUsers,
    newUsersThisWeek,
    newUsersThisMonth,
    activeUsersToday,
    activeUsersThisWeek,
    totalRequests,
    requestsThisWeek,
    emailsSentThisWeek,
    errorsToday,
    errorsThisWeek,
    unresolvedErrors,
    recentOrgs,
  }
}

export default async function OverviewPage() {
  requireAuth()
  const stats = await getStats()

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="text-sm text-gray-400 mt-1">High-level platform metrics</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Companies"
          value={stats.totalOrgs}
          subtitle="Total organizations"
          color="orange"
        />
        <StatCard
          title="Total Users"
          value={stats.totalUsers}
          subtitle={`+${stats.newUsersThisWeek} this week`}
          trend={{ value: stats.newUsersThisMonth, label: "this month" }}
          color="blue"
        />
        <StatCard
          title="Active Users (Today)"
          value={stats.activeUsersToday}
          subtitle={`${stats.activeUsersThisWeek} this week`}
          color="green"
        />
        <StatCard
          title="Errors"
          value={stats.unresolvedErrors}
          subtitle={`${stats.errorsToday} today, ${stats.errorsThisWeek} this week`}
          color={stats.unresolvedErrors > 0 ? "red" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <StatCard
          title="Total Requests"
          value={stats.totalRequests}
          trend={{ value: stats.requestsThisWeek, label: "this week" }}
        />
        <StatCard
          title="Emails Sent (Week)"
          value={stats.emailsSentThisWeek}
          subtitle="Successful deliveries"
          color="green"
        />
        <StatCard
          title="New Users (Month)"
          value={stats.newUsersThisMonth}
          trend={{ value: stats.newUsersThisWeek, label: "this week" }}
          color="blue"
        />
      </div>

      {/* Recent organizations */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Recent Companies</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wider">
              <th className="text-left px-5 py-3">Name</th>
              <th className="text-left px-5 py-3">Users</th>
              <th className="text-left px-5 py-3">Signed Up</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {stats.recentOrgs.map((org) => (
              <tr key={org.id} className="hover:bg-gray-800/50 transition-colors">
                <td className="px-5 py-3">
                  <span className="text-sm text-white font-medium">{org.name}</span>
                  {org.slug && <span className="text-xs text-gray-500 ml-2">{org.slug}</span>}
                </td>
                <td className="px-5 py-3 text-sm text-gray-300">{org._count.users}</td>
                <td className="px-5 py-3 text-sm text-gray-400">
                  {new Date(org.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </td>
              </tr>
            ))}
            {stats.recentOrgs.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-8 text-center text-sm text-gray-500">
                  No organizations yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  )
}
