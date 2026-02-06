import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { DashboardLayout } from "@/components/dashboard-layout"
import { StatCard } from "@/components/stat-card"
import { formatDate, formatDateTime, timeAgo } from "@/lib/utils"
import Link from "next/link"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

async function getCompanyDetail(id: string) {
  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      users: {
        orderBy: { lastLoginAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          lastLoginAt: true,
        },
      },
      _count: {
        select: {
          boards: true,
          taskInstances: true,
          formDefinitions: true,
          databases: true,
          entities: true,
        },
      },
    },
  })

  if (!org) return null

  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - 7)

  const [requestCount, requestsThisWeek, emailsSent, recentErrors] = await Promise.all([
    prisma.request.count({ where: { organizationId: id } }),
    prisma.request.count({ where: { organizationId: id, createdAt: { gte: weekStart } } }),
    prisma.emailSendAudit.count({ where: { organizationId: id, result: "SUCCESS" } }),
    prisma.appError.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        errorMessage: true,
        severity: true,
        pageUrl: true,
        createdAt: true,
        resolved: true,
      },
    }),
  ])

  return {
    org,
    requestCount,
    requestsThisWeek,
    emailsSent,
    recentErrors,
  }
}

export default async function CompanyDetailPage({ params }: { params: { id: string } }) {
  requireAuth()
  const data = await getCompanyDetail(params.id)

  if (!data) {
    notFound()
  }

  const { org, requestCount, requestsThisWeek, emailsSent, recentErrors } = data

  return (
    <DashboardLayout>
      <div className="mb-6">
        <Link href="/companies" className="text-xs text-gray-500 hover:text-gray-300 mb-2 inline-block">
          &larr; Back to Companies
        </Link>
        <h1 className="text-2xl font-bold text-white">{org.name}</h1>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-sm text-gray-400">{org.slug}</span>
          <span className="text-xs text-gray-600">|</span>
          <span className="text-sm text-gray-400">{org.timezone}</span>
          <span className="text-xs text-gray-600">|</span>
          <span className="text-sm text-gray-500">Since {formatDate(org.createdAt)}</span>
        </div>
      </div>

      {/* Activity Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard title="Users" value={org.users.length} color="blue" />
        <StatCard title="Boards" value={org._count.boards} />
        <StatCard title="Tasks" value={org._count.taskInstances} />
        <StatCard title="Requests" value={requestCount} trend={{ value: requestsThisWeek, label: "this week" }} color="orange" />
        <StatCard title="Emails Sent" value={emailsSent} color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Stakeholders" value={org._count.entities} />
        <StatCard title="Forms" value={org._count.formDefinitions} />
        <StatCard title="Databases" value={org._count.databases} />
        <StatCard title="Errors" value={recentErrors.filter((e: any) => !e.resolved).length} color={recentErrors.some((e: any) => !e.resolved) ? "red" : "default"} />
      </div>

      {/* Features */}
      {org.features && typeof org.features === "object" && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-8">
          <h2 className="text-sm font-semibold text-white mb-3">Feature Flags</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(org.features as Record<string, boolean>).map(([key, val]) => (
              <span
                key={key}
                className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                  val ? "bg-green-900/30 text-green-400" : "bg-gray-800 text-gray-500"
                }`}
              >
                {key}: {val ? "ON" : "OFF"}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Users ({org.users.length})</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
              <th className="text-left px-5 py-3">Name</th>
              <th className="text-left px-5 py-3">Email</th>
              <th className="text-left px-5 py-3">Role</th>
              <th className="text-left px-5 py-3">Last Login</th>
              <th className="text-left px-5 py-3">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {org.users.map((user: any) => (
              <tr key={user.id} className="hover:bg-gray-800/50 transition-colors">
                <td className="px-5 py-3 text-sm text-white">{user.name || "-"}</td>
                <td className="px-5 py-3 text-sm text-gray-300">{user.email}</td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      user.role === "ADMIN"
                        ? "bg-orange-900/30 text-orange-400"
                        : "bg-gray-800 text-gray-400"
                    }`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="px-5 py-3 text-sm text-gray-400">{timeAgo(user.lastLoginAt)}</td>
                <td className="px-5 py-3 text-sm text-gray-500">{formatDate(user.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent Errors */}
      {recentErrors.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white">Recent Errors</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
                <th className="text-left px-5 py-3">Message</th>
                <th className="text-left px-5 py-3">Severity</th>
                <th className="text-left px-5 py-3">Page</th>
                <th className="text-left px-5 py-3">When</th>
                <th className="text-left px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {recentErrors.map((err: any) => (
                <tr key={err.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-5 py-3 text-sm text-gray-300 max-w-xs truncate">
                    {err.errorMessage}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        err.severity === "fatal"
                          ? "bg-red-900/30 text-red-400"
                          : err.severity === "warning"
                          ? "bg-yellow-900/30 text-yellow-400"
                          : "bg-red-900/20 text-red-300"
                      }`}
                    >
                      {err.severity}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500 max-w-[200px] truncate">
                    {err.pageUrl || "-"}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-400">{timeAgo(err.createdAt)}</td>
                  <td className="px-5 py-3">
                    {err.resolved ? (
                      <span className="text-xs text-green-400">Resolved</span>
                    ) : (
                      <span className="text-xs text-red-400">Open</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  )
}
